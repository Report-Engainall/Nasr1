import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const invitationMigration = readFileSync(join(process.cwd(), "supabase", "migrations", "20261023130000_customer_manager_activation_permissions.sql"), "utf8");
const roleMigration = readFileSync(join(process.cwd(), "supabase", "migrations", "20261023120000_customer_manager_role_scope.sql"), "utf8");

describe("customer-manager activation invitation permissions", () => {
  const names = [
    "create_customer_activation_invitation",
    "list_customer_activation_invitations",
    "revoke_customer_activation_invitation",
  ] as const;

  it("redefines management RPCs only and does not broaden the customer acceptance RPC", () => {
    for (const name of names) {
      expect(invitationMigration).toContain("CREATE OR REPLACE FUNCTION public." + name + "(");
      expect(invitationMigration).toMatch(new RegExp("GRANT EXECUTE ON FUNCTION public\\." + name + "\\("));
    }
    expect(invitationMigration).not.toContain("CREATE OR REPLACE FUNCTION public.accept_customer_activation_invitation(");
    expect(invitationMigration).not.toContain("CREATE OR REPLACE FUNCTION public.is_staff()");
  });

  it("checks an active profile in the authenticated tenant and the explicit role", () => {
    for (const name of names) {
      const re = new RegExp("^CREATE OR REPLACE FUNCTION public\\." + name + "\\([\\s\\S]*?^\\$function\\$;", "mi");
      const block = invitationMigration.match(re)?.[0];
      expect(block, "missing replacement function " + name).toBeTruthy();
      expect(block).toMatch(/p\.auth_user_id=auth\.uid\(\)/i);
      expect(block).toMatch(/p\.organization_id=v_org_id AND p\.is_active=true/i);
      expect(block).toMatch(/r\.role IN \('admin','manager','staff','customer_manager'\)/i);
      expect(block).not.toMatch(/NOT public\.is_staff\(\)/i);
    }
    expect(roleMigration).toMatch(/'can_manage_customers'[\s\S]*?'customer_manager'/i);
  });

  it("retains RPC-only access and the existing SHA-256 token-hash contract", () => {
    expect(invitationMigration).toMatch(/REVOKE ALL ON FUNCTION public\.create_customer_activation_invitation\(uuid,text,integer\) FROM PUBLIC,anon;/i);
    expect(invitationMigration).toMatch(/REVOKE ALL ON FUNCTION public\.list_customer_activation_invitations\(uuid\) FROM PUBLIC,anon;/i);
    expect(invitationMigration).toMatch(/REVOKE ALL ON FUNCTION public\.revoke_customer_activation_invitation\(uuid\) FROM PUBLIC,anon;/i);
    expect(invitationMigration).toMatch(/public\.digest\(v_token, 'sha256'\)/i);
  });
});
