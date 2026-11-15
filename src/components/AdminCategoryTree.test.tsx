// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { Category, ProductWithInventory } from "@/lib/types";
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

function catalogProduct(overrides: Record<string, unknown> = {}): ProductWithInventory {
  return {
    id: PRODUCT_ID,
    name: "منتج التصنيف",
    name_en: null,
    item_code: "CAT-42",
    sku: null,
    barcode: null,
    category_id: ROOT_ID,
    brand_id: null,
    description: null,
    unit: "كرتون",
    status: "active",
    image_url: null,
    image_gallery_urls: [],
    is_active: true,
    is_featured: false,
    sort_order: 0,
    base_price: 125,
    min_stock_level: 5,
    inventory: {
      product_id: PRODUCT_ID,
      warehouse_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      quantity_on_hand: 8,
      quantity_reserved: 2,
      quantity_available: 6,
      reorder_point: 5,
    },
    ...overrides,
  } as unknown as ProductWithInventory;
}

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


  it("blocks archiving a root when an active deeper descendant sits below an archived direct child", async () => {
    const archivedChild = { ...child, is_active: false };
    const activeGrandchild = category(
      "44444444-4444-4444-8444-444444444444",
      "فرع متداخل نشط",
      CHILD_ID,
    );
    mocks.fetchCategories.mockResolvedValueOnce([root, archivedChild, activeGrandchild]);
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);

    renderTree();
    await screen.findByRole("heading", { name: root.name });
    fireEvent.click(screen.getByRole("button", { name: "أرشفة التصنيف" }));

    expect(mocks.archiveCategory).not.toHaveBeenCalled();
    expect(confirm).not.toHaveBeenCalled();
    expect(mocks.notice).toHaveBeenCalledWith(
      expect.stringContaining("معالجة فروعه النشطة جميعها"),
    );
  });

  it("blocks child creation when any ancestor in the selected parent path is archived", async () => {
    const archivedRoot = { ...root, is_active: false };
    mocks.fetchCategories.mockResolvedValueOnce([archivedRoot, child]);
    window.history.replaceState({}, "", "/admin/categories?category=" + CHILD_ID);

    renderTree();
    await screen.findByRole("heading", { name: child.name });
    fireEvent.click(screen.getByRole("button", { name: /إضافة فرع تحت هذا الأب/ }));

    const nameInput = screen.getByLabelText("اسم التصنيف");
    fireEvent.change(nameInput, { target: { value: "فرع مرفوض" } });
    fireEvent.submit(nameInput.closest("form")!);

    expect(mocks.createCategory).not.toHaveBeenCalled();
    expect(mocks.notice).toHaveBeenCalledWith(
      "لا يمكن إضافة فرع تحت أب مفقود أو ضمن مسار يحتوي تصنيفاً مؤرشفاً.",
    );
  });


  it("renders the category catalogue from the selected category with administrative prices and warehouse evidence", async () => {
    const item = catalogProduct();
    mocks.fetchAdminProductsPage.mockResolvedValueOnce({
      items: [item], page: 1, pageSize: 40, hasNextPage: false,
    });

    renderTree();
    await screen.findByRole("heading", { name: root.name });
    fireEvent.click(screen.getByRole("tab", { name: "الأسعار والمخزون" }));

    const table = await screen.findByRole("table", {
      name: "أسعار ومخزون المنتجات المرتبطة مباشرة بالتصنيف",
    });
    expect(mocks.fetchAdminProductsPage).toHaveBeenCalledWith({
      page: 1,
      categoryId: ROOT_ID,
    });
    expect(within(table).getByRole("columnheader", { name: "السعر الأساسي" })).toBeInTheDocument();
    expect(within(table).getByText("125")).toBeInTheDocument();
    expect(within(table).getByText("8")).toBeInTheDocument();
    expect(within(table).getByText("6")).toBeInTheDocument();
    expect(within(table).getByText("5")).toBeInTheDocument();
    expect(within(table).getByText("ضمن الحد")).toBeInTheDocument();
  });

  it("keeps staff warehouse visibility while removing the administrative price column and value", async () => {
    mocks.roles = ["staff"];
    mocks.fetchAdminProductsPage.mockResolvedValueOnce({
      items: [catalogProduct({ base_price: 987654 })],
      page: 1,
      pageSize: 40,
      hasNextPage: false,
    });

    renderTree();
    await screen.findByRole("heading", { name: root.name });
    fireEvent.click(screen.getByRole("tab", { name: "الأسعار والمخزون" }));

    const table = await screen.findByRole("table", {
      name: "أسعار ومخزون المنتجات المرتبطة مباشرة بالتصنيف",
    });
    expect(within(table).queryByRole("columnheader", { name: "السعر الأساسي" })).not.toBeInTheDocument();
    expect(within(table).queryByText("987654")).not.toBeInTheDocument();
    expect(within(table).getByText("8")).toBeInTheDocument();
    expect(within(table).getByText("6")).toBeInTheDocument();
    expect(within(table).getByText("ضمن الحد")).toBeInTheDocument();
  });

  it("shows missing or malformed warehouse evidence as unavailable instead of fabricating zero or adequate stock", async () => {
    mocks.fetchAdminProductsPage.mockResolvedValueOnce({
      items: [catalogProduct({
        inventory: {
          product_id: PRODUCT_ID,
          warehouse_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
          quantity_on_hand: Number.NaN,
          quantity_reserved: 1,
          quantity_available: -1,
          reorder_point: -5,
        },
      })],
      page: 1,
      pageSize: 40,
      hasNextPage: false,
    });

    renderTree();
    await screen.findByRole("heading", { name: root.name });
    fireEvent.click(screen.getByRole("tab", { name: "الأسعار والمخزون" }));

    const table = await screen.findByRole("table", {
      name: "أسعار ومخزون المنتجات المرتبطة مباشرة بالتصنيف",
    });
    expect(within(table).getAllByText("غير متاح")).toHaveLength(3);
    expect(within(table).queryByText("0")).not.toBeInTheDocument();
    expect(within(table).queryByText("ضمن الحد")).not.toBeInTheDocument();
    expect(within(table).queryByText("منخفض")).not.toBeInTheDocument();
  });

  it("retries a failed category catalogue read without retaining a false empty state", async () => {
    mocks.fetchAdminProductsPage
      .mockRejectedValueOnce(new Error("فشل قراءة كتالوج التصنيف"))
      .mockResolvedValueOnce({
        items: [catalogProduct()],
        page: 1,
        pageSize: 40,
        hasNextPage: false,
      });

    renderTree();
    await screen.findByRole("heading", { name: root.name });
    fireEvent.click(screen.getByRole("tab", { name: "الأسعار والمخزون" }));
    expect(await screen.findByText("فشل قراءة كتالوج التصنيف")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /إعادة المحاولة/ }));
    const table = await screen.findByRole("table", {
      name: "أسعار ومخزون المنتجات المرتبطة مباشرة بالتصنيف",
    });
    expect(within(table).getByText("منتج التصنيف")).toBeInTheDocument();
    expect(mocks.fetchAdminProductsPage).toHaveBeenCalledTimes(2);
  });

  it("paginates category products through the existing reader and opens a product in the existing workspace", async () => {
    const first = catalogProduct();
    const secondId = "44444444-4444-4444-8444-444444444444";
    const second = catalogProduct({ id: secondId, name: "منتج الصفحة الثانية", item_code: "CAT-43", inventory: { product_id: secondId, warehouse_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", quantity_on_hand: 8, quantity_reserved: 2, quantity_available: 6, reorder_point: 5 } });
    mocks.fetchAdminProductsPage
      .mockResolvedValueOnce({ items: [first], page: 1, pageSize: 40, hasNextPage: true })
      .mockResolvedValueOnce({ items: [second], page: 2, pageSize: 40, hasNextPage: false });

    renderTree();
    await screen.findByRole("heading", { name: root.name });
    fireEvent.click(screen.getByRole("tab", { name: "الأسعار والمخزون" }));

    await screen.findByRole("button", { name: "فتح المنتج منتج التصنيف" });
    fireEvent.click(screen.getByRole("button", { name: "التالي" }));
    const pageTwoButton = await screen.findByRole("button", { name: "فتح المنتج منتج الصفحة الثانية" });
    expect(mocks.fetchAdminProductsPage).toHaveBeenNthCalledWith(2, {
      page: 2,
      categoryId: ROOT_ID,
    });
    fireEvent.click(pageTwoButton);
    expect(mocks.openProduct).toHaveBeenCalledWith({
      id: secondId,
      name: "منتج الصفحة الثانية",
      item_code: "CAT-43",
      unit: "كرتون",
      status: "active",
    });
  });

  it("does not request category data for a role that cannot open the workspace", async () => {
    mocks.roles = ["customer"];
    renderTree();

    expect(screen.getByRole("alert")).toHaveTextContent("لا تتوفر صلاحية عرض الكتالوج");
    await waitFor(() => expect(mocks.fetchCategories).not.toHaveBeenCalled());
  });
});
