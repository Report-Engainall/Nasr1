# P3 checkpoint — Orders board and price/inventory grid

Date: 17 November 2026  
Repository: `Report-Engainall/Nasr1`  
Code SHA: `276e9612cb509c0979cf458faa225705f148548c`

## Implemented
- Orders list changed from the minimal table to responsive lifecycle cards. Search, status filter and stable sort run on the server before pagination; existing review/detail actions and backend transition rules remain authoritative.
- Price grid gained item-name/code search, active-state and stock-state filters, stable price/stock sorting, refresh and result count. Drafts/save/import/export continue to use the complete loaded grid.
- Quantity values remain read-only in the price grid. Inventory changes continue through ledger-backed count/transfer/adjustment workflows.
- Added regression coverage for progress states, server-side filtering/sorting, invalid inputs and unknown inventory balances.
- Added migration `20261117113000_stock_count_line_authorization_precedes_payload.sql` to enforce tenant identity, base count capability and exact session-warehouse scope before count payload validation/update.

## Exact-SHA evidence
- P1 run [43975356771](https://github.com/Report-Engainall/Nasr1/actions/runs/43975356771): SUCCESS — 145 test files, 1,042 tests, strict TypeScript and production build, all on code SHA above.
- P2 run [43975356738](https://github.com/Report-Engainall/Nasr1/actions/runs/43975356738): public Chromium smoke IN_PROGRESS; authenticated customer-order/tenant job SKIPPED by the isolated non-production credential/write-confirmation gate; local PostgreSQL order/tenant job not yet started at checkpoint time.
- Separate Storefront feedback PostgreSQL 17 run [43975356833](https://github.com/Report-Engainall/Nasr1/actions/runs/43975356833): SUCCESS, but not order/tenant acceptance.

## Remaining
- Resolve P2 public browser and local PostgreSQL 17 workflow results on this exact code SHA.
- Keep hosted authenticated order/tenant proof open until a non-production environment and explicit test-write authorization are available.
- The current price-grid read RPC does not return category name; do not fabricate category data. Add it only after a safe tenant-scoped source contract exists.
- Overall release remains NO-GO. No production database changes, live integrations, Vercel activity, payment, financial posting or inventory movement occurred.


---

## P3 price-grid category contract completion — 2026-11-17

- Implementation commit: `b28d7def3bd8132870e18093cb59ff1de21e48df` (parent: `0c745238554040b0ccf61bcb7f8818170a642e32`).
- Added `20261117130000_admin_product_price_grid_category_projection.sql` and a new read-only RPC `get_admin_product_price_grid_v2()`. The function returns persisted category identity and price/stock summaries using an organization-scoped join; only an active same-tenant admin/manager can read it. The existing RPC signature remains unchanged.
- Connected the v2 projection to `fetchAdminProductPriceGrid`, strict category-pair validation, category column/search/filter (including the explicit uncategorized state), preview context, CSV export and XLSX export. Price changes still use the existing atomic stale-safe command; inventory stays read-only here.
- Added API and migration contract tests plus extended `scripts/test-price-grid-atomicity.mjs` to verify category identity and customer-role denial on isolated PostgreSQL 17.
- P1 Admin Context Verification [43978978184](https://github.com/Report-Engainall/Nasr1/actions/runs/43978978184): **SUCCESS on exact implementation SHA**. The Vitest suite, strict TypeScript check and production bundle all completed successfully.
- P2 Playwright Critical Paths [43978978223](https://github.com/Report-Engainall/Nasr1/actions/runs/43978978223): public no-write Chromium smoke still **IN_PROGRESS** at checkpoint update. Local PostgreSQL 17 acceptance is downstream of that job and had not yet started. The customer-order/tenant job remains **SKIPPED** by the isolated credential/write-confirmation gate; this is not accepted as a pass.
- The separate Storefront feedback PostgreSQL 17 run [43978978200](https://github.com/Report-Engainall/Nasr1/actions/runs/43978978200) succeeded; it is unrelated to price-grid/category acceptance and is not counted as evidence for this change.
- No hosted database migration, production write, live integration, payment, finance posting, inventory movement, Vercel usage or deployment occurred.
- Remaining acceptance: exact-SHA P2 public browser smoke and dependent local PostgreSQL 17 suite, especially `test-price-grid-atomicity.mjs`. Hosted authenticated customer-order/tenant proof remains blocked until dedicated non-production credentials and explicit test-write authorization are supplied.
