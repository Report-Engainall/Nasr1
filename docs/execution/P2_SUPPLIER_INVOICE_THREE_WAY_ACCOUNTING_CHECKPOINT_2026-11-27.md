# P2 Checkpoint — Supplier Invoice Three-Way Match and Accounting Handoff
Date: 2026-11-27
Repository: `Report-Engainall/Nasr1`
Owner: P2 — PostgreSQL 17, purchasing, supplier finance and ledger integrity
Base SHA: `d7da98a0a11872c8c263c4dbf26dba258637d95e`

## Latest exact-head acceptance and concurrent race coverage — 2026-11-27

- **Tested PR head:** `416c0d8e64f9eb1f4f95619aea389e3e7f63c3aa`.
- Added two independent PostgreSQL clients (`db` and `concurrentDb`) to the existing isolated test runner; no production SQL/RPC or dependencies changed.
- Concurrent exact replay: both sessions record the same invoice payload/key at the same PO/receipt. Exactly one insert (`replayed=false`), one exact replay (`replayed=true`), same invoice ID and one persisted invoice row.
- Concurrent physical quantity ceiling: two sessions submit different invoice numbers/keys against the same one-unit physical receipt. Exactly one succeeds; the other is rejected with SQLSTATE `22023` and the not-yet-invoiced quantity message. The persisted invoice quantity is exactly `1.000`, equal to the source physical received quantity, with one invoice only.
- **P1 run [45928108345](https://github.com/Report-Engainall/Nasr1/actions/runs/45928108345): SUCCESS** — Vitest, P1/P4 strict TypeScript and production build all passed on the exact head.
- **P2 run [45928108287](https://github.com/Report-Engainall/Nasr1/actions/runs/45928108287): FAIL at one unrelated P1 browser assertion**. The local authenticated PostgreSQL 17 job [140275022832](https://github.com/Report-Engainall/Nasr1/actions/runs/45928108287/job/140275022832) completed and cleaned up. Supplier invoice three-way matching step 35: **PASS**; its runner reached the final success output after both new concurrent cases and all existing invoice/variance/Maker-Checker/tenant/audit assertions passed. All other prior DB checks, local build, order/tenant Chromium, stock-count XLSX, purchase-order XLSX, checkout replay, return/credit memo and Onyx export steps passed.
- The single failure was step 50, `Run finance document and operational-task print acceptance in Chromium`, at `e2e/finance-task-print.spec.ts:486`: the test expected 11 task cards on page 2 but received 10, while the immediately preceding status assertion displayed `عرض 11–20 من 21 مهمة`. Ten cards are correct for the inclusive 11–20 page. This is the P1-owned assertion defect already corrected in PR #633 by using `lastTaskOnSecondPage - 10`; do not weaken the rendered range, tenant, or viewport assertions.
- P2 public Chromium read-only smoke: **SUCCESS**. Authenticated infrastructure gate: **SUCCESS**. Hosted customer/order/tenant E2E: **SKIPPED**, not PASS.
- Therefore: **P2 supplier invoice and concurrency acceptance PASS on SHA `416c0d8...`; overall integrated P2 workflow FAIL only because of the independent P1 pagination assertion above.** No supplier invoice database fix is indicated by this run.

## Latest main and integration boundary
- Latest observed `main`: `586db787dd3b17c18ad7a2e2a1e3ea65d93a7f8e` (execution cursor refresh after product-image acceptance).
- PR #641 remains open; current compare is **12 commits ahead / 5 behind**, merge base `d7da98a0a11872c8c263c4dbf26dba258637d95e`, with exactly three unique paths: `.github/workflows/p2-playwright-critical-paths.yml`, this P2 checkpoint, and `scripts/test-supplier-invoice-three-way-accounting.mjs`.
- P1 owns synchronizing with `586db78...`, reviewing those three scoped paths, incorporating its page-2 assertion correction, and rerunning P1/P2 on the exact synchronized head. P2 does not merge to `main`; P3 retains merge authority.
- Do not carry current-head acceptance to any post-sync SHA without exact-head reruns. Hosted E2E remains SKIPPED and release remains NO-GO until separately authorized hosted target identity and credentials are proven.

## Synchronization with latest main — 2026-11-27
- Latest `main` advance incorporated: `d7da98a0a11872c8c263c4dbf26dba258637d95e` (`feat(purchasing): searchable paginated purchase order registry`).
- No overlap with this PR's P2 supplier invoice test or checkpoint; main's purchase-order search work and its test/path-filter changes are preserved.
- Synchronization commit uses latest `main` as first parent and previous P2 branch head `335811fe861ce0c47b669d3363b5d15879578917` as second parent; no force-push or history rewrite.
- The P2 workflow is re-applied on top of the new main workflow with the supplier invoice test path filter and PG17 runner retained.
- Exact-head acceptance remains `PENDING` until P1/P2 complete on the synchronized head.
## Existing implementation reused
- Three-way match migration: `20261105240000_supplier_invoice_three_way_matching.sql`.
- Supplier invoice accounting handoff: `20261105260000_supplier_invoice_accounting_handoff.sql`.
- Supplier invoice server-side register search/filter: `20261126150000_supplier_invoice_register_server_filters.sql`.
- Existing UI and server search PRs #615 and #611 are already merged.
- No new tables, RPCs, migration, duplicate finance engine, supplier API, or UI were introduced.

## New PostgreSQL 17 acceptance
- New isolated runner: `scripts/test-supplier-invoice-three-way-accounting.mjs`, wired into the existing P2 local Supabase job after purchase-receipt accounting acceptance.
- Uses the existing seeded local manager/admin/customer profiles, existing PO/receiving RPCs, existing source-linked receipt accounting, and existing supplier invoice / journal RPCs.
- Proves PO→physical receipt→posted receipt journal→supplier invoice three-way match against ordered, received and invoiced quantities/costs.
- Proves exact idempotent record replay, changed-payload conflict, duplicate supplier invoice number rejection, and over-invoicing a fully consumed physical receipt line rejection.
- Proves invoice author cannot self-review a variance or prepare their own accounting handoff.
- Proves exact match with no tax/variance creates one reconciliation handoff and no second payable journal.
- Proves an independently reviewed variance plus explicit tax account and variance expense account creates the exact balanced adjustment journal; the handoff maker cannot post it, a different manager can post it once, and a retry returns the same posted journal.
- Proves rejected price variance cannot reach accounting handoff.
- Proves customer RLS hides invoice evidence, finance RPC denial, direct authenticated UPDATE denial, and byte-for-byte source/line/event/handoff/journal/audit snapshots unchanged around denied operations.
- No test credentials, secret values, remote API, bank endpoint or hosted Supabase are used.

## Safety and scope
- The runner validates database and Supabase API endpoints as explicit loopback-only before any connection work.
- All PO, receipt, source journal and supplier invoice fixtures are created only in disposable local PostgreSQL 17/Supabase and are isolated by the P2 CI tenant.
- No production/hosted DDL, migration, data mutation, RPC deployment, permissions change, or journal post is performed.
- P2 owns this test and checkpoint; P1/P3 retain authority to merge.


## Test-harness hardening after first CI dispatch
- The snapshot helper intentionally resets the SQL role to the privileged local test connection for before/after comparisons.
- The two direct-write negative assertions now explicitly re-establish the intended authenticated customer/manager session immediately before executing the denied UPDATE.
- This keeps the evidence meaningful: SQLSTATE `42501` must come from database privilege enforcement for the authenticated role, not from running the statement as the local service connection.
- This is test-harness-only; no migration or application SQL changed.

- Service-verification SQL reads for handoff and audit counts explicitly reset to the local verifier role after authenticated RPC assertions; authenticated write-denial checks re-establish their intended principal immediately before mutation attempts.
- Latest test script hardening commit: `2965337f61f651f8bc3bcd25ffc272865a85c18e`.
- Corrected test script commit: `629ddc10d1e39dd7d039b71d5800163e0b47fe85`.

## First PostgreSQL 17 execution — test-only correction
- First full local run: [45923927014](https://github.com/Report-Engainall/Nasr1/actions/runs/45923927014), job `140262219865`, exact test step 35.
- The source migrations, fixtures, PO/receipt source posting, exact invoice replay, payload mismatch denial, duplicate invoice number, quantity ceiling, customer privacy/write denial, independent variance approval and exact/no-adjustment handoff all executed before the first failure.
- The first failure was in the acceptance scenario, not a business-rule defect: it swapped a tax asset account with a price-variance expense account and then expected the idempotency fingerprint conflict. The handoff RPC correctly rejected the mismatched account type earlier than fingerprint evaluation.
- Corrected scenario now provisions a second valid active tax **asset** account and reuses the same handoff key while changing only the valid tax-account mapping; this reaches and asserts the intended payload-fingerprint conflict. SQLSTATE assertion diagnostics also report the actual server message on failure.
- Test-only correction commit: `e607296236fee81fb87ec7ea7b711d42549f0598`.
- The correction explicitly verifies the alternative tax account is active, belongs to the same organization and has account type `asset` before retrying with the changed valid account mapping.
- Re-run state: `PENDING` on the updated branch head; the previous run's test failure remains recorded above and is not accepted.
- The corrected script requires a fresh exact-head P1/P2 run. The prior overall run remains `FAIL`; it is not retroactively counted as PASS.

## Historical exact-head acceptance — prior test-only revision (superseded by latest result above)
- Tested code/PR head: `3848643d62f7f1f92884edf552a3a46778a3aac0`.
- P1 Admin Context Verification: `PASS` — [run 45924845926](https://github.com/Report-Engainall/Nasr1/actions/runs/45924845926).
- P2 public storefront smoke: `PASS` (20 steps); authenticated infrastructure gate: `PASS` (3 steps) — [run 45924845994](https://github.com/Report-Engainall/Nasr1/actions/runs/45924845994).
- **Supplier invoice three-way PostgreSQL 17 step 35: `PASS`** — local authenticated job `140264626247`; exact log output: `PASS PostgreSQL 17 supplier invoice three-way acceptance: receipt-linked quantities/costs, exact replay and conflicts, duplicate invoice number and quantity ceiling, independent variance review, no-adjustment/no-duplicate-payable path, explicit tax/variance posting, maker-checker journal posting, rejected-variance denial, tenant privacy, immutable evidence and audit invariants.`
- The same local authenticated job completed with 55 successful steps, 1 failed step, and remaining cleanup/evidence steps successful. The only failure was step 50 (`Run finance document and operational-task print acceptance in Chromium`) at existing P1 test `e2e/finance-task-print.spec.ts:486`.
- Failure detail: test expected 11 task cards on page 2, received 10; its immediately preceding pagination status assertion passed and showed `عرض 11–20 من 21 مهمة`. The app correctly rendered a 10-item page; the test incorrectly expected `totalTaskCount - 10` (11) instead of `Math.min(10, totalTaskCount - 10)`. The additional source-backed tasks are legitimately created by purchase/invoice fixtures. This is a P1 test arithmetic defect, not a supplier invoice RPC/database failure.
- Four other finance/print Chromium scenarios passed. P1 was notified with the exact calculation and suggested third-page check in [#633 comment 7207797207](https://github.com/Report-Engainall/Nasr1/pull/633#issuecomment-7207797207). Do not remove responsive, tenant isolation or task pagination checks.
- Hosted customer/order/tenant E2E: `SKIPPED`, not PASS.
- No production/hosted migration, database write, journal posting, inventory movement or user permission changed. All supplier invoice records and journals were created in disposable local PostgreSQL 17 only.
- **P2-owned supplier invoice acceptance: `PASS` on SHA `3848643...`; integrated P2 workflow: `FAIL` only at the separate P1 pagination assertion above.**
- `main` has subsequently advanced from `d7da98a...` to `e2486a04d1ce4094f94fce8b5a8a19e1c35bf361`; PR #641 is one commit behind and currently GitHub reports `mergeable=true`. Synchronize after P1 fixes the assertion and rerun the integrated P2 job on the new exact SHA before P3 merges.
- P2 owns this checkpoint and evidence; P1 owns the UI test correction; P3 retains merge authority to `main`.

## Next action
- P1 fixes the task page-2 expected card count (cap at 10 and optionally assert page 3 count) without weakening tenant/viewport assertions. Then synchronize this PR with current `main` and run P1/P2 on the resulting exact head. No supplier invoice SQL change is warranted by this run.

## Main movement after exact-head acceptance
- After the `3848643...` P1/P2 run, current `main` advanced again: `e2486a04d1ce4094f94fce8b5a8a19e1c35bf361` (inventory transfer history UI/filter), then `85331656b51825e0e1316f31faff644a09c58602` (stock-count search filters/pagination).
- The latter changes the shared P2 workflow path filters plus stock-count page/tests/filter library; it does not change supplier invoice RPCs, invoice runner, or supplier-invoice UI.
- PR #641 last observed head before this checkpoint amendment: `3848643...`; it is currently two commits behind latest `main`, `mergeable=true`. Do not claim current-head acceptance and do not merge until P1 fixes the task pagination test, synchronize with latest main, and reruns exact-head P1/P2.
