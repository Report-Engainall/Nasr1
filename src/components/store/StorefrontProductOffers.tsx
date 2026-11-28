import { useMemo } from "react";
import { CalendarDays, Gift, RefreshCw } from "lucide-react";
import type { Promotion } from "@/lib/types";
import {
  resolveActiveProductOffers,
  type StorefrontProductOffer,
} from "@/lib/storefront-product-offers";

function formatOfferDate(value: string): string {
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day, 12));
  return new Intl.DateTimeFormat("ar-YE", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
}

function OfferCard({ offer }: { offer: StorefrontProductOffer }) {
  return (
    <article
      style={{
        display: "grid",
        gap: 8,
        minWidth: 0,
        padding: 14,
        border: "1px solid #d9e8df",
        borderRadius: 12,
        background: "linear-gradient(135deg, #f8fcf9 0%, #ffffff 100%)",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8, color: "#176b43" }}>
        <Gift size={17} aria-hidden="true" />
        <strong style={{ color: "#244d3c", fontSize: 14 }}>{offer.title}</strong>
      </div>
      {offer.description ? (
        <p style={{ margin: 0, color: "#53675d", fontSize: 13, lineHeight: 1.8 }}>
          {offer.description}
        </p>
      ) : null}
      <p style={{ display: "flex", alignItems: "center", gap: 7, margin: 0, color: "#64766c", fontSize: 11 }}>
        <CalendarDays size={14} aria-hidden="true" />
        <span>ساري من {formatOfferDate(offer.start_date)} إلى {formatOfferDate(offer.end_date)}</span>
      </p>
    </article>
  );
}

export function StorefrontProductOffers({
  productId,
  categoryId,
  promotions,
  loading,
  error,
  onRetry,
}: {
  productId: string;
  categoryId: string | null;
  promotions: Promotion[] | null;
  loading: boolean;
  error: string | null;
  onRetry: () => void;
}) {
  const offers = useMemo(
    () => resolveActiveProductOffers(promotions, { id: productId, category_id: categoryId }),
    [promotions, productId, categoryId],
  );
  const hasResolvedPromotions = Array.isArray(promotions);

  return (
    <section
      aria-labelledby="sf-product-offers-title"
      style={{ display: "grid", gap: 12, marginTop: 20 }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
        <h3 id="sf-product-offers-title" style={{ display: "flex", alignItems: "center", gap: 8, margin: 0, color: "#294d3e", fontSize: 16 }}>
          <Gift size={18} aria-hidden="true" />
          العروض النشطة على هذا المنتج
        </h3>
      </div>

      {loading && !hasResolvedPromotions ? (
        <p role="status" style={{ margin: 0, color: "#66766d", fontSize: 13 }}>جار التحقق من العروض المنشورة...</p>
      ) : null}

      {error && !hasResolvedPromotions ? (
        <div role="alert" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap", padding: 12, border: "1px solid #ead6d2", borderRadius: 10 }}>
          <span style={{ color: "#8c3d35", fontSize: 13 }}>تعذر تحميل العروض المنشورة لهذا المنتج.</span>
          <button type="button" className="sf-btn-secondary" onClick={onRetry}>
            <RefreshCw size={14} aria-hidden="true" />
            إعادة المحاولة
          </button>
        </div>
      ) : null}

      {hasResolvedPromotions && offers.length > 0 ? (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 260px), 1fr))", gap: 10 }}>
          {offers.map((offer) => <OfferCard key={offer.id} offer={offer} />)}
        </div>
      ) : null}

      {hasResolvedPromotions && !loading && !error && offers.length === 0 ? (
        <p style={{ margin: 0, color: "#718078", fontSize: 13 }}>لا توجد عروض نشطة مرتبطة بهذا المنتج حالياً.</p>
      ) : null}

      {hasResolvedPromotions && error ? (
        <p role="status" style={{ margin: 0, color: "#8a6a38", fontSize: 11 }}>تعذر تحديث الحملات؛ المعروض هو آخر رد صالح استلمه المتجر.</p>
      ) : null}
    </section>
  );
}
