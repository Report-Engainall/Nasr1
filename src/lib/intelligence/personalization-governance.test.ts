import { describe, expect, it } from "vitest";
import {
  createDefaultPersonalizationPreferences,
  resolveNotificationDelivery,
  resolvePersonalizationExperience,
  type ExternalChannelConsent,
  type NotificationDeliveryInput,
  type PersonalizationPreferences,
} from "./personalization-governance";

const asOf = "2026-11-06T20:00:00.000Z";

function preferences(overrides: Partial<PersonalizationPreferences> = {}): PersonalizationPreferences {
  return {
    ...createDefaultPersonalizationPreferences({
      organizationId: "org-a",
      profileId: "profile-a",
      savedAt: "2026-11-06T19:00:00.000Z",
      timeZone: "Asia/Aden",
    }),
    ...overrides,
  };
}

function input(overrides: Partial<NotificationDeliveryInput> = {}): NotificationDeliveryInput {
  return {
    channel: "IN_APP",
    event: { severity: "NORMAL", dataClass: "GENERAL", purpose: "operational-task-update" },
    recipient: {
      organizationId: "org-a",
      profileId: "profile-a",
      destinationId: null,
      destinationVerified: false,
      authorizedForData: true,
    },
    preferences: preferences(),
    channelCapabilities: { IN_APP: true },
    asOf,
    ...overrides,
  };
}

function emailConsent(overrides: Partial<ExternalChannelConsent> = {}): ExternalChannelConsent {
  return {
    id: "consent-1",
    organizationId: "org-a",
    profileId: "profile-a",
    channel: "EMAIL",
    destinationId: "verified-email-destination",
    purpose: "account-statement-delivery",
    dataClasses: ["ACCOUNT_STATEMENT"],
    grantedAt: "2026-11-06T19:00:00.000Z",
    revokedAt: null,
    consentVersion: "1",
    source: "EXPLICIT_USER_ACTION",
    ...overrides,
  };
}

describe("personalization privacy and notification policy", () => {
  it("defaults to in-app only, summary detail, no personalization and no external processing", () => {
    expect(createDefaultPersonalizationPreferences({
      organizationId: "org-a",
      profileId: "profile-a",
      savedAt: "2026-11-06T19:00:00.000Z",
    })).toMatchObject({
      notificationChannels: ["IN_APP"],
      detailLevel: "SUMMARY",
      personalizationEnabled: false,
      externalProcessingEnabled: false,
    });
  });

  it("keeps experience role-based when the user has not enabled personalization", () => {
    expect(resolvePersonalizationExperience(preferences(), asOf)).toMatchObject({
      status: "READY",
      mode: "ROLE_BASED_ONLY",
      externalContextAllowed: false,
    });
  });

  it("applies an explicitly enabled reduced-motion preference", () => {
    expect(resolvePersonalizationExperience(preferences({ reducedMotion: true }), asOf))
      .toMatchObject({ status: "READY", reducedMotion: true });
  });

  it("fails to REVIEW rather than assuming defaults when preferences have not loaded", () => {
    expect(resolvePersonalizationExperience(null, asOf)).toMatchObject({
      status: "REVIEW",
      mode: "UNAVAILABLE",
      reason: "PREFERENCES_NOT_LOADED",
    });
  });

  it("suppresses non-critical notifications when the user selects critical-only", () => {
    expect(resolveNotificationDelivery(input({
      preferences: preferences({ notificationLevel: "CRITICAL" }),
    }))).toMatchObject({ status: "SUPPRESS", reason: "NOTIFICATION_LEVEL_FILTERED" });
  });

  it("keeps quiet hours local to the selected time zone and suppresses non-critical alerts", () => {
    expect(resolveNotificationDelivery(input({
      preferences: preferences({
        quietHours: { enabled: true, startLocal: "22:00", endLocal: "07:00", timeZone: "Asia/Aden" },
      }),
      event: { severity: "HIGH", dataClass: "GENERAL", purpose: "operational-task-update" },
    }))).toMatchObject({ status: "SUPPRESS", reason: "QUIET_HOURS" });
  });

  it("allows a critical in-app event during quiet hours only when the channel and recipient are authorized", () => {
    expect(resolveNotificationDelivery(input({
      preferences: preferences({
        notificationLevel: "CRITICAL",
        quietHours: { enabled: true, startLocal: "22:00", endLocal: "07:00", timeZone: "Asia/Aden" },
      }),
      event: { severity: "CRITICAL", dataClass: "GENERAL", purpose: "security-alert" },
    }))).toMatchObject({ status: "ALLOW", reason: "ALLOWED" });
  });

  it("denies external delivery without recipient-specific explicit consent", () => {
    expect(resolveNotificationDelivery(input({
      channel: "EMAIL",
      preferences: preferences({ notificationChannels: ["IN_APP", "EMAIL"] }),
      channelCapabilities: { IN_APP: true, EMAIL: true },
      recipient: {
        organizationId: "org-a", profileId: "profile-a",
        destinationId: "verified-email-destination", destinationVerified: true, authorizedForData: true,
      },
      event: { severity: "HIGH", dataClass: "ACCOUNT_STATEMENT", purpose: "account-statement-delivery" },
    }))).toMatchObject({ status: "DENY", reason: "EXTERNAL_CONSENT_REQUIRED" });
  });

  it("requires the exact tenant, profile, channel, recipient, purpose and data-class scope", () => {
    expect(resolveNotificationDelivery(input({
      channel: "EMAIL",
      preferences: preferences({ notificationChannels: ["IN_APP", "EMAIL"] }),
      channelCapabilities: { IN_APP: true, EMAIL: true },
      recipient: {
        organizationId: "org-a", profileId: "profile-a",
        destinationId: "verified-email-destination", destinationVerified: true, authorizedForData: true,
      },
      event: { severity: "HIGH", dataClass: "ACCOUNT_STATEMENT", purpose: "account-statement-delivery" },
      externalConsents: [emailConsent()],
    }))).toMatchObject({ status: "ALLOW", reason: "ALLOWED" });

    expect(resolveNotificationDelivery(input({
      channel: "EMAIL",
      preferences: preferences({ notificationChannels: ["IN_APP", "EMAIL"] }),
      channelCapabilities: { IN_APP: true, EMAIL: true },
      recipient: {
        organizationId: "org-a", profileId: "profile-a",
        destinationId: "another-destination", destinationVerified: true, authorizedForData: true,
      },
      event: { severity: "HIGH", dataClass: "ACCOUNT_STATEMENT", purpose: "account-statement-delivery" },
      externalConsents: [emailConsent()],
    }))).toMatchObject({ status: "DENY", reason: "EXTERNAL_CONSENT_REQUIRED" });
  });

  it("blocks a statement when consent covers only general notifications", () => {
    expect(resolveNotificationDelivery(input({
      channel: "EMAIL",
      preferences: preferences({ notificationChannels: ["IN_APP", "EMAIL"] }),
      channelCapabilities: { IN_APP: true, EMAIL: true },
      recipient: {
        organizationId: "org-a", profileId: "profile-a",
        destinationId: "verified-email-destination", destinationVerified: true, authorizedForData: true,
      },
      event: { severity: "HIGH", dataClass: "ACCOUNT_STATEMENT", purpose: "account-statement-delivery" },
      externalConsents: [emailConsent({ dataClasses: ["GENERAL"] })],
    }))).toMatchObject({ status: "DENY", reason: "EXTERNAL_CONSENT_SCOPE_MISMATCH" });
  });

  it("honors consent revocation and fails closed on duplicate consent records", () => {
    const base = {
      channel: "EMAIL" as const,
      preferences: preferences({ notificationChannels: ["IN_APP", "EMAIL"] }),
      channelCapabilities: { IN_APP: true, EMAIL: true },
      recipient: {
        organizationId: "org-a", profileId: "profile-a",
        destinationId: "verified-email-destination", destinationVerified: true, authorizedForData: true,
      },
      event: { severity: "HIGH" as const, dataClass: "ACCOUNT_STATEMENT" as const, purpose: "account-statement-delivery" },
    };
    expect(resolveNotificationDelivery(input({
      ...base,
      externalConsents: [emailConsent({ revokedAt: "2026-11-06T19:30:00.000Z" })],
    }))).toMatchObject({ status: "DENY", reason: "EXTERNAL_CONSENT_REVOKED" });
    expect(resolveNotificationDelivery(input({
      ...base,
      externalConsents: [emailConsent(), emailConsent({ id: "consent-2" })],
    }))).toMatchObject({ status: "REVIEW", reason: "EXTERNAL_CONSENT_AMBIGUOUS" });
  });

  it("rejects tenant/profile crossover and unavailable channels", () => {
    expect(resolveNotificationDelivery(input({
      recipient: { ...input().recipient, organizationId: "org-b" },
    }))).toMatchObject({ status: "DENY", reason: "PREFERENCES_SCOPE_MISMATCH" });
    expect(resolveNotificationDelivery(input({
      channel: "WHATSAPP",
      channelCapabilities: { WHATSAPP: false },
    }))).toMatchObject({ status: "DENY", reason: "CHANNEL_NOT_AVAILABLE" });
  });

  it("does not silently fail open for malformed quiet-hour policy", () => {
    expect(resolveNotificationDelivery(input({
      preferences: preferences({
        quietHours: { enabled: true, startLocal: "22:00", endLocal: "22:00", timeZone: "Asia/Aden" },
      }),
    }))).toMatchObject({ status: "REVIEW", reason: "PREFERENCES_INVALID" });
  });
});


describe("personalization signal minimization", () => {
  const baseSignal = {
    organizationId: "org-a",
    profileId: "profile-a",
    purpose: "work-dashboard",
    verified: true,
    requiredForPurpose: true,
    declaredByUser: false,
  };

  it("uses only role and necessary internal work context and excludes sensitive or inferred signals", async () => {
    const { resolvePersonalizationSignals } = await import("./personalization-governance");
    const result = resolvePersonalizationSignals({
      preferences: preferences(),
      organizationId: "org-a",
      profileId: "profile-a",
      purpose: "work-dashboard",
      destination: "INTERNAL" as never,
      signals: [
        { id: "role", kind: "WORK_ROLE", ...baseSignal },
        { id: "workflow", kind: "ESSENTIAL_WORK_CONTEXT", ...baseSignal },
        { id: "inferred", kind: "INFERRED_PERSONAL_TRAIT", ...baseSignal },
        { id: "sensitive", kind: "SENSITIVE_ATTRIBUTE", ...baseSignal },
        { id: "psych", kind: "PSYCHOLOGICAL_PROFILE", ...baseSignal },
        { id: "customer", kind: "CUSTOMER_PERSONAL_DATA", ...baseSignal },
        { id: "finance", kind: "FINANCIAL_RECORD", ...baseSignal },
        { id: "tasks", kind: "SENSITIVE_TASK_LIST", ...baseSignal },
      ],
      asOf,
    });
    expect(result.status).toBe("PARTIAL");
    expect(result.includedSignalIds).toEqual(["role", "workflow"]);
    expect(result.withheld.map(item => item.signalId)).toEqual([
      "inferred", "sensitive", "psych", "customer", "finance", "tasks",
    ]);
  });

  it("includes a declared preference only when the user explicitly enabled personalization", async () => {
    const { resolvePersonalizationSignals } = await import("./personalization-governance");
    const signal = { id: "declared", kind: "DECLARED_PREFERENCE" as const, ...baseSignal, declaredByUser: true };
    expect(resolvePersonalizationSignals({
      preferences: preferences(), organizationId: "org-a", profileId: "profile-a",
      purpose: "work-dashboard", destination: "INTERNAL", signals: [signal], asOf,
    })).toMatchObject({ status: "UNAVAILABLE", includedSignalIds: [], withheld: [{ reason: "PERSONALIZATION_NOT_ENABLED" }] });
    expect(resolvePersonalizationSignals({
      preferences: preferences({ personalizationEnabled: true }), organizationId: "org-a", profileId: "profile-a",
      purpose: "work-dashboard", destination: "INTERNAL", signals: [signal], asOf,
    })).toMatchObject({ status: "READY", includedSignalIds: ["declared"] });
  });

  it("requires provider/model/purpose-scoped user consent before any external personalization context", async () => {
    const { resolvePersonalizationSignals } = await import("./personalization-governance");
    const signal = { id: "role", kind: "WORK_ROLE" as const, ...baseSignal };
    const base = {
      preferences: preferences({ externalProcessingEnabled: true }),
      organizationId: "org-a", profileId: "profile-a", purpose: "work-dashboard",
      destination: "EXTERNAL_AI" as const, provider: "gemini", model: "free-model", signals: [signal], asOf,
    };
    expect(resolvePersonalizationSignals(base)).toMatchObject({
      status: "DENIED", includedSignalIds: [], reason: "EXTERNAL_CONSENT_REQUIRED",
    });
    const consent = {
      id: "ai-consent-1", organizationId: "org-a", profileId: "profile-a",
      provider: "gemini", model: "free-model", purpose: "work-dashboard",
      signalKinds: ["WORK_ROLE"] as const, grantedAt: "2026-11-06T19:00:00.000Z",
      revokedAt: null, consentVersion: "1", source: "EXPLICIT_USER_ACTION" as const,
    };
    expect(resolvePersonalizationSignals({ ...base, externalConsents: [consent] }))
      .toMatchObject({ status: "READY", includedSignalIds: ["role"] });
    expect(resolvePersonalizationSignals({ ...base, provider: "other", externalConsents: [consent] }))
      .toMatchObject({ status: "DENIED", reason: "EXTERNAL_CONSENT_REQUIRED" });
  });

  it("does not export essential work context to external AI and honors a revoked AI consent", async () => {
    const { resolvePersonalizationSignals } = await import("./personalization-governance");
    const consent = {
      id: "ai-consent-1", organizationId: "org-a", profileId: "profile-a",
      provider: "gemini", model: "free-model", purpose: "work-dashboard",
      signalKinds: ["WORK_ROLE"] as const, grantedAt: "2026-11-06T19:00:00.000Z",
      revokedAt: null, consentVersion: "1", source: "EXPLICIT_USER_ACTION" as const,
    };
    const base = {
      preferences: preferences({ externalProcessingEnabled: true }),
      organizationId: "org-a", profileId: "profile-a", purpose: "work-dashboard",
      destination: "EXTERNAL_AI" as const, provider: "gemini", model: "free-model",
      externalConsents: [consent], asOf,
    };
    expect(resolvePersonalizationSignals({
      ...base, signals: [{ id: "workflow", kind: "ESSENTIAL_WORK_CONTEXT", ...baseSignal }],
    })).toMatchObject({ status: "UNAVAILABLE", withheld: [{ reason: "DISALLOWED_SIGNAL_KIND" }] });
    expect(resolvePersonalizationSignals({
      ...base, externalConsents: [{ ...consent, revokedAt: "2026-11-06T19:30:00.000Z" }],
      signals: [{ id: "role", kind: "WORK_ROLE", ...baseSignal }],
    })).toMatchObject({ status: "DENIED", reason: "EXTERNAL_CONSENT_REVOKED" });
  });

  it("rejects duplicate signal IDs and cross-tenant/profile signals", async () => {
    const { resolvePersonalizationSignals } = await import("./personalization-governance");
    const duplicate = { id: "duplicate", kind: "WORK_ROLE" as const, ...baseSignal };
    expect(resolvePersonalizationSignals({
      preferences: preferences(), organizationId: "org-a", profileId: "profile-a",
      purpose: "work-dashboard", destination: "INTERNAL", signals: [duplicate, duplicate], asOf,
    })).toMatchObject({ status: "UNAVAILABLE", includedSignalIds: [], withheld: [
      { reason: "DUPLICATE_SIGNAL_ID" }, { reason: "DUPLICATE_SIGNAL_ID" },
    ] });
    expect(resolvePersonalizationSignals({
      preferences: preferences(), organizationId: "org-a", profileId: "profile-a",
      purpose: "work-dashboard", destination: "INTERNAL",
      signals: [{ id: "foreign", kind: "WORK_ROLE", ...baseSignal, organizationId: "org-b" }], asOf,
    })).toMatchObject({ status: "UNAVAILABLE", includedSignalIds: [], withheld: [{ reason: "SCOPE_MISMATCH" }] });
  });
});
