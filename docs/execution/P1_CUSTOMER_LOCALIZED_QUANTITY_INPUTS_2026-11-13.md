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
- P2 PR run [#43353568302](https://github.com/Report-Engainall/Nasr1/actions/runs/43353568302), source SHA `8efe6c1c4a2ed66f305d1818e9adeb955fc25d9b`: **SUCCESS**. Public read-only Storefront smoke and the complete isolated local Supabase/PostgreSQL 17 acceptance job passed. The local job completed all 43 workflow steps, including migrations and ephemeral tenant fixtures; endpoint guard allow/deny; atomic price-grid rollback/audit/stale-writer; cash-expense idempotency/concurrency; purchase receipt accounting restrictions; authenticated order persistence and cross-tenant denial; stock-count and purchase-order XLSX downloads; checkout replay after lost response; customer return request/review/receipt/credit memo; audited Onyx order XLSX export; finance/operational print; customer-manager authorization and device-session revocation acceptance. The separate generic customer order/tenant job was **SKIPPED**, but this local Supabase job executed and passed the authenticated order/tenant assertions. Run conclusion is success.
- P1 push run [#43353836138](https://github.com/Report-Engainall/Nasr1/actions/runs/43353836138), merged main SHA `7efcbf51b12b21963eeeec9c85e7a6938bd181fc`: **SUCCESS** — Vitest, strict TypeScript and production build.

This closes the localized quantity-entry implementation only. It does not change the wider NASR1 release/NO-GO decision or certify the remaining browser/database acceptance scope.


## Follow-up — storefront purchase quantities — 2026-11-13

A second implementation reused the shared normalizer in the two remaining customer purchase quantity controls:

- `src/components/Storefront.tsx`: product-detail quantity field now accepts Arabic-Indic and Persian digits, then applies strict whole-number parsing before the existing minimum, package-multiple, stock and maximum rules.
- `src/components/Storefront.tsx`: Quick Order Matrix normalizes localized digits before saving the draft; malformed text is not forwarded.
- `src/components/Storefront.localized-quantity.test.tsx`: UI interaction tests verify Arabic/Persian normalization and reject malformed input.

Merged PR: [#430](https://github.com/Report-Engainall/Nasr1/pull/430)  
Merged main commit: `f90f03e65a77733fbfa4c438757d2a072f856635`  
Source SHA: `ff20fe008862ebea1e4bc721d983f28253e652e3`

### Exact acceptance evidence for the follow-up

- P1 PR run [#43355136346](https://github.com/Report-Engainall/Nasr1/actions/runs/43355136346), source SHA `ff20fe008862ebea1e4bc721d983f28253e652e3`: **SUCCESS** — Vitest, strict TypeScript and production build.
- P2 PR run [#43355136206](https://github.com/Report-Engainall/Nasr1/actions/runs/43355136206), same source SHA: public read-only Storefront smoke **SUCCESS**; the separate generic customer order/tenant job **SKIPPED**; isolated local Supabase acceptance was **IN_PROGRESS** at `Start isolated local Supabase services`. Do not claim complete P2 for PR #430.
- Push runs on merged SHA: P1 [#43355464142](https://github.com/Report-Engainall/Nasr1/actions/runs/43355464142) and P2 [#43355464084](https://github.com/Report-Engainall/Nasr1/actions/runs/43355464084) were **PENDING** at the time of this update.

The customer localized quantity slice is now merged across order amendment, return request, product details and quick order. Existing server/RPC policy, cart validation, inventory and pricing were not changed. Overall NASR1 release acceptance remains separate and is not declared complete.
