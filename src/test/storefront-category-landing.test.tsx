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
  it("announces category loading while the category service is still pending", () => {
    mocks.fetchCategories.mockReturnValue(new Promise(() => {}));

    render(<StorefrontCategoryLandingPage categorySlug={CATEGORY_SLUG} />);

    expect(screen.getByRole("status")).toHaveTextContent("جار التحقق من التصنيف وتحميل الأصناف المنشورة");
    expect(screen.queryByTestId("category-storefront")).not.toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("renders a valid subcategory only under its actual active parent", async () => {
    const child = {
      id: "22222222-2222-4222-8222-222222222222",
      name: "معلبات",
      name_en: null,
      parent_id: CATEGORY.id,
      is_active: true,
    };
    const childSlug = storefrontCategorySlug({ id: child.id, name: child.name, name_en: child.name_en });
    mocks.fetchCategories.mockResolvedValueOnce([CATEGORY, child]);

    render(<StorefrontCategoryLandingPage categorySlug={CATEGORY_SLUG} subcategorySlug={childSlug} />);

    expect(await screen.findByRole("heading", { name: "معلبات" })).toBeInTheDocument();
    expect(screen.getByTestId("category-storefront")).toHaveAttribute("data-category-id", child.id);
    expect(screen.getByText("مواد غذائية / تصنيف فرعي")).toBeInTheDocument();
    expect(mocks.fetchProducts).not.toHaveBeenCalled();
  });

  it("rejects a subcategory whose parent does not match the route", async () => {
    const otherParent = {
      id: "33333333-3333-4333-8333-333333333333",
      name: "مستلزمات منزلية",
      name_en: null,
      parent_id: null,
      is_active: true,
    };
    const mismatchedChild = {
      id: "44444444-4444-4444-8444-444444444444",
      name: "صنف فرعي غير مطابق",
      name_en: null,
      parent_id: otherParent.id,
      is_active: true,
    };
    const childSlug = storefrontCategorySlug({
      id: mismatchedChild.id,
      name: mismatchedChild.name,
      name_en: mismatchedChild.name_en,
    });
    mocks.fetchCategories.mockResolvedValueOnce([CATEGORY, otherParent, mismatchedChild]);

    render(<StorefrontCategoryLandingPage categorySlug={CATEGORY_SLUG} subcategorySlug={childSlug} />);

    expect(await screen.findByText("التصنيف غير موجود")).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("التصنيف غير موجود");
    expect(screen.getByRole("link", { name: "العودة إلى التصنيفات" })).toHaveAttribute("href", "/categories");
    expect(screen.queryByTestId("category-storefront")).not.toBeInTheDocument();
    expect(mocks.fetchProducts).not.toHaveBeenCalled();
  });

});
