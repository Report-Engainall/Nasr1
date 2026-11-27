# P1 Delivery Checkpoint — Customer Finance and Self-Service Receipts
Date: 2026-11-28
Repository: `Report-Engainall/Nasr1`
Owner: P1 — customer workflows, finance presentation, admin UI and integration.
Main baseline: `12b0db37a97128a19073f907ba12fb700251802b`
Branch: `p1/customer-financial-source-ui-guard-20261127-r2`
PR: [#699](https://github.com/Report-Engainall/Nasr1/pull/699) — Draft; do not merge.
Current implementation parent: `b2ea2cde4cd970055ee9848ae55af8a9db8ae1c2`

## Functional deliveries on this branch

### Customer finance and service requests
- Customer-facing statements, invoice/payment surfaces and source notices consume the server-selected financial source. APP_ONLY data is never blended with ONYX/MUTAKAMEL. Missing, stale, suspended or unresolved source states fail closed.
- The statement screen exposes audited customer-scoped balance-review and inclusive date-range statement requests through the service-case flow. These requests do not write to the ledger, create payments or alter balances.
- The customer service portal lists paged customer-visible cases and messages, creates cases using idempotency keys, and enforces the existing customer permissions.

### Saved receipt retrieval and reprint
- Customer self-service uses only `get_my_customer_payment_receipt_print_options` and `get_my_customer_payment_receipt_print_data`; staff-only receipt RPCs are not used. Reprint reads saved receipt data only and never creates or posts a payment.
- **New source-cutover isolation:** receipt-list page requests have a monotonically increasing request sequence. A response from a previous source lookup is discarded after a source change or component cleanup; current source is rechecked before applying the response.
- **New guarded print action:** the selected receipt data is rechecked against the latest source after the RPC resolves. If the source changes during the print request, the popup is closed and no receipt is rendered.
- **Receipt identity binding:** the server payload's receipt ID must equal the selected receipt ID before rendering. Mismatches close the popup and fail with a visible error.
- Three new component regressions cover (1) stale APP_ONLY page response after changing to ONYX, (2) source cutover while print payload is loading, and (3) a response for a different receipt ID.
- The component and test were added to all three P1 workflow path-filter blocks and to `tsconfig.p1-typecheck.json`. Earlier they were missing from the P1 filters/typecheck include list; this is now corrected.

### Customer 360 and admin integration
- Admin Customer 360 resolves the financial source before calling its APP_ONLY finance projection. Only active/fresh APP_ONLY proceeds to that projection.
- **Request-sequence isolation:** late Customer 360 source/summary responses are ignored after reload, customer switch or unmount. Summary, print and export are identity-bound to the current customer ID; late interaction-history callbacks from a previous customer are ignored.
- The existing Onyx exchange workspace mounts the bounded ERP read-sync panel. The UI presents only server-returned counts and checkpoint watermarks and does not claim live ERP readiness.

## P1 implementation commits
- Customer 360 race isolation: `c08c260b9b810b291aa137212e358378a31099cd`
- Customer 360 stale-response regression: `701c3fbe5261a8943174a4da9286cdc172a0d31b`
- Self-service receipt source/identity guard and regressions: `4149b74f5462e62b955f5fb2a89f567943acf331`
- P1 test-path and strict-TypeScript inclusion: `b2ea2cde4cd970055ee9848ae55af8a9db8ae1c2`

## Cross-owner dependencies
- **P2 #697 current observed head:** `3a510a934070bcbb9d12fa8a253084c2da048637`. The customer-only receipt list and print RPCs are present at this head. Its exact-head PostgreSQL 17 and authenticated workflow runs remain queued.
- **P2 server-side Customer 360 source gap:** current `main` function `public.get_staff_customer_360(uuid)` is SECURITY DEFINER and checks financial permission, but does not enforce the selected financial source inside SQL. A client preflight is not a security boundary and cannot close a source-cutover race. The requirement and PG17 assertions are recorded in #697 comment `7229626030`. P2 must implement an atomic server-side source lock/validation before reading APP_ONLY financial rows.
- **P2 branch reconciliation:** #697 base points to `202bb107545fd70db454d5cd6f6923cc76e9f0b4`, not the current main baseline. Its merge-base comparison showed 7 commits behind; reconcile before acceptance, rerun exact-head gates.
- **P4 #686 current observed head:** `4fc765ba3e281ffc36d99a34d8223058db63754b`. Its ERP staging migration still has a truncated line-7 CHECK (`scope_key text NOT NULL CHECK (scope_key ~ '^[0-9a-f]{64}`), blob `7ed19c0fb905bda4202476d1157b847503a187f9`. PostgreSQL cannot parse it. Latest blocker is tracked in #686 comment `7229516752`; full local PG17 migration reset and `scripts/test-erp-sync-checkpoint-store.mjs` are required after repair.
- Live ERP licence, vendor API contract, sandbox, tenant binding and credentials remain UNKNOWN. Live transport remains disabled.

## Exact-head acceptance
- Current PR #699 head before this checkpoint update: `b2ea2cde4cd970055ee9848ae55af8a9db8ae1c2`.
- P1 Admin Context Verification `46079201237` — QUEUED.
- P2 Playwright Critical Paths `46079201304` — QUEUED.
- Customer Shopping Lists PostgreSQL 17 `46079201340` — QUEUED.
- These runs are not PASS. The checkpoint commit will become the new exact head and must receive fresh P1/P2 checks; earlier-SHA results are not transferred.
- No exact-head test, TypeScript, build, PostgreSQL or authenticated-browser PASS is claimed in this checkpoint.

## Safety and release
- `main` remains `12b0db37a97128a19073f907ba12fb700251802b`.
- No production migrations/writes, financial posting, inventory mutation, live ERP call, secret storage, deployment or paid service was used.
- PR #699 remains Draft. Release remains **NO-GO** until exact-head P1/P2/P4 and PostgreSQL 17/security gates pass.
