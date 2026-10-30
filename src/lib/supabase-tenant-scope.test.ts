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

describe("server tenant scope refresh", () => {
  beforeEach(() => {
    mocks.getSession.mockReset().mockResolvedValue({
      data: { session: { user: { id: USER_ID } } },
      error: null,
    });
    mocks.onAuthStateChange.mockReset().mockReturnValue({
      data: { subscription: { unsubscribe: vi.fn() } },
    });
    mocks.rpc.mockReset().mockImplementation(async () => ({
      data: {
        profile_id: PROFILE_ID,
        organization_id: ORG_A,
        warehouse_id: null,
        is_staff: false,
        can_manage_customers: false,
      },
      error: null,
    }));
  });

  it("bypasses the per-user memoized scope for explicit revalidation and caches the new result", async () => {
    const first = await getCurrentTenantScope();
    expect(first.organizationId).toBe(ORG_A);
    expect(mocks.rpc).toHaveBeenCalledTimes(1);

    mocks.rpc.mockResolvedValueOnce({
      data: {
        profile_id: PROFILE_ID,
        organization_id: ORG_B,
        warehouse_id: null,
        is_staff: false,
        can_manage_customers: false,
      },
      error: null,
    });

    const refreshed = await getCurrentTenantScope({ forceRefresh: true });
    expect(refreshed.organizationId).toBe(ORG_B);
    expect(mocks.rpc).toHaveBeenCalledTimes(2);

    const cached = await getCurrentTenantScope();
    expect(cached.organizationId).toBe(ORG_B);
    expect(mocks.rpc).toHaveBeenCalledTimes(2);
  });
});
