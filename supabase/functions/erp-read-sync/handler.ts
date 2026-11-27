import type { BoundedTextBodyResult } from "../_shared/bounded-body.ts";
import {
  ErpConnectorError,
  evaluateErpReadCapability,
  runIncrementalReadOnlySync,
  type ErpConnection,
  type ErpObjectType,
  type ErpProviderId,
  type ErpReadConnector,
  type ErpReadContract,
  type ErpSyncCheckpointStore,
} from "../_shared/erp-connectors/readonly-sync.ts";

type VerifiedUser = { id: string };
type AuthResult = { data: { user: VerifiedUser | null }; error: { status?: number } | null };
type AuthClient = { getUser(token: string): Promise<AuthResult> };
type Profile = { id: string; organization_id: string; is_active: boolean };
type QueryResult<T> = { data: T | null; error: { code?: string } | null };
type AdminClient = {
  getProfileByAuthUserId(authUserId: string): Promise<QueryResult<Profile>>;
  getRoles(profileId: string): Promise<QueryResult<Array<{ role: string }>>>;
};

export type ErpReadSyncHandlerDependencies = {
  getEnv(name: string): string | undefined;
  readBody(request: Request): Promise<BoundedTextBodyResult>;
  createAuthClient(url: string, publishableKey: string): AuthClient;
  createAdminClient(url: string, serviceRoleKey: string): AdminClient;
  createCheckpointStore(input: {
    supabaseUrl: string;
    serviceRoleKey: string;
    cursorEncryptionKey: string;
  }): ErpSyncCheckpointStore;
  createConnector(connection: ErpConnection, contract: ErpReadContract): ErpReadConnector;
  logError(message: string, context: Record<string, unknown>): void;
};

type RequestInput = {
  provider: ErpProviderId;
  objectType: ErpObjectType;
  companyExternalId: string;
  branchExternalId: string;
  warehouseExternalId: string | null;
  currencyCode: string | null;
  maxPages: number;
  maxRecords: number;
};

type ProviderConfig = {
  connection: ErpConnection;
  contract: ErpReadContract;
  allowedScopes: Array<{ company_external_id: string; branch_external_ids: string[]; warehouse_external_ids?: string[]; currency_codes?: string[] }>;
};

const PROVIDERS = ["onyx_pro", "al_mutakamel"] as const;
const OBJECT_TYPES = [
  "products",
  "customers",
  "warehouses",
  "stock_balances",
  "product_units",
  "product_prices",
] as const;
const REQUEST_KEYS = new Set([
  "provider",
  "object_type",
  "company_external_id",
  "branch_external_id",
  "warehouse_external_id",
  "currency_code",
  "max_pages",
  "max_records",
]);
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function json(body: Record<string, unknown>, status = 200, origin?: string): Response {
  const headers = new Headers({
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "x-content-type-options": "nosniff",
    vary: "Origin",
  });
  if (origin) {
    headers.set("access-control-allow-origin", origin);
    headers.set("access-control-allow-methods", "POST, OPTIONS");
    headers.set("access-control-allow-headers", "authorization, apikey, content-type, x-client-info");
    headers.set("access-control-max-age", "600");
  }
  return new Response(JSON.stringify(body), { status, headers });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function configuredOrigins(raw: string | undefined): Set<string> {
  return new Set((raw ?? "").split(",").map((value) => value.trim()).filter(Boolean));
}

function cleanScopeText(value: unknown, label: string, max = 256): string {
  if (typeof value !== "string") {
    throw new ErpConnectorError("INVALID_ERP_SYNC_REQUEST", "حقل نطاق المزامنة " + label + " مطلوب.");
  }
  const normalized = value.trim();
  if (!normalized || normalized.length > max || /[\u0000-\u001f\u007f]/.test(normalized)) {
    throw new ErpConnectorError("INVALID_ERP_SYNC_REQUEST", "حقل نطاق المزامنة " + label + " غير صالح.");
  }
  return normalized;
}

function parseRequest(value: unknown): RequestInput {
  if (!isRecord(value)) {
    throw new ErpConnectorError("INVALID_ERP_SYNC_REQUEST", "يجب إرسال كائن JSON صالح لطلب مزامنة ERP.");
  }
  const unexpected = Object.keys(value).filter((key) => !REQUEST_KEYS.has(key));
  if (unexpected.length) {
    throw new ErpConnectorError("INVALID_ERP_SYNC_REQUEST", "يحتوي طلب مزامنة ERP على حقول غير مسموح بها.");
  }

  const provider = value.provider;
  const objectType = value.object_type;
  if (typeof provider !== "string" || !PROVIDERS.includes(provider as ErpProviderId)) {
    throw new ErpConnectorError("INVALID_ERP_SYNC_PROVIDER", "مزود ERP المحدد غير مدعوم.");
  }
  if (typeof objectType !== "string" || !OBJECT_TYPES.includes(objectType as ErpObjectType)) {
    throw new ErpConnectorError("INVALID_ERP_SYNC_OBJECT", "نوع البيانات المحدد غير مدعوم.");
  }

  const maxPages = value.max_pages === undefined ? 2 : value.max_pages;
  const maxRecords = value.max_records === undefined ? 500 : value.max_records;
  if (!Number.isInteger(maxPages) || Number(maxPages) < 1 || Number(maxPages) > 5 ||
      !Number.isInteger(maxRecords) || Number(maxRecords) < 1 || Number(maxRecords) > 1000) {
    throw new ErpConnectorError("INVALID_ERP_SYNC_LIMIT", "حدود المزامنة يجب ألا تتجاوز 5 صفحات و1000 سجل لكل تشغيل.");
  }

  const currencyCode = value.currency_code === undefined || value.currency_code === null
    ? null
    : cleanScopeText(value.currency_code, "currency_code", 3).toUpperCase();
  if (currencyCode !== null && !/^[A-Z]{3}$/.test(currencyCode)) {
    throw new ErpConnectorError("INVALID_ERP_SYNC_SCOPE", "رمز العملة يجب أن يتكون من ثلاثة أحرف كبيرة.");
  }

  return {
    provider: provider as ErpProviderId,
    objectType: objectType as ErpObjectType,
    companyExternalId: cleanScopeText(value.company_external_id, "company_external_id"),
    branchExternalId: cleanScopeText(value.branch_external_id, "branch_external_id"),
    warehouseExternalId: value.warehouse_external_id === undefined || value.warehouse_external_id === null
      ? null
      : cleanScopeText(value.warehouse_external_id, "warehouse_external_id"),
    currencyCode,
    maxPages: Number(maxPages),
    maxRecords: Number(maxRecords),
  };
}

function readProviderConfig(
  provider: ErpProviderId,
  objectType: ErpObjectType,
  organizationId: string,
  getEnv: ErpReadSyncHandlerDependencies["getEnv"],
): ProviderConfig {
  const prefix = provider === "onyx_pro" ? "ONYX_PRO" : "AL_MUTAKAMEL";
  const read = (suffix: string) => getEnv(prefix + "_" + suffix)?.trim() ?? "";
  const tenantOrganizationId = read("ORGANIZATION_ID");
  const baseUrl = read("API_BASE_URL");
  const accessToken = read("API_TOKEN");
  const allowedHosts = read("API_ALLOWED_HOSTS").split(",").map((host) => host.trim().toLowerCase()).filter(Boolean);
  const contractsJson = read("READ_CONTRACTS_JSON");
  const allowedScopesJson = read("ALLOWED_SCOPES_JSON");
  const licenseSetting = read("LICENSE_CONFIRMED");
  const endpointSetting = read("ENDPOINT_CONFIRMED");
  const licensed = licenseSetting === "true" ? true : licenseSetting === "false" ? false : null;
  const endpointEnabled = endpointSetting === "true" ? true : endpointSetting === "false" ? false : null;
  const sandboxAvailable = read("SANDBOX_AVAILABLE") === "true";

  let contractValue: unknown;
  let allowedScopesValue: unknown;
  try {
    contractValue = contractsJson ? JSON.parse(contractsJson) : null;
    allowedScopesValue = allowedScopesJson ? JSON.parse(allowedScopesJson) : null;
  } catch {
    throw new ErpConnectorError("ERP_PROVIDER_CONTRACT_INVALID", "تعريف عقد أو نطاقات مزود ERP على الخادم غير صالح.");
  }
  const contract = isRecord(contractValue) ? contractValue[objectType] : null;
  const contractPresent = isRecord(contract) &&
    contract.provider === provider &&
    contract.objectType === objectType &&
    typeof contract.apiVersion === "string" && Boolean(contract.apiVersion.trim()) &&
    typeof contract.officialDocumentationUrl === "string" && Boolean(contract.officialDocumentationUrl.trim());
  const allowedScopes = Array.isArray(allowedScopesValue) ? allowedScopesValue.filter((entry) =>
    isRecord(entry) &&
    typeof entry.company_external_id === "string" && entry.company_external_id.trim().length > 0 &&
    Array.isArray(entry.branch_external_ids) && entry.branch_external_ids.every((item) => typeof item === "string" && item.trim().length > 0) &&
    (entry.warehouse_external_ids === undefined || (Array.isArray(entry.warehouse_external_ids) && entry.warehouse_external_ids.every((item) => typeof item === "string" && item.trim().length > 0))) &&
    (entry.currency_codes === undefined || (Array.isArray(entry.currency_codes) && entry.currency_codes.every((item) => typeof item === "string" && /^[A-Z]{3}$/.test(item))))
  ) as Array<{ company_external_id: string; branch_external_ids: string[]; warehouse_external_ids?: string[]; currency_codes?: string[] }> : [];

  const capability = evaluateErpReadCapability({
    officialContractPresent: contractPresent,
    licensed,
    endpointEnabled,
    credentialsAvailable: Boolean(accessToken && baseUrl && allowedHosts.length && allowedScopes.length > 0),
    sandboxAvailable,
  });
  if (capability !== "READY_FOR_SANDBOX") {
    throw new ErpConnectorError(
      capability === "BLOCKED_LICENSE" || capability === "BLOCKED_ENDPOINT"
        ? "ERP_PROVIDER_NOT_ENABLED"
        : "ERP_PROVIDER_NOT_CONFIGURED",
      "مزامنة " + prefix + " غير مفعلة: يلزم إثبات الترخيص والعقد الرسمي وبيئة Sandbox وبيانات الاتصال على الخادم.",
    );
  }
  if (tenantOrganizationId.toLowerCase() !== organizationId.toLowerCase() ||
      !UUID_PATTERN.test(tenantOrganizationId)) {
    throw new ErpConnectorError("ERP_PROVIDER_TENANT_SCOPE_MISMATCH", "إعداد ERP غير مربوط بمؤسسة المستخدم الحالية.");
  }

  const connection: ErpConnection = {
    provider,
    baseUrl,
    allowedHosts,
    credential: {
      headerName: read("API_TOKEN_HEADER") || "Authorization",
      prefix: read("API_TOKEN_PREFIX") || "Bearer ",
      secret: accessToken,
    },
    timeoutMs: 10_000,
    maxRetries: 1,
    maxRetryDelayMs: 2_000,
    maxResponseBytes: 2 * 1024 * 1024,
  };
  return { connection, contract: contract as ErpReadContract, allowedScopes };
}

function parseBearerToken(request: Request): string | null {
  const header = request.headers.get("authorization") ?? "";
  const match = /^Bearer ([^\s]{20,8192})$/i.exec(header);
  return match?.[1] ?? null;
}

export function createErpReadSyncHandler(
  dependencies: ErpReadSyncHandlerDependencies,
): (request: Request) => Promise<Response> {
  return async (request) => {
    const origin = request.headers.get("origin") ?? undefined;
    const allowedOrigins = configuredOrigins(dependencies.getEnv("ERP_SYNC_ALLOWED_ORIGINS"));
    if (origin && !allowedOrigins.has(origin)) return json({ error: "origin_not_allowed" }, 403);
    if (request.method === "OPTIONS") {
      if (origin && !allowedOrigins.has(origin)) return json({ error: "origin_not_allowed" }, 403);
      return new Response(null, {
        status: 204,
        headers: {
          "access-control-allow-origin": origin ?? "null",
          "access-control-allow-methods": "POST, OPTIONS",
          "access-control-allow-headers": "authorization, apikey, content-type, x-client-info",
          "access-control-max-age": "600",
          vary: "Origin",
        },
      });
    }
    if (request.method !== "POST") return json({ error: "method_not_allowed" }, 405, origin);

    const bearer = parseBearerToken(request);
    if (!bearer) return json({ error: "unauthorized" }, 401, origin);
    const url = dependencies.getEnv("SUPABASE_URL")?.trim() ?? "";
    const publishableKey = (
      dependencies.getEnv("SUPABASE_ANON_KEY") ??
      dependencies.getEnv("SUPABASE_PUBLISHABLE_KEY") ??
      ""
    ).trim();
    const serviceRoleKey = dependencies.getEnv("SUPABASE_SERVICE_ROLE_KEY")?.trim() ?? "";
    const cursorEncryptionKey = dependencies.getEnv("ERP_CURSOR_ENCRYPTION_KEY")?.trim() ?? "";
    if (!url || !publishableKey || !serviceRoleKey || !cursorEncryptionKey) {
      return json({ error: "erp_sync_server_not_configured" }, 503, origin);
    }

    const body = await dependencies.readBody(request);
    if (!body.ok) {
      return json({ error: body.reason === "too_large" ? "request_too_large" : "invalid_request_body" },
        body.reason === "too_large" ? 413 : 400, origin);
    }
    let payload: unknown;
    try {
      payload = JSON.parse(body.text);
    } catch {
      return json({ error: "invalid_json" }, 400, origin);
    }

    let input: RequestInput;
    try {
      input = parseRequest(payload);
    } catch (error) {
      return json({
        error: error instanceof ErpConnectorError ? error.code : "invalid_request",
      }, 400, origin);
    }

    try {
      const auth = await dependencies.createAuthClient(url, publishableKey).getUser(bearer);
      if (auth.error || !auth.data.user?.id) return json({ error: "unauthorized" }, 401, origin);

      const admin = dependencies.createAdminClient(url, serviceRoleKey);
      const profileResult = await admin.getProfileByAuthUserId(auth.data.user.id);
      if (profileResult.error) {
        dependencies.logError("ERP sync profile lookup failed", { code: profileResult.error.code ?? "unknown" });
        return json({ error: "authorization_lookup_failed" }, 503, origin);
      }
      const profile = profileResult.data;
      if (!profile || profile.is_active !== true || !UUID_PATTERN.test(profile.organization_id)) {
        return json({ error: "organization_membership_required" }, 403, origin);
      }

      const rolesResult = await admin.getRoles(profile.id);
      if (rolesResult.error) {
        dependencies.logError("ERP sync role lookup failed", { code: rolesResult.error.code ?? "unknown" });
        return json({ error: "authorization_lookup_failed" }, 503, origin);
      }
      const roles = new Set((rolesResult.data ?? []).map((item) => item.role));
      if (!roles.has("admin") && !roles.has("manager")) {
        return json({ error: "manager_or_admin_required" }, 403, origin);
      }

      const provider = readProviderConfig(input.provider, input.objectType, profile.organization_id, dependencies.getEnv);
      const requestedScope = provider.allowedScopes.find((allowed) =>
        allowed.company_external_id === input.companyExternalId &&
        allowed.branch_external_ids.includes(input.branchExternalId) &&
        (allowed.warehouse_external_ids === undefined ||
          (input.warehouseExternalId !== null && allowed.warehouse_external_ids.includes(input.warehouseExternalId))) &&
        (allowed.currency_codes === undefined ||
          (input.currencyCode !== null && allowed.currency_codes.includes(input.currencyCode)))
      );
      if (!requestedScope) {
        throw new ErpConnectorError("ERP_PROVIDER_SCOPE_NOT_ALLOWED", "الشركة أو الفرع أو المستودع أو العملة خارج نطاق اتصال ERP المعتمد للمؤسسة.");
      }
      const store = dependencies.createCheckpointStore({
        supabaseUrl: url,
        serviceRoleKey,
        cursorEncryptionKey,
      });
      const connector = dependencies.createConnector(provider.connection, provider.contract);
      const result = await runIncrementalReadOnlySync({
        connector,
        store,
        scope: {
          organizationId: profile.organization_id,
          provider: input.provider,
          objectType: input.objectType,
          companyExternalId: input.companyExternalId,
          branchExternalId: input.branchExternalId,
          warehouseExternalId: input.warehouseExternalId,
          currencyCode: input.currencyCode,
        },
        overlapMs: 120_000,
        maxPages: input.maxPages,
        maxRecords: input.maxRecords,
      });

      return json({
        status: result.status,
        pages_committed: result.pagesCommitted,
        records_read: result.recordsRead,
        counts: result.counts,
        checkpoint: {
          version: result.checkpoint.version,
          has_cursor: result.checkpoint.cursor !== null,
          pending_watermark: result.checkpoint.pendingWatermark,
          completed_watermark: result.checkpoint.completedWatermark,
        },
      }, 200, origin);
    } catch (error) {
      const code = error instanceof ErpConnectorError &&
        /^[A-Z][A-Z0-9_]{0,63}$/.test(error.code)
        ? error.code
        : "ERP_SYNC_FAILED";
      const retryable = error instanceof ErpConnectorError && error.retryable;
      dependencies.logError("ERP read-only synchronization failed", { code, retryable });
      const status = code.includes("SCOPE_NOT_ALLOWED") ? 403 :
        code.includes("NOT_CONFIGURED") || code.includes("NOT_ENABLED") ||
        code.includes("TENANT_SCOPE") ? 503 : retryable ? 503 : 502;
      return json({ error: code, retryable }, status, origin);
    }
  };
}
