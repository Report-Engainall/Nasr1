# P2 Checkpoint — Operational Task Quality Review PostgreSQL 17 Acceptance
Date: 2026-11-27
Repository: `Report-Engainall/Nasr1`
Role: P2 — PostgreSQL, RPC authorization, tenant isolation, idempotency and audit integrity
Base `main`: `ea4b68dc063651d6cf36c8946947a27d0e40ac31`
Branch: `p2/task-quality-review-pg17-20261127`
Status: first exact-head attempt FAILED at the initial review RPC with SQLSTATE 22023 (invalid task quality review envelope); retry pending after fixture timestamp/envelope diagnostics fix.

## Work delivered on this branch
- Added `scripts/test-task-quality-review-authorization.mjs`, using the existing P2 disposable Supabase/PostgreSQL 17 fixtures and local-endpoint guard.
- Wired the script into the existing `p2-playwright-critical-paths.yml` local authenticated PostgreSQL 17 acceptance sequence and its main push path filter.
- First attempt on SHA `c0798a170a9081630be5929ed7e6f7df2e3de12e`: main migration replay, fixture setup and prior steps passed; the first quality review RPC rejected its argument envelope (`22023`) before inserting a review event. No application migration/RPC change was made in response.
- Follow-up hardening: task timestamps now round-trip as exact PostgreSQL text (preserving microseconds), and every review call first runs a SQL predicate probe for all six RPC envelope fields. The test fails with the exact rejected field names before calling the write RPC if the fixture is malformed.
- No application RPC, production migration, RLS policy, role, hosted row, production data, deployment, or external service was changed.

## Acceptance exercised
1. PostgreSQL 17 version and loopback-only Supabase/database endpoint validation.
2. Manager and admin write through `record_operational_task_quality_review`; the test uses `create_operational_task` for real same-tenant task fixtures.
3. Exact replay returns the original event ID and `duplicate=true`, without duplicating quality-event or audit rows.
4. Concurrent identical requests serialize to one event and one audit record.
5. Changed payload, changed actor and duplicate event ID are rejected with SQLSTATE `23505`, with before/after side-effect counts unchanged.
6. Staff and customer actors are denied; customer metrics return the explicit restricted state.
7. A manager cannot review a task belonging to the other seeded organization.
8. Direct SELECT/INSERT/UPDATE/DELETE of the event table is denied for authenticated; table access is checked as revoked from authenticated and service_role.
9. Privileged UPDATE/DELETE attempts still hit the append-only trigger (`55000`).
10. Stale task `updated_at` is rejected (`40001`) and audit rows retain only structured review fields, not free-text reviewer notes.

## Evidence boundary
- First attempt failure evidence: P2 run `45915895016`, step 24. Diagnostic log records `invalid task quality review envelope`; no successful quality-review PASS is claimed.
- All writes run only on the disposable local Supabase stack started by the existing P2 workflow; no hosted target is identified or contacted.
- The hosted customer/order/tenant E2E gate remains unchanged and must not be relabelled PASS.
- Exact-head PG17/P2/P1 results will be recorded only after Actions complete on this branch's tested SHA.
- P1 remains the sole owner of integration/merge into `main`.
