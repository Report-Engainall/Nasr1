import { ClientOnly, createFileRoute, useNavigate } from "@tanstack/react-router";
import { Storefront } from "@/components/Storefront";
import { MAX_CATALOG_SEARCH_LENGTH } from "@/lib/commerce-utils";

const CATALOG_BRAND_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
type CatalogSearch = { q?: string; category?: string; available?: "1"; brand?: string; unit?: string; priced?: "1" };

export const Route = createFileRoute("/catalog")({
  validateSearch: (search: Record<string, unknown>): CatalogSearch => {
    const parsed: CatalogSearch = {};
    if (typeof search.q === "string" && search.q.trim()) parsed.q = search.q.slice(0, MAX_CATALOG_SEARCH_LENGTH);
    if (typeof search.category === "string" && search.category.trim()) parsed.category = search.category.slice(0, 128);
    if (search.available === "1") parsed.available = "1";
    if (typeof search.brand === "string" && CATALOG_BRAND_ID.test(search.brand)) parsed.brand = search.brand;
    if (typeof search.unit === "string" && search.unit.trim() && search.unit.trim().length <= 40) parsed.unit = search.unit.trim();
    if (search.priced === "1") parsed.priced = "1";
    return parsed;
  },
  head: () => ({
    meta: [
      { title: "الكتالوج | متجر الأغبري" },
      { name: "description", content: "كتالوج حي لأصناف متجر الأغبري مع بحث وتصنيف وفق بيانات الخادم." },
    ],
  }),
  component: CatalogPage,
});

function CatalogLoadingState() {
  return (
    <main className="storefront" dir="rtl" role="status">
      جار تحميل الكتالوج...
    </main>
  );
}

type CatalogStorefrontProps = {
  query: string;
  categoryId?: string;
  availableOnly: boolean;
  brandId?: string;
  unit?: string;
  priceDisplayableOnly: boolean;
  onExit: () => void;
};

function CatalogStorefront({ query, categoryId, availableOnly, brandId, unit, priceDisplayableOnly, onExit }: CatalogStorefrontProps) {
  return (
    <Storefront
      initialQuery={query}
      initialCategoryId={categoryId}
      initialAvailableOnly={availableOnly}
      initialBrandId={brandId}
      initialUnit={unit}
      initialPriceDisplayableOnly={priceDisplayableOnly}
      onExit={onExit}
    />
  );
}

function CatalogPage() {
  const navigate = useNavigate();
  const { q, category, available, brand, unit, priced } = Route.useSearch();
  const onExit = () => void navigate({ to: "/admin" });

  return (
    <ClientOnly fallback={<CatalogLoadingState />}>
      <CatalogStorefront
        query={q ?? ""}
        categoryId={category}
        availableOnly={available === "1"}
        brandId={brand}
        unit={unit}
        priceDisplayableOnly={priced === "1"}
        onExit={onExit}
      />
    </ClientOnly>
  );
}
