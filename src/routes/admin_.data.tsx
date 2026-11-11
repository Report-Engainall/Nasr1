import { createFileRoute, ClientOnly } from "@tanstack/react-router";
import { LazyAdminApp as AdminApp } from "@/components/LazyAdminApp";
import { AdminRouteFallback } from "@/components/AdminRouteFallback";
import { OnyxInventoryReconciliationWorkspace } from "@/components/OnyxInventoryReconciliationWorkspace";

export const Route = createFileRoute("/admin_/data")({
  head: () => ({ meta: [{ title: "مركز البيانات | الأغبري" }, { name: "robots", content: "noindex" }] }),
  component: () => (
    <ClientOnly fallback={<AdminRouteFallback />}>
      <>
        <AdminApp initialView="data" />
        <OnyxInventoryReconciliationWorkspace />
      </>
    </ClientOnly>
  ),
});
