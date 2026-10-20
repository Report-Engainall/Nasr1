import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(join(
  process.cwd(),
  'supabase',
  'migrations',
  '20261020210000_customer_persistent_cart.sql',
), 'utf8');

describe('persistent customer cart migration contract', () => {
  it('keeps cart storage behind RPCs with RLS enabled and direct client access revoked', () => {
    expect(migration).toMatch(/ALTER TABLE public\.customer_carts ENABLE ROW LEVEL SECURITY;/i);
    expect(migration).toMatch(/ALTER TABLE public\.customer_cart_items ENABLE ROW LEVEL SECURITY;/i);
    expect(migration).toMatch(/REVOKE ALL ON TABLE public\.customer_carts, public\.customer_cart_items FROM PUBLIC, anon, authenticated;/i);
    expect(migration).toMatch(/REVOKE ALL ON FUNCTION public\.get_customer_cart\(\) FROM PUBLIC, anon;/i);
    expect(migration).toMatch(/REVOKE ALL ON FUNCTION public\.sync_customer_cart\(jsonb\) FROM PUBLIC, anon;/i);
    expect(migration).toMatch(/GRANT EXECUTE ON FUNCTION public\.get_customer_cart\(\) TO authenticated;/i);
    expect(migration).toMatch(/GRANT EXECUTE ON FUNCTION public\.sync_customer_cart\(jsonb\) TO authenticated;/i);
    expect(migration).not.toMatch(/GRANT\s+(?:SELECT|INSERT|UPDATE|DELETE|ALL)[\s\S]{0,180}?ON TABLE public\.customer_carts[^;]*TO\s+(?:PUBLIC|anon|authenticated)\b/i);
  });

  it('binds every operation to an active customer identity and current tenant', () => {
    expect(migration).toMatch(/v_actor uuid := public\.current_profile_id\(\)/i);
    expect(migration).toMatch(/v_org uuid := public\.current_organization_id\(\)/i);
    expect(migration).toMatch(/r\.role = 'customer'/i);
    expect(migration).toMatch(/OR public\.is_staff\(\)/i);
    expect(migration).toMatch(/p\.auth_user_id = auth\.uid\(\)[\s\S]*?p\.organization_id = v_org[\s\S]*?p\.is_active = true/i);
    expect(migration).toMatch(/p\.organization_id = v_org[\s\S]*?p\.status = 'active'/i);
  });

  it('validates before replacing a cart and serializes concurrent sync operations', () => {
    expect(migration).toMatch(/pg_catalog\.jsonb_array_length\(p_items\) > 100/i);
    expect(migration).toMatch(/pg_catalog\.jsonb_object_length\(v_item\) <> 2/i);
    expect(migration).toMatch(/v_quantity < 1 OR v_quantity > 10000/i);
    expect(migration).toMatch(/v_product_id = ANY\(v_seen\)/i);
    expect(migration).toMatch(/p\.organization_id = v_org[\s\S]*?p\.status = 'active'/i);
    expect(migration).toMatch(/ON CONFLICT \(organization_id, profile_id\) WHERE status = 'active'/i);
    expect(migration).toMatch(/FOR UPDATE/i);
  });

  it('stores no prices or totals and returns only product identities and quantities', () => {
    expect(migration).toContain("'product_id', i.product_id");
    expect(migration).toContain("'quantity', i.quantity");
    expect(migration).not.toMatch(/authorized_price|display_price|total_amount|unit_price/);
  });
});
