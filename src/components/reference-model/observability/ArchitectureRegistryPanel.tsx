import { useMemo } from "react";
import { getCurrentArchitectureRegistry } from "@/lib/reference-model/observability/architecture-registry";

const surfaceLabels = {
  ADMIN: "إدارة",
  API: "واجهة API",
  PUBLIC: "واجهة عامة",
} as const;

export function ArchitectureRegistryPanel() {
  const registry = useMemo(() => getCurrentArchitectureRegistry(), []);
  const adminCount = registry.routes.filter((route) => route.surface === "ADMIN").length;
  const apiCount = registry.routes.filter((route) => route.surface === "API").length;
  const publicCount = registry.routes.filter((route) => route.surface === "PUBLIC").length;

  return (
    <section
      dir="rtl"
      aria-labelledby="architecture-registry-title"
      className="space-y-4"
    >
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <h2 id="architecture-registry-title" className="text-lg font-semibold">
            سجل معمارية التطبيق
          </h2>
          <p className="text-sm text-muted-foreground">
            جرد قراءة فقط مشتق من شجرة المسارات الفعلية في TanStack Router وسجل مجموعات الإدارة الحالي.
          </p>
        </div>
        <span className="rounded-md border px-3 py-1.5 text-sm font-medium" aria-label="عدد المسارات المسجلة">
          {registry.routes.length} مساراً
        </span>
      </header>

      <div className="grid gap-2 sm:grid-cols-3" aria-label="توزيع المسارات">
        <div className="rounded-lg border p-3">
          <p className="text-xs text-muted-foreground">مسارات الإدارة</p>
          <p className="text-xl font-semibold tabular-nums">{adminCount}</p>
        </div>
        <div className="rounded-lg border p-3">
          <p className="text-xs text-muted-foreground">واجهات API</p>
          <p className="text-xl font-semibold tabular-nums">{apiCount}</p>
        </div>
        <div className="rounded-lg border p-3">
          <p className="text-xs text-muted-foreground">المسارات العامة</p>
          <p className="text-xl font-semibold tabular-nums">{publicCount}</p>
        </div>
      </div>

      {registry.warnings.length > 0 ? (
        <p role="status" className="rounded-md border border-amber-500/40 p-3 text-sm">
          تعذر توثيق بعض عناصر شجرة المسارات: {registry.warnings.join("، ")}
        </p>
      ) : null}

      {registry.routes.length === 0 ? (
        <p className="rounded-md border p-4 text-sm text-muted-foreground">
          لم تُقرأ مسارات من شجرة الراوتر الحالية.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <table
            className="w-full min-w-[680px] text-right text-sm"
            aria-label="المسارات المسجلة في TanStack Router"
          >
            <thead className="bg-muted/50">
              <tr>
                <th scope="col" className="px-3 py-2 font-medium">معرّف المسار</th>
                <th scope="col" className="px-3 py-2 font-medium">المسار</th>
                <th scope="col" className="px-3 py-2 font-medium">السطح</th>
                <th scope="col" className="px-3 py-2 font-medium">مجموعة الإدارة</th>
                <th scope="col" className="px-3 py-2 font-medium">المعاملات الديناميكية</th>
              </tr>
            </thead>
            <tbody>
              {registry.routes.map((route) => (
                <tr key={route.routeId} className="border-t">
                  <td className="px-3 py-2"><code dir="ltr">{route.routeId}</code></td>
                  <td className="px-3 py-2"><code dir="ltr">{route.path}</code></td>
                  <td className="px-3 py-2">{surfaceLabels[route.surface]}</td>
                  <td className="px-3 py-2">
                    {route.navigationGroup?.label ??
                      (route.surface === "ADMIN" ? "غير مصنف في قائمة الإدارة" : "—")}
                  </td>
                  <td className="px-3 py-2 tabular-nums">{route.dynamicSegmentCount}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="text-xs leading-6 text-muted-foreground">
        هذا السجل يصف المسارات المعلنة في الشفرة فقط؛ لا يثبت نشرها أو إتاحتها للمستخدم أو صلاحيات الوصول إليها أو صحة خدماتها الخلفية. تظل صلاحيات الخادم وسياسات RLS هي المرجع النهائي.
      </p>
    </section>
  );
}
