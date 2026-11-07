import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { AdminAccessMatrix } from "@/components/AdminAccessMatrix";
import { ADMIN_ACCESS_ROLES, ADMIN_NAV_GROUPS, ADMIN_OPERATION_RULES } from "@/lib/admin-access-matrix";

describe("admin access matrix UI", () => {
  afterEach(() => cleanup());

  it("shows every registered page and operation side by side for all roles by default", () => {
    render(<AdminAccessMatrix />);

    expect(screen.getByRole("table", { name: "مصفوفة وصول الصفحات حسب الدور" })).toBeTruthy();
    expect(screen.getByRole("table", { name: "مصفوفة العمليات وحدودها حسب الدور" })).toBeTruthy();

    for (const role of ADMIN_ACCESS_ROLES) {
      expect(screen.getAllByRole("columnheader", { name: role.label })).toHaveLength(2);
      for (const group of ADMIN_NAV_GROUPS) {
        for (const view of group.views) {
          expect(screen.getByTestId(`page-${view}-${role.id}`)).toBeTruthy();
        }
      }
      for (const operation of ADMIN_OPERATION_RULES) {
        expect(screen.getByTestId(`operation-${operation.id}-${role.id}`)).toBeTruthy();
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
  });

  it("switches to the selected role detail without changing any permission policy", () => {
    render(<AdminAccessMatrix />);
    fireEvent.click(screen.getByRole("button", { name: "تفاصيل دور واحد" }));
    fireEvent.change(screen.getByRole("combobox", { name: "الدور محل المراجعة" }), { target: { value: "staff" } });

    expect(screen.getByTestId("single-page-products")).toBeTruthy();
    expect(screen.getByTestId("single-page-finance")).toHaveTextContent("ممنوع");
    expect(screen.getByText("العمليات المتاحة")).toBeTruthy();
    expect((screen.getByRole("combobox", { name: "الدور محل المراجعة" }) as HTMLSelectElement).value).toBe("staff");
  });
});
