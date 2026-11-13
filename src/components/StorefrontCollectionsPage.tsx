import { Link } from "@tanstack/react-router";
import { ArrowLeft, Layers3, RefreshCw, Tags } from "lucide-react";
import { fetchCategories, fetchProducts } from "@/lib/api";
import { groupStorefrontCategories } from "@/lib/storefront-category-groups";
import { storefrontCategorySlug } from "@/lib/storefront-slugs";
import { useFetch } from "@/lib/useFetch";

type StoreCategory = Awaited<ReturnType<typeof fetchCategories>>[number];

function CollectionPageHeader({ loading, onRefresh }: { loading: boolean; onRefresh: () => void }) {
  return (
    <header style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap", marginBottom: 22 }}>
      <div>
        <Link to="/store" style={{ display: "inline-flex", alignItems: "center", gap: 6, color: "#087f8d", textDecoration: "none" }}>
          <ArrowLeft size={16} /> العودة للمتجر
        </Link>
        <h1 style={{ margin: "12px 0 4px" }}>تصنيفات المنتجات</h1>
        <p style={{ margin: 0, color: "#526b70" }}>
          التصنيفات وعدد الأصناف مأخوذة من كتالوج المؤسسة المنشور؛ لا تُنشأ تصنيفات أو أعداد افتراضية.
        </p>
      </div>
      <button type="button" className="btn outline" disabled={loading} onClick={onRefresh}>
        <RefreshCw size={15} /> تحديث البيانات
      </button>
    </header>
  );
}

function CollectionLoadingState() {
  return <div className="sf-empty" role="status">جار تحميل التصنيفات والكتالوج…</div>;
}

function CollectionErrorState({
  title,
  details,
  onRetry,
}: {
  title: string;
  details: string;
  onRetry: () => void;
}) {
  return (
    <div className="sf-empty" role="alert">
      <strong>{title}</strong>
      <small>{details}</small>
      <button type="button" className="sf-btn-secondary" onClick={onRetry}>إعادة المحاولة</button>
    </div>
  );
}

function CollectionEmptyState() {
  return (
    <div className="sf-empty" role="status">
      <Tags size={26} />
      <strong>لا توجد تصنيفات منشورة</strong>
      <small>لا يوجد تصنيف نشط متاح للحساب الحالي.</small>
      <Link to="/catalog">فتح الكتالوج الكامل</Link>
    </div>
  );
}

function CategoryBranchLink({ parent, category, count }: {
  parent: StoreCategory;
  category: StoreCategory;
  count: number;
}) {
  return (
    <Link
      to={("/category/" + storefrontCategorySlug(parent) + "/subcategory/" + storefrontCategorySlug(category)) as never}
      style={{
        border: "1px solid #dce9e8",
        borderRadius: 10,
        background: "#fff",
        color: "#087f8d",
        textDecoration: "none",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 12,
        minWidth: 0,
        padding: "10px 12px",
        fontWeight: 700,
      }}
    >
      <span style={{ display: "inline-flex", alignItems: "center", gap: 8, minWidth: 0 }}>
        <Layers3 size={16} aria-hidden="true" />
        <span>{category.name}</span>
      </span>
      <span style={{ flex: "0 0 auto", fontSize: 12, color: "#64777b", fontWeight: 500 }}>
        {count.toLocaleString("ar-YE")} صنف
      </span>
    </Link>
  );
}

function CollectionCard({
  category,
  count,
  children,
  childCounts,
  detached,
}: {
  category: StoreCategory;
  count: number;
  children: StoreCategory[];
  childCounts: Record<string, number>;
  detached: boolean;
}) {
  const branchCount = children.reduce((total, child) => total + (childCounts[child.id] ?? 0), 0);
  const groupCount = count + branchCount;

  return (
    <article style={{ border: "1px solid #dce9e8", background: "#fff", borderRadius: 14, padding: 18, display: "flex", flexDirection: "column", gap: 10, minWidth: 0 }}>
      <div style={{ display: "flex", gap: 10, alignItems: "center", minWidth: 0 }}>
        <Layers3 size={22} color="#087f8d" aria-hidden="true" />
        <h2 style={{ fontSize: 18, margin: 0 }}>{category.name}</h2>
      </div>
      <p style={{ margin: 0, color: "#526b70" }}>
        {category.description || "تصنيف منظم لأصناف الكتالوج المنشور."}
      </p>
      <strong>{groupCount.toLocaleString("ar-YE")} صنف في التصنيف وفروعه</strong>
      {children.length > 0 ? (
        <>
          <small style={{ color: "#64777b" }}>
            داخل التصنيف مباشرة: {count.toLocaleString("ar-YE")} صنف
          </small>
          <section aria-label={"الفروع التابعة لـ " + category.name} style={{ display: "grid", gap: 8, marginTop: 2 }}>
            {children.map((child) => (
              <CategoryBranchLink key={child.id} parent={category} category={child} count={childCounts[child.id] ?? 0} />
            ))}
          </section>
        </>
      ) : null}
      {detached ? (
        <small style={{ color: "#8a6721" }}>
          التصنيف الأب غير موجود ضمن التصنيفات النشطة المعروضة؛ أُبقي هذا التصنيف متاحاً بدلاً من إخفائه.
        </small>
      ) : null}
      {count > 0 || children.length > 0 ? (
        <Link
          to={("/category/" + storefrontCategorySlug(category)) as never}
          style={{ marginTop: "auto", textDecoration: "none", color: "#087f8d", fontWeight: 800, display: "inline-flex", gap: 7, alignItems: "center" }}
        >
          فتح التصنيف <ArrowLeft size={15} />
        </Link>
      ) : (
        <span style={{ marginTop: "auto", color: "#71868a", fontSize: 13 }}>
          لا توجد أصناف منشورة مباشرة أو في الفروع.
        </span>
      )}
    </article>
  );
}

function AdditionalCategoryCard({
  category,
  parent,
  count,
}: {
  category: StoreCategory;
  parent?: StoreCategory;
  count: number;
}) {
  const href = parent
    ? "/category/" + storefrontCategorySlug(parent) + "/subcategory/" + storefrontCategorySlug(category)
    : "/category/" + storefrontCategorySlug(category);

  return (
    <article style={{ border: "1px solid #e2e8e8", background: "#fbfdfd", borderRadius: 12, padding: 14, display: "flex", flexDirection: "column", gap: 8, minWidth: 0 }}>
      <strong>{category.name}</strong>
      <small style={{ color: "#64777b" }}>
        {parent ? "فرع ضمن " + parent.name : category.parent_id ? "فرع ذو علاقة أب غير متاحة" : "تصنيف مستقل"}
      </small>
      <span style={{ color: "#526b70", fontSize: 13 }}>{count.toLocaleString("ar-YE")} صنف مباشر</span>
      <Link to={href as never} style={{ color: "#087f8d", fontWeight: 800, textDecoration: "none" }}>
        تصفح هذا المستوى
      </Link>
    </article>
  );
}

function CollectionList({
  categories,
  counts,
}: {
  categories: StoreCategory[];
  counts: Record<string, number>;
}) {
  const grouping = groupStorefrontCategories(categories);
  const categoriesById = new Map(categories.map((category) => [category.id, category]));

  return (
    <>
      <section aria-label="التصنيفات الرئيسية" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(min(100%,270px),1fr))", gap: 14 }}>
        {grouping.groups.map((group) => (
          <CollectionCard
            key={group.category.id}
            category={group.category}
            count={counts[group.category.id] ?? 0}
            children={group.children}
            childCounts={counts}
            detached={group.detached}
          />
        ))}
      </section>
      {grouping.additionalCategories.length > 0 ? (
        <section aria-label="تصنيفات بمستويات إضافية" style={{ marginTop: 24 }}>
          <h2 style={{ fontSize: 18, margin: "0 0 10px" }}>تصنيفات بمستويات إضافية</h2>
          <p style={{ color: "#64777b", fontSize: 13, margin: "0 0 12px" }}>
            تظهر هذه المستويات منفصلة مع الاحتفاظ بعلاقتها المباشرة، حتى لا تختفي بسبب عمق التداخل أو نقص الأب في العرض العام.
          </p>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(min(100%,220px),1fr))", gap: 12 }}>
            {grouping.additionalCategories.map((category) => (
              <AdditionalCategoryCard
                key={category.id}
                category={category}
                parent={category.parent_id ? categoriesById.get(category.parent_id) : undefined}
                count={counts[category.id] ?? 0}
              />
            ))}
          </div>
        </section>
      ) : null}
    </>
  );
}

export function StorefrontCollectionsPage() {
  const categoriesQuery = useFetch(fetchCategories);
  const productsQuery = useFetch(fetchProducts);
  const categories = (categoriesQuery.data ?? []).filter((category) => category.is_active !== false);
  const products = productsQuery.data ?? [];
  const loading = categoriesQuery.loading || productsQuery.loading;
  const error = categoriesQuery.error || productsQuery.error;
  const errorTitle = categoriesQuery.error && productsQuery.error
    ? "تعذر تحميل التصنيفات والكتالوج"
    : categoriesQuery.error ? "تعذر تحميل التصنيفات" : "تعذر تحميل كتالوج المنتجات";
  const errorDetails = [
    categoriesQuery.error ? "التصنيفات: " + categoriesQuery.error : null,
    productsQuery.error ? "الكتالوج: " + productsQuery.error : null,
  ].filter((detail): detail is string => detail !== null).join(" — ");

  const productCounts = products.reduce<Record<string, number>>((counts, product) => {
    if (product.is_active === false || product.status === "inactive" || !product.category_id) return counts;
    counts[product.category_id] = (counts[product.category_id] ?? 0) + 1;
    return counts;
  }, {});

  const refresh = () => {
    void categoriesQuery.refetch();
    void productsQuery.refetch();
  };

  return (
    <main className="storefront" dir="rtl" style={{ minHeight: "100vh", padding: 20, maxWidth: 1180, margin: "0 auto" }}>
      <CollectionPageHeader loading={loading} onRefresh={refresh} />
      {loading ? <CollectionLoadingState /> : null}
      {!loading && error ? <CollectionErrorState title={errorTitle} details={errorDetails || error} onRetry={refresh} /> : null}
      {!loading && !error && categories.length === 0 ? <CollectionEmptyState /> : null}
      {!loading && !error && categories.length > 0 ? (
        <CollectionList categories={categories} counts={productCounts} />
      ) : null}
    </main>
  );
}
