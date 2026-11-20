import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = readFileSync(join(process.cwd(), 'src/components/AghbariApp.tsx'), 'utf8');
const api = readFileSync(join(process.cwd(), 'src/lib/api.ts'), 'utf8');
const productsStart = source.indexOf('function Products(');
const productsEnd = source.indexOf('type AdminProductPriceSnapshot', productsStart);
const products = source.slice(productsStart, productsEnd);

describe('admin product bulk operations', () => {
  it('limits selection and bulk editing to the authorized product lifecycle roles', () => {
    expect(products).toContain("role === 'admin' || role === 'manager'");
    expect(products).toContain('selectedProductIds');
    expect(products).toContain('aria-label="تحديد كل منتجات الصفحة الحالية"');
    expect(products).toContain("disabled={selectedRows.length === 0 || bulkSaving}");
  });

  it('clears stale selections when the current page or server-side filters change', () => {
    expect(products).toContain('setSelectedProductIds(new Set())');
    expect(products).toContain('[page, debouncedQuery, statusFilter, categoryFilter]');
    expect(products).toContain('rows.forEach((product) => next.add(product.id))');
  });

  it('applies only explicitly selected fields through the existing server catalog command', () => {
    expect(products).toContain('const patch: Partial<ProductWithInventory> = {}');
    expect(products).toContain('const saved = await updateProduct(product.id, patch)');
    expect(api).toContain("supabase.rpc('save_admin_product_with_metadata'");
    expect(products).not.toMatch(/\.from\(['"]products['"]\)\.update\(/);
  });

  it('supports bulk publication changes and preserves the active flag during restoration', () => {
    expect(products).toContain("patch.status = bulkStatus");
    expect(products).toContain("patch.is_active = bulkStatus === 'active'");
    expect(products).toContain("updateProduct(product.id, { status: 'active', is_active: true })");
  });

  it('reports partial completion instead of claiming a multi-product transaction', () => {
    expect(products).toContain('هذه دفعة متتابعة وليست معاملة واحدة شاملة');
    expect(products).toContain('توقف التعديل الجماعي عند');
    expect(products).toContain('اكتمل حفظ ${completed} من ${targets.length} منتجات');
  });
});
