import { ClientOnly, createFileRoute, useNavigate } from "@tanstack/react-router";
import { Storefront } from "@/components/Storefront";

export const Route = createFileRoute("/products")({
  head: () => ({
    meta: [
      { title: "المنتجات | متجر الأغبري" },
      { name: "description", content: "تصفح كتالوج منتجات متجر الأغبري وابحث بالاسم أو رمز الصنف." },
    ],
  }),
  component: ProductsPage,
});

function ProductsPage() {
  const navigate = useNavigate();
  return (
    <ClientOnly fallback={<div className="storefront" dir="rtl" role="status">جار تحميل كتالوج المنتجات...</div>}>
      <ProductsClient onExit={() => void navigate({ to: "/admin" })} />
    </ClientOnly>
  );
}

function ProductsClient({ onExit }: { onExit: () => void }) {
  const query = typeof window === "undefined" ? "" : new URLSearchParams(window.location.search).get("q") ?? "";
  return <Storefront initialQuery={query} onExit={onExit} />;
}
