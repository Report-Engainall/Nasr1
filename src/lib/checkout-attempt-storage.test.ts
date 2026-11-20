import { describe, expect, it } from "vitest";
import { persistCheckoutAttempt, type CheckoutAttemptStorage } from "./checkout-attempt-storage";

const attempt = { signature: '{"profile_id":"customer-1","items":[{"id":"product-1","quantity":2}]}', key: "k".repeat(32) };

function memoryStorage(initial: Record<string, string> = {}): CheckoutAttemptStorage {
  const values = new Map(Object.entries(initial));
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => { values.set(key, value); },
  };
}

describe("persistCheckoutAttempt", () => {
  it("writes and verifies the profile-scoped request key before sending", () => {
    const storage = memoryStorage();
    expect(persistCheckoutAttempt(storage, "checkout:customer-1", attempt)).toBe(true);
    expect(JSON.parse(storage.getItem("checkout:customer-1")!)).toEqual(attempt);
    expect(persistCheckoutAttempt(storage, "checkout:customer-1", attempt)).toBe(true);
  });

  it("fails closed when browser storage is unavailable", () => {
    const unavailable: CheckoutAttemptStorage = {
      getItem: () => { throw new Error("storage blocked"); },
      setItem: () => { throw new Error("storage blocked"); },
    };
    expect(persistCheckoutAttempt(unavailable, "checkout:customer-1", attempt)).toBe(false);
  });

  it("fails when a browser accepts a write but cannot return the persisted key", () => {
    const writeOnly: CheckoutAttemptStorage = {
      getItem: () => null,
      setItem: () => undefined,
    };
    expect(persistCheckoutAttempt(writeOnly, "checkout:customer-1", attempt)).toBe(false);
  });

  it("never overwrites a different or malformed unresolved attempt", () => {
    const conflict = memoryStorage({
      "checkout:customer-1": JSON.stringify({ ...attempt, key: "x".repeat(32) }),
    });
    const malformed = memoryStorage({ "checkout:customer-1": "{not-json" });
    expect(persistCheckoutAttempt(conflict, "checkout:customer-1", attempt)).toBe(false);
    expect(persistCheckoutAttempt(malformed, "checkout:customer-1", attempt)).toBe(false);
  });

  it("rejects missing signatures and malformed idempotency keys", () => {
    const storage = memoryStorage();
    expect(persistCheckoutAttempt(storage, "checkout:customer-1", { signature: "", key: attempt.key })).toBe(false);
    expect(persistCheckoutAttempt(storage, "checkout:customer-1", { signature: attempt.signature, key: "short" })).toBe(false);
    expect(storage.getItem("checkout:customer-1")).toBeNull();
  });
});
