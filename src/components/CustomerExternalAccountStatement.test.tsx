// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { CustomerExternalAccountStatement, CustomerExternalFinanceEntries } from "./CustomerExternalAccountStatement";
import type { CustomerExternalStatement } from "@/lib/customer-external-statement";

afterEach(cleanup);

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
    expect(reviewLinks[0]).toHaveClass("no-print");
    expect(reviewLinks[1]).toHaveClass("no-print");
    expect(document.querySelector(".customer-external-account-statement")).toBeInTheDocument();
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

  it("labels every displayed provider watermark as UTC and preserves exact source instants", () => {
    const { container } = render(<CustomerExternalAccountStatement statement={statement} />);
    expect(container).toHaveTextContent("تاريخ لقطة المصدر (UTC):");
    expect(container).toHaveTextContent("اكتملت المزامنة (UTC):");
    const displayedTimes = Array.from(container.querySelectorAll("time")).map((element) => element.getAttribute("dateTime"));
    expect(displayedTimes).toEqual([
      statement.source_as_of,
      statement.currencies[0].source_as_of,
      statement.currencies[1].source_as_of,
    ]);
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


const externalRowsStatement: CustomerExternalStatement = {
  ...statement,
  currencies: [{
    ...statement.currencies[0],
    entry_count: 3,
    total_debit: "1600.0000",
    total_credit: "550.0000",
    closing_balance: "1050.0000",
    entries: [
      statement.currencies[0].entries[0],
      {
        entry_reference: "RC-001",
        entry_date: "2026-11-28",
        due_date: null,
        entry_type: "payment",
        debit_amount: "0",
        credit_amount: "500.0000",
        running_balance: "1000.0000",
        source_document_number: "RCT-001",
        description: "سند قبض خارجي",
      },
      {
        entry_reference: "CM-001",
        entry_date: "2026-11-28",
        due_date: "2026-11-28",
        entry_type: "credit_note",
        debit_amount: "100.0000",
        credit_amount: "50.0000",
        running_balance: "1050.0000",
        source_document_number: "CN-001",
        description: "إشعار دائن خارجي",
      },
    ],
  }],
};

describe("source-bound ERP customer invoice and payment views", () => {
  it("shows only invoice and credit-note movements in the invoice workspace", () => {
    render(<CustomerExternalFinanceEntries statement={externalRowsStatement} view="invoices" />);
    expect(screen.getByRole("heading", { name: /مستندات وفواتير الحساب — Onyx Pro/ })).toBeInTheDocument();
    expect(screen.getByText("INV-001")).toBeInTheDocument();
    expect(screen.getByText("CN-001")).toBeInTheDocument();
    expect(screen.queryByText("RCT-001")).not.toBeInTheDocument();
    expect(screen.getByText("فاتورة")).toBeInTheDocument();
    expect(screen.getByText("إشعار دائن")).toBeInTheDocument();
    expect(screen.getByText(/ليست ملفات PDF الأصلية/)).toBeInTheDocument();
    const review = screen.getByRole("link", { name: "طلب مراجعة المستند CN-001" });
    const url = new URL(review.getAttribute("href") ?? "", "http://localhost");
    expect(url.pathname).toBe("/service-cases");
    expect(url.searchParams.get("document")).toBe("CN-001");
    expect(url.searchParams.get("currency")).toBe("YER");
    expect(url.searchParams.get("source_mode")).toBe("ONYX");
    expect(url.searchParams.get("source_as_of")).toBe(statement.source_as_of);
  });

  it("shows only payment movements in the payment workspace without fabricating receipt PDFs", () => {
    render(<CustomerExternalFinanceEntries statement={externalRowsStatement} view="payments" />);
    expect(screen.getByRole("heading", { name: /حركات السداد — Onyx Pro/ })).toBeInTheDocument();
    expect(screen.getByText("RCT-001")).toBeInTheDocument();
    expect(screen.queryByText("INV-001")).not.toBeInTheDocument();
    expect(screen.queryByText("CN-001")).not.toBeInTheDocument();
    expect(screen.getByText("سند قبض خارجي")).toBeInTheDocument();
    expect(screen.getByText(/لا ينشئ هذا العرض مستندًا بديلًا/)).toBeInTheDocument();
  });
});
