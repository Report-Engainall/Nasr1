// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  getCurrentTenantScope: vi.fn(),
  rangeCalls: [] as Array<{ table: string; start: number; end: number }>,
  assetRows: [] as Array<Record<string, unknown>>,
  eventRows: [] as Array<Record<string, unknown>>,
}));

vi.mock("@/lib/auth", () => ({
  useAuth: () => ({ user: { roles: ["admin"] } }),
}));
vi.mock("@/lib/supabase", () => ({
  supabase: { from: mocks.from, rpc: vi.fn() },
  getCurrentTenantScope: mocks.getCurrentTenantScope,
}));

import { CustomerAssetsPanel } from "@/components/CustomerAssetsPanel";

function makeAsset(index: number) {
  return {
    id: "asset-" + String(index).padStart(3, "0"),
    customer_id: "customer-001",
    product_id: null,
    source_order_id: null,
    source_invoice_id: null,
    asset_name: "أصل اختبار " + index,
    manufacturer: null,
    model: null,
    serial_number: "SERIAL-" + index,
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
    created_at: new Date(Date.UTC(2026, 0, 1, 0, 0, index)).toISOString(),
    updated_at: new Date(Date.UTC(2026, 0, 1, 0, 0, index)).toISOString(),
  };
}

function query(table: string) {
  let range: [number, number] | null = null;
  const builder: Record<string, unknown> = {};
  builder.select = () => builder;
  builder.eq = () => builder;
  builder.in = () => builder;
  builder.order = () => builder;
  builder.limit = () => builder;
  builder.range = (start: number, end: number) => {
    range = [start, end];
    mocks.rangeCalls.push({ table, start, end });
    return builder;
  };
  builder.then = (resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) => {
    const rows = table === "customer_assets" ? mocks.assetRows
      : table === "customer_asset_events" ? mocks.eventRows
      : [];
    const page = range ? rows.slice(range[0], range[1] + 1) : [];
    return Promise.resolve({ data: page, error: null }).then(resolve, reject);
  };
  return builder;
}

describe("admin customer asset registry pagination", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.rangeCalls = [];
    mocks.assetRows = Array.from({ length: 51 }, (_, index) => makeAsset(index));
    mocks.eventRows = Array.from({ length: 31 }, (_, index) => ({
      id: "event-" + String(index).padStart(3, "0"),
      event_type: "maintenance_started",
      previous_customer_id: null,
      new_customer_id: null,
      old_status: "active",
      new_status: "under_maintenance",
      summary: "بدء صيانة",
      reason: "فحص دوري للجهاز",
      reference: null,
      details: null,
      event_at: new Date(Date.UTC(2026, 0, 1, 0, 0, index)).toISOString(),
    }));
    mocks.getCurrentTenantScope.mockResolvedValue({ organizationId: "org-001" });
    mocks.from.mockImplementation((table: string) => query(table));
  });

  afterEach(() => cleanup());

  it("loads further customer assets on demand instead of stopping at the first server page", async () => {
    render(<CustomerAssetsPanel customerId="customer-001" />);

    expect(await screen.findByText(/عرض 50 من 50 أصل تم تحميلها/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "تحميل المزيد من الأصول" })).toBeEnabled();
    expect(mocks.rangeCalls).toContainEqual({ table: "customer_assets", start: 0, end: 50 });

    fireEvent.click(screen.getByRole("button", { name: "تحميل المزيد من الأصول" }));

    expect(await screen.findByText(/عرض 51 من 51 أصل تم تحميلها/)).toBeInTheDocument();
    expect(mocks.rangeCalls).toContainEqual({ table: "customer_assets", start: 50, end: 100 });
    expect(screen.queryByRole("button", { name: "تحميل المزيد من الأصول" })).not.toBeInTheDocument();
    expect(screen.getByText("أصل اختبار 50")).toBeInTheDocument();
  });

  it("loads the complete append-only event history for one asset in additional pages", async () => {
    render(<CustomerAssetsPanel customerId="customer-001" />);

    expect(await screen.findByText(/عرض 50 من 50 أصل تم تحميلها/)).toBeInTheDocument();
    fireEvent.click(screen.getAllByRole("button", { name: "الأحداث والملكية" })[0]);

    expect(await screen.findByText("سجل الأحداث والملكية — أصل اختبار 0")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "تحميل أحداث أقدم" })).toBeEnabled();
    expect(mocks.rangeCalls).toContainEqual({ table: "customer_asset_events", start: 0, end: 30 });

    fireEvent.click(screen.getByRole("button", { name: "تحميل أحداث أقدم" }));

    await waitFor(() => {
      expect(screen.queryByRole("button", { name: "تحميل أحداث أقدم" })).not.toBeInTheDocument();
    });
    expect(mocks.rangeCalls).toContainEqual({ table: "customer_asset_events", start: 30, end: 60 });
    expect(screen.getAllByText("فحص دوري للجهاز")).toHaveLength(31);
  });

});
