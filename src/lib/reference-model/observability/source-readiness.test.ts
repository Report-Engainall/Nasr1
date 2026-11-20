import { describe, expect, it } from "vitest";
import { REFERENCE_SOURCE_READINESS } from "./source-readiness";

describe("reference model source readiness", () => {
  it("separates the persisted prompt governance source from remaining blocked contracts", () => {
    expect(REFERENCE_SOURCE_READINESS).toHaveLength(4);
    expect(REFERENCE_SOURCE_READINESS.map((item) => item.id)).toEqual([
      "ai_audit",
      "prompt_persistence",
      "error_log",
      "developer_tools",
    ]);
    expect(REFERENCE_SOURCE_READINESS.map((item) => item.status)).toEqual([
      "PERSISTENT_SOURCE_ADMIN_MANAGER_READ_ONLY",
      "PERSISTENT_SOURCE_ADMIN_ONLY",
      "BLOCKED_NO_PERSISTENT_SOURCE",
      "BLOCKED_NO_SAFE_REPOSITORY_READ_SOURCE",
    ]);
  });

  it("records the bounded tenant-derived AI audit read model and its redaction boundary", () => {
    const audit = REFERENCE_SOURCE_READINESS.find((item) => item.id === "ai_audit");
    expect(audit?.source).toContain("public.list_ai_gateway_audit()");
    expect(audit?.status).toBe("PERSISTENT_SOURCE_ADMIN_MANAGER_READ_ONLY");
    expect(audit?.detail).toMatch(/يستبعد نص السؤال والإجابة/);
  });

  it("records prompt storage as persistent but restricted to the server-enforced admin lifecycle", () => {
    const prompts = REFERENCE_SOURCE_READINESS.find((item) => item.id === "prompt_persistence");
    expect(prompts?.status).toBe("PERSISTENT_SOURCE_ADMIN_ONLY");
    expect(prompts?.source).toContain("public.ai_prompt_versions");
    expect(prompts?.detail).toMatch(/append-only/);
    expect(prompts?.detail).toMatch(/جلسة Auth نشطة/);
  });
});
