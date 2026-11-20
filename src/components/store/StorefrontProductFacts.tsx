import { useCallback, useEffect, useState } from "react";
import { fetchStorefrontProductFacts, type StorefrontProductFacts as Facts } from "@/lib/storefront-product-details";

function safeImage(value: string | null): value is string {
  return typeof value === "string" && /^https:\/\//i.test(value.trim());
}

function RecommendationGroup({
  title,
  emptyLabel,
  products,
  onOpenProduct,
}: {
  title: string;
  emptyLabel: string;
  products: Facts["alternatives"];
  onOpenProduct: (productId: string) => void;
}) {
  return (
    <section aria-label={title} style={{ marginTop: 18 }}>
      <h4 style={{ margin: "0 0 10px", fontSize: 15, color: "var(--foreground, #23383a)" }}>{title}</h4>
      {products.length === 0 ? (
        <p style={{ margin: 0, color: "var(--muted-foreground, #71817f)", fontSize: 13 }}>{emptyLabel}</p>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 10 }}>
          {products.map((product) => (
            <button
              type="button"
              key={product.id}
              onClick={() => onOpenProduct(product.id)}
              className="sf-related-card"
              style={{ minWidth: 0, textAlign: "right" }}
              aria-label={"عرض تفاصيل " + product.name}
            >
              {safeImage(product.image_url) ? (
                <span className="sf-related-image">
                  <img src={product.image_url} alt="" loading="lazy" decoding="async" />
                </span>
              ) : null}
              <strong>{product.name}</strong>
              <small><bdi>{product.item_code}</bdi> · {product.unit}</small>
              {product.brand_name ? <small>{product.brand_name}</small> : null}
            </button>
          ))}
        </div>
      )}
    </section>
  );
}

export function StorefrontProductFacts({
  productId,
  onOpenProduct,
}: {
  productId: string;
  onOpenProduct: (productId: string) => void;
}) {
  const [facts, setFacts] = useState<Facts | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    setFacts(null);
    try {
      const result = await fetchStorefrontProductFacts(productId);
      setFacts(result);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "تعذر تحميل بيانات المنتج الإضافية.");
    } finally {
      setLoading(false);
    }
  }, [productId]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    setFacts(null);
    void fetchStorefrontProductFacts(productId).then((result) => {
      if (active) setFacts(result);
    }).catch((cause) => {
      if (active) setError(cause instanceof Error ? cause.message : "تعذر تحميل بيانات المنتج الإضافية.");
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, [productId]);

  if (loading || !facts || facts.productId !== productId) {
    return <section className="sf-related-products" aria-live="polite" role="status">جار تحميل العلامة والمواصفات والعلاقات المعتمدة...</section>;
  }
  if (error || !facts) {
    return (
      <section className="sf-related-products" aria-labelledby="sf-product-facts-title">
        <div className="sf-related-header"><h3 id="sf-product-facts-title">معلومات المنتج المعتمدة</h3></div>
        <p role="alert" style={{ color: "var(--muted-foreground, #71817f)", fontSize: 13 }}>
          {error || "لم تُسترجع معلومات المنتج."}
        </p>
        <button type="button" className="sf-btn-secondary" onClick={() => void load()}>إعادة المحاولة</button>
      </section>
    );
  }

  const hasAnyFacts = Boolean(
    facts.brand || facts.countryOfOriginCode || facts.specifications.length || facts.packaging,
  );

  return (
    <section className="sf-related-products" aria-labelledby="sf-product-facts-title">
      <div className="sf-related-header">
        <h3 id="sf-product-facts-title">العلامة والمواصفات والتغليف</h3>
        <span>بيانات معتمدة من إدارة الكتالوج</span>
      </div>

      {hasAnyFacts ? (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", gap: 12 }}>
          {facts.brand ? (
            <div className="sf-detail-facts">
              <div><strong>العلامة التجارية</strong><span>{facts.brand.name}</span></div>
              {facts.brand.name_en ? <div><strong>Brand</strong><span dir="ltr">{facts.brand.name_en}</span></div> : null}
            </div>
          ) : (
            <div className="sf-detail-facts"><div><strong>العلامة التجارية</strong><span>لم تُسجّل علامة لهذا المنتج</span></div></div>
          )}

          <div className="sf-detail-facts">
            <div>
              <strong>بلد المنشأ</strong>
              <span>{facts.countryOfOriginCode || "غير معتمد"}</span>
            </div>
            {facts.packaging?.packageSizeValue !== null && facts.packaging?.packageSizeValue !== undefined ? (
              <div>
                <strong>محتوى العبوة</strong>
                <span>{facts.packaging.packageSizeValue} {facts.packaging.packageSizeUnit}</span>
              </div>
            ) : null}
            {facts.packaging?.unitsPerCarton ? (
              <div>
                <strong>عدد الوحدات في الكرتون</strong>
                <span>{facts.packaging.unitsPerCarton} {facts.packaging.cartonUnitName} لكل وحدة أساسية</span>
              </div>
            ) : null}
          </div>
        </div>
      ) : (
        <p style={{ margin: 0, color: "var(--muted-foreground, #71817f)", fontSize: 13 }}>
          لا توجد حالياً حقائق موثقة للعلامة أو المنشأ أو التغليف لهذا الصنف.
        </p>
      )}

      <section style={{ marginTop: 18 }}>
        <h4 style={{ margin: "0 0 10px", fontSize: 15, color: "var(--foreground, #23383a)" }}>المواصفات</h4>
        {facts.specifications.length ? (
          <dl style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 8, margin: 0 }}>
            {facts.specifications.map((item) => (
              <div key={item.name} className="sf-detail-facts">
                <div><strong>{item.name}</strong><span>{item.value}{item.unit ? " " + item.unit : ""}</span></div>
              </div>
            ))}
          </dl>
        ) : (
          <p style={{ margin: 0, color: "var(--muted-foreground, #71817f)", fontSize: 13 }}>لم تُسجّل مواصفات معتمدة لهذا الصنف.</p>
        )}
      </section>

      <RecommendationGroup
        title="المنتجات البديلة"
        emptyLabel="لا توجد منتجات بديلة مرتبطة ومنشورة لهذا الصنف."
        products={facts.alternatives}
        onOpenProduct={onOpenProduct}
      />
      <RecommendationGroup
        title="المنتجات المكملة"
        emptyLabel="لا توجد منتجات مكملة مرتبطة ومنشورة لهذا الصنف."
        products={facts.complements}
        onOpenProduct={onOpenProduct}
      />
    </section>
  );
}
