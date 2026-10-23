import { useState } from "react";
import { ClipboardCheck, FileCheck2, PackageCheck, X } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { CustomerReturnReviewQueue } from "@/components/CustomerReturnReviewQueue";
import { CustomerReturnReceiptQueue } from "@/components/CustomerReturnReceiptQueue";
import { CustomerReturnCreditMemoQueue } from "@/components/CustomerReturnCreditMemoQueue";

type Workflow = "orders" | "finance";
type ReturnTab = "review" | "receipt" | "credit";

const overlayStyle: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  zIndex: 1300,
  display: "flex",
  alignItems: "flex-start",
  justifyContent: "center",
  overflowY: "auto",
  boxSizing: "border-box",
  padding: 16,
  background: "rgba(18, 32, 38, 0.58)",
};
const dialogStyle: React.CSSProperties = {
  width: "min(1120px, 100%)",
  maxHeight: "calc(100vh - 32px)",
  overflowY: "auto",
  boxSizing: "border-box",
  border: "1px solid #dce7e8",
  borderRadius: 16,
  padding: 18,
  background: "var(--background, #f8fbfb)",
  boxShadow: "0 18px 70px rgba(0,0,0,.25)",
};
const launchStyle: React.CSSProperties = {
  position: "fixed",
  left: 18,
  bottom: 18,
  zIndex: 1200,
  display: "inline-flex",
  alignItems: "center",
  gap: 8,
  border: "1px solid #145c4a",
  borderRadius: 999,
  padding: "11px 15px",
  background: "#176b55",
  color: "#fff",
  boxShadow: "0 5px 20px rgba(13, 58, 48, .24)",
  font: "inherit",
  fontWeight: 750,
  cursor: "pointer",
};
const tabStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 7,
  border: "1px solid #ccdadd",
  borderRadius: 9,
  padding: "9px 12px",
  background: "#fff",
  color: "#24464a",
  font: "inherit",
  fontWeight: 700,
  cursor: "pointer",
};
const selectedTabStyle: React.CSSProperties = {
  ...tabStyle,
  borderColor: "#176b55",
  background: "#e8f4ef",
  color: "#145c4a",
};
const mutedStyle: React.CSSProperties = {
  margin: 0,
  color: "#64787c",
  fontSize: 13,
  lineHeight: 1.7,
};

export function CustomerReturnOperationsDrawer({ workflow }: { workflow: Workflow }) {
  const { user, ready } = useAuth();
  const [open, setOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<ReturnTab>(workflow === "finance" ? "credit" : "review");
  const [notice, setNotice] = useState("");

  const roles = user?.roles ?? [];
  const canReviewAndReceive = roles.some((role) => role === "admin" || role === "manager");
  const canManageFinance = roles.some((role) => role === "admin" || role === "manager" || role === "accountant");
  const permitted = workflow === "orders" ? canReviewAndReceive : canManageFinance;

  // Client gating is only a visibility control; the SECURITY DEFINER RPCs enforce roles and tenant scope.
  if (!ready || !user || !user.isStaff || !permitted) return null;

  const openWorkspace = () => {
    setNotice("");
    setActiveTab(workflow === "finance" ? "credit" : "review");
    setOpen(true);
  };

  return (
    <>
      <button
        type="button"
        style={launchStyle}
        onClick={openWorkspace}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={workflow === "finance" ? "إشعارات المرتجعات الدائنة" : "إدارة المرتجعات"}
      >
        {workflow === "finance" ? <FileCheck2 size={18} /> : <ClipboardCheck size={18} />}
        {workflow === "finance" ? "إشعارات المرتجعات الدائنة" : "إدارة المرتجعات"}
      </button>

      {open && (
        <div
          style={overlayStyle}
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setOpen(false);
          }}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-label={workflow === "finance" ? "مساحة إشعارات المرتجعات الدائنة" : "مساحة مراجعة واستلام المرتجعات"}
            dir="rtl"
            style={dialogStyle}
          >
            <header style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, marginBottom: 14 }}>
              <div>
                <h2 style={{ margin: 0, fontSize: 21 }}>
                  {workflow === "finance" ? "الإشعارات الدائنة للمرتجعات" : "مراجعة واستلام مرتجعات العملاء"}
                </h2>
                <p style={{ ...mutedStyle, marginTop: 5 }}>
                  {workflow === "finance"
                    ? "إنشاء الإشعار من الفاتورة الأصلية والكميات المستلمة فقط؛ الترحيل إجراء صريح بصلاحية المحاسبة."
                    : "راجع الطلب المعتمد، وثّق قرار المراجعة، ثم سجّل الاستلام الفعلي وفحص الكميات. لا يتغير المخزون أو الحساب بمجرد الموافقة."}
                </p>
              </div>
              <button
                type="button"
                style={tabStyle}
                onClick={() => setOpen(false)}
                aria-label="إغلاق إدارة المرتجعات"
              >
                <X size={17} />
                إغلاق
              </button>
            </header>

            <nav role="tablist" aria-label="خطوات المرتجع" style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 14 }}>
              {workflow === "orders" ? (
                <>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={activeTab === "review"}
                    style={activeTab === "review" ? selectedTabStyle : tabStyle}
                    onClick={() => { setNotice(""); setActiveTab("review"); }}
                  >
                    <ClipboardCheck size={16} />
                    مراجعة المرتجعات
                  </button>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={activeTab === "receipt"}
                    style={activeTab === "receipt" ? selectedTabStyle : tabStyle}
                    onClick={() => { setNotice(""); setActiveTab("receipt"); }}
                  >
                    <PackageCheck size={16} />
                    الاستلام والفحص
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  role="tab"
                  aria-selected={activeTab === "credit"}
                  style={activeTab === "credit" ? selectedTabStyle : tabStyle}
                  onClick={() => { setNotice(""); setActiveTab("credit"); }}
                >
                  <FileCheck2 size={16} />
                  الإشعارات الدائنة
                </button>
              )}
            </nav>

            {notice && (
              <div role="status" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10, padding: 10, marginBottom: 12, borderRadius: 9, background: "#edf6f1", color: "#145c4a" }}>
                <span>{notice}</span>
                <button type="button" aria-label="إغلاق التنبيه" onClick={() => setNotice("")} style={{ ...tabStyle, padding: "3px 7px" }}>
                  <X size={14} />
                </button>
              </div>
            )}

            <div role="tabpanel">
              {workflow === "orders" && activeTab === "review" && <CustomerReturnReviewQueue onNotice={setNotice} />}
              {workflow === "orders" && activeTab === "receipt" && <CustomerReturnReceiptQueue onNotice={setNotice} />}
              {workflow === "finance" && activeTab === "credit" && <CustomerReturnCreditMemoQueue onNotice={setNotice} />}
            </div>
          </section>
        </div>
      )}
    </>
  );
}
