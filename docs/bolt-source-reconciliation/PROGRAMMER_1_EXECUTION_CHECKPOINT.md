# P1 Execution Checkpoint — live resume record

## Current state

- Status: IN_PROGRESS
- Branch / PR: `p1/remaining-work-execution-20261023` / [PR #66](https://github.com/Report-Engainall/Nasr1/pull/66)
- Base main SHA: `76baf9dbe7860a764abc18e75835abb8750d56a3`
- Current code/test HEAD before this checkpoint: `9082a6cd5764a14d8738f1d0b424b4a01a93a689`
- P1-01 category rename: PR #50 code `3301a3806ae7ffd62064b97b5796b12b2dd0eff9`; Core CI PASS, browser proof externally blocked by GHCR rate limit.
- P1-02 password recovery: PR #44 code `365ccc7c9c8512b10b1f676cb9b73b20d54ad8e6`; Core CI PASS; password-reset-specific browser proof NOT_RUN.
- P1-03a order-detail retry: Core CI [39905102470](https://github.com/Report-Engainall/Nasr1/actions/runs/39905102470) PASS on exact code SHA `16bfe4f96513753dc145dfec17a020f121e1f711`.
- P1-03b source-linked reorder template: `src/components/CustomerOrders.tsx` reuses `save_reorder_template`, validates product IDs/quantities, sends approved quantities and source order, fails closed, and blocks rapid duplicate clicks. Tests are in `src/test/customer-order-detail-retry.test.tsx`.
- P1-03c company invitation retry: removes URL bearer token before server call while retaining in-memory token for retry. Tested in `src/test/customer-company-members-page.test.tsx`.
- P1-03d customer activation retry: `src/components/CustomerActivationInvitationPage.tsx` now removes the path bearer token before the server call and retains it in memory so a failed call can be retried. Test added to `src/test/customer-activation-invitations-page.test.tsx`.
- Code/test HEAD at `9082a6cd5764a14d8738f1d0b424b4a01a93a689`: exact-head Core CI result pending at last readback; do not rely on runs for older heads.
- Browser proof for the added retry controls: NOT_RUN. Production proof: NOT_RUN.
- Next task: P1-04 — the next unowned, independently testable commercial-admin/customer-workspace function. Do not touch `src/components/AdminPages.tsx`, `src/components/CustomerWorkflows.tsx`, or other paths locked by active PRs.

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
