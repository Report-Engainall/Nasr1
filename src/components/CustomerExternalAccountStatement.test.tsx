// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CustomerExternalAccountStatement } from "./CustomerExternalAccountStatement";
import type { CustomerExternalStatement } from "@/lib/customer-external-statement";

const originalPrintDescriptor = Object.getOwnPropertyDescriptor(window, "print");

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  document.body.removeAttribute("data-print-mode");
  if (originalPrintDescriptor) Object.defineProperty(window, "print", originalPrintDescriptor);
  else Reflect.deleteProperty(window, "print");
});

const statement: CustomerExternalStatement = {
  source_mode: "ONYX",
  source_as_of: new Date(Date.now() - 5 * 60_000).toISOString(),
  details_limit_per_currency: 500,
  currencies: [
    {
      currency_code: "YER",
      source_as_of: new Date(Date.now() - 4 * 60_000).toISOString(),
      entry_count: 1,
      total_debit: "1500.0000",
      total_credit: "500.0000",
      closing_balance: "1000.0000",
      details_partial: false,
      entries: [{
        entry_reference: "JV-001",
        entry_date: "2026-11-27",
        due_date: null,
        entry_type: "invoice",
        debit_amount: "1500.0000",
        credit_amount: "0",
        running_balance: "1500.0000",
        source_document_number: "INV-001",
        description: "فاتورة مبيعات",
      }],
    },
    {
      currency_code: "USD",
      source_as_of: new Date(Date.now() - 4 * 60_000).toISOString(),
      entry_count: 1,
      total_debit: "25.0000",
      total_credit: "0",
      closing_balance: "25.0000",
      details_partial: false,
      entries: [{
        entry_reference: "JV-USD-001",
        entry_date: "2026-11-27",
        due_date: null,
        entry_type: "opening_balance",
        debit_amount: "25.0000",
        credit_amount: "0",
        running_balance: "25.0000",
        source_document_number: null,
        description: "رصيد افتتاحي",
      }],
    },
  ],
};

describe("customer external account statement workspace", () => {
  it("renders approved ERP rows in separate currency ledgers without app-ledger labels", () => {
    render(<CustomerExternalAccountStatement statement={statement} />);
    expect(screen.getByRole("heading", { name: /كشف الحساب الخارجي — Onyx Pro/ })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "كشف YER" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "كشف USD" })).toBeInTheDocument();
    expect(screen.getByText("JV-001")).toBeInTheDocument();
    expect(screen.getByText("JV-USD-001")).toBeInTheDocument();
    expect(screen.getByText("INV-001")).toBeInTheDocument();
    expect(screen.queryByText(/دفتر متجر الأغبري الكامل/)).not.toBeInTheDocument();
    expect(screen.getAllByText(/الرصيد الختامي/)).toHaveLength(2);
    const reviewLinks = screen.getAllByRole("link", { name: /طلب مراجعة الحركة/ });
    expect(reviewLinks).toHaveLength(2);
    const yerReview = new URL(reviewLinks[0].getAttribute("href") ?? "", "http://localhost");
    expect(yerReview.pathname).toBe("/service-cases");
    expect(yerReview.searchParams.get("request")).toBe("document_review");
    expect(yerReview.searchParams.get("document")).toBe("INV-001");
    expect(yerReview.searchParams.get("reference")).toBe("JV-001");
    expect(yerReview.searchParams.get("currency")).toBe("YER");
    expect(yerReview.searchParams.get("type")).toBe("invoice");
    expect(yerReview.searchParams.get("source_mode")).toBe("ONYX");
    expect(yerReview.searchParams.get("source_as_of")).toBe(statement.source_as_of);
    const usdReview = new URL(reviewLinks[1].getAttribute("href") ?? "", "http://localhost");
    expect(usdReview.searchParams.get("document")).toBe("JV-USD-001");
    expect(usdReview.searchParams.get("currency")).toBe("USD");
    expect(usdReview.searchParams.get("type")).toBe("opening_balance");
  });

  it("prints only the source-stamped external statement and restores the previous print mode", () => {
    const nativePrint = vi.fn();
    Object.defineProperty(window, "print", { configurable: true, writable: true, value: nativePrint });
    document.body.setAttribute("data-print-mode", "previous-print-mode");

    render(<CustomerExternalAccountStatement statement={statement} />);
    fireEvent.click(screen.getByRole("button", { name: "طباعة كشف الحساب الخارجي" }));

    expect(nativePrint).toHaveBeenCalledOnce();
    expect(document.body).toHaveAttribute("data-print-mode", "customer-external-statement");
    window.dispatchEvent(new Event("afterprint"));
    expect(document.body).toHaveAttribute("data-print-mode", "previous-print-mode");
  });

  it("restores the page print mode and reports an unsupported print failure", () => {
    const nativePrint = vi.fn(() => { throw new Error("print unavailable"); });
    Object.defineProperty(window, "print", { configurable: true, writable: true, value: nativePrint });

    render(<CustomerExternalAccountStatement statement={statement} />);
    fireEvent.click(screen.getByRole("button", { name: "طباعة كشف الحساب الخارجي" }));

    expect(nativePrint).toHaveBeenCalledOnce();
    expect(document.body).not.toHaveAttribute("data-print-mode");
    expect(screen.getByRole("alert")).toHaveTextContent("تعذر فتح طباعة كشف الحساب");
  });

  it("labels capped details while preserving server totals and closing balance", () => {
    const partial: CustomerExternalStatement = {
      ...statement,
      currencies: [{
        ...statement.currencies[0],
        entry_count: 501,
        details_partial: true,
        entries: Array.from({ length: 500 }, (_, index) => ({
          ...statement.currencies[0].entries[0],
          entry_reference: "JV-" + String(index + 1).padStart(3, "0"),
        })),
      }],
    };
    render(<CustomerExternalAccountStatement statement={partial} />);
    expect(screen.getByRole("status")).toHaveTextContent("أحدث 500 حركة فقط");
    expect(screen.getByText("JV-500")).toBeInTheDocument();
    expect(screen.getByText(/١٬٠٠٠|1,000|1000/)).toBeInTheDocument();
  });
});
