import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

const mocks = vi.hoisted(() => ({
  auth: { ready: true, user: null as null | { email: string; isStaff: boolean } },
  accept: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ useAuth: () => mocks.auth }));
vi.mock("@/lib/customer-activation-invitations", () => ({
  acceptCustomerActivationInvitation: mocks.accept,
}));
vi.mock("@/components/Login", () => ({
  Login: () => <div data-testid="login-form">تسجيل الدخول أو إنشاء الحساب</div>,
}));
vi.mock("@tanstack/react-router", () => ({
  Link: ({ to, children }: { to: string; children: ReactNode }) => <a href={to}>{children}</a>,
}));

import { CustomerActivationInvitationPage } from "@/components/CustomerActivationInvitationPage";

const TOKEN = "a".repeat(64);

describe("customer activation invitation page", () => {
  beforeEach(() => {
    mocks.auth = { ready: true, user: { email: "client@example.test", isStaff: false } };
    mocks.accept.mockReset();
    window.history.replaceState(null, "", `/customer/activate/${TOKEN}`);
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    window.history.replaceState(null, "", "/");
  });

  it("rejects malformed tokens before rendering an account acceptance action", () => {
    render(<CustomerActivationInvitationPage token="invalid" />);
    expect(screen.getByRole("alert")).toHaveTextContent("رابط تفعيل غير صالح");
    expect(screen.queryByRole("button", { name: /التحقق من الدعوة/ })).not.toBeInTheDocument();
    expect(mocks.accept).not.toHaveBeenCalled();
  });

  it("directs signed-out visitors to the shared sign-up/sign-in flow", () => {
    mocks.auth = { ready: true, user: null };
    render(<CustomerActivationInvitationPage token={TOKEN} />);
    expect(screen.getByTestId("login-form")).toBeInTheDocument();
  });

  it("blocks staff accounts before calling the acceptance RPC", () => {
    mocks.auth = { ready: true, user: { email: "staff@example.test", isStaff: true } };
    render(<CustomerActivationInvitationPage token={TOKEN} />);
    expect(screen.getByRole("alert")).toHaveTextContent("الدعوة مخصصة لحساب عميل");
    expect(mocks.accept).not.toHaveBeenCalled();
  });

  it("shows the server-confirmed result and removes the bearer token from the address bar", async () => {
    mocks.accept.mockResolvedValueOnce({
      customer_id: "11111111-1111-4111-8111-111111111111",
      business_name: "متجر العميل", email: "client@example.test", status: "active",
    });
    render(<CustomerActivationInvitationPage token={TOKEN} />);

    fireEvent.click(screen.getByRole("button", { name: "التحقق من الدعوة وتفعيل الحساب" }));
    expect(await screen.findByText("تم تفعيل حساب العميل")).toBeInTheDocument();
    await waitFor(() => expect(window.location.pathname).toBe("/"));
    expect(window.location.search).toBe("");
    expect(mocks.accept).toHaveBeenCalledWith(TOKEN);
  });
});
