import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { BookmarkPlus, ClipboardList, RefreshCw, ShoppingCart } from "lucide-react";
import { fetchCategories } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { CUSTOMER_CART_SYNCED_EVENT, fetchCustomerCart, type CustomerCartSnapshot } from "@/lib/customer-cart";
import { fetchStorefrontCartProductDetails } from "@/lib/storefront-cart-products";
import { saveCustomerShoppingList } from "@/lib/customer-shopping-lists";
import { loadOfflineCartDraft, offlineCartStorageKey } from "@/lib/offline-cart";
import { cartLineSetsMatch, groupCartLinesByCategory, summarizeCartLines } from "@/lib/cart-shopping-list-summary";
import type { Category, ProductWithInventory } from "@/lib/types";

export function CartShoppingListsAccess() {
  const { user, ready } = useAuth();
  const navigate = useNavigate();
  const isCustomer = Boolean(user && !user.isStaff && user.roles.includes("customer") && user.profileId);
  const [cart, setCart] = useState<CustomerCartSnapshot | null>(null);
  const [products, setProducts] = useState<ProductWithInventory[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState("مشتريات السلة");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const activeProfile = useRef(user?.profileId);
  const refreshSequence = useRef(0);
  activeProfile.current = user?.profileId;

  const refresh = useCallback(async () => {
    if (!isCustomer || !user?.profileId) return;
    const profileId = user.profileId;
    const requestId = ++refreshSequence.current;
    setLoading(true);
    setError("");
    try {
      const currentCart = await fetchCustomerCart();
      const [details, currentCategories] = await Promise.all([
        fetchStorefrontCartProductDetails(currentCart.items.map((line) => line.product_id)),
        fetchCategories().catch(() => []),
      ]);
      if (activeProfile.current !== profileId || refreshSequence.current !== requestId) return;
      if (details.length !== currentCart.items.length) {
        throw new Error("بعض أصناف السلة لم تعد نشطة في الكتالوج؛ راجع السلة قبل حفظها كقائمة.");
      }
      setCart(currentCart);
      setProducts(details);
      setCategories(currentCategories);
    } catch (cause) {
      if (activeProfile.current === profileId && refreshSequence.current === requestId) {
        setError(cause instanceof Error ? cause.message : "تعذر تحميل ملخص السلة الحالية.");
      }
    } finally {
      if (activeProfile.current === profileId && refreshSequence.current === requestId) setLoading(false);
    }
  }, [isCustomer, user?.profileId]);

  useEffect(() => {
    if (ready && isCustomer) void refresh();
    if (!isCustomer) {
      refreshSequence.current += 1;
      setCart(null);
      setProducts([]);
      setCategories([]);
    }
  }, [ready, isCustomer, refresh]);

  useEffect(() => {
    if (!ready || !isCustomer) return;
    const refreshAfterConfirmedSync = () => { void refresh(); };
    window.addEventListener(CUSTOMER_CART_SYNCED_EVENT, refreshAfterConfirmedSync);
    return () => window.removeEventListener(CUSTOMER_CART_SYNCED_EVENT, refreshAfterConfirmedSync);
  }, [ready, isCustomer, refresh]);

  const summary = useMemo(() => summarizeCartLines(cart?.items ?? []), [cart]);
  const groups = useMemo(() => groupCartLinesByCategory(cart?.items ?? [], products, categories), [cart, products, categories]);

  async function saveCurrentCart() {
    if (!cart?.items.length || saving || !user?.profileId) return;
    if (!name.trim() || name.trim().length < 2 || name.trim().length > 100) {
      setError("اسم القائمة مطلوب من حرفين إلى 100 حرف.");
      return;
    }
    const profileId = user.profileId;
    setSaving(true);
    setError("");
    setNotice("");
    try {
      // Reload the server cart and catalog immediately before creating the named list.
      const currentCart = await fetchCustomerCart();
      if (!currentCart.items.length) throw new Error("السلة الحالية فارغة؛ لم تُنشأ قائمة فارغة.");

      // Never save a stale server snapshot while this device still holds unsynced cart edits.
      let localDraft: ReturnType<typeof loadOfflineCartDraft>;
      let scopedDraftExists = false;
      try {
        localDraft = loadOfflineCartDraft(window.localStorage, profileId, user.id);
        scopedDraftExists = window.localStorage.getItem(offlineCartStorageKey(profileId, user.id)) !== null;
      } catch {
        throw new Error("تعذر التحقق من مزامنة مسودة هذا الجهاز؛ لم تُحفظ قائمة قد لا تطابق السلة الحالية.");
      }
      if (scopedDraftExists && !cartLineSetsMatch(localDraft, currentCart.items)) {
        throw new Error("توجد تعديلات على مسودة السلة في هذا الجهاز لم يؤكد الخادم مزامنتها بعد. أعد مزامنة السلة ثم احفظ القائمة.");
      }

      const currentProducts = await fetchStorefrontCartProductDetails(currentCart.items.map((line) => line.product_id));
      if (currentProducts.length !== currentCart.items.length) {
        throw new Error("تغير الكتالوج أو توفر صنف من السلة؛ حدّث السلة قبل حفظ القائمة.");
      }
      const productsById = new Map(currentProducts.map((product) => [product.id, product]));
      const items = currentCart.items.map((line) => {
        const product = productsById.get(line.product_id);
        if (!product || product.status !== "active") {
          throw new Error("يوجد صنف غير نشط في السلة؛ أزله قبل حفظ القائمة.");
        }
        return {
          product_id: line.product_id,
          quantity: line.quantity,
          unit_name: product.unit,
          base_units_per_unit: 1,
        };
      });
      await saveCustomerShoppingList({
        name: name.trim(),
        category: "custom",
        isDraft: false,
        recurrence: "none",
        nextRunOn: null,
        items,
      });
      if (activeProfile.current !== profileId) return;
      setCart(currentCart);
      setProducts(currentProducts);
      setNotice("حُفظت السلة الحالية كقائمة مستقلة على خادم الشركة. لم تُحفظ أسعار أو تكاليف داخل القائمة.");
      await navigate({ to: "/reorder" });
    } catch (cause) {
      if (activeProfile.current === profileId) {
        setError(cause instanceof Error ? cause.message : "تعذر حفظ السلة كقائمة مشتريات.");
      }
    } finally {
      if (activeProfile.current === profileId) setSaving(false);
    }
  }

  if (!ready || !isCustomer) return null;

  return (
    <section dir="rtl" aria-label="حفظ السلة وقوائم المشتريات" style={{
      maxWidth: 1160, margin: "14px auto", padding: "14px 16px",
      border: "1px solid #dce8e7", borderRadius: 14, background: "#fff",
      color: "#18383c", boxSizing: "border-box",
    }}>
      <header style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
        <div>
          <h2 style={{ display: "flex", alignItems: "center", gap: 8, margin: 0, fontSize: 17 }}>
            <ClipboardList size={19} /> قوائم مشترياتك
          </h2>
          <p style={{ margin: "5px 0 0", color: "#617579", fontSize: 12 }}>
            احفظ السلة الحالية كقائمة مستقلة، ثم استنسخها أو أعد استخدامها من مساحة القوائم
          </p>
        </div>
        <div style={{ display: "flex", gap: 7, flexWrap: "wrap" }}>
          <button type="button" className="sf-btn-secondary" disabled={loading || saving} onClick={() => void refresh()}>
            <RefreshCw size={14} /> تحديث ملخص السلة
          </button>
          <Link to="/reorder" className="sf-btn-secondary" style={{ textDecoration: "none" }}>
            <ClipboardList size={14} /> إدارة القوائم المحفوظة
          </Link>
        </div>
      </header>

      <p style={{ margin: "8px 0 0", color: "#708387", fontSize: 11, lineHeight: 1.7 }}>
        يعرض هذا الملخص آخر نسخة أكدها الخادم؛ تعديلات السلة المحلية لا تدخل فيه قبل اكتمال المزامنة.
      </p>
      {loading && <p role="status" style={{ color: "#60777a", fontSize: 12 }}>جار قراءة السلة والكتالوج الحاليين من الخادم...</p>}
      {error && <p role="alert" style={{ color: "#a22", fontSize: 13 }}>{error}</p>}
      {notice && <p role="status" style={{ color: "#176847", fontSize: 13 }}>{notice}</p>}

      {!loading && cart?.items.length === 0 && (
        <p style={{ margin: "12px 0 0", color: "#60777a", fontSize: 13 }}>السلة فارغة؛ أضف منتجات قبل حفظ قائمة مشتريات.</p>
      )}
      {cart?.items.length ? (
        <>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 14, marginTop: 12, fontSize: 13 }}>
            <strong><ShoppingCart size={15} style={{ verticalAlign: "middle" }} /> {summary.skuCount} صنفًا</strong>
            <strong>{summary.totalQuantity.toLocaleString("ar-YE")} مجموع كميات البنود</strong>
            <span style={{ color: "#708387", fontSize: 11 }}>الكميات مجموع رقمي فقط؛ وحدات الأصناف قد تختلف ولا يجري تحويل الكيلو إلى العبوة أو اللتر إلى الكيلو.</span>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(min(100%,230px),1fr))", gap: 10, marginTop: 12 }}>
            {groups.map((group) => (
              <div key={group.categoryId ?? "uncategorized"} style={{ padding: 10, border: "1px solid #e6eeee", borderRadius: 10, minWidth: 0 }}>
                <strong style={{ fontSize: 13 }}>{group.categoryName} · {group.items.length} صنف</strong>
                <div style={{ display: "grid", gap: 5, marginTop: 7 }}>
                  {group.items.map((item) => (
                    <div key={item.productId} style={{ display: "flex", justifyContent: "space-between", gap: 8, fontSize: 12 }}>
                      <span>{item.productName}</span>
                      <strong style={{ whiteSpace: "nowrap" }}>{item.quantity.toLocaleString("ar-YE")} {item.unit}</strong>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
          <div style={{ display: "flex", alignItems: "end", gap: 8, flexWrap: "wrap", marginTop: 12 }}>
            <label style={{ display: "grid", gap: 5, flex: "1 1 260px", fontSize: 12, fontWeight: 700 }}>
              اسم قائمة السلة
              <input value={name} maxLength={100} onChange={(event) => setName(event.currentTarget.value)} placeholder="مثال: مشتريات فرع صنعاء لهذا الأسبوع" style={{
                width: "100%", boxSizing: "border-box", border: "1px solid #cbdcdb",
                borderRadius: 9, padding: "10px 12px", color: "#18383c",
              }} />
            </label>
            <button type="button" className="sf-btn-primary" disabled={saving || loading || !cart.items.length} onClick={() => void saveCurrentCart()}>
              <BookmarkPlus size={15} /> {saving ? "جار حفظ القائمة..." : "حفظ السلة كقائمة"}
            </button>
          </div>
        </>
      ) : null}
    </section>
  );
}
