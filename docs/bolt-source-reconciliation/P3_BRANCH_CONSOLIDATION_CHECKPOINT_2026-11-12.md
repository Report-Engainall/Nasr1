# P3 Execution Checkpoint — Superseding Update — 2026-11-12

Repository: `Report-Engainall/Nasr1`
Canonical branch: `main`
Main SHA at this update: `2e536ba728376ace15450ecaaa9d7a92770ec275`
Exact code-verification SHA: `89bd6d5285db7c20f9e43a835d7f3d4abd865f97`

## Completed on main

- Exact P1 Actions run [#43122676877](https://github.com/Report-Engainall/Nasr1/actions/runs/43122676877) succeeded on the exact code SHA: 27/27 Vitest files, 169/169 tests, strict TypeScript, and production bundle build.
- PR #416 was closed without merging after its unique Onyx source-kind guard UI, bounded source preview, 27-column export correction, import dataset classification, and Arabic help-search changes were reconciled into main. The branch remains as a reference; it was not deleted.
- PR #417 was closed without merging after its manual-order UI and approved-customer selector were reconciled into main. The UI now enforces integer quantities and a 100-line ceiling matching the server RPC; the client sends IDs, quantities, terms, notes and an idempotency key only.
- PostgreSQL 17 acceptance succeeded:
  - [Onyx source-kind and idempotency #43118122150](https://github.com/Report-Engainall/Nasr1/actions/runs/43118122150).
  - [DQS whitespace/date rejection #43121339520](https://github.com/Report-Engainall/Nasr1/actions/runs/43121339520).
  - [Shipment-time inventory and open-PO reconciliation #43121422281](https://github.com/Report-Engainall/Nasr1/actions/runs/43121422281).
- The connected Supabase project has these recorded migrations:
  - `20261111230620_enforce_admin_import_snapshot_kind`
  - `20261111233753_import_quality_whitespace_date_rejection`
  - `20261111233835_inventory_replenishment_shipment_sales_reconciliation`
- Live database post-change counts: organization=1, profiles=2, customers=0, products=0, balances=0, inventory movements=0, orders=0, import jobs=0, audit logs=26. No sample/seed/business rows were inserted; no inventory, invoice, payment or ledger transaction was run.
- Function ACL checks: `anon` is denied EXECUTE on all three new/updated RPCs; `authenticated` retains EXECUTE and each RPC enforces its own profile/tenant/role checks.

## Work intentionally not certified

- Onyx external target-version round-trip and production/customer/product bulk import remain NOT_PROVEN; no real snapshot was applied.
- Manual order UI tests prove validation, payload minimization and idempotent retry behavior with mocked API calls. Live populated-data order creation/replay/credit outcomes remain PENDING because the connected DB currently has no approved customers or products. The live `create_staff_order` RPC contract was inspected, not invoked with fake records.
- /help browser navigation, responsive RTL and keyboard acceptance remain BROWSER_PENDING despite source tests and exact P1 CI success.
- Inventory intelligence returns UNAVAILABLE when there is no active product population; no fake stock or order rows were added to produce results.
- P2 PR #412 remains OPEN/BLOCKED by a Playwright finance/purchase-order print selector failure. PR #413 remains DRAFT/stale and has no exact-head acceptance.
- PR #416 and #417 are closed without merge; no branch deletion was attempted. The connected GitHub identity reports `admin=false`; the available GitHub actions do not expose a delete-ref operation. The newer `feat/admin-order-entry-main-sync-2026-11-12` branch is behind main and has an older, weaker quantity/line limit, so it remains unmerged.
- Supabase advisors still report the findings itemized in CURRENT_EXECUTION_STATE. Health lints are empty; security/performance warnings are not all resolved. Leaked-password protection is still WARN and no project Auth setting was changed.

## Release decision

**NO-GO for production readiness.** Source/P1/PG17 evidence above is real and SHA-bound, but populated commercial-data acceptance, browser acceptance, Onyx target-version round-trip, PR #412 P2 repair, PR #413 disposition, and the remaining advisor remediation are still outstanding.

---
# P3 Branch Consolidation Checkpoint — 2026-11-12

Repository: `Report-Engainall/Nasr1`
Canonical branch: `main`
Main SHA before this checkpoint document: `a98b3cb5a72edb0dcc141983909bf7f67a679287`
Scope: consolidate existing branch work into main without discarding code, then remove only branches whose content is already represented in main.

## Completed in this pass

### PR #415 — merged

- PR: https://github.com/Report-Engainall/Nasr1/pull/415
- Branch: `fix/p1-import-snapshot-kind-binding-20261110`
- Exact reviewed head: `6831414cde6610ef8e79a4a9635fc32fd380517e`
- GitHub Actions PostgreSQL 17 acceptance run: `42892384014` — SUCCESS on the exact head.
- Merge method: squash.
- Merge commit on main: `a98b3cb5a72edb0dcc141983909bf7f67a679287`.
- Verified after merge: the migration, PostgreSQL acceptance SQL, and workflow blobs on main exactly match the source branch blobs:
  - `supabase/migrations/20261110210000_enforce_admin_import_snapshot_kind.sql`
  - `supabase/tests/admin_import_snapshot_kind_acceptance.sql`
  - `.github/workflows/onyx-import-postgres-acceptance.yml`
- The migration is in source control only. No production migration was applied and no production data was changed.
- The source branch remains present; the repository did not auto-delete it after squash merge.

## Current branch inventory

The branch scan returned 14 side branches plus main.

### Branches with no commits ahead of main

The following refs compared as `ahead_by=0`; their branch tips are ancestors of main and they carry no unique commits:

- `backup/bolt-import-2026-11-08`
- `backup/main-2026-11-08`
- `backup/reference-archive-2026-11-08`
- `bolt-import-2026-11-08`
- `fix/customer-import-idempotent-apply-20261110`
- `nasr1-reference-archive-2026-11-08`
- `p1/phone-signup-acceptance-2026-11-11`
- `work/bulk-catalog-customer-import-20261110`

These are safe branch-deletion candidates after confirming no external workflow still depends on their ref names. Their commits/content are already reachable from main.

### Redundant backup ref

- `backup/fix-ci-2026-11-07` is commit-identical to `fix/ci-acceptance-lock-and-test-contracts-20261107`.
- Only the backup pointer is redundant. Keep the primary `fix/ci-acceptance-lock-and-test-contracts-20261107` until its unique changes are resolved.

### Merged P2 branch

- `fix/p1-import-snapshot-kind-binding-20261110` is the source branch of merged PR #415.
- Its three changed-file blobs were verified identical to main after merge.
- Safe deletion candidate; branch deletion has not been performed.

### Branches with unresolved or not-yet-reconciled content

1. `fix/ci-acceptance-lock-and-test-contracts-20261107` — PR #412 remains OPEN; 64 commits ahead by comparison and 62 changed paths. Exact head: `b1eb021804c968714151fdc83926a8f9dfc503fb`. PostgreSQL import-finalizer acceptance, static analysis, P1 type assurance, secret scan, P3 tooling and general commerce checks succeeded. P2 Playwright failed only at the finance/purchase-order print acceptance step: `e2e/finance-task-print.spec.ts:471`, where the locator `getByRole('region', { name: 'مسودة أمر شراء جديدة' }).getByLabel('الصنف', { exact: true })` was not found after a 20-second wait. Four tests in that browser suite passed; the failing test did not. Do not merge until the selector/UI contract is corrected and exact-head P2 reruns successfully. The backup branch above is identical and may be removed without deleting the primary branch's work.

2. `feat/admin-storefront-publication-readiness` — PR #413 remains OPEN and DRAFT; 3 changed files. Exact head: `18dac50c888471ad2568a7fc50de5af0580fdf17`. The SQL function is read-only and checks active profile, tenant and admin/manager role; it grants execute to authenticated while enforcing role checks inside the SECURITY DEFINER function. No GitHub Actions acceptance run was returned for this draft. The PR is now reported unmergeable against the advanced main tip. Keep it until rebased/reconciled and exact-head acceptance is available; do not bypass the draft or conflict state.

3. `fix/p1-onyx-snapshot-kind-binding-20261110` — PR #416 remains OPEN; 17 changed files. Exact head: `b9fbe734993e7fba801b03da9b220aadb2fd439c`. P1 Admin Context Verification run `42901440254` succeeded on that exact head (16/16 Vitest files and strict TypeScript/build per PR evidence). The branch is stale against main and GitHub reports it unmergeable. It contains the Onyx source-job binding, bounded snapshot preview and Arabic Help search changes. Do not force-merge or overwrite current performance/API work. Reconcile the 17 changed paths onto current main and rerun the P1 workflow on the reconciled SHA.

4. `fix/import-kind-idempotency-20261110` — historical follow-up after PR #414, with 7 commits ahead of its earlier merged base. The customer-import migration, UnifiedImportEngine component, unified-import implementation and header-test files were checked and match current main blobs. The branch's `src/lib/api.ts` blob differs from main; main contains a newer, broader API implementation and already exports `ensureCustomerImportProfile`. Keep this branch pending a focused API-diff review; do not delete solely on the basis of PR #414 having merged.

## Additional unmerged historical work

- PR #411 (`Complete executive liquidity ageing and ranked daily decisions`) is CLOSED without merge. Its head `ddc2f1f376b2dc31764137aaa01524debab324c0` has 14 commits / 7 changed paths relative to current main; its exact-head validation runs failed. Its branch ref is not in the current branch list. Preserve this recoverable commit history; it is not evidence of a merged feature.

## Branch cleanup limitation

The connected GitHub actions available in this session expose branch listing, commit comparison, file reads, ref updates and PR merge, but do not expose the GitHub DELETE git-ref / delete-branch operation. The repository metadata reports push permission but not admin permission. `update_ref` only moves a ref to a commit and is not a branch-deletion API. No zero-SHA workaround, force update, or destructive substitute was attempted.

Deletion candidates identified (not deleted):
- The eight behind-only branches listed above.
- `backup/fix-ci-2026-11-07` (duplicate of the retained primary fix/ci branch).
- `fix/p1-import-snapshot-kind-binding-20261110` (PR #415 merged and all three file blobs verified on main).

Do not delete the four unresolved branches until their unique content is integrated or explicitly dispositioned.

## Next execution order

1. Reconcile the PR #416 Onyx UI/API/help changes onto current main without overwriting newer performance changes; rerun exact-SHA P1 Actions.
2. Reconcile PR #412's 62 changed paths against current main; fix the purchase-order product selector contract and rerun exact-SHA P2, especially finance, inventory and tenant-isolation paths.
3. Review the remaining `api.ts` difference on `fix/import-kind-idempotency-20261110`; close only after proving the customer-import profile behavior is represented on main.
4. Reconcile PR #413 with current main, add/execute focused authorization and tenant-scope acceptance, then merge only after exact-SHA evidence.
5. Delete only the 10 identified cleanup candidates after a DELETE-ref operation is available and each candidate is rechecked immediately before deletion.
6. Do not apply migrations to production, deploy, consume Vercel credits, or change live integrations as part of this branch-consolidation work.

Evidence labels:
- PR #415: MERGED; PostgreSQL_17_ACCEPTANCE=SUCCESS_EXACT_HEAD.
- PR #412: BLOCKED_FAILED_P2_EXACT_HEAD.
- PR #413: BLOCKED_DRAFT_STALE_BASE_NO_ACTIONS_EVIDENCE.
- PR #416: BLOCKED_STALE_BASE_MERGEABILITY_FALSE; P1_ACTIONS_SUCCESS_EXACT_HEAD.
- Branch deletion: BLOCKED_TOOL_CAPABILITY; candidates identified, no deletion action performed.
