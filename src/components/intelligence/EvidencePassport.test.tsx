// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { EvidencePassport as PassportData } from "@/lib/intelligence/types";
import type { ClaimEvidencePassport } from "@/lib/intelligence/claim-evidence-passport";
import { EvidencePassport } from "./EvidencePassport";

const drilldownMocks = vi.hoisted(() => ({ fetch: vi.fn() }));
vi.mock("@/lib/intelligence/claim-evidence-drilldown-client", () => ({
  claimEvidenceFieldLabels: {
    invoiceStatus: "حالة الفاتورة",
    totalAmount: "إجمالي الفاتورة",
    currency: "العملة",
    quantityAvailable: "الكمية المتاحة",
  },
  supportsClaimEvidenceDrilldown: (sourceName: string) =>
    sourceName === "customer_invoices" || sourceName === "inventory.current_balances",
  fetchClaimEvidenceDrilldown: drilldownMocks.fetch,
}));

const passport: PassportData = {
  id: "passport-1",
  generatedAt: "2026-11-01T01:00:00.000Z",
  asOf: "2026-11-01T00:55:00.000Z",
  status: "NEEDS_REVIEW",
  completeness: "PARTIAL",
  warnings: ["PASSPORT_HAS_PARTIAL_EVIDENCE"],
  metrics: [
    {
      id: "metric-cash",
      key: "cash.available_balance",
      value: 250,
      unit: "CURRENCY",
      currency: "YER",
      status: "VERIFIED",
      completeness: "COMPLETE",
      quality: "ACCEPTABLE",
      period: null,
      asOf: "2026-11-01T00:55:00.000Z",
      lineage: {
        evidenceIds: ["ledger:cash-1", "ledger:cash-2"],
        calculatedAt: "2026-11-01T00:55:00.000Z",
        formulaId: "cash.available",
        formulaVersion: "1.0.0",
        transformations: ["server-calculated"],
      },
      warnings: [],
    },
    {
      id: "metric-missing",
      key: "inventory.unverified_value",
      value: null,
      unit: "COUNT",
      status: "UNAVAILABLE",
      completeness: "UNKNOWN",
      quality: "UNKNOWN",
      period: null,
      asOf: "2026-11-01T00:55:00.000Z",
      lineage: {
        evidenceIds: [],
        calculatedAt: "2026-11-01T00:55:00.000Z",
        formulaId: "",
        formulaVersion: "",
        transformations: [],
      },
      warnings: ["SOURCE_VALUE_MISSING"],
    },
  ],
  evidenceRecords: [
    {
      id: "ledger:cash-1",
      source: { kind: "LEDGER", name: "general_ledger", recordId: "entry-1", version: "1" },
      sourceTimestamp: "2026-11-01T00:45:00.000Z",
      asOf: "2026-11-01T00:55:00.000Z",
      period: null,
      currency: "YER",
      status: "VERIFIED",
      completeness: "COMPLETE",
      quality: "ACCEPTABLE",
      warnings: [],
    },
  ],
};

describe("EvidencePassport", () => {
  afterEach(() => { cleanup(); drilldownMocks.fetch.mockReset(); });
  it.each([
    ["loading", "جارٍ تحميل سجل الأدلة…"],
    ["empty", "لا توجد مؤشرات أو أدلة للفترة المحددة."],
    ["unavailable", "مصدر الأدلة غير متاح. لم تُعرض بيانات بديلة."],
  ] as const)("renders the %s state without substitute evidence", (state, message) => {
    render(<EvidencePassport state={state} />);
    expect(screen.getByText(message)).toBeInTheDocument();
  });

  it("keeps the error state retry action explicit", () => {
    const onRetry = vi.fn();
    render(<EvidencePassport state="error" errorMessage="فشل جلب سجل المصدر" onRetry={onRetry} />);
    fireEvent.click(screen.getByRole("button", { name: "إعادة المحاولة" }));
    expect(screen.getByRole("alert")).toHaveTextContent("فشل جلب سجل المصدر");
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it("shows the explicit missing state when ready without a passport", () => {
    render(<EvidencePassport />);
    expect(screen.getByText("سجل الأدلة غير متوفر.")).toBeInTheDocument();
  });

  it("renders typed metrics, value states, formula lineage and source records", () => {
    render(<EvidencePassport passport={passport} />);
    const cards = screen.getAllByTestId("evidence-metric-card");
    expect(cards).toHaveLength(2);

    expect(within(cards[0]).getByText("cash.available_balance")).toBeInTheDocument();
    expect(within(cards[0]).getByText("250 YER")).toBeInTheDocument();
    expect(within(cards[0]).getByText(/ledger:cash-1، ledger:cash-2/)).toBeInTheDocument();
    expect(within(cards[0]).getByText(/cash.available \/ 1.0.0/)).toBeInTheDocument();

    expect(within(cards[1]).getByText("inventory.unverified_value")).toBeInTheDocument();
    expect(within(cards[1]).getAllByText("غير متاح")).toHaveLength(2);
    expect(within(cards[1]).getByText(/لا يوجد مصدر/)).toBeInTheDocument();
    expect(within(cards[1]).getByText(/SOURCE_VALUE_MISSING/)).toBeInTheDocument();

    expect(screen.getByText("يحتاج مراجعة")).toBeInTheDocument();
    expect(screen.getAllByText(/general_ledger/).length).toBeGreaterThan(1);
  });

  it("shows claim classification, refuses unproven causes and requires cross-domain review", async () => {
    const claim: ClaimEvidencePassport = {
      id: "claim-cross-domain",
      statement: "هل نقص المخزون سبب تأخر التحصيل؟",
      requestedKind: "CAUSE",
      classification: "DRIVER",
      causalStatus: "NOT_ESTABLISHED",
      status: "NEEDS_REVIEW",
      metricIds: ["metric-cash"],
      evidenceIds: ["ledger:cash-1", "stock:row-1"],
      metrics: [passport.metrics[0]],
      sourceRecords: [
        {
          ...passport.evidenceRecords[0],
          id: "invoice:11111111-1111-4111-8111-111111111111",
          source: {
            kind: "TABLE",
            name: "customer_invoices",
            recordId: "11111111-1111-4111-8111-111111111111",
            version: "v1",
          },
        },
        {
          id: "stock:row-1",
          source: {
            kind: "TABLE",
            name: "inventory.current_balances",
            recordId: "22222222-2222-4222-8222-222222222222",
            version: "v1",
          },
          sourceTimestamp: "2026-11-01T00:45:00.000Z",
          asOf: passport.asOf,
          period: null,
          status: "VERIFIED",
          completeness: "COMPLETE",
          quality: "ACCEPTABLE",
          warnings: [],
        },
      ],
      formulas: [{ metricId: "metric-cash", formulaId: "cash.available", formulaVersion: "1.0.0" }],
      domains: ["FINANCE", "INVENTORY"],
      crossDomainReviewRequired: true,
      reviewTags: ["CROSS-DOMAIN REVIEW REQUIRED"],
      confidence: null,
      confidenceBasis: null,
      boundaries: ["CAUSE_NOT_ESTABLISHED_DRIVER_ONLY"],
      rawDrilldown: "SOURCE_REFERENCE_ONLY",
    };
    render(<EvidencePassport passport={passport} claims={[claim]} />);
    const card = screen.getByTestId("claim-evidence-card");
    expect(card).toHaveTextContent("محرك أو عامل مرتبط");
    expect(card).toHaveTextContent("السبب غير مثبت");
    expect(card).toHaveTextContent("CROSS-DOMAIN REVIEW REQUIRED");
    expect(card).toHaveTextContent("غير محددة من مصدر معتمد");
    expect(card).toHaveTextContent("inventory.current_balances");
    const drilldownButtons = within(card).getAllByRole("button", {
      name: "عرض الصفوف المصدرية المسموح بها",
    });
    expect(drilldownButtons).toHaveLength(2);
    expect(drilldownMocks.fetch).not.toHaveBeenCalled();

    drilldownMocks.fetch
      .mockResolvedValueOnce({
        status: "READY",
        rows: [{ invoiceStatus: "issued", totalAmount: "1500.25", currency: "YER" }],
        hasMore: false,
        nextOffset: null,
        message: "",
      })
      .mockResolvedValueOnce({
        status: "DENIED",
        rows: [],
        hasMore: false,
        nextOffset: null,
        message: "رفض الخادم قراءة الأدلة لهذه الصلاحية؛ لم تُعرض أي بيانات.",
      });

    fireEvent.click(drilldownButtons[0]);
    expect(await within(card).findByText("1500.25")).toBeInTheDocument();
    expect(within(card).getByText("حالة الفاتورة")).toBeInTheDocument();
    expect(drilldownMocks.fetch).toHaveBeenCalledTimes(1);

    fireEvent.click(drilldownButtons[1]);
    expect(await within(card).findByRole("alert")).toHaveTextContent("رفض الخادم قراءة الأدلة");
    expect(drilldownMocks.fetch).toHaveBeenCalledTimes(2);
  });

  it("does not render a fabricated source list when the passport has no evidence records", () => {
    const withoutRecords: PassportData = { ...passport, evidenceRecords: [] };
    render(<EvidencePassport passport={withoutRecords} />);
    expect(screen.queryByText(/وقت المصدر:/)).not.toBeInTheDocument();
    expect(screen.getAllByTestId("evidence-metric-card")).toHaveLength(passport.metrics.length);
  });
});
