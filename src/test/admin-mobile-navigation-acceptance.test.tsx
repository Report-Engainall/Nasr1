import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

const mocks = vi.hoisted(() => ({
  navigate: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  useAuth: () => ({
    user: {
      id: "mobile-nav-admin-user",
      profileId: "mobile-nav-admin-profile",
      email: "mobile-nav@example.test",
      name: "مدير التنقل",
      roles: ["admin"],
      isStaff: true,
    },
    ready: true,
    loading: false,
    configurationError: null,
    signOut: vi.fn(),
  }),
  AuthProvider: ({ children }: { children: ReactNode }) => children,
}));

vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => mocks.navigate,
}));

vi.mock("@/lib/api", () => ({
  createCustomer: vi.fn(), createProduct: vi.fn(), createPricingRule: vi.fn(),
  deletePricingRule: vi.fn(), deleteProduct: vi.fn(), fetchAiAlerts: vi.fn(),
  fetchActiveInventoryWarehouses: vi.fn(), fetchInventoryReorderPoint: vi.fn(),
  fetchCategories: vi.fn(), fetchCustomers: vi.fn(), fetchDashboardStats: vi.fn(),
  fetchOrders: vi.fn(), fetchPricingRules: vi.fn(), fetchProducts: vi.fn(),
  setInventoryReorderPoint: vi.fn(), togglePricingRule: vi.fn(), transferInventory: vi.fn(),
  updateCustomerStatus: vi.fn(), updateCustomerTier: vi.fn(), updatePricingRule: vi.fn(),
  updateProduct: vi.fn(), uploadProductImage: vi.fn(), removeProductImage: vi.fn(),
  ProductImageCleanupError: class ProductImageCleanupError extends Error {},
  approvePricingRule: vi.fn(), previewCustomerTierPrice: vi.fn(),
}));

vi.mock("@/lib/admin-catalog-commands", () => ({
  archiveAdminCatalogCategory: vi.fn(),
  createAdminCatalogCategory: vi.fn(),
  renameAdminCatalogCategory: vi.fn(),
}));
vi.mock("@/lib/useFetch", () => ({ useFetch: vi.fn() }));
vi.mock("@/lib/customer-directory", () => ({ fetchCustomerDirectoryPage: vi.fn() }));
vi.mock("@/lib/format", () => ({
  formatCurrency: vi.fn(() => ""),
  formatDateShort: vi.fn(() => ""),
  formatNumber: vi.fn(() => ""),
}));
vi.mock("@/lib/types", () => ({
  CUSTOMER_STATUS_LABELS: {},
  ORDER_STATUS_LABELS: {},
}));
vi.mock("@/lib/business-intelligence", () => ({
  buildBusinessSignals: vi.fn(() => []),
  buildBusinessStatusBreakdown: vi.fn(() => []),
}));
vi.mock("@/lib/dashboard-metrics", () => ({
  dashboardAverageOrderDisplay: vi.fn(() => ""),
  dashboardSalesDisplay: vi.fn(() => ""),
}));
vi.mock("@/lib/inventory-metrics", () => ({
  getInventoryAvailabilityStatus: vi.fn(() => "unknown"),
}));
vi.mock("@/lib/product-image", () => ({
  toWebp: vi.fn(),
  validateProductImageFile: vi.fn(),
}));
vi.mock("@/lib/customer-input", () => ({ validateCustomerInput: vi.fn() }));

vi.mock("@/components/Login", () => ({ Login: () => null }));
vi.mock("@/components/DashboardLoadError", () => ({ DashboardLoadError: () => null }));
vi.mock("@/components/AdminPages", () => ({
  AiCenter: () => null,
  Field: () => null,
  Loading: () => null,
  ErrorBox: () => null,
  Empty: () => null,
  Button: () => null,
  TableWrap: () => null,
  Modal: () => null,
  Notifications: () => null,
  OrderDetail: () => null,
  SettingsPage: () => null,
  Suppliers: () => null,
}));
vi.mock("@/components/OperationsCenter", () => ({ OperationsCenter: () => null }));
vi.mock("@/components/PricingGrid", () => ({ PricingGrid: () => null }));
vi.mock("@/components/AdminAuditLog", () => ({ AdminAuditLog: () => null }));
vi.mock("@/components/AdminCustomer360", () => ({ AdminCustomer360: () => null }));
vi.mock("@/components/CustomerActivationInvitationDialog", () => ({ CustomerActivationInvitationDialog: () => null }));
vi.mock("@/components/CustomerManagerRoleAssignment", () => ({ CustomerManagerRoleAssignment: () => null }));
vi.mock("@/components/DeviceManagement", () => ({ DeviceManagement: () => null }));
vi.mock("@/components/TaskCenter", () => ({ TaskCenter: () => null }));
vi.mock("@/components/InventoryStockCountPage", () => ({ InventoryStockCountPage: () => null }));
vi.mock("@/components/InventoryTransferHistoryPage", () => ({ InventoryTransferHistoryPage: () => null }));
vi.mock("@/components/PurchaseOrdersPage", () => ({ PurchaseOrdersPage: () => null }));
vi.mock("@/components/UnifiedImportEngine", () => ({ UnifiedImportEngine: () => null }));
vi.mock("@/components/OnyxSnapshotCenter", () => ({ OnyxSnapshotCenter: () => null }));
vi.mock("@/components/UnifiedOnyxAnalysisPanel", () => ({ UnifiedOnyxAnalysisPanel: () => null }));
vi.mock("@/components/ExecutiveStoreAnalytics", () => ({ ExecutiveStoreAnalytics: () => null }));
vi.mock("@/components/PromotionManager", () => ({ PromotionManager: () => null }));
vi.mock("@/components/CustomerWorkflows", () => ({
  StaffQuotesPage: () => null,
  StaffFinancePage: () => null,
}));
vi.mock("@/components/ui/command", () => ({
  CommandDialog: () => null,
  CommandInput: () => null,
  CommandList: () => null,
  CommandEmpty: () => null,
  CommandGroup: () => null,
  CommandItem: () => null,
}));
vi.mock("@/components/ui/dialog", () => ({
  DialogDescription: () => null,
  DialogTitle: () => null,
}));

import { AdminApp } from "@/components/AghbariApp";

describe("admin mobile navigation runtime acceptance", () => {
  afterEach(() => {
    cleanup();
    mocks.navigate.mockReset();
  });

  it("opens the real drawer, moves focus inside, closes on Escape, and restores focus to the trigger", async () => {
    render(<AdminApp initialView="settings" />);

    const trigger = screen.getByRole("button", { name: "فتح القائمة الإدارية" });
    const sidebar = screen.getByRole("complementary", { name: "القائمة الإدارية" });
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    expect(sidebar.className).not.toContain("open");

    fireEvent.click(trigger);

    const nav = screen.getByRole("navigation", { name: "التنقل الإداري" });
    const firstItem = nav.querySelector("button");
    expect(firstItem).not.toBeNull();
    await waitFor(() => expect(document.activeElement).toBe(firstItem));
    expect(trigger).toHaveAttribute("aria-expanded", "true");
    expect(sidebar.className).toContain("open");

    fireEvent.keyDown(window, { key: "Escape" });

    await waitFor(() => expect(trigger).toHaveAttribute("aria-expanded", "false"));
    expect(sidebar.className).not.toContain("open");
    expect(document.activeElement).toBe(trigger);
  });

  it("closes the drawer and returns focus after selecting a navigation destination", async () => {
    render(<AdminApp initialView="settings" />);

    const trigger = screen.getByRole("button", { name: "فتح القائمة الإدارية" });
    fireEvent.click(trigger);
    const nav = screen.getByRole("navigation", { name: "التنقل الإداري" });
    const settings = Array.from(nav.querySelectorAll("button")).find((button) =>
      button.textContent?.includes("الإعدادات"),
    );
    expect(settings).toBeTruthy();

    await waitFor(() => expect(document.activeElement).toBe(nav.querySelector("button")));
    fireEvent.click(settings!);

    await waitFor(() => expect(trigger).toHaveAttribute("aria-expanded", "false"));
    expect(document.activeElement).toBe(trigger);
    expect(mocks.navigate).toHaveBeenCalledWith({ to: "/admin/settings" });
  });
});
