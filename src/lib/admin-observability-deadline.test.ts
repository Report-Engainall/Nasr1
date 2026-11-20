import { afterEach, describe, expect, it, vi } from "vitest";
import {
  AdminObservabilityTimeoutError,
  withAdminObservabilityTimeout,
} from "@/lib/admin-observability-deadline";

afterEach(() => {
  vi.useRealTimers();
});

describe("withAdminObservabilityTimeout", () => {
  it("returns a successful source result and clears its deadline timer", async () => {
    vi.useFakeTimers();
    const operation = vi.fn().mockResolvedValue({ status: "READABLE" });

    await expect(withAdminObservabilityTimeout(operation, 250)).resolves.toEqual({
      status: "READABLE",
    });

    expect(operation).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("propagates the original source error and clears its deadline timer", async () => {
    vi.useFakeTimers();
    const failure = new Error("source read failed");
    const operation = vi.fn().mockRejectedValue(failure);

    await expect(withAdminObservabilityTimeout(operation, 250)).rejects.toBe(failure);

    expect(operation).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("rejects with the typed timeout only after the configured deadline", async () => {
    vi.useFakeTimers();
    const operation = vi.fn(() => new Promise<never>(() => {}));
    const pending = withAdminObservabilityTimeout(operation, 250);
    const rejected = expect(pending).rejects.toMatchObject({
      name: "AdminObservabilityTimeoutError",
      timeoutMs: 250,
    });

    await vi.advanceTimersByTimeAsync(249);
    expect(operation).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    await rejected;

    expect(vi.getTimerCount()).toBe(0);
  });

  it.each([0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, Number.MAX_SAFE_INTEGER + 1])(
    "rejects invalid timeout %s before starting the operation",
    async (timeoutMs) => {
      vi.useFakeTimers();
      const operation = vi.fn().mockResolvedValue("must not run");

      await expect(withAdminObservabilityTimeout(operation, timeoutMs)).rejects.toBeInstanceOf(RangeError);

      expect(operation).not.toHaveBeenCalled();
      expect(vi.getTimerCount()).toBe(0);
    },
  );

  it("exposes the configured duration on the timeout error", async () => {
    vi.useFakeTimers();
    const pending = withAdminObservabilityTimeout(() => new Promise<never>(() => {}), 73);
    const rejected = expect(pending).rejects.toBeInstanceOf(AdminObservabilityTimeoutError);

    await vi.advanceTimersByTimeAsync(73);
    await rejected;
  });
});
