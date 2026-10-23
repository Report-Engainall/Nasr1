# P1 Execution Checkpoint — live resume record

## Current state — 2026-10-23

- Status: IN_PROGRESS.
- Repository / branch / PR: Report-Engainall/Nasr1 / p1/remaining-work-execution-20261023 / https://github.com/Report-Engainall/Nasr1/pull/66.
- Parent SHA for this mutation batch: 6cc9646b1be9a5f756612b2cd4d2a0506814431c. Current-parent Actions at checkpoint time: P2 Playwright Critical Paths: in_progress (https://github.com/Report-Engainall/Nasr1/actions/runs/39911875693); Aghbari Commerce checks: completed/success (https://github.com/Report-Engainall/Nasr1/actions/runs/39911875694)
- Verified Core anchor: run 39911295744 (https://github.com/Report-Engainall/Nasr1/actions/runs/39911295744) SUCCESS on exact source SHA b305c55bb2cabc8946d1328c92a7ee42aacefa31. A PASS on that SHA is not proof for any later source changes.
- Admin customer directory: src/lib/customer-directory.ts and src/components/AghbariApp.tsx implement server-derived tenant scope, staff gate, safe server-side search, exact count, bounded 25-row pages, stable ordering and out-of-range page correction. Tests: src/test/customer-directory-pagination.test.ts and src/test/admin-customer-directory.test.tsx. Later exact-head Core CI must be checked because the initial head exposed and then corrected missing React hook imports and an invalid search-sanitization test expression.
- New code/test batch in this commit: updateCustomerStatus validates nonblank ID/status, requires staff and a nonempty server-derived organization scope, filters the update by both customer ID and organization_id, requests the updated ID and rejects unless exactly one matching row is returned. This prevents zero-row stale/tenant-mismatched updates from being reported as approval success. Regression: src/test/customer-status-update.test.ts. The new code/test SHA has no CI result until its branch update triggers checks.
- Prior P1 changes retained: order detail retry/source-linked reorder validation; invite token URL cleanup/in-memory retry and workspace readiness/duplicate-submit guards; paged category landing; tenant-scoped audit pagination/fail-closed role/count handling; Customer 360 unavailable-money guard; customer order-history pagination/status filtering/stable sort; company revoke guard on stale workspace.
- PR #65 was merged first as squash 1a1c473ba9449af1671fe345eface1ed78583db6 and forward-integrated into this branch at b305c55bb2cabc8946d1328c92a7ee42aacefa31. Shared docs and P2 E2E/workflow updates are retained; do not merge #65 and #66 concurrently.
- Known earlier P2 E2E run 39908709174 (https://github.com/Report-Engainall/Nasr1/actions/runs/39908709174) returned “No tests found” for e2e/onyx-order-export.spec.ts on its old SHA. Current exact-head runs after PR65 integration are the only relevant evidence for the fix.
- Evidence boundary: Core CI is not per-control authenticated browser proof; production proof is NOT RUN.
- Next action: read the terminal results for the next exact-head Core/Playwright runs; continue one P1-owned customer/commercial gap at a time. Keep P2 finance/inventory/Onyx/E2E, src/components/CustomerWorkflows.tsx and src/components/Storefront.tsx out of P1 edits.

## Recent execution history

### 2026-10-23 — P1-01 — CLOSED_WITH_EVIDENCE (merge pending)
PR #50 uses the existing `renameAdminCatalogCategory` UI command and tenant-scoped RPC; audit, permission, duplicate-name and stable category identity behavior were reviewed. Exact-head Core CI run 39836522643 passed on `3301a3806ae7ffd62064b97b5796b12b2dd0eff9`. Browser run 39836522607 was BLOCKED_EXTERNAL before assertions by GHCR `toomanyrequests`; not BROWSER_PROVEN. No duplicate implementation was created.

### 2026-10-23 — P1-02 — CLOSED_WITH_EVIDENCE (merge pending)
PR #44 adds `noindex, nofollow` and `no-referrer` to recovery/reset routes. Fixed a rejected Supabase `updateUser` promise path so it displays an error, does not navigate on failure, and always clears busy state. Added regression assertion in `src/test/password-reset-route-security.test.ts`. Core CI run 39904405152 passed on `365ccc7c9c8512b10b1f676cb9b73b20d54ad8e6`. Route-specific authenticated browser proof remains NOT_RUN.

### 2026-10-23 — P1-03a — CLOSED_WITH_EVIDENCE
In `src/components/CustomerOrders.tsx`, order detail now exposes an accessible retry using the existing `useFetch` refetch. Added `src/test/customer-order-detail-retry.test.tsx` for transient failure and recovery. Core CI run 39905102470 passed on exact SHA `16bfe4f96513753dc145dfec17a020f121e1f711` (24/24 steps). Retry-button browser proof remains NOT_RUN.

### 2026-10-23 — P1-03b — IMPLEMENTED; exact-head CI pending
Added a source-linked reorder-template action to customer order detail, reusing the current `save_reorder_template` RPC and its server-side customer/organization/source-order and active-product checks. No new migration or duplicate reorder engine was created. The client sends product IDs and approved quantities only; malformed product IDs/quantities and malformed RPC responses fail closed. A `useRef` in-flight guard prevents rapid duplicate calls before disabled state rerenders. The test now covers source-order RPC arguments, approved quantity selection, invalid product ID rejection, returned RPC error, and rapid double-click single-call behavior. Changed paths: `src/components/CustomerOrders.tsx`, `src/test/customer-order-detail-retry.test.tsx`. Core CI must be verified on the final post-checkpoint SHA before closing.

### 2026-10-23 — P1-03b — IMPLEMENTED; CI pending on combined head
Added source-linked reorder-template action to order details using existing `save_reorder_template`; server verifies customer/organization/source order and active products. Client validates product UUIDs and quantities, sends approved quantity and guards rapid double clicks. Test covers success, invalid identity, server error and double click. Core CI for exact code/test head `ac9002163dfd5d1fadb3f3caa7d15a3599149d9f` was pending at checkpoint time.

### 2026-10-23 — P1-03c — IMPLEMENTED; CI pending on combined head
The company-invitation acceptance handler now removes the bearer token from browser history before its network request, retaining the token in state so a rejected request can be retried without putting the token back in the URL. Added a regression test for token removal before the service call, error display, and successful retry. Changed `src/components/CustomerCompanyMembers.tsx` and `src/test/customer-company-members-page.test.tsx`. Core CI run `39906092356` is intended to cover this code/test head; result was still pending.

### 2026-10-23 — P1-03c — IMPLEMENTED; exact-head CI pending
The company-invitation acceptance handler now removes the bearer token from browser history before its network request while retaining token state for retry. Added a test for URL cleanup before service call, error display, and successful retry. Changed `src/components/CustomerCompanyMembers.tsx` and `src/test/customer-company-members-page.test.tsx`.

### 2026-10-23 — P1-03d — IMPLEMENTED; exact-head CI pending
The customer activation handler now removes the path token from the visible address before calling the server, while preserving in-memory token state for retry if the request fails. Added a test asserting token removal before the request and successful retry after a transient failure. Changed `src/components/CustomerActivationInvitationPage.tsx` and `src/test/customer-activation-invitations-page.test.tsx`. Exact-head CI must be verified on the final checkpoint SHA.

### 2026-10-23 — P1-04 — IMPLEMENTED; exact-head CI pending
The customer activation dialog used only React `busy` state to suppress duplicate submits. Concurrent clicks before rerender could call the server twice; the server supersedes a prior pending invitation, which can make the first copied link immediately invalid. Added a synchronous `useRef` in-flight guard and a component test dispatching two submit clicks in one batched event, asserting exactly one call. Changed `src/components/CustomerActivationInvitationDialog.tsx` and `src/test/customer-activation-invitations-dialog.test.tsx`. No server contract or migration changed.

### 2026-10-23 — P1-05 — IMPLEMENTED; exact-head CI pending
The customer activation invitation dialog previously showed the creation form when the workspace lookup failed; since `workspace` remained null, the UI could not confirm that the customer was not already linked. Creation now fails closed until workspace state has been successfully loaded, and the error state offers explicit retry. Added regression test for load failure, denial of create, and recovery after retry. Changed `src/components/CustomerActivationInvitationDialog.tsx` and `src/test/customer-activation-invitations-dialog.test.tsx`. No backend/RPC/migration changed.

### 2026-10-23 — P1-06 — IMPLEMENTED; exact-head CI pending
Category landing previously called `fetchProducts` to count products for one category, downloading the full product collection and counting in the browser. It now uses the existing paged storefront RPC contract with `pageSize: 1` and its server total; the result is keyed to the current category ID to prevent stale counts on navigation. Added tests for scoped count, no full product fetch, error, and retry. Changed `src/components/StorefrontCategoryLandingPage.tsx`, new `src/test/storefront-category-landing.test.tsx`. No shared P2-locked file or new RPC/migration changed.

### 2026-10-23 — P1-07 — IMPLEMENTED; exact-head CI pending
Audit history was hard-limited to the newest 200 events with no way to navigate older records. The screen now reads a tenant-scoped exact count and pages results with `range`, preserves the organization filter on every page, shows page navigation, and reports a missing total as an error instead of zero. Search explicitly states it is scoped to the current page. Added `src/test/admin-audit-log.test.tsx` for paging, tenant filter, missing-count fail-closed behavior, and role denial. Changed paths: `src/components/AdminAuditLog.tsx`, new `src/test/admin-audit-log.test.tsx`.

### 2026-10-23 — P1-06/P1-07 — IMPLEMENTED; current-head CI pending
Removed the full product fetch/count logic from `StorefrontCategoryLandingPage`; the existing paged `Storefront` now handles product results, category filtering, and true empty state. The prior CI root was a non-canonical slug in the new test and an extra paged RPC that interfered with the P2-locked discovery test mock. Rewrote only the new unlocked category-landing test to use `storefrontCategorySlug`, asserting correct delegation and category-load retry. Audit history pagination remains implemented in `AdminAuditLog` with tenant filters and exact count; dedicated acceptance is in `admin-audit-log.test.tsx`. Changed functional paths: `src/components/StorefrontCategoryLandingPage.tsx`, `src/test/storefront-category-landing.test.tsx`, `src/components/AdminAuditLog.tsx`, `src/test/admin-audit-log.test.tsx`.

### 2026-10-23 — P1-07 regression adjustment — IMPLEMENTED; exact-head CI pending
The previous Core CI failed one assertion in `src/test/admin-audit-log.test.tsx`: it expected an internal error message while the component renders an explicit access-denied panel. Updated the test to assert the actual visible access-denied heading/content and still verify that no audit query occurs for a customer role. No application code changed in this correction. New test SHA: `f90f424a2aed820351103aeb20bab6060f65047c`; CI not yet run on this SHA.


### 2026-10-23 — P1-08 — IMPLEMENTED; next exact-head CI pending
The existing audited category rename RPC records action `catalog.category_renamed`, but the admin audit view displayed this important business operation as a raw technical identifier. Added the Arabic action label “إعادة تسمية تصنيف” and extended `src/test/admin-audit-log.test.tsx` to assert that a real row with this action renders the friendly label. No RPC, migration, P2-owned file, or audit payload was changed. This batch is committed together with the checkpoint update; CI must run on the new branch SHA.

### 2026-10-23 — P1-08 test correction — IMPLEMENTED; exact-head CI pending
The new audit-label assertion matched two valid renderings of `إعادة تسمية تصنيف` (the row cell and the filter option). Changed the test to assert each role explicitly with `getByRole("cell")` and `getByRole("option")`. The component label matches the server event identifier `catalog.category_renamed`; no application change was necessary for this failure. Exact-head CI must confirm the correction.

### 2026-10-23 — P1-09 — IMPLEMENTED; exact-head CI pending
The company-member invitation form relied on React's `creating` state alone; two submit events before rerender could start two server requests for the same invite. Added a synchronous `useRef` in-flight guard so the second event is rejected before awaiting the RPC. Added a regression test that dispatches two submit events in one React batch and asserts one service call and a truthful server-backed success. Changed `src/components/CustomerCompanyMembers.tsx` and `src/test/customer-company-members-page.test.tsx`. The same batch includes the audit event-label assertion correction; CI must pass on the new head before it is closed.

### 2026-10-23 — P1-10 — IMPLEMENTED; exact-head CI pending
The company-members workspace previously left the invite form active when `fetchCompanyMembershipWorkspace` failed, despite lacking verified workspace/link state. Creation now returns before the RPC unless server-backed workspace data exists and the latest load has no error; the submit button is disabled under the same conditions. Added a regression test proving failed load prevents the service call and that retry restores the form only after the workspace is loaded. Changed `src/components/CustomerCompanyMembers.tsx` and `src/test/customer-company-members-page.test.tsx`.


### 2026-10-23 — P1-11 — IMPLEMENTED; exact-head CI pending
Added a status filter to the customer order-history page. The selected status is applied to the existing `orders` query before pagination, so the returned rows and exact count share the same filter. Changing the filter resets to page 1 and clears stale rows/count during loading; page navigation also clears old rows until the next response arrives. The empty state distinguishes “no orders” from “no orders in this status.” Extended `src/test/customer-orders-pagination.test.tsx` to assert the server-side status predicate, reset range, filtered count and removal of old rows. Changed `src/components/CustomerOrders.tsx` and `src/test/customer-orders-pagination.test.tsx`. CI must be read back on the resulting exact SHA.


### 2026-10-23 — P1-11 test-driven correction — IMPLEMENTED; exact-head CI pending
The first Core CI for status filtering ran 736/737 unit tests successfully. The only failure exposed a real UI gap: result count was only rendered in pagination controls, so a filtered set that fit one page showed no count. Added a separate count status line whenever the server confirms a count and the page is not loading/error; the filter-specific and all-orders labels are distinguished. Updated the test to assert the localized number. Paths remain `src/components/CustomerOrders.tsx` and `src/test/customer-orders-pagination.test.tsx`.

### 2026-10-23 — P1-12 — IMPLEMENTED; exact-head CI pending
Company-members cards previously left revoke actions enabled when a manual workspace refresh failed, allowing actions against stale membership/invitation rows. Revoke handlers now fail closed unless workspace data exists and the latest read has no error; both buttons use the same guard while loading/error is present. A regression test loads the workspace, forces refresh to fail, verifies both controls are disabled, and confirms no revoke service is called. Paths: `src/components/CustomerCompanyMembers.tsx`, `src/test/customer-company-members-page.test.tsx`. CI pending on the new current head.
