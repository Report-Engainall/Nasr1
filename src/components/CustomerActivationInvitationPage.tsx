import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { CheckCircle2, Link2, ShieldCheck, UserRound } from "lucide-react";
import { Login } from "@/components/Login";
import { acceptCustomerActivationInvitation } from "@/lib/customer-activation-invitations";
import { useAuth } from "@/lib/auth";

const TOKEN_PATTERN = /^[0-9a-f]{64}$/i;

export function CustomerActivationInvitationPage({ token }: { token: string }) {
  const { user, ready } = useAuth();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [accepted, setAccepted] = useState<{ business_name: string; email: string } | null>(null);
  const validToken = TOKEN_PATTERN.test(token);

  async function accept() {
    if (busy || !validToken || !user || user.isStaff) return;
    setBusy(true);
    setError("");
    try {
      const result = await acceptCustomerActivationInvitation(token);
      setAccepted({ business_name: result.business_name, email: result.email });
      // Replace the bearer token in the visible address bar after the server consumes it.
      window.history.replaceState(null, "", window.location.origin + "/");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "تعذر تفعيل حساب العميل.");
    } finally {
      setBusy(false);
    }
  }

  const shell = { minHeight: "100vh", maxWidth: 760, margin: "0 auto", padding: 22, boxSizing: "border-box" as const };
  const panel = { border: "1px solid #dce7e5", borderRadius: 15, padding: 22, background: "#fff", boxShadow: "0 10px 40px rgba(18,55,51,.06)" };

  if (!validToken) {
    return <main dir="rtl" className="storefront" style={shell}><section style={panel} role="alert"><h1>رابط تفعيل غير صالح</h1><p>تحقق من الرابط الذي أرسله فريق متجر الأغبري أو اطلب رابطًا جديدًا.</p><Link to="/">العودة إلى المتجر</Link></section></main>;
  }
  if (!ready) {
    return <main dir="rtl" className="storefront" style={shell}><p role="status">جارٍ التحقق من جلسة الحساب...</p></main>;
  }
  if (!user) {
    return (
      <main dir="rtl" className="storefront" style={{ ...shell, maxWidth: 1120 }}>
        <header style={{ margin: "5px 0 18px" }}>
          <div style={{ display: "flex", gap: 10, alignItems: "center" }}><ShieldCheck size={27} /><h1 style={{ margin: 0 }}>تفعيل حساب عميل</h1></div>
          <p style={{ color: "#536b68", lineHeight: 1.8 }}>أنشئ حسابًا أو سجّل الدخول بالبريد الإلكتروني الذي سجّله موظف الأغبري في دعوتك. سيحتفظ رابط تأكيد البريد بمسار التفعيل حتى تستطيع العودة لقبول الدعوة.</p>
        </header>
        <section style={panel}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}><UserRound size={19} /><strong>بيانات الحساب</strong></div>
          <Login initialMode="register" onDone={() => window.location.reload()} />
        </section>
      </main>
    );
  }
  if (user.isStaff) {
    return <main dir="rtl" className="storefront" style={shell}><section style={panel} role="alert"><h1>الدعوة مخصصة لحساب عميل</h1><p>أنت مسجّل الدخول بحساب فريق تشغيل. سجّل الخروج وافتح الرابط بحساب العميل الذي استلم الدعوة. رابط التفعيل لا يمنح صلاحيات موظف.</p></section></main>;
  }

  if (accepted) {
    return (
      <main dir="rtl" className="storefront" style={shell}>
        <section style={{ ...panel, borderColor: "#b6d9c7" }} role="status">
          <CheckCircle2 size={32} color="#21784d" />
          <h1>تم تفعيل حساب العميل</h1>
          <p>تم ربط حساب {accepted.email} بسجل {accepted.business_name} بواسطة الخادم.</p>
          <p>حالة اعتماد العميل وسياسات الأسعار والصلاحيات لم تتغير بهذا الرابط.</p>
          <Link to="/">متابعة إلى متجر الأغبري</Link>
        </section>
      </main>
    );
  }

  return (
    <main dir="rtl" className="storefront" style={shell}>
      <header style={{ marginBottom: 18 }}>
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}><Link2 size={26} /><h1 style={{ margin: 0 }}>قبول دعوة تفعيل الحساب</h1></div>
        <p style={{ color: "#536b68", lineHeight: 1.8 }}>سيطابق الخادم البريد المؤكد مع عنوان الدعوة ويربط حسابك بسجل عميل واحد فقط. لا يمكن للرابط تغيير رصيد العميل أو شريحة الأسعار أو منح أدوار فريق التشغيل.</p>
      </header>
      <section style={panel}>
        <div style={{ display: "grid", gap: 7, marginBottom: 18 }}>
          <strong>الحساب الحالي</strong>
          <span dir="ltr" style={{ justifySelf: "start", overflowWrap: "anywhere" }}>{user.email}</span>
          <small style={{ color: "#536b68" }}>إذا لم يكن هذا هو البريد الذي تلقى الدعوة، سجّل الخروج ثم ادخل بالبريد الصحيح.</small>
        </div>
        {error && <div role="alert" style={{ border: "1px solid #e7b7b7", color: "#922b2b", padding: 11, borderRadius: 9, marginBottom: 12 }}>{error}</div>}
        <button type="button" disabled={busy} onClick={() => void accept()} style={{ border: 0, borderRadius: 10, padding: "12px 16px", background: "#087f8d", color: "#fff", fontWeight: 800, display: "inline-flex", alignItems: "center", gap: 8, cursor: busy ? "not-allowed" : "pointer", opacity: busy ? .6 : 1 }}>
          <ShieldCheck size={17} /> {busy ? "جارٍ التحقق وربط الحساب..." : "التحقق من الدعوة وتفعيل الحساب"}
        </button>
      </section>
    </main>
  );
}
