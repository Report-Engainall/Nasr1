import { lazy, Suspense, useCallback, useEffect, useState } from "react";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/lib/supabase";

type SupplierFinanceTab = "payments" | "invoice-capture" | "invoice-review" | "activity";
type SupplierFinanceAccountType = "asset" | "liability" | "equity" | "revenue" | "expense";

export interface SupplierFinanceLedgerAccount {
  id: string;
  code: string;
  name: string;
  account_type: SupplierFinanceAccountType;
  is_active: boolean;
}

const PaymentWorkspace = lazy(async () => ({
  default: (await import("@/components/SupplierPaymentWorkspace")).SupplierPaymentWorkspace,
}));
const InvoiceWorkspace = lazy(async () => ({
  default: (await import("@/components/SupplierInvoiceWorkspace")).SupplierInvoiceWorkspace,
}));
const AccountActivityWorkspace = lazy(async () => ({
  default: (await import("@/components/SupplierAccountActivityWorkspace")).SupplierAccountActivityWorkspace,
}));

const tabs: Array<{ id: SupplierFinanceTab; label: string; description: string }> = [
  { id: "payments", label: "المدفوعات والتسويات", description: "سندات السداد والتخصيصات وأدلة المطابقة وتسليم مسودة القيد." },
  { id: "invoice-capture", label: "إدخال فواتير الموردين", description: "مطابقة الفاتورة مع أمر الشراء وإيصال الاستلام الفعلي." },
  { id: "invoice-review", label: "مراجعة فروقات الأسعار", description: "قرار مالي مستقل بأسباب موثقة، مع بقاء الضريبة غير الصفرية معلقة." },
  { id: "activity", label: "كشف حساب المورد", description: "الحركات المرحلة والدفعات المحجوزة والمستحقات بحسب العملة." },
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Parse only the same finance-authorized account projection used by the General Ledger workspace. */
export function parseSupplierFinanceLedgerAccounts(value: unknown): SupplierFinanceLedgerAccount[] {
  if (!isRecord(value) || !Array.isArray(value.accounts)) {
    throw new Error("استجابة دليل الحسابات من دفتر الأستاذ غير صالحة.");
  }
  const seen = new Set<string>();
  return value.accounts.map((candidate) => {
    if (!isRecord(candidate) ||
        typeof candidate.id !== "string" || !candidate.id.trim() ||
        typeof candidate.code !== "string" || !candidate.code.trim() ||
        typeof candidate.name !== "string" || !candidate.name.trim() ||
        !["asset", "liability", "equity", "revenue", "expense"].includes(String(candidate.account_type)) ||
        typeof candidate.is_active !== "boolean") {
      throw new Error("تعذر التحقق من حساب في دليل الأستاذ؛ أوقف ربط حسابات التسوية.");
    }
    if (seen.has(candidate.id)) throw new Error("أعاد دفتر الأستاذ حسابًا مكررًا؛ أوقف ربط حسابات التسوية.");
    seen.add(candidate.id);
    return {
      id: candidate.id,
      code: candidate.code,
      name: candidate.name,
      account_type: candidate.account_type as SupplierFinanceAccountType,
      is_active: candidate.is_active,
    };
  });
}

export function SupplierFinancialWorkspaceHub() {
  const { user, ready } = useAuth();
  const canManageFinance = Boolean(user?.roles.some((role) =>
    role === "admin" || role === "manager" || role === "accountant"
  ));
  const [tab, setTab] = useState<SupplierFinanceTab>("payments");
  const [accounts, setAccounts] = useState<SupplierFinanceLedgerAccount[]>([]);
  const [accountsLoading, setAccountsLoading] = useState(false);
  const [accountsError, setAccountsError] = useState("");
  const [activityRefreshKey, setActivityRefreshKey] = useState(0);

  const loadAccounts = useCallback(async () => {
    if (!ready || !canManageFinance) return;
    setAccountsLoading(true);
    setAccountsError("");
    try {
      // This is the same tenant-scoped and finance-authorized source used by GeneralLedgerWorkspace.
      // A one-row journal page still returns the complete chart-of-accounts projection.
      const { data, error } = await supabase.rpc("fetch_general_ledger", {
        p_from: null,
        p_to: null,
        p_account_id: null,
        p_limit: 1,
        p_offset: 0,
      });
      if (error) throw error;
      setAccounts(parseSupplierFinanceLedgerAccounts(data));
    } catch (cause) {
      setAccounts([]);
      setAccountsError(cause instanceof Error
        ? cause.message
        : "تعذر تحميل دليل الحسابات من دفتر الأستاذ. لا يمكن ربط صندوق أو بنك دون حساب موثّق.");
    } finally {
      setAccountsLoading(false);
    }
  }, [ready, canManageFinance]);

  useEffect(() => {
    if (!ready) return;
    if (!canManageFinance) {
      setAccounts([]);
      setAccountsLoading(false);
      setAccountsError("");
      return;
    }
    void loadAccounts();
  }, [ready, canManageFinance, loadAccounts]);

  const refreshFinanceViews = useCallback(async () => {
    await loadAccounts();
    setActivityRefreshKey((current) => current + 1);
  }, [loadAccounts]);

  if (!ready) {
    return <p role="status" style={{ marginBlock: 16, color: "var(--muted-foreground, #64748b)" }}>جار التحقق من صلاحية المساحات المالية للموردين...</p>;
  }
  if (!canManageFinance) {
    return <p role="note" style={{ marginBlock: 16, color: "var(--muted-foreground, #64748b)" }}>مساحات السداد والفواتير وكشف حساب المورد مخصصة للأدوار المالية المخوّلة.</p>;
  }

  return (
    <section dir="rtl" aria-label="مساحات الموردين المالية" style={{ display: "grid", gap: 12, marginBlock: 22, minWidth: 0 }}>
      <header style={{ display: "grid", gap: 5 }}>
        <h2 style={{ margin: 0, fontSize: 19 }}>عمليات الموردين المالية</h2>
        <p style={{ margin: 0, color: "var(--muted-foreground, #64748b)", lineHeight: 1.8 }}>
          نقطة وصول موحدة إلى مساحات السداد والمطابقة وكشف الأستاذ القائمة. البيانات والموافقات تبقى خاضعة لخدمات الخادم وصلاحيات المؤسسة.
        </p>
      </header>

      <div role="tablist" aria-label="مساحات العمل المالية للموردين" style={{ display: "flex", flexWrap: "wrap", gap: 7 }}>
        {tabs.map((item) => (
          <button
            key={item.id}
            id={"supplier-finance-tab-" + item.id}
            type="button"
            role="tab"
            aria-selected={tab === item.id}
            aria-controls="supplier-finance-panel"
            tabIndex={tab === item.id ? 0 : -1}
            className={tab === item.id ? "btn primary" : "btn outline"}
            onClick={() => setTab(item.id)}
          >
            {item.label}
          </button>
        ))}
      </div>

      <p role="status" aria-live="polite" style={{ margin: 0, color: "var(--muted-foreground, #64748b)", fontSize: 13 }}>
        {tabs.find((item) => item.id === tab)?.description}
      </p>
      {accountsLoading && <p role="status" style={{ margin: 0, fontSize: 13 }}>جار تحميل دليل الحسابات النشط من دفتر الأستاذ...</p>}
      {accountsError && <p role="alert" style={{ margin: 0, color: "#991b1b", fontSize: 13 }}>{accountsError} لا تُعرض حسابات افتراضية ولا تُنشأ أرصدة تلقائيًا.</p>}

      <div id="supplier-finance-panel" role="tabpanel" aria-labelledby={"supplier-finance-tab-" + tab} style={{ minWidth: 0 }}>
        <Suspense fallback={<p role="status" style={{ color: "var(--muted-foreground, #64748b)" }}>جار تحميل مساحة العمل...</p>}>
          {tab === "payments" && <PaymentWorkspace accounts={accounts} onRefresh={refreshFinanceViews} />}
          {tab === "invoice-capture" && <InvoiceWorkspace mode="capture" accounts={accounts} onRefresh={refreshFinanceViews} />}
          {tab === "invoice-review" && <InvoiceWorkspace mode="review" accounts={accounts} onRefresh={refreshFinanceViews} />}
          {tab === "activity" && <AccountActivityWorkspace refreshKey={activityRefreshKey} />}
        </Suspense>
      </div>
    </section>
  );
}
