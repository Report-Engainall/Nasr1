import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent, type FormEvent, type CSSProperties } from "react";
import { useNavigate } from "@tanstack/react-router";
import { CheckCircle2, FileSpreadsheet, ListPlus, LoaderCircle, RefreshCw, Save, Search, Share2, ShoppingCart, Trash2, Upload } from "lucide-react";
import { Login } from "@/components/Login";
import { CustomerOrderPricingPreview } from "@/components/CustomerOrderPricingPreview";
import { CustomerOrderPricingPresentation } from "@/components/CustomerOrderPricingPresentation";
import { useAuth } from "@/lib/auth";
import { getCurrentTenantScope, supabase } from "@/lib/supabase";
import { fetchCustomerCart } from "@/lib/customer-cart";
import { fetchStorefrontCartProductDetails } from "@/lib/storefront-cart-products";
import { fetchProductUnitOptions, type ProductUnitOptions } from "@/lib/product-unit-conversions";
import { fetchCompanyMembershipWorkspace, type CompanyMember } from "@/lib/customer-company-members";
import {
  applyCustomerShoppingListRunToCart,
  createCustomerShoppingListRun,
  fetchCustomerShoppingLists,
  removeCustomerShoppingListShare,
  reviewCustomerShoppingListRun,
  saveCustomerShoppingList,
  shareCustomerShoppingList,
  type CustomerShoppingList,
  type CustomerShoppingListItem,
  type CustomerShoppingListRun,
  type ShoppingListCategory,
  type ShoppingListRecurrence,
  type ShoppingListLineInput,
  type ShoppingListAccess,
} from "@/lib/customer-shopping-lists";
import { parseCustomerShoppingListXlsx } from "@/lib/customer-shopping-lists-xlsx";
import { validateQuickOrderLines } from "@/lib/commerce-utils";
import { formatNumber } from "@/lib/format";
import { CUSTOMER_SHOPPING_LIST_SERVER_PAGE_SIZE, CUSTOMER_SHOPPING_LIST_VISIBLE_PAGE_SIZE, filterCustomerShoppingListCatalog, mergeCustomerShoppingListCatalogProducts, projectCustomerShoppingListCatalogPage, projectCustomerShoppingListServerPage } from "@/lib/customer-shopping-list-catalog";
import type { ProductWithInventory } from "@/lib/types";

type CatalogProduct = {
  id: string;
  name: string;
  item_code: string;
  sku: string | null;
  barcode: string | null;
  unit: string;
  status: string;
  min_order_quantity: number;
  order_quantity_multiple: number;
};
type UnitChoice = { unit_name: string; base_units_per_unit: number };
type ReviewLine = {
  item: CustomerShoppingListItem;
  product: ProductWithInventory | null;
  currentCartQuantity: number | null;
  available: number | null;
  unitValid: boolean;
  error: string;
};
type LoadedResult = {
  cartLineCount: number;
  pricing: unknown;
};

const categoryLabels: Record<ShoppingListCategory, string> = {
  ramadan: "قائمة رمضان",
  monthly_sales: "المبيعات الشهرية",
  warehouse: "قائمة المخزن",
  quick_order: "طلب سريع",
  custom: "قائمة مخصصة",
};
const recurrenceLabels: Record<ShoppingListRecurrence, string> = {
  none: "بدون تكرار",
  weekly: "أسبوعيًا",
  monthly: "شهريًا",
};
const panel: CSSProperties = {
  border: "1px solid #dce8e7", borderRadius: 14, background: "#fff", padding: 16,
  minWidth: 0, boxSizing: "border-box",
};
const field: CSSProperties = {
  width: "100%", minWidth: 0, boxSizing: "border-box", padding: "9px 11px",
  border: "1px solid #cadbd9", borderRadius: 9, background: "#fff", color: "#163b40",
};
const mainButton: CSSProperties = {
  border: 0, borderRadius: 9, padding: "10px 13px", background: "#087f8d",
  color: "#fff", fontWeight: 800, cursor: "pointer", display: "inline-flex",
  alignItems: "center", justifyContent: "center", gap: 7,
};
const altButton: CSSProperties = {
  border: "1px solid #cbdedd", borderRadius: 9, padding: "9px 12px",
  background: "#fff", color: "#087f8d", fontWeight: 750, cursor: "pointer",
  display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 7,
};
const smallText: CSSProperties = { color: "#687f82", fontSize: 12 };

function localDateAfter(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() + days);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return year + "-" + month + "-" + day;
}
function toQuantity(value: string): number {
  const normalized = value
    .replace(/[٠-٩]/g, (digit) => String(digit.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, (digit) => String(digit.charCodeAt(0) - 0x06f0))
    .replace(/\s/g, "");
  if (!normalized) return 0;
  if (!/^\d{1,5}$/.test(normalized)) throw new Error("الكمية يجب أن تكون عددًا صحيحًا موجبًا.");
  const number = Number(normalized);
  if (!Number.isSafeInteger(number) || number < 0 || number > 10000) throw new Error("الكمية يجب أن تكون بين صفر و10000.");
  return number;
}
function addConcurrent<T, R>(items: readonly T[], concurrency: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (true) {
      const index = cursor++;
      if (index >= items.length) return;
      results[index] = await fn(items[index]);
    }
  });
  return Promise.all(workers).then(() => results);
}

export function CustomerShoppingListsWorkspace() {
  const { user, ready } = useAuth();
  const navigate = useNavigate();
  const [lists, setLists] = useState<CustomerShoppingList[]>([]);
  const [products, setProducts] = useState<CatalogProduct[]>([]);
  const [catalogOrganizationId, setCatalogOrganizationId] = useState<string | null>(null);
  const [catalogCursor, setCatalogCursor] = useState<string | null>(null);
  const [hasMoreCatalogProducts, setHasMoreCatalogProducts] = useState(false);
  const [loadingMoreCatalogProducts, setLoadingMoreCatalogProducts] = useState(false);
  const [cartQuantities, setCartQuantities] = useState<Record<string, number>>({});
  const [cartReady, setCartReady] = useState(false);
  const [companyMembers, setCompanyMembers] = useState<CompanyMember[]>([]);
  const [isCompanyOwner, setIsCompanyOwner] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [search, setSearch] = useState("");
  const [visibleProductCount, setVisibleProductCount] = useState(CUSTOMER_SHOPPING_LIST_VISIBLE_PAGE_SIZE);
  const [name, setName] = useState("قائمة مشتريات جديدة");
  const [category, setCategory] = useState<ShoppingListCategory>("custom");
  const [recurrence, setRecurrence] = useState<ShoppingListRecurrence>("none");
  const [nextRunOn, setNextRunOn] = useState(localDateAfter(7));
  const [draft, setDraft] = useState(false);
  const [editingListId, setEditingListId] = useState<string | null>(null);
  const [quantities, setQuantities] = useState<Record<string, string>>({});
  const [selectedUnits, setSelectedUnits] = useState<Record<string, UnitChoice>>({});
  const [unitOptions, setUnitOptions] = useState<Record<string, ProductUnitOptions>>({});
  const [loadingUnits, setLoadingUnits] = useState<Record<string, boolean>>({});
  const [activeShareList, setActiveShareList] = useState<string | null>(null);
  const [shareMemberId, setShareMemberId] = useState("");
  const [shareAccess, setShareAccess] = useState<ShoppingListAccess>("view");
  const [reviewRun, setReviewRun] = useState<CustomerShoppingListRun | null>(null);
  const [reviewLines, setReviewLines] = useState<ReviewLine[]>([]);
  const [reviewLoading, setReviewLoading] = useState(false);
  const [reviewError, setReviewError] = useState("");
  const [reviewConditionsAccepted, setReviewConditionsAccepted] = useState(false);
  const [loadedResult, setLoadedResult] = useState<LoadedResult | null>(null);
  const loadRevision = useRef(0);
  const activeProfile = useRef(user?.profileId);
  activeProfile.current = user?.profileId;

  const load = useCallback(async () => {
    const revision = ++loadRevision.current;
    setLoading(true);
    setError("");
    setNotice("");
    setCatalogOrganizationId(null);
    setCatalogCursor(null);
    setHasMoreCatalogProducts(false);
    setLoadingMoreCatalogProducts(false);
    const tenant = await getCurrentTenantScope().catch((cause) => {
      if (revision === loadRevision.current) setError(cause instanceof Error ? cause.message : "تعذر تحديد حساب الشركة الحالي.");
      return null;
    });
    if (!tenant || revision !== loadRevision.current) {
      if (revision === loadRevision.current) setLoading(false);
      return;
    }
    try {
      setCatalogOrganizationId(tenant.organizationId);
      const [savedLists, productsResult, cartResult, membersResult] = await Promise.all([
        fetchCustomerShoppingLists(),
        supabase.from("products")
          .select("id,name,item_code,sku,barcode,unit,status,min_order_quantity,order_quantity_multiple")
          .eq("organization_id", tenant.organizationId)
          .eq("status", "active")
          .order("id", { ascending: true })
          .range(0, CUSTOMER_SHOPPING_LIST_SERVER_PAGE_SIZE),
        fetchCustomerCart().catch(() => null),
        fetchCompanyMembershipWorkspace().catch(() => null),
      ]);
      if (revision !== loadRevision.current) return;
      if (productsResult.error) throw new Error("تعذر تحميل كتالوج المؤسسة الحالي. تحقق من صلاحية قراءة المنتجات.");
      const fetchedProducts = (productsResult.data ?? []) as CatalogProduct[];
      const initialCatalogPage = projectCustomerShoppingListServerPage(fetchedProducts);
      const parsedProducts = initialCatalogPage.items as CatalogProduct[];
      for (const product of parsedProducts) {
        if (!product.id || !product.name || !product.item_code || !product.unit ||
            !Number.isSafeInteger(product.min_order_quantity) || product.min_order_quantity < 1 ||
            !Number.isSafeInteger(product.order_quantity_multiple) || product.order_quantity_multiple < 1) {
          throw new Error("أعاد الكتالوج سياسة كمية أو هوية صنف غير صالحة؛ لم تُعرض بيانات غير موثوقة.");
        }
      }
      setLists(savedLists);
      setProducts(mergeCustomerShoppingListCatalogProducts([], parsedProducts));
      setCatalogCursor(initialCatalogPage.cursor);
      setHasMoreCatalogProducts(initialCatalogPage.hasMore);
      setCartReady(cartResult !== null);
      setCartQuantities(Object.fromEntries((cartResult?.items ?? []).map((line) => [line.product_id, line.quantity])));
      setIsCompanyOwner(membersResult !== null);
      setCompanyMembers((membersResult?.members ?? []).filter((member) => member.status === "active"));
    } catch (cause) {
      if (revision === loadRevision.current) {
        setError(cause instanceof Error ? cause.message : "تعذر تحميل قوائم المشتريات.");
      }
    } finally {
      if (revision === loadRevision.current) setLoading(false);
    }
  }, []);

  const loadMoreCatalogProducts = useCallback(async () => {
    if (!catalogOrganizationId || !catalogCursor || !hasMoreCatalogProducts || loadingMoreCatalogProducts) return;
    const actionProfileId = user?.profileId;
    setLoadingMoreCatalogProducts(true);
    setError("");
    try {
      const result = await supabase.from("products")
        .select("id,name,item_code,sku,barcode,unit,status,min_order_quantity,order_quantity_multiple")
        .eq("organization_id", catalogOrganizationId)
        .eq("status", "active")
        .gt("id", catalogCursor)
        .order("id", { ascending: true })
        .range(0, CUSTOMER_SHOPPING_LIST_SERVER_PAGE_SIZE);
      if (result.error) throw result.error;
      const fetched = (result.data ?? []) as CatalogProduct[];
      const page = projectCustomerShoppingListServerPage(fetched);
      for (const product of page.items) {
        if (!product.id || !product.name || !product.item_code || !product.unit ||
            !Number.isSafeInteger(product.min_order_quantity) || product.min_order_quantity < 1 ||
            !Number.isSafeInteger(product.order_quantity_multiple) || product.order_quantity_multiple < 1 ||
            product.status !== "active") {
          throw new Error("أعاد الكتالوج سياسة كمية أو هوية صنف غير صالحة؛ لم تُعرض بيانات غير موثوقة.");
        }
      }
      if (activeProfile.current !== actionProfileId) return;
      setProducts((current) => mergeCustomerShoppingListCatalogProducts(current, page.items));
      setCatalogCursor(page.cursor ?? catalogCursor);
      setHasMoreCatalogProducts(page.hasMore);
    } catch (cause) {
      if (activeProfile.current === actionProfileId) {
        setError(cause instanceof Error ? cause.message : "تعذر تحميل دفعة أخرى من كتالوج المؤسسة.");
      }
    } finally {
      if (activeProfile.current === actionProfileId) setLoadingMoreCatalogProducts(false);
    }
  }, [catalogCursor, catalogOrganizationId, hasMoreCatalogProducts, loadingMoreCatalogProducts, user?.profileId]);

  useEffect(() => {
    if (!ready || !user?.profileId) {
      setLoading(false);
      return;
    }
    setLists([]);
    setProducts([]);
    setCartQuantities({});
    setCartReady(false);
    setCompanyMembers([]);
    setIsCompanyOwner(false);
    void load();
    return () => { loadRevision.current += 1; };
  }, [ready, user?.profileId, load]);

  const filteredProducts = useMemo(() => filterCustomerShoppingListCatalog(products, search), [products, search]);
  const visibleProductPage = useMemo(() => projectCustomerShoppingListCatalogPage(filteredProducts, visibleProductCount), [filteredProducts, visibleProductCount]);
  const visibleProducts = visibleProductPage.items;

  async function ensureUnitOptions(product: CatalogProduct) {
    if (unitOptions[product.id] || loadingUnits[product.id]) return;
    setLoadingUnits((current) => ({ ...current, [product.id]: true }));
    try {
      const options = await fetchProductUnitOptions(product.id);
      if (options.base_unit !== product.unit) throw new Error("تغيرت الوحدة الأساسية للصنف؛ أعد تحميل الكتالوج.");
      setUnitOptions((current) => ({ ...current, [product.id]: options }));
      setSelectedUnits((current) => current[product.id]
        ? current
        : { ...current, [product.id]: { unit_name: product.unit, base_units_per_unit: 1 } });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "تعذر تحميل عبوات الصنف.");
    } finally {
      setLoadingUnits((current) => ({ ...current, [product.id]: false }));
    }
  }

  function currentLines(): ShoppingListLineInput[] {
    const lines: ShoppingListLineInput[] = [];
    for (const [productId, raw] of Object.entries(quantities)) {
      const qty = toQuantity(raw);
      if (qty === 0) continue;
      const product = products.find((item) => item.id === productId);
      if (!product) throw new Error("يوجد صنف لم يعد موجودًا في الكتالوج الحالي؛ حدّث الصفحة قبل الحفظ.");
      const unit = selectedUnits[productId] ?? { unit_name: product.unit, base_units_per_unit: 1 };
      const baseQuantity = qty * unit.base_units_per_unit;
      if (baseQuantity > 10000) throw new Error("الكمية بعد تحويل العبوة للصنف «" + product.name + "» تتجاوز الحد الآمن.");
      if (baseQuantity < product.min_order_quantity ||
          (baseQuantity - product.min_order_quantity) % product.order_quantity_multiple !== 0) {
        throw new Error("كمية «" + product.name + "» لا تطابق الحد الأدنى أو مضاعف الطلب بعد تحويل الوحدة الأساسية.");
      }
      lines.push({ product_id: productId, quantity: qty, unit_name: unit.unit_name, base_units_per_unit: unit.base_units_per_unit });
    }
    if (!lines.length) throw new Error("اختر كمية لصنف واحد على الأقل قبل حفظ القائمة.");
    if (lines.length > 100) throw new Error("الحد الأقصى للقائمة الواحدة 100 صنف.");
    return lines;
  }

  async function persistList(event: FormEvent<HTMLFormElement>, forceDraft = false) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    setNotice("");
    const actionProfileId = user?.profileId;
    try {
      const lines = currentLines();
      const effectiveDraft = forceDraft || draft;
      const savedId = await saveCustomerShoppingList({
        id: editingListId,
        name,
        category: forceDraft ? "quick_order" : category,
        isDraft: effectiveDraft,
        recurrence: effectiveDraft ? "none" : recurrence,
        nextRunOn: effectiveDraft || recurrence === "none" ? null : nextRunOn,
        items: lines,
      });
      if (activeProfile.current !== actionProfileId) return;
      setEditingListId(savedId);
      setNotice(effectiveDraft ? "حُفظت مسودة الطلب السريع في حساب الشركة." : "حُفظت قائمة المشتريات على خادم الشركة.");
      await load();
    } catch (cause) {
      if (activeProfile.current === actionProfileId) setError(cause instanceof Error ? cause.message : "تعذر حفظ قائمة المشتريات.");
    } finally {
      if (activeProfile.current === actionProfileId) setBusy(false);
    }
  }

  async function editList(list: CustomerShoppingList, duplicate: boolean) {
    if (busy) return;
    const missingIds = list.items.map((item) => item.product_id).filter((id) => !products.some((product) => product.id === id));
    const actionProfileId = user?.profileId;
    if (missingIds.length) {
      if (!catalogOrganizationId) {
        setError("تعذر تحديد مؤسسة العميل لتحميل أصناف القائمة المحفوظة.");
        return;
      }
      setBusy(true);
      setError("");
      try {
        const result = await supabase.from("products")
          .select("id,name,item_code,sku,barcode,unit,status,min_order_quantity,order_quantity_multiple")
          .eq("organization_id", catalogOrganizationId)
          .in("id", missingIds);
        if (result.error) throw result.error;
        const found = (result.data ?? []) as CatalogProduct[];
        const foundIds = new Set(found.map((product) => product.id));
        if (missingIds.some((id) => !foundIds.has(id)) || found.some((product) => product.status !== "active")) {
          throw new Error("بعض أصناف القائمة لم تعد متاحة في كتالوج المؤسسة الحالي؛ لم يُفتح محرر ناقص.");
        }
        if (activeProfile.current !== actionProfileId) return;
        setProducts((current) => mergeCustomerShoppingListCatalogProducts(current, found));
      } catch (cause) {
        if (activeProfile.current === actionProfileId) {
          setError(cause instanceof Error ? cause.message : "تعذر تحميل أصناف القائمة المحفوظة.");
        }
        return;
      } finally {
        if (activeProfile.current === actionProfileId) setBusy(false);
      }
    }
    if (activeProfile.current !== actionProfileId) return;
    setEditingListId(duplicate ? null : list.id);
    setName(duplicate ? list.name + " - نسخة" : list.name);
    setCategory(list.category);
    setDraft(list.is_draft);
    setRecurrence(list.is_draft ? "none" : list.recurrence);
    setNextRunOn(list.next_run_on ?? localDateAfter(7));
    setQuantities(Object.fromEntries(list.items.map((item) => [item.product_id, String(item.quantity)])));
    setSelectedUnits(Object.fromEntries(list.items.map((item) => [item.product_id, {
      unit_name: item.unit_name, base_units_per_unit: item.base_units_per_unit,
    }])));
    setSearch("");
    setVisibleProductCount(CUSTOMER_SHOPPING_LIST_VISIBLE_PAGE_SIZE);
    setNotice(duplicate ? "تم نسخ بنود القائمة إلى المحرر؛ احفظها لإنشاء قائمة مستقلة." : "تم تحميل القائمة إلى المحرر؛ التعديلات لا تُحفظ حتى تضغط حفظ.");
    setError("");
    setLoadedResult(null);
    setReviewRun(null);
  }

  async function importExcel(event: ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = "";
    if (!file) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const result = await parseCustomerShoppingListXlsx(file, products);
      setQuantities(Object.fromEntries(result.lines.map((line) => [line.product_id, String(line.quantity)])));
      setSelectedUnits((current) => ({
        ...current,
        ...Object.fromEntries(result.lines.map((line) => [line.product_id, {
          unit_name: line.unit_name, base_units_per_unit: 1,
        }])),
      }));
      setName(file.name.replace(/\.xlsx$/i, "").slice(0, 85) || "طلب سريع مستورد");
      setCategory("quick_order");
      setDraft(true);
      setRecurrence("none");
      setNextRunOn(localDateAfter(7));
      setEditingListId(null);
      setNotice("تمت مطابقة " + result.imported_rows + " صفًا من Excel دون إدخال أي طلب. راجع الكميات ثم احفظ المسودة.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "تعذر استيراد ملف Excel.");
    } finally {
      setBusy(false);
    }
  }

  async function startReview(list: CustomerShoppingList, runId?: string) {
    if (busy || reviewLoading) return;
    setReviewLoading(true);
    setReviewError("");
    setLoadedResult(null);
    setReviewRun(null);
    setReviewLines([]);
    setReviewConditionsAccepted(false);
    setError("");
    try {
      const id = runId ?? await createCustomerShoppingListRun(list.id);
      const run = await reviewCustomerShoppingListRun(id);
      if (run.status !== "review_required") throw new Error("هذه المراجعة سبق تحميلها إلى السلة أو لم تعد قابلة للاستخدام.");
      const [details, cart, unitChecks] = await Promise.all([
        fetchStorefrontCartProductDetails(run.items.map((item) => item.product_id)),
        fetchCustomerCart(),
        addConcurrent(run.items, 4, async (item) => {
          const options = await fetchProductUnitOptions(item.product_id);
          const matches = item.unit_name === options.base_unit
            ? item.base_units_per_unit === 1
            : options.units.some((unit) =>
              unit.unit_name === item.unit_name && unit.base_units_per_unit === item.base_units_per_unit,
            );
          return { productId: item.product_id, matches };
        }),
      ]);
      const byId = new Map<string, ProductWithInventory>();
      for (const product of details) byId.set(product.id, product);
      const cartById = new Map<string, number>();
      for (const line of cart.items) cartById.set(line.product_id, line.quantity);
      const unitsById = new Map<string, boolean>();
      for (const result of unitChecks) unitsById.set(result.productId, result.matches);
      const rows: ReviewLine[] = run.items.map((item) => {
        const product = byId.get(item.product_id) ?? null;
        const currentCartQuantity = cartById.get(item.product_id) ?? 0;
        const availableValue = product?.inventory?.quantity_available;
        const available = typeof availableValue === "number" && Number.isFinite(availableValue) && availableValue >= 0
          ? availableValue : null;
        const unitValid = unitsById.get(item.product_id) === true;
        const error = !product ? "الصنف لم يعد نشطًا أو غير متاح في الكتالوج الحالي."
          : !unitValid ? "تعريف العبوة تغير منذ حفظ القائمة؛ أعد تحرير القائمة واختيار العبوة الحالية."
          : available === null ? "رصيد المستودع غير معروف؛ لن نعتبره صفرًا أو متاحًا."
          : "";
        return { item, product, currentCartQuantity, available, unitValid, error };
      });
      const missing = details.length !== run.items.length;
      if (missing) throw new Error("بعض أصناف القائمة لم تعد متاحة ضمن كتالوج المؤسسة؛ لم يُسمح بتحميلها.");
      setReviewRun(run);
      setReviewLines(rows);
      setCartQuantities(Object.fromEntries(cart.items.map((line) => [line.product_id,line.quantity])));
      setCartReady(true);
      if (rows.some((row) => row.error)) {
        setReviewError("تحتاج القائمة إلى معالجة البنود التي لا يتوفر لها مخزون موثوق أو التي تغيرت عبواتها قبل التحميل.");
      }
    } catch (cause) {
      setReviewError(cause instanceof Error ? cause.message : "تعذر مراجعة القائمة.");
    } finally {
      setReviewLoading(false);
    }
  }

  const reviewValidation = useMemo(() => {
    if (!reviewRun || !reviewLines.length || !cartReady) return { valid: false, message: "حمّل السلة الحالية والكتالوج قبل الإضافة." };
    const invalidRow = reviewLines.find((row) => row.error || !row.product || row.available === null);
    if (invalidRow) return { valid: false, message: invalidRow.error || "لا تتوفر بيانات كافية للتحقق من الصنف." };
    const validation = validateQuickOrderLines(reviewLines.map((row) => ({
      product_id: row.item.product_id,
      product_name: row.item.product_name,
      quantity: row.item.quantity * row.item.base_units_per_unit,
      available: row.available as number,
      already_in_cart: row.currentCartQuantity ?? 0,
      min_order_quantity: row.product?.min_order_quantity ?? 1,
      order_quantity_multiple: row.product?.order_quantity_multiple ?? 1,
    })));
    if (!validation.valid) {
      const problem = reviewLines.find((row) => row.item.product_name === validation.product_name);
      return { valid: false, message: validation.reason === "insufficient_stock"
        ? "المتاح الحالي لا يغطي كمية القائمة مع الكمية الموجودة بالفعل في السلة: " + (problem?.item.product_name ?? "")
        : validation.reason === "order_policy"
          ? "الكمية الحالية لا تطابق الحد الأدنى أو مضاعف الطلب للصنف: " + (problem?.item.product_name ?? "")
          : "توجد كمية غير صالحة في مراجعة القائمة." };
    }
    return { valid: true, message: "" };
  }, [reviewRun, reviewLines, cartReady]);

  async function loadRunIntoCart() {
    if (!reviewRun || !reviewValidation.valid || busy) return;
    if (!reviewConditionsAccepted) {
      setReviewError("يلزم تأكيد مراجعة الكميات والتوفر وشروط التسعير الحالية قبل تحميل القائمة إلى السلة.");
      return;
    }
    setBusy(true);
    setReviewError("");
    setLoadedResult(null);
    const actionProfileId = user?.profileId;
    try {
      const result = await applyCustomerShoppingListRunToCart(reviewRun.id);
      if (activeProfile.current !== actionProfileId) return;
      setLoadedResult({ cartLineCount: result.cart.items.length, pricing: result.pricing });
      setReviewRun({ ...reviewRun, status: "cart_loaded" });
      setNotice("تم تحميل القائمة إلى السلة بعد إعادة فحص المخزون والسعر والوحدة على الخادم. لم يُرسل أي طلب.");
      await load();
    } catch (cause) {
      if (activeProfile.current === actionProfileId) {
        setReviewError(cause instanceof Error ? cause.message : "لم يتم تحميل القائمة؛ لم يُعرض نجاح غير مؤكد.");
      }
    } finally {
      if (activeProfile.current === actionProfileId) setBusy(false);
    }
  }

  async function shareList(listId: string) {
    if (!shareMemberId || busy) return;
    setBusy(true);
    setError("");
    try {
      await shareCustomerShoppingList(listId, shareMemberId, shareAccess);
      setNotice("تم تحديث مشاركة القائمة على الخادم بعد التحقق من عضوية الموظف.");
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "تعذرت مشاركة القائمة.");
    } finally { setBusy(false); }
  }
  async function revokeShare(listId: string, memberId: string) {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await removeCustomerShoppingListShare(listId, memberId);
      setNotice("أُلغيت صلاحية مشاركة القائمة.");
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "تعذر إلغاء المشاركة.");
    } finally { setBusy(false); }
  }

  if (!ready || loading) {
    return <main className="storefront" dir="rtl" style={{ padding: 24 }} role="status">جار تحميل قوائم المشتريات وكتالوج الشركة...</main>;
  }
  if (!user?.profileId) {
    return <main className="storefront" dir="rtl" style={{ padding: 20 }}><Login /></main>;
  }

  return (
    <main className="storefront" dir="rtl" style={{ padding: "16px clamp(12px,3vw,28px) 42px", maxWidth: 1500, margin: "0 auto" }}>
      <header style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 14, flexWrap: "wrap", marginBottom: 16 }}>
        <div>
          <h1 style={{ margin: "0 0 6px", fontSize: 25 }}>قوائم المشتريات والطلبات الدورية</h1>
          <p style={{ margin: 0, color: "#60777a" }}>قوائم متعددة للشركة، مشاركة الموظفين، استيراد Excel، ومراجعة أسبوعية أو شهرية قبل كل تحميل للسلة.</p>
        </div>
        <button type="button" style={altButton} onClick={() => void load()} disabled={loading || busy}>
          <RefreshCw size={16} /> تحديث من الخادم
        </button>
      </header>

      {error && <div role="alert" style={{ ...panel, borderColor: "#e2b4b4", color: "#982c2c", marginBottom: 14 }}>{error}</div>}
      {notice && <div role="status" style={{ ...panel, borderColor: "#b6d8c8", color: "#176847", marginBottom: 14 }}>{notice}</div>}

      <section style={{ ...panel, marginBottom: 18 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <div>
            <h2 style={{ margin: "0 0 5px", fontSize: 18 }}>إدخال كميات جماعي</h2>
            <p style={{ ...smallText, margin: 0 }}>تظهر الكمية الموجودة في السلة بجانب كل صنف. أدخل كميات الأصناف في جدول واحد، ثم احفظها كقائمة أو مسودة طلب سريع.</p>
          </div>
          <label style={{ ...altButton, cursor: busy ? "not-allowed" : "pointer", opacity: busy ? 0.55 : 1 }}>
            <Upload size={16} /> استيراد Excel (.xlsx)
            <input type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onChange={(event) => void importExcel(event)} disabled={busy || loading} style={{ display: "none" }} />
          </label>
        </div>

        <form onSubmit={(event) => void persistList(event)} style={{ display: "grid", gap: 12, marginTop: 16 }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(190px,1fr))", gap: 10 }}>
            <label style={{ fontSize: 13, fontWeight: 700 }}>اسم القائمة
              <input style={{ ...field, marginTop: 5 }} value={name} onChange={(event) => setName(event.target.value)} maxLength={100} />
            </label>
            <label style={{ fontSize: 13, fontWeight: 700 }}>نوع القائمة
              <select style={{ ...field, marginTop: 5 }} value={category} onChange={(event) => setCategory(event.target.value as ShoppingListCategory)}>
                {Object.entries(categoryLabels).map(([value,label]) => <option key={value} value={value}>{label}</option>)}
              </select>
            </label>
            <label style={{ fontSize: 13, fontWeight: 700 }}>دورية القائمة
              <select style={{ ...field, marginTop: 5 }} value={recurrence} disabled={draft} onChange={(event) => setRecurrence(event.target.value as ShoppingListRecurrence)}>
                {Object.entries(recurrenceLabels).map(([value,label]) => <option key={value} value={value}>{label}</option>)}
              </select>
            </label>
            <label style={{ fontSize: 13, fontWeight: 700 }}>أول موعد للمراجعة
              <input type="date" style={{ ...field, marginTop: 5 }} value={nextRunOn} min={localDateAfter(0)} disabled={draft || recurrence === "none"} onChange={(event) => setNextRunOn(event.target.value)} />
            </label>
          </div>
          <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
            <label style={{ display: "inline-flex", alignItems: "center", gap: 8, fontSize: 13 }}>
              <input type="checkbox" checked={draft} onChange={(event) => { setDraft(event.target.checked); if (event.target.checked) setRecurrence("none"); }} />
              حفظ كمسودة طلب سريع (لا تُجدول)
            </label>
            <span style={smallText}>التوقيت: صنعاء / Asia/Aden · التكرار يُنشئ مراجعة فقط ولا يرسل طلبًا تلقائيًا.</span>
          </div>

          <label style={{ position: "relative", display: "block" }}>
            <Search size={16} style={{ position: "absolute", right: 11, top: 12, color: "#688184" }} />
            <input style={{ ...field, paddingRight: 36 }} value={search} onChange={(event) => { setSearch(event.target.value); setVisibleProductCount(CUSTOMER_SHOPPING_LIST_VISIBLE_PAGE_SIZE); }} placeholder="ابحث بالاسم أو رمز الصنف أو SKU أو الباركود" />
          </label>
          <div style={{ overflowX: "auto", border: "1px solid #e5eeee", borderRadius: 10 }}>
            <table style={{ width: "100%", minWidth: 780, borderCollapse: "collapse", fontSize: 13 }}>
              <thead style={{ background: "#f3f8f7", color: "#33575b" }}>
                <tr>
                  <th style={{ textAlign: "right", padding: 10 }}>الصنف / الرمز</th>
                  <th style={{ textAlign: "center", padding: 10 }}>وحدة الطلب</th>
                  <th style={{ textAlign: "center", padding: 10 }}>الكمية</th>
                  <th style={{ textAlign: "center", padding: 10 }}>الموجود في السلة</th>
                  <th style={{ textAlign: "center", padding: 10 }}>سياسة الطلب</th>
                </tr>
              </thead>
              <tbody>
                {visibleProducts.map((product) => {
                  const unit = selectedUnits[product.id] ?? { unit_name: product.unit, base_units_per_unit: 1 };
                  const options = unitOptions[product.id];
                  return (
                    <tr key={product.id} style={{ borderTop: "1px solid #eaf0ef" }}>
                      <td style={{ padding: 9 }}>
                        <strong>{product.name}</strong>
                        <div style={smallText}>{product.item_code}{product.barcode ? " · " + product.barcode : ""}</div>
                      </td>
                      <td style={{ padding: 9, textAlign: "center" }}>
                        {options?.units.length ? (
                          <select aria-label={"وحدة " + product.name} style={{ ...field, minWidth: 125 }} value={unit.unit_name} onChange={(event) => {
                            const chosen = options.units.find((entry) => entry.unit_name === event.target.value);
                            setSelectedUnits((current) => ({
                              ...current, [product.id]: chosen ?? { unit_name: product.unit, base_units_per_unit: 1 },
                            }));
                          }}>
                            <option value={product.unit}>{product.unit} (أساسي)</option>
                            {options.units.map((entry) => <option key={entry.unit_name} value={entry.unit_name}>{entry.unit_name} = {entry.base_units_per_unit} {product.unit}</option>)}
                          </select>
                        ) : (
                          <div style={{ display: "grid", gap: 4 }}>
                            <span>{unit.unit_name}</span>
                            <button type="button" onClick={() => void ensureUnitOptions(product)} disabled={!!loadingUnits[product.id]} style={{ ...altButton, padding: "4px 8px", fontSize: 11 }}>
                              {loadingUnits[product.id] ? "تحميل..." : "مقارنة العبوات"}
                            </button>
                          </div>
                        )}
                      </td>
                      <td style={{ padding: 9, textAlign: "center" }}>
                        <input
                          type="text" inputMode="numeric" autoComplete="off" dir="ltr"
                          aria-label={"كمية " + product.name}
                          value={quantities[product.id] ?? ""}
                          onChange={(event) => setQuantities((current) => ({ ...current, [product.id]: event.target.value }))}
                          style={{ ...field, width: 94, margin: "0 auto", textAlign: "center" }}
                          placeholder="0"
                        />
                      </td>
                      <td style={{ padding: 9, textAlign: "center", fontWeight: 800 }}>
                        {cartReady ? formatNumber(cartQuantities[product.id] ?? 0) + " " + product.unit : "غير متاح"}
                      </td>
                      <td style={{ padding: 9, textAlign: "center", ...smallText }}>
                        الحد {product.min_order_quantity} · مضاعف {product.order_quantity_multiple}
                      </td>
                    </tr>
                  );
                })}
                {!visibleProducts.length && <tr><td colSpan={5} style={{ padding: 18, textAlign: "center", color: "#71898c" }}>لا توجد أصناف مطابقة للبحث.</td></tr>}
              </tbody>
            </table>
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", alignItems: "center", gap: 10, marginTop: 10 }}>
            <span role="status" style={smallText}>عرض {formatNumber(visibleProducts.length)} من {formatNumber(visibleProductPage.total)} نتيجة مطابقة ضمن الكتالوج المحمّل؛ الكمية في السلة بالوحدة الأساسية.</span>
            {visibleProductPage.hasMore ? <button type="button" style={altButton} disabled={busy} onClick={() => setVisibleProductCount(visibleProductPage.nextVisibleCount)}>عرض 80 نتيجة إضافية</button> : null}
            {hasMoreCatalogProducts ? <button type="button" style={altButton} disabled={busy || loadingMoreCatalogProducts} onClick={() => void loadMoreCatalogProducts()}>{loadingMoreCatalogProducts ? "جار تحميل أصناف إضافية..." : "تحميل 200 صنف إضافي من الكتالوج"}</button> : null}
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {editingListId && <button type="button" style={altButton} onClick={() => { setEditingListId(null); setName("قائمة مشتريات جديدة"); setQuantities({}); setSelectedUnits({}); }}>إلغاء التحرير</button>}
              <button type="submit" style={mainButton} disabled={busy || loading || !products.length}>
                <Save size={16} /> {busy ? "جار الحفظ..." : editingListId ? "حفظ التعديلات" : "حفظ القائمة"}
              </button>
              <button type="button" style={altButton} disabled={busy || !products.length} onClick={(event) => {
                const form = event.currentTarget.closest("form");
                if (form) void persistList({ preventDefault: () => undefined } as FormEvent<HTMLFormElement>, true);
              }}>
                <FileSpreadsheet size={16} /> حفظ كمسودة طلب سريع
              </button>
            </div>
          </div>
          <small style={smallText}>لم تُحسب أي أسعار في المتصفح. تُراجع الأسعار الحالية من خدمة التسعير المصرح بها عند فتح كل مراجعة، ويُعيد الخادم التحقق قبل تحميل السلة.</small>
        </form>
      </section>

      <section style={{ marginBottom: 20 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
          <ListPlus size={19} color="#087f8d" />
          <h2 style={{ margin: 0, fontSize: 19 }}>قوائم الشركة المحفوظة</h2>
          <span style={{ ...smallText, marginInlineStart: "auto" }}>{lists.length} قائمة</span>
        </div>
        {!lists.length ? (
          <div style={panel}>لم تُحفظ قوائم بعد. أنشئ أول قائمة أو استورد ملف Excel لإنشاء مسودة طلب سريع.</div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(min(100%,330px),1fr))", gap: 12 }}>
            {lists.map((list) => (
              <article key={list.id} style={{ ...panel, display: "grid", gap: 10 }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "start" }}>
                  <div>
                    <strong style={{ fontSize: 16 }}>{list.name}</strong>
                    <div style={{ ...smallText, marginTop: 4 }}>{categoryLabels[list.category]} · {list.items.length} صنف · {list.is_draft ? "مسودة" : "قائمة محفوظة"}</div>
                  </div>
                  <span style={{ fontSize: 11, borderRadius: 16, padding: "4px 8px", background: list.recurrence === "none" ? "#f0f4f3" : "#e6f5ef", color: list.recurrence === "none" ? "#647a7b" : "#18734f" }}>
                    {recurrenceLabels[list.recurrence]}
                  </span>
                </div>
                {list.recurrence !== "none" && <p style={{ margin: 0, ...smallText }}>المراجعة التالية: {list.next_run_on} · التوقيت: {list.timezone}</p>}
                {list.items.length > 0 && (
                  <div style={{ borderTop: "1px solid #e7eeee", paddingTop: 8, display: "grid", gap: 5 }}>
                    {list.items.slice(0, 6).map((item) => (
                      <div key={item.product_id} style={{ display: "flex", justifyContent: "space-between", gap: 10, fontSize: 12 }}>
                        <span style={{ color: "#365b5e" }}>{item.product_name} <span style={smallText}>({item.item_code})</span></span>
                        <strong style={{ whiteSpace: "nowrap" }}>{formatNumber(item.quantity)} {item.unit_name}</strong>
                      </div>
                    ))}
                    {list.items.length > 6 && <small style={smallText}>و {list.items.length - 6} أصناف أخرى محفوظة في القائمة.</small>}
                  </div>
                )}
                <div style={{ display: "flex", gap: 7, flexWrap: "wrap" }}>
                  {list.can_edit && <button type="button" style={altButton} onClick={() => void editList(list,false)}>تحرير البنود</button>}
                  <button type="button" style={mainButton} disabled={busy || !list.can_edit} onClick={() => void startReview(list)}>
                    <ShoppingCart size={15} /> مراجعة وتحميل إلى السلة
                  </button>
                  {list.can_edit && <button type="button" style={altButton} onClick={() => void editList(list,true)}>إعادة استخدام / نسخ</button>}
                  {isCompanyOwner && <button type="button" style={altButton} onClick={() => { setActiveShareList(activeShareList === list.id ? null : list.id); setShareMemberId(""); }}>
                    <Share2 size={15} /> مشاركة
                  </button>}
                </div>
                {list.runs.length > 0 && (
                  <div style={{ borderTop: "1px solid #e7eeee", paddingTop: 9 }}>
                    <strong style={{ fontSize: 12 }}>مراجعات دورية مستحقة</strong>
                    {list.runs.slice(0,4).map((run) => (
                      <div key={run.id} style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center", marginTop: 7 }}>
                        <span style={smallText}>{run.due_on ? "موعد " + run.due_on : "مراجعة يدوية"} · {new Date(run.created_at).toLocaleDateString("ar-YE")}</span>
                        <button type="button" style={{ ...altButton, padding: "5px 8px", fontSize: 11 }} disabled={busy || !list.can_edit} onClick={() => void startReview(list,run.id)}>فتح المراجعة</button>
                      </div>
                    ))}
                  </div>
                )}
                {list.shares.length > 0 && (
                  <div style={{ borderTop: "1px solid #e7eeee", paddingTop: 9 }}>
                    <strong style={{ fontSize: 12 }}>المشاركون</strong>
                    {list.shares.map((share) => {
                      const member = companyMembers.find((candidate) => candidate.profile_id === share.member_profile_id);
                      return <div key={share.member_profile_id} style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center", marginTop: 6 }}>
                        <span style={smallText}>{member?.full_name ?? "عضو الشركة"} · {share.access_level === "edit" ? "تعديل" : "عرض"}</span>
                        {isCompanyOwner && <button type="button" style={{ ...altButton, padding: "4px 7px", color: "#9a3939" }} onClick={() => void revokeShare(list.id,share.member_profile_id)} aria-label="إلغاء مشاركة العضو"><Trash2 size={13} /></button>}
                      </div>;
                    })}
                  </div>
                )}
                {activeShareList === list.id && isCompanyOwner && (
                  <div style={{ borderTop: "1px solid #e7eeee", paddingTop: 10, display: "grid", gap: 8 }}>
                    <strong style={{ fontSize: 13 }}>مشاركة مع موظف بالشركة</strong>
                    <select style={field} value={shareMemberId} onChange={(event) => setShareMemberId(event.target.value)}>
                      <option value="">اختر عضوًا نشطًا</option>
                      {companyMembers.filter((member) => member.profile_id !== user?.profileId).map((member) => (
                        <option key={member.profile_id} value={member.profile_id}>
                          {member.full_name} — {member.member_role === "buyer" ? "مشتريات" : member.member_role === "finance" ? "محاسبة" : "مشاهد"}
                        </option>
                      ))}
                    </select>
                    <select style={field} value={shareAccess} onChange={(event) => setShareAccess(event.target.value as ShoppingListAccess)}>
                      <option value="view">عرض فقط</option>
                      <option value="edit">عرض وتعديل (لمسؤول المشتريات فقط)</option>
                    </select>
                    <button type="button" style={mainButton} disabled={busy || !shareMemberId} onClick={() => void shareList(list.id)}>حفظ المشاركة</button>
                    {!companyMembers.length && <small style={smallText}>لا يوجد أعضاء نشطون آخرون للمشاركة معهم.</small>}
                  </div>
                )}
              </article>
            ))}
          </div>
        )}
      </section>

      {reviewLoading && <div style={panel} role="status"><LoaderCircle size={16} style={{ verticalAlign: "middle" }} /> جار جلب أرصدة الوحدات والمخزون والسلة الحالية...</div>}
      {reviewError && <div role="alert" style={{ ...panel, borderColor: "#dfb5a9", color: "#962f25", marginBottom: 14 }}>{reviewError}</div>}
      {reviewRun && (
        <section style={{ ...panel, borderColor: "#a8cfca", marginBottom: 20 }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
            <div>
              <h2 style={{ margin: "0 0 5px", fontSize: 19 }}>مراجعة: {reviewRun.list_name}</h2>
              <p style={{ ...smallText, margin: 0 }}>موعد الدورة: {reviewRun.due_on ?? "مراجعة يدوية"} · قبل الإضافة للسلة نعيد التحقق من الأسعار والتوفر.</p>
            </div>
            <button type="button" style={altButton} onClick={() => { setReviewRun(null); setReviewLines([]); setLoadedResult(null); }}>إغلاق المراجعة</button>
          </div>
          <div style={{ overflowX: "auto", marginTop: 12 }}>
            <table style={{ width: "100%", minWidth: 700, borderCollapse: "collapse", fontSize: 13 }}>
              <thead style={{ background: "#f4f8f7" }}>
                <tr>
                  <th style={{ textAlign: "right", padding: 9 }}>الصنف / الرمز</th>
                  <th style={{ padding: 9 }}>وحدة القائمة</th>
                  <th style={{ padding: 9 }}>الكمية</th>
                  <th style={{ padding: 9 }}>ما في السلة الآن</th>
                  <th style={{ padding: 9 }}>المتاح الآن</th>
                  <th style={{ padding: 9 }}>الحالة</th>
                </tr>
              </thead>
              <tbody>
                {reviewLines.map((row) => (
                  <tr key={row.item.product_id} style={{ borderTop: "1px solid #e8eeee" }}>
                    <td style={{ padding: 9 }}>
                      <strong>{row.item.product_name}</strong>
                      <div style={smallText}>{row.item.item_code}</div>
                    </td>
                    <td style={{ padding: 9, textAlign: "center" }}>{row.item.unit_name} ({row.item.base_units_per_unit} × {row.item.base_unit})</td>
                    <td style={{ padding: 9, textAlign: "center" }}>{formatNumber(row.item.quantity)}</td>
                    <td style={{ padding: 9, textAlign: "center" }}>{row.currentCartQuantity === null ? "غير معروف" : formatNumber(row.currentCartQuantity) + " " + row.item.base_unit}</td>
                    <td style={{ padding: 9, textAlign: "center" }}>{row.available === null ? "غير معروف" : new Intl.NumberFormat("ar-YE",{maximumFractionDigits:3}).format(row.available) + " " + row.item.base_unit + " (≈ " + formatNumber(Math.floor(row.available / row.item.base_units_per_unit)) + " " + row.item.unit_name + ")"}</td>
                    <td style={{ padding: 9, textAlign: "center", color: row.error ? "#a22" : "#18734f" }}>{row.error || "متاح للمراجعة"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div style={{ marginTop: 12 }}>
            <CustomerOrderPricingPreview
              items={reviewRun.items.map((item) => ({
                product_id: item.product_id,
                quantity: item.quantity * item.base_units_per_unit,
              }))}
              policyValue={true}
              surface="cart"
              title="الأسعار الحالية من الخادم"
            />
          </div>
          <label style={{ display: "flex", alignItems: "flex-start", gap: 8, marginTop: 12, padding: 10, border: "1px solid #dce8e7", borderRadius: 9, fontSize: 12, lineHeight: 1.7 }}>
            <input
              type="checkbox"
              checked={reviewConditionsAccepted}
              disabled={busy || Boolean(loadedResult)}
              onChange={(event) => setReviewConditionsAccepted(event.currentTarget.checked)}
              style={{ marginTop: 4 }}
            />
            أؤكد مراجعة كميات القائمة والتوفر الحالي والشروط التي أعادها الخادم. أوافق على تحميلها إلى السلة فقط؛ هذا الإجراء لا يرسل طلب شراء ولا يعتمد الطلب النهائي.
          </label>
          {!reviewValidation.valid && <p role="alert" style={{ color: "#9a3430", fontWeight: 750 }}>{reviewValidation.message}</p>}
          {loadedResult ? (
            <div style={{ borderTop: "1px solid #e2ecea", paddingTop: 12, marginTop: 12 }}>
              <p role="status" style={{ color: "#176847", fontWeight: 800 }}>
                <CheckCircle2 size={17} style={{ verticalAlign: "middle" }} /> تم تحديث السلة ({loadedResult.cartLineCount} صنفًا). لم يتم إرسال طلب الشراء.
              </p>
              <CustomerOrderPricingPresentation policyValue={true} serverPayload={loadedResult.pricing} expectedSurface="cart" title="السعر الذي أعاده الخادم لحظة التحميل" />
              <button type="button" style={mainButton} onClick={() => void navigate({ to: "/cart" })}>
                <ShoppingCart size={16} /> فتح السلة ومراجعة الطلب
              </button>
            </div>
          ) : (
            <button type="button" style={mainButton} disabled={busy || !reviewValidation.valid || !reviewConditionsAccepted || reviewRun.status !== "review_required"} onClick={() => void loadRunIntoCart()}>
              <ShoppingCart size={16} /> {busy ? "جار التحقق والتحميل..." : "إعادة التحقق وتحميل للسلة"}
            </button>
          )}
        </section>
      )}
    </main>
  );
}
