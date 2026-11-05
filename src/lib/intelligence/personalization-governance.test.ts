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
