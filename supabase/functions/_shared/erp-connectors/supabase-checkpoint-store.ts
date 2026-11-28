import {
  ErpConnectorError,
  ERP_SAFE_FIELDS,
  type ErpCanonicalField,
  type ErpCanonicalRecord,
  type ErpCheckpoint,
  type ErpScalar,
  type ErpStagedPreview,
  type ErpStagedPreviewRecord,
  type ErpStagedRecordDisposition,
  type ErpStagedRecordDispositionReason,
  type ErpStagedRecordReader,
  type ErpSyncPageReceiptReader,
  type ErpSyncPageReceiptHistory,
  type ErpSyncPageReceipt,
  type ErpPersistResult,
  type ErpSourceReceipt,
  type ErpSyncCheckpointStore,
  type ErpSyncScope,
} from "./readonly-sync";

export type SupabaseErpCheckpointStoreOptions = {
  /** Server-side Supabase URL. Never supply a browser-visible client here. */
  supabaseUrl: string;
  /** Service-role key loaded only from the function runtime's secret store. */
  serviceRoleKey: string;
  /** Exactly 32 random bytes encoded as 64 lowercase/uppercase hexadecimal characters. */
  cursorEncryptionKey: string;
  fetcher?: typeof fetch;
};

type RpcScope = {
  p_organization_id: string;
  p_scope_key: string;
  p_provider: ErpSyncScope["provider"];
  p_company_external_id: string;
  p_branch_external_id: string;
  p_warehouse_external_id: string | null;
  p_currency_code: string | null;
  p_object_type: ErpSyncScope["objectType"];
};

type RpcCheckpoint = {
  version: number;
  cursor_ciphertext: string | null;
  pending_watermark: string | null;
  completed_watermark: string | null;
};

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SHA256_PATTERN = /^[0-9a-f]{64}$/;
const MAX_CURSOR_BYTES = 2048;
const AES_GCM_IV_BYTES = 12;
const AES_GCM_TAG_BYTES = 16;

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return "[" + value.map(stableJson).join(",") + "]";
  if (isRecord(value)) {
    const keys = Object.keys(value).sort();
    return "{" + keys.map((key) => JSON.stringify(key) + ":" + stableJson(value[key])).join(",") + "}";
  }
  const encoded = JSON.stringify(value);
  if (encoded === undefined) throw new ErpConnectorError("INVALID_ERP_SCOPE", "نطاق مزامنة ERP غير قابل للتسلسل.");
  return encoded;
}

function cleanScopeText(value: string, label: string, max = 256): string {
  const cleaned = value.trim();
  if (!cleaned || cleaned.length > max || /[\u0000-\u001f\u007f]/.test(cleaned)) {
    throw new ErpConnectorError("INVALID_ERP_SCOPE", "معرّف نطاق ERP " + label + " غير صالح.");
  }
  return cleaned;
}

function hexToBytes(value: string): Uint8Array {
  if (!/^[0-9a-f]{64}$/i.test(value)) {
    throw new ErpConnectorError("INVALID_CURSOR_ENCRYPTION_KEY", "مفتاح تشفير مؤشر ERP يجب أن يتكون من 32 بايت.");
  }
  const bytes = new Uint8Array(32);
  for (let index = 0; index < bytes.length; index += 1) {
    bytes[index] = Number.parseInt(value.slice(index * 2, index * 2 + 2), 16);
  }
  return bytes;
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function base64ToBytes(value: string): Uint8Array {
  let binary: string;
  try {
    binary = atob(value);
  } catch {
    throw new ErpConnectorError("ERP_CURSOR_CIPHERTEXT_INVALID", "تعذر قراءة مؤشر ERP المشفر.");
  }
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

async function sha256Hex(value: string): Promise<string> {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) throw new ErpConnectorError("ERP_STORE_CRYPTO_UNAVAILABLE", "خدمة التشفير الآمن غير متاحة.");
  const digest = await subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function timestampOrNull(value: unknown, label: string): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== "string" || !value.trim() || !Number.isFinite(Date.parse(value))) {
    throw new ErpConnectorError("ERP_CHECKPOINT_RESPONSE_INVALID", "استجابة مخزن ERP تحتوي تاريخًا غير صالح: " + label + ".");
  }
  return value;
}

function parseCheckpoint(value: unknown): RpcCheckpoint {
  if (!isRecord(value) ||
      !Number.isSafeInteger(value.version) ||
      Number(value.version) < 0 ||
      (value.cursor_ciphertext !== null && typeof value.cursor_ciphertext !== "string")) {
    throw new ErpConnectorError("ERP_CHECKPOINT_RESPONSE_INVALID", "استجابة مخزن ERP لا تطابق عقد نقطة الاستئناف.");
  }
  const pending = timestampOrNull(value.pending_watermark, "pending_watermark");
  const completed = timestampOrNull(value.completed_watermark, "completed_watermark");
  return {
    version: Number(value.version),
    cursor_ciphertext: value.cursor_ciphertext as string | null,
    pending_watermark: pending,
    completed_watermark: completed,
  };
}

function toPublicCheckpoint(value: RpcCheckpoint, cursor: string | null): ErpCheckpoint {
  return {
    version: value.version,
    cursor,
    pendingWatermark: value.pending_watermark,
    completedWatermark: value.completed_watermark,
  };
}

function parseStagedPreview(
  value: unknown,
  objectType: ErpSyncScope["objectType"],
  requestedLimit: number,
  requestedOffset: number,
): ErpStagedPreview {
  if (!isRecord(value) || !Array.isArray(value.records)) {
    throw new ErpConnectorError("ERP_STAGING_PREVIEW_INVALID", "استجابة معاينة ERP لا تحتوي قائمة سجلات صالحة.");
  }
  const total = value.total;
  const limit = value.limit;
  const offset = value.offset;
  const checkpointVersion = value.checkpoint_version;
  if (!Number.isSafeInteger(total) || Number(total) < 0 ||
      limit !== requestedLimit || offset !== requestedOffset ||
      !Number.isSafeInteger(checkpointVersion) || Number(checkpointVersion) < 0 ||
      typeof value.has_cursor !== "boolean") {
    throw new ErpConnectorError("ERP_STAGING_PREVIEW_INVALID", "بيانات صفحات معاينة ERP أو إصدار نقطة الاستئناف غير صالحة.");
  }
  const allowed = new Set(ERP_SAFE_FIELDS[objectType]);
  const records: ErpStagedPreviewRecord[] = value.records.map((raw): ErpStagedPreviewRecord => {
    if (!isRecord(raw) || typeof raw.external_id !== "string" ||
        typeof raw.source_updated_at !== "string" || !Number.isFinite(Date.parse(raw.source_updated_at)) ||
        !isRecord(raw.fields)) {
      throw new ErpConnectorError("ERP_STAGING_PREVIEW_INVALID", "أحد سجلات معاينة ERP لا يطابق عقد الإسقاط المرحلي.");
    }
    const externalId = cleanScopeText(raw.external_id, "preview_external_id");
    const fields: Partial<Record<ErpCanonicalField, ErpScalar>> = {};
    for (const [key, fieldValue] of Object.entries(raw.fields)) {
      if (!allowed.has(key as ErpCanonicalField) ||
          !(fieldValue === null || typeof fieldValue === "string" ||
            typeof fieldValue === "boolean" ||
            (typeof fieldValue === "number" && Number.isFinite(fieldValue)))) {
        throw new ErpConnectorError("ERP_STAGING_PREVIEW_UNSAFE_FIELD", "معاينة ERP تحتوي حقلًا أو قيمة خارج الإسقاط المسموح.");
      }
      fields[key as ErpCanonicalField] = fieldValue as ErpScalar;
    }
    const disposition = raw.last_disposition;
    if (disposition !== null &&
        disposition !== "created" && disposition !== "updated" &&
        disposition !== "unchanged" && disposition !== "rejected" &&
        disposition !== "conflicted") {
      throw new ErpConnectorError("ERP_STAGING_PREVIEW_INVALID", "حالة سجل ERP المرحلي غير معتمدة.");
    }
    const reason = raw.last_disposition_reason;
    if (reason !== null && reason !== "source_timestamp_older" &&
        reason !== "same_timestamp_payload_mismatch") {
      throw new ErpConnectorError("ERP_STAGING_PREVIEW_INVALID", "سبب رفض أو تعارض سجل ERP غير معتمد.");
    }
    return {
      externalId,
      sourceUpdatedAt: raw.source_updated_at,
      lastDisposition: disposition as ErpStagedRecordDisposition | null,
      lastDispositionReason: reason as ErpStagedRecordDispositionReason | null,
      fields: fields as ErpStagedPreviewRecord["fields"],
    };
  });
  if (records.length > requestedLimit || records.length > Number(total)) {
    throw new ErpConnectorError("ERP_STAGING_PREVIEW_INVALID", "عدد سجلات معاينة ERP تجاوز الحد المطلوب.");
  }
  return {
    records,
    total: Number(total),
    limit: requestedLimit,
    offset: requestedOffset,
    checkpointVersion: Number(checkpointVersion),
    hasCursor: value.has_cursor,
    pendingWatermark: timestampOrNull(value.pending_watermark, "pending_watermark"),
    completedWatermark: timestampOrNull(value.completed_watermark, "completed_watermark"),
  };
}

function parsePageReceiptHistory(
  value: unknown,
  requestedLimit: number,
  requestedOffset: number,
): ErpSyncPageReceiptHistory {
  if (!isRecord(value) || !Array.isArray(value.records) ||
      !Number.isSafeInteger(value.total) || Number(value.total) < 0 ||
      value.limit !== requestedLimit || value.offset !== requestedOffset ||
      !Number.isSafeInteger(value.checkpoint_version) || Number(value.checkpoint_version) < 0 ||
      typeof value.has_cursor !== "boolean" ||
      value.records.length > requestedLimit || value.records.length > Number(value.total)) {
    throw new ErpConnectorError("ERP_PAGE_RECEIPT_HISTORY_INVALID", "استجابة سجل صفحات ERP لا تطابق حدود النطاق والصفحات.");
  }
  const records: ErpSyncPageReceipt[] = value.records.map((raw): ErpSyncPageReceipt => {
    if (!isRecord(raw) ||
        !Number.isSafeInteger(raw.page_number) || Number(raw.page_number) < 1 ||
        !Number.isInteger(raw.http_status) || Number(raw.http_status) < 200 || Number(raw.http_status) > 299 ||
        typeof raw.has_next_cursor !== "boolean" ||
        !Number.isSafeInteger(raw.records_received) || Number(raw.records_received) < 0 || Number(raw.records_received) > 1000 ||
        typeof raw.completed !== "boolean" ||
        !Number.isSafeInteger(raw.committed_version) || Number(raw.committed_version) < 1) {
      throw new ErpConnectorError("ERP_PAGE_RECEIPT_HISTORY_INVALID", "أحد إيصالات صفحات ERP يحتوي بيانات خارج العقد الآمن.");
    }
    const counts = parseCounts(raw.counts);
    const dispositionCount = counts.created + counts.updated + counts.unchanged + counts.rejected + counts.conflicted;
    if (dispositionCount !== Number(raw.records_received)) {
      throw new ErpConnectorError("ERP_PAGE_RECEIPT_HISTORY_INVALID", "عدادات إيصال صفحة ERP لا تتطابق مع عدد السجلات الواردة.");
    }
    const recordedAt = timestampOrNull(raw.recorded_at, "receipt.recorded_at");
    if (!recordedAt) {
      throw new ErpConnectorError("ERP_PAGE_RECEIPT_HISTORY_INVALID", "وقت تسجيل إيصال ERP مطلوب.");
    }
    return {
      pageNumber: Number(raw.page_number),
      httpStatus: Number(raw.http_status),
      hasNextCursor: raw.has_next_cursor,
      recordsReceived: Number(raw.records_received),
      counts,
      completed: raw.completed,
      committedVersion: Number(raw.committed_version),
      recordedAt,
      pendingWatermark: timestampOrNull(raw.pending_watermark, "receipt.pending_watermark"),
      completedWatermark: timestampOrNull(raw.completed_watermark, "receipt.completed_watermark"),
    };
  });
  return {
    records,
    total: Number(value.total),
    limit: requestedLimit,
    offset: requestedOffset,
    checkpointVersion: Number(value.checkpoint_version),
    hasCursor: value.has_cursor,
  };
}

function parseCounts(value: unknown): ErpPersistResult["counts"] {
  if (!isRecord(value)) {
    throw new ErpConnectorError("ERP_PERSIST_RESPONSE_INVALID", "استجابة حفظ صفحة ERP لا تحتوي عدادات قبول.");
  }
  const keys = ["created", "updated", "unchanged", "rejected", "conflicted"] as const;
  const counts = {} as ErpPersistResult["counts"];
  for (const key of keys) {
    const count = value[key];
    if (!Number.isSafeInteger(count) || Number(count) < 0) {
      throw new ErpConnectorError("ERP_PERSIST_RESPONSE_INVALID", "عدادات حفظ صفحة ERP غير صالحة.");
    }
    counts[key] = Number(count);
  }
  return counts;
}

/**
 * Concrete, server-only implementation of the P4 checkpoint boundary.
 *
 * Cursor values are AES-256-GCM encrypted before they reach PostgREST. The database
 * receives only ciphertext and its SHA-256 digest; the encryption key and plaintext
 * cursor remain in the function process. All writes go through service-role-only
 * PostgreSQL RPCs whose transaction commits staging rows, page receipts and checkpoint
 * advancement atomically.
 */
export class SupabaseErpSyncCheckpointStore implements ErpSyncCheckpointStore, ErpStagedRecordReader, ErpSyncPageReceiptReader {
  private readonly baseUrl: URL;
  private readonly fetcher: typeof fetch;
  private readonly serviceRoleKey: string;
  private readonly encryptionKey: Promise<CryptoKey>;

  constructor(options: SupabaseErpCheckpointStoreOptions) {
    let baseUrl: URL;
    try {
      baseUrl = new URL(options.supabaseUrl);
    } catch {
      throw new ErpConnectorError("INVALID_SUPABASE_URL", "عنوان قاعدة بيانات ERP غير صالح.");
    }
    if (!["https:", "http:"].includes(baseUrl.protocol) ||
        baseUrl.username || baseUrl.password || baseUrl.search || baseUrl.hash ||
        (baseUrl.pathname !== "/" && baseUrl.pathname !== "")) {
      throw new ErpConnectorError("INVALID_SUPABASE_URL", "عنوان Supabase يجب أن يكون أصل HTTP(S) دون بيانات اعتماد أو مسار.");
    }
    if (!options.serviceRoleKey.trim()) {
      throw new ErpConnectorError("ERP_SERVICE_CREDENTIAL_MISSING", "بيانات اعتماد خدمة ERP غير مهيأة على الخادم.");
    }
    const keyBytes = hexToBytes(options.cursorEncryptionKey);
    const subtle = globalThis.crypto?.subtle;
    if (!subtle) throw new ErpConnectorError("ERP_STORE_CRYPTO_UNAVAILABLE", "خدمة التشفير الآمن غير متاحة.");
    const keyMaterial = new ArrayBuffer(keyBytes.byteLength);
    new Uint8Array(keyMaterial).set(keyBytes);
    this.baseUrl = baseUrl;
    this.fetcher = options.fetcher ?? fetch;
    this.serviceRoleKey = options.serviceRoleKey;
    this.encryptionKey = subtle.importKey("raw", keyMaterial, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
  }

  private async scopeArguments(scope: ErpSyncScope): Promise<RpcScope> {
    if (!UUID_PATTERN.test(scope.organizationId)) {
      throw new ErpConnectorError("INVALID_ERP_SCOPE", "معرّف المؤسسة في نطاق ERP غير صالح.");
    }
    const canonicalScope = {
      provider: scope.provider,
      organizationId: scope.organizationId.toLowerCase(),
      companyExternalId: cleanScopeText(scope.companyExternalId, "company_external_id"),
      branchExternalId: cleanScopeText(scope.branchExternalId, "branch_external_id"),
      warehouseExternalId: scope.warehouseExternalId == null
        ? null
        : cleanScopeText(scope.warehouseExternalId, "warehouse_external_id"),
      currencyCode: scope.currencyCode == null
        ? null
        : cleanScopeText(scope.currencyCode, "currency_code", 12).toUpperCase(),
      objectType: scope.objectType,
    };
    if (!["onyx_pro", "al_mutakamel"].includes(canonicalScope.provider) ||
        !Object.prototype.hasOwnProperty.call(ERP_SAFE_FIELDS, canonicalScope.objectType) ||
        (canonicalScope.currencyCode !== null && !/^[A-Z]{3}$/.test(canonicalScope.currencyCode))) {
      throw new ErpConnectorError("INVALID_ERP_SCOPE", "مزود ERP أو نوع البيانات أو العملة في النطاق غير معتمد.");
    }
    const scopeKey = await sha256Hex(stableJson(canonicalScope));
    return {
      p_organization_id: canonicalScope.organizationId,
      p_scope_key: scopeKey,
      p_provider: canonicalScope.provider,
      p_company_external_id: canonicalScope.companyExternalId,
      p_branch_external_id: canonicalScope.branchExternalId,
      p_warehouse_external_id: canonicalScope.warehouseExternalId,
      p_currency_code: canonicalScope.currencyCode,
      p_object_type: canonicalScope.objectType,
    };
  }

  private async rpc(name: string, arguments_: Record<string, unknown>): Promise<unknown> {
    const url = new URL("/rest/v1/rpc/" + name, this.baseUrl);
    let response: Response;
    try {
      response = await this.fetcher(url, {
        method: "POST",
        redirect: "error",
        headers: {
          apikey: this.serviceRoleKey,
          Authorization: "Bearer " + this.serviceRoleKey,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify(arguments_),
      });
    } catch {
      throw new ErpConnectorError("ERP_STORE_UNAVAILABLE", "تعذر الوصول إلى مخزن مزامنة ERP.", { retryable: true });
    }

    const raw = await response.text().catch(() => "");
    let payload: unknown = null;
    if (raw) {
      try {
        payload = JSON.parse(raw);
      } catch {
        throw new ErpConnectorError("ERP_STORE_RESPONSE_INVALID", "أعاد مخزن ERP استجابة غير قابلة للقراءة.", {
          httpStatus: response.status,
          retryable: response.status >= 500,
        });
      }
    }
    if (!response.ok) {
      const sqlState = isRecord(payload) && typeof payload.code === "string" && /^[0-9A-Z]{5}$/.test(payload.code)
        ? payload.code
        : null;
      const mappedCode = sqlState === "40001"
        ? "ERP_CHECKPOINT_CONFLICT"
        : sqlState === "42501"
          ? "ERP_STORE_FORBIDDEN"
          : sqlState === "22023"
            ? "ERP_STORE_INVALID_INPUT"
            : sqlState === "23505"
              ? "ERP_STORE_IDEMPOTENCY_CONFLICT"
              : response.status === 429
                ? "ERP_STORE_RATE_LIMITED"
                : "ERP_STORE_REQUEST_FAILED";
      throw new ErpConnectorError(mappedCode, "رفض مخزن مزامنة ERP العملية المطلوبة.", {
        httpStatus: response.status,
        retryable: sqlState === "40001" || response.status === 429 || response.status >= 500,
      });
    }
    return Array.isArray(payload) && payload.length === 1 ? payload[0] : payload;
  }

  private async encryptCursor(cursor: string | null, scopeKey: string): Promise<string | null> {
    if (cursor === null) return null;
    const plaintext = new TextEncoder().encode(cursor);
    if (plaintext.byteLength < 1 || plaintext.byteLength > MAX_CURSOR_BYTES) {
      throw new ErpConnectorError("INVALID_ERP_CURSOR", "مؤشر ERP فارغ أو يتجاوز الحد الآمن.");
    }
    const iv = globalThis.crypto.getRandomValues(new Uint8Array(AES_GCM_IV_BYTES));
    const key = await this.encryptionKey;
    const encrypted = new Uint8Array(await globalThis.crypto.subtle.encrypt({ name: "AES-GCM", iv, additionalData: new TextEncoder().encode(scopeKey) }, key, plaintext));
    const combined = new Uint8Array(iv.byteLength + encrypted.byteLength);
    combined.set(iv, 0);
    combined.set(encrypted, iv.byteLength);
    const ciphertext = "v1:" + bytesToBase64(combined);
    return ciphertext;
  }

  private async decryptCursor(ciphertext: string | null, scopeKey: string): Promise<string | null> {
    if (ciphertext === null) return null;
    if (!ciphertext.startsWith("v1:") || ciphertext.length > 8192) {
      throw new ErpConnectorError("ERP_CURSOR_CIPHERTEXT_INVALID", "صيغة مؤشر ERP المشفر غير مدعومة.");
    }
    const combined = base64ToBytes(ciphertext.slice(3));
    if (combined.byteLength <= AES_GCM_IV_BYTES + AES_GCM_TAG_BYTES) {
      throw new ErpConnectorError("ERP_CURSOR_CIPHERTEXT_INVALID", "مؤشر ERP المشفر أقصر من الحد الأدنى.");
    }
    const iv = combined.slice(0, AES_GCM_IV_BYTES);
    const encrypted = combined.slice(AES_GCM_IV_BYTES);
    try {
      const key = await this.encryptionKey;
      const plaintext = await globalThis.crypto.subtle.decrypt({ name: "AES-GCM", iv, additionalData: new TextEncoder().encode(scopeKey) }, key, encrypted);
      const decoded = new TextDecoder("utf-8", { fatal: true }).decode(plaintext);
      if (!decoded || new TextEncoder().encode(decoded).byteLength > MAX_CURSOR_BYTES) {
        throw new Error("invalid cursor length");
      }
      return decoded;
    } catch {
      throw new ErpConnectorError("ERP_CURSOR_DECRYPT_FAILED", "تعذر فك تشفير مؤشر ERP؛ أوقف الاستئناف لحماية سلامة المزامنة.");
    }
  }

  private async decodeCheckpoint(value: unknown, scopeKey: string): Promise<ErpCheckpoint> {
    const checkpoint = parseCheckpoint(value);
    return toPublicCheckpoint(checkpoint, await this.decryptCursor(checkpoint.cursor_ciphertext, scopeKey));
  }

  async loadCheckpoint(scope: ErpSyncScope): Promise<ErpCheckpoint> {
    const args = await this.scopeArguments(scope);
    const result = await this.rpc("load_erp_sync_checkpoint", args);
    return this.decodeCheckpoint(result, args.p_scope_key);
  }

  async persistPageAtomically(input: {
    scope: ErpSyncScope;
    expectedVersion: number;
    pageFingerprint: string;
    receipt: ErpSourceReceipt;
    records: readonly ErpCanonicalRecord[];
    nextCursor: string | null;
    pendingWatermark: string | null;
    completedWatermark: string | null;
    completed: boolean;
  }): Promise<ErpPersistResult> {
    if (!Number.isSafeInteger(input.expectedVersion) || input.expectedVersion < 0 ||
        !SHA256_PATTERN.test(input.pageFingerprint) ||
        !Number.isInteger(input.receipt.httpStatus) || input.receipt.httpStatus < 200 || input.receipt.httpStatus > 299 ||
        !SHA256_PATTERN.test(input.receipt.responseSha256) ||
        !Array.isArray(input.records) || input.records.length > 1000) {
      throw new ErpConnectorError("INVALID_ERP_PERSIST_INPUT", "بيانات حفظ صفحة ERP أو بصمتها غير صالحة.");
    }
    const args = await this.scopeArguments(input.scope);
    const encrypted = await this.encryptCursor(input.nextCursor, args.p_scope_key);
    const records = input.records.map((record) => ({
      external_id: record.externalId,
      source_updated_at: record.sourceUpdatedAt,
      idempotency_key: record.idempotencyKey,
      fields: record.fields,
    }));
    const result = await this.rpc("persist_erp_sync_page_atomically", {
      ...args,
      p_expected_version: input.expectedVersion,
      p_page_fingerprint: input.pageFingerprint,
      p_http_status: input.receipt.httpStatus,
      p_external_request_id: input.receipt.externalRequestId,
      p_response_sha256: input.receipt.responseSha256,
      p_records: records,
      p_next_cursor_ciphertext: encrypted,
      p_pending_watermark: input.pendingWatermark,
      p_completed_watermark: input.completedWatermark,
      p_completed: input.completed,
    });
    if (!isRecord(result) || typeof result.duplicate_page !== "boolean") {
      throw new ErpConnectorError("ERP_PERSIST_RESPONSE_INVALID", "استجابة حفظ صفحة ERP غير مكتملة.");
    }
    const checkpoint = await this.decodeCheckpoint(result.checkpoint, args.p_scope_key);
    return {
      checkpoint,
      counts: parseCounts(result.counts),
      duplicatePage: result.duplicate_page,
    };
  }

  async listStagedRecords(input: {
    scope: ErpSyncScope;
    limit?: number;
    offset?: number;
  }): Promise<ErpStagedPreview> {
    const limit = input.limit ?? 20;
    const offset = input.offset ?? 0;
    if (!Number.isInteger(limit) || limit < 1 || limit > 50 ||
        !Number.isInteger(offset) || offset < 0 || offset > 5000) {
      throw new ErpConnectorError("INVALID_ERP_PREVIEW_LIMIT", "حدود معاينة سجلات ERP يجب أن تكون بين 1 و50 سجلًا، وبداية لا تتجاوز 5000.");
    }
    const args = await this.scopeArguments(input.scope);
    const result = await this.rpc("list_erp_sync_staged_records", {
      ...args,
      p_limit: limit,
      p_offset: offset,
    });
    return parseStagedPreview(result, input.scope.objectType, limit, offset);
  }

  async listRecentPageReceipts(input: {
    scope: ErpSyncScope;
    limit?: number;
    offset?: number;
  }): Promise<ErpSyncPageReceiptHistory> {
    const limit = input.limit ?? 10;
    const offset = input.offset ?? 0;
    if (!Number.isInteger(limit) || limit < 1 || limit > 50 ||
        !Number.isInteger(offset) || offset < 0 || offset > 5000) {
      throw new ErpConnectorError("INVALID_ERP_RECEIPT_LIMIT", "حدود سجل إيصالات ERP يجب أن تكون بين 1 و50 سجلًا وبداية لا تتجاوز 5000.");
    }
    const args = await this.scopeArguments(input.scope);
    const result = await this.rpc("list_erp_sync_page_receipts", {
      ...args,
      p_limit: limit,
      p_offset: offset,
    });
    return parsePageReceiptHistory(result, limit, offset);
  }

  async resetExpiredCursor(input: {
    scope: ErpSyncScope;
    expectedVersion: number;
  }): Promise<ErpCheckpoint> {
    if (!Number.isSafeInteger(input.expectedVersion) || input.expectedVersion < 0) {
      throw new ErpConnectorError("INVALID_ERP_CHECKPOINT_VERSION", "إصدار نقطة استئناف ERP غير صالح.");
    }
    const args = await this.scopeArguments(input.scope);
    const result = await this.rpc("reset_erp_sync_expired_cursor", {
      p_organization_id: args.p_organization_id,
      p_scope_key: args.p_scope_key,
      p_expected_version: input.expectedVersion,
    });
    return this.decodeCheckpoint(result, args.p_scope_key);
  }
}
