# P2 Checkpoint — Customer Financial Source Routing
Date: 2026-11-28
Repository: `Report-Engainall/Nasr1`
Owner: P2 — PostgreSQL 17, RLS/RBAC, customer financial identity, audit and transaction safety
Branch: `p2/customer-financial-source-routing-pg17-20261127`

## Current source pointers
- Latest synchronized `main` at this checkpoint update: `f71cc0eeed05a966083f4a4e647021af60733468` (documentation-only execution-state refresh).
- Latest code-bearing `main` SHA recorded in the shared state: `9c51f65f16aad1be300444cc37f5a0457b3dccb1`.
- P2 branch SHA before this checkpoint edit: `fe894f5354aee1cac2bd8a197d5f0179e0af01dd`; this commit has `main` as first parent and the complete P2 branch as second parent. The branch is not behind `main`.
- PR: [#697](https://github.com/Report-Engainall/Nasr1/pull/697), still Draft. Do not mark ready or merge until exact-head PostgreSQL 17 and P2 gates are terminal SUCCESS.
- No production database identity was used, no remote migration/data write/deployment occurred, and no ERP credentials or live ERP calls were used.

## Implemented P2 contract
- One source binding per organization/customer: `APP_ONLY`, `ONYX`, or `MUTAKAMEL`. Existing/new customers are assigned APP_ONLY without inventing opening balances.
- Server-selected source and scope; customers cannot choose or change their financial source. Customer resolver never exposes the ERP external account reference; finance-staff resolver is capability-scoped.
- Source changes follow idempotent request → service-role evidence → different finance maker/checker → binding revision increment and audit.
- Reconciliation evidence now includes a `balances_by_currency` object with exactly two canonical decimal strings per declared currency: `current_source_balance` and `target_source_balance`. All and only declared currencies must be present.
- The database compares each currency pair as PostgreSQL `numeric`. `matched` is rejected if any pair differs; malformed/missing amounts and unlisted/missing currencies are rejected. The evidence hash replay comparison includes the full per-currency balance object, so changed balance metadata under the same hash conflicts.
- PostgreSQL 17 JSON key counts use `jsonb_object_keys` with scalar count subqueries; the migration does not call `jsonb_object_length`.
- APP_ONLY statements continue through the existing internal ledger. ONYX/MUTAKAMEL statements fail closed until P4 supplies an authorized provider reader; there is no APP_ONLY fallback, source blending, or fabricated current ERP balance.
- The APP_ONLY invoice PDF source lock remains in place. Source resolver access is permitted to the customer with `statement.read` or `invoices.read`, without widening invoice data access itself.

## Files owned by this P2 slice
- `supabase/migrations/20261127230000_customer_financial_source_routing.sql`
- `scripts/test-customer-financial-source-routing.mjs`
- `.github/workflows/p2-playwright-critical-paths.yml`
- This checkpoint
- `docs/canonical/AGHBARI-REQUIREMENT-REGISTRY.md` — stable requirement `AGH-CUSTOMER-FINANCIAL-SOURCE-001`
- `docs/bolt-source-reconciliation/API_OPS_CONTRACT_REGISTER_2026-10-24.md` — exact RPC caller/input/evidence contract

## Focused acceptance assertions added
- Every APP_ONLY/ONYX/MUTAKAMEL cutover fixture supplies YER and USD per-currency evidence.
- Reject matched evidence with no balance object, with an amount mismatch in any currency, or with incomplete currency coverage.
- Reject reuse of an evidence SHA with changed but internally equal per-currency balances (exercises the hash-replay guard, not the earlier equality guard).
- Retain source-mode scope, customer/tenant isolation, maker-checker, idempotency, source reference, external statement fail-closed behavior, invoice-source isolation, service-role-only evidence writing, and monotonic sync watermark checks.
- The dedicated P2 workflow invokes `node scripts/test-customer-financial-source-routing.mjs` after isolated local seeding.

## Exact-SHA status
- Last reviewed code-bearing head before this checkpoint update: `fe894f5354aee1cac2bd8a197d5f0179e0af01dd`.
- Static preflight on that head: migration 1,079 lines, one `COMMIT`, one evidence-writer function, two `jsonb_object_keys` usages, exact numeric comparison present, hash comparison includes balances, and no `jsonb_object_length`/stubbed `THEN false`.
- The test script contains the missing/mismatch/incomplete-currency/hash-replay assertions and calls the updated eight-argument service-role writer.
- No PostgreSQL 17 result is yet accepted for the synchronized code head. CI results from earlier intermediate/corrupted heads are superseded and must not be reused. The next workflow head is the commit produced by this checkpoint update; treat all triggered checks as QUEUED/IN_PROGRESS until terminal status is fetched.
- Hosted customer/order/tenant E2E remains outside this local P2 proof; if SKIPPED it is not PASS.

## Superseded/failed intermediate attempts — do not reuse
- The original evidence-only design stored currency codes and record counts but could claim `matched` without proving actual balance equality; that gap is superseded by the current balance-bearing payload.
- Intermediate file-edit commits `895956b95226510d925821efd485c01107ff6015` and `d87fa005b230547907ce8e0971f6b365274443db` contained malformed/duplicated SQL and are not acceptable or test evidence.
- Commit `dc57258d0b2b1605ec3784e4ff9c808eaaf14513` used `jsonb_object_keys` but had a temporary `THEN false` placeholder in place of the numeric equality guard; this was corrected before the synchronized head `fe894f5`.
- The current branch was restored from the known-good migration version at commit `0a7e5da113c477ffe009e2c909a0e8f2cf5f11db`, preserving the concurrent invoice-only resolver permission fix, then the source-balance contract and tests were reapplied and reviewed.

## Safety and ownership boundary
- P2 owns this checkpoint, migration, RPC and local database acceptance. P4 owns ERP transport/readers and must supply real provider/source receipts; P1 owns UI integration. P1/global execution owner updates the shared state and acceptance matrix.
- No remote Supabase migration, production data write, Edge deploy, secrets change, ERP mutation, paid service, Vercel quota, Bolt or Lovable action.
- Do not expose external account references or other customers' statements. Do not present stale provider snapshots as current.
- Release remains NO-GO until the complete business path, authorized external transport, required security/finance/inventory gates, post-merge checks and runtime verification are proven.

## Immediate next action
Fetch the workflow run created by this checkpoint commit and require:
1. isolated PostgreSQL 17 migration + `Customer financial source routing PostgreSQL 17 acceptance: PASS`;
2. P2 Playwright critical paths PASS on the exact same commit;
3. public Chromium/infrastructure required jobs PASS;
4. report hosted tenant/customer E2E as SKIPPED unless it actually executes.
Fix only failures reproduced on the new exact SHA, then update this P2 checkpoint with the terminal evidence and rerun on the resulting SHA if any source/test file changes.
