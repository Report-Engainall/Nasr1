import { describe, expect, it } from 'vitest';
import { getVisibleAdminNavigationGroups } from '@/lib/admin-dashboard-groups';

describe('getVisibleAdminNavigationGroups', () => {
  it('shows the six canonical groups to an administrator without changing their membership', () => {
    const groups = getVisibleAdminNavigationGroups(['admin']);
    expect(groups.map(({ id }) => id)).toEqual([
      'executive', 'sales', 'catalog', 'supply', 'operations', 'administration',
    ]);
    expect(groups.find(({ id }) => id === 'catalog')?.views).toEqual(['products', 'categories', 'pricing', 'offers']);
    expect(groups.find(({ id }) => id === 'executive')?.views).toContain('system-health');
    expect(groups.find(({ id }) => id === 'executive')?.views).toContain('error-log');
    expect(groups.find(({ id }) => id === 'executive')?.views).toContain('architecture');
    expect(groups.find(({ id }) => id === 'operations')?.views).toContain('engine-status');
  });

  it('does not expose observability pages in staff navigation', () => {
    const views = getVisibleAdminNavigationGroups(['staff']).flatMap(({ views }) => [...views]);
    expect(views).not.toContain('system-health');
    expect(views).not.toContain('error-log');
    expect(views).not.toContain('architecture');
    expect(views).not.toContain('engine-status');
  });

  it('limits an accountant to finance and tasks inside their owning groups', () => {
    const groups = getVisibleAdminNavigationGroups(['accountant']);
    expect(groups.map(({ id, views }) => [id, [...views]])).toEqual([
      ['operations', ['tasks']],
      ['administration', ['finance']],
    ]);
  });

  it('keeps destination labels and paths attached to the filtered catalog links', () => {
    const catalog = getVisibleAdminNavigationGroups(['staff']).find(({ id }) => id === 'catalog');
    expect(catalog?.items.find(({ id }) => id === 'categories')).toMatchObject({
      id: 'categories',
      label: 'التصنيفات الرئيسية والفرعية',
      path: '/admin/categories',
    });
    expect(catalog?.views).toEqual(catalog?.items.map(({ id }) => id));
  });

  it('does not expose administration groups to customer identities', () => {
    expect(getVisibleAdminNavigationGroups(['customer'])).toEqual([]);
    expect(getVisibleAdminNavigationGroups(['customer_manager']).map(({ id, views }) => [id, [...views]])).toEqual([
      ['sales', ['customers']],
    ]);
  });
});
