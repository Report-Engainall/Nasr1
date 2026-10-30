# P3 → P2 — Tenant-safe Intelligence Aggregate Contract

**Acceptance:** REF-EVIDENCE-PASSPORT-001, REF-DAILY-DECISIONS-001, REF-LIQUIDITY-001 and REF-CASHFLOW-FORECAST-001, then retention and inventory intelligence.  
**Type contract:** src/lib/intelligence/aggregate-contract.ts.

## Request
Request fields are requestId, metricKeys, period.from/to, asOf and optional currency filter. Do not accept a client-supplied tenantId, role, capability, source table or formula override. Resolve tenant scope and effective role/capabilities only from authenticated server identity and existing database authorization.

## Success DTO
Return status OK/PARTIAL, request ID, asOf, period, currency and sideEffects=NONE; server-resolved tenant scope and effective role/capabilities; source tables/RPCs/import snapshots and safe record references; evidence source timestamps, period, currency, status, completeness, quality and warnings; metric snapshots with nullable value, unit/currency, formula ID/version, calculation timestamp and evidence IDs; formula versions, completeness/quality, warnings and safe errors/SQLSTATE.

For liquidity, include separate metric keys for available balance, scheduled/expected collections, overdue receivables, due supplier obligations, receivable-aging buckets and stagnant-stock cost. Return every monetary metric as its own currency-scoped snapshot; never combine currencies. Stagnant-stock cost is supplemental exposure and must not be subtracted from cash liquidity.

For cash flow, include cashflowSchedule with schedule status/completeness/quality and one entry per actual scheduled receipt/payment: opaque entry ID, direction INFLOW/OUTFLOW, dueDate, and an amount MetricSnapshot with source lineage, currency, asOf and formula version. This schedule must cover the complete authorized tenant scope through the 90-day horizon. Invalid or unknown dates/amounts and partial coverage suppress projected balances. Do not assume collection percentages, invent expenses or extrapolate sales.

Aggregates must cover the complete authorized tenant period, not the first UI page. Null means unknown/unavailable, never zero.

## Denial and failure
Use DENIED for authorization failure, UNAVAILABLE for absent sources and ERROR for execution failure. Return safe codes/messages/SQLSTATE only. Denied calls must have no side effects: compare before/after domain and audit snapshots. No foreign-tenant identifiers or unredacted PII.

## P2 acceptance
1. Tenant identity is server-derived; a caller cannot select another tenant.
2. Use existing canonical roles/capabilities and RLS/RPC policy; do not create a parallel permissions model.
3. Calculate full-history scoped aggregates with source lineage, formula/version, currency and quality/completeness.
4. Prove same-tenant role allow/deny and opaque cross-tenant denial.
5. Prove byte-identical domain and audit snapshots on denied operations.
6. PostgreSQL 17 cases: empty, partial, missing value, stale source, mixed currencies, bad formula version, schedule due-date coverage, SQLSTATE and error redaction.
7. No fabricated values, fallback currency, zero sentinel or unverified-to-verified promotion.

P2 records task ID, exact SHA, service/RPC, safe request/response, source tables, role matrix, SQLSTATE/no-side-effect evidence, PG17 run URL and exact next command in its checkpoint. P2 does not push main; P3 integrates.
