import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  createOutboxWorkerHandler,
  type OutboxWorkerHandlerDependencies,
  type OutboxWorkerRpcClient,
} from "../../supabase/functions/outbox-worker/handler";
import type { BoundedTextBodyResult } from "../../supabase/functions/_shared/bounded-body";

type Rpc = OutboxWorkerRpcClient["rpc"];

const fixtureWorkerSecret = randomBytes(32).toString("base64url");
const fixtureInvalidWorkerSecret = randomBytes(32).toString("base64url");
const fixtureServiceRoleKey = randomBytes(48).toString("base64url");

function createHarness(options?: {
  body?: BoundedTextBodyResult;
  env?: Record<string, string | undefined>;
  rpc?: Rpc;
}) {
  const calls: Array<{ procedure: string; parameters: Record<string, unknown> }> = [];
  const errors: Array<{ message: string; context: Record<string, unknown> }> = [];
  const environment: Record<string, string | undefined> = {
    OUTBOX_WORKER_SECRET: fixtureWorkerSecret,
    SUPABASE_URL: "https://supabase.example.test",
    SUPABASE_SERVICE_ROLE_KEY: fixtureServiceRoleKey,
    ...options?.env,
  };
  const defaultRpc: Rpc = async () => ({ data: [], error: null });
  const rpc = options?.rpc ?? defaultRpc;
  const dependencies: OutboxWorkerHandlerDependencies = {
    getEnv: (name) => environment[name],
    readBody: async () => options?.body ?? { ok: true, text: "{}" },
    createClient: () => ({
      rpc: async (procedure, parameters) => {
        calls.push({ procedure, parameters });
        return rpc(procedure, parameters);
      },
    }),
    createId: () => "deterministic-test-worker",
    logError: (message, context) => errors.push({ message, context }),
  };
  return {
    handler: createOutboxWorkerHandler(dependencies),
    calls,
    errors,
  };
}

function authorizedRequest(body = "{}"): Request {
  return new Request("https://edge.example.test/outbox", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-outbox-worker-secret": fixtureWorkerSecret,
    },
    body,
  });
}

async function responseBody(response: Response): Promise<unknown> {
  const value: unknown = await response.json();
  return value;
}

function createBatchExecutionRpc(events: string[]): Rpc {
  return async (
    procedure: Parameters<Rpc>[0],
    parameters: Parameters<Rpc>[1],
  ) => {
    if (procedure === "claim_outbox_events") {
      return { data: events.map((id) => ({ id })), error: null };
    }
    if (procedure !== "process_outbox_event") return { data: null, error: null };

    const id = parameters.p_event_id;
    if (id === "processed-event") return { data: { status: "processed" }, error: null };
    if (id === "retry-event") return { data: { status: "retry" }, error: null };
    return { data: { status: "dead_letter" }, error: null };
  };
}

describe("outbox worker HTTP boundary", () => {
  it("rejects non-POST methods before reading credentials or claiming work", async () => {
    const harness = createHarness();
    const response = await harness.handler(new Request("https://edge.example.test/outbox"));
    expect(response.status).toBe(405);
    expect(await responseBody(response)).toEqual({ error: "method_not_allowed" });
    expect(harness.calls).toHaveLength(0);
  });

  it("rejects missing and incorrect worker secrets without creating a client", async () => {
    const harness = createHarness();
    const response = await harness.handler(new Request("https://edge.example.test/outbox", {
      method: "POST",
      headers: { "x-outbox-worker-secret": fixtureInvalidWorkerSecret },
      body: "{}",
    }));
    expect(response.status).toBe(401);
    expect(await responseBody(response)).toEqual({ error: "unauthorized" });
    expect(harness.calls).toHaveLength(0);
  });

  it("fails closed when Supabase service configuration is incomplete", async () => {
    const harness = createHarness({ env: { SUPABASE_SERVICE_ROLE_KEY: undefined } });
    const response = await harness.handler(authorizedRequest());
    expect(response.status).toBe(503);
    expect(await responseBody(response)).toEqual({ error: "worker_not_configured" });
    expect(harness.calls).toHaveLength(0);
  });

  it.each([
    [{ ok: false, reason: "too_large" }, 413, "request_too_large"],
    [{ ok: false, reason: "invalid_utf8" }, 400, "invalid_json"],
    [{ ok: false, reason: "unreadable" }, 400, "invalid_request"],
  ] as const)("maps bounded-body failures without claiming events: %j", async (body, status, error) => {
    const harness = createHarness({ body: body as BoundedTextBodyResult });
    const response = await harness.handler(authorizedRequest());
    expect(response.status).toBe(status);
    expect(await responseBody(response)).toEqual({ error });
    expect(harness.calls).toHaveLength(0);
  });

  it("rejects malformed JSON and out-of-range batch sizes", async () => {
    const malformed = createHarness({ body: { ok: true, text: "{" } });
    const malformedResponse = await malformed.handler(authorizedRequest("{"));
    expect(malformedResponse.status).toBe(400);
    expect(await responseBody(malformedResponse)).toEqual({ error: "invalid_json" });
    expect(malformed.calls).toHaveLength(0);

    const invalidSize = createHarness({ body: { ok: true, text: '{"batch_size":51}' } });
    const sizeResponse = await invalidSize.handler(authorizedRequest('{"batch_size":51}'));
    expect(sizeResponse.status).toBe(400);
    expect(await responseBody(sizeResponse)).toEqual({
      error: "batch_size_must_be_between_1_and_50",
    });
    expect(invalidSize.calls).toHaveLength(0);
  });
});

describe("outbox worker batch execution", () => {
  it("uses the default batch size and preserves sequential terminal outcome counts", async () => {
    const events = ["processed-event", "retry-event", "dead-event"];
    const harness = createHarness({ rpc: createBatchExecutionRpc(events) });

    const response = await harness.handler(authorizedRequest(""));
    expect(response.status).toBe(200);
    expect(await responseBody(response)).toEqual({
      worker_id: "edge-outbox:deterministic-test-worker",
      claimed: 3,
      processed: 1,
      retry_scheduled: 1,
      dead_lettered: 1,
      failures: 0,
    });
    expect(harness.calls.map((call) => call.procedure)).toEqual([
      "claim_outbox_events",
      "process_outbox_event",
      "process_outbox_event",
      "process_outbox_event",
    ]);
    expect(harness.calls[0].parameters).toEqual({
      p_worker: "edge-outbox:deterministic-test-worker",
      p_limit: 20,
      p_lease_seconds: 300,
    });
  });

  it("records an unexpected processing result with a redacted error and does not count it as success", async () => {
    const harness = createHarness({
      rpc: async (procedure) => {
        if (procedure === "claim_outbox_events") return { data: [{ id: "event-1" }], error: null };
        if (procedure === "process_outbox_event") {
          return {
            data: null,
            error: {
              code: "P0001",
              message: "failed for buyer@example.com Bearer secret-token api_key=provider-secret",
            },
          };
        }
        return { data: { status: "retry" }, error: null };
      },
    });

    const response = await harness.handler(authorizedRequest());
    expect(response.status).toBe(200);
    expect(await responseBody(response)).toMatchObject({
      claimed: 1,
      processed: 0,
      retry_scheduled: 1,
      failures: 0,
    });
    const failureCall = harness.calls.find((call) => call.procedure === "fail_outbox_event");
    expect(failureCall?.parameters.p_error_class).toBe("P0001");
    const safeMessage = String(failureCall?.parameters.p_error_message);
    expect(safeMessage).toContain("[email redacted]");
    expect(safeMessage).not.toContain("buyer@example.com");
    expect(safeMessage).not.toContain("secret-token");
    expect(safeMessage).not.toContain("provider-secret");
  });

  it("reports failure when persistence of an unexpected result fails", async () => {
    const harness = createHarness({
      rpc: async (procedure) => {
        if (procedure === "claim_outbox_events") return { data: [{ id: "event-1" }], error: null };
        if (procedure === "process_outbox_event") return { data: {}, error: null };
        return { data: null, error: { code: "DB_WRITE_FAILED" } };
      },
    });

    const response = await harness.handler(authorizedRequest());
    expect(await responseBody(response)).toMatchObject({
      claimed: 1,
      processed: 0,
      failures: 1,
    });
    expect(harness.errors.some((entry) => entry.message === "outbox failure could not be persisted"))
      .toBe(true);
  });

  it("does not report an unrecognized failure-recorder payload as success", async () => {
    const harness = createHarness({
      rpc: async (procedure) => {
        if (procedure === "claim_outbox_events") return { data: [{ id: "event-1" }], error: null };
        if (procedure === "process_outbox_event") return { data: {}, error: null };
        return { data: { status: "unknown" }, error: null };
      },
    });

    const response = await harness.handler(authorizedRequest());
    expect(await responseBody(response)).toMatchObject({
      claimed: 1,
      processed: 0,
      failures: 1,
    });
    expect(harness.errors.some((entry) =>
      entry.message === "outbox failure recorder returned an unrecognized status",
    )).toBe(true);
  });

  it("returns a non-success response and logs a claim error without processing events", async () => {
    const harness = createHarness({
      rpc: async () => ({ data: null, error: { code: "CLAIM_FAILED" } }),
    });
    const response = await harness.handler(authorizedRequest());
    expect(response.status).toBe(500);
    expect(await responseBody(response)).toEqual({ error: "claim_failed" });
    expect(harness.errors).toEqual([{
      message: "outbox claim failed",
      context: { code: "CLAIM_FAILED" },
    }]);
  });
});
