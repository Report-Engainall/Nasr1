// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { StorefrontProductFacts } from "./StorefrontProductFacts";
import {
  fetchStorefrontProductFacts,
  type StorefrontProductFacts as Facts,
} from "@/lib/storefront-product-details";

vi.mock("@/lib/storefront-product-details", () => ({
  fetchStorefrontProductFacts: vi.fn(),
}));

const productId = "10000000-0000-4000-8000-000000000001";
const alternativeId = "30000000-0000-4000-8000-000000000003";
const complementId = "40000000-0000-4000-8000-000000000004";

const approvedFacts: Facts = {
  productId,
  brand: { id: "20000000-0000-4000-8000-000000000002", name: "علامة موثقة", name_en: "Verified Brand" },
  countryOfOriginCode: "YE",
  specifications: [{ name: "الوزن", value: "500", unit: "جم" }],
  packaging: {
    packageSizeValue: 500,
    packageSizeUnit: "جم",
    cartonUnitName: "كرتون",
    unitsPerCarton: 24,
  },
  alternatives: [{
    id: alternativeId,
    name: "منتج بديل",
    item_code: "ALT-01",
    unit: "قطعة",
    image_url: "https://cdn.example.test/alternative.webp",
    brand_name: "علامة البديل",
  }],
  complements: [{
    id: complementId,
    name: "منتج مكمل",
    item_code: "COMP-01",
    unit: "علبة",
    image_url: null,
    brand_name: null,
  }],
};

const mockedFetch = vi.mocked(fetchStorefrontProductFacts);

afterEach(() => cleanup());
beforeEach(() => vi.resetAllMocks());

describe("storefront product facts presentation", () => {
  it("renders only approved brand, origin, specifications, packaging and explicit recommendations", async () => {
    mockedFetch.mockResolvedValue(approvedFacts);
    const onOpenProduct = vi.fn();

    render(<StorefrontProductFacts productId={productId} onOpenProduct={onOpenProduct} />);

    expect(screen.getByRole("status")).toHaveTextContent("جار تحميل العلامة والمواصفات والعلاقات المعتمدة");
    expect(await screen.findByText("علامة موثقة")).toBeInTheDocument();
    expect(screen.getByText("YE")).toBeInTheDocument();
    expect(screen.getAllByText("500 جم", { exact: true })).toHaveLength(2);
    expect(screen.getByText("24 كرتون لكل وحدة أساسية")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "المواصفات" })).toBeInTheDocument();
    expect(screen.getByText("منتج بديل")).toBeInTheDocument();
    expect(screen.getByText("منتج مكمل")).toBeInTheDocument();
    expect(screen.getByText("ALT-01")).toBeInTheDocument();
    expect(screen.getByText("COMP-01")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "عرض تفاصيل منتج بديل" }));
    fireEvent.click(screen.getByRole("button", { name: "عرض تفاصيل منتج مكمل" }));
    expect(onOpenProduct).toHaveBeenNthCalledWith(1, alternativeId);
    expect(onOpenProduct).toHaveBeenNthCalledWith(2, complementId);
    expect(mockedFetch).toHaveBeenCalledWith(productId);
  });

  it("shows explicit unavailable states instead of inferring unverified product facts", async () => {
    mockedFetch.mockResolvedValue({
      productId,
      brand: null,
      countryOfOriginCode: null,
      specifications: [],
      packaging: null,
      alternatives: [],
      complements: [],
    });

    render(<StorefrontProductFacts productId={productId} onOpenProduct={vi.fn()} />);

    expect(await screen.findByText("لا توجد حالياً حقائق موثقة للعلامة أو المنشأ أو التغليف لهذا الصنف."))
      .toBeInTheDocument();
    expect(screen.queryByText("لم تُسجّل علامة لهذا المنتج")).not.toBeInTheDocument();
    expect(screen.queryByText("غير معتمد")).not.toBeInTheDocument();
    expect(screen.getByText("لم تُسجّل مواصفات معتمدة لهذا الصنف.")).toBeInTheDocument();
    expect(screen.getByText("لا توجد منتجات بديلة مرتبطة ومنشورة لهذا الصنف.")).toBeInTheDocument();
    expect(screen.getByText("لا توجد منتجات مكملة مرتبطة ومنشورة لهذا الصنف.")).toBeInTheDocument();
  });

  it("renders a recoverable error and retries the same product read", async () => {
    mockedFetch
      .mockRejectedValueOnce(new Error("تعذر تحميل البيانات المعتمدة"))
      .mockResolvedValueOnce(approvedFacts);

    render(<StorefrontProductFacts productId={productId} onOpenProduct={vi.fn()} />);

    expect(await screen.findByRole("alert")).toHaveTextContent("تعذر تحميل البيانات المعتمدة");
    fireEvent.click(screen.getByRole("button", { name: "إعادة المحاولة" }));

    expect(await screen.findByText("علامة موثقة")).toBeInTheDocument();
    expect(mockedFetch).toHaveBeenCalledTimes(2);
    expect(mockedFetch).toHaveBeenNthCalledWith(2, productId);
  });
});
