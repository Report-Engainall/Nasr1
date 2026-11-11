export type DashboardLowStockCandidate = {
  productId: string;
  quantityAvailable: number;
};

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Build a tiny, deterministic dashboard preview from the complete selected-warehouse
 * balance read. The authoritative low-stock predicate is applied before the four-row
 * cap; malformed or duplicate rows fail closed instead of producing a partial shortlist.
 */
export function rankDashboardLowStockCandidates(input: unknown): DashboardLowStockCandidate[] | null {
  if (!Array.isArray(input)) return null;

  const seenProductIds = new Set<string>();
  const candidates: Array<DashboardLowStockCandidate & { pressure: number }> = [];

  for (const value of input) {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;

    const row = value as Record<string, unknown>;
    const productId = row.product_id;
    const quantityAvailable = row.quantity_available;
    const reorderPoint = row.reorder_point;

    if (typeof productId !== 'string' || !UUID_PATTERN.test(productId)) return null;
    if (seenProductIds.has(productId)) return null;
    seenProductIds.add(productId);

    if (typeof quantityAvailable !== 'number' || !Number.isFinite(quantityAvailable)) return null;
    if (typeof reorderPoint !== 'number' || !Number.isFinite(reorderPoint) || reorderPoint < 0) return null;

    if (quantityAvailable > reorderPoint) continue;

    // A zero threshold with zero stock sits exactly at its threshold (pressure 1);
    // negative available stock is ranked ahead of every non-negative position.
    const rawPressure = reorderPoint > 0
      ? quantityAvailable / reorderPoint
      : quantityAvailable < 0
        ? -1
        : 1;
    const pressure = Number.isFinite(rawPressure) ? rawPressure : -1_000_000;

    candidates.push({ productId, quantityAvailable, pressure });
  }

  candidates.sort((left, right) =>
    left.pressure - right.pressure || left.productId.localeCompare(right.productId),
  );

  return candidates.slice(0, 4).map(({ productId, quantityAvailable }) => ({
    productId,
    quantityAvailable,
  }));
}
