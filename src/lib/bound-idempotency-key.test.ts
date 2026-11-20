import { describe, expect, it, vi } from "vitest";
import { getOrCreateBoundIdempotencyKey } from "./bound-idempotency-key";

describe("getOrCreateBoundIdempotencyKey", () => {
  it("reuses a key for an exact retry of the same payload", () => {
    const createKey = vi.fn(() => "a".repeat(32));
    const first = getOrCreateBoundIdempotencyKey(null, '{"orderId":"1","reason":"wrong item"}', createKey);
    const retry = getOrCreateBoundIdempotencyKey(first, '{"orderId":"1","reason":"wrong item"}', createKey);

    expect(retry).toBe(first);
    expect(createKey).toHaveBeenCalledTimes(1);
  });

  it("creates a fresh key when the order or cancellation reason changes", () => {
    const first = getOrCreateBoundIdempotencyKey(null, '{"orderId":"1","reason":"wrong item"}', () => "a".repeat(32));
    const next = getOrCreateBoundIdempotencyKey(first, '{"orderId":"1","reason":"changed quantity"}', () => "b".repeat(32));

    expect(next).toEqual({
      fingerprint: '{"orderId":"1","reason":"changed quantity"}',
      key: "b".repeat(32),
    });
    expect(next.key).not.toBe(first.key);
  });

  it("rejects an empty fingerprint and malformed generated key", () => {
    expect(() => getOrCreateBoundIdempotencyKey(null, " ", () => "c".repeat(32))).toThrow(/fingerprint/i);
    expect(() => getOrCreateBoundIdempotencyKey(null, "payload", () => "short")).toThrow(/idempotency key/i);
  });
});
