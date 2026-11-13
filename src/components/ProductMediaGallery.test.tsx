// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { ProductMediaGallery } from "./ProductMediaGallery";

afterEach(() => {
  cleanup();
  document.body.style.overflow = "";
});

const images = [
  "https://images.example.test/product/front.webp",
  "https://images.example.test/product/side.webp",
  "https://images.example.test/product/back.webp",
];

describe("ProductMediaGallery", () => {
  it("keeps the main image, selected thumbnail and lightbox on one selection", () => {
    render(<ProductMediaGallery productName="هاتف" imageUrls={images} />);

    fireEvent.click(screen.getByRole("button", { name: "عرض صورة المنتج 3" }));
    const mainImage = screen.getByRole("button", { name: "تكبير صور هاتف" }).querySelector("img");
    expect(mainImage).toHaveAttribute("src", images[2]);
    expect(screen.getByRole("button", { name: "عرض صورة المنتج 3" })).toHaveAttribute("aria-pressed", "true");

    fireEvent.click(screen.getByRole("button", { name: "تكبير صور هاتف" }));
    const dialog = screen.getByRole("dialog", { name: "معرض صور هاتف" });
    expect(within(dialog).getByRole("img", { name: "هاتف" })).toHaveAttribute("src", images[2]);
    expect(within(dialog).getByText("الصورة 3 من 3")).toBeInTheDocument();

    fireEvent.click(within(dialog).getByRole("button", { name: "الصورة السابقة" }));
    expect(within(dialog).getByRole("img", { name: "هاتف" })).toHaveAttribute("src", images[1]);
    expect(within(dialog).getByText("الصورة 2 من 3")).toBeInTheDocument();
  });

  it("supports next and previous navigation with wrapping in both the stage and lightbox", () => {
    render(<ProductMediaGallery productName="هاتف" imageUrls={images} />);

    fireEvent.click(screen.getByRole("button", { name: "الصورة السابقة" }));
    expect(screen.getByRole("button", { name: "عرض صورة المنتج 3" })).toHaveAttribute("aria-pressed", "true");

    fireEvent.click(screen.getByRole("button", { name: "تكبير صور هاتف" }));
    const dialog = screen.getByRole("dialog", { name: "معرض صور هاتف" });
    fireEvent.click(within(dialog).getByRole("button", { name: "الصورة التالية" }));
    expect(within(dialog).getByRole("img", { name: "هاتف" })).toHaveAttribute("src", images[0]);
  });

  it("supports RTL arrow keys, Home, End and Escape", () => {
    render(<ProductMediaGallery productName="هاتف" imageUrls={images} />);
    fireEvent.click(screen.getByRole("button", { name: "تكبير صور هاتف" }));
    const dialog = screen.getByRole("dialog", { name: "معرض صور هاتف" });

    fireEvent.keyDown(dialog, { key: "ArrowLeft" });
    expect(within(dialog).getByRole("img", { name: "هاتف" })).toHaveAttribute("src", images[1]);
    fireEvent.keyDown(dialog, { key: "ArrowRight" });
    expect(within(dialog).getByRole("img", { name: "هاتف" })).toHaveAttribute("src", images[0]);
    fireEvent.keyDown(dialog, { key: "End" });
    expect(within(dialog).getByRole("img", { name: "هاتف" })).toHaveAttribute("src", images[2]);
    fireEvent.keyDown(dialog, { key: "Home" });
    expect(within(dialog).getByRole("img", { name: "هاتف" })).toHaveAttribute("src", images[0]);

    fireEvent.keyDown(dialog, { key: "Escape" });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "تكبير صور هاتف" })).toHaveFocus();
    expect(document.body.style.overflow).toBe("");
  });

  it("traps Tab focus inside the lightbox", () => {
    render(<ProductMediaGallery productName="هاتف" imageUrls={images} />);
    fireEvent.click(screen.getByRole("button", { name: "تكبير صور هاتف" }));
    const dialog = screen.getByRole("dialog", { name: "معرض صور هاتف" });
    const buttons = Array.from(dialog.querySelectorAll("button"));
    expect(buttons.length).toBe(3);

    buttons[buttons.length - 1].focus();
    fireEvent.keyDown(buttons[buttons.length - 1], { key: "Tab" });
    expect(buttons[0]).toHaveFocus();
    fireEvent.keyDown(buttons[0], { key: "Tab", shiftKey: true });
    expect(buttons[buttons.length - 1]).toHaveFocus();
  });

  it("does not render carousel controls for a single image and rejects unsafe URLs", () => {
    render(
      <ProductMediaGallery
        productName="هاتف"
        imageUrls={[images[0], images[0], "javascript:alert(1)", "http://images.example.test/unsafe.png"]}
      />,
    );

    expect(screen.getByRole("button", { name: "تكبير صور هاتف" }).querySelector("img")).toHaveAttribute("src", images[0]);
    expect(screen.queryByRole("button", { name: "الصورة التالية" })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "تكبير صور هاتف" }));
    const dialog = screen.getByRole("dialog", { name: "معرض صور هاتف" });
    expect(within(dialog).getByText("الصورة 1 من 1")).toBeInTheDocument();
    expect(within(dialog).queryByRole("button", { name: "الصورة التالية" })).not.toBeInTheDocument();
  });
});
