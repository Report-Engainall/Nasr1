import { normalizeCartDraft, sanitizePublicCatalogCache, type CartLineDraft } from "@/lib/commerce-utils";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_DRAFT_LINES = 500;
const MAX_CACHED_PRODUCTS = 5000;

export type CommerceLocalKeys = {
  cart: string;
  cartRestore: string;
  offlineCartDraft: string | null;
  offlineCatalogSnapshot: string | null;
  offlineTenantHint: string | null;
};

export type OfflineCartDraft = {
  version: 1;
  user_id: string;
  organization_id: string;
  updated_at: string;
  items: CartLineDraft[];
};

export type OfflineCatalogSnapshot = {
  version: 1;
  user_id: string;
  organization_id: string;
  updated_at: string;
  products: ReturnType<typeof sanitizePublicCatalogCache>;
};

export type OfflineTenantHint = {
  version: 1;
  user_id: string;
  organization_id: string;
};

function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_PATTERN.test(value);
}

function isTimestamp(value: unknown): value is string {
  return typeof value === "string" && value.length <= 40 && Number.isFinite(Date.parse(value));
}

function normalizeOfflineLines(value: unknown): CartLineDraft[] {
  if (!Array.isArray(value)) return [];
  return normalizeCartDraft(value.slice(0, MAX_DRAFT_LINES))
    .filter((line) => isUuid(line.product_id))
    .slice(0, MAX_DRAFT_LINES);
}

/**
 * Authenticated browser data is namespaced per auth user. Guest shopping receives a separate
 * namespace and cannot see carts/drafts created during an authenticated session.
 */
export function getCommerceLocalKeys(userId: string | null | undefined): CommerceLocalKeys {
  if (!isUuid(userId)) {
    return {
      cart: "aghbari:cart:v2:guest",
      cartRestore: "aghbari:cart-restore:v2:guest",
      offlineCartDraft: null,
      offlineCatalogSnapshot: null,
      offlineTenantHint: null,
    };
  }

  const userKey = `user:${userId}`;
  return {
    cart: `aghbari:cart:v2:${userKey}`,
    cartRestore: `aghbari:cart-restore:v2:${userKey}`,
    offlineCartDraft: `aghbari:offline-cart-draft:v1:${userId}`,
    offlineCatalogSnapshot: `aghbari:offline-catalog:v1:${userId}`,
    offlineTenantHint: `aghbari:offline-tenant:v1:${userId}`,
  };
}

export function createOfflineTenantHint(
  userId: string,
  organizationId: string,
): OfflineTenantHint | null {
  if (!isUuid(userId) || !isUuid(organizationId)) return null;
  return { version: 1, user_id: userId, organization_id: organizationId };
}

export function parseOfflineTenantHint(
  value: unknown,
  expectedUserId: string,
): OfflineTenantHint | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  if (
    row.version !== 1 ||
    row.user_id !== expectedUserId ||
    !isUuid(expectedUserId) ||
    !isUuid(row.organization_id)
  ) return null;
  return { version: 1, user_id: expectedUserId, organization_id: row.organization_id };
}

export function createOfflineCartDraft(
  userId: string,
  organizationId: string,
  items: unknown,
  updatedAt = new Date().toISOString(),
): OfflineCartDraft | null {
  if (!isUuid(userId) || !isUuid(organizationId) || !isTimestamp(updatedAt)) return null;
  const normalizedItems = normalizeOfflineLines(items);
  if (!normalizedItems.length) return null;
  return {
    version: 1,
    user_id: userId,
    organization_id: organizationId,
    updated_at: updatedAt,
    items: normalizedItems,
  };
}

export function parseOfflineCartDraft(value: unknown, expectedUserId: string): OfflineCartDraft | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  if (
    row.version !== 1 ||
    row.user_id !== expectedUserId ||
    !isUuid(expectedUserId) ||
    !isUuid(row.organization_id) ||
    !isTimestamp(row.updated_at)
  ) return null;
  return createOfflineCartDraft(
    expectedUserId,
    row.organization_id,
    row.items,
    row.updated_at,
  );
}

export function offlineCartDraftMatchesScope(
  draft: OfflineCartDraft,
  userId: string,
  organizationId: string,
): boolean {
  return isUuid(userId) && isUuid(organizationId) &&
    draft.user_id === userId && draft.organization_id === organizationId;
}

export function createOfflineCatalogSnapshot(
  userId: string,
  organizationId: string,
  products: unknown,
  updatedAt = new Date().toISOString(),
): OfflineCatalogSnapshot | null {
  if (!isUuid(userId) || !isUuid(organizationId) || !isTimestamp(updatedAt)) return null;
  const safeProducts = sanitizePublicCatalogCache(
    Array.isArray(products) ? products.slice(0, MAX_CACHED_PRODUCTS) : [],
  );
  return {
    version: 1,
    user_id: userId,
    organization_id: organizationId,
    updated_at: updatedAt,
    products: safeProducts,
  };
}

export function parseOfflineCatalogSnapshot(
  value: unknown,
  expectedUserId: string,
): OfflineCatalogSnapshot | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  if (
    row.version !== 1 ||
    row.user_id !== expectedUserId ||
    !isUuid(expectedUserId) ||
    !isUuid(row.organization_id) ||
    !isTimestamp(row.updated_at) ||
    !Array.isArray(row.products)
  ) return null;
  return createOfflineCatalogSnapshot(
    expectedUserId,
    row.organization_id,
    row.products,
    row.updated_at,
  );
}
