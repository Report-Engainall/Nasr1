import { createFileRoute, ClientOnly } from "@tanstack/react-router";
import { LazyAdminApp as AdminApp } from "@/components/LazyAdminApp";
import { AdminRouteFallback } from "@/components/AdminRouteFallback";

export const Route = createFileRoute("/admin_/engine-status")({
  head: () => ({ meta: [{ title: "حالة المحركات | الأغبري" }, { name: "robots", content: "noindex" }] }),
  component: () => <ClientOnly fallback={<AdminRouteFallback />}><AdminApp initialView="engine-status" /></ClientOnly>,
});
