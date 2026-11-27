# P2 Checkpoint — Operational Task Quality Review PostgreSQL 17 Acceptance
Date: 2026-11-27
Repository: `Report-Engainall/Nasr1`
Role: P2 — PostgreSQL, RPC authorization, tenant isolation, idempotency and audit integrity
Base `main` recorded when this branch was created: `ea4b68dc063651d6cf36c8946947a27d0e40ac31`
Branch: `p2/task-quality-review-pg17-20261127`
Latest code head: `b09d0a08057ca8f838b084e83dc564b3dfa21f0b`
Status: PG17 acceptance is being rerun after correcting the test harness timestamp transport. No application SQL/RPC behavior was weakened or changed.

## Work delivered on this branch
- Added `scripts/test-task-quality-review-authorization.mjs`, using the existing P2 disposable Supabase/PostgreSQL 17 fixtures and strict local-endpoint guard.
- Wired the script into the existing `p2-playwright-critical-paths.yml` local authenticated PostgreSQL 17 acceptance sequence and path filter.
- First attempt on SHA `c0798a170a9081630be5929ed7e6f7df2e3de12e`: RPC rejected the review JSON because the test supplied a JSON scalar. Corrected with `db.json(review)`.
- Second attempt on SHA `ee2ed8b4d94ac7fcbfd2249f0cd172946948919e`: P1 and public Chromium passed; local PostgreSQL 17 migrations and all preceding DB acceptance steps passed; quality-review step 24 failed with `40001` / “task changed after the review was opened” on its first write.
- Root cause isolated to the test harness converting the exact database `updated_at` timestamp through Node and back into a timestamptz parameter. The RPC correctly enforced optimistic concurrency. Corrected the harness to retain the current timestamp as a typed PostgreSQL value inside the RPC statement; the deliberate stale-snapshot case still supplies the original timestamp and must continue to fail with `40001`.
- Follow-up commits: `f761f39cb5434fe8f7941c32d53db625c9b03061` (typed database snapshot path), `b09d0a08057ca8f838b084e83dc564b3dfa21f0b` (explicit stale timestamp in denial test).
- No application RPC, production migration, RLS policy, role, hosted row, production data, deployment, or external service was changed.

## Last exact-head evidence before the harness correction
- P2 run `45917240491` on SHA `ee2ed8b4d94ac7fcbfd2249f0cd172946948919e`: infrastructure gate PASS; public Chromium PASS; local PostgreSQL migrations PASS; prior local acceptance steps PASS; quality-review acceptance step 24 FAIL due to timestamp round-trip; steps after 24 were SKIPPED by fail-fast.
- P1 run `45917240585` on the same SHA: Vitest PASS, strict TypeScript PASS, P4 strict TypeScript PASS, production build PASS.
- Hosted customer/order/tenant E2E remained SKIPPED. It is not a PASS and is unchanged.
- These results do not count as acceptance for the new head `b09d0a0`; rerun exact-head evidence is required.

## Acceptance that remains required
1. PostgreSQL 17 version and loopback-only endpoint validation.
2. Manager and admin writes through `record_operational_task_quality_review`.
3. Exact replay and concurrent replay produce one immutable event and one audit row.
4. Changed payload, changed actor and reused event ID conflict with no side effects.
5. Staff/customer denial, restricted metrics and cross-tenant isolation.
6. Direct raw-table denial and append-only trigger enforcement.
7. Deliberately stale task snapshot is rejected with `40001`, with counts unchanged.
8. P1, public Chromium and full local P2 sequence must complete on the exact new head.

## Safety and ownership
- All test writes run only on the disposable local Supabase/PostgreSQL 17 stack created by the existing workflow.
- No hosted target or production environment is contacted; no paid infrastructure or external API is used.
- No successful quality-review PASS is claimed until the corrected exact head completes.
- P1 remains the sole owner of integration/merge into `main`.
