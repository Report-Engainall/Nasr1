import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("@/lib/supabase", () => ({ supabase: { rpc: mocks.rpc } }));

import {
  acceptCustomerActivationInvitation,
  createCustomerActivationInvitation,
  fetchCustomerActivationWorkspace,
  normalizeCustomerActivationEmail,
  revokeCustomerActivationInvitation,
} from "@/lib/customer-activation-invitations";

const CUSTOMER_ID = "11111111-1111-4111-8111-111111111111";
const INVITATION_ID = "22222222-2222-4222-8222-222222222222";
const TOKEN = "a".repeat(64);
const EXPIRES = new Date(Date.now() + 60 * 60 * 1000).toISOString();
const INVALID_INVITATION_ROWS = Array.from({ length: 21 }, () => ({}));

function invalidActivationWorkspaceResponse() {
  return {
    data: {
      customer_id: CUSTOMER_ID,
      customer_email: null,
      customer_status: "approved",
      is_linked: false,
      invitations: INVALID_INVITATION_ROWS,
    },
    error: null,
  };
}

describe("customer activation invitation RPC adapter", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.history.replaceState(null, "", "/");
  });

  it("normalizes email and accepts a server-verified creation response", async () => {
    mocks.rpc.mockResolvedValueOnce({
      data: {
        invitation_id: INVITATION_ID, customer_id: CUSTOMER_ID,
        invited_email: "client@example.test", token: TOKEN, expires_at: EXPIRES,
      },
      error: null,
    });

    const result = await createCustomerActivationInvitation(CUSTOMER_ID, " Client@Example.Test ", 72);

    expect(mocks.rpc).toHaveBeenCalledWith("create_customer_activation_invitation", {
      p_customer_id: CUSTOMER_ID, p_email: "client@example.test", p_expires_hours: 72,
    });
    expect(result.url).toBe(`http://localhost:3000/customer/activate/${TOKEN}`);
    expect(result.token).toBe(TOKEN);
  });

  it("rejects malformed ids, emails, durations and mismatched server responses", async () => {
    await expect(createCustomerActivationInvitation("not-a-uuid", "client@example.test")).rejects.toThrow(/معرّف العميل/);
    await expect(createCustomerActivationInvitation(CUSTOMER_ID, "not-an-email")).rejects.toThrow(/بريدًا إلكترونيًا/);
    await expect(createCustomerActivationInvitation(CUSTOMER_ID, "client@example.test", 169)).rejects.toThrow(/مدة الدعوة/);
    expect(mocks.rpc).not.toHaveBeenCalled();

    mocks.rpc.mockResolvedValueOnce({
      data: {
        invitation_id: INVITATION_ID, customer_id: "33333333-3333-4333-8333-333333333333",
        invited_email: "client@example.test", token: TOKEN, expires_at: EXPIRES,
      },
      error: null,
    });
    await expect(createCustomerActivationInvitation(CUSTOMER_ID, "client@example.test")).rejects.toThrow(/مطابقة للطلب/);
  });

  it("rejects a server success payload whose invitation expiry is expired or longer than requested", async () => {
    const validIdentity = {
      invitation_id: INVITATION_ID,
      customer_id: CUSTOMER_ID,
      invited_email: "client@example.test",
      token: TOKEN,
    };

    mocks.rpc.mockResolvedValueOnce({
      data: { ...validIdentity, expires_at: new Date(Date.now() - 1_000).toISOString() },
      error: null,
    });
    await expect(createCustomerActivationInvitation(CUSTOMER_ID, "client@example.test", 72))
      .rejects.toThrow(/خارج المدة المطلوبة/);

    mocks.rpc.mockResolvedValueOnce({
      data: { ...validIdentity, expires_at: new Date(Date.now() + 169 * 60 * 60 * 1000).toISOString() },
      error: null,
    });
    await expect(createCustomerActivationInvitation(CUSTOMER_ID, "client@example.test", 72))
      .rejects.toThrow(/خارج المدة المطلوبة/);
  });

  it("rejects an invitation that expires while the server response is in flight", async () => {
    const requestStartedAt = Date.now();
    const expiresAt = new Date(requestStartedAt + 1_000).toISOString();
    const responseCompletedAt = requestStartedAt + 2_000;
    const nowSpy = vi.spyOn(Date, "now");
    nowSpy.mockReturnValueOnce(requestStartedAt).mockReturnValueOnce(responseCompletedAt);

    mocks.rpc.mockResolvedValueOnce({
      data: {
        invitation_id: INVITATION_ID,
        customer_id: CUSTOMER_ID,
        invited_email: "client@example.test",
        token: TOKEN,
        expires_at: expiresAt,
      },
      error: null,
    });

    try {
      await expect(createCustomerActivationInvitation(CUSTOMER_ID, "client@example.test", 1))
        .rejects.toThrow(/خارج المدة المطلوبة/);
    } finally {
      nowSpy.mockRestore();
    }
  });

  it("validates and bounds the server-provided activation workspace", async () => {
    mocks.rpc.mockResolvedValueOnce({
      data: {
        customer_id: CUSTOMER_ID, customer_email: "client@example.test",
        customer_status: "approved", is_linked: false,
        invitations: [{
          invitation_id: INVITATION_ID, invited_email: "client@example.test",
          status: "pending", expires_at: EXPIRES, created_at: EXPIRES,
        }],
      },
      error: null,
    });

    const workspace = await fetchCustomerActivationWorkspace(CUSTOMER_ID);
    expect(mocks.rpc).toHaveBeenCalledWith("list_customer_activation_invitations", { p_customer_id: CUSTOMER_ID });
    expect(workspace.invitations[0].status).toBe("pending");

    mocks.rpc.mockResolvedValueOnce(invalidActivationWorkspaceResponse());
    await expect(fetchCustomerActivationWorkspace(CUSTOMER_ID)).rejects.toThrow(/غير صالحة/);
  });

  it("requires a valid invitation id and server confirmation before reporting revocation", async () => {
    await expect(revokeCustomerActivationInvitation("bad-id")).rejects.toThrow(/معرّف الدعوة/);
    expect(mocks.rpc).not.toHaveBeenCalled();

    mocks.rpc.mockResolvedValueOnce({ data: true, error: null });
    await expect(revokeCustomerActivationInvitation(INVITATION_ID)).resolves.toBeUndefined();
    expect(mocks.rpc).toHaveBeenCalledWith("revoke_customer_activation_invitation", { p_invitation_id: INVITATION_ID });

    mocks.rpc.mockResolvedValueOnce({ data: false, error: null });
    await expect(revokeCustomerActivationInvitation(INVITATION_ID)).rejects.toThrow(/إلغاء الدعوة/);
  });

  it("accepts only a valid token after the RPC confirms the linked customer", async () => {
    await expect(acceptCustomerActivationInvitation("bad-token")).rejects.toThrow(/رابط تفعيل/);
    expect(mocks.rpc).not.toHaveBeenCalled();

    mocks.rpc.mockResolvedValueOnce({
      data: { customer_id: CUSTOMER_ID, business_name: "متجر اختبار", email: "client@example.test", status: "active" },
      error: null,
    });
    await expect(acceptCustomerActivationInvitation(TOKEN)).resolves.toEqual({
      customer_id: CUSTOMER_ID, business_name: "متجر اختبار", email: "client@example.test", status: "active",
    });
    expect(mocks.rpc).toHaveBeenCalledWith("accept_customer_activation_invitation", { p_token: TOKEN });

    mocks.rpc.mockResolvedValueOnce({
      data: { customer_id: CUSTOMER_ID, business_name: "متجر اختبار", email: "client@example.test", status: "pending" },
      error: null,
    });
    await expect(acceptCustomerActivationInvitation(TOKEN)).rejects.toThrow(/تفعيل حساب العميل/);
  });

  it("normalizes and validates the canonical customer email", () => {
    expect(normalizeCustomerActivationEmail(" Client@Example.Test ")).toBe("client@example.test");
    expect(() => normalizeCustomerActivationEmail("bad-email")).toThrow(/بريدًا إلكترونيًا/);
  });
});
