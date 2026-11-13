import { AlertTriangle, Database, GitBranch, ScrollText, ShieldAlert } from "lucide-react";
import { REFERENCE_SOURCE_READINESS } from "@/lib/reference-model/observability/source-readiness";

const icons = {
  ai_audit: ScrollText,
  prompt_persistence: ShieldAlert,
  error_log: AlertTriangle,
  developer_tools: GitBranch,
} as const;

export function SourceBoundaryStatusPanel() {
  return (
    <section dir="rtl" aria-label="حالة عقود مصادر الوظائف المرجعية" className="space-y-3 rounded-xl border p-4">
      <header className="flex items-start gap-3">
        <Database size={20} aria-hidden="true" className="mt-0.5 text-muted-foreground" />
        <div>
          <h2 className="text-lg font-semibold">حالة عقود مصادر الوظائف المرجعية</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            حالات موثقة بحسب العقود الموجودة في الشفرة؛ لا تعرض هذه اللوحة بيانات تشغيل أو سجلات افتراضية.
          </p>
        </div>
      </header>
      <div className="grid gap-3 lg:grid-cols-2">
        {REFERENCE_SOURCE_READINESS.map((item) => {
          const Icon = icons[item.id];
          return (
            <article key={item.id} className="min-w-0 rounded-lg border p-3">
              <div className="flex items-start gap-2">
                <Icon size={17} aria-hidden="true" className="mt-0.5 shrink-0 text-amber-700" />
                <div className="min-w-0 flex-1">
                  <h3 className="font-semibold">{item.title}</h3>
                  <p className="mt-1 text-xs font-semibold break-all" dir="ltr">{item.status}</p>
                  <code className="mt-2 block break-all text-xs text-muted-foreground" dir="ltr">{item.source}</code>
                  <p className="mt-2 text-sm leading-6 text-muted-foreground">{item.detail}</p>
                </div>
              </div>
            </article>
          );
        })}
      </div>
      <p className="text-xs leading-6 text-muted-foreground">
        BLOCKED تعني أن العقد اللازم غير موجود أو غير آمن للعرض، ولا تعني أن الميزة ناجحة أو متاحة. لا توجد أزرار إنشاء أو اعتماد أو حذف في هذه اللوحة.
      </p>
    </section>
  );
}
