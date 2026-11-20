// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

const mocks = vi.hoisted(() => ({
  rpc: vi.fn(),
  useAuth: vi.fn(),
  notice: vi.fn(),
}));

vi.mock("@/lib/supabase", () => ({ supabase: { rpc: mocks.rpc } }));
vi.mock("@/lib/auth", () => ({ useAuth: mocks.useAuth }));

import {
  AdminCustomerDeviceChangeRequests,
  CustomerDeviceChangeRequestsPanel,
} from "./CustomerDeviceChangeRequests";

const CUSTOMER_USER = {
  id: "customer-auth",
  profileId: "customer-profile",
  email: "customer@example.test",
  name: "عميل اختبار",
  roles: ["customer"],
  isStaff: false,
};
const ADMIN_USER = {
  id: "admin-auth",
  profileId: "admin-profile",
  email: "admin@example.test",
  name: "مدير اختبار",
  roles: ["admin"],
  isStaff: true,
};
const REQUEST_ID = "11111111-1111-4111-8111-111111111111";
const CREATED_AT = "2026-11-17T01:00:00.000Z";

function customerRequest(status: "pending_approval" | "approved" | "rejected" | "expired" = "pending_approval") {
  return {
    id: REQUEST_ID,
    status,
    reason: "انتقلت إلى هاتف جديد وأحتاج اعتماد الجهاز الجديد",
    review_reason: status === "pending_approval" ? null : "تم التحقق من بيانات العميل والجهاز",
    created_at: CREATED_AT,
    reviewed_at: status === "pending_approval" ? null : "2026-11-17T02:00:00.000Z",
    requested_device: "Android · Chrome",
    unlinked_session_count: status === "approved" ? 2 : 0,
  };
}
function adminResponse(row = customerRequest()) {
  return {
    items: [{
      ...row,
      customer_name: "عميل اختبار",
      customer_email: "customer@example.test",
    }],
  };
}

describe("customer device change request workflow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("crypto", { randomUUID: vi.fn(() => "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa") });
    mocks.useAuth.mockReturnValue({ user: CUSTOMER_USER, ready: true, sessionRevision: 1 });
    mocks.rpc.mockImplementation(async (name: string) => {
      if (name === "fetch_my_customer_device_change_requests") return { data: { items: [] }, error: null };
      if (name === "request_customer_device_change") {
        return {
          data: { id: REQUEST_ID, status: "pending_approval", created_at: CREATED_AT, requested_device: "Android · Chrome", replayed: false },
          error: null,
        };
      }
      if (name === "fetch_customer_device_change_requests") return { data: adminResponse(), error: null };
      if (name === "review_customer_device_change_request") {
        return { data: { id: REQUEST_ID, status: "approved", unlinked_session_count: 2, replayed: false }, error: null };
      }
      return { data: null, error: { message: "unexpected RPC" } };
    });
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("submits a customer request against the server-owned session and displays the server acknowledgement", async () => {
    const rows: ReturnType<typeof customerRequest>[] = [];
    mocks.rpc.mockImplementation(async (name: string) => {
      if (name === "fetch_my_customer_device_change_requests") return { data: { items: rows }, error: null };
      if (name === "request_customer_device_change") {
        rows.push(customerRequest());
        return {
          data: { id: REQUEST_ID, status: "pending_approval", created_at: CREATED_AT, requested_device: "Android · Chrome", replayed: false },
          error: null,
        };
      }
      return { data: null, error: { message: "unexpected RPC" } };
    });

    render(<CustomerDeviceChangeRequestsPanel />);
    await waitFor(() => expect(mocks.rpc).toHaveBeenCalledWith("fetch_my_customer_device_change_requests", { p_limit: 25 }));

    fireEvent.change(screen.getByLabelText("سبب تغيير الجهاز"), {
      target: { value: "انتقلت إلى هاتف جديد وأحتاج اعتماد الجهاز الجديد" },
    });
    fireEvent.click(screen.getByRole("button", { name: "إرسال طلب اعتماد الجهاز" }));

    await waitFor(() => expect(mocks.rpc).toHaveBeenCalledWith(
      "request_customer_device_change",
      expect.objectContaining({
        p_reason: "انتقلت إلى هاتف جديد وأحتاج اعتماد الجهاز الجديد",
        p_idempotency_key: expect.stringMatching(/^[0-9a-f-]{36}$/i),
      }),
    ));
    expect(await screen.findByText("بانتظار موافقة الإدارة")).toBeInTheDocument();
    expect(screen.getByText(/لن تُفصل جلساتك الحالية عند الإرسال/)).toBeInTheDocument();
  });

  it("reuses the exact idempotency key when a network failure is retried with the unchanged customer payload", async () => {
    let attempts = 0;
    const rows: ReturnType<typeof customerRequest>[] = [];
    mocks.rpc.mockImplementation(async (name: string) => {
      if (name === "fetch_my_customer_device_change_requests") return { data: { items: rows }, error: null };
      if (name === "request_customer_device_change") {
        attempts += 1;
        if (attempts === 1) return { data: null, error: { message: "network interrupted" } };
        rows.push(customerRequest());
        return {
          data: { id: REQUEST_ID, status: "pending_approval", created_at: CREATED_AT, requested_device: "Android · Chrome", replayed: false },
          error: null,
        };
      }
      return { data: null, error: { message: "unexpected RPC" } };
    });

    render(<CustomerDeviceChangeRequestsPanel />);
    const reason = "انتقلت إلى هاتف جديد وأحتاج اعتماد الجهاز الجديد";
    fireEvent.change(screen.getByLabelText("سبب تغيير الجهاز"), { target: { value: reason } });
    const send = screen.getByRole("button", { name: "إرسال طلب اعتماد الجهاز" });

    fireEvent.click(send);
    await screen.findByRole("alert");
    const first = mocks.rpc.mock.calls.find(([name]) => name === "request_customer_device_change")?.[1] as Record<string, unknown>;

    fireEvent.click(screen.getByRole("button", { name: "إرسال طلب اعتماد الجهاز" }));
    await waitFor(() => expect(attempts).toBe(2));
    const calls = mocks.rpc.mock.calls.filter(([name]) => name === "request_customer_device_change");
    expect(calls[1][1]).toEqual(expect.objectContaining({ p_idempotency_key: first.p_idempotency_key, p_reason: reason }));
    expect(await screen.findByText("بانتظار موافقة الإدارة")).toBeInTheDocument();
  });

  it("allows an organization administrator to review a customer request and requires a server decision acknowledgement", async () => {
    mocks.useAuth.mockReturnValue({ user: ADMIN_USER, ready: true, sessionRevision: 1 });
    mocks.rpc.mockImplementation(async (name: string) => {
      if (name === "fetch_customer_device_change_requests") return { data: adminResponse(), error: null };
      if (name === "review_customer_device_change_request") {
        return { data: { id: REQUEST_ID, status: "approved", unlinked_session_count: 2, replayed: false }, error: null };
      }
      return { data: null, error: { message: "unexpected RPC" } };
    });
    vi.spyOn(window, "prompt").mockReturnValue("تمت مطابقة هوية العميل والجهاز الجديد");

    render(<AdminCustomerDeviceChangeRequests onNotice={mocks.notice} />);
    expect(await screen.findByText("عميل اختبار")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "الموافقة واعتماد الجهاز" }));
    await waitFor(() => expect(mocks.rpc).toHaveBeenCalledWith(
      "review_customer_device_change_request",
      expect.objectContaining({
        p_request_id: REQUEST_ID,
        p_decision: "approve",
        p_reason: "تمت مطابقة هوية العميل والجهاز الجديد",
        p_idempotency_key: expect.stringMatching(/^[0-9a-f-]{36}$/i),
      }),
    ));
    await waitFor(() => expect(mocks.notice).toHaveBeenCalledWith(expect.stringContaining("حذف 2 جلسة سابقة")));
  });

  it("does not expose the customer request review RPC to managers or malformed queue rows", async () => {
    mocks.useAuth.mockReturnValue({
      user: { ...ADMIN_USER, roles: ["manager"], isStaff: true },
      ready: true,
      sessionRevision: 1,
    });
    const view = render(<AdminCustomerDeviceChangeRequests onNotice={mocks.notice} />);
    expect(view.container).toBeEmptyDOMElement();
    expect(mocks.rpc).not.toHaveBeenCalled();

    cleanup();
    mocks.useAuth.mockReturnValue({ user: ADMIN_USER, ready: true, sessionRevision: 1 });
    mocks.rpc.mockResolvedValue({ data: { items: [{ id: REQUEST_ID, status: "pending_approval" }] }, error: null });
    render(<AdminCustomerDeviceChangeRequests onNotice={mocks.notice} />);
    expect(await screen.findByRole("alert")).toHaveTextContent("تعذر التحقق من طلب جهاز");
    expect(screen.queryByRole("button", { name: "الموافقة واعتماد الجهاز" })).not.toBeInTheDocument();
  });
});
