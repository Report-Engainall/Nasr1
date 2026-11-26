// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";

const mocks = vi.hoisted(() => ({
  fetchActiveInventoryWarehouses: vi.fn(),
  fetchOnyxProLiveExportRecords: vi.fn(),
  buildOnyxProDataWorkbook: vi.fn(),
}));

vi.mock("@/lib/api", () => ({
  fetchActiveInventoryWarehouses: mocks.fetchActiveInventoryWarehouses,
}));

vi.mock("@/lib/onyx-pro-live-export", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/onyx-pro-live-export")>();
  return {
    ...actual,
    fetchOnyxProLiveExportRecords: mocks.fetchOnyxProLiveExportRecords,
  };
});

vi.mock("@/lib/onyx-pro-workbook", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/onyx-pro-workbook")>();
  return {
    ...actual,
    buildOnyxProDataWorkbook: mocks.buildOnyxProDataWorkbook,
  };
});

import { OnyxProExchangeWorkspace } from "./OnyxProExchangeWorkspace";

const warehouses = [
  { id: "warehouse-1", name: "المستودع الرئيسي", code: "WH-01" },
  { id: "warehouse-2", name: "مستودع الفرع", code: "WH-02" },
];

describe("OnyxProExchangeWorkspace live stock export scope", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.fetchActiveInventoryWarehouses.mockResolvedValue(warehouses);
    mocks.fetchOnyxProLiveExportRecords.mockResolvedValue({
      products: [],
      customers: [],
      stock_balances: [],
    });
    mocks.buildOnyxProDataWorkbook.mockReturnValue(new Uint8Array([1, 2, 3]));
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    Object.defineProperty(URL, "createObjectURL", {
      configurable: true,
      value: vi.fn(() => "blob:onyx-export-test"),
    });
    Object.defineProperty(URL, "revokeObjectURL", {
      configurable: true,
      value: vi.fn(),
    });
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("loads active tenant warehouses and exposes all-warehouse export by default", async () => {
    render(
      <OnyxProExchangeWorkspace
        onBack={vi.fn()}
        onOpenImport={vi.fn()}
        canManageImports
        onOpenSnapshots={vi.fn()}
      />,
    );

    expect(await screen.findByRole("option", { name: "المستودع الرئيسي — WH-01" })).toBeInTheDocument();
    const selector = screen.getByRole("combobox", { name: "نطاق تصدير أرصدة المخزون" });
    expect(selector).toHaveValue("");
    expect(screen.getByRole("option", { name: "جميع المستودعات النشطة" })).toBeInTheDocument();
    expect(mocks.fetchActiveInventoryWarehouses).toHaveBeenCalledTimes(1);
  });

  it("passes a selected warehouse to the live Excel export and confirms the real row counts", async () => {
    render(
      <OnyxProExchangeWorkspace
        onBack={vi.fn()}
        onOpenImport={vi.fn()}
        canManageImports
        onOpenSnapshots={vi.fn()}
      />,
    );

    const selector = await screen.findByRole("combobox", { name: "نطاق تصدير أرصدة المخزون" });
    fireEvent.change(selector, { target: { value: "warehouse-2" } });
    fireEvent.click(screen.getByRole("button", { name: "تنزيل Excel بالبيانات الفعلية" }));

    await waitFor(() => expect(mocks.fetchOnyxProLiveExportRecords).toHaveBeenCalledWith(
      ["products", "customers", "stock_balances"],
      { stockWarehouseId: "warehouse-2" },
    ));
    expect(await screen.findByRole("status")).toHaveTextContent("أرصدة المخزون: 0");
    expect(mocks.buildOnyxProDataWorkbook).toHaveBeenCalledTimes(1);
  });

  it("disables stock export and reports the warehouse-read failure without claiming success", async () => {
    mocks.fetchActiveInventoryWarehouses.mockRejectedValueOnce(new Error("تعذر تحميل المستودعات"));
    render(
      <OnyxProExchangeWorkspace
        onBack={vi.fn()}
        onOpenImport={vi.fn()}
        canManageImports
        onOpenSnapshots={vi.fn()}
      />,
    );

    expect(await screen.findByRole("alert")).toHaveTextContent("تعذر تحميل المستودعات");
    expect(screen.getByRole("button", { name: "CSV أرصدة المخزون الحية" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "تنزيل Excel بالبيانات الفعلية" })).toBeDisabled();
    expect(mocks.fetchOnyxProLiveExportRecords).not.toHaveBeenCalled();
  });

  it("does not load inventory scope or show live export controls to users without import access", () => {
    render(
      <OnyxProExchangeWorkspace
        onBack={vi.fn()}
        onOpenImport={vi.fn()}
        canManageImports={false}
        onOpenSnapshots={vi.fn()}
      />,
    );

    expect(screen.queryByRole("region", { name: "تصدير سجلات أونكس الحية" })).not.toBeInTheDocument();
    expect(mocks.fetchActiveInventoryWarehouses).not.toHaveBeenCalled();
  });
});
