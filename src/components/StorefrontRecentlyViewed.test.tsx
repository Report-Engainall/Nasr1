// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import {
  recordRecentlyViewedProduct,
  readRecentlyViewedProducts,
} from "@/lib/recently-viewed-products";
import type { ProductWithInventory } from "@/lib/types";

const mocks = vi.hoisted(() => ({
  user: null as null | { id: string; profileId: string; roles: string[]; isStaff: boolean },
  ready: true,
}));

vi.mock("@/lib/auth", () => ({
  useAuth: () => ({ user: mocks.user, ready: mocks.ready }),
}));

import { StorefrontRecentlyViewed } from "./StorefrontRecentlyViewed";

const profileA = "a1000000-0000-0000-0000-000000000081";
const profileB = "b1000000-0000-0000-0000-000000000081";
const viewedAt = "2026-11-16T12:00:00.000Z";

function liveProduct(id: string, name: string, displayPrice: number | null = null) {
  return {
    id,
    name,
    item_code: `SKU-${id}`,
    unit: "كرتون",
    image_url: null,
    display_price: displayPrice,
    category: { id: "category-1", name: "الأرز" },
    inventory: { quantity_available: 12 },
  } as unknown as ProductWithInventory;
}

function record(profileId: string, id: string, name: string) {
  recordRecentlyViewedProduct(window.localStorage, profileId, {
    id,
    name,
    itemCode: `OLD-${id}`,
  }, viewedAt);
}

beforeEach(() => {
  window.localStorage.clear();
  mocks.ready = true;
  mocks.user = { id: "user-a", profileId: profileA, roles: ["customer"], isStaff: false };
});

afterEach(() => cleanup());

describe("StorefrontRecentlyViewed", () => {
  it("renders live catalogue fields for this customer and supports removing one item and clearing the history", async () => {
    record(profileA, "product-1", "اسم مخزن قديم");
    record(profileA, "product-2", "اسم مخزن آخر");

    render(
      <StorefrontRecentlyViewed
        products={[
          liveProduct("product-1", "الاسم الحالي الأول", 42),
          liveProduct("product-2", "الاسم الحالي الثاني", 55),
        ]}
        currentProductId="current-product"
        priceVisibilityPolicy={false}
        onOpen={vi.fn()}
      />,
    );

    expect(await screen.findByRole("heading", { name: "شاهدتها مؤخراً" })).toBeInTheDocument();
    expect(screen.getByText("الاسم الحالي الأول")).toBeInTheDocument();
    expect(screen.getByText("الاسم الحالي الثاني")).toBeInTheDocument();
    expect(screen.queryByText("اسم مخزن قديم")).not.toBeInTheDocument();
    expect(screen.queryByText(/42/)).not.toBeInTheDocument();
    expect(screen.queryByText(/55/)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "إزالة الاسم الحالي الأول من سجل المشاهدة" }));
    await waitFor(() => {
      expect(screen.queryByText("الاسم الحالي الأول")).not.toBeInTheDocument();
    });
    expect(readRecentlyViewedProducts(window.localStorage, profileA).map((entry) => entry.id))
      .toEqual(["product-2"]);

    fireEvent.click(screen.getByRole("button", { name: /مسح السجل/ }));
    await waitFor(() => {
      expect(screen.queryByRole("heading", { name: "شاهدتها مؤخراً" })).not.toBeInTheDocument();
    });
    expect(readRecentlyViewedProducts(window.localStorage, profileA)).toEqual([]);
  });

  it("does not read another customer's history or expose staff browsing history", async () => {
    record(profileB, "private-product", "سجل عميل آخر");

    const { rerender } = render(
      <StorefrontRecentlyViewed
        products={[liveProduct("private-product", "منتج خاص")]}
        currentProductId="current-product"
        priceVisibilityPolicy={true}
        onOpen={vi.fn()}
      />,
    );
    expect(screen.queryByText("منتج خاص")).not.toBeInTheDocument();

    record(profileA, "staff-private-product", "سجل داخلي");
    mocks.user = { id: "staff", profileId: profileA, roles: ["manager"], isStaff: true };
    rerender(
      <StorefrontRecentlyViewed
        products={[liveProduct("staff-private-product", "منتج داخلي")]}
        currentProductId="current-product"
        priceVisibilityPolicy={true}
        onOpen={vi.fn()}
      />,
    );
    await waitFor(() => {
      expect(screen.queryByText("منتج داخلي")).not.toBeInTheDocument();
      expect(screen.queryByRole("heading", { name: "شاهدتها مؤخراً" })).not.toBeInTheDocument();
    });
  });
});
