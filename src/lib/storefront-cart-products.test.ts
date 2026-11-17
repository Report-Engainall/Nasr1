import { describe, expect, it } from 'vitest';
import { parseStorefrontCartProductDetails } from './storefront-cart-products';

const firstId = 'a1000000-0000-4000-8000-000000000001';
const secondId = 'a1000000-0000-4000-8000-000000000002';

function product(id: string, name: string) {
  return {
    id,
    category_id: null,
    brand_id: null,
    name,
    name_en: null,
    item_code: 'ITEM-' + id.slice(-3),
    sku: null,
    barcode: null,
    unit: 'كيس',
    description: null,
    image_url: null,
    is_active: true,
    is_featured: false,
    sort_order: 0,
    min_order_quantity: 2,
    order_quantity_multiple: 2,
    status: 'active',
    created_at: '2026-11-17T00:00:00Z',
    display_price: null,
    inventory: { product_id: id, quantity_available: 12 },
  };
}

describe('parseStorefrontCartProductDetails', () => {
  it('restores exact requested products without requiring a full catalogue page or prices', () => {
    const result = parseStorefrontCartProductDetails({
      items: [product(firstId, 'أرز بسمتي'), product(secondId, 'سكر')],
    }, [firstId, secondId]);

    expect(result.map((item) => item.id)).toEqual([firstId, secondId]);
    expect(result[0].name).toBe('أرز بسمتي');
    expect(result[0].min_order_quantity).toBe(2);
    expect(result[0].order_quantity_multiple).toBe(2);
    expect(result[0].inventory?.quantity_available).toBe(12);
    expect(result[0]).not.toHaveProperty('display_price');
  });

  it('leaves inactive or removed items for explicit cart removal', () => {
    expect(parseStorefrontCartProductDetails({ items: [product(firstId, 'أرز بسمتي')] }, [firstId, secondId]))
      .toHaveLength(1);
  });

  it('rejects products outside the cart and duplicate response rows', () => {
    expect(() => parseStorefrontCartProductDetails({ items: [product(secondId, 'سكر')] }, [firstId]))
      .toThrow(/خارج السلة/);
    expect(() => parseStorefrontCartProductDetails({
      items: [product(firstId, 'أرز'), product(firstId, 'أرز')],
    }, [firstId])).toThrow(/مكرر/);
  });

  it('rejects malformed request IDs, payloads and product rows', () => {
    expect(() => parseStorefrontCartProductDetails({ items: [] }, ['not-a-uuid'])).toThrow(/معرّفات/);
    expect(() => parseStorefrontCartProductDetails({ products: [] }, [firstId])).toThrow(/غير صالحة/);
    expect(() => parseStorefrontCartProductDetails({ items: [{ id: firstId }] }, [firstId])).toThrow();
  });
});
