// @vitest-environment jsdom
import { createElement } from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
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

describe("interactive customer phone registration", () => {
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
});
