import { describe, expect, it } from "vitest";
import {
  activatePromptVersion,
  approvePromptVersion,
  createPromptDraft,
  rejectPromptVersion,
  retirePromptVersion,
  submitPromptVersionForApproval,
  type AiPromptVersion,
  type PromptGovernanceActor,
} from "./ai-prompt-governance";

const createdAt = "2026-11-09T18:00:00.000Z";
const actor = (profileId: string, roles: string[] = ["admin"], organizationId = "org-a"): PromptGovernanceActor => ({
  profileId, organizationId, roles, active: true,
});
const create = (id = "prompt-version-1", existing: AiPromptVersion[] = []) =>
  createPromptDraft(existing, actor("creator"), {
    id, eventId: "event-created-" + id, promptKey: "assistant.system",
    content: "أجب بالعربية ولا تخمّن بيانات الأعمال. استخدم الأدلة الموثقة فقط.",
  }, createdAt);
const pending = async () => {
  const draft = await create();
  return submitPromptVersionForApproval(draft.version, actor("creator"), "event-submit", "2026-11-09T18:05:00.000Z");
};
const approved = async () => {
  const queued = await pending();
  return approvePromptVersion(
    queued.version, actor("reviewer"), "event-approve",
    "2026-11-09T18:10:00.000Z", "تمت مراجعة السياسة والخصوصية",
  );
};

describe("AI prompt version governance", () => {
  it("creates sequential drafts with a SHA-256 fingerprint and creation audit", async () => {
    const first = await create("v1");
    const second = await create("v2", [first.version]);
    expect(first.version.version).toBe(1);
    expect(second.version.version).toBe(2);
    expect(first.version.contentSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(first.event.action).toBe("CREATED");
    expect(first.version.status).toBe("DRAFT");
  });

  it("denies non-admin and inactive actors", async () => {
    await expect(createPromptDraft([], actor("staff", ["staff"]), {
      id: "v1", eventId: "e1", promptKey: "assistant.system",
      content: "محتوى توجيه عربي صالح وطويل بما يكفي للاختبار.",
    }, createdAt)).rejects.toThrow("prompt_governance_admin_required");
    await expect(createPromptDraft([], { ...actor("creator"), active: false }, {
      id: "v1", eventId: "e1", promptKey: "assistant.system",
      content: "محتوى توجيه عربي صالح وطويل بما يكفي للاختبار.",
    }, createdAt)).rejects.toThrow("prompt_governance_actor_scope_denied");
  });

  it("rejects invalid prompt keys, short prompts and embedded secrets", async () => {
    await expect(createPromptDraft([], actor("creator"), {
      id: "v1", eventId: "e1", promptKey: "Assistant System",
      content: "محتوى توجيه عربي صالح وطويل بما يكفي للاختبار.",
    }, createdAt)).rejects.toThrow("prompt_key_invalid");
    await expect(createPromptDraft([], actor("creator"), {
      id: "v1", eventId: "e1", promptKey: "assistant.system",
      content: "قصير",
    }, createdAt)).rejects.toThrow("prompt_content_length_invalid");
    await expect(createPromptDraft([], actor("creator"), {
      id: "v1", eventId: "e1", promptKey: "assistant.system",
      content: "متغير secret=abcdefghijklmno داخل التوجيه النصي",
    }, createdAt)).rejects.toThrow("prompt_content_secret_rejected");
  });

  it("rejects case-insensitive duplicate version identities across organizations", async () => {
    const first = await create("version-id");
    const crossTenantCopy = {
      ...first.version,
      id: first.version.id.toUpperCase(),
      organizationId: "org-b",
      promptKey: "assistant.other",
    };

    await expect(createPromptDraft([first.version, crossTenantCopy], actor("creator"), {
      id: "next-version",
      eventId: "next-event",
      promptKey: "assistant.other",
      content: "محتوى توجيه صالح لمؤسسة أخرى دون أي أسرار.",
    }, createdAt)).rejects.toThrow("prompt_version_identity_duplicate");
  });

  it("rejects ambiguous organization and prompt version sequences", async () => {
    const first = await create("version-one");
    const duplicateSequence = {
      ...first.version,
      id: "different-record-id",
    };

    await expect(createPromptDraft([first.version, duplicateSequence], actor("creator"), {
      id: "version-two",
      eventId: "version-two-event",
      promptKey: "assistant.system",
      content: "نسخة ثانية لا يجوز إنشاؤها فوق تاريخ ملتبس.",
    }, createdAt)).rejects.toThrow("prompt_version_sequence_duplicate");
  });

  it("rejects cross-tenant duplicate identities before prompt activation", async () => {
    const approvedPrompt = await approved();
    const duplicateIdentity = {
      ...approvedPrompt.version,
      id: approvedPrompt.version.id.toUpperCase(),
      organizationId: "org-b",
      promptKey: "assistant.other",
    };

    expect(() => activatePromptVersion(
      [approvedPrompt.version, duplicateIdentity],
      approvedPrompt.version.id,
      actor("operator"),
      "activate-duplicate",
      "2026-11-09T18:20:00.000Z",
      "محاولة تفعيل سجل ملتبس",
    )).toThrow("prompt_version_identity_duplicate");
  });

  it("requires a draft and the creator to submit it", async () => {
    const draft = await create();
    expect(() => submitPromptVersionForApproval(draft.version, actor("another-admin"), "e", createdAt))
      .toThrow("prompt_submit_transition_invalid");
  });

  it("requires four-eyes approval and rejection", async () => {
    const queued = (await pending()).version;
    expect(() => approvePromptVersion(queued, actor("creator"), "e", createdAt, "اعتماد"))
      .toThrow("prompt_four_eyes_required");
    expect(() => rejectPromptVersion(queued, actor("creator"), "e", createdAt, "رفض"))
      .toThrow("prompt_four_eyes_required");
  });

  it("denies approval from another organization", async () => {
    const queued = (await pending()).version;
    expect(() => approvePromptVersion(
      queued, actor("external-admin", ["admin"], "org-b"), "e",
      "2026-11-09T18:10:00.000Z", "اعتماد",
    )).toThrow("prompt_governance_actor_scope_denied");
  });

  it("records approver, timestamp, reason and audit transition", async () => {
    const result = await approved();
    expect(result.version).toMatchObject({
      status: "APPROVED", approvedByProfileId: "reviewer",
      approvedAt: "2026-11-09T18:10:00.000Z",
      decisionReason: "تمت مراجعة السياسة والخصوصية",
    });
    expect(result.event).toMatchObject({
      action: "APPROVED", actorProfileId: "reviewer",
      previousStatus: "PENDING_APPROVAL", nextStatus: "APPROVED",
    });
    expect(result.version.contentSha256).toMatch(/^[a-f0-9]{64}$/);
  });

  it("rejects a submitted prompt with a reason and retains the version hash", async () => {
    const queued = (await pending()).version;
    expect(() => rejectPromptVersion(queued, actor("reviewer"), "e", createdAt, " "))
      .toThrow("prompt_governance_reason_required");
    const rejected = rejectPromptVersion(queued, actor("reviewer"), "e2", createdAt, "بيانات غير موثقة");
    expect(rejected.version.status).toBe("REJECTED");
    expect(rejected.version.contentSha256).toBe(queued.contentSha256);
  });

  it("activates only an approved version and replaces one active version atomically in the pure result", async () => {
    const first = await approved();
    const firstActive = activatePromptVersion(
      [first.version], first.version.id, actor("operator"), "activate-1",
      "2026-11-09T18:20:00.000Z", "اعتماد النسخة الأولى",
    );
    expect(firstActive.versions[0].status).toBe("ACTIVE");

    // PostgreSQL UUID output is canonical, but history contracts must still
    // treat alternate UUID casing as the same tenant rather than a new scope.
    const caseVariantHistory = firstActive.versions.map(version => ({
      ...version,
      organizationId: version.organizationId.toUpperCase(),
    }));
    const secondDraft = await create("prompt-version-2", caseVariantHistory);
    expect(secondDraft.version.version).toBe(2);
    const secondPending = submitPromptVersionForApproval(secondDraft.version, actor("creator"), "submit-2", "2026-11-09T18:22:00.000Z");
    const secondApproved = approvePromptVersion(secondPending.version, actor("reviewer"), "approve-2", "2026-11-09T18:23:00.000Z", "اجتاز المراجعة");
    const result = activatePromptVersion(
      [...caseVariantHistory, secondApproved.version], secondApproved.version.id,
      actor("operator-2"), "activate-2", "2026-11-09T18:24:00.000Z", "استبدال النسخة النشطة",
    );
    expect(result.versions.filter(v => v.status === "ACTIVE")).toHaveLength(1);
    expect(result.versions.find(v => v.id === "prompt-version-1")?.status).toBe("APPROVED");
    expect(result.versions.find(v => v.id === "prompt-version-2")?.status).toBe("ACTIVE");
    expect(result.events.map(e => e.action)).toEqual(["DEACTIVATED", "ACTIVATED"]);
  });

  it("requires activation operator to be distinct from author and approver", async () => {
    const result = await approved();
    expect(() => activatePromptVersion([result.version], result.version.id, actor("creator"), "e", createdAt, "تشغيل"))
      .toThrow("prompt_activation_separation_required");
    expect(() => activatePromptVersion([result.version], result.version.id, actor("reviewer"), "e", createdAt, "تشغيل"))
      .toThrow("prompt_activation_separation_required");
  });

  it("fails closed when legacy history contains multiple active versions", async () => {
    const result = await approved();
    const active = activatePromptVersion([result.version], result.version.id, actor("operator"), "a1", "2026-11-09T18:20:00.000Z", "تشغيل");
    const duplicate = { ...active.versions[0], id: "historical-active-duplicate", version: 3 };
    const next = { ...result.version, id: "next", version: 2, status: "APPROVED" as const };
    expect(() => activatePromptVersion(
      [...active.versions, duplicate, next], "next", actor("operator-2"), "a2",
      "2026-11-09T18:21:00.000Z", "محاولة تشغيل",
    )).toThrow("prompt_multiple_active_versions");
  });

  it("prevents retirement of active and pending prompts", async () => {
    const queued = (await pending()).version;
    expect(() => retirePromptVersion(queued, actor("admin-2"), "e", createdAt, "إيقاف"))
      .toThrow("prompt_retirement_transition_invalid");
    const result = await approved();
    const active = activatePromptVersion(
      [result.version], result.version.id, actor("operator"), "a1",
      "2026-11-09T18:20:00.000Z", "تشغيل",
    ).versions[0];
    expect(() => retirePromptVersion(active, actor("admin-2"), "e2", createdAt, "إيقاف"))
      .toThrow("prompt_retirement_transition_invalid");
  });
});
