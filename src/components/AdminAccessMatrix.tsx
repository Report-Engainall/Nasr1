import { useMemo, useState } from "react";
import {
  ADMIN_ACCESS_ROLES, ADMIN_NAV_GROUPS, ADMIN_OPERATION_RULES,
  pageAccessReason, operationAllowed, operationDenialReason,
  type AdminRoleId,
} from "@/lib/admin-access-matrix";

export function AdminAccessMatrix() {
  const [selectedRole, setSelectedRole] = useState<AdminRoleId>("admin");
  const role = ADMIN_ACCESS_ROLES.find((item) => item.id === selectedRole) ?? ADMIN_ACCESS_ROLES[0];
  const pages = useMemo(() => ADMIN_NAV_GROUPS.flatMap((group) => group.views.map((view) => ({
    group: group.label, view, reason: pageAccessReason(selectedRole, view),
    allowed: pageAccessReason(selectedRole, view).startsWith("مسموح"),
  }))), [selectedRole]);
  const allowedPages = pages.filter((item) => item.allowed).length;
  const labels: Record<string, string> = {
    dashboard: "لوحة المعلومات", products: "المنتجات", customers: "العملاء", "service-desk": "خدمة العملاء",
    orders: "الطلبات", pricing: "التسعير والمخزون", "stock-count": "الجرد الفعلي",
    "inventory-transfers": "تحويلات المخزون", offers: "العروض", suppliers: "الموردون",
    "purchase-orders": "أوامر الشراء", devices: "الأجهزة والجلسات", reports: "التقارير",
    intelligence: "ذكاء الأعمال والتحصيلات", ai: "مركز الذكاء", notifications: "التنبيهات",
    data: "مركز البيانات", operations: "العمليات الذكية", settings: "الإعدادات",
    quotes: "عروض الأسعار", finance: "الفواتير والتحصيل", tasks: "المهام التشغيلية والطباعة",
    audit: "سجل التدقيق",
  };

  return (
    <section dir="rtl" className="mt-6 space-y-4 rounded-xl border border-slate-200 bg-white p-4" aria-labelledby="admin-access-matrix-title">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id="admin-access-matrix-title" className="text-lg font-semibold">مصفوفة الوصول والعمليات حسب الدور</h2>
          <p className="mt-1 max-w-3xl text-sm text-slate-600">
            عرض تفسيري موحد لحدود الواجهة والعمليات الحالية. لا ينشئ دورًا ولا يمنح صلاحية؛
            الخادم وواجهات RPC وسياسات RLS هي المرجع التنفيذي النهائي.
          </p>
        </div>
        <label className="grid min-w-48 gap-1 text-sm font-medium">
          الدور محل المراجعة
          <select aria-label="الدور محل المراجعة" className="rounded-lg border border-slate-300 bg-white px-3 py-2"
            value={selectedRole} onChange={(event) => setSelectedRole(event.target.value as AdminRoleId)}>
            {ADMIN_ACCESS_ROLES.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
          </select>
        </label>
      </header>

      <div className="grid gap-3 sm:grid-cols-3">
        <article className="rounded-lg border p-3"><p className="text-xs text-slate-500">الدور</p><strong>{role.label}</strong><p className="mt-1 text-xs text-slate-600">{role.scope}</p></article>
        <article className="rounded-lg border p-3"><p className="text-xs text-slate-500">المساحات المتاحة</p><strong className="text-2xl tabular-nums">{allowedPages}</strong><p className="text-xs text-slate-600">من {pages.length} مساحة إدارية</p></article>
        <article className="rounded-lg border p-3"><p className="text-xs text-slate-500">نطاق الدور</p><p className="mt-1 text-sm">{role.summary}</p></article>
      </div>

      <section className="space-y-3" aria-label="الصفحات المتاحة والممنوعة">
        <h3 className="font-semibold">الوصول إلى الصفحات</h3>
        {ADMIN_NAV_GROUPS.map((group) => <div key={group.id} className="rounded-lg border p-3">
          <h4 className="mb-2 text-sm font-semibold">{group.label}</h4>
          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
            {pages.filter((item) => item.group === group.label).map((item) => <article key={item.view} className="rounded-md bg-slate-50 p-2 text-sm">
              <div className="flex items-center justify-between gap-2"><strong>{labels[item.view] ?? item.view}</strong>
                <span className={item.allowed ? "whitespace-nowrap rounded-full bg-emerald-50 px-2 py-0.5 text-xs text-emerald-800" : "whitespace-nowrap rounded-full bg-rose-50 px-2 py-0.5 text-xs text-rose-800"}>
                  {item.allowed ? "مسموح" : "ممنوع"}
                </span>
              </div>
              {!item.allowed && <p className="mt-1 text-xs leading-5 text-slate-600">{item.reason}</p>}
            </article>)}
          </div>
        </div>)}
      </section>

      <section className="space-y-3" aria-label="العمليات وحدود التعديل">
        <h3 className="font-semibold">العمليات وحدود تعديل الأسعار والمخزون والمالية</h3>
        <div className="overflow-x-auto rounded-lg border">
          <table className="min-w-[760px] w-full border-collapse text-sm">
            <thead className="bg-slate-50 text-right"><tr><th className="p-3">المجال / العملية</th><th className="p-3">القرار</th><th className="p-3">الحد أو سبب الرفض</th></tr></thead>
            <tbody>{ADMIN_OPERATION_RULES.map((item) => {
              const allowed = operationAllowed(selectedRole, item.id);
              return <tr key={item.id} className="border-t align-top">
                <td className="p-3"><strong>{item.label}</strong><span className="mt-1 block text-xs text-slate-500">{item.area}</span></td>
                <td className="p-3"><span className={allowed ? "rounded-full bg-emerald-50 px-2 py-1 text-xs text-emerald-800" : "rounded-full bg-rose-50 px-2 py-1 text-xs text-rose-800"}>{allowed ? "مسموح" : "ممنوع"}</span></td>
                <td className="max-w-xl p-3 leading-6 text-slate-700">{allowed ? item.limit : operationDenialReason(selectedRole, item.id)}</td>
              </tr>;
            })}</tbody>
          </table>
        </div>
      </section>
      <p className="rounded-lg bg-slate-50 p-3 text-xs leading-5 text-slate-600">
        أسباب الرفض هنا على مستوى الدور فقط. الرفض الفعلي قد يتعلق بالمؤسسة أو المستودع أو حالة السجل أو الموافقة أو نقص السبب؛
        رسالة الخادم في كل إجراء تظل السبب التشغيلي الدقيق.
      </p>
    </section>
  );
}
