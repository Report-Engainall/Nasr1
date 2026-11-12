import { describe, expect, it } from 'vitest';
import { parsePublicStorefrontCategories, readPublicStorefrontCategories } from './storefront-categories';

const validCategory = {
  id: 'ca000000-0000-4000-8000-000000000001',
  name: 'مواد غذائية',
  code: 'FOOD',
  parent_id: null,
  sort_order: 10,
  is_active: true,
};

describe('parsePublicStorefrontCategories', () => {
  it('accepts only the public category projection', () => {
    expect(parsePublicStorefrontCategories([validCategory])).toEqual([{
      id: validCategory.id,
      name: validCategory.name,
      name_en: null,
      code: validCategory.code,
      parent_id: null,
      sort_order: 10,
      is_active: true,
      icon: null,
    }]);
  });

  it('returns an empty list for an empty public catalog', () => {
    expect(parsePublicStorefrontCategories([])).toEqual([]);
  });

  it('rejects tenant and warehouse identifiers in an RPC payload', () => {
    expect(() => parsePublicStorefrontCategories([{
      ...validCategory,
      organization_id: 'a0000000-0000-4000-8000-000000000001',
    }])).toThrow(/حقول غير مسموح/);
    expect(() => parsePublicStorefrontCategories([{
      ...validCategory,
      warehouse_id: 'd0000000-0000-4000-8000-000000000001',
    }])).toThrow(/حقول غير مسموح/);
  });

  it('rejects malformed IDs and inactive categories', () => {
    expect(() => parsePublicStorefrontCategories([{ ...validCategory, id: 'bad-id' }])).toThrow();
    expect(() => parsePublicStorefrontCategories([{ ...validCategory, is_active: false }])).toThrow();
  });
  it('unwraps the Supabase RPC data before parsing the allowlisted category projection', async () => {
    const categories = await readPublicStorefrontCategories(async () => ({
      data: [validCategory],
      error: null,
    }));
    expect(categories).toEqual(parsePublicStorefrontCategories([validCategory]));
  });

  it('propagates an RPC error instead of parsing the response envelope', async () => {
    const rpcError = Object.assign(new Error('category RPC unavailable'), { code: 'PGRST000' });
    await expect(readPublicStorefrontCategories(async () => ({
      data: null,
      error: rpcError,
    }))).rejects.toBe(rpcError);
  });

});
