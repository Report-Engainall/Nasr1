/**
 * A reviewed Onyx snapshot must be applied using the dataset kind of its source job.
 * Never infer the kind from a mutable UI selection or from report_type: both product
 * and customer profiles are tabular.
 */
export type OnyxSnapshotImportKind = "products" | "customers";

export function resolveOnyxSnapshotImportKind(jobType: unknown): OnyxSnapshotImportKind | null {
  if (jobType === "unified_import_customers") return "customers";
  if (jobType === "unified_import_products" || jobType === "unified_import") return "products";
  return null;
}
