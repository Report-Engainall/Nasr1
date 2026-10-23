import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { AnchorHTMLAttributes, ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  fetchProducts: vi.fn(),
  fetchStorefrontPromotions: vi.fn(),
  useFetch: vi.fn(),
  productResult: null as null | { data: unknown; loading: boolean; error: string | null; refetch: () => void },
  promotionResult: null as null | { data: unknown; loading: boolean; error: string | null; refetch: () => void },
}));

vi.mock("@/lib/api", () => ({
  fetchProducts: mocks.fetchProducts,
  fetchStorefrontPromotions: mocks.fetchStorefrontPromotions,
}));

vi.mock("@/lib/useFetch", () => ({ useFetch: mocks.useFetch }));

vi.mock("@tanstack/react-router", () => ({
  Link: ({ to, children, ...props }: { to: string; children?: ReactNode } & AnchorHTMLAttributes<HTMLAnchorElement>) =>
    <a href={to} {...props}>{children}</a>,
}));

import { StorefrontOffersPage } from "@/components/StorefrontOffersPage";

function setResults(products: unknown[], promotions: unknown[]) {
  mocks.productResult = { data: products, loading: false, error: null, refetch: vi.fn() };
  mocks.promotionResult = { data: promotions, loading: false, error: null, refetch: vi.fn() };
  mocks.useFetch.mockImplementation((fetcher: unknown) =>
    fetcher === mocks.fetchStorefrontPromotions ? mocks.promotionResult : mocks.productResult,
  );
}

const activePromotion = {
  id: "campaign-active",
  title: "حملة الربيع",
  description: "حملة منشورة للاختبار",
  discount_type: "percentage",
  discount_value: 10,
  product_ids: ["product-active", "product-inactive-flag", "product-inactive-status"],
  category_ids: [],
  start_date: "2026-10-01",
  end_date: "2026-10-31",
  is_active: true,
  created_at: "2026-10-01T00:00:00Z",
};

describe("published storefront offer product scope", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => cleanup());

  it("shows active target products but never lists explicitly inactive products", () => {
    setResults([
      { id: "product-active", name: "أرز منشور", item_code: "SKU-ACTIVE", category_id: null, is_active: true, status: "active" },
      { id: "product-inactive-flag", name: "أرز معطل", item_code: "SKU-OFF-FLAG", category_id: null, is_active: false, status: "active" },
      { id: "product-inactive-status", name: "سكر غير منشور", item_code: "SKU-OFF-STATUS", category_id: null, is_active: true, status: "inactive" },
    ], [activePromotion]);

    render(<StorefrontOffersPage />);

    expect(screen.getByText("أرز منشور · SKU-ACTIVE")).toBeInTheDocument();
    expect(screen.queryByText("أرز معطل · SKU-OFF-FLAG")).toBeNull();
    expect(screen.queryByText("سكر غير منشور · SKU-OFF-STATUS")).toBeNull();
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("reports targeted campaign products as unavailable when only inactive products match", () => {
    const categoryPromotion = {
      ...activePromotion,
      id: "campaign-category",
      product_ids: [],
      category_ids: ["category-unpublished"],
    };
    setResults([
      { id: "product-inactive-category", name: "زيت غير منشور", item_code: "SKU-OFF-CAT", category_id: "category-unpublished", is_active: false, status: "active" },
      { id: "product-inactive-status", name: "فاصوليا غير منشورة", item_code: "SKU-OFF-STATUS", category_id: "category-unpublished", is_active: true, status: "inactive" },
    ], [categoryPromotion]);

    render(<StorefrontOffersPage />);

    expect(screen.getByRole("status")).toHaveTextContent("نطاق الحملة موجود لكن أصنافه غير متاحة ضمن الكتالوج المنشور للحساب الحالي.");
    expect(screen.queryByText("زيت غير منشور · SKU-OFF-CAT")).toBeNull();
    expect(screen.queryByText("فاصوليا غير منشورة · SKU-OFF-STATUS")).toBeNull();
  });
  it("reports both failed sources and retries promotions and catalog together", () => {
    const refetchPromotions = vi.fn();
    const refetchProducts = vi.fn();
    mocks.promotionResult = {
      data: [],
      loading: false,
      error: "تعذر جلب الحملات",
      refetch: refetchPromotions,
    };
    mocks.productResult = {
      data: [],
      loading: false,
      error: "تعذر جلب المنتجات",
      refetch: refetchProducts,
    };
    mocks.useFetch.mockImplementation((fetcher: unknown) =>
      fetcher === mocks.fetchStorefrontPromotions ? mocks.promotionResult : mocks.productResult,
    );

    render(<StorefrontOffersPage />);

    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent("تعذر تحميل العروض والكتالوج");
    expect(alert).toHaveTextContent("العروض: تعذر جلب الحملات");
    expect(alert).toHaveTextContent("الكتالوج: تعذر جلب المنتجات");

    fireEvent.click(screen.getByRole("button", { name: "إعادة المحاولة" }));
    expect(refetchPromotions).toHaveBeenCalledTimes(1);
    expect(refetchProducts).toHaveBeenCalledTimes(1);
  });

  it("identifies a catalog-only failure without blaming promotions", () => {
    mocks.promotionResult = {
      data: [],
      loading: false,
      error: null,
      refetch: vi.fn(),
    };
    mocks.productResult = {
      data: [],
      loading: false,
      error: "كتالوج الاختبار غير متاح",
      refetch: vi.fn(),
    };
    mocks.useFetch.mockImplementation((fetcher: unknown) =>
      fetcher === mocks.fetchStorefrontPromotions ? mocks.promotionResult : mocks.productResult,
    );

    render(<StorefrontOffersPage />);

    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent("تعذر تحميل كتالوج المنتجات");
    expect(alert).toHaveTextContent("الكتالوج: كتالوج الاختبار غير متاح");
    expect(alert).not.toHaveTextContent("تعذر تحميل العروض");
  });

});
