import type { ProductWithInventory } from "@/lib/types";

export type CartEmptyAudience = "customer" | "guest" | "staff" | "other";
export type CartEmptyEligibility = "hidden" | "not-empty" | "unverified" | "empty";

export function resolveCartEmptyEligibility(input: {
  audience: CartEmptyAudience;
  isOnline: boolean;
  localDraftLineCount: number;
  serverCartLineCount: number | null;
}): CartEmptyEligibility {
  if (input.audience === "staff" || input.audience === "other") return "hidden";
  if (input.localDraftLineCount > 0) return "not-empty";
  if (!input.isOnline) return "unverified";
  if (input.audience === "customer" && input.serverCartLineCount === null) return "unverified";
  if (input.audience === "customer" && (input.serverCartLineCount ?? 0) > 0) return "not-empty";
  return "empty";
}

export function selectAvailableCartRecommendations(
  products: ProductWithInventory[],
  limit = 4,
): ProductWithInventory[] {
  const safeLimit = Number.isSafeInteger(limit) ? Math.max(0, Math.min(8, limit)) : 4;
  return products
    .filter((product) =>
      product.status === "active" &&
      typeof product.inventory?.quantity_available === "number" &&
      Number.isFinite(product.inventory.quantity_available) &&
      product.inventory.quantity_available > 0
    )
    .slice(0, safeLimit);
}
