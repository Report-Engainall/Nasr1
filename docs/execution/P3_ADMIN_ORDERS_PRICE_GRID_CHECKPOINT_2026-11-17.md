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
