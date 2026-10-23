import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock('@/lib/supabase', () => ({ supabase: { rpc: mocks.rpc } }));

import { fetchCustomerCart, normalizeCustomerCartLines, saveCustomerCart } from '@/lib/customer-cart';

const PRODUCT_A = 'a1000000-0000-0000-0000-000000000001';
const PRODUCT_B = 'a1000000-0000-0000-0000-000000000002';

describe('persistent customer cart contract', () => {
  beforeEach(() => mocks.rpc.mockReset());

  it('normalizes product IDs and returns only IDs and bounded quantities', () => {
    expect(normalizeCustomerCartLines([{ product_id: PRODUCT_A.toUpperCase(), quantity: 3, price: 999 }]))
      .toEqual([{ product_id: PRODUCT_A, quantity: 3 }]);
    expect(normalizeCustomerCartLines([])).toEqual([]);
  });

  it('rejects duplicate lines, malformed IDs, invalid quantities and more than 100 lines', () => {
    expect(() => normalizeCustomerCartLines([
      { product_id: PRODUCT_A, quantity: 1 },
      { product_id: PRODUCT_A, quantity: 2 },
    ])).toThrow(/صنف مكرر/);
    expect(() => normalizeCustomerCartLines([{ product_id: 'not-a-uuid', quantity: 1 }])).toThrow(/معرّف/);
    expect(() => normalizeCustomerCartLines([{ product_id: PRODUCT_A, quantity: 0 }])).toThrow(/الكمية/);
    expect(() => normalizeCustomerCartLines(Array.from({ length: 101 }, (_, i) => ({
      product_id: 'a1000000-0000-4000-8000-' + String(i + 1).padStart(12, '0'),
      quantity: 1,
    })))).toThrow(/100 صنف/);
  });

  it('fetches the authenticated profile cart through the RPC and validates the response', async () => {
    mocks.rpc.mockResolvedValueOnce({
      data: { items: [{ product_id: PRODUCT_A, quantity: 4 }], updated_at: '2026-10-20T10:00:00.000Z' },
      error: null,
    });
    await expect(fetchCustomerCart()).resolves.toEqual({
      items: [{ product_id: PRODUCT_A, quantity: 4 }],
      updated_at: '2026-10-20T10:00:00.000Z',
    });
    expect(mocks.rpc).toHaveBeenCalledWith('get_customer_cart');
  });

  it('sends a minimal payload to the tenant-bound sync RPC and returns the normalized state', async () => {
    mocks.rpc.mockResolvedValueOnce({
      data: { items: [{ product_id: PRODUCT_B, quantity: 2 }], updated_at: null },
      error: null,
    });
    await expect(saveCustomerCart([{ product_id: PRODUCT_B, quantity: 2, display_price: 500 }]))
      .resolves.toEqual({ items: [{ product_id: PRODUCT_B, quantity: 2 }], updated_at: null });
    expect(mocks.rpc).toHaveBeenCalledWith('sync_customer_cart', {
      p_items: [{ product_id: PRODUCT_B, quantity: 2 }],
    });
  });

  it('propagates rejected server writes instead of falsely reporting synchronized state', async () => {
    mocks.rpc.mockResolvedValueOnce({ data: null, error: new Error('tenant boundary rejected') });
    await expect(saveCustomerCart([{ product_id: PRODUCT_A, quantity: 1 }])).rejects.toThrow('tenant boundary rejected');
  });
});
