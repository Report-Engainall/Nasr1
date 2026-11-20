export type OnyxStagedSnapshotKind = "products" | "customers" | "inventory" | "product_units";

/**
 * ProductUnits snapshots may contain review-only metadata warnings; the
 * server-side application RPC accepts completed_with_warnings. StockBalances
 * keeps its stricter completion gate until its reconciliation contract says otherwise.
 */
export function isOnyxSnapshotReadyForApplication(
  kind: OnyxStagedSnapshotKind,
  status: string,
  snapshotId: string | null | undefined,
): boolean {
  if (!snapshotId) return false;
  if (status === "completed") return true;
  return kind === "product_units" && status === "completed_with_warnings";
}
