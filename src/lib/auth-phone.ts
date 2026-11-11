import type { SupabaseClient } from "@supabase/supabase-js";

export type PhoneAuthApi = Pick<SupabaseClient["auth"], "signInWithPassword" | "signUp" | "verifyOtp" | "resend">;

/**
 * Accepts Yemeni mobile numbers in local, 967, 00967 or E.164 form.
 * Formatting punctuation is allowed; alphabetic or misplaced-plus input is not.
 */
export function normalizeAuthPhoneIdentifier(value: string): string | null {
  const compact = value.trim().replace(/[()\s-]/g, "");
  if (!compact || !/^\+?\d+$/.test(compact)) return null;

  if (compact.startsWith("+")) {
    return /^\+[1-9]\d{7,14}$/.test(compact) ? compact : null;
  }

  if (/^00967\d{9}$/.test(compact)) return `+${compact.slice(2)}`;
  if (/^967\d{9}$/.test(compact)) return `+${compact}`;

  const local = compact.startsWith("0") ? compact.slice(1) : compact;
  return /^7\d{8}$/.test(local) ? `+967${local}` : null;
}

export async function signInWithPhonePassword(
  auth: PhoneAuthApi,
  identifier: string,
  password: string,
) {
  const phone = normalizeAuthPhoneIdentifier(identifier);
  if (!phone) {
    throw new Error("أدخل رقماً يمنياً صحيحاً يبدأ بـ7 أو رقماً دولياً بصيغة +رمز الدولة.");
  }

  return auth.signInWithPassword({ phone, password });
}

export async function requestPhoneSignup(
  auth: PhoneAuthApi,
  identifier: string,
  password: string,
  fullName: string,
  businessName = "",
) {
  const phone = normalizeAuthPhoneIdentifier(identifier);
  if (!phone) {
    throw new Error("أدخل رقماً يمنياً صحيحاً يبدأ بـ7 أو رقماً دولياً بصيغة +رمز الدولة.");
  }

  return auth.signUp({
    phone,
    password,
    options: {
      data: {
        full_name: fullName.trim(),
        business_name: businessName.trim() || fullName.trim(),
      },
      channel: "sms",
    },
  });
}

export async function verifyPhoneSignupCode(
  auth: PhoneAuthApi,
  phoneInput: string,
  tokenInput: string,
) {
  const phone = normalizeAuthPhoneIdentifier(phoneInput);
  const token = tokenInput.replace(/\D/g, "");
  if (!phone) throw new Error("رقم الهاتف غير صالح. أعد إدخال رقمك.");
  if (!/^\d{4,8}$/.test(token)) {
    throw new Error("أدخل رمز التحقق المكوّن من 4 إلى 8 أرقام.");
  }

  return auth.verifyOtp({ phone, token, type: "sms" });
}

export async function resendPhoneSignupCode(auth: PhoneAuthApi, phoneInput: string) {
  const phone = normalizeAuthPhoneIdentifier(phoneInput);
  if (!phone) throw new Error("رقم الهاتف غير صالح. أعد إدخال رقمك.");

  return auth.resend({ type: "sms", phone });
}
