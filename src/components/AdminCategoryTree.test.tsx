// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { Category } from "@/lib/types";
import { AdminCategoryTree } from "./AdminCategoryTree";

const mocks = vi.hoisted(() => ({
  roles: ["admin"] as string[],
  fetchCategories: vi.fn(),
  fetchAdminProductsPage: vi.fn(),
  fetchAdminCategoryProducts: vi.fn(),
  createCategory: vi.fn(),
  archiveCategory: vi.fn(),
  renameCategory: vi.fn(),
  restoreCategory: vi.fn(),
  notice: vi.fn(),
  openProduct: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  useAuth: () => ({ user: { roles: mocks.roles } }),
}));
vi.mock("@/lib/api", () => ({
  fetchCategories: mocks.fetchCategories,
  fetchAdminProductsPage: mocks.fetchAdminProductsPage,
}));
vi.mock("@/lib/format", () => ({
  formatCurrency: (value: number) => String(value),
  formatNumber: (value: number) => String(value),
}));
vi.mock("@/lib/admin-catalog-commands", () => ({
  createAdminCatalogCategory: mocks.createCategory,
  archiveAdminCatalogCategory: mocks.archiveCategory,
  renameAdminCatalogCategory: mocks.renameCategory,
  restoreAdminCatalogCategory: mocks.restoreCategory,
}));
vi.mock("@/lib/admin-category-products", () => ({
  fetchAdminCategoryProducts: mocks.fetchAdminCategoryProducts,
}));
vi.mock("@/lib/admin-category-catalog", () => ({
  projectAdminCategoryCatalogMetrics: vi.fn(),
}));

const ROOT_ID = "11111111-1111-4111-8111-111111111111";
const CHILD_ID = "22222222-2222-4222-8222-222222222222";
const PRODUCT_ID = "33333333-3333-4333-8333-333333333333";

function category(id: string, name: string, parent_id: string | null): Category {
  return {
    id, name, name_en: null, code: null, parent_id, sort_order: 0,
    is_active: true, icon: null,
  };
}
const root = category(ROOT_ID, "التصنيف الرئيسي", null);
const child = category(CHILD_ID, "التصنيف الفرعي", ROOT_ID);

function renderTree() {
  return render(
    <AdminCategoryTree
      onNotice={mocks.notice}
      onOpenProduct={mocks.openProduct}
    />,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.roles = ["admin"];
  mocks.fetchCategories.mockResolvedValue([root]);
  mocks.fetchAdminProductsPage.mockResolvedValue({
    items: [], page: 1, pageSize: 40, hasNextPage: false,
  });
  mocks.fetchAdminCategoryProducts.mockResolvedValue([]);
  window.history.replaceState({}, "", "/admin/categories");
});

afterEach(() => cleanup());

describe("AdminCategoryTree", () => {
  it("creates a child through the existing server command with the selected parent_id and preserves a deep link", async () => {
    mocks.fetchCategories
      .mockResolvedValueOnce([root])
      .mockResolvedValueOnce([root, child]);
    mocks.createCategory.mockResolvedValueOnce({
      id: CHILD_ID, name: child.name, created: true,
    });

    renderTree();
    await screen.findByRole("heading", { name: root.name });
    fireEvent.click(screen.getByRole("button", { name: /إضافة فرع تحت هذا الأب/ }));

    const nameInput = screen.getByLabelText("اسم التصنيف");
    fireEvent.change(nameInput, { target: { value: child.name } });
    const createForm = nameInput.closest("form");
    expect(createForm).not.toBeNull();
    fireEvent.submit(createForm!);

    await waitFor(() => {
      expect(mocks.createCategory).toHaveBeenCalledWith(child.name, ROOT_ID, null);
    });
    await screen.findByRole("button", { name: new RegExp(child.name) });
    expect(new URLSearchParams(window.location.search).get("category")).toBe(CHILD_ID);
    expect(mocks.notice).toHaveBeenCalledWith("تم إنشاء التصنيف وحفظ علاقته بالأب");
  });

  it("shows the selected category identity, parent and hierarchical path", async () => {
    window.history.replaceState({}, "", "/admin/categories?category=" + CHILD_ID);
    mocks.fetchCategories.mockResolvedValueOnce([root, child]);

    renderTree();

    expect(await screen.findByRole("heading", { name: child.name })).toBeInTheDocument();
    expect(screen.getByText(new RegExp("المعرّف:"))).toBeInTheDocument();
    expect(screen.getByText(/التصنيف الرئيسي \/ التصنيف الفرعي/)).toBeInTheDocument();
    expect(screen.getByText("التصنيف الرئيسي", { selector: "strong" })).toBeInTheDocument();
  });

  it("refuses to archive an active parent while active children exist", async () => {
    mocks.fetchCategories.mockResolvedValueOnce([root, child]);
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);

    renderTree();
    await screen.findByRole("heading", { name: root.name });
    fireEvent.click(screen.getByRole("button", { name: "أرشفة التصنيف" }));

    expect(mocks.archiveCategory).not.toHaveBeenCalled();
    expect(confirm).not.toHaveBeenCalled();
    expect(mocks.notice).toHaveBeenCalledWith(
      expect.stringContaining("لا يمكن أرشفة تصنيف أب قبل معالجة فروعه النشطة"),
    );
  });

  it("offers a retry after a related-product read fails", async () => {
    mocks.fetchAdminCategoryProducts
      .mockRejectedValueOnce(new Error("تعذر الاتصال بالمصدر"))
      .mockResolvedValueOnce([{
        id: PRODUCT_ID, name: "منتج مرتبط", item_code: "P-1", unit: "كرتون", status: "active",
      }]);

    renderTree();
    await screen.findByRole("heading", { name: root.name });
    fireEvent.click(screen.getByRole("tab", { name: "المنتجات المرتبطة" }));
    expect(await screen.findByText("تعذر الاتصال بالمصدر")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /إعادة المحاولة/ }));
    await screen.findByRole("button", { name: /فتح المنتج منتج مرتبط/ });
    expect(mocks.fetchAdminCategoryProducts).toHaveBeenCalledTimes(2);
  });

  it("does not request category data for a role that cannot open the workspace", async () => {
    mocks.roles = ["customer"];
    renderTree();

    expect(screen.getByRole("alert")).toHaveTextContent("لا تتوفر صلاحية عرض الكتالوج");
    await waitFor(() => expect(mocks.fetchCategories).not.toHaveBeenCalled());
  });
});
