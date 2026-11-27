import { Package, Trash2 } from "lucide-react";

export type StorefrontCartRestoreFailureItem = {
  productId: string;
  quantity: number;
};

export type StorefrontCartRestoreFailureProps = {
  error: string;
  items: StorefrontCartRestoreFailureItem[];
  onRetry: () => void;
  onRemove: (productId: string) => void;
};

/**
 * Keeps a customer's local cart recoverable when the current catalogue RPC fails.
 * The fallback deliberately exposes no price, stock or ordering controls.
 */
export function StorefrontCartRestoreFailure({
  error,
  items,
  onRetry,
  onRemove,
}: StorefrontCartRestoreFailureProps) {
  return (
    <section aria-labelledby="cart-restore-failure-title">
      <div className="sf-empty" role="alert">
        <strong id="cart-restore-failure-title">تعذر استعادة تفاصيل أصناف السلة</strong>
        <p>{error}</p>
        <p>
          السلة المحفوظة لم تُحذف. يمكنك مراجعة البنود المحلية أو حذف صنف منها،
          لكن لن يمكن تعديل الكميات أو إتمام الطلب قبل استعادة بيانات الكتالوج والتحقق منها.
        </p>
        <button type="button" className="sf-btn-secondary" onClick={onRetry}>
          إعادة محاولة استعادة التفاصيل
        </button>
      </div>

      {items.length > 0 && (
        <div className="sf-cart-list" role="group" aria-label="الأصناف المحفوظة محليًا">
          {items.map((item) => {
            const shortId = item.productId.slice(0, 8);
            return (
              <div className="sf-cart-row" key={item.productId}>
                <div className="sf-cart-info">
                  <div className="sf-cart-img"><Package size={20} aria-hidden="true" /></div>
                  <div>
                    <strong>صنف محفوظ — لم يتم التحقق من بياناته</strong>
                    <span>معرّف الصنف: <bdi>{shortId}</bdi></span>
                    <small>الكمية المحفوظة: <bdi>{item.quantity}</bdi></small>
                  </div>
                </div>
                <button
                  type="button"
                  className="sf-cart-remove"
                  aria-label={`حذف الصنف ${shortId} من السلة`}
                  onClick={() => onRemove(item.productId)}
                >
                  <Trash2 size={16} aria-hidden="true" />
                </button>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
