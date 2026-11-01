import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  onAuthStateChange: vi.fn(),
  rpc: vi.fn(),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: {
      getSession: mocks.getSession,
      onAuthStateChange: mocks.onAuthStateChange,
    },
    rpc: mocks.rpc,
  },
}));

import { getCurrentTenantScope } from "@/lib/supabase";

const USER_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const PROFILE_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const ORG_A = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const ORG_B = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const AUTHENTICATED_SESSION = {
  data: { session: { user: { id: USER_ID } } },
  error: null,
};

function authStateSubscription() {
  return { data: { subscription: { unsubscribe: vi.fn() } } };
}

function tenantScopeResponse(organizationId: string) {
  return {
    data: {
      profile_id: PROFILE_ID,
      organization_id: organizationId,
      warehouse_id: null,
      is_staff: false,
      can_manage_customers: false,
    },
    error: null,
  };
}


describe("server tenant scope refresh", () => {
  beforeEach(() => {
    mocks.getSession.mockReset().mockResolvedValue(AUTHENTICATED_SESSION);
    mocks.onAuthStateChange.mockReset().mockReturnValue(authStateSubscription());
    mocks.rpc.mockReset().mockResolvedValue(tenantScopeResponse(ORG_A));
  });

  it("bypasses the per-user memoized scope for explicit revalidation and caches the new result", async () => {
    const first = await getCurrentTenantScope();
    expect(first.organizationId).toBe(ORG_A);
    expect(mocks.rpc).toHaveBeenCalledTimes(1);

    mocks.rpc.mockResolvedValueOnce(tenantScopeResponse(ORG_B));

    const refreshed = await getCurrentTenantScope({ forceRefresh: true });
    expect(refreshed.organizationId).toBe(ORG_B);
    expect(mocks.rpc).toHaveBeenCalledTimes(2);

    const cached = await getCurrentTenantScope();
    expect(cached.organizationId).toBe(ORG_B);
    expect(mocks.rpc).toHaveBeenCalledTimes(2);
  });
});
