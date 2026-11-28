import { describe, expect, it } from 'vitest';
import { countPublishedProductsByCategory } from './admin-category-published-counts';

describe('published category product counts', () => {
  it('returns a direct count for every category and zero for empty categories', () => {
    expect(countPublishedProductsByCategory(
      ['grain', 'rice', 'sugar'],
      ['grain', 'rice', 'rice', 'rice', null, undefined],
    )).toEqual({ grain: 1, rice: 3, sugar: 0 });
  });

  it('does not fold child-category products into the parent count', () => {
    expect(countPublishedProductsByCategory(
      ['parent', 'child'],
      ['child', 'child'],
    )).toEqual({ parent: 0, child: 2 });
  });

  it('ignores products assigned to categories outside the loaded tenant category tree', () => {
    expect(countPublishedProductsByCategory(
      ['current-tenant-category'],
      ['foreign-or-archived-category', 'current-tenant-category'],
    )).toEqual({ 'current-tenant-category': 1 });
  });

  it('keeps zero for a category with no published assignments', () => {
    expect(countPublishedProductsByCategory(['empty'], [])).toEqual({ empty: 0 });
  });
});
