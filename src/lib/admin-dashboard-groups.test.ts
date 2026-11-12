import { describe, expect, it } from 'vitest';
import { getVisibleAdminNavigationGroups } from '@/lib/admin-dashboard-groups';

describe('getVisibleAdminNavigationGroups', () => {
  it('shows the six canonical groups to an administrator without changing their membership', () => {
    const groups = getVisibleAdminNavigationGroups(['admin']);
    expect(groups.map(({ id }) => id)).toEqual([
      'executive', 'sales', 'catalog', 'supply', 'operations', 'administration',
    ]);
    expect(groups.find(({ id }) => id === 'catalog')?.views).toEqual(['products', 'categories', 'pricing', 'offers']);
  });

  it('limits an accountant to finance and tasks inside their owning groups', () => {
    const groups = getVisibleAdminNavigationGroups(['accountant']);
    expect(groups.map(({ id, views }) => [id, [...views]])).toEqual([
      ['operations', ['tasks']],
      ['administration', ['finance']],
    ]);
  });

  it('does not expose administration groups to customer identities', () => {
    expect(getVisibleAdminNavigationGroups(['customer'])).toEqual([]);
    expect(getVisibleAdminNavigationGroups(['customer_manager']).map(({ id, views }) => [id, [...views]])).toEqual([
      ['sales', ['customers']],
    ]);
  });
});
