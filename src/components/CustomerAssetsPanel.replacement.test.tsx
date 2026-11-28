// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

const mocks = vi.hoisted(() => ({
  user: { roles: ["admin"] as string[] },
  from: vi.fn(),
  rpc: vi.fn(),
  getCurrentTenantScope: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  useAuth: () => ({ user: mocks.user }),
}));
vi.mock("@/lib/supabase", () => ({
  getCurrentTenantScope: mocks.getCurrentTenantScope,
  supabase: { from: mocks.from, rpc: mocks.rpc },
}));

import { CustomerAssetsPanel } from "@/components/CustomerAssetsPanel";

const CUSTOMER_ID = "11111111-1111-4111-8111-111111111111";
const OLD_ASSET_ID = "22222222-2222-4222-8222-222222222222";
const NEW_ASSET_ID = "33333333-3333-4333-8333-333333333333";

const asset = {
  id: OLD_ASSET_ID,
  customer_id: CUSTOMER_ID,
  product_id: null,
  source_order_id: null,
  source_invoice_id: null,
  asset_name: "حاسوب مكتبي",
  manufacturer: "Aghbari",
  model: "Office 1",
  serial_number: "OLD-001",
  purchase_date: null,
  purchase_evidence_note: null,
  warranty_provider: null,
  warranty_reference: null,
  warranty_evidence_note: null,
  warranty_start_date: null,
  warranty_end_date: null,
  coverage_reference: null,
  coverage_start_date: null,
  coverage_end_date: null,
  status: "active",
  notes: null,
  created_at: "2026-01-01T00:00:00.000Z",
  updated_at: "2026-01-01T00:00:00.000Z",
};

function queryResult(data: unknown[]) {
  const query: Record<string, unknown> & {
    then: (resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) => Promise<unknown>;
  } = {
    select: vi.fn(() => query),
    eq: vi.fn(() => query),
    order: vi.fn(() => query),
    limit: vi.fn(() => query),
    then: (resolve, reject) => Promise.resolve({ data, error: null }).then(resolve, reject),
  };
  return query;
}

function configureTables(assetStatus = "active", additionalAssets: unknown[] = [], events: unknown[] = []) {
  const row = { ...asset, status: assetStatus };
  mocks.from.mockImplementation((table: string) => {
    const dataByTable: Record<string, unknown[]> = {
      customer_assets: [row, ...additionalAssets],
      customer_asset_events: events,
      products: [],
      orders: [],
      customer_invoices: [],
      customers: [{ id: CUSTOMER_ID, business_name: "شركة الاختبار", customer_code: "C-001" }],
    };
    return queryResult(dataByTable[table] ?? []);
  });
}

describe("CustomerAssetsPanel atomic replacement", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.user = { roles: ["admin"] };
    mocks.getCurrentTenantScope.mockResolvedValue({
      profileId: "profile-001",
      organizationId: "organization-001",
      warehouseId: null,
      isStaff: true,
      canManageCustomers: true,
      canViewInternalProductPrices: false,
    });
    configureTables();
  });

  afterEach(() => cleanup());

  it("keeps the same idempotency key after an ambiguous failure and confirms only the linked replacement", async () => {
    mocks.rpc
      .mockResolvedValueOnce({ data: null, error: { message: "network response was lost" } })
      .mockResolvedValueOnce({
        data: { old_asset_id: OLD_ASSET_ID, new_asset_id: NEW_ASSET_ID, status: "replaced", replayed: true },
        error: null,
      });

    render(<CustomerAssetsPanel customerId={CUSTOMER_ID} />);
    await screen.findByText("حاسوب مكتبي");
    fireEvent.click(screen.getByRole("button", { name: "استبدال الجهاز" }));

    fireEvent.change(screen.getByLabelText("اسم الأصل *"), { target: { value: "حاسوب بديل" } });
    fireEvent.change(screen.getByLabelText("الشركة المصنعة"), { target: { value: "Aghbari" } });
    fireEvent.change(screen.getByLabelText("الموديل"), { target: { value: "Office 2" } });
    fireEvent.change(screen.getByLabelText("الرقم التسلسلي"), { target: { value: "NEW-002" } });
    fireEvent.change(screen.getByLabelText("سبب الاستبدال *"), { target: { value: "تلف الجهاز السابق واستبداله" } });

    fireEvent.click(screen.getByRole("button", { name: "تأكيد استبدال الجهاز" }));
    await screen.findByRole("alert");

    expect(mocks.rpc).toHaveBeenCalledTimes(1);
    const firstPayload = mocks.rpc.mock.calls[0][1] as Record<string, unknown>;
    expect(mocks.rpc.mock.calls[0][0]).toBe("replace_customer_asset");
    expect(firstPayload.p_old_asset_id).toBe(OLD_ASSET_ID);
    expect(firstPayload.p_asset_name).toBe("حاسوب بديل");
    expect(firstPayload.p_serial_number).toBe("NEW-002");
    expect(firstPayload.p_request_key).toMatch(/^asset_replace_[0-9a-f]{32}$/);

    fireEvent.click(screen.getByRole("button", { name: "تأكيد استبدال الجهاز" }));
    await screen.findByText("تم استبدال الجهاز وإنشاء أصل بديل مستقل وربطه بسجل الجهاز السابق.");

    expect(mocks.rpc).toHaveBeenCalledTimes(2);
    const replayPayload = mocks.rpc.mock.calls[1][1] as Record<string, unknown>;
    expect(replayPayload.p_request_key).toBe(firstPayload.p_request_key);
    expect(replayPayload.p_old_asset_id).toBe(OLD_ASSET_ID);
  });

  it("blocks replacement submission when secure idempotency-key rotation fails", async () => {
    const randomUUID = vi.fn()
      .mockReturnValueOnce("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa")
      .mockImplementation(() => { throw new Error("secure random source failed"); });
    vi.stubGlobal("crypto", { randomUUID });

    render(<CustomerAssetsPanel customerId={CUSTOMER_ID} />);
    await screen.findByText("حاسوب مكتبي");
    fireEvent.click(screen.getByRole("button", { name: "استبدال الجهاز" }));

    fireEvent.change(screen.getByLabelText("سبب الاستبدال *"), {
      target: { value: "تلف الجهاز السابق واستبداله" },
    });
    expect(await screen.findByText("secure random source failed")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "تأكيد استبدال الجهاز" }));
    expect(await screen.findByText("تعذر إنشاء مفتاح آمن لعملية الاستبدال؛ لا يمكن إرسال الطلب دون مفتاح موثوق.")).toBeInTheDocument();
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("rotates the idempotency key when replacement details change after an ambiguous failure", async () => {
    const randomUUID = vi.fn()
      .mockReturnValueOnce("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa")
      .mockReturnValueOnce("bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb")
      .mockReturnValueOnce("cccccccc-cccc-4ccc-8ccc-cccccccccccc")
      .mockReturnValueOnce("dddddddd-dddd-4ddd-8ddd-dddddddddddd")
      .mockReturnValueOnce("eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee");
    vi.stubGlobal("crypto", { randomUUID });

    mocks.rpc
      .mockResolvedValueOnce({ data: null, error: { message: "network response was lost" } })
      .mockResolvedValueOnce({
        data: { old_asset_id: OLD_ASSET_ID, new_asset_id: NEW_ASSET_ID, status: "replaced", replayed: false },
        error: null,
      });

    render(<CustomerAssetsPanel customerId={CUSTOMER_ID} />);
    await screen.findByText("حاسوب مكتبي");
    fireEvent.click(screen.getByRole("button", { name: "استبدال الجهاز" }));

    fireEvent.change(screen.getByLabelText("اسم الأصل *"), { target: { value: "حاسوب بديل" } });
    fireEvent.change(screen.getByLabelText("الرقم التسلسلي"), { target: { value: "NEW-003" } });
    fireEvent.change(screen.getByLabelText("سبب الاستبدال *"), { target: { value: "تلف الجهاز السابق واستبداله" } });

    fireEvent.click(screen.getByRole("button", { name: "تأكيد استبدال الجهاز" }));
    await screen.findByRole("alert");
    const firstPayload = mocks.rpc.mock.calls[0][1] as Record<string, unknown>;
    const firstRequestKey = firstPayload.p_request_key;

    fireEvent.change(screen.getByLabelText("الموديل"), { target: { value: "Office 3" } });
    fireEvent.click(screen.getByRole("button", { name: "تأكيد استبدال الجهاز" }));
    await screen.findByText("تم استبدال الجهاز وإنشاء أصل بديل مستقل وربطه بسجل الجهاز السابق.");

    const secondPayload = mocks.rpc.mock.calls[1][1] as Record<string, unknown>;
    expect(secondPayload.p_request_key).not.toBe(firstRequestKey);
    expect(secondPayload.p_model).toBe("Office 3");
    expect(secondPayload.p_old_asset_id).toBe(OLD_ASSET_ID);
  });

  it("does not expose replacement for a terminal asset or in the generic event picker", async () => {
    configureTables("replaced");
    render(<CustomerAssetsPanel customerId={CUSTOMER_ID} />);
    await screen.findByText("حاسوب مكتبي");
    expect(screen.queryByRole("button", { name: "استبدال الجهاز" })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "صيانة / حدث" }));
    const eventType = screen.getByLabelText("نوع الحدث") as HTMLSelectElement;
    expect(Array.from(eventType.options).some(option => option.value === "replacement")).toBe(false);
  });

  it("shows the replacement link in the previous asset history and opens the new asset record", async () => {
    const replacement = {
      ...asset,
      id: NEW_ASSET_ID,
      asset_name: "حاسوب بديل",
      model: "Office 2",
      serial_number: "NEW-002",
      status: "active",
    };
    const replacementEvent = {
      id: "event-replacement-001",
      event_type: "replacement",
      old_status: "active",
      new_status: "replaced",
      summary: "استبدال الجهاز وربط الأصل البديل",
      reason: "تلف الجهاز السابق واستبداله",
      reference: null,
      details: "الأصل البديل: حاسوب بديل",
      event_at: "2026-11-17T01:00:00.000Z",
      previous_customer_id: null,
      new_customer_id: null,
      metadata: {
        new_asset_id: NEW_ASSET_ID,
        request_key: "asset_replace_0123456789abcdef",
        request_fingerprint: "a".repeat(32),
      },
    };
    configureTables("replaced", [replacement], [replacementEvent]);

    render(<CustomerAssetsPanel customerId={CUSTOMER_ID} />);
    await screen.findByText("حاسوب مكتبي");
    fireEvent.click(screen.getAllByRole("button", { name: "الأحداث والملكية" })[0]);

    expect(await screen.findByText("الجهاز البديل: حاسوب بديل")).toBeInTheDocument();
    expect(screen.getByText(NEW_ASSET_ID)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "فتح سجل الجهاز البديل" }));
    expect(screen.queryByText("سجل الأحداث والملكية — حاسوب مكتبي")).not.toBeInTheDocument();
    expect(await screen.findByDisplayValue("NEW-002")).toBeInTheDocument();
    expect(screen.getByText("حاسوب بديل")).toBeInTheDocument();
  });

  it("does not expose asset replacement to customer-only accounts", async () => {
    mocks.user = { roles: ["customer"] };
    render(<CustomerAssetsPanel customerId={CUSTOMER_ID} />);
    await screen.findByText("حاسوب مكتبي");
    expect(screen.queryByRole("button", { name: "استبدال الجهاز" })).not.toBeInTheDocument();
  });
});
