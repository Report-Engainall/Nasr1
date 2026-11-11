import { createFileRoute, ClientOnly } from "@tanstack/react-router";
import { LazyAdminApp as AdminApp } from "@/components/LazyAdminApp";
import { AdminRouteFallback } from "@/components/AdminRouteFallback";

export const Route = createFileRoute("/admin_/service-desk")({
  head: () => ({
    meta: [
      { title: "مركز خدمة العملاء | متجر الأغبري" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: () => <ClientOnly fallback={<AdminRouteFallback />}><AdminApp initialView="service-desk" /></ClientOnly>,
});
