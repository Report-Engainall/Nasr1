import { ADMIN_NAV_GROUPS, rolesCanAccessView } from '@/lib/admin-access-matrix';

/**
 * Reuses the canonical navigation tree and existing role visibility rules so
 * dashboard group cards cannot drift from the sidebar or grant new access.
 */
export function getVisibleAdminNavigationGroups(roles: readonly string[]) {
  return ADMIN_NAV_GROUPS.flatMap((group) => {
    const views = group.views.filter(({ id }) => rolesCanAccessView(roles, id));
    return views.length > 0 ? [{ ...group, views }] : [];
  });
}
