# P3 → P2 — Tenant-safe Intelligence Aggregate Contract

**Acceptance:** REF-EVIDENCE-PASSPORT-001, REF-DAILY-DECISIONS-001 and subsequent liquidity, cash-flow, retention and stock intelligence.  
**Type contract:** `src/lib/intelligence/aggregate-contract.ts`.

## Request
Request fields are requestId, metricKeys, period.from/to, asOf and optional currency filter. Do not accept a client-supplied tenantId, role, capability, source table or formula override. Resolve tenant scope and effective role/capabilities only from the authenticated server-side identity and the existing database authorization model.

## Success DTO
Return status OK/PARTIAL, request ID, asOf, period, currency and sideEffects=NONE; server-resolved tenant scope and effective role/capabilities; source tables/RPCs/import snapshots and safe record references; evidence source timestamps, period, currency, status, completeness, quality and warnings; metrics with nullable value, unit/currency, formula ID/version, calculation timestamp and evidence IDs; plus formula versions, completeness/quality, warnings and safe errors/SQLSTATE.

Aggregates must cover the complete authorized tenant period, not the first UI page. Keep every currency separate. Null means unknown/unavailable, never zero.

## Denial and failure
Use DENIED for authorization failure, UNAVAILABLE for absent source data and ERROR for execution failure. Return safe codes/messages/SQLSTATE only. Denied calls must have no side effects: compare before/after domain and audit snapshots. No foreign-tenant identifiers or unredacted PII.

## P2 acceptance
1. Tenant identity is server-derived; a caller cannot select another tenant.
2. Use existing canonical roles/capabilities and RLS/RPC policy; do not create a parallel permissions model.
3. Calculate full-history scoped aggregates with source lineage, formula/version, currency and quality/completeness.
4. Prove same-tenant role allow/deny and opaque cross-tenant denial.
5. Prove byte-identical domain and audit snapshots on denied operations.
6. PostgreSQL 17 cases: empty, partial, missing value, stale source, mixed currencies, bad formula version, SQLSTATE and error redaction.
7. No fabricated values, fallback currency, zero sentinel or unverified-to-verified promotion.

P2 records task ID, exact SHA, service/RPC, safe request/response, source tables, role matrix, SQLSTATE/no-side-effect evidence, PG17 run URL and exact next command in its checkpoint. P2 does not push main; P3 integrates.
