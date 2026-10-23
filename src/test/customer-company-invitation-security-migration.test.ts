import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migrationPath = join(
  process.cwd(),
  "supabase",
  "migrations",
  "20261022130000_customer_company_invitation_sha256_auth_confirmation.sql",
);
const migration = readFileSync(migrationPath, "utf8");

describe("company invitation cryptographic and verified-email migration", () => {
  it("stores newly created invitation tokens as 64-character SHA-256 digests", () => {
    expect(migration).toMatch(/customer_company_invitation_sha256\(v_token\)/i);
    expect(migration).toContain("pg_catalog.to_regprocedure(pg_catalog.format('%I.digest(text,text)',v_crypto_schema))");
    expect(migration).not.toMatch(/public\.digest/i);
    expect(migration).toMatch(/token_hash\s+~\s+'\^\(\[0-9a-f\]\{32\}\|\[0-9a-f\]\{64\}\)\$'/i);
    expect(migration).not.toMatch(/VALUES\([\s\S]{0,350}?pg_catalog\.md5\(v_token\)/i);
  });

  it("keeps legacy pending MD5 invitations redeemable without using MD5 for new writes", () => {
    expect(migration).toMatch(/token_hash\s+IN\s*\([\s\S]*?customer_company_invitation_sha256\(pg_catalog\.lower\(p_token\)\)[\s\S]*?pg_catalog\.md5\(pg_catalog\.lower\(p_token\)\)/i);
    expect(migration).toMatch(/DROP CONSTRAINT IF EXISTS customer_company_invitations_token_hash_check/i);
    expect(migration).toMatch(/ADD CONSTRAINT customer_company_invitations_token_hash_check/i);
    expect(migration).not.toMatch(/encode\(public\.digest\(v_token[^)]*\)\)[\s\S]{0,100}?md5\(v_token\)/i);
  });

  it("requires auth.users confirmation and a persistent email match rather than a JWT confirmation claim", () => {
    expect(migration).toMatch(/FROM auth\.users u\s+WHERE u\.id\s*=\s*auth\.uid\(\)\s+AND u\.email_confirmed_at\s+IS NOT NULL/i);
    expect(migration).toMatch(/v_confirmed_email\s*<>\s*v_invitation\.invited_email/i);
    expect(migration).not.toContain("auth.jwt()->>'email_confirmed_at'");
  });

  it("preserves the locked-down tenant-scoped SECURITY DEFINER RPC and audit contracts", () => {
    for (const fn of [
      "create_customer_company_invitation(text,text)",
      "accept_customer_company_invitation(text)",
    ]) {
      expect(migration).toContain(`REVOKE ALL ON FUNCTION public.${fn} FROM PUBLIC,anon`);
      expect(migration).toContain(`GRANT EXECUTE ON FUNCTION public.${fn} TO authenticated`);
    }
    expect(migration).toMatch(/SECURITY DEFINER\s+SET search_path\s*=\s*''/i);
    expect(migration).toContain("customer_company_invitation.created");
    expect(migration).toContain("customer_company_invitation.accepted");
    expect(migration).toContain("REVOKE ALL ON FUNCTION public.customer_company_invitation_sha256(text) FROM PUBLIC,anon,authenticated");
    expect(migration).toContain("v_org IS DISTINCT FROM v_invitation.organization_id");
    expect(migration).toContain("ARRAY['admin','manager','staff','accountant']");
  });
});
