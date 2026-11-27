# P2 Checkpoint — Operational Task Quality Review PostgreSQL 17 Acceptance
Date: 2026-11-27
Repository: `Report-Engainall/Nasr1`
Role: P2 — PostgreSQL, RPC authorization, tenant isolation, idempotency and audit integrity
Synchronized `main`: `317ebca76c4d236a1d0efe0fd5934b028598c72b`
Branch: `p2/task-quality-review-pg17-20261127`
Last code-bearing sync SHA: `1ceb9dc818e1c69394daa7f3c63f8fd5ee3ed5be`
Latest pre-checkpoint branch SHA: `d2a9b91f90d5c7d61f2b90502a15a2e8124a7d1d`
Status: PENDING exact-head PostgreSQL 17 acceptance. The checkpoint-only update must receive its own P1/P2 run before the PR can be handed off as accepted.

## Implementation delivered
- Added `scripts/test-task-quality-review-authorization.mjs`, using the existing disposable local Supabase/PostgreSQL 17 fixtures and strict local-endpoint guard.
- Wired the test into `p2-playwright-critical-paths.yml` and its path filter.
- The test covers manager/admin authorization; staff/customer denial; tenant isolation; idempotent exact replay and concurrent replay; payload/actor/event ID conflicts; stale task versions; raw event-table access denial; append-only enforcement; and audit side-effect counts.
- The RPC remains unchanged. Its actor authorization, row lock, optimistic concurrency, idempotency and audit behavior are not weakened.
- The current-snapshot test uses a materialized CTE to read `updated_at` as a typed PostgreSQL value under the calling role. RLS returns no visible task row for staff/customers, so the RPC receives NULL and denies the actor at the authorization boundary before envelope validation. The stale-snapshot negative case deliberately sends the old timestamp and must still fail with `40001`.
- P2 Workflow concurrency was adjusted to group by PR/ref with `cancel-in-progress: true`, so subsequent PR updates supersede obsolete queued/running runs. No acceptance test was removed or skipped by that change.
- No production migration, RPC, RLS policy, role, hosted row, production data, deployment, or external service was changed.

## Exact-head evidence and boundaries
### Previous synchronized code SHA `1ceb9dc818e1c69394daa7f3c63f8fd5ee3ed5be`
- P1 run `45918958754`: PASS. Vitest `235/235` files and `1,728/1,728` tests; P1 strict TypeScript PASS; P4 observability strict TypeScript PASS; production build PASS.
- P2 run `45918958705`, public UI job `140244811084`: PASS. Chromium `26/26`; local isolated build; no external backend writes; all browser assertions and proof-boundary steps passed.
- P2 authenticated infrastructure gate: PASS.
- Hosted customer/order/tenant E2E: SKIPPED, not PASS.
- Local PostgreSQL 17 job `140245755007` had started but had not completed in the last captured status; it is not accepted as PASS on this SHA.
### Diagnostic run on pre-sync SHA `bf36a64ab5fa92b0335ed643b5946f94331370de`
- P1 Vitest initially reported 1 failure in `PromptGovernancePanel.test.tsx` (`1,721/1,722` tests); P1 strict TypeScript, P4 strict TypeScript and production build passed.
- The failure did not reproduce on synchronized SHA `1ceb9dc`, whose full Vitest suite passed. P2 made no changes to the P3-owned Prompt Governance panel.
### Earlier task-quality test failures
- SHA `c0798a170a9081630be5929ed7e6f7df2e3de12e`: the harness passed review JSON as a scalar; corrected with `db.json(review)`.
- SHA `ee2ed8b4d94ac7fcbfd2249f0cd172946948919e`: step 24 failed with `40001` because the harness round-tripped a PostgreSQL timestamp through JavaScript text. The test now keeps the current revision typed inside PostgreSQL; stale-version rejection remains explicitly tested.
- Results from those older SHAs are diagnostic only and do not count as current acceptance.

## Acceptance still required
1. Reapply all repository migrations on disposable PostgreSQL 17.
2. Complete the full P2 local Supabase sequence, including task-quality review, tenant isolation, financial/inventory acceptance and authenticated browser checks.
3. Confirm exact P1 Vitest, TypeScript and production build on the final branch head.
4. Record all PASS/SKIPPED states against that same final SHA.
5. Keep hosted customer/order/tenant E2E marked SKIPPED unless it actually runs with authorized test infrastructure.

## Safety and ownership
- Test writes are confined to the ephemeral local Supabase/PostgreSQL stack created by the workflow.
- No hosted target or production environment is contacted; no paid infrastructure or external API is used.
- No quality-review PASS is claimed until the final exact-head run completes.
- **P3 alone owns integration/merge into `main` and updates the global state, acceptance matrix and integration log. P2 owns this checkpoint and supplies evidence only.**
