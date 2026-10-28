import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { act } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const authMocks = vi.hoisted(() => ({
  currentUserId: "auth-user-a" as string | null,
  roles: ["customer"] as string[],
  listener: undefined as ((event: string) => void) | undefined,
  getSession: vi.fn(),
  rpc: vi.fn(),
}));

vi.mock("@/lib/supabase", () => ({
  supabase: {
    auth: {
      getSession: authMocks.getSession,
      onAuthStateChange: (callback: (event: string) => void) => {
        authMocks.listener = callback;
        return { data: { subscription: { unsubscribe: vi.fn() } } };
      },
    },
    rpc: authMocks.rpc,
  },
}));

import { AuthProvider, useAuth } from "@/lib/auth";
import { AuthScopedOutlet } from "@/routes/__root";

let activeQueryClient: QueryClient;

function TestRoot() {
  return (
    <QueryClientProvider client={activeQueryClient}>
      <AuthProvider>
        <AuthScopedOutlet />
      </AuthProvider>
    </QueryClientProvider>
  );
}

function IdentityProbe() {
  const { user, ready } = useAuth();
  return <output>{!ready ? "auth-loading" : user?.id ?? "signed-out"}</output>;
}

const TestRootRoute = createRootRoute()({ component: TestRoot });
const ProbeRoute = createRoute({
  getParentRoute: () => TestRootRoute,
  path: "/",
  component: IdentityProbe,
});
const testRouteTree = TestRootRoute.addChildren([ProbeRoute]);

describe("authentication-scoped query cache boundary", () => {
  beforeEach(() => {
    authMocks.currentUserId = "auth-user-a";
    authMocks.roles = ["customer"];
    authMocks.listener = undefined;
    authMocks.getSession.mockReset().mockImplementation(async () => ({
      data: {
        session: authMocks.currentUserId
          ? { user: { id: authMocks.currentUserId, user_metadata: { full_name: authMocks.currentUserId } } }
          : null,
      },
      error: null,
    }));
    authMocks.rpc.mockReset().mockImplementation(async () => ({
      data: {
        profile_id: `profile-${authMocks.currentUserId}`,
        full_name: authMocks.currentUserId ?? "",
        email: `${authMocks.currentUserId ?? "signed-out"}@example.test`,
        roles: [...authMocks.roles],
      },
      error: null,
    }));
  });

  afterEach(() => {
    cleanup();
    activeQueryClient?.clear();
  });

  async function mountWithPrivateCache() {
    activeQueryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    activeQueryClient.setQueryData(["private-finance"], { sentinel: "TENANT-A-PRIVATE-BALANCE" });
    const router = createRouter({
      routeTree: testRouteTree,
      history: createMemoryHistory({ initialEntries: ["/"] }),
    });
    render(<RouterProvider router={router} />);
    await screen.findByText("auth-user-a");
    await waitFor(() => expect(activeQueryClient.getQueryData(["private-finance"])).toBeUndefined());
    return router;
  }

  it("clears cached private data on account switch and on logout", async () => {
    await mountWithPrivateCache();

    activeQueryClient.setQueryData(["private-finance"], { sentinel: "TENANT-A-PRIVATE-BALANCE" });
    authMocks.currentUserId = "auth-user-b";
    authMocks.roles = ["manager"];
    await act(async () => {
      authMocks.listener?.("SIGNED_IN");
      await new Promise((resolve) => setTimeout(resolve, 0));
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    await screen.findByText("auth-user-b");
    await waitFor(() => expect(activeQueryClient.getQueryData(["private-finance"])).toBeUndefined());

    activeQueryClient.setQueryData(["private-finance"], { sentinel: "TENANT-B-PRIVATE-BALANCE" });
    authMocks.currentUserId = null;
    await act(async () => {
      authMocks.listener?.("SIGNED_OUT");
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    await screen.findByText("signed-out");
    await waitFor(() => expect(activeQueryClient.getQueryData(["private-finance"])).toBeUndefined());
  });

  it("clears cached data when effective roles change for the same account", async () => {
    await mountWithPrivateCache();
    activeQueryClient.setQueryData(["private-inventory"], { sentinel: "STAFF-ONLY-STOCK" });
    authMocks.roles = ["manager"];
    await act(async () => {
      authMocks.listener?.("TOKEN_REFRESHED");
      await new Promise((resolve) => setTimeout(resolve, 0));
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    await screen.findByText("auth-user-a");
    await waitFor(() => expect(activeQueryClient.getQueryData(["private-inventory"])).toBeUndefined());
  });
});
