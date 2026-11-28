// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import type { ComponentProps } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import {
  CartQuantityControl,
  nextCartQuantity,
  previousCartQuantity,
  validateCartQuantity,
} from "./CartQuantityControl";

afterEach(() => cleanup());

function renderControl(overrides: Partial<ComponentProps<typeof CartQuantityControl>> = {}) {
  const onCommit = vi.fn();
  render(
    <CartQuantityControl
      productName="أرز بسمتي"
      quantity={4}
      minimum={2}
      multiple={2}
      available={10}
      onCommit={onCommit}
      {...overrides}
    />,
  );
  return { onCommit };
}

describe("cart quantity rules", () => {
  it("steps only through allowed order multiples and never decrements below the minimum", () => {
    expect(nextCartQuantity(2, 2, 2)).toBe(4);
    expect(nextCartQuantity(4, 2, 2)).toBe(6);
    expect(previousCartQuantity(4, 2, 2)).toBe(2);
    expect(previousCartQuantity(2, 2, 2)).toBeNull();
  });

  it("normalizes Arabic and Persian digits before validating a quantity", () => {
    expect(validateCartQuantity("٦", 2, 2, 10)).toEqual({ valid: true, quantity: 6 });
    expect(validateCartQuantity("۸", 2, 2, 10)).toEqual({ valid: true, quantity: 8 });
  });

  it("rejects below-minimum, wrong-multiple, over-stock and non-integer values", () => {
    expect(validateCartQuantity("1", 2, 2, 10).valid).toBe(false);
    expect(validateCartQuantity("5", 2, 2, 10).valid).toBe(false);
    expect(validateCartQuantity("12", 2, 2, 10).valid).toBe(false);
    expect(validateCartQuantity("2.5", 2, 2, 10).valid).toBe(false);
  });
});

describe("CartQuantityControl", () => {
  it("commits a manually entered Arabic quantity on blur", () => {
    const { onCommit } = renderControl();
    const input = screen.getByRole("textbox", { name: "كمية أرز بسمتي" });
    fireEvent.change(input, { target: { value: "٦" } });
    expect(input).toHaveValue("6");
    fireEvent.blur(input);
    expect(onCommit).toHaveBeenCalledTimes(1);
    expect(onCommit).toHaveBeenCalledWith(6);
  });

  it("rejects an invalid multiple and restores the last committed value", () => {
    const { onCommit } = renderControl();
    const input = screen.getByRole("textbox", { name: "كمية أرز بسمتي" });
    fireEvent.change(input, { target: { value: "٥" } });
    fireEvent.blur(input);
    expect(onCommit).not.toHaveBeenCalled();
    expect(input).toHaveValue("4");
    expect(screen.getByRole("alert")).toHaveTextContent("مضاعف 2");
  });

  it("disables decrement at the minimum and increment beyond available stock", () => {
    renderControl({ quantity: 2, available: 4 });
    expect(screen.getByRole("button", { name: "تقليل كمية أرز بسمتي" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "زيادة كمية أرز بسمتي" })).toBeEnabled();

    cleanup();
    renderControl({ quantity: 4, available: 4 });
    expect(screen.getByRole("button", { name: "زيادة كمية أرز بسمتي" })).toBeDisabled();
  });

  it("commits one allowed step when plus or minus is pressed", () => {
    const { onCommit } = renderControl();
    fireEvent.click(screen.getByRole("button", { name: "زيادة كمية أرز بسمتي" }));
    expect(onCommit).toHaveBeenCalledWith(6);
  });

  it("lets an overstocked cart line step down to the largest valid current-stock quantity", () => {
    const { onCommit } = renderControl({ quantity: 8, available: 5, minimum: 2, multiple: 2 });
    fireEvent.click(screen.getByRole("button", { name: "تقليل كمية أرز بسمتي" }));
    expect(onCommit).toHaveBeenCalledWith(4);
  });

  it("requires removal when current stock is below the order minimum", () => {
    renderControl({ quantity: 4, available: 1, minimum: 2, multiple: 2 });
    expect(screen.getByRole("button", { name: "تقليل كمية أرز بسمتي" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "زيادة كمية أرز بسمتي" })).toBeDisabled();
  });
});
