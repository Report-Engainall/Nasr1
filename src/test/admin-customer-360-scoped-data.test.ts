import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = readFileSync(join(process.cwd(), 'src/components/AdminCustomer360.tsx'), 'utf8');

describe('Admin Customer 360 data boundary', () => {
  it('loads recent customer details from the tenant-scoped Customer 360 RPC rather than institution-wide lists', () => {
    expect(source).toContain('fetchStaffCustomer360Summary(customer.id)');
    expect(source).toContain('summary.recent_orders');
    expect(source).toContain('summary.recent_invoices');
    expect(source).toContain('summary.recent_payments');
    expect(source).not.toContain("supabase.rpc('fetch_staff_finance_data')");
    expect(source).not.toContain('fetchOrders()');
    expect(source).not.toContain('projectCustomer360(');
  });

  it('keeps the customer ownership check before requesting the summary', () => {
    expect(source).toContain(".eq('organization_id', scope.organizationId)");
    expect(source).toContain(".eq('id', customer.id)");
    expect(source.indexOf("if (!scopedCustomer || scopedCustomer.id !== customer.id)"))
      .toBeLessThan(source.indexOf('fetchStaffCustomer360Summary(customer.id)'));
  });
});
