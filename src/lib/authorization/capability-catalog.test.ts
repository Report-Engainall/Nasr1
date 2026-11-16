import { describe, expect, it } from "vitest";
import {
  ADMIN_ACCESS_ROLES,
  ADMIN_OPERATION_RULES,
  ROLE_PAGE_ACCESS,
  operationAllowed,
  roleCanAccessView,
  type AdminOperationId,
  type AdminRoleId,
  type AdminViewId,
} from "@/lib/admin-access-matrix";
import {
  ADMIN_PAGE_VIEW_IDS,
  CAPABILITY_CATALOG,
  LEGACY_ROLE_CAPABILITIES,
  getCapabilityDefinition,
  getLegacyRoleCapabilities,
  legacyRoleHasCapability,
} from "@/lib/authorization/capability-catalog";

/**
 * Frozen 2026-11-16 legacy behavior baseline.
 * These are compatibility expectations, not recommended future role grants.
 */
const LEGACY_ACCESS_BASELINE = {
  admin: {
    pages: [
      "dashboard", "products", "categories", "customers", "service-desk", "orders", "pricing", "offers",
      "reports", "data", "operations", "notifications", "ai", "suppliers", "devices", "settings", "quotes",
      "tasks", "stock-count", "inventory-transfers", "finance", "audit", "purchase-orders", "intelligence",
      "system-health", "error-log", "architecture", "engine-status",
    ],
    operations: [
      "pricing_rules_write", "pricing_rule_submit", "pricing_rules_approve", "product_lifecycle",
      "inventory_reorder_point", "inventory_transfer", "stock_count_edit", "stock_count_finalize",
      "customer_lifecycle", "customer_activation", "customer_360", "imports_stage", "imports_finalize",
      "purchase_orders_manage", "operational_task_status", "finance_manage", "role_assignment", "audit_intelligence",
    ],
  },
  manager: {
    pages: [
      "dashboard", "products", "categories", "customers", "service-desk", "orders", "pricing", "offers",
      "reports", "data", "operations", "notifications", "ai", "suppliers", "devices", "settings", "quotes",
      "tasks", "stock-count", "inventory-transfers", "finance", "audit", "purchase-orders", "intelligence",
      "system-health", "error-log", "architecture", "engine-status",
    ],
    operations: [
      "pricing_rules_write", "pricing_rule_submit", "pricing_rules_approve", "product_lifecycle",
      "inventory_reorder_point", "inventory_transfer", "stock_count_edit", "stock_count_finalize",
      "customer_lifecycle", "customer_activation", "customer_360", "imports_stage", "imports_finalize",
      "purchase_orders_manage", "operational_task_status", "finance_manage", "audit_intelligence",
    ],
  },
  staff: {
    pages: [
      "dashboard", "products", "categories", "customers", "service-desk", "orders", "pricing", "offers",
      "reports", "data", "operations", "notifications", "ai", "suppliers", "devices", "settings", "quotes",
      "tasks", "stock-count", "inventory-transfers",
    ],
    operations: [
      "pricing_rule_submit", "inventory_transfer", "stock_count_edit", "customer_activation", "imports_stage",
      "operational_task_status",
    ],
  },
  accountant: {
    pages: ["finance", "tasks"],
    operations: ["customer_360", "operational_task_status", "finance_manage"],
  },
  customer_manager: {
    pages: ["customers"],
    operations: ["customer_lifecycle", "customer_activation"],
  },
  customer: {
    pages: [],
    operations: [],
  },
} as const satisfies Record<AdminRoleId, {
  pages: readonly AdminViewId[];
  operations: readonly AdminOperationId[];
}>;

const LEGACY_ROLE_IDS = ["admin", "manager", "staff", "accountant", "customer_manager", "customer"] as const;

describe("authorization capability catalog and legacy parity", () => {
  it("registers every current admin page and operation exactly once", () => {
    const expectedPageIds = new Set(ADMIN_ACCESS_ROLES.flatMap(({ id }) => ROLE_PAGE_ACCESS[id]));
    const expectedOperationIds = new Set(ADMIN_OPERATION_RULES.map(({ id }) => id));
    const pageCapabilities = CAPABILITY_CATALOG.filter(({ kind }) => kind === "page");
    const operationCapabilities = CAPABILITY_CATALOG.filter(({ kind }) => kind === "operation");
    const ids = CAPABILITY_CATALOG.map(({ id }) => id);

    expect(ADMIN_PAGE_VIEW_IDS.length).toBe(expectedPageIds.size);
    expect(new Set(ADMIN_PAGE_VIEW_IDS)).toEqual(expectedPageIds);
    expect(pageCapabilities.map(({ id }) => id).sort()).toEqual(
      [...expectedPageIds].map((view) => `admin.page.${view}.read`).sort(),
    );
    expect(operationCapabilities.map(({ id }) => id).sort()).toEqual(
      [...expectedOperationIds].map((operation) => `admin.operation.${operation}`).sort(),
    );
    expect(ids).toHaveLength(new Set(ids).size);
    expect(CAPABILITY_CATALOG).toHaveLength(expectedPageIds.size + expectedOperationIds.size);
    expect(CAPABILITY_CATALOG.every(({ resource, action, label }) =>
      resource.trim().length > 0 && action.trim().length > 0 && label.trim().length > 0,
    )).toBe(true);
  });

  it("preserves the six existing role IDs and every frozen page/operation decision", () => {
    expect(ADMIN_ACCESS_ROLES.map(({ id }) => id)).toEqual(LEGACY_ROLE_IDS);
    expect(Object.keys(LEGACY_ROLE_CAPABILITIES)).toEqual(LEGACY_ROLE_IDS);

    for (const role of LEGACY_ROLE_IDS) {
      const baseline = LEGACY_ACCESS_BASELINE[role];
      const expectedPages = [...baseline.pages];
      const expectedOperations = [...baseline.operations];

      expect(ROLE_PAGE_ACCESS[role]).toEqual(expectedPages);

      for (const view of ADMIN_PAGE_VIEW_IDS) {
        expect(roleCanAccessView(role, view)).toBe(expectedPages.includes(view));
        expect(legacyRoleHasCapability(role, `admin.page.${view}.read`))
          .toBe(expectedPages.includes(view));
      }

      for (const operation of ADMIN_OPERATION_RULES) {
        const expected = expectedOperations.includes(operation.id);
        expect(operationAllowed(role, operation.id)).toBe(expected);
        expect(legacyRoleHasCapability(role, `admin.operation.${operation.id}`)).toBe(expected);
      }

      const expectedCapabilityIds = [
        ...expectedPages.map((view) => `admin.page.${view}.read`),
        ...expectedOperations.map((operation) => `admin.operation.${operation}`),
      ];
      expect(LEGACY_ROLE_CAPABILITIES[role]).toEqual(expectedCapabilityIds);
      expect(getLegacyRoleCapabilities(role).map(({ id }) => id)).toEqual(expectedCapabilityIds);
    }
  });

  it("retains critical sensitivity and risk metadata for sensitive actions", () => {
    expect(getCapabilityDefinition("admin.operation.role_assignment")).toMatchObject({
      resource: "organization_role_assignment",
      action: "assign",
      risk: "critical",
      sensitivity: "security",
      legacyRoleIds: ["admin"],
    });
    expect(getCapabilityDefinition("admin.operation.finance_manage")).toMatchObject({
      resource: "financial_record",
      action: "manage",
      risk: "critical",
      sensitivity: "financial",
      legacyRoleIds: ["admin", "manager", "accountant"],
    });
    expect(getCapabilityDefinition("admin.operation.pricing_rules_approve")).toMatchObject({
      risk: "critical",
      sensitivity: "financial",
      legacyRoleIds: ["admin", "manager"],
    });
    expect(getCapabilityDefinition("admin.operation.imports_finalize")).toMatchObject({
      risk: "critical",
      sensitivity: "internal",
      legacyRoleIds: ["admin", "manager"],
    });
    expect(getCapabilityDefinition("admin.page.error-log.read")).toMatchObject({
      risk: "critical",
      sensitivity: "security",
      legacyRoleIds: ["admin", "manager"],
    });
  });

  it("fails closed for unknown roles and unknown capability identifiers", () => {
    expect(getLegacyRoleCapabilities("sales_manager")).toEqual([]);
    expect(getLegacyRoleCapabilities("warehouse_operator")).toEqual([]);
    expect(legacyRoleHasCapability("developer", "admin.operation.role_assignment")).toBe(false);
    expect(legacyRoleHasCapability("admin", "admin.operation.unregistered")).toBe(false);
    expect(getCapabilityDefinition("admin.*")).toBeUndefined();
  });

  it("keeps the catalog descriptive rather than introducing wildcard or broad grants", () => {
    expect(CAPABILITY_CATALOG.some(({ id, action }) =>
      id.includes("*") || action === "manage_all" || id.endsWith(".manage_all"),
    )).toBe(false);
    expect(CAPABILITY_CATALOG.every(({ legacyRoleIds }) =>
      legacyRoleIds.every((role) => LEGACY_ROLE_IDS.includes(role)),
    )).toBe(true);
    expect(CAPABILITY_CATALOG.every(({ legacySource }) =>
      legacySource === "ROLE_PAGE_ACCESS" || legacySource === "ADMIN_OPERATION_RULES",
    )).toBe(true);
  });
});
