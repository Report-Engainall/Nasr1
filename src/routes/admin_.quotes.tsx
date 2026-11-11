import { createFileRoute, ClientOnly } from "@tanstack/react-router";
import { LazyAdminApp as AdminApp } from "@/components/LazyAdminApp";

import { AdminRouteFallback } from "@/components/AdminRouteFallback";
export const Route = createFileRoute("/admin_/quotes")({
  head: () => ({ meta: [{ title: "عروض الأسعار | لوحة الإدارة" }, { name: "robots", content: "noindex" }] }),
  component: () => <ClientOnly fallback={<AdminRouteFallback />}><AdminApp initialView="quotes" /></ClientOnly>,
});
