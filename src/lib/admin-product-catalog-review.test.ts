import { describe, expect, it } from 'vitest';
import { buildAdminProductCatalogCsv, reviewAdminProductCatalog } from './admin-product-catalog-review';
import type { ProductWithInventory } from './types';

function product(overrides: Partial<ProductWithInventory> = {}): ProductWithInventory {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    name: 'منتج تجريبي',
    item_code: 'P-001',
    sku: 'SKU-001',
    barcode: '628000000001',
    description: 'وصف مكتمل',
    unit: 'كرتون',
    category_id: null,
    category: null,
    image_url: 'https://cdn.example.com/p-001.webp',
    image_gallery_urls: [],
    is_active: true,
    is_featured: false,
    sort_order: 0,
    status: 'active',
    base_price: 10,
    price_wholesale_of_wholesale: 9,
    price_wholesale: 9.5,
    price_retail: 11,
    min_order_quantity: 1,
    order_quantity_multiple: 1,
    ...overrides,
  } as ProductWithInventory;
}

describe('admin product catalog review and export', () => {
  it('detects missing primary images, units, descriptions and authorized base prices', () => {
    const rows = [
      product({ id: '11111111-1111-4111-8111-111111111111', image_url: null, image_gallery_urls: [], unit: '', description: null, base_price: null as unknown as number }),
      product({ id: '22222222-2222-4222-8222-222222222222', name: 'صنف سليم' }),
    ];
    const report = reviewAdminProductCatalog(rows, true);
    expect(report.totalProducts).toBe(2);
    expect(report.missingPrimaryImage.map((row) => row.id)).toEqual([rows[0].id]);
    expect(report.missingUnit.map((row) => row.id)).toEqual([rows[0].id]);
    expect(report.missingDescription.map((row) => row.id)).toEqual([rows[0].id]);
    expect(report.missingBasePrice?.map((row) => row.id)).toEqual([rows[0].id]);
    expect(report.productsWithIssues.find((row) => row.id === rows[0].id)?.issues).toHaveLength(4);
  });

  it('does not interpret a hidden price projection as a missing or zero price', () => {
    const report = reviewAdminProductCatalog([product({ base_price: undefined })], false);
    expect(report.missingBasePrice).toBeNull();
    expect(report.productsWithIssues).toHaveLength(0);
  });

  it('detects duplicate identifiers across the complete supplied catalog, case-insensitively', () => {
    const rows = [
      product({ id: '11111111-1111-4111-8111-111111111111', sku: 'same-sku' }),
      product({ id: '22222222-2222-4222-8222-222222222222', item_code: 'P-002', sku: 'SAME-SKU' }),
    ];
    const report = reviewAdminProductCatalog(rows, true);
    expect(report.duplicateIdentifiers).toHaveLength(1);
    expect(report.duplicateIdentifiers[0].kind).toBe('SKU');
    expect(report.duplicateIdentifiers[0].products).toHaveLength(2);
    expect(report.productsWithIssues).toHaveLength(2);
  });

  it('omits prices for roles without price permission and excludes internal fields from exports', () => {
    const row = product({ organization_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', base_price: 75 });
    const restricted = buildAdminProductCatalogCsv([row], false);
    expect(restricted).not.toContain('سعر الأساس');
    expect(restricted).not.toContain('75');
    expect(restricted).not.toMatch(/organization_id|warehouse_id|cost_price|margin/i);

    const authorized = buildAdminProductCatalogCsv([row], true);
    expect(authorized).toContain('سعر الأساس');
    expect(authorized).toContain('75');
    expect(authorized).not.toMatch(/organization_id|warehouse_id|cost_price|margin/i);
  });

  it('neutralizes spreadsheet formulas in text cells and quotes CSV values', () => {
    const csv = buildAdminProductCatalogCsv([product({ name: ' =HYPERLINK("https://evil.example")' })], false);
    expect(csv).toContain("' =HYPERLINK(\"\"https://evil.example\"\")");
    expect(csv.split('\r\n')).toHaveLength(2);
  });
});
