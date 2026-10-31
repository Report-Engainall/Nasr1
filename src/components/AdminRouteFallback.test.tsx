import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { AdminRouteFallback } from "./AdminRouteFallback";

describe("admin route loading fallback", () => {
  afterEach(() => cleanup());

  it("renders an accessible Arabic RTL loading state instead of a blank route", () => {
    render(<AdminRouteFallback />);

    expect(screen.getByRole("main")).toHaveAttribute("dir", "rtl");
    expect(screen.getByRole("main")).toHaveAttribute("lang", "ar");
    expect(screen.getByRole("status", { name: "جارٍ تجهيز لوحة الإدارة" })).toHaveAttribute("aria-busy", "true");
    expect(screen.getByText("يتم تحميل بيانات الشاشة والتحقق من صلاحيات الوصول.")).toBeInTheDocument();
  });
});
