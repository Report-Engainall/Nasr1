import { readFileSync } from "node:fs";
import { createElement } from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { Login } from "./Login";

const authMocks = vi.hoisted(() => ({
  signIn: vi.fn(),
  signUp: vi.fn(),
  verifyPhoneSignup: vi.fn(),
  resendPhoneSignupCode: vi.fn(),
  resetPassword: vi.fn(),
}));

vi.mock("@/lib/auth", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/auth")>();
  return { ...actual, useAuth: () => ({ ...authMocks, loading: false }) };
});

describe("customer phone registration UI integration", () => {
  it("renders public self-service registration with phone as the default and optional business name", () => {
    const markup = renderToStaticMarkup(createElement(Login, { initialMode: "register" }));

    expect(markup).toContain("إنشاء حساب تجاري");
    expect(markup).toContain("الاسم الكامل");
    expect(markup).toContain("رقم الهاتف");
    expect(markup).toContain("التسجيل بالبريد الإلكتروني");
    expect(markup).toContain("اسم المحل / الشركة (اختياري)");
    expect(markup).toContain("إنشاء الحساب");
  });

  it("wires phone mode to a telephone field, phone Auth signup, SMS verification and resend", () => {
    const source = readFileSync(new URL("./Login.tsx", import.meta.url), "utf8");

    expect(source).toContain('const isPhone = (mode === "login" || mode === "register") && phoneLogin;');
    expect(source).toContain('type={isPhone ? "tel" : "email"}');
    expect(source).toContain('placeholder={isPhone ? "+967 7xxxxxxxx أو 7xxxxxxxx" : "name@example.com"}');
    expect(source).toContain("phoneLogin ? 'phone' : 'email'");
    expect(source).toContain("useState(initialMode === 'register')");
    expect(source).toContain("businessName");
    expect(source).toContain("await signUp(email, password, name, phoneLogin ? 'phone' : 'email', businessName)");
    expect(source).toContain("verifyPhoneSignup(pendingPhone, verificationCode)");
    expect(source).toContain("resendPhoneSignupCode(pendingPhone)");
    expect(source).toContain("رمز التحقق المرسل إلى الهاتف");
  });

  it("accepts Arabic phone digits and converts localized SMS digits before verification", async () => {
    vi.clearAllMocks();
    authMocks.signUp.mockResolvedValue({ needsConfirmation: true, confirmationType: "phone", existingAccount: false });
    authMocks.verifyPhoneSignup.mockResolvedValue(undefined);

    render(createElement(Login, { initialMode: "register" }));
    fireEvent.change(screen.getByLabelText("الاسم الكامل"), { target: { value: "تاجر الأغبري" } });
    fireEvent.change(screen.getByLabelText(/رقم الهاتف/), { target: { value: "٠٧١٢٣٤٥٦٧٨" } });
    fireEvent.change(screen.getByLabelText("كلمة المرور"), { target: { value: "secure-pass-123" } });
    fireEvent.click(screen.getByRole("button", { name: "إنشاء الحساب" }));

    const verificationInput = await screen.findByLabelText("رمز التحقق المرسل إلى الهاتف");
    fireEvent.change(verificationInput, { target: { value: "١٢٣٤٥٦" } });
    expect((verificationInput as HTMLInputElement).value).toBe("123456");
    fireEvent.click(screen.getByRole("button", { name: "تأكيد رقم الهاتف" }));

    await waitFor(() => {
      expect(authMocks.verifyPhoneSignup).toHaveBeenCalledWith("+967712345678", "123456");
    });
  });

  it("keeps email signup, login and password recovery controls in the same component", () => {
    const source = readFileSync(new URL("./Login.tsx", import.meta.url), "utf8");

    expect(source).toContain("تسجيل الدخول بالبريد الإلكتروني");
    expect(source).toContain("التسجيل بالبريد الإلكتروني");
    expect(source).toContain("نسيت كلمة المرور؟");
    expect(source).toContain("await signIn(email, password)");
  });
  it("routes an obfuscated existing-email signup response to login and recovery without claiming activation was sent", () => {
    const source = readFileSync(new URL("./Login.tsx", import.meta.url), "utf8");

    expect(source).toContain("if (existingAccount)");
    expect(source).toContain("setMode('login')");
    expect(source).toContain("انتقل إلى تسجيل الدخول");
    expect(source).toContain("نسيت كلمة المرور؟");
    const existingAccountBranch = source.indexOf("if (existingAccount)");
    const newSignupConfirmation = source.indexOf("setInfo('تم إنشاء الحساب. افتح بريدك واضغط رابط التفعيل ثم سجّل الدخول.')");
    expect(existingAccountBranch).toBeGreaterThanOrEqual(0);
    expect(newSignupConfirmation).toBeGreaterThan(existingAccountBranch);
  });

});
