import { describe, expect, it } from "vitest";
import type { Promotion } from "@/lib/types";
import { resolveActiveProductOffers } from "@/lib/storefront-product-offers";

const product = {
  id: "10000000-0000-4000-8000-000000000001",
  category_id: "20000000-0000-4000-8000-000000000002",
};

function campaign(overrides: Partial<Promotion> = {}): Promotion {
  return {
    id: "30000000-0000-4000-8000-000000000003",
    title: "عرض المنتجات الأساسية",
    description: "عرض منشور على أصناف محددة",
    discount_type: "percentage",
    discount_value: 15,
    product_ids: [product.id],
    category_ids: [],
    start_date: "2026-11-01",
    end_date: "2026-11-30",
    is_active: true,
    created_at: "2026-10-30T10:00:00.000Z",
    ...overrides,
  };
}

describe("storefront product offers", () => {
  it("matches campaigns explicitly assigned to the product", () => {
    expect(resolveActiveProductOffers([campaign()], product, "2026-11-20")).toEqual([{
      id: "30000000-0000-4000-8000-000000000003",
      title: "عرض المنتجات الأساسية",
      description: "عرض منشور على أصناف محددة",
      start_date: "2026-11-01",
      end_date: "2026-11-30",
    }]);
  });

  it("matches campaigns assigned to the product's category", () => {
    const categoryCampaign = campaign({ product_ids: [], category_ids: [product.category_id] });
    expect(resolveActiveProductOffers([categoryCampaign], product, "2026-11-20")).toHaveLength(1);
  });

  it("excludes inactive, expired, future, and unrelated campaigns", () => {
    const inactive = campaign({ id: "40000000-0000-4000-8000-000000000004", is_active: false });
    const expired = campaign({
      id: "50000000-0000-4000-8000-000000000005",
      start_date: "2026-10-01",
      end_date: "2026-11-19",
    });
    const future = campaign({
      id: "60000000-0000-4000-8000-000000000006",
      start_date: "2026-11-21",
      end_date: "2026-11-30",
    });
    const unrelated = campaign({
      id: "70000000-0000-4000-8000-000000000007",
      product_ids: [],
      category_ids: ["90000000-0000-4000-8000-000000000009"],
    });
    const untargeted = campaign({
      id: "80000000-0000-4000-8000-000000000008",
      product_ids: [],
      category_ids: [],
    });

    expect(resolveActiveProductOffers(
      [inactive, expired, future, unrelated, untargeted],
      product,
      "2026-11-20",
    )).toEqual([]);
  });

  it("fails closed for malformed date ranges and duplicate campaign IDs", () => {
    const invalidDate = campaign({
      id: "91000000-0000-4000-8000-000000000009",
      start_date: "2026-02-30",
    });
    const reversedDate = campaign({
      id: "92000000-0000-4000-8000-000000000009",
      start_date: "2026-11-30",
      end_date: "2026-11-01",
    });
    const duplicate = campaign({
      id: "30000000-0000-4000-8000-000000000003",
      title: "نسخة مكررة",
    });

    expect(resolveActiveProductOffers(
      [invalidDate, reversedDate, campaign(), duplicate],
      product,
      "2026-11-20",
    )).toEqual([{
      id: "30000000-0000-4000-8000-000000000003",
      title: "عرض المنتجات الأساسية",
      description: "عرض منشور على أصناف محددة",
      start_date: "2026-11-01",
      end_date: "2026-11-30",
    }]);
  });

  it("returns no pricing fields in the presentation model", () => {
    const [offer] = resolveActiveProductOffers([campaign()], product, "2026-11-20");
    expect(offer).toEqual({
      id: "30000000-0000-4000-8000-000000000003",
      title: "عرض المنتجات الأساسية",
      description: "عرض منشور على أصناف محددة",
      start_date: "2026-11-01",
      end_date: "2026-11-30",
    });
    expect(offer).not.toHaveProperty("discount_value");
    expect(offer).not.toHaveProperty("discount_type");
    expect(offer).not.toHaveProperty("organization_id");
  });

  it("handles missing payload and invalid product identity without throwing", () => {
    expect(resolveActiveProductOffers(null, product, "2026-11-20")).toEqual([]);
    expect(resolveActiveProductOffers(undefined, { id: "", category_id: null }, "2026-11-20")).toEqual([]);
    expect(resolveActiveProductOffers([campaign()], product, "not-a-date")).toEqual([]);
  });
});
