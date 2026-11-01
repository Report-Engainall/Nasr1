import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

const mocks = vi.hoisted(() => ({
  fetchDashboardStats: vi.fn(),
  fetchProducts: vi.fn(),
  fetchOrders: vi.fn(),
  fetchStoreExecutiveAnalytics: vi.fn(),
  useAuth: vi.fn(),
  navigate: vi.fn(),
}));

vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>();
  return {
    ...actual,
    fetchDashboardStats: mocks.fetchDashboardStats,
    fetchProducts: mocks.fetchProducts,
    fetchOrders: mocks.fetchOrders,
    fetchStoreExecutiveAnalytics: mocks.fetchStoreExecutiveAnalytics,
  };
});

function resolveUseFetchResult(fetcher: unknown) {
  if (fetcher === mocks.fetchDashboardStats) {
    return {
      data: { totalSales: 0, orderCount: 0, lowStockCount: 0 },
      loading: false,
      error: null,
      refetch: vi.fn(),
    };
  }
  if (fetcher === mocks.fetchProducts || fetcher === mocks.fetchOrders) {
    return { data: [], loading: false, error: null, refetch: vi.fn() };
  }
  return { data: [], loading: false, error: null, refetch: vi.fn() };
}

vi.mock("@/lib/useFetch", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/useFetch")>();
  return { ...actual, useFetch: resolveUseFetchResult };
});

vi.mock("@/lib/auth", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/auth")>();
  return { ...actual, useAuth: mocks.useAuth };
});

vi.mock("@tanstack/react-router", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@tanstack/react-router")>();
  return { ...actual, useNavigate: () => mocks.navigate };
});

vi.mock("@/components/ExecutiveStoreAnalytics", () => ({
  ExecutiveStoreAnalytics: () => (
    <section data-testid="executive-store-analytics">analytics test double</section>
  ),
}));

vi.mock("@/components/UnifiedOnyxAnalysisPanel", () => ({
  UnifiedOnyxAnalysisPanel: () => null,
}));

import { AdminApp } from "@/components/AghbariApp";

beforeEach(() => {
  mocks.useAuth.mockReturnValue({
    ready: true,
    user: {
      id: "admin-test-user",
      profileId: "admin-test-profile",
      email: "admin@example.test",
      name: "مدير الاختبار",
      roles: ["admin"],
      isStaff: true,
    },
    signOut: vi.fn(),
  });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("admin reports runtime analytics mount", () => {
  it("mounts ExecutiveStoreAnalytics exactly once in the real reports view", () => {
    render(<AdminApp initialView="reports" />);

    expect(screen.getAllByTestId("executive-store-analytics")).toHaveLength(1);
  });
});
