import { describe, expect, it, vi } from "vitest";
import { SupabaseErpSyncCheckpointStore } from "../../../supabase/functions/_shared/erp-connectors/supabase-checkpoint-store";
import type { ErpCanonicalRecord, ErpSyncScope } from "../../../supabase/functions/_shared/erp-connectors/readonly-sync";

const CURSOR_KEY = "31".repeat(32);
const SERVICE_ROLE_KEY = "server-only-service-role-key";
const SUPABASE_URL = "http://127.0.0.1:54321";

const scope: ErpSyncScope = {
  organizationId: "c87c10f5-2e7d-4d67-95f6-e15b37a2e6b0",
  companyExternalId: "company-01",
  branchExternalId: "branch-01",
  warehouseExternalId: "warehouse-01",
  currencyCode: "YER",
  provider: "onyx_pro",
  objectType: "products",
};

function store(fetcher: typeof fetch) {
  return new SupabaseErpSyncCheckpointStore({
    supabaseUrl: SUPABASE_URL,
    serviceRoleKey: SERVICE_ROLE_KEY,
    cursorEncryptionKey: CURSOR_KEY,
    fetcher,
  });
}

function response(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function checkpoint(overrides: Record<string, unknown> = {}) {
  return {
    version: 0,
    cursor_ciphertext: null,
    pending_watermark: null,
    completed_watermark: null,
    ...overrides,
  };
}

const record: ErpCanonicalRecord = {
  provider: "onyx_pro",
  objectType: "products",
  companyExternalId: "company-01",
  branchExternalId: "branch-01",
  warehouseExternalId: "warehouse-01",
  currencyCode: "YER",
  externalId: "ERP-PRODUCT-001",
  sourceUpdatedAt: "2026-11-28T00:30:00.123456Z",
  idempotencyKey: "ab".repeat(32),
  fields: { item_code: "000125", name: "منتج تجريبي", barcode: null, is_active: true },
};

describe("SupabaseErpSyncCheckpointStore", () => {
  it("validates server-only connection settings and the encryption key", () => {
    expect(() => new SupabaseErpSyncCheckpointStore({
      supabaseUrl: "https://user:password@example.test",
      serviceRoleKey: SERVICE_ROLE_KEY,
      cursorEncryptionKey: CURSOR_KEY,
    })).toThrowError(/عنوان Supabase/);

    expect(() => new SupabaseErpSyncCheckpointStore({
      supabaseUrl: SUPABASE_URL,
      serviceRoleKey: SERVICE_ROLE_KEY,
      cursorEncryptionKey: "too-short",
    })).toThrowError(/32 بايت/);

    expect(() => new SupabaseErpSyncCheckpointStore({
      supabaseUrl: SUPABASE_URL,
      serviceRoleKey: "",
      cursorEncryptionKey: CURSOR_KEY,
    })).toThrowError(/بيانات اعتماد/);
  });

  it("loads a checkpoint through the service-role RPC and binds the full tenant scope", async () => {
    let requestedUrl = "";
    let requestHeaders = new Headers();
    let requestBody: Record<string, unknown> = {};
    const fetcher = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      requestedUrl = String(input);
      requestHeaders = new Headers(init?.headers);
      requestBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
      return response(checkpoint());
    });

    const result = await store(fetcher).loadCheckpoint(scope);
    expect(result).toEqual({
      version: 0,
      cursor: null,
      pendingWatermark: null,
      completedWatermark: null,
    });
    expect(new URL(requestedUrl).pathname).toBe("/rest/v1/rpc/load_erp_sync_checkpoint");
    expect(requestHeaders.get("apikey")).toBe(SERVICE_ROLE_KEY);
    expect(requestHeaders.get("authorization")).toBe("Bearer " + SERVICE_ROLE_KEY);
    expect(requestHeaders.get("content-type")).toBe("application/json");
    expect(requestBody).toMatchObject({
      p_organization_id: scope.organizationId,
      p_provider: "onyx_pro",
      p_company_external_id: "company-01",
      p_branch_external_id: "branch-01",
      p_warehouse_external_id: "warehouse-01",
      p_currency_code: "YER",
      p_object_type: "products",
    });
    expect(String(requestBody.p_scope_key)).toMatch(/^[0-9a-f]{64}$/);
  });

  it("encrypts the continuation cursor and commits only the approved canonical projection", async () => {
    const rawCursor = "private-provider-cursor/continuation-002";
    let requestBody: Record<string, unknown> = {};
    let requestedUrl = "";
    const fetcher = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      requestedUrl = String(input);
      requestBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
      return response({
        checkpoint: checkpoint({
          version: 1,
          cursor_ciphertext: requestBody.p_next_cursor_ciphertext,
          pending_watermark: "2026-11-28T00:30:00.123456+00:00",
        }),
        counts: { created: 1, updated: 0, unchanged: 0, rejected: 0, conflicted: 0 },
        duplicate_page: false,
      });
    });

    const result = await store(fetcher).persistPageAtomically({
      scope,
      expectedVersion: 0,
      pageFingerprint: "cd".repeat(32),
      receipt: {
        httpStatus: 200,
        externalRequestId: "onyx-request-123",
        responseSha256: "ef".repeat(32),
      },
      records: [record],
      nextCursor: rawCursor,
      pendingWatermark: record.sourceUpdatedAt,
      completedWatermark: null,
      completed: false,
    });

    expect(new URL(requestedUrl).pathname).toBe("/rest/v1/rpc/persist_erp_sync_page_atomically");
    expect(result).toMatchObject({
      checkpoint: {
        version: 1,
        cursor: rawCursor,
        pendingWatermark: "2026-11-28T00:30:00.123456+00:00",
        completedWatermark: null,
      },
      counts: { created: 1, updated: 0, unchanged: 0, rejected: 0, conflicted: 0 },
      duplicatePage: false,
    });
    expect(requestBody.p_next_cursor_ciphertext).not.toBe(rawCursor);
    expect(String(requestBody.p_next_cursor_ciphertext)).toMatch(/^v1:/);
    expect(String(requestBody.p_next_cursor_ciphertext)).not.toContain(rawCursor);
    expect(requestBody.p_records).toEqual([{
      external_id: record.externalId,
      source_updated_at: record.sourceUpdatedAt,
      idempotency_key: record.idempotencyKey,
      fields: record.fields,
    }]);
    expect(JSON.stringify(requestBody)).not.toContain("companyExternalId");
    expect(JSON.stringify(requestBody)).not.toContain(SERVICE_ROLE_KEY);
  });

  it("treats a re-encrypted replay as the same page and returns the committed cursor", async () => {
    const ciphertexts: string[] = [];
    const rawCursor = "opaque-cursor-after-lost-response";
    const fetcher = vi.fn(async (_input: string | URL | Request, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
      const ciphertext = String(body.p_next_cursor_ciphertext);
      ciphertexts.push(ciphertext);
      return response({
        checkpoint: checkpoint({
          version: 1,
          cursor_ciphertext: ciphertexts[0],
          pending_watermark: "2026-11-28T00:30:00Z",
        }),
        counts: ciphertexts.length === 1
          ? { created: 1, updated: 0, unchanged: 0, rejected: 0, conflicted: 0 }
          : { created: 0, updated: 0, unchanged: 0, rejected: 0, conflicted: 0 },
        duplicate_page: ciphertexts.length > 1,
      });
    });
    const checkpointStore = store(fetcher);
    const input = {
      scope,
      expectedVersion: 0,
      pageFingerprint: "a1".repeat(32),
      receipt: { httpStatus: 200, externalRequestId: "same-page", responseSha256: "a2".repeat(32) },
      records: [record],
      nextCursor: rawCursor,
      pendingWatermark: record.sourceUpdatedAt,
      completedWatermark: null,
      completed: false,
    };

    const first = await checkpointStore.persistPageAtomically(input);
    const replay = await checkpointStore.persistPageAtomically(input);

    expect(ciphertexts).toHaveLength(2);
    expect(ciphertexts[0]).not.toBe(ciphertexts[1]);
    expect(first.duplicatePage).toBe(false);
    expect(replay.duplicatePage).toBe(true);
    expect(replay.checkpoint.version).toBe(1);
    expect(replay.checkpoint.cursor).toBe(rawCursor);
    expect(replay.counts).toEqual({ created: 0, updated: 0, unchanged: 0, rejected: 0, conflicted: 0 });
  });

  it("decrypts the database cursor on reload without exposing ciphertext to the sync runner", async () => {
    const firstStore = store(vi.fn(async (_input: string | URL | Request, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
      return response({
        checkpoint: checkpoint({
          version: 1,
          cursor_ciphertext: body.p_next_cursor_ciphertext,
          pending_watermark: "2026-11-28T00:30:00Z",
        }),
        counts: { created: 0, updated: 0, unchanged: 0, rejected: 0, conflicted: 0 },
        duplicate_page: false,
      });
    }));
    const saved = await firstStore.persistPageAtomically({
      scope,
      expectedVersion: 0,
      pageFingerprint: "12".repeat(32),
      receipt: { httpStatus: 200, externalRequestId: null, responseSha256: "34".repeat(32) },
      records: [],
      nextCursor: "opaque-cursor-from-provider",
      pendingWatermark: "2026-11-28T00:30:00Z",
      completedWatermark: null,
      completed: false,
    });

    let storedCiphertext: string | null = null;
    const reloadStore = store(vi.fn(async (_input: string | URL | Request) => {
      return response(checkpoint({
        version: saved.checkpoint.version,
        cursor_ciphertext: storedCiphertext,
        pending_watermark: saved.checkpoint.pendingWatermark,
      }));
    }));
    // Re-encrypt through a second deterministic observation of the persisted RPC payload.
    const captureStore = store(vi.fn(async (_input: string | URL | Request, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
      storedCiphertext = String(body.p_next_cursor_ciphertext);
      return response({
        checkpoint: checkpoint({ version: 1, cursor_ciphertext: storedCiphertext }),
        counts: { created: 0, updated: 0, unchanged: 0, rejected: 0, conflicted: 0 },
        duplicate_page: false,
      });
    }));
    await captureStore.persistPageAtomically({
      scope,
      expectedVersion: 0,
      pageFingerprint: "56".repeat(32),
      receipt: { httpStatus: 200, externalRequestId: null, responseSha256: "78".repeat(32) },
      records: [],
      nextCursor: "opaque-cursor-from-provider",
      pendingWatermark: null,
      completedWatermark: null,
      completed: false,
    });

    const loaded = await reloadStore.loadCheckpoint(scope);
    expect(loaded.cursor).toBe("opaque-cursor-from-provider");
    expect(loaded.cursor).not.toBe(storedCiphertext);
  });

  it("resets only the expired cursor and preserves the last completed watermark", async () => {
    const fetcher = vi.fn(async (_input: string | URL | Request, _init?: RequestInit) => response({
      version: 5,
      cursor_ciphertext: null,
      pending_watermark: null,
      completed_watermark: "2026-11-27T22:00:00+00:00",
    }));
    const result = await store(fetcher).resetExpiredCursor({ scope, expectedVersion: 4 });
    expect(result).toEqual({
      version: 5,
      cursor: null,
      pendingWatermark: null,
      completedWatermark: "2026-11-27T22:00:00+00:00",
    });
    const body = JSON.parse(String(fetcher.mock.calls[0][1]?.body)) as Record<string, unknown>;
    expect(new URL(String(fetcher.mock.calls[0][0])).pathname).toBe("/rest/v1/rpc/reset_erp_sync_expired_cursor");
    expect(body.p_expected_version).toBe(4);
    expect(body).not.toHaveProperty("p_cursor");
  });

  it("maps transaction conflicts to retryable safe errors without returning provider or database messages", async () => {
    const fetcher = vi.fn(async () => response({
      code: "40001",
      message: "secret-bearing internal database error",
    }, 400));
    const result = store(fetcher).loadCheckpoint(scope);
    await expect(result).rejects.toMatchObject({
      code: "ERP_CHECKPOINT_CONFLICT",
      retryable: true,
    });
    const caught = await result.catch((error: unknown) => error);
    expect(caught instanceof Error ? caught.message : String(caught)).not.toContain("secret-bearing");
  });

  it("rejects a valid ciphertext transplanted from a different tenant scope", async () => {
    let ciphertext: string | null = null;
    const sourceStore = store(vi.fn(async (_input: string | URL | Request, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
      ciphertext = String(body.p_next_cursor_ciphertext);
      return response({
        checkpoint: checkpoint({ version: 1, cursor_ciphertext: ciphertext }),
        counts: { created: 0, updated: 0, unchanged: 0, rejected: 0, conflicted: 0 },
        duplicate_page: false,
      });
    }));
    await sourceStore.persistPageAtomically({
      scope,
      expectedVersion: 0,
      pageFingerprint: "91".repeat(32),
      receipt: { httpStatus: 200, externalRequestId: null, responseSha256: "92".repeat(32) },
      records: [],
      nextCursor: "tenant-a-private-cursor",
      pendingWatermark: "2026-11-28T00:30:00Z",
      completedWatermark: null,
      completed: false,
    });

    const otherTenantScope = {
      ...scope,
      organizationId: "8e1c5de2-35e0-4bfa-98e7-1c8e5b4f2b7a",
    };
    const destinationStore = store(vi.fn(async () => response(checkpoint({
      version: 1,
      cursor_ciphertext: ciphertext,
      pending_watermark: "2026-11-28T00:30:00Z",
    }))));
    await expect(destinationStore.loadCheckpoint(otherTenantScope))
      .rejects.toMatchObject({ code: "ERP_CURSOR_DECRYPT_FAILED" });
  });

  it("fails closed when the stored cursor is tampered or encrypted with a different key", async () => {
    const fetcher = vi.fn(async () => response(checkpoint({
      version: 2,
      cursor_ciphertext: "v1:AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
      pending_watermark: "2026-11-28T00:30:00Z",
    })));
    await expect(store(fetcher).loadCheckpoint(scope))
      .rejects.toMatchObject({ code: "ERP_CURSOR_DECRYPT_FAILED" });
  });
});
