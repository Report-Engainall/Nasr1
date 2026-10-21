import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

const mocks = vi.hoisted(() => ({
  fetchSettings: vi.fn(),
  updateSetting: vi.fn(),
  useAuth: vi.fn(),
  settings: [] as Array<{ key: string; value: unknown }>,
  refetch: vi.fn(),
}));

vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>();
  return { ...actual, fetchSettings: mocks.fetchSettings, updateSetting: mocks.updateSetting };
});

vi.mock("@/lib/auth", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/auth")>();
  return { ...actual, useAuth: mocks.useAuth };
});

vi.mock("@/lib/useFetch", () => ({
  useFetch: () => ({ data: mocks.settings, loading: false, error: null, refetch: mocks.refetch }),
}));

import { SettingsPage } from "@/components/AdminPages";

const priceSettings = [
  { key: "show_price_on_cards", value: true },
  { key: "show_price_in_cart", value: false },
  { key: "show_price_in_orders", value: false },
  { key: "show_price_in_invoice", value: false },
  { key: "show_customer_tier_in_customer_views", value: false },
];

describe("admin customer price-privacy settings", () => {
  beforeEach(() => {
    mocks.settings = [...priceSettings];
    mocks.fetchSettings.mockReset().mockResolvedValue(mocks.settings);
    mocks.updateSetting.mockReset().mockResolvedValue(undefined);
    mocks.refetch.mockReset().mockResolvedValue(undefined);
    mocks.useAuth.mockReset().mockReturnValue({ user: { profileId: "profile-admin", roles: ["admin"] } });
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("exposes all five saved server-enforced visibility policies to an authorized admin", async () => {
    render(<SettingsPage onNotice={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "المتجر" }));

    expect(await screen.findByText("خصوصية الأسعار والمبالغ")).toBeTruthy();
    expect(screen.getByText("إظهار السعر على بطاقات المنتجات")).toBeTruthy();
    expect(screen.getByText("إظهار أسعار السلة ومراجعة الطلب")).toBeTruthy();
    expect(screen.getByText("إظهار الأسعار في الطلبات")).toBeTruthy();
    expect(screen.getByText("إظهار الأسعار والإجماليات في فاتورة العميل")).toBeTruthy();
    expect(screen.getByText("إظهار فئة السعر في واجهات العميل")).toBeTruthy();

    const label = screen.getByText("إظهار الأسعار والإجماليات في فاتورة العميل");
    const checkbox = label.parentElement?.querySelector<HTMLInputElement>('input[type="checkbox"]');
    expect(checkbox).toBeTruthy();
    fireEvent.click(checkbox!);

    await waitFor(() => expect(mocks.updateSetting).toHaveBeenCalledWith("show_price_in_invoice", true, "storefront"));
    await waitFor(() => expect(mocks.refetch).toHaveBeenCalled());
  });

  it("does not expose price-policy writes to an ordinary staff role", () => {
    mocks.useAuth.mockReturnValue({ user: { profileId: "profile-staff", roles: ["staff"] } });
    render(<SettingsPage onNotice={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "المتجر" }));
    expect(screen.queryByText("خصوصية الأسعار والمبالغ")).toBeNull();
    expect(screen.queryByText("إظهار الأسعار والإجماليات في فاتورة العميل")).toBeNull();
  });
});
