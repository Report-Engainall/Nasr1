import type { CustomerOrderPricingPresentation } from "@/lib/storefront-price-visibility";

export type CartReviewIdentity = {
  userId: string | null | undefined;
  profileId: string | null | undefined;
};
export type CartReviewLine = { product_id: string; quantity: number };
export type CartAvailabilityProduct = {
  id: string;
  status?: string | null;
  inventory?: { quantity_available?: number | null } | null;
};
export type CartAvailabilityLine = {
  product_id: string;
  status: "active" | "unavailable";
  quantity_available: number | null;
};
export type CartAvailabilityChange = {
  product_id: string;
  previous_status: CartAvailabilityLine["status"];
  current_status: CartAvailabilityLine["status"];
  previous_available: number | null;
  current_available: number | null;
  kind: "unavailable" | "restored" | "reduced" | "increased" | "unknown";
};
export type CartPriceChange = {
  product_id: string;
  name: string;
  quantity: number;
  previous_quantity: number;
  previous_unit_price: number;
  current_unit_price: number;
  currency: string;
  kind: "increase" | "decrease" | "terms";
};

type StoredSnapshot<T> = { signature: string; capturedAt: number; value: T };

const MAX_SNAPSHOTS = 24;
const MAX_AGE_MS = 10 * 60 * 1000;
const priceSnapshots = new Map<string, StoredSnapshot<Extract<CustomerOrderPricingPresentation, { visible: true }>>>();
const availabilitySnapshots = new Map<string, StoredSnapshot<CartAvailabilityLine[]>>();

function identityKey(identity: CartReviewIdentity): string | null {
  const userId = identity.userId?.trim();
  const profileId = identity.profileId?.trim();
  return userId && profileId ? userId + ":" + profileId : null;
}

function stableIdSignature(ids: readonly string[]): string {
  return JSON.stringify([...new Set(ids.map((id) => id.toLowerCase()))].sort());
}

export function cartReviewLineSignature(lines: readonly CartReviewLine[]): string {
  return JSON.stringify(
    [...lines]
      .map((line) => ({ product_id: line.product_id.toLowerCase(), quantity: line.quantity }))
      .sort((left, right) => left.product_id.localeCompare(right.product_id)),
  );
}

function remember<T>(map: Map<string, StoredSnapshot<T>>, key: string, signature: string, value: T): void {
  map.delete(key);
  map.set(key, { signature, capturedAt: Date.now(), value });
  while (map.size > MAX_SNAPSHOTS) {
    const oldest = map.keys().next().value;
    if (oldest === undefined) break;
    map.delete(oldest);
  }
}

function read<T>(map: Map<string, StoredSnapshot<T>>, key: string, signature: string): T | null {
  const snapshot = map.get(key);
  if (!snapshot || snapshot.signature !== signature) return null;
  if (Date.now() - snapshot.capturedAt > MAX_AGE_MS) {
    map.delete(key);
    return null;
  }
  return snapshot.value;
}

/**
 * The comparison baseline is deliberately memory-only. Cart prices never enter
 * localStorage, sessionStorage, IndexedDB, the offline draft, or a public cache.
 */
export function rememberCartPricingSnapshot(
  identity: CartReviewIdentity,
  lines: readonly CartReviewLine[],
  presentation: CustomerOrderPricingPresentation | null,
): void {
  const owner = identityKey(identity);
  if (!owner) return;
  const signature = stableIdSignature(lines.map((line) => line.product_id));
  const key = owner + ":price:" + signature;
  if (!presentation?.visible) {
    priceSnapshots.delete(key);
    return;
  }
  const requested = new Map(lines.map((line) => [line.product_id.toLowerCase(), line.quantity]));
  if (presentation.items.length !== requested.size || presentation.items.some(
    (line) => requested.get(line.product_id.toLowerCase()) !== line.quantity,
  )) return;
  remember(priceSnapshots, key, signature, presentation);
}

export function getCartPricingSnapshot(
  identity: CartReviewIdentity,
  lines: readonly CartReviewLine[],
): Extract<CustomerOrderPricingPresentation, { visible: true }> | null {
  const owner = identityKey(identity);
  if (!owner) return null;
  const signature = stableIdSignature(lines.map((line) => line.product_id));
  return read(priceSnapshots, owner + ":price:" + signature, signature);
}

export function compareCartPricingSnapshots(
  previous: CustomerOrderPricingPresentation | null,
  current: CustomerOrderPricingPresentation | null,
): CartPriceChange[] {
  if (!previous?.visible || !current?.visible || previous.currency !== current.currency) return [];
  const oldById = new Map(previous.items.map((line) => [line.product_id.toLowerCase(), line]));
  const changes: CartPriceChange[] = [];
  for (const line of current.items) {
    const oldLine = oldById.get(line.product_id.toLowerCase());
    if (!oldLine) continue;
    const netPriceChanged = oldLine.unit_price !== line.unit_price;
    const termsChanged =
      oldLine.original_unit_price !== line.original_unit_price ||
      oldLine.discount_per_unit !== line.discount_per_unit ||
      oldLine.discount_amount !== line.discount_amount ||
      oldLine.promotion_title !== line.promotion_title;
    if (!netPriceChanged && !termsChanged) continue;
    changes.push({
      product_id: line.product_id,
      name: line.name,
      quantity: line.quantity,
      previous_quantity: oldLine.quantity,
      previous_unit_price: oldLine.unit_price,
      current_unit_price: line.unit_price,
      currency: current.currency ?? previous.currency ?? "YER",
      kind: line.unit_price > oldLine.unit_price
        ? "increase"
        : line.unit_price < oldLine.unit_price
          ? "decrease"
          : "terms",
    });
  }
  return changes;
}

export type CartAvailabilityQuantityRule = {
  product_id: string;
  min_order_quantity?: number | null;
  order_quantity_multiple?: number | null;
};
export type CartAvailabilityAdjustment = {
  product_id: string;
  previous_quantity: number;
  next_quantity: number | null;
  action: "keep" | "reduce" | "remove" | "blocked";
};

export function planCartAvailabilityAdjustments(
  cartLines: readonly CartReviewLine[],
  changes: readonly CartAvailabilityChange[],
  rules: readonly CartAvailabilityQuantityRule[],
): CartAvailabilityAdjustment[] {
  const changesById = new Map(changes.map((change) => [change.product_id.toLowerCase(), change]));
  const rulesById = new Map(rules.map((rule) => [rule.product_id.toLowerCase(), rule]));

  return cartLines.map((line) => {
    const change = changesById.get(line.product_id.toLowerCase());
    if (!change) {
      return { product_id: line.product_id, previous_quantity: line.quantity, next_quantity: line.quantity, action: "keep" };
    }
    if (change.current_status !== "active") {
      return { product_id: line.product_id, previous_quantity: line.quantity, next_quantity: null, action: "remove" };
    }
    if (change.current_available === null) {
      return { product_id: line.product_id, previous_quantity: line.quantity, next_quantity: null, action: "blocked" };
    }
    if (line.quantity <= change.current_available) {
      return { product_id: line.product_id, previous_quantity: line.quantity, next_quantity: line.quantity, action: "keep" };
    }

    const rule = rulesById.get(line.product_id.toLowerCase());
    const minimum = Number.isSafeInteger(rule?.min_order_quantity) && Number(rule?.min_order_quantity) >= 1
      ? Number(rule?.min_order_quantity)
      : 1;
    const multiple = Number.isSafeInteger(rule?.order_quantity_multiple) && Number(rule?.order_quantity_multiple) >= 1
      ? Number(rule?.order_quantity_multiple)
      : 1;
    const nextQuantity = change.current_available >= minimum
      ? minimum + Math.floor((change.current_available - minimum) / multiple) * multiple
      : 0;

    return nextQuantity >= minimum
      ? { product_id: line.product_id, previous_quantity: line.quantity, next_quantity: nextQuantity, action: "reduce" }
      : { product_id: line.product_id, previous_quantity: line.quantity, next_quantity: null, action: "remove" };
  });
}

export function buildCartAvailabilitySnapshot(
  productIds: readonly string[],
  products: readonly CartAvailabilityProduct[],
): CartAvailabilityLine[] {
  const byId = new Map(products.map((product) => [product.id.toLowerCase(), product]));
  return [...new Set(productIds.map((id) => id.toLowerCase()))].sort().map((id) => {
    const product = byId.get(id);
    const rawAvailable = product?.inventory?.quantity_available;
    const available = typeof rawAvailable === "number" && Number.isSafeInteger(rawAvailable) && rawAvailable >= 0
      ? rawAvailable
      : null;
    return {
      product_id: id,
      status: product?.status === "active" ? "active" : "unavailable",
      quantity_available: available,
    };
  });
}

export function rememberCartAvailabilitySnapshot(
  identity: CartReviewIdentity,
  productIds: readonly string[],
  snapshot: readonly CartAvailabilityLine[],
): void {
  const owner = identityKey(identity);
  if (!owner) return;
  const signature = stableIdSignature(productIds);
  if (!signature || signature === "[]") return;
  remember(availabilitySnapshots, owner + ":availability:" + signature, signature, [...snapshot]);
}

export function getCartAvailabilitySnapshot(
  identity: CartReviewIdentity,
  productIds: readonly string[],
): CartAvailabilityLine[] | null {
  const owner = identityKey(identity);
  if (!owner) return null;
  const signature = stableIdSignature(productIds);
  if (!signature || signature === "[]") return null;
  return read(availabilitySnapshots, owner + ":availability:" + signature, signature);
}

export function compareCartAvailabilitySnapshots(
  previous: readonly CartAvailabilityLine[] | null,
  current: readonly CartAvailabilityLine[],
): CartAvailabilityChange[] {
  if (!previous?.length) return [];
  const oldById = new Map(previous.map((line) => [line.product_id.toLowerCase(), line]));
  const changes: CartAvailabilityChange[] = [];
  for (const line of current) {
    const oldLine = oldById.get(line.product_id.toLowerCase());
    if (!oldLine) continue;
    if (oldLine.status === line.status &&
        oldLine.quantity_available === line.quantity_available) continue;
    const kind: CartAvailabilityChange["kind"] = line.status === "unavailable"
      ? "unavailable"
      : oldLine.status === "unavailable"
        ? "restored"
        : oldLine.quantity_available === null || line.quantity_available === null
          ? "unknown"
          : line.quantity_available < oldLine.quantity_available
            ? "reduced"
            : "increased";
    changes.push({
      product_id: line.product_id,
      previous_status: oldLine.status,
      current_status: line.status,
      previous_available: oldLine.quantity_available,
      current_available: line.quantity_available,
      kind,
    });
  }
  return changes;
}
