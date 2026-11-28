# P1 Delivery Checkpoint — Customer Financial Documents
Date: 2026-11-28
Repository: `Report-Engainall/Nasr1`
Owner: P1 — customer workflows, financial presentation and admin UI.
Main baseline: `12b0db37a97128a19073f907ba12fb700251802b`
Branch: `p1/customer-financial-source-ui-guard-20261127-r2`
PR: [#699](https://github.com/Report-Engainall/Nasr1/pull/699) — Draft; do not merge.

## Prior delivery retained
- Customer invoice list, pagination, statement and payment-history read projections are bound to the server-owned source revision; late requests and cutovers drop stale data.
- Customer saved-receipt self-service stays on customer-only read RPCs, verifies selected receipt identity and performs no payment mutation.
- Admin Customer 360 source preflight and request-sequence guards remain in place.
- The Onyx exchange workspace retains P4's read-only server panel; it does not claim a live connector.

## New P1 delivery in this batch
- Added `revalidateMyCustomerFinancialSource(expected)`. It re-reads `get_my_customer_financial_source` and returns the current server snapshot plus an exact revision/access comparison. A resolver failure throws and callers fail closed.
- Invoice detail loading now has its own request sequence, invalidated by invoice-list refresh and unmount. It revalidates the financial-source revision after invoice/order reads and before committing item lines or totals. A cutover or failed recheck clears the selected detail and invoice list.
- Invoice PDF export verifies source before requesting the file and again after receiving/validating the PDF blob, immediately before browser download.
- Invoice Excel export revalidates source before building the workbook.
- Statement PDF verifies before the server request and after the PDF blob. Statement Excel and browser print revalidate before output.
- Payment-history Excel revalidates before workbook generation.
- Source mismatch updates the displayed source notice and blocks stale output. Resolver failure clears the trusted source and blocks document output.
- Added helper tests for unchanged APP_ONLY revision, ONYX cutover and resolver failure.
- Added route-level `/invoices` regressions for source cutover to ONYX after `get_customer_invoice_pdf`, and for resolver failure after detail read; both assert the stale invoice identifier, line prices and totals are not rendered.
- Customer saved-receipt list now revalidates the server-selected source immediately before the list RPC and again after the list returns. A source revision cutover discards the page.
- Customer saved-receipt print checks source before the print-data RPC and after its payload returns, then validates the receipt ID before rendering. Source failure/cutover closes the popup without printing.
- A dedicated print sequence cancels pending print output when the selected receipt changes, the list is refreshed/paginated, the source prop changes, or the component unmounts.
- Added three receipt-self-service regressions for server-side cutover after list fetch, before print RPC, and after receipt payload; previous prop-change cancellation and identity-mismatch tests remain.

## Branch and ownership
- Implementation commit: `71a7653ca4581b5325852cb2d245ca28acc5d4d5` (first parent `02a0144b06953618b81575dbb212e833ef1faf5d`).
- Receipt source revalidation batch is based on P1 branch head `757177e28672d2d070bfed69fb3e71fcc2181092`; it preserves the concurrent P4 staged-preview commit already on the branch.
- Receipt implementation commit: `b3c27ccd2d268ac13cf266b24789dca64e8d03ff` (first parent `757177e28672d2d070bfed69fb3e71fcc2181092`).
- Nullability and asynchronous-test refinement: `feeddb085ee543c3235a87829fc3ca39380b5ce4` (first parent `b3c27ccd2d268ac13cf266b24789dca64e8d03ff`).

- Checkpoint trace commit: `d8e8c3d408ac612663df2806dfb3f4855c8f3744`.
- Invoice detail route regression commit: `4e631a06569948ceb3bbf73d0c8bc9dd71c55d5d` (adds both source-cutover and resolver-failure test cases).
- All updates use non-forced, expected-SHA branch leases; no force push.
- Changed files in the invoice-export batch: `src/lib/customer-financial-source.ts`, `src/lib/customer-financial-source.test.ts`, `src/components/CustomerWorkflows.tsx`, `src/test/customer-workflow-tenant.test.tsx`. This receipt batch also changes `src/components/CustomerPaymentReceiptSelfServiceActions.tsx` and `src/components/CustomerPaymentReceiptSelfServiceActions.test.tsx`.
- P1 does not write production data, post payments, move inventory, call live ERP endpoints, add secrets, deploy or merge to `main`.

## Cross-owner dependencies
- P2 #697 owns authoritative source-binding locks/RPCs and customer-only receipt RPCs. PostgreSQL 17/security exact-SHA acceptance remains a release dependency; frontend revalidation is defense in depth only.
- P4 #686 owns durable ERP staging/connector. The previously observed truncated staging-migration CHECK remains a blocker until fixed and replayed in isolated PostgreSQL 17 with concurrency, tenant-scope, rollback and ACL tests.
- P3 owns AI/analytics integration and main-branch integration. P1 does not merge to `main`.

## Acceptance
- New unit tests cover same-revision APP_ONLY approval, ONYX cutover and unavailable resolver.
- New route regressions cover invoice detail source cutover to ONYX and resolver failure after the detail RPC.
- At code-head `4e631a06569948ceb3bbf73d0c8bc9dd71c55d5`, the workflow/check-run listing had not yet surfaced a run. Earlier-head P1 run `46080902577` was pending and P2 Playwright run `46080902639` was queued; these do not prove acceptance of the new SHA.
- Exact final-head Vitest, strict TypeScript, build and P2 browser gates must be terminal SUCCESS. No PASS is claimed for an absent, queued, pending, cancelled, skipped or blocked job.

## P1 follow-up — final receipt print boundary (2026-11-28)

- Code commit: `ffa15cfcaa46c526fe85981f9d885364dbc3afbb`, based on prior PR head `7e35cc6df90b63d53da49450b174f80e4618c0c7`.
- The delayed 180ms receipt-print callback now re-reads `get_my_customer_financial_source` immediately before `print()`. It requires the same request sequence, the same selected receipt ID, an unchanged server source revision, and a currently readable APP_ONLY source.
- If the server source has moved to ONYX/MUTAKAMEL, the source is suspended/stale, or the final resolver fails, the popup closes, the success notice is removed, and the UI surfaces an explicit error. No receipt/payment mutation is performed.
- Added two focused regressions: APP_ONLY-to-ONYX cutover at the final print boundary, and final source-resolver failure. These tests are authored; they are **not yet accepted** until exact-head CI executes them.
- Changed application paths: `src/components/CustomerPaymentReceiptSelfServiceActions.tsx` and its paired `.test.tsx`; no migration, production data or ERP write.

### Exact-head acceptance after this checkpoint update

- The code commit `ffa15cfcaa46c526fe85981f9d885364dbc3afbb` had no workflow run/status surfaced at the first immediate query. No PASS is claimed.
- The checkpoint update itself is documentation-only; re-fetch the live PR #699 head and require terminal P1 Admin Context Verification plus the relevant P2 Playwright result on that exact head. Queued, absent, skipped or cancelled remains non-acceptance.

## P1 follow-up — guarded customer invoice browser print (2026-11-28)

- Invoice browser printing no longer calls `window.print()` directly from the button. It now revalidates the server-owned financial source immediately before printing, requires the same APP_ONLY revision, and binds the decision to the selected invoice ID and detail-request sequence.
- If source revalidation fails or the account has moved to ONYX/MUTAKAMEL/stale/suspended, the UI clears the stale invoice/list projection, retains a precise source notice, and blocks the browser print. Closing/changing the selected invoice invalidates any in-flight print check.
- Added a route-level regression that loads an APP_ONLY invoice, changes the authoritative source to ONYX at the print boundary, and asserts no browser print occurs and no stale invoice details remain visible.
- Code paths changed: `src/components/CustomerWorkflows.tsx` and `src/test/customer-workflow-tenant.test.tsx`. This is a read/print guard only; no financial write or database change.

### Acceptance
- Regression test authored; it has not yet been run locally in this session.
- Must pass the exact-head P1 Vitest/strict TypeScript workflow and the applicable P2 Playwright run. No PASS is claimed from tests authored or earlier SHAs.

### Next executable action

- Inspect exact-head P1/P2 workflow results for the updated #699 branch; repair a reproduced failing step in the same branch. Keep #699 Draft and unmerged until exact-head acceptance and P2 PostgreSQL 17/security acceptance are complete.

## Safety and release
- `main` remains `12b0db37a97128a19073f907ba12fb700251802b`.
- No production DB writes/migrations, payment posting, stock movement, live ERP call, secrets, deployments or paid services were used.
- PR #699 remains Draft and unmerged. Release remains **NO-GO** until exact-head UI, backend, PostgreSQL 17 and security gates are terminal SUCCESS.


## P1 follow-up — render and export approved external customer statements (2026-11-28)

- Closed a customer-facing gap in the existing `Statement` route: it previously fetched the authoritative account statement only after an APP_ONLY check, so ONYX/MUTAKAMEL accounts never invoked their server-approved external statement reader and were left without a usable statement view.
- The route now calls the same authenticated `get_customer_account_statement` RPC for an active source, verifies the returned `source_mode` matches the server-selected binding, parses only the external statement DTO, then re-fetches the source binding and drops the result if its revision/source identity changed while the read was in flight.
- ONYX and MUTAKAMEL now render separate currency ledgers from the accepted server projection: debit, credit, running/closing balance, entry references, dates, source document numbers and descriptions. No APP_ONLY invoice/payment rows are synthesized or merged into an external statement. Partial detail is labeled while server totals remain visible.
- External statements now export to XLSX with a per-currency detail sheet and currency-separated summary; metadata explicitly says currency values are not combined and no currency conversion is applied. The existing server-generated APP_ONLY PDF stays restricted to APP_ONLY; external statements can use guarded browser print / Save as PDF after source revalidation.
- Added a focused external statement workspace test covering multiple currency ledgers and the 500-row partial-detail label. Extended parser/XLSX tests for dynamic source timestamps, per-currency worksheet generation, and exclusion of raw tenant/account scope keys. Added the new component and tests to the P1 strict typecheck input set.
- Changed paths: `src/components/CustomerWorkflows.tsx`, new `src/components/CustomerExternalAccountStatement.tsx` and paired test, `src/lib/customer-account-statement-xlsx.ts`, `src/lib/customer-external-statement.test.ts`, and `tsconfig.p1-typecheck.json`.
- These are authored tests, not PASS evidence. Require terminal P1 Vitest/strict-TypeScript plus P2 exact-head UI checks. Financial source selection, RLS and ERP staging remain owned by P2/P4; no direct customer or tenant identifier is exposed in the returned UI model.
- No production DB, payment, stock, journal, live ERP endpoint, secret, deployment, or paid service was used. PR #699 remains unmerged; P1 does not merge to main.

### Acceptance boundary

- The UI must fail closed when the source mode differs, the external payload is invalid/stale, the current binding changed during fetch/print/export, or the server cannot confirm the source.
- External XLSX/print does not invoke the APP_ONLY PDF API, post ledger rows, or merge currency totals.
- Exact final-head P1 and P2 workflows are required. Queued, pending, skipped, cancelled or absent jobs do not count as acceptance.


## P1 follow-up — external statement print/export source revalidation

- The source-version comparator now includes exact `source_as_of`, `last_synced_at` and `verified_at` timestamps in addition to revision, mode, status, stale and read flags. A fresh snapshot cannot silently replace the statement snapshot without invalidating an in-flight action.
- Kept `revalidateMyCustomerFinancialSource` APP_ONLY-only for existing invoice/payment document callers. Added `revalidateMyCustomerFinancialSourceSnapshot` for source-routed statement actions: APP_ONLY retains its existing read permission; ONYX/MUTAKAMEL require active status, non-stale state and a source-as-of timestamp, then must match the exact saved snapshot.
- External Statement XLSX and browser print use the source-routed snapshot validator. If the account moves, becomes stale/suspended, or the source watermark changes during the action, the action is rejected. The server-generated APP_ONLY PDF remains behind its original APP_ONLY-only validator.
- Added three tests for successful external snapshot validation, stale/suspended/changed-watermark denial, and preservation of the APP_ONLY-only helper.
- Authored tests still require exact-head P1 Vitest/strict TypeScript and P2 browser acceptance; no PASS is claimed.
- No production database, financial ledger, inventory, live ERP endpoint, secret or deployment was touched.



## P1 follow-up — exact external statement output binding (2026-11-28)

- Added `isSameCustomerExternalStatementSourceAsOf`, which compares valid source watermarks as exact PostgreSQL-microsecond instants, accepts equivalent valid timezone representations, and fails closed on malformed values.
- External statement XLSX and browser print now require the displayed statement watermark and provider mode to match the currently selected server binding exactly. They also cancel if a new statement read supersedes an in-flight print/export.
- Added a route regression for a real UI state transition: the first print revalidation observes a one-microsecond source cutover, updates the server binding in the UI, clears the old external statement rows and disables print/export controls; `window.print()` is never invoked. Added direct comparator tests for equivalent offsets, one-microsecond difference and malformed input.
- No source/ledger/inventory/ERP writes; no new migration. The change protects only customer statement presentation, printing and XLSX output.
- On source mismatch or resolver failure during print/export, the statement page now clears invoices, payments, credits, external statement rows, summary and watermark before showing the unavailable state; it does not leave an old balance visible behind a warning.
- Tests are authored and require exact-head P1 Vitest/strict TypeScript plus P2 browser acceptance; no PASS is claimed until the current SHA jobs finish.

## P1 route-level external statement acceptance — 2026-11-28

- Added a customer route-level test for `/statement` that selects ONYX from the authenticated server resolver, reads the statement RPC, revalidates the binding after the read, and verifies separate YER/USD ledgers are rendered without APP_ONLY invoice rows.
- The fixture satisfies the strict parser contract: fresh timezone-qualified source/currency watermarks, newest-first chronological detail, exact microsecond-compatible running balances, and debit/credit totals that reconcile to the closing balance.
- The test verifies the APP_ONLY PDF action is absent for ONYX, external XLSX remains enabled, and browser printing is reached only after a third source revalidation.
- The implementation also includes the parallel correction commits `ad70dab048ec07450eb08f5678bcaa1f8c8af8e7` (microsecond-precision running balance comparison) and `f1dac9854da14a8b9bf550fe7d25e437be43af08` (partial-detail totals/closing balance reconciliation).
- This test is authored acceptance evidence only. It must run on the final PR head under P1 Vitest/strict TypeScript; P2 Playwright must also finish on that same head. No PASS is claimed until those jobs complete.


## P1 follow-up — restore APP_ONLY statement XLSX decimal validation (2026-11-28)

- Root cause: `moneyDecimal` used a twice-escaped digit/decimal regex, so valid server decimal strings such as `1250.50` were rejected before the APP_ONLY customer statement workbook could be generated. The same defect was present on the recorded `main` baseline.
- Corrected the regex to match decimal digits and an optional decimal fraction while retaining the existing maximum length, precision, positivity and BigInt minor-unit checks.
- Added a Vitest regression to `src/lib/customer-external-statement.test.ts` that builds an APP_ONLY XLSX from a valid invoice and authoritative per-currency summary and asserts a valid ZIP/XLSX signature.
- Exact-head acceptance is pending for the resulting PR #699 SHA. The regression is authored, not yet run; no PASS is claimed.
- Next: inspect the new exact-head P1 Vitest/strict-TypeScript and P2 Playwright workflow results; repair any reproduced failure on that same branch.

## P1 follow-up — clear APP_ONLY statement state on PDF source cutover (2026-11-28)

- Customer statement PDF generation now captures the current statement-read sequence and checks it after each asynchronous boundary (source revalidation, session lookup, PDF fetch and blob read). A later statement load invalidates an older in-flight PDF request before it can download.
- If the APP_ONLY source cannot be revalidated or changes to ONYX/MUTAKAMEL before or after PDF generation, the page clears invoices, payments, credit memos, external statement rows, summary and watermark before presenting the source warning. The APP_ONLY PDF path remains unavailable to external-source customers.
- A new route-level regression in `src/test/customer-workflow-tenant.test.tsx` loads a customer APP_ONLY statement, changes the server-selected source on the PDF preflight read, and asserts that the old invoice reference and APP_ONLY PDF action disappear.
- Files changed in this follow-up: `src/components/CustomerWorkflows.tsx` and `src/test/customer-workflow-tenant.test.tsx`. The test is included in the existing P1 strict TypeScript/test path; no schema, server RPC or production behavior was changed.
- These checks are authored, not run/pass evidence. Require P1 Vitest/strict TypeScript and P2 Playwright on the final branch SHA. Queued, pending, cancelled, skipped or prior-SHA results are not acceptance.
- No production DB, financial mutation, stock mutation, live ERP call, secret, deployment, paid service or merge was performed.
