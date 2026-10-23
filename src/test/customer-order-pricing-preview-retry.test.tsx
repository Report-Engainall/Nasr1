import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  rpc: vi.fn(),
  user: { profileId: "buyer-1" },
}));

vi.mock("@/lib/auth", () => ({
  useAuth: () => ({ user: mocks.user }),
}));

vi.mock("@/lib/supabase", () => ({
  supabase: { rpc: mocks.rpc },
}));

import { CustomerOrderPricingPreview } from "@/components/CustomerOrderPricingPreview";

const items = [{ product_id: "product-1", quantity: 1 }];
const visibleServerPayload = {
  visible: true,
  surface: "cart",
  items: [{
    product_id: "product-1",
    name: "صنف اختبار إعادة محاولة السعر",
    quantity: 1,
    unit_price: 2468,
    line_total: 2468,
  }],
  item_count: 1,
  currency: "YER",
  total_amount: 2468,
  customer_tier_visible: false,
};

function renderPreview(policyValue: unknown = true) {
  return render(
    <CustomerOrderPricingPreview
      items={items}
      policyValue={policyValue}
      surface="cart"
      title="مراجعة أسعار السلة"
    />,
  );
}

describe("CustomerOrderPricingPreview transient-read recovery", () => {
  beforeEach(() => {
    mocks.rpc.mockReset();
  });

  afterEach(() => {
    cleanup();
  });

  it("retries bounded transient network failures and only renders server-returned pricing", async () => {
    const fetchFailure = {
      data: null,
      error: { status: 0, message: "TypeError: Failed to fetch" },
    };
    mocks.rpc
      .mockResolvedValueOnce(fetchFailure)
      .mockResolvedValueOnce(fetchFailure)
      .mockResolvedValueOnce({ data: visibleServerPayload, error: null });

    renderPreview();

    await waitFor(
      () => expect(screen.getByText("صنف اختبار إعادة محاولة السعر")).toBeInTheDocument(),
      { timeout: 5000 },
    );

    expect(mocks.rpc).toHaveBeenCalledTimes(3);
    expect(mocks.rpc).toHaveBeenNthCalledWith(
      3,
      "preview_customer_order_pricing",
      { p_items: items, p_surface: "cart" },
    );
    expect(screen.getByText(/الإجمالي/)).toBeInTheDocument();
  });

  it("does not retry authorization failures", async () => {
    mocks.rpc.mockResolvedValueOnce({
      data: null,
      error: { status: 403, message: "permission denied" },
    });

    renderPreview();

    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(mocks.rpc).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("alert").textContent).toContain("تم إخفاء المبالغ");
  });

  it("does not call the pricing RPC when the explicit visibility policy is disabled", () => {
    const { container } = renderPreview(false);
    expect(container.innerHTML).toBe("");
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
});
