import { Link } from "@tanstack/react-router";
import { ArrowLeft, ChevronLeft, Layers3, RefreshCw } from "lucide-react";
import { Storefront } from "@/components/Storefront";
import { fetchCategories } from "@/lib/api";
import { resolveStorefrontCategorySlug, storefrontCategorySlug } from "@/lib/storefront-slugs";
import { useFetch } from "@/lib/useFetch";

type StoreCategory = Awaited<ReturnType<typeof fetchCategories>>[number];

function CategoryLoadingState() {
  return (
    <main className="storefront" dir="rtl" style={{ minHeight: "100vh", padding: 24 }}>
      <div className="sf-empty" role="status">جار التحقق من التصنيف وتحميل الأصناف المنشورة…</div>
    </main>
  );
}

function CategoryErrorState({ error, onRetry }: { error: string; onRetry: () => void }) {
  return (
    <main className="storefront" dir="rtl" style={{ minHeight: "100vh", padding: 24 }}>
      <div className="sf-empty" role="alert">
        <strong>تعذر تحميل التصنيف</strong>
        <small>{error}</small>
        <button type="button" className="sf-btn-secondary" onClick={onRetry}>إعادة المحاولة</button>
        <Link to="/categories">العودة إلى التصنيفات</Link>
      </div>
    </main>
  );
}

function CategoryNotFoundState() {
  return (
    <main className="storefront" dir="rtl" style={{ minHeight: "100vh", padding: 24 }}>
      <div className="sf-empty" role="status">
        <strong>التصنيف غير موجود</strong>
        <small>لم يُعثر على تصنيف منشور يطابق الرابط؛ قد يكون قد تغير أو أُوقف.</small>
        <Link to="/categories">العودة إلى التصنيفات</Link>
      </div>
    </main>
  );
}

function CategoryPageHeader({
  parent,
  active,
  isSubcategory,
  onRefresh,
}: {
  parent: StoreCategory;
  active: StoreCategory;
  isSubcategory: boolean;
  onRefresh: () => void;
}) {
  return (
    <header
      style={{
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "space-between",
        gap: 14,
        flexWrap: "wrap",
        marginBottom: 18,
      }}
    >
      <div style={{ minWidth: 0 }}>
        <nav
          aria-label="مسار التصنيف"
          style={{ display: "flex", alignItems: "center", gap: 7, flexWrap: "wrap", color: "#64777b", fontSize: 13 }}
        >
          <Link to="/categories" style={{ display: "inline-flex", alignItems: "center", gap: 5, color: "#087f8d", textDecoration: "none" }}>
            <ArrowLeft size={15} aria-hidden="true" />
            جميع التصنيفات
          </Link>
          <ChevronLeft size={14} aria-hidden="true" />
          {isSubcategory ? (
            <>
              <Link
                to={("/category/" + storefrontCategorySlug(parent)) as never}
                style={{ color: "#087f8d", textDecoration: "none", fontWeight: 700 }}
              >
                {parent.name}
              </Link>
              <ChevronLeft size={14} aria-hidden="true" />
            </>
          ) : null}
          <span aria-current="page" style={{ color: "#173b39", fontWeight: 800 }}>{active.name}</span>
        </nav>
        <p style={{ margin: "12px 0 3px", color: "#64777b", fontSize: 13 }}>
          {isSubcategory ? "فرع من " + parent.name : "تصنيف المنتجات"}
        </p>
        <h1 style={{ fontSize: 27, margin: "0 0 6px" }}>{active.name}</h1>
        <p style={{ margin: 0, color: "#526b70" }}>
          تُحمّل الأصناف المنشورة لهذا التصنيف من الكتالوج المرقّم.
        </p>
      </div>
      <button type="button" className="btn outline" onClick={onRefresh}>
        <RefreshCw size={15} /> تحديث البيانات
      </button>
    </header>
  );
}

function SubcategoryList({
  parent,
  categories,
  activeId,
}: {
  parent: StoreCategory;
  categories: StoreCategory[];
  activeId?: string;
}) {
  if (categories.length === 0) return null;

  const isBrowsingSiblings = Boolean(activeId);

  return (
    <section
      aria-label={isBrowsingSiblings ? "التصنيفات الشقيقة" : "التصنيفات الفرعية"}
      style={{ marginBottom: 18 }}
    >
      <h2 style={{ fontSize: 18, marginBottom: 10 }}>
        {isBrowsingSiblings ? "تصفح فروع " + parent.name : "التصنيفات الفرعية"}
      </h2>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(min(100%,210px),1fr))", gap: 10 }}>
        {categories.map((category) => {
          const isCurrent = category.id === activeId;
          return (
            <Link
              key={category.id}
              to={("/category/" + storefrontCategorySlug(parent) + "/subcategory/" + storefrontCategorySlug(category)) as never}
              aria-current={isCurrent ? "page" : undefined}
              style={{
                border: isCurrent ? "1px solid #087f8d" : "1px solid #dce9e8",
                background: isCurrent ? "#edf7f5" : "#fff",
                borderRadius: 12,
                padding: 13,
                color: "#087f8d",
                textDecoration: "none",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 9,
                minWidth: 0,
                fontWeight: 800,
              }}
            >
              <span style={{ display: "inline-flex", alignItems: "center", gap: 9, minWidth: 0 }}>
                <Layers3 size={18} aria-hidden="true" />
                <span>{category.name}</span>
              </span>
              {isCurrent ? (
                <span style={{ flex: "0 0 auto", fontSize: 11, color: "#17675f" }}>التصنيف الحالي</span>
              ) : null}
            </Link>
          );
        })}
      </div>
    </section>
  );
}

export function StorefrontCategoryLandingPage({
  categorySlug,
  subcategorySlug,
}: {
  categorySlug: string;
  subcategorySlug?: string;
}) {
  const categoriesQuery = useFetch(fetchCategories);
  const categories = (categoriesQuery.data ?? []).filter((category) => category.is_active !== false);
  const parent = resolveStorefrontCategorySlug(categories, categorySlug);
  const child = subcategorySlug ? resolveStorefrontCategorySlug(categories, subcategorySlug) : undefined;
  const validChild = !subcategorySlug || Boolean(parent && child && child.parent_id === parent.id);
  const active = subcategorySlug ? child : parent;
  const children = parent ? categories.filter((category) => category.parent_id === parent.id) : [];

  if (categoriesQuery.loading) return <CategoryLoadingState />;
  if (categoriesQuery.error) return <CategoryErrorState error={categoriesQuery.error} onRetry={() => void categoriesQuery.refetch()} />;
  if (!parent || !active || !validChild) return <CategoryNotFoundState />;

  return (
    <main className="storefront" dir="rtl" style={{ minHeight: "100vh", padding: 20, maxWidth: 1240, margin: "0 auto" }}>
      <CategoryPageHeader
        parent={parent}
        active={active}
        isSubcategory={Boolean(subcategorySlug)}
        onRefresh={() => void categoriesQuery.refetch()}
      />
      {children.length > 0 ? (
        <SubcategoryList parent={parent} categories={children} activeId={subcategorySlug ? active.id : undefined} />
      ) : null}
      <Storefront initialCategoryId={active.id} onExit={() => undefined} />
    </main>
  );
}
