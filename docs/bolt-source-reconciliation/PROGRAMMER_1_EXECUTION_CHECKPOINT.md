# P1 Execution Checkpoint — live resume record

## Current state

- Status: IN_PROGRESS
- Branch / PR: `p1/remaining-work-execution-20261023` / [PR #66](https://github.com/Report-Engainall/Nasr1/pull/66)
- Base main SHA: `76baf9dbe7860a764abc18e75835abb8750d56a3`
- Code/test SHA after the current test correction: `f90f424a2aed820351103aeb20bab6060f65047c`
- P1-01 category rename: PR #50 candidate `3301a3806ae7ffd62064b97b5796b12b2dd0eff9`; Core CI PASS; browser assertion step externally blocked by GHCR rate limit.
- P1-02 password recovery: PR #44 candidate `365ccc7c9c8512b10b1f676cb9b73b20d54ad8e6`; Core CI PASS; reset-route-specific browser proof NOT_RUN.
- P1-03a order-detail retry: Core CI [39905102470](https://github.com/Report-Engainall/Nasr1/actions/runs/39905102470) PASS on SHA `16bfe4f96513753dc145dfec17a020f121e1f711`.
- P1-03b source-linked reorder template: existing `save_reorder_template` RPC reused; source order and approved quantities are validated; immediate duplicate-submit guard and fail-closed response handling. Test: `src/test/customer-order-detail-retry.test.tsx`.
- P1-03c/d invitation acceptance: bearer token removed from visible URL before network calls, with in-memory retry retained. Tests: `src/test/customer-company-members-page.test.tsx`, `src/test/customer-activation-invitations-page.test.tsx`.
- P1-04/05 activation dialog: duplicate invitation guard and fail-closed workspace-load gating with retry. Test: `src/test/customer-activation-invitations-dialog.test.tsx`.
- P1-06 category landing: delegates product filtering/loading to the existing paged Storefront; parent no longer fetches all products or an extra RPC. Test: `src/test/storefront-category-landing.test.tsx` with canonical slug and retry assertion.
- P1-07 audit history: tenant-scoped exact count and 200-row pages with previous/next; test covers range and org scope, unknown count fail-closed, and denied-role access. Run [39907047512](https://github.com/Report-Engainall/Nasr1/actions/runs/39907047512) failed only because the test expected an internal error string not rendered by the permission screen; fixed the assertion to match the explicit role-denial UI and still assert zero DB queries. This fix is not yet tested.
- Exact-head Core CI for `f90f424a2aed820351103aeb20bab6060f65047c`: pending. Browser proof for new controls NOT_RUN; production proof NOT_RUN.
- Next action: verify Core CI for the final post-checkpoint SHA; fix only a failure reported on that SHA, then move to the next unowned function.

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
