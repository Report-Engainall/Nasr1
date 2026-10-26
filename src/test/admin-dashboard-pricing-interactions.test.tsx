import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  fetchDashboardStats: vi.fn(),
  fetchAiAlerts: vi.fn(),
  fetchProducts: vi.fn(),
  fetchCategories: vi.fn(),
  createPricingRule: vi.fn(),
  updatePricingRule: vi.fn(),
  refetchDashboard: vi.fn(),
  refetchAlerts: vi.fn(),
  refetchProducts: vi.fn(),
  refetchCategories: vi.fn(),
  states: {
    dashboard: null as unknown,
    alerts: null as unknown,
    products: null as unknown,
    categories: null as unknown,
  },
}));

vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>();
  return {
    ...actual,
    fetchDashboardStats: mocks.fetchDashboardStats,
    fetchAiAlerts: mocks.fetchAiAlerts,
    fetchProducts: mocks.fetchProducts,
    fetchCategories: mocks.fetchCategories,
    createPricingRule: mocks.createPricingRule,
    updatePricingRule: mocks.updatePricingRule,
  };
});

vi.mock("@/lib/useFetch", () => ({
  useFetch: (fetcher: unknown) => {
    if (fetcher === mocks.fetchDashboardStats) return mocks.states.dashboard;
    if (fetcher === mocks.fetchAiAlerts) return mocks.states.alerts;
    if (fetcher === mocks.fetchProducts) return mocks.states.products;
    if (fetcher === mocks.fetchCategories) return mocks.states.categories;
    throw new Error("Unexpected useFetch source in admin interaction test.");
  },
}));

import { Dashboard, PricingRuleModal } from "@/components/AghbariApp";

const PRODUCT_ID = "11111111-1111-4111-8111-111111111111";
const CATEGORY_ID = "22222222-2222-4222-8222-222222222222";

function setDefaultFetchStates() {
  mocks.states.dashboard = {
    data: {
      orderCount: 3,
      processingCount: 1,
      totalSales: 120,
      invalidOrderAmountCount: 0,
      totalSalesIssue: null,
      customerCount: 2,
      productCount: 4,
      lowStockCount: 0,
    },
    loading: false,
    error: null,
    refetch: mocks.refetchDashboard,
  };
  mocks.states.alerts = {
    data: [],
    loading: false,
    error: null,
    refetch: mocks.refetchAlerts,
  };
  mocks.states.products = {
    data: [],
    loading: false,
    error: null,
    refetch: mocks.refetchProducts,
  };
  mocks.states.categories = {
    data: [],
    loading: false,
    error: null,
    refetch: mocks.refetchCategories,
  };
}

describe("admin dashboard and pricing-rule interaction acceptance", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.fetchDashboardStats.mockResolvedValue({});
    mocks.fetchAiAlerts.mockResolvedValue([]);
    mocks.fetchProducts.mockResolvedValue([]);
    mocks.fetchCategories.mockResolvedValue([]);
    mocks.createPricingRule.mockResolvedValue(undefined);
    mocks.updatePricingRule.mockResolvedValue(undefined);
    mocks.refetchDashboard.mockResolvedValue(undefined);
    mocks.refetchAlerts.mockResolvedValue(undefined);
    mocks.refetchProducts.mockResolvedValue(undefined);
    mocks.refetchCategories.mockResolvedValue(undefined);
    setDefaultFetchStates();
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("renders the dashboard alert request failure, not a false empty state, and retries all dashboard sources", () => {
    mocks.states.alerts = {
      data: null,
      loading: false,
      error: "alerts service offline",
      refetch: mocks.refetchAlerts,
    };

    render(<Dashboard onNavigate={vi.fn()} />);

    expect(screen.getByRole("alert")).toHaveTextContent("alerts service offline");
    expect(screen.queryByText("لا توجد تنبيهات نشطة")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "تحديث البيانات" }));

    expect(mocks.refetchDashboard).toHaveBeenCalledTimes(1);
    expect(mocks.refetchAlerts).toHaveBeenCalledTimes(1);
    expect(mocks.refetchProducts).toHaveBeenCalledTimes(1);
  });

  it("shows a dashboard empty state only after the alert request succeeded with an empty list", () => {
    mocks.states.alerts = {
      data: [],
      loading: false,
      error: null,
      refetch: mocks.refetchAlerts,
    };

    render(<Dashboard onNavigate={vi.fn()} />);

    expect(screen.getByText("لا توجد تنبيهات نشطة")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("surfaces product lookup failure in the pricing-rule modal, retries, and keeps saving disabled", () => {
    mocks.states.products = {
      data: null,
      loading: false,
      error: "product catalog offline",
      refetch: mocks.refetchProducts,
    };
    const onClose = vi.fn();
    const onSaved = vi.fn();

    render(<PricingRuleModal onClose={onClose} onSaved={onSaved} />);
    fireEvent.change(screen.getByLabelText("نطاق التطبيق"), { target: { value: "product" } });

    expect(screen.getByRole("alert")).toHaveTextContent("product catalog offline");
    const retry = screen.getByRole("button", { name: "إعادة تحميل المنتجات" });
    expect(retry).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "حفظ قاعدة التسعير" })).toBeDisabled();

    fireEvent.click(retry);

    expect(mocks.refetchProducts).toHaveBeenCalledTimes(1);
    expect(mocks.createPricingRule).not.toHaveBeenCalled();
    expect(onSaved).not.toHaveBeenCalled();
  });

  it("surfaces category lookup failure and offers a category retry without permitting a save", () => {
    mocks.states.categories = {
      data: null,
      loading: false,
      error: "category catalog offline",
      refetch: mocks.refetchCategories,
    };

    render(<PricingRuleModal onClose={vi.fn()} onSaved={vi.fn()} />);
    fireEvent.change(screen.getByLabelText("نطاق التطبيق"), { target: { value: "category" } });

    expect(screen.getByRole("alert")).toHaveTextContent("category catalog offline");
    fireEvent.click(screen.getByRole("button", { name: "إعادة تحميل التصنيفات" }));
    expect(mocks.refetchCategories).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: "حفظ قاعدة التسعير" })).toBeDisabled();
    expect(mocks.createPricingRule).not.toHaveBeenCalled();
  });

  it("distinguishes a successful empty product lookup from a fetch error and still blocks saving", () => {
    mocks.states.products = {
      data: [],
      loading: false,
      error: null,
      refetch: mocks.refetchProducts,
    };

    render(<PricingRuleModal onClose={vi.fn()} onSaved={vi.fn()} />);
    fireEvent.change(screen.getByLabelText("نطاق التطبيق"), { target: { value: "product" } });

    expect(screen.getByText("لا توجد منتجات متاحة لاستخدامها في قاعدة تسعير.")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "حفظ قاعدة التسعير" })).toBeDisabled();
  });

  it("distinguishes a successful empty category lookup and blocks saving the unavailable scope", () => {
    mocks.states.categories = {
      data: [],
      loading: false,
      error: null,
      refetch: mocks.refetchCategories,
    };

    render(<PricingRuleModal onClose={vi.fn()} onSaved={vi.fn()} />);
    fireEvent.change(screen.getByLabelText("نطاق التطبيق"), { target: { value: "category" } });

    expect(screen.getByText("لا توجد تصنيفات متاحة لاستخدامها في قاعدة تسعير.")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "حفظ قاعدة التسعير" })).toBeDisabled();
  });

  it("creates a rule only after a real product option is selected and confirms the saved result", async () => {
    mocks.states.products = {
      data: [{ id: PRODUCT_ID, name: "منتج اختبار", item_code: "SKU-001" }],
      loading: false,
      error: null,
      refetch: mocks.refetchProducts,
    };
    mocks.states.categories = {
      data: [{ id: CATEGORY_ID, name: "تصنيف اختبار" }],
      loading: false,
      error: null,
      refetch: mocks.refetchCategories,
    };
    const onSaved = vi.fn().mockResolvedValue(undefined);

    render(<PricingRuleModal onClose={vi.fn()} onSaved={onSaved} />);
    fireEvent.change(screen.getByLabelText("اسم القاعدة"), { target: { value: "قاعدة اختبار" } });
    fireEvent.change(screen.getByLabelText("نطاق التطبيق"), { target: { value: "product" } });
    fireEvent.change(screen.getByLabelText("المنتج"), { target: { value: PRODUCT_ID } });

    expect(screen.getByRole("button", { name: "حفظ قاعدة التسعير" })).toBeEnabled();
    fireEvent.click(screen.getByRole("button", { name: "حفظ قاعدة التسعير" }));

    await waitFor(() => expect(mocks.createPricingRule).toHaveBeenCalledTimes(1));
    expect(mocks.createPricingRule).toHaveBeenCalledWith({
      name: "قاعدة اختبار",
      scope_type: "product",
      scope_value: PRODUCT_ID,
      target_tier: "both",
      calculation_method: "add_percentage",
      base_source: "base_price",
      adjustment_value: 10,
      min_quantity: 1,
      min_price: null,
      max_price: null,
      priority: 100,
      effective_from: null,
      effective_until: null,
    });
    await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1));
  });
});
