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
