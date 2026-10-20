import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  join(process.cwd(), "supabase/migrations/20261020180000_import_job_request_idempotency.sql"),
  "utf8",
);
const api = readFileSync(join(process.cwd(), "src/lib/api.ts"), "utf8");
const importer = readFileSync(join(process.cwd(), "src/components/UnifiedImportEngine.tsx"), "utf8");
const requestKeyHelper = readFileSync(join(process.cwd(), "src/lib/import-request-key.ts"), "utf8");
const functionBody = migration.match(
  /CREATE OR REPLACE FUNCTION public\.create_import_job_idempotent\([\s\S]*?\$function\$;/i,
)?.[0] ?? "";

describe("import request idempotency contract", () => {
  it("scopes the private request-key claim to active tenant and actor, not file hash alone", () => {
    expect(migration).toMatch(
      /PRIMARY KEY\s*\(organization_id, actor_profile_id, request_key\)/i,
    );
    expect(migration).toMatch(/organization_id uuid NOT NULL REFERENCES public\.organizations/i);
    expect(migration).toMatch(/actor_profile_id uuid NOT NULL REFERENCES public\.profiles/i);
    expect(migration).toMatch(/request_payload jsonb NOT NULL/i);
    expect(migration).toMatch(/import_job_id uuid REFERENCES public\.import_jobs\(id\) ON DELETE CASCADE/i);
    expect(migration).toMatch(/ALTER TABLE public\.import_job_request_keys ENABLE ROW LEVEL SECURITY;/i);
    expect(migration).toMatch(
      /REVOKE ALL ON TABLE public\.import_job_request_keys FROM PUBLIC, anon, authenticated, service_role;/i,
    );
    expect(migration).not.toMatch(
      /GRANT\s+(?:SELECT|INSERT|UPDATE|DELETE|ALL)[\s\S]{0,160}?ON TABLE public\.import_job_request_keys TO\s+(?:PUBLIC|anon|authenticated|service_role)\b/i,
    );
  });

  it("exposes one authenticated SECURITY DEFINER command with an empty search path", () => {
    expect(functionBody).toMatch(/SECURITY DEFINER/i);
    expect(functionBody).toMatch(/SET search_path\s*=\s*''/i);
    expect(migration).toMatch(
      /REVOKE ALL ON FUNCTION public\.create_import_job_idempotent\(uuid,text,text,bigint,text,uuid,text,text,text\) FROM PUBLIC, anon;/i,
    );
    expect(migration).toMatch(
      /GRANT EXECUTE ON FUNCTION public\.create_import_job_idempotent\(uuid,text,text,bigint,text,uuid,text,text,text\) TO authenticated;/i,
    );
    expect(migration).not.toMatch(
      /GRANT EXECUTE ON FUNCTION public\.create_import_job_idempotent\([^;]+\) TO anon;/i,
    );
  });

  it("atomically claims a scoped key and returns the original job only for an identical payload", () => {
    expect(functionBody).toMatch(
      /INSERT INTO public\.import_job_request_keys[\s\S]*?ON CONFLICT \(organization_id, actor_profile_id, request_key\) DO NOTHING/i,
    );
    expect(functionBody).toMatch(/SELECT k\.\* INTO v_existing[\s\S]*?FOR UPDATE/i);
    expect(functionBody).toMatch(/v_existing\.request_payload IS DISTINCT FROM v_payload/i);
    expect(functionBody).toMatch(/v_existing\.import_job_id IS NULL/i);
    expect(functionBody).toMatch(/RETURN v_job;/i);
    expect(functionBody).toMatch(/public\.create_import_job\([\s\S]*?\)/i);
    expect(functionBody).toMatch(/UPDATE public\.import_job_request_keys[\s\S]*?SET import_job_id = v_job_id/i);
  });

  it("keeps intentional duplicate actions distinct and rejects key reuse across intents", () => {
    expect(functionBody).toMatch(
      /COALESCE\(p_intent, ''\) NOT IN \('replace', 'merge', 'new_version'\)/i,
    );
    expect(functionBody).toMatch(/'intent', p_intent/i);
    expect(functionBody).toMatch(/'file_hash', p_file_hash/i);
    expect(api).toContain("'create_import_job_idempotent'");
    expect(api).toContain("p_request_key: input.requestKey ?? crypto.randomUUID()");
    expect(api).toContain("p_intent: input.intent ?? 'new_version'");
    expect(requestKeyHelper).toContain("sessionStorage");
    expect(requestKeyHelper).toContain("actorId: identity.actorId");
    expect(requestKeyHelper).toMatch(/IMPORT_REQUEST_KEY_TTL_MS = 60 \* 60 \* 1000/);
    expect(importer).toContain("getOrCreateImportRequestKey");
    expect(importer).toContain("actorId: authUserId");
    expect(importer).toContain("requestKey: requestAttempt.requestKey");
    expect(importer).toMatch(/completeImportRequestKey\(requestAttempt\.storageKey\)/);
    expect(importer).not.toMatch(/requestKey:\s*crypto\.randomUUID\(\)/);
    expect(importer).toMatch(/intent:\s*action/);
  });

  it("revalidates authenticated active staff and the profile-derived tenant", () => {
    expect(functionBody).toMatch(/auth\.uid\(\) IS NULL[\s\S]*?public\.is_staff\(\)/i);
    expect(functionBody).toMatch(/p\.auth_user_id = auth\.uid\(\)/i);
    expect(functionBody).toMatch(/p\.is_active = true/i);
    expect(functionBody).toMatch(/SELECT p\.organization_id INTO v_org/i);
    expect(functionBody).toMatch(/p_request_key IS NULL/i);
  });
});
