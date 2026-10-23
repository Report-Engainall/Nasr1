import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  join(process.cwd(), 'supabase/migrations/20261020230000_storefront_catalog_pagination.sql'),
  'utf8',
);
const service = readFileSync(join(process.cwd(), 'src/lib/storefront-catalog.ts'), 'utf8');
const storefront = readFileSync(join(process.cwd(), 'src/components/Storefront.tsx'), 'utf8');

describe('tenant-scoped server storefront pagination', () => {
  it('derives tenant context and limits results to the current active organization', () => {
    expect(migration).toContain('public.get_public_storefront_context()');
    expect(migration).toContain('public.get_current_tenant_context()');
    expect(migration).toContain('p.organization_id = v_organization_id');
    expect(migration).toContain('ib.warehouse_id = v_warehouse_id');
    expect(migration).toContain('public.organizations o');
    expect(migration).toContain('o.is_active = true');
  });

  it('applies normalized search/category/availability before the range', () => {
    expect(migration).toContain('public.normalize_storefront_catalog_search');
    expect(migration).toContain('public.storefront_catalog_token_matches');
    expect(migration).toContain('p_category_id IS NULL OR p.category_id = p_category_id');
    expect(migration).toContain('NOT p_available_only OR');
    expect(migration).toContain('OFFSET v_offset');
    expect(migration).toContain('LIMIT v_page_size');
    expect(service).toContain('p_page_size: pageSize');
    expect(service).toContain('p_available_only: input.availableOnly');
  });

  it('uses the canonical RPC for an authorized display price and does not select tier columns', () => {
    expect(migration).toContain('public.get_storefront_product_prices(');
    expect(migration).toContain('prices.unit_price');
    expect(migration).not.toContain("'price_wholesale_of_wholesale',");
    expect(migration).not.toContain("'price_wholesale',");
    expect(migration).not.toContain("'price_retail',");
    expect(service).toContain('تعذر التحقق من السعر المعتمد');
  });

  it('bounds page values and authorizes only guest/authenticated execution', () => {
    expect(migration).toContain('p_page_size integer DEFAULT 24');
    expect(migration).toContain('v_page_size > 100');
    expect(migration).toContain('REVOKE ALL ON FUNCTION public.get_storefront_catalog_page');
    expect(migration).toContain('GRANT EXECUTE ON FUNCTION public.get_storefront_catalog_page');
  });

  it('does not use or populate the shared legacy catalog cache for tenant-paged responses', () => {
    expect(storefront).toContain('isPagedView ? (liveProducts ?? []) : (liveProducts ?? cachedProducts)');
    expect(storefront).toContain("if (!liveProducts || productSnapshot?.mode === 'paged') return;");
    expect(storefront).not.toContain("previous.filter((product) => !incomingIds.has(product.id))");
  });

  it('integrates page result data and next/previous controls', () => {
    expect(storefront).toContain('fetchStorefrontCatalogPage');
    expect(storefront).toContain('صفحة {pageInfo.page} من {pageInfo.totalPages}');
    expect(storefront).toContain('pageInfo.totalCount');
  });
});
