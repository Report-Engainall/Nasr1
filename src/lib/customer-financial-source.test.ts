import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("@/lib/supabase", () => ({ supabase: { rpc: mocks.rpc } }));
import { canReadCustomerAppLedger, fetchStaffCustomerFinancialSource, parseCustomerFinancialSource } from "./customer-financial-source";
const appOnly = { source_mode:"APP_ONLY", source_status:"active", source_as_of:null, last_synced_at:null, verified_at:null, revision:1, is_stale:false, can_read_app_ledger:true };
describe("customer financial source contract", () => {
  it("allows the app ledger only when the server confirms APP_ONLY and active status", () => {
    const source=parseCustomerFinancialSource(appOnly);
    expect(source.source_mode).toBe("APP_ONLY");
    expect(canReadCustomerAppLedger(source)).toBe(true);
  });
  it("accepts ONYX metadata without granting access to the app ledger", () => {
    const source=parseCustomerFinancialSource({...appOnly,source_mode:"ONYX",source_as_of:"2026-11-27T20:00:00.000Z",last_synced_at:"2026-11-27T20:05:00+00:00",verified_at:"2026-11-27T19:55:00Z",can_read_app_ledger:false});
    expect(source.source_mode).toBe("ONYX");
    expect(canReadCustomerAppLedger(source)).toBe(false);
  });
  it("accepts a stale MUTAKAMEL snapshot but keeps app-ledger access closed", () => {
    const source=parseCustomerFinancialSource({...appOnly,source_mode:"MUTAKAMEL",source_as_of:"2026-11-25T20:00:00Z",last_synced_at:"2026-11-25T20:05:00Z",is_stale:true,can_read_app_ledger:false});
    expect(source.is_stale).toBe(true);
    expect(canReadCustomerAppLedger(source)).toBe(false);
  });
  it("rejects unknown source modes and malformed authorization fields", () => {
    expect(()=>parseCustomerFinancialSource({...appOnly,source_mode:"OTHER"})).toThrow();
    expect(()=>parseCustomerFinancialSource({...appOnly,can_read_app_ledger:false})).toThrow();
    expect(()=>parseCustomerFinancialSource({...appOnly,source_status:"suspended"})).toThrow();
  });
  it("rejects impossible dates and timezone offsets beyond ISO limits", () => {
    for (const source_as_of of ["2026-02-30T20:00:00Z","2025-02-29T20:00:00Z","2026-11-27T20:00:00+14:01","2026-11-27T20:00:00-14:01","2026-11-27T20:00:00+14:59","2026-11-27T24:00:00Z"]) {
      expect(()=>parseCustomerFinancialSource({...appOnly,source_mode:"ONYX",source_as_of,can_read_app_ledger:false})).toThrow();
    }
  });
  it("accepts a valid leap day and the exact ISO fourteen-hour offset boundary", () => {
    const source=parseCustomerFinancialSource({...appOnly,source_mode:"ONYX",source_as_of:"2024-02-29T20:00:00+14:00",can_read_app_ledger:false});
    expect(source.source_as_of).toBe("2024-02-29T20:00:00+14:00");
  });
  it("requires an as-of timestamp for every external financial source", () => {
    expect(()=>parseCustomerFinancialSource({...appOnly,source_mode:"MUTAKAMEL",can_read_app_ledger:false})).toThrow();
  });
});


describe("staff customer financial source lookup", () => {
  beforeEach(() => mocks.rpc.mockReset());

  it("loads the server-selected source for the selected invoice customer", async () => {
    const customerId = "11111111-1111-4111-8111-111111111111";
    mocks.rpc.mockResolvedValue({
      data: {
        customer_id: customerId,
        source_mode: "APP_ONLY",
        source_status: "active",
        source_as_of: null,
        last_synced_at: null,
        verified_at: null,
        revision: 1,
        is_stale: false,
      },
      error: null,
    });
    const source = await fetchStaffCustomerFinancialSource(customerId);
    expect(mocks.rpc).toHaveBeenCalledWith("get_customer_financial_source_for_staff", {
      p_customer_id: customerId,
    });
    expect(canReadCustomerAppLedger(source)).toBe(true);
  });

  it("does not authorize local payment entry for external or suspended sources", async () => {
    mocks.rpc.mockResolvedValue({
      data: {
        source_mode: "ONYX",
        source_status: "active",
        source_as_of: "2026-11-27T20:00:00Z",
        last_synced_at: "2026-11-27T20:05:00Z",
        verified_at: "2026-11-27T19:55:00Z",
        revision: 2,
        is_stale: false,
      },
      error: null,
    });
    const source = await fetchStaffCustomerFinancialSource("11111111-1111-4111-8111-111111111111");
    expect(canReadCustomerAppLedger(source)).toBe(false);
  });

  it("fails closed when staff source lookup is unavailable", async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { message: "function missing" } });
    await expect(fetchStaffCustomerFinancialSource("11111111-1111-4111-8111-111111111111")).rejects.toThrow();
  });
});
