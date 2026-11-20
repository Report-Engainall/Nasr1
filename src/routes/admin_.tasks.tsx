import { createFileRoute, ClientOnly } from "@tanstack/react-router";
import { LazyAdminApp as AdminApp } from "@/components/LazyAdminApp";

import { AdminRouteFallback } from "@/components/AdminRouteFallback";
export const Route = createFileRoute("/admin_/tasks")({
  head: () => ({ meta: [{ title: "المهام التشغيلية | متجر الأغبري" }, { name: "robots", content: "noindex" }] }),
  component: () => <ClientOnly fallback={<AdminRouteFallback />}><AdminApp initialView="tasks" /></ClientOnly>,
});
