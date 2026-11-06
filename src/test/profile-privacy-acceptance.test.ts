import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");
const profileClient = read("src/lib/customer-account-profile.ts");
const profileSql = read("supabase/migrations/20261106210100_customer_account_profile_command.sql");
const profilePage = read("src/routes/profile.tsx");
const preferenceUi = read("src/components/AccountPersonalizationSettings.tsx");
const preferenceSql = read("supabase/migrations/20261107000000_profile_personalization_preferences.sql");
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
});
