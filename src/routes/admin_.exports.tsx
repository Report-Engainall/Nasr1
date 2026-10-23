import { ClientOnly, createFileRoute } from "@tanstack/react-router";
import { AsyncExportCenter } from "@/components/AsyncExportCenter";

function ExportCenterFallback() {
  return (
    <main dir="rtl" className="mx-auto max-w-7xl space-y-6 p-4 md:p-6">
      <header className="border-b border-border pb-5">
        <p className="text-xs font-semibold tracking-wide text-primary">مركز البيانات والتقارير</p>
        <h1 className="mt-1 text-2xl font-bold text-foreground">تصدير الطلبات غير المتزامن</h1>
      </header>
      <div
        role="status"
        aria-live="polite"
        className="rounded-xl border border-border bg-card p-6 text-sm text-muted-foreground"
      >
        جار تجهيز مركز التصدير…
      </div>
    </main>
  );
}

export const Route = createFileRoute("/admin_/exports")({
  head: () => ({ meta: [{ title: "تصدير الطلبات | متجر الأغبري" }, { name: "robots", content: "noindex" }] }),
  component: () => <ClientOnly fallback={<ExportCenterFallback />}><AsyncExportCenter /></ClientOnly>,
});
