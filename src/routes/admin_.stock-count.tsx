import { ClientOnly, createFileRoute } from "@tanstack/react-router";
import { LazyAdminApp as AdminApp } from "@/components/LazyAdminApp";
import { AdminRouteFallback } from "@/components/AdminRouteFallback";
export const Route = createFileRoute("/admin_/stock-count")({
  head: () => ({ meta: [{ title: "الجرد الفعلي للمخزون | متجر الأغبري" }, { name: "robots", content: "noindex" }] }),
  component: () => <ClientOnly fallback={<AdminRouteFallback />}><AdminApp initialView="stock-count" /></ClientOnly>,
});
