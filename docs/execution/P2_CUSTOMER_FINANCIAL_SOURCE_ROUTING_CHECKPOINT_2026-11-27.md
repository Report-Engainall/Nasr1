# P2 Checkpoint — Customer Financial Source Routing
Date: 2026-11-27
Repository: `Report-Engainall/Nasr1`
Owner: P2 — PostgreSQL 17, RLS/RBAC, customer financial identity, audit and transaction safety
Branch: `p2/customer-financial-source-routing-pg17-20261127`
Base main at implementation start: `f0c911923b785cdaaf6e823b271f538c56fd7cd3`
Current pre-checkpoint SHA: `b9bbe365f540cbd5acb37e9f91d7e87cb6007c3b`

## Scope
- Establish exactly one financial source binding per `organization_id + customer_id`: `APP_ONLY`, `ONYX`, or `MUTAKAMEL`.
- Backfill existing and newly created customers to `APP_ONLY`; no inferred balances or opening financial records are created.
- Source changes require idempotent request → service-role source reconciliation evidence → distinct finance maker/checker approval → revision increment.
- P4 owns provider transport and real ERP readers. This P2 migration stores only source identity, reconciliation/sync evidence metadata, currency codes, counts, hashes, as-of timestamps and safe external account references; it does not connect to or write to an ERP.
- `get_customer_account_statement()` routes APP_ONLY to the existing app ledger, but fails closed for ONYX/MUTAKAMEL and never silently falls back to the app ledger while the external statement adapter is not available.
- Customer resolver returns mode/status/freshness without exposing external account references; finance staff resolver is capability-gated.

## Current implementation (not yet accepted)
- Migration: `supabase/migrations/20261127230000_customer_financial_source_routing.sql`
- Acceptance script: `scripts/test-customer-financial-source-routing.mjs`
- Workflow: `.github/workflows/p2-playwright-critical-paths.yml`; dedicated source-routing test runs after isolated local seeding, and local PG17/authenticated job no longer depends on the separate public UI smoke.
- The migration file was recreated as a single clean copy after detecting duplicated/overlapping content in the first draft. Current file has 796 lines, four uniquely named source tables, eight P2 functions/triggers, one `COMMIT`, and no CHECK subqueries.
- Additional review fixes: idempotency-key advisory transaction lock for concurrent exact retries; read-only resolver no longer attempts row locks while marked STABLE; explicit hash/null/currency validation in provider evidence writers; statement wrapper preserves `statement.read` authorization and customer row scope.

## Acceptance requirements
1. Apply all migrations on disposable local PostgreSQL 17/Supabase only.
2. Verify legacy customer backfill and customer-create trigger produce exactly one APP_ONLY binding.
3. Concurrent same-key requests return one request ID and one replay; same key/different payload rejects.
4. Reject customer-side source changes, foreign-tenant customers, self-approval, mismatched evidence, stale evidence and unauthenticated service writers.
5. Exercise all transitions: APP_ONLY → ONYX → MUTAKAMEL → APP_ONLY, with P4/service-role evidence and distinct finance checker.
6. Verify external sources never use app ledger fallback; customer resolver hides external account reference.
7. Verify sync evidence exact replay, metadata mismatch denial, source key binding, and monotonic as-of watermark.
8. Verify direct authenticated table access/service-writer function execution is denied, staff scope is tenant-bound, audit events exist, and returning to APP_ONLY leaves the original ledger summary unchanged.
9. Run the dedicated script and broader local P2 critical path on the exact tested SHA. No SKIPPED/IN_PROGRESS is PASS.

## Safety
- No production migration or DB write; no live ERP call; no deployment; no new paid service or external dependency.
- No secrets, credentials, monetary balances, invoice bodies, or journal entries are stored in source-binding evidence.
- External modes remain statement-blocked until P4 supplies an authorized reader contract and P1 wires the resolver into the customer account screen.
- P1 owns merge to `main`; P2 owns this checkpoint and DB acceptance only.

## Next action
Open a draft PR, run exact-head PostgreSQL 17 migrations and source-routing assertions, fix only evidenced SQL/test failures, then rerun all affected acceptance on the new SHA. Keep source-routing IN_PROGRESS until PG17 and security assertions pass.

## Failure analysis and hardened retry — 2026-11-27
- First isolated PostgreSQL 17 application of the new migration failed with SQLSTATE `42601` at the review replay condition that compared `status=CASE WHEN ... END`. The migration was **not accepted** on that attempt. Replaced that expression with explicit boolean branches for approved/rejected replay. Re-run required on the current synchronized head.
- Added a transaction-scoped advisory lock on `organization_id + idempotency_key` before the source-change request lookup, so concurrent exact retries serialize and return one request ID.
- Kept `get_my_customer_financial_source()` read-only (it is declared `STABLE`); source row locks belong only to the volatile statement RPC.
- Added `FOR SHARE` on the customer source binding while the statement is read, preventing a concurrent maker/checker cutover from changing APP_ONLY/ERP routing halfway through a ledger response.
- Removed direct `service_role` DML grants on the four source tables. Only the narrowly scoped SECURITY DEFINER request/review/reconciliation/sync RPCs can mutate the source state/evidence. Acceptance script now verifies the direct table privilege denial and the service-role sync RPC grant.
- The review SQL correction, statement lock, service-role ACL hardening and test assertions are in the current branch; the first failed run belonged to an older pre-fix SHA. Do not transfer its failure or any prior PG17 PASS to the current head.
- Next required evidence: exact-current-head PostgreSQL 17 migration + `Customer financial source routing PostgreSQL 17 acceptance: PASS`, followed by the full P2 local critical-path result. Until then PR #697 stays Draft/IN_PROGRESS.
