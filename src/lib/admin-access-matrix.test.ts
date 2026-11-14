import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  ADMIN_NAV_GROUPS, ADMIN_NAV_ITEMS, ADMIN_NAV_PATHS, ADMIN_OPERATION_RULES, operationAllowed,
  pageAccessReason, roleCanAccessView, rolesCanAccessView,
} from "@/lib/admin-access-matrix";

const routeTreeSource = readFileSync(new URL("../routeTree.gen.ts", import.meta.url), "utf8");

describe("admin access presentation contract", () => {
  it("assigns every admin page to exactly one navigation group", () => {
    const ids = ADMIN_NAV_GROUPS.flatMap((group) => [...group.views]);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toHaveLength(24);
    expect(ADMIN_NAV_GROUPS.find(({ id }) => id === 'catalog')?.views).toContain('categories');
    expect(ADMIN_NAV_GROUPS.find(({ id }) => id === 'catalog')?.items).toEqual(ADMIN_NAV_ITEMS.filter(({ id }) => ['products', 'categories', 'pricing', 'offers'].includes(id)));
    expect(ADMIN_NAV_GROUPS).toHaveLength(6);
    expect(ADMIN_NAV_ITEMS).toHaveLength(24);
    expect(new Set(ADMIN_NAV_ITEMS.map(({ path }) => path)).size).toBe(24);
    expect(ADMIN_NAV_ITEMS.every(({ label, path }) => label.trim().length > 0 && path.startsWith('/admin'))).toBe(true);
    expect(ADMIN_NAV_PATHS.categories).toBe('/admin/categories');
  });


  it("registers every canonical navigation destination in the generated TanStack route tree", () => {
    for (const item of ADMIN_NAV_ITEMS) {
      expect(routeTreeSource, `missing registered route for ${item.id}: ${item.path}`).toContain(`path: '${item.path}'`);
    }
  });

  it("keeps accountant and customer manager scopes separate", () => {
    expect(roleCanAccessView("accountant", "finance")).toBe(true);
    expect(roleCanAccessView("accountant", "products")).toBe(false);
    expect(roleCanAccessView("customer_manager", "customers")).toBe(true);
    expect(roleCanAccessView("customer_manager", "orders")).toBe(false);
    expect(rolesCanAccessView(["staff", "accountant"], "finance")).toBe(true);
  });

  it("explains blocked pages and operations", () => {
    expect(pageAccessReason("accountant", "products")).toContain("المحاسب");
    expect(pageAccessReason("customer_manager", "finance")).toContain("مسؤول العملاء");
    expect(operationAllowed("admin", "role_assignment")).toBe(true);
    expect(operationAllowed("manager", "role_assignment")).toBe(false);
    expect(operationAllowed("staff", "inventory_transfer")).toBe(true);
    expect(operationAllowed("staff", "inventory_reorder_point")).toBe(false);
    expect(operationAllowed("accountant", "finance_manage")).toBe(true);
    expect(operationAllowed("accountant", "pricing_rules_write")).toBe(false);
    expect(ADMIN_OPERATION_RULES.length).toBeGreaterThanOrEqual(14);
  });
});
