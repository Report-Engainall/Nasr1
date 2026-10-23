import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { AnchorHTMLAttributes, ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  fetchCategories: vi.fn(),
  navigate: vi.fn(),
  useFetch: vi.fn(),
  categoryResult: null as null | {
    data: unknown;
    loading: boolean;
    error: string | null;
    refetch: () => void;
  },
}));

vi.mock("@/lib/api", () => ({ fetchCategories: mocks.fetchCategories }));
vi.mock("@/lib/useFetch", () => ({ useFetch: mocks.useFetch }));
vi.mock("@tanstack/react-router", () => ({
  Link: ({ to, children, ...props }: { to: string; children?: ReactNode } & AnchorHTMLAttributes<HTMLAnchorElement>) =>
    <a href={to} {...props}>{children}</a>,
  useNavigate: () => mocks.navigate,
}));

import { AdvancedStorefrontSearchPage } from "@/components/AdvancedStorefrontSearchPage";

function setCategoryResult(result: {
  data: unknown;
  loading: boolean;
  error: string | null;
  refetch: () => void;
}) {
  mocks.categoryResult = result;
  mocks.useFetch.mockImplementation((fetcher: unknown) =>
    fetcher === mocks.fetchCategories ? mocks.categoryResult : null,
  );
}

const activeRoot = { id: "category-active", name: "تصنيف متاح", parent_id: null, is_active: true };
const inactiveRoot = { id: "category-inactive", name: "تصنيف مخفي", parent_id: null, is_active: false };
const activeChild = { id: "category-child", name: "تصنيف فرعي", parent_id: "category-active", is_active: true };

describe("advanced storefront search category-query states", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setCategoryResult({ data: [], loading: false, error: null, refetch: vi.fn() });
  });

  afterEach(() => cleanup());

  it("announces category loading and disables category selection until results are available", () => {
    setCategoryResult({ data: [], loading: true, error: null, refetch: vi.fn() });

    render(<AdvancedStorefrontSearchPage />);

    expect(screen.getByRole("status")).toHaveTextContent("جار تحميل التصنيفات...");
    expect(screen.getByLabelText("التصنيف")).toBeDisabled();
  });

  it("offers retry after category failure while keeping text search usable", () => {
    const refetch = vi.fn();
    setCategoryResult({ data: [], loading: false, error: "تعذر جلب التصنيفات", refetch });

    render(<AdvancedStorefrontSearchPage />);

    expect(screen.getByRole("alert")).toHaveTextContent("تعذر تحميل التصنيفات: تعذر جلب التصنيفات");
    expect(screen.getByLabelText("التصنيف")).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "إعادة تحميل التصنيفات" }));
    expect(refetch).toHaveBeenCalledTimes(1);

    fireEvent.change(screen.getByLabelText("اسم الصنف أو رمزه أو الباركود"), { target: { value: "SKU-002" } });
    fireEvent.click(screen.getByRole("button", { name: "عرض النتائج" }));
    expect(mocks.navigate).toHaveBeenCalledWith({ to: "/catalog", search: { q: "SKU-002" } });
  });

  it("rejects an empty search and only offers active top-level categories", () => {
    setCategoryResult({ data: [activeRoot, inactiveRoot, activeChild], loading: false, error: null, refetch: vi.fn() });

    render(<AdvancedStorefrontSearchPage />);

    const select = screen.getByLabelText("التصنيف");
    expect(screen.getByRole("option", { name: "تصنيف متاح" })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: "تصنيف مخفي" })).toBeNull();
    expect(screen.queryByRole("option", { name: "تصنيف فرعي" })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "عرض النتائج" }));
    expect(screen.getByRole("alert")).toHaveTextContent("أدخل اسمًا أو رمز صنف أو اختر تصنيفًا أو فعّل فلتر المتوفر فقط.");
    expect(mocks.navigate).not.toHaveBeenCalled();
    expect(select).toBeEnabled();
  });

  it("navigates with selected category and known-availability filters", () => {
    setCategoryResult({ data: [activeRoot], loading: false, error: null, refetch: vi.fn() });

    render(<AdvancedStorefrontSearchPage />);

    fireEvent.change(screen.getByLabelText("التصنيف"), { target: { value: "category-active" } });
    fireEvent.click(screen.getByLabelText("عرض الأصناف ذات الرصيد المتاح المعروف فقط"));
    fireEvent.click(screen.getByRole("button", { name: "عرض النتائج" }));

    expect(mocks.navigate).toHaveBeenCalledWith({
      to: "/catalog",
      search: { category: "category-active", available: "1" },
    });
  });
});
