import { ClientOnly, createFileRoute, useNavigate } from "@tanstack/react-router";
import { Storefront } from "@/components/Storefront";
import { useAuth } from "@/lib/auth";

export const Route = createFileRoute("/product/$id")({
  head: () => ({ meta: [{ title: "تفاصيل المنتج | الأغبري" }] }),
  component: ProductPage,
});

function ProductPage() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const { user, ready } = useAuth();
  // A product route is tenant/session-scoped UI state. Remount its storefront subtree
  // whenever authentication identity or effective permissions change so retained
  // product data and other hook state cannot survive an account/role switch.
  const storefrontIdentityKey = JSON.stringify({
    ready,
    userId: user?.id ?? null,
    profileId: user?.profileId ?? null,
    roles: Array.isArray(user?.roles) ? [...user.roles].sort() : [],
    isStaff: user?.isStaff === true,
  });
  return (
    <ClientOnly fallback={<div className="storefront" dir="rtl" role="status">جار تحميل تفاصيل المنتج...</div>}>
      <Storefront key={storefrontIdentityKey} initialView="product" initialProductId={id} onExit={() => void navigate({ to: "/admin" })} />
    </ClientOnly>
  );
}
