import { useLayoutEffect, useRef } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

const mocks = vi.hoisted(() => ({ rpc: vi.fn(), profileId: "profile-1" }));
vi.mock("@/lib/auth", () => ({ useAuth: () => ({ user: { profileId: mocks.profileId } }) }));
vi.mock("@/lib/supabase", () => ({ supabase: { rpc: mocks.rpc } }));

import { CustomerOrderPricingPreview } from "@/components/CustomerOrderPricingPreview";

const profileSwitchSnapshots: string[] = [];

function ProfileSwitchHarness({ revision }: { revision: number }) {
  const hostRef = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    profileSwitchSnapshots.push(hostRef.current?.textContent ?? "");
  }, [revision]);
  return (
    <div ref={hostRef}>
      <CustomerOrderPricingPreview items={items} policyValue={true} surface="cart" title="ملخص أسعار السلة" />
    </div>
  );
}

const items = [{ product_id: "product-1", quantity: 2 }];
const visiblePayload = {
  visible: true,
  surface: "cart",
  items: [{
    product_id: "product-1",
    name: "صنف تجريبي",
    quantity: 2,
    unit_price: 125,
    line_total: 250,
  }],
  item_count: 1,
  currency: "YER",
  total_amount: 250,
  customer_tier_visible: false,
  customer_tier_label: null,
};

beforeEach(() => {
  mocks.profileId = "profile-1";
  profileSwitchSnapshots.length = 0;
  mocks.rpc.mockReset().mockResolvedValue({ data: visiblePayload, error: null });
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe("CustomerOrderPricingPreview wired to the server RPC", () => {
  it("requests the matching cart surface and renders only the server-returned prices when enabled", async () => {
    render(<CustomerOrderPricingPreview items={items} policyValue={true} surface="cart" title="ملخص أسعار السلة" />);
    expect(await screen.findByRole("region", { name: "ملخص أسعار السلة" })).toBeInTheDocument();
    expect(screen.getByText("صنف تجريبي × 2")).toBeInTheDocument();
    expect(mocks.rpc).toHaveBeenCalledWith("preview_customer_order_pricing", {
      p_items: [{ product_id: "product-1", quantity: 2 }],
      p_surface: "cart",
    });
  });

  it("hides the previous profile's price in the first committed render after account changes", async () => {
    const { rerender } = render(<ProfileSwitchHarness revision={1} />);
    expect(await screen.findByRole("region", { name: "ملخص أسعار السلة" })).toBeInTheDocument();
    expect(screen.getByText("صنف تجريبي × 2")).toBeInTheDocument();

    const snapshotIndex = profileSwitchSnapshots.length;
    mocks.profileId = "profile-2";
    rerender(<ProfileSwitchHarness revision={2} />);

    // Layout effects observe the committed DOM before passive effects can fetch a new preview.
    // The previous account's price must already be gone in this render.
    const immediateSnapshot = profileSwitchSnapshots[snapshotIndex];
    expect(immediateSnapshot).toContain("جار جلب مراجعة الأسعار من الخادم");
    expect(immediateSnapshot).not.toContain("صنف تجريبي × 2");
    expect(immediateSnapshot).not.toContain("الإجمالي");

    expect(await screen.findByRole("region", { name: "ملخص أسعار السلة" })).toBeInTheDocument();
    expect(mocks.rpc).toHaveBeenCalledTimes(2);
  });

  it("does not call the preview RPC or display prices when the policy is false or malformed", () => {
    const { rerender } = render(<CustomerOrderPricingPreview items={items} policyValue={false} surface="cart" title="ملخص أسعار السلة" />);
    expect(screen.queryByText("صنف تجريبي × 2")).not.toBeInTheDocument();
    expect(mocks.rpc).not.toHaveBeenCalled();
    rerender(<CustomerOrderPricingPreview items={items} policyValue={"true"} surface="cart" title="ملخص أسعار السلة" />);
    expect(screen.queryByText("صنف تجريبي × 2")).not.toBeInTheDocument();
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("sends the order-review surface rather than reusing a cart payload", async () => {
    mocks.rpc.mockResolvedValueOnce({
      data: { ...visiblePayload, surface: "orders" },
      error: null,
    });
    render(<CustomerOrderPricingPreview items={items} policyValue={true} surface="orders" title="مراجعة أسعار الطلب" />);
    expect(await screen.findByRole("region", { name: "مراجعة أسعار الطلب" })).toBeInTheDocument();
    expect(mocks.rpc).toHaveBeenCalledWith("preview_customer_order_pricing", {
      p_items: [{ product_id: "product-1", quantity: 2 }],
      p_surface: "orders",
    });
  });

  it("fails closed on RPC errors without falling back to catalog or client amounts", async () => {
    mocks.rpc.mockResolvedValueOnce({ data: null, error: { message: "denied" } });
    render(<CustomerOrderPricingPreview items={items} policyValue={true} surface="cart" title="ملخص أسعار السلة" />);
    expect(await screen.findByRole("alert")).toHaveTextContent(/تم إخفاء المبالغ/);
    expect(screen.queryByText("صنف تجريبي × 2")).not.toBeInTheDocument();
    expect(screen.queryByText(/125/)).not.toBeInTheDocument();
  });

  it("fails closed when payloads are malformed or for another surface", async () => {
    mocks.rpc.mockResolvedValueOnce({ data: { ...visiblePayload, surface: "orders" }, error: null });
    render(<CustomerOrderPricingPreview items={items} policyValue={true} surface="cart" title="ملخص أسعار السلة" />);
    expect(await screen.findByRole("alert")).toHaveTextContent(/تم إخفاء المبالغ/);
    expect(screen.queryByText("صنف تجريبي × 2")).not.toBeInTheDocument();
  });

  it("does not disclose amounts to an unauthenticated session even when the setting is enabled", async () => {
    mocks.profileId = null;
    render(<CustomerOrderPricingPreview items={items} policyValue={true} surface="cart" title="ملخص أسعار السلة" />);
    expect(await screen.findByRole("status")).toHaveTextContent(/سجّل الدخول أولًا/);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
});
