import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
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
    mocks.rpc.mockImplementation(async (name: string) => {
      if (name === "fetch_general_ledger") return {data:{...payload,entries:[entry],entry_count:1,has_more:false},error:null};
      if (name === "fetch_general_journal_reversal_links") return {data:reversalLinks,error:null};
      if (name === "reverse_general_journal_entry") {
        reversalLinks=[{original_journal_entry_id:"manual-journal-1",reversal_journal_entry_id:"reversal-journal-1"}];
        return {data:{original_journal_entry_id:"manual-journal-1",reversal_journal_entry_id:"reversal-journal-1",entry_number:"124",status:"draft",replayed:false},error:null};
      }
      if (name === "fetch_cash_expense_accounting_inbox") return {data:{items:[],total_count:0,has_more:false,limit:50,offset:0},error:null};
      return {data:payload,error:null};
    });
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
});
