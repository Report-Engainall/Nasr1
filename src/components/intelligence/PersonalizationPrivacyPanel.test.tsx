// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import {
  createDefaultPersonalizationPreferences,
  type ExternalChannelConsent,
  type PersonalizationPreferences,
} from "@/lib/intelligence/personalization-governance";
import {
  PersonalizationPrivacyPanel,
  type PersonalizationPreferencesSaveRequest,
} from "./PersonalizationPrivacyPanel";

afterEach(cleanup);

const initialPreferences = (): PersonalizationPreferences => ({
  ...createDefaultPersonalizationPreferences({
    organizationId: "org-a",
    profileId: "profile-a",
    savedAt: "2026-11-06T19:00:00.000Z",
    timeZone: "Asia/Aden",
  }),
});

describe("PersonalizationPrivacyPanel", () => {
  it("does not invent local preferences or claim save availability when the server has not loaded them", () => {
    render(<PersonalizationPrivacyPanel authorized preferences={null} />);
    expect(screen.getByText(/لم تُنشأ قيم محلية ولم يتم افتراض موافقات/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "حفظ إعدادات الخصوصية" })).toBeNull();
  });

  it("does not permit editing another profile when authorization is absent", () => {
    render(<PersonalizationPrivacyPanel authorized={false} preferences={initialPreferences()} />);
    expect(screen.getByText(/لا تتوفر صلاحية عرض إعدادات هذا الملف الشخصي/)).toBeTruthy();
    expect(screen.queryByLabelText("قنوات الإشعار")).toBeNull();
  });

  it("keeps save disabled until a real server adapter is provided", () => {
    render(<PersonalizationPrivacyPanel authorized preferences={initialPreferences()} />);
    expect(screen.getByText(/خدمة حفظ الإعدادات غير متصلة/)).toBeTruthy();
    expect((screen.getByRole("button", { name: "حفظ إعدادات الخصوصية" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("submits only preference changes with the expected version and trusts only returned server state", async () => {
    const preferences = initialPreferences();
    const onSavePreferences = vi.fn(async (request: PersonalizationPreferencesSaveRequest) => ({
      ok: true as const,
      preferences: {
        ...preferences,
        ...request.changes,
        updatedAt: "2026-11-06T20:00:00.000Z",
      },
    }));
    const onSaved = vi.fn();
    render(
      <PersonalizationPrivacyPanel
        authorized
        preferences={preferences}
        onSavePreferences={onSavePreferences}
        onSaved={onSaved}
      />,
    );
    fireEvent.click(screen.getByRole("checkbox", { name: /تقليل الحركة/ }));
    fireEvent.click(screen.getByRole("button", { name: "حفظ إعدادات الخصوصية" }));
    await waitFor(() => expect(onSavePreferences).toHaveBeenCalledTimes(1));
    const submitted = onSavePreferences.mock.calls[0][0];
    expect(submitted.expectedUpdatedAt).toBe(preferences.updatedAt);
    expect(submitted.changes.reducedMotion).toBe(true);
    await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1));
    expect(screen.getByText(/أكد الخادم حفظ/).textContent).toContain("أكد الخادم حفظ");
  });

  it("rejects a successful-looking response for a different tenant or profile", async () => {
    const preferences = initialPreferences();
    const onSavePreferences = vi.fn(async () => ({
      ok: true as const,
      preferences: { ...preferences, profileId: "profile-b", updatedAt: "2026-11-06T20:00:00.000Z" },
    }));
    render(
      <PersonalizationPrivacyPanel
        authorized
        preferences={preferences}
        onSavePreferences={onSavePreferences}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "حفظ إعدادات الخصوصية" }));
    await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("خارج نطاق المستخدم الحالي"));
  });

  it("keeps disconnected external channels disabled unless they are already selected so users can turn them off", () => {
    const preferences = initialPreferences();
    render(
      <PersonalizationPrivacyPanel
        authorized
        preferences={{ ...preferences, notificationChannels: ["IN_APP", "EMAIL"] }}
        channelCapabilities={{ EMAIL: false, WHATSAPP: false, SMS: false }}
      />,
    );
    const email = screen.getByRole("checkbox", { name: /البريد الإلكتروني/ }) as HTMLInputElement;
    const whatsapp = screen.getByRole("checkbox", { name: /واتساب/ }) as HTMLInputElement;
    expect(email.disabled).toBe(false);
    expect(whatsapp.disabled).toBe(true);
  });

  it("revokes only the selected active channel consent after explicit confirmation", async () => {
    const preferences: PersonalizationPreferences = { ...initialPreferences(), notificationChannels: ["IN_APP", "EMAIL"] };
    const consent: ExternalChannelConsent = {
      id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      organizationId: "org-a",
      profileId: "profile-a",
      channel: "EMAIL" as const,
      destinationId: "account-email-id",
      destinationLabel: "nasr@example.test",
      purpose: "order_updates",
      dataClasses: ["GENERAL"],
      grantedAt: "2026-11-06T19:30:00.000Z",
      revokedAt: null,
      consentVersion: "consent-v1",
      source: "EXPLICIT_USER_ACTION" as const,
    };
    const revoked = { ...consent, revokedAt: "2026-11-06T20:00:00.000Z" };
    const onRevokeConsent = vi.fn(async (request: { consentId: string; expectedGrantedAt: string }) => {
      expect(request).toEqual({ consentId: consent.id, expectedGrantedAt: consent.grantedAt });
      return { ok: true as const, consent: revoked };
    });
    const onConsentRevoked = vi.fn();
    vi.spyOn(window, "confirm").mockReturnValue(true);
    render(
      <PersonalizationPrivacyPanel
        authorized
        preferences={preferences}
        channelCapabilities={{ EMAIL: true }}
        externalConsents={[consent]}
        consentReadStatus="LOADED"
        onRevokeConsent={onRevokeConsent}
        onConsentRevoked={onConsentRevoked}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "إلغاء الموافقة" }));
    await waitFor(() => expect(onRevokeConsent).toHaveBeenCalledTimes(1));
    expect(onConsentRevoked).toHaveBeenCalledWith(revoked);
    expect(screen.getByText(/أكد الخادم إلغاء الموافقة/).textContent).toContain("أكد الخادم إلغاء الموافقة");
  });
});
