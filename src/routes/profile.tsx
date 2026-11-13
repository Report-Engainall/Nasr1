import { ClientOnly, Link, createFileRoute } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent } from "react";
import { ArrowLeft, Bell, Building2, ClipboardList, FileText, GitCompareArrows, Headphones, Heart, History, KeyRound, LogOut, MapPin, MessageCircle, Package, ReceiptText, RotateCcw, ShieldCheck, Smartphone, UserRound, Wallet } from "lucide-react";
import { Login } from "@/components/Login";
import { AccountPersonalizationSettings } from "@/components/AccountPersonalizationSettings";
import { useAuth } from "@/lib/auth";
import { resolveProfileAccessMode } from "@/lib/profile-access";
import { fetchMyCustomerAccountProfile, saveMyCustomerAccountProfile, type CustomerAccountProfile, type CustomerAccountProfileInput } from "@/lib/customer-account-profile";
import { clearRecentlyViewedProducts, readRecentlyViewedProducts, removeRecentlyViewedProduct, type RecentlyViewedProduct } from "@/lib/recently-viewed-products";

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

const customerApprovalLabels: Record<CustomerAccountProfile["status"], string> = {
  pending: "بانتظار موافقة الإدارة",
  approved: "الحساب معتمد",
  rejected: "طلب الحساب مرفوض",
  frozen: "الحساب مجمّد",
  blocked: "الحساب محظور",
  archived: "الحساب مؤرشف",
};

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

function CustomerAccountProfileEditor() {
  const [profile, setProfile] = useState<CustomerAccountProfile | null>(null);
  const [draft, setDraft] = useState<CustomerAccountProfileInput>({
    businessName: "",
    contactName: "",
    phone: "",
    email: "",
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    let active = true;
    fetchMyCustomerAccountProfile()
      .then((value) => {
        if (!active) return;
        setProfile(value);
        setDraft({
          businessName: value.business_name,
          contactName: value.contact_name ?? "",
          phone: value.phone ?? "",
          email: value.email ?? "",
        });
      })
      .catch((cause) => {
        if (active) setError(cause instanceof Error ? cause.message : "تعذر تحميل بيانات الشركة.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!profile || loading || saving) return;
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const saved = await saveMyCustomerAccountProfile(draft, profile.updated_at);
      setProfile(saved);
      setDraft({
        businessName: saved.business_name,
        contactName: saved.contact_name ?? "",
        phone: saved.phone ?? "",
        email: saved.email ?? "",
      });
      setNotice("تم حفظ بيانات الشركة في الحساب.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "تعذر حفظ بيانات الشركة.");
    } finally {
      setSaving(false);
    }
  }

  const inputClass = "mt-1 w-full rounded-lg border bg-background px-3 py-2 text-sm";
  return (
    <section className="mt-4 rounded-xl border p-4" aria-labelledby="customer-account-business-heading">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 id="customer-account-business-heading" className="text-base font-bold">بيانات الشركة والتواصل</h2>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">
            بيانات الملف التجاري المرتبط بحسابك. لا يغيّر هذا النموذج بريد تسجيل الدخول أو الصلاحيات أو شروط الائتمان.
          </p>
        </div>
        {profile?.customer_code ? <span className="rounded-md border px-2 py-1 text-xs text-muted-foreground">رقم العميل: {profile.customer_code}</span> : null}
      </div>
      {profile ? (
        <div className="mt-3 rounded-lg border p-3" aria-label="حالة اعتماد حساب العميل">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-sm text-muted-foreground">حالة اعتماد الحساب</span>
            <strong className="text-sm">{customerApprovalLabels[profile.status]}</strong>
          </div>
          {profile.status === "pending" ? (
            <p className="mt-2 text-xs leading-5 text-muted-foreground">طلب حسابك قيد انتظار مراجعة الإدارة واعتمادها. لا يمكن للعميل اعتماد الحساب أو تغيير هذه الحالة من صفحة الملف الشخصي.</p>
          ) : profile.status === "rejected" ? (
            <p className="mt-2 text-xs leading-5 text-muted-foreground">لم يُعتمد طلب الحساب. تواصل مع إدارة المتجر لمراجعة الطلب؛ لا يمكن إعادة تفعيله من هذه الشاشة.</p>
          ) : profile.status === "frozen" || profile.status === "blocked" ? (
            <p className="mt-2 text-xs leading-5 text-muted-foreground">الوصول التشغيلي للحساب مقيّد بقرار الإدارة. راجع إدارة المتجر لمعرفة الإجراء المسموح.</p>
          ) : null}
        </div>
      ) : null}
      {loading ? <p role="status" className="mt-3 text-sm text-muted-foreground">جار تحميل بيانات الشركة...</p> : null}
      {error ? <p role="alert" className="mt-3 rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-800">{error}</p> : null}
      {notice ? <p role="status" className="mt-3 rounded-lg border border-emerald-300 bg-emerald-50 p-3 text-sm text-emerald-800">{notice}</p> : null}
      {profile ? (
        <form onSubmit={(event) => void submit(event)} className="mt-4 grid gap-3 sm:grid-cols-2">
          <label className="text-sm font-medium">
            اسم الشركة
            <input className={inputClass} value={draft.businessName} minLength={2} maxLength={200}
              required disabled={loading || saving}
              onChange={(event) => setDraft((current) => ({ ...current, businessName: event.target.value }))} />
          </label>
          <label className="text-sm font-medium">
            اسم مسؤول الحساب
            <input className={inputClass} value={draft.contactName} minLength={2} maxLength={120}
              required disabled={loading || saving}
              onChange={(event) => setDraft((current) => ({ ...current, contactName: event.target.value }))} />
          </label>
          <label className="text-sm font-medium">
            هاتف التواصل
            <input className={inputClass} type="tel" dir="auto" value={draft.phone} minLength={7} maxLength={40}
              required disabled={loading || saving} autoComplete="tel"
              onChange={(event) => setDraft((current) => ({ ...current, phone: event.target.value }))} />
          </label>
          <label className="text-sm font-medium">
            بريد التواصل التجاري
            <input className={inputClass} type="email" dir="ltr" value={draft.email} maxLength={254}
              disabled={loading || saving} autoComplete="email"
              onChange={(event) => setDraft((current) => ({ ...current, email: event.target.value }))} />
          </label>
          <div className="sm:col-span-2 flex flex-wrap items-center gap-3">
            <button type="submit" className="btn primary" disabled={loading || saving}>
              {saving ? "جار حفظ البيانات..." : "حفظ بيانات الشركة"}
            </button>
            {profile.updated_at ? <span className="text-xs text-muted-foreground">آخر تحديث: {new Date(profile.updated_at).toLocaleString("ar-YE")}</span> : null}
          </div>
        </form>
      ) : !loading && !error ? (
        <p role="status" className="mt-3 text-sm text-muted-foreground">لا يوجد ملف عميل أساسي مرتبط بهذا الحساب.</p>
      ) : null}
    </section>
  );
}


function RecentlyViewedProductsPanel({ profileId }: { profileId: string }) {
  const [items, setItems] = useState<RecentlyViewedProduct[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    setLoaded(false);
    setError("");
    try {
      const next = readRecentlyViewedProducts(window.localStorage, profileId);
      if (active) setItems(next);
    } catch {
      if (active) {
        setItems([]);
        setError("تعذر قراءة سجل المشاهدة المحلي في هذا المتصفح.");
      }
    } finally {
      if (active) setLoaded(true);
    }
    return () => { active = false; };
  }, [profileId]);

  function removeProduct(productId: string) {
    try {
      if (!removeRecentlyViewedProduct(window.localStorage, profileId, productId)) {
        setError("تعذر تحديث سجل المشاهدة المحلي.");
        return;
      }
      setItems((current) => current.filter((item) => item.id !== productId));
      setError("");
    } catch {
      setError("تعذر تحديث سجل المشاهدة المحلي.");
    }
  }

  function clearHistory() {
    try {
      if (!clearRecentlyViewedProducts(window.localStorage, profileId)) {
        setError("تعذر مسح سجل المشاهدة المحلي.");
        return;
      }
      setItems([]);
      setError("");
    } catch {
      setError("تعذر مسح سجل المشاهدة المحلي.");
    }
  }

  return (
    <section className="mt-7 rounded-2xl border bg-card p-5 sm:p-6" aria-labelledby="recently-viewed-products-heading">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <span className="rounded-xl bg-primary/10 p-3 text-primary"><History size={22}/></span>
          <div className="min-w-0">
            <h2 id="recently-viewed-products-heading" className="text-lg font-bold">شوهدت مؤخراً</h2>
            <p className="mt-1 text-sm leading-6 text-muted-foreground">
              آخر المنتجات التي فتحتها من حسابك على هذا الجهاز. نحفظ الاسم والصورة ورمز الصنف فقط؛ السعر والتوفر يُعاد التحقق منهما عند فتح المنتج.
            </p>
          </div>
        </div>
        {items.length > 0 ? (
          <button type="button" className="btn secondary" onClick={clearHistory}>مسح السجل</button>
        ) : null}
      </div>

      {error ? <p className="mt-3 rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-800" role="alert">{error}</p> : null}
      {!loaded ? <p className="mt-4 text-sm text-muted-foreground" role="status">جار تحميل سجل المشاهدة...</p> : null}
      {loaded && items.length === 0 ? (
        <p className="mt-4 rounded-xl border border-dashed p-5 text-center text-sm leading-6 text-muted-foreground" role="status">
          لا توجد منتجات شوهدت مؤخراً على هذا الجهاز. عند فتح تفاصيل أي منتج أثناء الدخول بحساب العميل سيظهر هنا.
        </p>
      ) : null}

      {items.length > 0 ? (
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((item) => (
            <article key={item.id} className="min-w-0 rounded-xl border p-3">
              <Link
                to="/product/$id"
                params={{ id: item.id }}
                className="flex min-w-0 items-center gap-3 rounded-lg outline-offset-4 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
              >
                {item.imageUrl ? (
                  <img src={item.imageUrl} alt="" loading="lazy" referrerPolicy="no-referrer"
                    className="h-16 w-16 shrink-0 rounded-lg border bg-muted object-contain" />
                ) : (
                  <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-lg border bg-muted text-xs text-muted-foreground">صورة غير متاحة</span>
                )}
                <span className="min-w-0 flex-1">
                  <strong className="block line-clamp-2 text-sm">{item.name}</strong>
                  {item.itemCode ? <span className="mt-1 block truncate text-xs text-muted-foreground" dir="ltr">{item.itemCode}</span> : null}
                  <span className="mt-1 block text-xs text-primary">فتح تفاصيل المنتج</span>
                </span>
              </Link>
              <div className="mt-3 flex items-center justify-between gap-2 border-t pt-2">
                <span className="truncate text-xs text-muted-foreground">
                  {new Intl.DateTimeFormat("ar-YE", { dateStyle: "medium", timeStyle: "short" }).format(new Date(item.viewedAt))}
                </span>
                <button type="button" className="shrink-0 text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
                  aria-label={`إزالة ${item.name} من سجل المشاهدة`} onClick={() => removeProduct(item.id)}>
                  إزالة
                </button>
              </div>
            </article>
          ))}
        </div>
      ) : null}
      <p className="mt-3 text-xs leading-6 text-muted-foreground">
        الخصوصية: السجل محلي لهذا الحساب على المتصفح الحالي، ولا تتم مزامنته مع أجهزة أخرى أو إرساله إلى الخادم.
      </p>
    </section>
  );
}

export function CustomerAccountProfilePage() {
  const { user, ready, sessionRevision, signOutOtherSessions, signOutEverywhere } = useAuth();
  if (!ready) return <main className="storefront" dir="rtl" role="status">جار التحقق من الحساب...</main>;
  if (!user) return <Login />;

  // Keep profile-local state bound to the verified account and auth session.
  // A session transition must not carry the prior account's editor draft or feedback.
  return (
    <CustomerAccountProfileContent
      key={user.id + ":" + user.profileId + ":" + sessionRevision}
      user={user}
      signOutOtherSessions={signOutOtherSessions}
      signOutEverywhere={signOutEverywhere}
    />
  );
}

type CustomerAccountProfileContentProps = {
  user: NonNullable<ReturnType<typeof useAuth>["user"]>;
  signOutOtherSessions: () => Promise<void>;
  signOutEverywhere: () => Promise<void>;
};

function CustomerAccountProfileContent({
  user,
  signOutOtherSessions,
  signOutEverywhere,
}: CustomerAccountProfileContentProps) {
  const profileAccessMode = resolveProfileAccessMode(user);
  const [sessionAction, setSessionAction] = useState<"others" | "global" | null>(null);
  const [sessionError, setSessionError] = useState("");
  const [sessionNotice, setSessionNotice] = useState("");

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

  const links = profileAccessMode === "staff"
    ? [
        { to: "/admin", title: "مساحة العمل", description: "العودة إلى لوحة التشغيل والإدارة", icon: Building2 },
        { to: "/account/password", title: "كلمة المرور", description: "تحديث كلمة مرور الحساب الحالي", icon: KeyRound },
        { to: "/admin/notifications", title: "إشعارات العمل", description: "متابعة إشعارات مهام المؤسسة", icon: Bell },
      ]
    : profileAccessMode === "customer" ? [
        { to: "/orders", title: "طلباتي", description: "متابعة الطلبات وحالاتها", icon: Package },
        { to: "/invoices", title: "فواتيري", description: "عرض الفواتير المتاحة وحالاتها", icon: ReceiptText },
        { to: "/quotes", title: "عروض الأسعار", description: "متابعة طلبات عروض الأسعار وردود الإدارة", icon: ClipboardList },
        { to: "/my-devices", title: "أجهزتي وأصولي", description: "عرض أجهزتك والضمان وسجل الصيانة والملكية", icon: Smartphone },
        { to: "/returns", title: "مرتجعاتي", description: "متابعة طلبات الإرجاع وقراراتها", icon: RotateCcw },
        { to: "/payments", title: "دفعاتي", description: "عرض حركات السداد المسجلة", icon: Wallet },
        { to: "/statement", title: "كشف الحساب", description: "الأرصدة والفواتير والمدفوعات حسب العملة", icon: FileText },
        { to: "/addresses", title: "عناوين التوصيل", description: "إدارة عناوين حسابك", icon: MapPin },
        { to: "/wishlist", title: "المفضلة", description: "المنتجات التي حفظتها للرجوع إليها", icon: Heart },
        { to: "/compare", title: "مقارنة المنتجات", description: "مقارنة المنتجات التي اخترتها", icon: GitCompareArrows },
        { to: "/service-cases", title: "حالات خدمة العملاء", description: "فتح الشكاوى والاستفسارات ومتابعة ردود فريق الأغبري", icon: MessageCircle },
        { to: "/notifications", title: "التنبيهات", description: "تحديثات الطلبات وخدمة العملاء", icon: Bell },
        { to: "/help", title: "مركز المساعدة", description: "إرشادات الحساب والطلبات والتوصيل وخدمة العملاء", icon: Headphones },
        { to: "/company/contacts", title: "جهات اتصال الشركة", description: "إدارة جهات الاتصال التشغيلية", icon: Building2 },
        { to: "/account/password", title: "كلمة المرور", description: "تحديث كلمة مرور الحساب الحالي", icon: KeyRound },
      ] : [
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
        {profileAccessMode === "customer" ? <CustomerAccountProfileEditor /> : null}
        {profileAccessMode === "restricted" ? (
          <p className="mt-4 rounded-xl border p-4 text-sm text-muted-foreground" role="status">
            هذه الجلسة لا تحمل دور العميل أو دوراً إدارياً معتمداً. تظل إدارة كلمة المرور وتفضيلات الحساب متاحة، ولا تُعرض بيانات الشركة أو خدمات العملاء.
          </p>
        ) : null}

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
          تُعرض معلومات الهوية من جلسة الحساب؛ {profileAccessMode === "customer" ? "ويستطيع صاحب حساب العميل تحديث بياناته التجارية من محرر بيانات الحساب أعلاه." : "ولا تُعرض بيانات الشركة أو خدمات حساب العميل لهذه الجلسة."} أما الصلاحيات والاعتمادات والبيانات المالية فتظل خاضعة لإجراءات الإدارة.
        </p>
      </header>

      <section className="mt-6" aria-label="تفضيلات الخصوصية والإشعارات">
        <AccountPersonalizationSettings />
      </section>

      <section className="mt-7">
        <h2 className="mb-3 text-lg font-bold">إدارة الحساب والخدمات</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          {links.map(item => <ProfileLink key={item.to} {...item}/>)}
        </div>
      </section>

      {profileAccessMode === "customer" && user.profileId ? <RecentlyViewedProductsPanel profileId={user.profileId}/> : null}

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
