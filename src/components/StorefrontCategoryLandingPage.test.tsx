// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import type { AnchorHTMLAttributes } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import type { Category } from "@/lib/types";
import { storefrontCategorySlug } from "@/lib/storefront-slugs";
import { StorefrontCategoryLandingPage } from "./StorefrontCategoryLandingPage";

const mocks = vi.hoisted(() => ({
  categories: [] as Array<Record<string, unknown>>,
  refetch: vi.fn(),
}));

vi.mock("@tanstack/react-router", () => ({
  Link: ({ to, children, ...props }: AnchorHTMLAttributes<HTMLAnchorElement> & { to: unknown }) => (
    <a href={String(to)} {...props}>{children}</a>
  ),
}));

vi.mock("@/components/Storefront", () => ({
  Storefront: ({ initialCategoryId }: { initialCategoryId: string }) => (
    <div data-testid="category-products" data-category-id={initialCategoryId} />
  ),
}));

vi.mock("@/lib/api", () => ({ fetchCategories: vi.fn() }));

vi.mock("@/lib/useFetch", () => ({
  useFetch: () => ({
    data: mocks.categories,
    loading: false,
    error: null,
    refetch: mocks.refetch,
  }),
}));

function category(id: string, name: string, parentId: string | null): Category {
  return {
    id,
    name,
    name_en: null,
    code: null,
    parent_id: parentId,
    sort_order: 10,
    is_active: true,
    icon: null,
  };
}

const parent = category("food-parent", "المواد الغذائية", null);
const rice = category("rice-child", "الأرز", parent.id);
const flour = category("flour-child", "الدقيق", parent.id);
const oil = category("oil-child", "الزيت", parent.id);
const otherParent = category("cleaning-parent", "المنظفات", null);
const soap = category("soap-child", "الصابون", otherParent.id);

beforeEach(() => {
  mocks.categories = [parent, rice, flour, oil, otherParent, soap] as unknown as Array<Record<string, unknown>>;
  mocks.refetch.mockClear();
});

afterEach(() => cleanup());

describe("storefront category context navigation", () => {
  it("shows the parent breadcrumb, current child and sibling links on a subcategory page", () => {
    render(
      <StorefrontCategoryLandingPage
        categorySlug={storefrontCategorySlug(parent)}
        subcategorySlug={storefrontCategorySlug(rice)}
      />,
    );

    const breadcrumbs = screen.getByRole("navigation", { name: "مسار التصنيف" });
    expect(within(breadcrumbs).getByRole("link", { name: "جميع التصنيفات" })).toHaveAttribute("href", "/categories");
    expect(within(breadcrumbs).getByRole("link", { name: "المواد الغذائية" }))
      .toHaveAttribute("href", "/category/" + storefrontCategorySlug(parent));
    expect(within(breadcrumbs).getByText("الأرز")).toHaveAttribute("aria-current", "page");

    const siblings = screen.getByRole("region", { name: "التصنيفات الشقيقة" });
    expect(within(siblings).getByRole("link", { name: /الأرز/ })).toHaveAttribute("aria-current", "page");
    expect(within(siblings).getByRole("link", { name: /الدقيق/ }))
      .toHaveAttribute("href", "/category/" + storefrontCategorySlug(parent) + "/subcategory/" + storefrontCategorySlug(flour));
    expect(within(siblings).getByRole("link", { name: /الزيت/ })).toBeInTheDocument();
    expect(within(siblings).queryByRole("link", { name: /الصابون/ })).toBeNull();
    expect(screen.getByTestId("category-products")).toHaveAttribute("data-category-id", rice.id);
  });

  it("shows direct child categories on the parent page without mixing another branch", () => {
    render(<StorefrontCategoryLandingPage categorySlug={storefrontCategorySlug(parent)} />);

    const children = screen.getByRole("region", { name: "التصنيفات الفرعية" });
    expect(within(children).getByRole("link", { name: /الأرز/ })).toBeInTheDocument();
    expect(within(children).getByRole("link", { name: /الدقيق/ })).toBeInTheDocument();
    expect(within(children).getByRole("link", { name: /الزيت/ })).toBeInTheDocument();
    expect(within(children).queryByRole("link", { name: /الصابون/ })).toBeNull();
    expect(screen.getByTestId("category-products")).toHaveAttribute("data-category-id", parent.id);
  });

  it("rejects a child slug that belongs to a different parent", () => {
    render(
      <StorefrontCategoryLandingPage
        categorySlug={storefrontCategorySlug(parent)}
        subcategorySlug={storefrontCategorySlug(soap)}
      />,
    );

    expect(screen.getByText("التصنيف غير موجود")).toBeInTheDocument();
    expect(screen.queryByTestId("category-products")).toBeNull();
  });
});
