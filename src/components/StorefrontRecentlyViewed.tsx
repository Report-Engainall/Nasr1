import { useEffect, useMemo, useState } from 'react';
import { Clock3, Package, Trash2 } from 'lucide-react';
import { StorefrontPricePresentation } from '@/components/StorefrontPricePresentation';
import { useAuth } from '@/lib/auth';
import {
  canRecordRecentlyViewedProducts,
  clearRecentlyViewedProducts,
  readRecentlyViewedProducts,
  removeRecentlyViewedProduct,
  type RecentlyViewedProduct,
} from '@/lib/recently-viewed-products';
import { resolveRecentlyViewedProducts } from '@/lib/recently-viewed-presentation';
import type { ProductWithInventory } from '@/lib/types';

type Props = {
  products: ProductWithInventory[];
  currentProductId: string;
  priceVisibilityPolicy: unknown;
  onOpen: (product: ProductWithInventory) => void;
};

/**
 * Shows only identity-scoped history IDs resolved against the current, role-safe
 * catalogue response. Cached names, images, prices and stock are never rendered.
 */
export function StorefrontRecentlyViewed({ products, currentProductId, priceVisibilityPolicy, onOpen }: Props) {
  const { user, ready } = useAuth();
  const [entries, setEntries] = useState<RecentlyViewedProduct[]>([]);

  useEffect(() => {
    const profileId = user?.profileId;
    if (
      typeof window === 'undefined'
      || typeof profileId !== 'string'
      || !profileId.trim()
      || !canRecordRecentlyViewedProducts({
        authReady: ready,
        profileId,
        isStaff: user?.isStaff,
        roles: user?.roles,
      })
    ) {
      setEntries([]);
      return;
    }
    setEntries(readRecentlyViewedProducts(window.localStorage, profileId));
  }, [ready, user?.profileId, user?.isStaff, user?.roles, currentProductId]);

  const visibleProducts = useMemo(
    () => resolveRecentlyViewedProducts(entries, products, currentProductId),
    [entries, products, currentProductId],
  );

  if (!visibleProducts.length) return null;

  const removeProduct = (productId: string) => {
    if (!user?.profileId || typeof window === 'undefined') return;
    removeRecentlyViewedProduct(window.localStorage, user.profileId, productId);
    setEntries(readRecentlyViewedProducts(window.localStorage, user.profileId));
  };

  const clearHistory = () => {
    if (!user?.profileId || typeof window === 'undefined') return;
    clearRecentlyViewedProducts(window.localStorage, user.profileId);
    setEntries([]);
  };

  return (
    <section className="sf-collection" aria-labelledby="sf-recently-viewed-title" style={{ marginTop: 24 }}>
      <div className="sf-products-head">
        <div>
          <h2 id="sf-recently-viewed-title"><Clock3 size={19} aria-hidden="true" /> شاهدتها مؤخراً</h2>
          <span>{visibleProducts.length} منتجات من سجل التصفح الخاص بحسابك</span>
        </div>
        <button type="button" className="sf-btn-secondary" onClick={clearHistory}>
          <Trash2 size={15} aria-hidden="true" /> مسح السجل
        </button>
      </div>
      <div className="sf-product-grid">
        {visibleProducts.map((product) => (
          <article className="sf-product-card" key={product.id}>
            <button
              type="button"
              className="sf-product-img"
              aria-label={`عرض تفاصيل ${product.name}`}
              onClick={() => onOpen(product)}
            >
              {product.image_url
                ? <img src={product.image_url} alt="" loading="lazy" decoding="async" />
                : <Package size={34} aria-hidden="true" />}
            </button>
            <div className="sf-product-body">
              <button type="button" className="sf-product-open" onClick={() => onOpen(product)}>
                <h3>{product.name}</h3>
                <p>{product.category?.name ?? 'غير مصنف'} · {product.item_code}</p>
                <small className="sf-product-unit">الوحدة: {product.unit}</small>
                <StorefrontPricePresentation
                  policyValue={priceVisibilityPolicy}
                  serverUnitPrice={product.display_price}
                  className="sf-product-price"
                  unitLabel={product.unit}
                />
              </button>
              <button
                type="button"
                className="sf-btn-secondary"
                aria-label={`إزالة ${product.name} من سجل المشاهدة`}
                onClick={() => removeProduct(product.id)}
              >
                إزالة من السجل
              </button>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
