import { act } from "react";
import type { ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient } from "@tanstack/react-query";
import { createMemoryHistory, createRouter, RouterProvider } from "@tanstack/react-router";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth", () => ({
  AuthProvider: ({ children }: { children: ReactNode }) => children,
  useAuth: () => ({
    user: { isStaff: false, profileId: "route-test-customer", name: "Buyer" },
    configurationError: null,
    ready: true,
  }),
}));

vi.mock("@/components/CustomerWorkflows", () => ({
  CustomerAddressesPage: () => <div data-testid="customer-addresses-page" />,
  CustomerInvoicesPage: () => <div data-testid="customer-invoices-page" />,
  CustomerStatementPage: () => <div data-testid="customer-statement-page" />,
  CommerceAssistantPage: () => <div data-testid="commerce-assistant-page" />,
  BarcodeWorkspacePage: () => <div data-testid="barcode-workspace-page" />,
  OfflineWorkspacePage: () => <div data-testid="offline-workspace-page" />,
  QuoteWorkspacePage: () => <div data-testid="quote-workspace-page" />,
  ReorderWorkspacePage: () => <div data-testid="reorder-workspace-page" />,
  CustomerCompanyContactsPage: () => <div data-testid="company-contacts-page">company contacts mounted</div>,
}));

vi.mock("@/components/CustomerCompanyMembers", () => ({
  CustomerCompanyMembersPage: () => <div data-testid="company-members-page">company members mounted</div>,
  CompanyInvitationAcceptancePage: ({ initialToken }: { initialToken?: string }) => (
    <div
      data-testid="company-invitation-page"
      data-token={initialToken ?? new URLSearchParams(window.location.search).get("token") ?? ""}
    >
      company invitation mounted
    </div>
  ),
}));

vi.mock("@/components/CustomerActivationInvitationPage", () => ({
  CustomerActivationInvitationPage: ({ token }: { token: string }) => (
    <div data-testid="customer-activation-page" data-token={token}>customer activation mounted</div>
  ),
}));

vi.mock("@/lib/supabase", () => ({
  supabase: { rpc: vi.fn(async () => ({ data: null, error: null })) },
  ORG_ID: "route-test-organization",
  ADMIN_PROFILE_ID: "route-test-admin",
  WAREHOUSE_ID: "route-test-warehouse",
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

describe("customer company and token routes resolve through the generated route tree", () => {
  it.each([
    { path: "/addresses", testId: "customer-addresses-page" },
    { path: "/company/contacts", testId: "company-contacts-page" },
    { path: "/invoices", testId: "customer-invoices-page" },
    { path: "/statement", testId: "customer-statement-page" },
    { path: "/assistant", testId: "commerce-assistant-page" },
    { path: "/barcode", testId: "barcode-workspace-page" },
    { path: "/offline", testId: "offline-workspace-page" },
    { path: "/quotes", testId: "quote-workspace-page" },
    { path: "/reorder", testId: "reorder-workspace-page" },
    { path: "/company/members", testId: "company-members-page" },
    { path: "/company/accept-invitation?token=query-invitation-test-token", testId: "company-invitation-page" },
    { path: "/invite/path-invitation-test-token", testId: "company-invitation-page", token: "path-invitation-test-token" },
    { path: "/customer/activate/path-activation-test-token", testId: "customer-activation-page", token: "path-activation-test-token" },
  ])("resolves $path to its real route wrapper", async ({ path, testId, token }) => {
    const mount = await mountAt(path);
    const page = mount.host.querySelector(`[data-testid="${testId}"]`);

    expect(page).not.toBeNull();
    expect(mount.host.textContent).not.toContain("Application error");
    expect(mount.host.textContent).not.toContain("الصفحة التي تبحث عنها غير موجودة");
    if (token) expect(page).toHaveAttribute("data-token", token);
  });
});
