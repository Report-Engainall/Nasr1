export type PromptLifecycleStatus =
  | "DRAFT"
  | "PENDING_APPROVAL"
  | "APPROVED"
  | "ACTIVE"
  | "REJECTED"
  | "RETIRED"
  | "DISABLED";

export type PromptAuditAction =
  | "CREATED"
  | "SUBMITTED_FOR_APPROVAL"
  | "APPROVED"
  | "REJECTED"
  | "ACTIVATED"
  | "DEACTIVATED"
  | "RETIRED"
  | "DISABLED";

export interface PromptGovernanceActor {
  profileId: string;
  organizationId: string;
  roles: readonly string[];
  active: boolean;
}

export interface AiPromptVersion {
  id: string;
  organizationId: string;
  promptKey: string;
  version: number;
  content: string;
  contentSha256: string;
  status: PromptLifecycleStatus;
  createdByProfileId: string;
  createdAt: string;
  submittedAt: string | null;
  approvedByProfileId: string | null;
  approvedAt: string | null;
  rejectedByProfileId: string | null;
  rejectedAt: string | null;
  decisionReason: string | null;
  activatedAt: string | null;
  deactivatedAt: string | null;
  disabledAt: string | null;
  retiredAt: string | null;
}

export interface AiPromptAuditEvent {
  id: string;
  organizationId: string;
  promptVersionId: string;
  promptKey: string;
  version: number;
  action: PromptAuditAction;
  actorProfileId: string;
  previousStatus: PromptLifecycleStatus | null;
  nextStatus: PromptLifecycleStatus;
  reason: string | null;
  occurredAt: string;
}

function requireActor(actor: PromptGovernanceActor, organizationId: string): void {
  if (!actor || !actor.active || !actor.profileId?.trim() ||
      !actor.organizationId?.trim() || actor.organizationId !== organizationId) {
    throw new Error("prompt_governance_actor_scope_denied");
  }
  if (!Array.isArray(actor.roles) || !actor.roles.includes("admin")) {
    throw new Error("prompt_governance_admin_required");
  }
}

function validTimestamp(value: string): boolean {
  return typeof value === "string" && Number.isFinite(Date.parse(value));
}

function requireReason(reason: string): string {
  const clean = typeof reason === "string" ? reason.trim() : "";
  if (clean.length < 3 || clean.length > 500) {
    throw new Error("prompt_governance_reason_required");
  }
  return clean;
}

function validatePromptKey(value: string): string {
  const key = typeof value === "string" ? value.trim() : "";
  if (!/^[a-z][a-z0-9_.-]{1,79}$/.test(key)) {
    throw new Error("prompt_key_invalid");
  }
  return key;
}

const promptLifecycleStatuses = new Set<PromptLifecycleStatus>([
  "DRAFT", "PENDING_APPROVAL", "APPROVED", "ACTIVE", "REJECTED", "RETIRED", "DISABLED",
]);

/**
 * Rejects ambiguous or malformed in-memory history before it can influence
 * version sequencing or activation. The database must still enforce the same
 * unique and append-only invariants transactionally.
 */
function assertPromptVersionHistoryIntegrity(versions: readonly AiPromptVersion[]): void {
  if (!Array.isArray(versions)) {
    throw new Error("prompt_version_history_invalid");
  }

  const ids = new Set<string>();
  const versionKeys = new Set<string>();
  const activePromptKeys = new Set<string>();

  for (const value of versions as readonly unknown[]) {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      throw new Error("prompt_version_history_invalid");
    }

    const row = value as Record<string, unknown>;
    const id = typeof row.id === "string" ? row.id.trim() : "";
    const organizationId = typeof row.organizationId === "string" ? row.organizationId.trim() : "";
    const promptKey = typeof row.promptKey === "string" ? row.promptKey.trim() : "";
    const version = row.version;
    const status = row.status;

    if (!id || id !== row.id || !organizationId || organizationId !== row.organizationId ||
        !/^[a-z][a-z0-9_.-]{1,79}$/.test(promptKey) || promptKey !== row.promptKey ||
        !Number.isSafeInteger(version) || (version as number) < 1 ||
        typeof status !== "string" || !promptLifecycleStatuses.has(status as PromptLifecycleStatus)) {
      throw new Error("prompt_version_history_invalid");
    }

    const idKey = id.toLowerCase();
    if (ids.has(idKey)) {
      throw new Error("prompt_version_identity_duplicate");
    }
    ids.add(idKey);

    const scopeKey = JSON.stringify([
      organizationId.toLowerCase(),
      promptKey,
      version,
    ]);
    if (versionKeys.has(scopeKey)) {
      throw new Error("prompt_version_sequence_duplicate");
    }
    versionKeys.add(scopeKey);

    if (status === "ACTIVE") {
      const promptScope = JSON.stringify([organizationId.toLowerCase(), promptKey]);
      if (activePromptKeys.has(promptScope)) {
        throw new Error("prompt_multiple_active_versions");
      }
      activePromptKeys.add(promptScope);
    }
  }
}

function validatePromptContent(value: string): string {
  const content = typeof value === "string" ? value.trim() : "";
  if (content.length < 16 || content.length > 8000) {
    throw new Error("prompt_content_length_invalid");
  }
  const secretPatterns = [
    /\bBearer\s+[A-Za-z0-9._~+/-]{16,}\b/i,
    /\bsk-(?:proj|live|test|svcacct)?-?[A-Za-z0-9_-]{16,}\b/i,
    /\bAIza[0-9A-Za-z_-]{30,}\b/,
    /(?:api[_ -]?key|service[_ -]?role|secret|password|access[_ -]?token)\s*[:=]\s*["']?[A-Za-z0-9._~+/-]{8,}/i,
    /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
  ];
  if (secretPatterns.some((pattern) => pattern.test(content))) {
    throw new Error("prompt_content_secret_rejected");
  }
  return content;
}

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("");
}

function makeAuditEvent(
  id: string,
  version: AiPromptVersion,
  action: PromptAuditAction,
  actor: PromptGovernanceActor,
  previousStatus: PromptLifecycleStatus | null,
  nextStatus: PromptLifecycleStatus,
  occurredAt: string,
  reason: string | null = null,
): AiPromptAuditEvent {
  if (!id.trim() || !validTimestamp(occurredAt)) {
    throw new Error("prompt_audit_event_invalid");
  }
  return {
    id,
    organizationId: version.organizationId,
    promptVersionId: version.id,
    promptKey: version.promptKey,
    version: version.version,
    action,
    actorProfileId: actor.profileId,
    previousStatus,
    nextStatus,
    reason,
    occurredAt,
  };
}

/**
 * Creates a new immutable draft value. Persistence must enforce UNIQUE
 * (organization_id, prompt_key, version) and append-only audit storage.
 */
export async function createPromptDraft(
  existingVersions: readonly AiPromptVersion[],
  actor: PromptGovernanceActor,
  input: { id: string; eventId: string; promptKey: string; content: string },
  createdAt: string,
): Promise<{ version: AiPromptVersion; event: AiPromptAuditEvent }> {
  requireActor(actor, actor.organizationId);
  assertPromptVersionHistoryIntegrity(existingVersions);
  const promptKey = validatePromptKey(input.promptKey);
  const content = validatePromptContent(input.content);
  const inputId = typeof input.id === "string" ? input.id.trim() : "";
  if (!inputId || !validTimestamp(createdAt) ||
      existingVersions.some(row => row.id.toLowerCase() === inputId.toLowerCase())) {
    throw new Error("prompt_draft_identity_invalid");
  }
  const organizationScope = actor.organizationId.toLowerCase();
  const matching = existingVersions.filter(row =>
    row.organizationId.toLowerCase() === organizationScope && row.promptKey === promptKey);
  const maxVersion = matching.reduce((max, row) => {
    if (!Number.isSafeInteger(row.version) || row.version < 1) {
      throw new Error("prompt_version_history_invalid");
    }
    return Math.max(max, row.version);
  }, 0);
  if (!Number.isSafeInteger(maxVersion + 1)) {
    throw new Error("prompt_version_history_invalid");
  }
  const version: AiPromptVersion = {
    id: inputId,
    organizationId: actor.organizationId,
    promptKey,
    version: maxVersion + 1,
    content,
    contentSha256: await sha256Hex(content),
    status: "DRAFT",
    createdByProfileId: actor.profileId,
    createdAt,
    submittedAt: null,
    approvedByProfileId: null,
    approvedAt: null,
    rejectedByProfileId: null,
    rejectedAt: null,
    decisionReason: null,
    activatedAt: null,
    deactivatedAt: null,
    disabledAt: null,
    retiredAt: null,
  };
  return {
    version,
    event: makeAuditEvent(input.eventId, version, "CREATED", actor, null, "DRAFT", createdAt),
  };
}

export function submitPromptVersionForApproval(
  version: AiPromptVersion,
  actor: PromptGovernanceActor,
  eventId: string,
  submittedAt: string,
): { version: AiPromptVersion; event: AiPromptAuditEvent } {
  requireActor(actor, version.organizationId);
  if (version.status !== "DRAFT" || version.createdByProfileId !== actor.profileId ||
      !validTimestamp(submittedAt)) {
    throw new Error("prompt_submit_transition_invalid");
  }
  const next = { ...version, status: "PENDING_APPROVAL" as const, submittedAt };
  return {
    version: next,
    event: makeAuditEvent(eventId, next, "SUBMITTED_FOR_APPROVAL", actor, "DRAFT", "PENDING_APPROVAL", submittedAt),
  };
}

function requireFourEyes(version: AiPromptVersion, actor: PromptGovernanceActor): void {
  if (actor.profileId === version.createdByProfileId) {
    throw new Error("prompt_four_eyes_required");
  }
}

export function approvePromptVersion(
  version: AiPromptVersion,
  actor: PromptGovernanceActor,
  eventId: string,
  approvedAt: string,
  reason: string,
): { version: AiPromptVersion; event: AiPromptAuditEvent } {
  requireActor(actor, version.organizationId);
  requireFourEyes(version, actor);
  const auditReason = requireReason(reason);
  if (version.status !== "PENDING_APPROVAL" || !validTimestamp(approvedAt)) {
    throw new Error("prompt_approval_transition_invalid");
  }
  const next = {
    ...version,
    status: "APPROVED" as const,
    approvedByProfileId: actor.profileId,
    approvedAt,
    decisionReason: auditReason,
  };
  return {
    version: next,
    event: makeAuditEvent(eventId, next, "APPROVED", actor, "PENDING_APPROVAL", "APPROVED", approvedAt, auditReason),
  };
}

export function rejectPromptVersion(
  version: AiPromptVersion,
  actor: PromptGovernanceActor,
  eventId: string,
  rejectedAt: string,
  reason: string,
): { version: AiPromptVersion; event: AiPromptAuditEvent } {
  requireActor(actor, version.organizationId);
  requireFourEyes(version, actor);
  const auditReason = requireReason(reason);
  if (version.status !== "PENDING_APPROVAL" || !validTimestamp(rejectedAt)) {
    throw new Error("prompt_rejection_transition_invalid");
  }
  const next = {
    ...version,
    status: "REJECTED" as const,
    rejectedByProfileId: actor.profileId,
    rejectedAt,
    decisionReason: auditReason,
  };
  return {
    version: next,
    event: makeAuditEvent(eventId, next, "REJECTED", actor, "PENDING_APPROVAL", "REJECTED", rejectedAt, auditReason),
  };
}

/**
 * Activating a prompt is a distinct operation: the operator cannot be the
 * author or approver. A DB transaction must enforce the single ACTIVE row.
 */
export function activatePromptVersion(
  versions: readonly AiPromptVersion[],
  versionId: string,
  actor: PromptGovernanceActor,
  eventId: string,
  activatedAt: string,
  reason: string,
): { versions: AiPromptVersion[]; events: AiPromptAuditEvent[] } {
  assertPromptVersionHistoryIntegrity(versions);
  const requestedId = typeof versionId === "string" ? versionId.trim().toLowerCase() : "";
  const target = requestedId
    ? versions.find(row => row.id.toLowerCase() === requestedId)
    : undefined;
  if (!target) throw new Error("prompt_version_not_found");
  requireActor(actor, target.organizationId);
  const auditReason = requireReason(reason);
  if (target.status !== "APPROVED" || !validTimestamp(activatedAt)) {
    throw new Error("prompt_activation_transition_invalid");
  }
  if (actor.profileId === target.createdByProfileId ||
      actor.profileId === target.approvedByProfileId) {
    throw new Error("prompt_activation_separation_required");
  }
  const targetOrganizationScope = target.organizationId.toLowerCase();
  const samePrompt = versions.filter(row =>
    row.organizationId.toLowerCase() === targetOrganizationScope && row.promptKey === target.promptKey);
  const active = samePrompt.filter(row => row.status === "ACTIVE");
  if (active.length > 1) throw new Error("prompt_multiple_active_versions");
  if (active.some(row => row.id.toLowerCase() === target.id.toLowerCase())) throw new Error("prompt_already_active");

  const nextVersions: AiPromptVersion[] = [];
  const events: AiPromptAuditEvent[] = [];
  for (const row of versions) {
    if (row.id.toLowerCase() === target.id.toLowerCase()) {
      const next = { ...row, status: "ACTIVE" as const, activatedAt, deactivatedAt: null };
      nextVersions.push(next);
      events.push(makeAuditEvent(eventId, next, "ACTIVATED", actor, "APPROVED", "ACTIVE", activatedAt, auditReason));
    } else if (active[0] && row.id.toLowerCase() === active[0].id.toLowerCase()) {
      const next = { ...row, status: "APPROVED" as const, deactivatedAt: activatedAt };
      nextVersions.push(next);
      events.push(makeAuditEvent(eventId + ":deactivated", next, "DEACTIVATED", actor, "ACTIVE", "APPROVED", activatedAt, auditReason));
    } else {
      nextVersions.push(row);
    }
  }
  return { versions: nextVersions, events };
}


/** Emergency stop for an active prompt; the disabled version cannot be reactivated. */
export function disablePromptVersion(
  version: AiPromptVersion,
  actor: PromptGovernanceActor,
  eventId: string,
  disabledAt: string,
  reason: string,
): { version: AiPromptVersion; event: AiPromptAuditEvent } {
  requireActor(actor, version.organizationId);
  const auditReason = requireReason(reason);
  if (version.status !== "ACTIVE" || !validTimestamp(disabledAt)) throw new Error("prompt_disable_transition_invalid");
  const next = { ...version, status: "DISABLED" as const, disabledAt, decisionReason: auditReason };
  return { version: next, event: makeAuditEvent(eventId, next, "DISABLED", actor, "ACTIVE", "DISABLED", disabledAt, auditReason) };
}

export function retirePromptVersion(
  version: AiPromptVersion,
  actor: PromptGovernanceActor,
  eventId: string,
  retiredAt: string,
  reason: string,
): { version: AiPromptVersion; event: AiPromptAuditEvent } {
  requireActor(actor, version.organizationId);
  const auditReason = requireReason(reason);
  if (version.status === "ACTIVE" || version.status === "PENDING_APPROVAL" ||
      version.status === "RETIRED" || version.status === "DISABLED" || !validTimestamp(retiredAt)) {
    throw new Error("prompt_retirement_transition_invalid");
  }
  const next = { ...version, status: "RETIRED" as const, retiredAt, decisionReason: auditReason };
  return {
    version: next,
    event: makeAuditEvent(eventId, next, "RETIRED", actor, version.status, "RETIRED", retiredAt, auditReason),
  };
}
