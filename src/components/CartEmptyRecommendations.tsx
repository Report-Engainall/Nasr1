import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowLeft, Package, RefreshCw, ShoppingCart } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { fetchCustomerCart } from "@/lib/customer-cart";
import { fetchStorefrontCatalogPage } from "@/lib/storefront-catalog";
import { loadOfflineCartDraft } from "@/lib/offline-cart";
import {
  resolveCartEmptyEligibility,
  selectAvailableCartRecommendations,
} from "@/lib/cart-empty-recommendations";
import type { ProductWithInventory } from "@/lib/types";

type Eligibility = "checking" | "hidden" | "not-empty" | "unverified" | "empty" | "error";

function safeImageUrl(value: unknown): value is string {
  return typeof value === "string" && value.trim() === value && /^https:\/\//i.test(value);
}

/**
 * Shows a useful return path only after both the identity-scoped local draft and,
 * for customers, the saved server cart prove that no cart lines are waiting to restore.
 * No price, cost, margin or stock quantity is rendered from recommendation data.
 */
export function CartEmptyRecommendations() {
  const { user, ready } = useAuth();
  const [eligibility, setEligibility] = useState<Eligibility>("checking");
  const [products, setProducts] = useState<ProductWithInventory[]>([]);
  const [productsLoading, setProductsLoading] = useState(false);
  const [productsError, setProductsError] = useState("");
  const [verificationRetry, setVerificationRetry] = useState(0);
  const [productsRetry, setProductsRetry] = useState(0);

  const isCustomer = Boolean(
    user && user.isStaff !== true && user.profileId &&
    Array.isArray(user.roles) && user.roles.includes("customer"),
  );
  const audience = user?.isStaff === true
    ? "staff"
    : user
      ? isCustomer ? "customer" : "other"
      : "guest";

  useEffect(() => {
    if (!ready) {
      setEligibility("checking");
      return;
    }
    if (audience === "staff" || audience === "other") {
      setEligibility("hidden");
      return;
    }

    let active = true;
    async function verifyEmptyCart() {
      setEligibility("checking");
      try {
        const localDraft = loadOfflineCartDraft(
          window.localStorage,
          user?.profileId,
          user?.id,
        );
        if (localDraft.length > 0) {
          if (active) setEligibility("not-empty");
          return;
        }

        const isOnline = typeof navigator !== "undefined" && navigator.onLine;
        if (!isOnline) {
          if (active) setEligibility("unverified");
          return;
        }

        let serverCartLineCount = 0;
        if (audience === "customer") {
          const serverCart = await fetchCustomerCart();
          serverCartLineCount = serverCart.items.length;
        }
        const resolved = resolveCartEmptyEligibility({
          audience,
          isOnline,
          localDraftLineCount: localDraft.length,
          serverCartLineCount,
        });
        if (active) setEligibility(resolved);
      } catch {
        if (active) setEligibility("error");
      }
    }

    void verifyEmptyCart();
    return () => { active = false; };
  }, [ready, audience, user?.id, user?.profileId, verificationRetry]);

  useEffect(() => {
    if (eligibility !== "empty") return;
    let active = true;
    setProductsLoading(true);
    setProductsError("");
    void fetchStorefrontCatalogPage({
      search: "",
      categoryId: null,
      page: 1,
      pageSize: 8,
      availableOnly: true,
    }).then((page) => {
      if (active) setProducts(selectAvailableCartRecommendations(page.items, 4));
    }).catch(() => {
      if (active) setProductsError("تعذر تحميل اقتراحات المنتجات المتاحة حاليًا.");
    }).finally(() => {
      if (active) setProductsLoading(false);
    });
    return () => { active = false; };
  }, [eligibility, productsRetry]);

  if (eligibility === "hidden" || eligibility === "not-empty" || eligibility === "checking") return null;

  if (eligibility === "error" || eligibility === "unverified") {
    return (
      <section
        dir="rtl"
        aria-label="التحقق من السلة"
        style={{
          maxWidth: 1160, margin: "14px auto", padding: "13px 16px",
          border: "1px solid #e6d8b7", borderRadius: 12, background: "#fffaf0",
          color: "#624b1e", boxSizing: "border-box",
        }}
      >
        <p role="status" style={{ margin: 0, fontSize: 13, lineHeight: 1.8 }}>
          {eligibility === "unverified"
            ? "لا يمكن تأكيد أن السلة فارغة دون اتصال بالخادم؛ لم نخفِ أي مسودة أو سلة محفوظة."
            : "تعذر التحقق من السلة المحفوظة؛ لن نعرض اقتراحات قد تحجب أصنافًا محفوظة."}
        </p>
        <button
          type="button"
          className="sf-btn-secondary"
          onClick={() => setVerificationRetry((value) => value + 1)}
          style={{ marginTop: 8 }}
        >
          <RefreshCw size={14} /> إعادة التحقق
        </button>
      </section>
    );
  }

  return (
    <section
      dir="rtl"
      aria-labelledby="cart-empty-recommendations-title"
      style={{
        maxWidth: 1160, margin: "14px auto", padding: "18px",
        border: "1px solid #dce9e5", borderRadius: 16,
        background: "linear-gradient(135deg,#f5faf7 0%,#ffffff 72%)",
        color: "#18383c", boxSizing: "border-box",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 13, flexWrap: "wrap" }}>
        <div
          aria-hidden="true"
          style={{
            width: 48, height: 48, flex: "0 0 48px", display: "grid",
            placeItems: "center", borderRadius: 14, background: "#e3f1eb", color: "#176448",
          }}
        >
          <ShoppingCart size={24} />
        </div>
        <div style={{ flex: "1 1 240px", minWidth: 0 }}>
          <span style={{ color: "#287254", fontSize: 11, fontWeight: 800 }}>ابدأ طلبك التالي</span>
          <h2 id="cart-empty-recommendations-title" style={{ margin: "3px 0", fontSize: 19 }}>
            سلتك فارغة حاليًا
          </h2>
          <p style={{ margin: 0, color: "#617579", fontSize: 12, lineHeight: 1.8 }}>
            لم نجد أصنافًا في مسودة هذا الجهاز أو سلة حسابك المحفوظة. اختر صنفًا متاحًا للعودة إلى التسوق.
          </p>
        </div>
        <Link
          to="/catalog"
          className="sf-btn-primary"
          style={{ display: "inline-flex", alignItems: "center", gap: 7, textDecoration: "none" }}
        >
          تصفح الكتالوج <ArrowLeft size={15} />
        </Link>
      </div>

      <div style={{ marginTop: 17 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
          <strong style={{ fontSize: 13 }}>أصناف متاحة للبدء</strong>
          <span style={{ color: "#708387", fontSize: 11 }}>اختيرت من الكتالوج الحالي؛ الأسعار لا تظهر هنا</span>
        </div>

        {productsLoading && (
          <p role="status" style={{ color: "#60777a", fontSize: 12 }}>جار تحميل المنتجات المتاحة...</p>
        )}
        {productsError && (
          <div role="alert" style={{ color: "#963a32", fontSize: 12, marginTop: 9 }}>
            {productsError}
            <button type="button" className="sf-link" onClick={() => setProductsRetry((value) => value + 1)}>
              إعادة المحاولة
            </button>
          </div>
        )}
        {!productsLoading && !productsError && products.length === 0 && (
          <p role="status" style={{ color: "#60777a", fontSize: 12 }}>
            لا توجد أصناف متاحة للترشيح الآن؛ افتح الكتالوج للاطلاع على الأصناف المنشورة.
          </p>
        )}

        {products.length > 0 && (
          <div style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit,minmax(min(100%,220px),1fr))",
            gap: 10, marginTop: 10,
          }}>
            {products.map((product) => (
              <article
                key={product.id}
                style={{
                  display: "flex", alignItems: "center", gap: 10, minWidth: 0,
                  padding: 10, border: "1px solid #e1ebe7", borderRadius: 12, background: "#fff",
                }}
              >
                <div style={{
                  width: 58, height: 58, flex: "0 0 58px", display: "grid", placeItems: "center",
                  overflow: "hidden", borderRadius: 9, background: "#f1f6f3", color: "#57816d",
                }}>
                  {safeImageUrl(product.image_url)
                    ? <img src={product.image_url} alt="" loading="lazy" decoding="async" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                    : <Package size={24} aria-hidden="true" />}
                </div>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <strong style={{ display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: 12 }}>
                    {product.name}
                  </strong>
                  <span style={{ display: "block", color: "#718487", fontSize: 10, marginTop: 3 }}>
                    {product.item_code} · {product.unit}
                  </span>
                  <Link
                    to="/product/$id"
                    params={{ id: product.id }}
                    className="sf-link"
                    style={{ display: "inline-block", marginTop: 6, fontSize: 11, fontWeight: 800 }}
                  >
                    عرض المنتج
                  </Link>
                </div>
                <span style={{ flex: "0 0 auto", color: "#176847", background: "#edf8f1", borderRadius: 20, padding: "4px 7px", fontSize: 10, fontWeight: 800 }}>
                  متاح
                </span>
              </article>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
