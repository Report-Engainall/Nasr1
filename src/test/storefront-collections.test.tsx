import { cleanup, render, screen } from "@testing-library/react";
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
