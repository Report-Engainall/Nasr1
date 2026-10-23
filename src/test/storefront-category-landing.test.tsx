import type { ReactNode } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { storefrontCategorySlug } from "@/lib/storefront-slugs";

const mocks = vi.hoisted(() => ({
  fetchCategories: vi.fn(),
  fetchProducts: vi.fn(),
}));

vi.mock("@/lib/api", () => ({
  fetchCategories: mocks.fetchCategories,
  fetchProducts: mocks.fetchProducts,
}));

vi.mock("@/components/Storefront", () => ({
  Storefront: ({ initialCategoryId }: { initialCategoryId: string }) => (
    <div data-testid="category-storefront" data-category-id={initialCategoryId}>كتالوج التصنيف</div>
  ),
}));

vi.mock("@tanstack/react-router", () => ({
  Link: ({ to, children, ...rest }: { to: unknown; children: ReactNode; [key: string]: unknown }) => (
    <a href={typeof to === "string" ? to : "/"} {...rest}>{children}</a>
  ),
}));

import { StorefrontCategoryLandingPage } from "@/components/StorefrontCategoryLandingPage";

const CATEGORY = {
  id: "11111111-1111-4111-8111-111111111111",
  name: "مواد غذائية",
  name_en: null,
  parent_id: null,
  is_active: true,
};
const CATEGORY_SLUG = storefrontCategorySlug({
  id: CATEGORY.id,
  name: CATEGORY.name,
  name_en: CATEGORY.name_en,
});

describe("storefront category landing", () => {
  beforeEach(() => {
    mocks.fetchCategories.mockReset().mockResolvedValue([CATEGORY]);
    mocks.fetchProducts.mockReset().mockResolvedValue([]);
  });

  afterEach(() => {
    cleanup();
  });

  it("resolves the canonical category and delegates product loading to the paged Storefront", async () => {
    render(<StorefrontCategoryLandingPage categorySlug={CATEGORY_SLUG} />);

    expect(await screen.findByRole("heading", { name: "مواد غذائية" })).toBeInTheDocument();
    expect(screen.getByText("تُحمّل الأصناف المنشورة لهذا التصنيف من الكتالوج المرقّم.")).toBeInTheDocument();
    expect(screen.getByTestId("category-storefront")).toHaveAttribute("data-category-id", CATEGORY.id);
    // The category shell does not download the entire product list just to validate/count a category.
    expect(mocks.fetchProducts).not.toHaveBeenCalled();
    expect(mocks.fetchCategories).toHaveBeenCalledTimes(1);
  });

  it("keeps a category lookup failure visible and retries the existing category service", async () => {
    mocks.fetchCategories
      .mockRejectedValueOnce(new Error("تعذر تحميل التصنيفات"))
      .mockResolvedValueOnce([CATEGORY]);

    render(<StorefrontCategoryLandingPage categorySlug={CATEGORY_SLUG} />);

    expect(await screen.findByText("تعذر تحميل التصنيفات")).toBeInTheDocument();
    expect(screen.queryByTestId("category-storefront")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "إعادة المحاولة" }));

    expect(await screen.findByRole("heading", { name: "مواد غذائية" })).toBeInTheDocument();
    expect(screen.getByTestId("category-storefront")).toHaveAttribute("data-category-id", CATEGORY.id);
    expect(mocks.fetchProducts).not.toHaveBeenCalled();
    expect(mocks.fetchCategories).toHaveBeenCalledTimes(2);
  });
});
