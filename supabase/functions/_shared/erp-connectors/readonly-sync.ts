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
  | "stock_balances"
  | "product_units"
  | "product_prices";

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
  | "base_unit_code"
  | "conversion_factor"
  | "is_base_unit"
  | "price_list_code"
  | "customer_tier"
  | "currency_code"
  | "unit_price"
  | "minimum_quantity"
  | "discount_percent"
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

export type ErpSourceReceipt = {
  httpStatus: number;
  externalRequestId: string | null;
  responseSha256: string;
};

export type ErpPersistResult = {
  checkpoint: ErpCheckpoint;
  counts: ErpPersistCounts;
  duplicatePage: boolean;
};

/**
 * P2 implements this boundary with the canonical tenant-scoped staging RPC/table.
 * persistPageAtomically MUST atomically: deduplicate pageFingerprint and records,
 * deduplicate pageFingerprint before checking expectedVersion (lost-response replay),
 * persist permitted source projections/receipts, and advance cursor + pending/completed
 * watermark in one DB transaction. Treat cursors as sensitive: protect at rest and never
 * render or log them. It must
 * never post stock, invoices, receipts, or ledger entries.
 */
export interface ErpSyncCheckpointStore {
  loadCheckpoint(scope: ErpSyncScope): Promise<ErpCheckpoint>;
  persistPageAtomically(input: {
    scope: ErpSyncScope;
    expectedVersion: number;
    pageFingerprint: string;
    /** Provider response proof is persisted with the page and checkpoint in the same transaction. */
    receipt: ErpSourceReceipt;
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
  /** Maximum number of rows the current run can safely accept from this page. */
  maxRows?: number;
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

export type ErpSyncBatchTask = {
  scope: ErpSyncScope;
  connector: ErpReadConnector;
  store: ErpSyncCheckpointStore;
  overlapMs?: number;
  maxPages?: number;
  maxRecords?: number;
};

export type ErpSyncBatchTaskResult = {
  objectType: ErpObjectType;
  status: "complete" | "continuation_required" | "failed";
  pagesCommitted: number | null;
  recordsRead: number | null;
  counts: ErpPersistCounts | null;
  errorCode: string | null;
  retryable: boolean;
};

export type ErpSyncBatchResult = {
  status: "complete" | "continuation_required" | "partial_failure";
  completedTasks: number;
  continuedTasks: number;
  failedTasks: number;
  tasks: ErpSyncBatchTaskResult[];
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
  product_units: [
    "item_code", "unit_code", "base_unit_code", "conversion_factor", "is_base_unit", "is_active",
  ],
  product_prices: [
    "item_code", "price_list_code", "customer_tier", "currency_code", "unit_code",
    "unit_price", "minimum_quantity", "discount_percent", "is_active",
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
  product_units: ["item_code", "unit_code", "base_unit_code", "conversion_factor", "is_base_unit"],
  product_prices: ["item_code", "price_list_code", "currency_code", "unit_price"],
};

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ISO_TIMESTAMP_PATTERN = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,9}))?(Z|([+-])(\d{2}):(\d{2}))$/;
const HEADER_NAME_PATTERN = /^(?:authorization|x-[a-z0-9-]{1,60})$/i;
const SAFE_REQUEST_ID_HEADER_PATTERN = /^(?:x-(?:request|correlation|trace|transaction)-id|request-id|correlation-id|trace-id)$/i;
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
  const match = typeof value === "string" ? ISO_TIMESTAMP_PATTERN.exec(value) : null;
  if (!match) {
    throw new ErpConnectorError("INVALID_SOURCE_TIMESTAMP", "تاريخ تحديث سجل ERP يجب أن يتضمن منطقة زمنية بصيغة ISO-8601.");
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = Number(match[4]);
  const minute = Number(match[5]);
  const second = Number(match[6]);
  const daysInMonth = [
    31,
    year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0) ? 29 : 28,
    31, 30, 31, 30, 31, 31, 30, 31, 30, 31,
  ][month - 1];
  if (
    year < 1 || month < 1 || month > 12 || !daysInMonth ||
    day < 1 || day > daysInMonth ||
    hour > 23 || minute > 59 || second > 59
  ) {
    throw new ErpConnectorError("INVALID_SOURCE_TIMESTAMP", "تاريخ تحديث سجل ERP غير صالح تقويميًا.");
  }

  if (match[8] !== "Z") {
    const offsetHours = Number(match[10]);
    const offsetMinutes = Number(match[11]);
    if (offsetHours > 14 || offsetMinutes > 59 || (offsetHours === 14 && offsetMinutes !== 0)) {
      throw new ErpConnectorError("INVALID_SOURCE_TIMESTAMP", "إزاحة المنطقة الزمنية في تاريخ ERP تتجاوز حد ISO-8601.");
    }
  }

  const date = new Date(value as string);
  if (!Number.isFinite(date.getTime())) {
    throw new ErpConnectorError("INVALID_SOURCE_TIMESTAMP", "تاريخ تحديث سجل ERP غير صالح.");
  }
  const normalized = date.toISOString();
  const normalizedMatch = ISO_TIMESTAMP_PATTERN.exec(normalized);
  if (!normalizedMatch || Number(normalizedMatch[1]) < 1) {
    throw new ErpConnectorError(
      "INVALID_SOURCE_TIMESTAMP_RANGE",
      "تحويل تاريخ ERP إلى UTC يتجاوز نطاق السنوات المدعوم من نقطة المزامنة.",
    );
  }
  return normalized;
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
  let unsafeEncodedSegment = false;
  try {
    unsafeEncodedSegment = segments.some((segment) => {
      const decoded = decodeURIComponent(segment);
      return decoded === "." || decoded === ".." || decoded.includes("/") ||
        decoded.includes("\\") || /[\u0000-\u001f\u007f]/.test(decoded);
    });
  } catch {
    unsafeEncodedSegment = true;
  }
  if (
    !path || path.length > MAX_PATH_LENGTH || path.startsWith("//") ||
    path.includes("?") || path.includes("#") || path.includes("\\") ||
    unsafeEncodedSegment ||
    segments.some((segment) => !segment || segment === "." || segment === ".." || !PATH_SEGMENT_PATTERN.test(segment))
  ) {
    throw new ErpConnectorError("INVALID_PROVIDER_PATH", "مسار ERP يجب أن يكون مسارًا نسبيًا موثقًا دون URL أو معاملات خارجية.");
  }
  if (contract.requestIdHeader && !SAFE_REQUEST_ID_HEADER_PATTERN.test(contract.requestIdHeader)) {
    throw new ErpConnectorError(
      "UNSAFE_ERP_REQUEST_ID_HEADER",
      "اسم ترويسة تتبع طلب ERP غير مسموح؛ تُقبل رؤوس معرفات التتبع فقط.",
    );
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
    await response.body?.cancel().catch(() => undefined);
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
    const maxRows = input.maxRows ?? MAX_PAGE_ROWS;
    if (!Number.isInteger(maxRows) || maxRows < 1 || maxRows > MAX_PAGE_ROWS) {
      throw new ErpConnectorError("INVALID_ERP_PAGE_LIMIT", "حد سجلات صفحة ERP خارج النطاق الآمن.");
    }
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
      url.searchParams.set(this.contract.pageSizeParameter, String(Math.min(size, maxRows)));
    }
    if (url.origin !== this.baseUrl.origin || url.protocol !== "https:") {
      throw new ErpConnectorError("ERP_ORIGIN_CHANGED", "تغير أصل اتصال ERP أثناء بناء الطلب.");
    }

    let text: string;
    let response: Response;
    let retriesUsed = 0;
    for (;;) {
      const request = await this.requestWithRetry(url, this.maxRetries - retriesUsed);
      response = request.response;
      try {
        text = await readBoundedBody(request.response, this.maxResponseBytes);
        request.cleanup();
        break;
      } catch (error) {
        request.cleanup();
        const timedOut = request.signal.aborted;
        const retryableReadFailure = timedOut ||
          !(error instanceof ErpConnectorError) ||
          error.retryable;
        retriesUsed += request.retriesUsed;
        if (!retryableReadFailure || retriesUsed >= this.maxRetries) {
          if (timedOut) {
            throw new ErpConnectorError("ERP_TIMEOUT", "انتهت مهلة قراءة استجابة مصدر ERP.", { retryable: true });
          }
          if (error instanceof ErpConnectorError) throw error;
          throw new ErpConnectorError("ERP_RESPONSE_READ_FAILED", "تعذرت قراءة استجابة مصدر ERP بأمان.", { retryable: true });
        }
        const backoffAttempt = retriesUsed;
        retriesUsed += 1;
        await this.sleep(Math.min(500 * (2 ** backoffAttempt), this.maxRetryDelayMs));
      }
    }
    let payload: unknown;
    try {
      payload = JSON.parse(text);
    } catch {
      throw new ErpConnectorError("INVALID_ERP_JSON", "أعاد ERP استجابة غير صالحة بصيغة JSON.", { httpStatus: response.status });
    }

    const rows = getPath(payload, this.contract.itemsPath, "itemsPath");
    if (!Array.isArray(rows) || rows.length > MAX_PAGE_ROWS) {
      throw new ErpConnectorError("INVALID_ERP_PAGE", "بنية صفحة ERP غير صالحة أو تتجاوز حد الصفوف.", { httpStatus: response.status });
    }
    if (rows.length > maxRows) {
      throw new ErpConnectorError(
        "ERP_PAGE_EXCEEDS_RUN_LIMIT",
        "تجاوزت صفحة ERP سقف السجلات المتبقي للدفعة؛ لم يتم حفظ الصفحة أو تحريك مؤشر المزامنة.",
        { httpStatus: response.status },
      );
    }
    const next = this.contract.nextCursorPath
      ? getPath(payload, this.contract.nextCursorPath, "nextCursorPath")
      : null;
    if (next != null && (typeof next !== "string" || next.length > MAX_CURSOR_LENGTH ||
        !next.trim() || /[\u0000-\u001f\u007f]/.test(next))) {
      throw new ErpConnectorError("INVALID_ERP_CURSOR", "أعاد ERP مؤشر صفحة غير صالح.", { httpStatus: response.status });
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
      httpStatus: response.status,
      externalRequestId: this.contract.requestIdHeader
        ? safeHeaderValue(response.headers.get(this.contract.requestIdHeader))
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
          (reserved as number) + (available as number) > (onHand as number) + 0.001) {
        throw new ErpConnectorError("INVALID_ERP_STOCK_BALANCE", "المحجوز والمتاح يتجاوزان الرصيد الفعلي في ERP.");
      }
    }
    if (this.contract.objectType === "product_units") {
      const factor = fields.conversion_factor;
      if (typeof factor !== "number" || factor <= 0 || factor > 1_000_000_000 ||
          typeof fields.is_base_unit !== "boolean" ||
          (fields.is_base_unit && Math.abs(factor - 1) > 0.000001)) {
        throw new ErpConnectorError("INVALID_ERP_UNIT_CONVERSION", "معامل تحويل وحدة ERP يجب أن يكون موجبًا، ومعامل الوحدة الأساسية يساوي 1.");
      }
    }
    if (this.contract.objectType === "product_prices") {
      const price = fields.unit_price;
      const minimum = fields.minimum_quantity;
      const discount = fields.discount_percent;
      if (typeof price !== "number" || price < 0 ||
          (minimum != null && (typeof minimum !== "number" || minimum < 0)) ||
          (discount != null && (typeof discount !== "number" || discount < 0 || discount > 100))) {
        throw new ErpConnectorError("INVALID_ERP_PRICE", "سعر ERP أو الحد الأدنى أو نسبة الخصم غير صالحة.");
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

  private async requestWithRetry(
    url: URL,
    retryBudget: number,
  ): Promise<{ response: Response; signal: AbortSignal; cleanup: () => void; retriesUsed: number }> {
    const headerName = this.connection.credential.headerName;
    const authValue = (this.connection.credential.prefix ?? "") + this.connection.credential.secret;
    for (let attempt = 0; attempt <= retryBudget; attempt += 1) {
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
        if (attempt >= retryBudget) {
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
      if ([408, 425, 429, 500, 502, 503, 504].includes(response.status)) {
        const retryAfter = parseRetryAfter(response.headers.get("retry-after"), this.now(), this.maxRetryDelayMs);
        await response.body?.cancel().catch(() => undefined);
        cleanup();
        if (attempt >= retryBudget) {
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
      return { response, signal: controller.signal, cleanup, retriesUsed: attempt };
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
    ) || (reserved as number) + (available as number) > (onHand as number) + 0.001) {
      throw new ErpConnectorError("INVALID_ERP_STOCK_BALANCE", "المحجوز والمتاح يتجاوزان الرصيد الفعلي في ERP.");
    }
  }
  if (scope.objectType === "product_units") {
    const factor = fields.conversion_factor;
    if (typeof factor !== "number" || factor <= 0 || factor > 1_000_000_000 ||
        typeof fields.is_base_unit !== "boolean" ||
        (fields.is_base_unit && Math.abs(factor - 1) > 0.000001)) {
      throw new ErpConnectorError("INVALID_ERP_UNIT_CONVERSION", "معامل تحويل وحدة ERP يجب أن يكون موجبًا، ومعامل الوحدة الأساسية يساوي 1.");
    }
  }
  if (scope.objectType === "product_prices") {
    const price = fields.unit_price;
    const minimum = fields.minimum_quantity;
    const discount = fields.discount_percent;
    if (typeof price !== "number" || price < 0 ||
        (minimum != null && (typeof minimum !== "number" || minimum < 0)) ||
        (discount != null && (typeof discount !== "number" || discount < 0 || discount > 100))) {
      throw new ErpConnectorError("INVALID_ERP_PRICE", "سعر ERP أو الحد الأدنى أو نسبة الخصم غير صالحة.");
    }
  }
  return {
    ...record,
    externalId: cleanIdentity(record.externalId, "external_id"),
    sourceUpdatedAt: validateTimestamp(record.sourceUpdatedAt),
    fields,
  };
}

function validatePersistResult(value: ErpPersistResult): ErpPersistResult {
  if (!isRecord(value) || typeof value.duplicatePage !== "boolean" || !isRecord(value.counts)) {
    throw new ErpConnectorError("INVALID_CHECKPOINT_STORE_RESULT", "أعاد مخزن مزامنة ERP نتيجة غير مكتملة.");
  }
  const countFields: Array<keyof ErpPersistCounts> = ["created", "updated", "unchanged", "rejected", "conflicted"];
  const counts = {} as ErpPersistCounts;
  for (const field of countFields) {
    const count = value.counts[field];
    if (typeof count !== "number" || !Number.isSafeInteger(count) || count < 0) {
      throw new ErpConnectorError("INVALID_CHECKPOINT_STORE_RESULT", "أعاد مخزن مزامنة ERP عدادًا غير صالح: " + field);
    }
    counts[field] = count;
  }
  return {
    checkpoint: validateCheckpoint(value.checkpoint),
    counts,
    duplicatePage: value.duplicatePage,
  };
}

function validateCheckpoint(value: ErpCheckpoint): ErpCheckpoint {
  if (!value || !Number.isSafeInteger(value.version) || value.version < 0) {
    throw new ErpConnectorError("INVALID_SYNC_CHECKPOINT", "إصدار checkpoint غير صالح.");
  }
  const completedWatermark = value.completedWatermark === null
    ? null
    : validateTimestamp(value.completedWatermark);
  const pendingWatermark = value.pendingWatermark === null
    ? null
    : validateTimestamp(value.pendingWatermark);
  if (value.cursor !== null) cleanIdentity(value.cursor, "cursor", MAX_CURSOR_LENGTH);
  return { ...value, completedWatermark, pendingWatermark };
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
      !Number.isSafeInteger(overlapMs) || overlapMs < 0 || overlapMs > 24 * 60 * 60 * 1000 ||
      !Number.isInteger(maxPages) || maxPages < 1 || maxPages > MAX_SYNC_PAGES ||
      !Number.isInteger(maxRecords) || maxRecords < 1 || maxRecords > MAX_SYNC_RECORDS) {
    throw new ErpConnectorError("INVALID_SYNC_SCOPE_OR_LIMIT", "نطاق المؤسسة أو حدود تشغيل مزامنة ERP غير صالحة.");
  }
  const scope: ErpSyncScope = {
    ...input.scope,
    organizationId: input.scope.organizationId.toLocaleLowerCase("en"),
    companyExternalId: cleanIdentity(input.scope.companyExternalId, "company_external_id"),
    branchExternalId: cleanIdentity(input.scope.branchExternalId, "branch_external_id"),
    warehouseExternalId: input.scope.warehouseExternalId == null
      ? null
      : cleanIdentity(input.scope.warehouseExternalId, "warehouse_external_id"),
    currencyCode: input.scope.currencyCode == null
      ? null
      : cleanIdentity(input.scope.currencyCode, "currency_code", 12).toLocaleUpperCase("en"),
  };

  let checkpoint = validateCheckpoint(await input.store.loadCheckpoint(scope));
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
        maxRows: Math.min(maxRecords - recordsRead, MAX_PAGE_ROWS),
      });
    } catch (error) {
      if (
        error instanceof ErpConnectorError &&
        error.code === "ERP_CURSOR_EXPIRED" &&
        checkpoint.cursor !== null &&
        !cursorRecoveryUsed
      ) {
        checkpoint = validateCheckpoint(await input.store.resetExpiredCursor({
          scope: scope,
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
    if (page.records.length > maxRecords - recordsRead) {
      throw new ErpConnectorError(
        "ERP_PAGE_EXCEEDS_RUN_LIMIT",
        "تجاوز موصل ERP سقف السجلات المتبقي للدفعة؛ لم يتم حفظ الصفحة أو تحريك مؤشر المزامنة.",
        { httpStatus: page.httpStatus },
      );
    }
    if (page.nextCursor !== null) cleanIdentity(page.nextCursor, "next_cursor", MAX_CURSOR_LENGTH);
    if (page.nextCursor && (page.nextCursor === checkpoint.cursor || seenCursors.has(page.nextCursor))) {
      throw new ErpConnectorError("ERP_CURSOR_CYCLE", "أعاد مصدر ERP مؤشر صفحات دائريًا؛ أوقفت المزامنة.");
    }
    if (page.nextCursor) seenCursors.add(page.nextCursor);

    const records = await Promise.all(page.records.map(async (sourceRecord) => {
      const record = validateCanonicalCandidate(sourceRecord, scope);
      const scopedRecord = {
        ...record,
        companyExternalId: scope.companyExternalId,
        branchExternalId: scope.branchExternalId,
        warehouseExternalId: scope.warehouseExternalId ?? null,
        currencyCode: scope.currencyCode ?? null,
      };
      const idempotencyKey = await sha256Hex(stableJson({
        provider: scopedRecord.provider,
        organizationId: scope.organizationId,
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
      provider: scope.provider,
      organizationId: scope.organizationId,
      companyExternalId: scope.companyExternalId,
      branchExternalId: scope.branchExternalId,
      warehouseExternalId: scope.warehouseExternalId,
      currencyCode: scope.currencyCode,
      objectType: scope.objectType,
      requestCursor: checkpoint.cursor,
      completedWatermark: checkpoint.completedWatermark,
      nextCursor: page.nextCursor,
      responseSha256: page.responseSha256,
      recordKeys: records.map((record) => record.idempotencyKey),
    }));

    const persisted = validatePersistResult(await input.store.persistPageAtomically({
      scope: scope,
      expectedVersion: checkpoint.version,
      pageFingerprint,
      receipt: {
        httpStatus: page.httpStatus,
        externalRequestId: page.externalRequestId,
        responseSha256: page.responseSha256,
      },
      records,
      nextCursor: page.nextCursor,
      pendingWatermark,
      completedWatermark,
      completed,
    }));
    const duplicateMadeNoCheckpointProgress = persisted.duplicatePage &&
      persisted.checkpoint.cursor === checkpoint.cursor &&
      persisted.checkpoint.pendingWatermark === checkpoint.pendingWatermark &&
      persisted.checkpoint.completedWatermark === checkpoint.completedWatermark;
    checkpoint = persisted.checkpoint;
    if (duplicateMadeNoCheckpointProgress) {
      if (completed) break;
      throw new ErpConnectorError(
        "ERP_DUPLICATE_PAGE_NO_PROGRESS",
        "أعاد مخزن ERP صفحة مكررة دون تحريك نقطة الاستئناف؛ أوقفت التشغيل لمنع حلقة لا نهائية.",
      );
    }
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

/**
 * Runs a bounded set of independent ERP object streams sequentially.
 *
 * Each object keeps its own scope, store and checkpoint. A failed object does not
 * suppress unrelated object streams; its failure is reduced to a stable safe code.
 * The result deliberately omits checkpoint cursors and exception messages.
 */
export async function runIncrementalReadOnlyBatch(input: {
  tasks: readonly ErpSyncBatchTask[];
}): Promise<ErpSyncBatchResult> {
  const maximumTasks = Object.keys(SAFE_FIELDS).length;
  if (!Array.isArray(input.tasks) || input.tasks.length < 1 || input.tasks.length > maximumTasks) {
    throw new ErpConnectorError(
      "INVALID_ERP_SYNC_BATCH",
      "دفعة مزامنة ERP يجب أن تحتوي كائنًا واحدًا على الأقل، وألا تتجاوز عدد أنواع البيانات المدعومة.",
    );
  }

  const scopeKeys = new Set<string>();
  for (const task of input.tasks) {
    if (!task || !task.scope || typeof task.scope !== "object" ||
        typeof task.connector?.readPage !== "function" ||
        typeof task.store?.loadCheckpoint !== "function" ||
        typeof task.store?.persistPageAtomically !== "function" ||
        typeof task.store?.resetExpiredCursor !== "function") {
      throw new ErpConnectorError("INVALID_ERP_SYNC_BATCH", "تحتوي دفعة مزامنة ERP على موصل أو مخزن أو نطاق غير صالح.");
    }
    const taskScope = task.scope;
    if (!UUID_PATTERN.test(taskScope.organizationId) ||
        !["onyx_pro", "al_mutakamel"].includes(taskScope.provider) ||
        !Object.prototype.hasOwnProperty.call(SAFE_FIELDS, taskScope.objectType)) {
      throw new ErpConnectorError("INVALID_ERP_SYNC_BATCH", "تحتوي دفعة مزامنة ERP على نطاق مؤسسة أو مزود أو كائن غير صالح.");
    }
    const key = stableJson({
      provider: taskScope.provider,
      organizationId: taskScope.organizationId.toLocaleLowerCase("en"),
      companyExternalId: cleanIdentity(taskScope.companyExternalId, "company_external_id"),
      branchExternalId: cleanIdentity(taskScope.branchExternalId, "branch_external_id"),
      warehouseExternalId: taskScope.warehouseExternalId == null
        ? null
        : cleanIdentity(taskScope.warehouseExternalId, "warehouse_external_id"),
      currencyCode: taskScope.currencyCode == null
        ? null
        : cleanIdentity(taskScope.currencyCode, "currency_code", 12).toLocaleUpperCase("en"),
      objectType: taskScope.objectType,
    });
    if (scopeKeys.has(key)) {
      throw new ErpConnectorError(
        "DUPLICATE_ERP_SYNC_BATCH_SCOPE",
        "تحتوي دفعة مزامنة ERP على نطاق كائن مكرر؛ رُفضت الدفعة قبل بدء أي قراءة.",
      );
    }
    scopeKeys.add(key);
  }

  const tasks: ErpSyncBatchTaskResult[] = [];

  for (const task of input.tasks) {
    try {
      const result = await runIncrementalReadOnlySync({
        connector: task.connector,
        store: task.store,
        scope: task.scope,
        overlapMs: task.overlapMs,
        maxPages: task.maxPages,
        maxRecords: task.maxRecords,
      });
      tasks.push({
        objectType: task.scope.objectType,
        status: result.status,
        pagesCommitted: result.pagesCommitted,
        recordsRead: result.recordsRead,
        counts: result.counts,
        errorCode: null,
        retryable: false,
      });
    } catch (error) {
      const safeConnectorError = error instanceof ErpConnectorError &&
        /^[A-Z][A-Z0-9_]{0,63}$/.test(error.code);
      tasks.push({
        objectType: task.scope.objectType,
        status: "failed",
        pagesCommitted: null,
        recordsRead: null,
        counts: null,
        errorCode: safeConnectorError ? error.code : "ERP_SYNC_UNEXPECTED_FAILURE",
        retryable: safeConnectorError && error.retryable,
      });
    }
  }

  const completedTasks = tasks.filter((task) => task.status === "complete").length;
  const continuedTasks = tasks.filter((task) => task.status === "continuation_required").length;
  const failedTasks = tasks.filter((task) => task.status === "failed").length;
  return {
    status: failedTasks > 0
      ? "partial_failure"
      : continuedTasks > 0
        ? "continuation_required"
        : "complete",
    completedTasks,
    continuedTasks,
    failedTasks,
    tasks,
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
