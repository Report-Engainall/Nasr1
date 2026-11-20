import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Activity, Minus, Plus, ShoppingCart, Trash2,
  Package, Tag, Phone, MapPin, Mail, Check, ChevronLeft, Menu, ClipboardList, Printer,
  Heart, GitCompare, ArrowRight, SlidersHorizontal, CreditCard,
} from 'lucide-react';
import { fetchProducts, fetchCategories, fetchStorefrontPromotions, fetchSettingsMap, fetchStorefrontAnnouncements } from '@/lib/api';
import { fetchStorefrontCatalogPage, type StorefrontCatalogPage } from '@/lib/storefront-catalog';
import { recordStorefrontUnavailableProductSearch } from '@/lib/intelligence/unavailable-product-search-demand-client';
import { useFetch } from '@/lib/useFetch';
import { formatNumber } from '@/lib/format';
import { normalizeLocalizedDecimalInput } from '@/lib/localized-number-input';
import { StorefrontPricePresentation } from '@/components/StorefrontPricePresentation';
import { ProductComparison } from '@/components/store/ProductComparison';
import { CartQuantityControl } from '@/components/store/CartQuantityControl';
import { fetchStorefrontCartProductDetails } from '@/lib/storefront-cart-products';
import { ProductMediaGallery } from '@/components/ProductMediaGallery';
import { ProductDataQualityPanel } from '@/components/store/ProductDataQualityPanel';
import { StorefrontProductOffers } from '@/components/store/StorefrontProductOffers';
import { formatProductUpdatedAt } from '@/lib/storefront-product-data-quality';
import { ProductPlaceholderArtwork } from '@/components/ProductPlaceholderArtwork';
import { StorefrontProductReviews } from '@/components/StorefrontProductReviews';
import { StorefrontProductQuestions } from '@/components/StorefrontProductQuestions';
import { resolveStorefrontPricePresentation, type CustomerOrderPricingPresentation } from '@/lib/storefront-price-visibility';
import {
  buildCartAvailabilitySnapshot,
  compareCartAvailabilitySnapshots,
  compareCartPricingSnapshots,
  clearCartPricingSnapshot,
  getCartAvailabilitySnapshot,
  getCartPricingSnapshot,
  rememberCartAvailabilitySnapshot,
  rememberCartPricingSnapshot,
  planCartAvailabilityAdjustments,
  type CartAvailabilityAdjustment,
  type CartAvailabilityChange,
} from '@/lib/cart-review-snapshot';
import { CustomerOrderPricingPreview, type CustomerOrderPricingPreviewStatus } from '@/components/CustomerOrderPricingPreview';
import { isCheckoutAuthorizationDenied } from '@/lib/checkout-errors';
import { persistCheckoutAttempt as verifyPersistedCheckoutAttempt } from '@/lib/checkout-attempt-storage';
import { matchesArabicCatalogSearch, normalizeCatalogSearchQuery, normalizeSavedProductIds, sanitizePublicCatalogCache, validateQuickOrderLines } from '@/lib/commerce-utils';
import { loadOfflineCartDraft, offlineCartStorageKey, saveOfflineCartDraft } from '@/lib/offline-cart';
import { fetchCustomerCart, saveCustomerCart } from '@/lib/customer-cart';
import type { ProductWithInventory, Category, Promotion } from '@/lib/types';
import { StorefrontAnnouncementSlider } from '@/components/StorefrontAnnouncementSlider';
import { StorefrontPredictiveSearch } from '@/components/StorefrontPredictiveSearch';
import { StorefrontMobileSearch } from '@/components/StorefrontMobileSearch';
import { useAuth } from '@/lib/auth';
import { Link, useNavigate } from '@tanstack/react-router';
import { FileText } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { fetchCustomerAddresses, type CustomerAddress } from '@/lib/customer-addresses';
import { readPendingSavedProductChanges, setStorefrontSavedProduct, storefrontWishlistStorageKey, syncStorefrontSavedProducts } from '@/lib/saved-products';
import { fetchProductUnitOptions, type ProductAlternateUnit } from '@/lib/product-unit-conversions';
import { canRecordRecentlyViewedProducts, recordRecentlyViewedProduct } from '@/lib/recently-viewed-products';
import { StorefrontRecentlyViewed } from '@/components/StorefrontRecentlyViewed';
import { readStorefrontCompareIds, storefrontCompareStorageKey, writeStorefrontCompareIds } from '@/lib/storefront-compare';
import { applyStorefrontProductHeadMetadata, buildStorefrontProductHeadMetadata, buildStorefrontProductStructuredData, serializeStorefrontProductStructuredData } from '@/lib/storefront-product-structured-data';

const PUBLIC_CATALOG_CACHE_KEY = 'aghbari:catalog:public:v2';

type CartItem = { product: ProductWithInventory; quantity: number };
type ProductUnitSelection = { unit_name: string; base_units_per_unit: number; selected_quantity: number };
type StorefrontProductsSnapshot =
  | ({ mode: 'paged'; identityKey: string; search: string; categoryId: string | null; availableOnly: boolean } & StorefrontCatalogPage)
  | { mode: 'full'; items: ProductWithInventory[]; identityKey: string; publicCacheable: boolean };

function formatCartReviewAmount(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat('ar-YE', { style: 'currency', currency, maximumFractionDigits: 3 }).format(amount);
  } catch {
    return `${formatNumber(amount)} ${currency}`;
  }
}

function pendingCartProduct(productId: string): ProductWithInventory {
  return {
    id: productId, name: 'تعذر استعادة بيانات الصنف', name_en: null, item_code: '', sku: null, barcode: null,
    category_id: null, brand_id: null, unit: 'وحدة', description: null, image_url: null, is_active: false, is_featured: false,
    sort_order: 0, stock_quantity: 0, reserved_quantity: 0, min_stock_level: 0, status: 'pending',
  };
}

function isSafeStorefrontImageUrl(value: unknown): value is string {
  return typeof value === "string" && value.trim() === value && /^https:\/\//i.test(value);
}

function nextOrderQuantity(currentQuantity: number, minimum: number, multiple: number): number {
  if (currentQuantity < minimum) return minimum;
  return (currentQuantity - minimum) % multiple === 0
    ? currentQuantity + multiple
    : minimum + (Math.floor((currentQuantity - minimum) / multiple) + 1) * multiple;
}

function mergeProductIntoCart(
  previous: CartItem[],
  product: ProductWithInventory,
  requestedQuantity: number | undefined,
  minimum: number,
  multiple: number,
  available: number | null,
): CartItem[] {
  const existing = previous.find((item) => item.product.id === product.id);
  const latestCurrentQuantity = existing?.quantity ?? 0;
  const latestNextQuantity = requestedQuantity ?? nextOrderQuantity(latestCurrentQuantity, minimum, multiple);
  if (available !== null && latestNextQuantity > available) return previous;
  if (!existing) return [...previous, { product, quantity: latestNextQuantity }];
  return previous.map((item) => item.product.id === product.id
    ? { ...item, quantity: latestNextQuantity }
    : item);
}
type StoreView = 'shop' | 'product' | 'wishlist' | 'compare' | 'matrix' | 'cart' | 'checkout';
export type StorefrontInitialView = 'shop' | 'product' | 'wishlist' | 'compare' | 'cart' | 'checkout';

function readSavedProductIds(key: string, maxItems: number): string[] {
  if (typeof window === 'undefined') return [];
  try {
    return normalizeSavedProductIds(JSON.parse(window.localStorage.getItem(key) || '[]') as unknown, maxItems);
  } catch {
    return [];
  }
}

type StorefrontProps = {
  onExit: () => void;
  initialView?: StorefrontInitialView;
  initialProductId?: string;
  initialQuery?: string;
  initialCategoryId?: string;
  initialAvailableOnly?: boolean;
};

/**
 * Remount all storefront-local data and UI state whenever the authenticated identity
 * or effective role changes. Keep this boundary inside Storefront: route components
 * may render outside AuthProvider in test/server route contexts.
 */
export function Storefront(props: StorefrontProps) {
  const { user, ready } = useAuth();
  const identityKey = JSON.stringify({
    ready,
    userId: user?.id ?? null,
    profileId: user?.profileId ?? null,
    roles: Array.isArray(user?.roles) ? [...user.roles].sort() : [],
    isStaff: user?.isStaff === true,
  });
  return <StorefrontSession key={identityKey} {...props} />;
}

function describeCustomerCartSyncState(state: string, isOnline: boolean): string {
  if (state === 'loading') return 'جار مزامنة سلة حسابك الآمنة مع الخادم...';
  if (state === 'synced') return 'تم حفظ سلتك في حسابك؛ ستظهر عند الدخول من جهاز آخر.';
  if (state === 'error') return 'تعذر استرجاع السلة المحفوظة؛ بقيت مسودتك المحلية دون استبدال.';
  if (state === 'pending') {
    return isOnline
      ? 'السلة المحلية محفوظة، لكن تأكيد المزامنة مع الخادم ما زال معلقًا.'
      : 'أنت غير متصل؛ تُحفظ التغييرات محليًا وستُعاد المزامنة عند الاتصال.';
  }
  return 'سلة الحساب تُزامن تلقائيًا عند فتحها أو تعديلها.';
}

function StorefrontSession({ onExit, initialView = 'shop', initialProductId, initialQuery, initialCategoryId, initialAvailableOnly }: StorefrontProps) {
  const { user, ready: authReady } = useAuth();
  const effectiveRoles = Array.isArray(user?.roles) ? [...user.roles].sort() : [];
  const storefrontIdentityKey = JSON.stringify({
    authReady,
    userId: user?.id ?? null,
    profileId: user?.profileId ?? null,
    roles: effectiveRoles,
    isStaff: user?.isStaff === true,
  });
  const navigate = useNavigate();
  const [view, setView] = useState<StoreView>(initialView);
  const [query, setQuery] = useState(() => normalizeCatalogSearchQuery(initialQuery ?? ''));
  const [activeCat, setActiveCat] = useState<string>(initialCategoryId ?? '');
  const [availableOnly, setAvailableOnly] = useState<boolean>(initialAvailableOnly ?? false);
  const [catalogPage, setCatalogPage] = useState(1);
  const [debouncedQuery, setDebouncedQuery] = useState(() => normalizeCatalogSearchQuery(initialQuery ?? ''));
  const isPagedView = initialView === 'shop' && view === 'shop';
  const { data: productSnapshot, loading: productsLoading, error: productsError, refetch: refetchProducts } =
    useFetch<StorefrontProductsSnapshot>(async () => {
      // The Supabase session is authoritative. useAuth can briefly lag a sign-in,
      // sign-out, account switch, or token refresh; all catalog modes fail closed on mismatch.
      const emptySnapshot = (): StorefrontProductsSnapshot => isPagedView
        ? { mode: 'paged', identityKey: storefrontIdentityKey, search: debouncedQuery, categoryId: activeCat || null, availableOnly, page: catalogPage, pageSize: 24, totalCount: 0, totalPages: 0, items: [] }
        : { mode: 'full', items: [], identityKey: storefrontIdentityKey, publicCacheable: false };
      if (view === 'cart' || view === 'checkout') return emptySnapshot();
      if (!authReady) return emptySnapshot();

      const expectedAuthUserId = user?.id ?? null;
      const anonymousContext = !expectedAuthUserId && !user?.profileId;
      if (!anonymousContext && !expectedAuthUserId) {
        throw new Error('هوية المستخدم غير مكتملة؛ لم يتم تحميل بيانات الكتالوج.');
      }

      const readSessionUserId = async () => {
        const response = await supabase.auth.getSession();
        if (!response || response.error) throw new Error('تعذر التحقق من جلسة المستخدم.');
        return response.data?.session?.user?.id ?? null;
      };
      const assertLiveIdentity = (sessionUserId: string | null, phase: 'before' | 'after') => {
        if (
          (anonymousContext && sessionUserId !== null) ||
          (!anonymousContext && sessionUserId !== expectedAuthUserId) ||
          (phase === 'after' && (!authReady || (user?.id ?? null) !== expectedAuthUserId))
        ) {
          throw new Error(phase === 'before'
            ? 'جلسة المصادقة لا تطابق هوية العرض الحالية؛ لم يتم تحميل بيانات الكتالوج.'
            : 'تغيرت جلسة المصادقة أثناء تحميل الكتالوج؛ أُهملت النتائج لمنع خلط المؤسسات.');
        }
      };

      let sessionUserBefore: string | null;
      try {
        sessionUserBefore = await readSessionUserId();
      } catch {
        throw new Error('تعذر التحقق من جلسة المستخدم؛ أعد المحاولة بعد اكتمال المصادقة.');
      }
      assertLiveIdentity(sessionUserBefore, 'before');

      if (isPagedView) {
        const page = await fetchStorefrontCatalogPage({
          search: debouncedQuery,
          categoryId: activeCat || null,
          page: catalogPage,
          pageSize: 24,
          availableOnly,
        });
        let sessionUserAfter: string | null;
        try {
          sessionUserAfter = await readSessionUserId();
        } catch {
          throw new Error('تعذر إعادة التحقق من جلسة المستخدم بعد تحميل الكتالوج.');
        }
        assertLiveIdentity(sessionUserAfter, 'after');
        return { mode: 'paged', identityKey: storefrontIdentityKey, search: debouncedQuery, categoryId: activeCat || null, availableOnly, ...page };
      }

      const items = await fetchProducts();
      let sessionUserAfter: string | null;
      try {
        sessionUserAfter = await readSessionUserId();
      } catch {
        throw new Error('تعذر إعادة التحقق من جلسة المستخدم بعد تحميل الكتالوج.');
      }
      assertLiveIdentity(sessionUserAfter, 'after');
      return { mode: 'full', items, identityKey: storefrontIdentityKey, publicCacheable: anonymousContext };
    }, [view, catalogPage, debouncedQuery, activeCat, availableOnly, initialView, storefrontIdentityKey]);
  // useFetch retains its previous result while a new request is pending or fails.
  // Only use data produced under the current session/role identity.
  const snapshotMatchesIdentity = productSnapshot?.identityKey === storefrontIdentityKey;
  const liveProducts = productSnapshot && snapshotMatchesIdentity && !productsError ? productSnapshot.items : null;
  const pageInfo = productSnapshot?.mode === 'paged' && snapshotMatchesIdentity && !productsError ? productSnapshot : null;
  const [cachedProducts, setCachedProducts] = useState<ProductWithInventory[]>(() => {
    if (typeof window === 'undefined') return [];
    try {
      // The former v1 cache had no public/tenant provenance. Purge it rather than
      // risk showing a previous authenticated organization's stock on a later session.
      window.localStorage.removeItem('aghbari:catalog:v1');
      const cachedRaw = window.localStorage.getItem(PUBLIC_CATALOG_CACHE_KEY);
      if (cachedRaw === null) return [];
      const value = JSON.parse(cachedRaw) as unknown;
      const safe = sanitizePublicCatalogCache(value);
      window.localStorage.setItem(PUBLIC_CATALOG_CACHE_KEY, JSON.stringify(safe));
      return safe;
    } catch { return []; }
  });
  const cachedProductsRef = useRef(cachedProducts);
  // Shared public cache is guest-only. Authenticated or not-yet-resolved sessions
  // must not fall back to globally cached products/inventory from another tenant.
  const products = isPagedView || !authReady || Boolean(user?.profileId)
    ? (liveProducts ?? [])
    : (liveProducts ?? cachedProducts);
  const {
    data: categories,
    loading: categoriesLoading,
    error: categoriesError,
    refetch: refetchCategories,
  } = useFetch(fetchCategories);
  const { data: promotions, loading: promotionsLoading, error: promotionsError, refreshError: promotionsRefreshError, refetch: refetchPromotions } = useFetch(fetchStorefrontPromotions);
  const { data: settings, loading: settingsLoading } = useFetch(fetchSettingsMap);
  const { data: storefrontAnnouncements, error: storefrontAnnouncementsError } = useFetch(fetchStorefrontAnnouncements);
  const cartStorageKey = offlineCartStorageKey(user?.profileId, user?.id);
  const wishlistStorageKey = storefrontWishlistStorageKey(user?.profileId, user?.id);
  const compareStorageKey = storefrontCompareStorageKey(user?.profileId, user?.id);
  const [cartState, setCartState] = useState<{ storageKey: string; items: CartItem[] }>({ storageKey: '', items: [] });
  const cartMutationRevisionRef = useRef(0);
  const cartRestored = cartState.storageKey === cartStorageKey;
  const cart = cartRestored ? cartState.items : [];
  const { data: emptyCartRecommendationSnapshot, loading: emptyCartRecommendationsLoading, error: emptyCartRecommendationsError, refetch: refetchEmptyCartRecommendations } =
    useFetch<{ identityKey: string; items: ProductWithInventory[] } | null>(async () => {
      if (view !== 'cart' || !cartRestored || cart.length > 0 || !authReady) return null;

      const expectedAuthUserId = user?.id ?? null;
      const anonymousContext = !expectedAuthUserId && !user?.profileId;
      if (!anonymousContext && !expectedAuthUserId) {
        throw new Error('هوية الحساب غير مكتملة؛ لم يتم تحميل ترشيحات الكتالوج.');
      }

      const readSessionUserId = async () => {
        const response = await supabase.auth.getSession();
        if (!response || response.error) throw new Error('تعذر التحقق من جلسة الحساب.');
        return response.data?.session?.user?.id ?? null;
      };
      const sessionBefore = await readSessionUserId();
      if ((anonymousContext && sessionBefore !== null) || (!anonymousContext && sessionBefore !== expectedAuthUserId)) {
        throw new Error('تغيرت جلسة الحساب؛ أُهملت ترشيحات المنتجات لمنع خلط بيانات المؤسسات.');
      }

      const page = await fetchStorefrontCatalogPage({
        search: '',
        categoryId: null,
        page: 1,
        pageSize: 4,
        availableOnly: true,
      });
      const sessionAfter = await readSessionUserId();
      if ((anonymousContext && sessionAfter !== null) ||
          (!anonymousContext && sessionAfter !== expectedAuthUserId) ||
          !authReady ||
          (user?.id ?? null) !== expectedAuthUserId) {
        throw new Error('تغيرت جلسة الحساب أثناء تحميل الترشيحات؛ أُهملت النتائج.');
      }

      return {
        identityKey: storefrontIdentityKey,
        items: page.items.filter((product) =>
          product.is_active === true &&
          product.status === 'active' &&
          typeof product.inventory?.quantity_available === 'number' &&
          product.inventory.quantity_available > 0,
        ).slice(0, 4),
      };
    }, [view, cartRestored, cart.length, authReady, storefrontIdentityKey]);
  const emptyCartRecommendations = emptyCartRecommendationSnapshot?.identityKey === storefrontIdentityKey
    ? emptyCartRecommendationSnapshot.items
    : [];
  const cartProductIdsKey = cart.map((item) => item.product.id).sort().join('|');
  const cartProductIds = useMemo(
    () => cartProductIdsKey ? cartProductIdsKey.split('|') : [],
    [cartProductIdsKey],
  );
  const cartProductDetailsKey = storefrontIdentityKey + '|' + cartStorageKey + '|' + cartProductIdsKey;
  const [cartProductDetailsState, setCartProductDetailsState] = useState<{
    key: string; loading: boolean; error: string | null; unresolvedIds: string[];
  }>({ key: '', loading: false, error: null, unresolvedIds: [] });
  const [cartProductRetryCount, setCartProductRetryCount] = useState(0);
  const cartProductDetailsLoaded = cartProductDetailsState.key === cartProductDetailsKey &&
    !cartProductDetailsState.loading && !cartProductDetailsState.error;
  const cartProductDetailsReady = cartProductDetailsLoaded && cartProductDetailsState.unresolvedIds.length === 0;
  function setCart(next: CartItem[] | ((previous: CartItem[]) => CartItem[])) {
    cartMutationRevisionRef.current += 1;
    setCartState((current) => {
      const previous = current.storageKey === cartStorageKey ? current.items : [];
      const items = typeof next === 'function' ? next(previous) : next;
      return { storageKey: cartStorageKey, items };
    });
  }
  const [matrixQuantities, setMatrixQuantities] = useState<Record<string, string>>({});
  const [matrixFeedback, setMatrixFeedback] = useState<{ kind: 'success' | 'error'; message: string } | null>(null);
  const [cartActionNotice, setCartActionNotice] = useState<string | null>(null);
  const [pendingCartRemoval, setPendingCartRemoval] = useState<{ item: CartItem; index: number } | null>(null);
  const [recentlyRemovedCartItems, setRecentlyRemovedCartItems] = useState<Array<{ item: CartItem; index: number }>>([]);
  const [cartPricingPreviewStatus, setCartPricingPreviewStatus] = useState<CustomerOrderPricingPreviewStatus>('loading');
  const [cartAvailabilityChanges, setCartAvailabilityChanges] = useState<CartAvailabilityChange[]>([]);
  const [mobileMenu, setMobileMenu] = useState(false);
  // Store only the selected ID. Resolve product details from the current identity-bound
  // catalog so stale tenant objects cannot survive while auth or network requests change.
  const [selectedProductState, setSelectedProductState] = useState<{
    identityKey: string;
    productId: string | null;
  }>({ identityKey: '', productId: null });
  const selectedProduct = selectedProductState.identityKey === storefrontIdentityKey && selectedProductState.productId
    ? products.find((product) => product.id === selectedProductState.productId) ?? null
    : null;
  const [wishlistState, setWishlistState] = useState<{ scopeKey: string; ids: string[] }>({ scopeKey: '', ids: [] });
  const wishlist = wishlistState.scopeKey === wishlistStorageKey ? wishlistState.ids : [];
  const setWishlist = useCallback((next: string[] | ((previous: string[]) => string[])) => {
    setWishlistState((current) => {
      const previous = current.scopeKey === wishlistStorageKey ? current.ids : [];
      const ids = typeof next === 'function' ? next(previous) : next;
      return { scopeKey: wishlistStorageKey, ids };
    });
  }, [wishlistStorageKey]);
  const [compareState, setCompareState] = useState<{ storageKey: string; ids: string[] }>(() => {
    try {
      return {
        storageKey: compareStorageKey,
        ids: typeof window === 'undefined'
          ? []
          : readStorefrontCompareIds(window.localStorage, compareStorageKey),
      };
    } catch {
      return { storageKey: compareStorageKey, ids: [] };
    }
  });
  const compare = compareState.storageKey === compareStorageKey ? compareState.ids : [];
  const setCompare = useCallback((next: string[] | ((previous: string[]) => string[])) => {
    setCompareState((current) => {
      const previous = current.storageKey === compareStorageKey ? current.ids : [];
      const ids = typeof next === 'function' ? next(previous) : next;
      return {
        storageKey: compareStorageKey,
        ids: normalizeSavedProductIds(ids, 3),
      };
    });
  }, [compareStorageKey]);
  const [savedListNotice, setSavedListNotice] = useState('');
  const [wishlistHydratedFor, setWishlistHydratedFor] = useState('');
  const [wishlistSyncState, setWishlistSyncState] = useState<'loading' | 'local' | 'synced' | 'pending'>('loading');
  const wishlistRevisionRef = useRef(0);
  const [isOnline, setIsOnline] = useState(typeof navigator === 'undefined' ? true : navigator.onLine);
  const previousOnlineRef = useRef(isOnline);
  const unavailableSearchObservationKeysRef = useRef(new Set<string>());
  const [customerCartHydratedFor, setCustomerCartHydratedFor] = useState('');
  const [customerCartSyncState, setCustomerCartSyncState] = useState<'idle' | 'loading' | 'synced' | 'pending' | 'error'>('idle');
  const [customerCartRetryCount, setCustomerCartRetryCount] = useState(0);
  const persistentCartProfileId = user && !user.isStaff && Array.isArray(user.roles) && user.roles.includes('customer') ? user.profileId : '';
  const cartReviewIdentity = useMemo(() => ({ userId: user?.id ?? null, profileId: user?.profileId ?? null }), [user?.id, user?.profileId]);
  const cartReviewLines = useMemo(
    () => cart.map((item) => ({ product_id: item.product.id, quantity: item.quantity })).sort((a, b) => a.product_id.localeCompare(b.product_id)),
    [cart],
  );
  const rememberCurrentCartPricing = useCallback((presentation: CustomerOrderPricingPresentation | null) => {
    if (presentation?.visible && settings?.show_price_in_cart === true) {
      rememberCartPricingSnapshot(cartReviewIdentity, cartReviewLines, presentation);
    }
  }, [cartReviewIdentity, cartReviewLines, settings?.show_price_in_cart]);
  const handleCartPricingPreviewStatus = useCallback((status: CustomerOrderPricingPreviewStatus) => {
    setCartPricingPreviewStatus(status);
    if (status === 'hidden' && !settingsLoading) {
      clearCartPricingSnapshot(cartReviewIdentity, cartReviewLines);
    }
  }, [cartReviewIdentity, cartReviewLines, settingsLoading]);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedQuery(query), 250);
    return () => window.clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    setQuery(normalizeCatalogSearchQuery(initialQuery ?? ''));
    setCatalogPage(1);
  }, [initialQuery]);

  useEffect(() => {
    setActiveCat(initialCategoryId ?? '');
    setCatalogPage(1);
  }, [initialCategoryId]);

  useEffect(() => {
    setAvailableOnly(initialAvailableOnly ?? false);
    setCatalogPage(1);
  }, [initialAvailableOnly]);

  useEffect(() => {
    setCatalogPage(1);
  }, [debouncedQuery, activeCat, availableOnly]);

  useEffect(() => {
    cachedProductsRef.current = cachedProducts;
  }, [cachedProducts]);

  useEffect(() => {
    const online = () => setIsOnline(true);
    const offline = () => setIsOnline(false);
    window.addEventListener('online', online);
    window.addEventListener('offline', offline);
    return () => {
      window.removeEventListener('online', online);
      window.removeEventListener('offline', offline);
    };
  }, []);

  useEffect(() => {
    const normalizedQuery = normalizeCatalogSearchQuery(query).trim();
    if (!authReady || !persistentCartProfileId || !user?.id || user.isStaff ||
        !Array.isArray(user.roles) || !user.roles.includes('customer') ||
        !isPagedView || view !== 'shop' || !isOnline ||
        availableOnly || normalizedQuery.length < 2 ||
        normalizedQuery !== debouncedQuery.trim() ||
        productsLoading || productsError ||
        !pageInfo || pageInfo.page !== catalogPage ||
        pageInfo.identityKey !== storefrontIdentityKey) return;

    const unavailableIds = pageInfo.items
      .filter(product => product.inventory &&
        typeof product.inventory.quantity_available === 'number' &&
        product.inventory.quantity_available === 0)
      .map(product => product.id);

    if (!unavailableIds.length) return;
    const key = [
      storefrontIdentityKey,
      normalizedQuery,
      activeCat,
      catalogPage,
      unavailableIds.slice().sort().join(','),
    ].join('|');
    if (unavailableSearchObservationKeysRef.current.has(key)) return;
    unavailableSearchObservationKeysRef.current.add(key);
    if (unavailableSearchObservationKeysRef.current.size > 200) {
      const oldest = unavailableSearchObservationKeysRef.current.values().next().value;
      if (oldest) unavailableSearchObservationKeysRef.current.delete(oldest);
    }

    // The RPC rechecks the exact search, same-tenant product IDs and current zero
    // availability before persisting a pseudonymous daily observation. No query or
    // customer identifier is stored by the tracking contract.
    void recordStorefrontUnavailableProductSearch({
      search: normalizedQuery,
      categoryId: activeCat || null,
      productIds: unavailableIds,
    });
  }, [
    authReady, persistentCartProfileId, user?.id, user?.isStaff, user?.roles,
    isPagedView, view, isOnline, availableOnly, query, debouncedQuery,
    productsLoading, productsError, pageInfo, catalogPage, storefrontIdentityKey, activeCat,
  ]);

  useEffect(() => {
    // Only cache full-catalog data explicitly fetched for the current confirmed guest identity.
    if (
      !liveProducts ||
      productSnapshot?.mode !== 'full' ||
      productSnapshot.publicCacheable !== true ||
      productSnapshot.identityKey !== storefrontIdentityKey ||
      !authReady ||
      user?.id ||
      user?.profileId
    ) return;
    let cancelled = false;
    void supabase.auth.getSession().then(({ data, error }) => {
      if (
        cancelled ||
        error ||
        data?.session !== null ||
        !authReady ||
        user?.id ||
        user?.profileId
      ) return;
      const safeCatalog = sanitizePublicCatalogCache(liveProducts);
      cachedProductsRef.current = safeCatalog;
      setCachedProducts(safeCatalog);
      try { window.localStorage.setItem(PUBLIC_CATALOG_CACHE_KEY, JSON.stringify(safeCatalog)); } catch { /* storage is optional */ }
    }).catch(() => {
      // If session provenance cannot be confirmed, do not populate shared cache.
    });
    return () => { cancelled = true; };
  }, [liveProducts, productSnapshot, storefrontIdentityKey, authReady, user?.id, user?.profileId]);

  useEffect(() => {
    if (!authReady) return;
    let cancelled = false;
    setWishlistHydratedFor('');
    const cached = readSavedProductIds(wishlistStorageKey, 500);
    const revisionAtStart = wishlistRevisionRef.current;
    setWishlist(cached);

    if (!user?.id || !user.profileId) {
      setWishlistSyncState('local');
      setWishlistHydratedFor(wishlistStorageKey);
      return () => { cancelled = true; };
    }

    setWishlistSyncState('loading');
    void syncStorefrontSavedProducts(user.id, user.profileId).then(({ productIds, pendingCount }) => {
      if (cancelled) return;
      setWishlistHydratedFor(wishlistStorageKey);
      if (revisionAtStart !== wishlistRevisionRef.current) return;
      setWishlist(productIds);
      setWishlistSyncState(pendingCount > 0 ? 'pending' : 'synced');
    }).catch(() => {
      if (cancelled) return;
      setWishlistHydratedFor(wishlistStorageKey);
      if (revisionAtStart !== wishlistRevisionRef.current) return;
      setWishlist(cached);
      setWishlistSyncState('pending');
    });

    return () => { cancelled = true; };
  }, [authReady, user?.id, user?.profileId, wishlistStorageKey, setWishlist]);

  useEffect(() => {
    const cameOnline = !previousOnlineRef.current && isOnline;
    previousOnlineRef.current = isOnline;
    if (!cameOnline || !authReady || !user?.id || !user.profileId || wishlistHydratedFor !== wishlistStorageKey) return;

    let cancelled = false;
    const revisionAtStart = wishlistRevisionRef.current;
    setWishlistSyncState('loading');
    void syncStorefrontSavedProducts(user.id, user.profileId).then(({ productIds, pendingCount }) => {
      if (cancelled || revisionAtStart !== wishlistRevisionRef.current) return;
      setWishlist(productIds);
      setWishlistSyncState(pendingCount > 0 ? 'pending' : 'synced');
    }).catch(() => {
      if (!cancelled && revisionAtStart === wishlistRevisionRef.current) setWishlistSyncState('pending');
    });
    return () => { cancelled = true; };
  }, [isOnline, authReady, user?.id, user?.profileId, wishlistHydratedFor, wishlistStorageKey, setWishlist]);

  useEffect(() => {
    if (!authReady || wishlistHydratedFor !== wishlistStorageKey || wishlistState.scopeKey !== wishlistStorageKey) return;
    try { window.localStorage.setItem(wishlistStorageKey, JSON.stringify(wishlist)); } catch { /* cache is optional; server remains authoritative */ }
  }, [authReady, wishlist, wishlistHydratedFor, wishlistStorageKey, wishlistState.scopeKey]);

  useEffect(() => {
    if (compareState.storageKey !== compareStorageKey || typeof window === 'undefined') return;
    try {
      writeStorefrontCompareIds(window.localStorage, compareStorageKey, compare);
    } catch {
      // Local comparison state is optional; live catalog and server remain authoritative.
    }
  }, [compare, compareState.storageKey, compareStorageKey]);

  useEffect(() => {
    if (initialView !== 'product' || !initialProductId || !products.length) return;
    setSelectedProductState({
      identityKey: storefrontIdentityKey,
      productId: products.some((product) => product.id === initialProductId) ? initialProductId : null,
    });
  }, [initialView, initialProductId, products, storefrontIdentityKey]);

  useEffect(() => {
    if (
      view !== 'product'
      || !selectedProduct
      || !user?.profileId
      || !canRecordRecentlyViewedProducts({
        authReady,
        profileId: user?.profileId,
        isStaff: user?.isStaff,
        roles: user?.roles,
      })
      || (initialView === 'product' && selectedProduct.id !== initialProductId)
      || typeof window === 'undefined'
    ) return;

    // Record a minimal public snapshot only after the identity-bound product is resolved.
    // Prices and availability are deliberately reloaded from the current catalogue on revisit.
    recordRecentlyViewedProduct(window.localStorage, user.profileId, {
      id: selectedProduct.id,
      name: selectedProduct.name,
      itemCode: selectedProduct.item_code,
      imageUrl: selectedProduct.image_url,
    });
  }, [
    view,
    selectedProduct?.id,
    selectedProduct?.name,
    selectedProduct?.item_code,
    selectedProduct?.image_url,
    authReady,
    user?.profileId,
    user?.isStaff,
    user?.roles,
    initialView,
    initialProductId,
  ]);



  useEffect(() => {
    if (cartRestored || typeof window === 'undefined' || !authReady) return;
    const draft = loadOfflineCartDraft(window.localStorage, user?.profileId, user?.id);
    const productById = new Map(products.map((product) => [product.id, product]));
    const restored = draft.map(({ product_id, quantity }) => ({
      product: productById.get(product_id) ?? pendingCartProduct(product_id),
      quantity,
    }));
    // Restore the saved IDs and quantities immediately; details are loaded separately
    // for these exact IDs, so an unrelated catalogue/page/price failure cannot hide the cart.
    setCart(restored);
  }, [authReady, products, cartStorageKey, cartRestored, user?.profileId, user?.id]);

  useEffect(() => {
    if (!cartRestored || typeof window === 'undefined') return;
    saveOfflineCartDraft(
      window.localStorage,
      user?.profileId,
      cart.map((item) => ({ product_id: item.product.id, quantity: item.quantity })),
      user?.id,
    );
  }, [cart, cartRestored, cartStorageKey, user?.profileId, user?.id]);
  useEffect(() => {
    if (!authReady || !cartRestored) return;
    const requestKey = cartProductDetailsKey;
    const productIds = [...cartProductIds];
    if (productIds.length === 0) {
      setCartProductDetailsState({ key: requestKey, loading: false, error: null, unresolvedIds: [] });
      return;
    }

    let cancelled = false;
    setCartProductDetailsState({ key: requestKey, loading: true, error: null, unresolvedIds: [] });
    void fetchStorefrontCartProductDetails(productIds).then((resolvedProducts) => {
      if (cancelled) return;
      const byId = new Map(resolvedProducts.map((product) => [product.id, product]));
      const unresolvedIds = productIds.filter((productId) => !byId.has(productId));
      const availabilitySnapshot = buildCartAvailabilitySnapshot(productIds, resolvedProducts);
      if (initialView === 'cart') {
        setCartAvailabilityChanges([]);
        rememberCartAvailabilitySnapshot(cartReviewIdentity, productIds, availabilitySnapshot);
      } else if (initialView === 'checkout') {
        setCartAvailabilityChanges(compareCartAvailabilitySnapshots(
          getCartAvailabilitySnapshot(cartReviewIdentity, productIds),
          availabilitySnapshot,
        ));
      }
      // Product hydration is metadata-only, not a customer mutation. Do not bump
      // cartMutationRevisionRef or the parallel remote-cart read could mistake this
      // response for a user edit and skip merging the saved server cart.
      setCartState((current) => {
        if (current.storageKey !== cartStorageKey) return current;
        return {
          ...current,
          items: current.items.map((item) => ({
            ...item,
            product: byId.get(item.product.id) ?? pendingCartProduct(item.product.id),
          })),
        };
      });
      setCartProductDetailsState({ key: requestKey, loading: false, error: null, unresolvedIds });
    }).catch((cause) => {
      if (cancelled) return;
      setCartProductDetailsState({
        key: requestKey,
        loading: false,
        error: cause instanceof Error ? cause.message : 'تعذر استعادة تفاصيل أصناف السلة.',
        unresolvedIds: [],
      });
    });

    return () => { cancelled = true; };
  }, [authReady, cartRestored, cartProductDetailsKey, cartProductIds, cartStorageKey, cartProductRetryCount, initialView, cartReviewIdentity]);

  useEffect(() => {
    if (isPagedView) return;
    if (!authReady) return;
    if (!persistentCartProfileId) {
      setCustomerCartHydratedFor('');
      setCustomerCartSyncState('idle');
      return;
    }
    if (!cartRestored || !isOnline) {
      if (!isOnline) setCustomerCartSyncState('pending');
      return;
    }
    if (customerCartHydratedFor === persistentCartProfileId) return;

    let cancelled = false;
    const revisionAtStart = cartMutationRevisionRef.current;
    setCustomerCartSyncState('loading');
    void fetchCustomerCart().then((snapshot) => {
      if (cancelled) return;
      // If the customer edits while the remote read is in flight, keep their latest local state
      // and let the write effect below persist it, rather than restoring an obsolete snapshot.
      if (revisionAtStart !== cartMutationRevisionRef.current) {
        setCustomerCartHydratedFor(persistentCartProfileId);
        setCustomerCartSyncState('pending');
        return;
      }
      const quantities = new Map<string, number>();
      for (const line of snapshot.items) quantities.set(line.product_id, line.quantity);
      // LocalStorage normally mirrors the last server state. max(), not sum(), avoids doubling it.
      for (const item of cart) {
        quantities.set(item.product.id, Math.max(quantities.get(item.product.id) ?? 0, item.quantity));
      }
      const catalogueProducts = new Map(products.map((product) => [product.id, product]));
      // Resolve product objects against the latest cart state at commit time.
      // The independent cart-product lookup may finish while the account-cart read is in flight;
      // never replace those hydrated rows with placeholders captured by this effect's stale closure.
      setCart((currentItems) => {
        const existingProducts = new Map(currentItems.map((item) => [item.product.id, item.product]));
        return [...quantities.entries()].map(([productId, quantity]) => ({
          product: catalogueProducts.get(productId) ?? existingProducts.get(productId) ?? pendingCartProduct(productId),
          quantity,
        }));
      });
      setCustomerCartHydratedFor(persistentCartProfileId);
      setCustomerCartSyncState('pending');
    }).catch(() => {
      if (!cancelled) setCustomerCartSyncState('error');
    });

    return () => { cancelled = true; };
  }, [
    authReady, persistentCartProfileId, cartRestored,
    isOnline, customerCartHydratedFor, customerCartRetryCount, products, cart,
  ]);

  useEffect(() => {
    if (!authReady || !persistentCartProfileId || !cartRestored || !isOnline
        || customerCartHydratedFor !== persistentCartProfileId) return;

    const revisionAtStart = cartMutationRevisionRef.current;
    const snapshot = cart.map((item) => ({ product_id: item.product.id, quantity: item.quantity }));
    let cancelled = false;
    const timer = window.setTimeout(() => {
      setCustomerCartSyncState('loading');
      void saveCustomerCart(snapshot).then(() => {
        if (cancelled) return;
        setCustomerCartSyncState(revisionAtStart === cartMutationRevisionRef.current ? 'synced' : 'pending');
      }).catch(() => {
        if (!cancelled) setCustomerCartSyncState('pending');
      });
    }, 250);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [authReady, persistentCartProfileId, cartRestored, isOnline, customerCartHydratedFor, cart]);

  const cartCount = cart.reduce((s, i) => s + i.quantity, 0);
  const canBuyNow = cartRestored && cartProductDetailsReady && isOnline && (
    !persistentCartProfileId ||
    customerCartHydratedFor === persistentCartProfileId
  );
  const buyNowDisabledMessage = !cartRestored
    ? "جار استعادة سلة الشراء قبل بدء الإتمام."
    : !cartProductDetailsReady
      ? cartProductDetailsState.error
        ? "تعذر استعادة تفاصيل السلة؛ أعد المحاولة من صفحة السلة."
        : cartProductDetailsState.unresolvedIds.length
          ? "تحتوي السلة على أصناف لم تعد متاحة في الكتالوج؛ راجعها قبل الشراء."
          : "جار استعادة تفاصيل أصناف السلة..."
      : !isOnline
        ? "يلزم اتصال بالإنترنت للتحقق من السلة وإتمام الطلب."
        : persistentCartProfileId && customerCartHydratedFor !== persistentCartProfileId
          ? customerCartSyncState === "error"
            ? "تعذر استعادة سلة حسابك؛ افتح السلة وأعد مزامنتها قبل الشراء المباشر."
            : "جار مزامنة سلة حسابك المحفوظة قبل الشراء المباشر."
          : null;

  function addToCart(product: ProductWithInventory, requestedQuantity?: number, unitSelection?: ProductUnitSelection): boolean {
    const minimum = Number.isSafeInteger(product.min_order_quantity) && Number(product.min_order_quantity) >= 1
      ? Number(product.min_order_quantity) : 1;
    const multiple = Number.isSafeInteger(product.order_quantity_multiple) && Number(product.order_quantity_multiple) >= 1
      ? Number(product.order_quantity_multiple) : 1;
    const available = typeof product.inventory?.quantity_available === 'number' && Number.isFinite(product.inventory.quantity_available)
      ? Math.max(0, Math.floor(product.inventory.quantity_available))
      : null;
    const explicitQuantityValid = requestedQuantity === undefined || (
      Number.isSafeInteger(requestedQuantity) &&
      requestedQuantity >= minimum &&
      (requestedQuantity - minimum) % multiple === 0
    );
    if (!explicitQuantityValid) {
      setCartActionNotice(`الكمية المطلوبة يجب أن تبدأ من الحد الأدنى (${minimum}) وتزيد بمضاعف (${multiple}) ${product.unit}.`);
      return false;
    }
    const currentQuantity = cart.find((item) => item.product.id === product.id)?.quantity ?? 0;
    const nextQuantity = requestedQuantity ?? nextOrderQuantity(currentQuantity, minimum, multiple);
    if (available !== null && nextQuantity > available) {
      setCartActionNotice(`لا يمكن إضافة «${product.name}»: الكمية المطلوبة (${nextQuantity}) تتجاوز المتاح (${available} ${product.unit}).`);
      return false;
    }

    setCartActionNotice(unitSelection
      ? `أُضيف ${formatNumber(unitSelection.selected_quantity)} ${unitSelection.unit_name} إلى السلة، بما يعادل ${formatNumber(requestedQuantity ?? 0)} ${product.unit}. تُراجع الكمية والأسعار والتوفر من الخادم قبل اعتماد الطلب.`
      : null);
    // The order/cart contract deliberately stores base units. Alternate-unit quantities
    // are converted before this point and continue through the same stock/pricing RPCs.
    setCart((previous) => mergeProductIntoCart(previous, product, requestedQuantity, minimum, multiple, available));
    return true;
  }
  function setCartQuantity(productId: string, requestedQuantity: number) {
    const existingItem = cart.find((item) => item.product.id === productId);
    if (!existingItem) return;
    const product = existingItem.product;
    const minimum = Number.isSafeInteger(product.min_order_quantity) && Number(product.min_order_quantity) >= 1
      ? Number(product.min_order_quantity) : 1;
    const multiple = Number.isSafeInteger(product.order_quantity_multiple) && Number(product.order_quantity_multiple) >= 1
      ? Number(product.order_quantity_multiple) : 1;
    const availableRaw = product.inventory?.quantity_available;
    const available = typeof availableRaw === 'number' && Number.isFinite(availableRaw)
      ? Math.max(0, Math.floor(availableRaw))
      : null;
    if (!Number.isSafeInteger(requestedQuantity) || requestedQuantity < minimum ||
        (requestedQuantity - minimum) % multiple !== 0 ||
        (available !== null && requestedQuantity > available)) {
      setCartActionNotice(`الكمية غير صالحة للصنف «${product.name}». الحد الأدنى ${minimum} ومضاعف الطلب ${multiple}${available === null ? '' : `، والحد المتاح ${available} ${product.unit}`}.`);
      return;
    }
    setCartActionNotice(null);
    setCart((previous) => previous.map((item) =>
      item.product.id === productId ? { ...item, quantity: requestedQuantity } : item
    ));
  }
  function requestCartRemoval(productId: string) {
    const index = cart.findIndex((item) => item.product.id === productId);
    if (index < 0) return;
    setPendingCartRemoval({ item: cart[index], index });
  }
  function confirmCartRemoval() {
    if (!pendingCartRemoval) return;
    const removed = pendingCartRemoval;
    setCart((previous) => previous.filter((item) => item.product.id !== removed.item.product.id));
    setRecentlyRemovedCartItems((current) => [...current.filter((entry) => entry.item.product.id !== removed.item.product.id), removed]);
    setPendingCartRemoval(null);
    setCartActionNotice(null);
  }
  function undoCartRemoval() {
    if (!recentlyRemovedCartItems.length) return;
    const present = new Set(cart.map((item) => item.product.id));
    const toRestore = recentlyRemovedCartItems
      .filter((entry) => !present.has(entry.item.product.id))
      .sort((left, right) => left.index - right.index);
    if (!toRestore.length) {
      setCartActionNotice('الأصناف المحذوفة موجودة بالفعل في السلة؛ لم تتم إضافة نسخ مكررة.');
      setRecentlyRemovedCartItems([]);
      return;
    }
    const restored = [...cart];
    for (const entry of toRestore) {
      restored.splice(Math.min(entry.index, restored.length), 0, entry.item);
    }
    setCart(restored);
    setRecentlyRemovedCartItems([]);
    setCartActionNotice('تمت استعادة الأصناف المحذوفة إلى السلة ومزامنة التغييرات.');
  }

  function applyCartAvailabilityChanges(adjustments: readonly CartAvailabilityAdjustment[]): { applied: boolean; message: string } {
    const blocked = adjustments.filter((adjustment) => adjustment.action === 'blocked');
    if (blocked.length) {
      return {
        applied: false,
        message: 'لم يؤكد الخادم كمية متاحة لبعض الأصناف. ارجع إلى السلة وأعد تحميل بيانات المخزون؛ لم نغيّر أي كمية.',
      };
    }

    const byProductId = new Map(adjustments.map((adjustment) => [adjustment.product_id.toLowerCase(), adjustment]));
    const removed: Array<{ item: CartItem; index: number }> = [];
    const updatedCart: CartItem[] = [];
    cart.forEach((item, index) => {
      const adjustment = byProductId.get(item.product.id.toLowerCase());
      if (!adjustment || adjustment.action === 'keep') {
        updatedCart.push(item);
      } else if (adjustment.action === 'reduce' && adjustment.next_quantity !== null) {
        updatedCart.push({ ...item, quantity: adjustment.next_quantity });
      } else if (adjustment.action === 'remove') {
        removed.push({ item, index });
      }
    });

    setCart(updatedCart);
    if (removed.length) {
      setRecentlyRemovedCartItems((current) => [
        ...current.filter((entry) => !removed.some((removedEntry) => removedEntry.item.product.id === entry.item.product.id)),
        ...removed,
      ]);
    }
    setCartAvailabilityChanges([]);
    setCartActionNotice('تم تطبيق كميات الخادم الحالية على السلة. راجع الأصناف والفاتورة المحدثة قبل اعتماد الطلب.');
    return {
      applied: true,
      message: 'طُبقت تعديلات التوفر على السلة وفق استجابة الخادم. راجع الكميات والفاتورة المحدثة ثم أكد الطلب من جديد.',
    };
  }
  function addMatrixSelection() {
    const selected = filtered.flatMap((product) => {
      const raw = matrixQuantities[product.id] ?? '';
      if (!raw.trim()) return [];
      return [{ product, quantity: Number(raw) }];
    });
    const validation = validateQuickOrderLines(selected.map(({ product, quantity }) => ({
      product_id: product.id,
      product_name: product.name,
      quantity,
      available: Math.max(0, Math.floor(Number(product.inventory?.quantity_available ?? 0))),
      already_in_cart: cart.find((item) => item.product.id === product.id)?.quantity ?? 0,
      min_order_quantity: product.min_order_quantity ?? 1,
      order_quantity_multiple: product.order_quantity_multiple ?? 1,
    })));
    if (!validation.valid) {
      const message = validation.reason === 'empty'
        ? 'أدخل كمية صحيحة لصنف واحد على الأقل.'
        : validation.reason === 'invalid_quantity'
          ? `الكمية المطلوبة للصنف «${validation.product_name ?? ''}» غير صحيحة. أدخل عددًا صحيحًا أكبر من صفر.`
          : validation.reason === 'order_policy'
            ? `كمية الصنف «${validation.product_name ?? ''}» لا تطابق الحد الأدنى أو مضاعف العبوة المحدد.`
            : `الكمية المطلوبة للصنف «${validation.product_name ?? ''}» تتجاوز المخزون الظاهر بما في ذلك الكمية الموجودة في السلة.`;
      setMatrixFeedback({ kind: 'error', message });
      return;
    }
    setCart((previous) => {
      const next = new Map(previous.map((item) => [item.product.id, { ...item }]));
      for (const line of selected) {
        const existing = next.get(line.product.id);
        next.set(line.product.id, { product: line.product, quantity: (existing?.quantity ?? 0) + line.quantity });
      }
      return [...next.values()];
    });
    setMatrixQuantities((previous) => ({ ...previous, ...Object.fromEntries(selected.map(({ product }) => [product.id, ''])) }));
    setMatrixFeedback({ kind: 'success', message: `تمت إضافة ${selected.length} أصناف إلى السلة. سيُعاد احتساب الأسعار والمخزون من الخادم قبل اعتماد الطلب.` });
  }
  function toggleWishlist(productId: string) {
    const saved = !wishlist.includes(productId);
    wishlistRevisionRef.current += 1;
    setWishlist((prev) => normalizeSavedProductIds(saved ? [...prev, productId] : prev.filter((id) => id !== productId), 500));
    setSavedListNotice('');
    if (!authReady || !user?.id || !user.profileId) return;

    void setStorefrontSavedProduct(user.id, user.profileId, productId, saved).then((applied) => {
      if (!applied) {
        setWishlistSyncState('pending');
        return;
      }
      setWishlistSyncState(Object.keys(readPendingSavedProductChanges(user.profileId)).length ? 'pending' : 'synced');
    });
  }
  function toggleCompare(productId: string) {
    if (compare.includes(productId)) {
      setCompare((prev) => prev.filter((id) => id !== productId));
      setSavedListNotice('');
      return;
    }
    if (compare.length >= 3) {
      setSavedListNotice('يمكن مقارنة ثلاثة أصناف فقط. أزل صنفًا من المقارنة قبل إضافة صنف آخر.');
      return;
    }
    setCompare((prev) => normalizeSavedProductIds([...prev, productId], 3));
    setSavedListNotice('');
  }
  function openProduct(product: ProductWithInventory) {
    void navigate({ to: '/product/$id', params: { id: product.id } });
  }

  function submitPredictiveSearch(searchText: string, categoryId: string | null = activeCat || null) {
    const normalizedSearch = normalizeCatalogSearchQuery(searchText).trim();
    void navigate({
      to: '/catalog',
      search: {
        ...(normalizedSearch ? { q: normalizedSearch } : {}),
        ...(categoryId ? { category: categoryId } : {}),
        ...(availableOnly ? { available: '1' as const } : {}),
      },
    });
  }

  const serverPageActive = Boolean(
    isPagedView && pageInfo && !productsLoading && !productsError && isOnline && query === debouncedQuery
  );
  const filtered = useMemo(() => {
    let list = products ?? [];
    if (!serverPageActive) {
      if (activeCat) list = list.filter((p) => p.category_id === activeCat);
      if (query.trim()) list = list.filter((p) => matchesArabicCatalogSearch(p, query));
      if (availableOnly) list = list.filter((p) => typeof p.inventory?.quantity_available === 'number' && Number.isFinite(p.inventory.quantity_available) && p.inventory.quantity_available > 0);
    }
    return list;
  }, [products, activeCat, query, availableOnly, serverPageActive]);
  const catalogCount = serverPageActive && pageInfo ? pageInfo.totalCount : products.length;
  const predictiveSearchQuery = normalizeCatalogSearchQuery(query).trim();
  const predictiveSearchHasQuery = predictiveSearchQuery.length >= 2;
  const predictiveSearchSnapshotIsCurrent = Boolean(authReady && isPagedView && pageInfo &&
    pageInfo.search === normalizeCatalogSearchQuery(debouncedQuery).trim() &&
    pageInfo.categoryId === (activeCat || null) &&
    pageInfo.availableOnly === availableOnly);
  const predictiveSearchProducts = isPagedView && predictiveSearchHasQuery &&
    predictiveSearchQuery === normalizeCatalogSearchQuery(debouncedQuery).trim() &&
    predictiveSearchSnapshotIsCurrent && !productsLoading && !productsError && isOnline
    ? pageInfo?.items ?? [] : [];
  const predictiveSearchLoading = isPagedView && predictiveSearchHasQuery && !productsError &&
    (predictiveSearchQuery !== normalizeCatalogSearchQuery(debouncedQuery).trim() || productsLoading || !predictiveSearchSnapshotIsCurrent);
  const predictiveSearchError = predictiveSearchHasQuery && productsError
    ? 'تعذر تحميل اقتراحات المنتجات من الكتالوج.' : null;
  const predictiveSearchProductsAvailable = predictiveSearchSnapshotIsCurrent && !productsLoading && !productsError && isOnline;

  const tickerMessages = (settings?.ticker_messages as string[]) ?? [];
  const tickerEnabled = settings?.ticker_enabled as boolean ?? true;

  return (
    <div className="storefront" dir="rtl">
      <header className="sf-header">
        <div className="sf-header-inner">
          <div className="sf-brand" aria-label="إنجاز — متجر الأغبري"><div className="sf-brand-icon"><img src="/icons/injaz-icon.svg" alt="" width={42} height={42} /></div><div><strong>إنجاز</strong><span>{(settings?.store_name as string) ?? 'متجر الأغبري'}</span></div></div>
          {user?.isStaff === true && (
            <button className="sf-admin-btn" onClick={onExit}><Activity size={16} /> لوحة التحكم</button>
          )}
          <StorefrontPredictiveSearch query={query} products={predictiveSearchProducts} categories={categories ?? []} loading={predictiveSearchLoading} productsAvailable={predictiveSearchProductsAvailable} error={predictiveSearchError} onQueryChange={(value) => { setQuery(normalizeCatalogSearchQuery(value)); setCatalogPage(1); }} onSearch={(value) => submitPredictiveSearch(value)} onProductSelect={openProduct} onCategorySelect={(category) => submitPredictiveSearch(query, category.id)} />
          <StorefrontMobileSearch
            query={query}
            products={predictiveSearchProducts}
            categories={categories ?? []}
            loading={predictiveSearchLoading}
            productsAvailable={predictiveSearchProductsAvailable}
            error={predictiveSearchError}
            onQueryChange={(value) => { setQuery(normalizeCatalogSearchQuery(value)); setCatalogPage(1); }}
            onSearch={(value) => submitPredictiveSearch(value)}
            onProductSelect={openProduct}
            onCategorySelect={(category) => submitPredictiveSearch(query, category.id)}
          />
          <div className="sf-header-links"><Link to="/search/advanced" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: 'inherit', textDecoration: 'none', fontSize: 11, fontWeight: 700 }}><SlidersHorizontal size={15} /> بحث متقدم</Link><button onClick={() => void navigate({ to: '/wishlist' })}><Heart size={16} /> المفضلة <b>{wishlist.length}</b></button><button onClick={() => void navigate({ to: '/compare' })}><GitCompare size={16} /> مقارنة</button><button onClick={() => { setMatrixFeedback(null); setView('matrix'); }}><ClipboardList size={16} /> طلب سريع</button><Link to="/orders" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: 'inherit', textDecoration: 'none', fontSize: 11, fontWeight: 700 }}><FileText size={16} /> طلباتي</Link>{!user && <Link to="/login" style={{ color: '#0b97a5', fontWeight: 800, fontSize: 11 }}>دخول</Link>}</div>
          <button className="sf-cart-btn" onClick={() => void navigate({ to: '/cart' })}><ShoppingCart size={20} /> {cartCount > 0 && <b>{cartCount}</b>}</button>
          <button className="sf-mobile-toggle" onClick={() => setMobileMenu(!mobileMenu)}><Menu size={22} /></button>
        </div>
      </header>

      {cartActionNotice && (() => {
        const isSuccess = cartActionNotice.startsWith('أُضيف ');
        const tone = isSuccess
          ? { color: '#17684d', background: '#edf9f2', border: '1px solid #b7d9ce' }
          : { color: '#8a2525', background: '#fff4f4', border: '1px solid #efc5c5' };
        return (
          <div role={isSuccess ? 'status' : 'alert'} aria-live={isSuccess ? 'polite' : 'assertive'} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', flexWrap: 'wrap', gap: 10, padding: '10px 16px', ...tone, borderBottom: tone.border, textAlign: 'center', fontSize: 12, fontWeight: 700 }}>
            <span>{cartActionNotice}</span>
            <button type="button" aria-label="إغلاق التنبيه" onClick={() => setCartActionNotice(null)} style={{ border: `1px solid ${isSuccess ? '#9cc8b4' : '#dba4a4'}`, borderRadius: 14, padding: '3px 9px', background: '#fff', color: tone.color }}>إغلاق</button>
          </div>
        );
      })()}

      {storefrontAnnouncementsError && <div className="sf-announcement-error" role="status">تعذر تحميل إعلانات المتجر الحالية؛ بقية الكتالوج متاحة.</div>}
      <StorefrontAnnouncementSlider announcements={storefrontAnnouncements ?? []} />

      {tickerEnabled && tickerMessages.length > 0 && (
        <div className="sf-ticker"><div className="sf-ticker-track">{tickerMessages.map((msg, i) => <span key={i}>{msg}</span>)}</div></div>
      )}

      <nav className={`sf-cats ${mobileMenu ? 'open' : ''}`}>
        <button className={activeCat === '' ? 'active' : ''} onClick={() => { setActiveCat(''); setCatalogPage(1); setMobileMenu(false); }}>كل المنتجات</button>
        {categories?.map((c: Category) => <button key={c.id} className={activeCat === c.id ? 'active' : ''} onClick={() => { setActiveCat(c.id); setCatalogPage(1); setMobileMenu(false); }}>{c.name}</button>)}
      </nav>

      {availableOnly && (
        <div role="status" className="sf-catalog-filter-notice" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', flexWrap: 'wrap', gap: 10, padding: '9px 16px', color: '#174b50', background: '#eaf6f4', borderBottom: '1px solid #c8e5e0', fontSize: 12 }}>
          <span>فلتر فعّال: أصناف ذات رصيد متاح معروف أكبر من صفر.</span>
          <button type="button" aria-label="إلغاء فلتر المتوفر فقط" onClick={() => {
            setAvailableOnly(false);
            void navigate({ to: '/catalog', search: {
              ...(query.trim() ? { q: query.trim() } : {}),
              ...(activeCat ? { category: activeCat } : {}),
            } });
          }} style={{ border: '1px solid #83bdb4', borderRadius: 16, padding: '4px 10px', background: '#fff', color: '#174b50', fontWeight: 800 }}>
            إظهار كل الأصناف المطابقة
          </button>
        </div>
      )}

      <div aria-label="أدوات الحساب التجاري" style={{ display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'center', padding: '10px 16px', borderBottom: '1px solid #e4eeee', background: '#fff' }}>
        {[['/invoices', 'الفواتير'], ['/statement', 'كشف الحساب'], ['/quotes', 'عروض الأسعار'], ['/reorder', 'إعادة الطلب'], ['/barcode', 'ماسح الباركود'], ['/assistant', 'المساعد الذكي'], ['/offline', 'دون اتصال']].map(([to, label]) => <Link key={to} to={to as never} style={{ textDecoration: 'none', color: '#0b7b89', border: '1px solid #d8e9e9', borderRadius: 18, padding: '6px 12px', fontSize: 11, fontWeight: 800 }}>{label}</Link>)}
      </div>

      {!isOnline && <div role="status" style={{ padding: '10px 16px', background: '#fff4df', color: '#7c4a05', borderBottom: '1px solid #efd7a5', textAlign: 'center', fontSize: 12, fontWeight: 700 }}>
        أنت غير متصل حاليًا. يعرض المتجر آخر نسخة محلية متاحة؛ قد تتغير الأسعار والأرصدة، ولن يُعتمد أي طلب حتى يعود الاتصال ويتحقق الخادم من البيانات الحالية.
      </div>}
      {productsError && products.length > 0 && <div role="status" style={{ padding: '10px 16px', background: '#fff9e9', color: '#7c4a05', borderBottom: '1px solid #ead7a8', textAlign: 'center', fontSize: 12, fontWeight: 700 }}>
        تعذر تحديث الكتالوج؛ تظهر نسخة محفوظة قديمة وقد تختلف الأسعار والأرصدة. <button type="button" onClick={() => void refetchProducts()} disabled={productsLoading} style={{ textDecoration: 'underline', marginInlineStart: 8 }}>إعادة المحاولة</button>
      </div>}
      {categoriesLoading && !categories && (
        <div
          role="status"
          style={{
            padding: '8px 16px',
            color: '#42666b',
            textAlign: 'center',
            fontSize: 12,
          }}
        >
          جار تحميل التصنيفات...
        </div>
      )}
      {categoriesError && (
        <div
          role="alert"
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexWrap: 'wrap',
            gap: 10,
            padding: '8px 16px',
            color: '#7c4a05',
            textAlign: 'center',
            fontSize: 12,
          }}
        >
          <span>
            تعذر تحميل التصنيفات: {categoriesError}. يمكنك البحث بالاسم أو رمز الصنف مؤقتًا.
          </span>
          <button
            type="button"
            className="sf-btn-secondary"
            aria-label="إعادة تحميل التصنيفات"
            disabled={categoriesLoading}
            onClick={() => void refetchCategories()}
          >
            {categoriesLoading ? 'جار إعادة تحميل التصنيفات...' : 'إعادة تحميل التصنيفات'}
          </button>
        </div>
      )}

      <main className="sf-main">
        {view === 'shop' && (
          <>
            <section className="sf-hero" style={{ background: `linear-gradient(120deg, ${(settings?.theme_primary as string) ?? '#087f8d'}, ${(settings?.theme_accent as string) ?? '#0eaa97'})` }}>
              <div><span className="sf-hero-kicker">عرض خاص</span><h1>{(settings?.hero_title as string) ?? 'الأغبري — موردك الموثوق'}</h1><p>{(settings?.hero_subtitle as string) ?? 'مواد غذائية بالجملة بأسعار تنافسية وتوصيل سريع'}</p></div>
              <div className="sf-hero-badge"><Package size={28} /><div><strong>{productsLoading && !products.length ? '…' : formatNumber(catalogCount)}</strong><span>{productsLoading && !products.length ? 'جار تحميل الكتالوج' : 'منتج في الكتالوج'}</span></div></div>
            </section>

            {promotions && promotions.filter((p: Promotion) => p.is_active).length > 0 && (
              <section className="sf-promos">{promotions.filter((p) => p.is_active).map((p: Promotion) => <div className="sf-promo" key={p.id}><Tag size={16} /> <strong>{p.title}</strong> <span>حملة ترويجية</span></div>)}</section>
            )}

            <section className="sf-products">
              <div className="sf-products-head"><div><h2>المنتجات</h2><span>{productsLoading && !products.length ? 'جار تحميل الكتالوج...' : `${formatNumber(serverPageActive && pageInfo ? pageInfo.totalCount : filtered.length)} صنف حسب بحثك وتصنيفك`}</span></div><div className="sf-discovery-links"><button onClick={() => void navigate({ to: '/wishlist' })}><Heart size={15} /> المفضلة</button><button onClick={() => void navigate({ to: '/compare' })}><GitCompare size={15} /> المقارنة ({compare.length}/3)</button><button onClick={() => { setMatrixFeedback(null); setView('matrix'); }}><ClipboardList size={15} /> طلب سريع</button></div></div>
              {productsLoading && !products.length
                ? <div className="sf-empty" role="status"><Package size={30} /><span>جار تحميل كتالوج المنتجات...</span></div>
                : productsError && !products.length
                  ? <div className="sf-empty" role="alert"><Package size={30} /><strong>تعذر تحميل الكتالوج</strong><small>{productsError}</small><button type="button" className="sf-btn-secondary" onClick={() => void refetchProducts()}>إعادة المحاولة</button></div>
                  : <ProductGrid
                    products={filtered}
                    priceVisibilityPolicy={settings?.show_price_on_cards}
                    wishlist={wishlist}
                    compare={compare}
                    emptyTitle={(serverPageActive && pageInfo ? pageInfo.totalCount : products.length) === 0 ? 'لا توجد أصناف منشورة حالياً' : 'لا توجد منتجات مطابقة'}
                    emptyDescription={(serverPageActive && pageInfo ? pageInfo.totalCount : products.length) === 0
                      ? 'لا توجد أصناف نشطة متاحة للعرض في المتجر حالياً. يُرجى التواصل مع إدارة المتجر إذا كنت تتوقع ظهور المنتجات.'
                      : 'جرّب تغيير البحث أو التصنيف'}
                    onOpen={openProduct}
                    onAdd={(product, quantity) => addToCart(product, quantity)}
                    cartQuantities={Object.fromEntries(cart.map((item) => [item.product.id, item.quantity]))}
                    onWishlist={toggleWishlist}
                    onCompare={toggleCompare}
                  />}
              {serverPageActive && pageInfo && pageInfo.totalPages > 1 && (
                <nav aria-label="صفحات الكتالوج" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12, padding: '18px 10px' }}>
                  <button type="button" className="sf-btn-secondary" disabled={productsLoading || pageInfo.page <= 1} onClick={() => setCatalogPage((current) => Math.max(1, current - 1))}>
                    <ChevronLeft size={15} /> السابقة
                  </button>
                  <span role="status" aria-live="polite">صفحة {pageInfo.page} من {pageInfo.totalPages} · {formatNumber(pageInfo.totalCount)} صنف</span>
                  <button type="button" className="sf-btn-secondary" disabled={productsLoading || pageInfo.page >= pageInfo.totalPages} onClick={() => setCatalogPage((current) => Math.min(pageInfo.totalPages, current + 1))}>
                    التالية <ChevronLeft size={15} style={{ transform: 'rotate(180deg)' }} />
                  </button>
                </nav>
              )}
            </section>
          </>
        )}

        {savedListNotice && <div role="status" className="sf-form-error" style={{ marginBottom: 12 }}>{savedListNotice}</div>}
        {user?.profileId && wishlistSyncState === 'pending' && <div role="status" className="sf-form-error" style={{ marginBottom: 12 }}>بعض تغييرات المفضلة لم تصل إلى الخادم بعد؛ حُفظت في هذا الجهاز وستُعاد مزامنتها عند عودة الاتصال أو استقرار الجلسة.</div>}
        {view === 'product' && (selectedProduct
          ? <ProductDetail
              product={selectedProduct}
              isStaff={user?.isStaff === true}
              promotions={promotions}
              promotionsLoading={promotionsLoading}
              promotionsError={promotionsError ?? promotionsRefreshError}
              onRetryPromotions={() => void refetchPromotions()}
              relatedProducts={(products ?? []).filter((candidate) =>
                selectedProduct.category_id !== null
                && candidate.id !== selectedProduct.id
                && candidate.category_id === selectedProduct.category_id
              ).slice(0, 4)}
              priceVisibilityPolicy={settings?.show_price_on_cards}
              inWishlist={wishlist.includes(selectedProduct.id)}
              inCompare={compare.includes(selectedProduct.id)}
              initialQuantity={cart.find((item) => item.product.id === selectedProduct.id)?.quantity ?? null}
              canBuyNow={canBuyNow}
              buyNowDisabledMessage={buyNowDisabledMessage}
              onBack={() => void navigate({ to: '/' })}
              onAdd={(quantity, unitSelection) => addToCart(selectedProduct, quantity, unitSelection)}
              onBuyNow={(quantity, unitSelection) => {
                if (addToCart(selectedProduct, quantity, unitSelection)) setView('checkout');
              }}
              onWishlist={() => toggleWishlist(selectedProduct.id)}
              onCompare={() => toggleCompare(selectedProduct.id)}
              onOpenRelated={openProduct}
            />
          : productsLoading ? <div className="sf-empty" role="status">جار تحميل تفاصيل المنتج...</div>
            : productsError ? <div className="sf-empty" role="alert"><strong>تعذر تحميل تفاصيل المنتج</strong><small>{productsError}</small><button type="button" onClick={() => void refetchProducts()}>إعادة المحاولة</button></div>
              : <div className="sf-empty" role="alert"><strong>المنتج غير متاح</strong><small>تعذر العثور على المنتج ضمن الكتالوج الحالي.</small><button type="button" onClick={() => void navigate({ to: '/' })}>العودة للمتجر</button></div>)}
        {view === 'product' && selectedProduct && (
          <StorefrontRecentlyViewed
            products={products}
            currentProductId={selectedProduct.id}
            priceVisibilityPolicy={settings?.show_price_on_cards}
            onOpen={openProduct}
          />
        )}

        {view === 'wishlist' && <CollectionView title="المفضلة" priceVisibilityPolicy={settings?.show_price_on_cards} icon={Heart} products={products.filter((p) => wishlist.includes(p.id))} wishlist={wishlist} compare={compare} loading={productsLoading} error={productsError} onRetry={() => void refetchProducts()} onOpen={openProduct} onAdd={(product, quantity) => addToCart(product, quantity)} cartQuantities={Object.fromEntries(cart.map((item) => [item.product.id, item.quantity]))} onWishlist={toggleWishlist} onCompare={toggleCompare} onBack={() => void navigate({ to: '/' })} empty="لا توجد منتجات محفوظة في المفضلة ضمن الكتالوج الحالي" />}
        {view === 'compare' && <ProductComparison products={products.filter((product) => compare.includes(product.id))} priceVisibilityPolicy={settings?.show_price_on_cards} loading={productsLoading} error={productsError} onRetry={() => void refetchProducts()} onOpen={openProduct} onAdd={addToCart} onRemove={toggleCompare} onBack={() => void navigate({ to: '/' })} />}
        {view === 'matrix' && <QuickOrderMatrix products={filtered} quantities={matrixQuantities} alreadyInCart={Object.fromEntries(cart.map((item) => [item.product.id, item.quantity]))} feedback={matrixFeedback} onQuantityChange={(id, value) => { setMatrixQuantities((previous) => ({ ...previous, [id]: value })); setMatrixFeedback(null); }} onAddSelected={addMatrixSelection} onBack={() => setView('shop')} onCart={() => void navigate({ to: '/cart' })} />}

        {view === 'cart' && (!cartRestored ? (
          <section className="sf-cart-page">
            <h2>سلة المشتريات</h2>
            <div className="sf-empty" role="status">
              <span>جار استعادة السلة المحفوظة...</span>
            </div>
          </section>
        ) : (
          <section className="sf-cart-page">
            <h2>سلة المشتريات</h2>
            {pendingCartRemoval && (
              <div role="alertdialog" aria-modal="true" aria-labelledby="cart-remove-title" style={{ margin: '12px 0', padding: 14, border: '1px solid #e2b8a9', borderRadius: 12, background: '#fff8f5', color: '#6f382c' }}>
                <strong id="cart-remove-title">تأكيد حذف الصنف</strong>
                <p style={{ margin: '6px 0 12px' }}>هل تريد إزالة «{pendingCartRemoval.item.product.name}» بكمية {formatNumber(pendingCartRemoval.item.quantity)} {pendingCartRemoval.item.product.unit} من السلة؟ يمكنك استعادته بعد الحذف.</p>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <button type="button" className="sf-btn-primary" onClick={confirmCartRemoval}>تأكيد الحذف</button>
                  <button type="button" className="sf-btn-secondary" onClick={() => setPendingCartRemoval(null)}>إلغاء</button>
                </div>
              </div>
            )}
            {recentlyRemovedCartItems.length > 0 && (
              <div role="status" aria-live="polite" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap', margin: '10px 0', padding: 12, borderRadius: 10, border: '1px solid #d6e7dc', background: '#f4faf6', color: '#24583e' }}>
                <span>يمكن استعادة: {recentlyRemovedCartItems.map((entry) => entry.item.product.name).join('، ')}.</span>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button type="button" className="sf-btn-secondary" onClick={undoCartRemoval}>تراجع واستعادة الأصناف</button>
                  <button type="button" className="sf-link" onClick={() => setRecentlyRemovedCartItems([])}>إغلاق</button>
                </div>
              </div>
            )}
            {persistentCartProfileId && (
              <div role="status" aria-live="polite" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', margin: '10px 0', padding: 12, borderRadius: 10, border: '1px solid #d8e6e8', background: '#f7fafb', color: '#344b52', fontSize: 12 }}>
                <span>{describeCustomerCartSyncState(customerCartSyncState, isOnline)}</span>
                {(customerCartSyncState === 'pending' || customerCartSyncState === 'error') && (
                  <button type="button" className="sf-btn-secondary" disabled={!isOnline} onClick={() => {
                    setCustomerCartHydratedFor('');
                    setCustomerCartSyncState('idle');
                    setCustomerCartRetryCount((current) => current + 1);
                  }}>إعادة المزامنة</button>
                )}
              </div>
            )}
            {!cart.length ? <>
              <div className="sf-empty">
                <ShoppingCart size={30} />
                <span>سلتك فارغة</span>
                <p>ابدأ بإضافة الأصناف المناسبة لاحتياجك، أو استعد قائمة مشتريات محفوظة من طلب سابق.</p>
                <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
                  <button className="sf-btn-primary" onClick={() => void navigate({ to: '/' })}>تصفح الكتالوج الكامل</button>
                  <Link className="sf-btn-secondary" to="/reorder">استعادة قائمة مشتريات محفوظة</Link>
                </div>
              </div>
              <section className="sf-products" aria-label="منتجات متاحة للعودة إلى التسوق">
                <div className="sf-products-head">
                  <div><h2>منتجات متاحة لتبدأ من جديد</h2><span>أصناف نشطة ومتاحة حاليًا من كتالوج المتجر</span></div>
                </div>
                {emptyCartRecommendationsLoading ? (
                  <div className="sf-empty" role="status">جار تحميل المنتجات المتاحة...</div>
                ) : emptyCartRecommendationsError ? (
                  <div className="sf-empty" role="alert">
                    <strong>تعذر تحميل ترشيحات المنتجات</strong>
                    <small>{emptyCartRecommendationsError}</small>
                    <button type="button" className="sf-btn-secondary" onClick={() => void refetchEmptyCartRecommendations()}>إعادة المحاولة</button>
                  </div>
                ) : (
                  <ProductGrid
                    products={emptyCartRecommendations}
                    priceVisibilityPolicy={settings?.show_price_on_cards}
                    wishlist={wishlist}
                    compare={compare}
                    emptyTitle="لا توجد منتجات متاحة حاليًا"
                    emptyDescription="يمكنك تصفح الكتالوج الكامل أو استعادة قائمة مشتريات محفوظة."
                    onOpen={openProduct}
                    onAdd={(product, quantity) => addToCart(product, quantity)}
                    cartQuantities={Object.fromEntries(cart.map((item) => [item.product.id, item.quantity]))}
                    onWishlist={toggleWishlist}
                    onCompare={toggleCompare}
                  />
                )}
              </section>
            </> :
            !cartProductDetailsLoaded ? (
              <div className="sf-empty" role={cartProductDetailsState.error ? 'alert' : 'status'}>
                <span>{cartProductDetailsState.error ?? 'جار استعادة تفاصيل أصناف سلتك...'}</span>
                {cartProductDetailsState.error && (
                  <button type="button" className="sf-btn-secondary" onClick={() => setCartProductRetryCount((current) => current + 1)}>إعادة المحاولة</button>
                )}
              </div>
            ) : (
            <>
              {cartProductDetailsState.unresolvedIds.length > 0 && (
                <div role="alert" className="sf-form-error" style={{ marginBottom: 12 }}>
                  بعض الأصناف لم تعد نشطة في الكتالوج الحالي. احذفها من السلة قبل إتمام الطلب.
                </div>
              )}
              <div className="sf-cart-list">
                {cart.map((item) => {
                  const unavailable = item.product.status === 'pending';
                  return (
                    <div className="sf-cart-row" key={item.product.id}>
                      <div className="sf-cart-info">
                        <div className="sf-cart-img"><Package size={20} /></div>
                        <div>
                          <strong>{unavailable ? 'صنف غير متاح حاليًا' : item.product.name}</strong>
                          <span>{unavailable ? <>معرّف الصنف المحفوظ: <bdi>{item.product.id.slice(0, 8)}</bdi></> : `الوحدة: ${item.product.unit}`}</span>
                          {!unavailable && <small style={{ display: 'block', marginTop: 4, color: typeof item.product.inventory?.quantity_available === 'number' && item.quantity > item.product.inventory.quantity_available ? '#a52b2b' : '#647b78' }}>
                            {typeof item.product.inventory?.quantity_available === 'number'
                              ? `المتاح الآن: ${formatNumber(Math.max(0, item.product.inventory.quantity_available))} ${item.product.unit}${item.quantity > item.product.inventory.quantity_available ? ' — الكمية المطلوبة تتجاوز المتاح' : ''}`
                              : 'المخزون الحالي غير مؤكد؛ سيُعاد التحقق منه على الخادم قبل الإرسال.'}
                          </small>}
                        </div>
                      </div>
                      {unavailable ? (
                        <span role="status" style={{ color: '#9a3630', fontSize: 12 }}>يتطلب الحذف من السلة</span>
                      ) : (
                        <CartQuantityControl
                          productName={item.product.name}
                          quantity={item.quantity}
                          minimum={item.product.min_order_quantity}
                          multiple={item.product.order_quantity_multiple}
                          available={item.product.inventory?.quantity_available}
                          onCommit={(quantity) => setCartQuantity(item.product.id, quantity)}
                        />
                      )}
                      <button className="sf-cart-remove" aria-label={`حذف ${unavailable ? 'الصنف غير المتاح' : item.product.name} من السلة`} onClick={() => requestCartRemoval(item.product.id)}><Trash2 size={16} /></button>
                    </div>
                  );
                })}
              </div>
              {cartProductDetailsReady ? (
                <CustomerOrderPricingPreview
                  items={cart.map((item) => ({ product_id: item.product.id, quantity: item.quantity }))}
                  policyValue={settings?.show_price_in_cart}
                  surface="cart"
                  title="ملخص أسعار السلة"
                  onStatusChange={handleCartPricingPreviewStatus}
                  onPresentationChange={rememberCurrentCartPricing}
                />
              ) : null}
              {settings?.show_price_in_cart !== true && <div role="note" style={{ marginTop: 12, padding: 12, borderRadius: 10, background: '#f2f7f8', color: '#536b70' }}>سيُراجع الطلب ويُعتمد من جهة الإدارة. إظهار الأسعار والإجماليات معطّل في إعدادات المتجر لهذه الشاشة.</div>}
              {settingsLoading && <p role="status" className="sf-checkout-hint">جار تحميل سياسات عرض الأسعار قبل الانتقال إلى الدفع...</p>}
              <div className="sf-cart-actions">
                <button className="sf-btn-secondary" onClick={() => void navigate({ to: '/' })}>متابعة التسوق</button>
                <button className="sf-btn-primary" disabled={!cartProductDetailsReady || settingsLoading || (settings?.show_price_in_cart === true && cartPricingPreviewStatus !== 'ready' && cartPricingPreviewStatus !== 'hidden')} onClick={() => void navigate({ to: '/checkout' })}>إتمام الطلب <ChevronLeft size={16} /></button>
              </div>
            </>
            )}
          </section>
        ))}

        {view === 'checkout' && (!cartRestored || !cartProductDetailsReady ? (
          <section className="sf-checkout"><div className="sf-empty" role={cartProductDetailsState.error ? 'alert' : 'status'}>
            <span>{cartProductDetailsState.error ?? (cartProductDetailsState.unresolvedIds.length ? 'توجد أصناف غير متاحة في السلة؛ ارجع إليها واحذفها.' : 'جار استعادة تفاصيل أصناف السلة قبل إتمام الطلب...')}</span>
            {cartProductDetailsState.error && <button type="button" onClick={() => setCartProductRetryCount((current) => current + 1)}>إعادة المحاولة</button>}
            <button type="button" className="sf-btn-secondary" onClick={() => void navigate({ to: '/cart' })}>مراجعة السلة</button>
          </div></section>
        ) : !cart.length ? (
          <section className="sf-checkout"><h2>لا توجد أصناف لإتمام الطلب</h2><p>أضف الأصناف إلى السلة أولاً. لن يتم إنشاء طلب فارغ.</p><button className="sf-btn-primary" onClick={() => void navigate({ to: '/' })}>العودة إلى المتجر</button></section>
        ) : <Checkout cart={cart} priceVisibilityPolicy={settings?.show_price_in_orders} availabilityChanges={cartAvailabilityChanges} recentlyRemovedCartItems={recentlyRemovedCartItems} onUndoCartRemoval={undoCartRemoval} onApplyAvailabilityChanges={applyCartAvailabilityChanges} onBack={() => void navigate({ to: '/cart' })} onComplete={(order) => {
          // A committed order must become a durable route, not transient checkout component state.
          // Replace checkout so browser Back cannot reopen a completed submission form.
          setCart([]);
          void navigate({ to: '/orders/$id', params: { id: order.id }, replace: true });
        }} />)}
      </main>

      <footer className="sf-footer">
        <div className="sf-footer-inner">
          <div className="sf-footer-brand"><img src="/icons/injaz-icon.svg" alt="" width={24} height={24} /> <strong>إنجاز</strong><span>{(settings?.store_name as string) ?? 'متجر الأغبري'}</span></div>
          {typeof settings?.store_phone === 'string' && settings.store_phone.trim() && <div className="sf-footer-info"><Phone size={15} /> {settings.store_phone}</div>}
          {typeof settings?.store_email === 'string' && settings.store_email.trim() && <div className="sf-footer-info"><Mail size={15} /> {settings.store_email}</div>}
          {typeof settings?.store_address === 'string' && settings.store_address.trim() && <div className="sf-footer-info"><MapPin size={15} /> {settings.store_address}</div>}
          <Link to="/help" className="sf-footer-info">مركز المساعدة</Link>
        </div>
      </footer>
    </div>
  );
}

function StorefrontProductCardPurchase({
  product,
  quantityKnown,
  out,
  belowMinimum,
  selectedQuantity,
  onAdd,
}: {
  product: ProductWithInventory;
  quantityKnown: boolean;
  out: boolean;
  belowMinimum: boolean;
  selectedQuantity?: number;
  onAdd: (product: ProductWithInventory, requestedQuantity?: number) => void;
}) {
  const minimum = Number.isSafeInteger(product.min_order_quantity) && Number(product.min_order_quantity) >= 1
    ? Number(product.min_order_quantity) : 1;
  const multiple = Number.isSafeInteger(product.order_quantity_multiple) && Number(product.order_quantity_multiple) >= 1
    ? Number(product.order_quantity_multiple) : 1;
  const initialQuantity = Number.isSafeInteger(selectedQuantity) && Number(selectedQuantity) >= minimum
    ? Number(selectedQuantity) : minimum;
  const [quantity, setQuantity] = useState(initialQuantity);

  useEffect(() => {
    setQuantity(initialQuantity);
  }, [product.id, initialQuantity]);

  return (
    <div className="sf-card-purchase" style={{ display: 'grid', gap: 8, padding: '0 12px 12px' }}>
      <CartQuantityControl
        productName={product.name}
        quantity={quantity}
        minimum={minimum}
        multiple={multiple}
        available={quantityKnown ? product.inventory?.quantity_available : undefined}
        onCommit={setQuantity}
      />
      {!quantityKnown && (
        <small role="note" style={{ color: "#7b6b3c", fontSize: 11, lineHeight: 1.6 }}>
          حدد الكمية المطلوبة؛ وستبقى الإضافة متوقفة حتى يتم التحقق من المخزون.
        </small>
      )}
      <button
        type="button"
        className="sf-add-btn"
        aria-label={`إضافة ${product.name} إلى السلة`}
        disabled={!quantityKnown || out || belowMinimum}
        onClick={() => onAdd(product, quantity)}
      >
        {!quantityKnown
          ? 'التوفر غير مؤكد'
          : out
            ? 'غير متوفر'
            : belowMinimum
              ? 'الكمية المتاحة أقل من الحد الأدنى'
              : <><Plus size={16} /> أضف للسلة</>}
      </button>
    </div>
  );
}

export function ProductGrid({
  products,
  priceVisibilityPolicy,
  wishlist,
  compare,
  emptyTitle,
  emptyDescription,
  onOpen,
  onAdd,
  cartQuantities = {},
  onWishlist,
  onCompare,
}: {
  products: ProductWithInventory[];
  priceVisibilityPolicy: unknown;
  wishlist: string[];
  compare: string[];
  emptyTitle: string;
  emptyDescription: string;
  onOpen: (product: ProductWithInventory) => void;
  onAdd: (product: ProductWithInventory, requestedQuantity?: number) => void;
  cartQuantities?: Record<string, number>;
  onWishlist: (id: string) => void;
  onCompare: (id: string) => void;
}) {
  if (!products.length) {
    return <div className="sf-empty" role="status"><Package size={30} /><strong>{emptyTitle}</strong><small>{emptyDescription}</small></div>;
  }

  return (
    <div className="sf-product-grid">
      {products.map((product) => {
        const rawAvailableQuantity = product.inventory?.quantity_available;
        const quantityKnown =
          typeof rawAvailableQuantity === "number" &&
          Number.isFinite(rawAvailableQuantity) &&
          rawAvailableQuantity >= 0;
        const qty = quantityKnown ? rawAvailableQuantity : 0;
        const minimum = Number.isSafeInteger(product.min_order_quantity) && Number(product.min_order_quantity) >= 1
          ? Number(product.min_order_quantity) : 1;
        const orderMultiple = Number.isSafeInteger(product.order_quantity_multiple) && Number(product.order_quantity_multiple) >= 1
          ? Number(product.order_quantity_multiple) : 1;
        const out = quantityKnown && qty <= 0;
        const belowMinimum = quantityKnown && qty > 0 && qty < minimum;
        const liked = wishlist.includes(product.id);
        const compared = compare.includes(product.id);
        const imageUrl = isSafeStorefrontImageUrl(product.image_url) ? product.image_url : null;

        return (
          <article className="sf-product-card" key={product.id}>
            <div className="sf-product-media">
              <button
                type="button"
                className="sf-product-img"
                aria-label={`عرض تفاصيل ${product.name}`}
                onClick={() => onOpen(product)}
              >
                {imageUrl
                  ? <img src={imageUrl} alt="" loading="lazy" decoding="async" />
                  : <ProductPlaceholderArtwork
                      productName={product.name}
                      description={product.description}
                      categoryName={product.category?.name}
                      compact
                    />}
              </button>
              <div className="sf-card-actions" role="group" aria-label={`إجراءات ${product.name}`}>
                <button
                  type="button"
                  aria-label={liked ? `إزالة ${product.name} من المفضلة` : `إضافة ${product.name} إلى المفضلة`}
                  aria-pressed={liked}
                  className={liked ? 'active' : ''}
                  onClick={() => onWishlist(product.id)}
                >
                  <Heart size={16} fill={liked ? 'currentColor' : 'none'} aria-hidden="true" />
                </button>
                <button
                  type="button"
                  aria-label={compared ? `إزالة ${product.name} من المقارنة` : `إضافة ${product.name} إلى المقارنة`}
                  aria-pressed={compared}
                  className={compared ? 'active' : ''}
                  onClick={() => onCompare(product.id)}
                >
                  <GitCompare size={16} aria-hidden="true" />
                </button>
              </div>
            </div>
            <button className="sf-product-body sf-product-open" type="button" onClick={() => onOpen(product)}>
              <h3>{product.name}</h3>
              {product.name_en ? <small dir="auto" style={{ display: 'block', marginTop: 3, color: '#62797e', fontWeight: 500 }}>{product.name_en}</small> : null}
              <p>{product.category?.name ?? 'غير مصنف'} · {product.item_code}</p>
              <small className="sf-product-unit">الوحدة: {product.unit}</small>
              <small className="sf-product-order-policy">
                الحد الأدنى للطلب: {formatNumber(minimum)}
                {orderMultiple > 1 ? ' · مضاعف الطلب: ' + formatNumber(orderMultiple) : ''}
              </small>
              {product.sku ? <small dir="ltr" style={{ display: 'block', marginTop: 3, color: '#62797e', fontWeight: 600, textAlign: 'right' }}>SKU: {product.sku}</small> : null}
              <StorefrontPricePresentation
                policyValue={priceVisibilityPolicy}
                serverUnitPrice={product.display_price}
                className="sf-product-price"
                unitLabel={product.unit}
              />
              <div className="sf-product-stock" aria-live="polite">
                {!quantityKnown
                  ? <span className="sf-stock-unknown">لم يتم التحقق من المخزون</span>
                  : out
                    ? <span className="sf-out">نفد المخزون</span>
                    : <span className={belowMinimum ? "sf-out" : "sf-in"}>{formatNumber(qty)} متوفر{belowMinimum ? ' — أقل من الحد الأدنى' : ''}</span>}
              </div>
            </button>
            <StorefrontProductCardPurchase
              product={product}
              quantityKnown={quantityKnown}
              out={out}
              belowMinimum={belowMinimum}
              selectedQuantity={cartQuantities[product.id]}
              onAdd={onAdd}
            />
          </article>
        );
      })}
    </div>
  );
}

export function ProductDetail({
  product,
  isStaff,
  promotions,
  promotionsLoading,
  promotionsError,
  onRetryPromotions,
  relatedProducts = [],
  priceVisibilityPolicy,
  inWishlist,
  inCompare,
  initialQuantity,
  canBuyNow,
  buyNowDisabledMessage,
  onBack,
  onAdd,
  onBuyNow,
  onWishlist,
  onCompare,
  onOpenRelated,
}: {
  product: ProductWithInventory;
  isStaff: boolean;
  promotions: Promotion[] | null;
  promotionsLoading: boolean;
  promotionsError: string | null;
  onRetryPromotions: () => void;
  relatedProducts: ProductWithInventory[];
  priceVisibilityPolicy: unknown;
  inWishlist: boolean;
  inCompare: boolean;
  initialQuantity: number | null;
  canBuyNow: boolean;
  buyNowDisabledMessage: string | null;
  onBack: () => void;
  onAdd: (baseQuantity: number, selection: ProductUnitSelection) => void;
  onBuyNow: (baseQuantity: number, selection: ProductUnitSelection) => void;
  onWishlist: () => void;
  onCompare: () => void;
  onOpenRelated: (product: ProductWithInventory) => void;
}) {
  const rawAvailableQuantity = product.inventory?.quantity_available;
  const quantityKnown = typeof rawAvailableQuantity === 'number' &&
    Number.isFinite(rawAvailableQuantity) && rawAvailableQuantity >= 0;
  const availableQuantity = quantityKnown ? Math.floor(rawAvailableQuantity) : 0;
  const minimumOrderQuantity = Number.isSafeInteger(product.min_order_quantity) && Number(product.min_order_quantity) >= 1
    ? Number(product.min_order_quantity) : 1;
  const quantityMultiple = Number.isSafeInteger(product.order_quantity_multiple) && Number(product.order_quantity_multiple) >= 1
    ? Number(product.order_quantity_multiple) : 1;
  const belowMinimum = quantityKnown && availableQuantity > 0 && availableQuantity < minimumOrderQuantity;
  const galleryUrls = Array.from(new Set([
    product.image_url,
    ...(Array.isArray(product.image_gallery_urls) ? product.image_gallery_urls : []),
  ].filter((url): url is string => isSafeStorefrontImageUrl(url))));
  const productUpdatedAtLabel = formatProductUpdatedAt(product.updated_at);
  const [alternateUnits, setAlternateUnits] = useState<ProductAlternateUnit[]>([]);
  const [alternateUnitsLoading, setAlternateUnitsLoading] = useState(true);
  const [alternateUnitsError, setAlternateUnitsError] = useState('');
  const [selectedUnit, setSelectedUnit] = useState<ProductAlternateUnit>({
    unit_name: product.unit,
    base_units_per_unit: 1,
  });
  const [requestedUnitQuantity, setRequestedUnitQuantity] = useState(minimumOrderQuantity);
  const pricePresentation = resolveStorefrontPricePresentation(priceVisibilityPolicy, product.display_price);
  const productStructuredData = useMemo(() => buildStorefrontProductStructuredData({
    id: product.id,
    name: product.name,
    description: product.description,
    sku: product.sku,
    itemCode: product.item_code,
    categoryName: product.category?.name,
    imageUrls: [product.image_url, ...(product.image_gallery_urls ?? [])],
    pageOrigin: typeof window === 'undefined' ? null : window.location.origin,
    priceVisible: pricePresentation.visible,
    displayPrice: product.display_price,
    availableQuantity: quantityKnown ? availableQuantity : null,
    minimumOrderQuantity,
  }), [
    product.id, product.name, product.description, product.sku, product.item_code,
    product.category?.name, product.image_url, product.image_gallery_urls,
    pricePresentation.visible, product.display_price, quantityKnown, availableQuantity, minimumOrderQuantity,
  ]);
  const productStructuredDataJson = useMemo(
    () => productStructuredData ? serializeStorefrontProductStructuredData(productStructuredData) : null,
    [productStructuredData],
  );

  const productHeadMetadata = useMemo(
    () => buildStorefrontProductHeadMetadata(productStructuredData),
    [productStructuredData],
  );

  useEffect(() => {
    if (!productHeadMetadata || typeof document === 'undefined') return;
    return applyStorefrontProductHeadMetadata(productHeadMetadata, document);
  }, [productHeadMetadata]);

  useEffect(() => {
    let active = true;
    setAlternateUnits([]);
    setAlternateUnitsLoading(true);
    setAlternateUnitsError('');
    void fetchProductUnitOptions(product.id)
      .then((result) => {
        if (result.base_unit !== product.unit) {
          throw new Error('تغيرت الوحدة الأساسية للمنتج أثناء تحميل خيارات البيع.');
        }
        if (active) setAlternateUnits(result.units);
      })
      .catch((cause) => {
        if (active) setAlternateUnitsError(cause instanceof Error ? cause.message : 'تعذر تحميل وحدات البيع البديلة.');
      })
      .finally(() => {
        if (active) setAlternateUnitsLoading(false);
      });
    return () => { active = false; };
  }, [product.id, product.unit]);

  useEffect(() => {
    setSelectedUnit({ unit_name: product.unit, base_units_per_unit: 1 });
    const startingBaseQuantity = initialQuantity ?? minimumOrderQuantity;
    const cappedBaseQuantity = quantityKnown
      ? Math.min(availableQuantity, startingBaseQuantity)
      : minimumOrderQuantity;
    const steps = Math.max(0, Math.floor((cappedBaseQuantity - minimumOrderQuantity) / quantityMultiple));
    setRequestedUnitQuantity(minimumOrderQuantity + steps * quantityMultiple);
  }, [product.id, product.unit, initialQuantity, minimumOrderQuantity, quantityMultiple, quantityKnown, availableQuantity]);

  const unitChoices: ProductAlternateUnit[] = [
    { unit_name: product.unit, base_units_per_unit: 1 },
    ...alternateUnits,
  ];
  const maximumDisplayQuantity = Math.min(
    10000,
    Math.floor(Math.min(availableQuantity, 10000) / selectedUnit.base_units_per_unit),
  );

  function isValidDisplayQuantity(displayQuantity: number, unit: ProductAlternateUnit = selectedUnit): boolean {
    const baseQuantity = displayQuantity * unit.base_units_per_unit;
    return Number.isSafeInteger(displayQuantity) &&
      displayQuantity >= 1 &&
      Number.isSafeInteger(baseQuantity) &&
      baseQuantity >= minimumOrderQuantity &&
      (baseQuantity - minimumOrderQuantity) % quantityMultiple === 0 &&
      baseQuantity <= availableQuantity &&
      baseQuantity <= 10000;
  }

  function minimumDisplayQuantityForUnit(unit: ProductAlternateUnit): number | null {
    const maximum = Math.min(10000, Math.floor(Math.min(availableQuantity, 10000) / unit.base_units_per_unit));
    for (let displayQuantity = 1; displayQuantity <= maximum; displayQuantity += 1) {
      if (isValidDisplayQuantity(displayQuantity, unit)) return displayQuantity;
    }
    return null;
  }

  const minimumDisplayQuantity = minimumDisplayQuantityForUnit(selectedUnit);
  const requestedBaseQuantity = requestedUnitQuantity * selectedUnit.base_units_per_unit;
  const requestedQuantityValid = minimumDisplayQuantity !== null &&
    isValidDisplayQuantity(requestedUnitQuantity);

  function chooseUnit(unitName: string) {
    const nextUnit = unitChoices.find((unit) => unit.unit_name === unitName);
    if (!nextUnit) return;
    setSelectedUnit(nextUnit);
    setRequestedUnitQuantity(minimumDisplayQuantityForUnit(nextUnit) ?? 1);
  }

  function findAdjacentValidDisplayQuantity(direction: 1 | -1): number | null {
    const minimum = minimumDisplayQuantity ?? 1;
    const start = requestedUnitQuantity + direction;
    for (
      let candidate = start;
      direction > 0 ? candidate <= maximumDisplayQuantity : candidate >= minimum;
      candidate += direction
    ) {
      if (isValidDisplayQuantity(candidate)) return candidate;
    }
    return null;
  }

  function normalizeRequestedQuantity(value: string) {
    const normalized = normalizeLocalizedDecimalInput(value);
    const parsed = /^\d+$/.test(normalized) ? Number(normalized) : Number.NaN;
    const minimum = minimumDisplayQuantity ?? 1;
    const start = Number.isSafeInteger(parsed)
      ? Math.max(minimum, Math.min(maximumDisplayQuantity, parsed))
      : minimum;
    for (let candidate = start; candidate <= maximumDisplayQuantity; candidate += 1) {
      if (isValidDisplayQuantity(candidate)) {
        setRequestedUnitQuantity(candidate);
        return;
      }
    }
    setRequestedUnitQuantity(minimum);
  }

  const nextLowerQuantity = findAdjacentValidDisplayQuantity(-1);
  const nextHigherQuantity = findAdjacentValidDisplayQuantity(1);

  return (
    <section className="sf-product-detail">
      {productStructuredDataJson ? <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: productStructuredDataJson }} /> : null}
      <button className="sf-back-link" onClick={onBack}><ArrowRight size={16} /> العودة للكتالوج</button>
      <div className="sf-detail-layout">
        <div className="sf-detail-image">
          <ProductMediaGallery
            key={product.id}
            productName={product.name}
            productDescription={product.description}
            categoryName={product.category?.name}
            productCode={product.item_code}
            imageUrls={galleryUrls}
          />
          <span className="sf-detail-code">
            {product.sku ? <span dir="ltr">SKU: {product.sku}</span> : <>رمز المنتج: <bdi>{product.item_code}</bdi></>}
            {product.sku && product.item_code ? <> · رمز المنتج: <bdi>{product.item_code}</bdi></> : null}
            {product.barcode ? <> · الباركود: <bdi>{product.barcode}</bdi></> : null}
          </span>
        </div>
        <div className="sf-detail-content">
          <span className="sf-detail-category">{product.category?.name ?? 'غير مصنف'}</span>
          <h2>{product.name}</h2>
          {product.name_en ? <p dir="auto" style={{ margin: '-4px 0 12px', color: '#5f777b', fontSize: 14, fontWeight: 500 }}>{product.name_en}</p> : null}
          <p className="sf-detail-description">{product.description || 'لا يوجد وصف متاح لهذا المنتج.'}</p>
          {productUpdatedAtLabel ? (
            <p style={{ margin: "-4px 0 12px", color: "#71817f", fontSize: 11 }}>
              آخر تحديث للمعلومات: <time dateTime={product.updated_at}>{productUpdatedAtLabel}</time>
            </p>
          ) : null}
          {isStaff ? (
            <ProductDataQualityPanel
              imageCount={galleryUrls.length}
              description={product.description}
              salesUnit={product.unit}
              alternateUnitCount={alternateUnits.length}
              alternateUnitState={alternateUnitsLoading ? "loading" : alternateUnitsError ? "error" : "ready"}
            />
          ) : null}
          <StorefrontPricePresentation
            policyValue={priceVisibilityPolicy}
            serverUnitPrice={product.display_price}
            className="sf-detail-price"
            unitLabel={`لكل ${product.unit}`}
          />
          <div className={`sf-detail-stock ${quantityKnown && availableQuantity > 0 && !belowMinimum ? 'available' : 'unavailable'}`} role="status" aria-live="polite">
            {!quantityKnown
              ? 'تعذر التحقق من الكمية المتاحة لهذا المنتج. أعد تحميل تفاصيل المنتج قبل الإضافة.'
              : availableQuantity <= 0
                ? 'هذا المنتج غير متوفر حالياً'
                : belowMinimum
                  ? `المتوفر (${formatNumber(availableQuantity)} ${product.unit}) أقل من الحد الأدنى للطلب (${formatNumber(minimumOrderQuantity)} ${product.unit})`
                  : `متوفر حالياً: ${formatNumber(availableQuantity)} ${product.unit}`}
          </div>
          {quantityKnown && availableQuantity > 0 && !belowMinimum ? (
            <div className="sf-detail-quantity" role="group" aria-label="اختيار كمية الطلب" style={{ display: 'grid', gap: 7, maxWidth: 340, marginBottom: 16 }}>
              {unitChoices.length > 1 ? (
                <label htmlFor="sf-product-order-unit" style={{ fontSize: 13, fontWeight: 700 }}>
                  وحدة الشراء
                  <select
                    id="sf-product-order-unit"
                    value={selectedUnit.unit_name}
                    onChange={(event) => chooseUnit(event.currentTarget.value)}
                    style={{ display: 'block', width: '100%', minHeight: 40, marginTop: 6, border: '1px solid var(--border, #d6dfe4)', borderRadius: 8, padding: 7, background: 'var(--card, #fff)' }}
                  >
                    {unitChoices.map((unit) => (
                      <option
                        key={unit.unit_name}
                        value={unit.unit_name}
                        disabled={minimumDisplayQuantityForUnit(unit) === null}
                      >
                        {unit.unit_name}{unit.base_units_per_unit > 1
                          ? ` — الوحدة الواحدة = ${formatNumber(unit.base_units_per_unit)} ${product.unit}`
                          : ` — الوحدة الأساسية`}
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}
              <label htmlFor="sf-product-requested-quantity" style={{ fontSize: 13, fontWeight: 700 }}>
                الكمية المطلوبة ({selectedUnit.unit_name})
              </label>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <button
                  type="button"
                  className="sf-btn-secondary"
                  aria-label="تقليل كمية الطلب"
                  disabled={nextLowerQuantity === null}
                  onClick={() => { if (nextLowerQuantity !== null) setRequestedUnitQuantity(nextLowerQuantity); }}
                ><Minus size={16} /></button>
                <input
                  id="sf-product-requested-quantity"
                  type="text"
                  inputMode="numeric"
                  autoComplete="off"
                  maxLength={5}
                  dir="ltr"
                  value={requestedUnitQuantity}
                  aria-label="كمية الطلب"
                  onChange={(event) => normalizeRequestedQuantity(event.currentTarget.value)}
                  style={{ width: 100, minHeight: 40, textAlign: 'center', border: '1px solid var(--border, #d6dfe4)', borderRadius: 8, padding: 6 }}
                />
                <button
                  type="button"
                  className="sf-btn-secondary"
                  aria-label="زيادة كمية الطلب"
                  disabled={nextHigherQuantity === null}
                  onClick={() => { if (nextHigherQuantity !== null) setRequestedUnitQuantity(nextHigherQuantity); }}
                ><Plus size={16} /></button>
              </div>
              <small className="text-muted">
                يعادل الاختيار {formatNumber(requestedBaseQuantity)} {product.unit}. الحد الأدنى {formatNumber(minimumOrderQuantity)} {product.unit}،
                ومضاعف الطلب {formatNumber(quantityMultiple)} {product.unit}، والمتاح {formatNumber(availableQuantity)} {product.unit}.
              </small>
              {minimumDisplayQuantity === null ? (
                <small role="alert" style={{ color: '#9b3d34' }}>
                  لا تتوافق هذه الوحدة مع حد الطلب ومضاعفه أو المخزون المتاح؛ اختر وحدة أخرى.
                </small>
              ) : null}
              {alternateUnitsLoading ? <small role="status">جار تحميل وحدات البيع البديلة...</small> : null}
              {alternateUnitsError ? <small role="status">تعذر تحميل الوحدات البديلة؛ يمكنك المتابعة بالوحدة الأساسية.</small> : null}
            </div>
          ) : null}
          <div className="sf-detail-actions">
            <button
              type="button"
              className="sf-btn-primary"
              disabled={!requestedQuantityValid || !quantityKnown || belowMinimum}
              onClick={() => onAdd(requestedBaseQuantity, {
                unit_name: selectedUnit.unit_name,
                base_units_per_unit: selectedUnit.base_units_per_unit,
                selected_quantity: requestedUnitQuantity,
              })}
            ><ShoppingCart size={17} /> إضافة إلى السلة</button>
            <button
              type="button"
              className="sf-btn-secondary"
              aria-label={`شراء المنتج ${product.name} الآن`}
              disabled={!canBuyNow || !requestedQuantityValid || !quantityKnown || belowMinimum}
              onClick={() => onBuyNow(requestedBaseQuantity, {
                unit_name: selectedUnit.unit_name,
                base_units_per_unit: selectedUnit.base_units_per_unit,
                selected_quantity: requestedUnitQuantity,
              })}
            ><CreditCard size={17} /> شراء الآن</button>
            {!canBuyNow && buyNowDisabledMessage ? (
              <small role="status">{buyNowDisabledMessage}</small>
            ) : null}
            <button type="button" className={`sf-icon-action ${inWishlist ? 'active' : ''}`} aria-pressed={inWishlist} onClick={onWishlist}>
              <Heart size={18} fill={inWishlist ? 'currentColor' : 'none'} /> {inWishlist ? 'في المفضلة' : 'أضف للمفضلة'}
            </button>
            <button type="button" className={`sf-icon-action ${inCompare ? 'active' : ''}`} aria-pressed={inCompare} onClick={onCompare}><GitCompare size={18} /> {inCompare ? 'في المقارنة' : 'مقارنة'}</button>
          </div>
          <div className="sf-detail-facts">
            <div><strong>الوحدة الأساسية</strong><span>{product.unit}</span></div>
            <div><strong>الحد الأدنى</strong><span>{formatNumber(product.min_order_quantity ?? 1)} {product.unit}</span></div>
            {(product.order_quantity_multiple ?? 1) > 1 && <div><strong>مضاعف الطلب</strong><span>{formatNumber(product.order_quantity_multiple ?? 1)} {product.unit}</span></div>}
            {pricePresentation.visible && <div><strong>السعر</strong><span>السعر الظاهر قبل تأكيد الطلب</span></div>}
          </div>
        </div>
      </div>
      <StorefrontProductOffers
        productId={product.id}
        categoryId={product.category_id}
        promotions={promotions}
        loading={promotionsLoading}
        error={promotionsError}
        onRetry={onRetryPromotions}
      />
      {relatedProducts.length > 0 && (
        <section className="sf-related-products" aria-labelledby="sf-related-products-title">
          <div className="sf-related-header">
            <h3 id="sf-related-products-title">منتجات من التصنيف نفسه</h3>
            <span>من المنتجات المحمّلة في الكتالوج</span>
          </div>
          <div className="sf-related-grid">
            {relatedProducts.map((relatedProduct) => (
              <button
                type="button"
                key={relatedProduct.id}
                className="sf-related-card"
                onClick={() => onOpenRelated(relatedProduct)}
                aria-label={'عرض تفاصيل ' + relatedProduct.name}
              >
                <span className="sf-related-image">
                  {isSafeStorefrontImageUrl(relatedProduct.image_url)
                    ? <img src={relatedProduct.image_url} alt="" loading="lazy" decoding="async" />
                    : <ProductPlaceholderArtwork
                        productName={relatedProduct.name}
                        description={relatedProduct.description}
                        categoryName={relatedProduct.category?.name}
                        compact
                      />}
                </span>
                <strong>{relatedProduct.name}</strong>
                <small><bdi>{relatedProduct.item_code}</bdi></small>
                <StorefrontPricePresentation
                  policyValue={priceVisibilityPolicy}
                  serverUnitPrice={relatedProduct.display_price}
                  className="sf-related-price"
                  unitLabel={'لكل ' + relatedProduct.unit}
                />
              </button>
            ))}
          </div>
        </section>
      )}
      <StorefrontProductReviews productId={product.id} />
      <StorefrontProductQuestions productId={product.id} />
    </section>
  );
}

function CollectionView({
  title,
  icon: Icon,
  products,
  priceVisibilityPolicy,
  wishlist,
  compare,
  loading,
  error,
  onRetry,
  onOpen,
  onAdd,
  cartQuantities = {},
  onWishlist,
  onCompare,
  onBack,
  empty,
}: {
  title: string;
  icon: typeof Heart;
  products: ProductWithInventory[];
  priceVisibilityPolicy: unknown;
  wishlist: string[];
  compare: string[];
  loading: boolean;
  error: string | null;
  onRetry: () => void;
  onOpen: (product: ProductWithInventory) => void;
  onAdd: (product: ProductWithInventory, requestedQuantity?: number) => void;
  cartQuantities?: Record<string, number>;
  onWishlist: (id: string) => void;
  onCompare: (id: string) => void;
  onBack: () => void;
  empty: string;
}) {
  return (
    <section className="sf-collection">
      <button className="sf-back-link" onClick={onBack}><ArrowRight size={16} /> العودة للمتجر</button>
      <div className="sf-products-head">
        <div><h2><Icon size={21} /> {title}</h2><span>{products.length} منتجات</span></div>
      </div>
      {products.length
        ? <ProductGrid
            products={products}
            priceVisibilityPolicy={priceVisibilityPolicy}
            wishlist={wishlist}
            compare={compare}
            emptyTitle={empty}
            emptyDescription=""
            onOpen={onOpen}
            onAdd={onAdd}
            cartQuantities={cartQuantities}
            onWishlist={onWishlist}
            onCompare={onCompare}
          />
        : loading
          ? <div className="sf-empty" role="status">جار تحميل قائمة المنتجات...</div>
          : error
            ? <div className="sf-empty" role="alert"><strong>تعذر تحميل قائمة المنتجات</strong><small>{error}</small><button type="button" className="sf-btn-secondary" onClick={onRetry}>إعادة المحاولة</button></div>
            : <div className="sf-empty"><Icon size={32} /><span>{empty}</span><button className="sf-link" onClick={onBack}>تصفح الكتالوج</button></div>}
    </section>
  );
}

type CheckoutPreviewLine = {
  product_id: string;
  name: string;
  item_code: string;
  unit: string;
  quantity: number | string;
};
type CheckoutValidation = {
  valid: true;
  items: CheckoutPreviewLine[];
  item_count: number;
  currency: string;
  pricing_verified: true;
};

const CHECKOUT_ATTEMPT_STORAGE_KEY = 'aghbari:checkout-attempt:v1';
type StoredCheckoutAttempt = { signature: string; key: string };

function checkoutAttemptStorageKey(profileId: string | undefined): string | null {
  return profileId ? CHECKOUT_ATTEMPT_STORAGE_KEY + ':' + encodeURIComponent(profileId) : null;
}

function clearStoredCheckoutAttempt(profileId: string | undefined, expectedKey: string): void {
  if (typeof window === 'undefined') return;
  const keys = [checkoutAttemptStorageKey(profileId), CHECKOUT_ATTEMPT_STORAGE_KEY].filter((key): key is string => Boolean(key));
  for (const key of keys) {
    try {
      const saved = JSON.parse(window.sessionStorage.getItem(key) || 'null') as { key?: unknown } | null;
      if (saved?.key === expectedKey) window.sessionStorage.removeItem(key);
    } catch {
      // A malformed browser entry must not prevent a definitive server denial from being shown.
    }
  }
}

function readStoredCheckoutAttempt(profileId: string | undefined): StoredCheckoutAttempt | null {
  if (!profileId || typeof window === 'undefined') return null;
  try {
    const scopedKey = checkoutAttemptStorageKey(profileId);
    if (!scopedKey) return null;
    let raw = window.sessionStorage.getItem(scopedKey);
    let isLegacyKey = false;
    if (!raw) {
      raw = window.sessionStorage.getItem(CHECKOUT_ATTEMPT_STORAGE_KEY);
      isLegacyKey = raw !== null;
    }
    const saved = JSON.parse(raw || 'null') as {
      signature?: unknown;
      key?: unknown;
    } | null;
    if (!saved || typeof saved.signature !== 'string' || typeof saved.key !== 'string' ||
      !/^[A-Za-z0-9_-]{16,128}$/.test(saved.key)) return null;
    const signature = JSON.parse(saved.signature) as { profile_id?: unknown };
    if (signature.profile_id !== profileId) return null;
    if (isLegacyKey) {
      window.sessionStorage.setItem(scopedKey, JSON.stringify(saved));
      if (window.sessionStorage.getItem(CHECKOUT_ATTEMPT_STORAGE_KEY) === raw) {
        window.sessionStorage.removeItem(CHECKOUT_ATTEMPT_STORAGE_KEY);
      }
    }
    return { signature: saved.signature, key: saved.key };
  } catch {
    return null;
  }
}

function Checkout({ cart, priceVisibilityPolicy, availabilityChanges, recentlyRemovedCartItems, onUndoCartRemoval, onApplyAvailabilityChanges, onBack, onComplete }: { cart: CartItem[]; priceVisibilityPolicy: unknown; availabilityChanges: readonly CartAvailabilityChange[]; recentlyRemovedCartItems: readonly { item: CartItem; index: number }[]; onUndoCartRemoval: () => void; onApplyAvailabilityChanges: (adjustments: readonly CartAvailabilityAdjustment[]) => { applied: boolean; message: string }; onBack: () => void; onComplete: (order: { id: string; order_number: string }) => void }) {
  const { user } = useAuth();
  const isStaffOnly = Boolean(user?.isStaff && !user.roles?.includes('customer'));
  const [name, setName] = useState(user?.name ?? '');
  const [phone, setPhone] = useState('');
  const [business, setBusiness] = useState('');
  const [notes, setNotes] = useState('');
  const [purchaseOrderReference, setPurchaseOrderReference] = useState('');
  const [checkoutStage, setCheckoutStage] = useState<'details' | 'review'>('details');
  const [finalConfirmationAccepted, setFinalConfirmationAccepted] = useState(false);
  const [paymentTerms, setPaymentTerms] = useState<'cash_on_delivery' | 'credit'>('cash_on_delivery');
  const [deliveryAddresses, setDeliveryAddresses] = useState<CustomerAddress[]>([]);
  const [deliveryAddressId, setDeliveryAddressId] = useState('');
  const [deliveryAddressesLoading, setDeliveryAddressesLoading] = useState(false);
  const [deliveryAddressesError, setDeliveryAddressesError] = useState('');
  const [deliveryAddressRetry, setDeliveryAddressRetry] = useState(0);
  const selectedDeliveryAddress = useMemo(
    () => deliveryAddresses.find((address) => address.id === deliveryAddressId) ?? null,
    [deliveryAddresses, deliveryAddressId],
  );
  const [cartValidation, setCartValidation] = useState<CheckoutValidation | null>(null);
  const [previewLoading, setPreviewLoading] = useState(true);
  const [previewError, setPreviewError] = useState('');
  const [previewRetry, setPreviewRetry] = useState(0);
  const [pricingPreviewStatus, setPricingPreviewStatus] = useState<CustomerOrderPricingPreviewStatus>('loading');
  const checkoutItems = useMemo(
    () => cart.map((i) => ({ product_id: i.product.id, quantity: i.quantity })).sort((a, b) => a.product_id.localeCompare(b.product_id)),
    [cart],
  );
  const cartPricingBaseline = useMemo(
    () => getCartPricingSnapshot({ userId: user?.id ?? null, profileId: user?.profileId ?? null }, checkoutItems),
    [user?.id, user?.profileId, checkoutItems],
  );
  const [checkoutPricingPresentation, setCheckoutPricingPresentation] = useState<CustomerOrderPricingPresentation | null>(null);
  const priceChanges = useMemo(
    () => compareCartPricingSnapshots(cartPricingBaseline, checkoutPricingPresentation),
    [cartPricingBaseline, checkoutPricingPresentation],
  );
  const availabilityAdjustments = useMemo(() => planCartAvailabilityAdjustments(
    checkoutItems,
    availabilityChanges,
    cart.map((item) => ({
      product_id: item.product.id,
      min_order_quantity: item.product.min_order_quantity,
      order_quantity_multiple: item.product.order_quantity_multiple,
    })),
  ), [checkoutItems, availabilityChanges, cart]);
  const hasBlockedAvailabilityAdjustment = availabilityAdjustments.some((adjustment) => adjustment.action === 'blocked');
  const priceChangesSignature = JSON.stringify(priceChanges);
  const availabilityChangesSignature = JSON.stringify(availabilityChanges);
  const [priceChangesAccepted, setPriceChangesAccepted] = useState(false);
  const [availabilityChangesAccepted, setAvailabilityChangesAccepted] = useState(false);
  const [stockUpdateNotice, setStockUpdateNotice] = useState('');
  const handleCheckoutPricingPresentation = useCallback((presentation: CustomerOrderPricingPresentation | null) => {
    setCheckoutPricingPresentation(presentation);
  }, []);
  useEffect(() => { setPriceChangesAccepted(false); }, [priceChangesSignature]);
  useEffect(() => { setAvailabilityChangesAccepted(false); }, [availabilityChangesSignature]);
  const idempotencyRef = useRef<{ signature: string; key: string } | null>(null);
  const submitInFlightRef = useRef(false);
  const [submitting, setSubmitting] = useState(false);
  const [ambiguousSubmit, setAmbiguousSubmit] = useState(false);
  const [recoveringAttempt, setRecoveringAttempt] = useState(() => Boolean(readStoredCheckoutAttempt(user?.profileId)));
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    if (isStaffOnly || !user?.profileId) {
      setDeliveryAddresses([]);
      setDeliveryAddressId('');
      setDeliveryAddressesLoading(false);
      setDeliveryAddressesError('');
      return () => { active = false; };
    }

    setDeliveryAddressesLoading(true);
    setDeliveryAddressesError('');
    void fetchCustomerAddresses().then((addresses) => {
      if (!active) return;
      setDeliveryAddresses(addresses);
      setDeliveryAddressId((current) =>
        addresses.some((address) => address.id === current)
          ? current
          : addresses.find((address) => address.is_default)?.id ?? addresses[0]?.id ?? '',
      );
    }).catch((cause) => {
      if (!active) return;
      setDeliveryAddresses([]);
      setDeliveryAddressId('');
      setDeliveryAddressesError(cause instanceof Error ? cause.message : 'تعذر تحميل عناوين التوصيل.');
    }).finally(() => {
      if (active) setDeliveryAddressesLoading(false);
    });

    return () => { active = false; };
  }, [user?.profileId, isStaffOnly, deliveryAddressRetry]);

  useEffect(() => {
    let active = true;
    if (isStaffOnly) {
      setCartValidation(null);
      setPreviewLoading(false);
      setPreviewError('');
      return () => { active = false; };
    }
    setPreviewLoading(true);
    setPreviewError('');
    setCartValidation(null);
    void (async () => {
      try {
        const { data, error: rpcError } = await supabase.rpc('validate_checkout_cart', { p_items: checkoutItems });
        if (rpcError) throw rpcError;
        const payload = data as { valid?: unknown; items?: unknown; item_count?: unknown; currency?: unknown; pricing_verified?: unknown } | null;
        if (!payload || payload.valid !== true || payload.pricing_verified !== true || !Array.isArray(payload.items) ||
          payload.items.length === 0 || Number(payload.item_count) !== payload.items.length) {
          throw new Error('لم يصل تأكيد تحقق صالح من الخادم');
        }
        const rows = payload.items as CheckoutPreviewLine[];
        if (rows.some((line) =>
          typeof line.product_id !== 'string' || typeof line.name !== 'string' ||
          typeof line.item_code !== 'string' || typeof line.unit !== 'string' ||
          !Number.isFinite(Number(line.quantity)) || Number(line.quantity) <= 0 ||
          'unit_price' in line || 'line_total' in line || 'total_amount' in line
        )) throw new Error('استجابة تحقق السلة غير مكتملة أو تحتوي حقولًا مالية غير مسموحة');
        if (active) setCartValidation({
          valid: true,
          items: rows,
          item_count: Number(payload.item_count),
          currency: typeof payload.currency === 'string' ? payload.currency : 'YER',
          pricing_verified: true,
        });
      } catch (e) {
        if (active) setPreviewError(isCheckoutAuthorizationDenied(e)
          ? 'الحساب الحالي لا يملك صلاحية التحقق من سلة العملاء في هذه المنشأة. استخدم حساب مشتري معتمدًا أو راجع مسؤول المنشأة.'
          : e instanceof Error ? e.message : 'تعذر التحقق من السلة الحالية');
      } finally {
        if (active) setPreviewLoading(false);
      }
    })();
    return () => { active = false; };
  }, [checkoutItems, user?.profileId, isStaffOnly, previewRetry]);

  function submissionNotes(): string {
    const referenceNote = purchaseOrderReference.trim()
      ? 'مرجع أمر الشراء: ' + purchaseOrderReference.trim()
      : '';
    return [notes.trim(), referenceNote].filter(Boolean).join('\n');
  }

  function checkoutSignature(): string {
    const items = cart.map((i) => ({ product_id: i.product.id, quantity: i.quantity })).sort((a, b) => a.product_id.localeCompare(b.product_id));
    return JSON.stringify({ profile_id: user?.profileId, payment_terms: paymentTerms, items, contact_name: name.trim(), business_name: business.trim(), phone: phone.trim(), notes: submissionNotes(), delivery_address_id: deliveryAddressId || null });
  }

  function hasConflictingPendingAttempt(): boolean {
    const signature = checkoutSignature();
    const pending = idempotencyRef.current ?? readStoredCheckoutAttempt(user?.profileId);
    if (!pending || pending.signature === signature) return false;
    setRecoveringAttempt(true);
    setError('توجد محاولة طلب سابقة لم تصل نتيجة تأكيدها. أعد بياناتها نفسها أولًا؛ لن نغيّر السلة المحفوظة أو نرسل طلبًا مختلفًا قبل حسم المحاولة.');
    return true;
  }

  function persistAttemptBeforeSend(attempt: StoredCheckoutAttempt): boolean {
    const storageKey = checkoutAttemptStorageKey(user?.profileId);
    if (!storageKey || typeof window === 'undefined') return false;
    try {
      return verifyPersistedCheckoutAttempt(window.sessionStorage, storageKey, attempt);
    } catch {
      return false;
    }
  }

  function getIdempotencyKey(): string | null {
    const signature = checkoutSignature();
    const activeAttempt = idempotencyRef.current;
    if (activeAttempt) {
      if (activeAttempt.signature !== signature) {
        setRecoveringAttempt(true);
        setError('هناك طلب سابق لم تصل نتيجة تأكيده. لا يمكن إرسال بيانات مختلفة قبل حسم المحاولة السابقة؛ أعد إدخال بياناتها نفسها ثم أعد المحاولة.');
        return null;
      }
      if (!persistAttemptBeforeSend(activeAttempt)) {
        setError('تعذر حفظ مفتاح محاولة الطلب والتحقق منه في تخزين الجلسة؛ لم يُرسل الطلب. فعّل تخزين الجلسة ثم أعد المحاولة، أو افتح طلباتي للتحقق من أي طلب سابق.');
        return null;
      }
      return activeAttempt.key;
    }

    const saved = readStoredCheckoutAttempt(user?.profileId);
    if (saved) {
      if (saved.signature !== signature) {
        setRecoveringAttempt(true);
        setError('توجد محاولة طلب محفوظة لم تصل نتيجة تأكيدها. أدخل بيانات الطلب السابق نفسها لإعادة المحاولة الآمنة؛ لن ننشئ طلبًا جديدًا ببيانات مختلفة.');
        return null;
      }
      if (!persistAttemptBeforeSend(saved)) {
        setError('تعذر التحقق من مفتاح المحاولة المحفوظ؛ لم يُعد إرسال الطلب. افتح طلباتي للتحقق من الطلب السابق قبل أي محاولة جديدة.');
        return null;
      }
      idempotencyRef.current = saved;
      setRecoveringAttempt(false);
      setAmbiguousSubmit(true);
      return saved.key;
    }

    const key = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : 'checkout_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2);
    const attempt = { signature, key };
    if (!persistAttemptBeforeSend(attempt)) {
      setError('تعذر حفظ مفتاح محاولة الطلب والتحقق منه في تخزين الجلسة؛ لم يُرسل الطلب. اسمح بتخزين الجلسة في المتصفح ثم أعد المحاولة.');
      return null;
    }
    idempotencyRef.current = attempt;
    return key;
  }

  async function submit() {
    // A request may only be sent from the explicit review stage after the final confirmation.
    if (checkoutStage !== 'review' || !finalConfirmationAccepted ||
        (priceChanges.length > 0 && !priceChangesAccepted) ||
        availabilityChanges.length > 0) {
      setError(priceChanges.length > 0 && !priceChangesAccepted
        ? 'راجع فروق الأسعار الحالية ووافق عليها صراحةً قبل الإرسال.'
        : availabilityChanges.length > 0
          ? 'طبّق تعديلات التوفر التي أعادها الخادم على السلة، ثم راجع الطلب من جديد قبل الإرسال.'
          : 'راجع مستند الطلب ثم فعّل التأكيد النهائي قبل الإرسال.');
      return;
    }
    // Button disabled state updates after React commits; guard the same-tick duplicate event too.
    if (submitInFlightRef.current) return;
    if (!user) { setError('سجّل الدخول أو أنشئ حساباً لإتمام الطلب'); return; }
    if (name.trim().length < 2 || phone.trim().length < 6) { setError('الاسم ورقم الهاتف مطلوبان'); return; }
    if (previewLoading || !cartValidation) { setError('لا يمكن تسجيل الطلب حتى ينجح التحقق من أصناف السلة وسياسة التسعير. أعد المحاولة.'); return; }
    if (priceVisibilityPolicy === true && pricingPreviewStatus !== 'ready' && pricingPreviewStatus !== 'hidden') {
      setError(pricingPreviewStatus === 'permission-denied'
        ? 'لا يمكن إرسال الطلب بهذا الحساب؛ لا تتوفر صلاحية إنشاء طلب عميل في هذه المنشأة.'
        : 'لا يمكن إرسال الطلب قبل اكتمال مراجعة الأسعار من الخادم. أعد التحقق ثم حاول مجددًا.');
      return;
    }
    if (hasConflictingPendingAttempt()) return;
    submitInFlightRef.current = true;
    setSubmitting(true); setError('');
    let requestWasSent = false;
    try {
      // The local draft can change just before the debounced background sync completes.
      // Persist/read back the exact line set before submit so the deferred DB trigger can
      // convert that same server-side cart atomically with the order.
      if (!user.isStaff && user.profileId && user.roles?.includes('customer')) {
        const expectedCart = checkoutItems
          .map((line) => ({ product_id: line.product_id.toLowerCase(), quantity: line.quantity }))
          .sort((a, b) => a.product_id.localeCompare(b.product_id));
        const persistedCart = await saveCustomerCart(expectedCart);
        const actualCart = [...persistedCart.items].sort((a, b) => a.product_id.localeCompare(b.product_id));
        if (JSON.stringify(actualCart) !== JSON.stringify(expectedCart)) {
          throw new Error('لم يؤكد الخادم حفظ جميع أصناف وكميات السلة الحالية؛ لم يُنشأ الطلب. أعد مزامنة السلة ثم حاول مجددًا.');
        }
      }

      const requestKey = getIdempotencyKey();
      if (!requestKey) return;
      requestWasSent = true;
      const { data, error: rpcError } = await supabase.rpc('submit_customer_order', {
        _items: cart.map((i) => ({ product_id: i.product.id, quantity: i.quantity })),
        _notes: submissionNotes(), _business_name: business.trim(), _contact_name: name.trim(), _phone: phone.trim(),
        _payment_terms: paymentTerms, _idempotency_key: requestKey,
        _delivery_address_id: deliveryAddressId || null,
      });
      const result = data as { id?: unknown; order_number?: unknown; status?: unknown } | null;
      if (rpcError && isCheckoutAuthorizationDenied(rpcError)) {
        clearStoredCheckoutAttempt(user?.profileId, requestKey);
        if (idempotencyRef.current?.key === requestKey) idempotencyRef.current = null;
        setAmbiguousSubmit(false);
        setRecoveringAttempt(false);
        setPricingPreviewStatus('permission-denied');
        setError('رفض الخادم إنشاء الطلب: الحساب الحالي لا يحمل صلاحية إنشاء طلب عميل في هذه المنشأة. لم يُنشأ أي طلب. استخدم حساب عميل معتمدًا أو اطلب من مسؤول المنشأة مراجعة اعتماد الحساب ودور العضو.');
        return;
      }
      if (rpcError || !result || typeof result.id !== 'string' || !result.id || typeof result.order_number !== 'string' || !result.order_number ||
        'total_amount' in result || 'unit_price' in result || 'line_total' in result) {
        // The server may have committed before an error or malformed acknowledgement reached the browser.
        // Keep the attempt key and require exact-payload replay instead of risking a second order.
        setAmbiguousSubmit(true);
        setError('لم يصل تأكيد نهائي لنتيجة الطلب. أعد المحاولة بالبيانات نفسها؛ سيُستخدم مفتاح المحاولة نفسه لمنع إنشاء طلب مكرر.');
        return;
      }
      try {
        const storageKey = checkoutAttemptStorageKey(user?.profileId);
        const saved = storageKey
          ? JSON.parse(window.sessionStorage.getItem(storageKey) || 'null') as { key?: unknown } | null
          : null;
        if (storageKey && saved?.key === requestKey) window.sessionStorage.removeItem(storageKey);
      } catch { /* request is already confirmed; cleanup is best-effort */ }
      idempotencyRef.current = null;
      setAmbiguousSubmit(false);
      setRecoveringAttempt(false);
      onComplete({ id: result.id, order_number: result.order_number });
    } catch (cause) {
      if (requestWasSent) {
        setAmbiguousSubmit(true);
        setError('انقطع الاتصال قبل وصول تأكيد نهائي للطلب. لا تغيّر بياناته؛ أعد المحاولة نفسها حتى نتحقق من نتيجته دون إنشاء طلب مكرر.');
      } else {
        setError(cause instanceof Error ? cause.message : 'تعذر إرسال الطلب');
      }
    } finally {
      submitInFlightRef.current = false;
      setSubmitting(false);
    }
  }

  if (isStaffOnly) {
    return (
      <section className="sf-checkout sf-checkout-access">
        <div className="sf-checkout-access-card">
          <span className="sf-checkout-access-mark"><Activity size={26} /></span>
          <span className="sf-checkout-eyebrow">مسار الإدارة</span>
          <h2>هذه الشاشة مخصصة لحسابات العملاء</h2>
          <p>أنت مسجل الدخول بحساب إداري، وليس بحساب مشتري مرتبط بسجل عميل. لن نُنشئ طلبًا ذاتيًا أو نعرض أسعار عميل على حساب الإدارة.</p>
          <div className="sf-checkout-access-actions">
            <Link to="/admin/orders" className="sf-checkout-primary-link">فتح إدارة طلبات العملاء <ChevronLeft size={17} /></Link>
            <Link to="/admin" className="sf-checkout-secondary-link">لوحة الإدارة</Link>
          </div>
        </div>
      </section>
    );
  }

  const pricePreviewPending = priceVisibilityPolicy === true
    && pricingPreviewStatus !== 'ready'
    && pricingPreviewStatus !== 'hidden';

  function continueToReview() {
    setError('');
    if (!user) { setError('سجّل الدخول أولًا لإتمام الطلب.'); return; }
    if (name.trim().length < 2 || phone.trim().length < 6) {
      setError('أدخل الاسم الكامل ورقم هاتف صالحًا قبل مراجعة الطلب.');
      return;
    }
    if (deliveryAddressesLoading) {
      setError('انتظر اكتمال تحميل عناوين التوصيل قبل مراجعة الطلب.');
      return;
    }
    if (previewLoading || !cartValidation || !cartValidation.valid || !cartValidation.pricing_verified) {
      setError('لا يمكن فتح المراجعة قبل نجاح التحقق من الأصناف والكميات في الخادم.');
      return;
    }
    if (submissionNotes().length > 1000) {
      setError('اختصر الملاحظات أو مرجع أمر الشراء؛ الحد الإجمالي المحفوظ 1,000 حرف.');
      return;
    }
    if (hasConflictingPendingAttempt()) return;
    setFinalConfirmationAccepted(false);
    setCheckoutStage('review');
  }

  return (
    <section className="sf-checkout">
      <style>{'@media print { body * { visibility: hidden !important; } .sf-checkout-review-print-document, .sf-checkout-review-print-document * { visibility: visible !important; } .sf-checkout-review-print-document { position: absolute !important; inset: 0 !important; width: 100% !important; max-width: none !important; margin: 0 !important; padding: 10mm !important; background: #fff !important; box-shadow: none !important; grid-template-columns: 1fr 1fr !important; } .sf-checkout-review-print-document .no-print { display: none !important; } }'}</style>
      <header className="sf-checkout-hero">
        <div className="sf-checkout-hero-copy">
          <span className="sf-checkout-eyebrow"><Check size={14} /> مراجعة آمنة قبل الإرسال</span>
          <h2>{checkoutStage === 'review' ? 'مراجعة الطلب قبل الإرسال' : 'إتمام الطلب'}</h2>
          <p>{checkoutStage === 'review'
            ? 'راجع المستند والبيانات والأسعار المسموح بعرضها. لن يُرسل الطلب قبل التأكيد النهائي.'
            : 'أكمل بيانات العميل والتوصيل والسداد. لن يُنشأ الطلب في هذه المرحلة.'}</p>
        </div>
        <ol className="sf-checkout-steps" aria-label="خطوات إتمام الطلب">
          <li className="is-complete"><span>01</span><b>السلة</b></li>
          <li className={checkoutStage === 'details' ? 'is-current' : 'is-complete'} aria-current={checkoutStage === 'details' ? 'step' : undefined}><span>02</span><b>البيانات</b></li>
          <li className={checkoutStage === 'review' ? 'is-current' : ''} aria-current={checkoutStage === 'review' ? 'step' : undefined}><span>03</span><b>مراجعة المستند</b></li>
          <li><span>04</span><b>الإرسال</b></li>
        </ol>
      </header>

      <div
        className={'sf-checkout-layout' + (checkoutStage === 'review' ? ' sf-checkout-review-print-document' : '')}
        data-testid={checkoutStage === 'review' ? 'checkout-review-document' : 'checkout-details-draft'}
        style={checkoutStage === 'details' ? { gridTemplateColumns: 'minmax(0, 1fr)' } : undefined}
      >
        <div className="sf-checkout-form">
          {checkoutStage === 'details' ? (
            <>
              <section className="sf-checkout-card">
                <div className="sf-checkout-section-head">
                  <span className="sf-checkout-section-number">01</span>
                  <div><h3>بيانات العميل والمنشأة</h3><p>ستُحفظ هذه البيانات مع الطلب لتأكيده والتواصل بشأنه.</p></div>
                </div>
                <div className="sf-checkout-fields-grid">
                  <label className="sf-form-field">
                    <span>اسم العميل / مسؤول الطلب <b>*</b></span>
                    <input autoComplete="name" value={name} disabled={submitting || ambiguousSubmit} onChange={(e) => setName(e.target.value)} placeholder="اسمك الكامل" />
                  </label>
                  <label className="sf-form-field">
                    <span>رقم الهاتف <b>*</b></span>
                    <input autoComplete="tel" inputMode="tel" value={phone} disabled={submitting || ambiguousSubmit} onChange={(e) => setPhone(e.target.value)} placeholder="7XX XXX XXX" />
                  </label>
                  <label className="sf-form-field sf-checkout-field-full">
                    <span>اسم المنشأة / الشركة</span>
                    <input autoComplete="organization" value={business} disabled={submitting || ambiguousSubmit} onChange={(e) => setBusiness(e.target.value)} placeholder="اسم المتجر أو الشركة" />
                  </label>
                </div>
              </section>

              <section className="sf-checkout-card">
                <div className="sf-checkout-section-head">
                  <span className="sf-checkout-section-number">02</span>
                  <div><h3>عنوان التسليم</h3><p>حدد وجهة التسليم المعتمدة لهذا الطلب.</p></div>
                </div>
                <div className="sf-checkout-address-field">
                  <label htmlFor="checkout-delivery-address">العنوان المحفوظ</label>
                  <select
                    id="checkout-delivery-address"
                    className="sf-checkout-select"
                    value={deliveryAddressId}
                    onChange={(event) => setDeliveryAddressId(event.target.value)}
                    disabled={deliveryAddressesLoading || submitting || ambiguousSubmit}
                  >
                    <option value="">بدون عنوان محفوظ — سأؤكد تفاصيل التوصيل لاحقًا</option>
                    {deliveryAddresses.map((address) => (
                      <option key={address.id} value={address.id}>
                        {address.label} — {address.city} — {address.address_line1}
                      </option>
                    ))}
                  </select>
                  {deliveryAddressesLoading && <small role="status" className="sf-checkout-hint">جارٍ تحميل عناوينك المحفوظة...</small>}
                  {deliveryAddressesError && (
                    <div className="sf-form-error" role="alert">
                      {deliveryAddressesError}
                      <button className="sf-link" type="button" onClick={() => setDeliveryAddressRetry((n) => n + 1)}>إعادة تحميل العناوين</button>
                    </div>
                  )}
                  {!deliveryAddressesLoading && deliveryAddresses.length === 0 && (
                    <p className="sf-checkout-hint">لا يوجد عنوان محفوظ. يمكنك المتابعة دون عنوان، أو <Link to="/addresses" className="sf-link">إضافة عنوان توصيل</Link>.</p>
                  )}
                  {selectedDeliveryAddress && (
                    <div className="sf-checkout-inline-note" role="note">
                      سيُثبت الطلب نسخة مستقلة من العنوان المحدد حتى لا تتغير بياناته عند تعديل دفتر العناوين لاحقًا.
                    </div>
                  )}
                </div>
              </section>

              <section className="sf-checkout-card">
                <div className="sf-checkout-section-head">
                  <span className="sf-checkout-section-number">03</span>
                  <div><h3>شروط السداد</h3><p>يعاد التحقق من اعتماد الحساب والحد الائتماني من الخادم عند الإرسال.</p></div>
                </div>
                <fieldset className="sf-checkout-payment">
                  <legend className="sf-checkout-field-label">اختر طريقة السداد</legend>
                  <label className={"sf-checkout-payment-option" + (paymentTerms === 'cash_on_delivery' ? ' is-selected' : '')}>
                    <input type="radio" name="paymentTerms" value="cash_on_delivery" checked={paymentTerms === 'cash_on_delivery'} disabled={submitting || ambiguousSubmit} onChange={() => setPaymentTerms('cash_on_delivery')} />
                    <span><strong>الدفع عند الاستلام</strong><small>تسوية قيمة الطلب عند تسلّم البضاعة.</small></span>
                    <b className="sf-checkout-radio-mark" aria-hidden="true" />
                  </label>
                  <label className={"sf-checkout-payment-option" + (paymentTerms === 'credit' ? ' is-selected' : '')}>
                    <input type="radio" name="paymentTerms" value="credit" checked={paymentTerms === 'credit'} disabled={submitting || ambiguousSubmit} onChange={() => setPaymentTerms('credit')} />
                    <span><strong>الدفع الآجل</strong><small>للحسابات التجارية المعتمدة وضمن حد الائتمان المتاح.</small></span>
                    <b className="sf-checkout-radio-mark" aria-hidden="true" />
                  </label>
                </fieldset>
              </section>

              <section className="sf-checkout-card">
                <div className="sf-checkout-section-head">
                  <span className="sf-checkout-section-number">04</span>
                  <div><h3>مرجع الشراء وملاحظات العميل</h3><p>أدخل مرجع أمر الشراء وتعليمات التجهيز أو التسليم.</p></div>
                </div>
                <label className="sf-form-field">
                  <span>الرقم المرجعي لأمر الشراء (اختياري)</span>
                  <input
                    value={purchaseOrderReference}
                    maxLength={70}
                    autoComplete="off"
                    disabled={submitting || ambiguousSubmit}
                    onChange={(event) => setPurchaseOrderReference(event.target.value)}
                    placeholder="مثال: PO-2026-001"
                  />
                  <small className="sf-checkout-hint">يُحفظ المرجع مع ملاحظات الطلب باستخدام عقد الإرسال الحالي حتى يظل مرتبطًا بالطلب بعد تحديث الصفحة.</small>
                </label>
                <label className="sf-form-field" style={{ marginTop: 12 }}>
                  <span>ملاحظات إضافية (اختياري)</span>
                  <textarea
                    className="sf-checkout-notes"
                    value={notes}
                    maxLength={900}
                    disabled={submitting || ambiguousSubmit}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="اكتب تعليمات خاصة بالتجهيز أو التسليم..."
                    rows={3}
                  />
                </label>
              </section>
            </>
          ) : (
            <>
              <section className="sf-checkout-card">
                <div className="sf-checkout-section-head">
                  <span className="sf-checkout-section-number">01</span>
                  <div><h3>مراجعة العميل والمنشأة</h3><p>بيانات الاتصال التي سترتبط بمستند الطلب.</p></div>
                </div>
                <dl style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(170px,1fr))', gap: 12, margin: 0 }}>
                  <div><dt className="sf-checkout-hint">اسم العميل</dt><dd style={{ margin: 0, fontWeight: 800 }}>{name.trim()}</dd></div>
                  <div><dt className="sf-checkout-hint">رقم الهاتف</dt><dd style={{ margin: 0, fontWeight: 800, direction: 'ltr', textAlign: 'right' }}>{phone.trim()}</dd></div>
                  <div><dt className="sf-checkout-hint">المنشأة / الشركة</dt><dd style={{ margin: 0, fontWeight: 800 }}>{business.trim() || 'غير محدد'}</dd></div>
                </dl>
              </section>

              <section className="sf-checkout-card">
                <div className="sf-checkout-section-head">
                  <span className="sf-checkout-section-number">02</span>
                  <div><h3>مراجعة عنوان التسليم</h3><p>العنوان المثبت في الطلب لا يتغير عند تعديل دفتر العناوين.</p></div>
                </div>
                {selectedDeliveryAddress ? (
                  <div style={{ display: 'grid', gap: 5, lineHeight: 1.8 }}>
                    <strong>{selectedDeliveryAddress.label}</strong>
                    <span>{selectedDeliveryAddress.recipient_name} — {selectedDeliveryAddress.phone}</span>
                    <span>{selectedDeliveryAddress.address_line1}{selectedDeliveryAddress.address_line2 ? '، ' + selectedDeliveryAddress.address_line2 : ''}</span>
                    <span>{[selectedDeliveryAddress.city, selectedDeliveryAddress.region, selectedDeliveryAddress.postal_code, selectedDeliveryAddress.country].filter(Boolean).join('، ')}</span>
                    {selectedDeliveryAddress.delivery_instructions ? <small>تعليمات التسليم: {selectedDeliveryAddress.delivery_instructions}</small> : null}
                  </div>
                ) : (
                  <p className="sf-checkout-hint">لم يتم اختيار عنوان محفوظ. ستُنسّق تفاصيل الوجهة معك قبل التجهيز.</p>
                )}
                <div className="sf-checkout-inline-note" role="note" style={{ marginTop: 12 }}>
                  موعد التسليم المتوقع: يُحدد بعد مراجعة الطلب وتأكيد التوفر مع فريق المبيعات؛ لا يوجد موعد خادمي موثوق لعرضه الآن.
                </div>
              </section>

              <section className="sf-checkout-card">
                <div className="sf-checkout-section-head">
                  <span className="sf-checkout-section-number">03</span>
                  <div><h3>شروط السداد ومرجع الشراء</h3><p>راجع الشروط والمرجع قبل اعتماد الإرسال.</p></div>
                </div>
                <div style={{ display: 'grid', gap: 10 }}>
                  <p style={{ margin: 0 }}>طريقة السداد: <strong>{paymentTerms === 'credit' ? 'الدفع الآجل — مشروط باعتماد الحساب والحد الائتماني' : 'الدفع عند الاستلام'}</strong></p>
                  <p style={{ margin: 0 }}>مرجع أمر الشراء: <strong>{purchaseOrderReference.trim() || 'غير مضاف'}</strong></p>
                  <div>
                    <strong>ملاحظات العميل</strong>
                    <p style={{ margin: '5px 0 0', whiteSpace: 'pre-wrap' }}>{notes.trim() || 'لا توجد ملاحظات إضافية.'}</p>
                  </div>
                </div>
              </section>

              {recoveringAttempt && !ambiguousSubmit ? (
                <p className="sf-checkout-feedback sf-checkout-feedback-warning" role="status">
                  توجد محاولة سابقة لم يصل تأكيدها بعد. أعد بياناتها نفسها؛ لن نرسل طلبًا مختلفًا قبل حسمها.
                </p>
              ) : null}
              {previewError ? (
                <div className="sf-checkout-feedback sf-checkout-feedback-error" role="alert">
                  {previewError} <button className="sf-link" type="button" onClick={() => setPreviewRetry((n) => n + 1)}>إعادة التحقق من السلة</button>
                </div>
              ) : null}
              {error ? <div className="sf-checkout-feedback sf-checkout-feedback-error" role="alert" aria-live="assertive">{error}</div> : null}
              {ambiguousSubmit ? (
                <div className="sf-checkout-feedback sf-checkout-feedback-warning" role="status">
                  <strong>نتيجة المحاولة لم تُحسم بعد.</strong>
                  <p>أعد إرسال البيانات نفسها بالمفتاح المحفوظ، أو <Link to="/orders" className="sf-link">افتح طلباتي للتحقق من ظهور الطلب</Link>.</p>
                </div>
              ) : null}

              {availabilityChanges.length > 0 && (
                <section className="sf-checkout-card no-print" aria-label="تغيرات توفر الأصناف">
                  <div className="sf-checkout-section-head"><span className="sf-checkout-section-number">!</span><div><h3>تغير التوفر منذ عرض السلة</h3><p>أُعيد جلب المخزون الحالي من الخادم عند فتح الدفع.</p></div></div>
                  <div style={{ display: 'grid', gap: 8 }}>
                    {availabilityChanges.map((change) => {
                      const current = change.current_available === null ? 'غير مؤكد' : formatNumber(change.current_available);
                      const previous = change.previous_available === null ? 'غير مؤكد' : formatNumber(change.previous_available);
                      const label = change.kind === 'unavailable' ? 'أصبح الصنف غير متاح'
                        : change.kind === 'restored' ? 'أصبح الصنف متاحًا مجددًا'
                          : change.kind === 'reduced' ? 'انخفضت الكمية المتاحة'
                            : change.kind === 'increased' ? 'ارتفعت الكمية المتاحة' : 'تغيرت حالة بيانات المخزون';
                      const adjustment = availabilityAdjustments.find((item) => item.product_id.toLowerCase() === change.product_id);
                      const suggested = adjustment?.action === 'reduce'
                        ? `الكمية المقترحة بعد موافقتك: ${formatNumber(adjustment.next_quantity ?? 0)}`
                        : adjustment?.action === 'remove'
                          ? 'لا يفي المتاح بالحد الأدنى؛ سيُحذف الصنف بعد موافقتك ويمكن استعادته.'
                          : adjustment?.action === 'blocked'
                            ? 'لا توجد كمية مؤكدة؛ يلزم إعادة تحميل المخزون يدويًا.'
                            : 'الكمية الحالية ضمن المتاح.';
                      return <div key={change.product_id} style={{ display: 'grid', gap: 4, borderBottom: '1px solid #e7eeee', paddingBottom: 7 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                          <strong>{cart.find((item) => item.product.id.toLowerCase() === change.product_id)?.product.name ?? 'صنف من السلة'} — {label}</strong>
                          <span>المتاح السابق: {previous} · الحالي: {current}</span>
                        </div>
                        <small>{suggested}</small>
                      </div>;
                    })}
                  </div>
                  <label style={{ display: 'flex', alignItems: 'flex-start', gap: 9, marginTop: 12, lineHeight: 1.8, fontWeight: 750 }}>
                    <input type="checkbox" checked={availabilityChangesAccepted} disabled={submitting || ambiguousSubmit} onChange={(event) => setAvailabilityChangesAccepted(event.target.checked)} style={{ marginTop: 6 }} />
                    أوافق على تحديث السلة وفق الكميات المتاحة التي أعادها الخادم، بما في ذلك خفض الكميات أو إزالة الأصناف غير المتاحة.
                  </label>
                  <div className="sf-checkout-actions" style={{ marginTop: 12 }}>
                    {hasBlockedAvailabilityAdjustment ? (
                      <button type="button" className="sf-btn-secondary" onClick={onBack}>العودة إلى السلة لإعادة تحميل المخزون</button>
                    ) : (
                      <button type="button" className="sf-btn-primary" disabled={!availabilityChangesAccepted || submitting || ambiguousSubmit} onClick={() => {
                        const result = onApplyAvailabilityChanges(availabilityAdjustments);
                        if (!result.applied) {
                          setError(result.message);
                          return;
                        }
                        setError('');
                        setStockUpdateNotice(result.message);
                        setAvailabilityChangesAccepted(false);
                        setFinalConfirmationAccepted(false);
                      }}>تطبيق تعديلات الخادم على السلة</button>
                    )}
                  </div>
                </section>
              )}
              {recentlyRemovedCartItems.length > 0 && (
                <section className="sf-checkout-card no-print" aria-label="الأصناف التي أزيلت من السلة">
                  <div className="sf-checkout-section-head">
                    <span className="sf-checkout-section-number">↶</span>
                    <div><h3>أصناف أُزيلت من السلة</h3><p>أزيلت بسبب عدم التوفر أو عدم بلوغ الحد الأدنى للطلب. يمكنك استعادتها، وسيعاد التحقق من مخزونها قبل الإرسال.</p></div>
                  </div>
                  <ul style={{ margin: 0, paddingInlineStart: 22, lineHeight: 1.9 }}>
                    {recentlyRemovedCartItems.map((entry) => (
                      <li key={entry.item.product.id}>{entry.item.product.name} — {formatNumber(entry.item.quantity)} {entry.item.product.unit}</li>
                    ))}
                  </ul>
                  <button type="button" className="sf-btn-secondary" style={{ marginTop: 12 }} onClick={onUndoCartRemoval}>
                    استعادة الأصناف المحذوفة وإعادة فحص التوفر
                  </button>
                </section>
              )}
              {priceChanges.length > 0 && (
                <section className="sf-checkout-card no-print" aria-label="تغيرات الأسعار">
                  <div className="sf-checkout-section-head"><span className="sf-checkout-section-number">!</span><div><h3>تغيرت الأسعار أو شروط العروض</h3><p>مقارنة بين معاينة السلة ومعاينة الدفع من الخادم. لا يُستخدم أي سعر مخزن محليًا.</p></div></div>
                  <div style={{ display: 'grid', gap: 8 }}>
                    {priceChanges.map((change) => (
                      <div key={change.product_id} style={{ display: 'grid', gap: 3, borderBottom: '1px solid #e7eeee', paddingBottom: 8 }}>
                        <strong>{change.name} × {formatNumber(change.quantity)}</strong>
                        {change.previous_quantity !== change.quantity && <small>الكمية السابقة: {formatNumber(change.previous_quantity)} · الحالية: {formatNumber(change.quantity)}</small>}
                        <span>السعر السابق للوحدة: {formatCartReviewAmount(change.previous_unit_price, change.previous_currency)}</span>
                        <span>السعر الحالي للوحدة: {formatCartReviewAmount(change.current_unit_price, change.current_currency)} · {change.kind === 'currency' ? 'تغيير العملة' : change.kind === 'increase' ? 'زيادة' : change.kind === 'decrease' ? 'انخفاض' : 'تغير شروط العرض'}</span>
                      </div>
                    ))}
                  </div>
                  <label style={{ display: 'flex', alignItems: 'flex-start', gap: 9, marginTop: 12, lineHeight: 1.8, fontWeight: 750 }}>
                    <input type="checkbox" checked={priceChangesAccepted} disabled={submitting || ambiguousSubmit} onChange={(event) => setPriceChangesAccepted(event.target.checked)} style={{ marginTop: 6 }} />
                    راجعت فروق الأسعار وشروط العروض الحالية التي أعادها الخادم، وأوافق عليها قبل إرسال الطلب.
                  </label>
                </section>
              )}
              <section className="sf-checkout-card no-print">
                <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, lineHeight: 1.8, fontWeight: 800 }}>
                  <input
                    type="checkbox"
                    checked={finalConfirmationAccepted}
                    disabled={submitting || ambiguousSubmit}
                    onChange={(event) => setFinalConfirmationAccepted(event.target.checked)}
                    style={{ marginTop: 6 }}
                  />
                  أؤكد أن بيانات العميل والعنوان والأصناف والكميات وشروط السداد صحيحة، وأوافق على إرسال الطلب إلى الشركة لمراجعته.
                </label>
                <div className="sf-checkout-actions" style={{ marginTop: 16 }}>
                  <button
                    className="sf-btn-secondary"
                    type="button"
                    onClick={() => { setCheckoutStage('details'); setFinalConfirmationAccepted(false); setError(''); }}
                    disabled={submitting || ambiguousSubmit}
                  >
                    العودة لتعديل البيانات
                  </button>
                  <button
                    className="sf-btn-primary"
                    type="button"
                    onClick={() => void submit()}
                    disabled={submitting || previewLoading || !cartValidation || pricePreviewPending || !finalConfirmationAccepted || (priceChanges.length > 0 && !priceChangesAccepted) || availabilityChanges.length > 0}
                  >
                    {submitting
                      ? 'جارٍ إرسال الطلب...'
                      : ambiguousSubmit || recoveringAttempt
                        ? 'إعادة محاولة تأكيد الطلب نفسه'
                        : pricePreviewPending
                          ? 'جارٍ تجهيز مراجعة الفاتورة من الخادم...'
                          : 'تأكيد نهائي وإرسال الطلب'}
                  </button>
                </div>
              </section>
            </>
          )}

          {checkoutStage === 'details' ? (
            <>
              {recoveringAttempt && !ambiguousSubmit ? (
                <p className="sf-checkout-feedback sf-checkout-feedback-warning" role="status">
                  توجد محاولة طلب سابقة لم يصل تأكيدها بعد. أعد بياناتها نفسها أولًا؛ لن نرسل طلبًا مختلفًا قبل حسم المحاولة.
                </p>
              ) : null}
              {previewError ? (
                <div className="sf-checkout-feedback sf-checkout-feedback-error" role="alert">
                  {previewError} <button className="sf-link" type="button" onClick={() => setPreviewRetry((n) => n + 1)}>إعادة التحقق من السلة</button>
                </div>
              ) : null}
              {stockUpdateNotice ? <div className="sf-checkout-trust-note" role="status" aria-live="polite">{stockUpdateNotice}</div> : null}
              {error ? <div className="sf-checkout-feedback sf-checkout-feedback-error" role="alert" aria-live="assertive">{error}</div> : null}
              {ambiguousSubmit ? (
                <div className="sf-checkout-feedback sf-checkout-feedback-warning" role="status">
                  <strong>نتيجة المحاولة السابقة لم تُحسم بعد.</strong>
                  <p>استعد بياناتها نفسها أولًا أو <Link to="/orders" className="sf-link">افتح طلباتي للتحقق من ظهورها</Link>.</p>
                </div>
              ) : null}
              <div className="sf-checkout-actions">
                <button className="sf-btn-secondary" type="button" onClick={onBack} disabled={submitting || ambiguousSubmit}>العودة إلى السلة</button>
                <button
                  className="sf-btn-primary"
                  type="button"
                  onClick={continueToReview}
                  disabled={submitting || previewLoading || deliveryAddressesLoading || !cartValidation || ambiguousSubmit}
                >
                  مراجعة الطلب والفاتورة
                </button>
              </div>
            </>
          ) : null}
        </div>

        {checkoutStage === 'review' ? (
          <aside className="sf-checkout-summary" data-testid="checkout-invoice-preview">
            <div className="sf-checkout-summary-head">
              <div><span className="sf-checkout-summary-kicker">مسودة غير مرسلة</span><h3>معاينة مستند الطلب</h3></div>
              <span className="sf-checkout-count">{cartValidation?.item_count ?? cart.length} أصناف</span>
            </div>
            <div className="sf-checkout-summary-items" aria-live="polite">
              {previewLoading ? <p className="sf-checkout-hint" role="status">جارٍ التحقق من الأصناف والكميات من الخادم...</p> : null}
              {cartValidation ? cartValidation.items.map((line) => (
                <div className="sf-summary-row" key={line.product_id}>
                  <span><b>{line.name}</b><small>رمز الصنف: {line.item_code || '—'}</small></span>
                  <strong>{formatNumber(Number(line.quantity))} {line.unit}</strong>
                </div>
              )) : null}
            </div>
            <CustomerOrderPricingPreview
              items={checkoutItems}
              policyValue={priceVisibilityPolicy}
              surface="orders"
              title="معاينة الأسعار المعتمدة قبل الإرسال"
              onStatusChange={setPricingPreviewStatus}
              onPresentationChange={handleCheckoutPricingPresentation}
            />
            {priceVisibilityPolicy !== true ? (
              <div className="sf-checkout-privacy-note" role="note">
                <strong>الأسعار والإجماليات مخفية حسب سياسة المتجر</strong>
                <p>لن تُعرض أي مبالغ في المستند للعميل، ويظل اعتماد السعر النهائي داخل الخادم.</p>
              </div>
            ) : null}
            {cartValidation ? (
              <div className="sf-checkout-trust-note">
                <Check size={15} />
                <span>الأصناف والكميات متحققة من الخادم. أي أسعار أو خصومات ظاهرة مصدرها معاينة الخادم، ويُعاد احتساب الطلب داخل معاملة الإرسال.</span>
              </div>
            ) : null}
            <div className="sf-checkout-privacy-note" role="note">
              <strong>الضرائب والرسوم</strong>
              <p>لا تُعرض مبالغ ضريبية أو رسوم إضافية ما لم تُرجعها خدمة التسعير المعتمدة صراحةً؛ لا يُنشئ المتصفح مبالغ تقديرية.</p>
            </div>
            <div className="sf-checkout-privacy-note" role="note">
              <strong>طبيعة المستند</strong>
              <p>هذه معاينة لطلب غير مرسل وليست فاتورة ضريبية أو إثبات دفع. يصدر رقم الطلب النهائي بعد تأكيد الخادم استلامه.</p>
            </div>
            <div className="no-print" style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 14 }}>
              <button type="button" className="sf-btn-secondary" onClick={() => window.print()}>
                <Printer size={16} /> طباعة / حفظ المعاينة PDF
              </button>
            </div>
          </aside>
        ) : (
          <aside className="sf-checkout-summary">
            <div className="sf-checkout-summary-head">
              <div><span className="sf-checkout-summary-kicker">مسودة السلة</span><h3>ملخص قبل المراجعة</h3></div>
              <span className="sf-checkout-count">{cartValidation?.item_count ?? cart.length} أصناف</span>
            </div>
            <div className="sf-checkout-summary-items">
              {cartValidation ? cartValidation.items.map((line) => (
                <div className="sf-summary-row" key={line.product_id}>
                  <span><b>{line.name}</b><small>رمز الصنف: {line.item_code || '—'}</small></span>
                  <strong>{formatNumber(Number(line.quantity))} {line.unit}</strong>
                </div>
              )) : cart.map((item) => (
                <div className="sf-summary-row" key={item.product.id}>
                  <span><b>{item.product.name}</b><small>بانتظار التحقق من الخادم</small></span>
                  <strong>{formatNumber(item.quantity)} {item.product.unit}</strong>
                </div>
              ))}
            </div>
            {!user ? (
              <div className="sf-checkout-privacy-note" role="note">
                سجّل الدخول أولًا؛ لن تُعرض الأسعار دون معاينة خادمية مرتبطة بحسابك.
              </div>
            ) : null}
            <div className="sf-checkout-trust-note" role="note">
              <Check size={15} />
              <span>لم يُرسل أي طلب بعد. تُجرى مراجعة الأسعار والخصومات المسموح بها في الخطوة التالية فقط.</span>
            </div>
          </aside>
        )}
      </div>
    </section>
  );

}

type MatrixFeedback = { kind: 'success' | 'error'; message: string };

export function QuickOrderMatrix({ products, quantities, alreadyInCart = {}, feedback, onQuantityChange, onAddSelected, onBack, onCart }: {
  products: ProductWithInventory[];
  quantities: Record<string, string>;
  alreadyInCart?: Record<string, number>;
  feedback: MatrixFeedback | null;
  onQuantityChange: (productId: string, value: string) => void;
  onAddSelected: () => void;
  onBack: () => void;
  onCart: () => void;
}) {
  const selectedCount = products.filter((product) => Number(quantities[product.id] ?? 0) > 0).length;
  return (
    <section className="sf-collection">
      <button className="sf-back-link" onClick={onBack}><ArrowRight size={16} /> العودة للكتالوج</button>
      <div className="sf-products-head">
        <div><h2><ClipboardList size={21} /> الطلب السريع</h2><span>حدد كميات عدة أصناف في شاشة واحدة ثم أضفها إلى السلة. لا تعرض شاشة الطلب السريع أي أسعار أو إجماليات.</span></div>
        <div className="sf-discovery-links"><button onClick={onCart}><ShoppingCart size={15} /> عرض السلة</button></div>
      </div>
      <p style={{ margin: '0 0 14px', color: '#667b80', fontSize: 12 }} role="note">
        لا تُعرض الأسعار أو إجماليات الطلب هنا؛ يتحقق الخادم من الأصناف والكميات والمخزون ويعيد احتساب السعر داخليًا عند إرسال الطلب.
      </p>
      {feedback && <div role={feedback.kind === 'error' ? 'alert' : 'status'} style={{ marginBottom: 14, padding: '10px 12px', borderRadius: 10, border: `1px solid ${feedback.kind === 'error' ? '#efc5c5' : '#b8e5d4'}`, background: feedback.kind === 'error' ? '#fff6f6' : '#f0fbf6', color: feedback.kind === 'error' ? '#9b2626' : '#17684d', fontSize: 13 }}>{feedback.message}</div>}
      {!products.length ? <div className="sf-empty"><Package size={30} /><span>لا توجد منتجات مطابقة للبحث الحالي</span><small>غيّر البحث أو التصنيف ثم حاول مجددًا.</small></div> :
        <div style={{ overflowX: 'auto', border: '1px solid #dfeaec', borderRadius: 14, background: '#fff' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 560, fontSize: 13 }}>
            <thead><tr style={{ background: '#f2f7f8', textAlign: 'right' }}>
              <th scope="col" style={{ padding: 12 }}>الصنف</th>
              <th scope="col" style={{ padding: 12 }}>الرمز</th>
              <th scope="col" style={{ padding: 12 }}>المتوفر</th>
              <th scope="col" style={{ padding: 12 }}>الكمية</th>
            </tr></thead>
            <tbody>{products.map((product) => {
              const available = Math.max(0, Math.floor(Number(product.inventory?.quantity_available ?? 0)));
              const alreadyOrdered = Math.max(0, Math.floor(Number(alreadyInCart[product.id] ?? 0)));
              const remainingToAdd = Math.max(0, available - alreadyOrdered);
              const minimum = Number.isSafeInteger(product.min_order_quantity) && Number(product.min_order_quantity) >= 1
                ? Number(product.min_order_quantity) : 1;
              const multiple = Number.isSafeInteger(product.order_quantity_multiple) && Number(product.order_quantity_multiple) >= 1
                ? Number(product.order_quantity_multiple) : 1;
              const nextAllowedTotal = alreadyOrdered < minimum
                ? minimum
                : minimum + (Math.floor((alreadyOrdered - minimum) / multiple) + 1) * multiple;
              const minimumAddition = Math.max(1, nextAllowedTotal - alreadyOrdered);
              const rawQuantity = quantities[product.id] ?? '';
              const currentQuantity = /^\d+$/.test(rawQuantity) ? Number(rawQuantity) : 0;
              const resultingQuantity = alreadyOrdered + currentQuantity;
              const nextAllowedAfterCurrent = resultingQuantity < minimum
                ? minimum
                : minimum + (Math.floor((resultingQuantity - minimum) / multiple) + 1) * multiple;
              const nextIncrease = nextAllowedAfterCurrent - alreadyOrdered;
              return <tr key={product.id} style={{ borderTop: '1px solid #edf2f3' }}>
                <td style={{ padding: 12, fontWeight: 800 }}>
                  <div>{product.name}</div>
                  {product.name_en ? <small dir="auto" style={{ display: 'block', marginTop: 3, color: '#62797e', fontWeight: 500 }}>{product.name_en}</small> : null}
                  <small style={{ display: 'block', marginTop: 3, color: '#74888c', fontWeight: 500 }}>{product.category?.name ?? 'غير مصنف'}</small>
                  {(minimum > 1 || multiple > 1) && <small style={{ display: 'block', marginTop: 3, color: '#62797e', fontWeight: 600 }}>الحد الأدنى {minimum} · تدرج الكمية {multiple}</small>}
                </td>
                <td style={{ padding: 12, direction: 'ltr', textAlign: 'right' }}>
                  <div>{product.item_code}</div>
                  {product.sku ? <small style={{ display: 'block', marginTop: 3, color: '#62797e', fontWeight: 600 }}>SKU: {product.sku}</small> : null}
                </td>
                <td style={{ padding: 12, whiteSpace: 'nowrap' }}>{formatNumber(available)} {product.unit}</td>
                <td style={{ padding: 12, minWidth: 160 }}>
                  <div style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                    <button type="button" aria-label={`تقليل كمية ${product.name}`} disabled={remainingToAdd < minimumAddition || currentQuantity <= 0} onClick={() => { const previousTotal = resultingQuantity <= minimum ? 0 : minimum + Math.max(0, Math.ceil((resultingQuantity - minimum) / multiple) - 1) * multiple; const next = previousTotal - alreadyOrdered; onQuantityChange(product.id, next < minimumAddition ? '' : String(next)); }} style={{ width: 32, height: 36, border: '1px solid #cfdddd', borderRadius: 8, background: '#f0f7f3', color: '#1d6048' }}><Minus size={14} /></button>
                    <input type="text" inputMode="numeric" autoComplete="off" maxLength={16} dir="ltr" value={rawQuantity} disabled={remainingToAdd < minimumAddition} aria-label={`كمية ${product.name}`} onChange={(event) => { const value = normalizeLocalizedDecimalInput(event.currentTarget.value); if (value === '' || /^\d+$/.test(value)) onQuantityChange(product.id, value); }} style={{ width: 78, padding: '9px 8px', border: '1px solid #cfdddd', borderRadius: 9, background: available <= 0 ? '#f2f5f5' : '#fff', color: '#18383c', textAlign: 'center' }} />
                    <button type="button" aria-label={`زيادة كمية ${product.name}`} disabled={remainingToAdd < minimumAddition || nextIncrease > remainingToAdd} onClick={() => onQuantityChange(product.id, String(nextIncrease))} style={{ width: 32, height: 36, border: '1px solid #cfdddd', borderRadius: 8, background: '#f0f7f3', color: '#1d6048' }}><Plus size={14} /></button>
                  </div>
                </td>
              </tr>;
            })}</tbody>
          </table>
        </div>}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12, marginTop: 16 }}>
        <span style={{ color: '#687e82', fontSize: 12 }}>{selectedCount} أصناف محددة ضمن النتائج الحالية</span>
        <button className="sf-btn-primary" onClick={onAddSelected} disabled={selectedCount === 0}><ClipboardList size={16} /> إضافة المحدد إلى السلة</button>
      </div>
    </section>
  );
}
