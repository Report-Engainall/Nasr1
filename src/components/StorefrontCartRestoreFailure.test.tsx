// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { StorefrontCartRestoreFailure } from "./StorefrontCartRestoreFailure";

const items = [
  { productId: "a1000000-0000-4000-8000-000000000001", quantity: 4 },
  { productId: "a1000000-0000-4000-8000-000000000002", quantity: 2 },
];

afterEach(() => cleanup());

describe("StorefrontCartRestoreFailure", () => {
  it("keeps locally saved item identities and quantities visible when catalogue details fail", () => {
    render(
      <StorefrontCartRestoreFailure
        error="تعذر تحميل بيانات أصناف السلة من الكتالوج."
        items={items}
        onRetry={vi.fn()}
        onRemove={vi.fn()}
      />,
    );

    expect(screen.getByRole("alert")).toHaveTextContent("تعذر استعادة تفاصيل أصناف السلة");
    expect(screen.getByRole("group", { name: "الأصناف المحفوظة محليًا" })).toBeInTheDocument();
    expect(screen.getByText("a1000000")).toBeInTheDocument();
    expect(screen.getByText("الكمية المحفوظة: 4")).toBeInTheDocument();
    expect(screen.getByText("الكمية المحفوظة: 2")).toBeInTheDocument();
    expect(screen.queryByText(/سعر|إجمالي|المتاح/)).toBeNull();
    expect(screen.getAllByRole("button", { name: /حذف الصنف/ })).toHaveLength(2);
  });

  it("retries detail restoration and delegates removal of only the selected local line", () => {
    const onRetry = vi.fn();
    const onRemove = vi.fn();
    render(
      <StorefrontCartRestoreFailure
        error="تعذر تحميل بيانات أصناف السلة من الكتالوج."
        items={items}
        onRetry={onRetry}
        onRemove={onRemove}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "إعادة محاولة استعادة التفاصيل" }));
    fireEvent.click(screen.getByRole("button", { name: "حذف الصنف a1000000 من السلة" }));

    expect(onRetry).toHaveBeenCalledTimes(1);
    expect(onRemove).toHaveBeenCalledTimes(1);
    expect(onRemove).toHaveBeenCalledWith(items[0].productId);
  });

  it("still provides a retry action when the saved cart contains no lines", () => {
    const onRetry = vi.fn();
    render(
      <StorefrontCartRestoreFailure
        error="تعذر تحميل بيانات أصناف السلة من الكتالوج."
        items={[]}
        onRetry={onRetry}
        onRemove={vi.fn()}
      />,
    );

    expect(screen.queryByRole("group", { name: "الأصناف المحفوظة محليًا" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "إعادة محاولة استعادة التفاصيل" }));
    expect(onRetry).toHaveBeenCalledOnce();
  });
});
