import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/components/DeviceManagement", () => ({
  DeviceManagement: ({ onNotice }: { onNotice: (message: string) => void }) => (
    <section aria-label="إدارة الجلسات الفعلية">
      <h1>الأجهزة والجلسات</h1>
      <button type="button" onClick={() => onNotice("تم تأكيد الإجراء من الخادم")}>
        اختبار إجراء الجلسة
      </button>
    </section>
  ),
}));

import { Devices } from "@/components/AdminPages";

describe("admin devices screen integration", () => {
  afterEach(() => cleanup());

  it("mounts the server-backed device/session workspace instead of listing customer records as devices", () => {
    const onNotice = vi.fn();
    render(<Devices onNotice={onNotice} />);

    expect(screen.getByRole("region", { name: "إدارة الجلسات الفعلية" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "الأجهزة والجلسات" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "قائمة الأجهزة" })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "اختبار إجراء الجلسة" }));
    expect(onNotice).toHaveBeenCalledWith("تم تأكيد الإجراء من الخادم");
  });
});
