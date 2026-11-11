import { readFileSync } from "node:fs";
import { createElement } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
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
  beforeEach(() => vi.resetAllMocks());
  afterEach(() => cleanup());
  it("renders the commercial signup form with a phone-registration choice", () => {
    const markup = renderToStaticMarkup(createElement(Login, { initialMode: "register" }));

    expect(markup).toContain("إنشاء حساب تجاري");
    expect(markup).toContain("الاسم الكامل");
    expect(markup).toContain("البريد الإلكتروني");
    expect(markup).toContain("التسجيل برقم الهاتف");
    expect(markup).toContain("إنشاء الحساب");
  });

  it("wires phone mode to a telephone field, phone Auth signup, SMS verification and resend", () => {
    const source = readFileSync(new URL("./Login.tsx", import.meta.url), "utf8");

    expect(source).toContain('const isPhone = (mode === "login" || mode === "register") && phoneLogin;');
    expect(source).toContain('type={isPhone ? "tel" : "email"}');
    expect(source).toContain('placeholder={isPhone ? "+967 7xxxxxxxx أو 7xxxxxxxx" : "name@example.com"}');
    expect(source).toContain("phoneLogin ? 'phone' : 'email'");
    expect(source).toContain("verifyPhoneSignup(pendingPhone, verificationCode)");
    expect(source).toContain("resendPhoneSignupCode(pendingPhone)");
    expect(source).toContain("رمز التحقق المرسل إلى الهاتف");
  });

  it("keeps email signup, login and password recovery controls in the same component", () => {
    const source = readFileSync(new URL("./Login.tsx", import.meta.url), "utf8");

    expect(source).toContain("تسجيل الدخول بالبريد الإلكتروني");
    expect(source).toContain("التسجيل بالبريد الإلكتروني");
    expect(source).toContain("نسيت كلمة المرور؟");
    expect(source).toContain("await signIn(email, password)");
  });
  it("routes an obfuscated existing-email signup response to login and recovery without claiming activation was sent", async () => {
    authMocks.signUp.mockResolvedValue({
      needsConfirmation: false,
      confirmationType: "email",
      existingAccount: true,
    });

    render(createElement(Login, { initialMode: "register" }));
    fireEvent.change(screen.getByLabelText("الاسم الكامل"), { target: { value: "تاجر الاختبار" } });
    fireEvent.change(screen.getByPlaceholderText("name@example.com"), { target: { value: "customer@example.test" } });
    fireEvent.change(screen.getByLabelText("كلمة المرور"), { target: { value: "ValidPassword123" } });
    fireEvent.click(screen.getByRole("button", { name: "إنشاء الحساب" }));

    expect(await screen.findByText(/لم يكتمل إنشاء الحساب بهذه المحاولة/)).toBeTruthy();
    expect(screen.getByRole("heading", { name: "تسجيل الدخول" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "نسيت كلمة المرور؟" })).toBeTruthy();
    expect(screen.queryByText("تم إنشاء الحساب. افتح بريدك واضغط رابط التفعيل ثم سجّل الدخول.")).toBeNull();
    expect(authMocks.signUp).toHaveBeenCalledWith("customer@example.test", "ValidPassword123", "تاجر الاختبار", "email");
  });

});
