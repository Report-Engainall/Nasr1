import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migrationPath = join(
  process.cwd(),
  "supabase",
  "migrations",
  "20261020110000_customer_activation_invitations.sql",
);
const migration = readFileSync(migrationPath, "utf8");

const activationFunctions = [
  "create_customer_activation_invitation",
  "list_customer_activation_invitations",
  "revoke_customer_activation_invitation",
  "accept_customer_activation_invitation",
] as const;

describe("customer activation invitation migration security contract", () => {
  it("keeps row security enabled and denies direct table access to client roles", () => {
    expect(migration).toMatch(
      /ALTER TABLE public\.customer_activation_invitations ENABLE ROW LEVEL SECURITY;/i,
    );
    expect(migration).toMatch(
      /REVOKE ALL ON TABLE public\.customer_activation_invitations FROM PUBLIC,\s*anon,\s*authenticated;/i,
    );
    expect(migration).toMatch(
      /GRANT ALL ON TABLE public\.customer_activation_invitations TO service_role;/i,
    );
    expect(migration).not.toMatch(
      /GRANT\s+(?:SELECT|INSERT|UPDATE|DELETE|ALL)[\s\S]{0,180}?ON TABLE public\.customer_activation_invitations TO\s+(?:PUBLIC|anon|authenticated)\b/i,
    );
  });

  it("exposes only the four SECURITY DEFINER RPCs with an empty search path", () => {
    const blocks = [
      ...migration.matchAll(
        /^CREATE OR REPLACE FUNCTION public\.(create_customer_activation_invitation|list_customer_activation_invitations|revoke_customer_activation_invitation|accept_customer_activation_invitation)\([\s\S]*?^\$function\$;/gim,
      ),
    ].map((match) => match[0]);

    expect(blocks).toHaveLength(activationFunctions.length);
    for (const functionName of activationFunctions) {
      const block = blocks.find((candidate) =>
        candidate.includes(`FUNCTION public.${functionName}(`),
      );
      expect(block, `missing function body for ${functionName}`).toBeTruthy();
      expect(block).toMatch(/SECURITY DEFINER/i);
      expect(block).toMatch(/SET search_path = ''/i);
    }
  });

  it("revokes public/anonymous execution and grants only authenticated execution for each activation RPC", () => {
    const signatures: Record<(typeof activationFunctions)[number], string> = {
      create_customer_activation_invitation: "uuid,text,integer",
      list_customer_activation_invitations: "uuid",
      revoke_customer_activation_invitation: "uuid",
      accept_customer_activation_invitation: "text",
    };

    for (const functionName of activationFunctions) {
      const signature = signatures[functionName];
      expect(migration).toContain(
        `REVOKE ALL ON FUNCTION public.${functionName}(${signature}) FROM PUBLIC,anon;`,
      );
      expect(migration).toContain(
        `GRANT EXECUTE ON FUNCTION public.${functionName}(${signature}) TO authenticated;`,
      );
      expect(migration).not.toContain(
        `GRANT EXECUTE ON FUNCTION public.${functionName}(${signature}) TO anon;`,
      );
    }
  });

  it("stores only a SHA-256 token hash and bounds invitation lifetime", () => {
    expect(migration).toMatch(/token_hash text NOT NULL UNIQUE CHECK \(token_hash ~ '\^\[0-9a-f\]\{64\}\$'\)/i);
    expect(migration).toMatch(/public\.digest\(v_token, 'sha256'\)/i);
    expect(migration).toMatch(
      /token_hash=pg_catalog\.encode\(public\.digest\(pg_catalog\.lower\(pg_catalog\.btrim\(p_token\)\), 'sha256'\), 'hex'\)/i,
    );
    expect(migration).toMatch(/p_expires_hours < 1 OR p_expires_hours > 168/i);
    expect(migration).toMatch(/customer_activation_invitations_one_pending_customer_idx[\s\S]*?WHERE status='pending'/i);
  });

  it("validates confirmed email, tenant, customer eligibility and single-use state server-side", () => {
    expect(migration).toMatch(/FROM auth\.users AS u[\s\S]*?u\.id=auth\.uid\(\)[\s\S]*?u\.email_confirmed_at IS NOT NULL/i);
    expect(migration).toMatch(/IF auth\.uid\(\) IS NULL[\s\S]*?OR NOT public\.is_staff\(\)/i);
    expect(migration).toMatch(/OR public\.is_staff\(\)/i);
    expect(migration).toMatch(/v_auth_email <> v_invitation\.invited_email/i);
    expect(migration).toMatch(/v_org_id IS DISTINCT FROM v_invitation\.organization_id/i);
    expect(migration).toMatch(/v_customer\.status <> 'approved'/i);
    expect(migration).toMatch(/v_customer\.profile_id IS NOT NULL/i);
    expect(migration).toMatch(/v_invitation\.status <> 'pending' OR v_invitation\.expires_at <= pg_catalog\.now\(\)/i);
  });

  it("records create, revoke and accept actions in the audit log", () => {
    for (const action of [
      "customer_activation_invitation.created",
      "customer_activation_invitation.revoked",
      "customer_activation_invitation.accepted",
    ]) {
      expect(migration).toContain(action);
    }
    expect(migration.match(/INSERT INTO public\.audit_logs/gi)).toHaveLength(3);
  });
});
