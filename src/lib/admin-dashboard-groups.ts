import { ADMIN_NAV_GROUPS, rolesCanAccessView } from '@/lib/admin-access-matrix';

/**
 * Reuses the canonical navigation item metadata and existing role visibility
 * rules so dashboard group cards and sidebar links cannot drift or grant access.
 * The ID-only views projection remains available to access/observability consumers.
 */
export function getVisibleAdminNavigationGroups(roles: readonly string[]) {
  return ADMIN_NAV_GROUPS.flatMap((group) => {
    const items = group.items.filter(({ id }) => rolesCanAccessView(roles, id));
    return items.length
      ? [{ ...group, items, views: items.map(({ id }) => id) }]
      : [];
  });
}
