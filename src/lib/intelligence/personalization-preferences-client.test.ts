import { beforeEach, describe, expect, it, vi } from "vitest";

const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("@/lib/supabase", () => ({ supabase: { rpc } }));

import { revokeMyPersonalizationChannelConsent } from "./personalization-preferences-client";

const consentId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const grantedAt = "2026-11-06T19:30:00.000Z";
const response = (profileId = "profile-a") => ({
  id: consentId,
  organizationId: "org-a",
  profileId,
  channel: "EMAIL",
  destinationId: "account-email-id",
  destinationLabel: "nasr@example.test",
  purpose: "order_updates",
  dataClasses: ["GENERAL"],
  grantedAt,
  revokedAt: "2026-11-06T20:00:00.000Z",
  consentVersion: "consent-v1",
  source: "EXPLICIT_USER_ACTION",
  alreadyRevoked: false,
});

describe("personalization consent revocation client", () => {
  beforeEach(() => rpc.mockReset());

  it("rejects invalid consent identifiers before calling the database", async () => {
    const result = await revokeMyPersonalizationChannelConsent("profile-a", {
      consentId: "not-a-uuid",
      expectedGrantedAt: grantedAt,
    });
    expect(result).toMatchObject({ ok: false });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("calls the profile-scoped revocation RPC and validates its returned consent", async () => {
    rpc.mockResolvedValueOnce({ data: response(), error: null });
    const result = await revokeMyPersonalizationChannelConsent("profile-a", {
      consentId,
      expectedGrantedAt: grantedAt,
    });
    expect(rpc).toHaveBeenCalledWith("revoke_my_personalization_channel_consent", {
      p_consent_id: consentId,
      p_expected_granted_at: grantedAt,
    });
    expect(result).toMatchObject({
      ok: true,
      consent: { id: consentId, profileId: "profile-a", revokedAt: "2026-11-06T20:00:00.000Z" },
    });
  });

  it("rejects a returned consent that belongs to another profile", async () => {
    rpc.mockResolvedValueOnce({ data: response("profile-b"), error: null });
    expect(await revokeMyPersonalizationChannelConsent("profile-a", {
      consentId,
      expectedGrantedAt: grantedAt,
    })).toMatchObject({ ok: false });
  });

  it("does not report success when the database rejects the revocation", async () => {
    rpc.mockResolvedValueOnce({ data: null, error: { code: "42501", message: "denied" } });
    expect(await revokeMyPersonalizationChannelConsent("profile-a", {
      consentId,
      expectedGrantedAt: grantedAt,
    })).toMatchObject({ ok: false, message: "لا تملك صلاحية قراءة إعدادات هذا الحساب." });
  });
});
