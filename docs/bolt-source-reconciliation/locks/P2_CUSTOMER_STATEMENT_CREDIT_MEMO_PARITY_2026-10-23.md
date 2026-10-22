# P2 path ownership lock — customer statement credit parity — 2026-10-23

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
