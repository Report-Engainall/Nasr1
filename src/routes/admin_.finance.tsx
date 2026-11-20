import { createFileRoute, ClientOnly } from "@tanstack/react-router";
import { LazyAdminApp as AdminApp } from "@/components/LazyAdminApp";
import { AdminRouteFallback } from "@/components/AdminRouteFallback";
import { CustomerReturnOperationsDrawer } from "@/components/CustomerReturnOperationsDrawer";

export const Route = createFileRoute("/admin_/finance")({
  head: () => ({ meta: [{ title: "الفواتير والتحصيل | لوحة الإدارة" }, { name: "robots", content: "noindex" }] }),
  component: () => (
    <ClientOnly fallback={<AdminRouteFallback />}>
      <>
        <AdminApp initialView="finance" />
        <CustomerReturnOperationsDrawer workflow="finance" />
      </>
    </ClientOnly>
  ),
});
