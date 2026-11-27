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

## Safety and release
- `main` remains `12b0db37a97128a19073f907ba12fb700251802b`.
- No production DB writes/migrations, payment posting, stock movement, live ERP call, secrets, deployments or paid services were used.
- PR #699 remains Draft and unmerged. Release remains **NO-GO** until exact-head UI, backend, PostgreSQL 17 and security gates are terminal SUCCESS.
