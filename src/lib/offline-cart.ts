import { normalizeCartDraft, type CartLineDraft } from '@/lib/commerce-utils';

export const GUEST_CART_STORAGE_KEY = 'aghbari:cart:v2:guest';
const AUTH_USER_CART_STORAGE_PREFIX = 'aghbari:cart:v2:auth-user:';
const LEGACY_CART_STORAGE_KEY = 'aghbari:cart:v1';
const LEGACY_CART_RESTORE_KEY = 'aghbari:cart-restore:v1';

export type OfflineCartStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

/** A cart draft is identity-scoped; local storage never holds authoritative prices or order totals. */
export function offlineCartStorageKey(profileId?: string | null, authUserId?: string | null): string {
  const profile = profileId?.trim();
  if (profile) return `aghbari:cart:v2:customer:${encodeURIComponent(profile)}`;

  const authUser = authUserId?.trim();
  return authUser
    ? `${AUTH_USER_CART_STORAGE_PREFIX}${encodeURIComponent(authUser)}`
    : GUEST_CART_STORAGE_KEY;
}

function parseDraft(raw: string | null): CartLineDraft[] {
  if (raw === null) return [];
  try {
    return normalizeCartDraft(JSON.parse(raw) as unknown);
  } catch {
    return [];
  }
}

function mergeDrafts(...drafts: CartLineDraft[][]): CartLineDraft[] {
  const quantities = new Map<string, number>();
  for (const draft of drafts) {
    for (const line of draft) {
      quantities.set(line.product_id, Math.min(10000, (quantities.get(line.product_id) ?? 0) + line.quantity));
    }
  }
  return [...quantities.entries()].map(([product_id, quantity]) => ({ product_id, quantity }));
}

function removeQuietly(storage: OfflineCartStorage, key: string): void {
  try { storage.removeItem(key); } catch { /* storage can be disabled by the browser */ }
}

function writeQuietly(storage: OfflineCartStorage, key: string, lines: CartLineDraft[]): boolean {
  try {
    storage.setItem(key, JSON.stringify(normalizeCartDraft(lines)));
    return true;
  } catch {
    return false;
  }
}

/**
 * Load a local cart draft for the current customer.
 *
 * Older builds used one global key. It is only migrated to the anonymous guest scope,
 * never straight into an authenticated profile. When a user signs in, a guest draft may
 * be claimed once if that profile has no saved cart. A draft belonging to another profile
 * is never read or merged.
 */
export function loadOfflineCartDraft(
  storage: OfflineCartStorage,
  profileId?: string | null,
  authUserId?: string | null,
): CartLineDraft[] {
  const key = offlineCartStorageKey(profileId, authUserId);
  const hasProfile = Boolean(profileId?.trim());
  const isGuest = !hasProfile && !authUserId?.trim();

  let currentRaw: string | null;
  try { currentRaw = storage.getItem(key); } catch { return []; }

  if (!isGuest) {
    // An authenticated identity without a profile mapping must not read or claim
    // the anonymous cart (nor consume its unscoped legacy restore queue).
    if (!hasProfile) return parseDraft(currentRaw);

    // Retire unscoped legacy data rather than accidentally associate it with this customer.
    removeQuietly(storage, LEGACY_CART_STORAGE_KEY);
    removeQuietly(storage, LEGACY_CART_RESTORE_KEY);

    // Even an explicitly saved empty cart takes precedence over the guest cart.
    if (currentRaw !== null) return parseDraft(currentRaw);

    let guestRaw: string | null;
    try { guestRaw = storage.getItem(GUEST_CART_STORAGE_KEY); } catch { return []; }
    if (guestRaw === null) return [];

    const guestDraft = parseDraft(guestRaw);
    if (guestDraft.length === 0) {
      removeQuietly(storage, GUEST_CART_STORAGE_KEY);
      return [];
    }
    // A mapped customer may claim a guest cart once; do not remove it until
    // the profile-scoped copy has been written successfully.
    if (writeQuietly(storage, key, guestDraft)) removeQuietly(storage, GUEST_CART_STORAGE_KEY);
    return guestDraft;
  }

  // For guests, merge the scoped draft with the one-time legacy restore queue.
  const legacyRaw = currentRaw === null
    ? (() => { try { return storage.getItem(LEGACY_CART_STORAGE_KEY); } catch { return null; } })()
    : null;
  const base = parseDraft(currentRaw ?? legacyRaw);
  let restoreRaw: string | null = null;
  try { restoreRaw = storage.getItem(LEGACY_CART_RESTORE_KEY); } catch { /* keep usable data */ }
  const merged = mergeDrafts(base, parseDraft(restoreRaw));

  const needsPersist = currentRaw === null || restoreRaw !== null;
  if (needsPersist && writeQuietly(storage, key, merged)) {
    if (legacyRaw !== null || currentRaw !== null) removeQuietly(storage, LEGACY_CART_STORAGE_KEY);
    if (restoreRaw !== null) removeQuietly(storage, LEGACY_CART_RESTORE_KEY);
  } else if (currentRaw !== null) {
    // Once a scoped draft exists, never let an older global draft reappear on a later logout.
    removeQuietly(storage, LEGACY_CART_STORAGE_KEY);
  }
  return merged;
}

/** Persist only validated product IDs and quantities; browser storage is never an order/price ledger. */
export function saveOfflineCartDraft(
  storage: OfflineCartStorage,
  profileId: string | null | undefined,
  lines: unknown,
  authUserId?: string | null,
): boolean {
  const normalized = normalizeCartDraft(lines);
  try {
    storage.setItem(offlineCartStorageKey(profileId, authUserId), JSON.stringify(normalized));
    return true;
  } catch {
    // Offline persistence is best-effort; server validation remains mandatory for checkout.
    return false;
  }
}

/** Merge explicit reorder/barcode additions into the current profile's cart without using global restore keys. */
export function mergeOfflineCartDraft(
  storage: OfflineCartStorage,
  profileId: string | null | undefined,
  additions: unknown,
  authUserId?: string | null,
): CartLineDraft[] | null {
  const existing = loadOfflineCartDraft(storage, profileId, authUserId);
  const merged = mergeDrafts(existing, normalizeCartDraft(additions));
  return saveOfflineCartDraft(storage, profileId, merged, authUserId) ? merged : null;
}
