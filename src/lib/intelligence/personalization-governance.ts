export const PERSONALIZATION_POLICY_VERSION = "1.0.0";

export const NOTIFICATION_CHANNELS = ["IN_APP", "EMAIL", "WHATSAPP", "SMS"] as const;
export type NotificationChannel = (typeof NOTIFICATION_CHANNELS)[number];

export type NotificationLevel = "ALL" | "IMPORTANT" | "CRITICAL";
export type NotificationSeverity = "CRITICAL" | "HIGH" | "NORMAL" | "LOW";
export type NotificationDetailLevel = "SUMMARY" | "STANDARD";
export type NotificationDataClass =
  | "GENERAL"
  | "RECOMMENDATION"
  | "ACCOUNT_STATEMENT"
  | "SENSITIVE_TASK_LIST"
  | "CUSTOMER_PERSONAL_DATA";

export interface PersonalizationPreferences {
  schemaVersion: 1;
  organizationId: string;
  profileId: string;
  updatedAt: string;
  notificationChannels: NotificationChannel[];
  notificationLevel: NotificationLevel;
  quietHours: {
    enabled: boolean;
    startLocal: string;
    endLocal: string;
    timeZone: string;
  };
  detailLevel: NotificationDetailLevel;
  reducedMotion: boolean;
  personalizationEnabled: boolean;
  externalProcessingEnabled: boolean;
}

export interface ExternalChannelConsent {
  id: string;
  organizationId: string;
  profileId: string;
  channel: Exclude<NotificationChannel, "IN_APP">;
  destinationId: string;
  purpose: string;
  dataClasses: NotificationDataClass[];
  grantedAt: string;
  revokedAt: string | null;
  consentVersion: string;
  source: "EXPLICIT_USER_ACTION";
}

export interface NotificationRecipient {
  organizationId: string;
  profileId: string;
  destinationId: string | null;
  destinationVerified: boolean;
  authorizedForData: boolean;
}

export interface NotificationPolicyEvent {
  severity: NotificationSeverity;
  dataClass: NotificationDataClass;
  purpose: string;
}

export interface NotificationDeliveryInput {
  channel: NotificationChannel;
  event: NotificationPolicyEvent;
  recipient: NotificationRecipient;
  preferences: PersonalizationPreferences | null;
  channelCapabilities: Partial<Record<NotificationChannel, boolean>>;
  externalConsents?: ExternalChannelConsent[];
  asOf: string;
}

export type NotificationDeliveryReason =
  | "ALLOWED"
  | "PREFERENCES_NOT_LOADED"
  | "PREFERENCES_INVALID"
  | "PREFERENCES_SCOPE_MISMATCH"
  | "INVALID_EVENT"
  | "INVALID_AS_OF"
  | "CHANNEL_NOT_AVAILABLE"
  | "CHANNEL_DISABLED"
  | "RECIPIENT_CONTEXT_INVALID"
  | "RECIPIENT_NOT_AUTHORIZED"
  | "NOTIFICATION_LEVEL_FILTERED"
  | "QUIET_HOURS"
  | "QUIET_HOURS_TIMEZONE_INVALID"
  | "EXTERNAL_RECIPIENT_UNVERIFIED"
  | "EXTERNAL_CONSENT_REQUIRED"
  | "EXTERNAL_CONSENT_AMBIGUOUS"
  | "EXTERNAL_CONSENT_INVALID"
  | "EXTERNAL_CONSENT_REVOKED"
  | "EXTERNAL_CONSENT_SCOPE_MISMATCH";

export interface NotificationDeliveryDecision {
  status: "ALLOW" | "SUPPRESS" | "DENY" | "REVIEW";
  reason: NotificationDeliveryReason;
  channel: NotificationChannel;
  detailLevel: NotificationDetailLevel | null;
  reducedMotion: boolean | null;
  personalizationMode: "PERSONALIZED" | "ROLE_BASED_ONLY" | "UNAVAILABLE";
  externalContextAllowed: boolean;
}

export interface PersonalizationExperience {
  status: "READY" | "REVIEW";
  mode: "PERSONALIZED" | "ROLE_BASED_ONLY" | "UNAVAILABLE";
  detailLevel: NotificationDetailLevel | null;
  reducedMotion: boolean | null;
  externalContextAllowed: boolean;
  reason: "READY" | "PREFERENCES_NOT_LOADED" | "PREFERENCES_INVALID";
}

const knownChannels = new Set<string>(NOTIFICATION_CHANNELS);
const knownSeverities = new Set<string>(["CRITICAL", "HIGH", "NORMAL", "LOW"]);
const knownDataClasses = new Set<string>([
  "GENERAL", "RECOMMENDATION", "ACCOUNT_STATEMENT", "SENSITIVE_TASK_LIST", "CUSTOMER_PERSONAL_DATA",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function validTime(value: unknown): value is string {
  return typeof value === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
}

function validTimeZone(value: unknown): value is string {
  if (!isNonEmptyString(value)) return false;
  try {
    new Intl.DateTimeFormat("en", { timeZone: value }).format(new Date(0));
    return true;
  } catch {
    return false;
  }
}

function validatePreferences(value: unknown, asOf: string): value is PersonalizationPreferences {
  if (!isRecord(value) || value.schemaVersion !== 1 ||
      !isNonEmptyString(value.organizationId) || !isNonEmptyString(value.profileId) ||
      !isNonEmptyString(value.updatedAt) || !Number.isFinite(Date.parse(value.updatedAt)) ||
      Date.parse(value.updatedAt) > Date.parse(asOf)) return false;

  if (!Array.isArray(value.notificationChannels) ||
      value.notificationChannels.some(channel => typeof channel !== "string" || !knownChannels.has(channel)) ||
      new Set(value.notificationChannels).size !== value.notificationChannels.length) return false;

  if (!["ALL", "IMPORTANT", "CRITICAL"].includes(String(value.notificationLevel)) ||
      !["SUMMARY", "STANDARD"].includes(String(value.detailLevel)) ||
      typeof value.reducedMotion !== "boolean" ||
      typeof value.personalizationEnabled !== "boolean" ||
      typeof value.externalProcessingEnabled !== "boolean") return false;

  const quiet = value.quietHours;
  if (!isRecord(quiet) || typeof quiet.enabled !== "boolean" ||
      !validTime(quiet.startLocal) || !validTime(quiet.endLocal) ||
      !validTimeZone(quiet.timeZone)) return false;
  if (quiet.enabled && quiet.startLocal === quiet.endLocal) return false;

  return true;
}

function validEvent(event: unknown): event is NotificationPolicyEvent {
  if (!isRecord(event)) return false;
  return knownSeverities.has(String(event.severity)) &&
    knownDataClasses.has(String(event.dataClass)) &&
    isNonEmptyString(event.purpose);
}

function isWithinQuietHours(at: string, quietHours: PersonalizationPreferences["quietHours"]): boolean | null {
  if (!quietHours.enabled) return false;

  try {
    const parts = new Intl.DateTimeFormat("en", {
      timeZone: quietHours.timeZone,
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).formatToParts(new Date(at));
    const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
    const hour = Number(values.hour);
    const minute = Number(values.minute);
    if (!Number.isInteger(hour) || !Number.isInteger(minute)) return null;

    const current = hour * 60 + minute;
    const startParts = quietHours.startLocal.split(":").map(Number);
    const endParts = quietHours.endLocal.split(":").map(Number);
    const start = startParts[0] * 60 + startParts[1];
    const end = endParts[0] * 60 + endParts[1];
    return start < end ? current >= start && current < end : current >= start || current < end;
  } catch {
    return null;
  }
}

function passesNotificationLevel(
  severity: NotificationSeverity,
  level: NotificationLevel,
): boolean {
  if (severity === "CRITICAL") return true;
  if (level === "CRITICAL") return false;
  if (level === "IMPORTANT") return severity === "HIGH";
  return true;
}

function decision(
  input: NotificationDeliveryInput,
  status: NotificationDeliveryDecision["status"],
  reason: NotificationDeliveryReason,
  preferences?: PersonalizationPreferences,
): NotificationDeliveryDecision {
  return {
    status,
    reason,
    channel: input.channel,
    detailLevel: preferences?.detailLevel ?? null,
    reducedMotion: preferences?.reducedMotion ?? null,
    personalizationMode: preferences
      ? preferences.personalizationEnabled ? "PERSONALIZED" : "ROLE_BASED_ONLY"
      : "UNAVAILABLE",
    externalContextAllowed: Boolean(preferences?.externalProcessingEnabled),
  };
}

function externalConsentStatus(input: NotificationDeliveryInput, preferences: PersonalizationPreferences):
  { status: "ALLOW" } | { status: "DENY" | "REVIEW"; reason: NotificationDeliveryReason } {
  const recipient = input.recipient;
  if (!recipient.destinationVerified || !isNonEmptyString(recipient.destinationId)) {
    return { status: "DENY", reason: "EXTERNAL_RECIPIENT_UNVERIFIED" };
  }

  const matches = (input.externalConsents ?? []).filter(consent =>
    consent.organizationId === recipient.organizationId &&
    consent.profileId === recipient.profileId &&
    consent.channel === input.channel &&
    consent.destinationId === recipient.destinationId &&
    consent.purpose === input.event.purpose,
  );

  if (matches.length === 0) return { status: "DENY", reason: "EXTERNAL_CONSENT_REQUIRED" };
  if (matches.length !== 1) return { status: "REVIEW", reason: "EXTERNAL_CONSENT_AMBIGUOUS" };

  const consent = matches[0];
  if (!isNonEmptyString(consent.id) || !isNonEmptyString(consent.consentVersion) ||
      consent.source !== "EXPLICIT_USER_ACTION" ||
      !Array.isArray(consent.dataClasses) ||
      consent.dataClasses.some(dataClass => !knownDataClasses.has(dataClass)) ||
      !isNonEmptyString(consent.grantedAt) || !Number.isFinite(Date.parse(consent.grantedAt)) ||
      Date.parse(consent.grantedAt) > Date.parse(input.asOf) ||
      (consent.revokedAt !== null &&
        (!isNonEmptyString(consent.revokedAt) || !Number.isFinite(Date.parse(consent.revokedAt))))) {
    return { status: "REVIEW", reason: "EXTERNAL_CONSENT_INVALID" };
  }

  if (consent.revokedAt !== null && Date.parse(consent.revokedAt) <= Date.parse(input.asOf)) {
    return { status: "DENY", reason: "EXTERNAL_CONSENT_REVOKED" };
  }

  if (!consent.dataClasses.includes(input.event.dataClass) ||
      !preferences.notificationChannels.includes(input.channel)) {
    return { status: "DENY", reason: "EXTERNAL_CONSENT_SCOPE_MISMATCH" };
  }

  return { status: "ALLOW" };
}

export function createDefaultPersonalizationPreferences(input: {
  organizationId: string;
  profileId: string;
  savedAt: string;
  timeZone?: string;
}): PersonalizationPreferences {
  const timeZone = input.timeZone ?? "UTC";
  if (!isNonEmptyString(input.organizationId) || !isNonEmptyString(input.profileId) ||
      !isNonEmptyString(input.savedAt) || !Number.isFinite(Date.parse(input.savedAt)) ||
      !validTimeZone(timeZone)) {
    throw new Error("A valid tenant, profile, timestamp and IANA time zone are required.");
  }

  return {
    schemaVersion: 1,
    organizationId: input.organizationId,
    profileId: input.profileId,
    updatedAt: input.savedAt,
    notificationChannels: ["IN_APP"],
    notificationLevel: "ALL",
    quietHours: { enabled: false, startLocal: "22:00", endLocal: "07:00", timeZone },
    detailLevel: "SUMMARY",
    reducedMotion: false,
    personalizationEnabled: false,
    externalProcessingEnabled: false,
  };
}

export function resolvePersonalizationExperience(
  preferences: PersonalizationPreferences | null,
  asOf: string,
): PersonalizationExperience {
  if (!Number.isFinite(Date.parse(asOf))) {
    return {
      status: "REVIEW", mode: "UNAVAILABLE", detailLevel: null, reducedMotion: null,
      externalContextAllowed: false, reason: "PREFERENCES_INVALID",
    };
  }
  if (preferences === null) {
    return {
      status: "REVIEW", mode: "UNAVAILABLE", detailLevel: null, reducedMotion: null,
      externalContextAllowed: false, reason: "PREFERENCES_NOT_LOADED",
    };
  }
  if (!validatePreferences(preferences, asOf)) {
    return {
      status: "REVIEW", mode: "UNAVAILABLE", detailLevel: null, reducedMotion: null,
      externalContextAllowed: false, reason: "PREFERENCES_INVALID",
    };
  }

  return {
    status: "READY",
    mode: preferences.personalizationEnabled ? "PERSONALIZED" : "ROLE_BASED_ONLY",
    detailLevel: preferences.detailLevel,
    reducedMotion: preferences.reducedMotion,
    externalContextAllowed: preferences.externalProcessingEnabled,
    reason: "READY",
  };
}

export function resolveNotificationDelivery(
  input: NotificationDeliveryInput,
): NotificationDeliveryDecision {
  if (!Number.isFinite(Date.parse(input.asOf))) {
    return decision(input, "REVIEW", "INVALID_AS_OF");
  }
  if (!validatePreferences(input.preferences, input.asOf)) {
    return decision(input, input.preferences === null ? "REVIEW" : "REVIEW",
      input.preferences === null ? "PREFERENCES_NOT_LOADED" : "PREFERENCES_INVALID");
  }

  const preferences = input.preferences;
  if (preferences.organizationId !== input.recipient.organizationId ||
      preferences.profileId !== input.recipient.profileId) {
    return decision(input, "DENY", "PREFERENCES_SCOPE_MISMATCH", preferences);
  }
  if (!validEvent(input.event)) return decision(input, "REVIEW", "INVALID_EVENT", preferences);
  if (!knownChannels.has(input.channel)) return decision(input, "DENY", "CHANNEL_NOT_AVAILABLE", preferences);
  if (input.channelCapabilities?.[input.channel] !== true) {
    return decision(input, "DENY", "CHANNEL_NOT_AVAILABLE", preferences);
  }
  if (!preferences.notificationChannels.includes(input.channel)) {
    return decision(input, "SUPPRESS", "CHANNEL_DISABLED", preferences);
  }
  if (!isNonEmptyString(input.recipient.organizationId) ||
      !isNonEmptyString(input.recipient.profileId)) {
    return decision(input, "REVIEW", "RECIPIENT_CONTEXT_INVALID", preferences);
  }
  if (input.recipient.authorizedForData !== true) {
    return decision(input, "DENY", "RECIPIENT_NOT_AUTHORIZED", preferences);
  }
  if (!passesNotificationLevel(input.event.severity, preferences.notificationLevel)) {
    return decision(input, "SUPPRESS", "NOTIFICATION_LEVEL_FILTERED", preferences);
  }

  const quiet = isWithinQuietHours(input.asOf, preferences.quietHours);
  if (quiet === null) return decision(input, "REVIEW", "QUIET_HOURS_TIMEZONE_INVALID", preferences);
  if (quiet && input.event.severity !== "CRITICAL") {
    return decision(input, "SUPPRESS", "QUIET_HOURS", preferences);
  }

  if (input.channel !== "IN_APP") {
    const consent = externalConsentStatus(input, preferences);
    if (consent.status !== "ALLOW") {
      return decision(input, consent.status, consent.reason, preferences);
    }
  }

  return decision(input, "ALLOW", "ALLOWED", preferences);
}
