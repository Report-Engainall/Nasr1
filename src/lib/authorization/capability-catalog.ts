import {
  ADMIN_ACCESS_ROLES,
  ADMIN_NAV_ITEMS,
  ADMIN_OPERATION_RULES,
  ROLE_PAGE_ACCESS,
  operationAllowed,
  roleCanAccessView,
  type AdminOperationId,
  type AdminRoleId,
  type AdminViewId,
} from "@/lib/admin-access-matrix";

/**
 * Descriptive authorization vocabulary for the currently supported legacy
 * application roles. This catalog is an inspection/migration contract only:
 * it is NOT an authorization engine, a grant source, or a replacement for
 * server-side RPC authorization and PostgreSQL RLS.
 */
export type CapabilityRisk = "low" | "medium" | "high" | "critical";
export type CapabilitySensitivity = "internal" | "operational" | "personal" | "financial" | "security";
export type CapabilityId =
  | `admin.page.${AdminViewId}.read`
  | `admin.operation.${AdminOperationId}`;

export type CapabilityDefinition = Readonly<{
  id: CapabilityId;
  kind: "page" | "operation";
  label: string;
  resource: string;
  action: string;
  risk: CapabilityRisk;
  sensitivity: CapabilitySensitivity;
  /** Existing application role IDs that currently pass the legacy evaluator. */
  legacyRoleIds: readonly AdminRoleId[];
  /** The existing source from which the compatibility mapping is projected. */
  legacySource: "ROLE_PAGE_ACCESS" | "ADMIN_OPERATION_RULES";
}>;

type CapabilityMetadata = Readonly<{
  resource: string;
  action: string;
  risk: CapabilityRisk;
  sensitivity: CapabilitySensitivity;
}>;

const PAGE_CAPABILITY_METADATA: Readonly<Record<AdminViewId, CapabilityMetadata>> = {
  dashboard: { resource: "executive_dashboard", action: "read", risk: "low", sensitivity: "internal" },
  products: { resource: "product", action: "read", risk: "medium", sensitivity: "operational" },
  customers: { resource: "customer", action: "read", risk: "high", sensitivity: "personal" },
  orders: { resource: "order", action: "read", risk: "high", sensitivity: "personal" },
  pricing: { resource: "price_rule", action: "read", risk: "high", sensitivity: "financial" },
  offers: { resource: "promotion", action: "read", risk: "medium", sensitivity: "operational" },
  reports: { resource: "business_report", action: "read", risk: "medium", sensitivity: "internal" },
  data: { resource: "data_workspace", action: "read", risk: "high", sensitivity: "internal" },
  operations: { resource: "operation_run", action: "read", risk: "high", sensitivity: "operational" },
  notifications: { resource: "internal_notification", action: "read", risk: "low", sensitivity: "internal" },
  ai: { resource: "ai_workspace", action: "read", risk: "medium", sensitivity: "internal" },
  suppliers: { resource: "supplier", action: "read", risk: "high", sensitivity: "personal" },
  devices: { resource: "device_session", action: "read", risk: "high", sensitivity: "security" },
  settings: { resource: "organization_setting", action: "read", risk: "high", sensitivity: "security" },
  quotes: { resource: "sales_quote", action: "read", risk: "medium", sensitivity: "financial" },
  finance: { resource: "financial_record", action: "read", risk: "critical", sensitivity: "financial" },
  tasks: { resource: "operational_task", action: "read", risk: "medium", sensitivity: "operational" },
  audit: { resource: "audit_event", action: "read", risk: "critical", sensitivity: "security" },
  "stock-count": { resource: "stock_count", action: "read", risk: "high", sensitivity: "operational" },
  "inventory-transfers": { resource: "inventory_transfer", action: "read", risk: "high", sensitivity: "operational" },
  "purchase-orders": { resource: "purchase_order", action: "read", risk: "high", sensitivity: "financial" },
  intelligence: { resource: "business_intelligence", action: "read", risk: "high", sensitivity: "financial" },
  "service-desk": { resource: "customer_service_case", action: "read", risk: "high", sensitivity: "personal" },
  categories: { resource: "catalog_category", action: "read", risk: "medium", sensitivity: "operational" },
  "system-health": { resource: "system_probe", action: "read", risk: "high", sensitivity: "security" },
  "error-log": { resource: "runtime_error_event", action: "read", risk: "critical", sensitivity: "security" },
  architecture: { resource: "application_route_registry", action: "read", risk: "high", sensitivity: "security" },
  "engine-status": { resource: "engine_health", action: "read", risk: "high", sensitivity: "operational" },
};

const OPERATION_CAPABILITY_METADATA: Readonly<Record<AdminOperationId, CapabilityMetadata>> = {
  pricing_rules_write: { resource: "price_rule", action: "update", risk: "high", sensitivity: "financial" },
  pricing_rule_submit: { resource: "price_rule", action: "submit", risk: "high", sensitivity: "financial" },
  pricing_rules_approve: { resource: "price_rule", action: "approve", risk: "critical", sensitivity: "financial" },
  product_lifecycle: { resource: "product", action: "change_lifecycle", risk: "high", sensitivity: "operational" },
  inventory_reorder_point: { resource: "inventory_policy", action: "update_reorder_point", risk: "high", sensitivity: "operational" },
  inventory_transfer: { resource: "inventory_transfer", action: "create", risk: "high", sensitivity: "operational" },
  stock_count_edit: { resource: "stock_count", action: "edit", risk: "medium", sensitivity: "operational" },
  stock_count_finalize: { resource: "stock_count", action: "finalize", risk: "critical", sensitivity: "operational" },
  customer_lifecycle: { resource: "customer", action: "change_lifecycle", risk: "high", sensitivity: "personal" },
  customer_activation: { resource: "customer_membership", action: "activate", risk: "high", sensitivity: "personal" },
  customer_360: { resource: "customer_profile", action: "read_360", risk: "high", sensitivity: "financial" },
  imports_stage: { resource: "data_import", action: "stage", risk: "medium", sensitivity: "internal" },
  imports_finalize: { resource: "data_import", action: "publish", risk: "critical", sensitivity: "internal" },
  purchase_orders_manage: { resource: "purchase_order", action: "manage", risk: "critical", sensitivity: "financial" },
  operational_task_status: { resource: "operational_task", action: "transition", risk: "medium", sensitivity: "operational" },
  finance_manage: { resource: "financial_record", action: "manage", risk: "critical", sensitivity: "financial" },
  role_assignment: { resource: "organization_role_assignment", action: "assign", risk: "critical", sensitivity: "security" },
  audit_intelligence: { resource: "audit_event", action: "review", risk: "high", sensitivity: "security" },
};

/**
 * Enumerates every currently registered admin page, including pages without
 * a visible navigation destination, from the six-role legacy access contract.
 */
export const ADMIN_PAGE_VIEW_IDS: readonly AdminViewId[] = Object.freeze(
  Array.from(new Set(ADMIN_ACCESS_ROLES.flatMap(({ id }) => ROLE_PAGE_ACCESS[id]))),
);

/**
 * Stable page + operation capability dictionary. Legacy role membership is
 * calculated only from the existing evaluators; the metadata adds no grants.
 */
export const CAPABILITY_CATALOG: readonly CapabilityDefinition[] = Object.freeze([
  ...ADMIN_PAGE_VIEW_IDS.map((view): CapabilityDefinition => {
    const metadata = PAGE_CAPABILITY_METADATA[view];
    return Object.freeze({
      id: `admin.page.${view}.read` as CapabilityId,
      kind: "page",
      label: ADMIN_NAV_ITEMS.find((item) => item.id === view)?.label ?? view,
      ...metadata,
      legacyRoleIds: Object.freeze(ADMIN_ACCESS_ROLES
        .filter(({ id: role }) => roleCanAccessView(role, view))
        .map(({ id }) => id)),
      legacySource: "ROLE_PAGE_ACCESS",
    });
  }),
  ...ADMIN_OPERATION_RULES.map((operation): CapabilityDefinition => {
    const metadata = OPERATION_CAPABILITY_METADATA[operation.id];
    return Object.freeze({
      id: `admin.operation.${operation.id}` as CapabilityId,
      kind: "operation",
      label: operation.label,
      ...metadata,
      legacyRoleIds: Object.freeze(ADMIN_ACCESS_ROLES
        .filter(({ id: role }) => operationAllowed(role, operation.id))
        .map(({ id }) => id)),
      legacySource: "ADMIN_OPERATION_RULES",
    });
  }),
]);

/**
 * Read-only compatibility projection for the six existing role IDs. Keep the
 * IDs and decisions aligned with ROLE_PAGE_ACCESS / ADMIN_OPERATION_RULES.
 * New specification roles are intentionally not introduced or inferred.
 */
export const LEGACY_ROLE_CAPABILITIES: Readonly<Record<AdminRoleId, readonly CapabilityId[]>> =
  Object.freeze(Object.fromEntries(
    ADMIN_ACCESS_ROLES.map(({ id: role }) => [
      role,
      Object.freeze(CAPABILITY_CATALOG
        .filter((capability) => capability.legacyRoleIds.includes(role))
        .map(({ id }) => id)),
    ]),
  ) as Record<AdminRoleId, readonly CapabilityId[]>);

export function getCapabilityDefinition(capabilityId: string): CapabilityDefinition | undefined {
  return CAPABILITY_CATALOG.find(({ id }) => id === capabilityId);
}

/**
 * Returns the current legacy role's descriptive capability projection.
 * Unknown/future role IDs fail closed and return no capabilities.
 */
export function getLegacyRoleCapabilities(role: string): readonly CapabilityDefinition[] {
  if (!Object.prototype.hasOwnProperty.call(LEGACY_ROLE_CAPABILITIES, role)) return [];
  const capabilityIds = new Set(LEGACY_ROLE_CAPABILITIES[role as AdminRoleId]);
  return CAPABILITY_CATALOG.filter(({ id }) => capabilityIds.has(id));
}

/**
 * Compatibility lookup only. Never use this helper as a server authorization
 * check; RPC authorization and PostgreSQL RLS remain authoritative.
 */
export function legacyRoleHasCapability(role: string, capabilityId: string): boolean {
  if (!Object.prototype.hasOwnProperty.call(LEGACY_ROLE_CAPABILITIES, role)) return false;
  return LEGACY_ROLE_CAPABILITIES[role as AdminRoleId].includes(capabilityId as CapabilityId);
}
