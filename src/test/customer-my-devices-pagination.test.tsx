// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  rangeCalls: [] as Array<{ table: string; start: number; end: number }>,
  assetRows: [] as Array<Record<string, unknown>>,
  eventRows: [] as Array<Record<string, unknown>>,
}));

vi.mock("@/lib/auth", () => ({
  useAuth: () => ({
    user: {
      id: "customer-auth",
      profileId: "customer-profile",
      roles: ["customer"],
      isStaff: false,
    },
    ready: true,
    sessionRevision: 1,
  }),
}));
vi.mock("@/lib/supabase", () => ({ supabase: { from: mocks.from } }));
vi.mock("@/components/CustomerDeviceChangeRequests", () => ({
  CustomerDeviceChangeRequestsPanel: () => null,
}));
vi.mock("@/components/Login", () => ({ Login: () => <div>تسجيل الدخول مطلوب</div> }));

import { CustomerMyDevicesPage } from "@/components/CustomerMyDevicesPage";

function makeAsset(index: number) {
  const id = "asset-" + String(index).padStart(3, "0");
  return {
    id,
    product_id: null,
    source_order_id: null,
    source_invoice_id: null,
    asset_name: "جهاز اختبار " + index,
    manufacturer: null,
    model: null,
    serial_number: "SERIAL-" + index,
    purchase_date: null,
    warranty_provider: null,
    warranty_reference: null,
    warranty_start_date: null,
    warranty_end_date: null,
    coverage_reference: null,
    coverage_start_date: null,
    coverage_end_date: null,
    status: "active",
    created_at: new Date(Date.UTC(2026, 0, 1, 0, 0, index)).toISOString(),
    updated_at: new Date(Date.UTC(2026, 0, 1, 0, 0, index)).toISOString(),
  };
}

function makeEvent(index: number) {
  return {
    id: "event-" + String(index).padStart(3, "0"),
    asset_id: "asset-000",
    event_type: "maintenance_started",
    old_status: "active",
    new_status: "under_maintenance",
    event_at: new Date(Date.UTC(2026, 0, 1, 0, 0, index)).toISOString(),
  };
}

function query(table: string) {
  let range: [number, number] | null = null;
  const builder: Record<string, unknown> = {};
  builder.select = () => builder;
  builder.order = () => builder;
  builder.in = () => builder;
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
    const page = range ? rows.slice(range[0], range[1] + 1) : rows;
    return Promise.resolve({ data: page, error: null }).then(resolve, reject);
  };
  return builder;
}

describe("customer device history pagination", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.rangeCalls = [];
    mocks.assetRows = Array.from({ length: 51 }, (_, index) => makeAsset(index));
    mocks.eventRows = Array.from({ length: 251 }, (_, index) => makeEvent(index));
    mocks.from.mockImplementation((table: string) => query(table));
  });

  afterEach(() => cleanup());

  it("loads further customer assets instead of silently capping the registry at the first page", async () => {
    render(<CustomerMyDevicesPage />);

    expect(await screen.findByText(/عرض 50 من 50 جهاز تم تحميلها/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "تحميل المزيد من الأجهزة" })).toBeEnabled();
    expect(mocks.rangeCalls).toContainEqual({ table: "customer_assets", start: 0, end: 50 });

    fireEvent.click(screen.getByRole("button", { name: "تحميل المزيد من الأجهزة" }));

    expect(await screen.findByText(/عرض 51 من 51 جهاز تم تحميلها/)).toBeInTheDocument();
    expect(mocks.rangeCalls).toContainEqual({ table: "customer_assets", start: 50, end: 100 });
    expect(screen.queryByRole("button", { name: "تحميل المزيد من الأجهزة" })).not.toBeInTheDocument();
    expect(screen.getByText("جهاز اختبار 50")).toBeInTheDocument();
  });

  it("loads older asset events on demand and keeps the already-loaded event history", async () => {
    render(<CustomerMyDevicesPage />);

    expect(await screen.findByRole("button", { name: "تحميل 250 حدثًا أقدم" })).toBeEnabled();
    expect(mocks.rangeCalls).toContainEqual({ table: "customer_asset_events", start: 0, end: 250 });

    fireEvent.click(screen.getByRole("button", { name: "تحميل 250 حدثًا أقدم" }));

    await waitFor(() => {
      expect(mocks.rangeCalls).toContainEqual({ table: "customer_asset_events", start: 250, end: 500 });
    });
    expect(screen.queryByRole("button", { name: "تحميل 250 حدثًا أقدم" })).not.toBeInTheDocument();
  });
});
