import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

const mocks = vi.hoisted(() => ({
  fetchWorkspace: vi.fn(),
  createInvite: vi.fn(),
  revokeInvite: vi.fn(),
}));

vi.mock("@/lib/customer-activation-invitations", () => ({
  createCustomerActivationInvitation: mocks.createInvite,
  fetchCustomerActivationWorkspace: mocks.fetchWorkspace,
  revokeCustomerActivationInvitation: mocks.revokeInvite,
}));

import { CustomerActivationInvitationDialog } from "@/components/CustomerActivationInvitationDialog";

const CUSTOMER = {
  id: "11111111-1111-4111-8111-111111111111",
  business_name: "متجر العميل",
  customer_code: "CUST-1234",
  status: "approved",
  email: "client@example.test",
  profile_id: null,
};
const INVITATION_ID = "22222222-2222-4222-8222-222222222222";
const invitation = {
  invitation_id: INVITATION_ID,
  invited_email: "client@example.test",
  status: "pending" as const,
  expires_at: "2099-10-20T12:00:00.000Z",
  created_at: "2099-10-19T12:00:00.000Z",
};
const workspace = {
  customer_id: CUSTOMER.id,
  customer_email: CUSTOMER.email,
  customer_status: "approved",
  is_linked: false,
  invitations: [invitation],
};

describe("customer activation invitation dialog", () => {
  beforeEach(() => {
    mocks.fetchWorkspace.mockReset().mockResolvedValue(workspace);
    mocks.createInvite.mockReset().mockResolvedValue({
      invitation_id: INVITATION_ID,
      customer_id: CUSTOMER.id,
      invited_email: CUSTOMER.email,
      token: "a".repeat(64),
      expires_at: "2099-10-20T12:00:00.000Z",
      url: "http://localhost/customer/activate/" + "a".repeat(64),
    });
    mocks.revokeInvite.mockReset().mockResolvedValue(undefined);
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("creates a server invitation and exposes manual sharing without claiming an email was sent", async () => {
    render(<CustomerActivationInvitationDialog customer={CUSTOMER} onClose={vi.fn()} />);
    fireEvent.click(await screen.findByRole("button", { name: "إنشاء رابط تفعيل صالح 72 ساعة" }));

    expect(await screen.findByText(/لم يُرسل بريد تلقائيًا؛ شارك الرابط يدويًا/)).toBeInTheDocument();
    expect(mocks.createInvite).toHaveBeenCalledWith(CUSTOMER.id, CUSTOMER.email, 72);
    expect((screen.getByLabelText(/رابط التفعيل/) as HTMLInputElement).value).toContain("/customer/activate/");
  });

  it("creates only one activation invitation when submit is triggered twice rapidly", async () => {
    const created = {
      invitation_id: INVITATION_ID,
      customer_id: CUSTOMER.id,
      invited_email: CUSTOMER.email,
      token: "a".repeat(64),
      expires_at: "2099-10-20T12:00:00.000Z",
      url: "http://localhost/customer/activate/" + "a".repeat(64),
    };
    let resolveCreate: ((value: typeof created) => void) | undefined;
    mocks.createInvite.mockImplementationOnce(() => new Promise((resolve) => {
      resolveCreate = resolve;
    }));

    render(<CustomerActivationInvitationDialog customer={CUSTOMER} onClose={vi.fn()} />);
    const submit = await screen.findByRole("button", { name: "إنشاء رابط تفعيل صالح 72 ساعة" });

    await act(async () => {
      // Both clicks are issued in one event batch, before the busy state rerenders.
      submit.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
      submit.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
      await Promise.resolve();
    });
    expect(mocks.createInvite).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolveCreate?.(created);
      await Promise.resolve();
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(await screen.findByText(/لم يُرسل بريد تلقائيًا؛ شارك الرابط يدويًا/)).toBeInTheDocument();
  });

  it("revokes a pending invitation only after explicit confirmation", async () => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
    render(<CustomerActivationInvitationDialog customer={CUSTOMER} onClose={vi.fn()} />);
    fireEvent.click(await screen.findByRole("button", { name: "إلغاء الدعوة" }));

    await waitFor(() => expect(mocks.revokeInvite).toHaveBeenCalledWith(INVITATION_ID));
    expect(confirm).toHaveBeenCalledTimes(1);
  });

  it("does not expose a success notice or shareable link when invitation creation is rejected", async () => {
    const rejection = "لم يؤكد الخادم إنشاء دعوة تفعيل مطابقة للطلب.";
    mocks.createInvite.mockRejectedValueOnce(new Error(rejection));

    render(<CustomerActivationInvitationDialog customer={CUSTOMER} onClose={vi.fn()} />);
    fireEvent.click(await screen.findByRole("button", { name: "إنشاء رابط تفعيل صالح 72 ساعة" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(rejection);
    expect(screen.queryByText(/أنشأ الخادم رابط تفعيل/)).toBeNull();
    expect(screen.queryByLabelText(/رابط التفعيل/)).toBeNull();
  });

  it("fails closed when the customer invitation status cannot be loaded, then allows retry", async () => {
    mocks.fetchWorkspace.mockRejectedValueOnce(new Error("تعذر تحميل سجل الدعوات"));
    render(<CustomerActivationInvitationDialog customer={CUSTOMER} onClose={vi.fn()} />);

    expect(await screen.findByText(/لن يُسمح بإنشاء دعوة حتى يُحمّل سجل الدعوات بنجاح/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "إنشاء رابط تفعيل صالح 72 ساعة" })).not.toBeInTheDocument();
    expect(mocks.createInvite).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "إعادة المحاولة" }));
    expect(await screen.findByRole("button", { name: "إنشاء رابط تفعيل صالح 72 ساعة" })).toBeInTheDocument();
    expect(mocks.createInvite).not.toHaveBeenCalled();
  });

  it("does not permit invitations for unapproved or already linked records", async () => {
    const otherId = "33333333-3333-4333-8333-333333333333";
    const { rerender } = render(<CustomerActivationInvitationDialog customer={{ ...CUSTOMER, status: "pending" }} onClose={vi.fn()} />);
    expect(await screen.findByText("اعتمد سجل العميل أولًا؛ التفعيل متاح للعملاء المعتمدين فقط.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "إنشاء رابط تفعيل صالح 72 ساعة" })).toBeDisabled();

    mocks.fetchWorkspace.mockResolvedValueOnce({ ...workspace, customer_id: otherId, is_linked: true, invitations: [] });
    rerender(<CustomerActivationInvitationDialog customer={{ ...CUSTOMER, id: otherId }} onClose={vi.fn()} />);
    expect(await screen.findByText("هذا السجل مرتبط بالفعل بحساب مستخدم. لا يمكن إنشاء دعوة تفعيل ثانية.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "إنشاء رابط تفعيل صالح 72 ساعة" })).not.toBeInTheDocument();
  });

  it("hides the old pending invitation when revocation succeeds but the follow-up list refresh fails", async () => {
    const revokedWorkspace = {
      ...workspace,
      invitations: [{ ...invitation, status: "revoked" as const }],
    };
    mocks.fetchWorkspace
      .mockReset()
      .mockResolvedValueOnce(workspace)
      .mockRejectedValueOnce(new Error("تعذر تحديث سجل الدعوات"))
      .mockResolvedValueOnce(revokedWorkspace);
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);

    render(<CustomerActivationInvitationDialog customer={CUSTOMER} onClose={vi.fn()} />);
    expect(await screen.findByText("بانتظار التفعيل")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "إلغاء الدعوة" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("تعذر تحديث سجل الدعوات");
    expect(screen.getByText("أُلغي رابط التفعيل في الخادم.")).toBeInTheDocument();
    expect(screen.queryByText("بانتظار التفعيل")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "إلغاء الدعوة" })).not.toBeInTheDocument();
    expect(confirm).toHaveBeenCalledTimes(1);
    expect(mocks.revokeInvite).toHaveBeenCalledWith(INVITATION_ID);

    fireEvent.click(screen.getByRole("button", { name: "تحديث" }));
    expect(await screen.findByText("ملغاة")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "إلغاء الدعوة" })).not.toBeInTheDocument();
    expect(mocks.fetchWorkspace).toHaveBeenCalledTimes(3);
  });

  it("does not expose the previous customer's invitation while a different customer workspace is loading or unavailable", async () => {
    const otherCustomer = {
      ...CUSTOMER,
      id: "33333333-3333-4333-8333-333333333333",
      business_name: "متجر عميل آخر",
      email: "other@example.test",
    };
    mocks.fetchWorkspace
      .mockReset()
      .mockResolvedValueOnce(workspace)
      .mockRejectedValueOnce(new Error("تعذر تحميل سجل الدعوات للعميل الآخر"));

    const { rerender } = render(<CustomerActivationInvitationDialog customer={CUSTOMER} onClose={vi.fn()} />);
    expect(await screen.findByText("client@example.test")).toBeInTheDocument();

    rerender(<CustomerActivationInvitationDialog customer={otherCustomer} onClose={vi.fn()} />);

    expect(await screen.findByText("تعذر تحميل سجل الدعوات للعميل الآخر")).toBeInTheDocument();
    expect(screen.queryByText("client@example.test")).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/رابط التفعيل/)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "إلغاء الدعوة" })).not.toBeInTheDocument();
    expect(mocks.createInvite).not.toHaveBeenCalled();
  });


  it("traps keyboard focus, closes with Escape, and restores focus to the opener", async () => {
    const trigger = document.createElement("button");
    trigger.type = "button";
    trigger.textContent = "فتح دعوة العميل";
    document.body.appendChild(trigger);
    trigger.focus();
    const onClose = vi.fn();

    const view = render(<CustomerActivationInvitationDialog customer={CUSTOMER} onClose={onClose} />);
    const closeButton = await screen.findByRole("button", { name: "إغلاق نافذة دعوة التفعيل" });
    const revokeButton = await screen.findByRole("button", { name: "إلغاء الدعوة" });

    expect(document.activeElement).toBe(closeButton);

    fireEvent.keyDown(closeButton, { key: "Tab", shiftKey: true });
    expect(document.activeElement).toBe(revokeButton);

    fireEvent.keyDown(revokeButton, { key: "Tab" });
    expect(document.activeElement).toBe(closeButton);

    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);

    view.unmount();
    expect(document.activeElement).toBe(trigger);
    trigger.remove();
  });


});
