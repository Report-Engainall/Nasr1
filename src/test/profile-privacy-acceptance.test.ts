import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");
const profileClient = read("src/lib/customer-account-profile.ts");
const profileSql = read("supabase/migrations/20261106210100_customer_account_profile_command.sql");
const profilePage = read("src/routes/profile.tsx");
const preferenceUi = read("src/components/AccountPersonalizationSettings.tsx");
const preferenceSql = read("supabase/migrations/20261107000000_profile_personalization_preferences.sql");
const preferenceDeliverySql = read("supabase/migrations/20261107000200_notification_preference_enforcement_and_consent_revocation.sql");
const outbox = read("supabase/functions/outbox-worker/handler.ts");

describe("P1 account profile and notification consent boundaries", () => {
  it("exposes customer-owned commercial profile editing without granting financial or role control", () => {
    expect(profilePage).toContain("<CustomerAccountProfileEditor />");
    expect(profilePage).not.toContain("تعديل بيانات الملف التجاري أو اسم العميل غير متاح");
    expect(profileClient).toContain('supabase.rpc("get_my_customer_account_profile")');
    expect(profileClient).toContain('supabase.rpc("update_my_customer_account_profile"');
    expect(profileClient).toContain("p_expected_updated_at: expectedUpdatedAt");
    expect(profileClient).toContain("تم تعديل بيانات الحساب في جلسة أخرى");
    expect(profileClient).not.toContain("unit_price");
    expect(profileClient).not.toContain("credit_limit");
    expect(profileClient).not.toContain("organization_id");
    expect(profileSql).toContain("'status', v_customer.status");
    expect(profileClient).toContain("status: row.status as CustomerAccountStatus");
    expect(profilePage).toContain("حالة اعتماد حساب العميل");
    expect(profilePage).toContain("بانتظار موافقة الإدارة");
    expect(profilePage).toContain('to: "/help"');
    expect(profilePage).toContain('title: "مركز المساعدة"');
  });

  it("keeps external delivery disabled until destination-scoped explicit consent and a provider path exist", () => {
    expect(preferenceSql).toContain("REVOKE ALL ON TABLE public.profile_notification_channel_consents FROM PUBLIC,anon,authenticated");
    expect(preferenceSql).toContain("DEFAULT 'EXPLICIT_USER_ACTION'");
    expect(preferenceSql).toContain("CHECK (source = 'EXPLICIT_USER_ACTION')");
    expect(preferenceSql).toContain("profile_notification_consent_active_scope_uidx");
    expect(preferenceUi).toContain("EMAIL: false");
    expect(preferenceUi).toContain("WHATSAPP: false");
    expect(preferenceUi).toContain("SMS: false");
    expect(outbox).toContain('client.rpc("process_outbox_event"');
    expect(outbox).not.toContain("whatsapp");
    expect(outbox).not.toContain("sendgrid");
    expect(outbox).not.toContain("resend");
  });

  it("enforces account notification preferences at the final in-app sender boundary", () => {
    expect(preferenceDeliverySql).toContain("BEFORE INSERT ON public.notifications");
    expect(preferenceDeliverySql).toContain("notification_channels");
    expect(preferenceDeliverySql).toContain("NEW.organization_id IS DISTINCT FROM v_profile_org");
    expect(preferenceDeliverySql).toContain("NEW.organization_id := v_profile_org");
    expect(preferenceDeliverySql).toContain("NOTIFICATION_LEVEL_FILTERED");
    expect(preferenceDeliverySql).toContain("QUIET_HOURS");
    expect(preferenceDeliverySql).toContain("notification_delivery_suppressions");
    expect(preferenceDeliverySql).toContain("RETURN NULL");
  });

  it("allows account-owned external consent revocation without direct consent-table mutation", () => {
    expect(preferenceDeliverySql).toContain("revoke_my_personalization_channel_consent");
    expect(preferenceDeliverySql).toContain("p_expected_granted_at");
    expect(preferenceDeliverySql).toContain("GRANT EXECUTE ON FUNCTION public.revoke_my_personalization_channel_consent(uuid,timestamptz)");
    expect(preferenceDeliverySql).toContain("REVOKE ALL ON TABLE public.notification_delivery_suppressions FROM PUBLIC,anon,authenticated,service_role");
    expect(preferenceSql).toContain("REVOKE ALL ON TABLE public.profile_notification_channel_consents FROM PUBLIC,anon,authenticated");
  });
});
