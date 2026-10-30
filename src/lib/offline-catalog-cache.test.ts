import { beforeEach, describe, expect, it } from "vitest";
import {
  clearLegacyOfflineCatalogCache,
  clearOfflineCatalogCache,
  LEGACY_OFFLINE_CATALOG_KEY,
  LEGACY_OFFLINE_CATALOG_SYNC_KEY,
  offlineCatalogCacheKeys,
  offlineCatalogScopeFingerprint,
  reconcileOfflineCatalogScope,
} from "@/lib/offline-catalog-cache";

const SCOPE_A = {
  profileId: "customer-a",
  organizationId: "org-a",
  warehouseId: "warehouse-a",
  isStaff: false,
};

describe("profile- and tenant-scoped offline catalog cache", () => {
  beforeEach(() => window.localStorage.clear());

  it("uses separate namespaces for authenticated profiles and refuses anonymous scope", () => {
    const customerA = offlineCatalogCacheKeys("customer-a");
    const customerB = offlineCatalogCacheKeys("customer-b");

    expect(offlineCatalogCacheKeys(null)).toBeNull();
    expect(offlineCatalogCacheKeys("   ")).toBeNull();
    expect(customerA).not.toBeNull();
    expect(customerB).not.toBeNull();
    expect(customerA?.catalogKey).not.toBe(customerB?.catalogKey);
    expect(customerA?.lastServerSyncKey).not.toBe(customerB?.lastServerSyncKey);
    expect(customerA?.catalogKey).toContain(encodeURIComponent("customer-a"));
  });

  it("clears only the profile whose authentication scope ended", () => {
    const customerA = offlineCatalogCacheKeys("customer-a")!;
    const customerB = offlineCatalogCacheKeys("customer-b")!;
    window.localStorage.setItem(customerA.catalogKey, "A");
    window.localStorage.setItem(customerA.lastServerSyncKey, "A-time");
    window.localStorage.setItem(customerA.scopeKey, "A-scope");
    window.localStorage.setItem(customerB.catalogKey, "B");
    window.localStorage.setItem(customerB.lastServerSyncKey, "B-time");
    window.localStorage.setItem(customerB.scopeKey, "B-scope");

    clearOfflineCatalogCache(window.localStorage, "customer-a");

    expect(window.localStorage.getItem(customerA.catalogKey)).toBeNull();
    expect(window.localStorage.getItem(customerA.lastServerSyncKey)).toBeNull();
    expect(window.localStorage.getItem(customerA.scopeKey)).toBeNull();
    expect(window.localStorage.getItem(customerB.catalogKey)).toBe("B");
    expect(window.localStorage.getItem(customerB.lastServerSyncKey)).toBe("B-time");
    expect(window.localStorage.getItem(customerB.scopeKey)).toBe("B-scope");
  });

  it("uses a stable scope marker and invalidates rows after organization or warehouse changes", () => {
    const keys = offlineCatalogCacheKeys(SCOPE_A.profileId)!;
    const fingerprint = offlineCatalogScopeFingerprint(SCOPE_A);
    window.localStorage.setItem(keys.scopeKey, fingerprint);
    window.localStorage.setItem(keys.catalogKey, "tenant-a-products");
    window.localStorage.setItem(keys.lastServerSyncKey, "tenant-a-time");

    expect(offlineCatalogScopeFingerprint(SCOPE_A)).toBe(fingerprint);
    expect(fingerprint).not.toContain(SCOPE_A.organizationId);
    expect(reconcileOfflineCatalogScope(window.localStorage, SCOPE_A)).toBe(true);

    const changedScope = { ...SCOPE_A, warehouseId: "warehouse-b" };
    expect(reconcileOfflineCatalogScope(window.localStorage, changedScope)).toBe(false);
    expect(window.localStorage.getItem(keys.catalogKey)).toBeNull();
    expect(window.localStorage.getItem(keys.lastServerSyncKey)).toBeNull();
    expect(window.localStorage.getItem(keys.scopeKey)).toBe(
      offlineCatalogScopeFingerprint(changedScope),
    );
  });

  it("rejects a missing scope marker instead of trusting old cached rows", () => {
    const keys = offlineCatalogCacheKeys(SCOPE_A.profileId)!;
    window.localStorage.setItem(keys.catalogKey, "unverified-rows");

    expect(reconcileOfflineCatalogScope(window.localStorage, SCOPE_A)).toBe(false);
    expect(window.localStorage.getItem(keys.catalogKey)).toBeNull();
    expect(window.localStorage.getItem(keys.scopeKey)).toBe(
      offlineCatalogScopeFingerprint(SCOPE_A),
    );
  });

  it("retires both legacy unscoped catalog keys", () => {
    window.localStorage.setItem(LEGACY_OFFLINE_CATALOG_KEY, "unscoped-catalog");
    window.localStorage.setItem(LEGACY_OFFLINE_CATALOG_SYNC_KEY, "unscoped-time");

    clearLegacyOfflineCatalogCache(window.localStorage);

    expect(window.localStorage.getItem(LEGACY_OFFLINE_CATALOG_KEY)).toBeNull();
    expect(window.localStorage.getItem(LEGACY_OFFLINE_CATALOG_SYNC_KEY)).toBeNull();
  });
});
