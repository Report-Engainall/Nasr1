import { describe, expect, it } from "vitest";
import {
  adminRecordContextStorageKey,
  readAdminRecordContext,
  writeAdminRecordContext,
  type AdminRecordContextStorage,
  type AdminRecordContextData,
} from "./admin-record-context";

class MemoryStorage implements AdminRecordContextStorage {
  private readonly entries = new Map<string, string>();
  getItem(key: string) { return this.entries.get(key) ?? null; }
  setItem(key: string, value: string) { this.entries.set(key, value); }
  removeItem(key: string) { this.entries.delete(key); }
}

const ALLOWED_VIEWS = ["orders", "customers", "finance"];
const NOW = Date.parse("2026-11-10T12:00:00.000Z");

function context(overrides: Partial<AdminRecordContextData> = {}): AdminRecordContextData {
  return {
    kind: "order",
    id: "order-123",
    title: "طلب عميل",
    subtitle: "طلب للمراجعة",
    route: "/admin/orders",
    query: "order-123",
    savedAt: NOW - 60_000,
    returnToView: "customers",
    returnToOrderDetailId: "order-123",
    ...overrides,
  };
}

describe("admin record context identity scope", () => {
  it("creates a stable namespace for the same user/profile and a distinct one for every identity boundary", () => {
    const first = adminRecordContextStorageKey("user-a", "profile-a");
    expect(adminRecordContextStorageKey("user-a", "profile-a")).toBe(first);
    expect(adminRecordContextStorageKey("user-b", "profile-b")).not.toBe(first);
    expect(adminRecordContextStorageKey("user-a", "profile-b")).not.toBe(first);
    expect(adminRecordContextStorageKey("user-b", "profile-a")).not.toBe(first);
  });

  it("restores a user's own context but never returns it under another user's key", () => {
    const storage = new MemoryStorage();
    const userAKey = adminRecordContextStorageKey("user-a", "profile-a");
    const userBKey = adminRecordContextStorageKey("user-b", "profile-b");
    writeAdminRecordContext(storage, userAKey, context());

    expect(readAdminRecordContext(storage, userAKey, ALLOWED_VIEWS, NOW)).toMatchObject({
      id: "order-123",
      returnToView: "customers",
    });
    expect(readAdminRecordContext(storage, userBKey, ALLOWED_VIEWS, NOW)).toBeNull();
    expect(storage.getItem(userAKey)).not.toBeNull();
  });

  it("removes malformed, expired and future-dated context before it can be restored", () => {
    const storage = new MemoryStorage();
    const key = adminRecordContextStorageKey("user-a", "profile-a");

    storage.setItem(key, "{broken");
    expect(readAdminRecordContext(storage, key, ALLOWED_VIEWS, NOW)).toBeNull();
    expect(storage.getItem(key)).toBeNull();

    storage.setItem(key, JSON.stringify(context({ savedAt: NOW - 4 * 60 * 60 * 1000 - 1 })));
    expect(readAdminRecordContext(storage, key, ALLOWED_VIEWS, NOW)).toBeNull();
    expect(storage.getItem(key)).toBeNull();

    storage.setItem(key, JSON.stringify(context({ savedAt: NOW + 1 })));
    expect(readAdminRecordContext(storage, key, ALLOWED_VIEWS, NOW)).toBeNull();
    expect(storage.getItem(key)).toBeNull();
  });

  it("drops a return destination that is no longer a registered admin view", () => {
    const storage = new MemoryStorage();
    const key = adminRecordContextStorageKey("user-a", "profile-a");
    writeAdminRecordContext(storage, key, context({ returnToView: "retired-view" }));

    expect(readAdminRecordContext(storage, key, ALLOWED_VIEWS, NOW)).toMatchObject({
      id: "order-123",
      returnToView: null,
    });
  });

  it("removes only the active identity's entry when its context is cleared", () => {
    const storage = new MemoryStorage();
    const userAKey = adminRecordContextStorageKey("user-a", "profile-a");
    const userBKey = adminRecordContextStorageKey("user-b", "profile-b");
    writeAdminRecordContext(storage, userAKey, context());
    writeAdminRecordContext(storage, userBKey, context({ id: "order-456" }));

    writeAdminRecordContext(storage, userAKey, null);

    expect(storage.getItem(userAKey)).toBeNull();
    expect(readAdminRecordContext(storage, userBKey, ALLOWED_VIEWS, NOW)?.id).toBe("order-456");
  });
});
