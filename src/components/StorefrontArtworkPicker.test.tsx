// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { StorefrontArtworkPicker } from "./StorefrontArtworkPicker";

afterEach(() => cleanup());

describe("StorefrontArtworkPicker", () => {
  it("previews the saved variant and emits only a supported artwork key", () => {
    const onChange = vi.fn();
    render(
      <StorefrontArtworkPicker
        label="رسم بانر المتجر"
        value="food"
        onChange={onChange}
        previewName="بانر الأغبري"
      />,
    );

    const picker = screen.getByRole("combobox", { name: "رسم بانر المتجر" });
    expect(picker).toHaveValue("food");
    expect(screen.getByRole("img", { name: "معاينة الرسم بانر الأغبري" }))
      .toHaveAttribute("data-placeholder-variant", "food");

    fireEvent.change(picker, { target: { value: "cleaning" } });
    expect(onChange).toHaveBeenCalledWith("cleaning");
  });

  it("normalizes an unsupported legacy key to the safe general illustration", () => {
    render(
      <StorefrontArtworkPicker
        label="رسم التصنيف"
        value={"https://untrusted.invalid/fake.svg" as never}
        onChange={vi.fn()}
        previewName="تصنيف متنوع"
      />,
    );
    expect(screen.getByRole("combobox", { name: "رسم التصنيف" })).toHaveValue("general");
    expect(screen.getByRole("img", { name: "معاينة الرسم تصنيف متنوع" }))
      .toHaveAttribute("data-placeholder-variant", "general");
  });
});
