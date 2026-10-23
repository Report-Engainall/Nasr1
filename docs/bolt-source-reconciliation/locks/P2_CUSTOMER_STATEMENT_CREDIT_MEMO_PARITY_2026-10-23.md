# P2 path ownership lock — customer statement credit parity — 2026-10-23

## CURRENT STATUS — RELEASED 2026-10-23T21:17:51+03:00
LOCK_STATUS=RELEASED
TASK_ID=FIN-INVOICE-001 + FIN-CREDIT-001 customer-statement / receivables posted-credit parity
PR_URL=https://github.com/Report-Engainall/Nasr1/pull/62
MERGE_STATUS=INTEGRATED
MERGE_SHA=024c279a2d1c0226c662e5d916871f45534c7242
CURRENT_MAIN_SHA=d81c9b34f819a53df7610937264c6fcb923c3f95
Statement/aging credit parity is merged. Descendant PR #104 acceptance revalidated posted-credit aggregates and invoice balances in PostgreSQL 17, plus local Chromium return/review/receipt/credit memo flow; this is not production monetary proof. The listed paths are no longer exclusively held by this task. PR #40 is CLOSED and NOT MERGED; its old overlap note is historical, not an active lock.
This file remains as audit history only.

## Archived lock contents (historical only; not active)

## Task
`FIN-INVOICE-001` + `FIN-CREDIT-001`: reconcile customer statements, aging, and statement PDF against posted credit memos and the full ledger.

## Exact working base and owner
- Repository: `Report-Engainall/Nasr1`
- Base `main` SHA at branch creation: `bf06c73226033da8e4f81e24981eb64e6e7fca99`
- Exclusive implementation branch: `fix/p2-customer-statement-credit-memo-parity-20261023`
- Owner: P2 — one writer for the paths below while PR #62 is open.
- Pull request: https://github.com/Report-Engainall/Nasr1/pull/62

## Paths held by this task
- `src/components/CustomerWorkflows.tsx`
- `src/lib/commerce-utils.ts`
- `src/lib/finance-document-pdf.ts`
- `src/test/commerce-utils.test.ts`
- `src/test/finance-document-pdf.test.ts`
- `src/test/finance-document-pdf-source-reconciliation.test.ts`
- `src/components/CustomerWorkflows.customer-statement.test.tsx`
- `src/test/customer-statement-credit-memo-parity-migration.test.ts`
- `supabase/migrations/20261023010000_customer_statement_credit_memo_parity.sql`

## Prior open-PR overlap examined
- PR #12 (`feature/customer-price-visibility-20261020`, head `3596f358a7172e92082b29cde1352795905c0c29`) is still open but reports `mergeable=false` against an old base SHA `9c2251780fda8f3f1a7011ce65bc66f8a51d8c01`. It shares `src/components/CustomerWorkflows.tsx`, `src/lib/finance-document-pdf.ts`, and `src/test/finance-document-pdf-source-reconciliation.test.ts`. Current P2 changes are based on the newer live `main` tree, not a blind cherry-pick or merge of that stale branch. Before merging either PR, compare the price-visibility changes individually with current `main`; retain current-main privacy behavior and reconcile the statement patch. Do not merge PR #12 concurrently with PR #62.
- PR #54 is also open but does not change any of this lock's listed code paths; it owns other Onyx, finance print and coordination paths.
- PRs #52, #57, #58, #59, and #60 do not overlap these listed files. Their locked workflow/migration runner paths are intentionally untouched.

## Rules
- No write to `main`, no force push/reset/clean, no production DB writes, and no live deployment.
- SQL includes only `status='posted'` invoice/org/customer/currency-matched credit memos; reversed memos do not reduce balances. Inconsistent posted memo source/currency fails closed.
- Summary figures must come from the full ledger, be currency-separated and validated; bounded detail rows must never be summed on top of authoritative aggregates.
- Lock is released only after PR integration is resolved and all required tests are proven on the exact merged SHA. Unit/CI success does not imply browser- or production-proof.


## Additional ownership correction — PR #40 discovered during CI review
- PR #40 (feat/p2-onyx-source-trace-sync-evidence-20261022, current head 6a14d64d6ea9aed8b8c3bab8335767987ae9b5a6) is open and mergeable=false against its stale base. It overlaps this PR in src/lib/finance-document-pdf.ts and src/test/finance-document-pdf-source-reconciliation.test.ts; it separately owns the Onyx XLSX and finance/task-print browser suites. This PR did not change those browser paths.
- Do not merge PR #40 and PR #62 concurrently. Once one integrates, port the other using a new branch (no force-push), compare the shared-file diffs and preserve both posted-credit full-ledger reconciliation and persisted Onyx export/audit tests. Rerun Core and Playwright on the integration head.
- PR #54 owns its finance-print integration and scripts/test-customer-returns.mjs / scripts/test-database-migrations.mjs. Those paths remain untouched by this PR.
