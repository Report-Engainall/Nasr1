// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
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

describe("customer registration by phone", () => {
  afterEach(() => cleanup());
  beforeEach(() => {
    vi.clearAllMocks();
    authMocks.signUp.mockResolvedValue({ needsConfirmation: true, confirmationType: "phone" });
    authMocks.verifyPhoneSignup.mockResolvedValue(undefined);
    authMocks.resendPhoneSignupCode.mockResolvedValue(undefined);
  });

  it("registers without an email, resends SMS and completes after OTP verification", async () => {
    const onDone = vi.fn();
    render(<Login initialMode="register" onDone={onDone} />);

    fireEvent.click(screen.getByRole("button", { name: "التسجيل برقم الهاتف" }));
    expect(screen.getByLabelText("رقم الهاتف")).toBeTruthy();
    expect(screen.queryByLabelText("البريد الإلكتروني")).toBeNull();

    fireEvent.change(screen.getByLabelText("الاسم الكامل"), { target: { value: "تاجر الأغبري" } });
    fireEvent.change(screen.getByLabelText("رقم الهاتف"), { target: { value: "0712345678" } });
    fireEvent.change(screen.getByLabelText("كلمة المرور"), { target: { value: "x".repeat(16) } });
    fireEvent.click(screen.getByRole("button", { name: "إنشاء الحساب" }));

    await waitFor(() => expect(authMocks.signUp).toHaveBeenCalledWith(
      "0712345678", "x".repeat(16), "تاجر الأغبري", "phone",
    ));
    expect(screen.getByLabelText("رمز التحقق المرسل إلى الهاتف")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "إعادة إرسال رمز التحقق" }));
    await waitFor(() => expect(authMocks.resendPhoneSignupCode).toHaveBeenCalledWith("+967712345678"));

    fireEvent.change(screen.getByLabelText("رمز التحقق المرسل إلى الهاتف"), {
      target: { value: "123456" },
    });
    fireEvent.click(screen.getByRole("button", { name: "تأكيد رقم الهاتف" }));
    await waitFor(() => {
      expect(authMocks.verifyPhoneSignup).toHaveBeenCalledWith("+967712345678", "123456");
      expect(onDone).toHaveBeenCalledTimes(1);
    });
  });

  it("preserves the existing email registration path", async () => {
    authMocks.signUp.mockResolvedValue({ needsConfirmation: true, confirmationType: "email" });
    render(<Login initialMode="register" />);

    fireEvent.change(screen.getByLabelText("الاسم الكامل"), { target: { value: "تاجر البريد" } });
    fireEvent.change(screen.getByLabelText("البريد الإلكتروني"), { target: { value: "merchant@example.com" } });
    fireEvent.change(screen.getByLabelText("كلمة المرور"), { target: { value: "x".repeat(16) } });
    fireEvent.click(screen.getByRole("button", { name: "إنشاء الحساب" }));

    await waitFor(() => expect(authMocks.signUp).toHaveBeenCalledWith(
      "merchant@example.com", "x".repeat(16), "تاجر البريد", "email",
    ));
    expect(screen.getByText("تم إنشاء الحساب. افتح بريدك واضغط رابط التفعيل ثم سجّل الدخول.")).toBeTruthy();
  });
});
