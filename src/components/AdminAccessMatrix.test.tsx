// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { AdminAccessMatrix } from "./AdminAccessMatrix";

afterEach(() => cleanup());

describe("AdminAccessMatrix selected-role comparison", () => {
  it("compares selected roles and filters the matrix to actual permission differences", () => {
    render(<AdminAccessMatrix />);

    fireEvent.click(screen.getByRole("button", { name: "مقارنة أدوار محددة" }));

    expect(screen.getByRole("checkbox", { name: "اختيار دور مدير النظام للمقارنة" })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "اختيار دور موظف تشغيل للمقارنة" })).toBeChecked();

    // Page and operation decisions come from the same policy registry used by the app.
    expect(screen.getByTestId("page-finance-admin")).toHaveTextContent("مسموح");
    expect(screen.getByTestId("page-finance-staff")).toHaveTextContent("ممنوع");
    expect(screen.getByTestId("operation-role_assignment-admin")).toHaveTextContent("مسموح");
    expect(screen.getByTestId("operation-role_assignment-staff")).toHaveTextContent("ممنوع");

    // Both roles can open the dashboard, so it is hidden while "differences only" is active.
    expect(screen.queryByTestId("page-dashboard-admin")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("checkbox", { name: "عرض الفروقات فقط" }));
    expect(screen.getByTestId("page-dashboard-admin")).toBeInTheDocument();
  });

  it("keeps at least two roles selected for a meaningful comparison", () => {
    render(<AdminAccessMatrix />);
    fireEvent.click(screen.getByRole("button", { name: "مقارنة أدوار محددة" }));

    expect(screen.getByRole("checkbox", { name: "اختيار دور مدير النظام للمقارنة" })).toBeDisabled();
    expect(screen.getByRole("checkbox", { name: "اختيار دور موظف تشغيل للمقارنة" })).toBeDisabled();
  });
});
