/**
 * Server-side, provider-neutral read-only ERP sync core.
 *
 * This module deliberately contains no vendor endpoint defaults, database writes,
 * credentials, browser client, or UI state. A provider contract must be populated
 * from the installed ERP's official API documentation and license. Persistence is
 * injected through an atomic compare-and-set store owned by P2.
 */

export type ErpProviderId = "onyx_pro" | "al_mutakamel";

export type ErpObjectType =
  | "products"
  | "customers"
  | "warehouses"
  | "stock_balances";

export type ErpCanonicalField =
  | "item_code"
  | "sku"
  | "barcode"
  | "name"
  | "name_en"
  | "description"
  | "category_code"
  | "category_name"
  | "brand_name"
  | "unit_code"
  | "unit_name"
  | "is_active"
  | "customer_code"
  | "business_name"
  | "phone"
  | "email"
  | "customer_status"
  | "warehouse_code"
  | "warehouse_name"
  | "quantity_on_hand"
  | "quantity_reserved"
  | "quantity_available";

export type ErpScalar = string | number | boolean | null;

export type ErpConnection = {
  provider: ErpProviderId;
  baseUrl: string;
  /** Exact hostnames approved by the server operator; never accepted from a browser request. */
  allowedHosts: readonly string[];
  /** Secret is supplied by a server-only secret store/environment at runtime. */
  credential: {
    headerName: string;
    prefix?: string;
    secret: string;
  };
  timeoutMs?: number;
  maxRetries?: number;
  maxRetryDelayMs?: number;
  maxResponseBytes?: number;
};

export type ErpReadContract = {
  provider: ErpProviderId;
  apiVersion: string;
  /** Official vendor documentation URL identifying the contract used to configure this adapter. */
  officialDocumentationUrl: string;
  objectType: ErpObjectType;
  /** Relative path from baseUrl; deliberately not a full URL. */
  path: string;
  itemsPath: readonly string[];
  nextCursorPath?: readonly string[];
  cursorParameter?: string;
  modifiedSinceParameter?: string;
  pageSizeParameter?: string;
  pageSize?: number;
  externalIdPath: readonly string[];
  sourceUpdatedAtPath: readonly string[];
  /** Target fields must be explicitly allowlisted for the selected object type. */
  fieldPaths: Partial<Record<ErpCanonicalField, readonly string[]>>;
  /** Provider-specific cursor-expiry HTTP statuses; 410 is the conservative default. */
  cursorExpiredHttpStatuses?: readonly number[];
  requestIdHeader?: string;
};

export type ErpSyncScope = {
  /** Resolved by the server from the authenticated tenant, never from a request body. */
  organizationId: string;
  companyExternalId: string;
  branchExternalId: string;
  warehouseExternalId?: string | null;
  currencyCode?: string | null;
  provider: ErpProviderId;
  objectType: ErpObjectType;
};

export type ErpCheckpoint = {
  /** Monotonically increasing version used for optimistic concurrency. */
  version: number;
  /** Last fully completed source watermark; never advances on a partially fetched run. */
  completedWatermark: string | null;
  /** Opaque provider cursor used to resume an in-progress page walk. */
  cursor: string | null;
  /** Highest source timestamp observed during the in-progress walk. */
  pendingWatermark: string | null;
};

export type ErpCanonicalRecord = {
  provider: ErpProviderId;
  objectType: ErpObjectType;
  companyExternalId: string;
  branchExternalId: string;
  warehouseExternalId: string | null;
  currencyCode: string | null;
  externalId: string;
  sourceUpdatedAt: string;
  idempotencyKey: string;
  fields: Partial<Record<ErpCanonicalField, ErpScalar>>;
};

export type ErpPage = {
  records: ErpCanonicalRecord[];
  nextCursor: string | null;
  httpStatus: number;
  externalRequestId: string | null;
  responseSha256: string;
};

export type ErpPersistCounts = {
  created: number;
  updated: number;
  unchanged: number;
  rejected: number;
  conflicted: number;
};

export type ErpPersistResult = {
  checkpoint: ErpCheckpoint;
  counts: ErpPersistCounts;
  duplicatePage: boolean;
};

/**
 * P2 implements this boundary with the canonical tenant-scoped staging RPC/table.
 * persistPageAtomically MUST atomically: deduplicate pageFingerprint and records,
 * validate expectedVersion, persist permitted source projections/receipts, and
 * advance cursor + pending/completed watermark in one DB transaction. It must
 * never post stock, invoices, receipts, or ledger entries.
 */
export interface ErpSyncCheckpointStore {
  loadCheckpoint(scope: ErpSyncScope): Promise<ErpCheckpoint>;
  persistPageAtomically(input: {
    scope: ErpSyncScope;
    expectedVersion: number;
    pageFingerprint: string;
    records: readonly ErpCanonicalRecord[];
    nextCursor: string | null;
    pendingWatermark: string | null;
    completedWatermark: string | null;
    completed: boolean;
  }): Promise<ErpPersistResult>;
  /** Clear an expired cursor and pending watermark, preserving the last completed watermark. */
  resetExpiredCursor(input: {
    scope: ErpSyncScope;
    expectedVersion: number;
  }): Promise<ErpCheckpoint>;
}

export type ErpReadPageInput = {
  cursor: string | null;
  modifiedSince: string | null;
};

export interface ErpReadConnector {
  readPage(input: ErpReadPageInput): Promise<ErpPage>;
}

export type ErpSyncRunResult = {
  status: "complete" | "continuation_required";
  pagesCommitted: number;
  recordsRead: number;
  counts: ErpPersistCounts;
  checkpoint: ErpCheckpoint;
};

export class ErpConnectorError extends Error {
  readonly code: string;
  readonly httpStatus: number | null;
  readonly retryable: boolean;

  constructor(code: string, message: string, options: {
    httpStatus?: number | null;
    retryable?: boolean;
  } = {}) {
    super(message);
    this.name = "ErpConnectorError";
    this.code = code;
    this.httpStatus = options.httpStatus ?? null;
    this.retryable = options.retryable ?? false;
  }
}

const SAFE_FIELDS: Record<ErpObjectType, readonly ErpCanonicalField[]> = {
  products: [
    "item_code", "sku", "barcode", "name", "name_en", "description",
    "category_code", "category_name", "brand_name", "unit_code", "unit_name", "is_active",
  ],
  customers: ["customer_code", "business_name", "phone", "email", "customer_status"],
  warehouses: ["warehouse_code", "warehouse_name", "is_active"],
  stock_balances: [
    "item_code", "warehouse_code", "quantity_on_hand",
    "quantity_reserved", "quantity_available",
  ],
};

const REQUIRED_FIELDS: Record<ErpObjectType, readonly ErpCanonicalField[]> = {
  products: ["item_code", "name"],
  customers: ["customer_code", "business_name"],
  warehouses: ["warehouse_code", "warehouse_name"],
  stock_balances: [
    "item_code", "warehouse_code", "quantity_on_hand",
    "quantity_reserved", "quantity_available",
  ],
};

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ISO_TIMESTAMP_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-](?:0\d|1[0-4]):[0-5]\d)$/;
const HEADER_NAME_PATTERN = /^(?:authorization|x-[a-z0-9-]{1,60})$/i;
const PATH_SEGMENT_PATTERN = /^[A-Za-z0-9._~-]+$/;
const MAX_PATH_LENGTH = 512;
const MAX_CURSOR_LENGTH = 2048;
const MAX_PAGE_ROWS = 1000;
const MAX_SYNC_PAGES = 25;
const MAX_SYNC_RECORDS = 5000;
const DEFAULT_RESPONSE_BYTES = 4 * 1024 * 1024;

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
  if (encoded === undefined) throw new ErpConnectorError("INVALID_FINGERPRINT_INPUT", "تعذر إنشاء بصمة سجل ERP.");
  return encoded;
}

async function sha256Hex(value: string): Promise<string> {
  if (!globalThis.crypto?.subtle) {
    throw new ErpConnectorError("CRYPTO_UNAVAILABLE", "خدمة بصمة SHA-256 غير متاحة في بيئة تشغيل الموصل.");
  }
  const digest = await globalThis.crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function cleanIdentity(value: unknown, label: string, max = 256): string {
  if (typeof value !== "string") {
    throw new ErpConnectorError("INVALID_SOURCE_IDENTITY", "معرّف المصدر " + label + " مفقود أو غير نصي.");
  }
  const result = value.trim();
  if (!result || result.length > max || /[\u0000-\u001f\u007f]/.test(result)) {
    throw new ErpConnectorError("INVALID_SOURCE_IDENTITY", "معرّف المصدر " + label + " غير صالح.");
  }
  return result;
}

function validateTimestamp(value: unknown): string {
  if (typeof value !== "string" || !ISO_TIMESTAMP_PATTERN.test(value)) {
    throw new ErpConnectorError("INVALID_SOURCE_TIMESTAMP", "تاريخ تحديث سجل ERP يجب أن يتضمن منطقة زمنية بصيغة ISO-8601.");
  }
  const date = new Date(value);
  if (!Number.isFinite(date.getTime()) || date.toISOString() === "Invalid Date") {
    throw new ErpConnectorError("INVALID_SOURCE_TIMESTAMP", "تاريخ تحديث سجل ERP غير صالح.");
  }
  return date.toISOString();
}

function getPath(value: unknown, path: readonly string[], label: string): unknown {
  if (!path.length || path.length > 12 || path.some((part) => !part || part.length > 100)) {
    throw new ErpConnectorError("INVALID_PROVIDER_CONTRACT", "مسار الحقل " + label + " غير صالح.");
  }
  let current: unknown = value;
  for (const part of path) {
    if (!isRecord(current) || !Object.prototype.hasOwnProperty.call(current, part)) return undefined;
    current = current[part];
  }
  return current;
}

function normalizeFieldValue(value: unknown, field: ErpCanonicalField): ErpScalar {
  if (value == null) return null;
  if (typeof value === "boolean") return value;
  if (typeof value === "number") {
    if (!Number.isFinite(value) || Math.abs(value) > 1_000_000_000_000) {
      throw new ErpConnectorError("INVALID_SOURCE_FIELD", "قيمة الحقل " + field + " خارج النطاق المسموح.");
    }
    return value;
  }
  if (typeof value === "string") {
    const result = value.trim();
    if (result.length > 4000 || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(result)) {
      throw new ErpConnectorError("INVALID_SOURCE_FIELD", "قيمة الحقل " + field + " تتجاوز حدود النص المسموح.");
    }
    return result || null;
  }
  throw new ErpConnectorError("INVALID_SOURCE_FIELD", "نوع الحقل " + field + " غير مدعوم؛ لا تقبل كائنات المصدر الخام.");
}

function validateBaseUrl(connection: ErpConnection): URL {
  let url: URL;
  try {
    url = new URL(connection.baseUrl);
  } catch {
    throw new ErpConnectorError("INVALID_CONNECTION_URL", "عنوان اتصال ERP غير صالح.");
  }
  if (
    url.protocol !== "https:" || url.username || url.password || url.search || url.hash ||
    !url.hostname || Boolean(url.port)
  ) {
    throw new ErpConnectorError("UNSAFE_CONNECTION_URL", "يسمح بموصل ERP بعنوان HTTPS معتمد فقط، دون بيانات دخول أو query أو fragment.");
  }
  const hostname = url.hostname.toLocaleLowerCase("en");
  const isIpLiteral = hostname.startsWith("[") || /^\d{1,3}(?:\.\d{1,3}){3}$/.test(hostname);
  if (isIpLiteral || hostname === "localhost" || hostname.endsWith(".local") || hostname.endsWith(".internal")) {
    throw new ErpConnectorError("UNSAFE_CONNECTION_HOST", "اسم مضيف ERP غير مقبول لاتصال خارجي آمن.");
  }
  const allowed = connection.allowedHosts.map((host) => host.trim().toLocaleLowerCase("en"));
  if (!allowed.includes(hostname)) {
    throw new ErpConnectorError("ERP_HOST_NOT_ALLOWLISTED", "مضيف ERP غير موجود في قائمة المضيفين المعتمدة على الخادم.");
  }
  return url;
}

function validateContract(connection: ErpConnection, contract: ErpReadContract): void {
  if (connection.provider !== contract.provider) {
    throw new ErpConnectorError("PROVIDER_MISMATCH", "نوع الموصل لا يطابق عقد مزود ERP.");
  }
  if (!contract.apiVersion.trim() || contract.apiVersion.length > 80) {
    throw new ErpConnectorError("INVALID_PROVIDER_CONTRACT", "إصدار واجهة ERP غير محدد في العقد.");
  }
  let evidence: URL;
  try {
    evidence = new URL(contract.officialDocumentationUrl);
  } catch {
    throw new ErpConnectorError("OFFICIAL_CONTRACT_REQUIRED", "لا يمكن تفعيل موصل دون مرجع وثائق المزود الرسمية.");
  }
  if (evidence.protocol !== "https:" || !evidence.hostname) {
    throw new ErpConnectorError("OFFICIAL_CONTRACT_REQUIRED", "مرجع عقد ERP يجب أن يكون HTTPS.");
  }
  const path = contract.path.trim();
  const segments = path.replace(/^\/+/, "").split("/");
  if (
    !path || path.length > MAX_PATH_LENGTH || path.startsWith("//") ||
    path.includes("?") || path.includes("#") || path.includes("\\") ||
    segments.some((segment) => !segment || segment === "." || segment === ".." || !PATH_SEGMENT_PATTERN.test(segment))
  ) {
    throw new ErpConnectorError("INVALID_PROVIDER_PATH", "مسار ERP يجب أن يكون مسارًا نسبيًا موثقًا دون URL أو معاملات خارجية.");
  }
  if (!contract.itemsPath.length || !contract.externalIdPath.length || !contract.sourceUpdatedAtPath.length) {
    throw new ErpConnectorError("INVALID_PROVIDER_CONTRACT", "عقد ERP يفتقد مسار السجلات أو معرف المصدر أو وقت التحديث.");
  }
  if (!contract.cursorParameter && !contract.modifiedSinceParameter) {
    throw new ErpConnectorError("INCREMENTAL_SYNC_UNSUPPORTED", "لم يُحدد في عقد المزود cursor أو modified-since موثق للمزامنة التفاضلية.");
  }
  if (contract.nextCursorPath && !contract.cursorParameter) {
    throw new ErpConnectorError("INVALID_PROVIDER_CONTRACT", "مسار cursor التالي يتطلب معامل cursor موثقًا.");
  }
  if (contract.modifiedSinceParameter && !/^[A-Za-z][A-Za-z0-9_.-]{0,63}$/.test(contract.modifiedSinceParameter)) {
    throw new ErpConnectorError("INVALID_PROVIDER_CONTRACT", "معامل modified-since غير صالح.");
  }
  if (contract.cursorParameter && !/^[A-Za-z][A-Za-z0-9_.-]{0,63}$/.test(contract.cursorParameter)) {
    throw new ErpConnectorError("INVALID_PROVIDER_CONTRACT", "معامل cursor غير صالح.");
  }
  if (contract.pageSizeParameter && !/^[A-Za-z][A-Za-z0-9_.-]{0,63}$/.test(contract.pageSizeParameter)) {
    throw new ErpConnectorError("INVALID_PROVIDER_CONTRACT", "معامل حجم الصفحة غير صالح.");
  }
  const allowedFields = new Set(SAFE_FIELDS[contract.objectType]);
  for (const [field, sourcePath] of Object.entries(contract.fieldPaths)) {
    if (!allowedFields.has(field as ErpCanonicalField) || !sourcePath?.length) {
      throw new ErpConnectorError("UNSAFE_FIELD_MAPPING", "حقل ERP " + field + " غير مسموح في إسقاط " + contract.objectType + ".");
    }
  }
  for (const field of REQUIRED_FIELDS[contract.objectType]) {
    if (!contract.fieldPaths[field]) {
      throw new ErpConnectorError("INCOMPLETE_FIELD_MAPPING", "عقد ERP لا يربط الحقل الإلزامي " + field + ".");
    }
  }
  if (!HEADER_NAME_PATTERN.test(connection.credential.headerName)) {
    throw new ErpConnectorError("UNSAFE_AUTH_HEADER", "اسم ترويسة مصادقة ERP غير مسموح.");
  }
  if (!connection.credential.secret || connection.credential.secret.length > 8192 ||
      /[\r\n]/.test(connection.credential.secret) ||
      /[\r\n]/.test(connection.credential.prefix ?? "")) {
    throw new ErpConnectorError("INVALID_ERP_CREDENTIAL", "بيانات اعتماد ERP غير صالحة.");
  }
}

function parseRetryAfter(value: string | null, now: number, maxDelayMs: number): number | null {
  if (!value) return null;
  const seconds = Number(value.trim());
  let delay: number;
  if (Number.isFinite(seconds) && seconds >= 0) {
    delay = seconds * 1000;
  } else {
    const date = Date.parse(value);
    if (!Number.isFinite(date)) return null;
    delay = Math.max(0, date - now);
  }
  return Math.min(delay, maxDelayMs);
}

async function readBoundedBody(response: Response, maxBytes: number): Promise<string> {
  const contentLength = response.headers.get("content-length");
  if (contentLength && /^\d+$/.test(contentLength) && Number(contentLength) > maxBytes) {
    throw new ErpConnectorError("ERP_RESPONSE_TOO_LARGE", "استجابة ERP تجاوزت حد الحجم الآمن.");
  }
  if (!response.body) return "";
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const part = await reader.read();
      if (part.done) break;
      total += part.value.byteLength;
      if (total > maxBytes) {
        await reader.cancel().catch(() => undefined);
        throw new ErpConnectorError("ERP_RESPONSE_TOO_LARGE", "استجابة ERP تجاوزت حد الحجم الآمن.");
      }
      chunks.push(part.value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    throw new ErpConnectorError("INVALID_ERP_ENCODING", "استجابة ERP ليست UTF-8 صالحًا.");
  }
}

export type ConnectorRuntime = {
  fetcher?: typeof fetch;
  sleep?: (milliseconds: number) => Promise<void>;
  now?: () => number;
};

export class OfficialJsonErpReadConnector implements ErpReadConnector {
  private readonly baseUrl: URL;
  private readonly fetcher: typeof fetch;
  private readonly sleep: (milliseconds: number) => Promise<void>;
  private readonly now: () => number;
  private readonly timeoutMs: number;
  private readonly maxRetries: number;
  private readonly maxRetryDelayMs: number;
  private readonly maxResponseBytes: number;

  constructor(
    private readonly connection: ErpConnection,
    private readonly contract: ErpReadContract,
    runtime: ConnectorRuntime = {},
  ) {
    this.baseUrl = validateBaseUrl(connection);
    validateContract(connection, contract);
    this.fetcher = runtime.fetcher ?? fetch;
    this.sleep = runtime.sleep ?? ((milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)));
    this.now = runtime.now ?? Date.now;
    this.timeoutMs = connection.timeoutMs ?? 15_000;
    this.maxRetries = connection.maxRetries ?? 2;
    this.maxRetryDelayMs = connection.maxRetryDelayMs ?? 8_000;
    this.maxResponseBytes = connection.maxResponseBytes ?? DEFAULT_RESPONSE_BYTES;
    if (!Number.isInteger(this.timeoutMs) || this.timeoutMs < 100 || this.timeoutMs > 60_000 ||
        !Number.isInteger(this.maxRetries) || this.maxRetries < 0 || this.maxRetries > 4 ||
        !Number.isInteger(this.maxRetryDelayMs) || this.maxRetryDelayMs < 0 || this.maxRetryDelayMs > 30_000 ||
        !Number.isInteger(this.maxResponseBytes) || this.maxResponseBytes < 1024 || this.maxResponseBytes > 16 * 1024 * 1024) {
      throw new ErpConnectorError("INVALID_CONNECTOR_LIMITS", "حدود اتصال ERP خارج النطاق الآمن.");
    }
  }

  async readPage(input: ErpReadPageInput): Promise<ErpPage> {
    const url = new URL(this.contract.path.replace(/^\/+/, ""), this.baseUrl.toString().replace(/\/?$/, "/"));
    if (input.cursor) {
      if (!this.contract.cursorParameter) {
        throw new ErpConnectorError("INCREMENTAL_SYNC_UNSUPPORTED", "هذا المصدر لا يدعم cursor موثقًا.");
      }
      url.searchParams.set(this.contract.cursorParameter, cleanIdentity(input.cursor, "cursor", MAX_CURSOR_LENGTH));
    } else if (input.modifiedSince) {
      if (!this.contract.modifiedSinceParameter) {
        throw new ErpConnectorError("INCREMENTAL_SYNC_UNSUPPORTED", "هذا المصدر لا يدعم modified-since موثقًا.");
      }
      url.searchParams.set(this.contract.modifiedSinceParameter, validateTimestamp(input.modifiedSince));
    }
    if (this.contract.pageSizeParameter) {
      const size = this.contract.pageSize ?? 200;
      if (!Number.isInteger(size) || size < 1 || size > MAX_PAGE_ROWS) {
        throw new ErpConnectorError("INVALID_PROVIDER_CONTRACT", "حجم صفحة ERP خارج النطاق الآمن.");
      }
      url.searchParams.set(this.contract.pageSizeParameter, String(size));
    }
    if (url.origin !== this.baseUrl.origin || url.protocol !== "https:") {
      throw new ErpConnectorError("ERP_ORIGIN_CHANGED", "تغير أصل اتصال ERP أثناء بناء الطلب.");
    }

    const request = await this.requestWithRetry(url);
    let text: string;
    try {
      text = await readBoundedBody(request.response, this.maxResponseBytes);
    } catch (error) {
      request.cleanup();
      if (request.signal.aborted) {
        throw new ErpConnectorError("ERP_TIMEOUT", "انتهت مهلة قراءة استجابة مصدر ERP.", { retryable: true });
      }
      if (error instanceof ErpConnectorError) throw error;
      throw new ErpConnectorError("ERP_RESPONSE_READ_FAILED", "تعذرت قراءة استجابة مصدر ERP بأمان.", { retryable: true });
    }
    request.cleanup();
    let payload: unknown;
    try {
      payload = JSON.parse(text);
    } catch {
      throw new ErpConnectorError("INVALID_ERP_JSON", "أعاد ERP استجابة غير صالحة بصيغة JSON.", { httpStatus: request.response.status });
    }

    const rows = getPath(payload, this.contract.itemsPath, "itemsPath");
    if (!Array.isArray(rows) || rows.length > MAX_PAGE_ROWS) {
      throw new ErpConnectorError("INVALID_ERP_PAGE", "بنية صفحة ERP غير صالحة أو تتجاوز حد الصفوف.", { httpStatus: request.response.status });
    }
    const next = this.contract.nextCursorPath
      ? getPath(payload, this.contract.nextCursorPath, "nextCursorPath")
      : null;
    if (next != null && (typeof next !== "string" || next.length > MAX_CURSOR_LENGTH ||
        !next.trim() || /[\u0000-\u001f\u007f]/.test(next))) {
      throw new ErpConnectorError("INVALID_ERP_CURSOR", "أعاد ERP مؤشر صفحة غير صالح.", { httpStatus: request.response.status });
    }

    const records = await Promise.all(rows.map((row) => this.projectRecord(row)));
    const seenExternalIds = new Set<string>();
    for (const record of records) {
      if (seenExternalIds.has(record.externalId)) {
        throw new ErpConnectorError("DUPLICATE_SOURCE_ID_IN_PAGE", "أعاد ERP معرف سجل خارجي مكررًا داخل الصفحة نفسها.");
      }
      seenExternalIds.add(record.externalId);
    }
    return {
      records,
      nextCursor: typeof next === "string" ? next : null,
      httpStatus: request.response.status,
      externalRequestId: this.contract.requestIdHeader
        ? safeHeaderValue(request.response.headers.get(this.contract.requestIdHeader))
        : null,
      responseSha256: await sha256Hex(text),
    };
  }

  private async projectRecord(source: unknown): Promise<ErpCanonicalRecord> {
    if (!isRecord(source)) {
      throw new ErpConnectorError("INVALID_ERP_RECORD", "صف ERP ليس كائنًا صالحًا.");
    }
    const externalId = cleanIdentity(getPath(source, this.contract.externalIdPath, "externalIdPath"), "external_id");
    const sourceUpdatedAt = validateTimestamp(getPath(source, this.contract.sourceUpdatedAtPath, "sourceUpdatedAtPath"));
    const fields: Partial<Record<ErpCanonicalField, ErpScalar>> = {};
    for (const [field, path] of Object.entries(this.contract.fieldPaths)) {
      if (!path) continue;
      fields[field as ErpCanonicalField] = normalizeFieldValue(
        getPath(source, path, "fieldPaths." + field),
        field as ErpCanonicalField,
      );
    }
    for (const required of REQUIRED_FIELDS[this.contract.objectType]) {
      const value = fields[required];
      if (value == null || value === "") {
        throw new ErpConnectorError("REQUIRED_ERP_FIELD_MISSING", "يفتقد سجل ERP الحقل الإلزامي " + required + ".");
      }
    }
    if (this.contract.objectType === "stock_balances") {
      const onHand = fields.quantity_on_hand;
      const reserved = fields.quantity_reserved;
      const available = fields.quantity_available;
      if ([onHand, reserved, available].some((value) => typeof value !== "number" || value < 0) ||
          Math.abs((onHand as number) - (reserved as number) - (available as number)) > 0.001) {
        throw new ErpConnectorError("INVALID_ERP_STOCK_BALANCE", "رصيد ERP لا يحقق الموجود = المحجوز + المتاح.");
      }
    }
    const scopeKey = [
      this.contract.provider,
      this.contract.objectType,
      externalId,
    ].join("|");
    const idempotencyKey = await sha256Hex(scopeKey + "|" + sourceUpdatedAt + "|" + stableJson(fields));
    return {
      provider: this.contract.provider,
      objectType: this.contract.objectType,
      companyExternalId: "",
      branchExternalId: "",
      warehouseExternalId: null,
      currencyCode: null,
      externalId,
      sourceUpdatedAt,
      idempotencyKey,
      fields,
    };
  }

  private async requestWithRetry(url: URL): Promise<{ response: Response; signal: AbortSignal; cleanup: () => void }> {
    const headerName = this.connection.credential.headerName;
    const authValue = (this.connection.credential.prefix ?? "") + this.connection.credential.secret;
    for (let attempt = 0; attempt <= this.maxRetries; attempt += 1) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), this.timeoutMs);
      const cleanup = () => clearTimeout(timer);
      let response: Response;
      try {
        response = await this.fetcher(url.toString(), {
          method: "GET",
          headers: {
            Accept: "application/json",
            [headerName]: authValue,
          },
          redirect: "manual",
          signal: controller.signal,
        });
      } catch {
        cleanup();
        if (attempt >= this.maxRetries) {
          throw new ErpConnectorError(
            controller.signal.aborted ? "ERP_TIMEOUT" : "ERP_NETWORK_ERROR",
            controller.signal.aborted ? "انتهت مهلة الاتصال بمصدر ERP." : "تعذر الاتصال بمصدر ERP.",
            { retryable: true },
          );
        }
        await this.sleep(Math.min(500 * (2 ** attempt), this.maxRetryDelayMs));
        continue;
      }

      if (response.status >= 300 && response.status < 400) {
        await response.body?.cancel().catch(() => undefined);
        cleanup();
        throw new ErpConnectorError("ERP_REDIRECT_BLOCKED", "تم رفض إعادة توجيه اتصال ERP لحماية نطاق المضيف المعتمد.", { httpStatus: response.status });
      }
      const expiredStatuses = this.contract.cursorExpiredHttpStatuses ?? [410];
      if (expiredStatuses.includes(response.status)) {
        await response.body?.cancel().catch(() => undefined);
        cleanup();
        throw new ErpConnectorError("ERP_CURSOR_EXPIRED", "انتهت صلاحية مؤشر المزامنة؛ ستتم إعادة القراءة من آخر watermark مكتمل.", { httpStatus: response.status });
      }
      if (response.status === 401) {
        await response.body?.cancel().catch(() => undefined);
        cleanup();
        throw new ErpConnectorError("ERP_AUTHENTICATION_FAILED", "رفض مصدر ERP بيانات الاعتماد.", { httpStatus: 401 });
      }
      if (response.status === 403) {
        await response.body?.cancel().catch(() => undefined);
        cleanup();
        throw new ErpConnectorError("ERP_PERMISSION_DENIED", "حساب الربط لا يملك صلاحية قراءة الكائن المطلوب.", { httpStatus: 403 });
      }
      if (response.status === 429 || [500, 502, 503, 504].includes(response.status)) {
        const retryAfter = parseRetryAfter(response.headers.get("retry-after"), this.now(), this.maxRetryDelayMs);
        await response.body?.cancel().catch(() => undefined);
        cleanup();
        if (attempt >= this.maxRetries) {
          throw new ErpConnectorError(
            response.status === 429 ? "ERP_RATE_LIMITED" : "ERP_PROVIDER_UNAVAILABLE",
            response.status === 429 ? "فرض مصدر ERP حدًا للطلبات؛ انتهت محاولات الإعادة المحدودة." : "مصدر ERP غير متاح بعد محاولات الإعادة المحدودة.",
            { httpStatus: response.status, retryable: true },
          );
        }
        await this.sleep(retryAfter ?? Math.min(500 * (2 ** attempt), this.maxRetryDelayMs));
        continue;
      }
      if (!response.ok) {
        await response.body?.cancel().catch(() => undefined);
        cleanup();
        throw new ErpConnectorError("ERP_HTTP_ERROR", "أعاد مصدر ERP حالة HTTP غير ناجحة.", { httpStatus: response.status });
      }
      return { response, signal: controller.signal, cleanup };
    }
    throw new ErpConnectorError("ERP_RETRY_EXHAUSTED", "انتهت محاولات الاتصال بمصدر ERP.", { retryable: true });
  }
}

function safeHeaderValue(value: string | null): string | null {
  if (!value) return null;
  const clean = value.trim();
  return clean && clean.length <= 256 && !/[\r\n\u0000-\u001f\u007f]/.test(clean) ? clean : null;
}

function validateCanonicalCandidate(record: ErpCanonicalRecord, scope: ErpSyncScope): ErpCanonicalRecord {
  if (record.provider !== scope.provider || record.objectType !== scope.objectType ||
      !isRecord(record.fields)) {
    throw new ErpConnectorError("ERP_RECORD_SCOPE_MISMATCH", "نوع سجل المصدر أو بنيته لا يطابق نطاق مزامنة المؤسسة.");
  }
  const allowed = new Set(SAFE_FIELDS[scope.objectType]);
  const fields: Partial<Record<ErpCanonicalField, ErpScalar>> = {};
  for (const [field, value] of Object.entries(record.fields)) {
    if (!allowed.has(field as ErpCanonicalField)) {
      throw new ErpConnectorError("UNSAFE_FIELD_MAPPING", "حقل المصدر " + field + " غير مسموح في إسقاط " + scope.objectType + ".");
    }
    fields[field as ErpCanonicalField] = normalizeFieldValue(value, field as ErpCanonicalField);
  }
  for (const required of REQUIRED_FIELDS[scope.objectType]) {
    if (fields[required] == null || fields[required] === "") {
      throw new ErpConnectorError("REQUIRED_ERP_FIELD_MISSING", "يفتقد سجل ERP الحقل الإلزامي " + required + ".");
    }
  }
  if (scope.objectType === "stock_balances") {
    const onHand = fields.quantity_on_hand;
    const reserved = fields.quantity_reserved;
    const available = fields.quantity_available;
    if ([onHand, reserved, available].some((value) =>
      typeof value !== "number" || value < 0 || Math.round(value * 1000) / 1000 !== value
    ) || Math.abs((onHand as number) - (reserved as number) - (available as number)) > 0.001) {
      throw new ErpConnectorError("INVALID_ERP_STOCK_BALANCE", "رصيد ERP لا يحقق الموجود = المحجوز + المتاح بدقة ثلاث منازل عشرية.");
    }
  }
  return {
    ...record,
    externalId: cleanIdentity(record.externalId, "external_id"),
    sourceUpdatedAt: validateTimestamp(record.sourceUpdatedAt),
    fields,
  };
}

function validateCheckpoint(value: ErpCheckpoint): ErpCheckpoint {
  if (!value || !Number.isSafeInteger(value.version) || value.version < 0) {
    throw new ErpConnectorError("INVALID_SYNC_CHECKPOINT", "إصدار checkpoint غير صالح.");
  }
  for (const field of ["completedWatermark", "pendingWatermark"] as const) {
    const timestamp = value[field];
    if (timestamp !== null && validateTimestamp(timestamp) !== timestamp) {
      throw new ErpConnectorError("INVALID_SYNC_CHECKPOINT", "قيمة watermark غير موحدة بصيغة UTC.");
    }
  }
  if (value.cursor !== null) cleanIdentity(value.cursor, "cursor", MAX_CURSOR_LENGTH);
  return value;
}

function maxTimestamp(...values: Array<string | null>): string | null {
  const valid = values.filter((value): value is string => value !== null);
  if (!valid.length) return null;
  return valid.reduce((latest, value) => Date.parse(value) > Date.parse(latest) ? value : latest);
}

function subtractOverlap(watermark: string, overlapMs: number): string {
  return new Date(Math.max(0, Date.parse(watermark) - overlapMs)).toISOString();
}

export async function runIncrementalReadOnlySync(input: {
  connector: ErpReadConnector;
  store: ErpSyncCheckpointStore;
  scope: ErpSyncScope;
  overlapMs?: number;
  maxPages?: number;
  maxRecords?: number;
}): Promise<ErpSyncRunResult> {
  const overlapMs = input.overlapMs ?? 120_000;
  const maxPages = input.maxPages ?? 10;
  const maxRecords = input.maxRecords ?? 2000;
  if (!UUID_PATTERN.test(input.scope.organizationId) ||
      !["onyx_pro", "al_mutakamel"].includes(input.scope.provider) ||
      !Object.prototype.hasOwnProperty.call(SAFE_FIELDS, input.scope.objectType) ||
      !cleanIdentity(input.scope.companyExternalId, "company_external_id") ||
      !cleanIdentity(input.scope.branchExternalId, "branch_external_id") ||
      (input.scope.warehouseExternalId != null && !cleanIdentity(input.scope.warehouseExternalId, "warehouse_external_id")) ||
      (input.scope.currencyCode != null && !cleanIdentity(input.scope.currencyCode, "currency_code", 12)) ||
      !Number.isSafeInteger(overlapMs) || overlapMs < 0 || overlapMs > 24 * 60 * 60 * 1000 ||
      !Number.isInteger(maxPages) || maxPages < 1 || maxPages > MAX_SYNC_PAGES ||
      !Number.isInteger(maxRecords) || maxRecords < 1 || maxRecords > MAX_SYNC_RECORDS) {
    throw new ErpConnectorError("INVALID_SYNC_SCOPE_OR_LIMIT", "نطاق المؤسسة أو حدود تشغيل مزامنة ERP غير صالحة.");
  }

  let checkpoint = validateCheckpoint(await input.store.loadCheckpoint(input.scope));
  let pagesCommitted = 0;
  let recordsRead = 0;
  let cursorRecoveryUsed = false;
  const seenCursors = new Set<string>();
  const counts: ErpPersistCounts = { created: 0, updated: 0, unchanged: 0, rejected: 0, conflicted: 0 };

  while (pagesCommitted < maxPages && recordsRead < maxRecords) {
    let page: ErpPage;
    try {
      page = await input.connector.readPage({
        cursor: checkpoint.cursor,
        modifiedSince: checkpoint.cursor || !checkpoint.completedWatermark
          ? null
          : subtractOverlap(checkpoint.completedWatermark, overlapMs),
      });
    } catch (error) {
      if (
        error instanceof ErpConnectorError &&
        error.code === "ERP_CURSOR_EXPIRED" &&
        checkpoint.cursor !== null &&
        !cursorRecoveryUsed
      ) {
        checkpoint = validateCheckpoint(await input.store.resetExpiredCursor({
          scope: input.scope,
          expectedVersion: checkpoint.version,
        }));
        cursorRecoveryUsed = true;
        continue;
      }
      throw error;
    }

    if (page.httpStatus < 200 || page.httpStatus > 299 ||
        !/^[0-9a-f]{64}$/.test(page.responseSha256) ||
        !Array.isArray(page.records) || page.records.length > MAX_PAGE_ROWS) {
      throw new ErpConnectorError("INVALID_ERP_PAGE_RESULT", "نتيجة صفحة ERP لا تحتوي استجابة موثقة أو عدد سجلات صالحًا.");
    }
    if (page.nextCursor !== null) cleanIdentity(page.nextCursor, "next_cursor", MAX_CURSOR_LENGTH);
    if (page.nextCursor && (page.nextCursor === checkpoint.cursor || seenCursors.has(page.nextCursor))) {
      throw new ErpConnectorError("ERP_CURSOR_CYCLE", "أعاد مصدر ERP مؤشر صفحات دائريًا؛ أوقفت المزامنة.");
    }
    if (page.nextCursor) seenCursors.add(page.nextCursor);

    const records = await Promise.all(page.records.map(async (sourceRecord) => {
      const record = validateCanonicalCandidate(sourceRecord, input.scope);
      const scopedRecord = {
        ...record,
        companyExternalId: input.scope.companyExternalId,
        branchExternalId: input.scope.branchExternalId,
        warehouseExternalId: input.scope.warehouseExternalId ?? null,
        currencyCode: input.scope.currencyCode ?? null,
      };
      const idempotencyKey = await sha256Hex(stableJson({
        provider: scopedRecord.provider,
        organizationId: input.scope.organizationId,
        companyExternalId: scopedRecord.companyExternalId,
        branchExternalId: scopedRecord.branchExternalId,
        warehouseExternalId: scopedRecord.warehouseExternalId,
        currencyCode: scopedRecord.currencyCode,
        objectType: scopedRecord.objectType,
        externalId: scopedRecord.externalId,
        sourceUpdatedAt: scopedRecord.sourceUpdatedAt,
        fields: scopedRecord.fields,
      }));
      return { ...scopedRecord, idempotencyKey };
    }));
    const pageWatermark = records.reduce(
      (latest, record) => maxTimestamp(latest, record.sourceUpdatedAt),
      checkpoint.pendingWatermark,
    );
    const completed = page.nextCursor === null;
    const completedWatermark = completed
      ? maxTimestamp(checkpoint.completedWatermark, pageWatermark)
      : checkpoint.completedWatermark;
    const pendingWatermark = completed ? null : pageWatermark;

    const pageFingerprint = await sha256Hex(stableJson({
      provider: input.scope.provider,
      organizationId: input.scope.organizationId,
      companyExternalId: input.scope.companyExternalId,
      branchExternalId: input.scope.branchExternalId,
      objectType: input.scope.objectType,
      requestCursor: checkpoint.cursor,
      completedWatermark: checkpoint.completedWatermark,
      nextCursor: page.nextCursor,
      responseSha256: page.responseSha256,
      recordKeys: records.map((record) => record.idempotencyKey),
    }));

    const persisted = await input.store.persistPageAtomically({
      scope: input.scope,
      expectedVersion: checkpoint.version,
      pageFingerprint,
      records,
      nextCursor: page.nextCursor,
      pendingWatermark,
      completedWatermark,
      completed,
    });
    checkpoint = validateCheckpoint(persisted.checkpoint);
    if (!persisted.duplicatePage) {
      pagesCommitted += 1;
      recordsRead += records.length;
      counts.created += persisted.counts.created;
      counts.updated += persisted.counts.updated;
      counts.unchanged += persisted.counts.unchanged;
      counts.rejected += persisted.counts.rejected;
      counts.conflicted += persisted.counts.conflicted;
    }
    if (completed) break;
  }

  return {
    status: checkpoint.cursor === null ? "complete" : "continuation_required",
    pagesCommitted,
    recordsRead,
    counts,
    checkpoint,
  };
}

/** Explicit capability marker: absence of an official endpoint is not a failed HTTP probe. */
export function evaluateErpReadCapability(input: {
  officialContractPresent: boolean;
  licensed: boolean | null;
  endpointEnabled: boolean | null;
  credentialsAvailable: boolean;
  sandboxAvailable: boolean;
}): "READY_FOR_SANDBOX" | "BLOCKED_LICENSE" | "BLOCKED_ENDPOINT" | "BLOCKED_CREDENTIALS" | "BLOCKED_SANDBOX" | "UNKNOWN" {
  if (input.licensed === false) return "BLOCKED_LICENSE";
  if (input.endpointEnabled === false) return "BLOCKED_ENDPOINT";
  if (!input.officialContractPresent || input.licensed === null || input.endpointEnabled === null) return "UNKNOWN";
  if (!input.credentialsAvailable) return "BLOCKED_CREDENTIALS";
  if (!input.sandboxAvailable) return "BLOCKED_SANDBOX";
  return "READY_FOR_SANDBOX";
}
