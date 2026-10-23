import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  fetchCategories: vi.fn(),
  fetchProducts: vi.fn(),
  fetchCatalogPage: vi.fn(),
}));

vi.mock("@/lib/api", () => ({
  fetchCategories: mocks.fetchCategories,
  fetchProducts: mocks.fetchProducts,
}));

vi.mock("@/lib/storefront-catalog", () => ({
  fetchStorefrontCatalogPage: mocks.fetchCatalogPage,
}));

vi.mock("@/components/Storefront", () => ({
  Storefront: ({ initialCategoryId }: { initialCategoryId: string }) => (
    <div data-testid="category-storefront" data-category-id={initialCategoryId}>كتالوج التصنيف</div>
  ),
}));

vi.mock("@tanstack/react-router", () => ({
  Link: ({ to, children, ...rest }: { to: unknown; children: React.ReactNode; [key: string]: unknown }) => (
    <a href={typeof to === "string" ? to : "/"} {...rest}>{children}</a>
  ),
}));

import { StorefrontCategoryLandingPage } from "@/components/StorefrontCategoryLandingPage";

const CATEGORY = {
  id: "11111111-1111-4111-8111-111111111111",
  name: "مواد غذائية",
  slug: "food",
  parent_id: null,
  is_active: true,
};

function categoryPage(totalCount: number) {
  return {
    items: [],
    page: 1,
    pageSize: 1,
    totalCount,
    hasNextPage: totalCount > 1,
  };
}

describe("storefront category landing catalog counts", () => {
  beforeEach(() => {
    mocks.fetchCategories.mockReset().mockResolvedValue([CATEGORY]);
    mocks.fetchProducts.mockReset().mockResolvedValue([]);
    mocks.fetchCatalogPage.mockReset().mockResolvedValue(categoryPage(37));
  });

  afterEach(() => {
    cleanup();
  });

  it("uses the existing paged server catalog count instead of fetching every product", async () => {
    render(<StorefrontCategoryLandingPage categorySlug="food" />);

    expect(await screen.findByText(/37 صنف منشور يطابق هذا التصنيف/)).toBeInTheDocument();
    expect(mocks.fetchCatalogPage).toHaveBeenCalledWith({
      search: "",
      categoryId: CATEGORY.id,
      page: 1,
      pageSize: 1,
      availableOnly: false,
    });
    expect(mocks.fetchProducts).not.toHaveBeenCalled();
    expect(screen.getByTestId("category-storefront")).toHaveAttribute("data-category-id", CATEGORY.id);
  });

  it("keeps the category in a loading/error state when the count RPC fails and retries it", async () => {
    mocks.fetchCatalogPage
      .mockRejectedValueOnce(new Error("تعذر تحميل عدد أصناف التصنيف"))
      .mockResolvedValueOnce(categoryPage(12));

    render(<StorefrontCategoryLandingPage categorySlug="food" />);

    expect(await screen.findByText("تعذر تحميل عدد أصناف التصنيف")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "إعادة المحاولة" })).toBeInTheDocument();
    expect(screen.queryByTestId("category-storefront")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "إعادة المحاولة" }));
    expect(await screen.findByText(/12 صنف منشور يطابق هذا التصنيف/)).toBeInTheDocument();
    expect(mocks.fetchProducts).not.toHaveBeenCalled();
    await waitFor(() => expect(mocks.fetchCatalogPage).toHaveBeenCalledTimes(2));
  });
});
