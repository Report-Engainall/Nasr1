# P2 Checkpoint — Supplier Invoice Three-Way Match and Accounting Handoff
Date: 2026-11-27
Repository: `Report-Engainall/Nasr1`
Owner: P2 — PostgreSQL 17, purchasing, supplier finance and ledger integrity
Base SHA: `d7da98a0a11872c8c263c4dbf26dba258637d95e`

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

## Acceptance
- Initial state: `PENDING` exact-head P2 run.
- PASS requires the new step, complete local P2 Supabase job, P1 verification and strict TypeScript/build to finish on the exact same PR SHA.
- Hosted customer/order/tenant acceptance remains separately SKIPPED until a real target and dedicated credentials are approved; it is never implied by local PostgreSQL 17 evidence.

## Next action
- Review exact PR tree diff and run exact-SHA P1/P2. Diagnose SQLSTATE, audit or accounting failures before any production SQL changes.
