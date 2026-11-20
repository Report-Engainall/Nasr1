import { lazy, Suspense } from "react";
import type { AdminAppProps } from "@/components/AghbariApp";
import { AdminRouteFallback } from "@/components/AdminRouteFallback";

/**
 * Keep the complete administration workspace out of the storefront's initial
 * JavaScript graph. The large workspace chunk is fetched only when an
 * authorized admin route actually renders it.
 *
 * The route's existing auth guard and server-side RLS/RPC policies remain the
 * authorization boundary; this component is only a loading/performance boundary.
 */
const AdminApp = lazy(async () => {
  const module = await import("@/components/AghbariApp");
  return { default: module.AdminApp };
});

export function LazyAdminApp(props: AdminAppProps) {
  return (
    <Suspense fallback={<AdminRouteFallback />}>
      <AdminApp {...props} />
    </Suspense>
  );
}
