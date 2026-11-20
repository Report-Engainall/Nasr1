import { createFileRoute, ClientOnly } from "@tanstack/react-router";
import { LazyAdminApp as AdminApp } from "@/components/LazyAdminApp";
import { AdminRouteFallback } from "@/components/AdminRouteFallback";
import { CustomerReturnOperationsDrawer } from "@/components/CustomerReturnOperationsDrawer";

export const Route = createFileRoute("/admin_/orders")({
  head: () => ({ meta: [{ title: "إدارة الطلبات | الأغبري" }, { name: "robots", content: "noindex" }] }),
  component: () => (
    <ClientOnly fallback={<AdminRouteFallback />}>
      <>
        <AdminApp initialView="orders" />
        <CustomerReturnOperationsDrawer workflow="orders" />
      </>
    </ClientOnly>
  ),
});
