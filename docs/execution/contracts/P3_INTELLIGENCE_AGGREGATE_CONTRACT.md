# P3 → P2 — Tenant-safe Intelligence Aggregate Contract

**Acceptance:** daily decisions, evidence passport, liquidity, cashflow, dead-stock, customer retention and replenishment intelligence. Type contract: src/lib/intelligence/aggregate-contract.ts.

## Request and authorization
Request carries requestId, metricKeys, period.from/to, asOf and optional currency. Never accept a caller-supplied tenantId, role, capability, source table or formula override. Resolve tenant scope, effective role and capabilities exclusively from the authenticated server-side identity and existing canonical database authorization.

## Common success DTO
Return status OK/PARTIAL, request ID, asOf, period, currency, sideEffects=NONE; server-resolved tenant scope/effective role/capabilities; exact source tables/RPCs/import snapshots and safe record references; evidence timestamps, period, currency, status, completeness, quality/warnings; nullable metric snapshots with units, formula ID/version, calculation timestamp and evidence IDs; formula versions, completeness/quality, safe errors and SQLSTATE. Aggregates cover the full authorized tenant period, not the first UI page. Null is unknown, never zero. Keep currencies separate.

## Liquidity and cashflow
Liquidity metric keys: available balance, expected/overdue collections, due obligations, receivable aging buckets, stagnant-stock cost. Each money metric has its own currency-scoped snapshot. Stagnant stock cost is supplemental exposure and is never subtracted from liquid cash.
Cashflow includes cashflowSchedule with status/completeness/quality and each actual scheduled receipt/payment (opaque ID, INFLOW/OUTFLOW, dueDate and amount MetricSnapshot with source lineage/currency/asOf/formula). Cover full authorized scope through 90 days. Partial coverage, unknown dates or amounts suppress projected balance. No assumed collection percentages, invented expenses or sales extrapolation.

## Dead stock and replenishment
Return inventoryMovements for the full tenant scope and requested lookback: product reference, last movement timestamp (nullable only when a complete covered period proves no movement), movement status, covered period and evidence IDs. Include verified ATP/available quantity, reorder point, sold quantity in the demand window, supplier lead-time days, optional minimum order quantity/order multiple, average inventory and unit cost. Unit cost is CURRENCY_PER_UNIT with explicit currency and UOM; only P3 calculates exposure after quantity UOM matches the cost basis. Missing cost is unavailable, not zero.
Replenishment inputs must cover full movement history and lead-time sources. The recommendation is informational; P3 never creates a purchase order.

## Customer retention
Return customerRetention with status/completeness/quality, total expected and returned customer counts, truncated flag, and all customers for the period (not paginated): opaque customerRef, currency, current-period order count, previous-period order count, current-period sales MetricSnapshot, last order timestamp. If expected and returned counts differ, if truncated, or if any source is partial, P3 withholds overall retention/concentration KPIs. Sales concentration is computed separately by currency. Never send customer name/phone/email in this analytic DTO; no inferred churn causes.

## Denial/failure proof
Use DENIED, UNAVAILABLE or ERROR with safe error code/message and SQLSTATE. Denial has no side effects: compare before/after domain and audit snapshots byte-for-byte. No cross-tenant identifiers, SQL or PII.
P2 acceptance: authenticated server tenant derivation; existing canonical permission/RLS/RPC rules; full history; proof same-tenant role allow/deny and opaque foreign-tenant denial; PostgreSQL 17 tests for empty, partial, missing, stale, currency mismatch, invalid formula, bad dates, SQLSTATE, error redaction and no-side-effect denial. Log exact code SHA, service/RPC, source tables, role/capability matrix, PG17 run, SQLSTATE and exact next command in P2 checkpoint. P2 does not push main; P3 integrates.
