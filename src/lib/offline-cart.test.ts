import { describe, expect, it } from 'vitest';
import {
  GUEST_CART_STORAGE_KEY,
  loadOfflineCartDraft,
  offlineCartStorageKey,
  saveOfflineCartDraft,
} from './offline-cart';

const PROFILE_A = 'a1000000-0000-0000-0000-000000000001';
const PROFILE_B = 'b1000000-0000-0000-0000-000000000001';
const USER_A = 'a2000000-0000-0000-0000-000000000001';
const USER_B = 'b2000000-0000-0000-0000-000000000001';
const PRODUCT_A = 'c1000000-0000-0000-0000-000000000001';
const PRODUCT_B = 'd1000000-0000-0000-0000-000000000001';

function memoryStorage(initial: Record<string, string> = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); },
    removeItem: (key: string) => { values.delete(key); },
    has: (key: string) => values.has(key),
  };
}

const draft = (productId: string, quantity: number) => [{ product_id: productId, quantity }];

describe('offline cart identity scope', () => {
  it('preserves the profile-scoped key for mapped customers', () => {
    expect(offlineCartStorageKey(PROFILE_A, USER_A))
      .toBe(`aghbari:cart:v2:customer:${encodeURIComponent(PROFILE_A)}`);
  });

  it('uses distinct authenticated namespaces when profile mapping is absent', () => {
    const userAKey = offlineCartStorageKey(null, USER_A);
    const userBKey = offlineCartStorageKey(null, USER_B);

    expect(userAKey).not.toBe(GUEST_CART_STORAGE_KEY);
    expect(userBKey).not.toBe(GUEST_CART_STORAGE_KEY);
    expect(userAKey).not.toBe(userBKey);
    expect(userAKey).toBe(`aghbari:cart:v2:auth-user:${USER_A}`);
  });

  it('does not read, claim, or consume guest and legacy drafts for an unmapped authenticated account', () => {
    const guestDraft = JSON.stringify(draft(PRODUCT_A, 2));
    const legacyDraft = JSON.stringify(draft(PRODUCT_B, 3));
    const storage = memoryStorage({
      [GUEST_CART_STORAGE_KEY]: guestDraft,
      'aghbari:cart:v1': legacyDraft,
      'aghbari:cart-restore:v1': legacyDraft,
    });

    expect(loadOfflineCartDraft(storage, null, USER_A)).toEqual([]);
    expect(storage.getItem(GUEST_CART_STORAGE_KEY)).toBe(guestDraft);
    expect(storage.getItem('aghbari:cart:v1')).toBe(legacyDraft);
    expect(storage.getItem('aghbari:cart-restore:v1')).toBe(legacyDraft);
  });

  it('restores and saves only the active authenticated identity draft', () => {
    const storage = memoryStorage();
    expect(saveOfflineCartDraft(storage, null, draft(PRODUCT_A, 4), USER_A)).toBe(true);
    expect(saveOfflineCartDraft(storage, null, draft(PRODUCT_B, 7), USER_B)).toBe(true);

    expect(loadOfflineCartDraft(storage, null, USER_A)).toEqual(draft(PRODUCT_A, 4));
    expect(loadOfflineCartDraft(storage, null, USER_B)).toEqual(draft(PRODUCT_B, 7));
    expect(loadOfflineCartDraft(storage, null, null)).toEqual([]);
  });

  it('retains one-time guest-cart claiming for a customer with a profile', () => {
    const guestDraft = draft(PRODUCT_A, 5);
    const storage = memoryStorage({
      [GUEST_CART_STORAGE_KEY]: JSON.stringify(guestDraft),
    });

    expect(loadOfflineCartDraft(storage, PROFILE_A, USER_A)).toEqual(guestDraft);
    expect(storage.has(GUEST_CART_STORAGE_KEY)).toBe(false);
    expect(storage.getItem(offlineCartStorageKey(PROFILE_A, USER_A))).toBe(JSON.stringify(guestDraft));
    expect(loadOfflineCartDraft(storage, PROFILE_B, USER_B)).toEqual([]);
  });

  it('retains the guest key for anonymous visitors', () => {
    const storage = memoryStorage();
    expect(offlineCartStorageKey(null, null)).toBe(GUEST_CART_STORAGE_KEY);
    expect(saveOfflineCartDraft(storage, null, draft(PRODUCT_A, 1))).toBe(true);
    expect(loadOfflineCartDraft(storage, null, null)).toEqual(draft(PRODUCT_A, 1));
  });
});
