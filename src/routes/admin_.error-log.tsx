import { createFileRoute, ClientOnly } from "@tanstack/react-router";
import { LazyAdminApp as AdminApp } from "@/components/LazyAdminApp";
import { AdminRouteFallback } from "@/components/AdminRouteFallback";

export const Route = createFileRoute("/admin_/error-log")({
  head: () => ({ meta: [{ title: "سجل الأخطاء | الأغبري" }, { name: "robots", content: "noindex" }] }),
  component: () => <ClientOnly fallback={<AdminRouteFallback />}><AdminApp initialView="error-log" /></ClientOnly>,
});
