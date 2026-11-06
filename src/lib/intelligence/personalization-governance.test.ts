import { describe, expect, it } from "vitest";
import {
  createDefaultPersonalizationPreferences,
  createNotificationDeliveryAuditMetadata,
  resolveNotificationDelivery,
  resolvePersonalizationExperience,
  type ExternalChannelConsent,
  type NotificationDeliveryInput,
  type PersonalizationPreferences,
  resolvePersonalizationSignals,
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
      destination: "INTERNAL",
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


describe("privacy data request governance", () => {
  const basePolicy = {
    organizationId: "org-a",
    recordClass: "CUSTOMER_PERSONAL_DATA" as const,
    purpose: "privacy-rights-request",
    policyVersion: "policy-2026-01",
    retentionRule: "FIXED_UNTIL" as const,
    retainUntil: "2026-01-01T00:00:00.000Z",
    legalHold: false,
    supportsAccess: true,
    correctionMode: "DIRECT" as const,
    supportsDeletion: true,
    evidence: {
      id: "retention-policy-evidence",
      status: "VERIFIED" as const,
      completeness: "COMPLETE" as const,
      quality: "ACCEPTABLE" as const,
      sourceTimestamp: "2026-11-06T18:00:00.000Z",
      asOf: "2026-11-06T19:00:00.000Z",
    },
  };

  function privacyRequest(overrides: Record<string, unknown> = {}) {
    return {
      requestId: "request-1",
      organizationId: "org-a",
      actorProfileId: "profile-a",
      subjectProfileId: "profile-a",
      recordOrganizationId: "org-a",
      recordRef: "opaque-record-reference",
      recordClass: "CUSTOMER_PERSONAL_DATA" as const,
      purpose: "privacy-rights-request",
      action: "DELETION" as const,
      actorAuthorized: true,
      subjectOwnershipVerified: true,
      asOf: "2026-11-06T20:00:00.000Z",
      policy: basePolicy,
      ...overrides,
    };
  }

  it("requires a verified, complete and current source retention policy", async () => {
    const { resolvePrivacyDataRequest } = await import("./personalization-governance");
    expect(resolvePrivacyDataRequest(privacyRequest({
      policy: { ...basePolicy, evidence: { ...basePolicy.evidence, status: "UNVERIFIED" } },
    }))).toMatchObject({ status: "REVIEW_REQUIRED", reason: "RETENTION_POLICY_NOT_VERIFIED" });
    expect(resolvePrivacyDataRequest(privacyRequest({ policy: null })))
      .toMatchObject({ status: "UNAVAILABLE", reason: "RETENTION_POLICY_NOT_LOADED" });
  });

  it("allows only an authorized, tenant-scoped access workflow", async () => {
    const { resolvePrivacyDataRequest } = await import("./personalization-governance");
    expect(resolvePrivacyDataRequest(privacyRequest({ action: "ACCESS" })))
      .toMatchObject({ status: "ELIGIBLE_FOR_ACCESS_WORKFLOW", performsMutation: false, requiresHumanApproval: true });
    expect(resolvePrivacyDataRequest(privacyRequest({
      action: "ACCESS", actorProfileId: "profile-b", subjectOwnershipVerified: false,
    }))).toMatchObject({ status: "DENIED", reason: "REQUESTER_NOT_AUTHORIZED" });
    expect(resolvePrivacyDataRequest(privacyRequest({ recordOrganizationId: "org-b" })))
      .toMatchObject({ status: "DENIED", reason: "RECORD_SCOPE_MISMATCH" });
  });

  it("never offers deletion for financial or audit records, even after retention expires", async () => {
    const { resolvePrivacyDataRequest } = await import("./personalization-governance");
    for (const recordClass of ["FINANCIAL_RECORD", "AUDIT_RECORD"] as const) {
      expect(resolvePrivacyDataRequest(privacyRequest({
        recordClass,
        policy: { ...basePolicy, recordClass, retentionRule: "NOT_REQUIRED", retainUntil: null },
      }))).toMatchObject({ status: "DENIED", reason: "IMMUTABLE_RECORD", performsMutation: false });
    }
  });

  it("honors legal holds and source retention deadlines without inventing retention periods", async () => {
    const { resolvePrivacyDataRequest } = await import("./personalization-governance");
    expect(resolvePrivacyDataRequest(privacyRequest({
      policy: { ...basePolicy, legalHold: true },
    }))).toMatchObject({ status: "DENIED", reason: "LEGAL_HOLD_ACTIVE" });
    expect(resolvePrivacyDataRequest(privacyRequest({
      policy: { ...basePolicy, retainUntil: "2027-01-01T00:00:00.000Z" },
    }))).toMatchObject({ status: "DENIED", reason: "RETENTION_NOT_EXPIRED" });
    expect(resolvePrivacyDataRequest(privacyRequest({
      policy: { ...basePolicy, retentionRule: "INDEFINITE", retainUntil: null },
    }))).toMatchObject({ status: "DENIED", reason: "INDEFINITE_RETENTION" });
  });

  it("requires append-only correction for financial and audit records", async () => {
    const { resolvePrivacyDataRequest } = await import("./personalization-governance");
    expect(resolvePrivacyDataRequest(privacyRequest({
      action: "CORRECTION",
      recordClass: "FINANCIAL_RECORD",
      policy: { ...basePolicy, recordClass: "FINANCIAL_RECORD", correctionMode: "DIRECT" },
    }))).toMatchObject({ status: "DENIED", reason: "IMMUTABLE_RECORD" });
    expect(resolvePrivacyDataRequest(privacyRequest({
      action: "CORRECTION",
      recordClass: "FINANCIAL_RECORD",
      policy: { ...basePolicy, recordClass: "FINANCIAL_RECORD", correctionMode: "APPEND_ONLY" },
    }))).toMatchObject({ status: "ELIGIBLE_FOR_APPEND_ONLY_CORRECTION", performsMutation: false });
  });

  it("requires review rather than performing an eligible deletion and emits payload-free audit metadata", async () => {
    const { createPrivacyAuditMetadata, resolvePrivacyDataRequest } = await import("./personalization-governance");
    const request = privacyRequest();
    const result = resolvePrivacyDataRequest(request);
    expect(result).toMatchObject({
      status: "ELIGIBLE_FOR_DELETION_REVIEW",
      reason: "ELIGIBLE",
      performsMutation: false,
      requiresHumanApproval: true,
    });
    const metadata = createPrivacyAuditMetadata(request, result);
    expect(metadata).toMatchObject({
      eventType: "PRIVACY_DATA_REQUEST",
      requestId: "request-1",
      decisionStatus: "ELIGIBLE_FOR_DELETION_REVIEW",
      policyVersion: "policy-2026-01",
    });
    expect(metadata).not.toHaveProperty("recordPayload");
    expect(metadata).not.toHaveProperty("customerName");
    expect(metadata).not.toHaveProperty("financialAmount");
  });

  it("returns no audit metadata for a mismatched decision/request pair", async () => {
    const { createPrivacyAuditMetadata, resolvePrivacyDataRequest } = await import("./personalization-governance");
    const request = privacyRequest();
    const decision = resolvePrivacyDataRequest({ ...request, action: "ACCESS" });
    expect(createPrivacyAuditMetadata(request, decision)).toBeNull();
  });
});


describe("privacy usage audit and subject ownership", () => {
  it("requires server-verified record ownership even when requester and subject IDs match", async () => {
    const { resolvePrivacyDataRequest } = await import("./personalization-governance");
    expect(resolvePrivacyDataRequest({
      requestId: "request-ownership",
      organizationId: "org-a",
      actorProfileId: "profile-a",
      subjectProfileId: "profile-a",
      recordOrganizationId: "org-a",
      recordRef: "opaque-record-reference",
      recordClass: "CUSTOMER_PERSONAL_DATA",
      purpose: "privacy-rights-request",
      action: "ACCESS",
      actorAuthorized: true,
      subjectOwnershipVerified: false,
      asOf: "2026-11-06T20:00:00.000Z",
      policy: {
        organizationId: "org-a", recordClass: "CUSTOMER_PERSONAL_DATA",
        purpose: "privacy-rights-request", policyVersion: "policy-1",
        retentionRule: "NOT_REQUIRED", retainUntil: null, legalHold: false,
        supportsAccess: true, correctionMode: "DIRECT", supportsDeletion: false,
        evidence: {
          id: "policy-evidence", status: "VERIFIED", completeness: "COMPLETE",
          quality: "ACCEPTABLE", sourceTimestamp: "2026-11-06T18:00:00.000Z",
          asOf: "2026-11-06T19:00:00.000Z",
        },
      },
    })).toMatchObject({ status: "DENIED", reason: "SUBJECT_OWNERSHIP_NOT_VERIFIED" });
  });

  it("creates a payload-free audit record only for the recomputed personalization decision", async () => {
    const { createPersonalizationUsageAuditMetadata, resolvePersonalizationSignals } =
      await import("./personalization-governance");
    const signals = [
      {
        id: "role", organizationId: "org-a", profileId: "profile-a", purpose: "work-dashboard",
        kind: "WORK_ROLE" as const, verified: true, requiredForPurpose: true, declaredByUser: false,
      },
      {
        id: "secret", organizationId: "org-a", profileId: "profile-a", purpose: "work-dashboard",
        kind: "FINANCIAL_RECORD" as const, verified: true, requiredForPurpose: true, declaredByUser: false,
      },
    ];
    const request = {
      preferences: preferences(),
      organizationId: "org-a", profileId: "profile-a", actorProfileId: "profile-a",
      purpose: "work-dashboard", destination: "INTERNAL" as const, signals, asOf,
    };
    const result = resolvePersonalizationSignals(request);
    const metadata = createPersonalizationUsageAuditMetadata(request, result);
    expect(metadata).toMatchObject({
      eventType: "PERSONALIZATION_CONTEXT_EVALUATED",
      profileId: "profile-a",
      includedSignalIds: ["role"],
      withheldCount: 1,
    });
    expect(metadata).not.toHaveProperty("signalValues");
    expect(metadata).not.toHaveProperty("financialAmount");
    expect(createPersonalizationUsageAuditMetadata(request, {
      ...result,
      includedSignalIds: ["secret"],
    })).toBeNull();
    expect(createPersonalizationUsageAuditMetadata({ ...request, actorProfileId: "profile-b" }, result))
      .toBeNull();
  });


describe("notification delivery policy audit metadata", () => {
  it("records an in-app decision without message or recipient destination data", () => {
    const request = {
      ...input(),
      deliveryAttemptId: "attempt-in-app-1",
      actorProfileId: "profile-a",
    };
    const decision = resolveNotificationDelivery(request);
    expect(decision).toMatchObject({ status: "ALLOW", reason: "ALLOWED" });
    const metadata = createNotificationDeliveryAuditMetadata(request, decision);
    expect(metadata).toMatchObject({
      eventType: "NOTIFICATION_DELIVERY_POLICY_EVALUATED",
      deliveryAttemptId: "attempt-in-app-1",
      organizationId: "org-a",
      recipientProfileId: "profile-a",
      actorProfileId: "profile-a",
      channel: "IN_APP",
      decisionStatus: "ALLOW",
      decisionReason: "ALLOWED",
      policyVersion: "1.0.0",
      consentId: null,
      consentVersion: null,
    });
    expect(metadata).not.toHaveProperty("destinationId");
    expect(metadata).not.toHaveProperty("destinationAddress");
    expect(metadata).not.toHaveProperty("messageBody");
    expect(metadata).not.toHaveProperty("title");
    expect(metadata).not.toHaveProperty("financialAmount");
  });

  it("records exact external consent references without recording the destination", () => {
    const request = {
      ...input({
        channel: "EMAIL",
        event: {
          severity: "HIGH",
          dataClass: "ACCOUNT_STATEMENT",
          purpose: "account-statement-delivery",
        },
        recipient: {
          organizationId: "org-a",
          profileId: "profile-a",
          destinationId: "verified-email-destination",
          destinationVerified: true,
          authorizedForData: true,
        },
        preferences: preferences({ notificationChannels: ["IN_APP", "EMAIL"] }),
        channelCapabilities: { EMAIL: true },
        externalConsents: [emailConsent()],
      }),
      deliveryAttemptId: "attempt-email-1",
      actorProfileId: "profile-a",
    };
    const decision = resolveNotificationDelivery(request);
    expect(decision).toMatchObject({ status: "ALLOW", reason: "ALLOWED" });
    const metadata = createNotificationDeliveryAuditMetadata(request, decision);
    expect(metadata).toMatchObject({
      channel: "EMAIL",
      decisionStatus: "ALLOW",
      consentId: "consent-1",
      consentVersion: "1",
    });
    expect(metadata).not.toHaveProperty("destinationId");
    expect(metadata).not.toHaveProperty("email");
  });

  it("retains a revoked consent reference on a denied delivery decision", () => {
    const request = {
      ...input({
        channel: "EMAIL",
        event: {
          severity: "HIGH",
          dataClass: "ACCOUNT_STATEMENT",
          purpose: "account-statement-delivery",
        },
        recipient: {
          organizationId: "org-a",
          profileId: "profile-a",
          destinationId: "verified-email-destination",
          destinationVerified: true,
          authorizedForData: true,
        },
        preferences: preferences({ notificationChannels: ["IN_APP", "EMAIL"] }),
        channelCapabilities: { EMAIL: true },
        externalConsents: [emailConsent({ revokedAt: "2026-11-06T19:30:00.000Z" })],
      }),
      deliveryAttemptId: "attempt-email-revoked",
      actorProfileId: "profile-a",
    };
    const decision = resolveNotificationDelivery(request);
    expect(decision).toMatchObject({ status: "DENY", reason: "EXTERNAL_CONSENT_REVOKED" });
    expect(createNotificationDeliveryAuditMetadata(request, decision)).toMatchObject({
      decisionStatus: "DENY",
      decisionReason: "EXTERNAL_CONSENT_REVOKED",
      consentId: "consent-1",
      consentVersion: "1",
    });
  });

  it("rejects altered decisions and malformed audit identities", () => {
    const request = {
      ...input(),
      deliveryAttemptId: "attempt-in-app-2",
      actorProfileId: "profile-a",
    };
    const decision = resolveNotificationDelivery(request);
    expect(createNotificationDeliveryAuditMetadata(request, {
      ...decision,
      status: "ALLOW",
      reason: "ALLOWED",
      channel: "IN_APP",
      detailLevel: decision.detailLevel,
      reducedMotion: decision.reducedMotion,
      personalizationMode: decision.personalizationMode,
      externalContextAllowed: decision.externalContextAllowed,
    })).toMatchObject({ decisionStatus: "ALLOW" });
    expect(createNotificationDeliveryAuditMetadata(request, {
      ...decision,
      reason: "EXTERNAL_CONSENT_REQUIRED",
    })).toBeNull();
    expect(createNotificationDeliveryAuditMetadata({
      ...request,
      actorProfileId: "",
    }, decision)).toBeNull();
    expect(createNotificationDeliveryAuditMetadata({
      ...request,
      deliveryAttemptId: "x".repeat(129),
    }, decision)).toBeNull();
  });
  it("reviews malformed consent collections and rejects missing audit decisions without throwing", () => {
    const request = input({
      channel: "EMAIL",
      event: {
        severity: "HIGH",
        dataClass: "ACCOUNT_STATEMENT",
        purpose: "account-statement-delivery",
      },
      recipient: {
        organizationId: "org-a",
        profileId: "profile-a",
        destinationId: "verified-email-destination",
        destinationVerified: true,
        authorizedForData: true,
      },
      preferences: preferences({ notificationChannels: ["IN_APP", "EMAIL"] }),
      channelCapabilities: { EMAIL: true },
      externalConsents: [null as unknown as ExternalChannelConsent],
    });
    const decision = resolveNotificationDelivery(request);
    expect(decision).toMatchObject({
      status: "REVIEW",
      reason: "EXTERNAL_CONSENT_INVALID",
    });
    expect(createNotificationDeliveryAuditMetadata({
      ...request,
      deliveryAttemptId: "attempt-malformed-consent",
      actorProfileId: "profile-a",
    }, decision)).toMatchObject({
      decisionStatus: "REVIEW",
      decisionReason: "EXTERNAL_CONSENT_INVALID",
      consentId: null,
    });
    expect(createNotificationDeliveryAuditMetadata({
      ...input(),
      deliveryAttemptId: "attempt-invalid-result",
      actorProfileId: "profile-a",
    }, null as unknown as ReturnType<typeof resolveNotificationDelivery>)).toBeNull();
    expect(createNotificationDeliveryAuditMetadata(
      null as unknown as NotificationDeliveryInput & { deliveryAttemptId: string; actorProfileId: string },
      resolveNotificationDelivery(input()),
    )).toBeNull();
  });
});
});
