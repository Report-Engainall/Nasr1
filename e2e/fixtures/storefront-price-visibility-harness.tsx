import { useState } from "react";
import { createRoot } from "react-dom/client";
import { ProductDetail, ProductGrid } from "../../src/components/Storefront";
import type { ProductWithInventory } from "../../src/lib/types";

const serverPrice = 43210;
const sourceProduct = {
  id: "a1000000-0000-0000-0000-000000000011",
  name: "صنف اختبار سياسة إظهار السعر",
  item_code: "PRICE-POLICY-CI-011",
  unit: "كرتون",
  description: "عنصر اختبار داخل متصفح CI فقط.",
  image_url: null,
  display_price: serverPrice,
  category: { name: "اختبارات القبول" },
  inventory: { quantity_available: 7 },
} as unknown as ProductWithInventory;

const noop = () => undefined;

function StorefrontPricePolicyHarness() {
  const [policy, setPolicy] = useState<unknown>(false);
  const [amount, setAmount] = useState(serverPrice);
  const product = { ...sourceProduct, display_price: amount };

  return (
    <main>
      <h1 data-testid="fixture-ready">اختبار إظهار وإخفاء سعر المنتج</h1>
      <div aria-label="أدوات اختبار سياسة السعر">
        <button data-testid="policy-enable" type="button" onClick={() => setPolicy(true)}>إظهار الأسعار</button>
        <button data-testid="policy-disable" type="button" onClick={() => setPolicy(false)}>إخفاء الأسعار</button>
        <button data-testid="policy-malformed" type="button" onClick={() => setPolicy("true")}>سياسة غير صالحة</button>
        <button data-testid="price-zero" type="button" onClick={() => setAmount(0)}>جعل السعر صفرًا</button>
        <button data-testid="price-restore" type="button" onClick={() => setAmount(serverPrice)}>استعادة السعر الأصلي</button>
      </div>
      <section aria-label="بطاقة المنتج">
        <ProductGrid
          products={[product]}
          priceVisibilityPolicy={policy}
          wishlist={[]}
          compare={[]}
          emptyTitle="لا توجد منتجات"
          emptyDescription=""
          onOpen={noop}
          onAdd={noop}
          onWishlist={noop}
          onCompare={noop}
        />
      </section>
      <section aria-label="تفاصيل المنتج">
        <ProductDetail
          product={product}
          priceVisibilityPolicy={policy}
          inWishlist={false}
          inCompare={false}
          onBack={noop}
          onAdd={noop}
          onWishlist={noop}
          onCompare={noop}
        />
      </section>
    </main>
  );
}

createRoot(document.getElementById("root")!).render(<StorefrontPricePolicyHarness />);
