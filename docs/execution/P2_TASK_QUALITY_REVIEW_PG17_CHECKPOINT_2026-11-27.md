# P2 Checkpoint — Operational Task Quality Review PostgreSQL 17 Acceptance
Date: 2026-11-27
Repository: `Report-Engainall/Nasr1`
Role: P2 — PostgreSQL, RPC authorization, tenant isolation, idempotency and audit integrity
Base `main` after synchronization: `317ebca76c4d236a1d0efe0fd5934b028598c72b`
Branch: `p2/task-quality-review-pg17-20261127`
Latest code head: P2 synchronization commit based on `317ebca76c4d236a1d0efe0fd5934b028598c72b` (see current PR head for exact SHA)
Status: P2 test harness captures a manager-visible task revision as a typed PostgreSQL value in one statement; RLS returns no row for staff/customers and the RPC rejects them before envelope validation. The RPC retains full actor authorization, row lock and optimistic concurrency checks. CI concurrency now supersedes stale runs by PR/ref so only the newest exact SHA remains active. Exact-head PG17/P2/P1 rerun pending.

## Work delivered on this branch
- Added `scripts/test-task-quality-review-authorization.mjs`, using the existing P2 disposable Supabase/PostgreSQL 17 fixtures and strict local-endpoint guard.
- Wired the script into the existing `p2-playwright-critical-paths.yml` local authenticated PostgreSQL 17 acceptance sequence and path filter.
- Optimized P2 Actions concurrency to group by PR/ref rather than commit SHA; `cancel-in-progress: true` now cancels obsolete queued/running commits after each PR update, keeping exact-head evidence current and reducing runner contention. No test was removed or skipped.
- First attempt on SHA `c0798a170a9081630be5929ed7e6f7df2e3de12e`: RPC rejected the review JSON because the test supplied a JSON scalar. Corrected with `db.json(review)`.
- Second attempt on SHA `ee2ed8b4d94ac7fcbfd2249f0cd172946948919e`: P1 and public Chromium passed; local PostgreSQL 17 migrations and all preceding DB acceptance steps passed; quality-review step 24 failed with `40001` / “task changed after the review was opened” on its first write.
- Root cause isolated to the test harness converting the exact database `updated_at` timestamp through Node and back into a timestamptz parameter. The RPC correctly enforced optimistic concurrency. Corrected the harness to keep the current timestamp typed as a PostgreSQL value inside the RPC statement; the deliberate stale-snapshot case still supplies the original timestamp and must fail with `40001`. The test captures the current row version with a plain SELECT (no `FOR UPDATE` or extra UPDATE privilege); only the production RPC takes the row lock.
- Follow-up commits: `f761f39cb5434fe8f7941c32d53db625c9b03061` (typed database snapshot path), `b09d0a08057ca8f838b084e83dc564b3dfa21f0b` (explicit stale timestamp in denial test), `bf36a64ab5fa92b0335ed643b5946f94331370de` (remove test-side row lock; let the RPC own locking).
- No application RPC, production migration, RLS policy, role, hosted row, production data, deployment, or external service was changed.

## Last exact-head evidence before the harness correction
- P2 run `45917240491` on SHA `ee2ed8b4d94ac7fcbfd2249f0cd172946948919e`: infrastructure gate PASS; public Chromium PASS; local PostgreSQL migrations PASS; prior local acceptance steps PASS; quality-review acceptance step 24 FAIL due to timestamp round-trip; steps after 24 were SKIPPED by fail-fast.
- P1 run `45917240585` on the same SHA: Vitest PASS, strict TypeScript PASS, P4 strict TypeScript PASS, production build PASS.
- Hosted customer/order/tenant E2E remained SKIPPED. It is not a PASS and is unchanged.
- These results do not count as acceptance for the corrected code head `bf36a64`; those runs do not certify this new synchronized head. Main has been advanced to `317ebca76c4d236a1d0efe0fd5934b028598c72b`. The merge commit uses current main as first parent, preserves this branch as second parent, and reapplies only the three P2-owned paths over the current tree. The only P2 workflow edits are this acceptance script's path filter and step insertion.

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
- P1 is the sole owner of integration/merge into `main`; P2 supplies exact-head evidence and does not merge into `main`.
