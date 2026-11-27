// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";

const mocks = vi.hoisted(() => ({ runErpReadSync: vi.fn() }));
vi.mock("@/lib/erp-read-sync", () => ({ runErpReadSync: mocks.runErpReadSync }));

import { ErpReadSyncPanel } from "./ErpReadSyncPanel";

const result = {
  status: "continuation_required" as const,
  pages_committed: 2,
  records_read: 125,
  counts: { created: 10, updated: 20, unchanged: 90, rejected: 3, conflicted: 2 },
  checkpoint: {
    version: 8,
    has_cursor: true,
    pending_watermark: "2026-11-28T00:30:00Z",
    completed_watermark: "2026-11-27T22:00:00Z",
  },
  preview: {
    records: [{
      externalId: "ERP-PRODUCT-001",
      sourceUpdatedAt: "2026-11-28T00:30:00Z",
      lastDisposition: "created",
      fields: { item_code: "000125", name: "منتج مرحلي", barcode: null },
    }],
    total: 42,
    limit: 20,
    offset: 0,
    checkpointVersion: 8,
    hasCursor: true,
    pendingWatermark: "2026-11-28T00:30:00Z",
    completedWatermark: "2026-11-27T22:00:00Z",
  },
  preview_error: null,
  receipts: {
    records: [{
      pageNumber: 2,
      httpStatus: 200,
      hasNextCursor: false,
      recordsReceived: 2,
      counts: { created: 1, updated: 1, unchanged: 0, rejected: 0, conflicted: 0 },
      completed: true,
      committedVersion: 9,
      recordedAt: "2026-11-28T00:30:00Z",
      pendingWatermark: null,
      completedWatermark: "2026-11-28T00:30:00Z",
    }],
    total: 3,
    limit: 10,
    offset: 0,
    checkpointVersion: 9,
    hasCursor: false,
  },
  receipts_error: null,
};

describe("ErpReadSyncPanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.runErpReadSync.mockResolvedValue(result);
  });
  afterEach(() => cleanup());

  it("keeps the control disabled without manager permission", () => {
    render(<ErpReadSyncPanel canManage={false} />);
    expect(screen.getByRole("button", { name: "تنفيذ مزامنة القراءة" })).toBeDisabled();
    expect(screen.getByText("تشغيل المزامنة متاح للمدير ومدير النظام فقط.")).toBeInTheDocument();
    expect(mocks.runErpReadSync).not.toHaveBeenCalled();
  });

  it("runs the selected bounded provider scope and renders the actual result", async () => {
    render(<ErpReadSyncPanel canManage />);
    fireEvent.change(screen.getByLabelText("النظام المحاسبي"), { target: { value: "al_mutakamel" } });
    fireEvent.change(screen.getByLabelText("نوع البيانات"), { target: { value: "customers" } });
    fireEvent.change(screen.getByLabelText("معرّف الشركة في ERP"), { target: { value: "MUT-COMPANY-02" } });
    fireEvent.change(screen.getByLabelText("معرّف الفرع في ERP"), { target: { value: "MUT-BRANCH-03" } });
    fireEvent.change(screen.getByLabelText("معرّف المستودع (اختياري)"), { target: { value: "MUT-WH-04" } });
    fireEvent.change(screen.getByLabelText("العملة (اختياري)"), { target: { value: "USD" } });
    fireEvent.click(screen.getByRole("button", { name: "تنفيذ مزامنة القراءة" }));

    await waitFor(() => expect(mocks.runErpReadSync).toHaveBeenCalledWith({
      provider: "al_mutakamel",
      object_type: "customers",
      company_external_id: "MUT-COMPANY-02",
      branch_external_id: "MUT-BRANCH-03",
      warehouse_external_id: "MUT-WH-04",
      currency_code: "USD",
      max_pages: 2,
      max_records: 500,
    }));
    expect(await screen.findByRole("status")).toHaveTextContent("توجد متابعة مطلوبة لاستكمال المزامنة");
    expect(screen.getByRole("status")).toHaveTextContent("125");
    expect(screen.getByRole("status")).toHaveTextContent("جديدة: 10");
    expect(screen.getByRole("status")).toHaveTextContent("متعارضة: 2");
    expect(screen.getByRole("status")).toHaveTextContent("إصدار نقطة الاستئناف: 8");
    expect(screen.getByRole("status")).toHaveTextContent("يوجد مؤشر متابعة محمي");
    expect(screen.getByRole("status")).toHaveTextContent("2026");
    expect(screen.getByRole("status")).toHaveTextContent("معاينة البيانات المرحلية");
    expect(screen.getByRole("status")).toHaveTextContent("ERP-PRODUCT-001");
    expect(screen.getByRole("status")).toHaveTextContent("اسم الصنف");
    expect(screen.getByRole("status")).toHaveTextContent("جديد");
    expect(screen.getByRole("status")).toHaveTextContent("42");
    expect(screen.getByRole("region", { name: "سجل إيصالات صفحات ERP" })).toHaveTextContent("صفحة 2");
    expect(screen.getByRole("region", { name: "سجل إيصالات صفحات ERP" })).toHaveTextContent("مكتملة");
    expect(screen.getByRole("region", { name: "سجل إيصالات صفحات ERP" })).toHaveTextContent("HTTP 200");
    expect(screen.getByRole("region", { name: "سجل إيصالات صفحات ERP" })).toHaveTextContent("جديدة: 1");
  });

  it("pages through ERP receipt history without resynchronizing or replacing sync totals", async () => {
    render(<ErpReadSyncPanel canManage />);
    fireEvent.change(screen.getByLabelText("معرّف الشركة في ERP"), { target: { value: "COMPANY-01" } });
    fireEvent.change(screen.getByLabelText("معرّف الفرع في ERP"), { target: { value: "BRANCH-01" } });
    fireEvent.click(screen.getByRole("button", { name: "تنفيذ مزامنة القراءة" }));
    await screen.findByText("صفحة 2 · مكتملة");

    mocks.runErpReadSync.mockResolvedValueOnce({
      ...result,
      pages_committed: 0,
      records_read: 0,
      counts: { created: 0, updated: 0, unchanged: 0, rejected: 0, conflicted: 0 },
      receipts: {
        ...result.receipts,
        records: [{
          ...result.receipts.records[0],
          pageNumber: 1,
          committedVersion: 8,
          counts: { created: 0, updated: 0, unchanged: 2, rejected: 0, conflicted: 0 },
        }],
        offset: 10,
      },
    });

    fireEvent.click(screen.getByRole("button", { name: "التالي" }).filter ? screen.getByRole("button", { name: "التالي" }).filter : screen.getByRole("group", { name: "صفحات سجل إيصالات ERP" }).querySelector("button:last-of-type") as unknown as HTMLElement);
    await screen.findByText("صفحة 1 · مكتملة");
    expect(mocks.runErpReadSync).toHaveBeenNthCalledWith(2, {
      provider: "onyx_pro",
      object_type: "products",
      company_external_id: "COMPANY-01",
      branch_external_id: "BRANCH-01",
      warehouse_external_id: null,
      currency_code: "YER",
      max_pages: 2,
      max_records: 500,
      preview_only: true,
      preview_offset: 0,
      preview_limit: 20,
      receipts_offset: 10,
      receipts_limit: 10,
    });
    expect(screen.getByRole("status")).toHaveTextContent("125");
    expect(screen.getByRole("status")).toHaveTextContent("جديدة: 10");
    expect(screen.getByRole("group", { name: "صفحات سجل إيصالات ERP" })).toHaveTextContent("الإيصالات 11–11 من 3");
  });

  it("pages through staged records with preview-only reads and preserves original sync counters", async () => {
    render(<ErpReadSyncPanel canManage />);
    fireEvent.change(screen.getByLabelText("معرّف الشركة في ERP"), { target: { value: "COMPANY-01" } });
    fireEvent.change(screen.getByLabelText("معرّف الفرع في ERP"), { target: { value: "BRANCH-01" } });
    fireEvent.click(screen.getByRole("button", { name: "تنفيذ مزامنة القراءة" }));

    await waitFor(() => expect(mocks.runErpReadSync).toHaveBeenCalledTimes(1));
    await screen.findByText("ERP-PRODUCT-001");
    mocks.runErpReadSync.mockResolvedValueOnce({
      ...result,
      pages_committed: 0,
      records_read: 0,
      counts: { created: 0, updated: 0, unchanged: 0, rejected: 0, conflicted: 0 },
      preview: {
        ...result.preview,
        records: [{
          externalId: "ERP-PRODUCT-021",
          sourceUpdatedAt: "2026-11-28T00:31:00Z",
          lastDisposition: "updated",
          lastDispositionReason: null,
          fields: { item_code: "000145", name: "صفحة ثانية" },
        }],
        offset: 20,
        hasCursor: true,
      },
    });

    fireEvent.click(screen.getByRole("button", { name: "التالي" }));
    await screen.findByText("ERP-PRODUCT-021");
    expect(mocks.runErpReadSync).toHaveBeenNthCalledWith(2, {
      provider: "onyx_pro",
      object_type: "products",
      company_external_id: "COMPANY-01",
      branch_external_id: "BRANCH-01",
      warehouse_external_id: null,
      currency_code: "YER",
      max_pages: 2,
      max_records: 500,
      preview_only: true,
      preview_offset: 20,
      preview_limit: 20,
    });
    expect(screen.getByRole("status")).toHaveTextContent("125");
    expect(screen.getByRole("status")).toHaveTextContent("جديدة: 10");
    expect(screen.getByRole("group", { name: "صفحات معاينة بيانات ERP" })).toHaveTextContent("السجلات 21–21 من 42");
  });

  it("supports staging customer invoices, payment receipts and statement entries without posting them", async () => {
    render(<ErpReadSyncPanel canManage />);
    fireEvent.change(screen.getByLabelText("نوع البيانات"), { target: { value: "customer_statement_entries" } });
    fireEvent.change(screen.getByLabelText("معرّف الشركة في ERP"), { target: { value: "COMPANY-01" } });
    fireEvent.change(screen.getByLabelText("معرّف الفرع في ERP"), { target: { value: "BRANCH-01" } });
    fireEvent.click(screen.getByRole("button", { name: "تنفيذ مزامنة القراءة" }));
    await waitFor(() => expect(mocks.runErpReadSync).toHaveBeenCalledWith(expect.objectContaining({
      object_type: "customer_statement_entries",
      company_external_id: "COMPANY-01",
      branch_external_id: "BRANCH-01",
    })));
    expect(screen.getByText(/لا تُرحّل إلى دفتر الحساب أو المخزون تلقائيًا/)).toBeInTheDocument();
  });

  it("refuses to run with missing mandatory company and branch identifiers", () => {
    render(<ErpReadSyncPanel canManage />);
    expect(screen.getByRole("button", { name: "تنفيذ مزامنة القراءة" })).toBeDisabled();
    expect(mocks.runErpReadSync).not.toHaveBeenCalled();
  });

  it("renders a safe configuration failure without exposing provider credentials", async () => {
    mocks.runErpReadSync.mockRejectedValueOnce(new Error("لم يثبت ترخيص أو تفعيل واجهة ERP؛ أبقينا الاتصال متوقفًا."));
    render(<ErpReadSyncPanel canManage />);
    fireEvent.change(screen.getByLabelText("معرّف الشركة في ERP"), { target: { value: "COMPANY-01" } });
    fireEvent.change(screen.getByLabelText("معرّف الفرع في ERP"), { target: { value: "BRANCH-01" } });
    fireEvent.click(screen.getByRole("button", { name: "تنفيذ مزامنة القراءة" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("لم يثبت ترخيص أو تفعيل واجهة ERP");
    expect(screen.getByRole("alert")).not.toHaveTextContent(/secret|token|server-only/i);
  });
});
