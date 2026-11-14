import type { CustomerReceivableAgingItem } from "./customer-receivable-aging-client";

type RankingRow = Pick<CustomerReceivableAgingItem, "currency" | "oldestAgeDays" | "overdueAmount">;

/**
 * Orders overdue work by age (a comparable day count). Monetary values are
 * compared only within one currency; between currencies, use a stable ISO-code
 * tie-breaker instead of pretending that raw numbers share an exchange rate.
 */
export function compareCustomerReceivableAgingRows(left: RankingRow, right: RankingRow): number {
  const leftAge = left.oldestAgeDays ?? -1;
  const rightAge = right.oldestAgeDays ?? -1;
  if (leftAge !== rightAge) return rightAge - leftAge;
  if (left.currency === right.currency) return right.overdueAmount - left.overdueAmount;
  return left.currency < right.currency ? -1 : left.currency > right.currency ? 1 : 0;
}

export type CustomerReceivableCandidateIdentity = Pick<CustomerReceivableAgingItem, "customerId" | "currency" | "asOf">;

/** Uses the immutable customer UUID so same-name customers never collide in decision idempotency or UI busy state. */
export function buildCustomerReceivableCollectionCandidateId(item: CustomerReceivableCandidateIdentity): string {
  return "receivables.collection:" + item.customerId + ":" + item.currency + ":" + item.asOf.slice(0, 10);
}
