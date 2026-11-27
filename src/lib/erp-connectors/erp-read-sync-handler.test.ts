import { describe, expect, it, vi } from "vitest";
import { createErpReadSyncHandler, type ErpReadSyncHandlerDependencies } from "../../../supabase/functions/erp-read-sync/handler";
import type {
  ErpConnection,
  ErpReadContract,
  ErpSyncCheckpointStore,
  ErpSyncScope,
} from "../../../supabase/functions/_shared/erp-connectors/readonly-sync";

const organizationId = "c87c10f5-2e7d-4d67-95f6-e15b37a2e6b0";
const authUserId = "f2a4e3c5-91a7-4a23-98c6-b4a0d4c3a809";
const authToken = "a".repeat(40);
const serviceRoleKey = "server-only-service-role-secret";
const cursorKey = "31".repeat(32);
const origin = "https://admin.example.test";

const contract: ErpReadContract = {
  provider: "onyx_pro",
  apiVersion: "vendor-confirmed-v1",
  officialDocumentationUrl: "https://docs.vendor.example.test/api",
  objectType: "products",
  path: "items",
  itemsPath: ["data", "items"],
  nextCursorPath: ["meta", "next_cursor"],
  cursorParameter: "cursor",
  modifiedSinceParameter: "modified_since",
  pageSizeParameter: "limit",
  pageSize: 100,
  externalIdPath: ["id"],
  sourceUpdatedAtPath: ["updated_at"],
  fieldPaths: {
    item_code: ["code"],
    name: ["name"],
  },
  requestIdHeader: "x-request-id",
};

const scopeInput = {
  provider: "onyx_pro",
  object_type: "products",
  company_external_id: "company-01",
  branch_external_id: "branch-01",
  warehouse_external_id: "warehouse-01",
  currency_code: "YER",
  max_pages: 2,
  max_records: 200,
};

function buildDependencies(overrides: Partial<ErpReadSyncHandlerDependencies> = {}) {
  const env: Record<string, string> = {
    SUPABASE_URL: "https://project.supabase.co",
    SUPABASE_ANON_KEY: "publishable-test-key",
    SUPABASE_SERVICE_ROLE_KEY: serviceRoleKey,
    ERP_CURSOR_ENCRYPTION_KEY: cursorKey,
    ERP_SYNC_ALLOWED_ORIGINS: origin,
    ONYX_PRO_ORGANIZATION_ID: organizationId,
    ONYX_PRO_API_BASE_URL: "https://erp.vendor.example.test/api/v1",
    ONYX_PRO_API_ALLOWED_HOSTS: "erp.vendor.example.test",
    ONYX_PRO_API_TOKEN: "server-only-erp-token",
    ONYX_PRO_API_TOKEN_HEADER: "Authorization",
    ONYX_PRO_API_TOKEN_PREFIX: "Bearer ",
    ONYX_PRO_LICENSE_CONFIRMED: "true",
    ONYX_PRO_ENDPOINT_CONFIRMED: "true",
    ONYX_PRO_SANDBOX_AVAILABLE: "true",
    ONYX_PRO_READ_CONTRACTS_JSON: JSON.stringify({ products: contract }),
    ONYX_PRO_ALLOWED_SCOPES_JSON: JSON.stringify([{
      company_external_id: "company-01",
      branch_external_ids: ["branch-01"],
      warehouse_external_ids: ["warehouse-01"],
      currency_codes: ["YER"],
    }]),
  };
  const loadedScopes: ErpSyncScope[] = [];
  const createConnector = vi.fn((_connection: ErpConnection, _contract: ErpReadContract) => ({
    readPage: vi.fn(async () => ({
      records: [],
      nextCursor: null,
      httpStatus: 200,
      externalRequestId: "sandbox-request-01",
      responseSha256: "ab".repeat(32),
    })),
  }));
  const store: ErpSyncCheckpointStore & ErpStagedRecordReader = {
    loadCheckpoint: vi.fn(async (scope: ErpSyncScope) => {
      loadedScopes.push(scope);
      return {
        version: 0,
        cursor: null,
        pendingWatermark: null,
        completedWatermark: null,
      };
    }),
    persistPageAtomically: vi.fn(async (input) => ({
      checkpoint: {
        version: input.expectedVersion + 1,
        cursor: input.nextCursor,
        pendingWatermark: input.pendingWatermark,
        completedWatermark: input.completedWatermark,
      },
      counts: { created: 0, updated: 0, unchanged: 0, rejected: 0, conflicted: 0 },
      duplicatePage: false,
    })),
    resetExpiredCursor: vi.fn(async (input) => ({
      version: input.expectedVersion + 1,
      cursor: null,
      pendingWatermark: null,
      completedWatermark: null,
    })),
    listStagedRecords: vi.fn(async () => ({
      records: [{
        externalId: "ERP-PRODUCT-001",
        sourceUpdatedAt: "2026-11-28T00:30:00Z",
        fields: { item_code: "000125", name: "منتج تجريبي" },
        lastDisposition: "created",
        lastDispositionReason: null,
        lastDispositionReason: null,
      }],
      total: 1,
      limit: 20,
      offset: 0,
      checkpointVersion: 1,
      pendingWatermark: null,
      completedWatermark: "2026-11-28T00:30:00Z",
    })),
  };
  const logError = vi.fn();
  const dependencies: ErpReadSyncHandlerDependencies = {
    getEnv: (name) => env[name],
    readBody: async (request) => ({ ok: true, text: await request.text() }),
    createAuthClient: vi.fn(() => ({
      getUser: vi.fn(async (token: string) => ({
        data: { user: token === authToken ? { id: authUserId } : null },
        error: token === authToken ? null : { status: 401 },
      })),
    })),
    createAdminClient: vi.fn(() => ({
      getProfileByAuthUserId: vi.fn(async (id: string) => ({
        data: id === authUserId ? {
          id: "profile-01",
          organization_id: organizationId,
          is_active: true,
        } : null,
        error: null,
      })),
      getRoles: vi.fn(async () => ({ data: [{ role: "manager" }], error: null })),
    })),
    createCheckpointStore: vi.fn(() => store),
    createConnector,
    logError,
    ...overrides,
  };
  return { dependencies, env, store, loadedScopes, createConnector, logError };
}

function request(body: unknown, token = authToken, requestOrigin = origin) {
  return new Request("https://project.supabase.co/functions/v1/erp-read-sync", {
    method: "POST",
    headers: {
      authorization: "Bearer " + token,
      origin: requestOrigin,
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });
}

describe("ERP read-only Edge Function handler", () => {
  it("derives organization scope from the verified server profile, never the request body", async () => {
    const context = buildDependencies();
    const handler = createErpReadSyncHandler(context.dependencies);
    const response = await handler(request(scopeInput));
    const payload = await response.json() as Record<string, unknown>;

    expect(response.status).toBe(200);
    expect(payload.status).toBe("complete");
    expect(payload.preview).toMatchObject({ total: 1, limit: 20, records: [{ externalId: "ERP-PRODUCT-001", fields: { item_code: "000125" } }] });
    expect(payload.preview_error).toBeNull();
    expect(payload.counts).toEqual({
      created: 0,
      updated: 0,
      unchanged: 0,
      rejected: 0,
      conflicted: 0,
    });
    expect(context.loadedScopes).toHaveLength(1);
    expect(context.loadedScopes[0]).toMatchObject({
      organizationId,
      provider: "onyx_pro",
      objectType: "products",
      companyExternalId: "company-01",
      branchExternalId: "branch-01",
      warehouseExternalId: "warehouse-01",
      currencyCode: "YER",
    });
    expect(context.createConnector).toHaveBeenCalledTimes(1);
    const [connection] = context.createConnector.mock.calls[0];
    expect(connection.baseUrl).toBe("https://erp.vendor.example.test/api/v1");
    expect(connection.credential.secret).toBe("server-only-erp-token");
    expect(JSON.stringify(payload)).not.toContain("server-only");
    expect(JSON.stringify(payload)).not.toContain("tenant-private-cursor");
    expect(JSON.stringify(payload)).not.toContain("idempotencyKey");
    expect(JSON.stringify(payload)).not.toContain("v1:");
    expect(response.headers.get("access-control-allow-origin")).toBe(origin);
  });

  it("keeps a committed sync successful when the optional staged preview read fails", async () => {
    const context = buildDependencies();
    context.store.listStagedRecords = vi.fn(async () => {
      throw new Error("internal preview failure must not escape");
    });
    const response = await createErpReadSyncHandler(context.dependencies)(request(scopeInput));
    const payload = await response.json() as Record<string, unknown>;

    expect(response.status).toBe(200);
    expect(payload.status).toBe("complete");
    expect(payload.counts).toEqual({
      created: 0,
      updated: 0,
      unchanged: 0,
      rejected: 0,
      conflicted: 0,
    });
    expect(payload.preview).toBeNull();
    expect(payload.preview_error).toBe("ERP_STAGING_PREVIEW_FAILED");
    expect(JSON.stringify(payload)).not.toContain("internal preview failure");
  });

  it("rejects any client-supplied organization identifier before authentication or database access", async () => {
    const context = buildDependencies();
    const handler = createErpReadSyncHandler(context.dependencies);
    const response = await handler(request({ ...scopeInput, organization_id: "00000000-0000-4000-8000-000000000001" }));
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "INVALID_ERP_SYNC_REQUEST" });
    expect(context.dependencies.createAuthClient).not.toHaveBeenCalled();
    expect(context.dependencies.createAdminClient).not.toHaveBeenCalled();
    expect(context.createConnector).not.toHaveBeenCalled();
  });

  it("requires verified Supabase identity and denies customer or staff roles", async () => {
    const unauthorized = buildDependencies();
    const unauthorizedHandler = createErpReadSyncHandler(unauthorized.dependencies);
    const noIdentity = await unauthorizedHandler(request(scopeInput, "x".repeat(40)));
    expect(noIdentity.status).toBe(401);
    expect(unauthorized.createConnector).not.toHaveBeenCalled();

    const denied = buildDependencies({
      createAdminClient: vi.fn(() => ({
        getProfileByAuthUserId: vi.fn(async () => ({
          data: { id: "profile-01", organization_id: organizationId, is_active: true },
          error: null,
        })),
        getRoles: vi.fn(async () => ({ data: [{ role: "staff" }], error: null })),
      })),
    });
    const deniedResponse = await createErpReadSyncHandler(denied.dependencies)(request(scopeInput));
    expect(deniedResponse.status).toBe(403);
    expect(await deniedResponse.json()).toEqual({ error: "manager_or_admin_required" });
    expect(denied.createConnector).not.toHaveBeenCalled();
  });

  it("fails closed when provider license, official endpoint or sandbox proof is absent", async () => {
    const context = buildDependencies();
    context.env.ONYX_PRO_LICENSE_CONFIRMED = "false";
    const handler = createErpReadSyncHandler({
      ...context.dependencies,
      getEnv: (name) => context.env[name],
    });
    const response = await handler(request(scopeInput));
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: "ERP_PROVIDER_NOT_ENABLED", retryable: false });
    expect(context.createConnector).not.toHaveBeenCalled();
    expect(context.store.loadCheckpoint).not.toHaveBeenCalled();
  });

  it("rejects cross-organization provider configuration even for a manager", async () => {
    const context = buildDependencies();
    context.env.ONYX_PRO_ORGANIZATION_ID = "00000000-0000-4000-8000-000000000002";
    const response = await createErpReadSyncHandler({
      ...context.dependencies,
      getEnv: (name) => context.env[name],
    })(request(scopeInput));
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: "ERP_PROVIDER_TENANT_SCOPE_MISMATCH", retryable: false });
    expect(context.createConnector).not.toHaveBeenCalled();
  });

  it("rejects company or branch identifiers outside the server-owned tenant scope allowlist", async () => {
    const context = buildDependencies();
    const response = await createErpReadSyncHandler(context.dependencies)(
      request({ ...scopeInput, company_external_id: "company-of-another-tenant" }),
    );
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({
      error: "ERP_PROVIDER_SCOPE_NOT_ALLOWED",
      retryable: false,
    });
    expect(context.createConnector).not.toHaveBeenCalled();
    expect(context.store.loadCheckpoint).not.toHaveBeenCalled();
  });

  it("rejects null warehouse or currency when the server restricts those dimensions", async () => {
    const warehouseContext = buildDependencies();
    const warehouseResponse = await createErpReadSyncHandler(warehouseContext.dependencies)(
      request({ ...scopeInput, warehouse_external_id: null }),
    );
    expect(warehouseResponse.status).toBe(403);
    expect(await warehouseResponse.json()).toEqual({
      error: "ERP_PROVIDER_SCOPE_NOT_ALLOWED",
      retryable: false,
    });
    expect(warehouseContext.createConnector).not.toHaveBeenCalled();

    const currencyContext = buildDependencies();
    const currencyResponse = await createErpReadSyncHandler(currencyContext.dependencies)(
      request({ ...scopeInput, currency_code: null }),
    );
    expect(currencyResponse.status).toBe(403);
    expect(await currencyResponse.json()).toEqual({
      error: "ERP_PROVIDER_SCOPE_NOT_ALLOWED",
      retryable: false,
    });
    expect(currencyContext.createConnector).not.toHaveBeenCalled();
  });

  it("rejects an origin not explicitly allowed by the server", async () => {
    const context = buildDependencies();
    const response = await createErpReadSyncHandler(context.dependencies)(
      request(scopeInput, authToken, "https://attacker.example.test"),
    );
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: "origin_not_allowed" });
    expect(context.dependencies.createAuthClient).not.toHaveBeenCalled();
  });

  it("rejects unsupported page and record limits before any provider request", async () => {
    const context = buildDependencies();
    const response = await createErpReadSyncHandler(context.dependencies)(
      request({ ...scopeInput, max_pages: 100 }),
    );
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "INVALID_ERP_SYNC_LIMIT" });
    expect(context.createConnector).not.toHaveBeenCalled();
  });
});
