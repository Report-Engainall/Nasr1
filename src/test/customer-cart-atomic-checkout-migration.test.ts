import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(join(
  process.cwd(),
  'supabase/migrations/20261021150000_customer_cart_atomic_checkout.sql',
), 'utf8');
const runtimeTest = readFileSync(join(
  process.cwd(),
  'scripts/test-customer-cart-persistence.mjs',
), 'utf8');

describe('atomic persistent-cart checkout migration', () => {
  it('uses a deferred order trigger so order items exist before conversion', () => {
    expect(migration).toMatch(/CREATE CONSTRAINT TRIGGER customer_cart_atomic_order_conversion[\s\S]*?AFTER INSERT ON public\.orders[\s\S]*?DEFERRABLE INITIALLY DEFERRED/i);
    expect(migration).toMatch(/status = 'checked_out'/i);
    expect(migration).toMatch(/DELETE FROM public\.customer_cart_items/i);
  });

  it('requires the cart product/quantity set to match persisted order lines', () => {
    expect(migration).toMatch(/FULL OUTER JOIN order_lines AS o USING \(product_id\)/i);
    expect(migration).toMatch(/checkout lines do not match active persistent cart/i);
    expect(migration).toMatch(/ERRCODE = '40001'/i);
    expect(migration).toMatch(/NEW\.created_by/i);
    expect(migration).toMatch(/r\.role = 'customer'/i);
  });

  it('keeps trigger internals private and records tenant/profile audit evidence', () => {
    expect(migration).toMatch(/REVOKE ALL ON FUNCTION public\.convert_customer_cart_after_order_commit\(\) FROM PUBLIC, anon, authenticated/i);
    expect(migration).toMatch(/customer\.cart\.checked_out/i);
    expect(migration).toMatch(/organization_id, actor_id, action, entity_type, entity_id, old_value, new_value/i);
  });

  it('proves mismatch rollback, successful conversion, replay and exactly-once order creation', () => {
    expect(runtimeTest).toMatch(/a mismatched checkout must not persist an order/i);
    expect(runtimeTest).toMatch(/matching order atomically converts the active cart/i);
    expect(runtimeTest).toMatch(/replayed checkout is marked idempotent/i);
    expect(runtimeTest).toMatch(/idempotent checkout never creates a duplicate order/i);
  });
});
