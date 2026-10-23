import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { Copy, Link2, Mail, RefreshCw, ShieldCheck, UserPlus, UserX, X } from "lucide-react";
import {
  createCustomerActivationInvitation,
  fetchCustomerActivationWorkspace,
  revokeCustomerActivationInvitation,
  type CustomerActivationInvitation,
  type CustomerActivationWorkspace,
} from "@/lib/customer-activation-invitations";

export type CustomerActivationCandidate = {
  id: string;
  business_name: string;
  status: string;
  email?: string | null;
  profile_id?: string | null;
  customer_code?: string | null;
};

const statusLabels = {
  pending: "بانتظار التفعيل",
  accepted: "تم التفعيل",
  revoked: "ملغاة",
  expired: "منتهية",
} satisfies Record<CustomerActivationInvitation["status"], string>;

const dateLabel = (value: string) =>
  new Date(value).toLocaleString("ar-YE", { dateStyle: "medium", timeStyle: "short" });

export function CustomerActivationInvitationDialog({
  customer,
  onClose,
}: {
  customer: CustomerActivationCandidate;
  onClose: () => void;
}) {
  const [workspace, setWorkspace] = useState<CustomerActivationWorkspace | null>(null);
  const [email, setEmail] = useState(customer.email?.trim() ?? "");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [inviteUrl, setInviteUrl] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const createInFlightRef = useRef(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setWorkspace(await fetchCustomerActivationWorkspace(customer.id));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "تعذر تحميل سجل الدعوات.");
    } finally {
      setLoading(false);
    }
  }, [customer.id]);

  useEffect(() => { void load(); }, [load]);

  async function createInvite(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (createInFlightRef.current || busy || loading || workspace?.is_linked) return;
    createInFlightRef.current = true;
    setBusy(true);
    setError("");
    setNotice("");
    setInviteUrl("");
    try {
      const invitation = await createCustomerActivationInvitation(customer.id, email, 72);
      setInviteUrl(invitation.url);
      setNotice("أنشأ الخادم رابط تفعيل لمرة واحدة حتى " + dateLabel(invitation.expires_at) + ". لم يُرسل بريد تلقائيًا؛ شارك الرابط يدويًا.");
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "تعذر إنشاء رابط التفعيل.");
    } finally {
      createInFlightRef.current = false;
      setBusy(false);
    }
  }

  async function copyInviteLink() {
    if (!inviteUrl) return;
    try {
      await navigator.clipboard.writeText(inviteUrl);
      setNotice("تم نسخ رابط التفعيل إلى الحافظة.");
    } catch {
      setError("تعذر النسخ التلقائي. حدّد الرابط الظاهر وانسخه يدويًا.");
    }
  }

  async function revoke(invitation: CustomerActivationInvitation) {
    if (busy || !window.confirm("إلغاء رابط التفعيل المعلق إلى " + invitation.invited_email + "؟")) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await revokeCustomerActivationInvitation(invitation.invitation_id);
      setNotice("أُلغي رابط التفعيل في الخادم.");
      setInviteUrl("");
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "تعذر إلغاء رابط التفعيل.");
    } finally {
      setBusy(false);
    }
  }

  const canInvite = customer.status === "approved" && workspace !== null && !workspace.is_linked && !error;

  return (
    <div
      role="presentation"
      onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) onClose(); }}
      style={{ position: "fixed", inset: 0, zIndex: 10000, display: "grid", placeItems: "center", padding: 14, background: "rgba(15,23,42,.55)" }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="customer-activation-title"
        dir="rtl"
        style={{ width: "min(760px, 100%)", maxHeight: "min(88vh, 900px)", overflow: "auto", background: "var(--card, #fff)", color: "var(--foreground, #152b2b)", border: "1px solid var(--border, #d9e3e2)", borderRadius: 16, boxShadow: "0 24px 80px rgba(0,0,0,.26)", padding: 22 }}
      >
        <header style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 14, marginBottom: 18 }}>
          <div>
            <p style={{ margin: "0 0 6px", color: "var(--muted-foreground, #61736f)", fontSize: 12 }}>إدارة العملاء / تفعيل الحساب</p>
            <h2 id="customer-activation-title" style={{ margin: 0, fontSize: 23 }}>دعوة العميل للدخول</h2>
            <p style={{ margin: "7px 0 0", color: "var(--muted-foreground, #61736f)" }}>{customer.business_name}{customer.customer_code ? " · " + customer.customer_code : ""}</p>
          </div>
          <button type="button" onClick={onClose} disabled={busy} aria-label="إغلاق نافذة دعوة التفعيل" style={{ border: "1px solid var(--border, #d5e1df)", borderRadius: 9, padding: 8, background: "transparent", cursor: "pointer" }}><X size={18} /></button>
        </header>

        <div style={{ display: "flex", gap: 10, alignItems: "flex-start", padding: 13, border: "1px solid #d8e5e1", borderRadius: 12, background: "rgba(8,127,141,.055)", marginBottom: 14 }}>
          <ShieldCheck size={20} style={{ flexShrink: 0, marginTop: 1 }} />
          <p style={{ margin: 0, fontSize: 13, lineHeight: 1.7 }}>لا يُربط الحساب بملف العميل إلا بعد تسجيل الدخول أو إنشاء الحساب بالبريد المطابق، وتأكيد البريد، وقبول الرابط مرة واحدة. الرابط سري؛ شاركه مع العميل فقط. لا يتم إرسال بريد تلقائي.</p>
        </div>

        {error && <div role="alert" style={{ padding: 11, borderRadius: 9, border: "1px solid #e8b5b5", color: "#922b2b", marginBottom: 12 }}>{error}</div>}
        {notice && <div role="status" style={{ padding: 11, borderRadius: 9, border: "1px solid #c7dfd2", color: "#17684d", marginBottom: 12 }}>{notice}</div>}

        {loading ? (
          <p role="status" style={{ display: "flex", alignItems: "center", gap: 8 }}><RefreshCw size={16} /> جارٍ تحميل سجل دعوات العميل...</p>
        ) : !workspace ? (
          <div role="alert" style={{ padding: 14, border: "1px solid #e8b5b5", borderRadius: 11 }}>
            تعذر التحقق من حالة ربط حساب العميل. لن يُسمح بإنشاء دعوة حتى يُحمّل سجل الدعوات بنجاح.
            <button type="button" onClick={() => void load()} disabled={loading || busy} style={{ display: "inline-flex", alignItems: "center", gap: 6, marginInlineStart: 10, border: "1px solid var(--border, #d5e1df)", borderRadius: 8, padding: "7px 9px", background: "transparent", cursor: "pointer" }}>
              <RefreshCw size={14} /> إعادة المحاولة
            </button>
          </div>
        ) : workspace.is_linked ? (
          <div role="status" style={{ padding: 14, border: "1px solid #b8d8c8", borderRadius: 11 }}>هذا السجل مرتبط بالفعل بحساب مستخدم. لا يمكن إنشاء دعوة تفعيل ثانية.</div>
        ) : (
          <form onSubmit={createInvite} style={{ display: "grid", gap: 12, padding: 16, border: "1px solid var(--border, #d9e3e2)", borderRadius: 12 }}>
            <h3 style={{ display: "flex", alignItems: "center", gap: 8, margin: 0, fontSize: 17 }}><UserPlus size={18} /> إنشاء رابط جديد</h3>
            {customer.status !== "approved" && <p style={{ margin: 0, color: "#9a6414" }}>اعتمد سجل العميل أولًا؛ التفعيل متاح للعملاء المعتمدين فقط.</p>}
            <label style={{ display: "grid", gap: 6, fontSize: 13, fontWeight: 700 }}>
              البريد الإلكتروني للعميل
              <span style={{ position: "relative", display: "block" }}>
                <Mail size={16} style={{ position: "absolute", right: 11, top: 12, color: "#627774" }} />
                <input
                  type="email"
                  autoComplete="email"
                  required
                  maxLength={254}
                  dir="ltr"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  readOnly={Boolean(customer.email?.trim())}
                  style={{ width: "100%", boxSizing: "border-box", border: "1px solid var(--border, #cbd8d6)", borderRadius: 9, padding: "10px 35px 10px 11px", background: customer.email?.trim() ? "var(--muted, #f6f8f7)" : "var(--background, #fff)", font: "inherit" }}
                />
              </span>
              {customer.email?.trim()
                ? <small style={{ color: "var(--muted-foreground, #61736f)", fontWeight: 400 }}>يلزم استخدام البريد المحفوظ في سجل العميل؛ لا يُسمح بتغييره من نافذة الدعوة.</small>
                : <small style={{ color: "var(--muted-foreground, #61736f)", fontWeight: 400 }}>سيتم حفظ البريد عند قبول الدعوة فقط، بعد مطابقته مع جلسة المستخدم المؤكدة.</small>}
            </label>
            <div style={{ display: "flex", justifyContent: "flex-end" }}>
              <button type="submit" disabled={busy || loading || !canInvite || !email.trim()} style={{ border: 0, borderRadius: 9, padding: "11px 15px", fontWeight: 800, display: "inline-flex", alignItems: "center", gap: 7, cursor: busy || !canInvite ? "not-allowed" : "pointer", background: "#087f8d", color: "#fff", opacity: busy || !canInvite ? .55 : 1 }}>
                <Link2 size={16} /> {busy ? "جارٍ المعالجة..." : "إنشاء رابط تفعيل صالح 72 ساعة"}
              </button>
            </div>
            {inviteUrl && <div style={{ display: "grid", gap: 9, marginTop: 5 }}>
              <label style={{ display: "grid", gap: 6, fontSize: 13, fontWeight: 700 }}>رابط التفعيل — انسخه وشاركه يدويًا
                <input readOnly value={inviteUrl} dir="ltr" onFocus={(event) => event.currentTarget.select()} style={{ width: "100%", boxSizing: "border-box", border: "1px solid var(--border, #cbd8d6)", borderRadius: 9, padding: 11, background: "var(--background, #fff)", font: "inherit" }} />
              </label>
              <div><button type="button" onClick={() => void copyInviteLink()} style={{ border: "1px solid var(--border, #d5e1df)", borderRadius: 9, padding: "9px 12px", background: "var(--muted, #f6f8f7)", cursor: "pointer", display: "inline-flex", gap: 7, alignItems: "center" }}><Copy size={16} /> نسخ الرابط</button></div>
            </div>}
          </form>
        )}

        <section style={{ marginTop: 17, padding: 16, border: "1px solid var(--border, #d9e3e2)", borderRadius: 12 }}>
          <header style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 10 }}>
            <h3 style={{ margin: 0, fontSize: 17 }}>سجل الدعوات</h3>
            <button type="button" onClick={() => void load()} disabled={loading || busy} style={{ border: "1px solid var(--border, #d5e1df)", borderRadius: 8, padding: "7px 9px", background: "transparent", display: "inline-flex", alignItems: "center", gap: 6, cursor: "pointer" }}><RefreshCw size={14} /> تحديث</button>
          </header>
          {!workspace?.invitations.length ? <p style={{ margin: 0, color: "var(--muted-foreground, #61736f)" }}>لا توجد دعوات محفوظة لهذا السجل.</p> : (
            <div style={{ display: "grid", gap: 9 }}>
              {workspace.invitations.map((invitation) => (
                <article key={invitation.invitation_id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap", borderTop: "1px solid var(--border, #e6ecea)", paddingTop: 10 }}>
                  <div>
                    <strong dir="ltr" style={{ display: "block", overflowWrap: "anywhere" }}>{invitation.invited_email}</strong>
                    <p style={{ margin: "4px 0", fontSize: 13 }}>{statusLabels[invitation.status]}</p>
                    <small style={{ color: "var(--muted-foreground, #61736f)" }}>تنتهي: {dateLabel(invitation.expires_at)}</small>
                  </div>
                  {invitation.status === "pending" && Date.parse(invitation.expires_at) > Date.now() && (
                    <button type="button" onClick={() => void revoke(invitation)} disabled={busy} style={{ border: 0, borderRadius: 8, padding: "8px 10px", background: "#fff0f0", color: "#922b2b", cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 7 }}><UserX size={15} /> إلغاء الدعوة</button>
                  )}
                </article>
              ))}
            </div>
          )}
        </section>
        <p style={{ fontSize: 12, lineHeight: 1.7, color: "var(--muted-foreground, #61736f)", margin: "13px 0 0" }}>ضوابط الخادم: عزل المؤسسة، موافقة العميل، تحقق البريد المؤكد، صلاحية محدودة، تخزين بصمة الرمز فقط، سجل تدقيق، ومنع إعادة الربط. لا يمكن للرابط تغيير الأسعار أو حالة العميل أو أي صلاحية تشغيلية.</p>
      </section>
    </div>
  );
}
