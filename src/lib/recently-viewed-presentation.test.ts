import { describe, expect, it } from 'vitest';
import { resolveRecentlyViewedProducts } from './recently-viewed-presentation';
import type { RecentlyViewedProduct } from './recently-viewed-products';
import type { ProductWithInventory } from './types';

const product = (id: string, name: string) => ({
  id,
  name,
  item_code: `SKU-${id}`,
  unit: 'كرتون',
  display_price: null,
}) as unknown as ProductWithInventory;

const entry = (id: string, name: string): RecentlyViewedProduct => ({
  id,
  name,
  itemCode: `OLD-${id}`,
  imageUrl: 'https://old.example.test/image.webp',
  viewedAt: '2026-11-16T10:00:00.000Z',
});

describe('recently viewed live catalogue projection', () => {
  it('preserves visit order but resolves all visible fields from the current catalogue', () => {
    const result = resolveRecentlyViewedProducts(
      [entry('b', 'اسم قديم'), entry('a', 'اسم محفوظ'), entry('b', 'مكرر')],
      [product('a', 'الاسم الحالي أ'), product('b', 'الاسم الحالي ب')],
      'current',
    );

    expect(result.map((item) => [item.id, item.name])).toEqual([
      ['b', 'الاسم الحالي ب'],
      ['a', 'الاسم الحالي أ'],
    ]);
  });

  it('omits the current product, deleted/unavailable products and duplicate IDs', () => {
    const result = resolveRecentlyViewedProducts(
      [entry('current', 'الحالي'), entry('missing', 'محذوف'), entry('available', 'قديم'), entry('available', 'مكرر')],
      [product('current', 'الحالي'), product('available', 'المتاح الآن')],
      'current',
    );

    expect(result.map((item) => item.id)).toEqual(['available']);
    expect(result[0]?.name).toBe('المتاح الآن');
  });

  it('returns an empty list when no saved item exists in the live catalogue', () => {
    expect(resolveRecentlyViewedProducts([entry('stale', 'قديم')], [], 'current')).toEqual([]);
  });
});
