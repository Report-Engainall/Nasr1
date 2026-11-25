// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  getCurrentTenantScope: vi.fn(),
  rangeCalls: [] as Array<{ table: string; start: number; end: number }>,
  assetRows: [] as Array<Record<string, unknown>>,
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
    const page = table === "customer_assets" && range
      ? mocks.assetRows.slice(range[0], range[1] + 1)
      : [];
    return Promise.resolve({ data: page, error: null }).then(resolve, reject);
  };
  return builder;
}

describe("admin customer asset registry pagination", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.rangeCalls = [];
    mocks.assetRows = Array.from({ length: 51 }, (_, index) => makeAsset(index));
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
});
