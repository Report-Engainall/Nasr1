import { act } from "react";
import type { ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient } from "@tanstack/react-query";
import { createMemoryHistory, createRouter, RouterProvider } from "@tanstack/react-router";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth", () => ({
  AuthProvider: ({ children }: { children: ReactNode }) => children,
  useAuth: () => ({
    user: {
      id: "admin-route-test-user",
      profileId: "admin-route-test-profile",
      name: "مدير الاختبار",
      roles: ["admin"],
      isStaff: true,
    },
    configurationError: null,
    ready: true,
    signOut: vi.fn(),
  }),
}));

vi.mock("@/lib/supabase", () => ({
  supabase: { rpc: vi.fn(async () => ({ data: null, error: null })) },
  ORG_ID: "admin-route-test-organization",
  ADMIN_PROFILE_ID: "admin-route-test-profile",
  WAREHOUSE_ID: "admin-route-test-warehouse",
}));

vi.mock("@/components/AghbariApp", () => ({
  AdminApp: ({ initialView }: { initialView?: string }) => (
    <main data-testid="admin-app" data-view={initialView ?? "dashboard"} />
  ),
}));

vi.mock("@/components/AsyncExportCenter", () => ({
  AsyncExportCenter: () => <main data-testid="async-export-center" />,
}));

vi.mock("@/components/CustomerReturnOperationsDrawer", () => ({
  CustomerReturnOperationsDrawer: ({ workflow }: { workflow: string }) => (
    <section data-testid={"return-operations-" + workflow} />
  ),
}));

vi.mock("@/components/OnyxInventoryReconciliationWorkspace", () => ({
  OnyxInventoryReconciliationWorkspace: () => (
    <section data-testid="onyx-reconciliation-workspace" />
  ),
}));

import { routeTree } from "@/routeTree.gen";

type Mount = { root: Root; host: HTMLDivElement; active: boolean };
const mounts: Mount[] = [];

async function mountAt(path: string): Promise<Mount> {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  const mount: Mount = { root, host, active: true };
  mounts.push(mount);

  const router = createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: [path] }),
    context: { queryClient: new QueryClient() },
  });
  await router.load();
  await act(async () => {
    root.render(<RouterProvider router={router} />);
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
  return mount;
}

async function unmount(mount: Mount) {
  if (!mount.active) return;
  await act(async () => mount.root.unmount());
  mount.active = false;
  mount.host.remove();
}

afterEach(async () => {
  for (const mount of mounts.splice(0)) await unmount(mount);
});

describe("admin routes mount the intended screen through the generated route tree", () => {
  it.each([
    { path: "/admin", view: "dashboard" },
    { path: "/admin/ai", view: "ai" },
    { path: "/admin/audit", view: "audit" },
    { path: "/admin/customers", view: "customers" },
    { path: "/admin/devices", view: "devices" },
    { path: "/admin/inventory-transfers", view: "inventory-transfers" },
    { path: "/admin/notifications", view: "notifications" },
    { path: "/admin/offers", view: "offers" },
    { path: "/admin/operations", view: "operations" },
    { path: "/admin/pricing", view: "pricing" },
    { path: "/admin/products", view: "products" },
    { path: "/admin/purchase-orders", view: "purchase-orders" },
    { path: "/admin/quotes", view: "quotes" },
    { path: "/admin/reports", view: "reports" },
    { path: "/admin/settings", view: "settings" },
    { path: "/admin/stock-count", view: "stock-count" },
    { path: "/admin/suppliers", view: "suppliers" },
    { path: "/admin/tasks", view: "tasks" },
    { path: "/admin/data", view: "data", extra: "onyx-reconciliation-workspace" },
    { path: "/admin/finance", view: "finance", extra: "return-operations-finance" },
    { path: "/admin/orders", view: "orders", extra: "return-operations-orders" },
  ])("mounts $path into the $view view", async ({ path, view, extra }) => {
    const mount = await mountAt(path);
    const screen = mount.host.querySelector('[data-testid="admin-app"]');

    expect(screen).not.toBeNull();
    expect(screen).toHaveAttribute("data-view", view);
    expect(mount.host.textContent).not.toContain("Application error");
    expect(mount.host.textContent).not.toContain("الصفحة التي تبحث عنها غير موجودة");
    if (extra) expect(mount.host.querySelector('[data-testid="' + extra + '"]')).not.toBeNull();
    if (path === "/admin/reports") {
      expect(mount.host.querySelector('a[href="/admin/exports"]')).not.toBeNull();
    }
  });

  it("mounts the dedicated async export center without substituting the generic admin dashboard", async () => {
    const mount = await mountAt("/admin/exports");

    expect(mount.host.querySelector('[data-testid="async-export-center"]')).not.toBeNull();
    expect(mount.host.querySelector('[data-testid="admin-app"]')).toBeNull();
    expect(mount.host.textContent).not.toContain("Application error");
    expect(mount.host.textContent).not.toContain("الصفحة التي تبحث عنها غير موجودة");
  });
});
