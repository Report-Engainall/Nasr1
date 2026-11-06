# EXECUTION REPORT ADDENDUM — 2026-11-06 — BODY-COMPLETION-ON-MAIN-060 — PWA UPDATE LIFECYCLE

- Added user-controlled PWA update notification. A new Service Worker waits instead of automatically calling skipWaiting; the UI detects it and offers Update/Later.
- Update sends the activation message and reloads only after controllerchange. The shell cache namespace advances to v4 and old shell caches are removed after activation.
- Existing read-only cache boundary is unchanged: public shell/static assets only; no authenticated route or Supabase/price/order/finance/inventory response caching.
- Commits: `a23066e40ac1abf899d9aac3a1f578927ef37e9b`, `d73e1d028699b41188f03970f261d245fe26c1f8`, `828065e3ca7450fc90cf5b2b4a282c3ff9bf6524`.
- Acceptance leaf: `DLV-014-PWA-UPDATE-PROMPT-001`; state `IMPLEMENTED_ON_MAIN / ACCEPTANCE_PENDING`.
- No tests/build/typecheck/lint/CI/browser/offline lifecycle/Bolt/database/Preview/Vercel/production operation was run. No runtime PASS claimed.

---

# EXECUTION REPORT ADDENDUM — 2026-11-06 — CUSTOMER ORDER XLSX + CUSTOMER RETURN PRINT

## Customer order XLSX — BODY-058
- Four Arabic worksheets built from the existing validated customer order projection: metadata, line items/quantities, saved delivery snapshot, and status/return history.
- Added the order detail Excel action; no new query or data mutation. Excludes prices, totals, costs, margins, UUIDs and internal notes.
- Commit `a8b093527c580ce2fde67248072f591b9b57729c`; builder blob `0e9784a8943ed0824378afa8a790dafbf9a94413`; UI blob `05c21aee4f76a2e7aff15eb8446fd8f190765576`.
- Acceptance leaf `DLV-011-CUSTOMER-ORDER-XLSX-001`; `IMPLEMENTED_ON_MAIN / ACCEPTANCE_PENDING`.

## Customer return request A4 print — BODY-059
- Added a per-request A4 RTL print/Save-as-PDF action to `/returns`.
- Uses validated saved request data; excludes UUIDs and all money/cost fields. Explicitly states that the document proves request submission only, not physical receipt, final approval, credit memo or refund.
- Commit `6ac5bd9bee33de74cee0bbe15358f0b80337f814`; blob `e4f3001096acd5ce4f3b529406bf2301c84a6cf2`.
- Acceptance leaf `DLV-011-CUSTOMER-RETURN-REQUEST-PRINT-001`; `IMPLEMENTED_ON_MAIN / ACCEPTANCE_PENDING`.

No tests/build/typecheck/lint/CI/browser/Bolt/database/Preview/Vercel/production operation was run. No runtime PASS claimed.

---

# EXECUTION REPORT ADDENDUM — 2026-11-06 — BODY-COMPLETION-ON-MAIN-057 — MY RETURNS

- Added authenticated customer route `/returns` as a consolidated, read-only history of saved return requests.
- Reads the current customer's order page (20 orders at a time) under existing order RLS, then calls `list_my_customer_return_requests(p_order_id)` for each order. No direct customer return table query or new mutation is introduced.
- Displays return status/reason, saved customer/review notes, returned line items and quantity, and link to original order. Any RPC or summary validation error fails the page rather than showing a partial result as complete. The page discloses page scope.
- Route registered in TanStack tree, global navigation, footer, profile and Help Center.
- Commits: `b54906d6452fc9e59119ae63b29acb3787c3cb8e`, `059e67277463f02d3c55b00fe011b1d75a14eb6d`, `4f6c9abc898ac84b6b0fb82f30e41224dfedd121`, `fa96fd9754589c395adf0e4315452c1ece56634f`, `8373a07c9feff4204d9fefb1b3274d224b412f77`, `c08f56f3b716f3eaa2dd4165a10ede6ffe63f7d7`, `6ae7a21b1d130ea77b7b1bcb02f7a9f6f3ebc7f6`, `b0736e47ceb9845c90e57b5fa9fba0b33deb0b36`, `b51acd3f8b4bb7e95679bf15aa1562ac0f2a4ceb`, `e849baa6f01c666d1706333d18201e8a45911ee3`.
- Acceptance row: `DLV-006-CUSTOMER-RETURNS-HISTORY-001`; state `IMPLEMENTED_ON_MAIN / ACCEPTANCE_PENDING`.
- No tests/build/typecheck/lint/CI/browser/Bolt/database/Preview/Vercel/production operation was run. No runtime PASS claimed.

---

# EXECUTION REPORT ADDENDUM — 2026-11-06 — BODY-COMPLETION-ON-MAIN-056 — SESSION REVOCATION

- Added `signOutOtherSessions()` and `signOutEverywhere()` methods in AuthContext using explicit Supabase scopes `others` and `global`; regular logout remains explicit `local`.
- Added confirmed profile actions with in-flight guard and visible error handling; added Help Center entry and access-token expiry disclosure.
- Source commits: `d2aa6092d7cd09403a4057d567f5374a3ce7ea92`, `931e65714388359ac5dc414ae1d4d2ada17c534a`, `c21e5c335a7d3221c9674450d2abbdc24349cb60`.
- Acceptance leaf: `DLV-006-ACCOUNT-SESSION-REVOCATION-001`; `IMPLEMENTED_ON_MAIN / ACCEPTANCE_PENDING`.
- No tests/build/typecheck/lint/CI/browser/Bolt/Auth/DB/Preview/Vercel/production operation was run. No PASS or runtime acceptance claimed.

---

# EXECUTION REPORT ADDENDUM — 2026-11-06 — BODY-COMPLETION-ON-MAIN-055 — PHONE PASSWORD SIGN-IN

- Added email/phone switching in the login form. Phone credentials use Supabase Auth `signInWithPassword({ phone, password })`; email path remains intact.
- Normalizes Yemen local mobile forms, +967/00967 and general E.164 numbers; invalid phone strings fail before network call. Provider-disabled and phone-unconfirmed failures are explicit.
- Profile/password views handle phone-only accounts without email.
- Phone Auth configuration, verified phone identities and any SMS provider remain external prerequisites. New phone registration/OTP is not implemented; no paid provider or SMS spend was enabled.
- Commits: `9386f10d699ba3cde1e827e1e1c9d26f212a958e`, `750580d67a91acc006546eff643c6037f6ccbd50`, `4067958f8bf80f39220b5338173a4f59cc3a9406`, `8030278a8a6ffe040328fcab144722fdbfa5c218`, `c551fb3bf31d599b7c5b257f551884109878c24a`, `de77468477d804aae910f43c4b09389947cce804`.
- Acceptance row: `DLV-006-PHONE-PASSWORD-SIGNIN-001`; state `IMPLEMENTED_ON_MAIN / AUTH_PROVIDER_CONFIGURATION_AND_ACCEPTANCE_PENDING`.
- No tests/build/typecheck/lint/CI/browser/Bolt/Auth-provider/SMS/database/Preview/Vercel/production operation was run. No runtime PASS.

---

# EXECUTION REPORT ADDENDUM — 2026-11-06 — BODY-COMPLETION-ON-MAIN-054 — CUSTOMER PROFILE OVERVIEW

- Completed action: `BODY-COMPLETION-ON-MAIN-054`.
- Added the authenticated `/profile` overview with current user display name, email and role labels from the existing AuthContext. Exposes customer or staff workflow shortcuts based on the current role.
- Changed global «الحساب» navigation, storefront footer and Help Center to link to `/profile`.
- Commits: `6607901b4b65e9a2471f66ce03463d1cf6029c93`, `3bc60712c7549033c00b1453e7e4133a67934ea8`, `88b17e4de227f1ac36f9eb37765cffc3abcb7d88`, `48ed9df9ad1dc7f4b286082401d646617347eee0`, `9f24fd1ec8a649abba57834529b613e5e8ec7710`.
- Acceptance row: `DLV-006-CUSTOMER-PROFILE-OVERVIEW-001`; state `IMPLEMENTED_ON_MAIN / ACCEPTANCE_PENDING`.
- Profile editing is intentionally not exposed: legacy direct profile UPDATE is too broad without a field-allowlisted backend command. No mutation or tenant change was implemented.
- No tests/build/typecheck/lint/CI/browser/Bolt/database/Preview/Vercel/production operation was run. No PASS or runtime acceptance is claimed.

---

# EXECUTION REPORT ADDENDUM — 2026-11-06 — BODY-COMPLETION-ON-MAIN-053 — ACCOUNT PASSWORD CHANGE

- Completed action: `BODY-COMPLETION-ON-MAIN-053`.
- Added authenticated `/account/password` route using Supabase Auth `updateUser` on the active identity.
- Enforces minimum length, no whitespace, exact confirmation, one in-flight update and returned-user identity check. Password values are not written to app database/profile metadata or browser storage.
- Help Center links to the new screen and documents the existing recovery path for Auth reauthentication failures.
- Commits: `d3aa3a2bbdd2b103d19617b264005804cca43daa`, `8ea2063bfa80abd8cd51afefc76b301d71d9c476`, `c03e62be3d19bb00bde904b3d9f7b71e223f9483`, `bfb1b567df4e463f0319f7205401a277510a7524`.
- Acceptance row: `DLV-006-ACCOUNT-PASSWORD-CHANGE-001`; state `IMPLEMENTED_ON_MAIN / ACCEPTANCE_PENDING`.
- No tests/build/typecheck/lint/CI/browser/Bolt/database/Preview/Vercel/production operation was run. No PASS or runtime acceptance is claimed.

---

# EXECUTION REPORT ADDENDUM — 2026-11-06 — BODY-COMPLETION-ON-MAIN-052 — CUSTOMER PAYMENTS HISTORY

- Completed action: `BODY-COMPLETION-ON-MAIN-052`.
- Added customer `/payments` as a distinct route over the existing customer-authorized `get_customer_account_statement()` source.
- Displays saved payment dates, invoice references and only source-verifiable amount/currency values. Missing invoice detail is disclosed and financial values are withheld; source caps remain explicit.
- Linked the route in the account navigation, storefront footer and Help Center.
- Source commits: `a8f99af47f2f07f0ae2448595e60234116d1ac73`, `0c8d1428c0b07e2fa00fdc3b23a1c127153a5844`, `2951fff959abe2f44d51c9b240f38ba83c465b25`, `0df9b39d40adef06332397967b70f1a05c3875bf`, `3bbce03c22acadbc565aebfcad757551b6c41389`, `c6bbf686e49a4e53365785cff591311428928af2`.
- Acceptance row: `DLV-008-CUSTOMER-PAYMENT-HISTORY-001`; state `IMPLEMENTED_ON_MAIN / ACCEPTANCE_PENDING`.
- This is a read-only history route; it does not collect payments or create receipts/journals. Customer payment initiation requires a separately approved server contract.
- No tests/build/typecheck/lint/CI/browser/Bolt/database/Preview/Vercel/production operation was run. No PASS or runtime acceptance is claimed.

---

# EXECUTION REPORT ADDENDUM — 2026-11-06 — BODY-COMPLETION-ON-MAIN-051 — CUSTOMER HELP CENTER

- Completed action: `BODY-COMPLETION-ON-MAIN-051`.
- Repository/branch: `Report-Engainall/Nasr1` / `main`.
- Added an Arabic searchable `/help` page with 10 application-grounded FAQ entries and direct links to existing customer workflows.
- Registered the TanStack route and exposed the page in the global navigation and storefront footer.
- Product commits: `68f736b0b3adb7b136873aaac27001b4ce2dc467`, `3e9290f6b2918777c78aeca25fbb967ceab0c7c7`, `1232f996abf312851698162e887b3222edf474ca`, `d81267e9e12ac3da5fc14b890cc3b5a0ba68ebf9`.
- Acceptance row: `DLV-002-HELP-CENTER-001`; state `IMPLEMENTED_ON_MAIN / ACCEPTANCE_PENDING`.
- Scope boundary: no new backend write, payment, notification, external provider or customer-service engine. The support CTA routes to existing `/service-cases`.
- No tests/build/typecheck/lint/CI/browser/Bolt/database/Preview/Vercel/production operation was run. No PASS or runtime acceptance is claimed.

---

# EXECUTION REPORT ADDENDUM — 2026-11-05 — SOURCE-LINKED SUPPLIER ACCOUNT ACTIVITY

- Completed action: `BODY-COMPLETION-ON-MAIN-016`.
- Repository/branch: `Report-Engainall/Nasr1` / `main` only.
- Continues from `BODY-COMPLETION-ON-MAIN-015` supplier credit-note matching. This is a read model over existing source-linked journals; no parallel ledger or payment record was introduced.

## Product functionality delivered

### Supplier account activity statement
- Added `supabase/migrations/20261105234000_supplier_account_activity_statement.sql` with a finance-only `fetch_supplier_account_activity()` RPC.
- Purchase receipt movement is included only when its original purchase-receipt journal is POSTED, references the same persisted receipt, the receipt-to-journal posting link exists, and the complete journal contains exactly two balanced lines with the expected saved inventory/payable source amount and payable account.
- Supplier credit-note movement is included only when the accepted credit-note draft link, supplier return, source receipt journal and POSTED credit-note journal all resolve to the same supplier/source chain; the credit-note payable debit must equal the saved actual credit-note amount. Both source and credit-note journals must remain unreversed.
- The read model excludes drafts, void entries, reversal-linked entries, foreign-tenant records, unlinked liability rows and mappings that do not prove the expected source amounts/accounts.
- Supplier totals are grouped by currency and never summed across currencies. The response includes bounded detailed rows, supplier/currency debit and credit totals, net credit movement, activity count and last activity date.
- The endpoint explicitly returns `settlement_included=false`. It does not infer supplier payments or final outstanding balances from journal net movement.

### Typed client and connected screen
- Added `src/lib/supplier-account-activity.ts` with strict source/status, amount, UUID, calendar-date, currency, pagination and response validation.
- Added `src/components/SupplierAccountActivityWorkspace.tsx` with Arabic RTL date filters, currency-level totals, supplier-by-currency summaries, detailed posted journal movements, source references and bounded pagination.
- Mounted it in the existing `src/components/GeneralLedgerWorkspace.tsx`, beside supplier credit-note matching. Existing finance role checks and the canonical General Ledger are reused.

## Source commits
- SQL read-model migration: `68307e40708b36386d4b22ef8147e9f42233d586`.
- Balanced full-journal source guard: `add6e4162a6eac24d088725ba57c5a8a864c9b0f`.
- Typed client: `2bba5e24c5797ca1b47eade78a79c6fb6497ec23`.
- UI: `8483fbd13dd266d3c658010fe0df3f3b371e4046`; pagination cap `b73ec7504137b75b2c5bcd68c87997f75dbbfd0f`.
- General Ledger mount: `90e99e44b71bc1a584c357f369aa40f70e14471a`.
- Acceptance matrix leaf `DLV-008-SUPPLIER-ACCOUNT-ACTIVITY-001): `9eba58c1e01874ae11b75ada475773822c8344d8`.
- Live checkpoint update: `a9a84a13b9c23a08a57248ea514477b41d48e538`.
- Status: `IMPLEMENTED_ON_MAIN / ACCEPTANCE_PENDING`.

## Delivery and runtime boundary
- Source changes are committed to official `main`.
- Migration is source-only and has not been applied to local, hosted, production or Bolt databases. No database was connected or changed.
- No tests, build, lint, typecheck, CI, browser/E2E, Bolt Preview or production checks were run in this implementation batch. No PASS or runtime acceptance is claimed.
- No Vercel build/preview/deploy occurred; no Vercel free credits were used. No paid service or dependency was added.
- GitHub commits are the delivery record; actual push/inbox notification delivery depends on repository watch settings.

## Next product action
- `NEXT_ACTION_ID: BODY-COMPLETION-ON-MAIN-017`.
- Implement real supplier payment and settlement from an actual treasury/cash/bank transaction source: inspect and reuse an existing canonical source where possible; otherwise add a tenant-scoped payment document, active cash/bank account linkage, idempotent capture, partial allocations against proven supplier activity, reconciliation evidence and a balanced accounting draft. Payment and outstanding balances must be computed only from saved payment/instrument and allocation records, never from a credit note or net journal movement alone.

---

# EXECUTION REPORT ADDENDUM — 2026-11-05 — SUPPLIER CREDIT-NOTE MATCHING

- Completed action: `BODY-COMPLETION-ON-MAIN-015`.
- Repository/branch: `Report-Engainall/Nasr1` / `main` only.
- Builds directly on `BODY-COMPLETION-ON-MAIN-014` receipt-linked supplier returns. Existing purchase receipts, purchase-receipt accounting and General Ledger were reused; no duplicate ledger or supplier-return path was introduced.

## Product functionality delivered

### Supplier document capture and variance control
- Added `supabase/migrations/20261105233000_supplier_credit_note_matching.sql`.
- Added finance-only, tenant-scoped supplier credit-note records with immutable supplier-document evidence, source amount snapshots, actual amount, currency, signed variance, idempotency and audit metadata.
- The server derives the supplier, source amount and currency from a POSTED supplier return. It rejects a return whose source cost is missing/non-positive and rejects credit notes with a different currency. It does not infer FX or tax.
- A same-amount document is eligible for the controlled journal handoff. Any non-zero variance remains pending until a finance user records an approval or rejection with a reason. The decision has actor/time/reason history and is idempotent for same-decision replay.
- Rejected evidence remains in append-only history. A corrected supplier document can be registered as the active document for that posted return; prior rejected evidence is not overwritten or deleted. A partial unique constraint prevents more than one active supplier credit note per return.

### Controlled General Ledger handoff
- The migration creates one finance-only accounting-draft link for each accepted supplier credit note.
- Before creating the journal, the server proves the original purchase-receipt accounting posting exists and the original source journal is POSTED, references the same receipt number, contains exactly the expected balanced inventory/payable lines, uses the stored mapping, and has no reversal record. The source accounts must still be active and retain their required account types.
- The resulting entry uses the original inventory/payable accounts. Any approved amount difference requires an explicit active revenue account when the actual note exceeds source cost or an expense account when it is lower.
- The existing general ledger accepts the new `purchase_supplier_credit_note` source type. The handoff creates a balanced DRAFT only; the accountant must review and explicitly post it from the existing ledger. No automatic GL post, payment, supplier message, tax or FX write occurs.

### Typed client and interface
- Added `src/lib/supplier-credit-notes.ts` for typed read, document record, variance review and draft-handoff RPCs with strict response parsing.
- Added `src/components/SupplierCreditNoteWorkspace.tsx`: Arabic RTL return queue, real source and actual amounts, supplier note details, finance variance approval/rejection, variance-account selection, journal source eligibility and visible immutable review history.
- Mounted the workspace within `src/components/GeneralLedgerWorkspace.tsx`; the newly created accounting draft appears within the existing General Ledger workflow.

## Source commits
- Migration create: `6498e9ad162b684846293ea585bad6b9474fc453`.
- Migration date guard: `c49340fcb7bfa6ebd479c06af5b15f3380683e8f`.
- Rejected-document correction path: `2a2d13aecfbdedab2cc31109340c0106aa6533e8`.
- Idempotent variance review and reversed-source protection: `59bf034a50d16d1f52ff42bea39c1af6703b5249`.
- Read-model review history: `d065037d534e9ab51099aff628a1e52192f4f83d`.
- Typed client: `55cfaa4382cb28dda13e13bf3b82fa04b69320a8`; journal status parser correction: `a8864430261ce78f4e468c312a2ad9230ceef4ea`; review-history/date parser: `16fca8ccbbb9b40879746844db07e0ed4d554d4e`.
- UI: `9bb158573d4abde3f4564723d38745215eb90d24`; history display: `8b1d1f604845172f9a4041af928ededdaed99ad7`.
- General Ledger mount: `2dcbcaad3a73e6352b51edca80b58d1a8e7c8f84`.
- Acceptance matrix update: `84b59d50d52fbe4051ce9dd9188b8032f46aacd3`; live checkpoint update: `66541f8a372f4e82f10facd7ec6eb06d38366211`.
- New matrix leaf: `DLV-008-SUPPLIER-CREDIT-NOTE-MATCHING-001`, status `IMPLEMENTED_ON_MAIN / ACCEPTANCE_PENDING`.

## Delivery and runtime boundary
- All changes are committed to official `main`.
- The migration is source-only and has not been applied to any local, hosted, production or Bolt database. No database was connected or modified.
- No tests, build, lint, typecheck, CI, browser/E2E, Bolt Preview or production verification were run in this implementation batch. No PASS or runtime acceptance is claimed.
- No Vercel build, preview, deployment or free-credit usage occurred. No paid service or dependency was added.
- GitHub commits provide the source-delivery record; actual push/inbox notifications remain subject to repository watch settings and are not claimed without a receipt.

## Next product action
- `NEXT_ACTION_ID: BODY-COMPLETION-ON-MAIN-016`.
- Build the supplier account activity statement from POSTED receipt journals and POSTED supplier-credit-note journals through their source links. Preserve per-supplier dated debit/credit movements and document references; exclude drafts, void/reversed source journals and unlinked liability rows from supplier attribution. Do not call journal net movement a payable settlement unless an actual supplier payment source exists.

---

# EXECUTION REPORT ADDENDUM — 2026-11-05 — RECEIPT-LINKED SUPPLIER RETURNS

- Completed action: `BODY-COMPLETION-ON-MAIN-014`.
- Repository: `Report-Engainall/Nasr1`; branch: `main` only.
- Builds on `BODY-COMPLETION-ON-MAIN-013` (evidence-backed replenishment drafts and supplier quote comparison). No existing PO, receipt, inventory movement, supplier quote, or GL lifecycle was rebuilt.

## Product functionality delivered

### Supplier-return source and remaining-quantity controls
- Added `supabase/migrations/20261105232000_supplier_return_processing.sql`.
- Added tenant-scoped `purchase_supplier_returns` and `purchase_supplier_return_items` tables, RLS enabled, browser table privileges revoked, service-role-only direct table writes, sequence privilege restrictions and tenant-consistent item/header foreign-key linkage.
- `fetch_purchase_supplier_returns()` returns the latest source receipts with per-line quantities originally received, already returned through POSTED returns, currently remaining, unit and source unit cost. Draft returns are not presented as posted returns or stock changes.
- `create_purchase_supplier_return()` requires an active same-tenant admin/manager and derives supplier, purchase order, warehouse and base currency from the original receipt. Every selected item must belong to that receipt. Each line must be positive, no more than three decimals and no greater than the remaining quantity after prior posted returns.
- Draft creation is idempotent using an organization-scoped advisory lock and payload fingerprint. It writes immutable source snapshots and audit evidence only; it does not modify stock or GL.
- Costs are copied only from the saved purchase-receipt item. If one or more source costs are missing, the return total remains NULL; no zero, replacement cost, FX or supplier credit is fabricated.

### Atomic physical supplier-return posting
- `post_purchase_supplier_return()` locks the draft, original receipt and source receipt item rows, then revalidates aggregate returnable quantity before changing stock.
- It locks the existing balance row and requires `quantity_available` (on-hand less reserved) to cover each return line. Reserved or unavailable stock is not decremented. A failed line rolls back the entire transaction.
- For each line, the function decrements `quantity_on_hand`, updates last movement time and appends a negative `supplier_return` row to the existing `inventory_movements` ledger, linked to the supplier-return document and actor.
- Successful posting marks the document POSTED and records an audit event. A same-document replay returns the original result and does not add another movement.
- Posting opens one source-linked task: purchasing must resolve missing source cost, or the accountant must match a supplier credit note against the recorded source amount/currency. No journal, credit memo, payment, supplier message or FX conversion is automatically created.

### Typed client and connected purchasing screen
- Added `src/lib/supplier-returns.ts` with strict receipt, line, return, UUID, date, currency and quantity parsing; RPC wrappers cover queue, draft creation and posting.
- Added `src/components/SupplierReturnWorkspace.tsx`; mounted it inside the existing `src/components/PurchaseOrdersPage.tsx` with the supplier quote comparison workspace.
- The manager screen selects an original receipt, displays received/already-returned/remaining quantities and source cost, records reason and notes, saves a draft, and requires explicit confirmation before stock posting.
- The UI explains that draft returns do not reserve the quantity; the server rechecks under source receipt locks at posting. The client retains the same idempotency key across a retry of the same payload after an ambiguous response.

## Source and record commits
- Supplier return migration: `489f5dfa626b8e3c8e1c19f6171e91e39407237e`; tenant linkage/total precision hardening: `8cc7dddc8df35c8d49e3b78589d91861ab4f3c93`.
- Typed client: `3acf7a0b94c02b98e66562822137b4deece37adb`.
- Supplier return UI: `d51c101d7468a76685a87c17fca530ea3fa25b2b`; Purchase Orders integration: `9c7110fc11c0909566e16981f86016e4c4743e3d`; retry-safe client idempotency: `acdd1d7e20abc9e56c89c20122efa2eae21398a2`.
- Acceptance matrix: `470759ed71d7cfd893601b0e9c784872186386fe` initially added the leaf; `9806b374b4fe7bda1d3c834bbe24d85d59fc240e` reconciled final evidence.
- Canonical registry: `cd3e4295027ea0dcaee1d4cd952dffefe2d9e569` added the requirement; `2991f07f517b879fa19184ca98ad6f12399738d5` mapped the acceptance leaf.
- New acceptance leaf: `DLV-007-SUPPLIER-RETURN-001`, status `IMPLEMENTED_ON_MAIN / ACCEPTANCE_PENDING`.

## Delivery and acceptance boundary
- Source code and records are committed to official GitHub `main`.
- The supplier-return migration has not been applied to local, hosted, production or Bolt databases. No database was connected or modified.
- No tests, build, lint, typecheck, CI, browser/E2E, Bolt Preview or production check was run in this implementation batch. No PASS or runtime acceptance is claimed.
- No Vercel build, preview, deployment or free-credit use occurred. No paid service or dependency was added.
- GitHub commits are the source delivery and notification surface. Actual push/inbox notification delivery depends on repository watch/notification settings; no delivery receipt is claimed.

## Next product action
- `NEXT_ACTION_ID: BODY-COMPLETION-ON-MAIN-015`.
- Add accountant-controlled supplier credit-note matching for POSTED supplier returns: record the supplier's credit-note number/date/actual amount/currency from the source document; match it to the supplier and return; reject unsupported currency or a credit amount outside the documented comparison policy; persist review/audit status; and provide a controlled draft-accounting handoff only when the original receipt's journal/account mapping is proven. Do not auto-post GL, assume tax/FX or manufacture supplier credit evidence.

---

# EXECUTION REPORT ADDENDUM — 2026-11-05 — REPLENISHMENT DRAFT HANDOFF + SUPPLIER QUOTE COMPARISON

- Completed action: `BODY-COMPLETION-ON-MAIN-013`.
- Repository: `Report-Engainall/Nasr1`; branch: `main` only.
- The preceding `BODY-COMPLETION-ON-MAIN-012` open-purchase-order netting implementation remains intact. No intelligence engine or purchase-order workflow was rebuilt.

## Product functionality delivered

### Evidence-backed replenishment to a confirmed draft
- Added `src/components/intelligence/ReplenishmentPurchaseDraft.tsx` and connected it to `ReplenishmentCard` and `IntelligenceWorkspace`.
- Managers can select only recommendations whose action is `RECOMMEND`, evidence status is `VERIFIED`, recommended quantity is positive and a quantity unit is present.
- The draft handoff resolves `productRef` against the current active same-tenant product catalog and requires exact equality between the recommendation UOM and the current product UOM. Missing, inactive, malformed or mismatched lines are excluded with a visible reason.
- Recommended quantities are rounded upward to the persisted `0.001` quantity precision, shown beside the original measured recommendation, and remain editable before confirmation.
- The manager must explicitly choose an active supplier and active warehouse. The operation reuses the existing typed `createPurchaseOrder` / `create_purchase_order` idempotent command; purchase costs remain NULL because the intelligence engine has no verified supplier cost basis.
- The result is a draft only. It is not submitted, sent to a supplier or received. Stock, accounting journals, payables and payments are not mutated.

### Supplier offer capture, comparison and award
- Added `supabase/migrations/20261105231000_supplier_quote_comparison.sql` with tenant-scoped quote and quote-line tables, RLS enabled, direct browser table privileges revoked, manager/admin RPC boundaries, audit records and idempotency.
- Currency is read from the server-resolved organization's base currency; a client cannot choose another currency. Unit prices across offers are therefore compared in the same recorded currency; no FX conversion is inferred.
- Added typed `src/lib/supplier-quotes.ts` and `src/components/SupplierQuoteWorkspace.tsx`, mounted in the existing Purchase Orders workspace.
- Managers can capture supplier quote number/reference, validity date, delivery days, payment terms, item quantities and unit costs; review item-level lowest recorded unit costs; and select a current, unawarded offer.
- Award locks the quote and atomically calls the existing `create_purchase_order` command using a stable quote-derived idempotency key. A single canonical draft is linked to the quote; a retry returns that same draft.
- Expired offers cannot be awarded. Award does not submit the purchase order, send supplier messages, receive stock or post journals.

## Source and record commits
- Supplier quote migration timestamp/precision correction: `67ab6de1093e6a685072af5744a34c5a63f4e24e`; duplicate-version file removed in `413349dca667b60f32ca104c575e01684f7165d3`.
- Typed quote client: `b881e204d08c88317dfb41696e5171e683e649bb`.
- Quote comparison workspace: `551e45f8b875829192caead6b0bd0e174385c31e`.
- Purchase Orders integration: `107af16be05f8e6335a172f55f90aa2471ed09b2`.
- Replenishment draft UI: `65e628e3479ef8aa5aa317b47c493299d657bdaf`; recommendation selection integration `1676e0bfda73ec65232789f0bf48041d1bd13d64`; quantity precision correction `ad9d46f31256746e41e1df8ba5d6b61f66f0f79a`; manager capability wiring `7adfba306a611bfb32bcd42956e506503cd7d1fc`; final copy/draft guard corrections `28886f27598c83a45386c4523a4a8569c095b8a3` and `70d89e6b8f2e05163cd62b70f1702b52408eaeef`.
- Acceptance leaves: `DLV-007-INVENTORY-REPLENISHMENT-PURCHASE-DRAFT-001` and `DLV-007-SUPPLIER-QUOTE-COMPARISON-001`; both remain `IMPLEMENTED_ON_MAIN / ACCEPTANCE_PENDING`.

## Delivery and acceptance boundary
- All source and acceptance mapping changes are on official GitHub `main`.
- The supplier-quote migration has not been applied to any database. No local, hosted, production or Bolt database was connected or modified.
- No test, build, lint, typecheck, CI, browser, E2E, Bolt Preview or production validation was run for these changes, per the instruction to prioritize product-body implementation. No PASS or runtime acceptance is claimed.
- No Vercel build, preview, deployment or free-credit use occurred. No paid provider, service or dependency was added.
- GitHub commits are the source delivery and the native notification surface; actual push/inbox notification delivery depends on repository watch/notification settings and is not claimed without a GitHub receipt.

## Next product action
- `NEXT_ACTION_ID: BODY-COMPLETION-ON-MAIN-014`.
- Build supplier-return processing from an original purchase receipt: select source receipt lines and returnable remaining quantities, enforce manager authorization and tenant scope, write an auditable idempotent supplier-return document and one stock-decrease movement, and link any payable credit/financial entry only through an approved source-cost/currency/accounting workflow. Do not invent FX, cost basis, supplier credit or tax; no direct GL post without the existing authorized accounting lifecycle.

---

# EXECUTION REPORT ADDENDUM — 2026-11-05 — CUSTOMER 360 FOLLOW-UP LIFECYCLE

- Task: `BODY-COMPLETION-ON-MAIN-006`; product-code SHA `66558c300af38c6a49a4c98feb1b6c31636c7638`.
- Added the tenant-scoped `manage_customer_interaction_follow_up` command and append-only event table. Managers can reschedule an open follow-up or cancel it with a required reason. Task and source interaction are locked; old/new due time and actor are audited; idempotent replay is supported.
- Reschedule overrides and cancellation markers survive source-event upserts. CustomerInteraction history reads now distinguish the original recorded time from the effective task due time, status and cancellation reason.
- Typed API and Customer 360 UI controls are connected. The task generator remains in the sales role queue and assigns the recorder.
- Main commits: `b5e9afc84b62af0e399cd90b3db705aa335669d6`, `890e8c0d5fad8b68be764286f29485de943cae7c`, `c19cec2bdd370dc0f872792b0c0ab97bb6437d25`, `a6617fd5ab3a012299a49edfa9f58c3d6f8de174`, `66558c300af38c6a49a4c98feb1b6c31636c7638`.
- Acceptance matrix leaf: `DLV-015-CUSTOMER-FOLLOW-UP-LIFECYCLE-001` — `IMPLEMENTED_ON_MAIN / ACCEPTANCE_PENDING`.
- Migration not applied to any database. Tests/build/lint/CI/browser/runtime were not run in this batch; no PASS is claimed. No Vercel use.
- Next action: `BODY-COMPLETION-ON-MAIN-007` — integrate the existing evidence-gated deterministic customer-retention engine into Customer 360 without inventing scores from incomplete evidence.

---

# LIVE EXECUTION CHECKPOINT — 2026-11-05 — CUSTOMER 360 INTERACTION CRM + FOLLOW-UP TASK FLOW

- Repository: `Report-Engainall/Nasr1`; branch: `main` only.
- Main at the beginning of this Customer 360 product batch: `5f9332843bc81b5bfacd1e8d973fecd317071ed5`.
- Last verified main head immediately before this checkpoint update: `b78e331134f70f44d2371e0eeae528da19f625fc`.
- The main head above includes the Customer 360 interaction implementation and acceptance-matrix updates. It also contains a subsequent main commit `feat(storefront): notify customer members about order lifecycle` (`b78e331...`); that independent commit was preserved and not overwritten.
- All work in this stream was committed directly to the official `main`; no feature branch was created.

## New product capabilities implemented

### Customer 360 — append-only interaction history
- Added `supabase/migrations/20261105130000_customer_interaction_history.sql`:
  - Tenant-scoped `customer_interactions` table with customer, server-derived recorder, contact type, subject, details, occurrence time, optional next follow-up, creation timestamp and organization-scoped idempotency key.
  - Direct client table privileges are revoked; the browser cannot insert, update or delete interaction rows.
  - `record_customer_interaction` checks an active staff profile and current organization, locks the customer row, verifies customer membership in that organization, validates the interaction payload and optional future follow-up, writes the immutable interaction and an `audit_logs` event.
  - `get_customer_interaction_history` returns latest bounded records with recorder display names, and verifies the active staff/tenant/customer scope.
  - No interaction write changes customer balances, orders, invoices, payments, stock or accounting.
- Idempotency:
  - A unique `(organization_id,idempotency_key)` index prevents duplicate saves.
  - Replaying the same key with the same customer/actor/type/subject/details/follow-up returns the original interaction ID without a second interaction, audit entry or follow-up task.
  - Reusing the same key with different input is rejected.
  - Replay is resolved before checking whether the original follow-up date is now in the past, so a delayed network retry remains safe.
  - The UI retains the key after an unsuccessful request and renews it after successful save or when the user changes input.
- Added `CustomerInteraction` and `CustomerInteractionType` models to `src/lib/types.ts`.
- Added strict response parsing plus `fetchCustomerInteractions` and `recordCustomerInteraction` RPC wrappers in `src/lib/api.ts`.
- Added the Customer 360 form and saved interaction timeline in `src/components/AdminCustomer360.tsx`, supporting call, visit, WhatsApp, email, meeting, internal note and other; each record shows timestamp, content, recorder and optional follow-up.
- Added responsive interaction form/history styles to `src/styles.css`.

### Scheduled follow-up becomes an operational sales task
- When an interaction includes a future follow-up date, the same database transaction creates one idempotent task using the existing `upsert_operational_task` contract.
- The task is in the `sales` role queue, carries the due date and concise interaction context, and links to its source interaction using a stable source event key.
- It is **not assigned to the employee who recorded the interaction**; it is made visible in the sales role queue for authorized staff. The Customer 360 UI wording reflects this.
- `src/components/TaskCenter.tsx` labels the source as `متابعة عميل 360`.
- No task is created when no follow-up date is supplied; same interaction replay does not create a second task.

### Customer 360 print/PDF and Excel outputs
- `src/lib/customer-360-print.ts` extends the explicit allowlisted print DTO with the latest interaction rows. It includes only interaction type, subject, details, occurrence date, follow-up date, record date and recorder display name; it excludes organization, customer, interaction, profile and other internal UUIDs.
- `src/components/Customer360PrintSheet.tsx` adds a dedicated interaction-history section.
- `src/lib/customer-360-xlsx.ts` adds a dedicated `سجل التواصل` worksheet.
- `src/components/AdminCustomer360.tsx` now synchronizes the fetched interaction list with print/export. Print and export remain disabled while interaction history is loading or failed, avoiding a seemingly complete file that silently omits the history.
- Interaction details are explicitly limited to the latest 50 entries in the UI and exports; older entries remain stored and are not claimed to be included.

## Files changed in this product batch

- SQL: `supabase/migrations/20261105130000_customer_interaction_history.sql`.
- Types/API: `src/lib/types.ts`, `src/lib/api.ts`.
- Customer 360 UI: `src/components/AdminCustomer360.tsx`, `src/styles.css`.
- Print/PDF projection: `src/lib/customer-360-print.ts`, `src/components/Customer360PrintSheet.tsx`.
- Excel export: `src/lib/customer-360-xlsx.ts`.
- Operational task source label: `src/components/TaskCenter.tsx`.
- Acceptance matrix: `docs/bolt-source-reconciliation/REMAINING_SCREEN_ACCEPTANCE_MATRIX_2026-10-22.csv`.
- Added matrix leaves:
  - `DLV-006-CUSTOMER-INTERACTION-HISTORY-001`
  - `DLV-006-CUSTOMER-INTERACTION-IDEMPOTENCY-001`
  - `DLV-011-CUSTOMER-INTERACTION-EXPORT-001`
  - `DLV-015-CUSTOMER-FOLLOW-UP-TASK-001`

## Evidence boundary — do not overstate

- Source and documentation updates are committed on `main`. The latest Customer 360 interaction form/idempotency UI commit is `5f5a1f239e2e2ee9825f310987d0f192373b1a7e`; the full replacement migration commit is `3adc4e033e6addc94fb41b159e7add54b9a4934c`; the matrix update commit is `c24a8744cab044e488e6ea1c5344929169a84ca6`.
- The SQL migration was **not applied** to local, hosted or production PostgreSQL. No production data, schema, tenant, credentials or storage was changed.
- No tests, build, lint, local Supabase, CI, browser E2E, Bolt Preview or runtime check was run in this product batch. The owner asked to prioritize implementation and avoid spending the session on broad test cycles. No test PASS is claimed.
- DLV rows remain `IMPLEMENTED_ON_MAIN / ACCEPTANCE_PENDING`; implementation in source is not the same as runtime acceptance.
- The Customer 360 history read/export is bounded to the latest 50 rows. It is not described as the complete history in print/XLSX.
- Interaction follow-up tasks remain in the sales role queue and are not automatically assigned to the recording employee.
- Lovable detachment remains integrated from `b0a091e0a506da43a9b0d0dd0d1e9b992498ca63` and CI alignment `45ca19c47a985b2d12d23c846ba068222a4e17ce`. No Lovable dependency was reopened.
- Bolt runtime remains deliberately deferred until practical source/product handoff readiness.

## Bolt archive disposition

- Original archive remains available from the ChatGPT Library at `/mnt/data/project-bolt-github-8ccbjvhg (2).zip`.
- Verified outer SHA-256: `db56924e7d629e480c96652ada8090f9605f466ccb773580446ce5b45cb09bc9`; the ZIP listing contains 1,211 entries.
- The P3 dossier records 69/69 staged provenance files mapped to the existing integration ledger, the inner CSV helper as an exact target match, the product-image helper as superseded, and legacy privileged migrations as excluded.
- No new byte-for-byte comparison of all 1,211 ZIP entries was performed in this batch. Do not claim full archive parity or copy the historical ZIP over the newer NASR1 tree.

## Next implementation action

- `NEXT_ACTION_ID: BODY-COMPLETION-ON-MAIN-006`.
- Extend the Customer 360 follow-up lifecycle: add a tenant-scoped command to reschedule or cancel an open customer-follow-up task from the interaction history while keeping the interaction as an immutable record and the linked `customer_follow_up:<interaction-id>` task synchronized in one transaction. Record old/new follow-up time and action in audit logs; cancellation must require a reason and must not be undone by source reconciliation. Keep the sales queue visible and preserve idempotency.
- Continue product work in multiple connected code changes per launch. Do not begin broad tests/build/lint/CI or Bolt Preview during this implementation phase.

---
# PRODUCT BUILD UPDATE — 2026-11-05 — CUSTOMER 360 FOLLOW-UP TASKS AND LINKED NOTIFICATIONS

- Product-code SHA: `03cd108aad86c189be72c03a55ca0a05469ce49f`; branch: `main`.
- Added Customer 360 interaction recording/history using server-derived tenant and recorder, same-tenant customer validation, bounded typed input, append-only storage and audit.
- Scheduled interaction follow-up now creates one assigned operational task with due date and source lineage; task notifications use the existing notification engine.
- Operational source-event task creation now notifies compatible organization-role recipients once per task/event/profile; no-op assignments and source-upsert replays are quiet.
- Notifications now retain `ai_task` / task UUID destination metadata and provide a button to open the linked task in the existing TaskCenter, including target search after data load.
- Source commits: customer history/UI `7f8c79ce9a9a36ab42027cfee51537fd059311d1`; customer follow-up task migration `cba3fc3dcdf319ad7d650bc6cfc64c8591626b20`; Customer 360 handoff UI `78f8ecefdd7b897d78a0d8e326f8f6edacaf9bb1`; source event notifications `b412ad668908ecbcee1d89ca67dfa68c9af10c9a`; notification destinations `fd403ff4015355936fec8899ecae7be33461853f`; notification UI/data/navigation commits `f151674c607688f148b02ab79315999416d453da`, `648075edb4841708c1f1f0de59c87fc4b8cee9b7`, `6b0ebff9658d82e902b9d32f72cafbbd1773c29f`, `0d860e6e6bf183797e9a82fc733b780027df9312`, `f215ba4a57d9e214e538a0a755be80b353d3f0a6`, `48647cfcf55e6cd3cea7156b5612ed61f6029a8d`, `03cd108aad86c189be72c03a55ca0a05469ce49f`.
- No tests/build/lint/CI/Preview or database migration application was performed. All four new acceptance leaves remain `IMPLEMENTED_ON_MAIN / ACCEPTANCE_PENDING`.
- No Vercel tool, deployment, preview or credits were used. No live WhatsApp/email/push delivery is claimed.
- Next: `BODY-COMPLETION-ON-MAIN-005` — authenticated customer order lifecycle notifications linked to the authorized order detail view.

---

# LIVE EXECUTION CHECKPOINT — 2026-11-05 — TASK LIFECYCLE, BULK OPERATIONS AND ASSIGNEE NOTIFICATIONS

- Repository: `Report-Engainall/Nasr1`; branch: `main` only.
- Initial main for this implementation stream: `294f85c2a4eae8d9a32109684f8166872eacb44d`.
- Last recorded main head before this checkpoint update: `816c6ba961098678ed1d2769eabfe1bec9535aa9`.
- No feature branch was created. Application code, SQL migrations and the acceptance matrix are on the official `main` tree.

## Product capabilities added

### Operational task lifecycle
- Reassign or unassign a single open task with same-tenant active-user and task-role validation; row lock, idempotent no-op and old/new audit evidence.
- Change task priority and due date after creation; same-tenant manager authorization, row lock, input guard and persisted `manager_overrides` so source refresh will not silently revert an intentional manager decision.
- Edit title/description only for open manual tasks. The server rejects system-generated tasks that have source entity references; old/new values are audited.
- Cancel an open task only with a mandatory reason. The reason is stored in `resolution_note`, a `manager_cancellation` payload marker and the audit log.
- Explicit manager reopen clears the cancellation marker. The source reconciliation upsert preserves the marker and cancellation until this explicit reopen, avoiding accidental reactivation.
- Require a non-empty execution outcome (up to 1,000 characters) before task completion. The result is passed to the existing status RPC, stored in `resolution_note`, shown in task details and reused by the current print projection. The UI retains the typed result if persistence fails.

### Bulk task operations
- Atomic bulk reassignment/unassignment for up to 100 selected open tasks. The RPC rejects duplicate IDs and validates every task/assignee; deterministic row locks plus one transaction mean a bad member rolls back the complete batch. Audit is written per changed task; identical assignment replay is a no-op.
- Atomic bulk priority/deadline update for up to 100 selected open tasks. The user must choose an explicit new deadline (blank cannot silently clear existing dates); the manager override is stored and audit is recorded per changed task.
- The manager toolbar filters completed/cancelled tasks out of the bulk payload and uses responsive controls.

### Task assignment notifications
- `supabase/migrations/20261105120000_operational_task_assignment_notifications.sql` creates/aligns the notification contract used by the existing `fetchNotifications` UI, enables row-level security and adds a restrictive tenant/profile guard.
- A database trigger inserts one in-app notification when a task is created already assigned, assigned/reassigned to a different profile, or an unassigned task is first claimed. An unchanged assignment produces no new notification; source reconciliation without an assignee change does not create notification spam.
- Browser privileges are restricted to reading the fields consumed by the UI and updating `is_read`; direct client insert/delete and general update are revoked. The API now requests only `id, organization_id, profile_id, title, body, type, is_read, created_at`.

## Files added/updated

- New SQL:
  - `supabase/migrations/20261105100000_operational_task_reassignment.sql`
  - `supabase/migrations/20261105103000_operational_task_details_update.sql`
  - `supabase/migrations/20261105104500_manual_operational_task_edit.sql`
  - `supabase/migrations/20261105110000_operational_task_cancel_reason.sql`
  - `supabase/migrations/20261105113000_operational_task_bulk_assignment.sql`
  - `supabase/migrations/20261105114000_operational_task_reopen_cancel.sql`
  - `supabase/migrations/20261105115000_operational_task_bulk_details_update.sql`
  - `supabase/migrations/20261105120000_operational_task_assignment_notifications.sql`
- Updated application:
  - `src/components/TaskCenter.tsx`
  - `src/lib/api.ts`
  - `src/styles.css`
- Updated acceptance matrix:
  - `docs/bolt-source-reconciliation/REMAINING_SCREEN_ACCEPTANCE_MATRIX_2026-10-22.csv`
  - Rows now cover task lifecycle editing/cancellation/reopen, bulk reassignment, bulk priority/deadline, completion outcome and assignee notifications.

## Exact implementation status

- Source and SQL migrations are committed on `main`; this is implementation evidence, not runtime acceptance.
- No tests, build, lint, local PostgreSQL, Supabase, CI, Bolt Preview or end-to-end browser check was run in this stream. The owner's instruction is to prioritize the actual product body instead of spending this session in another broad test cycle.
- These SQL migrations have not yet been applied to a local, hosted or production database. No production data, tenant records, credentials or external storage were changed.
- The task leaves remain `IMPLEMENTED_ON_MAIN / ACCEPTANCE_PENDING`; no PASS, release GO or Bolt runtime claim is made.
- Lovable build/editor-preview/telemetry detachment remains from the earlier merged commits `b0a091e0a506da43a9b0d0dd0d1e9b992498ca63` and CI alignment `45ca19c47a985b2d12d23c846ba068222a4e17ce`. No Lovable dependency was reopened here. Bolt runtime remains deferred until practical product-body readiness.

## Bolt archive disposition

- Original archive found in the ChatGPT Library and materialized at `/mnt/data/project-bolt-github-8ccbjvhg (2).zip`.
- Outer SHA-256 verified as `db56924e7d629e480c96652ada8090f9605f466ccb773580446ce5b45cb09bc9`; ZIP listing contains 1,211 entries.
- The P3 dossier records 69/69 staged provenance files mapped to the existing integration ledger, inner CSV helper exact-matched, product-image helper superseded and legacy privileged migrations excluded. Archive checkpoint `3f33dba1d1879fc1426a2428e331b496c6241dae` is recorded as an ancestor of the reviewed main line.
- This session did not perform a new byte-for-byte comparison of all 1,211 archive entries against latest main. Do not claim complete entry-by-entry parity or overlay the historical ZIP over current NASR1.

## Next implementation action

- `NEXT_ACTION_ID: BODY-COMPLETION-ON-MAIN-004`.
- Move beyond the task center to the next source-level product gap in the customer/storefront/commerce domain. Start with the existing customer 360 interaction/history flow: inspect its current read contracts and customer detail entry point, then add a real tenant-scoped interaction record/write workflow that preserves customer privacy, appends audit evidence and displays the saved history. Do not begin with broad test execution.
- Continue with multiple connected product features per launch, preserving existing screens, SQL history, role controls, price privacy and business contracts. Keep Bolt import/Preview deferred until source/product work is practically ready.

---

# LIVE EXECUTION CHECKPOINT — 2026-11-05 — OPERATIONAL TASK LIFECYCLE PRODUCT BUILD

- Repository: `Report-Engainall/Nasr1`; branch: `main` only.
- Initial main for this work: `294f85c2a4eae8d9a32109684f8166872eacb44d`.
- Latest application-code cursor: `1206932ea38f25905ec07b29bb7655260730630c`.
- Matrix/checkpoint update cursor before this document refresh: `8f3349983cbe8f25bae8754163d574a4c1b9492a`.
- No branch was created. All work was written directly to the official main line.

## Product functionality implemented in this batch

1. **Reassign or unassign one existing open task**
   - Migration: `supabase/migrations/20261105100000_operational_task_reassignment.sql`.
   - RPC: `assign_operational_task(uuid,uuid)`.
   - Manager/admin only; derives actor and organization server-side, locks the task, rejects cross-tenant/closed tasks, validates that the assignee is active in the same organization and has a compatible role, and writes old/new assignment data to `audit_logs`. Returning to the role queue is supported. Exact no-op is not audited.

2. **Change priority and deadline after creation**
   - Migration: `supabase/migrations/20261105103000_operational_task_details_update.sql`.
   - RPC: `update_operational_task_details(uuid,text,timestamptz)`.
   - Manager/admin only; same-tenant row lock, open-task restriction, bounded priority values, idempotent no-op and audit evidence. The manager override is retained in `task_payload.manager_overrides` so a later source refresh does not revert the chosen priority/deadline.

3. **Edit the title and description of a manual task**
   - Migration: `supabase/migrations/20261105104500_manual_operational_task_edit.sql`.
   - RPC: `update_manual_operational_task(uuid,text,text)`.
   - Manager/admin only; validates title/description limits, edits only `manual_operational_task` records with no source entity, and rejects completed/cancelled tasks. Old/new text is audited. System-generated order, invoice, inventory and other source tasks remain read-only through this control.

4. **Cancel an open task with a mandatory reason and explicitly reopen it**
   - Migration: `supabase/migrations/20261105110000_operational_task_cancel_reason.sql`.
   - RPC: `cancel_operational_task(uuid,text)`.
   - Cancellation reason is stored in `resolution_note`, a `manager_cancellation` payload marker and `audit_logs`. The source upsert preserves that marker and cancellation state during later source reconciliation.
   - Migration: `supabase/migrations/20261105114000_operational_task_reopen_cancel.sql`.
   - The existing status RPC is replaced so an explicit manager reopen clears the cancellation marker and records that removal in the status audit. The UI exposes Reopen for cancelled and completed tasks.

5. **Atomic bulk reassignment of selected tasks**
   - Migration: `supabase/migrations/20261105113000_operational_task_bulk_assignment.sql`.
   - RPC: `assign_operational_tasks(uuid[],uuid)`.
   - Supports up to 100 distinct open task IDs, same-tenant active compatible assignee validation, deterministic row-lock order, all-or-nothing rollback if any task is missing/closed/incompatible, a per-changed-task audit row, and no-op replay handling. The UI sends selected open tasks only and can return them to their role queues.

6. **Require an execution outcome before task completion**
   - `src/components/TaskCenter.tsx` now opens an outcome editor before allowing completion. An empty result cannot be submitted; a result of up to 1,000 characters is passed through the existing status RPC into `resolution_note`, which is displayed in task details and the established print projection.
   - The UI keeps the entered result visible when the RPC fails; the draft closes only after a successful status update and reload.

## Application files changed

- `src/components/TaskCenter.tsx`: manager edit controls, manual-text editor, reasoned cancellation/reopen, selected-task bulk reassignment, and completion outcome capture.
- `src/lib/api.ts`: validated RPC wrappers for single assignment, bulk assignment, task-detail updates, manual-task text updates and reasoned cancellation. No direct browser write to `ai_tasks` was added.
- `src/styles.css`: responsive styles for the added controls.
- `docs/bolt-source-reconciliation/REMAINING_SCREEN_ACCEPTANCE_MATRIX_2026-10-22.csv`: added/updated the task lifecycle, bulk assignment and completion-outcome acceptance leaves.

## Evidence and limits — do not overstate

- The changes above were committed directly to `main`. The last application-code commit is `1206932ea38f25905ec07b29bb7655260730630c`; the matrix update commit is `8f3349983cbe8f25bae8754163d574a4c1b9492a`.
- No tests, build, lint, local PostgreSQL, Supabase, CI, Preview or Bolt runtime check was run in this implementation batch. The user explicitly prioritized implementing product features over repeated testing. Existing focused UI specs remain in the repository but are not reported as executed or PASS.
- The new SQL migrations have not been applied to a live or local database. No production data/schema, external credentials, tenant records or storage were changed.
- DLV-015 task leaves are marked implemented in source but **acceptance pending** until the relevant bounded runtime evidence is requested. No PASS or release readiness is claimed.
- This batch did not change the Lovable detachment or activate the Bolt handoff. Lovable source/build/preview/telemetry detachment remains in the earlier merged work (`b0a091e0a506da43a9b0d0dd0d1e9b992498ca63`, with CI alignment `45ca19c47a985b2d12d23c846ba068222a4e17ce`). Bolt runtime remains intentionally deferred until practical product-body readiness.

## Bolt archive disposition

- The original ZIP was located in the ChatGPT Library and materialized at `/mnt/data/project-bolt-github-8ccbjvhg (2).zip`.
- Verified outer SHA-256: `db56924e7d629e480c96652ada8090f9605f466ccb773580446ce5b45cb09bc9`; the ZIP contains 1,211 entries.
- The P3 dossier in the repository records 69/69 staged provenance files mapped to the existing integration ledger, the inner CSV helper as an exact target match, the product-image helper as superseded, and legacy privileged migrations as excluded. The recorded archive checkpoint `3f33dba1d1879fc1426a2428e331b496c6241dae` is an ancestor of the reviewed main line.
- This session did not perform a fresh byte-for-byte comparison of all 1,211 entries against the latest main tree. Do not claim entry-by-entry archive parity and do not copy the historical archive wholesale over newer NASR1 files. No secrets, `.env` files or old generated build output were imported.

## Next action — continue product implementation, not test loops

- `NEXT_ACTION_ID: BODY-COMPLETION-ON-MAIN-003`.
- Extend the operational-task workflow with tenant-scoped in-app notifications on task creation/assignment/reassignment and explicit role-queue return. Reuse the existing notifications contract only after inspecting its current schema and read path; notify only the intended profile/role audience, avoid duplicate notifications on no-op replay, and do not create trigger-driven notification spam from source reconciliation.
- After that, continue with the next genuinely incomplete storefront/customer/commerce feature from the live acceptance matrix. Keep the current rule: implement source/product functionality in batches; do not run broad test suites or Bolt Preview during this phase.

---

# LIVE EXECUTION CHECKPOINT — 2026-11-05 — OPERATIONAL TASK REASSIGNMENT + TASK DETAIL EDITS

- Repository: `Report-Engainall/Nasr1`; branch: `main` only.
- Source code/test cursor before this documentation batch: `5c6a2a5b170afa65de1456ca7204d74540302ddf`.
- Main before this checkpoint: `926d57faa7585eef193f4e816819b47e40eda865` (the matrix now records the new leaf).
- Starting main for this implementation batch: `294f85c2a4eae8d9a32109684f8166872eacb44d`.

## Product functionality added

1. `supabase/migrations/20261105100000_operational_task_reassignment.sql`
   - Adds `assign_operational_task(uuid,uuid)`.
   - Manager/admin only; derives the active organization and actor from the authenticated server context.
   - Locks the task row, checks the task belongs to the active organization and is not completed/cancelled.
   - Validates the target profile is active, authenticated, in the same organization and compatible with the task role.
   - Supports assigning or returning the task to its role queue; identical replay is a no-op; real changes write old/new assignment, role and status into `audit_logs`.
2. `supabase/migrations/20261105103000_operational_task_details_update.sql`
   - Adds `update_operational_task_details(uuid,text,timestamptz)`.
   - Manager/admin only; row-locks a same-tenant open task; validates priority; updates priority/deadline together; identical replay is a no-op; real changes are audited.
3. `src/lib/api.ts`
   - Adds validated wrappers `assignOperationalTask` and `updateOperationalTaskDetails`; no direct browser-side write to `ai_tasks`.
4. `src/components/TaskCenter.tsx`
   - Adds manager controls to reassign/unassign open tasks, edit priority and deadline after task creation, and reload the persisted task after each saved change.
   - Assignee options reuse the existing same-tenant active-user list and role-compatibility rule. Completed/cancelled tasks do not expose edit controls.
5. `src/styles.css`
   - Adds compact responsive controls for the manager task editing actions.
6. `src/test/task-center-ui.test.tsx`
   - Adds focused UI regression specs for compatible reassignment/unassignment and priority/deadline updates.

## Evidence boundary

- Direct-to-main source commits in this batch: migration `5b0b08f99d31bf37f7832dbf551691578b50071e`; API `4f65332d570c578640dba38b58de70b903ad41ba`; TaskCenter `a05f05f835793d4acf733fcff0cfd0b31be2c88d`; styles `cf3930a1cb4e803161ed56150cf79a92ce6db709`; focused test `68535c56ea3e433020af7ca3fde447f62448676a`; details migration `2941ef90c7ac3fc48c25130043a7cccac1f9b207`; API details `7556725dfef1b15582d8a33d4bc65cde670a8367`; TaskCenter details `369494b01ff440f54d3787aba151802fcd6c33bd`; styles `37b95385ac353aaabb16ed57faf6502405091c63`; focused details test `5c6a2a5b170afa65de1456ca7204d74540302ddf`.
- Acceptance row added: `DLV-015-OPERATIONAL-TASK-MANAGEMENT-EDIT-001`, explicitly `IMPLEMENTED_ON_MAIN; ACCEPTANCE_PENDING`.
- The focused unit/UI specs were added but not run in this session. The new SQL migrations were not applied to PostgreSQL/Bolt or production; no database, tenant, storage, secrets or production records were changed. No CI PASS is claimed.
- This batch deliberately did not rerun the historical broad test suite or Bolt Preview.

## Archive and platform disposition

- The original user archive was recovered from the ChatGPT Library and materialized as `/mnt/data/project-bolt-github-8ccbjvhg (2).zip`.
- SHA-256 verified locally: `db56924e7d629e480c96652ada8090f9605f466ccb773580446ce5b45cb09bc9`; ZIP listing contained 1,211 entries.
- The in-repository P3 dossier records 69/69 staged provenance files mapped to existing ledger decisions, identifies the inner CSV helper as an exact target match, the image helper as superseded, and old privileged migrations as excluded. The archive checkpoint `3f33dba1d1879fc1426a2428e331b496c6241dae` is recorded as an ancestor of the reviewed main line.
- This session did not perform a new byte-for-byte comparison of all 1,211 ZIP entries against current main, and did not import/copy the old ZIP over the repository. Therefore full entry-by-entry archive parity is not claimed. Continue only for a concrete unmatched archive item; never copy `.env`, old lockfiles, generated artifacts or stale configuration over current files.
- Lovable build/editor/preview/telemetry detachment remains integrated from `b0a091e0a506da43a9b0d0dd0d1e9b992498ca63` and CI alignment `45ca19c47a985b2d12d23c846ba068222a4e17ce`; this batch did not reopen or alter it.
- Bolt runtime remains intentionally deferred until practical product-body handoff readiness. No Bolt project, database, authentication, storage, server functions or Preview was provisioned or tested.

## Next action

- `NEXT_ACTION_ID: BODY-COMPLETION-ON-MAIN-002`.
- Extend the existing TaskCenter with manager-only editing of title and description for open **manual** tasks, preserving source-generated task text as read-only. Use one tenant-scoped, row-locked RPC; validate length and ownership; write old/new values to `audit_logs`; expose it through `src/lib/api.ts` and the existing task card; add a focused regression spec. Continue direct-to-main and update the same four central records. Do not run broad suites or Bolt tests as a substitute for product implementation.
\n---\n\n# NASR1 — execution history and verified delivery details

> This is the detailed chronological execution record, not the live resume cursor. The only current task pointer is [docs/bolt-source-reconciliation/CURRENT_EXECUTION_STATE.md](../bolt-source-reconciliation/CURRENT_EXECUTION_STATE.md). Historical `NEXT ACTION` entries below must not be used to resume.

## VERIFIED CODE CHECKPOINT — 2026-10-30 — exact main code SHA 5d3ed3c

- Repository: `Report-Engainall/Nasr1`; code SHA: `5d3ed3c032d957e8880c600506d9949234145236`; branch: `main` only.
- Implemented journal posting state guard in `supabase/migrations/20261030010000_general_journal_post_draft_only.sql`; acceptance in `scripts/test-database-migrations.mjs`. Customer-post denial/no-side-effect proof was added in `9061d6d`, corrected in `b96b7cd`, and rerun on the current code.
- Exact-head Core [40981597874 SUCCESS](https://github.com/Report-Engainall/Nasr1/actions/runs/40981597874); isolated PostgreSQL 17 [40981597786 SUCCESS](https://github.com/Report-Engainall/Nasr1/actions/runs/40981597786); local Supabase/Chromium P2 [40981598078 SUCCESS](https://github.com/Report-Engainall/Nasr1/actions/runs/40981598078); one-main cleanup [40981597789 SUCCESS](https://github.com/Report-Engainall/Nasr1/actions/runs/40981597789).
- Inventory artifact [12945281688](https://api.github.com/repos/Report-Engainall/Nasr1/actions/artifacts/12945281688/zip): 330 runtime functions, 330 matched, 0 unmatched, 174 migration files. The source map is not a semantic security pass for all functions.
- P2 proves local order/tenant, customer-return/credit-memo, print, Onyx XLSX, customer-manager privacy and device-session flows on exact code SHA. The separate hosted order/tenant job was `SKIPPED`; no hosted or production proof is claimed.
- Current acceptance remains partial for DLV-004, DLV-007, DLV-008, DLV-011 and DLV-015; the matrix contains 123 unique IDs and 18 DLV roll-ups, 0/18 fully release-closed. Global percentage is not computable.
- Production release: **NO-GO** while hosted E2E, live external integrations, production operations and owner approval remain unproven.

---

## HISTORICAL CHECKPOINT — 2026-10-30 — import rollback authorization test passed its focused step; latest-main verification pending

- **Focused proof:** test step 23, “Verify inventory import snapshot contract without implicit stock mutation,” completed SUCCESS in Core run 40974837711 on exact code SHA e68db07266c74c30cae36c9088c3ef993b4c9ac1: https://github.com/Report-Engainall/Nasr1/actions/runs/40974837711. That run's aggregate Core status was still IN_PROGRESS, and P2 run 40974837758 was CANCELLED when main advanced.
- **Latest main:** 2670bf7e69db2efe419cd386478b33e0b0656053 (includes the code SHA plus a separate PWA test commit). Current Core 40975098596 IN_PROGRESS with step 23 pending, P2 40975098653 PENDING, cleanup 40975098593 SUCCESS. Links: https://github.com/Report-Engainall/Nasr1/actions/runs/40975098596, https://github.com/Report-Engainall/Nasr1/actions/runs/40975098653, https://github.com/Report-Engainall/Nasr1/actions/runs/40975098593.
- **Test contract:** ordinary staff receives 42501; foreign-tenant manager receives opaque P0002 from public.rollback_import_snapshot; both denials preserve job status/error_summary/created_at, ready snapshot metadata, stored snapshot-row count and rollback audit count.
- **Development corrections:** the first candidate queried a nonexistent import_jobs.updated_at; the second correction exposed that expectFailure did not return the caught error. Both test-only causes were corrected; focused test step subsequently passed on e68.
- **Inventory:** retained artifact 12940762864, 330/330 runtime functions source-mapped across 173 migrations. No inventory regeneration.
- **Historical next action (superseded):** verify the rollback test on the latest main SHA and terminal Core/P2 checks; fix any concrete failure, then choose the next uncovered destructive RPC.
- **Release decision:** NO-GO until the overall required acceptance groups and external/production gates are evidenced.

---
## HISTORICAL CHECKPOINT — 2026-10-30 — import rollback authorization regression corrected; CI pending

- **Current code SHA:** e68db07266c74c30cae36c9088c3ef993b4c9ac1 — https://github.com/Report-Engainall/Nasr1/commit/e68db07266c74c30cae36c9088c3ef993b4c9ac1
- **Observed failure 1:** Core 40974044403 on 7bef9e1229e1c5ea814a5f1fdcc1448642fe0cce reported nonexistent import_jobs.updated_at; fixed to created_at in 7a28f88c73ec229be1d0455e6b4d3b48ab20110d.
- **Observed failure 2:** Core 40974514133 on 7a28f88c73ec229be1d0455e6b4d3b48ab20110d reached the intended staff denial but failed while reading error.code because the helper did not return the caught error; fixed in e68db07266c74c30cae36c9088c3ef993b4c9ac1.
- **Current candidate CI:** Core 40974837711 IN_PROGRESS (https://github.com/Report-Engainall/Nasr1/actions/runs/40974837711), P2 40974837758 PENDING (https://github.com/Report-Engainall/Nasr1/actions/runs/40974837758), cleanup 40974837686 SUCCESS (https://github.com/Report-Engainall/Nasr1/actions/runs/40974837686). Do not promote to TESTED_EXACT_SHA until terminal success.
- **Test:** ordinary staff must receive 42501; foreign-tenant manager opaque P0002; both denials preserve job status/metadata/created_at, ready snapshot metadata, stored row count and rollback audit count. Isolated PostgreSQL 17 only.
- **Inventory:** artifact 12940762864 retained; 330/330 runtime functions map to source across 173 migration files. No inventory regeneration.
- **Historical next action (superseded):** verify exact-SHA Core/P2 for e68db07266c74c30cae36c9088c3ef993b4c9ac1, fix any real failure, then choose next uncovered high-risk destructive RPC.
- **Release:** full production release remains NO-GO while hosted E2E, live integrations, production deploy/restore and owner sign-off are unproven.

---
## HISTORICAL CHECKPOINT — 2026-10-30 — rollback denial test corrected; exact-SHA CI pending

- **Corrected code SHA:** 7a28f88c73ec229be1d0455e6b4d3b48ab20110d — https://github.com/Report-Engainall/Nasr1/commit/7a28f88c73ec229be1d0455e6b4d3b48ab20110d
- **Failure and root cause:** code SHA 7bef9e1229e1c5ea814a5f1fdcc1448642fe0cce failed Core 40974044403 at the import-inventory snapshot acceptance because test helper snapshotImportRollbackBoundary queried import_jobs.updated_at, a column not present in that table. The test-only query is fixed to use created_at. No production schema or data was changed by this failure or fix.
- **Regression still being verified:** public.rollback_import_snapshot role/tenant denial (ordinary staff 42501; foreign-tenant manager opaque P0002) plus pre/post state comparison for job metadata/creation time, ready snapshot metadata, persisted rows and rollback audit.
- **Corrected candidate checks:** Core 40974514133 IN_PROGRESS, P2 40974514139 PENDING, cleanup 40974514142 SUCCESS on exact code SHA 7a28f88c73ec229be1d0455e6b4d3b48ab20110d. URLs: https://github.com/Report-Engainall/Nasr1/actions/runs/40974514133, https://github.com/Report-Engainall/Nasr1/actions/runs/40974514139, https://github.com/Report-Engainall/Nasr1/actions/runs/40974514142.
- **Inventory:** retained artifact 12940762864 remains the source list; 330/330 functions source-mapped across 173 migration files. No inventory regeneration was performed.
- **Historical next action (superseded):** check corrected exact-SHA Core/P2 terminal states, repair the first concrete failure, then select the next uncovered high-risk destructive RPC.
- **Release decision:** full production release remains NO-GO while hosted customer/order/tenant E2E, live external integrations, production deploy/restore and owner sign-off are unproven.

---
## HISTORICAL CHECKPOINT — 2026-10-30 — purchase-order cancellation verified; cash-expense void authorization pending

- **Base SHA:** 14e9cb703846708419c47ade22aa54ac3c7cdffd.
- **Purchase-order cancellation proof:** Core 40972096292 SUCCESS on d8735de8f2cbb58df2d8e68c5452f972ae0df091, 35/35 steps including PostgreSQL 17: https://github.com/Report-Engainall/Nasr1/actions/runs/40972096292. Ordinary staff receives SQLSTATE 42501; foreign-tenant manager gets opaque 42501; order/cancellation fields, audit, receipts, movements and on-hand quantity remain unchanged.
- **Previous-head checks:** on 863ccb5ab2362e65429c1ee5419e9be67416adbb, Core 40972415594 SUCCESS 35/35, P2 40972415377 SUCCESS (public UI smoke and local Supabase persistence/tenant checks), cleanup 40972415421 SUCCESS. Hosted customer/order/tenant E2E remained SKIPPED.
- **New code commit:** 14e9cb703846708419c47ade22aa54ac3c7cdffd adds AGH-CASH-EXPENSE-VOID-SECURITY-001 in scripts/test-cash-expense-journal-posting.mjs. A same-tenant customer must be rejected with SQLSTATE 42501; a manager in another tenant must receive opaque P0002. Each rejection is followed by comparison of source status, void actor/time/reason/update time, cash_expense.voided audit count and accounting source-posting count to the pre-attempt state. Existing successful post/void concurrency and compensating reversal checks remain.
- **Current candidate CI:** Core 40973093903 IN_PROGRESS; P2 40973094057 IN_PROGRESS; cleanup 40973093914 SUCCESS. Results are not yet final on this SHA.
- **Earlier server proofs:** cancel_stock_count TESTED_EXACT_SHA on c5 via Core 40971449141 SUCCESS; cancel_purchase_order TESTED_EXACT_SHA on d873 via Core 40972096292 SUCCESS. DLV-007 and DLV-008 remain PARTIAL.
- **Print/export:** unnamed customer selector/PDF fallback and targeted authorization/tenant checks passed on c9838d8; full role/template PDF/XLSX/print matrix remains OPEN.
- **RPC inventory:** retain artifact 12940762864: https://github.com/Report-Engainall/Nasr1/actions/artifacts/12940762864. Source mapping is not semantic security proof.
- **Historical next action (superseded):** publish this checkpoint only if main remains at the base; verify Core/P2 on the exact resulting SHA for cash-expense denials. Hosted E2E, live integrations, production operations and owner sign-off are unproven; release remains NO-GO.

---

## HISTORICAL CHECKPOINT — 2026-10-30 — stock-count boundary verified; purchase-order cancellation next

- **Latest verified Core SHA:** `c5e35963dcb8afa1d04eb692a89ef6bc25e25d84`; Core [40971449141 SUCCESS](https://github.com/Report-Engainall/Nasr1/actions/runs/40971449141), 35/35 steps. The run includes the isolated PostgreSQL 17 stock-count start/cancel audit test (step 20 SUCCESS), lint, build, production preview smoke, dev server smoke and browser price acceptance. It proves the tested cancellation-denial scenarios only; it does not close the whole inventory lifecycle.
- **P2 on c5:** [40971449064](https://github.com/Report-Engainall/Nasr1/actions/runs/40971449064) public smoke SUCCESS, authenticated infrastructure gate SUCCESS, hosted customer/order/tenant E2E SKIPPED, local Supabase authenticated test still IN_PROGRESS when last observed (credit memo/return scenario). Cleanup [40971449096](https://github.com/Report-Engainall/Nasr1/actions/runs/40971449096) SUCCESS.
- **Current main at next change base:** `e4d2209bf67952aecf8b6e24d9cb12b0f5a1fb5e`; a separate P1 commit added a real keyboard-only login/focus/password-visibility E2E and visible focus styling. Core [40971739122](https://github.com/Report-Engainall/Nasr1/actions/runs/40971739122) was IN_PROGRESS and cleanup [40971739048](https://github.com/Report-Engainall/Nasr1/actions/runs/40971739048) SUCCESS at checkpoint time. Keep that UI code untouched in P2's DB test change.
- **New server-side test:** `scripts/test-database-migrations.mjs` now tests `cancel_purchase_order` for same-tenant ordinary staff (expect SQLSTATE `42501`) and a valid manager from another tenant (expect opaque SQLSTATE `42501`, “purchase order is not available in this organization”). A rejected cancellation must leave the draft status, cancelled actor/time/reason unchanged; create no cancellation audit, receipt or purchase-order movement; and leave on-hand quantity unchanged. An authorized admin cancellation follows the denials to retain positive-path coverage. This is IMPLEMENTED, not TESTED_EXACT_SHA until its new Core test run finishes.
- **Earlier security proof:** `cancel_stock_count` denial/no-side-effect regression is TESTED_EXACT_SHA on c5 using Core's isolated PostgreSQL 17 step 20. DLV-007 remains PARTIAL.
- **Finance/print reconciliation:** unnamed-customer selector/PDF fallback, admin/manager/accountant permissions, ordinary-staff/customer denial, and foreign-tenant isolation already existed and passed Core on c9838d8 (run [40945751611](https://github.com/Report-Engainall/Nasr1/actions/runs/40945751611)). DLV-011 remains OPEN for the full role/template PDF/XLSX/print output matrix and hosted journey proof.
- **Existing inventory:** RPC source artifact [12929127056](https://api.github.com/repos/Report-Engainall/Nasr1/actions/artifacts/12929127056/zip) maps 330/330 functions across 173 migrations; this does not establish semantic authorization proof.
- **Acceptance now:** DLV-007 PARTIAL; DLV-008 PARTIAL; DLV-011 OPEN; DLV-015 PARTIAL. Hosted E2E, Onyx, WhatsApp, live AI, production operations and owner release approval remain unproven. Release NO-GO.
- **Historical next action (superseded):** run Core on the exact new candidate and verify the purchase-order cancellation denials; get P2 and cleanup terminal results on the exact SHA. Then pick one next untested destructive RPC from the existing inventory.

---

## HISTORICAL CHECKPOINT — 2026-10-30 — stock-count cancellation security boundary (candidate verification pending)

- **Repository/branch:** `Report-Engainall/Nasr1` / `main` only.
- **Base SHA observed before the corrective batch:** `97213c3e0a9348d40ee30906eda75bfe020baec4`; no results transfer to the candidate commit.
- **Checks on the base SHA at capture:** Aghbari Core [40970923425](https://github.com/Report-Engainall/Nasr1/actions/runs/40970923425) was IN_PROGRESS, having reached browser price-visibility smoke; P2 [40970923415](https://github.com/Report-Engainall/Nasr1/actions/runs/40970923415) was IN_PROGRESS in local Supabase acceptance; cleanup [40970923398](https://github.com/Report-Engainall/Nasr1/actions/runs/40970923398) was SUCCESS. A previous base, 73089ef, failed one new offline partial-persistence unit test; commit 97213 updates that test to use `Storage.prototype`, a stale timestamp fixture and an assertion that the freshness-marker write occurs. The 97213 run has not yet been treated as terminal at this checkpoint.
- **New server-security acceptance:** candidate `97d78a52019212455a621b1a8121bb143128bb96` extends `scripts/test-stock-count-start-audit.mjs`. It tests that same-tenant ordinary staff receives SQLSTATE `42501`, and a foreign-tenant manager receives opaque SQLSTATE `22023`, when cancelling another tenant’s open stock count. Both rejected requests must leave session status/cancellation fields, cancellation-audit rows and inventory-movement rows unchanged. The original authorized cancellation remains tested and the whole test transaction rolls back. Status: IMPLEMENTED, exact-SHA verification pending.
- **Reconciliation correction:** the runtime tests for unnamed finance selector/PDF fallback (`عميل غير مسمى`), admin/manager/accountant access, ordinary-staff/customer denial and foreign-tenant isolation already exist in `scripts/test-database-migrations.mjs` and ran on c9838d8’s full Core SUCCESS. The stale DLV-011 next action has been removed; do not repeat those tests without a regression.
- **Last fully verified code SHA:** `c9838d8ced1869b2fdbeee735160197edc81a16b`; Core [40945751611 SUCCESS](https://github.com/Report-Engainall/Nasr1/actions/runs/40945751611), import-finalizer [40945751576 SUCCESS](https://github.com/Report-Engainall/Nasr1/actions/runs/40945751576), cleanup [40945751427 SUCCESS](https://github.com/Report-Engainall/Nasr1/actions/runs/40945751427). RPC inventory [artifact 12929127056](https://api.github.com/repos/Report-Engainall/Nasr1/actions/artifacts/12929127056/zip) contains 330/330 source matches across 173 migrations; it is not a semantic-security pass.
- **Acceptance:** DLV-007 PARTIAL; DLV-008 PARTIAL; DLV-011 OPEN (targeted runtime selector authorization tests already present; full output/template matrix remains open); DLV-015 PARTIAL (cancellation-denial acceptance awaits exact candidate CI). Hosted authenticated E2E, real Onyx/WhatsApp/AI, production operations and owner approval remain unproven. Release stays NO-GO.
- **Historical next action (superseded):** verify current base workflow terminal results; publish the prepared candidate only if main still matches its expected parent; then use exact candidate Actions to prove the new DB regression before changing status to TESTED_EXACT_SHA.

---

## HISTORICAL CHECKPOINT — 2026-10-29 (purchase receipt concurrency diagnostics repaired; exact-head CI green)

**Repository:** `Report-Engainall/Nasr1`  
**Integration branch:** `main` only  
**Code/test SHA:** `c9838d8ced1869b2fdbeee735160197edc81a16b`  
**Code/test commit:** [c9838d8](https://github.com/Report-Engainall/Nasr1/commit/c9838d8ced1869b2fdbeee735160197edc81a16b)  
**Aghbari Commerce checks:** [run 40945751611](https://github.com/Report-Engainall/Nasr1/actions/runs/40945751611) — `SUCCESS`, **35/35 steps**, exact SHA c9838d8.  
**Independent PostgreSQL 17 import-finalizer tenant-scope check:** [run 40945751576](https://github.com/Report-Engainall/Nasr1/actions/runs/40945751576) — `SUCCESS`, 14/14 steps, exact SHA c9838d8.  
**One-main-branch cleanup:** [run 40945751427](https://github.com/Report-Engainall/Nasr1/actions/runs/40945751427) — `SUCCESS`, 6/6 steps, exact SHA c9838d8.  
**Latest test output:** 214/214 unit-test files passed; PostgreSQL 17 migration/core acceptance, inventory-transfer race, stock-count balance-set guard, inventory write boundary, purchase-receipt accounting, backup/restore, lint/build, and smoke/browser steps finished successfully.  
**Exact-SHA RPC inventory:** [artifact 12929127056](https://api.github.com/repos/Report-Engainall/Nasr1/actions/artifacts/12929127056/zip) — 330 functions, 330 source-matched, 0 unmatched across 173 migrations. Matching source definitions is not a substitute for semantic authorization proof.

### New work completed and verified

1. **Fixed a real CI diagnostic defect in the purchase-receipt concurrency test** (`scripts/test-database-migrations.mjs`). Earlier run [40945078735](https://github.com/Report-Engainall/Nasr1/actions/runs/40945078735) failed only after the receipt-race monitor missed both lock waits within three seconds; its error branch passed the aggregate `Promise.all(...)` Promise to `Promise.allSettled`, hiding the actual contention state behind `TypeError: object is not iterable`. Commit c9838d8 retains each of the two RPC promises, expands the bounded observation window to ten seconds, and settles each promise independently during diagnostics/cleanup. The exact-head PostgreSQL workflow now completes `SUCCESS`; the concurrency assertion is still enforced, not skipped.
2. **Added the purchase receipt accounting acceptance to CI** in [commit 94791b2](https://github.com/Report-Engainall/Nasr1/commit/94791b2c0dfd96c3e0d636afac7618100a4ed2a9). The previously existing `scripts/test-purchase-receipt-accounting.mjs` was not run by `test:db` or the workflow. It now runs as a separate PostgreSQL 17 step and passed on SHA c9838d8: source-backed cost only, YER policy, balanced inventory/AP draft, durable source link, idempotent replay, customer denial, direct-write denial and unknown-cost rejection.
3. **Stock transfer and stock-count concurrency evidence is green on c9838d8.** PostgreSQL acceptance reports that exactly one competing single/batch transfer wins, reservations are conserved, failed paths leave no partial rows/movements and exactly one audit event persists. The balance-set guard rejects a newly created post-snapshot balance without movement/completion audit; physical stock count idempotency, audited variance and stale-balance rejection also pass.
4. **Previously fixed finance-document issues remain covered:** statement payloads fail closed when invoice/payment arrays are missing; invoice/credit-memo selector labels and credit-memo output do not fall back to internal customer UUIDs. Their code/test implementation remains in [66ed055](https://github.com/Report-Engainall/Nasr1/commit/66ed055031f8fa9f6d1da0ab2ebe0a996f849221) and [cc02dbf](https://github.com/Report-Engainall/Nasr1/commit/cc02dbf47e518e38f04516857a05274f2d460af6), and passed within the full c9838d8 run.

### Acceptance / release state — do not overstate

- The existing central matrix still has **122 populated task IDs, 18 DLV roll-up groups, and 0/18 fully release-closed groups**. An overall completion percentage is not computable from available evidence.
- `DLV-005`: tested server-side price privacy and membership-revocation race remain green; hosted authenticated tier/session journeys are still open.
- `DLV-007`: stock-count balance-set and single/batch transfer races, inventory write boundaries, and purchase receipt accounting passed. Full stock reservation/movement lifecycle and Onyx target integration are not closed.
- `DLV-008`: focused statement payload and finance-print privacy fixes passed; full ledger/payment/credit reconciliation and role-specific outputs remain partial.
- `DLV-009`: local import/export contract checks pass; a real Onyx Pro target round-trip is still `BLOCKED_EXTERNAL` until the target version, credentials and authorized test tenant are available.
- `DLV-011`: specific PDF payload and UUID-label defects are fixed and tested; complete role-by-template PDF/XLSX/print acceptance and hosted authenticated output journeys remain open.
- `DLV-015`: 330/330 runtime RPC functions match migration source on c9838d8; semantic role/tenant/no-side-effect/idempotency evidence is not complete for every callable function.
- Official WhatsApp delivery receipts, live AI provider operation, hosted production journeys, production deployment/rollback/restore and owner approval are not proven by this code CI. Release stays NO-GO until those real gates are closed or explicitly excluded under the approved pilot policy.

### HISTORICAL NEXT ACTION — superseded by CURRENT_EXECUTION_STATE.md
1. This checkpoint update is documentation-only and will create a new `main` SHA. Verify the Aghbari workflow triggered by that exact checkpoint SHA; do not transfer c9838d8 results to another SHA without checking its own run.
2. Then close a specific remaining `DLV-011` runtime gap: extend PostgreSQL acceptance for `get_finance_document_print_options` to prove the invoice/credit-memo selector uses `عميل غير مسمى` for a customer lacking printable business/contact names, and proves an ordinary customer or foreign-tenant request cannot obtain those staff selector values. Keep `DLV-011` open until every applicable role/template path has evidence.
3. Do not repeat the already-passing purchase receipt accounting, transfer-race, stock-count balance-set, membership-revocation, statement missing-array, or credit-memo UUID-renderer tests unless a future code change affects them.

---

## HISTORICAL CHECKPOINT — 2026-10-29 (exact-head price-race, returns, RPC inventory and finance-print privacy passed)

**Repository:** `Report-Engainall/Nasr1`  
**Integration branch:** `main` only  
**Current documentation HEAD before this checkpoint:** `7445f9ddfd070001927fea8409cfb97d0920b99e`  
**Last full tested code SHA:** `cc02dbf47e518e38f04516857a05274f2d460af6` — [code commit](https://github.com/Report-Engainall/Nasr1/commit/cc02dbf47e518e38f04516857a05274f2d460af6)  
**Exact-head Aghbari checks on code SHA cc02dbf:** [run 40944042923](https://github.com/Report-Engainall/Nasr1/actions/runs/40944042923) `SUCCESS`.  
**PostgreSQL 17 import-finalizer tenant-scope check:** [run 40944042900](https://github.com/Report-Engainall/Nasr1/actions/runs/40944042900) `SUCCESS` on the same code SHA.  
**One-main-branch cleanup:** [run 40944042710](https://github.com/Report-Engainall/Nasr1/actions/runs/40944042710) `SUCCESS` on the same code SHA.  
**Aghbari checks for documentation-only HEAD 7445f9d:** [run 40944598797](https://github.com/Report-Engainall/Nasr1/actions/runs/40944598797) was `COMPLETED / SUCCESS` at checkpoint capture; do not assume a terminal result until it is observed.

### Exact-head evidence captured from run 40944042923

- Unit tests: **214/214 test files passed; 1,395/1,395 tests passed**.
- PostgreSQL 17 migrations/core acceptance completed successfully. The price visibility script recorded:
  - `PASS storefront price/revocation race`: a price request blocked on the customer row lock was denied after the owner committed membership revocation; no price rows were returned.
  - `PASS customer price privacy`: hidden payloads, live-session revocation, tenant-bound membership tier, capability-scoped previews, authorized settings and base-price boundaries passed.
  - `PASS customer returns`: tenant ownership, idempotent replay/conflict, direct-write denial, customer privacy, manager decisions/audit, customer-freeze race denial, finance-member statement scope, invoice PDF/cart-pricing post-revocation denial, warehouse task and no automatic stock movement passed.
- The exact-SHA runtime RPC inventory reported **330 functions, 330 source-matched, 0 unmatched across 173 migration files**. Artifact: [public-rpc-function-inventory-cc02dbf](https://api.github.com/repos/Report-Engainall/Nasr1/actions/artifacts/12927523765/zip). Inventory matching is not semantic authorization proof.
- Lint, build, production-preview and dev-server smoke tests, plus browser price-visibility acceptance, passed on code SHA cc02dbf.
- These are candidate-specific local/CI results, not hosted production UAT. Never transfer these results to a different SHA as if it had its own terminal green run.

### Implementation now evidenced

1. Statement PDF payload validation (commit [66ed055](https://github.com/Report-Engainall/Nasr1/commit/66ed055031f8fa9f6d1da0ab2ebe0a996f849221)) now rejects missing/non-array `invoices` and `payments` rather than generating a misleading blank statement. The exact code SHA run 40943206938 and subsequent code-bearing SHA cc02dbf both passed; legitimate empty arrays remain allowed.
2. Finance invoice/credit-memo selectors and credit-memo PDFs now use `عميل غير مسمى` instead of internal customer UUIDs when printable business/contact names are absent. This is implemented in forward migration `20261029270000_staff_finance_print_customer_uuid_label_guard.sql` and renderer guard/tests in commit [cc02dbf](https://github.com/Report-Engainall/Nasr1/commit/cc02dbf47e518e38f04516857a05274f2d460af6). Historical migrations were left unchanged.
3. Warehouse return receipt print snapshots are now tested through the whole migration/script suite on code SHA cc02dbf. The focused acceptance in `scripts/test-customer-returns.mjs` checks the persisted snapshot allowlist, denies foreign-tenant/ordinary-customer access, excludes internal IDs, and retains print-history paging and bounds.

### Release / acceptance state

- The central matrix currently has 122 populated task IDs, 18 DLV roll-up groups, and 0/18 fully release-closed groups. Overall completion percentage remains not computable from the available evidence.
- `DLV-005`: the two-connection membership-revocation race and hidden-price/live-session boundaries are now `CI_SUCCESS_EXACT_SHA` on cc02dbf. Complete hosted authenticated user/tier/session journeys remain open.
- `DLV-007`: return-receipt snapshot and assigned-warehouse/privacy checks have exact-SHA database/component evidence; stock reservation/movement/transfer lifecycle is still partial.
- `DLV-008`: incomplete statement payload rejection and finance document privacy fixes passed, but the complete ledger/payment/credit reconciliation and role coverage remain partial.
- `DLV-011`: these two concrete document defects are fixed and tested; the complete role-by-template PDF/XLSX/print matrix and hosted authenticated output journeys remain OPEN.
- `DLV-015`: callable RPC inventory is fully source-matched for this candidate; semantic auth/tenant/idempotency review is still PARTIAL.
- Actual Onyx Pro target round-trip, official WhatsApp receipt, live AI-provider operation, hosted authenticated production journeys, deployment/rollback/restore evidence, and owner approval remain external release gates. No live-provider success is claimed.

### HISTORICAL NEXT ACTION — superseded by CURRENT_EXECUTION_STATE.md
1. Resolve current-main Aghbari run [40944598797](https://github.com/Report-Engainall/Nasr1/actions/runs/40944598797) for exact docs HEAD 7445f9ddfd070001927fea8409cfb97d0920b99e; record its terminal outcome without transferring cc02dbf's result.
2. After current-head validation, continue the next *unproven* callable authorization boundary from `DLV-015` or the remaining stock movement/reservation lifecycle in `DLV-007`, not another generic review. Do not repeat the already-passing price race, return receipt snapshot, finance-PDF payload, or UUID-label fixes.

---

## HISTORICAL CHECKPOINT — 2026-10-29 (statement payload fail-closed + finance-print UUID privacy)

**Repository:** `Report-Engainall/Nasr1`  
**Integration branch:** `main` only  
**Code candidate SHA:** `cc02dbf47e518e38f04516857a05274f2d460af6`  
**Code commit:** [cc02dbf](https://github.com/Report-Engainall/Nasr1/commit/cc02dbf47e518e38f04516857a05274f2d460af6)  
**Previous focused PDF fix:** [66ed055](https://github.com/Report-Engainall/Nasr1/commit/66ed055031f8fa9f6d1da0ab2ebe0a996f849221)  
**Exact-head Aghbari checks for code SHA cc02dbf:** [run 40944042923](https://github.com/Report-Engainall/Nasr1/actions/runs/40944042923) was `IN_PROGRESS` at checkpoint capture; no pass is claimed.  
**Independent PostgreSQL 17 import-finalizer test:** [run 40944042900](https://github.com/Report-Engainall/Nasr1/actions/runs/40944042900) `SUCCESS` on exact SHA `cc02dbf47e518e38f04516857a05274f2d460af6`.  
**One-main-branch cleanup:** [run 40944042710](https://github.com/Report-Engainall/Nasr1/actions/runs/40944042710) `SUCCESS` on the same exact SHA.

### Code changes now on main

1. `src/lib/finance-document-pdf.ts` now fails closed when a statement RPC payload omits/non-array `invoices` or `payments`; genuinely empty arrays remain valid. Regression coverage is in `src/lib/finance-document-pdf.test.ts`. Exact-head Aghbari run `40943206938` for code SHA `66ed055031f8fa9f6d1da0ab2ebe0a996f849221` is `SUCCESS`; the subsequent docs-only candidate `88b7b082730dc26bd1464d283d861343cb681f60` also passed [run 40943394868](https://github.com/Report-Engainall/Nasr1/actions/runs/40943394868).
2. New forward migration `supabase/migrations/20261029270000_staff_finance_print_customer_uuid_label_guard.sql` replaces three internal-UUID display fallbacks in finance invoice/memo selectors and credit-memo PDFs with `عميل غير مسمى`, preserving role/tenant checks, row reconciliation, reversal evidence, and authenticated execute grants. Historical migrations are unchanged.
3. `src/lib/finance-document-print.ts` adds a renderer-level guard so stale/legacy credit-memo payloads cannot print a UUID as the customer name. `src/test/finance-document-print.test.ts` and new `src/test/finance-document-print-migration.test.ts` cover the behavior and migration security contract.
4. The exact-head workflow on SHA cc02dbf is running unit tests and has not yet produced a terminal Aghbari result. Do not transfer success from SHA 66ed055 or 88b7b08 to cc02dbf.

### Acceptance state

- Central matrix refreshed from the existing 122 populated task IDs, 18 delivery groups, and 0/18 fully release-closed groups. An overall completion percentage remains not computable from current evidence.
- `DLV-008` remains PARTIAL: statement output now rejects incomplete arrays, but complete ledger/payment/credit reconciliation and role coverage remain open.
- `DLV-011` remains OPEN: two specific UUID/payload defects are addressed; full role-by-template PDF/XLSX/print acceptance and hosted authenticated output journeys remain incomplete.
- `DLV-005` remains PARTIAL and `DLV-015` remains PARTIAL: server-selected tier/hidden-price membership revocation and callable-RPC semantic coverage still need exact-candidate evidence. The current Aghbari workflow must finish before its result is used.
- Return receipt reprint code and assigned-warehouse authorization assertions passed on exact SHA `0ead2b082439944403616793c611a4f8859ca5fd` in [run 40942315137](https://github.com/Report-Engainall/Nasr1/actions/runs/40942315137); the latest overall CI for cc02dbf is still pending, so this checkpoint does not close the entire return/print roll-up.
- Full release remains NO-GO while live Onyx Pro round-trip, official WhatsApp delivery receipts, production AI provider operation, hosted authenticated E2E, deployment/rollback/restore proof and owner approval remain unevidenced.

### HISTORICAL NEXT ACTION — superseded by CURRENT_EXECUTION_STATE.md
1. Resolve [Aghbari run 40944042923](https://github.com/Report-Engainall/Nasr1/actions/runs/40944042923) for exact SHA `cc02dbf47e518e38f04516857a05274f2d460af6`; inspect and repair only a concrete failed step if one appears.
2. When the test result is available, record the actual terminal result against that SHA, then continue the next uncovered direct RPC authorization boundary in `DLV-005`/`DLV-015` or remaining role-template gap in `DLV-011`. Do not rebuild reports, receipt printing, or already-implemented finance PDF engines.

---

## HISTORICAL CHECKPOINT — 2026-10-29 (statement PDF rejects incomplete RPC payloads)

**Repository:** `Report-Engainall/Nasr1`  
**Integration branch:** `main` only  
**Previous main SHA:** `0ead2b082439944403616793c611a4f8859ca5fd`  
**Current code/test candidate SHA:** `66ed055031f8fa9f6d1da0ab2ebe0a996f849221`  
**Implementation commit:** [66ed055](https://github.com/Report-Engainall/Nasr1/commit/66ed055031f8fa9f6d1da0ab2ebe0a996f849221)  
**Exact-head Aghbari Commerce checks:** [run 40943206938](https://github.com/Report-Engainall/Nasr1/actions/runs/40943206938) was `IN_PROGRESS` when this checkpoint was prepared. No terminal result is asserted.  
**One-main-branch cleanup:** [run 40943206818](https://github.com/Report-Engainall/Nasr1/actions/runs/40943206818) `SUCCESS` on the exact candidate SHA.

### Implementation delta

- `src/lib/finance-document-pdf.ts`: `buildCustomerStatementPdf` now rejects a missing/non-array `invoices` or `payments` field instead of silently substituting an empty list and potentially generating a misleading blank account-statement PDF. Explicit empty arrays remain valid for a genuinely empty account. The legacy optional `credits` field remains backward-compatible.
- `src/lib/finance-document-pdf.test.ts`: added regression assertions for both missing required arrays.
- The change is directly tied to `DLV-011` (document field/payload acceptance) and `DLV-008` (source-authoritative financial statement output). It does not close either roll-up.

### Evidence and acceptance state

- The preceding exact-main candidate `0ead2b082439944403616793c611a4f8859ca5fd` completed [Aghbari run 40942315137](https://github.com/Report-Engainall/Nasr1/actions/runs/40942315137) with `SUCCESS`; this includes the corrected assigned-warehouse return-receipt authorization assertions.
- The new PDF fix and test are committed on `66ed055031f8fa9f6d1da0ab2ebe0a996f849221`; its own Aghbari run is pending/in progress. No test outcome is transferred from another SHA.
- The central acceptance matrix currently contains 122 unique populated task IDs, 18 delivery groups, and 0/18 fully release-closed groups. An overall completion percentage remains not computable until all required specification leaves are mapped to candidate-specific evidence.
- `RET-PRINT-001` and `DLV-011` remain open pending the current exact-head result and the remaining role/template coverage. Full production release remains NO-GO: live Onyx Pro round-trip, official WhatsApp receipts, live AI operation, production deployment/rollback/restore, hosted authenticated customer/tenant journeys, and owner approval are not evidenced by this commit.

### HISTORICAL NEXT ACTION — superseded by CURRENT_EXECUTION_STATE.md
1. Read the terminal result for [Aghbari run 40943206938](https://github.com/Report-Engainall/Nasr1/actions/runs/40943206938), which targets exactly `66ed055031f8fa9f6d1da0ab2ebe0a996f849221`. If it fails, inspect the failed job and fix only the demonstrated cause; otherwise record this focused PDF contract fix as tested without closing the full document/security roll-up.
2. Then continue on `main` to the next uncovered role/template output or server-side authorization boundary in `DLV-011`/`DLV-015`. Do not rebuild previously implemented finance PDFs, export engines, receipt printing, or executive XLSX reports.

---

## HISTORICAL CHECKPOINT — 2026-10-29 (warehouse return receipt reprints read persisted evidence)

**Repository:** `Report-Engainall/Nasr1`  
**Execution branch:** `main` only  
**Code/test candidate before this documentation commit:** `22516e095f9788360f0b2f27c96b38c7d69ea862`  
**CI status:** Aghbari Commerce checks for that candidate were queued when this checkpoint was prepared. No terminal test result is claimed for the new receipt-print path.

### Implementation completed

- Added migration `supabase/migrations/20261029190000_customer_return_receipt_print_snapshot.sql`, defining `public.get_customer_return_receipt_print_data(uuid)`. It derives the tenant and actor from the live server identity, requires the operational manager/admin capability, and returns a fixed allowlist built from the persisted receipt header and receipt-item snapshots. It omits receipt, tenant, warehouse, product and line UUIDs and has no cost/margin output fields.
- Updated `src/components/CustomerReturnReceiptQueue.tsx`: after `receive_customer_return` confirms persistence, the component fetches the canonical print snapshot by the receipt ID, validates its line/summary totals against the mutation acknowledgement, and prints only the loaded snapshot. If snapshot loading fails after the mutation has committed, the UI explicitly says that the receipt **was saved** but its printable copy could not be loaded; it preserves the same idempotency key/draft for a safe retry instead of claiming the write failed or creating a new key.
- Updated `src/lib/customer-return-receipts.ts` with a strict allowlist parser for the persisted snapshot. It checks line count, per-line restockable/defective partition, aggregate totals and date validity before enabling print.
- Added focused unit coverage in `src/test/customer-return-receipts.test.ts`, component coverage in `src/test/customer-return-receipt-queue.test.tsx`, and PostgreSQL authorization/privacy assertions in `scripts/test-customer-returns.mjs`. The database acceptance checks snapshot fields and quantities, asserts private IDs and finance fields are absent, rejects mismatched/nonexistent records, and confirms ordinary customers cannot call the staff receipt-print RPC.
- Kept the previously applied financial print fix: when customer display names and business code are absent, invoice/account-statement print uses `عميل غير مسمى`, not the internal UUID. Its regression covers both artifacts.

### Acceptance state

- New matrix row: `RET-PRINT-001` — implementation and test coverage added; exact-candidate CI is pending. Do not mark it closed until its run is terminal SUCCESS.
- `DLV-007` remains **PARTIAL**: receipt reprint evidence is now server-persisted, but inventory/reservation/transfer lifecycle and actual Onyx Pro target round-trip remain open.
- `DLV-011` remains **OPEN**: the receipt snapshot path and UUID fallback gap are addressed, but the complete role-by-template PDF/XLSX/print allowlist and hosted authenticated journeys remain incomplete.
- `DLV-005` remains **PARTIAL**. Delivery groups remain **0/18 fully release-closed**. The matrix now has **122 populated unique IDs**, and a global completion percentage remains uncomputed.
- Full production release remains **NO-GO** pending hosted authenticated E2E, actual Onyx Pro round-trip, official WhatsApp delivery receipts, live AI-provider operation, production deploy/rollback/restore evidence and owner approval.

### HISTORICAL NEXT ACTION — superseded by CURRENT_EXECUTION_STATE.md
Use the terminal result for the exact new main candidate; fix any reported regression before progressing. Then continue directly to the next uncovered role/template or server authorization gap. Do not rebuild completed exports or print routes, and do not turn missing hosted/external evidence into PASS.

---

## HISTORICAL CHECKPOINT — 2026-10-29 (financial print UUID fallback removed)

**Repository:** `Report-Engainall/Nasr1`  
**Execution branch:** `main` only  
**Application change:** `8cbc23d515526bf9eba9de2c4b631a9075ab3727`  
**Regression-test commit:** `fbf4b25f36a9c32906ffef4da71891dc47eb19f5`  
**Acceptance-record update:** `0d4ee47eb81800886af22b77caf1f6daee77432b`  
**CI status:** Not asserted for the new application/test candidate. No previous test result is carried forward to this SHA.

### Implementation completed

- Updated `src/lib/finance-document-print.ts`: invoice/account-statement print labeling no longer falls back to a customer's internal UUID when business name, contact name, and customer code are unavailable; the document now uses the Arabic fallback `عميل غير مسمى`.
- Updated `src/test/finance-document-print.test.ts`: added a regression for both invoice and account-statement printable documents. It checks the safe customer label and confirms internal customer, invoice, item, credit, and payment UUIDs do not appear in the generated document HTML/title.
- Updated the existing acceptance matrix rows `GATE-001`, `DLV-011`, and `DLV-ROLLUP-001`. No parallel tracker was created.

### Acceptance state

- `DLV-011` remains **OPEN**. One reproducible document privacy gap has been fixed and regression coverage added; this does not close the full role-by-template PDF/XLSX/print allowlist or hosted authenticated journeys.
- `DLV-005` remains **PARTIAL** until the full server authorization/session/tier matrix is evidenced.
- Delivery groups remain **0/18 fully release-closed**. A global completion percentage is not asserted.
- Production release remains **NO-GO** while hosted authenticated E2E, actual Onyx Pro round-trip, official WhatsApp delivery receipts, live AI-provider operation, production deployment/rollback/restore evidence and owner approval remain unproven.

### HISTORICAL NEXT ACTION — superseded by CURRENT_EXECUTION_STATE.md
Continue directly on `main` with the next uncovered role/template output or server-side authorization boundary. Do not reimplement the completed export/print routes. Keep CI and hosted evidence tied to the exact candidate SHA; do not claim this candidate passed tests until its checks report terminal success.

---

## HISTORICAL CHECKPOINT — 2026-10-29 (warehouse return receipt and reversal evidence printing added)

**Repository:** `Report-Engainall/Nasr1`  
**Execution branch:** `main` only  
**Current code SHA:** `7ddfbd8f66c7e2e7e4123bd694a89abfe34152de`  
**CI status of this exact SHA:** Not asserted; latest code commits were not polled or represented as passing.

### Implementation newly completed

- `e23533871bf6d9d39a86ed1ce976db1d6b92e216` — warehouse staff can print the last successfully saved customer-return receipt after the `receive_customer_return` RPC returns the persisted receipt number and authoritative totals. The printable document includes request/order numbers, customer, receiving warehouse, sent line quantities, restockable/defective split and notes; it omits internal UUIDs and hides the live queue during print.
- `7ddfbd8f66c7e2e7e4123bd694a89abfe34152de` — reversed credit memos can be reprinted using the existing financial RPC/parser and a label that makes reversal evidence explicit. No client-created journal entry is used.
- Previous code in this checkpoint remains present: executive analytics XLSX (`c1930e9dbed8954878a760a4e33be037c56c5a5e`), filtered inventory-transfer XLSX (`80bc97ab4dadddaa5b223b29ae5960489588e9e3`), product-activity detail/summary reconciliation (`015b4f01c4acdad8bc64ed7a405c4d4b1b612a0f`), source UUID removal from task printing (`44043840525a181567640330a7f47f3d7787eac3)), and customer-order PDF scoping (`360d6c90a907b21f07b7cccf8d20166cf5854107`, `10d80137c464431f98d93779b32d731f2f5eea99`).

### Acceptance state

- `DLV-005`: **PARTIAL** — the real two-session price/revocation test exists, but its execution result and complete hosted authenticated role/tier/session matrix are not claimed.
- `DLV-007`: **PARTIAL** — stock-count XLSX and filtered inventory-transfer XLSX exist; the full inventory movement/reservation/transfer lifecycle and actual target-native Onyx Pro round-trip remain open.
- `DLV-010`: **PARTIAL** — customer 360, product activity and five-sheet executive analytics exports exist; business UAT and hosted evidence remain open.
- `DLV-011`: **OPEN** — finance, purchase, customer-order, task, stock-count, transfer-history and warehouse return-receipt print/export paths have implementation, including reversal evidence print. Full role-by-template payload allowlists and hosted authenticated journeys remain incomplete.
- The acceptance CSV retains **121 unique populated IDs, 0 duplicates, 18 delivery groups, and 0/18 fully release-closed groups**. A global completion percentage is still not computable until all mandatory canonical specification leaves are mapped to evidence.
- Production release remains **NO-GO** pending hosted E2E, target-native Onyx, official WhatsApp receipts, live AI-provider operation, production deployment/rollback/restore evidence and owner approval.

### HISTORICAL NEXT ACTION — superseded by CURRENT_EXECUTION_STATE.md
Continue direct implementation on `main` from `7ddfbd8f66c7e2e7e4123bd694a89abfe34152de`; prioritize uncovered role/template outputs or direct server authorization boundaries. Do not repeat completed print/export paths, and do not claim a CI result for this current SHA.

---

## HISTORICAL CHECKPOINT — 2026-10-29 (executive and transfer XLSX paths added; superseded by the newer receipt/finance-print checkpoint)

**Repository:** `Report-Engainall/Nasr1`  
**Execution branch:** `main` only  
**Current code SHA:** `80bc97ab4dadddaa5b223b29ae5960489588e9e3`  
**Current code SHA acceptance:** Not asserted here. The most recent exact-head CI success known at this checkpoint is for the earlier SHA `44043840525a181567640330a7f47f3d7787eac3` (211/211 test files, 1,381/1,381 tests). Later commits below have been pushed to main, and their CI was deliberately not polled.

### Implementation added after the previous accepted SHA

1. **`3a189d0fc9aaf8afbb420be54a8ea7a9408bab81`** — added a two-session PostgreSQL price/revocation race acceptance to `scripts/test-customer-price-visibility.mjs`. It blocks a member's price RPC behind the owner-held customer-row lock, invokes the actual membership-revocation RPC, commits the revocation, and requires the waiting price read to reject. This test is added but its result is not claimed here.
2. **`360d6c90a907b21f07b7cccf8d20166cf5854107` and `10d80137c464431f98d93779b32d731f2f5eea99`** — customer order print/PDF now hides the application shell and limits paper output to the saved order document; the reorder feedback and customer return-request workflow are excluded from the printable document.
3. **`8bdd5863365a419d373703e9cd36080deb05eef2`** — executive product-activity reporting exposes the unknown-stock count and no longer claims that Excel covers the full organization when the report is truncated above 5,000 rows.
4. **`c1930e9dbed8954878a760a4e33be037c56c5a5e`** — added a five-sheet executive analytics Excel export: KPI summary, daily sales, top products, top customers, and the seven-day forecast or the reason the forecast is unavailable. The export omits internal customer IDs, cost and margin fields.
5. **`80bc97ab4dadddaa5b223b29ae5960489588e9e3`** — added a two-sheet Excel export for the filtered inventory-transfer history. It preserves item-code strings/leading zeros, records filter metadata and the 500-row source-window limit, and omits raw transfer, batch, warehouse and actor identifiers.
6. Earlier in this execution, `44043840525a181567640330a7f47f3d7787eac3` removed raw source UUIDs from operational-task print output; `015b4f01c4acdad8bc64ed7a405c4d4b1b612a0f` added complete product-activity detail/summary reconciliation; `4afe6e8171c4574403f0e03c855ff57a20a4be4a` scoped purchase-order print output so an individual order does not print unrelated orders.

### Release state — continue implementation, do not infer completion

- `DLV-005`: **PARTIAL**. Existing hidden-price NULL/no-zero behavior, role/tier boundaries and session checks remain covered by code-level tests. The new concurrent member-revocation case is present, but its result and full hosted authenticated role/tier/session matrix are not claimed.
- `DLV-007`: **PARTIAL**. Stock-count XLSX and its saved-count consistency guard are implemented; filtered inventory-transfer history XLSX is now present. Full movement/reservation/transfer lifecycle acceptance, production stock evidence and a real Onyx Pro round-trip remain open.
- `DLV-010`: **PARTIAL**. Customer 360 and product-activity exports already exist; executive analytics XLSX now covers summary, sales trend, top products/customers and forecast state. Business UAT and hosted evidence remain open.
- `DLV-011`: **OPEN**. Role-sensitive finance PDFs, task print, purchase-order print, customer-order print, stock-count print and transfer-history print/export have implementation changes, but the complete role-by-template payload allowlist and hosted authenticated output journeys are not closed.
- The acceptance matrix currently has **121 populated task IDs, 121 unique, 0 duplicates, 18 delivery roll-up groups, and 0/18 groups fully release-closed**. A global completion percentage is **not computable** until every mandatory canonical specification leaf is mapped to candidate-specific evidence.
- Production release remains **NO-GO** until hosted authenticated E2E, target-native Onyx acceptance, official WhatsApp delivery receipts, live AI-provider operation, production deploy/rollback/restore evidence and owner sign-off are supplied.

### HISTORICAL NEXT ACTION — superseded by CURRENT_EXECUTION_STATE.md
Continue code changes on `main` from `80bc97ab4dadddaa5b223b29ae5960489588e9e3`. Do not repeat already implemented stock-count XLSX, product-activity XLSX, customer 360 XLSX, executive analytics XLSX or inventory-transfer XLSX. Next prioritize uncovered `DLV-005` direct API/RPC authorization/session/revocation boundaries or missing `DLV-011` role/template outputs. Do not wait on, repeatedly poll or overstate GitHub Actions status.

---

# Aghbari Commerce — Continuous Execution Record

> **Single source of truth.** Update this file at every meaningful checkpoint: before starting a new task, after implementation, after tests, after merge, and when blocked. Do not restart discovery or repeat completed audits. Read only this file's newest **LIVE CHECKPOINT / NEXT ACTION** section first, verify the current main SHA and exact-SHA CI, then continue from the next incomplete acceptance item. Keep older entries as history; never let a historical SHA or status override live repository evidence.

## HISTORICAL CHECKPOINT — 2026-10-29 (stock-count XLSX integrity verified; superseded by the newer implementation checkpoint)

**Verified at:** `2026-10-29T17:52:05Z`  
**Repository / execution branch:** `Report-Engainall/Nasr1` / `main` only  
**Exact tested application/code SHA:** `dba1d8eb062814f0e2c1d0dba3aff067cc75cc08`  
**Aghbari Commerce CI:** [run 40924950053 — terminal SUCCESS](https://github.com/Report-Engainall/Nasr1/actions/runs/40924950053)  
**One-main cleanup:** [run 40924949954 — terminal SUCCESS on the same SHA](https://github.com/Report-Engainall/Nasr1/actions/runs/40924949954)

### Completed and verified in this checkpoint

1. **Recovered the exact-head CI failure without changing application behavior.** Run [40923245752](https://github.com/Report-Engainall/Nasr1/actions/runs/40923245752) failed in `scripts/test-customer-returns.mjs` because the settlement-lock test depended on the momentary `pg_stat_activity.state/query` snapshot. The two settlement RPCs both succeeded after releasing the test gate; the assertion incorrectly missed the second waiter. Commit [`3ae9829705f8f25017f5792e221289362fba57fd`](https://github.com/Report-Engainall/Nasr1/commit/3ae9829705f8f25017f5792e221289362fba57fd) now verifies the two dedicated backend PIDs waiting on the exact ungranted advisory lock held by the gate, using `pg_locks`. Exact-head run [40924155975](https://github.com/Report-Engainall/Nasr1/actions/runs/40924155975) passed.

2. **Implemented warehouse stock-count Excel export.** `src/components/InventoryStockCountPage.tsx` exposes the saved stock-count snapshot export through `src/lib/stock-count-xlsx.ts`, with Arabic summary/detail worksheets. It retains leading-zero product codes; uses saved counts only; preserves unknown amounts as blank; escapes formula-like text; and omits private tenant, user, session, row and product identifiers from the workbook.

3. **Added a source-consistency guard to that export.** Commit [`dba1d8eb062814f0e2c1d0dba3aff067cc75cc08`](https://github.com/Report-Engainall/Nasr1/commit/dba1d8eb062814f0e2c1d0dba3aff067cc75cc08) rejects export when the session's saved `counted_lines` differs from the number of detail rows with a saved actual count. The regression test in `src/lib/stock-count-xlsx.test.ts` covers the mismatch and prevents generating a contradictory summary.

4. **Exact-SHA test evidence:** [run 40924950053](https://github.com/Report-Engainall/Nasr1/actions/runs/40924950053) passed **211/211 test files and 1,378/1,378 unit tests**. PostgreSQL 17 migration/workflow acceptance, RPC inventory generation/upload, finance/idempotency/concurrency, import/export, inventory stock-count and backup/restore checks, lint, build, preview/dev smoke and Chromium price-visibility acceptance completed successfully. The cleanup workflow also succeeded on the same code SHA.

### Acceptance state — do not overstate completion

- `DLV-007` remains **PARTIAL**: the stock-count export is implemented and accepted by exact-head CI, but full stock-movement/reservation/transfer lifecycle and real Onyx Pro round-trip remain unproven.
- `DLV-005` remains **PARTIAL**: artifact-level price privacy and current code-level tests pass, but the full role/tier/session/API matrix and hosted authenticated authorization remain open.
- `DLV-011` remains **OPEN**: the stock-count workbook adds warehouse-role output evidence, but all applicable role-by-template field allowlists and hosted authenticated output acceptance are not complete.
- The central acceptance CSV currently contains **121 populated unique task IDs and 0 duplicates**. The 18 delivery groups have **0/18 fully release-closed**; an overall completion percentage remains **not computable** until mandatory specification leaves are mapped to candidate-specific evidence.
- Full production release remains **NO-GO**. Hosted authenticated customer/tenant E2E, target-native Onyx acceptance, official WhatsApp delivery receipts, live AI-provider operation, production migration/deploy/rollback and restore evidence, and owner sign-off remain blocked or unverified.

### HISTORICAL NEXT ACTION — superseded by CURRENT_EXECUTION_STATE.md
Continue at the first uncovered `DLV-005` direct API/RPC role/tenant/tier/session boundary or `DLV-011` role/template output without equivalent artifact-level proof. Do not repeat the already accepted stock-count XLSX, purchase-order XLSX, Customer 360 XLSX, or previous statement/credit-memo PDF/print cases. Record new evidence here and in the existing matrix; do not create a parallel tracker.


## HISTORICAL CHECKPOINT — 2026-10-29 (Customer 360 Excel export accepted; superseded by the newer code-tested checkpoint)

- **Checkpoint timestamp (UTC):** 2026-10-29T17:19:58Z.
- **Repository / only integration branch:** `Report-Engainall/Nasr1`, `main`. Exact tested code SHA: `088e42450dc2fe7dc72cc8f4a1b3ff3cd79af46b` ([commit](https://github.com/Report-Engainall/Nasr1/commit/088e42450dc2fe7dc72cc8f4a1b3ff3cd79af46b)).
- **Exact-SHA CI:** [Aghbari Commerce run 40919660544 — terminal SUCCESS](https://github.com/Report-Engainall/Nasr1/actions/runs/40919660544) on `088e42450dc2fe7dc72cc8f4a1b3ff3cd79af46b`: **209/209 test files and 1370/1370 tests passed**. PostgreSQL 17 migration/core and tenant-authorization workflows, exact-head RPC/function inventory generation/upload, finance/idempotency/concurrency checks, asynchronous export/import contracts, inventory import non-mutation, isolated PostgreSQL 17 backup/restore, lint, production build, production-preview smoke (4173), development smoke (5173), and Chromium price-visibility acceptance all passed. There were no failed steps. [One-main-branch cleanup 40919660696 — SUCCESS](https://github.com/Report-Engainall/Nasr1/actions/runs/40919660696) on the same SHA.
- **New working feature:** `src/components/AdminCustomer360.tsx` now has a working `تصدير Excel` action backed by `src/lib/customer-360-xlsx.ts` and its tests `src/lib/customer-360-xlsx.test.ts`. The generated XLSX has eight worksheets: customer overview; full per-currency ledger aggregates; latest orders; latest invoices; latest payments; top products; follow-up signals; and order-status distribution.
- **Data correctness and privacy acceptance:** full server-computed ledger aggregates remain separate by currency; latest order/invoice/payment details remain explicitly bounded to the latest 20; unavailable monetary/due-date values remain blank rather than becoming zero; the workbook preserves leading-zero business identifiers as strings; XML/formula injection is tested; cost/margin fields are excluded; over-20 detail responses are rejected rather than silently presented as complete. The export uses the already-authorized customer 360 summary RPC and does not create alternate client-side totals.
- **Failure transparency:** the earlier run [40919501907](https://github.com/Report-Engainall/Nasr1/actions/runs/40919501907) failed on SHA `c10c0f4` because an exact Arabic wording assertion did not match the workbook label. That label and the reload error reset were corrected on `088e42450dc2fe7dc72cc8f4a1b3ff3cd79af46b`; the exact-SHA run above passed every test and workflow gate.
- **Acceptance status:** `DLV-010` remains **PARTIAL**; customer 360 Excel delivery is implemented and locally accepted, but complete analytics/Customer 360 business acceptance and hosted UAT are not closed. `DLV-011` remains **OPEN** because the complete role-by-template PDF/XLSX/print matrix and hosted authenticated output acceptance remain unproven. `DLV-005` remains **PARTIAL**; `DLV-003` remains **PARTIALLY VERIFIED**; `DLV-007` remains **PARTIAL**.
- **External/release gates:** hosted authenticated customer/tenant end-to-end tests; actual Onyx Pro target-version import/export round-trip; official WhatsApp delivery receipts; live AI-provider behavior; production deploy/migration/rollback and production restore evidence; and owner sign-off remain `BLOCKED_EXTERNAL` or `UNVERIFIED`. Full production release remains **NO-GO**.
- **Single live ledger / sole matrix:** this file is the only live execution ledger. `docs/bolt-source-reconciliation/CURRENT_EXECUTION_STATE.md` is a compatibility redirect, not another task queue. The only acceptance matrix is `docs/bolt-source-reconciliation/REMAINING_SCREEN_ACCEPTANCE_MATRIX_2026-10-22.csv`.
- **Roll-up:** 118 populated unique acceptance IDs, 0 duplicate IDs, 18 delivery groups, and 0/18 fully release-closed. Overall completion percentage is **NOT COMPUTABLE** until all required leaf evidence and group roll-ups reconcile on a single release candidate.
- **NEXT ACTION:** use the matrix to select the first remaining uncovered DLV-005/DLV-011 direct API/RPC permission, tenant/tier/session/cache boundary or role-specific generated artifact. Add one focused regression and parsed-artifact evidence at a time. Do not repeat the accepted Customer 360 XLSX, product-movement XLSX, customer statement PDF, or staff statement/credit-memo print tests. Do not claim external/production acceptance based on CI.

## Historical checkpoint — 2026-10-29 (checkpoint superseded)

- **Checkpoint timestamp (UTC):** 2026-10-29T15:47:42.177Z.
- **Repository / execution target:** `Report-Engainall/Nasr1`, `main` only. Parent main SHA before this checkpoint: `1f149dbeea5c08a6336ebabf4a736233dfb5ce9b`. This checkpoint commit adds a documented invariant to the required-field migration to ensure the PostgreSQL 17 migration/acceptance workflow runs against the current candidate; actual checkpoint SHA is the commit created for this entry and is verified from GitHub below.
- **Acceptance in progress:** `DLV-003` / database-boundary required-field validation. Migration `supabase/migrations/20261029152500_product_required_fields_guard.sql` rejects whitespace-only `products.name` and `products.item_code` and normalizes accepted values before persistence. The regression cases already exist in `scripts/test-admin-catalog-commands.mjs` (direct UPDATE/INSERT, rejection messages, and proof that the original row stays unchanged).
- **Proven CI failure and cause:** [PostgreSQL 17 run 40904234961](https://github.com/Report-Engainall/Nasr1/actions/runs/40904234961), job 123554490122, failed in `npm run test:db` at `ADMIN_CATALOG_COMMANDS_FAILED`. The logged SQLSTATE `22023` was expected from the MOQ enforcement because the shared fixture set `min_order_quantity=2` and `order_quantity_multiple=2`, then attempted a staff order with quantity 1. The production quantity guard is correct; the fixture was inconsistent.
- **Concrete correction:** commit [1f149db](https://github.com/Report-Engainall/Nasr1/commit/1f149dbeea5c08a6336ebabf4a736233dfb5ce9b) changes `scripts/test-admin-catalog-commands.mjs` so the concurrent idempotency test orders quantity 2, asserts persisted quantity 2, and uses quantity 4 for the conflicting-but-valid replay payload. This preserves both MOQ enforcement and the idempotency-conflict assertion.
- **Exact-SHA status before this checkpoint:** [test-and-build run 40904867445](https://github.com/Report-Engainall/Nasr1/actions/runs/40904867445) was `IN_PROGRESS` on `1f149dbeea5c08a6336ebabf4a736233dfb5ce9b`; [one-main cleanup run 40904867357](https://github.com/Report-Engainall/Nasr1/actions/runs/40904867357) was `SUCCESS` on that same SHA. PostgreSQL 17 did not trigger for that commit because its path filters do not include `scripts/test-admin-catalog-commands.mjs`; this checkpoint touches the migration path so PostgreSQL 17 can re-run against the new exact SHA.
- **Acceptance result:** `DLV-003` remains **PARTIALLY VERIFIED**, not closed. Required-field source tests exist; the current candidate remains unaccepted until PostgreSQL 17 finishes successfully on the exact checkpoint SHA. Remaining catalog acceptance includes server-backed filters/pagination and route/UAT coverage.
- **PR / merge:** no PR created and no branch created. This repository's `main` was reported `protected=false`; all writes here are forward-only commits to `main`, without force-push/reset/clean.
- **Release gates:** hosted authenticated tenant/customer E2E, real Onyx target round-trip, official WhatsApp delivery receipts, live AI provider, production deploy/migration/rollback/restore and owner sign-off remain `BLOCKED_EXTERNAL` or `UNVERIFIED`.
- **NEXT ACTION:** inspect CI on the exact SHA of this checkpoint commit. If PostgreSQL 17 fails, fix the specific failing assertion only; if it passes, continue directly to the next incomplete `DLV-003` server-backed filter/pagination item and preserve the exact-SHA evidence.

## Historical checkpoint — 2026-10-28 (superseded by the 2026-10-29 checkpoint)

- **Checkpoint timestamp (UTC):** 2026-10-28T19:06:15.931Z.
- **Repository / integration target:** `Report-Engainall/Nasr1`, branch `main` only. Current code-tested main SHA: `c97a70bcbc8c2bd1d1535e2bf00af829423288c9`. GitHub reports `main` is not branch-protected; no force push/reset/branch creation was used.
- **Exact-SHA CI — storefront subcategory acceptance:** [Aghbari Commerce run #2797 / 40750424902](https://github.com/Report-Engainall/Nasr1/actions/runs/40750424902) completed **SUCCESS** on `c97a70bcbc8c2bd1d1535e2bf00af829423288c9` at 2026-10-28T19:04:37Z. Job completed 34 steps with 0 failed steps; logs confirm **205/205 test files and 1345/1345 tests passed**. PostgreSQL 17 full migrations/core workflows, RPC/function inventory generation/upload, finance, journal reversal, invitations, addresses, tenant analytics, async exports, import idempotency, inventory snapshot, saved products, PostgreSQL 17 backup/restore, lint, production build, preview/dev smoke, and Chromium price-visibility acceptance passed.
- **One-main cleanup:** [run #63 / 40750424941](https://github.com/Report-Engainall/Nasr1/actions/runs/40750424941) completed **SUCCESS** on the same code SHA. No branch inventory/audit is being repeated.
- **Accepted requirement `STF-FEATURED-METADATA-001`:** the corrected forward-only migration `supabase/migrations/20261028183000_storefront_featured_projection.sql` projects only the supported persisted fields `is_featured` and `sort_order`; it does not reference unsupported `brand_id`. Exact-SHA [run #2796 / 40749568186](https://github.com/Report-Engainall/Nasr1/actions/runs/40749568186) completed **SUCCESS** on `2127fa551a81c9c84694bb6bbcfd0c331a74a79e`; the PostgreSQL runtime test verifies persisted featured/sort values, featured-first ordering, server-side price privacy and no tenant/warehouse/internal-stock leak.
- **Implemented requirement `DISCOVERY-005` / partial `DLV-003`:** commit [c97a70b](https://github.com/Report-Engainall/Nasr1/commit/c97a70bcbc8c2bd1d1535e2bf00af829423288c9) fixes advanced search so active child categories are selectable and visibly indented; inactive categories remain excluded. Added acceptance test in `src/test/storefront-discovery.test.tsx`; the exact-SHA run above is green. This is a bounded fix, **not** completion of the full product discovery/admin catalog workstream.
- **Current code delta:** `src/components/AdvancedStorefrontSearchPage.tsx`, `src/test/storefront-discovery.test.tsx`. No PR or merge SHA applies to this direct commit on the repository's unprotected `main`; code commit SHA is `c97a70bcbc8c2bd1d1535e2bf00af829423288c9`.
- **Release decision:** **NO-GO for full production release**. Hosted authenticated customer/tenant E2E, live Onyx target sync/import, official WhatsApp delivery receipts, live AI-provider behavior, production deploy/migration/rollback, production restore, and owner sign-off remain unproven and are not reported as PASS.

## UNIFIED EXECUTION MANDATE — DO NOT RESET THE WORK

1. **Resume protocol:** read this LIVE CHECKPOINT, the existing `NEXT ACTION`, and the current acceptance matrix. Confirm current `main` SHA and latest CI only; do not re-fetch or re-audit the entire repository. Start immediately at the first incomplete acceptance item.
2. **Implement, don't narrate:** each work cycle must produce a concrete code/test/doc delta tied to an acceptance ID. Build the real user path end-to-end: Arabic RTL UI → service/API → database/RPC → tenant/role authorization → audit/validation → tests. No placeholder/demo-only completion claims.
3. **Small verified increments:** implement one bounded, valuable change; run the narrow test, relevant security/privacy tests, and required CI on the exact candidate SHA; inspect failures and fix only evidenced defects; use the repository-approved merge path as soon as gates pass; verify CI on the actual merge SHA; then update this record and continue immediately.
4. **No duplicate work:** do not recreate merged PRs, completed fixes, inventories, reports, or tests. Preserve existing findings and link to them. A closed PR is not automatically merged; verify its merge SHA or equivalent change on `main`.
5. **Acceptance-driven priority:** prioritize unfinished release-blocking product flows and visible screens/services over additional inventory/report polishing, while immediately fixing proven security, tenant-isolation, price-privacy, finance, stock, or import/export defects. Use the original master specification and screen acceptance matrix as the requirement authority.
6. **Required product constraints:** B2B customer-specific price tiers are server-selected; hidden prices must never leak through DOM/API/cache/PDF/XLSX or use zero as a sentinel. Preserve Onyx Pro's 27-column order, external IDs including leading zeros, idempotent imports, and truthful sync metadata. Protect ledger/reversal, Customer 360, admin AI, role-specific print routes, official WhatsApp Business API, free/local AI adapters without surprise paid billing, and read-only weak-network PWA cache (no offline order/stock/finance mutations).
7. **Truthful external gates:** mark hosted tenant/customer E2E, live Onyx, official WhatsApp receipts, live AI provider, production deploy/migration/rollback, restore, and owner sign-off as BLOCKED_EXTERNAL/UNVERIFIED until actual authorized evidence is recorded. Do not fabricate credentials or results.
8. **Progress log format:** every update records UTC timestamp, main/candidate SHA, acceptance ID/requirement, files changed, implementation result, exact test commands/results and CI run URLs, merge SHA, remaining blocker, and the single next action. If nothing changed, report the specific blocker and the next executable step—not a list of browsing/review activities.
9. **Time transparency:** record actual timestamps at each milestone. Do not claim second-by-second live refresh unless an actual automated updater is configured; the repository file updates when a checkpoint is committed. The user should be able to open this single record directly without asking for a fresh recap.
10. **Completion definition:** a requirement closes only with implementation evidence + passing relevant tests on the exact SHA + acceptance-matrix update. Overall release closes only when all applicable acceptance groups and external gates have evidence, with owner sign-off recorded.

## Historical NEXT ACTION — superseded by the newest live checkpoint

1. Continue `DLV-003` from the first still-open catalog acceptance row: implement one missing server-backed filter / required-field validation / pagination behavior with its focused regression test. Do not redo featured metadata or active-subcategory search.
2. On every new code commit, verify terminal CI on its exact SHA, update the requirement and interface matrices, then refresh this central record. Keep all external/production gates `BLOCKED_EXTERNAL` or `UNVERIFIED` until actual evidence exists.

## Historical checkpoint (superseded by live reconciliation above)

### Earlier confirmed repository state

- Main has not been modified directly. Main Core [40035355209 SUCCESS](https://github.com/Report-Engainall/Nasr1/actions/runs/40035355209) is on SHA `16a3d23e558696700bccbb3dbf9ea75b0fccf745`.
- PR #127 is already merged; PR #129 is closed unmerged. Neither is being recreated.
- The current state checkpoint and acceptance matrix were refreshed on the #133 branch to record PRs #147–#151, the unique migration ordering, exact-head test evidence and external-test limitations. These commits advance the #133 head; verify Core/P2 on the final updated head before claiming the refreshed docs branch passes.
- `docs/bolt-source-reconciliation/API_OPS_CONTRACT_REGISTER_2026-10-24.md` was updated on [PR #142](https://github.com/Report-Engainall/Nasr1/pull/142) with five specific semantic findings and current evidence. The latest register head is `0b8eab56970f1485f86535edf7b66d1c1bddae90`; Core [40107811311](https://github.com/Report-Engainall/Nasr1/actions/runs/40107811311) and P2 [40107811295](https://github.com/Report-Engainall/Nasr1/actions/runs/40107811295) were running at this checkpoint.
- The API-OPS inventory maps 304/304 public runtime objects to sources, but the 179 callable RPC candidates still require semantic review. Do not mark the overall API-OPS workstream complete based on a small subset of fixed NULL-state cases.

## 2. Implemented defects and exact-head evidence

### PR #147 — customer quote decision

- Head: `5b351a544f412a48c0d5466b91b000c51100c889`.
- Added `20261024133000_customer_quote_response_explicit_decision.sql` after detecting that #146 already uses migration version 13:00. This eliminates a duplicate migration version.
- Core [40106804073 SUCCESS](https://github.com/Report-Engainall/Nasr1/actions/runs/40106804073), P2 [40106804081 SUCCESS](https://github.com/Report-Engainall/Nasr1/actions/runs/40106804081); direct PostgreSQL 17 runtime passed.
- Evidence: NULL quote ID/decision returns SQLSTATE `22023` without mutation; explicit `false` and `true` persist the expected rejected/accepted transitions.
- Status remains PARTIAL for release: open/unmerged, no independent submitted review; hosted customer E2E remains skipped.

### PR #148 — operational task status

- Head: `fbc34727822416c6521cd9bae841c8d0df0261c6`.
- Added `20261024140000_operational_task_status_reject_null.sql` plus source-contract and PostgreSQL 17 runtime tests.
- Core [40106736245 SUCCESS](https://github.com/Report-Engainall/Nasr1/actions/runs/40106736245), P2 [40106736237 SUCCESS](https://github.com/Report-Engainall/Nasr1/actions/runs/40106736237), PG17 [40106736232 SUCCESS](https://github.com/Report-Engainall/Nasr1/actions/runs/40106736232).
- Evidence: NULL/unsupported statuses are rejected before mutation; a valid transition updates the task and writes exactly one status-change audit row.
- Status: open/unmerged; no independent review.

### PR #149 — promotion activation

- Head: `21fabc9ecaf11fb3f22737e11070d23e83cb1872`.
- Added `20261024143000_promotion_null_active_decision.sql`.
- Core [40107006299 SUCCESS](https://github.com/Report-Engainall/Nasr1/actions/runs/40107006299), P2 [40107006338 SUCCESS](https://github.com/Report-Engainall/Nasr1/actions/runs/40107006338), PG17 [40107006365 SUCCESS](https://github.com/Report-Engainall/Nasr1/actions/runs/40107006365).
- Evidence: NULL is rejected before create/toggle; no promotion mutation/deactivation audit is created; explicit true/false remains effective.
- Status: open/unmerged; no independent review.

### PR #150 — storefront announcement activation

- Head: `1b22b83b3297c87c57b20c62336f16b772b613e4`.
- Added `20261024144500_announcement_null_active_decision.sql`.
- Core [40107350234 SUCCESS](https://github.com/Report-Engainall/Nasr1/actions/runs/40107350234), P2 [40107350238 SUCCESS](https://github.com/Report-Engainall/Nasr1/actions/runs/40107350238), PG17 [40107350314 SUCCESS](https://github.com/Report-Engainall/Nasr1/actions/runs/40107350314).
- Evidence: NULL create/update is rejected with SQLSTATE `22023`, with no state change or audit event; explicit false deactivates once.
- Status: open/unmerged; no independent review.

### PR #151 — AI fallback telemetry

- Latest head: `70c96242e28375bacde73d5a2b85ec538b982d5d`.
- Added `20261024145000_ai_fallback_decision_reject_null.sql`, source-contract tests and an isolated PostgreSQL 17 runtime workflow. Both v1/v2 AI usage completion require an explicit fallback flag before reservation lookup/mutation; v1 also explicitly rejects NULL provider/result status.
- A previous head `c2b64beedd0cd3d473506fe55044388624196409` had a Core failure only because a new source-contract test expected a literal `p_usage_measurement_status='unknown'`, while the implementation uses an ELSE branch for unknown usage. The test was corrected to verify the actual measured/partial branches and the “unknown usage cannot claim measured tokens” rejection.
- On the latest head `70c96242...`, PostgreSQL 17 [40107756187 SUCCESS](https://github.com/Report-Engainall/Nasr1/actions/runs/40107756187). Core [40107756122](https://github.com/Report-Engainall/Nasr1/actions/runs/40107756122) and P2 [40107756096](https://github.com/Report-Engainall/Nasr1/actions/runs/40107756096) were still running at checkpoint. Do not transfer results from the previous SHA to this head.
- Status: PARTIAL until Core and P2 both pass on the latest head, followed by independent review and merge.

## 3. Required sequence and unresolved release gates

Keep migration versions unique and preserve dependency order:

`#144 (11:00) → #145 (12:00) → #146 (13:00) → #147 (13:30) → #148 (14:00) → #149 (14:30) → #150 (14:45) → #151 (14:50)`.

- #144 head `2bf9cfedbc6d840a0da3fdffe7ddb106b9929a71`: Core [40105249828 SUCCESS](https://github.com/Report-Engainall/Nasr1/actions/runs/40105249828), P2 [40105249827 SUCCESS](https://github.com/Report-Engainall/Nasr1/actions/runs/40105249827); still open awaiting independent review.
- #145 head `7c82b051ed0bda11c944e4fe08ecf4a117060ed5`: historical Core [40100874921](https://github.com/Report-Engainall/Nasr1/actions/runs/40100874921) and P2 [40100874931](https://github.com/Report-Engainall/Nasr1/actions/runs/40100874931) succeeded on that historical SHA only. It must be refreshed after #144.
- #146 head `3150691725f97d7f892fcb2aed0edae898c839be`: historical Core [40101794869](https://github.com/Report-Engainall/Nasr1/actions/runs/40101794869) and P2 [40101794970](https://github.com/Report-Engainall/Nasr1/actions/runs/40101794970) succeeded on that SHA only. Resolve shared `scripts/test-database-migrations.mjs` changes from #134/#144/#146 while preserving all tests.
- PRs #133, #142, #144–#151 remain open/unmerged here. A reviewer request is not an approval; there are no independent submitted reviews confirming closure. Do not merge, bypass protection, or modify `main` directly.
- Hosted customer/tenant E2E remains `SKIPPED/BLOCKED_EXTERNAL` where authorized test credentials are unavailable. CI does not prove production writes, live Onyx import, WhatsApp delivery, live AI-provider secrets, deployment or production restore.
- Exact-head CI for #133 must be rerun after the latest checkpoint/matrix/report commits; previous head results do not transfer.

## 4. NEXT ACTION — FIRST STEP ON RESUME

1. Poll #151 Core `40107756122` and P2 `40107756096` on SHA `70c96242e28375bacde73d5a2b85ec538b982d5d`; inspect job logs and fix only proven failures.
2. Poll #142 Core/P2 `40107811311`/`40107811295` on its current register head. Any additional register correction requires another exact-head run.
3. Verify Core/P2 on the final head of PR #133 after its updated state, matrix and report commits.
4. Continue semantic review of remaining callable RPCs and close outstanding acceptance items from the original mandate; do not stop after these NULL-decision fixes.
5. After independent submitted reviews and successful final-head gates, follow required merge order and verify CI on each actual merge SHA.



## Archived checkpoint — previously live section (superseded; retained for history)

## HISTORICAL CHECKPOINT — 2026-10-28

- **Exclusive target:** `Report-Engainall/Nasr1` / `main` only. No side branches or duplicate repositories.
- **Latest fully verified baseline SHA:** `c412d2df9e58a670461168252d271629be6bcbb4`. [Aghbari Commerce checks #2784 / run 40743164520](https://github.com/Report-Engainall/Nasr1/actions/runs/40743164520) completed **SUCCESS** on this exact SHA.
- **Exact-SHA evidence:** 205/205 test files and 1340/1340 unit tests passed, including `src/test/dashboard-load-error.test.tsx` (1/1). Isolated PostgreSQL 17 migrations/core acceptance, targeted finance/import/export/inventory workflows, PostgreSQL 17 backup/restore, lint, production build, preview/dev smoke tests, and Chromium price-visibility acceptance all passed. [One-main cleanup #50](https://github.com/Report-Engainall/Nasr1/actions/runs/40743164599) also succeeded.
- **Closed bounded screen defect:** `ROUTES-DASHBOARD-ERROR-RECOVERY-001`. Commit [c412d2d](https://github.com/Report-Engainall/Nasr1/commit/c412d2df9e58a670461168252d271629be6bcbb4) adds a visible retry path when dashboard metrics fail; retry reissues metrics, alerts and product fetches. The dedicated Vitest assertion passed. This does not close the overall `ROUTES-001` screen acceptance group.
- **Corrective action for `STF-FEATURED-METADATA-001`:** candidate [ba4022f](https://github.com/Report-Engainall/Nasr1/commit/ba4022fa0b527eb0c86390569a0d12aa0320165b) failed PostgreSQL migration validation because `products.brand_id` does not exist. The next fix removes that unsupported column from the forward migration and its test; the accepted contract is limited to persisted `is_featured` and `sort_order`. The corrected main SHA remains pending exact-SHA CI; do not mark the acceptance row accepted before terminal SUCCESS.
- **Release decision:** **NO-GO for full production release** remains unchanged. Hosted authenticated customer/tenant E2E, live Onyx sync, official WhatsApp delivery receipts, live AI-provider operation, production deploy/migration/rollback, production restore and owner sign-off remain unproven.

## 2026-10-30 — Follow-on exact-head security proof and checkpoint

- Main advanced to code SHA `539630b1315394cb507a803a3f8db7829976f240`. Added semantic denial/no-side-effect PostgreSQL 17 tests for customer payment recording: same-tenant customer denial `42501`; foreign-tenant manager denial `P0002`; invoice, customer balance, payment ledger and audit snapshots remain unchanged.
- Exact-head Core [40988280123 SUCCESS](https://github.com/Report-Engainall/Nasr1/actions/runs/40988280123), Import finalizer PG17 [40988280280 SUCCESS](https://github.com/Report-Engainall/Nasr1/actions/runs/40988280280), P2 local Supabase/Chromium [40988280282 SUCCESS](https://github.com/Report-Engainall/Nasr1/actions/runs/40988280282), one-main cleanup [40988280165 SUCCESS](https://github.com/Report-Engainall/Nasr1/actions/runs/40988280165). Inventory artifact [12947808539](https://api.github.com/repos/Report-Engainall/Nasr1/actions/artifacts/12947808539/zip) is 330/330 mapped across 174 migrations.
- External hosted customer/order/tenant test remains `SKIPPED`; local browser tests are not hosted or production proof. DLV-008/015 remain PARTIAL; release remains NO-GO.
- Sole next task: `DLV-015-CUSTOMER-QUOTE-REVOKE-RACE-001` — add deterministic PostgreSQL 17 evidence that customer quote response cannot commit after membership revocation while blocked on the quote-row lock. Canonical resume instructions are in `docs/bolt-source-reconciliation/CURRENT_EXECUTION_STATE.md`.

## 2026-10-30 — DLV-015 customer quote membership-revocation race

- Exact code SHA `7fb457e832bfcf96072aa596ce437874bfc0447f`; Core [40989774771 SUCCESS](https://github.com/Report-Engainall/Nasr1/actions/runs/40989774771), P2 local Supabase/Chromium [40989774803 SUCCESS](https://github.com/Report-Engainall/Nasr1/actions/runs/40989774803), one-main cleanup [40989774726 SUCCESS](https://github.com/Report-Engainall/Nasr1/actions/runs/40989774726).
- Added deterministic PostgreSQL 17 race: buyer RPC waits on `sales_quotes FOR UPDATE`; separate transaction commits membership revocation; response rejects `42501`; quote status/responded_by/updated_at/audit unchanged. Core logs contain explicit PASS marker. No migration changed.
- P2 order/tenant, returns/credit memo, real Onyx XLSX, finance/task printing, customer-manager privacy/audit and device-session revocation all passed. Hosted customer/order/tenant E2E remains `SKIPPED`.
- Exact-head RPC inventory [12949205362](https://api.github.com/repos/Report-Engainall/Nasr1/actions/artifacts/12949205362/zip): 330/330 source-matched, 174 migrations. DLV-015 remains PARTIAL; no production DB touched.
- Sole next task: `DLV-011-FINANCE-PRINT-RPC-ALLOWLIST-001` — exact server JSON key allowlists for finance print payload RPCs across admin/manager/accountant, in `scripts/test-database-migrations.mjs` only.

## 2026-10-30 — DLV-011 exact finance print contract and combined security acceptance

- **Exact code SHA:** `eb83f6cd8824449ef3a1cbf2b5b55c823fdf517d` on `main`.
- **New database proof:** exact JSON key sets for finance selector, invoice PDF, account statement and credit-memo PDF at root/nested rows across admin/manager/accountant. A source-linked draft credit memo is temporarily posted via the accounting journal RPC inside a test transaction; real statement credit row, amount and invoice credit/outstanding/currency summary are checked; transaction then rolls back.
- **Adjacent role-security proof:** repository writer's `eb83f6c` adds denial/no-mutation assertions for self-role changes, foreign-tenant profile assignment, invalid customer+accountant combination, unsupported and duplicate role arrays. Profile, roles and role-change audit snapshots remain equal after denial.
- **Exact-head Actions:** Core [40991758166 SUCCESS](https://github.com/Report-Engainall/Nasr1/actions/runs/40991758166), P2 local Supabase/Chromium [40991758229 SUCCESS](https://github.com/Report-Engainall/Nasr1/actions/runs/40991758229), Import finalizer PG17 [40991758251 SUCCESS](https://github.com/Report-Engainall/Nasr1/actions/runs/40991758251), cleanup [40991758252 SUCCESS](https://github.com/Report-Engainall/Nasr1/actions/runs/40991758252).
- **Inventory artifact:** [12948614805](https://api.github.com/repos/Report-Engainall/Nasr1/actions/artifacts/12948614805/zip) — 330 runtime public functions, 330/330 source matched, 0 unmatched, 174 migrations; structural map only.
- **Proof boundary:** hosted customer/order/tenant Playwright is `SKIPPED`; local Supabase/Chromium is not hosted or production proof. DLV-007/008/011/015 remain PARTIAL; no production DB used.
- **Sole next task:** `DLV-007-REORDER-POINT-STAFF-DENIAL-001` — unauthorized ordinary staff attempt to change reorder point must return `42501` and leave inventory balance, purchasing AI task and audit history unchanged. P2 file owner: `scripts/test-database-migrations.mjs`.


## PRODUCT BUILD — 2026-11-05 — Customer service SLA, manager assignment and escalation

- Repository/branch: \`Report-Engainall/Nasr1\` / \`main\`.
- Product-code SHA: \`fe1d3961e6ab5db8073d3d578deba4617c5ae0b4\`.
- Acceptance matrix leaf: \`DLV-010-CUSTOMER-SERVICE-CASE-SLA-001\`; matrix commit \`c57bf623cab0c99223c84393b4b36562ead19695\`.
- Added \`supabase/migrations/20261105200000_customer_service_case_sla.sql\`: tenant-configurable first-response/resolution SLA by priority; default SLA targets; deadline snapshot/backfill for existing cases; linked case-task resolution deadline synchronization with persistent manager override; first-response timestamp; append-only assignment/SLA/escalation events; manager-only case assignment, rescheduling and reasoned escalation; assignee and manager in-app notifications.
- Added typed client functions in \`src/lib/customer-service-cases.ts\` for SLA settings, operational case metadata and manager operations.
- Expanded \`src/components/CustomerServiceCases.tsx\` with deadline/overdue visibility, manager assignment, SLA rescheduling, escalation and priority policy editor; added responsive styles in \`src/styles.css\`.
- Commits: migration \`e22c97d46d32a4ec258680826f45304cbfd1d3e7\`; API \`e61bc5d02746f02dcbeb0d6e9d84820ee991e086\`; UI \`6617b74342824431e0e8ba5bdca9095d70c62cce\`; CSS \`0c3a518f66ed7a4ad5c052a78f9da3d22b0e448e\`; migration backfill/overdue escalation correction \`79ab62f47bd41fe3ceecf641a790e4a11e0cccc1\`; local datetime second-precision correction \`fe1d3961e6ab5db8073d3d578deba4617c5ae0b4\`.
- The SLA migration is source-only and has not been applied to any database. No build, test, lint, scan, CI, browser or Bolt runtime verification was performed in this batch, per owner instruction. Status remains \`IMPLEMENTED_ON_MAIN / ACCEPTANCE_PENDING\`; Bolt New is the planned migration synchronization/runtime acceptance environment.
- No Vercel operation or free-credit use occurred. No paid dependency was added. GitHub commits are the delivery record; push-notification delivery is subject to the repository watch settings.
- Next action: \`BODY-COMPLETION-ON-MAIN-010\` — organization-wide customer service desk using the canonical case/task records, with role-appropriate queue, status/priority/assignee/SLA filters, due/overdue workload summaries and linked Task Center navigation.


## PRODUCT BUILD — 2026-11-05 — Organization-wide Customer Service Desk

- Repository/branch: \`Report-Engainall/Nasr1\` / \`main\`.
- Latest product-code SHA: \`1a49cf47446c85ae33dce93b456026b723af1707\`.
- Acceptance-matrix leaf: \`DLV-010-CUSTOMER-SERVICE-DESK-001\`; matrix commit \`0f45e6d5c62c5ba7cee907160a7f7c08033aa637\`.
- Added \`supabase/migrations/20261105210000_customer_service_desk.sql\`: tenant-scoped staff RPC for an organization-wide customer service desk with keyset pagination, active/all/status, priority, assignment and overdue filters, bounded search and tenant-wide SLA workload rollups.
- Added validated queue client \`src/lib/customer-service-desk.ts\` and \`src/components/CustomerServiceDesk.tsx\` with Arabic RTL list, SLA/overdue visibility, status updates, manager assignment/deadline/escalation actions, workload cards, pagination and navigation to the existing linked task.
- Registered \`/admin/service-desk\` through \`src/components/AghbariApp.tsx\`, \`src/routes/admin_.service-desk.tsx\`, \`src/routeTree.gen.ts\` and responsive styles in \`src/styles.css\`.
- Commits: queue SQL \`90718728ebe372f1b68aa7bc26e41a5eb06b37ab\`; queue client \`35ea4a5cba587c913bd841f8c33966ac9247efc6\`; UI \`1969a3017ddf0f277ff34f736d700205e30eadb8\`; button correction \`8cfef88ee82cfbf3f0aae80c02bf4723bbca6601\`; app navigation \`27f39a6d0e44fcfa3ada99916d11b0bd39dccd90\`; route file \`fd028361f2d2473d55f35b0413c3298618dbfbee\`; styles \`1a44302b3e19ad4d2ed77df86b39775456db6bd6\`; route registry \`1a49cf47446c85ae33dce93b456026b723af1707\`.
- New SQL migration is source-only and has not been applied. No test/build/lint/scan/CI/browser/Bolt Preview or runtime verification was performed by design. The matrix status remains \`IMPLEMENTED_ON_MAIN / ACCEPTANCE_PENDING\`.
- No Vercel action/credit usage or new paid service/dependency.
- Next action: \`BODY-COMPLETION-ON-MAIN-011\` — authenticated customer-side visibility and response flow with strict separation between public customer replies/history and internal escalation/manager notes.
