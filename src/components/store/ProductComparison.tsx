import type { ReactNode } from "react";
import { ArrowRight, Package, ShoppingCart, X } from "lucide-react";
import type { ProductWithInventory } from "@/lib/types";
import { formatNumber } from "@/lib/format";
import { resolveStorefrontPricePresentation } from "@/lib/storefront-price-visibility";
import { StorefrontPricePresentation } from "@/components/StorefrontPricePresentation";

type ProductComparisonProps = {
  products: ProductWithInventory[];
  priceVisibilityPolicy: unknown;
  loading: boolean;
  error: string | null;
  onRetry: () => void;
  onOpen: (product: ProductWithInventory) => void;
  onAdd: (product: ProductWithInventory) => void;
  onRemove: (productId: string) => void;
  onBack: () => void;
};

function minimumOrderQuantity(product: ProductWithInventory): number {
  return typeof product.min_order_quantity === "number"
    && Number.isSafeInteger(product.min_order_quantity)
    && product.min_order_quantity >= 1
    ? product.min_order_quantity
    : 1;
}

function orderQuantityMultiple(product: ProductWithInventory): number {
  return typeof product.order_quantity_multiple === "number"
    && Number.isSafeInteger(product.order_quantity_multiple)
    && product.order_quantity_multiple >= 1
    ? product.order_quantity_multiple
    : 1;
}

function stockState(product: ProductWithInventory): {
  known: boolean;
  quantity: number;
  label: string;
  canOrder: boolean;
} {
  const quantity = product.inventory?.quantity_available;
  if (typeof quantity !== "number" || !Number.isFinite(quantity) || quantity < 0) {
    return {
      known: false,
      quantity: 0,
      label: "المخزون غير متحقق",
      canOrder: false,
    };
  }

  if (quantity === 0) {
    return { known: true, quantity, label: "نفد المخزون", canOrder: false };
  }

  const minimum = minimumOrderQuantity(product);
  if (quantity < minimum) {
    return {
      known: true,
      quantity,
      label: `${formatNumber(quantity)} متاح — أقل من الحد الأدنى`,
      canOrder: false,
    };
  }

  return {
    known: true,
    quantity,
    label: `${formatNumber(quantity)} متاح`,
    canOrder: true,
  };
}

function comparisonCellStyle(): React.CSSProperties {
  return {
    minWidth: 168,
    maxWidth: 260,
    padding: "13px 14px",
    borderBottom: "1px solid var(--aghbari-border, #e4e9ed)",
    textAlign: "right",
    verticalAlign: "middle",
    lineHeight: 1.7,
    color: "var(--aghbari-text, #24343d)",
    fontSize: 13,
  };
}

function comparisonLabelStyle(): React.CSSProperties {
  return {
    ...comparisonCellStyle(),
    position: "sticky",
    right: 0,
    zIndex: 1,
    minWidth: 138,
    maxWidth: 138,
    background: "var(--aghbari-surface, #fff)",
    color: "var(--aghbari-text-muted, #667781)",
    fontWeight: 700,
  };
}

/**
 * A real side-by-side product comparison using only the live, tenant-scoped
 * catalog projection. Prices keep the same fail-closed visibility contract as
 * product cards; unknown stock is never presented as confirmed out of stock.
 */
export function ProductComparison({
  products,
  priceVisibilityPolicy,
  loading,
  error,
  onRetry,
  onOpen,
  onAdd,
  onRemove,
  onBack,
}: ProductComparisonProps) {
  const rows: Array<{ label: string; value: (product: ProductWithInventory) => ReactNode }> = [
    { label: "التصنيف", value: (product) => product.category?.name || "غير مصنف" },
    { label: "كود الصنف", value: (product) => product.item_code || "غير متاح" },
    { label: "رمز SKU", value: (product) => product.sku || "غير مسجل" },
    { label: "الوحدة", value: (product) => product.unit || "غير محددة" },
    { label: "وصف المنتج", value: (product) => product.description?.trim() || "لا يوجد وصف منشور" },
    {
      label: "سعر الوحدة",
      value: (product) => {
        const presentation = resolveStorefrontPricePresentation(priceVisibilityPolicy, product.display_price);
        if (!presentation.visible) {
          return priceVisibilityPolicy === true
            ? "السعر غير متاح من بيانات المتجر"
            : "السعر غير معروض حسب إعدادات المتجر";
        }

        return (
          <StorefrontPricePresentation
            policyValue={priceVisibilityPolicy}
            serverUnitPrice={product.display_price}
            className="sf-product-price"
            unitLabel={"لكل " + (product.unit || "وحدة")}
          />
        );
      },
    },
    {
      label: "المخزون المتاح",
      value: (product) => {
        const stock = stockState(product);
        return (
          <span aria-label={stock.known ? stock.label : "المخزون غير متحقق"}>
            {stock.label}
          </span>
        );
      },
    },
    { label: "الحد الأدنى للطلب", value: (product) => formatNumber(minimumOrderQuantity(product)) },
    { label: "مضاعف الكمية", value: (product) => formatNumber(orderQuantityMultiple(product)) },
    { label: "ظهور مميز", value: (product) => product.is_featured ? "منتج مميز" : "منتج عادي" },
  ];

  return (
    <section className="sf-collection" aria-labelledby="sf-product-comparison-title">
      <button type="button" className="sf-back-link" onClick={onBack}>
        <ArrowRight size={16} aria-hidden="true" /> العودة للمتجر
      </button>

      <div className="sf-products-head">
        <div>
          <h2 id="sf-product-comparison-title">
            <span aria-hidden="true">⇄</span> مقارنة المنتجات
          </h2>
          <span>{formatNumber(products.length)} من 3 منتجات محددة</span>
        </div>
      </div>

      {products.length > 0 ? (
        <>
          <p role="note" style={{ margin: "0 0 14px", color: "var(--aghbari-text-muted, #667781)", fontSize: 13, lineHeight: 1.8 }}>
            قارن المواصفات والتوفر جنبًا إلى جنب. السعر والمخزون يظهران فقط وفق البيانات والسياسات المعتمدة في المتجر.
          </p>

          <div
            role="region"
            aria-label="جدول مقارنة المنتجات؛ يمكن تمريره أفقيًا على الهاتف"
            tabIndex={0}
            style={{
              width: "100%",
              overflowX: "auto",
              overscrollBehaviorInline: "contain",
              border: "1px solid var(--aghbari-border, #e4e9ed)",
              borderRadius: 14,
              background: "var(--aghbari-surface, #fff)",
            }}
          >
            <table
              aria-label="مقارنة مواصفات المنتجات وأسعارها وتوفرها"
              style={{ width: "100%", minWidth: Math.max(520, products.length * 190 + 140), borderCollapse: "separate", borderSpacing: 0 }}
            >
              <thead>
                <tr>
                  <th scope="col" style={{ ...comparisonLabelStyle(), top: 0, zIndex: 3 }}>
                    معيار المقارنة
                  </th>
                  {products.map((product) => (
                    <th
                      scope="col"
                      key={product.id}
                      style={{
                        ...comparisonCellStyle(),
                        minWidth: 190,
                        maxWidth: 260,
                        background: "var(--aghbari-surface, #fff)",
                        verticalAlign: "top",
                        fontWeight: 400,
                      }}
                    >
                      <div style={{ display: "grid", gap: 9 }}>
                        <div
                          style={{
                            width: 76,
                            height: 76,
                            borderRadius: 10,
                            overflow: "hidden",
                            display: "grid",
                            placeItems: "center",
                            background: "var(--aghbari-muted-surface, #f3f6f8)",
                          }}
                        >
                          {product.image_url
                            ? <img src={product.image_url} alt={product.name} loading="lazy" decoding="async" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                            : <Package size={28} aria-hidden="true" />}
                        </div>
                        <strong style={{ color: "var(--aghbari-text, #24343d)", fontSize: 14 }}>{product.name}</strong>
                        {product.name_en ? <small dir="auto" style={{ color: "var(--aghbari-text-muted, #667781)" }}>{product.name_en}</small> : null}
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                          <button type="button" className="sf-btn-secondary" onClick={() => onOpen(product)}>
                            التفاصيل
                          </button>
                          <button
                            type="button"
                            className="sf-btn-secondary"
                            aria-label={`إزالة ${product.name} من المقارنة`}
                            onClick={() => onRemove(product.id)}
                          >
                            <X size={14} aria-hidden="true" /> إزالة
                          </button>
                        </div>
                        <button
                          type="button"
                          className="sf-btn-primary"
                          disabled={!stockState(product).canOrder}
                          aria-label={`إضافة ${product.name} إلى السلة`}
                          onClick={() => onAdd(product)}
                        >
                          <ShoppingCart size={14} aria-hidden="true" />
                          {stockState(product).canOrder ? "أضف للسلة" : stockState(product).label}
                        </button>
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.label}>
                    <th scope="row" style={comparisonLabelStyle()}>{row.label}</th>
                    {products.map((product) => (
                      <td key={product.id} style={comparisonCellStyle()}>
                        {row.value(product)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      ) : loading ? (
        <div className="sf-empty" role="status">جار تحميل بيانات المنتجات للمقارنة...</div>
      ) : error ? (
        <div className="sf-empty" role="alert">
          <strong>تعذر تحميل المنتجات للمقارنة</strong>
          <small>{error}</small>
          <button type="button" className="sf-btn-secondary" onClick={onRetry}>إعادة المحاولة</button>
        </div>
      ) : (
        <div className="sf-empty" role="status">
          <Package size={30} aria-hidden="true" />
          <strong>لم تختر منتجات للمقارنة بعد</strong>
          <small>ارجع إلى الكتالوج وأضف منتجين أو ثلاثة لمشاهدة الفروق بينها في جدول واحد.</small>
          <button type="button" className="sf-btn-primary" onClick={onBack}>تصفح الكتالوج</button>
        </div>
      )}
    </section>
  );
}
