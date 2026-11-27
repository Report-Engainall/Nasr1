// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";

const mocks = vi.hoisted(() => ({
  fetchActiveInventoryWarehouses: vi.fn(),
  fetchOnyxProLiveExportRecords: vi.fn(),
  buildOnyxProDataWorkbook: vi.fn(),
  runErpReadSync: vi.fn(),
}));

vi.mock("@/lib/api", () => ({
  fetchActiveInventoryWarehouses: mocks.fetchActiveInventoryWarehouses,
}));

vi.mock("@/lib/onyx-pro-live-export", () => ({
  ONYX_PRO_LIVE_DATASET_IDS: ["products", "customers", "warehouses", "stock_balances"],
  fetchOnyxProLiveExportRecords: mocks.fetchOnyxProLiveExportRecords,
}));

vi.mock("@/lib/erp-read-sync", () => ({
  runErpReadSync: mocks.runErpReadSync,
}));

vi.mock("@/lib/onyx-pro-workbook", () => ({
  buildOnyxProDataCsv: vi.fn(() => ""),
  buildOnyxProDataWorkbook: mocks.buildOnyxProDataWorkbook,
  buildOnyxProWorkbook: vi.fn(() => new Uint8Array([1])),
  onyxProDatasetCsvFilename: vi.fn(() => "Aghbari-Onyx-Headers.csv"),
  onyxProLiveDatasetCsvFilename: vi.fn(() => "Aghbari-Onyx-Live.csv"),
  onyxProLiveWorkbookFilename: vi.fn(() => "Aghbari-Onyx-Live.xlsx"),
  onyxProWorkbookFilename: vi.fn(() => "Aghbari-Onyx-Template.xlsx"),
  ONYX_PRO_WORKBOOK_MIME: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
}));

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
      warehouses: [],
      stock_balances: [],
    });
    mocks.buildOnyxProDataWorkbook.mockReturnValue(new Uint8Array([1, 2, 3]));
    mocks.runErpReadSync.mockResolvedValue({
      status: "complete", pages_committed: 1, records_read: 2,
      counts: { created: 2, updated: 0, unchanged: 0, rejected: 0, conflicted: 0 },
      checkpoint: { version: 1, has_cursor: false, pending_watermark: null, completed_watermark: "2026-11-28T00:00:00Z" },
    });
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

  it("states both ERP transports accurately without claiming a live connection", () => {
    render(
      <OnyxProExchangeWorkspace
        onBack={vi.fn()}
        onOpenImport={vi.fn()}
        canManageImports
        onOpenSnapshots={vi.fn()}
      />,
    );

    const readiness = screen.getByRole("region", { name: "حالة تكامل الأنظمة المحاسبية" });
    expect(readiness).toHaveTextContent("Onyx Pro");
    expect(readiness).toHaveTextContent("المتكامل المحاسبي");
    expect(readiness).toHaveTextContent("لا يرسلها تلقائيًا إلى خادم Onyx");
    expect(readiness).toHaveTextContent("لا تُرسل الفواتير أو سندات القبض أو القيود");

    expect(screen.getByRole("region", { name: "تصدير بيانات الأغبري الحالية إلى Onyx" })).toBeInTheDocument();
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
      ["products", "customers", "warehouses", "stock_balances"],
      { stockWarehouseId: "warehouse-2" },
    ));
    expect(await screen.findByRole("status")).toHaveTextContent("المستودعات: 0");
    expect(screen.getByRole("status")).toHaveTextContent("أرصدة المخزون: 0");
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

  it("shows ERP connector readiness without exposing exports to users without import access", () => {
    render(
      <OnyxProExchangeWorkspace
        onBack={vi.fn()}
        onOpenImport={vi.fn()}
        canManageImports={false}
        onOpenSnapshots={vi.fn()}
      />,
    );

    expect(screen.getByRole("region", { name: "حالة تكامل الأنظمة المحاسبية" })).toHaveTextContent("المزامنة المباشرة غير متاحة");
    expect(screen.getByRole("region", { name: "حالة تكامل الأنظمة المحاسبية" })).toHaveTextContent("لا يوجد موصل خادمي مفعّل");
    expect(screen.queryByRole("region", { name: "تصدير بيانات الأغبري الحالية إلى Onyx" })).not.toBeInTheDocument();
    expect(mocks.fetchActiveInventoryWarehouses).not.toHaveBeenCalled();
  });
});
