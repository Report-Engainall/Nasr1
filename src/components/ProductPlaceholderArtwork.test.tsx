// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { ProductPlaceholderArtwork, resolveProductPlaceholderVariant } from "./ProductPlaceholderArtwork";

afterEach(() => cleanup());

describe("ProductPlaceholderArtwork", () => {
  it.each([
    ["رز بسمتي", "food"],
    ["عصير برتقال", "beverage"],
    ["مسحوق غسيل", "cleaning"],
    ["شامبو للشعر", "personal-care"],
    ["بطارية قابلة للشحن", "electrical"],
    ["مطرقة حديد", "tools"],
    ["دفتر مدرسي", "stationery"],
    ["صنف متنوع", "general"],
  ] as const)("selects a category-aware illustration for %s", (productName, expected) => {
    expect(resolveProductPlaceholderVariant({ productName })).toBe(expected);
  });

  it("uses category and description when the product name is not descriptive", () => {
    expect(resolveProductPlaceholderVariant({ productName: "صنف رقم 18", categoryName: "مواد التنظيف" })).toBe("cleaning");
    expect(resolveProductPlaceholderVariant({ productName: "Item 19", description: "Rechargeable battery" })).toBe("electrical");
  });

  it("identifies the artwork as a temporary illustration, not original product media", () => {
    render(<ProductPlaceholderArtwork productName="رز بسمتي" description="كيس أرز" />);
    expect(screen.getByRole("img", { name: "رسم توضيحي مؤقت للمنتج رز بسمتي" })).toHaveAttribute("data-placeholder-variant", "food");
    expect(screen.getByText("صورة توضيحية مؤقتة")).toBeInTheDocument();
  });
});
