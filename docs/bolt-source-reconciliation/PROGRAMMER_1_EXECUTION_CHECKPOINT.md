# P1 Execution Checkpoint — live resume record

## Current state

- Status: IN_PROGRESS
- Branch / PR: `p1/remaining-work-execution-20261023` / [PR #66](https://github.com/Report-Engainall/Nasr1/pull/66)
- Base main SHA recorded at PR opening: `76baf9dbe7860a764abc18e75835abb8750d56a3`
- **Last fully verified anchor:** `1797822aff47c310dcd9e54441b5dcc8b4cfbbf4`. Core CI [39907278863](https://github.com/Report-Engainall/Nasr1/actions/runs/39907278863) and P2 Playwright [39907278822](https://github.com/Report-Engainall/Nasr1/actions/runs/39907278822) both SUCCESS on that exact SHA.
- **Audit-label correction:** `b9d5af63a84e670ef972604f8f0560c8848fcb8d` failed Unit tests because the selector matched both the row label and filter option. `8612628ddf620040f028a11813cc5565ce919132` narrows that assertion. Runs [39907878206](https://github.com/Report-Engainall/Nasr1/actions/runs/39907878206) and [39907878332](https://github.com/Report-Engainall/Nasr1/actions/runs/39907878332) were launched for that head; a later commit superseded it, so the current PR checks govern merge decisions.
- **Latest functional code/test commit before this checkpoint refresh:** `7f5a7a329f66c5d732b7d63aeb433a649feca491`.
  - Customer 360 no longer converts an absent/invalid balance into a displayed zero. Explicit zero stays a valid value; null/undefined/non-finite values render `غير متاح`.
  - `src/lib/customer-360.ts` exports `formatCustomer360Money`; `src/components/AdminCustomer360.tsx` uses it for displayed financial values; `src/test/customer-360-money.test.ts` covers unavailable values, known zero, and currency.
- **Latest exact-head CI for the new Customer 360 change:** NOT YET VERIFIED in this checkpoint. The tests above apply to code commit `7f5a7a3...`; any checkpoint-only commit following it must be verified from the current PR checks rather than inheriting old PASS claims.
- Existing completed batches retained: order-detail retry + source-linked reorder template; invitation token URL cleanup/retry and duplicate-submit/workspace-load guards; category landing use of the paged Storefront; audit pagination with tenant scope and fail-closed unknown count/role denial.
- P1-08/09 audit label + company invitation duplicate-submit guard: Core CI [39907988576](https://github.com/Report-Engainall/Nasr1/actions/runs/39907988576) SUCCESS on exact SHA `c1a708027ebc718df9b419a37b4c32f227edfebb` (24/24 steps). Current branch also contains the separate Customer 360 money-formatting batch; the new P1-10 workspace guard will be tested together with the combined current head.
- **Evidence boundary:** per-control authenticated browser proof for retry/reorder/token URL cleanup/audit pagination/Customer 360 is NOT RUN unless a specific test result says otherwise. Production proof is NOT RUN. The P2 Playwright workflow is a critical-path suite, not an assertion that every changed control was individually exercised.
- **PR documentation overlap:** PR #65 and #66 share these five files: `BOOT_MESSAGES_INDEX_2026-10-22.md`, `PROGRAMMER_1_EXECUTION_CHECKPOINT.md`, `PROGRAMMER_1_REMAINING_WORK_BOOT_2026-10-23.txt`, `PROGRAMMER_2_REMAINING_WORK_BOOT_2026-10-23.txt`, and `REMAINING_WORK_PLAN_2026-10-23.md`. Merge/reconcile #65 first, then forward-integrate its resulting main SHA into this existing branch without dropping the P1 checkpoint or functional commits; update the PR diff and verify checks on the final SHA. Do not merge both concurrently.
- **Next action:** finish P1-10 fail-closed company-invitation state handling in `src/components/CustomerCompanyMembers.tsx`, test load failure/retry, and verify Core CI on the resulting exact head. Do not re-audit closed work.

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
