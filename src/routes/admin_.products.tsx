import { createFileRoute, ClientOnly } from "@tanstack/react-router";
import { LazyAdminApp as AdminApp } from "@/components/LazyAdminApp";

import { AdminRouteFallback } from "@/components/AdminRouteFallback";
export const Route = createFileRoute("/admin_/products")({
  head: () => ({ meta: [{ title: "إدارة المنتجات | الأغبري" }, { name: "robots", content: "noindex" }] }),
  component: () => <ClientOnly fallback={<AdminRouteFallback />}><AdminApp initialView="products" /></ClientOnly>,
});
