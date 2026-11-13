# P1 — Customer Localized Quantity Inputs — 2026-11-13

Repository: `Report-Engainall/Nasr1`  
Canonical branch: `main`  
Merged commit: `7efcbf51b12b21963eeeec9c85e7a6938bd181fc`  
Pull request: [#429](https://github.com/Report-Engainall/Nasr1/pull/429) — MERGED  
Implementation source SHA: `8efe6c1c4a2ed66f305d1818e9adeb955fc25d9b`

## Implemented

- Added `src/lib/localized-number-input.ts` as a shared decimal-input normalization function.
- Added `src/lib/localized-number-input.test.ts`.
- Integrated the normalizer into `src/components/CustomerReturnRequest.tsx` for customer return quantities.
- Integrated the normalizer into `src/components/CustomerOrders.tsx` for proposed quantities in returned/pending order amendments.

The input accepts Arabic-Indic digits (`٠١٢٣٤٥٦٧٨٩`), Eastern Arabic-Indic/Persian digits (`۰۱۲۳۴۵۶۷۸۹`), Arabic decimal separator (`٫`), and grouping separators. Unsupported characters are preserved so the existing numeric validators reject malformed values rather than silently deleting characters.

## Preserved contracts

- Return quantity validation still enforces positive values, the remaining returnable quantity, and at most three decimal places through `buildCustomerReturnLines`.
- Order amendment validation still enforces positive quantities, the existing 10,000 ceiling and three-decimal precision before calling `submit_customer_order_amendment`.
- Existing RPC calls, amendment/return idempotency, order-version history, inventory and approval behavior are unchanged.
- No SQL, migration, RPC, RLS, Auth, pricing, inventory-write, production data or secret changes.
- No Vercel deployment, preview, or paid service.

## Exact acceptance evidence

- P1 PR run [#43353568219](https://github.com/Report-Engainall/Nasr1/actions/runs/43353568219), source SHA `8efe6c1c4a2ed66f305d1818e9adeb955fc25d9b`: **SUCCESS** — Vitest regression suite, strict TypeScript and production build all completed successfully.
- P2 PR run [#43353568302](https://github.com/Report-Engainall/Nasr1/actions/runs/43353568302), same source SHA: public read-only Storefront Playwright smoke **SUCCESS**. The separate generic customer order/tenant job was **SKIPPED**, but the local Supabase/PostgreSQL 17 acceptance job independently completed these named steps **SUCCESS**: migrations and ephemeral tenant fixtures; endpoint guard allow/deny; atomic price-grid rollback/audit/stale-writer; cash-expense idempotency/concurrency; purchase receipt accounting restrictions; authenticated order persistence and cross-tenant denial; stock-count and purchase-order XLSX downloads; checkout replay after lost response; customer return request/review/receipt/credit memo; audited Onyx order XLSX export. The local acceptance job was still **IN_PROGRESS** at the finance-document/operational-task print step; the whole P2 run is not yet terminal PASS.
- P1 push run [#43353836138](https://github.com/Report-Engainall/Nasr1/actions/runs/43353836138), merged main SHA `7efcbf51b12b21963eeeec9c85e7a6938bd181fc`: **SUCCESS** — Vitest, strict TypeScript and production build.

This closes the localized quantity-entry implementation only. It does not change the wider NASR1 release/NO-GO decision or certify the remaining browser/database acceptance scope.
