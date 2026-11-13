// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import type { AnchorHTMLAttributes } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import type { Category } from "@/lib/types";
import { storefrontCategorySlug } from "@/lib/storefront-slugs";
import { StorefrontCollectionsPage } from "./StorefrontCollectionsPage";

const mocks = vi.hoisted(() => ({
  fetchCategories: vi.fn(),
  fetchProducts: vi.fn(),
  categories: [] as Array<Record<string, unknown>>,
  products: [] as Array<Record<string, unknown>>,
  refetchCategories: vi.fn(),
  refetchProducts: vi.fn(),
}));

vi.mock("@tanstack/react-router", () => ({
  Link: ({ to, children, ...props }: AnchorHTMLAttributes<HTMLAnchorElement> & { to: unknown }) => (
    <a href={String(to)} {...props}>{children}</a>
  ),
}));

vi.mock("@/lib/api", () => ({
  fetchCategories: mocks.fetchCategories,
  fetchProducts: mocks.fetchProducts,
}));

vi.mock("@/lib/useFetch", () => ({
  useFetch: (fetcher: unknown) => fetcher === mocks.fetchCategories
    ? {
        data: mocks.categories,
        loading: false,
        error: null,
        refetch: mocks.refetchCategories,
      }
    : {
        data: mocks.products,
        loading: false,
        error: null,
        refetch: mocks.refetchProducts,
      },
}));

function category(id: string, name: string, parentId: string | null, isActive = true): Category {
  return {
    id,
    name,
    name_en: null,
    code: null,
    description: null,
    parent_id: parentId,
    sort_order: 10,
    is_active: isActive,
    icon: null,
  };
}

const food = category("food-root", "المواد الغذائية", null);
const rice = category("rice-child", "الأرز", food.id);
const flour = category("flour-child", "الدقيق", food.id);
const cleaning = category("cleaning-root", "المنظفات", null);
const soap = category("soap-child", "الصابون", cleaning.id);
const juice = category("juice-deep", "العصائر", rice.id);
const orphan = category("orphan-root", "تصنيف مستقل", "inactive-parent");
const inactive = category("inactive-category", "تصنيف مخفي", null, false);

beforeEach(() => {
  mocks.categories = [food, rice, flour, cleaning, soap, juice, orphan, inactive] as unknown as Array<Record<string, unknown>>;
  mocks.products = [
    { id: "food-product", category_id: food.id, is_active: true, status: "active" },
    { id: "rice-product-1", category_id: rice.id, is_active: true, status: "active" },
    { id: "rice-product-2", category_id: rice.id, is_active: true, status: "active" },
    { id: "rice-inactive-product", category_id: rice.id, is_active: false, status: "active" },
    { id: "flour-product", category_id: flour.id, is_active: true, status: "active" },
    { id: "soap-product", category_id: soap.id, is_active: true, status: "active" },
    { id: "inactive-status-product", category_id: rice.id, is_active: true, status: "inactive" },
    { id: "uncategorized-product", category_id: null, is_active: true, status: "active" },
  ];
  mocks.refetchCategories.mockClear();
  mocks.refetchProducts.mockClear();
});

afterEach(() => cleanup());

describe("StorefrontCollectionsPage hierarchy", () => {
  it("groups active direct children and displays accurate product counts without flat duplicates", () => {
    render(<StorefrontCollectionsPage />);

    const mainGroups = screen.getByRole("region", { name: "التصنيفات الرئيسية" });
    const foodBranches = screen.getByRole("region", { name: "الفروع التابعة لـ المواد الغذائية" });
    const cleaningBranches = screen.getByRole("region", { name: "الفروع التابعة لـ المنظفات" });

    expect(within(foodBranches).getByRole("link", { name: /الأرز/ }))
      .toHaveAttribute("href", "/category/" + storefrontCategorySlug(food) + "/subcategory/" + storefrontCategorySlug(rice));
    expect(within(foodBranches).getByRole("link", { name: /الدقيق/ })).toBeInTheDocument();
    expect(within(foodBranches).queryByRole("link", { name: /العصائر/ })).toBeNull();
    expect(within(cleaningBranches).getByRole("link", { name: /الصابون/ })).toBeInTheDocument();

    expect(within(mainGroups).getAllByRole("heading", { level: 2 }).map((heading) => heading.textContent))
      .toEqual(["المواد الغذائية", "المنظفات", "تصنيف مستقل"]);
    expect(within(mainGroups).queryByRole("heading", { name: "الأرز", exact: true })).toBeNull();
    expect(within(mainGroups).queryByRole("heading", { name: "تصنيف مخفي", exact: true })).toBeNull();

    const groupCount = (4).toLocaleString("ar-YE") + " صنف في التصنيف وفروعه";
    const riceCount = (2).toLocaleString("ar-YE") + " صنف";
    expect(screen.getByText(groupCount)).toBeInTheDocument();
    expect(within(foodBranches).getByText(riceCount)).toBeInTheDocument();
  });

  it("keeps deeper categories visible with their immediate parent path", () => {
    render(<StorefrontCollectionsPage />);

    const additional = screen.getByRole("region", { name: "تصنيفات بمستويات إضافية" });
    const deepCategoryCard = within(additional).getByText("العصائر").closest("article");

    expect(deepCategoryCard).not.toBeNull();
    expect(within(deepCategoryCard as HTMLElement).getByText("فرع ضمن الأرز")).toBeInTheDocument();
    expect(within(deepCategoryCard as HTMLElement).getByRole("link", { name: "تصفح هذا المستوى" }))
      .toHaveAttribute("href", "/category/" + storefrontCategorySlug(rice) + "/subcategory/" + storefrontCategorySlug(juice));
  });

  it("refreshes the existing category and product sources together", () => {
    render(<StorefrontCollectionsPage />);

    screen.getByRole("button", { name: /تحديث البيانات/ }).click();

    expect(mocks.refetchCategories).toHaveBeenCalledTimes(1);
    expect(mocks.refetchProducts).toHaveBeenCalledTimes(1);
  });
});
