import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  rpc: vi.fn(),
  listener: undefined as ((event: string) => void) | undefined,
  role: "customer",
  subscriptionResult: () => ({ data: { subscription: { unsubscribe: vi.fn() } } }),
}));

vi.mock("@/lib/supabase", () => ({
  supabase: {
    auth: {
      getSession: mocks.getSession,
      onAuthStateChange: (callback: (event: string) => void) => {
        mocks.listener = callback;
        return mocks.subscriptionResult();
      },
    },
    rpc: mocks.rpc,
  },
}));

import { AuthProvider, useAuth } from "@/lib/auth";

function CurrentRoleProbe() {
  const { user, ready } = useAuth();
  return <output>{!ready ? "loading" : user?.roles.join(",") ?? "signed-out"}</output>;
}

describe("auth role refresh on session token refresh", () => {
  beforeEach(() => {
    mocks.role = "customer";
    mocks.listener = undefined;
    mocks.getSession.mockReset().mockResolvedValue({
      data: {
        session: {
          user: { id: "auth-user-1", user_metadata: { full_name: "Buyer" } },
        },
      },
      error: null,
    });
    mocks.rpc.mockReset().mockImplementation(async () => ({
      data: {
        profile_id: "profile-1",
        full_name: "Buyer",
        email: "buyer@example.test",
        roles: [mocks.role],
      },
      error: null,
    }));
  });

  afterEach(() => {
    cleanup();
  });

  it("reloads effective profile roles after TOKEN_REFRESHED", async () => {
    render(<AuthProvider><CurrentRoleProbe /></AuthProvider>);
    expect(await screen.findByText("customer")).toBeInTheDocument();
    expect(mocks.rpc).toHaveBeenCalledTimes(1);

    mocks.role = "manager";
    await act(async () => {
      mocks.listener?.("TOKEN_REFRESHED");
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    await waitFor(() => expect(screen.getByText("manager")).toBeInTheDocument());
    expect(mocks.rpc).toHaveBeenCalledTimes(2);
  });
});
