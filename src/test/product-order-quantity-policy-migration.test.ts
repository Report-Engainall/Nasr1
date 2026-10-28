import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(join(
  process.cwd(),
  'supabase/migrations/20261028140000_product_order_quantity_policy.sql',
), 'utf8');

describe('product-level order quantity policy migration', () => {
  it('adds safe positive defaults and bounded database constraints', () => {
    expect(migration).toMatch(/ADD COLUMN IF NOT EXISTS min_order_quantity integer NOT NULL DEFAULT 1/i);
    expect(migration).toMatch(/ADD COLUMN IF NOT EXISTS order_quantity_multiple integer NOT NULL DEFAULT 1/i);
    expect(migration).toMatch(/products_min_order_quantity_check[\s\S]*?CHECK \(min_order_quantity BETWEEN 1 AND 10000\)/i);
    expect(migration).toMatch(/products_order_quantity_multiple_check[\s\S]*?CHECK \(order_quantity_multiple BETWEEN 1 AND 10000\)/i);
  });

  it('enforces policy in the shared server price resolver used by quote and order paths', () => {
    expect(migration).toMatch(/CREATE OR REPLACE FUNCTION public\.customer_product_unit_price/i);
    expect(migration).toMatch(/p\.organization_id=p_organization_id AND p\.status='active'/i);
    expect(migration).toMatch(/p_quantity < v_min_order_quantity[\s\S]*?pg_catalog\.mod\(p_quantity - v_min_order_quantity, v_order_quantity_multiple\) <> 0/i);
    expect(migration).toMatch(/REVOKE ALL ON FUNCTION public\.customer_product_unit_price\(uuid,uuid,text,numeric\) FROM PUBLIC,anon,authenticated/i);
  });

  it('returns only safe order-policy metadata from the tenant-scoped customer catalog', () => {
    expect(migration).toMatch(/'min_order_quantity', r\.min_order_quantity/i);
    expect(migration).toMatch(/'order_quantity_multiple', r\.order_quantity_multiple/i);
    expect(migration).toMatch(/GRANT SELECT \(min_order_quantity, order_quantity_multiple\)[\s\S]*?TO anon, authenticated/i);
    expect(migration).not.toMatch(/GRANT SELECT ON TABLE public\.products TO anon, authenticated/i);
  });
});
