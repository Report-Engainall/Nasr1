import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("@/lib/supabase", () => ({ supabase: { rpc: mocks.rpc } }));
import { canReadCustomerAppLedger, fetchCustomerFinancialSourceChangeHistory, fetchStaffCustomerFinancialSource, isSameCustomerFinancialSourceVersion, parseCustomerFinancialSource, requestCustomerFinancialSourceChange, revalidateMyCustomerFinancialSource } from "./customer-financial-source";
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

  it("rejects a source response belonging to a different customer", async () => {
    mocks.rpc.mockResolvedValue({
      data: {
        customer_id: "22222222-2222-4222-8222-222222222222",
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
    await expect(fetchStaffCustomerFinancialSource("11111111-1111-4111-8111-111111111111")).rejects.toThrow(/هوية العميل المحدد/);
  });

  it("does not authorize local payment entry for external or suspended sources", async () => {
    mocks.rpc.mockResolvedValue({
      data: {
        customer_id: "11111111-1111-4111-8111-111111111111",
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
    mocks.rpc.mockResolvedValue({
      data: {
        customer_id: "11111111-1111-4111-8111-111111111111",
        source_mode: "ONYX",
        source_status: "active",
        source_as_of: "2026-11-27T20:00:00Z",
        last_synced_at: "2026-11-27T20:05:00Z",
        verified_at: "2026-11-27T19:55:00Z",
        revision: 2,
        is_stale: false,
        external_account_ref: "ONYX-CUST-0001",
        company_external_ref: "ONYX-COMPANY-01",
        branch_external_ref: "ONYX-BRANCH-01",
      },
      error: null,
    });
    const source = await fetchStaffCustomerFinancialSource("11111111-1111-4111-8111-111111111111");
    expect(canReadCustomerAppLedger(source)).toBe(false);
    expect(source.external_account_ref).toBe("ONYX-CUST-0001");
    expect(source.company_external_ref).toBe("ONYX-COMPANY-01");
    expect(source.branch_external_ref).toBe("ONYX-BRANCH-01");
  });

  it("rejects unsafe or partial external identity scopes from the staff resolver", async () => {
    mocks.rpc.mockResolvedValue({
      data: {
        customer_id: "11111111-1111-4111-8111-111111111111",
        source_mode: "ONYX", source_status: "active",
        source_as_of: "2026-11-27T20:00:00Z", last_synced_at: "2026-11-27T20:05:00Z",
        verified_at: "2026-11-27T19:55:00Z", revision: 2, is_stale: false,
        external_account_ref: "ONYX-CUST-0001", company_external_ref: "https://erp.example/company",
        branch_external_ref: "ONYX-BRANCH-01",
      },
      error: null,
    });
    await expect(fetchStaffCustomerFinancialSource("11111111-1111-4111-8111-111111111111")).rejects.toThrow(/غير آمن/);
    mocks.rpc.mockResolvedValue({
      data: {
        customer_id: "11111111-1111-4111-8111-111111111111",
        source_mode: "ONYX", source_status: "active",
        source_as_of: "2026-11-27T20:00:00Z", last_synced_at: "2026-11-27T20:05:00Z",
        verified_at: "2026-11-27T19:55:00Z", revision: 2, is_stale: false,
        external_account_ref: "ONYX-CUST-0001",
      },
      error: null,
    });
    await expect(fetchStaffCustomerFinancialSource("11111111-1111-4111-8111-111111111111")).rejects.toThrow(/حساب العميل والشركة والفرع معًا/);
    mocks.rpc.mockResolvedValue({
      data: {
        customer_id: "11111111-1111-4111-8111-111111111111",
        source_mode: "ONYX", source_status: "active",
        source_as_of: "2026-11-27T20:00:00Z", last_synced_at: "2026-11-27T20:05:00Z",
        verified_at: "2026-11-27T19:55:00Z", revision: 2, is_stale: false,
        external_account_ref: "ONYX-CUST-0001", company_external_ref: "ONYX-COMPANY-01",
      },
      error: null,
    });
    await expect(fetchStaffCustomerFinancialSource("11111111-1111-4111-8111-111111111111")).rejects.toThrow(/الشركة والفرع معًا/);
  });

  it("fails closed when staff source lookup is unavailable", async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { message: "function missing" } });
    await expect(fetchStaffCustomerFinancialSource("11111111-1111-4111-8111-111111111111")).rejects.toThrow();
  });
});


describe("customer financial source snapshot binding", () => {
  it("accepts only the same monotonic revision and access semantics", () => {
    const first = parseCustomerFinancialSource(appOnly);
    expect(isSameCustomerFinancialSourceVersion(first, parseCustomerFinancialSource({ ...appOnly }))).toBe(true);
    expect(isSameCustomerFinancialSourceVersion(first, parseCustomerFinancialSource({ ...appOnly, revision: 2 }))).toBe(false);
    const external = parseCustomerFinancialSource({
      ...appOnly, source_mode: "ONYX", source_as_of: "2026-11-28T00:00:00Z",
      can_read_app_ledger: false, revision: 2,
    });
    expect(isSameCustomerFinancialSourceVersion(first, external)).toBe(false);
  });
});

describe("customer financial source export revalidation", () => {
  beforeEach(() => mocks.rpc.mockReset());

  it("permits an export only when the server returns the exact same active APP_ONLY revision", async () => {
    mocks.rpc.mockResolvedValue({ data: { ...appOnly }, error: null });
    const result = await revalidateMyCustomerFinancialSource(parseCustomerFinancialSource(appOnly));
    expect(mocks.rpc).toHaveBeenCalledWith("get_my_customer_financial_source");
    expect(result.unchanged).toBe(true);
    expect(result.source.revision).toBe(1);
  });

  it("blocks export after the server moves the account to ONYX", async () => {
    mocks.rpc.mockResolvedValue({
      data: {
        ...appOnly, source_mode: "ONYX", source_as_of: "2026-11-28T00:00:00Z",
        last_synced_at: "2026-11-28T00:00:00Z", verified_at: "2026-11-28T00:00:00Z",
        revision: 2, can_read_app_ledger: false,
      },
      error: null,
    });
    const result = await revalidateMyCustomerFinancialSource(parseCustomerFinancialSource(appOnly));
    expect(result.unchanged).toBe(false);
    expect(result.source.source_mode).toBe("ONYX");
  });

  it("blocks export when the source resolver becomes unavailable", async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { message: "resolver unavailable" } });
    await expect(revalidateMyCustomerFinancialSource(parseCustomerFinancialSource(appOnly))).rejects.toThrow();
  });
});


describe("customer financial source change requests", () => {
  beforeEach(() => mocks.rpc.mockReset());

  const customerId = "11111111-1111-4111-8111-111111111111";
  const idempotencyKey = "customer360_12345678901234567890";

  it("submits a scoped Onyx cutover request with exact revision and all three ERP identities", async () => {
    const requestId = "33333333-3333-4333-8333-333333333333";
    mocks.rpc.mockResolvedValue({
      data: { request_id: requestId, status: "pending_reconciliation", replayed: false, target_source_mode: "ONYX" },
      error: null,
    });
    const result = await requestCustomerFinancialSourceChange({
      customerId,
      targetSourceMode: "ONYX",
      externalAccountRef: "ONYX-CUST-0001",
      companyExternalRef: "ONYX-COMPANY-01",
      branchExternalRef: "ONYX-BRANCH-01",
      reason: "توحيد حساب العميل مع سجل Onyx Pro",
      idempotencyKey,
      expectedBindingRevision: 4,
    });
    expect(mocks.rpc).toHaveBeenCalledWith("request_customer_financial_source_change", {
      p_customer_id: customerId,
      p_target_source_mode: "ONYX",
      p_target_external_account_ref: "ONYX-CUST-0001",
      p_reason: "توحيد حساب العميل مع سجل Onyx Pro",
      p_idempotency_key: idempotencyKey,
      p_expected_binding_revision: 4,
      p_target_company_external_ref: "ONYX-COMPANY-01",
      p_target_branch_external_ref: "ONYX-BRANCH-01",
    });
    expect(result).toEqual({
      request_id: requestId,
      status: "pending_reconciliation",
      replayed: false,
      changed: true,
    });
  });

  it("sends APP_ONLY requests without ERP identity references", async () => {
    mocks.rpc.mockResolvedValue({
      data: { request_id: "44444444-4444-4444-8444-444444444444", status: "pending_reconciliation", replayed: false },
      error: null,
    });
    const result = await requestCustomerFinancialSourceChange({
      customerId,
      targetSourceMode: "APP_ONLY",
      externalAccountRef: null,
      companyExternalRef: null,
      branchExternalRef: null,
      reason: "إعادة الدفتر الداخلي بعد اكتمال المطابقة",
      idempotencyKey,
      expectedBindingRevision: 8,
    });
    expect(mocks.rpc).toHaveBeenCalledWith("request_customer_financial_source_change", expect.objectContaining({
      p_target_source_mode: "APP_ONLY",
      p_target_external_account_ref: null,
      p_target_company_external_ref: null,
      p_target_branch_external_ref: null,
    }));
    expect(result.changed).toBe(true);
  });

  it("rejects missing or unsafe ERP identity before issuing the RPC", async () => {
    await expect(requestCustomerFinancialSourceChange({
      customerId, targetSourceMode: "MUTAKAMEL", externalAccountRef: "MUT-C-1",
      companyExternalRef: "https://invalid.example", branchExternalRef: "MUT-B-1",
      reason: "ربط الحساب مع نظام المتكامل", idempotencyKey, expectedBindingRevision: 1,
    })).rejects.toThrow(/غير آمن/);
    await expect(requestCustomerFinancialSourceChange({
      customerId, targetSourceMode: "ONYX", externalAccountRef: "ONYX-C-1",
      companyExternalRef: "ONYX-CO-1", reason: "ربط الحساب مع Onyx Pro",
      idempotencyKey, expectedBindingRevision: 1,
    })).rejects.toThrow(/الشركة والفرع/);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("rejects stale or incomplete request metadata and malformed server responses", async () => {
    await expect(requestCustomerFinancialSourceChange({
      customerId, targetSourceMode: "APP_ONLY", reason: "رجوع",
      idempotencyKey, expectedBindingRevision: 0,
    })).rejects.toThrow(/غير مكتملة/);
    mocks.rpc.mockResolvedValue({ data: { request_id: "not-a-uuid", status: "pending_reconciliation", replayed: false }, error: null });
    await expect(requestCustomerFinancialSourceChange({
      customerId, targetSourceMode: "APP_ONLY", reason: "إعادة الدفتر الداخلي",
      idempotencyKey, expectedBindingRevision: 2,
    })).rejects.toThrow(/حالة موثوقة/);
  });

  it("does not report success when the server rejects a request", async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { message: "permission denied" } });
    await expect(requestCustomerFinancialSourceChange({
      customerId, targetSourceMode: "APP_ONLY", reason: "إعادة الدفتر الداخلي",
      idempotencyKey, expectedBindingRevision: 2,
    })).rejects.toThrow(/تعذر إنشاء طلب تغيير/);
  });
});


describe("customer financial source-change history", () => {
  beforeEach(() => mocks.rpc.mockReset());
  const customerId = "11111111-1111-4111-8111-111111111111";
  const record = {
    request_id: "55555555-5555-4555-8555-555555555555",
    current_source_mode: "APP_ONLY",
    target_source_mode: "ONYX",
    status: "approved",
    reason: "توحيد الحساب مع سجل Onyx Pro",
    review_reason: "تمت مطابقة الأرصدة واعتماد التحويل",
    expected_binding_revision: 3,
    requested_at: "2026-11-28T00:00:00Z",
    reviewed_at: "2026-11-28T00:20:00Z",
    reconciliation_result: "matched",
    reconciliation_source_as_of: "2026-11-28T00:15:00Z",
    reconciliation_currency_codes: ["YER", "USD"],
    reconciliation_record_counts: { invoices: 4, payments: 3, statement_entries: 7 },
  };
  it("loads bounded history for the selected customer", async () => {
    mocks.rpc.mockResolvedValue({ data: { records: [record], total: 1, limit: 10 }, error: null });
    const history = await fetchCustomerFinancialSourceChangeHistory(customerId);
    expect(mocks.rpc).toHaveBeenCalledWith("get_customer_financial_source_change_history", {
      p_customer_id: customerId, p_limit: 10,
    });
    expect(history.records[0]).toMatchObject({
      request_id: record.request_id, status: "approved", reconciliation_result: "matched",
      reconciliation_currency_codes: ["YER", "USD"],
    });
  });
  it("drops unexpected raw ERP reference fields from the allowlisted DTO", async () => {
    mocks.rpc.mockResolvedValue({
      data: { records: [{ ...record, target_external_account_ref: "ERP-ACCOUNT-RAW" }], total: 1, limit: 10 },
      error: null,
    });
    const history = await fetchCustomerFinancialSourceChangeHistory(customerId);
    expect(JSON.stringify(history)).not.toContain("ERP-ACCOUNT-RAW");
  });
  it("rejects malformed history rows and unbounded server output", async () => {
    mocks.rpc.mockResolvedValue({ data: { records: [{ ...record, status: "unknown" }], total: 1, limit: 10 }, error: null });
    await expect(fetchCustomerFinancialSourceChangeHistory(customerId)).rejects.toThrow();
    mocks.rpc.mockResolvedValue({ data: { records: Array.from({ length: 21 }, () => record), total: 21, limit: 21 }, error: null });
    await expect(fetchCustomerFinancialSourceChangeHistory(customerId)).rejects.toThrow();
  });
  it("fails closed when the history resolver rejects access", async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { message: "permission denied" } });
    await expect(fetchCustomerFinancialSourceChangeHistory(customerId)).rejects.toThrow(/تعذر تحميل سجل تغييرات/);
  });
});
