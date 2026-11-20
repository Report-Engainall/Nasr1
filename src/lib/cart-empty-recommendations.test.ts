import { describe, expect, it } from "vitest";
import type { ProductWithInventory } from "@/lib/types";
import {
  resolveCartEmptyEligibility,
  selectAvailableCartRecommendations,
} from "./cart-empty-recommendations";

function candidate(
  id: string,
  status: string,
  available: number | undefined,
): ProductWithInventory {
  return {
    id,
    name: id,
    item_code: id,
    unit: "كيس",
    status,
    inventory: available === undefined
      ? undefined
      : { product_id: id, quantity_available: available },
  } as unknown as ProductWithInventory;
}

describe("cart empty-state evidence", () => {
  it("never labels a cart empty while an identity-scoped local draft has lines", () => {
    expect(resolveCartEmptyEligibility({
      audience: "customer",
      isOnline: true,
      localDraftLineCount: 1,
      serverCartLineCount: 0,
    })).toBe("not-empty");
  });

  it("requires a server read before treating an authenticated customer's cart as empty", () => {
    expect(resolveCartEmptyEligibility({
      audience: "customer",
      isOnline: true,
      localDraftLineCount: 0,
      serverCartLineCount: null,
    })).toBe("unverified");
    expect(resolveCartEmptyEligibility({
      audience: "customer",
      isOnline: true,
      localDraftLineCount: 0,
      serverCartLineCount: 0,
    })).toBe("empty");
    expect(resolveCartEmptyEligibility({
      audience: "customer",
      isOnline: true,
      localDraftLineCount: 0,
      serverCartLineCount: 2,
    })).toBe("not-empty");
  });

  it("does not claim emptiness while offline and supports a verified empty guest draft", () => {
    expect(resolveCartEmptyEligibility({
      audience: "guest",
      isOnline: false,
      localDraftLineCount: 0,
      serverCartLineCount: null,
    })).toBe("unverified");
    expect(resolveCartEmptyEligibility({
      audience: "guest",
      isOnline: true,
      localDraftLineCount: 0,
      serverCartLineCount: null,
    })).toBe("empty");
  });

  it("does not show a customer empty state in staff or unrelated account contexts", () => {
    for (const audience of ["staff", "other"] as const) {
      expect(resolveCartEmptyEligibility({
        audience,
        isOnline: true,
        localDraftLineCount: 0,
        serverCartLineCount: 0,
      })).toBe("hidden");
    }
  });
});

describe("cart empty-state recommendations", () => {
  it("shows only active products with a positive server-reported available quantity", () => {
    const recommendations = selectAvailableCartRecommendations([
      candidate("available", "active", 3),
      candidate("out-of-stock", "active", 0),
      candidate("unknown-stock", "active", undefined),
      candidate("inactive", "draft", 8),
    ]);
    expect(recommendations.map((product) => product.id)).toEqual(["available"]);
  });

  it("caps the recommendation count and handles invalid limits", () => {
    const candidates = Array.from({ length: 10 }, (_, index) =>
      candidate(String(index), "active", index + 1),
    );
    expect(selectAvailableCartRecommendations(candidates, 6)).toHaveLength(6);
    expect(selectAvailableCartRecommendations(candidates, 100)).toHaveLength(8);
    expect(selectAvailableCartRecommendations(candidates, -1)).toHaveLength(0);
    expect(selectAvailableCartRecommendations(candidates, 1.5)).toHaveLength(4);
  });
});
