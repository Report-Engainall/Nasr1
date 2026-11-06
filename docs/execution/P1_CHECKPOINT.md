# P1 SOURCE DELIVERY — 2026-11-06 — SUPPLIER DUE DATE EVIDENCE + CASHFLOW OUTFLOWS

- Repository: `Report-Engainall/Nasr1`; branch: `main` only.
- Parent main SHA: `c27c80caf1f905d4bc346ff8997d27e0396782b0`; code SHA: `2c02290c7ec43c9f9bc7b78a111bcaf174487926`.
- Added `supabase/migrations/20261106310000_supplier_invoice_due_date_cashflow_outflows.sql`: tenant-scoped, append-only supplier invoice due-date evidence tied to an existing private invoice attachment; exact-payload idempotency; source reference and reason; immutable event/audit history; and a future supplier-payable OUTFLOW read.
- The due-date command rejects variance-pending/rejected invoices, unresolved non-zero tax, attachment mismatch across invoice/tenant, dates before the invoice, changed idempotency payload and a second different date.
- The OUTFLOW resolver uses the existing full-history receipt payable source after posted credit notes and posted supplier payments. It requires full received-line coverage by one matched zero-tax invoice with attached due-date evidence, and refuses receipts with unposted/reserved payment allocation. Rejected invoice lines are excluded from receipt coverage.
- Added authenticated finance service methods and mounted due-date capture in `SupplierInvoiceWorkspace`. The due date is displayed as source evidence; it is never inferred from invoice date or default payment terms.
- Extended the existing cashflow reader to combine receivables INFLOW with supplier OUTFLOW. Missing/invalid supplier evidence or unresolved open receipts downgrade the schedule to PARTIAL/NEEDS_REVIEW; missing outflows are never zero. Existing opening-balance gate remains.
- Added tests: `src/lib/supplier-invoice-due-date-client.test.ts`, expanded `src/lib/intelligence/cashflow-schedule-client.test.ts` and `src/components/intelligence/CashflowForecastCard.test.tsx`.
- State: `IMPLEMENTED_ON_MAIN / ACCEPTANCE_PENDING`. Source and tests committed; tests/build/typecheck/lint/CI/browser/DB/Bolt were NOT run. No runtime PASS claimed.
- New acceptance leaf: `DLV-010-SUPPLIER-DUE-DATE-CASHFLOW-OUTFLOW-001`.

## Next P1 action

Continue the remaining liquidity source gap: establish a tenant-scoped opening cash/bank balance and statement reconciliation path tied to immutable statement evidence and explicit finance review. Do not derive balances from movements or combine currencies. Keep net/projected balances unavailable until opening balance and reconciliation coverage are verified.

---

# P1 SOURCE DELIVERY — 2026-11-06 — FINANCE / SUPPLIER WORKSPACE MOUNT

- Repository: `Report-Engainall/Nasr1`; branch: `main` only.
- Parent SHA: `32e0c31aaff5a51a122be31a18dfa8d51ec69822`; source commit: `afc14bd83b7eaaa18e9736fd0dd18d9d911b6876`.
- Mounted the existing tenant-scoped `GeneralLedgerWorkspace` into the actual `/admin/finance` screen for `admin`, `manager`, and `accountant`; the separate customer receivables/collection screen remains intact above it.
- Exposed the existing supplier invoice capture mode alongside its independent review mode. The finance screen now reaches receipt-linked invoice entry, variance approval/rejection, supplier credit-note matching, supplier payment allocation/reconciliation, supplier account activity, and the controlled accounting-draft handoff.
- Reused the existing General Ledger account payload, tenant-scoped RPCs, permission checks and refresh chain. Supplier mutations refresh ledger/statements and supplier activity. No new RPC, table, migration, provider, or direct-table write was introduced.
- Source files: `src/components/AghbariApp.tsx`, `src/components/GeneralLedgerWorkspace.tsx`.
- State: `IMPLEMENTED_ON_MAIN / ACCEPTANCE_PENDING`. This delivery closes route reachability and capture-mode mounting only. Existing supplier migrations still require ordered application in Bolt; no tests, build, CI, browser, DB, or runtime PASS is claimed.
- Acceptance leaf: `DLV-008-SUPPLIER-FINANCE-WORKSPACE-MOUNT-001`.

## Next P1 action

Continue the next source-only business-body gap without rebuilding customer order amendment/cancellation, customer service portal, or supplier RPC workflows already present. Keep the Bolt migration/runtime handoff separate and evidence-bound.

---

# P1 ACTIVE CHECKPOINT OVERRIDE — 2026-11-06 — BODY-COMPLETION-ON-MAIN-068 — CUSTOMER PRE-REVIEW ORDER QUANTITY AMENDMENT

- Repository: `Report-Engainall/Nasr1`; branch: `main`.
- Parent/base SHA: `fe98832e657fb21de589d84639eabd101f37b218`.
- Added `supabase/migrations/20261106260000_customer_pending_order_amendments.sql`.
- Extended `submit_customer_order_amendment(...)` to accept an owned `pending` order only while the order is not staged for staff review, while retaining the full exact-line/quantity-only/server-price validation and idempotency rules.
- Extended `review_order_lines(...)` to load and lock the open customer proposal by ID; staff rejection marks that proposal rejected and preserves the order's pending/returned status, while approval closes it in the same transaction as the existing staff confirmation/inventory reservation/invoice/payment request.
- Customer `/orders/$id` now presents the quantity correction panel for a pending order before staff review, and locks the form while a proposal is pending. Rejected proposals may be corrected and resubmitted. Staff OrderDetail recognizes pending-order customer proposals for review/rejection.
- Pending customer amendment is rejected once staff has set `quantity_review_required` or staged line proposals. Customer cannot change price, totals, order state, stock, invoice or payment; staff remains the only final approver.
- Files changed: `supabase/migrations/20261106260000_customer_pending_order_amendments.sql`, `src/components/CustomerOrders.tsx`, `src/components/AdminPages.tsx`, `docs/execution/P1_CHECKPOINT.md`.
- State: `IMPLEMENTED_ON_MAIN / ACCEPTANCE_PENDING`; migration deployment and browser acceptance remain pending.
- Evidence boundary: source-only commit. No tests/build/typecheck/lint/CI/browser/Bolt/database/Preview/Vercel operation was run. No runtime PASS is claimed.

## Next P1 action

Continue the next uncovered customer and commerce command from the canonical requirements; preserve exact ownership, quantity-only customer mutation and staff-only final confirmation. Do not alter P3-owned intelligent engines.

---

# P1 ACTIVE CHECKPOINT OVERRIDE — 2026-11-06 — BODY-COMPLETION-ON-MAIN-067 — CUSTOMER PRE-CONFIRMATION ORDER CANCELLATION

- Repository: `Report-Engainall/Nasr1`; branch: `main`.
- Parent/base SHA: `cd4a3287f00d702e0dd8162ed1476ca5b2566a38`.
- Added `supabase/migrations/20261106250000_customer_order_preconfirmation_cancellation.sql` with `customer_order_cancellations` and `cancel_customer_order(...)`.
- Cancellation is limited to the authenticated primary owner or buyer-capability member acting on an order they created, in the same active customer organization. The RPC serializes with company-membership revocation and rechecks buyer capability after the customer row lock.
- Only `draft` and `pending` orders without staged quantity/price review or any reserve/sale stock movement can be cancelled. Confirmed, returned, processing and shipped orders remain outside this customer command.
- The command is idempotent, requires a reason, writes an audit event, notifies same-tenant admin/manager/staff and invokes the existing order lifecycle status-history/customer-notification triggers. Direct cancellation-table writes are revoked; reads are limited to the current customer or same-tenant staff.
- Extended the current BODY-066-aware `guard_order_confirmation` so customer transition to `cancelled` requires the RPC-created evidence row, owner identity, buyer capability, same tenant and no reserve/sale movement. Existing staff transitions and returned-amendment confirmation logic are preserved.
- Customer order details now expose a reason-required cancellation action only while the order is draft/pending, and show the saved cancellation reason/time after completion. Staff OrderDetail displays the saved reason and timestamp.
- No order item, price, stock, invoice, payment, customer balance or ledger data is changed by customer cancellation.
- Files changed: `supabase/migrations/20261106250000_customer_order_preconfirmation_cancellation.sql`, `src/components/CustomerOrders.tsx`, `src/components/AdminPages.tsx`, `docs/execution/P1_CHECKPOINT.md`.
- State: `IMPLEMENTED_ON_MAIN / ACCEPTANCE_PENDING`; migration deployment and browser acceptance remain pending.
- Evidence boundary: source-only commit. No tests/build/typecheck/lint/CI/browser/Bolt/database/Preview/Vercel operation was run. No runtime PASS is claimed.

## Next P1 action

Continue the next uncovered business operation from the canonical specification and remaining acceptance matrix. Do not duplicate existing order, return, quote, customer-profile or export behavior; keep P3 engines unchanged.

---

# P1 ACTIVE CHECKPOINT OVERRIDE — 2026-11-06 — BODY-COMPLETION-ON-MAIN-066 — CUSTOMER RETURNED-ORDER AMENDMENT

- Repository: `Report-Engainall/Nasr1`; branch: `main`.
- Parent/base SHA: `36b31b0819da3ca83c8fdb42338516edeef5c245`.
- Added `supabase/migrations/20261106230000_customer_returned_order_amendments.sql`.
- Added a tenant-scoped `customer_order_amendments` record and `submit_customer_order_amendment(...)` command. The command resolves the primary customer account from the authenticated profile, locks the owned returned order, requires a complete one-to-one list of order lines, rejects price/financial fields, and stages only quantities while retaining the server's persisted unit-price snapshot.
- The command is idempotent, prevents concurrent active amendments, blocks orders that already reserved or sold inventory, records an audit event, and sends a deduplicated in-app notification to active same-organization admin/manager/staff profiles. Customer read access is limited to its own amendment history; staff read access is same-tenant; direct table writes are revoked.
- Extended the existing order state guard to permit only staff confirmation from a returned status when an active customer amendment exists and no reserve/sale movement exists. Extended `review_order_lines` so staff can stage/approve the submitted amendment using the existing atomic confirmation, inventory reservation, invoice and payment-request path; discarding a returned proposal marks it rejected and leaves the order returned.
- Customer `/orders/$id` now provides a quantity-only amendment form, submission state/history and prior staff rejection note. Admin `OrderDetail` displays the customer's note, reviews the staged quantities, and can approve or reject the proposal.
- No price, cost, margin, total or stock value is exposed through the customer amendment UI or its RPC response. Customer submission does not change order status, totals, inventory movements, invoice or payment state.
- Files changed: `supabase/migrations/20261106230000_customer_returned_order_amendments.sql`, `src/components/CustomerOrders.tsx`, `src/components/AdminPages.tsx`, `docs/execution/P1_CHECKPOINT.md`.
- State: `IMPLEMENTED_ON_MAIN / ACCEPTANCE_PENDING`; migration deployment and browser acceptance remain pending.
- Evidence boundary: source-only commit. No tests/build/typecheck/lint/CI/browser/Bolt/database/Preview/Vercel operation was run. No runtime PASS is claimed.

## Next P1 action

Continue the next uncovered core business workflow from the canonical specification and remaining acceptance matrix. Do not repeat exports/profile work or bypass tenant-scoped server commands; keep P3 engines unchanged.

---

# P1 ACTIVE CHECKPOINT OVERRIDE — 2026-11-06 — BODY-COMPLETION-ON-MAIN-065 — CUSTOMER BUSINESS PROFILE EDIT

- Repository: \`Report-Engainall/Nasr1\`; branch: \`main\`.
- Parent/base SHA: \`52ec6f87e651eeff88dc449fad8a1f51822ea16a\`.
- Added \`get_my_customer_account_profile()\` and \`update_my_customer_account_profile(...)\` in \`supabase/migrations/20261106210000_customer_account_profile_command.sql\`.
- Added \`src/lib/customer-account-profile.ts\` and mounted an editable business-profile form in the customer \`/profile\` screen.
- The RPC resolves the primary customer profile and organization from the authenticated session and matching \`customers.profile_id\`; the browser cannot supply customer/profile/tenant identifiers. The write is row-locked and optimistic-concurrency guarded by the prior \`updated_at\` revision.
- Editable fields are limited to business name, contact name, business contact phone and business contact email. It does not update auth login email, profile roles, tenant, customer code, tier, approval state, credit limit, balance, pricing or order data. It writes a field-name-only audit record.
- Files changed: \`supabase/migrations/20261106210000_customer_account_profile_command.sql\` (new), \`src/lib/customer-account-profile.ts\` (new), \`src/routes/profile.tsx\`, \`docs/execution/P1_CHECKPOINT.md\`.
- State: \`IMPLEMENTED_ON_MAIN / ACCEPTANCE_PENDING\`; database deployment and browser acceptance are pending.
- Evidence boundary: source-only commit; no tests/build/typecheck/lint/CI/browser/Bolt/database/Preview/production operation was run. No runtime PASS is claimed.

## Next P1 action

Continue the next uncovered core commerce/account workflow from the current server-owned schema. Prioritize the return-for-amendment command path next; do not bypass order status triggers or alter P3 engines.

---

# P1 ACTIVE CHECKPOINT OVERRIDE — 2026-11-06 — BODY-COMPLETION-ON-MAIN-064 — CUSTOMER PAYMENT HISTORY XLSX

- Repository: \`Report-Engainall/Nasr1\`; branch: \`main\`.
- Parent/base SHA: \`c2e358dce286c49c91157c9d0a4d0ec2d1a06e75\`.
- Added \`src/lib/customer-payment-history-xlsx.ts\`: an Arabic two-sheet workbook for a customer's loaded payment history and its explicit scope.
- Added «تنزيل Excel» to the existing customer payment-history screen. It exports the current search-filtered rows only, using the existing \`get_customer_account_statement\` response already loaded by that screen; no new query, mutation, or finance posting path.
- The workbook contains only payment date, invoice number when available, amount/currency only when the matching invoice is in the loaded invoice detail set, and the linkage scope. When the invoice is outside the loaded details, the amount and currency are omitted exactly as in the UI. All payment/invoice/customer/tenant UUIDs are excluded.
- It discloses the 500-payment/200-invoice detail limit and whether search filtering was applied. It does not total mixed currencies or claim to be a receipt or complete ledger.
- Files changed: \`src/lib/customer-payment-history-xlsx.ts\` (new), \`src/components/CustomerWorkflows.tsx\`.
- State: \`IMPLEMENTED_ON_MAIN / ACCEPTANCE_PENDING\`.
- Evidence boundary: source-only commit; no tests/build/typecheck/lint/CI/browser/Bolt/database/Preview/production operation was run. No runtime PASS is claimed.

## Next P1 action

Continue the next uncovered customer or commerce workflow from existing server-owned contracts. Keep order amendments and identity/business-profile writes blocked until tenant-bound transactional server commands are authored. Do not alter P3 engines or add paid external providers.

---

# P1 ACTIVE CHECKPOINT OVERRIDE — 2026-11-06 — BODY-COMPLETION-ON-MAIN-063 — CUSTOMER INVOICE XLSX EXPORT

- Repository: \`Report-Engainall/Nasr1\`; branch: \`main\`.
- Parent/base SHA: \`6743295da891b3898782aa75cab07eaa2a2775ba\`.
- Added \`src/lib/customer-invoice-xlsx.ts\`: a three-sheet Arabic XLSX for invoice identity, invoice lines, and document scope/limits.
- Added «تنزيل Excel» to the existing customer invoice detail panel. It consumes the invoice details already loaded through the existing customer-authorized \`get_customer_invoice_pdf\` RPC; it introduces no new query or endpoint.
- Financial columns and totals are included only when the existing customer invoice projection explicitly authorizes them and supplies complete valid values. When hidden, the workbook receives and emits no line prices or financial totals. It excludes UUIDs, customer/order/tenant identifiers, paid/outstanding values, costs, margins, and any non-projected data.
- The file states that an invoice export is not a payment receipt and does not infer taxes, discounts, payments, or balances that are absent from the invoice projection.
- Files changed: \`src/lib/customer-invoice-xlsx.ts\` (new), \`src/components/CustomerWorkflows.tsx\`.
- State: \`IMPLEMENTED_ON_MAIN / ACCEPTANCE_PENDING\`.
- Evidence boundary: source-only commit; no tests/build/typecheck/lint/CI/browser/Bolt/database/Preview/production operation was run. No runtime PASS is claimed.

## Next P1 action

Continue the next uncovered customer and commerce workflow from its existing server-owned contract. Do not reimplement existing address, contact, membership, cart, quote, order, invoice PDF, or statement exports. Do not alter P3 engines or introduce paid external services.

---

# P1 ACTIVE CHECKPOINT OVERRIDE — 2026-11-06 — BODY-COMPLETION-ON-MAIN-062 — CUSTOMER QUOTE XLSX EXPORT

- Repository: `Report-Engainall/Nasr1`; branch: `main`.
- Parent/base SHA: `2b69036fc190cc6133187191f0cd6f0a48489c00`.
- Added `src/lib/customer-quote-xlsx.ts`: three Arabic worksheets for the server-approved customer quote header, quoted line items and quote scope/limitations. It consumes only `CustomerQuotePrintDocument`, the existing strict customer allowlist.
- Added «تنزيل Excel» to each customer quote card only when the existing quote projection is valid (server-priced `quoted` or `accepted` state, and every line has a valid approved unit price and quantity). Reuses the already-loaded quote/line rows; no duplicate query or mutation.
- Excludes target prices, costs, margins, raw rows and internal identifiers. The workbook explicitly disclaims invoice/order/payment semantics and does not infer tax, discounts or a payable total.
- Files changed: `src/lib/customer-quote-xlsx.ts` (new), `src/components/CustomerWorkflows.tsx`.
- State: `IMPLEMENTED_ON_MAIN / ACCEPTANCE_PENDING`.
- Evidence boundary: source-only commit; no tests/build/typecheck/lint/CI/browser/Bolt/database/Preview/production operation was run. No runtime PASS is claimed.

## Next P1 action

Continue uncovered commerce/account actions from existing server-owned data/contracts. Keep profile/business edits and returned-order amendment blocked until their tenant-bound server commands exist. Do not alter P3 engines or introduce live external providers.

---

# P1 ACTIVE CHECKPOINT OVERRIDE — 2026-11-06 — BODY-COMPLETION-ON-MAIN-061 — STAFF SALES ORDER XLSX

- Repository: `Report-Engainall/Nasr1`; branch: `main`.
- Parent/base SHA: `8b54fe198a584891bd946b0d4d8af9d4bf240606`.
- Added `src/lib/admin-sales-order-xlsx.ts`: three Arabic worksheets for saved sales-order header, persisted item details and saved delivery snapshot. Uses the existing strict `AdminSalesOrderPrintDocument` projection and shared OOXML writer.
- Added «تنزيل Excel داخلي» to the existing admin order detail toolbar. The action is enabled only for the existing staff-visible projection and while the order data is loaded, error-free and free of staged/dirty review changes. It exports saved values, not unsaved review drafts.
- Preserves authorized saved order quantities/prices/totals; excludes UUIDs, tenant/user identifiers, raw payload, cost and margin. No duplicate query, RPC, database write, migration, role grant, dependency, route or P3 file.
- Files changed: `src/lib/admin-sales-order-xlsx.ts` (new), `src/components/AdminPages.tsx`.
- State: `IMPLEMENTED_ON_MAIN / ACCEPTANCE_PENDING`.
- Evidence boundary: source-only commit; no tests/build/typecheck/lint/CI/browser/Bolt/database/Preview/production operation was run. No runtime PASS is claimed.

## Next P1 action

Continue another uncovered customer/account or commerce interaction that uses an existing authorized backend contract. Keep profile/business writes and returned-order amendment blocked until the tenant-bound mutation commands exist. Do not modify P3-owned intelligence or broaden the PWA cache.

---

# P1 ACTIVE CHECKPOINT OVERRIDE — 2026-11-06 — BODY-COMPLETION-ON-MAIN-060 — USER-CONTROLLED PWA UPDATE

- Repository: `Report-Engainall/Nasr1`; branch: `main`.
- Product commits: `public/sw.js` explicit waiting/activation and shell cache v4 `a23066e40ac1abf899d9aac3a1f578927ef37e9b`; root update UI `d73e1d028699b41188f03970f261d245fe26c1f8`; unused error-state cleanup `828065e3ca7450fc90cf5b2b4a282c3ff9bf6524`.
- Final source blobs: service worker `3af1b8508a1a1703ed51f1d314fdcaf31983bb1c`; root `ce7ebd8a2abcc62d95a3d42e474039776f3c9a7d`.
- Scope: complete the missing PWA new-version notice and explicit update action without caching protected business data or forcing an immediate reload.

## BODY-060 — safe service-worker update lifecycle

- Removed automatic `skipWaiting()` from the install path. A replacement worker waits while the existing controlled app continues running.
- Added a service-worker message handler for `AGHBARI_ACTIVATE_UPDATE`; only an explicit user action requests activation.
- Added a global RTL update notice that detects an existing waiting worker and watches `updatefound`/installed state. It checks for updates when the page becomes visible.
- «تحديث التطبيق» sends the explicit activation message and reloads only after the new worker takes control (`controllerchange`). «لاحقاً» dismisses the prompt; no automatic reload or forced sign-out is triggered.
- Bumped the shell cache namespace from `aghbari-shell-v3` to `aghbari-shell-v4`; existing obsolete-shell cleanup removes prior shell versions after activation.
- Preserved the current cache boundary: public home shell, manifest, favicon and validated static assets only. Supabase API/auth/RPC/storage/functions and authenticated deep-route responses remain network-only; no financial, customer, price, inventory or order response is added to the service-worker cache.
- Files changed: `public/sw.js`, `src/routes/__root.tsx`.
- State: `IMPLEMENTED_ON_MAIN / ACCEPTANCE_PENDING`.

## Delivery evidence boundary

- GitHub source re-read on exact current main confirms explicit activation message, no install-time auto-skip, one root service-worker registration, waiting-worker prompt and reload only after controller change.
- No tests, build, typecheck, lint, CI, browser offline/update exercise, Bolt, database, Preview or production operation was run. No runtime PASS is claimed.

## Next P1 action

Continue missing route-register account and commerce functions. Keep offline writes disabled; do not expand service-worker caching to tenant, price, inventory, finance or authenticated API responses.

---

# P1 ACTIVE CHECKPOINT OVERRIDE — 2026-11-06 — BODY-COMPLETION-ON-MAIN-059 — CUSTOMER RETURN REQUEST A4 PRINT/PDF

- Repository: `Report-Engainall/Nasr1`; branch: `main`.
- Product source commit: `6ac5bd9bee33de74cee0bbe15358f0b80337f814`.
- Final `src/components/CustomerReturnsPage.tsx` blob: `e4f3001096acd5ce4f3b529406bf2301c84a6cf2`.
- Scope: add customer-facing A4 print/Save-as-PDF to each saved return request in the existing `/returns` history view.

## BODY-059 — print saved return request

- Added a per-request «طباعة / حفظ PDF» action.
- The document is built from the validated server-returned `CustomerReturnRequestRecord` and the order header already authorized for the current customer. No alternate query or data source is introduced.
- The Arabic RTL A4 print sheet shows company identity, customer display name, request number/date, original order number, request state/reason, item names/codes/quantities/UOM, customer note and saved review note.
- The projection excludes internal request/order/item UUIDs, prices, totals, costs, margins and payment data.
- The document explicitly states that it proves only that a return request was recorded; it is not proof of physical receipt, final acceptance, credit memo issuance or refund.
- Print lifecycle scopes its own body print mode, restores the previous mode after printing, and removes the print sheet on `afterprint` or handled failure.
- State: `IMPLEMENTED_ON_MAIN / ACCEPTANCE_PENDING`.

## Delivery evidence boundary

- GitHub source re-read on `main`: blob `e4f3001096acd5ce4f3b529406bf2301c84a6cf2`. Source contains the per-request trigger, A4 page rule, portal print sheet and request-only disclaimer.
- No tests, build, typecheck, lint, CI, browser, Bolt, database, Preview or production operation was run. No runtime PASS is claimed.