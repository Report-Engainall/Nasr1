import { useCallback, useEffect, useMemo, useState } from "react";
import {
  CalendarDays,
  FileText,
  Laptop,
  Package,
  ReceiptText,
  RefreshCw,
  Search,
  ShieldCheck,
  Wrench,
} from "lucide-react";
import { Login } from "@/components/Login";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/lib/supabase";

type AssetStatus =
  | "active"
  | "under_maintenance"
  | "under_repair"
  | "replaced"
  | "retired"
  | "lost"
  | "returned";

type CustomerAsset = {
  id: string;
  product_id: string | null;
  source_order_id: string | null;
  source_invoice_id: string | null;
  asset_name: string;
  manufacturer: string | null;
  model: string | null;
  serial_number: string | null;
  purchase_date: string | null;
  warranty_provider: string | null;
  warranty_reference: string | null;
  warranty_start_date: string | null;
  warranty_end_date: string | null;
  coverage_reference: string | null;
  coverage_start_date: string | null;
  coverage_end_date: string | null;
  status: AssetStatus;
  created_at: string;
  updated_at: string;
};

type AssetEvent = {
  id: string;
  asset_id: string;
  event_type: string;
  old_status: AssetStatus | null;
  new_status: AssetStatus | null;
  summary: string;
  reason: string;
  reference: string | null;
  details: string | null;
  event_at: string;
};

type ProductReference = { id: string; name: string; item_code: string | null };
type OrderReference = { id: string; order_number: string };
type InvoiceReference = { id: string; invoice_number: string };

const STATUS_LABELS: Record<AssetStatus, string> = {
  active: "يعمل",
  under_maintenance: "قيد الصيانة",
  under_repair: "قيد الإصلاح",
  replaced: "مستبدل",
  retired: "خارج الخدمة",
  lost: "مفقود",
  returned: "مُعاد",
};

const EVENT_LABELS: Record<string, string> = {
  asset_registered: "تسجيل الجهاز",
  details_updated: "تحديث البيانات",
  ownership_transferred: "نقل الملكية",
  maintenance_started: "بدء الصيانة",
  repair_started: "بدء الإصلاح",
  repair_completed: "اكتمال الإصلاح",
  warranty_claim: "مطالبة ضمان",
  status_changed: "تغيير الحالة",
  replacement: "استبدال الجهاز",
  retired: "إخراج من الخدمة",
  lost: "تسجيل فقد",
  returned: "إرجاع الجهاز",
  note_added: "إضافة حدث",
};

const STATUS_FILTERS: Array<{ value: AssetStatus | "all"; label: string }> = [
  { value: "all", label: "كل الحالات" },
  { value: "active", label: "يعمل" },
  { value: "under_maintenance", label: "قيد الصيانة" },
  { value: "under_repair", label: "قيد الإصلاح" },
  { value: "replaced", label: "مستبدل" },
  { value: "retired", label: "خارج الخدمة" },
  { value: "lost", label: "مفقود" },
  { value: "returned", label: "مُعاد" },
];

function formatDate(value: string | null): string {
  if (!value) return "غير مثبت";
  const date = new Date(value.length === 10 ? value + "T00:00:00" : value);
  return Number.isNaN(date.getTime()) ? "غير متاح" : date.toLocaleDateString("ar-YE");
}

function formatDateTime(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "وقت غير متاح"
    : date.toLocaleString("ar-YE", { dateStyle: "medium", timeStyle: "short" });
}

function uniqueIds(values: Array<string | null>): string[] {
  return Array.from(new Set(values.filter((value): value is string => Boolean(value))));
}

function toLookup<T extends { id: string }>(rows: T[]): Record<string, T> {
  return Object.fromEntries(rows.map((row) => [row.id, row]));
}

export function CustomerMyDevicesPage() {
  const { user, ready, sessionRevision } = useAuth();

  if (!ready) {
    return (
      <main className="mx-auto w-full max-w-5xl px-4 py-10" dir="rtl" role="status">
        جار التحقق من حسابك...
      </main>
    );
  }

  if (!user) return <Login />;

  if (user.isStaff || !user.roles.includes("customer")) {
    return (
      <main className="mx-auto w-full max-w-5xl px-4 py-10" dir="rtl">
        <section className="rounded-2xl border bg-card p-6" role="alert">
          <h1 className="text-xl font-bold">أجهزتي وأصولي</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            هذه الصفحة مخصصة لحسابات العملاء. استخدم مساحة الإدارة لإدارة أصول العملاء.
          </p>
        </section>
      </main>
    );
  }

  return <CustomerMyDevicesWorkspace key={user.id + ":" + user.profileId + ":" + sessionRevision} />;
}

function CustomerMyDevicesWorkspace() {
  const [assets, setAssets] = useState<CustomerAsset[]>([]);
  const [products, setProducts] = useState<Record<string, ProductReference>>({});
  const [orders, setOrders] = useState<Record<string, OrderReference>>({});
  const [invoices, setInvoices] = useState<Record<string, InvoiceReference>>({});
  const [events, setEvents] = useState<AssetEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [warning, setWarning] = useState("");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<AssetStatus | "all">("all");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    setWarning("");

    try {
      // RLS derives the active customer and organization from the verified server session.
      // Never send customer_id or organization_id from this page.
      // Related lookups use only source IDs returned from the RLS-filtered asset rows.
      const assetResult = await supabase
        .from("customer_assets")
        .select(
          "id,product_id,source_order_id,source_invoice_id,asset_name,manufacturer,model,serial_number,purchase_date,warranty_provider,warranty_reference,warranty_start_date,warranty_end_date,coverage_reference,coverage_start_date,coverage_end_date,status,created_at,updated_at",
        )
        .order("updated_at", { ascending: false })
        .limit(250);

      if (assetResult.error) throw assetResult.error;

      const nextAssets = (assetResult.data ?? []) as CustomerAsset[];
      setAssets(nextAssets);

      const productIds = uniqueIds(nextAssets.map((asset) => asset.product_id));
      const orderIds = uniqueIds(nextAssets.map((asset) => asset.source_order_id));
      const invoiceIds = uniqueIds(nextAssets.map((asset) => asset.source_invoice_id));

      const [productResult, orderResult, invoiceResult, eventResult] = await Promise.all([
        productIds.length
          ? supabase.from("products").select("id,name,item_code").in("id", productIds)
          : Promise.resolve({ data: [], error: null }),
        orderIds.length
          ? supabase.from("orders").select("id,order_number").in("id", orderIds)
          : Promise.resolve({ data: [], error: null }),
        invoiceIds.length
          ? supabase.from("customer_invoices").select("id,invoice_number").in("id", invoiceIds)
          : Promise.resolve({ data: [], error: null }),
        // RLS deliberately allows the current and historical owner to read lifecycle events.
        supabase
          .from("customer_asset_events")
          .select("id,asset_id,event_type,old_status,new_status,summary,reason,reference,details,event_at")
          .order("event_at", { ascending: false })
          .limit(1000),
      ]);

      setProducts(toLookup((productResult.data ?? []) as ProductReference[]));
      setOrders(toLookup((orderResult.data ?? []) as OrderReference[]));
      setInvoices(toLookup((invoiceResult.data ?? []) as InvoiceReference[]));
      setEvents((eventResult.data ?? []) as AssetEvent[]);

      const partialIssues: string[] = [];
      if (productResult.error) partialIssues.push("بيانات بعض الأصناف");
      if (orderResult.error) partialIssues.push("مراجع بعض الطلبات");
      if (invoiceResult.error) partialIssues.push("مراجع بعض الفواتير");
      if (eventResult.error) partialIssues.push("سجل الأحداث والصيانة");
      if (partialIssues.length) {
        setWarning("تعذر تحميل " + partialIssues.join(" و") + ". ما زالت بيانات الأجهزة الأساسية معروضة.");
      }
    } catch {
      setAssets([]);
      setProducts({});
      setOrders({});
      setInvoices({});
      setEvents([]);
      setError("تعذر تحميل سجل أجهزتك من الحساب الحالي. تحقق من الاتصال ثم أعد المحاولة.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const eventsByAsset = useMemo(() => {
    const grouped: Record<string, AssetEvent[]> = {};
    for (const event of events) (grouped[event.asset_id] ??= []).push(event);
    return grouped;
  }, [events]);

  const filteredAssets = useMemo(() => {
    const query = search.trim().toLocaleLowerCase();
    return assets.filter((asset) => {
      if (statusFilter !== "all" && asset.status !== statusFilter) return false;
      if (!query) return true;
      const product = asset.product_id ? products[asset.product_id] : undefined;
      const order = asset.source_order_id ? orders[asset.source_order_id] : undefined;
      const invoice = asset.source_invoice_id ? invoices[asset.source_invoice_id] : undefined;
      return [
        asset.asset_name,
        asset.manufacturer,
        asset.model,
        asset.serial_number,
        product?.name,
        product?.item_code,
        order?.order_number,
        invoice?.invoice_number,
      ].some((value) => (value ?? "").toLocaleLowerCase().includes(query));
    });
  }, [assets, invoices, orders, products, search, statusFilter]);

  const visibleAssetIds = useMemo(() => new Set(assets.map((asset) => asset.id)), [assets]);
  const previousOwnershipEvents = useMemo(
    () => events.filter((event) => event.event_type === "ownership_transferred" && !visibleAssetIds.has(event.asset_id)),
    [events, visibleAssetIds],
  );

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-7 sm:px-6 lg:px-8" dir="rtl">
      <header className="rounded-2xl border bg-card p-5 sm:p-7">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <span className="rounded-xl bg-primary/10 p-3 text-primary"><Laptop size={25} /></span>
            <div>
              <h1 className="text-2xl font-bold">أجهزتي وأصولي</h1>
              <p className="mt-1 max-w-2xl text-sm leading-6 text-muted-foreground">
                سجل أجهزتك المرتبطة بحسابك، مع مصادر الشراء والضمان والتغطية وسجل الصيانة والملكية.
                هذه الصفحة للعرض فقط؛ تتم طلبات التسجيل والتعديل ونقل الملكية عبر إدارة المتجر.
              </p>
            </div>
          </div>
          <button type="button" className="btn secondary inline-flex items-center gap-2" onClick={() => void load()} disabled={loading}>
            <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
            {loading ? "جار التحديث..." : "تحديث السجل"}
          </button>
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-[minmax(0,1fr)_220px]">
          <label className="relative block">
            <span className="sr-only">البحث في أجهزتي</span>
            <Search size={17} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="ابحث باسم الجهاز أو الشركة أو الموديل أو الرقم التسلسلي أو رقم المصدر"
              className="w-full rounded-lg border bg-background py-2.5 pr-10 pl-3 text-sm"
              maxLength={120}
            />
          </label>
          <label className="block">
            <span className="sr-only">تصفية حالة الجهاز</span>
            <select
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value as AssetStatus | "all")}
              className="w-full rounded-lg border bg-background px-3 py-2.5 text-sm"
            >
              {STATUS_FILTERS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
          </label>
        </div>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
          <span>{filteredAssets.length} جهاز ظاهر من أصل {assets.length}</span>
          <span className="inline-flex items-center gap-1"><ShieldCheck size={14} /> بيانات الحساب تُحدد بواسطة صلاحيات الخادم</span>
        </div>
      </header>

      {error ? (
        <div className="mt-4 rounded-xl border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive" role="alert">
          <p>{error}</p>
          <button type="button" className="mt-2 underline" onClick={() => void load()}>إعادة المحاولة</button>
        </div>
      ) : null}
      {warning ? <p className="mt-4 rounded-xl border p-3 text-sm text-muted-foreground" role="status">{warning}</p> : null}
      {loading ? (
        <div className="mt-5 rounded-xl border bg-card p-8 text-center text-sm text-muted-foreground" role="status">
          جار تحميل الأجهزة وسجل الأحداث...
        </div>
      ) : null}
      {!loading && !error && assets.length === 0 ? (
        <section className="mt-5 rounded-2xl border bg-card p-8 text-center">
          <Laptop size={34} className="mx-auto text-muted-foreground" />
          <h2 className="mt-3 text-lg font-bold">لا توجد أجهزة مسجلة حاليًا</h2>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            لم يُسجل جهاز مرتبط بحسابك بعد. تواصل مع خدمة العملاء عند الحاجة إلى إضافة جهاز أو إثبات ملكيته.
          </p>
        </section>
      ) : null}
      {!loading && !error && assets.length > 0 && filteredAssets.length === 0 ? (
        <p className="mt-5 rounded-xl border bg-card p-6 text-center text-sm text-muted-foreground" role="status">
          لا توجد أجهزة تطابق البحث أو حالة التصفية المحددة.
        </p>
      ) : null}

      <section className="mt-5 grid gap-4" aria-label="قائمة الأجهزة">
        {filteredAssets.map((asset) => {
          const product = asset.product_id ? products[asset.product_id] : undefined;
          const order = asset.source_order_id ? orders[asset.source_order_id] : undefined;
          const invoice = asset.source_invoice_id ? invoices[asset.source_invoice_id] : undefined;
          const assetEvents = eventsByAsset[asset.id] ?? [];

          return (
            <article key={asset.id} className="overflow-hidden rounded-2xl border bg-card">
              <div className="flex flex-wrap items-start justify-between gap-3 border-b p-4 sm:p-5">
                <div className="min-w-0">
                  <h2 className="break-words text-lg font-bold">{asset.asset_name}</h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {[asset.manufacturer, asset.model].filter(Boolean).join(" · ") || "الشركة المصنعة والموديل غير مثبتين"}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground" dir="auto">
                    الرقم التسلسلي: {asset.serial_number || "غير مسجل"}
                  </p>
                </div>
                <span className="rounded-full border px-3 py-1.5 text-xs font-semibold">
                  {STATUS_LABELS[asset.status] ?? "حالة غير معروفة"}
                </span>
              </div>

              <div className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-3 sm:p-5">
                <div className="min-w-0 rounded-lg bg-muted/30 p-3">
                  <div className="flex items-center gap-2 text-xs text-muted-foreground"><Package size={15} /> الصنف المرتبط</div>
                  <p className="mt-1 break-words text-sm font-medium">{product?.name || "غير مرتبط بصنف ظاهر"}</p>
                  {product?.item_code ? <p className="mt-1 text-xs text-muted-foreground" dir="ltr">{product.item_code}</p> : null}
                </div>
                <div className="min-w-0 rounded-lg bg-muted/30 p-3">
                  <div className="flex items-center gap-2 text-xs text-muted-foreground"><FileText size={15} /> الطلب المصدر</div>
                  <p className="mt-1 break-words text-sm font-medium">
                    {asset.source_order_id ? order?.order_number || "طلب مرتبط؛ مرجعه غير متاح" : "لا يوجد طلب مصدر مسجل"}
                  </p>
                </div>
                <div className="min-w-0 rounded-lg bg-muted/30 p-3">
                  <div className="flex items-center gap-2 text-xs text-muted-foreground"><ReceiptText size={15} /> الفاتورة المصدرية</div>
                  <p className="mt-1 break-words text-sm font-medium">
                    {asset.source_invoice_id ? invoice?.invoice_number || "فاتورة مرتبطة؛ مرجعها غير متاح" : "لا توجد فاتورة مصدر مسجلة"}
                  </p>
                </div>
                <div className="rounded-lg border p-3">
                  <div className="flex items-center gap-2 text-xs text-muted-foreground"><CalendarDays size={15} /> تاريخ الشراء</div>
                  <p className="mt-1 text-sm font-semibold">{formatDate(asset.purchase_date)}</p>
                </div>
                <div className="rounded-lg border p-3">
                  <div className="flex items-center gap-2 text-xs text-muted-foreground"><ShieldCheck size={15} /> الضمان</div>
                  <p className="mt-1 text-sm font-semibold">{asset.warranty_provider || "مزود الضمان غير مثبت"}</p>
                  <p className="mt-1 break-words text-xs text-muted-foreground">المرجع: {asset.warranty_reference || "غير مثبت"}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{formatDate(asset.warranty_start_date)} — {formatDate(asset.warranty_end_date)}</p>
                </div>
                <div className="rounded-lg border p-3">
                  <div className="flex items-center gap-2 text-xs text-muted-foreground"><ShieldCheck size={15} /> التغطية</div>
                  <p className="mt-1 break-words text-sm font-semibold">{asset.coverage_reference || "مرجع التغطية غير مثبت"}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{formatDate(asset.coverage_start_date)} — {formatDate(asset.coverage_end_date)}</p>
                </div>
              </div>

              <details className="border-t">
                <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-3 text-sm font-semibold hover:bg-muted/30 sm:px-5">
                  <Wrench size={16} /> سجل الصيانة والأحداث والملكية ({assetEvents.length})
                </summary>
                <div className="grid gap-3 border-t bg-muted/10 p-4 sm:p-5">
                  {assetEvents.length ? assetEvents.map((event) => (
                    <div key={event.id} className="rounded-lg border bg-card p-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <strong className="text-sm">{EVENT_LABELS[event.event_type] || event.summary}</strong>
                        <time className="text-xs text-muted-foreground" dateTime={event.event_at}>{formatDateTime(event.event_at)}</time>
                      </div>
                      <p className="mt-2 text-sm leading-6">{event.reason}</p>
                      {event.details ? <p className="mt-1 whitespace-pre-wrap text-sm leading-6 text-muted-foreground">{event.details}</p> : null}
                      {event.reference ? <p className="mt-1 break-words text-xs text-muted-foreground">المرجع: {event.reference}</p> : null}
                      {event.old_status || event.new_status ? (
                        <p className="mt-1 text-xs text-muted-foreground">
                          الحالة: {event.old_status ? STATUS_LABELS[event.old_status] : "—"} ← {event.new_status ? STATUS_LABELS[event.new_status] : "—"}
                        </p>
                      ) : null}
                    </div>
                  )) : <p className="text-sm text-muted-foreground">لا توجد أحداث مسجلة لهذا الجهاز.</p>}
                </div>
              </details>
            </article>
          );
        })}
      </section>

      {!loading && previousOwnershipEvents.length > 0 ? (
        <section className="mt-6 rounded-2xl border bg-card p-4 sm:p-5" aria-label="سجل الملكية السابقة">
          <h2 className="text-base font-bold">سجل ملكية أجهزة سابقة</h2>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">
            أحداث محفوظة لأصول كانت مرتبطة بحسابك ثم نُقلت ملكيتها. لا تعرض السجلات بيانات المالك الآخر.
          </p>
          <div className="mt-3 grid gap-3">
            {previousOwnershipEvents.map((event) => (
              <article key={event.id} className="rounded-lg border p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <strong className="text-sm">نقل ملكية أصل</strong>
                  <time className="text-xs text-muted-foreground" dateTime={event.event_at}>{formatDateTime(event.event_at)}</time>
                </div>
                <p className="mt-2 text-sm">{event.reason}</p>
                {event.reference ? <p className="mt-1 break-words text-xs text-muted-foreground">المرجع: {event.reference}</p> : null}
              </article>
            ))}
          </div>
        </section>
      ) : null}
    </main>
  );
}
