import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  normalizeAuthPhoneIdentifier,
  requestPhoneSignup,
  resendPhoneSignupCode,
  signInWithPhonePassword,
  verifyPhoneSignupCode,
  type PhoneAuthApi,
} from "./auth-phone";

const TEST_SECRET = "x".repeat(16);
function createAuthApi() {
  return {
    signInWithPassword: vi.fn().mockResolvedValue({ data: { user: { id: "user" }, session: {} }, error: null }),
    signUp: vi.fn().mockResolvedValue({ data: { user: { id: "user" }, session: null }, error: null }),
    verifyOtp: vi.fn().mockResolvedValue({ data: { user: { id: "user" }, session: {} }, error: null }),
    resend: vi.fn().mockResolvedValue({ data: { messageId: "message" }, error: null }),
  } as unknown as PhoneAuthApi;
}

describe("phone authentication contract", () => {
  it.each([
    ["712345678", "+967712345678"],
    ["0712345678", "+967712345678"],
    ["+967 7 1234 5678", "+967712345678"],
    ["00967 7 1234 5678", "+967712345678"],
    ["967712345678", "+967712345678"],
    ["+1 (415) 555-2671", "+14155552671"],
  ])("normalizes %s to %s", (input, expected) => {
    expect(normalizeAuthPhoneIdentifier(input)).toBe(expected);
  });

  it.each(["", "71234567", "71234567890", "abc712345678", "++967712345678", "+9677123456789x", "009661234567890"])(
    "rejects malformed phone identifier %s",
    (input) => expect(normalizeAuthPhoneIdentifier(input)).toBeNull(),
  );

  let auth: PhoneAuthApi;
  beforeEach(() => { auth = createAuthApi(); });

  it("uses the phone credential property for password sign-in", async () => {
    await signInWithPhonePassword(auth, "0712345678", TEST_SECRET);
    expect(auth.signInWithPassword).toHaveBeenCalledWith({
      phone: "+967712345678",
      password: TEST_SECRET,
    });
  });

  it("rejects an invalid phone before password sign-in", async () => {
    await expect(signInWithPhonePassword(auth, "bad-phone", TEST_SECRET)).rejects.toThrow(
      "أدخل رقماً يمنياً صحيحاً",
    );
    expect(auth.signInWithPassword).not.toHaveBeenCalled();
  });

  it("creates an Auth phone account with SMS and full-name metadata", async () => {
    await requestPhoneSignup(auth, "0712345678", TEST_SECRET, " تاجر الأغبري ");
    expect(auth.signUp).toHaveBeenCalledWith({
      phone: "+967712345678",
      password: TEST_SECRET,
      options: { data: { full_name: "تاجر الأغبري" }, channel: "sms" },
    });
  });

  it("rejects invalid signup phones before calling Auth", async () => {
    await expect(requestPhoneSignup(auth, "phone-123", TEST_SECRET, "تاجر")).rejects.toThrow(
      "أدخل رقماً يمنياً صحيحاً",
    );
    expect(auth.signUp).not.toHaveBeenCalled();
  });

  it("verifies the SMS token against the normalized phone", async () => {
    await verifyPhoneSignupCode(auth, "7 1234 5678", "123-456");
    expect(auth.verifyOtp).toHaveBeenCalledWith({ phone: "+967712345678", token: "123456", type: "sms" });
  });

  it("rejects malformed tokens before calling Auth", async () => {
    await expect(verifyPhoneSignupCode(auth, "712345678", "12x")).rejects.toThrow(
      "رمز التحقق المكوّن من 4 إلى 8 أرقام",
    );
    expect(auth.verifyOtp).not.toHaveBeenCalled();
  });

  it("resends the phone signup SMS to the normalized phone", async () => {
    await resendPhoneSignupCode(auth, "00967 7 1234 5678");
    expect(auth.resend).toHaveBeenCalledWith({ type: "sms", phone: "+967712345678" });
  });

  it("rejects resend for an invalid phone", async () => {
    await expect(resendPhoneSignupCode(auth, "not-a-phone")).rejects.toThrow("رقم الهاتف غير صالح");
    expect(auth.resend).not.toHaveBeenCalled();
  });
});
