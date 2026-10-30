import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { act, useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  createMemoryHistory,
  createRootRouteWithContext,
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
import { offlineCatalogCacheKeys } from "@/lib/offline-catalog-cache";

function TestRoot() {
  const { queryClient } = TestRootRoute.useRouteContext();
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <AuthScopedOutlet />
      </AuthProvider>
    </QueryClientProvider>
  );
}

function IdentityProbe() {
  const { user, ready } = useAuth();
  const [privateRouteState] = useState(() =>
    user ? `${user.id}:private-route-state` : "anonymous:private-route-state",
  );
  return (
    <>
      <output>{!ready ? "auth-loading" : user ? `${user.id}:${user.roles.join(",")}` : "signed-out"}</output>
      <output data-testid="private-route-state">{privateRouteState}</output>
    </>
  );
}

const TestRootRoute = createRootRouteWithContext<{ queryClient: QueryClient }>()({ component: TestRoot });
const ProbeRoute = createRoute({
  getParentRoute: () => TestRootRoute,
  path: "/",
  component: IdentityProbe,
});
const testRouteTree = TestRootRoute.addChildren([ProbeRoute]);

describe("authentication-scoped query cache boundary", () => {
  beforeEach(() => {
    window.localStorage.clear();
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
    window.localStorage.clear();
  });

  async function mountWithPrivateCache() {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    queryClient.setQueryData(["private-finance"], { sentinel: "TENANT-A-PRIVATE-BALANCE" });
    const router = createRouter({
      routeTree: testRouteTree,
      history: createMemoryHistory({ initialEntries: ["/"] }),
      context: { queryClient },
    });
    render(<RouterProvider router={router} />);
    await screen.findByText("auth-user-a:customer");
    await screen.findByText("auth-user-a:private-route-state");
    await waitFor(() => expect(queryClient.getQueryData(["private-finance"])).toBeUndefined());
    return { router, queryClient };
  }

  it("clears cached private data on account switch and on logout", async () => {
    const { queryClient } = await mountWithPrivateCache();
    const customerACatalogKeys = offlineCatalogCacheKeys("profile-auth-user-a")!;
    window.localStorage.setItem("aghbari:catalog:v1", "legacy-private-catalog");
    window.localStorage.setItem("aghbari:catalog:last-server-sync:v1", "legacy-private-time");
    window.localStorage.setItem(customerACatalogKeys.catalogKey, "private-catalog-a");
    window.localStorage.setItem(customerACatalogKeys.lastServerSyncKey, "private-catalog-a-time");
    window.localStorage.setItem(customerACatalogKeys.scopeKey, "private-scope-a");

    queryClient.setQueryData(["private-finance"], { sentinel: "TENANT-A-PRIVATE-BALANCE" });
    authMocks.currentUserId = "auth-user-b";
    authMocks.roles = ["manager"];
    await act(async () => {
      authMocks.listener?.("SIGNED_IN");
      await new Promise((resolve) => setTimeout(resolve, 0));
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    await screen.findByText("auth-user-b:manager");
    await screen.findByText("auth-user-b:private-route-state");
    await waitFor(() => expect(queryClient.getQueryData(["private-finance"])).toBeUndefined());
    expect(window.localStorage.getItem(customerACatalogKeys.catalogKey)).toBeNull();
    expect(window.localStorage.getItem(customerACatalogKeys.lastServerSyncKey)).toBeNull();
    expect(window.localStorage.getItem(customerACatalogKeys.scopeKey)).toBeNull();
    expect(window.localStorage.getItem("aghbari:catalog:v1")).toBeNull();
    expect(window.localStorage.getItem("aghbari:catalog:last-server-sync:v1")).toBeNull();

    queryClient.setQueryData(["private-finance"], { sentinel: "TENANT-B-PRIVATE-BALANCE" });
    const customerBCatalogKeys = offlineCatalogCacheKeys("profile-auth-user-b")!;
    window.localStorage.setItem(customerBCatalogKeys.catalogKey, "private-catalog-b");
    window.localStorage.setItem(customerBCatalogKeys.lastServerSyncKey, "private-catalog-b-time");
    window.localStorage.setItem(customerBCatalogKeys.scopeKey, "private-scope-b");
    authMocks.currentUserId = null;
    await act(async () => {
      authMocks.listener?.("SIGNED_OUT");
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    await screen.findByText("signed-out");
    await screen.findByText("anonymous:private-route-state");
    await waitFor(() => expect(queryClient.getQueryData(["private-finance"])).toBeUndefined());
    expect(window.localStorage.getItem(customerBCatalogKeys.catalogKey)).toBeNull();
    expect(window.localStorage.getItem(customerBCatalogKeys.lastServerSyncKey)).toBeNull();
    expect(window.localStorage.getItem(customerBCatalogKeys.scopeKey)).toBeNull();
  });

  it("does not let an older profile refresh overwrite a newly signed-in account", async () => {
    await mountWithPrivateCache();
    authMocks.rpc.mockClear();

    let resolveOldProfile!: (value: {
      data: { profile_id: string; full_name: string; email: string; roles: string[] };
      error: null;
    }) => void;
    const oldProfile = new Promise<{
      data: { profile_id: string; full_name: string; email: string; roles: string[] };
      error: null;
    }>((resolve) => { resolveOldProfile = resolve; });
    authMocks.rpc.mockImplementationOnce(() => oldProfile);

    act(() => authMocks.listener?.("TOKEN_REFRESHED"));
    await waitFor(() => expect(authMocks.rpc).toHaveBeenCalledTimes(1));

    authMocks.currentUserId = "auth-user-b";
    authMocks.roles = ["manager"];
    act(() => authMocks.listener?.("SIGNED_IN"));
    await screen.findByText("auth-user-b:manager");

    resolveOldProfile({
      data: {
        profile_id: "profile-auth-user-a",
        full_name: "auth-user-a",
        email: "auth-user-a@example.test",
        roles: ["customer"],
      },
      error: null,
    });
    await act(async () => {
      await oldProfile;
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(screen.getByText("auth-user-b:manager")).toBeInTheDocument();
    expect(screen.queryByText("auth-user-a:customer")).not.toBeInTheDocument();
  });

  it("does not restore an authenticated identity when a profile read resolves after logout", async () => {
    await mountWithPrivateCache();
    authMocks.rpc.mockClear();

    let resolveOldProfile!: (value: {
      data: { profile_id: string; full_name: string; email: string; roles: string[] };
      error: null;
    }) => void;
    const oldProfile = new Promise<{
      data: { profile_id: string; full_name: string; email: string; roles: string[] };
      error: null;
    }>((resolve) => { resolveOldProfile = resolve; });
    authMocks.rpc.mockImplementationOnce(() => oldProfile);

    act(() => authMocks.listener?.("TOKEN_REFRESHED"));
    await waitFor(() => expect(authMocks.rpc).toHaveBeenCalledTimes(1));

    authMocks.currentUserId = null;
    act(() => authMocks.listener?.("SIGNED_OUT"));
    await screen.findByText("signed-out");

    resolveOldProfile({
      data: {
        profile_id: "profile-auth-user-a",
        full_name: "auth-user-a",
        email: "auth-user-a@example.test",
        roles: ["customer"],
      },
      error: null,
    });
    await act(async () => {
      await oldProfile;
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(screen.getByText("signed-out")).toBeInTheDocument();
    expect(screen.queryByText("auth-user-a:customer")).not.toBeInTheDocument();
  });

  it("refreshes on INITIAL_SESSION and ignores the prior identity's pending profile read", async () => {
    await mountWithPrivateCache();
    authMocks.rpc.mockClear();

    let resolveOldProfile!: (value: {
      data: { profile_id: string; full_name: string; email: string; roles: string[] };
      error: null;
    }) => void;
    const oldProfile = new Promise<{
      data: { profile_id: string; full_name: string; email: string; roles: string[] };
      error: null;
    }>((resolve) => { resolveOldProfile = resolve; });
    authMocks.rpc.mockImplementationOnce(() => oldProfile);

    act(() => authMocks.listener?.("TOKEN_REFRESHED"));
    await waitFor(() => expect(authMocks.rpc).toHaveBeenCalledTimes(1));

    authMocks.currentUserId = "auth-user-b";
    authMocks.roles = ["manager"];
    act(() => authMocks.listener?.("INITIAL_SESSION"));
    await screen.findByText("auth-user-b:manager");
    await waitFor(() => expect(authMocks.rpc).toHaveBeenCalledTimes(2));

    resolveOldProfile({
      data: {
        profile_id: "profile-auth-user-a",
        full_name: "auth-user-a",
        email: "auth-user-a@example.test",
        roles: ["customer"],
      },
      error: null,
    });
    await act(async () => {
      await oldProfile;
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(screen.getByText("auth-user-b:manager")).toBeInTheDocument();
    expect(screen.queryByText("auth-user-a:customer")).not.toBeInTheDocument();
  });

  it("clears cached data when effective roles change for the same account", async () => {
    const { queryClient } = await mountWithPrivateCache();
    queryClient.setQueryData(["private-inventory"], { sentinel: "STAFF-ONLY-STOCK" });
    authMocks.roles = ["manager"];
    await act(async () => {
      authMocks.listener?.("TOKEN_REFRESHED");
      await new Promise((resolve) => setTimeout(resolve, 0));
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    await screen.findByText("auth-user-a:manager");
    await waitFor(() => expect(queryClient.getQueryData(["private-inventory"])).toBeUndefined());
  });

  it("clears private cache on auth refresh when identity and roles stay unchanged", async () => {
    const { queryClient } = await mountWithPrivateCache();
    queryClient.setQueryData(["private-finance"], { sentinel: "PRE-REFRESH-PRIVATE-BALANCE" });

    await act(async () => {
      authMocks.listener?.("TOKEN_REFRESHED");
      await new Promise((resolve) => setTimeout(resolve, 0));
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    await waitFor(() => expect(queryClient.getQueryData(["private-finance"])).toBeUndefined());
    await screen.findByText("auth-user-a:customer");
  });

});
