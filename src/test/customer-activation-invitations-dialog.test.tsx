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

  it("revokes a pending invitation only after explicit confirmation", async () => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
    render(<CustomerActivationInvitationDialog customer={CUSTOMER} onClose={vi.fn()} />);
    fireEvent.click(await screen.findByRole("button", { name: "إلغاء الدعوة" }));

    await waitFor(() => expect(mocks.revokeInvite).toHaveBeenCalledWith(INVITATION_ID));
    expect(confirm).toHaveBeenCalledTimes(1);
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
});
