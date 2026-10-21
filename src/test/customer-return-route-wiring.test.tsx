import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from "@tanstack/react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  user: {
    roles: ["admin", "manager"] as string[],
    isStaff: true,
    name: "مدير الاختبار",
    email: "manager@example.test",
  },
  fetchOrders: vi.fn(async () => []),
}));

vi.mock("@/lib/api", () => ({
  createCategory: vi.fn(),
  createCustomer: vi.fn(),
  createProduct: vi.fn(),
  createPricingRule: vi.fn(),
  deletePricingRule: vi.fn(),
  deleteProduct: vi.fn(),
  fetchAiAlerts: vi.fn(),
  fetchActiveInventoryWarehouses: vi.fn(),
  fetchInventoryReorderPoint: vi.fn(),
  fetchCategories: vi.fn(),
  fetchCustomers: vi.fn(),
  fetchDashboardStats: vi.fn(),
  fetchOrders: mocks.fetchOrders,
  fetchPricingRules: vi.fn(),
  fetchProducts: vi.fn(),
  setInventoryReorderPoint: vi.fn(),
  transferInventory: vi.fn(),
  updateCustomerStatus: vi.fn(),
  updatePricingRule: vi.fn(),
  updateProduct: vi.fn(),
  uploadProductImage: vi.fn(),
  approvePricingRule: vi.fn(),
  previewCustomerTierPrice: vi.fn(),
}));

vi.mock("@/lib/useFetch", () => ({
  useFetch: () => ({ data: [], loading: false, error: null, refetch: vi.fn() }),
}));

vi.mock("@/lib/auth", () => ({
  useAuth: () => ({ user: mocks.user, ready: true, signOut: vi.fn() }),
}));

vi.mock("@/components/CustomerReturnReviewQueue", () => ({
  CustomerReturnReviewQueue: () => <section data-testid="return-review-queue">مراجعة المرتجعات</section>,
}));
vi.mock("@/components/CustomerReturnReceiptQueue", () => ({
  CustomerReturnReceiptQueue: () => <section data-testid="return-receipt-queue">استلام المرتجعات</section>,
}));
vi.mock("@/components/CustomerReturnCreditMemoQueue", () => ({
  CustomerReturnCreditMemoQueue: () => <section data-testid="return-credit-queue">الإشعارات الدائنة</section>,
}));

vi.mock("@/components/AdminPages", () => ({
  AiCenter: () => <div />,
  Devices: () => <div />,
  Field: () => <input />,
  Loading: () => <div />,
  ErrorBox: ({ message }: { message: string }) => <div role="alert">{message}</div>,
  Empty: ({ text }: { text: string }) => <p>{text}</p>,
  Button: ({ children, onClick }: { children?: ReactNode; onClick?: () => void }) => <button onClick={onClick}>{children}</button>,
  TableWrap: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  Modal: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  Notifications: () => <div />,
  OrderDetail: () => <div />,
  SettingsPage: () => <div />,
  Suppliers: () => <div />,
}));

vi.mock("@/components/CustomerWorkflows", () => ({
  StaffQuotesPage: () => <div data-testid="staff-quotes" />,
  StaffFinancePage: () => <div data-testid="staff-finance" />,
}));
vi.mock("@/components/OperationsCenter", () => ({ OperationsCenter: () => <div /> }));
vi.mock("@/lib/business-intelligence", () => ({
  buildBusinessSignals: vi.fn(() => []),
  buildBusinessStatusBreakdown: vi.fn(() => []),
}));
vi.mock("@/components/PricingGrid", () => ({ PricingGrid: () => <div /> }));
vi.mock("@/components/AdminAuditLog", () => ({ AdminAuditLog: () => <div /> }));
vi.mock("@/components/AdminCustomer360", () => ({ AdminCustomer360: () => <div /> }));
vi.mock("@/components/CustomerActivationInvitationDialog", () => ({ CustomerActivationInvitationDialog: () => <div /> }));
vi.mock("@/components/TaskCenter", () => ({ TaskCenter: () => <div /> }));
vi.mock("@/components/InventoryStockCountPage", () => ({ InventoryStockCountPage: () => <div /> }));
vi.mock("@/components/InventoryTransferHistoryPage", () => ({ InventoryTransferHistoryPage: () => <div /> }));
vi.mock("@/components/PurchaseOrdersPage", () => ({ PurchaseOrdersPage: () => <div /> }));
vi.mock("@/components/UnifiedImportEngine", () => ({ UnifiedImportEngine: () => <div /> }));
vi.mock("@/components/OnyxSnapshotCenter", () => ({ OnyxSnapshotCenter: () => <div /> }));
vi.mock("@/components/UnifiedOnyxAnalysisPanel", () => ({ UnifiedOnyxAnalysisPanel: () => <div /> }));
vi.mock("@/components/ExecutiveStoreAnalytics", () => ({ ExecutiveStoreAnalytics: () => <div /> }));
vi.mock("@/components/PromotionManager", () => ({ PromotionManager: () => <div /> }));
vi.mock("@/lib/product-image", () => ({ toWebp: vi.fn(), validateProductImageFile: vi.fn() }));
vi.mock("@/lib/customer-input", () => ({ validateCustomerInput: vi.fn() }));
vi.mock("@/components/Login", () => ({ Login: () => <div data-testid="login" /> }));
vi.mock("@/components/ui/command", () => ({
  CommandDialog: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  CommandInput: () => <input />,
  CommandList: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  CommandEmpty: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  CommandGroup: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  CommandItem: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
}));
vi.mock("@/components/ui/dialog", () => ({
  DialogDescription: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  DialogTitle: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
}));

import { AdminApp } from "@/components/AghbariApp";

type MountedApp = { host: HTMLDivElement; root: Root };

const mounted: MountedApp[] = [];

async function mountAt(path: "/admin/orders" | "/admin/finance") {
  const rootRoute = createRootRoute({ component: () => <Outlet /> });
  const ordersRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/admin/orders",
    component: () => <AdminApp initialView="orders" />,
  });
  const financeRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/admin/finance",
    component: () => <AdminApp initialView="finance" />,
  });
  const routeTree = rootRoute.addChildren([ordersRoute, financeRoute]);
  const router = createRouter({ routeTree, history: createMemoryHistory({ initialEntries: [path] }) });
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  mounted.push({ host, root });
  await router.load();
  await act(async () => {
    root.render(<RouterProvider router={router} />);
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
  return host;
}

beforeEach(() => {
  mocks.user = {
    roles: ["admin", "manager"],
    isStaff: true,
    name: "مدير الاختبار",
    email: "manager@example.test",
  };
});

afterEach(async () => {
  for (const item of mounted.splice(0)) {
    await act(async () => item.root.unmount());
    item.host.remove();
  }
});

describe("customer return workflow route wiring", () => {
  it("mounts review and physical receipt queues in the admin orders route for manager", async () => {
    const host = await mountAt("/admin/orders");
    expect(host.querySelector('[data-testid="return-review-queue"]')).not.toBeNull();
    expect(host.querySelector('[data-testid="return-receipt-queue"]')).not.toBeNull();
    expect(host.querySelector('[data-testid="return-credit-queue"]')).toBeNull();
  });

  it("does not expose administrative receipt/review actions to ordinary staff", async () => {
    mocks.user = {
      roles: ["staff"],
      isStaff: true,
      name: "موظف الاختبار",
      email: "staff@example.test",
    };
    const host = await mountAt("/admin/orders");
    expect(host.querySelector('[data-testid="return-review-queue"]')).toBeNull();
    expect(host.querySelector('[data-testid="return-receipt-queue"]')).toBeNull();
  });

  it("mounts the source-linked credit memo queue in finance for accountant", async () => {
    mocks.user = {
      roles: ["accountant"],
      isStaff: true,
      name: "محاسب الاختبار",
      email: "accountant@example.test",
    };
    const host = await mountAt("/admin/finance");
    expect(host.querySelector('[data-testid="staff-finance"]')).not.toBeNull();
    expect(host.querySelector('[data-testid="return-credit-queue"]')).not.toBeNull();
    expect(host.querySelector('[data-testid="return-receipt-queue"]')).toBeNull();
  });
});
