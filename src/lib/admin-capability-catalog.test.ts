import { describe, expect, it } from "vitest";
import {
  ADMIN_ACCESS_ROLES,
  ADMIN_NAV_GROUPS,
  ADMIN_NAV_ITEMS,
  ADMIN_OPERATION_RULES,
  ROLE_PAGE_ACCESS,
  operationAllowed,
  roleCanAccessView,
} from "@/lib/admin-access-matrix";
import {
  LEGACY_AUTHORIZATION_CAPABILITY_CATALOG,
  LEGACY_AUTHORIZATION_CATALOG_AUTHORITY,
  LEGACY_AUTHORIZATION_CATALOG_VERSION,
  LEGACY_AUTHORIZATION_PAGE_GROUPS,
  LEGACY_AUTHORIZATION_ROLE_IDS,
  getLegacyCapabilityBaselineDecision,
  getLegacyPageBaselineDecision,
  getLegacyRoleAccessSnapshot,
} from "@/lib/admin-capability-catalog";

const expectedLegacyRoles = [
  "admin",
  "manager",
  "staff",
  "accountant",
  "customer_manager",
  "customer",
] as const;

describe("legacy authorization capability catalog", () => {
  it("declares a versioned reference-only catalog and preserves the six server role IDs", () => {
    expect(LEGACY_AUTHORIZATION_CATALOG_VERSION).toBe("legacy-role-parity-v1");
    expect(LEGACY_AUTHORIZATION_CATALOG_AUTHORITY).toBe("legacy-ui-reference-only");
    expect(LEGACY_AUTHORIZATION_ROLE_IDS).toEqual(expectedLegacyRoles);
    expect(ADMIN_ACCESS_ROLES.map((role) => role.id)).toEqual(expectedLegacyRoles);
    expect(new Set(LEGACY_AUTHORIZATION_ROLE_IDS).size).toBe(6);
  });

  it("maps every legacy operation to one unique resource/action capability descriptor", () => {
    const sourceIds = ADMIN_OPERATION_RULES.map((rule) => rule.id);
    const catalogIds = LEGACY_AUTHORIZATION_CAPABILITY_CATALOG.map((item) => item.id);

    expect(new Set(sourceIds).size).toBe(sourceIds.length);
    expect(new Set(catalogIds).size).toBe(catalogIds.length);
    expect(catalogIds).toEqual(sourceIds);
    expect(LEGACY_AUTHORIZATION_CAPABILITY_CATALOG).toHaveLength(ADMIN_OPERATION_RULES.length);

    for (const definition of LEGACY_AUTHORIZATION_CAPABILITY_CATALOG) {
      const source = ADMIN_OPERATION_RULES.find((rule) => rule.id === definition.id);
      expect(source).toBeDefined();
      expect(definition.resource.trim().length).toBeGreaterThan(0);
      expect(definition.action.trim().length).toBeGreaterThan(0);
      expect(definition.label).toBe(source?.label);
      expect(definition.area).toBe(source?.area);
      expect(definition.legacyLimit).toBe(source?.limit);
      expect(definition.legacyAllowedRoles).toEqual(source?.allowedRoles);
      expect(definition.authority).toBe("legacy-ui-reference-only");
    }
  });

  it("proves capability decisions are identical to the current legacy operation matrix for all six roles", () => {
    for (const role of ADMIN_ACCESS_ROLES) {
      for (const operation of ADMIN_OPERATION_RULES) {
        const decision = getLegacyCapabilityBaselineDecision(role.id, operation.id);
        expect(decision.decision === "allow").toBe(operationAllowed(role.id, operation.id));
        expect(decision.reason.trim().length).toBeGreaterThan(0);
        expect(decision.authority).toBe("legacy-ui-reference-only");
      }
    }
  });

  it("captures complete page and operation snapshots without changing legacy role grants", () => {
    const registeredPages = ADMIN_NAV_GROUPS.flatMap((group) => [...group.views]);
    expect(new Set(registeredPages).size).toBe(registeredPages.length);
    expect(ADMIN_NAV_ITEMS.map((item) => item.id)).toEqual(registeredPages);
    expect(LEGACY_AUTHORIZATION_PAGE_GROUPS.map((group) => group.id)).toEqual(
      ADMIN_NAV_GROUPS.map((group) => group.id),
    );

    for (const role of ADMIN_ACCESS_ROLES) {
      const snapshot = getLegacyRoleAccessSnapshot(role.id);
      expect(snapshot.knownRole).toBe(true);
      expect(snapshot.roleId).toBe(role.id);
      expect(snapshot.pageIds).toEqual(ROLE_PAGE_ACCESS[role.id]);
      expect(snapshot.capabilityIds).toEqual(
        ADMIN_OPERATION_RULES.filter((item) => item.allowedRoles.includes(role.id)).map((item) => item.id),
      );

      for (const pageId of registeredPages) {
        expect(getLegacyPageBaselineDecision(role.id, pageId).decision === "allow")
          .toBe(roleCanAccessView(role.id, pageId));
      }
    }
  });

  it("defaults unknown roles and unknown capabilities/pages to deny without role aliases", () => {
    const unknownRole = getLegacyRoleAccessSnapshot("developer");
    expect(unknownRole.knownRole).toBe(false);
    expect(unknownRole.roleId).toBeNull();
    expect(unknownRole.pageIds).toEqual([]);
    expect(unknownRole.capabilityIds).toEqual([]);
    expect(getLegacyCapabilityBaselineDecision("developer", "finance_manage").decision).toBe("deny");
    expect(getLegacyCapabilityBaselineDecision("staff", "finance.post").decision).toBe("deny");
    expect(getLegacyPageBaselineDecision("developer", "finance").decision).toBe("deny");
    expect(getLegacyPageBaselineDecision("admin", "root-console").decision).toBe("deny");
  });

  it("keeps capability catalog membership in the legacy six-role universe", () => {
    const known = new Set<string>(expectedLegacyRoles);
    for (const definition of LEGACY_AUTHORIZATION_CAPABILITY_CATALOG) {
      expect(definition.legacyAllowedRoles.every((role) => known.has(role))).toBe(true);
    }
  });
});
