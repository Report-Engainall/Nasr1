# P1 ACTIVE CHECKPOINT OVERRIDE — 2026-11-06 — BODY-COMPLETION-ON-MAIN-046

- Repository: `Report-Engainall/Nasr1`; branch: `main`.
- Main head observed immediately before this checkpoint update: `3fac1f179af623c964f637fb109c91a1f2e96fb5`.
- P1 product-code commit: `c4f734bc9501b102519be585a77d1a8319fc19fd`.
- P1 scope: prevent in-flight reorder-template operations from crossing authenticated profile boundaries.

## BODY-046 — bind reorder actions to the initiating customer profile

- Template save captures the initiating `profileId`; after the RPC returns, an operation belonging to an old profile is ignored if the active profile has changed.
- Template apply captures the initiating profile, reads/normalizes the saved lines, and merges them only into that profile's isolated cart key. It refuses to navigate or surface old-account errors in the new profile's workspace after an identity switch.
- Busy/error state updates from an old operation are ignored after a profile change. The existing load-revision guard and state reset from BODY-045 remain in place.
- No new RPC, order creation, pricing source, cart format, server authorization rule or P3-owned code was introduced.
- File changed: `src/components/CustomerWorkflows.tsx`.
- Code commit: `c4f734bc9501b102519be585a77d1a8319fc19fd`.
- State: `IMPLEMENTED_ON_MAIN / ACCEPTANCE_PENDING`; no runtime PASS is claimed.

## Delivery boundary

- No tests, Playwright, E2E, build, lint, typecheck, CI, CodeInspector, database application, Bolt sync, Preview, production or Vercel operation was run for BODY-046.
- No P3-owned file, engine, DTO, RPC or migration was changed. No dependency, paid service or parallel business-write path was added.
- Project-wide 95% P1 completion remains unclaimed because the complete denominator and weighting of remaining executable requirements are not established by the acceptance record.

## Next P1 action

Implement customer edit-and-resubmit for returned orders only after confirming an approved tenant-scoped server transaction contract that validates ownership and returned status, reprices current lines, preserves idempotency, and persists the origin-order relation. Continue remaining role-specific DLV-011 outputs without duplicating existing reports.

---

# P1 ACTIVE CHECKPOINT OVERRIDE — 2026-11-06 — BODY-COMPLETION-ON-MAIN-045

- Repository: `Report-Engainall/Nasr1`; branch: `main`.
- Main head observed immediately before this checkpoint update: `c0ea665ac235fbe6aec8dd7b1235a1f848a239b1`.
- P1 product-code commits: `c9797ff37be5d34efc69b6fa7d21aa76b4f9c0a0`, `759e2402a56b6ff00e4658f3dbdd6bdedf255e24`, and `9e8ffd22341ca6fcbb07340b63467f9b4f70d981`.
- P1 scope: isolate the customer reorder workspace across account changes and route successful template application to the actual cart review screen.

## BODY-045 — isolate reorder data and complete the review handoff

- The reorder workspace now clears its product list, saved templates, pending quantity draft and price policy when the authenticated profile changes.
- Added a monotonic load-revision guard. Responses from prior account/profile loads are ignored when a newer load starts or the component leaves the active identity; an older response cannot repopulate the new account's view.
- Supabase query results retain inferred response types; no untyped query payload or cross-tenant client-side lookup was introduced.
- After a saved template is successfully merged into the existing profile-isolated cart, the customer is routed to the active `/cart` route for immediate review instead of returning to the storefront home page.
- File changed: `src/components/CustomerWorkflows.tsx`.
- Code commits: `c9797ff37be5d34efc69b6fa7d21aa76b4f9c0a0`, `759e2402a56b6ff00e4658f3dbdd6bdedf255e24`, `9e8ffd22341ca6fcbb07340b63467f9b4f70d981`.
- State: `IMPLEMENTED_ON_MAIN / ACCEPTANCE_PENDING`; no runtime PASS is claimed.

## Confirmed next P1 gap

- Customer order detail shows an instruction for `returned`, `needs_customer_amendment` and `returned_for_adjustment`, but the active detail view does not expose an edit-and-resubmit form. The separate `CustomerReturnRequest` is a delivered-order return workflow, not an amendment workflow.
- The active checkout call to `submit_customer_order` sends cart lines, contact, payment, delivery and idempotency data but no source-order identifier. `save_reorder_template` links the saved template to the source order; it does not by itself link the newly submitted order to that source.
- Do not simulate amendment by loading old lines into a generic cart. The next implementation must use or establish an approved tenant-scoped server transaction contract that validates returned status and customer ownership, reprices current lines, preserves idempotency, and persists the origin-order relation.

## Delivery boundary

- No tests, Playwright, E2E, build, lint, typecheck, CI, CodeInspector, database application, Bolt sync, Preview, production or Vercel operation was run for BODY-045.
- No P3-owned file, engine, DTO, RPC or migration was changed. No dependency, paid service or parallel order-write path was added.
- Project-wide 95% P1 completion remains unclaimed because the complete denominator and weighting of remaining executable requirements are not established by the acceptance record.

## Next P1 action

Implement the returned-for-adjustment customer workflow against its approved server contract, then continue the next uncovered P1 customer/admin actions and remaining DLV-011 role/template pairs. Keep DLV-011 PARTIAL until all role/template requirements are accepted.

---

# P1 ACTIVE CHECKPOINT OVERRIDE — 2026-11-06 — BODY-COMPLETION-ON-MAIN-044

- Repository: `Report-Engainall/Nasr1`; branch: `main`.
- Main SHA at checkpoint base: `6355ff66673e0d044eb0a36d191550b7e01efa47`.
- P1 code commits: `3ad45a6e492897f3424ac3406994116f9867b713` and `546f26301354571cb4f09f31252791403512f0a1`.
- Files changed: `src/components/AghbariApp.tsx`, `src/aghbari.css`.
- Existing source modules reused: `src/lib/api.ts` (`fetchStoreProductActivityReport`), `src/lib/product-activity-print.ts`, `src/lib/product-activity-xlsx.ts`, and `src/components/ProductActivityPrintSheet.tsx`.
- Existing server function reused: `get_store_product_activity_report()`; its active-role gate calls `can_manage_finance()`, whose current contract permits active admin, manager and accountant profiles.

## BODY-044 — mount source-backed product activity PDF/print and XLSX outputs

- The product-activity RPC, complete report parser, allowlisted print projection, XLSX workbook builder and print-sheet component were already present on `main`, but none was mounted from the existing admin Reports view. This batch integrated them into that current screen; it did not create a duplicate report route or a second source.
- Added a role-gated report card for admin/manager/accountant, matching the server `can_manage_finance()` capability. The client does not request the report for other roles; server-side tenant/role enforcement remains authoritative.
- Loads `fetchStoreProductActivityReport()` from the existing tenant-scoped RPC and presents counts for recent movement, slow movement, stagnant items, never-sold items and unavailable stock. The screen preview is capped at 100 rows, while output actions receive the complete parsed server report, not the visible preview.
- XLSX uses the existing two-sheet workbook builder (detail and summary). It is disabled when the server truncates beyond 5,000 rows or the returned row count differs from the organization total; the builder independently rejects partial results.
- Print/PDF uses the existing strict allowlist projection and print sheet. Projection rejects truncated/inconsistent reports, omits internal product UUIDs and excludes costs, margins and price tiers. The print stylesheet scopes printing to this document and formats A4 landscape with repeated table headers.
- Includes report refresh, loading/error/retry states, and action feedback. It does not infer unknown stock as zero or transform a partial report into a complete output.
- State: `IMPLEMENTED_ON_MAIN / ACCEPTANCE_PENDING`. The existing RPC/migration was not applied or re-run here; no runtime/browser acceptance is claimed.
- Functional scope: one previously orphaned role-scoped report integration wired to both PDF/print and XLSX outputs. This is a bounded scope count, not a project-wide completion percentage.

## Delivery boundary

- No tests, Playwright, E2E, build, lint, typecheck, CI, CodeInspector, database application, Bolt sync, Preview, production or Vercel operation was run.
- No P3-owned engine, component, DTO, RPC or migration was changed. No new report source, mock data, dependency or paid provider was introduced.
- Project-wide 95% P1 completion remains unclaimed; the accepted/remainder denominator and weighting are not established.

## Next P1 action

Continue from the current live `main` with the next independently confirmed P1 commerce/administration gap. Keep existing report outputs and customer price privacy intact; do not duplicate a report whose source module already exists.

---

# P1 ACTIVE CHECKPOINT OVERRIDE — 2026-11-06 — BODY-COMPLETION-ON-MAIN-043

- Repository: `Report-Engainall/Nasr1`; branch: `main`.
- Main head observed immediately before this checkpoint update: `3edec167db82495b5933dfe89f1516a0bc1c2779`.
- P1 product-code commits: `535c053454977bb7d8587f357d3ef0aeceae6ecb` and `3edec167db82495b5933dfe89f1516a0bc1c2779`.
- P1 scope: reliable error recovery for the existing customer reorder-template save and apply actions.

## BODY-043 — make reorder-template actions recoverable

- Wrapped template creation and template application in explicit `try/catch/finally` handling so a rejected network/RPC/storage operation cannot leave the workspace permanently busy.
- Template creation now requires the existing `save_reorder_template` RPC to return a syntactically valid template UUID before the UI reports success or clears the draft. Invalid/missing acknowledgements remain an error.
- Applying a saved template now catches failed item reads, invalid template-line normalization and local cart-storage failures; it only shows the success notice after the existing isolated-cart merge succeeds.
- Backend error details are not echoed to the customer; the UI presents actionable generic messages. Existing server RPCs, ownership rules, cart line format, quantity validation, current-price/stock checkout validation and order-idempotency behavior are unchanged.
- File changed: `src/components/CustomerWorkflows.tsx`.
- Code commits: `535c053454977bb7d8587f357d3ef0aeceae6ecb`, `3edec167db82495b5933dfe89f1516a0bc1c2779`.
- State: `IMPLEMENTED_ON_MAIN / ACCEPTANCE_PENDING`; no runtime PASS is claimed.

## Delivery boundary

- No tests, Playwright, E2E, build, lint, typecheck, CI, CodeInspector, database application, Bolt sync, Preview, production or Vercel operation was run for BODY-043.
- No P3-owned file, engine, DTO, RPC or migration was changed. No dependency, paid service or parallel business-write path was added.
- Project-wide 95% P1 completion remains unclaimed because the complete denominator and weighting of remaining executable P1 requirements are not established by the current acceptance record.

## Next P1 action

Continue from the latest live `main` with the next independently confirmed P1 customer/admin workflow gap. Preserve all current source contracts and the P1/P3 ownership boundary.

---

# P1 ACTIVE CHECKPOINT OVERRIDE — 2026-11-06 — BODY-COMPLETION-ON-MAIN-042

- Repository: `Report-Engainall/Nasr1`; branch: `main`.
- Main head observed immediately before this checkpoint update: `2bdddc43274a17080dbbc49e5c8afb82448e2878`.
- P1 product-code commit: `d82c83a57b70d13f3c25c3bdfb4dd67288cf531f`.
- P1 scope: enforce the existing customer storefront price-visibility policy in the reorder workspace product picker.

## BODY-042 — respect hidden-price policy in reorder workspace

- The existing reorder workspace resolved customer-tier prices for its product selector but formatted the returned value directly. That bypassed the established storefront presentation guard and could render a zero hidden-price sentinel as a monetary amount.
- Reused the existing public-settings reader `fetchSettingsMap()` (server RPC `get_public_storefront_settings`) and the existing `resolveStorefrontPricePresentation()` guard with the exact `show_price_on_cards` setting.
- The picker now renders a monetary suffix only when the setting is the explicit boolean `true` and the server-returned customer price is a valid positive amount. Missing/unavailable settings, disabled policy, malformed amounts and the zero hidden-price sentinel fail closed and render no price.
- Current tier-price resolution remains server-derived. No other customer tier, base cost, margin, order total, alternate price source or new write path was introduced.
- File changed: `src/components/CustomerWorkflows.tsx`.
- Code commit: `d82c83a57b70d13f3c25c3bdfb4dd67288cf531f`.
- State: `IMPLEMENTED_ON_MAIN / ACCEPTANCE_PENDING`; no runtime PASS is claimed.

## Delivery boundary

- No tests, Playwright, E2E, build, lint, typecheck, CI, CodeInspector, database application, Bolt sync, Preview, production or Vercel operation was run for BODY-042.
- No P3-owned file, engine, DTO, RPC or migration was changed. The concurrent P3 commit `46546d358cb729d775d1a8af125241e7a00cd136` remains preserved on `main`.
- No new dependency or paid service was added.
- Project-wide 95% P1 completion remains unclaimed because the complete denominator and weighting of remaining executable P1 requirements are not established by the current acceptance record.

## Next P1 action

Continue from the latest live `main` with the next independently confirmed P1 customer/admin workflow gap. Preserve the existing price, tenant, cart, order-idempotency and P3 ownership contracts; do not create a parallel order-write path.

---

# P1 ACTIVE CHECKPOINT OVERRIDE — 2026-11-06 — BODY-COMPLETION-ON-MAIN-041

- Repository: `Report-Engainall/Nasr1`; branch: `main`.
- Main SHA at checkpoint base: `abceb79f990af5d7d43a1fe744aabf14216354c8`.
- P1 code commits: `67d8eb9a0712721b7d43462abf289111cc2926f2`, `d9ff1efd198337aa3a8be8bc776b255152dd1562`, and `6d188f6bed2801cdef241453ba5d23acf86011f4`.
- Files changed: `src/components/Storefront.tsx`, `src/aghbari.css`.

## BODY-041 — product-detail image enlargement and same-category discovery

- Added a keyboard-accessible image enlargement action to the existing product-detail screen. The lightbox exposes a labelled modal dialog, closes on Escape, outside click or the explicit close control, and loads the image asynchronously with lazy/decode hints in the detail entry point.
- Added up to four related-product cards filtered strictly by the same persisted `category_id`, excluding the current product. They are sourced only from products already loaded into the storefront catalogue; no fixtures, invented recommendations, secondary query or new route were introduced.
- Selecting a related item uses the existing `openProduct` route navigation. Its displayed price is rendered through the same `StorefrontPricePresentation` and server-provided `display_price` under the existing customer price-visibility policy; no other-tier prices or cost data are added.
- Added responsive, RTL-compatible layout and focus-visible styling for the zoom action, dialog and related-product cards.
- Product detail also renders the saved barcode as text alongside SKU and item code, preserving leading zeros.
- Scoped gap count: 2 concrete product-detail requirements from the original specification (enlarged image and same-category related products) now have UI behavior wired to existing catalog data. This is a bounded DLV-003 slice, not a project-wide completion percentage.
- State: `IMPLEMENTED_ON_MAIN / ACCEPTANCE_PENDING`. No browser/runtime acceptance is claimed.

## Delivery boundary

- No tests, Playwright, E2E, build, lint, typecheck, CI, CodeInspector, database application, Bolt sync, Preview, production or Vercel operation was run.
- No product data source, pricing rule, stock behavior, cart command, route or P3-owned file was changed.
- Project-wide 95% P1 completion remains unclaimed; the full denominator of executable P1 gaps is not established.

## Next P1 action

Continue with the next source-backed, non-P3 gap in the current product/admin workflows. Preserve DLV-011 templates already implemented or accepted; do not rebuild existing reports merely because their runtime acceptance is pending.

---

# P1 ACTIVE CHECKPOINT OVERRIDE — 2026-11-06 — BODY-COMPLETION-ON-MAIN-040

- Repository: `Report-Engainall/Nasr1`; branch: `main`.
- Main SHA at this checkpoint base: `bd7cb81607951fb652b8b3cd38fe9715a894a636`.
- P1 product-code commit: `a6101171ee7fe3fe75b3240dbdc57a263cbd4e67`.
- P1 scope: truthful customer feedback for alternate-unit selection in the existing storefront product-detail flow.

## BODY-040 — distinguish successful unit additions from stock errors

- The alternate-unit conversion integration already committed in BODY-036 shows a confirmation containing the selected package count and its equivalent base-unit quantity.
- Corrected the shared storefront cart-action banner to classify this confirmation as a polite success status with positive styling. Validation, availability and other cart failures remain assertive error alerts.
- No stock/order/business rule, server payload, persistence contract or price visibility behavior changed.
- File changed: `src/components/Storefront.tsx`. Code commit: `a6101171ee7fe3fe75b3240dbdc57a263cbd4e67`.
- State: `IMPLEMENTED_ON_MAIN / ACCEPTANCE_PENDING`; no runtime PASS is claimed.

## Delivery boundary

- No tests, Playwright, E2E, build, lint, typecheck, CI, CodeInspector, database application, Bolt sync, Preview, production or Vercel operation was run for BODY-040.
- This checkpoint records the already-merged product-code change; it does not alter the concurrent BODY-039 product-save contract entry below.
- Project-wide 95% P1 completion remains unclaimed.

## Next P1 action

Continue from the latest live `main` with the next concrete, non-P3 workflow gap. Preserve all concurrently merged product-save work and do not repeat accepted BODY-032 through BODY-040 absent a reproducible defect.

---

# P1 ACTIVE CHECKPOINT OVERRIDE — 2026-11-06 — BODY-COMPLETION-ON-MAIN-039

- Repository: `Report-Engainall/Nasr1`; branch: `main`.
- Main SHA at this checkpoint base: `a6101171ee7fe3fe75b3240dbdc57a263cbd4e67`.
- P1 product-code commit: `a6101171ee7fe3fe75b3240dbdc57a263cbd4e67`.
- P1 scope: storefront feedback semantics for the BODY-036 alternate-unit selection flow.

## BODY-039 — truthful success/error feedback for alternate-unit additions

- Corrected the existing storefront action banner so successful package-to-base-unit additions render with a polite success status and positive visual treatment.
- Quantity, stock, conversion and RPC failures continue to render as assertive error alerts. The selected package quantity and base-unit equivalent confirmation are no longer presented as a stock/error warning.
- File changed: `src/components/Storefront.tsx`; no business rule, server payload, cart contract, pricing or stock state was changed.
- State: `IMPLEMENTED_ON_MAIN / ACCEPTANCE_PENDING`; no browser/runtime PASS is claimed.

## Delivery boundary

- No tests, Playwright, E2E, build, lint, typecheck, CI, CodeInspector, database application, Bolt sync, Preview, production or Vercel operation was run for BODY-039.
- The central acceptance matrix and general execution-state file remain unchanged.
- Project-wide 95% P1 completion remains unclaimed.

## Next P1 action

Continue from the latest live `main` with the next concrete non-P3 workflow gap; do not repeat BODY-032 through BODY-039 absent a reproducible defect.

---

# P1 ACTIVE CHECKPOINT OVERRIDE — 2026-11-06 — BODY-COMPLETION-ON-MAIN-039

- Repository: `Report-Engainall/Nasr1`; branch: `main`.
- Main SHA at checkpoint base: `f511ab5b76d2d3086efbdc0388853dbcb3b35fd5`.
- P1 code commits: `1467ca00a6360670f5bd9e8726bbea181ac5ebf8`, `372eccf99d94a67f833d77b1cc1550c5b202d08a`, `0287ffd14dda6f2d41ad4984f615e66d11dc5a31`, `d876b2183e13113fabff537f11e0e0202ea14ecc`, `85861a24932ce85b4a2748dc71ec113d357929db`, `71f59afdafbbbb89c4fcc5dd6e835e3a5680ac37`.
- P1 owns the active product editor and catalog write boundary. No P3-owned file or engine was changed.

## BODY-039 — atomic product create/edit contract and product description

- Added `20261106130000_admin_product_full_metadata_atomic_save.sql` to restore the complete payload contract of `save_admin_product_with_metadata` while also supporting `p_product_id = NULL` for creation.
- The wrapper delegates core product identity, category eligibility, price-grid persistence, optimistic stale-price checks and core audit to the existing `save_admin_catalog_product` command. It strips only the six metadata keys before delegation, then persists the optional metadata fields inside the same database transaction.
- Preserved/validated `name_en`, `sku`, `is_featured`, `sort_order`, `min_order_quantity` and `order_quantity_multiple`; absent optional values are preserved on edit and retain database defaults on create. The wrapper enforces active same-tenant admin/manager authorization and writes before/after metadata audit records.
- Routed active ProductModal creation through the API's `createProduct()`, and refactored that API to use `saveAdminCatalogProduct()` and the same SECURITY DEFINER RPC; the direct `products` INSERT path was removed from this API function.
- Product creation now requires and captures all four persisted prices (base, جملة الجملة, الجملة, التجزئة) rather than silently copying one tier into the others. The existing image-persistence flow continues with the server-confirmed product ID.
- Added product description editing (maximum 2,000 characters) to the existing product modal. Aligned name/barcode limits with server validation and cents validation with JavaScript floating-point precision.
- The creation API respects the selected active/inactive state. If the server confirms creation but the follow-up staff read is unavailable, the UI receives the saved product ID in the error message and is instructed to refresh before retrying, preventing an unknown duplicate create.
- Preserved the legacy admin page's existing command use: helper metadata fields are optional and omitted fields are not overwritten during edit.
- Files: `src/components/AghbariApp.tsx`, `src/lib/api.ts`, `src/lib/admin-catalog-commands.ts`, `supabase/migrations/20261106130000_admin_product_full_metadata_atomic_save.sql`.
- Scoped functions closed: product creation through the canonical atomic writer; product metadata edit contract; description entry/edit; initial four-tier price capture. These are four bounded capabilities, not a project-wide completion percentage.
- Migration status: `SOURCE_ONLY / NOT_APPLIED`. It has not been applied to any database or synchronized into Bolt.

## Delivery boundary

- No tests, Playwright, E2E, build, lint, typecheck, CI, CodeInspector, migration application, Bolt sync, Preview, production or Vercel operation was run. No runtime PASS is claimed.
- No direct client product INSERT remains in `createProduct()`; no new CRUD route, parallel pricing model, dependency, or P3 file was added.
- Project-wide 95% P1 completion is not claimed: the full denominator of remaining executable P1 requirements has not been established.

## Next P1 action

Continue from the latest `main` and take the next concrete, non-P3 commerce/administration gap. Keep DLV-011 PARTIAL until each role/template output has source-backed acceptance; do not count source-only migrations as runtime-applied.

---

# P1 ACTIVE CHECKPOINT OVERRIDE — 2026-11-06 — BODY-COMPLETION-ON-MAIN-037

- Repository: `Report-Engainall/Nasr1`; branch: `main`.
- P1 code commit: `10a29f0f6368dce1525cee87cc1373b48bdd9c36` (parent `888d4f84acb881e3a1fb41c97ee379c53951fe6c`).
- P1 owns Data Center category form integration; the existing server RPC/command and database schema were reused.

## BODY-037 — category hierarchy and code in the existing create form

- Expanded the existing Data Center category form to capture the optional category code and optional active parent category.
- Calls the existing `createAdminCatalogCategory(name, parentId, code)` server command; it does not create a second category CRUD path or a new RPC.
- Validates the returned category ID/name/created flag, clears the form and refreshes the current category list. A duplicate existing category under the same parent is reported as existing rather than as a new creation.
- Shows the parent-category context in the existing list.
- File changed: `src/components/AghbariApp.tsx`.
- Scoped gap closed: the existing create UI now exposes both server-supported parent and code inputs (1 bounded form-contract gap).

---

# P1 ACTIVE CHECKPOINT OVERRIDE — 2026-11-06 — BODY-COMPLETION-ON-MAIN-038

- Repository: `Report-Engainall/Nasr1`; branch: `main`.
- Main SHA at this checkpoint base: `4d884bf48737ba7d246a918cb8919d8aa1c669f0`.
- P1 product-code commit: `4d884bf48737ba7d246a918cb8919d8aa1c669f0`.
- P1 scope: customer account statement and payment-history presentation. Existing customer statement RPC remains the source of truth.

## BODY-038 — expose individual customer payment entries in the account statement

- The existing `get_customer_account_statement` RPC already returned customer-scoped payment rows (`id`, `invoice_id`, `amount`, `paid_at`), but the statement UI showed only aggregates within invoice rows and a payment count.
- Added a dedicated `سجل الدفعات المسجلة` table to the existing customer account statement. Each row uses the returned payment identity/date/amount and resolves its invoice number and currency only from the same RPC's invoice detail set.
- Where the corresponding invoice is outside the bounded invoice-detail set, the row explicitly displays the invoice/value/currency as unavailable rather than inventing or mislabeling a currency. Existing partial-detail warnings and server-computed ledger totals remain unchanged.
- File changed: `src/components/CustomerWorkflows.tsx`. No table, RPC, schema, direct payment-table query, or duplicate payment ledger was added.
- Scope: one customer payment-history presentation gap closed using the established, tenant-scoped statement source. State: `IMPLEMENTED_ON_MAIN / ACCEPTANCE_PENDING`; no runtime PASS is claimed.

## Delivery boundary

- No tests, Playwright, E2E, build, lint, typecheck, CI, CodeInspector, database application, Bolt sync, Preview, production or Vercel operation was run for BODY-038.
- No customer payment mutation was added; this is a read-only rendering of existing payment records.
- The project-wide 95% P1 target remains unclaimed; there is no complete, evidence-backed denominator of all outstanding P1 functions.

## Next P1 action

Continue from the latest live `main` with the next independently confirmed P1 workflow gap. Do not repeat BODY-032 through BODY-038 absent a reproducible defect.

---

# P1 ACTIVE CHECKPOINT OVERRIDE — 2026-11-06 — BODY-COMPLETION-ON-MAIN-037

- Repository: `Report-Engainall/Nasr1`; branch: `main`.
- Main SHA at this checkpoint base: `c52bfaf88de3313f3b3f2a16fc7dd1f5241e15b7`.
- P1 product-code commit: `c52bfaf88de3313f3b3f2a16fc7dd1f5241e15b7` (parent `0287ffd14dda6f2d41ad4984f615e66d11dc5a31`).
- P1 scope: customer order history, order-detail lifecycle display and customer print projection. No database command, P3 engine, RPC or migration was changed.

## BODY-037 — customer order lifecycle labels and progress

- Reused the canonical `ORDER_STATUS_LABELS` map from `src/lib/types.ts` in both the customer order list and the customer order print-document projection; retained the legacy status aliases already used by older orders.
- Expanded the detail progress mapping to cover the active lifecycle values: `new`, `received`, `reviewing`, `approved`, `preparing`, `prepared`, `dispatched`, `delivered`, and `invoiced`, while preserving legacy `pending`, `confirmed`, `processing`, and `shipped` values.
- The current step is now marked distinctly. Returned-for-adjustment states produce an explicit customer notice; `cancelled` and `rejected` are shown as terminal outcomes rather than leaving every progress indicator silently unfinished.
- Files changed: `src/components/CustomerOrders.tsx`, `src/lib/customer-order-print.ts`. No order state is mutated and no status is inferred from dates or history beyond the current server status.
- Scope: one confirmed status/progress-display gap closed in source. State: `IMPLEMENTED_ON_MAIN / ACCEPTANCE_PENDING`; no browser/runtime PASS is claimed.

## Delivery boundary

- No tests, Playwright, E2E, build, lint, typecheck, CI, CodeInspector, database application, Bolt sync, Preview, production or Vercel operation was run for BODY-037.
- The central acceptance matrix and general execution-state file were not changed.
- The project-wide 95% P1 target remains unclaimed; no complete denominator of remaining P1 functions has been established.

## Next P1 action

Continue from the latest live `main` with the next concrete non-P3 workflow gap. Do not repeat BODY-032 through BODY-037 absent a reproducible defect.

---

# P1 ACTIVE CHECKPOINT OVERRIDE — 2026-11-06 — BODY-COMPLETION-ON-MAIN-036

- Repository: `Report-Engainall/Nasr1`; branch: `main`.
- Main SHA at this checkpoint base: `45c59af758b5032fb7d891c92a57d41d8018d453`.
- P1 product-code commit: `90c8791458f08e46d0bd080890e381d8dcd5a291` (parent `b2b38323addd291156e8da03b064d2f1f69de632`).
- P1 owns the storefront presentation and unit-selection integration. No P3 intelligence files, engines, DTOs, RPCs or migrations were changed.

## BODY-036 — storefront alternate-unit selection and base-unit conversion

- Integrated the existing `fetchProductUnitOptions()` read client into the customer product-detail workflow. The page loads the same-tenant product's saved base/alternate-unit list through the existing `get_product_unit_conversions` RPC; no alternate catalog source was introduced.
- Added a customer-facing unit selector for the base unit and configured alternate units. The selector displays the exact integer conversion factor (for example, one carton equals N base units).
- The selected displayed quantity is converted to its exact base-unit quantity before it enters the existing cart. The UI evaluates the converted quantity against the persisted product minimum, order multiple, available stock and the existing 10,000-unit order bound. Choices that cannot satisfy the current quantity policy and available stock are disabled.
- The existing server-side cart, `validate_checkout_cart`, pricing preview and `submit_customer_order` paths remain unchanged and continue receiving base-unit quantities. This matches the existing `product_unit_conversions` contract: stock, price and order quantities remain denominated in `products.unit`. The selected alternate-unit label is shown in the add confirmation; it is not persisted as a separate order-line unit selection.
- If the unit read is unavailable, the customer can still use the base unit; no fake alternate options or success states are shown.
- File changed: `src/components/Storefront.tsx`. Existing read contract/source reused: `src/lib/product-unit-conversions.ts`; migration `supabase/migrations/20261106113000_product_alternate_unit_conversions.sql` was not modified or applied.
- Scope: one concrete customer purchase-flow capability implemented on main. State: `IMPLEMENTED_ON_MAIN / ACCEPTANCE_PENDING`. The new selection/conversion UI was not tested or run in Bolt during this source-only delivery; no runtime PASS is claimed.

## Delivery boundary

- No tests, Playwright, E2E, build, lint, typecheck, CI, CodeInspector, migration application, Bolt sync, Preview, production or Vercel operation was run for BODY-036.
- No new dependency, direct table access, alternate cart/order path, paid provider or P3-owned change was introduced.
- The requested project-wide 95% P1 completion target remains unclaimed; this delivery does not establish a complete denominator of outstanding P1 functions.

## Next P1 action

Continue from the latest live `main` with the next concrete non-P3 commerce/administration workflow gap. Do not repeat BODY-032 through BODY-036 absent a reproducible defect, and leave the central execution state and acceptance matrix to their designated owner.

---

# P1 ACTIVE CHECKPOINT OVERRIDE — 2026-11-06 — BODY-COMPLETION-ON-MAIN-035

- Repository: `Report-Engainall/Nasr1`; branch: `main`.
- Main SHA at this checkpoint base: `df9c67791fd9d95dda00b9563bae57108048102b`.
- P1 code commit: `df9c67791fd9d95dda00b9563bae57108048102b` (parent `a1a188779357ae05b63b3169a1992115ac5d2c45`).
- P1 owns catalog category UI and command integration. No P3 intelligence file or contract was changed.

## BODY-035 — restore archived catalog categories

- Implemented the missing restore transition for categories already soft-archived by the existing catalog command. Admin/manager users now see a restore action on archived categories in the existing Data Center list; the same tenant-scoped `fetchCategories` staff read already includes archived rows.
- Added `restore_admin_catalog_category(uuid)` as an extension of the existing audited SECURITY DEFINER catalog command family. It requires an active same-tenant admin/manager, locks and rechecks the category, requires its parent to be active first, serializes with existing create/rename operations, and rejects a conflicting active category name under the same parent rather than merging identities.
- Successful restore updates only `categories.is_active`, writes `catalog.category_restored` to the existing audit log, and returns an explicit confirmation. Repeated calls on an already-active category return `restored: false` without duplicating the audit event.
- The UI validates the response, refreshes the existing category list, prevents concurrent archive/restore/rename actions and reports server conflicts instead of claiming success.
- Files: `supabase/migrations/20261106120000_admin_catalog_category_restore.sql`; `src/lib/admin-catalog-commands.ts`; `src/components/AghbariApp.tsx`.
- Functional scope delivered in this batch: 1 concrete missing restore workflow out of the 1 confirmed gap in the existing category lifecycle surface.
- Migration status: `SOURCE_ONLY / NOT_APPLIED`. The database function has not been applied through Bolt or any live environment.

## Delivery boundary

- No tests, build, lint, typecheck, CI, Playwright, E2E, CodeInspector, database application, Bolt sync, Preview, production or Vercel operation was run. No runtime PASS is claimed.
- No parallel category CRUD, direct authenticated table mutation, package or paid provider was introduced.
- The prior BODY-034 product archive/restore implementation remains on `main`. The project-wide 95% P1 target remains unclaimed because no complete remaining-requirement denominator has been established.

## Next P1 action

Continue from current `main` with the next concrete, source-backed product/admin workflow gap. Preserve existing server command ownership and do not repeat BODY-034/035.

---

# P1 ACTIVE CHECKPOINT OVERRIDE — 2026-11-06 — BODY-COMPLETION-ON-MAIN-034

- Repository: `Report-Engainall/Nasr1`; branch: `main`.
- Main SHA at this checkpoint base: `23642b9cb47991928f913f4e69daab3a8f7ee0a1`.
- P1 product-code commit: `2df652db61b291823111d75f97488f4a7fba0591` (parent `33212afd4b332177a64f18f0cdd2e21ce6a677e7`).
- P1 owns product workflows and UI integration. P3 ownership of intelligence engines, evidence contracts, RPCs and persistence is unchanged.

## BODY-034 — product archive and restore lifecycle

- Replaced the active Products workspace's direct hard-delete action with the existing `archiveAdminCatalogProduct()` command, backed by the tenant-scoped `archive_admin_catalog_product` RPC. The UI validates the returned product ID, inactive state and `archived: true` before announcing success, then refreshes the catalog.
- Added an admin/manager-only restore action using the existing `updateProduct(product.id, { status: 'active' })` path and its established `save_admin_product_with_metadata` server command. The action rejects an unconfirmed product ID, refreshes the catalog and only then reports completion.
- The product table now distinguishes the persisted product lifecycle state (active/archived/unknown) from inventory availability; inventory status remains separately displayed.
- The existing product form exposes active/inactive status only to admin/manager users and persists it through the existing atomic save command. Existing product image upload/removal, price, category and order-quantity flows remain on their established paths.
- Lifecycle buttons are role-gated and serialized per product while a command is in flight. No direct product DELETE, parallel CRUD, SQL migration, new route, package or alternate data source was introduced.
- Files: `src/components/AghbariApp.tsx`; `src/components/TaskCenter.tsx`.
- Functional scope delivered in this batch: 2 concrete lifecycle functions (archive and restore) out of the 2 confirmed gaps in the active product workspace. This is a bounded-scope count, not a project-wide P1 completion percentage.

## Task Center P3 handoff alignment

- The `TaskQualityReviewForm` mount was already present on `main` from P1 commit `4eb080d6ee44a74a36086a6cb9014e8d0fb4004b`; this batch did not recreate it. The import now uses the public `@/components/intelligence` barrel export.
- Existing wiring remains `key={task.id}`, real `task.id`, persisted `task.updated_at`, manager/admin visibility and `loadTasks` after confirmed save. It is not gated by task status, so closed tasks remain reviewable.
- No P3 component, engine, client, DTO, RPC, migration or persistence code was modified.

## Delivery boundary

- No tests, Playwright, E2E, build, lint, typecheck, CI, CodeInspector, database migration/application, Bolt sync, Preview, production or Vercel operation was run. No runtime PASS is claimed.
- No P3-owned file or central execution matrix/state file was changed.
- The overall 95% P1 target is not claimed: this batch did not perform the full remaining-requirement census, and the current evidence does not establish a defensible project-wide denominator.

## Next P1 action

Continue from the latest `main` head and implement the next concrete, non-P3 product gap without repeating accepted workflows. Keep DLV-011 PARTIAL until each required role/template pair has its own source-backed acceptance evidence.

---

# P1 ACTIVE CHECKPOINT OVERRIDE — 2026-11-06 — BODY-COMPLETION-ON-MAIN-033

- Repository: `Report-Engainall/Nasr1`; branch: `main`.
- Latest branch SHA at checkpoint: `86cdb16459cb65b28ca88d45749f751e23557fbf`.
- P1 owns product UI/workspace and workflow integration; P3 retains its intelligence engines, evidence contracts, RPCs and persistence.

## BODY-033 — purchase receipt batch and expiry traceability

- Added `batch_number` and `expiry_date` to saved purchase receipt lines and extended the existing atomic `receive_purchase_order` RPC rather than adding an alternate stock-write path.
- The existing purchase-order receiving UI now captures supplier batch number and expiry date per received line. The API validates trimmed batch length and strict real ISO calendar dates; an expiry date requires a batch number. The database independently validates both and rejects an already-expired batch from being posted into available stock.
- The same-tenant manager/admin saved receipt history and print projection now return batch/expiry values. The receipt history UI shows item-level batch and expiry metadata, and saved receipt A4 print includes both columns.
- The stock movement and aggregate `inventory_balances` update remain in the existing transaction. This delivery stores receipt-line traceability; it does not claim lot-level remaining balance, FEFO/FIFO consumption, or expiry-aware ATP because the current stock reservation/movement model does not supply a lot-allocation ledger.
- Files: `supabase/migrations/20261106101500_purchase_receipt_batch_expiry_traceability.sql`; `src/lib/api.ts`; `src/components/PurchaseOrdersPage.tsx`; `src/lib/purchase-receipt-print.ts`; `src/components/PurchaseReceiptPrintActions.tsx`.
- Commits: migration `08bc08660f0e3a2562e6a8c69be10031980a168c`; API `bb59a109e7bc46138e07149db9d27ac106327df1`; PO UI `7e0ba866fa31db066ad0e5141f4adb740aa9d1af`; receipt projection `ccbb65df213520aa28de9f3f06cf8e815873796e`; print/history UI `6e26470b9fc8b9d6d3f6ed87dd12ea1c21aa26a9`; SQL date-pattern correction `86cdb16459cb65b28ca88d45749f751e23557fbf`.
- Acceptance leaf `DLV-007-PURCHASE-RECEIPT-BATCH-EXPIRY-TRACEABILITY-001`: `IMPLEMENTED_ON_MAIN / ACCEPTANCE_PENDING`. The migration is source-only until Bolt applies it.

## BODY-032 — P3 Task Quality Review Form mount

- Mounted the existing `TaskQualityReviewForm` in each current Task Center card with `key={task.id}`, the real `task.id` and persisted `task.updated_at`, behind the existing manager/admin UI gate. Reuses `loadTasks` after a confirmed save, and remains available for closed tasks.
- No P3 engine, client, DTO, migration or scorecard logic was modified. P3 remains the owner of review evidence, authorization, idempotency and persistence.
- P1 UI commit: `4eb080d6ee44a74a36086a6cb9014e8d0fb4004b`. Source state: `IMPLEMENTED_ON_MAIN / ACCEPTANCE_PENDING`; quality migration remains source-only until Bolt applies it.

## Delivery boundary

- No tests, build, lint, CI, Playwright, E2E, database application, Bolt sync, Preview, production or Vercel operation was performed for BODY-032/033. No runtime PASS is claimed.
- No new package, paid provider, or Vercel credit was used.

## Next P1 action
Continue the next uncovered non-intelligence product capability. Do not reopen BODY-032/033 absent a reproducible issue. Preserve P3 ownership.

---

# Historical P1 checkpoint — BODY-COMPLETION-ON-MAIN-031

- Repository: `Report-Engainall/Nasr1`; branch: `main`.
- Latest P1 code delivery: `51daf271923dc89a654b35890b2f2faf3997dbd7`.
- No P3-owned engine, RPC, DTO or migration file was modified in BODY-031.

## BODY-031 — staff receivables-aging XLSX

- Added a role-gated Excel action to the existing Staff Finance receivables-aging report beside its Arabic print output. It reuses the exact `fetch_staff_receivables_aging` payload already loaded by the page; no alternate query, server mutation or copied data source was introduced.
- The workbook contains three sheets: report scope, the full per-currency summary returned by the server, and the currently displayed 200-row invoice-detail page.
- The projection validates the server page cursor/has-more contract, unique invoices and currencies, age-bucket/date semantics, exact-cent amount reconciliation, and the sum of all six age buckets against each currency's full open balance. It also reconciles the per-currency invoice counts to the source's full open-invoice count.
- It explicitly distinguishes complete currency summary from bounded current-page detail; preserves unknown due dates in their own bucket, keeps currencies separate, writes business text as literal cells, and excludes internal invoice/customer/tenant/profile identifiers, costs and margins.
- Files: `src/lib/receivables-aging-xlsx.ts`; integrated in `src/components/CustomerWorkflows.tsx`.
- Source commits: XLSX builder `34eb38271f6abaa79b0cf048c5eff6173bc7238e`; Staff Finance UI `ec3bc25982caf13896ef59a74a31474a6e0ba8e9`; refresh error-state fix `51daf271923dc89a654b35890b2f2faf3997dbd7`.
- Acceptance leaf: `DLV-011-RECEIVABLES-AGING-XLSX-001` — `IMPLEMENTED_ON_MAIN / ACCEPTANCE_PENDING`.
- No migration, package, paid provider or Vercel operation was added. No tests/build/lint/CI/browser/E2E/database/Bolt/Preview operation was run; no runtime PASS is claimed.

## Next P1 action
Mount P3's newly delivered `TaskQualityReviewForm` in the existing Task Center per `docs/execution/contracts/P3_TASK_QUALITY_REVIEW_P1_HANDOFF.md`. P1 owns only the product UI integration; P3 retains engine, RPC, DTO and persistence ownership.

---

# Historical P1 checkpoint — BODY-COMPLETION-ON-MAIN-030

- Repository: `Report-Engainall/Nasr1`; branch: `main`.
- Latest P1 product-code SHA: `61c40c123b2116ac1b6d149ccb94bcc194417dff`.
- P1 owns customer-facing product output; P3 ownership and source intelligence contracts were not touched.

## BODY-030 — customer account statement XLSX

- Added a five-sheet Arabic XLSX download to the existing customer `/statement` workspace beside the existing PDF and browser-print outputs.
- Reuses the exact `get_customer_account_statement()` response already loaded by the screen; no second query, database migration, or alternate balance calculation was added.
- The workbook separates full-ledger per-currency balances from bounded detail sheets for invoices (up to 200), payments (up to 500) and posted credit memos (up to 500). It carries the server snapshot time, discloses each detail bound, preserves currency separation and leaves unknown amounts blank.
- The export fails closed unless the full-ledger summary, as-of timestamp and credit-detail array are present and valid. It validates invoice/payment/credit identities and cent precision, checks the existing per-invoice balance contract, does not recompute full balances from bounded details, and omits internal IDs, tenant/profile data, cost and margin fields. OOXML business text is written as inline strings.
- Files: `src/lib/customer-account-statement-xlsx.ts`; integrated in `src/components/CustomerWorkflows.tsx`.
- Source commits: XLSX builder `61c40c123b2116ac1b6d149ccb94bcc194417dff`; customer statement UI `6e8a0ccec58587d47e5e278a42b6fe2d4f2a4fb3`.
- Acceptance leaf: `DLV-011-CUSTOMER-ACCOUNT-STATEMENT-XLSX-001` — `IMPLEMENTED_ON_MAIN / ACCEPTANCE_PENDING`.
- No migration, dependency, paid provider or Vercel operation was added. No tests/build/lint/CI/browser/E2E/database/Bolt/Preview operation was run in this source batch; no runtime PASS is claimed.

## Next P1 action
Continue the next uncovered non-intelligence product workflow/output pair. Preserve all current customer statement PDF and print behavior.

---

# Historical P1 checkpoint — BODY-COMPLETION-ON-MAIN-029

- Repository: `Report-Engainall/Nasr1`; branch: `main`.
- Latest P1 product-code SHA: `82424db8079c512f84e87b69715453fe24b6330b`.
- Only P1 and P3 implementer ownership remains. No P3-owned engine, DTO, client or migration file was edited in this delivery.

## BODY-029 — Task Performance Scorecard workspace mount

- Mounted the existing P3 `TaskPerformanceScorecard` once in `src/components/intelligence/IntelligenceWorkspace.tsx`.
- Connected only `fetchTaskPerformanceScorecard()`; tenant and visible-role scope remain resolved by the server RPC. No direct `ai_tasks` / `audit_logs` query, tenant ID, task identifier, title or assignee metadata was added to the UI.
- Added generation-safe loading/error handling and real refresh/retry. Maps source `UNAVAILABLE` (migration not applied) to the component's unavailable state, permission denial and other errors to error state, and passes the validated server DTO only when the fetch client returns `ok: true`.
- Preserved the existing admin/manager intelligence-workspace gate and the scorecard's explicit limitations for partial reopen history and unavailable measures.
- Source commit: `82424db8079c512f84e87b69715453fe24b6330b`; changed file: `src/components/intelligence/IntelligenceWorkspace.tsx`.
- State: `IMPLEMENTED_ON_MAIN / ACCEPTANCE_PENDING`. P3 migration `20261106060000_intelligence_task_performance_scorecard.sql` and related audit-window migrations remain source-only until Bolt applies them. No tests/build/lint/CI/browser/E2E/database/Bolt/Preview/Vercel operation was run; no runtime PASS is claimed. No Vercel credit, new dependency or paid provider used.

## Next P1 action
Continue the next uncovered non-intelligence product capability; preserve the existing P3 engine and its evidence contracts.

---

# Historical P1 checkpoint — BODY-COMPLETION-ON-MAIN-028

- Repository: `Report-Engainall/Nasr1`; branch: `main`.
- Product code SHA: `c24cbe1a4f324dfefd4418632de133eb23e303b0`.
- Ownership remains P1 product UI/workspaces and P3 intelligence engines/evidence/persistence. No P3-owned file was changed.

## BODY-028 — customer campaign pricing preview parity

- Repaired the mismatch between the existing order-submit promotion resolver and the customer cart/order-review preview. The preview now calls the same internal `resolve_active_promotion_price` function used by `place_order`.
- The server response exposes gross unit price, actual allowed discount per unit/line, campaign title, net unit price, net line total, aggregate discount and a versioned response contract. The existing cost-floor cap, one-best-matching-campaign rule, tenant scope, customer-member revocation lock and `show_price_in_cart / show_price_in_orders` fail-closed gate remain in force.
- The UI validates `promotion_pricing_version=1`, renders source-returned campaign discounts and net totals, and hides stale/legacy preview responses rather than presenting gross prices as final prices. Promotion admin/storefront copy now reflects server-applied pricing.
- Main commits: migration `26c25943018ab9e472f77c783ae9710fb85a82c6`; strict preview DTO `2da88009f487565cc9fb75fb6791e232416997da`; pricing UI `9fad6191d1fcc8125fb1c0953b4c2122df4b30d2`; admin campaign copy `276a48afadddb50b9031e58e52cf450d76087a0c`; storefront offer copy `c24cbe1a4f324dfefd4418632de133eb23e303b0`.
- Main files: `supabase/migrations/20261106082000_customer_order_pricing_preview_promotion_snapshots.sql`, `src/lib/storefront-price-visibility.ts`, `src/components/CustomerOrderPricingPresentation.tsx`, `src/components/PromotionManager.tsx`, `src/components/StorefrontOffersPage.tsx`.
- State: `IMPLEMENTED_ON_MAIN / ACCEPTANCE_PENDING`. The migration is source-only until Bolt New applies it. No tests/build/lint/CI/browser/E2E/database/Bolt/Preview/Vercel operation was run in this source batch; no runtime PASS is claimed. No Vercel credits, paid provider or new dependency used.

## Next P1 action
Continue the next genuinely uncovered non-intelligence product capability from the acceptance matrix. Preserve prior routes and owner boundaries; do not reopen BODY-028 unless a regression is reproduced.

---

# Historical P1 checkpoint — BODY-COMPLETION-ON-MAIN-027

- Repository: `Report-Engainall/Nasr1`; official branch: `main`.
- Main code SHA: `a8273d0bf7d42a06f1be5c4df2c93e28a0ea5121`.
- Exactly two implementers remain active: P1 (product workspace/UI/navigation) and P3 (intelligence engines/evidence/DTOs/persistence). Do not create a P2 stream or recreate delivered P3 logic.

## BODY-026 — Arabic natural-language administrative assistant mount

- Mounted the existing exported `NaturalLanguageAssistant` once inside `src/components/intelligence/IntelligenceWorkspace.tsx`, behind the existing admin/manager workspace guard.
- Added typed optional callbacks and wired them in `src/components/AghbariApp.tsx` to existing finance and purchase-order workspaces. Navigation notice preserves the source invoice/order reference; it does not claim automatic selection of the target row.
- Preserved P3's six allow-listed read intents, server-side finance/procurement role checks, tenant derivation, read-only behavior, 100-invoice/500-PO partial-coverage disclosure and unsupported due-date inference.
- Commits: `26df2ad7d12fa63c5274dc33949e0da0996370a5`, `42f26dd1b51b63b9840b713d1c4019becda985e7`. No new RPC, migration, route, provider, SQL generation or write operation.

## BODY-027 — supplier performance intelligence mount

- Mounted `SupplierPerformancePanel` and connected P3's existing `fetchSupplierPerformance` client inside the same IntelligenceWorkspace.
- Reused the existing UTC period controls (`processFrom` / `processTo`); date changes reload supplier performance. Added independent loading/error/unavailable/retry state and a 100-supplier request.
- Supplies only the existing authorized purchase-order navigation callback; preserves the manager/admin UI guard and server role/tenant enforcement.
- Preserves full-receipt lead-time rules, awarded-quote explicit promised-term rules, minimum sample size, partial-population/withheld reasons, and no supplier prices/payables/payments or heterogeneous UOM aggregation.
- Source commit: `a8273d0bf7d42a06f1be5c4df2c93e28a0ea5121`. Migration `20261106040000_intelligence_supplier_performance.sql` remains source-only until Bolt applies it.

## Next action and boundary

- Next P1: continue the next genuinely uncovered non-intelligence product capability; do not reopen these integrations or accepted supplier workflows/reports.
- P3 continues Section 57 only with additional source-backed allow-listed read intents, then the next canonical intelligence section.
- No tests/typecheck/lint/build/CI/browser/E2E/CodeInspector/database/Bolt/Preview/Vercel/production operation was run in this source batch. No PASS or production acceptance claimed. No Vercel credits, paid provider or new dependency used.
- GitHub commits are recorded; notification receipt depends on repository watch settings. Bolt New owns main sync, migration application, database/runtime connection and final integrated acceptance.

---

# P1 ACTIVE CHECKPOINT OVERRIDE — 2026-11-05 — BODY-COMPLETION-ON-MAIN-025 — SUPPLIER QUOTE COMPARISON A4 / XLSX

- Repository: `Report-Engainall/Nasr1`; branch: `main` only.
- Only two implementer roles are active: P1 and P3. P1 owns product-facing UI/workspaces and operational outputs; P3 owns intelligence engines, evidence lineage, persistence and read DTOs.
- BODY-025 adds a saved decision-support document to the existing supplier quote comparison workspace. It does not add a new quote model, database RPC, migration, supplier decision engine or award path.

## Delivered on main — BODY-025

1. Added `src/lib/supplier-quote-comparison-print.ts` as a validated projection over the same `SupplierQuote[]` snapshot loaded by `fetchSupplierQuotes()`. It validates UUID source references, dates, currency, quantities, cent-accurate line totals and product identity consistency. Internal UUIDs are used only for grouping and are not included in output.
2. Added `src/lib/supplier-quote-comparison-xlsx.ts`: four sheets for report scope, supplier offers/terms, product comparison by currency, and detailed offer lines. Business text is emitted as literal cell text; no supplier notes are included.
3. Added `src/components/SupplierQuoteComparisonPrintSheet.tsx`: Arabic RTL A4 landscape output from the same validated projection.
4. Integrated `تصدير مقارنة Excel` and `طباعة / PDF` in `src/components/SupplierQuoteWorkspace.tsx` under its existing admin/manager role gate, using the already-fetched source snapshot. Added scoped print lifecycle and UI feedback.
5. The report keeps currency/product groups separate. Only quotes whose source status is `received` count toward the lowest recorded unit cost; awarded/expired quotes remain visible but are not ranked. The report explicitly states that lowest cost does not imply best quality or automatic award. It omits notes, UUIDs and internal purchase-order IDs.

## Source boundaries / acceptance

- No migration, RPC, source-table query or write path was added. Existing supplier quote capture and atomic award-to-draft-PO flow remain the source of truth.
- Feature commits: projection `f9fb84bb0e3dccc8e37b6277e5992be66592d1c1`; XLSX `7a61a5f92df2b9d4c8f488b74491e0601eda36da`; print sheet `a3bb03dd2c9eb1495019833ac2add8755c30707f`; UI `21c35a08da1e01c392962170e066dcc522a09fa3`; strict UUID validation fix `0c6b00322a737a042d1b5fc6aa30304299dfeb17`; A4 CSS `4e7e01587b6129a812f9280ed7a4a3b917006038`.
- Exact final blobs: projection `2cf96e3278d6464da1dddfd8a6f887e0601a6a70`; XLSX `ff947086bd776d0e657f7e72d413c9e540d3e8f8`; print sheet `02edc95df6446d58b6116501157eaf22a4c31e6c`; workspace `69dfed1ee144083196f277196aac4dbf650e5e5c`; CSS `cf6e0928af77d64ca4cae0de60f7a7f02b1c074e`.
- Acceptance: `IMPLEMENTED_ON_MAIN / ACCEPTANCE_PENDING`. No tests, build, lint, CI, browser, database operation, Bolt runtime or Vercel preview was run in this source phase; no PASS or production acceptance is claimed. No Vercel credits or paid providers were used.

## Next P1 body cursor

Continue the next genuinely uncovered mandatory non-intelligence product requirement. Do not rebuild supplier quote capture/award, supplier invoice/payment/return workflows, service desk, session inventory, customer portal or P3 intelligence.

---

# P1 ACTIVE CHECKPOINT OVERRIDE — 2026-11-05 — BODY-COMPLETION-ON-MAIN-024 — DEVICE SESSION KEYSET PAGINATION

- Repository: `Report-Engainall/Nasr1`; branch: `main` only.
- Only two active implementer roles: P1 and P3. P1 owns UI/workspaces and product interfaces; P3 owns intelligence engines, evidence lineage and intelligence persistence/DTOs.
- BODY-024 closes the product-side truncation at 200 active organization sessions. It replaces the non-paginated query contract with a stable server keyset cursor and exposes page continuation in the existing DeviceManagement screen. Existing security roles and revocation workflows are preserved.

## Delivered on main — BODY-024

1. Added `supabase/migrations/20261106000000_device_session_keyset_pagination.sql`: replaces `list_organization_sessions(integer)` with an admin-only same-tenant SECURITY DEFINER function accepting page size plus the composite cursor `(last_activity_at, created_at, session_id)`. Sort and cursor comparison use the same descending tuple; session response rows retain the existing shape; all three cursor fields must be null or all supplied. Page size is bounded to 201 to support a 200-row display plus one sentinel.
2. Updated `src/components/DeviceManagement.tsx`: first page requests 201, displays 200, and keeps the sentinel only as proof that more records exist. A load-more action sends the last visible row's exact cursor and appends unique session rows. Refresh starts from page one; a failed continuation keeps already-loaded pages and leaves the same cursor available for retry.
3. Updated `src/test/device-management-session-cap.test.tsx` to describe the sentinel, exact continuation cursor and final-page behavior.
4. Updated `scripts/test-session-management.mjs` with SQL-level cursor continuation acceptance, ordering/no-repeat expectations and the new maximum of 201. The scripts/tests are source specifications only; they were not executed.
5. Existing exact-target revocation, same-account sibling protection, self-scoped bulk sign-out and tenant/admin authorization were not rebuilt or weakened.

## Source boundaries

- Valid timestamped migration file creation commit: `5e932cee090f33261f2417ba6aeec789328a0e2a`; removal of the invalidly timestamped predecessor commit: `ff852f40a47492e9409d207ac0c76f8ef2359b78`.
- UI commit/blob: `f782f04ccb009d107169ff05a87812ed47f288d3` / `48d7186cdf276fa348bd5481a30cfb3b3ecfde93`.
- Focused UI acceptance source: pagination assertions commit `8870c82533b13ea93b0e7ddf9ebfcf80e25b3077`; final suite-title/blob update `0940cce583bf826b6ecec51d86aebffe806ee586` / `23d3e81219ee62148f1a9c081f0790eb81faac37`.
- PostgreSQL acceptance-source commit/blob: `ad744b92ef058a3cff9bb1f4ba5c494d748613f0` / `8d37f9d5daecda5bc4eecaf4396a116c4efc62d1`.
- Acceptance state: `IMPLEMENTED_ON_MAIN / ACCEPTANCE_PENDING`. The migration has not been applied to a database; no tests/build/lint/CI/browser/E2E were run. Bolt New must sync main, apply the migration and validate the cursor against its Auth sessions table before the new list is considered runtime complete.
- No Vercel credits, preview deployment, paid API provider or external notification service was used.

## Next P1 body cursor

Continue with the next untouched mandatory non-intelligence product capability. Do not rebuild session identity, individual or bulk revocation, existing offline catalog scope/cart safeguards, customer service, supplier documents or P3 intelligence engines.

---

# P1 ACTIVE CHECKPOINT OVERRIDE — 2026-11-05 — BODY-COMPLETION-ON-MAIN-021 — CUSTOMER SERVICE DESK SLA REPORT PRINT/XLSX


## P1 PRODUCT DELIVERY — 2026-11-05 — BODY-COMPLETION-ON-MAIN-023 — SUPPLIER CREDIT NOTE RECONCILIATION A4 / XLSX

- Repository: `Report-Engainall/Nasr1`; branch: `main` only.
- Added finance document output to the existing manager/admin/accountant supplier-credit-note matching workspace; no new source data, database function or migration was introduced.
- New files:
  - `src/lib/supplier-credit-note-document.ts` — finance document projection with source/actual/variance reconciliation; suppresses a declared variance when it does not match actual minus source to the cent.
  - `src/lib/supplier-credit-note-xlsx.ts` — two-sheet Arabic Excel output for the saved reconciliation summary and immutable review history.
  - `src/components/SupplierCreditNoteDocumentActions.tsx` — Arabic RTL A4 print/Save-as-PDF and workbook download.
- Existing UI integration: `src/components/SupplierCreditNoteWorkspace.tsx`; each persisted supplier credit-note reconciliation card exposes the actions under the workspace's existing admin/manager/accountant gate.
- Privacy and accounting boundaries: tenant/actor/account UUIDs and other internal IDs are omitted; no account mapping or posting action is created. Source journal and supplier journal statuses are displayed independently. A draft journal is explicitly not described as posted. Missing amounts remain blank; inconsistent variance is withheld. Historical review reasons and dates are retained in the output.
- Code commits on main: projection `88629fb38f1756800ef1834deb5ddc8f7c2a5127`; workbook `e6813113cd911887c5e1a904a665fd161d3542a5`; action component `d99a3ee1b6fb9af8b3dcb0694d0a425934dbc9a5`; workspace integration `e8b8ee3af443146679f1774441d235e6f8876e65`; projection cleanup `f0f2a5315521b4302ad53e2b02ec03257228f4ba`.
- Acceptance: `IMPLEMENTED_ON_MAIN / ACCEPTANCE_PENDING`. No tests, typecheck, build, lint, CI, browser, database or Bolt runtime operation was run in this product-body batch; no PASS or production acceptance is claimed. Bolt New owns connected runtime acceptance.
- No migration, new dependency, external provider, Vercel operation or Vercel credit was used.
- Next P1 body: continue the next genuinely uncovered mandatory customer/staff/admin/warehouse/finance operational workflow or report; do not rebuild the existing workflows or document outputs recorded in BODY-019 through BODY-023.

## P1 PRODUCT DELIVERY — 2026-11-05 — BODY-COMPLETION-ON-MAIN-022 — SUPPLIER RETURN A4 / XLSX

- Repository: `Report-Engainall/Nasr1`; branch: `main` only.
- Added one saved-record operational document to the existing manager/admin supplier-return workspace; the existing return capture/post flow and all database contracts are reused.
- New files:
  - `src/lib/supplier-return-document.ts` — strict projection for one saved supplier return; validates identity labels, dates, currency, unique item rows, source/returned quantities and source cost consistency. Cost fields are withheld as a whole unless every line and the persisted header total reconcile; unknown is never converted to zero.
  - `src/lib/supplier-return-xlsx.ts` — two-sheet Arabic OOXML workbook (return summary and item lines), using the existing `onyx-export` XML/ZIP writer; IDs, actor metadata and internal notes are excluded.
  - `src/components/SupplierReturnDocumentActions.tsx` — Arabic RTL A4 print/Save-as-PDF and Excel download actions for a saved return.
- Existing UI integration: `src/components/SupplierReturnWorkspace.tsx`; each saved return now exposes the document actions beside the existing draft-post control or posted-state disclosure. The route remains guarded by the existing admin/manager role check and server RPC.
- Explicit state semantics: a draft is identified as unposted and carries no inventory/accounting effect; a posted return is identified as posted to inventory only. The document does not claim a supplier credit note or journal is posted. Internal notes and internal UUIDs are not printed/exported.
- Code commits on main: projection `3b20fa0e6dc15f06bd89782f48fe1dc7ead540ba`; XLSX `bb491ae5055a1dd225a641dedbd33e1ffb32a31b`; action component `0b92810f37d0604c198ee4a446f6188a912a2970`; workspace integration `c11c28010ddb7c258eff6ece572817384f99c04e`.
- Acceptance: `IMPLEMENTED_ON_MAIN / ACCEPTANCE_PENDING`. No tests, typecheck, build, lint, CI, browser, database or Bolt runtime operation was run in this product-body batch; no PASS or production acceptance is claimed. Bolt New owns migration application and connected runtime acceptance.
- No database migration, new dependency, external provider, Vercel operation or Vercel credit was used.
- Next P1 body: continue the next genuinely uncovered mandatory purchasing/warehouse/customer/staff/admin operational report or product workflow; do not rebuild purchase receipt print, purchase-order print/XLSX, supplier invoice/payment/account activity outputs, supplier return document, inventory transfer print/XLSX, admin sales-order print or customer service desk report.



- Repository: `Report-Engainall/Nasr1`; branch: `main` only.
- Only P1 and P3 are active implementers. P1 owns product-facing workspaces, route/UI integration and operational document outputs. P3 owns intelligence engines and intelligence persistence/DTOs.
- Customer case management and customer-facing portal already exist. BODY-021 does not recreate them; it adds an internal report output to the existing organization-wide service desk.

## Delivered on main — BODY-021

1. Added `src/lib/customer-service-desk-print.ts` as a validated report projection from the exact `CustomerServiceDeskCase[]`, full-organization summary, active filters and `hasMore` state already returned/held by the authorized work-queue flow.
2. Added `src/lib/customer-service-desk-xlsx.ts`, a three-sheet OOXML workbook: report scope, organization-wide open-case SLA metrics, and loaded case rows. All text is emitted as literal text; no formula execution is derived from user-entered case content.
3. Added `src/components/CustomerServiceDeskPrintSheet.tsx`, an Arabic RTL A4 landscape document using the same projection.
4. Added manager/admin-only `تصدير Excel` and `طباعة / PDF` actions in `src/components/CustomerServiceDesk.tsx`, with a scoped print lifecycle. Existing same-tenant staff queue, manager assignment/escalation controls, cursor paging and task links remain the source of truth.
5. The report separates full-organization open-case metrics from filtered case details already loaded in the browser. If `hasMore=true`, it explicitly warns that additional queue pages are not included. It omits case descriptions, conversation messages, internal notes, financial fields, UUIDs, task/profile IDs and tenant IDs. Overdue flags are computed at report generation time from the current SLA deadlines and the case's active status.

## Existing portal correction

- `src/components/CustomerServicePortal.tsx`, `src/lib/customer-service-portal.ts` and `src/routes/service-cases.tsx` already provide customer-company case visibility, conversations, customer replies and eligible case creation through server RPCs. The matrix now records this as implemented; do not rebuild it.

## Source boundary / acceptance

- Reuses the existing tenant-scoped keyset query `get_customer_service_work_queue` and does not add a database migration, direct table read, or parallel task queue.
- Exact feature commits: projection `23c01b2eeffa58947a5626b49719da28ee8bb274`; XLSX `d10cacb45457ddcbbb32fc04392992169897ed12`; print sheet `2cfe3ec1221a9246c95af8bef7de69639f39d46e`; UI actions `14ebc5d2adf6b6bf50d112a0685fb6def331246f`; A4 CSS `65ece83ce2b475278b3212959e1edd7e1487951e`.
- Exact final blobs: projection `0c3aa08e9f1c823906899765c139ffee3adeb919`; XLSX `c40ef71217f4dbf836edbf654476614924a7070b`; print sheet `260197a88d85e8c2709ea891f37d69461e0b70b9`; desk UI `b3ff569785b9a91d42e04d5a0d5f093d660aef80`; print CSS `3a508602767cb3f9e89849bde44a367e73d1a428`.
- Acceptance state: `IMPLEMENTED_ON_MAIN / ACCEPTANCE_PENDING`. No tests/build/lint/CI/browser/E2E/database application/Bolt runtime/Preview/Vercel operation occurred; no PASS or production acceptance is claimed. No Vercel credits or paid providers were used. GitHub commits are the delivery record; notification receipt depends on repository watch settings.

## Next P1 body cursor

Continue with the next untouched mandatory non-intelligence product requirement; do not rebuild the customer service portal, work queue/SLA engine, supplier payment/statement outputs, prior accepted templates or P3 intelligence engines.

---

# P1 ACTIVE CHECKPOINT OVERRIDE — 2026-11-05 — BODY-COMPLETION-ON-MAIN-020 — SUPPLIER PAYMENT VOUCHER PRINT/PDF

- Repository: `Report-Engainall/Nasr1`; branch: `main` only.
- P1/P3 are the only active implementers. P1 owns product-facing workspaces, typed UI integration and operational documents. P3 owns intelligent engines, evidence lineage, persistence and intelligence DTOs.
- The existing supplier payment workflow was already mounted in `GeneralLedgerWorkspace.tsx`; BODY-020 adds a distinct printed voucher output only. It does not rebuild payment capture, allocation, reconciliation, accounting draft creation or the supplier ledger.

## Delivered on main — BODY-020

1. Added `src/lib/supplier-payment-voucher-print.ts` as a validated projection from the saved `SupplierPaymentWorkspace` + `SupplierPaymentHistory` DTO. It validates the saved payment identity is present in the current server snapshot, supplier relationship, dates, exact positive decimal amount, currency and payment method.
2. Added `src/components/SupplierPaymentVoucherPrintSheet.tsx`, an Arabic RTL print document with payment number/date, supplier, amount/currency, method/reference, settlement account, payable account, independent reconciliation state/reference, journal number/status and signature lines.
3. Wired `طباعة سند الصرف` into each saved payment row in `src/components/SupplierPaymentWorkspace.tsx` through a scoped print lifecycle and portal. Existing finance-role authorization and payment workflow remain unchanged.
4. Added A4 portrait print styling in `src/styles.css`.
5. The document uses the actual linked journal status as the settlement boundary: POSTED counts toward payable reduction, DRAFT remains unposted, and VOID stays visibly void. The source payment history does not return receipt-allocation rows, so this voucher explicitly does not invent an allocation breakdown. Internal UUID/tenant/profile/account IDs are omitted.

## Source boundary / acceptance

- Reuses the existing source-only payment model in `supabase/migrations/20261105235000_supplier_payment_settlement.sql`; no additional DB write path or migration was introduced.
- Exact feature commits: projection `68293a09b55eeb9b9d257d0e5020bd6b2086a30e`; print component `aa2e39041297d9c4d6d5b2d43cfabf822cf7dbe6`; posted-journal boundary `648439d53b5433352a7ce0af09851a028f0a5dd7`; UI action `074b01c45fb4896f379ec4a164e45ce0ae3a6b78`; A4 CSS `f0ddf06a0ae713b4031518b4bd28c0029c3b2c83`.
- Exact final blobs: projection `fba6b0ad93aac2bd18067d0ab65165fdb494a198`; print sheet `3f00361bd5ce3db3a8687008fbd3b9f3b9ac38ad`; workspace `ca42ce32801eb27a7d3081777840b171cd4aee54`; print CSS `be602fc9c3c33d59670673d2dd4d2b850419ee5e`.
- Acceptance state: `IMPLEMENTED_ON_MAIN / ACCEPTANCE_PENDING`. No tests/build/lint/CI/browser/E2E/database migration application/Bolt runtime/Preview/Vercel operation occurred; no PASS or production acceptance is claimed. No Vercel credits or paid providers used. GitHub commits are the delivery record; notification receipt depends on repository watch settings.

## Next P1 body cursor

Continue with the next uncovered mandatory non-intelligence product capability from the canonical specification and acceptance matrix. Do not rebuild supplier payment, supplier invoice, supplier account activity, prior DLV-011 templates or P3 intelligence engines.

---

# P1 ACTIVE CHECKPOINT OVERRIDE — 2026-11-05 — BODY-COMPLETION-ON-MAIN-019 — SUPPLIER ACCOUNT ACTIVITY STATEMENT PRINT/XLSX

- Repository: `Report-Engainall/Nasr1`; branch: `main` only.
- Latest source commit at this checkpoint: `a21b0c42f052633bb85e0f7353ab4a369333ad03`.
- P1/P3 are the only active implementers. P1 owns product-facing workspaces, typed UI integration and operational documents; P3 owns intelligence engines, evidence lineage, intelligence persistence and read DTOs. No P2 task or duplicate intelligence engine is created.
- This delivery extends the existing finance-role supplier activity workspace. It does not add a new ledger or new payment model.

## Delivered on main — BODY-019

1. Added `src/lib/supplier-account-activity-print.ts` as a shared validated document projection. It excludes UUIDs and internal account/tenant/profile IDs, validates source type, page bounds, one-sided debit/credit rows, and balance-completeness semantics.
2. Added `src/components/SupplierAccountActivityPrintSheet.tsx` and a scoped A4 landscape print mode. The same projection produces Arabic RTL content for print/Save-as-PDF.
3. Added `src/lib/supplier-account-activity-xlsx.ts`: four sheets for report scope, currency totals, supplier summary and current-page journal details. Business text is written as literal inline strings; unknown values remain blank; currencies are not combined.
4. Wired `تصدير Excel` and `طباعة / PDF` actions into `SupplierAccountActivityWorkspace.tsx`, retaining its existing admin/manager/accountant role gate, filters and paging.
5. Explicitly discloses that journal details contain only the current page; the current payable is receipt-source-only, can be unknown when source coverage is incomplete, does not include supplier invoices outside the receipt-linked source model, and is not narrowed by the activity-date filter. Pending payments remain separate from posted liability reduction.

## Source boundary

- Reuses the existing read RPC defined/extended by `20261105234000_supplier_account_activity_statement.sql` and `20261105235000_supplier_payment_settlement.sql`; no additional DB migration or write path was added.
- Source commits include projection `6abe366258f3ae82ef3429fdd4f8079361b10c42`, XLSX `5096ffb176abaf65410c11115320a4fda87ef434`, print sheet `bd3671775eba492ac06d9c20291515f4e3f55e08`, UI `9eb8d465d4d10b797de10d420a28ae359e0bcf02` + source-scope disclosure `a21b0c42f052633bb85e0f7353ab4a369333ad03`, and print CSS `bb4e033e6fadce6aad4032418a911fb850c044d7`.
- Exact final blobs: projection `a149476b072981078330250cee9af83ff989dc3f`; print sheet `211fc103c2b187c2147ebdbf651579094b25c1ac`; XLSX `509afdcbfc3e0d85537557e5b71e69f59203f7b1`; workspace `01e42e71092ba2fc479eeec08e021932045f1489`; CSS `744b25751579c8a837bd68662d386d805a944c2e`.
- Acceptance state: `IMPLEMENTED_ON_MAIN / ACCEPTANCE_PENDING`. Bolt New will perform connected DB/runtime and PDF/XLSX acceptance after sync. No tests, build, lint, CI, browser, E2E, migration application, Vercel preview/deployment or production operation was run; no PASS is claimed.
- No Vercel credits or paid providers were used. GitHub commits are the delivery record; actual notification receipt depends on repository watch settings.

## Next P1 body cursor

Continue with the next uncovered non-intelligence product requirement from the canonical specification and acceptance matrix, without rebuilding supplier invoice/payment/statement surfaces or already-accepted role/template outputs. P3 continues its own intelligence sections independently.

---

# P1 ACTIVE CHECKPOINT OVERRIDE — 2026-11-05 — BODY-COMPLETION-ON-MAIN-018 — SUPPLIER INVOICE ACCOUNTING + DOCUMENT OUTPUT

- Repository: `Report-Engainall/Nasr1`; branch: `main` only.
- Product-code SHA at this checkpoint: `6d8e45a0e153e5e035a95ebfec3cdbbba483978d`.
- Current implementers for this continuation are **P1 (this execution: product UI, routes, typed client integration and operational documents) and P3 (intelligence engines, source lineage, persistence and read DTOs) only**. This override supersedes older three-agent/P1-P2-P3 ownership text in historical entries below. Do not assign new tasks to P2.
- No branch or pull request was created. No Vercel build, preview, deployment or credit use occurred. No tests, build, lint, CI, browser, database application or runtime verification was run. Bolt New remains the planned project sync, DB link/migration execution and runtime acceptance environment.

## Delivered on main

1. **P3 intelligence integration:** mounted the existing `BusinessHealthMap` in `IntelligenceWorkspace`; mounted and surfaced `GrowthOpportunityRadar`; P1 exposed source navigation and mapped signal types to existing authorized Quotes, Customers and Products views. UNAVAILABLE source results remain distinct from empty results. P3 independently delivered Section 52 decision-memory persistence, capture/correction and embedded memory snapshot read DTO; it remains source-only pending Bolt acceptance.
2. **Supplier invoice accounting reconciliation:** added `supabase/migrations/20261105260000_supplier_invoice_accounting_handoff.sql`, typed functions in `src/lib/supplier-invoices.ts`, and accountant review UI in `src/components/SupplierInvoiceWorkspace.tsx`, mounted through `GeneralLedgerWorkspace.tsx`.
   - Reuses the exact original payable-liability account from the posted goods-receipt journal; does not create a second payable or supplier ledger.
   - Reconciles invoice quantities against actual physical receipt lines and source received unit costs, verifies original posted/unreversed receipt journals and balanced source lines, and withholds incomplete, returned, mixed-currency or mismapped source evidence.
   - Tax and non-zero merchandise variance require explicit same-tenant chart-of-account selection; the supported currency is YER only. No assumed tax classification, FX, automatic inventory change, supplier payment or automatic journal posting.
   - Exact match with no tax/variance records a no-additional-entry result. Other cases create a balanced **DRAFT** only. The standard General Ledger posting command remains the sole posting route. Retries return the actual saved DRAFT/POSTED/VOID state instead of creating another journal.
3. **Supplier invoice accounting voucher:** added a source-validated Arabic A4 print/PDF sheet and three-sheet XLSX workbook (summary, line matching, journal detail). Both are built from the same exact-cent projection, preserve negative variances, show actual ledger state, keep decimal values as text in XLSX, and omit internal UUID/tenant/profile identifiers. Spreadsheet text cells are explicit strings, not executable formulas.
4. Existing supplier invoice capture, three-way matching, independent price-variance review, private evidence attachments, supplier payment/settlement and supplier account activity remain reused; no duplicate screen, API or parallel ledger was created.

## Current P1 / P3 boundaries

- P1 owns product-facing workspace composition, route navigation, typed UI contracts, print/export projections and screen interactions.
- P3 owns decision-memory/growth/health intelligence engines, evidence lineage, persistence and source read DTOs. P1 mounts the published contract but does not recreate those engines.
- These two roles are the only implementation roles for this continuation. Historical P2 ownership language below is archival and must not be used to assign new implementation work.

## Acceptance / handoff boundary

- All above changes are committed to GitHub `main`; the supplier accounting migration and P3 decision-memory migration are source-only and have **not** been applied to a database.
- Bolt New must sync this repository, apply migrations in its intended non-production database workflow, link its DB, and then perform the requested end-to-end integration/runtime verification. No PASS, live database change, production deployment or delivery receipt is claimed here.
- GitHub commit notifications are subject to repository watch settings; commits are the source delivery record and no inbox receipt is asserted.

## Resume instruction

Resume from the latest `main` SHA and the active P1/P3 checkpoints. Continue with the next untouched mandatory product capability in the canonical specification/matrix; do not repeat supplier invoice/payment UI, supplier invoice accounting handoff, A4 voucher, XLSX voucher, Business Health Map or Growth Opportunity Radar integration.

---

# BODY-COMPLETION-ON-MAIN — 2026-11-05 — supplier evidence + intelligence surfaces

- Repository: `Report-Engainall/Nasr1`; execution branch: `main` only.
- Starting code baseline for this continuation: `da9d6495ef36a4f37ca91ce21153e0b6c7b9bcf5`.
- Latest code HEAD before this checkpoint write: `a591fa03535ae25f3f5fdbf018e42c2d21db9b43`.
- No work was duplicated from existing supplier-payment settlement, supplier invoice matching service, credit-note service, Business Health Map engine, or Growth Opportunity Radar engine.

## Implemented on main

1. Supplier invoice capture is mounted in `src/components/PurchaseOrdersPage.tsx`, using canonical PO receipt lines and the existing idempotent three-way matching API.
2. Independent supplier invoice price-variance review is mounted in `src/components/GeneralLedgerWorkspace.tsx`; the same creator cannot review their own variance.
3. Supplier invoice evidence attachment capability: private Storage bucket, same-tenant invoice scope, metadata table, immutable attachment log, SHA-256, MIME/size limits, orphan-only cleanup, finance read, and short-lived signed links. Added `20261105250000_supplier_invoice_evidence_attachments.sql`, typed client methods, and UI in `SupplierInvoiceWorkspace.tsx`.
4. Existing supplier-payment settlement workspace was already mounted on main and was left intact; no parallel copy or new payment ledger was created.
5. Existing `BusinessHealthMap` component is mounted in `IntelligenceWorkspace.tsx`; cashflow and inventory queries now share one snapshot timestamp. Incompatible source periods and unknown financial components remain withheld.
6. Existing full-population customer-retention RPC is now consumed through `customer-retention-client.ts`, with server-period, evidence lineage and population-coverage parsing; aggregate metrics are surfaced without customer PII.
7. Existing deterministic `GrowthOpportunityRadar` is connected to source-backed customer repeat-purchase and activity-decline signals only. No synthetic quote, unavailable-product, or product-performance signal is created; no unverified customer navigation is attached.

## Continuation rules

- Continue implementing missing product capabilities on `main`; do not reopen accepted work or create duplicate screens/services.
- Do not spend Vercel free credits or deploy/preview through Vercel.
- Do not apply Supabase migrations, link a database, run builds, tests, lint, CodeInspector, CI, Playwright or hosted E2E in this phase. Bolt New owns project synchronization, database linking/migration execution and verification later.
- Source-only migration `20261105250000_supplier_invoice_evidence_attachments.sql` is not applied to a live database; its UI reports a clear missing-RPC condition until Bolt synchronization.
- Do not claim runtime success, migration success, or test PASS without Bolt-side evidence.
- GitHub commits are the delivery path. Repository notifications depend on the user's GitHub watch/notification settings; no separate notification delivery is asserted.

## Next implementation item

Build the controlled supplier-invoice accounting handoff only after mapping the existing goods-receipt accrual journal, tax-account policy and supplier-credit-note reversal behavior. It must reclassify the existing receipt liability rather than create a second payable; explicit account mapping and independent approval are required; prepare a DRAFT only and leave posting to the existing General Ledger flow. Do not guess tax treatment or force an assumed currency/account.

---

# P1 LIVE REQUEST — 2026-11-05 — SUPPLIER FINANCE / PROCUREMENT UI MOUNT

- Repository: Report-Engainall/Nasr1; current backend main SHA: da9d6495ef36a4f37ca91ce21153e0b6c7b9bcf5.
- P1 owns presentation components, page composition and route mounts. P2 owns the two SQL migrations and the typed service files below. Do not edit P2 or P3-owned paths.
- This request consolidates the already delivered payment settlement and supplier invoice bodies. Do not repeat service work.

## A) Supplier payment settlement

Use src/lib/supplier-payments.ts:
- fetchSupplierPaymentWorkspace({supplierId,currency,limit,offset})
- registerSupplierSettlementAccount({accountingAccountId,kind,currency,displayName})
- recordSupplierPayment({supplierId,paymentDate,amount,currency,method,settlementAccountMappingId,paymentReference,allocations,idempotencyKey})
- reconcileSupplierPayment({paymentId,action,evidenceType,evidenceReference,observedAmount,currency,reason,idempotencyKey})
- prepareSupplierPaymentJournalDraft({paymentId,idempotencyKey})
- voidSupplierPayment({paymentId,reason})

UI constraints:
- Map an existing active same-tenant cash/bank asset account per currency. This is configuration, not a live bank connection.
- Allocate only to posted source receipts for one supplier/currency; show source cost, posted credit notes, reserved, posted payment and available-to-allocate separately.
- Recorded payment reserves but does not reduce payable. Require a different authorized finance actor for exact matching evidence before draft handoff.
- Reconciliation evidence: cash_voucher, bank_statement_line or cheque_clearance as appropriate. Latest exception blocks the handoff.
- Journal API creates DRAFT only. Link back to the single General Ledger queue; never auto-post.
- Only verified posted balanced non-reversed journals count as paid. Hide final remaining balance unless server says balanceComplete=true; never mix currencies.
- Read back server state after each mutation before showing success.

## B) Supplier invoice capture / three-way matching

Use src/lib/supplier-invoices.ts:
- fetchSupplierInvoiceWorkspace({purchaseOrderId,limit,offset})
- recordSupplierInvoice({purchaseOrderId,invoiceNumber,invoiceDate,merchandiseSubtotal,taxAmount,invoiceTotalAmount,lines,idempotencyKey})
- reviewSupplierInvoiceVariance({invoiceId,approve,reason})

UI constraints:
- Select only a submitted / partially received / received canonical PO with physical receipt lines. Show supplier and organization currency derived by server.
- Capture supplier invoice number/date, merchandise subtotal, explicit tax amount and invoice total; header total must equal subtotal + tax. No inferred tax rate, freight, discount, withholding or FX.
- Add only real receipt lines by receiptItemId. Show source received quantity, already invoiced, remaining-to-invoice, PO unit price, receipt unit price and supplier invoice unit price/line total.
- No over-invoicing, duplicate line ids, cross-PO receipt line, or currency mixing. Show exact three-way price match versus variance_pending.
- A price variance requires an independent second finance user with reason; show approved/rejected history. Do not let creator review their own invoice.
- Non-zero tax remains tax_accounting_status=pending. Do not post tax or create another payable from the invoice: existing PO receipt accounting remains the payable source.
- Refresh/read back invoice and receipt-line availability after mutations. Do not display success based only on request completion.

## Ownership and delivery

- P1 may add a supplier invoice workspace component and supplier payment workspace component, mounting them in existing purchasing/supplier and General Ledger navigation as appropriate.
- Do not touch: supabase/**, src/lib/supplier-payments.ts, src/lib/supplier-account-activity.ts, src/lib/supplier-invoices.ts, scripts/**, P3 intelligence modules, or shared governance files.
- UI should show database-contract unavailable until these migrations are applied. These source commits have not been applied to any database.
- No Vercel preview/deployment/credit use. Do not run broad test or scan loops during this body batch. Preserve any other in-flight P1 file ownership and split components rather than editing the same component concurrently.

Exact backend files:
- supabase/migrations/20261105235000_supplier_payment_settlement.sql
- supabase/migrations/20261105240000_supplier_invoice_three_way_matching.sql
- src/lib/supplier-payments.ts
- src/lib/supplier-account-activity.ts
- src/lib/supplier-invoices.ts

---

# HISTORICAL P1 REQUEST — SUPPLIER PAYMENT / SETTLEMENT UI MOUNT

- Repository: Report-Engainall/Nasr1; branch: main.
- Backend contract is on main SHA 6ca6f9700b797eb120dec6bfe6f8fc278d010858.
- P1 owns all presentation files. P2 owns the migration and typed service paths below. Do not edit P2 paths or P3 intelligence paths.

## Mount the delivered server workflows — do not recreate them

Use src/lib/supplier-payments.ts:
- fetchSupplierPaymentWorkspace({supplierId,currency,limit,offset})
- registerSupplierSettlementAccount({accountingAccountId,kind,currency,displayName})
- recordSupplierPayment({supplierId,paymentDate,amount,currency,method,settlementAccountMappingId,paymentReference,allocations,idempotencyKey})
- reconcileSupplierPayment({paymentId,action,evidenceType,evidenceReference,observedAmount,currency,reason,idempotencyKey})
- prepareSupplierPaymentJournalDraft({paymentId,idempotencyKey})
- voidSupplierPayment({paymentId,reason})

UI behavior:
1. Register/select a configured cash or bank asset account per currency. Do not treat the mapping as a live bank feed.
2. List eligible posted receipt balances and allocate one payment across unique same-supplier/same-currency receipts. Display source amount, posted credit-note reductions, reserved, posted paid and available-to-allocate separately. Do not mix currencies.
3. Capture real payment method + reference. The recorded source reserves allocations; it is NOT paid and must not lower remaining payable.
4. Require a second authorized finance actor to record matching cash-voucher / bank-statement-line / cheque-clearance evidence (exact amount + currency). Show EXCEPTION separately; latest exception blocks handoff.
5. Only after matching evidence, call prepareSupplierPaymentJournalDraft. Show that it creates a DRAFT only and link back to the single General Ledger queue. Never auto-post.
6. Show remaining payable as final only when the server returns balanceComplete=true; otherwise label UNKNOWN / SOURCE COVERAGE INCOMPLETE. Preserve per-currency totals.
7. Update the existing supplier activity statement for settlementIncluded=true, payment source type purchase_supplier_payment and optional balance fields in the typed payload. Remove the old UI statement that all settlement is excluded, but retain the narrower source-coverage warning.
8. Read back workspace/statement data after each mutation before showing success. Provide loading/empty/error/retry/unauthorized states and never fabricate IDs/amounts or mark a draft as posted.

Files owned by P1: add a dedicated supplier payment workspace and mount it in the existing supplier/General Ledger route. Do not create another ledger or change the existing General Ledger posting route. Do not touch supabase/**, src/lib/supplier-payments.ts, src/lib/supplier-account-activity.ts, scripts/**, P3 paths or shared governance files.

Acceptance boundary: no migration has been applied and no runtime behavior is proven. P1 UI source should label unavailable until the database receives this migration. Keep existing drawer/accessibility and other active UI work intact; no broad rescan or test cycle is requested in this handoff.
Backend paths: supabase/migrations/20261105235000_supplier_payment_settlement.sql, src/lib/supplier-payments.ts, src/lib/supplier-account-activity.ts.

---

# P1 FINAL EVIDENCE — 2026-10-30 — DLV-002 VERIFIED ON CURRENT CODE SHA

- task_id: `DLV-002 / ROUTES-001 — mobile admin drawer focus across open, route remount and close`.
- code_sha: `f381bac426140d0ad3dbc7861b463c8018ff56a1`.
- base_main_sha: `00cfbe8f0791b3872d733a9653fe660de29eee53`.
- pull_request: `https://github.com/Report-Engainall/Nasr1/pull/312` (open, mergeable, four changed paths; P3 is sole integrator).
- Core exact-SHA workflow: `41026957332` SUCCESS on `f381bac4`; 238/238 test files and 1,554/1,554 unit tests PASS. P1 runtime navigation test 3/3; admin navigation contract test 4/4; P3 free-AI policy test 10/10 after P3 main fix. PostgreSQL 17 migrations/core, exact RPC inventory, cash expense posting/idempotency/concurrency, journal reversal, purchase receipt accounting, invite/address concurrency/expiry, tenant analytics, quote decisions, stock-count audit, async export, import idempotency/snapshot, storefront favourites, backup/restore, lint, build, production preview smoke, dev 5173 smoke and browser price visibility all SUCCESS.
- P2 exact-SHA workflow: `41026957475` SUCCESS on `f381bac4`; public UI smoke SUCCESS; authenticated E2E infrastructure gate SUCCESS; local Supabase/Chromium job `123968618132` SUCCESS; teardown and authenticated artifacts upload SUCCESS. Local steps PASS: migrations PostgreSQL 17, ephemeral tenant fixtures, endpoint guard allow/deny, price grid rollback/audit/stale-writer, cash expense posting/idempotency/void concurrency, purchase receipt source accounting, exact build/launch, authenticated order persistence + cross-tenant denial, return/review/receipt/credit memo, audited Onyx XLSX, finance document + operational task print (includes mobile initial/return focus), customer-manager authorization/financial privacy/audit, device-session authorization/immediate revocation.
- Explicit proof boundary: hosted Playwright customer/order/tenant workflow is `SKIPPED` (not PASS). The successful local Supabase tenant-isolation/denial proof is not a substitute for hosted authenticated tier/session acceptance. DLV-005/DLV-011 matrix-wide role×template and hosted journeys remain open where already recorded.
- P1 change paths (unchanged): `src/components/AghbariApp.tsx`, `src/test/admin-mobile-navigation-acceptance.test.tsx`, `src/test/storefront-admin-navigation-access.test.ts`, `docs/execution/P1_CHECKPOINT.md`. P1 initial focus waits for drawer visibility and motion completion, bounded/cancelled polling; route navigation restores focus to currently mounted menu trigger after remount. P2 `e2e/**` was not modified.
- P3 duplicate free-AI quota mismatch was found in Core on SHA `851c82a`; P3 fixed `src/lib/intelligence/free-ai-policy.ts` in main `00cfbe8`, and the P1 branch merged that main commit. Exact Core on `f381bac4` now confirms P3 test 10/10 and all project tests pass. P1 did not edit P3 code.
- checkpoint update itself is documentation-only and creates a new branch head; run fresh Core/P2 on that resulting exact SHA before P3 merge. Do not transfer `41026957332`/`41026957475` to the documentation commit.
- exact_next_command: after checkpoint commit, read the new PR head; verify Core and P2 workflows triggered on that exact SHA. If both succeed, hand PR #312 to P3 with task ID, base/result SHA, four files, Core/P2 URLs, SKIPPED hosted boundary, and ask P3 to merge. Do not merge or push main from P1.

---
# P1 LIVE CHECKPOINT — 2026-10-30 — P3 FREE-AI POLICY REGRESSION FOUND AND SYNCED

- task_id: `DLV-002 / ROUTES-001 — mobile drawer focus lifecycle`.
- status: `P1_IMPLEMENTED; LOCAL_P2_BROWSER_PASS_ON_CODE_SHA; FINAL_CORE_BLOCKED_BY_P3_TEST_BEFORE_FIX; REVERIFY_AFTER_P3_SYNC`.
- P1 source/test head before P3 correction: `851c82a80ff8969fb43db9b8680c67ada6c70335`.
- Core run `41026514614` on `851c82a`: Unit tests FAILED 1/238 files; 1,553/1,554 tests passed. The only failure was P3-owned `src/lib/intelligence/free-ai-policy.test.ts:29` (`fails closed when duplicate records claim the same provider/model quota`): second attempted provider reason expected `DUPLICATE_PROVIDER_QUOTA_RECORD`, actual `QUOTA_EXHAUSTED`. P1 tests and remaining 237 files passed. P1 did not modify P3-owned source/tests.
- P3 then merged main commit `00cfbe8f0791b3872d733a9653fe660de29eee53`, changing only `src/lib/intelligence/free-ai-policy.ts` (duplicate quota record handling). P1 feature branch incorporated this latest-main change via non-forced merge commit `06325f48abae290ecd4683d267f94775153f768a`, parented by previous P1 head `851c82a` and main `00cfbe8f`.
- P2 local Chromium workflow `41026090788` completed SUCCESS on code head `53d59b4f3b8b684145f278e2e7d5f1ac70e6b27b`; the local Supabase/Chromium job passed order/cross-tenant denial, customer returns/credit memo, audited Onyx XLSX, finance document/task print, customer-manager authorization/financial privacy/audit, and device-session immediate-revocation. Public smoke and infrastructure gate passed; hosted authenticated cross-tenant journey was SKIPPED, not PASS.
- P2 run `41026514290` on pre-P3-correction head `851c82a` was running; treat it as predecessor only after this new branch head.
- Core run `41026067495` on source/test SHA `59a9af7180491bca1b3d7f87c36d62454e59a5ab` passed 238/238 files and 1,550/1,550 tests; it includes transition-aware and route-remount focus regressions, but predates main sync.
- Exact next action: read branch HEAD after this checkpoint commit and poll Core + P2 triggered by this exact SHA. Verify P3 free-AI quota duplicate regression is fixed in the merged P3 code; P1 owns only UI/tests and must not edit `src/lib/intelligence/**`. P2 must pass again on the exact final head.
- P1 boundaries maintained: do not modify `e2e/**`, `supabase/**`, `scripts/**`, API/auth, P3 files, central matrix/global state, production, secrets, or local workspace.

---
# P1 LIVE CHECKPOINT — 2026-10-30 — CURRENT MAIN SYNC FOR DLV-002

- task_id: `DLV-002 / ROUTES-001 — mobile admin drawer focus across open, route remount and close`.
- status: `IMPLEMENTED_PENDING_EXACT_SHA_CI`.
- latest_main_sha_at_sync: `8272e539554fa6c51ce2a4e4a1d1d6b255f53278`.
- branch pre-sync SHA: `12bdad8cd62d95d36fd35a5cb6fd6b8f035fb91a`.
- main merge commit: `41b13c21479257102e414f782a9242231ed9eb22`, parents are P1 branch SHA `12bdad8c` and main SHA `8272e539`; branch updated non-force with expected-head lease.
- Latest-main non-overlap changes included:
  - `docs/execution/contracts/P3_INTELLIGENCE_AGGREGATE_CONTRACT.md`
  - `src/lib/intelligence/free-ai-policy.test.ts`
  - `src/lib/intelligence/free-ai-policy.ts`
  - `src/lib/intelligence/system-health.test.ts`
  - `src/lib/intelligence/system-health.ts`
- P1 implementation commit: `51bca41c094bc07af9b6463724c086f7491a9488`; P1 runtime test commits: `62423634` (transition-aware initial focus) and `b001becd` (new-route focus after route remount); static compatibility assertion commit: `4be7c18d`; checkpoint and main-sync commits recorded in the branch history.
- Root cause found by unchanged P2 E2E: separate `/admin_/*` file routes remount `AdminApp`; focusing the old trigger before navigation causes it to be detached. P1 now waits for the navigation promise, then resolves the currently mounted visible `.mobile-menu[aria-controls="admin-sidebar"]` and focuses that node. The test simulates replacement of the detached trigger before navigation completes.
- Evidence from previous heads (not transferable):
  - `41025182161` on `7970e4d`: initial focus was fixed but failed route-change restoration at `e2e/finance-task-print.spec.ts:82`.
  - `41025563411` on `e27cedc`: same route-remount focus failure at line 82; local Supabase/Chromium used; hosted cross-tenant journey SKIPPED.
  - `41025181975` on `7970e4d`: 237/238 files, 1540/1541 tests; only stale string assertion failed and was repaired.
  - `41025563359` on `e27cedc`: Core SUCCESS before the route-remount restoration commit; not evidence for current head.
- Exact next command: after this checkpoint commit, read branch HEAD and poll Core + P2 checks for that exact SHA. P2 assertions to verify without editing E2E: first drawer focus, Escape focus restore, navigation to a new `/admin_/*` route and focus on new trigger, desktop resize, finance/task print/authorization path. Do not call SKIPPED PASS.
- Path boundaries maintained: P1 component and tests + P1 checkpoint only; no `e2e/**`, API/backend/auth, `supabase/**`, `scripts/**`, P3 logic ownership, shared matrix/global state, production, secrets, or local workspace edits.

---
# P1 LIVE CHECKPOINT — 2026-10-30 — MERGED LATEST MAIN INTO DLV-002 WORK BRANCH

- task_id: `DLV-002 / ROUTES-001 — mobile drawer initial focus + route-remount focus restore`.
- status: `IMPLEMENTED_PENDING_FINAL_BASE_EXACT_SHA_CI`.
- latest_main_sha: `9a0facd1f394126f6f2ede232784e6db5e69183d`.
- previous_p1_head: `53d59b4f3b8b684145f278e2e7d5f1ac70e6b27b`.
- merge_commit: `8cf451ee5ca0b929aad59b5a787abed3070afa1a` (parents: P1 head `53d59b4f` + latest main `9a0facd1`; non-forced fast-forward branch update).
- Main-only intervening paths merged into this feature branch (no overlap with P1 changes):
  - `docs/execution/contracts/P3_INTELLIGENCE_AGGREGATE_CONTRACT.md`
  - `src/lib/intelligence/customer-retention.test.ts`
  - `src/lib/intelligence/customer-retention.ts`
  - `src/lib/intelligence/dead-stock.test.ts`
  - `src/lib/intelligence/dead-stock.ts`
- P1 paths remain: `src/components/AghbariApp.tsx`, `src/test/admin-mobile-navigation-acceptance.test.tsx`, `src/test/storefront-admin-navigation-access.test.ts`, `docs/execution/P1_CHECKPOINT.md`.
- Route-remount regression: `admin-mobile-navigation-acceptance.test.tsx` replaces the old menu trigger to model the destination route's newly mounted trigger before the navigation promise resolves; asserts the replacement receives focus. The implementation returns focus to the current route's visible mobile trigger after router navigation resolves, not to the detached old node.
- Old-head exact evidence is not transferable:
  - Core `41025563359` SUCCESS on `e27cedc` (before route-remount fix).
  - P2 `41025563411` was running on `e27cedc`; it is predecessor evidence only.
  - P2 `41025182161` FAILURE on `7970e4d`, caused by focus staying on the old trigger which was removed during route remount; initial focus into the drawer did pass.
  - Core `41025181975` FAILURE on `7970e4d` was due one stale test assertion requiring the deleted immediate-focus source string; corrected on branch.
- exact_next_command: update this checkpoint with its resulting commit SHA, then poll new Core and P2 runs after branch merge commit + checkpoint update. Exact final-head checks must include the mobile drawer initial focus, Escape restoration, route-change new-trigger restoration, desktop resize, and finance/task print/browser authorization paths. Keep `e2e/**` unchanged; do not accept hosted SKIPPED as PASS.
- no changes to main, local workspace, `e2e/**`, backend/API/auth, P3 engine ownership, or shared global state/matrix/log.

---

# P1 LIVE CHECKPOINT — 2026-10-30 — DLV-002 MOBILE DRAWER FOCUS + ROUTE REMOUNT

- task_id: `DLV-002 / ROUTES-001 — mobile admin drawer initial focus and route-change focus restoration`.
- status: `IMPLEMENTED_PENDING_EXACT_SHA_CI`.
- base_main_sha: `d26a2ad735d6610836d2aeb06889ad9f9c19dcf1`.
- branch: `p1/dlv-002-mobile-drawer-focus-20261030`.
- latest implementation commit: `51bca41c094bc07af9b6463724c086f7491a9488` — transition-aware first-item focus plus restore focus to newly mounted route trigger after navigation resolves.
- latest regression-test commits: `b001becd0af1ecaad9acd16cc067b19dd7173c5a` and `59a9af7180491bca1b3d7f87c36d62454e59a5ab`.
- latest known PR head before this checkpoint update: branch HEAD to be re-read after commit; do not reuse prior SHA for proof.
- paths:
  - `src/components/AghbariApp.tsx`: bounded visibility/animation-aware focus scheduling; cancellation when closed/unmounted; Escape close and trigger focus restore; route navigation waits for navigation promise, then focuses visible trigger in the newly mounted AdminApp (avoids stale-node focus).
  - `src/test/admin-mobile-navigation-acceptance.test.tsx`: animation delay regression; route remount regression swaps old trigger for new route trigger before resolving navigation and verifies focus targets replacement.
  - `src/test/storefront-admin-navigation-access.test.ts`: replace obsolete one-shot source check with assertions for visibility/animation/cancellation and route-remount restoration.
- P2 evidence:
  - old P2 run `41025182161` on earlier head `7970e4d6739e8aecae9019c7753050bf36561d20`: public read-only smoke SUCCESS; authenticated hosted path SKIPPED; local Supabase / Chromium completed FAILURE in `e2e/finance-task-print.spec.ts:82` because route navigation unmounted the old `.mobile-menu` trigger after immediate focus restoration. The initial first-item focus assertion at line 69 passed in this run; failure moved to focus restoration after route change. Keep E2E unchanged.
  - earlier Core run `41025181975` on `7970e4d`: 237/238 files and 1540/1541 tests passed; sole failure was the stale static assertion expecting the deleted immediate-focus source line. Static test was corrected in `4be7c18d`.
  - prior Core run `41025563359` and P2 run `41025563411` target predecessor head `e27cedc4958d82ce00e3e40297d84a65d3084f02`; do not transfer their outcomes to the current branch head.
- exact next action: poll Core and P2 workflows for the latest branch HEAD after this checkpoint commit. For P2, inspect exact local Supabase Chromium job including both `e2e/finance-task-print.spec.ts:69` (initial focus), `:82` (focus restoration after route change), Escape restoration, responsive desktop transition, then printing/authorization assertions. Never modify `e2e/**` to manufacture a pass.
- owner boundaries respected: no `e2e/**`, `supabase/**`, `scripts/**`, API/backend/auth, P3 intelligence, global state/matrix/log, production environment, or local workspace changes.

---

# P1 LIVE CHECKPOINT — 2026-10-30 — DLV-002 MOBILE DRAWER FOCUS

- task_id: `DLV-002 / ROUTES-001 — mobile admin drawer first-action focus`.
- status: `IMPLEMENTED_PENDING_EXACT_SHA_CI`.
- observed_main_head: `d26a2ad735d6610836d2aeb06889ad9f9c19dcf1`.
- branch: `p1/dlv-002-mobile-drawer-focus-20261030`.
- code_commit_sha: `4be7c18ddfce3204bc8bceb2fa818c7960a51dce` (adds transition-aware focus regression assertion; UI code remains `8cd88895dc3477a17987b152ceb31c9818d0378f`; no local working copy edited).
- base_sha: `d26a2ad735d6610836d2aeb06889ad9f9c19dcf1`.
- changed_paths:
  - `src/components/AghbariApp.tsx`: replace immediate focus with visibility/opacity and Web Animations API transition-aware focus; schedule frame checks with 2-second bound; cancel pending checks on close/unmount; retain Escape close and trigger focus restoration.
  - `src/test/admin-mobile-navigation-acceptance.test.tsx`: regression proves focus stays on the trigger while drawer animation is active and moves to first navigation action only after motion completes; preserve existing Escape and destination-close/return-focus checks.
  - `src/test/storefront-admin-navigation-access.test.ts`: replace brittle source-string assertion for the removed one-shot focus call with checks for visibility, active-motion gating, cancellable polling and focus target.

- exact tests: `admin mobile navigation runtime acceptance` (3/3 PASS on first head `7970e4d`; included delayed-transition regression); whole Core unit run failed 237/238 files, 1540/1541 tests solely because `storefront-admin-navigation-access.test.ts` required the obsolete immediate-focus source string. That assertion is now changed to verify transition-aware implementation invariants. Exact-head CI on updated commit `4be7c18d` is pending; no full-suite PASS claimed.
- P2/Core candidate workflows `41024527658` and `41024527683` run on `1500b2592b8bdb6d7c2b75b3818a3e18cf5c9eb2`, not this P1 SHA; do not transfer their results.
- ownership: only P1-owned component and `src/test/**`; did not modify `e2e/**`, API/backend, P3 intelligence files or central state/matrix/log.
- initial PR head `7970e4d6739e8aecae9019c7753050bf36561d20` Core `41025181975` FAILURE: 237/238 files and 1540/1541 tests passed; only stale static assertion in `storefront-admin-navigation-access.test.ts` failed because it expected the deleted one-shot focus line. Focused runtime suite on that head passed all 3 tests. Fix commit `4be7c18ddfce3204bc8bceb2fa818c7960a51dce` updates that P1-owned assertion without editing P2 E2E.
- initial P2 `41025182161` is still running on old head `7970e4d`; local Supabase job started and will not be transferred to the updated head. Public UI smoke PASS, external hosted infrastructure path SKIPPED. Re-run the exact PR P2 workflow for the updated head.
- exact_next_command: poll Core/P2 exact-head workflows triggered by `4be7c18d` (after checkpoint-only commit, use final branch HEAD); repair only failures in P1-owned paths and retain P2 browser assertions unchanged. Then hand off exact SHA, PR, files, and evidence to P3 for merge.

---

# LIVE RESUME OVERRIDE — 2026-10-30 — SUPERSEDES ALL OLDER P1 NEXT ACTIONS
- Resume base: main `353588f5df5f36cfb6b7caaef5d067bd28371251`. Current-main Core run `41007651137` is IN_PROGRESS on this exact SHA; poll this run, do not duplicate it. One-main cleanup `41007651120` is SUCCESS on the same SHA.
- The saved P1 Customer 360 source-lineage work already passed Core on `9f5d3af8e4f57bd758f3eb779cb6971be0a7d829`; do not re-run/poll it. It is integrated. DLV-010 stays PARTIAL overall.
- Next: select the first uncovered P1-owned OPEN/PARTIAL UI acceptance leaf under DLV-002/003 from the existing CSV. Inspect only its screen + focused test; implement the real missing loading/empty/error/retry/unauthorized state and direct regression test. No full scan, no repeat Customer 360 work.
- P1 owns routes/components/styles and UI tests in src/test, except P3-reserved intelligence paths. Do not touch e2e/** (P2), supabase/scripts/API services (P2), P3 intelligence code, or central documents.
- Reconcile current main and worktrees before editing; preserve dirty work. Record your exact next command and test result in this checkpoint every 10 minutes and at interruption.
- This block supersedes the historical P1 task pointer below. Read global CURRENT_EXECUTION_STATE first.

---

# P1 — Durable Work Checkpoint

هذا سجل تقدم فرعي لـP1 فقط؛ ليس مؤشراً عالمياً. المؤشر الوحيد هو `docs/bolt-source-reconciliation/CURRENT_EXECUTION_STATE.md`. P2 وحده يحدّث المؤشر العالمي ومصفوفة القبول وسجل التنفيذ.

## Latest P1 continuation — 2026-10-30

- observed_main_head: `2154e540b5cf30f0b918d913de738c17fa968820` (before this checkpoint-only documentation commit); comparison from the prior recorded main `7fdb6cc72f784024c4c0c89fdec2d12d152d7fd8` is 10 commits ahead. The compare from `ee1b84303e5fc18b46bed0b37a880a306e06d5d8` to this head lists no changes to the offline catalog/cache/cart/account-switch source or focused test paths. Do not re-run repository discovery.
- task_id: `VERIFY-PWA-CACHE-AND-CART-SCOPE-EE1B843` (existing task; verification complete; this is not DLV-014 closure). P1 ownership remained unchanged.
- base_sha / result_code_sha: `ee1b84303e5fc18b46bed0b37a880a306e06d5d8` / `2154e540b5cf30f0b918d913de738c17fa968820`. Relevant offline source and test paths remained unchanged across the compare.
- exact current-head Core: [41005805929 — SUCCESS](https://github.com/Report-Engainall/Nasr1/actions/runs/41005805929), exact head `2154e540b5cf30f0b918d913de738c17fa968820`; Unit tests `220/220` files and `1442/1442` tests PASS, PostgreSQL 17 migrations/core acceptance PASS, lint PASS, build PASS, preview/dev smoke PASS, Chromium price-visibility PASS. This is CI execution, not a local workstation npm invocation.
- offline scope evidence boundary: historical P2 local Supabase/Chromium [40995284968 — SUCCESS](https://github.com/Report-Engainall/Nasr1/actions/runs/40995284968) is exact only for `ee1b843`; it is not transferred to the later SHA. Current-head Core passed on `2154e540`, but current P2 local browser proof did not complete because a separate P2-owned cash-expense acceptance script failed. Hosted customer/order/tenant test remains SKIPPED.
- DLV-010 UI source-lineage slice on current main: `src/components/AdminCustomer360.tsx`, `src/test/admin-customer-360-scoped-data.test.ts`, and new `src/test/admin-customer-360-display.test.tsx`. The added display tests assert no truncated internal invoice UUID/no invented YER for payments outside the latest-20 invoice window, and unavailable optional overdue count remains unknown while full-ledger count is retained. Exact Core above passes the complete suite. The full DLV-010 roll-up remains PARTIAL; business UAT, hosted journey and wider source-lineage evidence are still open.
- exact P2 blocker on same head: P2 run [41005805957](https://github.com/Report-Engainall/Nasr1/actions/runs/41005805957), job `123901219757`, failed at `scripts/test-cash-expense-journal-posting.mjs:293`; the assertion regex excluded the actual SQL message `only draft journal entries can be posted`. This is an assertion mismatch in P2-owned `scripts/**`; P1 did not modify it. Subsequent purchase-receipt/browser steps were skipped. REQUEST TO P2: inspect the transaction state and expected contract, then correct only the message assertion or the actual state defect with evidence; do not weaken authorization/ledger semantics.
- DLV-014 remains PARTIAL for remote revocation while fully offline; reconnect/session boundary behavior was previously tested only on `ee1b843`. No hosted or production proof is claimed.
- local execution: Remote Desktop Commander device `PC01` was OFFLINE; no claim is made that this session ran `npm test`, `npm run typecheck`, or `npm run build` locally. The exact-head Core CI completed the full unit suite and build. No P1 source file was changed or left uncommitted by this continuation.
- next_action: after the P2 assertion issue is resolved and its local Supabase job completes on an exact current code SHA, continue one open P1 leaf acceptance under DLV-002 or DLV-003 using existing task IDs, starting with an uncovered customer/admin route's real error/retry/unauthorized UI behavior; do not duplicate merged P1 customer/session tasks.
- exact_next_command: `npm test -- src/test/admin-customer-360-display.test.tsx src/test/admin-customer-360-scoped-data.test.ts && npm run typecheck && npm run build` (run from an online checkout on the next code candidate; current full Core CI already passed build on `2154e540`).
- reserved_paths: P1 `src/components/**`, `src/routes/**`, `src/styles.css`, UI tests only; P2 `scripts/**`, `supabase/**`, API/service files and central state remain untouched by P1.

## Current checkpoint

- updated_at_utc: `2026-10-30T04:42:10.000Z`
- owner: P1
- current_main_sha: `2154e540b5cf30f0b918d913de738c17fa968820` (observed main code head before this checkpoint-only write; see latest continuation below).
- verified_code_sha: `5e53622b66de3947758b14026432953560b267bb` — exact Core `41003314314` SUCCESS and exact P2 `41003314335` SUCCESS. P2 local Supabase/Chromium proofs include authenticated order persistence/tenant denial, returns/credit memo, Onyx 27-column XLSX, financial/task printing, customer-manager privacy/audit, and device-session revocation; hosted customer/order/tenant remains SKIPPED. Customer 360 fixes introduced later at `d3159bc` and `9f5d3af` are CI_PENDING.
- task_id: `DLV-010 / DLV-002 / DLV-003 / DLV-004 / DLV-017`
- task_status: `DLV-010 CUSTOMER 360 SOURCE-LINEAGE FIX IMPLEMENTED / CI_PENDING`. In `d3159bc`, optional overdue invoice count now displays `غير متاح`, never fabricated zero. In `9f5d3af`, payments linked to invoices outside the recent-20 window no longer display truncated internal UUID as invoice number or assume `YER`; UI explicitly says invoice/currency outside recent window and amount currency is unavailable. Core `41004028451` in progress on `9f5d3af`; P2 `41004028314` was CANCELLED before jobs because the same P2 concurrency group was occupied by parent run `41003925129`; parent P2 `41003925129` SUCCESS on `d3159bc`; cleanup `41004028444` SUCCESS on `9f5d3af`. Hosted customer/order/tenant remains SKIPPED. Full DLV-010 rollup remains PARTIAL.
- reserved_paths: P1-owned `src/components/**`, `src/routes/**`, `src/styles.css`, and `src/test/**` UI acceptance only. P2 owns `scripts/**`, `supabase/**`, `src/lib/api.ts`, `src/lib/supabase.ts`, RLS/RPC/Edge, global cursor, matrix CSV and execution log. Do not modify P2-owned paths.
- commit_sha: audit responsive filters `ade327b7575ff6380807354a88faaf675b90e024`; audit paging acceptance `373460ff663c409da9aee3874a6b1182b565bcab`; audit loading/error hardening `cd90ed3f45c59fcec9bda49bb2d169f673ea201d`; safe error regression `055703d68e72915db266065e2feecc687b86bfcb`; mobile navigation `e4b85ab5e0fc177f514df768e2fb3db37fa805d4`; checkout ambiguity recovery `f341a1600d117dc0401a04491430720e7867e9d1`; checkout pre-write/profile-scope guard `4a02ee63a63f58e79db688f003c8610e1b9ea8cd`; checkout assertion corrections `f7f27e752ffaa3279934cb1316c4dff7a20c0ce7` / `582e41e12f423f19c661ea45e7d21f28740e2309`; product detail toggle/MOQ `ca1dd266197f6dec85658b5a5604be24539f8773`; mobile runtime test `ef1cc8edb7689da18263f72c0a9865f9bb904e52`; scoped test/mocks `774780758a41a745d073e5b6040efe9967363ea6` / `9ba125b796ac87394c68de04ac1743d139d94493`; unknown inventory fix `f4cd421fcef6bb9b266682b71e2fc84f7739fd7b`; current P2-only head `5e53622b66de3947758b14026432953560b267bb`.
- exact_next_action: inspect Core `41004028451` on code SHA `9f5d3af`; P2 `41004028314` was cancelled before jobs while parent P2 `41003925129` SUCCESS on `d3159bc`, so request current-head P2 only after the parent run is fully released and do not transfer the parent P2 result to the later payment-source-lineage change. On Core failure inspect focused test/log. Then continue one uncovered DLV-010 source-lineage/UI requirement.

## Completed work — newest first

| UTC | Task ID | Status | Base SHA | Result SHA | Changed files | Exact tests/results | Evidence |
|---|---|---|---|---|---|---|---|
| 2026-10-30T04:36:30.000Z | DLV-010 | CUSTOMER 360 UNKNOWN OVERDUE COUNT PRESERVED | `56856174efce7520092bd4f4749a27aaa89e4787` | `d3159bca08af0b1db3ce9f1a338b9cba360b71b7` | `src/components/AdminCustomer360.tsx`; `src/test/admin-customer-360-scoped-data.test.ts` | Missing optional overdue invoice count in a recommendation now displays `غير متاح`, not zero; regression source-contract test added. Exact candidate Core `41003924978` in progress at last capture; P2 parent `41003925129` completed SUCCESS on this SHA; hosted tenant path SKIPPED. | [Commit](https://github.com/Report-Engainall/Nasr1/commit/d3159bca08af0b1db3ce9f1a338b9cba360b71b7) · [Core](https://github.com/Report-Engainall/Nasr1/actions/runs/41003924978) · [P2](https://github.com/Report-Engainall/Nasr1/actions/runs/41003925129) |
| 2026-10-30T04:38:00.000Z | DLV-010 | CUSTOMER 360 PAYMENT SOURCE AND CURRENCY LINEAGE | `d3159bca08af0b1db3ce9f1a338b9cba360b71b7` | `9f5d3af8e4f57bd758f3eb779cb6971be0a7d829` | `src/components/AdminCustomer360.tsx`; `src/test/admin-customer-360-scoped-data.test.ts` | For payments whose invoice is outside latest 20, no truncated UUID is presented as invoice number; no default YER currency is invented; label states that invoice and currency are outside the recent window, and amount is unavailable. Regression test added. Core `41004028451` in progress; current P2 `41004028314` cancelled before jobs due concurrency; parent P2 `41003925129` SUCCESS on `d3159bc`, not transferable to `9f5d`. | [Commit](https://github.com/Report-Engainall/Nasr1/commit/9f5d3af8e4f57bd758f3eb779cb6971be0a7d829) · [Core](https://github.com/Report-Engainall/Nasr1/actions/runs/41004028451) · [P2 attempt](https://github.com/Report-Engainall/Nasr1/actions/runs/41004028314) |
| 2026-10-30T04:32:00.000Z | DLV-004 | AMBIGUOUS CHECKOUT RETRY / NO-WRITE GUARD / PROFILE SCOPING | `7a2ab640172af9500eae83a4b0d0a239a02879a3` | `9ba125b796ac87394c68de04ac1743d139d94493` | `src/components/Storefront.tsx`; `src/test/cart-checkout-route-acceptance.test.tsx` | Unresolved attempt survives reload with original idempotency key; different payload blocked before cart save or order RPC; same payload replays same key; session storage scoped by customer profile. Core `41003005764` SUCCESS and P2 `41003005777` SUCCESS on exact SHA. Local P2 proves authenticated order persistence and cross-tenant denial; hosted job SKIPPED. | [Guard commit](https://github.com/Report-Engainall/Nasr1/commit/4a02ee63a63f58e79db688f003c8610e1b9ea8cd) · [Core](https://github.com/Report-Engainall/Nasr1/actions/runs/41003005764) · [P2 local](https://github.com/Report-Engainall/Nasr1/actions/runs/41003005777) |
| 2026-10-30T04:32:30.000Z | DLV-002 / DLV-017 | MOBILE ADMIN DRAWER RUNTIME KEYBOARD ACCEPTANCE | `e4b85ab5e0fc177f514df768e2fb3db37fa805d4` | `9ba125b796ac87394c68de04ac1743d139d94493` | `src/test/admin-mobile-navigation-acceptance.test.tsx`; `src/components/AghbariApp.tsx`; `src/aghbari.css` | Real `AdminApp` mount opens drawer, focuses first nav item, Escape closes and restores trigger focus, route selection closes and navigates. vi.mock hoisting issue corrected before `9ba125b`. Exact Core PASS. Full viewport matrix and P75/P95 rollups remain OPEN. | [Runtime test](https://github.com/Report-Engainall/Nasr1/commit/ef1cc8edb7689da18263f72c0a9865f9bb904e52) · [Test correction](https://github.com/Report-Engainall/Nasr1/commit/9ba125b796ac87394c68de04ac1743d139d94493) · [Core](https://github.com/Report-Engainall/Nasr1/actions/runs/41003005764) |
| 2026-10-30T04:33:00.000Z | DLV-003 | PRODUCT DETAIL TOGGLES / MOQ / UNKNOWN STOCK FAIL-CLOSED | `3793a3d91894e4002c2214b24ddacd9093845ada` | `f4cd421fcef6bb9b266682b71e2fc84f7739fd7b` | `src/components/Storefront.tsx`; `src/test/storefront-product-routes-acceptance.test.tsx` | Wishlist/compare are exposed by `aria-pressed`; MOQ disables add. Missing/non-finite/negative inventory is no longer misreported as zero stock, it blocks add, and the status announces that stock could not be verified. Removed fabricated generic product-description fallback. Toggle/MOQ Core proof is on `9ba125b`; unknown-inventory guard awaits current Core `41003314314` on `5e53622`. | [Toggle/MOQ](https://github.com/Report-Engainall/Nasr1/commit/ca1dd266197f6dec85658b5a5604be24539f8773) · [Unknown-stock guard](https://github.com/Report-Engainall/Nasr1/commit/f4cd421fcef6bb9b266682b71e2fc84f7739fd7b) · [Core candidate](https://github.com/Report-Engainall/Nasr1/actions/runs/41003314314) |
| 2026-10-30T03:53:00.000Z | P1-ADMIN-AUDIT-PAGING-001 | ROUTE ACCEPTANCE ADDED / CI_PENDING | `240b5ff90a44a6ceb0b2f7119b1f0ed1b3979075` | `5e1339b77709d32f15d1ca41a2103cbdec3ce682` | `src/test/admin-audit-route-acceptance.test.tsx` | Four direct `/admin/audit` route cases: manager sees tenant-filtered event and localized label; staff is denied before any scope/table read; empty view only with confirmed count 0; backend read error shown then visible retry recovers. Core `40999638939` in progress; P2 `40999638700` pending; cleanup `40999638654` success. | [Commit](https://github.com/Report-Engainall/Nasr1/commit/5e1339b77709d32f15d1ca41a2103cbdec3ce682) · [Core](https://github.com/Report-Engainall/Nasr1/actions/runs/40999638939) · [P2](https://github.com/Report-Engainall/Nasr1/actions/runs/40999638700) · [Cleanup](https://github.com/Report-Engainall/Nasr1/actions/runs/40999638654) |
| 2026-10-30T03:57:00.000Z | P1-ADMIN-AUDIT-PAGING-001 | RETRY_1 / ROUTER FACTORY CORRECTED / CI_PENDING | `5e1339b77709d32f15d1ca41a2103cbdec3ce682` | `d09f17518699731b9d1449b41a878968b35f9f10` | `src/test/admin-audit-route-acceptance.test.tsx` | First Core `40999638939` failed 4/4 new cases before route mount: `TypeError: createRootRoute(...) is not a function`. Corrected to `createRootRouteWithContext<Record<string, never>>()` plus explicit context; no product code changed. Revalidation Core `40999915336`, P2 `40999915252`, cleanup `40999915125` queued/pending. | [Failed Core](https://github.com/Report-Engainall/Nasr1/actions/runs/40999638939) · [Correction commit](https://github.com/Report-Engainall/Nasr1/commit/d09f17518699731b9d1449b41a878968b35f9f10) · [Core retry](https://github.com/Report-Engainall/Nasr1/actions/runs/40999915336) · [P2](https://github.com/Report-Engainall/Nasr1/actions/runs/40999915252) |
| 2026-10-30T03:59:08.000Z | P1-ADMIN-AUDIT-PAGING-001 | RETRY_2 / LOCALIZED ERROR ASSERTION CORRECTED / CI_PENDING | `d09f17518699731b9d1449b41a878968b35f9f10` | `19e9a8c70655e3052fbbcd10dc85932fca0ae62b` | `src/test/admin-audit-route-acceptance.test.tsx` | Core `40999915336` found one assertion mismatch: expected raw English backend error; actual UI alert is the localized generic Arabic message. Corrected the expectation only; manager/staff/empty/retry behavior remains under exact-SHA validation. Core/P2/Cleanup `41000339216` / `41000339216` / `41000339285`. | [Commit](https://github.com/Report-Engainall/Nasr1/commit/19e9a8c70655e3052fbbcd10dc85932fca0ae62b) · [Prior Core failure](https://github.com/Report-Engainall/Nasr1/actions/runs/40999915336) · [Core](https://github.com/Report-Engainall/Nasr1/actions/runs/41000339216) · [P2](https://github.com/Report-Engainall/Nasr1/actions/runs/41000339216) · [Cleanup](https://github.com/Report-Engainall/Nasr1/actions/runs/41000339285) |
| 2026-10-30T04:16:30.000Z | DLV-004 | CHECKOUT AMBIGUOUS-RESULT RECOVERY / IDEMPOTENCY AND NO-WRITE GUARD IMPLEMENTED / CI_PENDING | `9f13ada470d4c08727afb9e8d2d5a4cb654bfb94` | `4a02ee63a63f58e79db688f003c8610e1b9ea8cd` | `src/components/Storefront.tsx`; `src/test/cart-checkout-route-acceptance.test.tsx` | An unresolved order attempt survives page reload with original idempotency key; a different payload is refused before cart persistence or order RPC; exact previous payload replays the same key; profile-scoped attempt storage prevents another account overwriting it; malformed/server/transport acknowledgement remains ambiguous and locks form until resolved. Tests added/updated, pending exact-SHA CI. Core `41002020481` in progress; P2 `41002020466` pending; Cleanup `41002020501` success. | [Initial recovery commit](https://github.com/Report-Engainall/Nasr1/commit/f341a1600d117dc0401a04491430720e7867e9d1) · [Pre-write/profile isolation hardening](https://github.com/Report-Engainall/Nasr1/commit/4a02ee63a63f58e79db688f003c8610e1b9ea8cd) · [Core](https://github.com/Report-Engainall/Nasr1/actions/runs/41002020481) · [P2](https://github.com/Report-Engainall/Nasr1/actions/runs/41002020466) · [Cleanup](https://github.com/Report-Engainall/Nasr1/actions/runs/41002020501) |
| 2026-10-30T04:11:00.000Z | DLV-002 / DLV-017 | MOBILE ADMIN NAVIGATION ACCESSIBILITY SLICE IMPLEMENTED / CI_PENDING | `055703d68e72915db266065e2feecc687b86bfcb` | `e4b85ab5e0fc177f514df768e2fb3db37fa805d4` | `src/components/AghbariApp.tsx`; `src/aghbari.css`; `src/test/storefront-admin-navigation-access.test.ts` | Mobile menu labelled with `aria-expanded`/`aria-controls`; sidebar and nav have accessible names; active route announces `aria-current`; opening focuses first menu item; Escape closes and returns focus; closed off-canvas drawer is `visibility:hidden`. DLV-002 and DLV-017 rollups remain OPEN for remaining routes, browser viewport tests and P75/P95 measurements. | [Commit](https://github.com/Report-Engainall/Nasr1/commit/e4b85ab5e0fc177f514df768e2fb3db37fa805d4) · [Core](https://github.com/Report-Engainall/Nasr1/actions/runs/41001506143) · [P2](https://github.com/Report-Engainall/Nasr1/actions/runs/41001506155) · [Cleanup](https://github.com/Report-Engainall/Nasr1/actions/runs/41001506103) |
| 2026-10-30T04:08:00.000Z | P1-ADMIN-AUDIT-PAGING-001 | IMPLEMENTED / EXACT-SHA CI_PENDING | `96ab8c7156f1664f41b47cc81b2b45fd560e9532` | `cd90ed3f45c59fcec9bda49bb2d169f673ea201d` | `src/components/AdminAuditLog.tsx`; `src/test/admin-audit-route-acceptance.test.tsx` | Responsive auto-fit filters; loading defaults true to prevent false empty state; catch uses generic localized error without leaking thrown diagnostics. Seven direct route cases cover loading, error redaction, manager scoped read, staff denial before reads, confirmed empty, bounded next/previous paging with tenant filters and retry recovery. Core `41001161564` in progress; P2 `41001161546` pending; cleanup `41001161672` SUCCESS on exact SHA. | [Responsive UI commit](https://github.com/Report-Engainall/Nasr1/commit/ade327b7575ff6380807354a88faaf675b90e024) · [Pagination test](https://github.com/Report-Engainall/Nasr1/commit/373460ff663c409da9aee3874a6b1182b565bcab) · [Loading/error fix](https://github.com/Report-Engainall/Nasr1/commit/cd90ed3f45c59fcec9bda49bb2d169f673ea201d) · [Core](https://github.com/Report-Engainall/Nasr1/actions/runs/41001161564) · [P2](https://github.com/Report-Engainall/Nasr1/actions/runs/41001161546) · [Cleanup](https://github.com/Report-Engainall/Nasr1/actions/runs/41001161672) |
| 2026-10-30T03:47:00.000Z | DLV-017 | UI ACCESSIBILITY SLICE VERIFIED / ROLLUP OPEN | `5712e3d4111f448e7784affb8b459bc5103361f8` | `d238805d7b7e4ba61ae0287d1a6ac773dab30d94` | `src/components/CustomerActivationInvitationDialog.tsx`; `src/test/customer-activation-invitations-dialog.test.tsx` | Dialog behavior: initial focus, Shift+Tab wrap to last control, Tab wrap to first, Escape calls close callback, unmount restores focus to opener. Focused test is part of Core suite. Exact Core `40998781849` SUCCESS: 217/217 files and 1423/1423 tests; dialog 9/9; migrations/PG17/RPC inventory/backup-restore/lint/build/preview/dev smoke/Chromium price policy SUCCESS. Exact P2 `40998769174` SUCCESS; local Chromium customer-manager workflow and other local critical paths passed. Hosted customer/order/tenant sub-job SKIPPED. | [Commit](https://github.com/Report-Engainall/Nasr1/commit/d238805d7b7e4ba61ae0287d1a6ac773dab30d94) · [Core](https://github.com/Report-Engainall/Nasr1/actions/runs/40998781849) · [P2](https://github.com/Report-Engainall/Nasr1/actions/runs/40998769174) · [Cleanup](https://github.com/Report-Engainall/Nasr1/actions/runs/40998769422) |
| 2026-10-30T03:47:00.000Z | P1-CUSTOMER-MANAGER-INVITATION-001 | LOCAL ACCEPTANCE PASS / HOSTED BLOCKED_EXTERNAL / REVALIDATED | `8d38d3cbf8b315484206d850423631b231df0bfd` | `d238805d7b7e4ba61ae0287d1a6ac773dab30d94` | `src/components/CustomerActivationInvitationDialog.tsx`; `src/test/customer-activation-invitations-dialog.test.tsx` | Current exact SHA Core passes all 9 dialog tests. P2 local Supabase test `e2e/customer-manager-authorization.spec.ts:95` passed 1/1: guarded directory RPC/privacy, direct table and restricted-route denial, customer tier/status audit, activation invite create + revoke, persisted revoked invitation state and creation audit. Hosted customer/order/tenant job SKIPPED; live email delivery not claimed. | [Core](https://github.com/Report-Engainall/Nasr1/actions/runs/40998781849) · [P2 local acceptance](https://github.com/Report-Engainall/Nasr1/actions/runs/40998769174) |
| 2026-10-30T03:41:00.000Z | DLV-017 | IMPLEMENTED / CI_PENDING | `5712e3d4111f448e7784affb8b459bc5103361f8` | `d238805d7b7e4ba61ae0287d1a6ac773dab30d94` | `src/components/CustomerActivationInvitationDialog.tsx`; `src/test/customer-activation-invitations-dialog.test.tsx` | Added initial focus, Tab/Shift+Tab wrap, Escape close when not busy, and focus restoration to opener; new keyboard regression test. Core `40998781849` in progress; P2 `40998769174` in progress; cleanup `40998769422` queued. | [Commit](https://github.com/Report-Engainall/Nasr1/commit/d238805d7b7e4ba61ae0287d1a6ac773dab30d94) · [Core](https://github.com/Report-Engainall/Nasr1/actions/runs/40998781849) · [P2](https://github.com/Report-Engainall/Nasr1/actions/runs/40998769174) |
| 2026-10-30T03:38:06.000Z | P1-CUSTOMER-MANAGER-INVITATION-001 | LOCAL_ACCEPTANCE_PASS / HOSTED_BLOCKED_EXTERNAL | `42bf13a52210c8dc3997d2293c3174c9d3da22df` | `8d38d3cbf8b315484206d850423631b231df0bfd` | `src/components/CustomerActivationInvitationDialog.tsx`; `src/test/customer-activation-invitations-dialog.test.tsx` | Core exact SHA: 217/217 files, 1422/1422 tests; invitation dialog 8/8 plus invitation/security suites. P2 local Supabase/Chromium customer-manager test `e2e/customer-manager-authorization.spec.ts:95` passed 1/1, proving guarded directory RPC, direct-table denial, tenant denial/no mutation, actual create/revoke UI, DB revoked status and audit. Hosted activation/email delivery remains SKIPPED / BLOCKED_EXTERNAL. | [Component fix](https://github.com/Report-Engainall/Nasr1/commit/015fba9a08a90aa0b70fa7e724a5648faa6d09fa) · [Core](https://github.com/Report-Engainall/Nasr1/actions/runs/40997956792) · [P2 local](https://github.com/Report-Engainall/Nasr1/actions/runs/40997956850) |
| 2026-10-30T03:36:00.000Z | P1-CUSTOMER-MANAGER-INVITATION-001 | CORE_PASS / P2_LOCAL_PENDING | `015fba9a08a90aa0b70fa7e724a5648faa6d09fa` | `8d38d3cbf8b315484206d850423631b231df0bfd` | Core verification of prior UI/test commits; changed files remain `src/components/CustomerActivationInvitationDialog.tsx`, `src/test/customer-activation-invitations-dialog.test.tsx` | Core `40997956792` SUCCESS: 217/217 files and 1422/1422 tests; targeted dialog test passed 8/8. Migrations/PG17, RPC inventory, backup/restore, lint, build, preview/dev smoke and Chromium price visibility all SUCCESS. P2 `40997956850` still IN_PROGRESS; public UI smoke success, local Supabase job in progress, hosted customer/tenant SKIPPED. Cleanup `40997956785` SUCCESS. | [Code fix](https://github.com/Report-Engainall/Nasr1/commit/015fba9a08a90aa0b70fa7e724a5648faa6d09fa) · [Test correction](https://github.com/Report-Engainall/Nasr1/commit/8d38d3cbf8b315484206d850423631b231df0bfd) · [Core](https://github.com/Report-Engainall/Nasr1/actions/runs/40997956792) · [P2](https://github.com/Report-Engainall/Nasr1/actions/runs/40997956850) · [Cleanup](https://github.com/Report-Engainall/Nasr1/actions/runs/40997956785) |
| 2026-10-30T03:27:30.000Z | P1-CUSTOMER-MANAGER-INVITATION-001 | IMPLEMENTED / CI_PENDING | `42bf13a52210c8dc3997d2293c3174c9d3da22df` | `015fba9a08a90aa0b70fa7e724a5648faa6d09fa` | `src/components/CustomerActivationInvitationDialog.tsx`; `src/test/customer-activation-invitations-dialog.test.tsx` | Added two regression tests (successful revoke + failed list refresh hides stale pending state; customer switch cannot display previous customer's invite). Exact-head Core `40997643056` queued; P2 `40997643088` queued. | [Commit](https://github.com/Report-Engainall/Nasr1/commit/015fba9a08a90aa0b70fa7e724a5648faa6d09fa) · [Core](https://github.com/Report-Engainall/Nasr1/actions/runs/40997643056) · [P2](https://github.com/Report-Engainall/Nasr1/actions/runs/40997643088) |
| 2026-10-30T03:32:00.000Z | P1-CUSTOMER-MANAGER-INVITATION-001 | RETRY_1 / ASSERTION_CORRECTED / CI_PENDING | `015fba9a08a90aa0b70fa7e724a5648faa6d09fa` | `8d38d3cbf8b315484206d850423631b231df0bfd` | `src/test/customer-activation-invitations-dialog.test.tsx` | Core 40997643056 on base SHA: 216/217 files, 1421/1422 tests passed; one failure was an ambiguous role query matching two intended alerts. Replaced it with exact-text lookup. New Core 40997956792 and P2 40997956850 are pending. | [Base Core failure](https://github.com/Report-Engainall/Nasr1/actions/runs/40997643056) · [New Core](https://github.com/Report-Engainall/Nasr1/actions/runs/40997956792) · [New P2](https://github.com/Report-Engainall/Nasr1/actions/runs/40997956850) |
| 2026-10-30T03:11:31.464Z | VERIFY-PWA-CACHE-AND-CART-SCOPE-EE1B843 | COMPLETE / TESTED_EXACT_SHA | `15269cbf30f281591d5e7ff2ceda866bf38d284c` | `ee1b84303e5fc18b46bed0b37a880a306e06d5d8` | `src/routes/__root.tsx`; `src/components/CustomerWorkflows.tsx`; `src/lib/offline-catalog-cache.ts`; `src/lib/offline-catalog-cache.test.ts`; `src/lib/supabase.ts`; `src/lib/supabase-tenant-scope.test.ts`; `src/test/auth-session-cache-boundary.test.tsx`; `src/test/customer-workflow-tenant.test.tsx`; `src/test/offline-workspace-route-acceptance.test.tsx` | Core `40995284940` SUCCESS; P2 local Supabase/Chromium `40995284968` SUCCESS; one-main cleanup `40995284973` SUCCESS, all on exact code SHA `ee1b843`. Unit suite: 217/217 files and 1420/1420 tests passed. Core run `40995493763` also SUCCESS on current docs-only head `3b45235`. | [Core exact code SHA](https://github.com/Report-Engainall/Nasr1/actions/runs/40995284940) · [P2 local acceptance](https://github.com/Report-Engainall/Nasr1/actions/runs/40995284968) · [Cleanup](https://github.com/Report-Engainall/Nasr1/actions/runs/40995284973) · [Core current docs head](https://github.com/Report-Engainall/Nasr1/actions/runs/40995493763) |

## What was verified

- Catalog cache keys are isolated by authenticated profile; freshness markers share the same profile namespace.
- A server-derived scope fingerprint binds the cached rows to profile, organization, warehouse and staff/customer mode. A missing or changed marker invalidates rows; old global unscoped keys are retired.
- Explicit tenant-scope revalidation bypasses the per-user memoized scope result before the cache is read or a new catalog is saved.
- Catalog sync rechecks the tenant scope after product retrieval; a scope change during sync clears the cache and prevents persistence.
- Catalog rows are hidden while a fresh online scope is being resolved after reconnect/session change.
- Catalog invalidation does not erase a profile-bound cart draft; drafts remain review-only and never create offline orders, payments or inventory writes.
- An offline account switch clears both outgoing and incoming profile catalog namespaces before the new identity paints.
- Profile switch/logout and tenant/warehouse scope-change acceptance passed.

## Proof boundary and remaining limitations

- DLV-014 remains **PARTIAL**, not closed: a remote revocation that occurs while a device is completely offline cannot be observed until a server/session event or reconnection. Identity-boundary events clear both relevant catalogs; after reconnect the UI clears displayed rows while refreshing the server scope.
- P2 local Supabase/Chromium accepted authenticated order/tenant denial, return→credit memo, audited 27-column Onyx XLSX download/parse, finance/task prints, customer-manager privacy/audit and device-session revocation.
- The hosted customer/order/tenant Playwright job was **SKIPPED**, not passed. No hosted or production authorization, Onyx target-version, WhatsApp delivery, live AI provider, production deploy/rollback or production restore proof is claimed.
- Release remains **NO-GO** for full production release.
- `src/lib/supabase.ts` was changed to support an explicit fresh-scope lookup. Under the current parallel protocol that service file is P2-owned; P1 will not edit it again without reassignment. P2 should retain the backend/service ownership for subsequent changes. `src/routes/__root.tsx` participates in the P1 auth/cache boundary and passed exact-SHA Core/P2.
- No uncommitted work remains from this task.

## In progress / uncommitted work

- Files: none; P1 changes are committed through `9f5d3af8e4f57bd758f3eb779cb6971be0a7d829`, all ancestors of current main `7fdb6cc72f784024c4c0c89fdec2d12d152d7fd8`.
- Exact verified candidate `5e53622b66de3947758b14026432953560b267bb`: Core `41003314314` SUCCESS; P2 `41003314335` SUCCESS; PG17 import finalizer `41003314472` SUCCESS; cleanup `41003314373` SUCCESS.
- P2 local success on parent `d3159bc`: authenticated order persistence and tenant denial, returns/credit memo, audited Onyx XLSX, financial/task print, customer-manager auth/privacy/audit, device-session revocation. Hosted customer/order/tenant is SKIPPED.
- Customer 360 changes: `d3159bc` removes fake zero for optional overdue-invoice counts in recommendations; `9f5d3af` removes truncated invoice IDs and guessed YER currency when a recent payment links to an invoice outside the latest-20 invoice details.
- Current candidate: Core `41004028451` on `9f5d3af` IN_PROGRESS (Unit tests passed; PostgreSQL 17 migration/core workflow step active). Current P2 `41004028314` CANCELLED before jobs due shared P2 concurrency; parent P2 `41003925129` still completed SUCCESS on `d3159bc`, not exact proof for `9f5d3af`. Cleanup `41004028444` SUCCESS.
- Full DLV-010 rollup remains PARTIAL pending business UAT, external hosted proof and full-source lineage scenarios; other DLV rollups remain open as documented above.
- Exact next command: inspect Core `41004028451` and determine whether the PostgreSQL 17 run, lint/build/Chromium finish. Once P2 concurrency releases, obtain P2 local verification for `9f5d3af` specifically; do not infer from `d3159bc`.
- Do not discard: no uncommitted changes remain.

## REQUEST TO P2 — API/backend contract

- Acceptance task ID: `VERIFY-PWA-CACHE-AND-CART-SCOPE-EE1B843` (verification task complete; not a DLV-014 closure).
- UI path(s): `/offline`; account/session scope boundary in `src/routes/__root.tsx`.
- User action: refresh/read an offline catalog, switch account/session, reconnect, and restore a cart draft.
- Required API/RPC: existing `get_current_tenant_scope` through `getCurrentTenantScope({ forceRefresh: true })`; existing `fetchProducts`.
- Request payload: none added.
- Response fields: server-derived `profile_id`, `organization_id`, `warehouse_id`, `is_staff`.
- Server-derived identity/tenant/role rules: client scope marker is a consistency key only, not an authorization credential; server remains authoritative.
- Error states and SQLSTATE/HTTP status: no new backend status added; failure to resolve current scope hides and clears the cached catalog.
- Idempotency/audit/side-effect rules: cache is local read-only data; offline draft is profile-scoped; no order/stock/finance mutation is sent offline.
- Required acceptance test: forced scope refresh; same-profile organization/warehouse change; delayed sync crossing tenant boundary; account switch/logout; offline switch clears outgoing and incoming profile catalog.
- Can P1 work independently while pending? YES — continue on separate route/UI acceptance rows.

## P2 RESPONSE / CONTRACT

- Decision: existing scope RPC and product fetch reused; no new SQL/RPC or schema change.
- Contract owner: P2 for service/backend contract; P1 for presentation/cache lifecycle in the assigned task.
- P2-owned files: `src/lib/supabase.ts`, `src/lib/api.ts`, `supabase/**`, `scripts/**` and central state files.
- Request/response schema: existing tenant-scope payload listed above.
- Permission/tenant semantics: fail closed if no current server scope or a profile mismatch exists.
- Error semantics: cached catalog is not rendered when revalidation fails.
- Test proof / SHA: Core `40995284940` and P2 `40995284968` SUCCESS on `ee1b84303e5fc18b46bed0b37a880a306e06d5d8`.
- P1 may integrate at: existing `/offline` route; no further service contract change requested.


## Three-agent ownership override — 2026-10-30
P1 continues UI ownership and this checkpoint only. P2 owns backend/API/security. P3 owns the intelligence reserved files, global cursor, matrix and central execution log. See section 11 of CONTINUOUS_PARALLEL_EXECUTION_PROTOCOL.md. P1 must not edit global CURRENT_EXECUTION_STATE, CSV or EXECUTION_LOG. Gallery is docs/reference-app/README.md; no archive re-extraction.

<!-- Historical append-only P1 checkpoint from PR #345; snapshot main SHA 06aaccb0f8172f3f1b682c38885650ce136d0b90. These entries record state at the dated checkpoint, not live current refs. -->

## P1 security closeout resume checkpoint — 2026-11-01

- **Task:** P1-SECURITY-ASSURANCE-EXACT-SHA-CLOSEOUT.
- **Repository:** `Report-Engainall/Nasr1`; current `main`: `06aaccb0f8172f3f1b682c38885650ce136d0b90`.
- **P1 original source:** PR #339 MERGED at `71de0500aab508cc4cd4d41265304c397a4f3345`.
- **P1 security follow-up PR #350:** OPEN / mergeable / not merged; branch `fix/p1-gitleaks-full-history-typecheck-20261101`, source head `b07bccf09a4c577fdc9b268dfbff8153b63bd062`, base current main `06aaccb...`, 18 ahead / 0 behind.
- **P1 documentation PR #345:** OPEN / mergeable; branch `docs/p1-post-merge-verification-20261101`; latest documented head at this checkpoint `a6708e9a431a8e33568cbfc57a54700831fe21dd`. Files changed by the P1 doc branch: `P1.md` and this `P1_CHECKPOINT.md`; P2/P3 own synchronization/integration.

### Last completed exact P1 proof set
- P1 source head: `b07bccf...`.
- Synthetic merge SHA: `d9326bc704bcc65eb409f7a618aef361d188450e` (P1 source b07bccf into main06aaccb).
- Gitleaks [41266134962](https://github.com/Report-Engainall/Nasr1/actions/runs/41266134962), job 124729216017: terminal SUCCESS; CLI 8.30.1; non-shallow; 3,333 commits available / 3,045 scanned; 11 remote branches / 107 tags; `--full-history --all --diff-filter=tuxdb`; historical Canary PASS; zero remaining findings. Redacted artifact ID 13067138737 was downloaded/inspected and JSON is `[]`.
- Strict P1 TypeScript + AST [41266134980](https://github.com/Report-Engainall/Nasr1/actions/runs/41266134980), job 124729216018: terminal SUCCESS; five P1 files/import graph typecheck; AST proxy PASS (critical-path max 74 lines / limit80, max depth2 / limit5); AI Gateway 18/18 + password-reset security4/4 =22/22. AST proxy is supplemental only, not CodeInspector.
- P3 tooling [41266134976](https://github.com/Report-Engainall/Nasr1/actions/runs/41266134976): JavaScript and Python jobs SUCCESS.
- Current Core [41266135010](https://github.com/Report-Engainall/Nasr1/actions/runs/41266135010), job124729216159: **IN_PROGRESS**, 30 job steps completed; current step Browser price-visibility Chromium. Do not mark PASS until terminal.
- Current P2 Playwright [41266134959](https://github.com/Report-Engainall/Nasr1/actions/runs/41266134959):
  - Public Chromium job124729216516: SUCCESS.
  - Infrastructure evaluation job124729216526: SUCCESS only as an evaluation, emitted `ready=false`.
  - Hosted authenticated tenant job124729238430: SKIPPED / BLOCKED_EXTERNAL.
  - Local authenticated Supabase/PostgreSQL/Chromium job124729433829: **IN_PROGRESS**, 27 steps completed, currently running finance-document/operational-task print. No terminal local PASS yet at this checkpoint.

### Latest independent test baseline and known proof
- Previous exact local P2 job #41265473460 job124727526219 completed SUCCESS 40/40 on P1 source `6000e9ac...` (older, before the current source b07bccf). It proved order persistence/tenant isolation HTTP403/SQLSTATE42501, unchanged foreign customer tier, return/credit memo, Onyx 27-column XLSX, finance/task print, customer-manager privacy/audit, device-session revocation. Do not transfer this to current source b07bccf.
- Current local P2 job must prove exact checkout source b07bccf, pass all local PG17/browser paths, record proof boundary, stop local services and upload artifacts.

### Remaining open / blocked items
- **CodeInspector official scan:** BLOCKED_EXTERNAL / IMPLEMENTED_PENDING_FRESH_SCAN for 2 TS0002 + 5 TS0003. No signed-in service session/API/CLI/report. All TinyFish browser profiles have `domain_count=0` and no signed_in_sites; wallet balance `-0.072 USD`. Zero spend; no top-up. The AST proxy does not replace CodeInspector.
- **Hosted authenticated Tenant E2E:** BLOCKED_EXTERNAL / SKIPPED; missing dedicated hosted staging URL/key, two approved tenant identities and explicit `E2E_ALLOW_TEST_WRITES=YES_I_CONFIRM_NON_PRODUCTION`. No production writes.
- **Independent review:** PR #350 requested reviewer `adnanabderab2016-sys`; review API has three COMMENTED submissions by repository owner and no APPROVED submission. Wait for independent review; do not self-approve.
- **PR #350 merge:** currently mergeable after P2 synchronized branch and retained P1/P2 EVIDENCE.md content. P2 owns review/merge.
- **PR #345 integration:** P1.md + P1_CHECKPOINT only; P2/P3 own sync/integration.
- **P3 global cursor:** protocol names `docs/bolt-source-reconciliation/CURRENT_EXECUTION_STATE.md` as sole global resume and P3 owner of matrix/canonical execution log. That file and matrix remained stale at last review; P3 must update them after P1/P2 integration. Do not create a second execution log or edit these global files from P1.
- **Release:** NO-GO. Hosted E2E, official analyzer, independent review, and production operations/integrations remain unproven.

### Exact next actions
1. Poll Core run 41266135010 until terminal; record its exact synthetic merge SHA and logs.
2. Poll P2 run 41266134959 job124729433829 until terminal; verify `E2E_SOURCE_SHA=b07bccf...`, 403/42501/opaque denial/foreign tier unchanged, local shutdown and artifact upload.
3. P2 must obtain independent APPROVE and merge PR #350 only after all exact checks terminal-success and required review.
4. P2/P3 synchronize PR #345; P3 then updates global current state, the single acceptance matrix and canonical execution log.
5. Keep CodeInspector and Hosted E2E BLOCKED_EXTERNAL; never label skipped checks PASS.


## P1 checkpoint continuation — after PR #353 — 2026-11-01

- Current main SHA: `3312d571dbb31af3e776cd3f774ba4e725a20492` (P2 PR #353).
- PR #339: MERGED at `71de0500aab508cc4cd4d41265304c397a4f3345`.
- PR #350: OPEN, branch `fix/p1-gitleaks-full-history-typecheck-20261101`, head `b07bccf09a4c577fdc9b268dfbff8153b63bd062`, base `06aaccb0f8172f3f1b682c38885650ce136d0b90`; 18 ahead / 14 behind current main. P2 owns sync/retest/merge; prior full-history Gitleaks, strict TypeScript/Vitest, Core and P2 local/public SUCCESS evidence does not transfer to the synchronized successor SHA.
- PR #345: OPEN, P1 documentation branch `docs/p1-post-merge-verification-20261101`, latest commit will be recorded by the latest branch ref; it updates only P1-owned `P1.md` and `P1_CHECKPOINT.md` relative to current main. P2/P3 own synchronization/integration; P3 owns CURRENT_EXECUTION_STATE, matrix and canonical execution log.
- Current-main Core run `41267685250` and P2 Playwright run `41267685249` are IN_PROGRESS at latest observation. Hosted tenant E2E is SKIPPED/BLOCKED_EXTERNAL.
- Current-main P1 Secret Scan `41267685361` has Job SUCCESS but log reports 0 commits / 0 bytes from a first-parent PR range. This is not a valid repository-history scan. The correction is pending integration of PR #350.
- Initial full-history scan artifact 13065892318 contained 35 findings (1 JWT, 34 generic-api-key). P1 reviewed all 35 historical source contexts: test fixtures, auth/profile UUID identities, request/idempotency/period keys and Git/provenance identifiers; no live service/provider credential identified. The exact-fingerprint allowlist contains 35 unique entries with no broad rule/path suppression. Independent reviewer approval remains OPEN.
- Official CodeInspector TS0002 (2) / TS0003 (5) remains OPEN / IMPLEMENTED_PENDING_FRESH_SCAN. AST proxy and tsc are not CodeInspector.
- Do not mark Hosted E2E, official analyzer, independent review or overall production readiness PASS without their own evidence.



## P1 product-body delivery — BODY-COMPLETION-ON-MAIN-047 — atomic product image linking

- Parent main SHA: `c7a67c33c97996c0eebba5934a3afea1bcd7558d`.
- Fixed the product image path that previously uploaded to the Edge Storage boundary and then attempted a browser-side `UPDATE public.products`, despite the catalog migration revoking authenticated `UPDATE` on that table.
- Added `set_staff_product_image(uuid,text,text)` as a tenant-scoped, authenticated RPC. It verifies the active profile and admin/manager/staff role, locks the product row, compares the expected prior image URL, accepts only a same-tenant product-images WebP URL, writes the new URL and an append-only `catalog.product_image_updated` audit event in one transaction.
- The existing `product-image-upload` Edge Function now uses the caller JWT for the RPC and retains the service-role client for Storage operations only. New uploads are removed when the DB link definitively fails; ambiguous DB acknowledgements do not delete a potentially referenced object. Unlinking clears the DB URL first and then cleans the owned object.
- Client-side direct `products.image_url` DML was removed from `src/lib/api.ts`. Existing role checks, tenant checks, WebP validation, size bound, storage path validation and old-image cleanup order are preserved.
- Files: `src/lib/api.ts`, `supabase/functions/_shared/product-image-upload-handler.ts`, `supabase/functions/product-image-upload/index.ts`, `supabase/migrations/20261106140000_staff_product_image_atomic_link.sql`.
- Migration is source-only for Bolt New; it has not been applied to a connected database. No tests, build, lint, typecheck, CI, browser, E2E, Bolt, Preview, Vercel or production operation was run. Runtime acceptance is pending; no PASS is claimed.
- Next P1 action: continue the next concrete product-body gap without rebuilding completed catalog CRUD, category lifecycle, product search or storefront routes.


## P1 product-body delivery — BODY-COMPLETION-ON-MAIN-048 — multi-image product gallery

- Parent main SHA: `abce1525e2f40888dfbd921dac014f1d56f7b3f6`.
- Extended the product model with up to eight additional gallery images while preserving `image_url` as the primary image. The customer catalog projection exposes only HTTPS gallery URLs.
- Product management can queue multiple files, remove saved gallery entries and upload through the existing WebP image Edge boundary. The server validates active profile, tenant, role, same-tenant storage URL and the eight-image maximum; each gallery add/remove locks the product and appends an audit event.
- Product detail renders selectable image thumbnails and opens the selected image in the existing lightbox. Existing product cards, primary image handling and price projection remain unchanged.
- Files: `src/lib/api.ts`, `src/lib/types.ts`, `src/components/AghbariApp.tsx`, `src/components/Storefront.tsx`, `supabase/functions/_shared/product-image-upload-handler.ts`, `supabase/functions/product-image-upload/index.ts`, `supabase/migrations/20261106150000_product_gallery_images.sql`.
- Existing image Edge test doubles were aligned to the caller-JWT RPC contract; tests were NOT executed. The migration remains source-only and has not been applied to Bolt/Supabase. No build/lint/typecheck/CI/browser/E2E/runtime PASS is claimed.
- Next P1 action: continue the next uncovered commerce/operations capability without rebuilding existing catalog CRUD, category lifecycle, search or checkout idempotency.


## P1 product-body correction — BODY-COMPLETION-ON-MAIN-049 — use canonical product_media storage

- Reconciled the provisional BODY-048 image gallery with the original schema: `public.product_media` already exists and is the canonical multi-image table. The gallery UI now reads through this table and keeps `image_gallery_urls` only as a derived client DTO; it is not stored as a second product column.
- Added tenant-scoped product-media SELECT policy for the public storefront organization and for authenticated staff in their current organization; removed the original broad product-media read/write policies and revoked direct browser INSERT/UPDATE/DELETE.
- Replaced the provisional gallery-array persistence with an audited, row-locked `mutate_staff_product_gallery_image` RPC that adds/removes only non-primary media rows, enforces eight additional images, and records audit events. Existing primary `products.image_url` handling is unchanged.
- Added `supabase/migrations/20261106160000_product_media_gallery_lifecycle.sql` to drop the provisional `products.image_gallery_urls` column introduced by BODY-048 after switching the client to `product_media`.
- No tests/build/lint/typecheck/CI/browser/E2E/Bolt/Preview/Vercel/production operation was run. All migrations remain source-only until Bolt sync/apply; no runtime PASS is claimed.
