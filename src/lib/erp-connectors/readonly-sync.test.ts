import { describe, expect, it, vi } from "vitest";
import {
  ErpConnectorError,
  OfficialJsonErpReadConnector,
  evaluateErpReadCapability,
  runIncrementalReadOnlySync,
  type ErpCanonicalRecord,
  type ErpCheckpoint,
  type ErpConnection,
  type ErpPersistResult,
  type ErpReadContract,
  type ErpReadConnector,
  type ErpReadPageInput,
  type ErpSyncCheckpointStore,
  type ErpSyncScope,
} from "../../../supabase/functions/_shared/erp-connectors/readonly-sync";

const connection: ErpConnection = {
  provider: "onyx_pro",
  baseUrl: "https://erp.example.test/api/v1",
  allowedHosts: ["erp.example.test"],
  credential: { headerName: "Authorization", prefix: "Bearer ", secret: "test-only-secret" },
};

const productContract: ErpReadContract = {
  provider: "onyx_pro",
  apiVersion: "vendor-confirmed-v1",
  officialDocumentationUrl: "https://vendor.example.test/docs/approved-api",
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
    barcode: ["barcode"],
    is_active: ["active"],
  },
  requestIdHeader: "x-request-id",
};

const scope: ErpSyncScope = {
  organizationId: "c87c10f5-2e7d-4d67-95f6-e15b37a2e6b0",
  companyExternalId: "company-01",
  branchExternalId: "branch-01",
  provider: "onyx_pro",
  objectType: "products",
};

function jsonResponse(payload: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json", ...headers },
  });
}

function sourceProduct(id: string, updatedAt = "2026-11-27T10:00:00Z") {
  return { id, code: "000" + id, name: "منتج " + id, barcode: null, active: true, updated_at: updatedAt, cost: 9999, margin: 900 };
}

function record(id: string, updatedAt: string): ErpCanonicalRecord {
  return {
    provider: "onyx_pro",
    objectType: "products",
    companyExternalId: "",
    branchExternalId: "",
    warehouseExternalId: null,
    currencyCode: null,
    externalId: id,
    sourceUpdatedAt: new Date(updatedAt).toISOString(),
    idempotencyKey: "record-" + id,
    fields: { item_code: "000" + id, name: "منتج " + id },
  };
}

function checkpoint(overrides: Partial<ErpCheckpoint> = {}): ErpCheckpoint {
  return {
    version: 0,
    completedWatermark: null,
    cursor: null,
    pendingWatermark: null,
    ...overrides,
  };
}

class InMemoryCheckpointStore implements ErpSyncCheckpointStore {
  state: ErpCheckpoint;
  readonly committed: Array<{
    pageFingerprint: string;
    receipt: { httpStatus: number; externalRequestId: string | null; responseSha256: string };
    records: readonly ErpCanonicalRecord[];
    nextCursor: string | null;
    pendingWatermark: string | null;
    completedWatermark: string | null;
    completed: boolean;
  }> = [];
  duplicateNext = false;

  constructor(initial = checkpoint()) {
    this.state = initial;
  }

  async loadCheckpoint(): Promise<ErpCheckpoint> {
    return { ...this.state };
  }

  async persistPageAtomically(input: {
    scope: ErpSyncScope;
    expectedVersion: number;
    pageFingerprint: string;
    receipt: { httpStatus: number; externalRequestId: string | null; responseSha256: string };
    records: readonly ErpCanonicalRecord[];
    nextCursor: string | null;
    pendingWatermark: string | null;
    completedWatermark: string | null;
    completed: boolean;
  }): Promise<ErpPersistResult> {
    // Idempotency lookup precedes version CAS so a lost response can be replayed safely.
    if (this.committed.some((page) => page.pageFingerprint === input.pageFingerprint)) {
      return {
        checkpoint: { ...this.state },
        counts: { created: 0, updated: 0, unchanged: 0, rejected: 0, conflicted: 0 },
        duplicatePage: true,
      };
    }
    if (input.expectedVersion !== this.state.version) {
      throw new ErpConnectorError("CHECKPOINT_CONFLICT", "stale checkpoint");
    }
    this.committed.push({
      pageFingerprint: input.pageFingerprint,
      receipt: input.receipt,
      records: input.records,
      nextCursor: input.nextCursor,
      pendingWatermark: input.pendingWatermark,
      completedWatermark: input.completedWatermark,
      completed: input.completed,
    });
    this.state = {
      version: this.state.version + 1,
      completedWatermark: input.completedWatermark,
      cursor: input.nextCursor,
      pendingWatermark: input.pendingWatermark,
    };
    return {
      checkpoint: { ...this.state },
      counts: { created: input.records.length, updated: 0, unchanged: 0, rejected: 0, conflicted: 0 },
      duplicatePage: false,
    };
  }

  async resetExpiredCursor(input: { scope: ErpSyncScope; expectedVersion: number }): Promise<ErpCheckpoint> {
    if (input.expectedVersion !== this.state.version) {
      throw new ErpConnectorError("CHECKPOINT_CONFLICT", "stale reset");
    }
    this.state = {
      version: this.state.version + 1,
      completedWatermark: this.state.completedWatermark,
      cursor: null,
      pendingWatermark: null,
    };
    return { ...this.state };
  }
}

describe("server-side ERP read connector contract", () => {
  it("rejects unencrypted, unapproved and private network destinations", () => {
    expect(() => new OfficialJsonErpReadConnector(
      { ...connection, baseUrl: "http://erp.example.test" },
      productContract,
    )).toThrowError(/HTTPS/);
    expect(() => new OfficialJsonErpReadConnector(
      { ...connection, baseUrl: "https://other.example.test/api" },
      productContract,
    )).toThrowError(/قائمة المضيفين/);
    expect(() => new OfficialJsonErpReadConnector(
      { ...connection, baseUrl: "https://127.0.0.1/api", allowedHosts: ["127.0.0.1"] },
      productContract,
    )).toThrowError(/اسم مضيف/);
  });

  it("requires an official contract and refuses unsafe or unapproved field mappings", () => {
    expect(() => new OfficialJsonErpReadConnector(connection, {
      ...productContract,
      officialDocumentationUrl: "http://vendor.example.test/api",
    })).toThrowError(/HTTPS/);
    expect(() => new OfficialJsonErpReadConnector(connection, {
      ...productContract,
      fieldPaths: {
        ...productContract.fieldPaths,
        item_code: ["code"],
        name: ["name"],
        gross_margin: ["margin"],
      } as ErpReadContract["fieldPaths"],
    })).toThrowError(/غير مسموح/);
    expect(() => new OfficialJsonErpReadConnector(connection, {
      ...productContract,
      path: "https://attacker.example/steal",
    })).toThrowError(/مسارًا نسبيًا/);
    expect(() => new OfficialJsonErpReadConnector(connection, {
      ...productContract,
      modifiedSinceParameter: undefined,
      cursorParameter: undefined,
    })).toThrowError(/cursor أو modified-since/);
  });

  it("rejects percent-encoded path traversal and encoded separators", () => {
    for (const path of ["items/%2e%2e/admin", "items/%2fadmin", "items/%5cadmin"]) {
      expect(() => new OfficialJsonErpReadConnector(connection, {
        ...productContract,
        path,
      })).toThrowError(/مسارًا نسبيًا/);
    }
  });

  it("projects commercial prices by price list and currency without importing supplier cost or margin", async () => {
    const contract: ErpReadContract = {
      ...productContract,
      objectType: "product_prices",
      fieldPaths: {
        item_code: ["item_code"],
        price_list_code: ["price_list"],
        currency_code: ["currency"],
        customer_tier: ["tier"],
        unit_code: ["unit"],
        unit_price: ["price"],
        minimum_quantity: ["minimum"],
        discount_percent: ["discount"],
        is_active: ["active"],
      },
    };
    const connector = new OfficialJsonErpReadConnector(connection, contract, {
      fetcher: vi.fn(async () => jsonResponse({
        data: { items: [{
          id: "price-1",
          updated_at: "2026-11-27T10:00:00Z",
          item_code: "000125",
          price_list: "WHOLESALE",
          currency: "YER",
          tier: "wholesale",
          unit: "CTN",
          price: 1250.5,
          minimum: 3,
          discount: 5,
          active: true,
          supplier_cost: 900,
          gross_margin: 350.5,
        }] },
        meta: { next_cursor: null },
      })),
    });
    const page = await connector.readPage({ cursor: null, modifiedSince: null });
    expect(page.records[0].fields).toEqual({
      item_code: "000125",
      price_list_code: "WHOLESALE",
      currency_code: "YER",
      customer_tier: "wholesale",
      unit_code: "CTN",
      unit_price: 1250.5,
      minimum_quantity: 3,
      discount_percent: 5,
      is_active: true,
    });
    expect(page.records[0].fields).not.toHaveProperty("supplier_cost");
    expect(page.records[0].fields).not.toHaveProperty("gross_margin");

    const invalid = new OfficialJsonErpReadConnector(connection, contract, {
      fetcher: vi.fn(async () => jsonResponse({
        data: { items: [{
          id: "price-2",
          updated_at: "2026-11-27T10:00:00Z",
          item_code: "000125",
          price_list: "WHOLESALE",
          currency: "YER",
          price: -1,
          discount: 150,
        }] },
        meta: { next_cursor: null },
      })),
    });
    await expect(invalid.readPage({ cursor: null, modifiedSince: null }))
      .rejects.toMatchObject({ code: "INVALID_ERP_PRICE" });
  });

  it("projects product unit conversions and requires a factor of one for the base unit", async () => {
    const contract: ErpReadContract = {
      ...productContract,
      objectType: "product_units",
      fieldPaths: {
        item_code: ["item_code"],
        unit_code: ["unit"],
        base_unit_code: ["base_unit"],
        conversion_factor: ["factor"],
        is_base_unit: ["is_base"],
        is_active: ["active"],
      },
    };
    const valid = new OfficialJsonErpReadConnector(connection, contract, {
      fetcher: vi.fn(async () => jsonResponse({
        data: { items: [{
          id: "unit-1",
          updated_at: "2026-11-27T10:00:00Z",
          item_code: "000125",
          unit: "CTN",
          base_unit: "PCS",
          factor: 24,
          is_base: false,
          active: true,
        }] },
        meta: { next_cursor: null },
      })),
    });
    const page = await valid.readPage({ cursor: null, modifiedSince: null });
    expect(page.records[0].fields).toEqual({
      item_code: "000125",
      unit_code: "CTN",
      base_unit_code: "PCS",
      conversion_factor: 24,
      is_base_unit: false,
      is_active: true,
    });

    const invalidBase = new OfficialJsonErpReadConnector(connection, contract, {
      fetcher: vi.fn(async () => jsonResponse({
        data: { items: [{
          id: "unit-2",
          updated_at: "2026-11-27T10:00:00Z",
          item_code: "000125",
          unit: "PCS",
          base_unit: "PCS",
          factor: 12,
          is_base: true,
          active: true,
        }] },
        meta: { next_cursor: null },
      })),
    });
    await expect(invalidBase.readPage({ cursor: null, modifiedSince: null }))
      .rejects.toMatchObject({ code: "INVALID_ERP_UNIT_CONVERSION" });
  });

  it("reads a bounded page, applies the documented delta cursor, and projects only allowlisted fields", async () => {
    let requestedUrl = "";
    let authHeader = "";
    const fetcher = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      requestedUrl = String(url);
      authHeader = new Headers(init?.headers).get("authorization") ?? "";
      return jsonResponse({
        data: { items: [sourceProduct("125")] },
        meta: { next_cursor: "next-1" },
      }, 200, { "x-request-id": "request-123" });
    });
    const connector = new OfficialJsonErpReadConnector(connection, productContract, { fetcher });
    const page = await connector.readPage({ cursor: null, modifiedSince: "2026-11-27T09:58:00Z" });

    const url = new URL(requestedUrl);
    expect(url.origin).toBe("https://erp.example.test");
    expect(url.pathname).toBe("/api/v1/items");
    expect(url.searchParams.get("modified_since")).toBe("2026-11-27T09:58:00Z");
    expect(url.searchParams.get("limit")).toBe("100");
    expect(authHeader).toBe("Bearer test-only-secret");
    expect(page.httpStatus).toBe(200);
    expect(page.externalRequestId).toBe("request-123");
    expect(page.nextCursor).toBe("next-1");
    expect(page.records[0]).toMatchObject({
      externalId: "125",
      sourceUpdatedAt: "2026-11-27T10:00:00.000Z",
      fields: { item_code: "000125", name: "منتج 125", barcode: null, is_active: true },
    });
    expect(page.records[0]).not.toHaveProperty("cost");
    expect(page.records[0]).not.toHaveProperty("margin");
    expect(page.records[0].idempotencyKey).toMatch(/^[0-9a-f]{64}$/);
    expect(page.responseSha256).toMatch(/^[0-9a-f]{64}$/);
  });

  it("honors the remaining per-run row budget and refuses a provider that ignores it", async () => {
    let requestedUrl = "";
    const bounded = new OfficialJsonErpReadConnector(connection, productContract, {
      fetcher: vi.fn(async (url: string | URL | Request) => {
        requestedUrl = String(url);
        return jsonResponse({
          data: { items: [sourceProduct("budget-1")] },
          meta: { next_cursor: null },
        });
      }),
    });
    await bounded.readPage({ cursor: null, modifiedSince: null, maxRows: 1 });
    expect(new URL(requestedUrl).searchParams.get("limit")).toBe("1");

    const noPageLimitContract: ErpReadContract = {
      ...productContract,
      pageSizeParameter: undefined,
    };
    const ignoresBudget = new OfficialJsonErpReadConnector(connection, noPageLimitContract, {
      fetcher: vi.fn(async () => jsonResponse({
        data: { items: [sourceProduct("budget-2"), sourceProduct("budget-3")] },
        meta: { next_cursor: "cursor-after-page" },
      })),
    });
    await expect(ignoresBudget.readPage({
      cursor: null,
      modifiedSince: null,
      maxRows: 1,
    })).rejects.toMatchObject({ code: "ERP_PAGE_EXCEEDS_RUN_LIMIT" });
  });

  it("uses the opaque source cursor on continuation pages and never follows redirects", async () => {
    let requestedUrl = "";
    const fetcher = vi.fn(async (url: string | URL | Request) => {
      requestedUrl = String(url);
      return jsonResponse({ data: { items: [sourceProduct("9")] }, meta: { next_cursor: null } });
    });
    const connector = new OfficialJsonErpReadConnector(connection, productContract, { fetcher });
    await connector.readPage({ cursor: "cursor/opaque?x=1", modifiedSince: null });
    expect(new URL(requestedUrl).searchParams.get("cursor")).toBe("cursor/opaque?x=1");

    const redirected = new OfficialJsonErpReadConnector(connection, productContract, {
      fetcher: vi.fn(async () => new Response(null, { status: 302, headers: { location: "https://attacker.example" } })),
    });
    await expect(redirected.readPage({ cursor: null, modifiedSince: null }))
      .rejects.toMatchObject({ code: "ERP_REDIRECT_BLOCKED", httpStatus: 302 });
  });

  it("retries a 429 within a fixed budget and honors a bounded Retry-After", async () => {
    const waits: number[] = [];
    let calls = 0;
    const connector = new OfficialJsonErpReadConnector(connection, productContract, {
      fetcher: vi.fn(async () => {
        calls += 1;
        return calls === 1
          ? new Response("{}", { status: 429, headers: { "retry-after": "2" } })
          : jsonResponse({ data: { items: [sourceProduct("1")] }, meta: { next_cursor: null } });
      }),
      sleep: async (value) => { waits.push(value); },
      now: () => Date.parse("2026-11-27T10:00:00Z"),
    });
    const page = await connector.readPage({ cursor: null, modifiedSince: null });
    expect(calls).toBe(2);
    expect(waits).toEqual([2000]);
    expect(page.records).toHaveLength(1);
  });

  it("does not retry credential failures and does not expose secrets in safe errors", async () => {
    const fetcher = vi.fn(async () => new Response("secret provider error", { status: 401 }));
    const connector = new OfficialJsonErpReadConnector(connection, productContract, { fetcher });
    await expect(connector.readPage({ cursor: null, modifiedSince: null }))
      .rejects.toMatchObject({ code: "ERP_AUTHENTICATION_FAILED", httpStatus: 401 });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("rejects oversized and malformed provider pages before exposing records", async () => {
    const oversized = new OfficialJsonErpReadConnector(connection, productContract, {
      fetcher: vi.fn(async () => new Response("{}", {
        status: 200,
        headers: { "content-length": String(5 * 1024 * 1024) },
      })),
    });
    await expect(oversized.readPage({ cursor: null, modifiedSince: null }))
      .rejects.toMatchObject({ code: "ERP_RESPONSE_TOO_LARGE" });

    const malformed = new OfficialJsonErpReadConnector(connection, productContract, {
      fetcher: vi.fn(async () => jsonResponse({ data: { items: "not-an-array" }, meta: {} })),
    });
    await expect(malformed.readPage({ cursor: null, modifiedSince: null }))
      .rejects.toMatchObject({ code: "INVALID_ERP_PAGE" });
  });

  it("rejects malformed source timestamps and invalid stock balance equations", async () => {
    const badTimestamp = new OfficialJsonErpReadConnector(connection, productContract, {
      fetcher: vi.fn(async () => jsonResponse({
        data: { items: [{ ...sourceProduct("2"), updated_at: "2026-11-27T10:00:00" }] },
        meta: { next_cursor: null },
      })),
    });
    await expect(badTimestamp.readPage({ cursor: null, modifiedSince: null }))
      .rejects.toMatchObject({ code: "INVALID_SOURCE_TIMESTAMP" });

    const stockContract: ErpReadContract = {
      ...productContract,
      objectType: "stock_balances",
      fieldPaths: {
        item_code: ["item_code"],
        warehouse_code: ["warehouse_code"],
        quantity_on_hand: ["on_hand"],
        quantity_reserved: ["reserved"],
        quantity_available: ["available"],
      },
    };
    const stock = new OfficialJsonErpReadConnector(connection, stockContract, {
      fetcher: vi.fn(async () => jsonResponse({
        data: {
          items: [{
            id: "stock-1",
            updated_at: "2026-11-27T10:00:00Z",
            item_code: "000125",
            warehouse_code: "WH-A",
            on_hand: 20,
            reserved: 5,
            available: 16,
          }],
        },
        meta: { next_cursor: null },
      })),
    });
    await expect(stock.readPage({ cursor: null, modifiedSince: null }))
      .rejects.toMatchObject({ code: "INVALID_ERP_STOCK_BALANCE" });
  });
});

describe("incremental ERP sync checkpoint orchestration", () => {
  it("normalizes database timestamps with UTC offsets before calculating the overlap", async () => {
    const store = new InMemoryCheckpointStore(checkpoint({
      version: 8,
      completedWatermark: "2026-11-27T09:00:00+00:00",
    }));
    const inputs: ErpReadPageInput[] = [];
    const connector: ErpReadConnector = {
      readPage: async (input) => {
        inputs.push(input);
        return {
          records: [record("offset-1", "2026-11-27T09:30:00Z")],
          nextCursor: null,
          httpStatus: 200,
          externalRequestId: null,
          responseSha256: "8".repeat(64),
        };
      },
    };
    await runIncrementalReadOnlySync({ connector, store, scope, overlapMs: 120_000 });
    expect(inputs[0].modifiedSince).toBe("2026-11-27T08:58:00.000Z");
  });


  it("commits pages atomically and advances the completed watermark only at the final page", async () => {
    const store = new InMemoryCheckpointStore(checkpoint({
      version: 2,
      completedWatermark: "2026-11-27T09:00:00.000Z",
    }));
    const inputs: ErpReadPageInput[] = [];
    const connector: ErpReadConnector = {
      readPage: async (input) => {
        inputs.push(input);
        if (inputs.length === 1) {
          return {
            records: [record("1", "2026-11-27T09:30:00Z")],
            nextCursor: "page-2",
            httpStatus: 200,
            externalRequestId: null,
            responseSha256: "a".repeat(64),
          };
        }
        return {
          records: [record("2", "2026-11-27T09:40:00Z")],
          nextCursor: null,
          httpStatus: 200,
          externalRequestId: null,
          responseSha256: "b".repeat(64),
        };
      },
    };

    const result = await runIncrementalReadOnlySync({ connector, store, scope, overlapMs: 120_000 });
    expect(inputs).toEqual([
      { cursor: null, modifiedSince: "2026-11-27T08:58:00.000Z", maxRows: 1000 },
      { cursor: "page-2", modifiedSince: null, maxRows: 1000 },
    ]);
    expect(store.committed).toHaveLength(2);
    expect(store.committed[0].receipt).toEqual({
      httpStatus: 200,
      externalRequestId: null,
      responseSha256: "a".repeat(64),
    });
    expect(store.committed[0].completedWatermark).toBe("2026-11-27T09:00:00.000Z");
    expect(store.committed[0].pendingWatermark).toBe("2026-11-27T09:30:00.000Z");
    expect(store.committed[1].completedWatermark).toBe("2026-11-27T09:40:00.000Z");
    expect(store.committed[1].pendingWatermark).toBeNull();
    expect(result.status).toBe("complete");
    expect(result.pagesCommitted).toBe(2);
    expect(result.recordsRead).toBe(2);
    expect(result.counts.created).toBe(2);
  });

  it("rejects invalid price rows from any connector before they reach persistence", async () => {
    const store = new InMemoryCheckpointStore();
    const connector: ErpReadConnector = {
      readPage: async () => ({
        records: [{
          ...record("bad-price", "2026-11-27T10:00:00Z"),
          objectType: "product_prices",
          fields: {
            item_code: "000125",
            price_list_code: "WHOLESALE",
            currency_code: "YER",
            unit_price: -10,
            discount_percent: 25,
          },
        }],
        nextCursor: null,
        httpStatus: 200,
        externalRequestId: null,
        responseSha256: "9".repeat(64),
      }),
    };
    await expect(runIncrementalReadOnlySync({
      connector,
      store,
      scope: { ...scope, objectType: "product_prices" },
    })).rejects.toMatchObject({ code: "INVALID_ERP_PRICE" });
    expect(store.committed).toHaveLength(0);
  });

  it("keeps a bounded run resumable instead of fetching an unbounded export", async () => {
    const store = new InMemoryCheckpointStore();
    let calls = 0;
    const connector: ErpReadConnector = {
      readPage: async () => {
        calls += 1;
        return {
          records: [record(String(calls), "2026-11-27T10:00:00Z")],
          nextCursor: "page-" + (calls + 1),
          httpStatus: 200,
          externalRequestId: null,
          responseSha256: String(calls).repeat(64),
        };
      },
    };
    const result = await runIncrementalReadOnlySync({
      connector,
      store,
      scope,
      maxPages: 1,
    });
    expect(calls).toBe(1);
    expect(result.status).toBe("continuation_required");
    expect(result.checkpoint.cursor).toBe("page-2");
    expect(result.checkpoint.completedWatermark).toBeNull();
    expect(result.checkpoint.pendingWatermark).toBe("2026-11-27T10:00:00.000Z");
  });

  it("replays a page after a lost persistence response without duplicating its effect", async () => {
    const store = new InMemoryCheckpointStore();
    const input = {
      scope,
      expectedVersion: 0,
      pageFingerprint: "f".repeat(64),
      receipt: { httpStatus: 200, externalRequestId: "receipt-1", responseSha256: "e".repeat(64) },
      records: [record("replay", "2026-11-27T10:00:00Z")],
      nextCursor: "after-replay",
      pendingWatermark: "2026-11-27T10:00:00.000Z",
      completedWatermark: null,
      completed: false,
    };
    const first = await store.persistPageAtomically(input);
    const replay = await store.persistPageAtomically(input);
    expect(first.duplicatePage).toBe(false);
    expect(replay.duplicatePage).toBe(true);
    expect(replay.checkpoint.version).toBe(1);
    expect(store.committed).toHaveLength(1);
    expect(replay.counts.created).toBe(0);
  });

  it("does not persist a page that exceeds the remaining run budget when a connector ignores maxRows", async () => {
    const store = new InMemoryCheckpointStore();
    const inputs: ErpReadPageInput[] = [];
    const connector: ErpReadConnector = {
      readPage: async (input) => {
        inputs.push(input);
        return {
          records: [
            record("limit-1", "2026-11-27T10:00:00Z"),
            record("limit-2", "2026-11-27T10:01:00Z"),
          ],
          nextCursor: "next-page",
          httpStatus: 200,
          externalRequestId: null,
          responseSha256: "e".repeat(64),
        };
      },
    };
    await expect(runIncrementalReadOnlySync({
      connector,
      store,
      scope,
      maxRecords: 1,
    })).rejects.toMatchObject({ code: "ERP_PAGE_EXCEEDS_RUN_LIMIT" });
    expect(inputs[0].maxRows).toBe(1);
    expect(store.committed).toHaveLength(0);
    expect(store.state.cursor).toBeNull();
    expect(store.state.version).toBe(0);
  });

  it("includes tenant and branch scope in the record idempotency key", async () => {
    const connector: ErpReadConnector = {
      readPage: async () => ({
        records: [record("same-external-id", "2026-11-27T10:00:00Z")],
        nextCursor: null,
        httpStatus: 200,
        externalRequestId: null,
        responseSha256: "f".repeat(64),
      }),
    };
    const firstStore = new InMemoryCheckpointStore();
    const secondStore = new InMemoryCheckpointStore();
    await runIncrementalReadOnlySync({ connector, store: firstStore, scope });
    await runIncrementalReadOnlySync({
      connector,
      store: secondStore,
      scope: {
        ...scope,
        organizationId: "7eb3cb3c-c8df-4b3a-b0be-8c45c5bc9a22",
        branchExternalId: "branch-02",
      },
    });
    expect(firstStore.committed[0].records[0].idempotencyKey)
      .not.toBe(secondStore.committed[0].records[0].idempotencyKey);
  });

  it("recovers once from an expired cursor by replaying the completed watermark overlap", async () => {
    const store = new InMemoryCheckpointStore(checkpoint({
      version: 5,
      completedWatermark: "2026-11-27T10:00:00.000Z",
      cursor: "expired-cursor",
      pendingWatermark: "2026-11-27T10:05:00.000Z",
    }));
    const inputs: ErpReadPageInput[] = [];
    const connector: ErpReadConnector = {
      readPage: async (input) => {
        inputs.push(input);
        if (inputs.length === 1) {
          throw new ErpConnectorError("ERP_CURSOR_EXPIRED", "cursor expired", { httpStatus: 410 });
        }
        return {
          records: [record("3", "2026-11-27T10:06:00Z")],
          nextCursor: null,
          httpStatus: 200,
          externalRequestId: null,
          responseSha256: "c".repeat(64),
        };
      },
    };
    const result = await runIncrementalReadOnlySync({ connector, store, scope });
    expect(inputs).toEqual([
      { cursor: "expired-cursor", modifiedSince: null, maxRows: 1000 },
      { cursor: null, modifiedSince: "2026-11-27T09:58:00.000Z", maxRows: 1000 },
    ]);
    expect(result.status).toBe("complete");
    expect(result.checkpoint.pendingWatermark).toBeNull();
    expect(result.checkpoint.completedWatermark).toBe("2026-11-27T10:06:00.000Z");
  });

  it("does not continue to write after a stale checkpoint version", async () => {
    const store = new InMemoryCheckpointStore(checkpoint({ version: 5 }));
    store.loadCheckpoint = async () => checkpoint({ version: 4 });
    const connector: ErpReadConnector = {
      readPage: async () => ({
        records: [record("4", "2026-11-27T10:06:00Z")],
        nextCursor: null,
        httpStatus: 200,
        externalRequestId: null,
        responseSha256: "d".repeat(64),
      }),
    };
    await expect(runIncrementalReadOnlySync({ connector, store, scope }))
      .rejects.toMatchObject({ code: "CHECKPOINT_CONFLICT" });
    expect(store.committed).toHaveLength(0);
  });

  it("does not invent enabled-provider capability when the installed license or endpoint is unknown", () => {
    expect(evaluateErpReadCapability({
      officialContractPresent: false,
      licensed: null,
      endpointEnabled: null,
      credentialsAvailable: false,
      sandboxAvailable: false,
    })).toBe("UNKNOWN");
    expect(evaluateErpReadCapability({
      officialContractPresent: true,
      licensed: false,
      endpointEnabled: true,
      credentialsAvailable: true,
      sandboxAvailable: true,
    })).toBe("BLOCKED_LICENSE");
    expect(evaluateErpReadCapability({
      officialContractPresent: true,
      licensed: true,
      endpointEnabled: true,
      credentialsAvailable: true,
      sandboxAvailable: true,
    })).toBe("READY_FOR_SANDBOX");
  });
});
