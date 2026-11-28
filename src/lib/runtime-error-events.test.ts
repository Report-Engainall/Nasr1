import { beforeEach, describe, expect, it, vi } from "vitest";

const rpc = vi.hoisted(() => vi.fn());
vi.mock("@/lib/supabase", () => ({ supabase: { rpc } }));

import {
  fetchAdminRuntimeErrorEvents,
  transitionAdminRuntimeErrorEvent,
} from "./runtime-error-events";

const id = "11111111-1111-4111-8111-111111111111";
const now = "2026-11-16T00:00:00.000Z";
const event = {
  id,
  error_kind: "type_error",
  http_status: 503,
  boundary: "window_error",
  source: "browser",
  status: "open",
  occurrence_count: 2,
  created_at: now,
  last_seen_at: now,
  acknowledged_at: null,
  resolved_at: null,
};

beforeEach(() => rpc.mockReset());

describe("runtime error events client", () => {
  it("parses only the bounded privacy-minimized event projection", async () => {
    rpc.mockResolvedValue({
      data: { items: [event], total: 1, limit: 50, offset: 0, read_at: now },
      error: null,
    });
    const result = await fetchAdminRuntimeErrorEvents();
    expect(result.items).toEqual([event]);
    expect(rpc).toHaveBeenCalledWith("list_runtime_error_events", {
      p_status: null, p_limit: 50, p_offset: 0,
    });
  });

  it("rejects malformed rows and never returns partial untrusted data", async () => {
    rpc.mockResolvedValue({
      data: { items: [{ ...event, raw_message: "customer@example.test", id: "not-a-uuid" }], total: 1, limit: 50, offset: 0, read_at: now },
      error: null,
    });
    await expect(fetchAdminRuntimeErrorEvents()).rejects.toThrow("سجلاً غير صالح");
  });

  it("validates pagination and status before calling the source", async () => {
    await expect(fetchAdminRuntimeErrorEvents({ limit: 101 })).rejects.toThrow("حدود قراءة");
    await expect(fetchAdminRuntimeErrorEvents({ status: "deleted" as never })).rejects.toThrow("مرشح حالة");
    expect(rpc).not.toHaveBeenCalled();
  });

  it("accepts a confirmed transition and refuses a malformed server response", async () => {
    rpc.mockResolvedValueOnce({ data: { event_id: id, status: "acknowledged", changed: true }, error: null });
    await expect(transitionAdminRuntimeErrorEvent(id, "acknowledged")).resolves.toEqual({
      event_id: id, status: "acknowledged", changed: true,
    });
    rpc.mockResolvedValueOnce({ data: { event_id: id, status: "resolved", changed: true }, error: null });
    await expect(transitionAdminRuntimeErrorEvent(id, "acknowledged")).rejects.toThrow("تعذر حفظ إجراء");
  });

  it("does not pass invalid event identifiers to the database", async () => {
    await expect(transitionAdminRuntimeErrorEvent("bad-id", "resolved")).rejects.toThrow("غير صالحة");
    expect(rpc).not.toHaveBeenCalled();
  });
});
