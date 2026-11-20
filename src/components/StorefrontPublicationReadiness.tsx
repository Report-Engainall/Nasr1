import { useCallback, useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { AlertTriangle, CheckCircle2, Package, RefreshCw, Store, Tags, Warehouse } from "lucide-react";
import { supabase } from "@/lib/supabase";

type PublicationReadiness = {
  publicationEnabled: boolean;
  readyToPublish: boolean;
  productCount: number;
  activeProductCount: number;
  categoryCount: number;
  activeCategoryCount: number;
  activeWarehouseCount: number;
  selectedWarehouseName: string | null;
  selectedWarehouseActive: boolean;
  blockers: string[];
  updatedAt: string | null;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function nonNegativeInteger(value: unknown, field: string): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
    throw new Error("أعاد الخادم قيمة غير صالحة للحقل: " + field);
  }
  return value;
}

function readPublicationReadiness(value: unknown): PublicationReadiness {
  if (!isRecord(value) || !isRecord(value.counts) || !Array.isArray(value.blockers) ||
      typeof value.publication_enabled !== "boolean" ||
      typeof value.ready_to_publish !== "boolean" ||
      typeof value.selected_warehouse_active !== "boolean") {
    throw new Error("استجابة جاهزية نشر المتجر غير مكتملة.");
  }

  const blockers = value.blockers.map((item) => {
    if (typeof item !== "string" || !item.trim()) {
      throw new Error("أعاد الخادم سبب تعطيل غير صالح.");
    }
    return item;
  });

  const selectedWarehouseName =
    typeof value.selected_warehouse_name === "string" && value.selected_warehouse_name.trim()
      ? value.selected_warehouse_name.trim()
      : null;
  const updatedAt =
    typeof value.updated_at === "string" && Number.isFinite(Date.parse(value.updated_at))
      ? value.updated_at
      : null;

  return {
    publicationEnabled: value.publication_enabled,
    readyToPublish: value.ready_to_publish,
    productCount: nonNegativeInteger(value.counts.products, "products"),
    activeProductCount: nonNegativeInteger(value.counts.active_products, "active_products"),
    categoryCount: nonNegativeInteger(value.counts.categories, "categories"),
    activeCategoryCount: nonNegativeInteger(value.counts.active_categories, "active_categories"),
    activeWarehouseCount: nonNegativeInteger(value.counts.active_warehouses, "active_warehouses"),
    selectedWarehouseName,
    selectedWarehouseActive: value.selected_warehouse_active,
    blockers,
    updatedAt,
  };
}

function Metric({ label, value, icon: Icon }: {
  label: string;
  value: number;
  icon: typeof Package;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm text-slate-600">{label}</span>
        <Icon size={18} className="text-slate-500" aria-hidden="true" />
      </div>
      <div className="mt-2 text-2xl font-bold tabular-nums text-slate-900">{value.toLocaleString("ar")}</div>
    </div>
  );
}

export function StorefrontPublicationReadiness() {
  const [status, setStatus] = useState<PublicationReadiness | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data, error: rpcError } = await supabase.rpc("get_admin_storefront_publication_status");
      if (rpcError) throw rpcError;
      setStatus(readPublicationReadiness(data));
    } catch {
      setError("تعذر قراءة حالة نشر المتجر من الخادم. تحقق من اتصال قاعدة البيانات وصلاحية المدير، ثم أعد المحاولة.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load, revision]);

  return (
    <section dir="rtl" aria-labelledby="storefront-publication-readiness-title"
      className="mt-6 rounded-2xl border border-slate-200 bg-slate-50 p-4 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="rounded-xl bg-emerald-50 p-2 text-emerald-800">
            <Store size={22} aria-hidden="true" />
          </div>
          <div>
            <h2 id="storefront-publication-readiness-title" className="text-lg font-bold text-slate-900">
              جاهزية نشر واجهة العميل
            </h2>
            <p className="mt-1 max-w-2xl text-sm leading-6 text-slate-600">
              تشخيص مباشر لسبب ظهور كتالوج فارغ، والتحقق من متطلبات نشر البطاقات دون تغيير إعدادات المتجر.
            </p>
          </div>
        </div>
        <button type="button" onClick={() => setRevision((value) => value + 1)} disabled={loading}
          className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 disabled:opacity-50">
          <RefreshCw size={15} className={loading ? "animate-spin" : ""} aria-hidden="true" />
          تحديث الحالة
        </button>
      </div>

      {loading && (
        <div role="status" className="mt-5 rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-600">
          جارٍ قراءة حالة الكتالوج والنشر...
        </div>
      )}

      {error && (
        <div role="alert" className="mt-5 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">
          <p>{error}</p>
          <button type="button" onClick={() => setRevision((value) => value + 1)}
            className="mt-3 rounded-lg border border-rose-300 px-3 py-1.5 font-semibold">
            إعادة المحاولة
          </button>
        </div>
      )}

      {status && !loading && !error && (
        <>
          <div className="mt-5 flex flex-wrap items-center gap-2">
            <span className={"inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-sm font-bold " +
              (status.publicationEnabled ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-900")}>
              <span className={"h-2 w-2 rounded-full " + (status.publicationEnabled ? "bg-emerald-600" : "bg-amber-600")} />
              {status.publicationEnabled ? "النشر العام مفعّل" : "النشر العام متوقف"}
            </span>
            <span className={"inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-sm font-bold " +
              (status.readyToPublish ? "bg-emerald-100 text-emerald-800" : "bg-rose-100 text-rose-800")}>
              {status.readyToPublish ? <CheckCircle2 size={15} /> : <AlertTriangle size={15} />}
              {status.readyToPublish ? "المتطلبات الأساسية مكتملة" : "الكتالوج غير جاهز للنشر"}
            </span>
          </div>

          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Metric label="كل المنتجات" value={status.productCount} icon={Package} />
            <Metric label="المنتجات النشطة" value={status.activeProductCount} icon={Package} />
            <Metric label="التصنيفات النشطة" value={status.activeCategoryCount} icon={Tags} />
            <Metric label="المستودعات النشطة" value={status.activeWarehouseCount} icon={Warehouse} />
          </div>

          <div className="mt-4 rounded-xl border border-slate-200 bg-white p-4">
            <h3 className="font-bold text-slate-900">مصدر مخزون واجهة العميل</h3>
            <p className="mt-1 text-sm text-slate-600">
              {status.selectedWarehouseName
                ? "المستودع المحدد: " + status.selectedWarehouseName
                : "لم يتم تحديد مستودع لقراءة التوفر في المتجر العام."}
              {status.selectedWarehouseName && !status.selectedWarehouseActive
                ? " — المستودع المحدد غير نشط أو غير متاح للمؤسسة."
                : ""}
            </p>
          </div>

          <div className="mt-4 rounded-xl border border-slate-200 bg-white p-4">
            <h3 className="font-bold text-slate-900">ما يمنع ظهور البطاقات أو النشر</h3>
            {status.blockers.length ? (
              <ul className="mt-3 space-y-2 text-sm leading-6 text-slate-700">
                {status.blockers.map((blocker, index) => (
                  <li key={index} className="flex items-start gap-2">
                    <AlertTriangle size={16} className="mt-1 shrink-0 text-amber-700" aria-hidden="true" />
                    <span>{blocker}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-2 text-sm text-emerald-800">لا توجد فجوات في متطلبات الجاهزية الأساسية.</p>
            )}
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            <Link to="/admin/products" className="rounded-lg bg-emerald-800 px-4 py-2 text-sm font-bold text-white">
              إدارة المنتجات والأسعار
            </Link>
            <Link to="/admin/data" className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-bold text-slate-700">
              مركز الاستيراد والبيانات
            </Link>
          </div>

          <p className="mt-4 text-xs leading-5 text-slate-500">
            هذه لوحة تشخيص للقراءة فقط. لا تنشر منتجات، ولا تغيّر المستودع، ولا تفعّل العرض العام، ولا تعدّل الأسعار أو المخزون.
            {status.updatedAt ? " آخر تحديث لإعداد النشر: " + new Date(status.updatedAt).toLocaleString("ar") : ""}
          </p>
        </>
      )}
    </section>
  );
}
