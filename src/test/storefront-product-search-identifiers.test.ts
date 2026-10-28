import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  join(process.cwd(), 'supabase/migrations/20261028100000_storefront_product_search_identifiers.sql'),
  'utf8',
);
const api = readFileSync(join(process.cwd(), 'src/lib/api.ts'), 'utf8');
const admin = readFileSync(join(process.cwd(), 'src/components/AghbariApp.tsx'), 'utf8');
const generatedTypes = readFileSync(join(process.cwd(), 'src/integrations/supabase/types.ts'), 'utf8');

describe('persisted product search identifiers', () => {
  it('adds optional real SKU and English-name fields with normalization and safe bounds', () => {
    expect(migration).toContain('ADD COLUMN IF NOT EXISTS sku text');
    expect(migration).toContain('ADD COLUMN IF NOT EXISTS name_en text');
    expect(migration).toContain('NEW.sku := NULLIF(pg_catalog.btrim(NEW.sku), \'\')');
    expect(migration).toContain('products_sku_length_check');
    expect(migration).toContain('products_name_en_length_check');
    expect(migration).toContain('products_organization_sku_unique');
  });

  it('searches tenant-scoped persisted item code, SKU, barcode, Arabic/English names, and descriptions', () => {
    expect(migration).toContain('p.organization_id = v_organization_id');
    expect(migration).toContain('p.item_code');
    expect(migration).toContain('coalesce(p.sku,\'\')');
    expect(migration).toContain('coalesce(p.barcode,\'\')');
    expect(migration).toContain('normalize_storefront_catalog_search(coalesce(p.name_en,\'\'))');
    expect(migration).toContain('normalize_storefront_catalog_search(coalesce(p.description,\'\'))');
    expect(migration).toContain("'name_en', r.name_en");
    expect(migration).toContain("'sku', r.sku");
  });

  it('keeps price policy and bounded server pagination unchanged', () => {
    expect(migration).toContain('public.get_storefront_product_prices(');
    expect(migration).toContain('v_page_size > 100');
    expect(migration).toContain('REVOKE ALL ON FUNCTION public.get_storefront_catalog_page');
    expect(migration).toContain('GRANT EXECUTE ON FUNCTION public.get_storefront_catalog_page');
    expect(migration).not.toContain("'price_wholesale',");
    expect(migration).not.toContain("'price_retail',");
    expect(migration).not.toContain("'base_price', CASE WHEN v_is_staff THEN prices.unit_price ELSE 0 END");
    expect(migration).toContain("THEN pg_catalog.jsonb_build_object('base_price', prices.unit_price)");
    expect(migration).toContain('GRANT SELECT (sku, name_en) ON TABLE public.products TO anon, authenticated');
  });

  it('round-trips identifiers through the customer projection and admin product editor', () => {
    expect(api).toContain('name,name_en,item_code,sku,barcode');
    expect(api).toContain('name_en: p.name_en');
    expect(api).toContain('sku: p.sku');
    expect(admin).toContain('nameEn, setNameEn');
    expect(admin).toContain('sku, setSku');
    expect(admin).toContain('barcode, setBarcode');
    expect(admin).toContain('name_en: nameEn.trim() || null');
    expect(admin).toContain('sku: sku.trim() || null');
    expect(admin).toContain('barcode: barcode.trim() || null');
    expect(generatedTypes).toContain('name_en: string | null');
    expect(generatedTypes).toContain('sku: string | null');
  });
});
