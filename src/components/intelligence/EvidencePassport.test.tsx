import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { EvidencePassport as PassportData } from "@/lib/intelligence/types";
import { EvidencePassport } from "./EvidencePassport";

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
    expect(within(cards[1]).getByText("غير متاح")).toBeInTheDocument();
    expect(within(cards[1]).getByText(/لا يوجد مصدر/)).toBeInTheDocument();
    expect(within(cards[1]).getByText(/SOURCE_VALUE_MISSING/)).toBeInTheDocument();

    expect(screen.getByText("الحالة: يحتاج مراجعة")).toBeInTheDocument();
    expect(screen.getByText(/general_ledger/)).toBeInTheDocument();
  });

  it("does not render a fabricated source list when the passport has no evidence records", () => {
    const withoutRecords: PassportData = { ...passport, evidenceRecords: [] };
    render(<EvidencePassport passport={withoutRecords} />);
    expect(screen.queryByRole("heading", { name: "المصادر" })).not.toBeInTheDocument();
  });
});
