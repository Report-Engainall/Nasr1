import { ClientOnly, Link, createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { ArrowLeft, Bell, Building2, FileText, KeyRound, LogOut, MapPin, Package, RotateCcw, ShieldCheck, Smartphone, UserRound, Wallet } from "lucide-react";
import { Login } from "@/components/Login";
import { useAuth } from "@/lib/auth";

export const Route = createFileRoute("/profile")({
  head: () => ({
    meta: [
      { title: "ملفي الشخصي | متجر الأغبري" },
      { name: "description", content: "بيانات حسابك وروابط إدارة الطلبات والخدمات في متجر الأغبري." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: () => (
    <ClientOnly fallback={<main className="storefront" dir="rtl" role="status">جار تحميل ملف الحساب...</main>}>
      <CustomerAccountProfilePage />
    </ClientOnly>
  ),
});

const roleLabels: Record<string, string> = {
  admin: "مدير النظام",
  manager: "مدير المؤسسة",
  staff: "موظف",
  accountant: "محاسب",
  customer_manager: "مسؤول العملاء",
  customer: "عميل",
  buyer: "مسؤول مشتريات",
  finance: "مسؤول مالي",
  viewer: "مشاهد",
};

function ProfileLink({ to, title, description, icon: Icon }: {
  to: string;
  title: string;
  description: string;
  icon: typeof UserRound;
}) {
  return (
    <Link to={to as never} className="flex min-h-20 items-center gap-3 rounded-xl border bg-card p-4 transition-colors hover:border-primary/50 hover:bg-primary/5">
      <span className="rounded-lg bg-primary/10 p-2 text-primary"><Icon size={20}/></span>
      <span className="min-w-0 flex-1">
        <strong className="block text-sm">{title}</strong>
        <span className="mt-1 block text-xs leading-5 text-muted-foreground">{description}</span>
      </span>
      <ArrowLeft size={15} className="shrink-0 text-muted-foreground"/>
    </Link>
  );
}

export function CustomerAccountProfilePage() {
  const { user, ready, signOutOtherSessions, signOutEverywhere } = useAuth();
  const [sessionAction, setSessionAction] = useState<"others" | "global" | null>(null);
  const [sessionError, setSessionError] = useState("");
  const [sessionNotice, setSessionNotice] = useState("");
  if (!ready) return <main className="storefront" dir="rtl" role="status">جار التحقق من الحساب...</main>;
  if (!user) return <Login />;

  async function revokeOtherSessions() {
    if (sessionAction) return;
    if (!window.confirm("سيتم إنهاء جلسات الحساب على الأجهزة والمتصفحات الأخرى مع إبقاء هذا الجهاز متصلاً. هل تريد المتابعة؟")) return;
    setSessionAction("others");
    setSessionError("");
    setSessionNotice("");
    try {
      await signOutOtherSessions();
      setSessionNotice("أُرسل طلب إبطال الجلسات الأخرى بنجاح. قد تبقى رموز الوصول الصادرة سابقاً صالحة حتى انتهاء مدتها.");
    } catch (cause) {
      setSessionError(cause instanceof Error ? cause.message : "تعذر إبطال الجلسات الأخرى.");
    } finally {
      setSessionAction(null);
    }
  }

  async function signOutEverywhereNow() {
    if (sessionAction) return;
    if (!window.confirm("سيتم إنهاء الجلسة الحالية وجميع جلسات هذا الحساب على الأجهزة والمتصفحات الأخرى. ستحتاج إلى تسجيل الدخول مجدداً. هل تريد المتابعة؟")) return;
    setSessionAction("global");
    setSessionError("");
    setSessionNotice("");
    try {
      await signOutEverywhere();
    } catch (cause) {
      setSessionError(cause instanceof Error ? cause.message : "تعذر إنهاء جميع الجلسات.");
      setSessionAction(null);
    }
  }

  const links = user.isStaff
    ? [
        { to: "/admin", title: "مساحة العمل", description: "العودة إلى لوحة التشغيل والإدارة", icon: Building2 },
        { to: "/account/password", title: "كلمة المرور", description: "تحديث كلمة مرور الحساب الحالي", icon: KeyRound },
        { to: "/admin/notifications", title: "إشعارات العمل", description: "متابعة إشعارات مهام المؤسسة", icon: Bell },
      ]
    : [
        { to: "/orders", title: "طلباتي", description: "متابعة الطلبات وحالاتها", icon: Package },
        { to: "/returns", title: "مرتجعاتي", description: "متابعة طلبات الإرجاع وقراراتها", icon: RotateCcw },
        { to: "/payments", title: "دفعاتي", description: "عرض حركات السداد المسجلة", icon: Wallet },
        { to: "/statement", title: "كشف الحساب", description: "الأرصدة والفواتير والمدفوعات حسب العملة", icon: FileText },
        { to: "/addresses", title: "عناوين التوصيل", description: "إدارة عناوين حسابك", icon: MapPin },
        { to: "/notifications", title: "التنبيهات", description: "تحديثات الطلبات وخدمة العملاء", icon: Bell },
        { to: "/company/contacts", title: "جهات اتصال الشركة", description: "إدارة جهات الاتصال التشغيلية", icon: Building2 },
        { to: "/account/password", title: "كلمة المرور", description: "تحديث كلمة مرور الحساب الحالي", icon: KeyRound },
      ];

  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6 lg:px-8" dir="rtl">
      <header className="rounded-2xl border bg-card p-5 sm:p-7">
        <Link to="/" className="inline-flex items-center gap-2 text-sm text-primary hover:underline">
          <ArrowLeft size={16}/> العودة إلى المتجر
        </Link>
        <div className="mt-5 flex items-start gap-3">
          <span className="rounded-xl bg-primary/10 p-3 text-primary"><UserRound size={25}/></span>
          <div>
            <h1 className="text-2xl font-bold">ملفي الشخصي</h1>
            <p className="mt-1 text-sm text-muted-foreground">بيانات الهوية المرتبطة بجلسة المصادقة الحالية.</p>
          </div>
        </div>

        <section className="mt-6 grid gap-3 sm:grid-cols-2" aria-label="بيانات الحساب">
          <article className="rounded-xl border p-4">
            <span className="text-xs text-muted-foreground">الاسم المسجل</span>
            <strong className="mt-2 block text-base">{user.name.trim() || "الاسم غير متاح"}</strong>
          </article>
          <article className="rounded-xl border p-4">
            <span className="text-xs text-muted-foreground">البريد الإلكتروني</span>
            <strong className="mt-2 block text-base" dir="ltr">{user.email.trim() || "لا يوجد بريد إلكتروني مرتبط بهذا الحساب"}</strong>
          </article>
        </section>
        <section className="mt-4 rounded-xl border p-4">
          <div className="flex items-center gap-2 text-sm font-semibold"><ShieldCheck size={17}/> الصلاحيات المرتبطة بالجلسة</div>
          <div className="mt-3 flex flex-wrap gap-2">
            {user.roles.map(role => (
              <span key={role} className="rounded-lg border bg-muted/40 px-3 py-1.5 text-xs">
                {roleLabels[role] ?? "صلاحية إضافية"}
              </span>
            ))}
          </div>
        </section>
        <p className="mt-4 text-xs leading-6 text-muted-foreground">
          تُعرض معلومات الهوية من جلسة الحساب وملف المستخدم الذي أعاده الخادم. تعديل بيانات الملف التجاري أو اسم العميل غير متاح من هذه الشاشة.
        </p>
      </header>

      <section className="mt-7">
        <h2 className="mb-3 text-lg font-bold">إدارة الحساب والخدمات</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          {links.map(item => <ProfileLink key={item.to} {...item}/>)}
        </div>
      </section>

      <section className="mt-7 rounded-2xl border bg-card p-5 sm:p-6" aria-labelledby="profile-sessions-heading">
        <div className="flex items-start gap-3">
          <span className="rounded-xl bg-primary/10 p-3 text-primary"><Smartphone size={22}/></span>
          <div>
            <h2 id="profile-sessions-heading" className="text-lg font-bold">الجلسات والأجهزة</h2>
            <p className="mt-1 text-sm leading-6 text-muted-foreground">
              يمكنك إنهاء جلسات الحساب الأخرى مع إبقاء هذا الجهاز، أو إنهاء جميع الجلسات بما فيها الجلسة الحالية.
            </p>
          </div>
        </div>
        {sessionError ? <p role="alert" className="mt-4 rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-800">{sessionError}</p> : null}
        {sessionNotice ? <p role="status" className="mt-4 rounded-lg border border-emerald-300 bg-emerald-50 p-3 text-sm text-emerald-800">{sessionNotice}</p> : null}
        <div className="mt-4 flex flex-wrap gap-3">
          <button
            type="button"
            className="btn secondary"
            onClick={() => void revokeOtherSessions()}
            disabled={sessionAction !== null}
          >
            <Smartphone size={16}/>
            {sessionAction === "others" ? "جارٍ إنهاء الجلسات الأخرى..." : "إنهاء جلسات الأجهزة الأخرى"}
          </button>
          <button
            type="button"
            className="btn secondary"
            onClick={() => void signOutEverywhereNow()}
            disabled={sessionAction !== null}
          >
            <LogOut size={16}/>
            {sessionAction === "global" ? "جارٍ إنهاء جميع الجلسات..." : "تسجيل الخروج من جميع الأجهزة"}
          </button>
        </div>
        <p className="mt-3 text-xs leading-6 text-muted-foreground">
          ملاحظة أمنية: إبطال جلسات المصادقة يمنع استخدام رموز التجديد لاحقاً، لكن رموز الوصول التي صدرت بالفعل قد تظل صالحة حتى وقت انتهائها.
        </p>
      </section>
    </main>
  );
}
