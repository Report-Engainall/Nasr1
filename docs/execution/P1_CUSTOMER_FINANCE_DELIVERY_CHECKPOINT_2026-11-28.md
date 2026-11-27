# P1 Delivery Checkpoint — Customer Financial Read Paths
Date: 2026-11-28
Repository: `Report-Engainall/Nasr1`
Owner: P1 — customer workflows, financial presentation and admin UI.
Main baseline: `12b0db37a97128a19073f907ba12fb700251802b`
Branch: `p1/customer-financial-source-ui-guard-20261127-r2`
PR: [#699](https://github.com/Report-Engainall/Nasr1/pull/699) — Draft; do not merge.

## Functional delivery

### Invoices, statement and payment history
- Customer invoice-list loads now use request sequencing. A late refresh cannot overwrite a newer request, and the invoice page is not committed until the server-selected financial-source version is rechecked.
- Older invoice pages revalidate the same source revision before append. A cutover or failed source revalidation discards the page and clears the APP_ONLY invoice list instead of mixing source versions.
- Customer statement reads recheck the financial-source revision after `get_customer_account_statement` returns and before invoice/payment/credit/summary rows are committed.
- Customer payment-history reads perform the same post-read version check before committing the projection.
- The comparison binds server revision, source mode, source status, stale flag and APP_ONLY read permission. Request-sequence guards discard late completions after refresh or unmount.
- Added one source-snapshot unit test and three integration regressions on actual customer routes: invoice list cutover, statement cutover and payment-history cutover. They start with APP_ONLY, change the server source to ONYX/MUTAKAMEL before commit, and assert the old ledger rows are not rendered.
- P1 workflow path filters and `tsconfig.p1-typecheck.json` include the source contract and its test.

### Saved receipts and Customer 360
- Customer receipt list/reprint use customer-only RPCs. Stale receipt pages are discarded; print checks the current source after its RPC and requires the exact selected receipt ID before rendering.
- Customer 360 source preflight and request sequencing prevent a late response for one selected customer from replacing the current customer's data. Print and export remain bound to the selected customer ID.
- Existing ERP read panel/test changes from the current P4 branch are preserved in this reconciliation commit; the panel shows returned counts/checkpoint metadata only and does not claim a live vendor connection.

## Non-destructive branch reconciliation
- P1 financial-source code and regression tests are retained in commit `3cb121612972e9db6bb2f08dcfcea59187d795a0`.
- Current PR branch before reconciliation: `1822a779d696214a71c266e1ddaec8581c1d4846`, containing concurrent P4 ERP read-panel updates.
- The branch histories diverged by three commits on each side. This reconciliation uses a two-parent commit: current #699 head is first parent; the P1 implementation commit is second parent. The resulting tree preserves current P4 changes and restores P1 customer-finance code without force-push or main integration.

## P1 implementation commits
- Customer 360 request-sequence guard: `c08c260b9b810b291aa137212e358378a31099cd`
- Customer 360 race regression: `701c3fbe5261a8943174a4da9286cdc172a0d31b`
- Receipt source/identity guards and regressions: `4149b74f5462e62b955f5fb2a89f567943acf331`
- Receipt test path and TypeScript coverage: `b2ea2cde4cd970055ee9848ae55af8a9db8ae1c2`
- Statement/payment source-revision validation: `74412c840e0d7852c8e3850735186bdd8f54dc88`
- Invoice list and older-page source revalidation: `3cb121612972e9db6bb2f08dcfcea59187d795a0`
- Financial-source CI/typecheck registration: `fdcebb7f3dced427bc7e96edbb1bfaa44b6cdf90`

## Cross-owner dependencies
- **P2 #697 head:** `aa9a5b0631ea47d4bd9da77a6a9615e2aaa86745`. The migration now contains customer-only saved-receipt RPCs and reasserts `get_staff_customer_360` with a `FOR SHARE` lock on the selected source binding. It rejects missing/inactive bindings and external ONYX/MUTAKAMEL sources before returning APP_ONLY finance. The PG17 script directly tests Customer 360 success on APP_ONLY and denial after ONYX/MUTAKAMEL cutovers. Acceptance is still pending on that exact head.
- P2 branch base is `202bb107545fd70db454d5cd6f6923cc76e9f0b4`, seven commits behind current `main` in the observed compare. Reconcile before integration and rerun exact-head gates.
- **P4 #686 head:** `c29b61c32e212fcfac1ecfed128cc9098dd1cade`. The ERP staging migration still has a truncated line-7 CHECK expression (`scope_key text NOT NULL CHECK (scope_key ~ '^[0-9a-f]{64}`). PostgreSQL cannot parse it. Fix the closing regex anchor/quote/parenthesis, then run a full local PG17 reset and `scripts/test-erp-sync-checkpoint-store.mjs` on the exact repaired SHA. Keep live ERP transport disabled.
- Provider contract, licence, sandbox, tenant binding and live credentials remain UNKNOWN.

## Exact-SHA acceptance
- This reconciliation commit becomes the new #699 head and requires fresh P1/P2 workflow runs.
- Earlier-SHA results do not transfer. QUEUED, PENDING, CANCELLED, SKIPPED or BLOCKED are not PASS.
- No current-head Vitest, strict TypeScript, build, PostgreSQL or browser PASS is claimed in this checkpoint.

## Safety and release
- `main` remains `12b0db37a97128a19073f907ba12fb700251802b`.
- No production DB write/migration, financial posting, inventory mutation, live ERP call, secret storage, deployment or paid service was used.
- PR #699 remains Draft. Release remains **NO-GO** until exact-head P1/P2/P4 and PostgreSQL 17/security gates pass.
