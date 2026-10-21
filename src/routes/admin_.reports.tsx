import { createFileRoute, ClientOnly } from "@tanstack/react-router";
import { AdminApp } from "@/components/AghbariApp";
import { ExecutiveStoreAnalytics } from "@/components/ExecutiveStoreAnalytics";

export const Route = createFileRoute("/admin_/reports")({
  head: () => ({ meta: [{ title: "التقارير | الأغبري" }, { name: "robots", content: "noindex" }] }),
  component: () => (
    <ClientOnly fallback={null}>
      <div>
        <div dir="rtl" className="mx-auto max-w-6xl px-4 pt-4">
          <a href="/admin/exports" className="inline-flex items-center rounded-lg border border-border px-4 py-2 text-sm font-semibold hover:bg-muted">
            مركز تصدير الطلبات CSV
          </a>
        </div>
        <AdminApp initialView="reports" />
        <div dir="rtl" className="mx-auto max-w-6xl px-4 pb-6">
          <ExecutiveStoreAnalytics />
        </div>
      </div>
    </ClientOnly>
  ),
});
