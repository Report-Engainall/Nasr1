import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const mocks = vi.hoisted(() => ({
  useFetch: vi.fn(),
  useAuth: vi.fn(),
  fetchSettings: vi.fn(),
  fetchAiAlerts: vi.fn(),
  fetchAiTasks: vi.fn(),
  fetchOrders: vi.fn(),
  fetchOrderItems: vi.fn(),
  fetchOnyxSnapshots: vi.fn(),
  refetchSettings: vi.fn(),
  refetchAlerts: vi.fn(),
  refetchTasks: vi.fn(),
  refetchOrders: vi.fn(),
  refetchItems: vi.fn(),
  states: {
    settings: null as unknown,
    alerts: null as unknown,
    tasks: null as unknown,
    orders: null as unknown,
    items: null as unknown,
  },
}));

vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>();
  return {
    ...actual,
    fetchSettings: mocks.fetchSettings,
    fetchAiAlerts: mocks.fetchAiAlerts,
    fetchAiTasks: mocks.fetchAiTasks,
    fetchOrders: mocks.fetchOrders,
    fetchOrderItems: mocks.fetchOrderItems,
    fetchOnyxSnapshots: mocks.fetchOnyxSnapshots,
  };
});

vi.mock("@/lib/auth", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/auth")>();
  return { ...actual, useAuth: mocks.useAuth };
});

vi.mock("@/lib/useFetch", () => ({
  useFetch: (fetcher: unknown) => {
    if (fetcher === mocks.fetchSettings) return mocks.states.settings;
    if (fetcher === mocks.fetchAiAlerts) return mocks.states.alerts;
    if (fetcher === mocks.fetchAiTasks) return mocks.states.tasks;
    if (fetcher === mocks.fetchOrders) return mocks.states.orders;
    return mocks.states.items;
  },
}));

vi.mock("@tanstack/react-router", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@tanstack/react-router")>();
  return {
    ...actual,
    useBlocker: vi.fn(() => ({ status: "idle", proceed: vi.fn(), reset: vi.fn() })),
  };
});

import { AiCenter, OrderDetail, SettingsPage } from "@/components/AdminPages";

const appSource = readFileSync(join(process.cwd(), "src/components/AghbariApp.tsx"), "utf8");

describe("admin data-load failure recovery", () => {
  beforeEach(() => {
    mocks.refetchSettings.mockReset().mockResolvedValue(undefined);
    mocks.refetchAlerts.mockReset().mockResolvedValue(undefined);
    mocks.refetchTasks.mockReset().mockResolvedValue(undefined);
    mocks.refetchOrders.mockReset().mockResolvedValue(undefined);
    mocks.refetchItems.mockReset().mockResolvedValue(undefined);
    mocks.fetchOnyxSnapshots.mockReset().mockResolvedValue([]);
    mocks.useAuth.mockReset().mockReturnValue({
      user: { profileId: "staff-profile", roles: ["staff"] },
      ready: true,
    });

    mocks.states.settings = {
      data: null, loading: false, error: "settings service offline", refetch: mocks.refetchSettings,
    };
    mocks.states.alerts = {
      data: null, loading: false, error: "alerts service offline", refetch: mocks.refetchAlerts,
    };
    mocks.states.tasks = {
      data: null, loading: false, error: "tasks service offline", refetch: mocks.refetchTasks,
    };
    mocks.states.orders = {
      data: null, loading: false, error: "orders service offline", refetch: mocks.refetchOrders,
    };
    mocks.states.items = {
      data: [], loading: false, error: null, refetch: mocks.refetchItems,
    };
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("keeps settings read-only after a failed fetch and allows retry", () => {
    render(<SettingsPage onNotice={vi.fn()} />);

    expect(screen.getByRole("alert").textContent).toContain("settings service offline");
    expect(screen.queryByRole("textbox")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /تحديث/ }));
    expect(mocks.refetchSettings).toHaveBeenCalledTimes(1);
  });

  it("shows AI alert/task request failures instead of claiming their lists are empty", () => {
    render(<AiCenter onNotice={vi.fn()} />);

    expect(screen.getByRole("alert").textContent).toContain("alerts service offline");
    expect(screen.queryByText("لا توجد تنبيهات نشطة")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: /المهام/ }));
    expect(screen.getByRole("alert").textContent).toContain("tasks service offline");
    expect(screen.queryByText("لا توجد مهام معلقة")).toBeNull();
  });

  it("shows empty AI states only after successful empty responses", () => {
    mocks.states.alerts = {
      data: [], loading: false, error: null, refetch: mocks.refetchAlerts,
    };
    mocks.states.tasks = {
      data: [], loading: false, error: null, refetch: mocks.refetchTasks,
    };

    render(<AiCenter onNotice={vi.fn()} />);
    expect(screen.getByText("لا توجد تنبيهات نشطة")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: /المهام/ }));
    expect(screen.getByText("لا توجد مهام معلقة")).toBeTruthy();
  });

  it("preserves an order-list error and retries instead of displaying a false not-found result", () => {
    render(
      <OrderDetail
        orderId="11111111-1111-4111-8111-111111111111"
        onBack={vi.fn()}
        onNotice={vi.fn()}
        onBlockedChange={vi.fn()}
      />,
    );

    expect(screen.getByRole("alert").textContent).toContain("orders service offline");
    expect(screen.queryByText("لم يتم العثور على الطلب المطلوب ضمن المؤسسة الحالية.")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "إعادة تحميل الطلب" }));
    expect(mocks.refetchOrders).toHaveBeenCalledTimes(1);
  });

  it("keeps dashboard fetch errors distinct from empty alerts and refreshes all three data sources", () => {
    const start = appSource.indexOf("function Dashboard(");
    const end = appSource.indexOf("\nfunction ", start + 1);
    const dashboard = start >= 0 && end > start ? appSource.slice(start, end) : "";

    expect(dashboard).not.toBe("");
    const errorBranch = dashboard.indexOf("alertsError ? <ErrorBox message={alertsError} />");
    const emptyBranch = dashboard.indexOf('لا توجد تنبيهات نشطة');
    expect(errorBranch).toBeGreaterThanOrEqual(0);
    expect(emptyBranch).toBeGreaterThan(errorBranch);
    expect(dashboard).toContain("void refetch(); void refetchAlerts(); void refetchProducts();");
  });

  it("blocks saving pricing rules while required scope options are unavailable and provides retry", () => {
    const start = appSource.indexOf("function PricingRuleModal(");
    const end = appSource.indexOf("\nfunction Offers(", start + 1);
    const pricingRule = start >= 0 && end > start ? appSource.slice(start, end) : "";

    expect(pricingRule).not.toBe("");
    expect(pricingRule).toContain("if (scopeOptionsUnavailable)");
    expect(pricingRule).toContain("void refetchProducts()");
    expect(pricingRule).toContain("void refetchCategories()");
    expect(pricingRule).toContain("disabled={saving || scopeOptionsUnavailable}");
  });
});
