import { describe, expect, it } from 'vitest';
import { parsePublicStorefrontCategories } from './storefront-categories';

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
});
