import { supabase } from "@/lib/supabase";
import type {
  AiPromptAuditEvent,
  AiPromptVersion,
  PromptAuditAction,
  PromptLifecycleStatus,
} from "@/lib/intelligence/ai-prompt-governance";

export interface PromptGovernancePage {
  items: AiPromptVersion[];
  total: number;
}

export interface PromptGovernanceMutation {
  version: AiPromptVersion;
  events: AiPromptAuditEvent[];
  replayed: boolean;
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const STATUSES = new Set<PromptLifecycleStatus>([
  "DRAFT",
  "PENDING_APPROVAL",
  "APPROVED",
  "ACTIVE",
  "REJECTED",
  "RETIRED",
  "DISABLED",
]);
const ACTIONS = new Set<PromptAuditAction>([
  "CREATED",
  "SUBMITTED_FOR_APPROVAL",
  "APPROVED",
  "REJECTED",
  "ACTIVATED",
  "DEACTIVATED",
  "RETIRED",
  "DISABLED",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
function requiredString(value: unknown): string {
  if (typeof value !== "string" || !value.trim()) throw new Error("prompt_response_invalid");
  return value;
}
function nullableString(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== "string") throw new Error("prompt_response_invalid");
  return value;
}
function parseStatus(value: unknown): PromptLifecycleStatus {
  if (typeof value !== "string" || !STATUSES.has(value as PromptLifecycleStatus)) {
    throw new Error("prompt_response_invalid");
  }
  return value as PromptLifecycleStatus;
}
function parseVersion(value: unknown): AiPromptVersion {
  if (!isRecord(value)) throw new Error("prompt_response_invalid");
  const id = requiredString(value.id);
  const organizationId = requiredString(value.organization_id);
  const profileId = requiredString(value.created_by_profile_id);
  const version = Number(value.version);
  const promptKey = requiredString(value.prompt_key);
  const content = requiredString(value.content);
  const contentSha256 = requiredString(value.content_sha256);
  if (
    !UUID_PATTERN.test(id) ||
    !UUID_PATTERN.test(organizationId) ||
    !UUID_PATTERN.test(profileId) ||
    !Number.isSafeInteger(version) ||
    version < 1 ||
    !/^[a-z][a-z0-9_.-]{1,79}$/.test(promptKey) ||
    !/^[a-f0-9]{64}$/.test(contentSha256) ||
    content.length < 16 ||
    content.length > 8000
  ) {
    throw new Error("prompt_response_invalid");
  }
  return {
    id,
    organizationId,
    promptKey,
    version,
    content,
    contentSha256,
    status: parseStatus(value.status),
    createdByProfileId: profileId,
    createdAt: requiredString(value.created_at),
    submittedAt: nullableString(value.submitted_at),
    approvedByProfileId: nullableString(value.approved_by_profile_id),
    approvedAt: nullableString(value.approved_at),
    rejectedByProfileId: nullableString(value.rejected_by_profile_id),
    rejectedAt: nullableString(value.rejected_at),
    decisionReason: nullableString(value.decision_reason),
    activatedAt: nullableString(value.activated_at),
    deactivatedAt: nullableString(value.deactivated_at),
    disabledAt: nullableString(value.disabled_at),
    retiredAt: nullableString(value.retired_at),
  };
}
function parseEvent(value: unknown): AiPromptAuditEvent {
  if (!isRecord(value)) throw new Error("prompt_response_invalid");
  const action = requiredString(value.action);
  if (!ACTIONS.has(action as PromptAuditAction)) throw new Error("prompt_response_invalid");
  const version = Number(value.version);
  if (!Number.isSafeInteger(version) || version < 1) throw new Error("prompt_response_invalid");
  return {
    id: requiredString(value.id),
    organizationId: requiredString(value.organization_id),
    promptVersionId: requiredString(value.prompt_version_id),
    promptKey: requiredString(value.prompt_key),
    version,
    action: action as PromptAuditAction,
    actorProfileId: requiredString(value.actor_profile_id),
    previousStatus: value.previous_status === null ? null : parseStatus(value.previous_status),
    nextStatus: parseStatus(value.next_status),
    reason: nullableString(value.reason),
    occurredAt: requiredString(value.occurred_at),
  };
}
function rpcError(error: { code?: string; message?: string } | null, fallback: string): never {
  if (error?.code === "42501") throw new Error("هذه العملية غير مسموحة لهذا الحساب أو لهذه المرحلة من المراجعة.");
  if (error?.code === "22023") throw new Error("المدخلات أو انتقال حالة النسخة غير صالح.");
  if (error?.code === "23505") throw new Error("معرّف العملية استُخدم سابقاً بطلب مختلف؛ حدّث القائمة قبل إعادة المحاولة.");
  throw new Error(fallback);
}
function mutationResult(value: unknown): PromptGovernanceMutation {
  if (!isRecord(value) || !Array.isArray(value.events) && !("event" in value)) {
    throw new Error("prompt_response_invalid");
  }
  const version = parseVersion(value.version);
  const events = Array.isArray(value.events)
    ? value.events.map(parseEvent)
    : [parseEvent(value.event)];
  if (events.length === 0) throw new Error("prompt_response_invalid");
  return { version, events, replayed: value.replayed === true };
}

export async function listAiPromptVersions(): Promise<PromptGovernancePage> {
  const { data, error } = await supabase.rpc("list_ai_prompt_versions", {
    p_prompt_key: null,
    p_status: null,
    p_limit: 100,
    p_offset: 0,
  });
  if (error) rpcError(error, "تعذر تحميل مكتبة الأوامر من الخادم.");
  if (!isRecord(data) || !Array.isArray(data.items)) throw new Error("prompt_response_invalid");
  const total = Number(data.total);
  if (!Number.isSafeInteger(total) || total < 0) throw new Error("prompt_response_invalid");
  return { items: data.items.map(parseVersion), total };
}

export async function listAiPromptAuditEvents(versionId: string): Promise<AiPromptAuditEvent[]> {
  if (!UUID_PATTERN.test(versionId)) throw new Error("prompt_response_invalid");
  const { data, error } = await supabase.rpc("list_ai_prompt_audit_events", {
    p_version_id: versionId,
    p_limit: 100,
  });
  if (error) rpcError(error, "تعذر تحميل سجل تدقيق الأمر.");
  if (!isRecord(data) || !Array.isArray(data.items)) throw new Error("prompt_response_invalid");
  return data.items.map(parseEvent);
}

async function runMutation(
  name: string,
  args: Record<string, unknown>,
  fallback: string,
): Promise<PromptGovernanceMutation> {
  const { data, error } = await supabase.rpc(name, args);
  if (error) rpcError(error, fallback);
  return mutationResult(data);
}

export function createAiPromptDraft(input: {
  promptKey: string;
  content: string;
  commandId: string;
}): Promise<PromptGovernanceMutation> {
  return runMutation(
    "create_ai_prompt_draft",
    {
      p_prompt_key: input.promptKey,
      p_content: input.content,
      p_command_id: input.commandId,
    },
    "تعذر حفظ مسودة الأمر.",
  );
}

export function submitAiPromptVersion(versionId: string, commandId: string): Promise<PromptGovernanceMutation> {
  return runMutation(
    "submit_ai_prompt_version",
    { p_version_id: versionId, p_command_id: commandId },
    "تعذر إرسال النسخة للمراجعة.",
  );
}
export function approveAiPromptVersion(versionId: string, commandId: string, reason: string): Promise<PromptGovernanceMutation> {
  return runMutation(
    "approve_ai_prompt_version",
    { p_version_id: versionId, p_command_id: commandId, p_reason: reason },
    "تعذر اعتماد النسخة.",
  );
}
export function rejectAiPromptVersion(versionId: string, commandId: string, reason: string): Promise<PromptGovernanceMutation> {
  return runMutation(
    "reject_ai_prompt_version",
    { p_version_id: versionId, p_command_id: commandId, p_reason: reason },
    "تعذر رفض النسخة.",
  );
}
export function activateAiPromptVersion(versionId: string, commandId: string, reason: string): Promise<PromptGovernanceMutation> {
  return runMutation(
    "activate_ai_prompt_version",
    { p_version_id: versionId, p_command_id: commandId, p_reason: reason },
    "تعذر تفعيل النسخة.",
  );
}

export function disableAiPromptVersion(versionId: string, commandId: string, reason: string): Promise<PromptGovernanceMutation> {
  return runMutation(
    "disable_ai_prompt_version",
    { p_version_id: versionId, p_command_id: commandId, p_reason: reason },
    "تعذر تعطيل النسخة النشطة.",
  );
}

export function retireAiPromptVersion(versionId: string, commandId: string, reason: string): Promise<PromptGovernanceMutation> {
  return runMutation(
    "retire_ai_prompt_version",
    { p_version_id: versionId, p_command_id: commandId, p_reason: reason },
    "تعذر إحالة النسخة إلى الأرشيف.",
  );
}
