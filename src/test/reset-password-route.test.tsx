import { act, createElement, type ComponentType } from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  updateUser: vi.fn(),
  navigate: vi.fn(),
}));

vi.mock("@/lib/supabase", () => ({
  supabase: { auth: { updateUser: mocks.updateUser } },
}));

vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (options: Record<string, unknown>) => ({ options }),
  useNavigate: () => mocks.navigate,
}));

import { Route } from "@/routes/reset-password";

type RouteWithComponent = { options: { component: ComponentType } };

function renderResetPasswordPage() {
  const component = (Route as unknown as RouteWithComponent).options.component;
  return render(createElement(component));
}

function fillValidPassword() {
  fireEvent.change(screen.getByLabelText("كلمة المرور الجديدة"), {
    target: { value: "ValidPass123" },
  });
}

describe("reset-password route submission states", () => {
  beforeEach(() => {
    mocks.updateUser.mockReset().mockResolvedValue({ error: null });
    mocks.navigate.mockReset();
  });

  afterEach(() => cleanup());

  it("rejects a password shorter than eight characters without calling the server", () => {
    renderResetPasswordPage();

    fireEvent.change(screen.getByLabelText("كلمة المرور الجديدة"), {
      target: { value: "short" },
    });
    fireEvent.click(screen.getByRole("button", { name: "حفظ" }));

    expect(screen.getByRole("alert")).toHaveTextContent("كلمة المرور يجب أن تكون 8 أحرف على الأقل");
    expect(mocks.updateUser).not.toHaveBeenCalled();
    expect(mocks.navigate).not.toHaveBeenCalled();
  });

  it("shows a recoverable error when the server rejects an expired recovery session", async () => {
    mocks.updateUser.mockResolvedValueOnce({ error: { message: "expired recovery session" } });
    renderResetPasswordPage();
    fillValidPassword();

    fireEvent.click(screen.getByRole("button", { name: "حفظ" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("انتهت صلاحية الرابط أو حدث خطأ");
    expect(mocks.updateUser).toHaveBeenCalledWith({ password: "ValidPass123" });
    expect(mocks.navigate).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "حفظ" })).toBeEnabled();
  });

  it("reports network rejection and unlocks the form for retry", async () => {
    mocks.updateUser.mockRejectedValueOnce(new Error("network unavailable"));
    renderResetPasswordPage();
    fillValidPassword();

    fireEvent.click(screen.getByRole("button", { name: "حفظ" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("تعذر الاتصال بالخادم");
    expect(mocks.navigate).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "حفظ" })).toBeEnabled();
  });

  it("does not navigate until the server confirms the password update", async () => {
    let resolveUpdate!: (result: { error: null }) => void;
    const pendingUpdate = new Promise<{ error: null }>((resolve) => {
      resolveUpdate = resolve;
    });
    mocks.updateUser.mockReturnValueOnce(pendingUpdate);
    renderResetPasswordPage();
    fillValidPassword();

    fireEvent.click(screen.getByRole("button", { name: "حفظ" }));

    expect(mocks.updateUser).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: "جارٍ الحفظ..." })).toBeDisabled();
    expect(mocks.navigate).not.toHaveBeenCalled();

    await act(async () => {
      resolveUpdate({ error: null });
      await pendingUpdate;
    });

    await waitFor(() => expect(mocks.navigate).toHaveBeenCalledWith({ to: "/" }));
  });

  it("guards against rapid duplicate submissions while one update is pending", async () => {
    let resolveUpdate!: (result: { error: { message: string } }) => void;
    const pendingUpdate = new Promise<{ error: { message: string } }>((resolve) => {
      resolveUpdate = resolve;
    });
    mocks.updateUser.mockReturnValueOnce(pendingUpdate);
    renderResetPasswordPage();
    fillValidPassword();
    const submit = screen.getByRole("button", { name: "حفظ" });

    fireEvent.click(submit);
    fireEvent.click(submit);

    expect(mocks.updateUser).toHaveBeenCalledTimes(1);
    expect(submit).toBeDisabled();

    await act(async () => {
      resolveUpdate({ error: { message: "expired" } });
      await pendingUpdate;
    });

    expect(await screen.findByRole("alert")).toHaveTextContent("انتهت صلاحية الرابط أو حدث خطأ");
    expect(mocks.navigate).not.toHaveBeenCalled();
  });
});
