// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";

const rpc = vi.hoisted(() => vi.fn());
vi.mock("@/lib/supabase", () => ({ supabase: { rpc } }));

import { reportRuntimeError } from "./runtime-error-reporting";

beforeEach(() => {
  rpc.mockReset();
  rpc.mockResolvedValue({ data: { recorded: true }, error: null });
  vi.useRealTimers();
});

describe("privacy-minimized runtime error reporting", () => {
  it("sends only allowlisted metadata and excludes message, stack and arbitrary context", async () => {
    const error = new TypeError("Bearer private-token customer@example.test");
    reportRuntimeError(error, { boundary: "tanstack_root_error_component" });
    await Promise.resolve();
    expect(rpc).toHaveBeenCalledWith("record_runtime_error_event", {
      p_error_kind: "type_error",
      p_http_status: null,
      p_boundary: "tanstack_root_error_component",
    });
    const payload = JSON.stringify(rpc.mock.calls);
    expect(payload).not.toContain("private-token");
    expect(payload).not.toContain("customer@example.test");
  });

  it("maps HTTP response status only within the supported 4xx/5xx range", async () => {
    reportRuntimeError(new Response(null, { status: 503 }), { boundary: "window_error" });
    await Promise.resolve();
    expect(rpc).toHaveBeenCalledWith("record_runtime_error_event", {
      p_error_kind: "response_error", p_http_status: 503, p_boundary: "window_error",
    });
  });

  it("drops unsupported boundaries and deduplicates repeated equivalent events", async () => {
    const error = new Error("private A");
    reportRuntimeError(error, { boundary: "unknown" });
    reportRuntimeError(new Error("private B"), { boundary: "unknown" });
    await Promise.resolve();
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc.mock.calls[0]?.[1]).toMatchObject({ p_boundary: "unknown", p_error_kind: "error" });
  });

  it("does not throw into the application when persistence is unavailable", async () => {
    rpc.mockRejectedValue(new Error("private database failure"));
    expect(() => reportRuntimeError(new Error("private runtime error"))).not.toThrow();
    await Promise.resolve();
  });
});
