import { ClientOnly, createFileRoute } from "@tanstack/react-router";
import { AsyncExportCenter } from "@/components/AsyncExportCenter";

export const Route = createFileRoute("/admin_/exports")({
  head: () => ({ meta: [{ title: "تصدير الطلبات | متجر الأغبري" }, { name: "robots", content: "noindex" }] }),
  component: () => <ClientOnly fallback={null}><AsyncExportCenter /></ClientOnly>,
});
