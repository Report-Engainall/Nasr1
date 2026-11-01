import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { GeneralLedgerWorkspace } from "@/components/GeneralLedgerWorkspace";
const mocks = vi.hoisted(() => ({ rpc: vi.fn(), roles: ["accountant"] as string[] }));
vi.mock("@/lib/supabase", () => ({ supabase: { rpc: mocks.rpc } }));
vi.mock("@/lib/auth", () => ({ useAuth: () => ({ user: { roles: mocks.roles }, ready: true }) }));
const payload = {
  accounts: [
    { id:"cash",code:"1000",name:"النقدية",account_type:"asset",is_active:true,debit_total:"1000.00",credit_total:"100.00" },
    { id:"capital",code:"3000",name:"رأس المال",account_type:"equity",is_active:true,debit_total:"0.00",credit_total:"500.00" },
    { id:"sales",code:"4000",name:"الإيرادات",account_type:"revenue",is_active:true,debit_total:"0.00",credit_total:"500.00" },
    { id:"expense",code:"5000",name:"مصروفات تشغيل",account_type:"expense",is_active:true,debit_total:"100.00",credit_total:"0.00" },
  ],
  entries:[],entry_count:0,has_more:false,summary:{posted_entry_count:2,debit_total:"1100.00",credit_total:"1100.00"},
};
function createManualReversalRpcMock(
  entry: Record<string, unknown>,
  getLinks: () => Array<{ original_journal_entry_id: string; reversal_journal_entry_id: string }>,
  setLinks: (links: Array<{ original_journal_entry_id: string; reversal_journal_entry_id: string }>) => void,
) {
  return async (name: string) => {
    if (name === "fetch_general_ledger") {
      return { data: { ...payload, entries: [entry], entry_count: 1, has_more: false }, error: null };
    }
    if (name === "fetch_general_journal_reversal_links") return { data: getLinks(), error: null };
    if (name === "reverse_general_journal_entry") {
      setLinks([{ original_journal_entry_id: "manual-journal-1", reversal_journal_entry_id: "reversal-journal-1" }]);
      return {
        data: {
          original_journal_entry_id: "manual-journal-1",
          reversal_journal_entry_id: "reversal-journal-1",
          entry_number: "124",
          status: "draft",
          replayed: false,
        },
        error: null,
      };
    }
    if (name === "fetch_cash_expense_accounting_inbox") {
      return { data: { items: [], total_count: 0, has_more: false, limit: 50, offset: 0 }, error: null };
    }
    return { data: payload, error: null };
  };
}

describe("general ledger financial-statement UI", () => {
  beforeEach(() => { mocks.roles=["accountant"]; mocks.rpc.mockReset().mockImplementation((name: string) => Promise.resolve({data:name==="fetch_cash_expense_accounting_inbox"?{items:[],total_count:0,has_more:false,limit:50,offset:0}:payload,error:null})); });
  afterEach(() => { cleanup(); vi.restoreAllMocks(); });
  it("uses the authorized ledger RPC and renders reconciled totals", async () => {
    render(<GeneralLedgerWorkspace />);
    expect(await screen.findByText("معادلة الميزانية متوازنة ضمن القيود المرحلة.")).toBeInTheDocument();
    expect(screen.getByText("نتيجة الفترة")).toBeInTheDocument();
    expect(screen.getAllByText("400.00 ر.ي").length).toBeGreaterThanOrEqual(1);
    const calls = mocks.rpc.mock.calls.filter(([name]) => name === "fetch_general_ledger");
    expect(calls.length).toBeGreaterThanOrEqual(3);
    expect(calls.some(([,args]) => args.p_limit === 1 && args.p_from === null && typeof args.p_to === "string")).toBe(true);
  });
  it("does not request ledger details for a customer role", () => {
    mocks.roles=["customer"];
    render(<GeneralLedgerWorkspace />);
    expect(screen.getByRole("heading", { name: "دفتر الأستاذ العام" })).toBeInTheDocument();
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it("creates a manual reversal draft through the tenant-scoped RPC and refreshes the ledger", async () => {
    mocks.roles=["admin"];
    const entry = {
      id:"manual-journal-1", entry_number:"123", entry_date:"2026-10-23",
      description:"CI documented manual journal", source_type:"manual", source_reference:null,
      status:"posted", created_at:"2026-10-23T10:00:00Z", posted_at:"2026-10-23T10:00:00Z",
      debit_total:"125.50", credit_total:"125.50",
      lines:[
        {line_number:1,account_id:"expense",account_code:"5000",account_name:"مصروفات تشغيل",debit:"125.50",credit:"0.00",memo:"original debit"},
        {line_number:2,account_id:"cash",account_code:"1000",account_name:"النقدية",debit:"0.00",credit:"125.50",memo:"original credit"},
      ],
    };
    let reversalLinks: Array<{original_journal_entry_id:string;reversal_journal_entry_id:string}> = [];
    mocks.rpc.mockImplementation(createManualReversalRpcMock(
      entry,
      () => reversalLinks,
      (links) => { reversalLinks = links; },
    ));
    vi.spyOn(window,"prompt").mockReturnValue("Documented correction for original journal");
    vi.stubGlobal("crypto",{randomUUID:()=> "12345678-1234-4234-8234-123456789abc"});
    render(<GeneralLedgerWorkspace />);
    const action=await screen.findByRole("button",{name:/إنشاء مسودة عكس/});
    fireEvent.click(action);
    expect(await screen.findByText("تم إنشاء مسودة عكس؛ لن يتغير الميزان حتى الترحيل.")).toBeInTheDocument();
    const reversalCall=mocks.rpc.mock.calls.find(([name])=>name==="reverse_general_journal_entry");
    expect(reversalCall?.[1]).toEqual({
      p_entry_id:"manual-journal-1",
      p_reason:"Documented correction for original journal",
      p_idempotency_key:"12345678-1234-4234-8234-123456789abc",
    });
    expect(mocks.rpc).toHaveBeenCalledWith("fetch_general_journal_reversal_links",{p_entry_ids:["manual-journal-1"]});
    await screen.findByText("لهذا القيد مسودة عكس أو عكس مرحّل؛ مُنع التكرار.");
    expect(screen.queryByRole("button",{name:/إنشاء مسودة عكس/})).not.toBeInTheDocument();
  });
  it("prints a tenant-scoped journal voucher through a body portal without internal identifiers", async () => {
    const entry = {
      id: "journal-internal-uuid",
      tenant_id: "tenant-internal-uuid",
      entry_number: "JV-2026-0042",
      entry_date: "2026-10-30",
      description: "تسوية مصروفات التشغيل",
      source_type: "manual",
      source_reference: "private-source-reference",
      status: "posted",
      created_at: "2026-10-30T10:00:00Z",
      posted_at: "2026-10-30T10:01:00Z",
      debit_total: "125.50",
      credit_total: "125.50",
      lines: [
        { line_number: 1, account_id: "expense-account-uuid", account_code: "5000", account_name: "مصروفات تشغيل", debit: "125.50", credit: "0.00", memo: "فاتورة تشغيل" },
        { line_number: 2, account_id: "cash-account-uuid", account_code: "1000", account_name: "النقدية", debit: "0.00", credit: "125.50", memo: null },
      ],
    };
    mocks.rpc.mockImplementation(async (name: string) => {
      if (name === "fetch_general_ledger") return { data: { ...payload, entries: [entry], entry_count: 1, has_more: false }, error: null };
      if (name === "fetch_general_journal_reversal_links") return { data: [], error: null };
      if (name === "fetch_cash_expense_accounting_inbox") return { data: { items: [], total_count: 0, has_more: false, limit: 50, offset: 0 }, error: null };
      return { data: payload, error: null };
    });
    const printSpy = vi.spyOn(window, "print").mockImplementation(() => undefined);
    render(<GeneralLedgerWorkspace />);
    const button = await screen.findByRole("button", { name: "طباعة القيد" });
    fireEvent.click(button);

    const sheet = await screen.findByTestId("general-ledger-print-document");
    expect(sheet.parentElement).toBe(document.body);
    expect(sheet).toHaveTextContent("JV-2026-0042");
    expect(sheet).toHaveTextContent("5000");
    expect(sheet).toHaveTextContent("125.50");
    for (const internal of ["journal-internal-uuid", "tenant-internal-uuid", "private-source-reference", "expense-account-uuid", "cash-account-uuid"]) {
      expect(sheet.textContent).not.toContain(internal);
    }
    await waitFor(() => expect(printSpy).toHaveBeenCalledTimes(1));
    expect(document.body.getAttribute("data-print-mode")).toBe("general-ledger");

    act(() => window.dispatchEvent(new Event("afterprint")));
    await waitFor(() => expect(screen.queryByTestId("general-ledger-print-document")).not.toBeInTheDocument());
    expect(document.body.getAttribute("data-print-mode")).toBeNull();
  });

  it("prints complete income and balance sheet statements only after the authorized ledger summary loads", async () => {
    mocks.rpc.mockImplementation(async (name: string) => {
      if (name === "fetch_general_journal_reversal_links") return { data: [], error: null };
      if (name === "fetch_cash_expense_accounting_inbox") return { data: { items: [], total_count: 0, has_more: false, limit: 50, offset: 0 }, error: null };
      return { data: payload, error: null };
    });
    const printSpy = vi.spyOn(window, "print").mockImplementation(() => undefined);
    render(<GeneralLedgerWorkspace />);
    const button = await screen.findByRole("button", { name: "طباعة القوائم المالية" });
    await waitFor(() => expect(button).toBeEnabled());
    fireEvent.click(button);

    const sheet = await screen.findByTestId("general-ledger-print-document");
    expect(sheet.parentElement).toBe(document.body);
    expect(sheet).toHaveTextContent("قائمة الدخل والمركز المالي");
    expect(sheet).toHaveTextContent("الإيرادات");
    expect(sheet).toHaveTextContent("رأس المال");
    expect(sheet).toHaveTextContent("900.00 ر.ي");
    expect(sheet.textContent).not.toContain("cash");
    expect(sheet.textContent).not.toContain("capital");
    await waitFor(() => expect(printSpy).toHaveBeenCalledTimes(1));

    act(() => window.dispatchEvent(new Event("afterprint")));
    await waitFor(() => expect(screen.queryByTestId("general-ledger-print-document")).not.toBeInTheDocument());
  });

});
