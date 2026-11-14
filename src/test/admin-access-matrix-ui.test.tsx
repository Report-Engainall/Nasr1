// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { AdminAccessMatrix } from "@/components/AdminAccessMatrix";
import { ADMIN_ACCESS_ROLES, ADMIN_NAV_GROUPS, ADMIN_NAV_ITEMS, ADMIN_OPERATION_RULES } from "@/lib/admin-access-matrix";

describe("admin access matrix UI", () => {
  afterEach(() => cleanup());

  it("shows every registered page and operation side by side for all roles by default", () => {
    const { container } = render(<AdminAccessMatrix />);

    expect(screen.getByRole("table", { name: "مصفوفة وصول الصفحات حسب الدور" })).toBeTruthy();
    expect(screen.getByRole("table", { name: "مصفوفة العمليات وحدودها حسب الدور" })).toBeTruthy();
    expect(screen.getByRole("region", { name: "جدول مقارنة الوصول إلى الصفحات حسب الدور" })).toHaveAttribute("tabindex", "0");
    expect(screen.getByRole("region", { name: "جدول مقارنة العمليات وحدودها حسب الدور" })).toHaveAttribute("tabindex", "0");

    // Index the large comparison DOM once. Re-running hundreds of global
    // getByRole/getByTestId queries makes this full-matrix contract test time out
    // under CI without adding coverage.
    const rowHeaderNames = new Set(
      screen.getAllByRole("rowheader").map((element) => element.textContent?.trim() ?? ""),
    );
    for (const item of ADMIN_NAV_ITEMS) {
      expect(rowHeaderNames.has(item.label)).toBe(true);
    }
    expect(rowHeaderNames.has("التصنيفات الرئيسية والفرعية")).toBe(true);

    const columnHeaderCounts = new Map<string, number>();
    for (const element of screen.getAllByRole("columnheader")) {
      const name = element.textContent?.trim() ?? "";
      columnHeaderCounts.set(name, (columnHeaderCounts.get(name) ?? 0) + 1);
    }
    const renderedTestIds = new Set(
      Array.from(container.querySelectorAll<HTMLElement>("[data-testid]"))
        .map((element) => element.dataset.testid)
        .filter((value): value is string => Boolean(value)),
    );

    for (const role of ADMIN_ACCESS_ROLES) {
      expect(columnHeaderCounts.get(role.label)).toBe(2);
      for (const group of ADMIN_NAV_GROUPS) {
        for (const view of group.views) {
          expect(renderedTestIds.has(`page-${view}-${role.id}`)).toBe(true);
        }
      }
      for (const operation of ADMIN_OPERATION_RULES) {
        expect(renderedTestIds.has(`operation-${operation.id}-${role.id}`)).toBe(true);
      }
    }

    const staffFinance = screen.getByTestId("page-finance-staff");
    expect(within(staffFinance).getByText("ممنوع")).toBeTruthy();
    expect(within(staffFinance).getByText(/تتطلب مساحة المالية/)).toBeTruthy();

    const accountantFinance = screen.getByTestId("page-finance-accountant");
    expect(within(accountantFinance).getByText("مسموح")).toBeTruthy();

    const staffPricing = screen.getByTestId("operation-pricing_rules_write-staff");
    expect(within(staffPricing).getByText("ممنوع")).toBeTruthy();
    expect(within(staffPricing).getByText(/تعديل القواعد القائمة/)).toBeTruthy();

    const accountantFinanceOperation = screen.getByTestId("operation-finance_manage-accountant");
    expect(within(accountantFinanceOperation).getByText("مسموح")).toBeTruthy();
    expect(within(accountantFinanceOperation).getByText(/المحاسب يصل إلى المالية/)).toBeTruthy();
  }, 10000);

  it("switches to the selected role detail without changing any permission policy", () => {
    render(<AdminAccessMatrix />);
    fireEvent.click(screen.getByRole("button", { name: "تفاصيل دور واحد" }));
    fireEvent.change(screen.getByRole("combobox", { name: "الدور محل المراجعة" }), { target: { value: "staff" } });

    expect(screen.getByTestId("single-page-products")).toBeTruthy();
    expect(screen.getByTestId("single-page-finance")).toHaveTextContent("ممنوع");
    expect(screen.getByText("العمليات المتاحة")).toBeTruthy();
    expect((screen.getByRole("combobox", { name: "الدور محل المراجعة" }) as HTMLSelectElement).value).toBe("staff");
  });
  it("keeps six-group navigation RTL layouts responsive and keyboard reachable", () => {
    const sourceRoot = resolve(process.cwd(), "src");
    const styles = readFileSync(resolve(sourceRoot, "aghbari.css"), "utf8");
    const appSource = readFileSync(resolve(sourceRoot, "components/AghbariApp.tsx"), "utf8");

    expect(styles).toContain("@media (max-width: 1200px) { .admin-group-cards { grid-template-columns: repeat(2");
    expect(styles).toContain("@media (max-width: 800px) { .admin-group-cards { grid-template-columns: 1fr");
    expect(styles).toContain("@media (max-width: 380px) { .admin-group-card__links { grid-template-columns: 1fr; } }");
    expect(styles).toContain("@media (max-width: 1000px) { .admin-group-landing__grid { grid-template-columns: repeat(2");
    expect(styles).toContain("@media (max-width: 520px) { .admin-group-landing__grid { grid-template-columns: 1fr");
    expect(styles).toContain(".admin-group-card__links button:focus-visible");
    expect(styles).toContain(".admin-group-landing__item:focus-visible");
    expect(appSource).toContain("aria-current={view === id ? 'page' : undefined}");
    expect(appSource).toContain('aria-label="مسار التنقل"');
    expect(appSource).toContain("activeNavigationGroup.label");
  });

});
