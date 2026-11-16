import {
  ADMIN_ACCESS_ROLES,
  ADMIN_NAV_GROUPS,
  ADMIN_NAV_ITEMS,
  ADMIN_OPERATION_RULES,
  ROLE_PAGE_ACCESS,
  operationAllowed,
  operationDenialReason,
  pageAccessReason,
  roleCanAccessView,
  type AdminOperationId,
  type AdminRoleId,
  type AdminViewId,
} from "./admin-access-matrix";

/**
 * Transitional capability vocabulary derived from the current six-role contract.
 *
 * This is a parity/catalog layer only. It does not authorize server requests,
 * replace RPC/RLS checks, add roles, or change the legacy UI policy.
 */
export const LEGACY_AUTHORIZATION_CATALOG_VERSION = "legacy-role-parity-v1" as const;
export const LEGACY_AUTHORIZATION_CATALOG_AUTHORITY = "legacy-ui-reference-only" as const;

export type CapabilitySensitivity =
  | "commercial"
  | "catalog"
  | "inventory"
  | "customer"
  | "financial"
  | "identity"
  | "operational"
  | "data"
  | "audit";

export type CapabilityResource =
  | "pricing_rule"
  | "product"
  | "inventory_policy"
  | "inventory_transfer"
  | "stock_count"
  | "customer"
  | "customer_account"
  | "import_batch"
  | "purchase_order"
  | "operational_task"
  | "finance_workspace"
  | "organization_role_assignment"
  | "audit_and_intelligence";

export type CapabilityAction =
  | "edit_existing"
  | "submit_for_approval"
  | "approve"
  | "archive_or_restore"
  | "change_reorder_point"
  | "transfer_stock"
  | "edit_count_draft"
  | "finalize_or_cancel"
  | "change_lifecycle"
  | "activate_or_invite"
  | "read_customer_360"
  | "stage_upload_and_preview"
  | "approve_and_publish"
  | "manage_and_receive"
  | "update_status"
  | "manage_invoice_and_collection"
  | "assign_role"
  | "read_audit_and_intelligence";

type CapabilityMetadata = Readonly<{
  resource: CapabilityResource;
  action: CapabilityAction;
  sensitivity: CapabilitySensitivity;
}>;

/**
 * Exhaustive metadata map: every legacy operation receives exactly one
 * resource/action descriptor. Role grants remain sourced from
 * ADMIN_OPERATION_RULES and are never restated here.
 */
const CAPABILITY_METADATA: Readonly<Record<AdminOperationId, CapabilityMetadata>> = {
  pricing_rules_write: {
    resource: "pricing_rule",
    action: "edit_existing",
    sensitivity: "commercial",
  },
  pricing_rule_submit: {
    resource: "pricing_rule",
    action: "submit_for_approval",
    sensitivity: "commercial",
  },
  pricing_rules_approve: {
    resource: "pricing_rule",
    action: "approve",
    sensitivity: "commercial",
  },
  product_lifecycle: {
    resource: "product",
    action: "archive_or_restore",
    sensitivity: "catalog",
  },
  inventory_reorder_point: {
    resource: "inventory_policy",
    action: "change_reorder_point",
    sensitivity: "inventory",
  },
  inventory_transfer: {
    resource: "inventory_transfer",
    action: "transfer_stock",
    sensitivity: "inventory",
  },
  stock_count_edit: {
    resource: "stock_count",
    action: "edit_count_draft",
    sensitivity: "inventory",
  },
  stock_count_finalize: {
    resource: "stock_count",
    action: "finalize_or_cancel",
    sensitivity: "inventory",
  },
  customer_lifecycle: {
    resource: "customer",
    action: "change_lifecycle",
    sensitivity: "customer",
  },
  customer_activation: {
    resource: "customer_account",
    action: "activate_or_invite",
    sensitivity: "identity",
  },
  customer_360: {
    resource: "customer",
    action: "read_customer_360",
    sensitivity: "financial",
  },
  imports_stage: {
    resource: "import_batch",
    action: "stage_upload_and_preview",
    sensitivity: "data",
  },
  imports_finalize: {
    resource: "import_batch",
    action: "approve_and_publish",
    sensitivity: "data",
  },
  purchase_orders_manage: {
    resource: "purchase_order",
    action: "manage_and_receive",
    sensitivity: "financial",
  },
  operational_task_status: {
    resource: "operational_task",
    action: "update_status",
    sensitivity: "operational",
  },
  finance_manage: {
    resource: "finance_workspace",
    action: "manage_invoice_and_collection",
    sensitivity: "financial",
  },
  role_assignment: {
    resource: "organization_role_assignment",
    action: "assign_role",
    sensitivity: "identity",
  },
  audit_intelligence: {
    resource: "audit_and_intelligence",
    action: "read_audit_and_intelligence",
    sensitivity: "audit",
  },
};

type LegacyOperationRule = (typeof ADMIN_OPERATION_RULES)[number];
const definitionById = new Map<AdminOperationId, LegacyCapabilityDefinition>();

export type LegacyCapabilityDefinition = Readonly<{
  id: AdminOperationId;
  resource: CapabilityResource;
  action: CapabilityAction;
  sensitivity: CapabilitySensitivity;
  label: string;
  area: string;
  legacyLimit: string;
  legacyAllowedRoles: readonly AdminRoleId[];
  authority: typeof LEGACY_AUTHORIZATION_CATALOG_AUTHORITY;
}>;

export const LEGACY_AUTHORIZATION_CAPABILITY_CATALOG: readonly LegacyCapabilityDefinition[] =
  Object.freeze(ADMIN_OPERATION_RULES.map((rule: LegacyOperationRule) => {
    const metadata = CAPABILITY_METADATA[rule.id];
    const definition: LegacyCapabilityDefinition = Object.freeze({
      id: rule.id,
      ...metadata,
      label: rule.label,
      area: rule.area,
      legacyLimit: rule.limit,
      // Copy and freeze the existing policy list; no independent grant table is created.
      legacyAllowedRoles: Object.freeze([...rule.allowedRoles]),
      authority: LEGACY_AUTHORIZATION_CATALOG_AUTHORITY,
    });
    definitionById.set(definition.id, definition);
    return definition;
  }));

export const LEGACY_AUTHORIZATION_ROLE_IDS: readonly AdminRoleId[] = Object.freeze(
  ADMIN_ACCESS_ROLES.map((role) => role.id),
);

export type LegacyRoleAccessSnapshot = Readonly<{
  roleId: AdminRoleId | null;
  knownRole: boolean;
  pageIds: readonly AdminViewId[];
  capabilityIds: readonly AdminOperationId[];
  authority: typeof LEGACY_AUTHORIZATION_CATALOG_AUTHORITY;
}>;

export type LegacyCapabilityBaselineDecision = Readonly<{
  roleId: string;
  capabilityId: string;
  decision: "allow" | "deny";
  reason: string;
  authority: typeof LEGACY_AUTHORIZATION_CATALOG_AUTHORITY;
}>;

export type LegacyPageBaselineDecision = Readonly<{
  roleId: string;
  pageId: string;
  decision: "allow" | "deny";
  reason: string;
  authority: typeof LEGACY_AUTHORIZATION_CATALOG_AUTHORITY;
}>;

function isLegacyRole(roleId: string): roleId is AdminRoleId {
  return ADMIN_ACCESS_ROLES.some((role) => role.id === roleId);
}

function isRegisteredPage(pageId: string): pageId is AdminViewId {
  return ADMIN_NAV_ITEMS.some((item) => item.id === pageId);
}

/**
 * Immutable read-only snapshot of current legacy page and operation grants.
 * Unknown role IDs return an empty deny baseline; no role aliasing is inferred.
 */
export function getLegacyRoleAccessSnapshot(roleId: string): LegacyRoleAccessSnapshot {
  if (!isLegacyRole(roleId)) {
    return Object.freeze({
      roleId: null,
      knownRole: false,
      pageIds: Object.freeze([] as AdminViewId[]),
      capabilityIds: Object.freeze([] as AdminOperationId[]),
      authority: LEGACY_AUTHORIZATION_CATALOG_AUTHORITY,
    });
  }

  const capabilityIds = LEGACY_AUTHORIZATION_CAPABILITY_CATALOG
    .filter((definition) => definition.legacyAllowedRoles.includes(roleId))
    .map((definition) => definition.id);

  return Object.freeze({
    roleId,
    knownRole: true,
    pageIds: Object.freeze([...ROLE_PAGE_ACCESS[roleId]]),
    capabilityIds: Object.freeze(capabilityIds),
    authority: LEGACY_AUTHORIZATION_CATALOG_AUTHORITY,
  });
}

/**
 * Explains the existing UI-policy decision for parity review only.
 * It is not an RPC guard and must not be used as server authorization.
 */
export function getLegacyCapabilityBaselineDecision(
  roleId: string,
  capabilityId: string,
): LegacyCapabilityBaselineDecision {
  const definition = definitionById.get(capabilityId as AdminOperationId);
  let decision: "allow" | "deny" = "deny";
  let reason = "Unknown capability; access is denied by the legacy baseline.";

  if (!isLegacyRole(roleId)) {
    reason = "Unknown role; access is denied by the legacy baseline.";
  } else if (definition) {
    decision = operationAllowed(roleId, definition.id) ? "allow" : "deny";
    reason = decision === "allow"
      ? definition.legacyLimit
      : operationDenialReason(roleId, definition.id);
  }

  return Object.freeze({
    roleId,
    capabilityId,
    decision,
    reason,
    authority: LEGACY_AUTHORIZATION_CATALOG_AUTHORITY,
  });
}

/**
 * Explains the existing page-visibility matrix for parity review only.
 * Server route guards, RPC authorization and RLS remain authoritative.
 */
export function getLegacyPageBaselineDecision(
  roleId: string,
  pageId: string,
): LegacyPageBaselineDecision {
  let decision: "allow" | "deny" = "deny";
  let reason = "Unknown page; access is denied by the legacy baseline.";

  if (!isLegacyRole(roleId)) {
    reason = "Unknown role; access is denied by the legacy baseline.";
  } else if (isRegisteredPage(pageId)) {
    decision = roleCanAccessView(roleId, pageId) ? "allow" : "deny";
    reason = pageAccessReason(roleId, pageId);
  }

  return Object.freeze({
    roleId,
    pageId,
    decision,
    reason,
    authority: LEGACY_AUTHORIZATION_CATALOG_AUTHORITY,
  });
}

/**
 * Registered admin pages grouped exactly as the current navigation source.
 * This is exposed for traceability and tests, not for granting access.
 */
export const LEGACY_AUTHORIZATION_PAGE_GROUPS = Object.freeze(
  ADMIN_NAV_GROUPS.map((group) => Object.freeze({
    id: group.id,
    pageIds: Object.freeze([...group.views]),
  })),
);
