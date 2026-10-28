import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { DashboardLoadError } from "@/components/DashboardLoadError";

describe("dashboard load error recovery", () => {
  it("shows the service failure and retries when the operator selects retry", () => {
    const onRetry = vi.fn();
    render(<DashboardLoadError message="تعذر الاتصال بالخادم" onRetry={onRetry} />);

    expect(screen.getByRole("alert")).toBeTruthy();
    expect(screen.getByText("تعذر الاتصال بالخادم")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /إعادة محاولة تحميل بيانات اللوحة/ }));

    expect(onRetry).toHaveBeenCalledTimes(1);
  });
});
