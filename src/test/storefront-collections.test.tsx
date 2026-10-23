import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { AnchorHTMLAttributes, ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  fetchCategories: vi.fn(),
  fetchProducts: vi.fn(),
  useFetch: vi.fn(),
  categoryResult: null as null | { data: unknown; loading: boolean; error: string | null; refetch: () => void },
  productResult: null as null | { data: unknown; loading: boolean; error: string | null; refetch: () => void },
}));

vi.mock("@/lib/api", () => ({
  fetchCategories: mocks.fetchCategories,
  fetchProducts: mocks.fetchProducts,
}));

vi.mock("@/lib/useFetch", () => ({
  useFetch: mocks.useFetch,
}));

vi.mock("@tanstack/react-router", () => ({
  Link: ({ to, children, ...props }: { to: string; children?: ReactNode } & AnchorHTMLAttributes<HTMLAnchorElement>) =>
    <a href={to} {...props}>{children}</a>,
}));

import { StorefrontCollectionsPage } from "@/components/StorefrontCollectionsPage";

function setQueryResults(categoryError: string | null, productError: string | null) {
  mocks.categoryResult = {
    data: [],
    loading: false,
    error: categoryError,
    refetch: vi.fn(),
  };
  mocks.productResult = {
    data: [],
    loading: false,
    error: productError,
    refetch: vi.fn(),
  };
  mocks.useFetch.mockImplementation((fetcher: unknown) =>
    fetcher === mocks.fetchCategories ? mocks.categoryResult : mocks.productResult,
  );
}

describe("storefront category and catalog error states", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setQueryResults(null, null);
  });

  afterEach(() => {
    cleanup();
  });

  it("refetches both sources when the retry action is activated", () => {
    const categoryRefetch = vi.fn();
    const productRefetch = vi.fn();
    mocks.categoryResult = {
      data: [],
      loading: false,
      error: "تعذر جلب التصنيفات",
      refetch: categoryRefetch,
    };
    mocks.productResult = {
      data: [],
      loading: false,
      error: "تعذر جلب كتالوج المنتجات",
      refetch: productRefetch,
    };
    mocks.useFetch.mockImplementation((fetcher: unknown) =>
      fetcher === mocks.fetchCategories ? mocks.categoryResult : mocks.productResult,
    );

    render(<StorefrontCollectionsPage />);
    fireEvent.click(screen.getByRole("button", { name: "إعادة المحاولة" }));

    expect(categoryRefetch).toHaveBeenCalledTimes(1);
    expect(productRefetch).toHaveBeenCalledTimes(1);
  });

  it("excludes explicitly inactive products from published category counts", () => {
    mocks.categoryResult = {
      data: [{ id: "category-1", name: "الأرز", description: null, is_active: true }],
      loading: false,
      error: null,
      refetch: vi.fn(),
    };
    mocks.productResult = {
      data: [
        { id: "hidden-1", category_id: "category-1", is_active: false, status: "active" },
        { id: "hidden-2", category_id: "category-1", is_active: true, status: "inactive" },
      ],
      loading: false,
      error: null,
      refetch: vi.fn(),
    };
    mocks.useFetch.mockImplementation((fetcher: unknown) =>
      fetcher === mocks.fetchCategories ? mocks.categoryResult : mocks.productResult,
    );

    render(<StorefrontCollectionsPage />);

    expect(screen.getByText("لا توجد أصناف منشورة ضمن هذا التصنيف.")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "تصفح التصنيف" })).toBeNull();
  });

  it("identifies a product-catalog failure rather than blaming categories", () => {
    setQueryResults(null, "تعذر جلب كتالوج المنتجات");

    render(<StorefrontCollectionsPage />);

    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent("تعذر تحميل كتالوج المنتجات");
    expect(alert).toHaveTextContent("الكتالوج: تعذر جلب كتالوج المنتجات");
    expect(alert).not.toHaveTextContent("تعذر تحميل التصنيفات");
    expect(screen.getByRole("button", { name: "إعادة المحاولة" })).toBeInTheDocument();
  });

  it("identifies a category-query failure", () => {
    setQueryResults("تعذر جلب التصنيفات", null);

    render(<StorefrontCollectionsPage />);

    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent("تعذر تحميل التصنيفات");
    expect(alert).toHaveTextContent("التصنيفات: تعذر جلب التصنيفات");
    expect(alert).not.toHaveTextContent("تعذر تحميل كتالوج المنتجات");
  });

  it("reports both failed data sources without hiding either cause", () => {
    setQueryResults("تعذر جلب التصنيفات", "تعذر جلب كتالوج المنتجات");

    render(<StorefrontCollectionsPage />);

    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent("تعذر تحميل التصنيفات والكتالوج");
    expect(alert).toHaveTextContent("التصنيفات: تعذر جلب التصنيفات");
    expect(alert).toHaveTextContent("الكتالوج: تعذر جلب كتالوج المنتجات");
  });
});
