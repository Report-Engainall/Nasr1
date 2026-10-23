# P1 Execution Checkpoint — live resume record

## Current state

- Status: IN_PROGRESS
- Branch / PR: `p1/remaining-work-execution-20261023` / [PR #66](https://github.com/Report-Engainall/Nasr1/pull/66)
- Base main SHA: `76baf9dbe7860a764abc18e75835abb8750d56a3`
- Code HEAD before this checkpoint: `ac9002163dfd5d1fadb3f3caa7d15a3599149d9f`
- P1-01 category rename: PR #50 candidate `3301a3806ae7ffd62064b97b5796b12b2dd0eff9`; Core CI PASS, browser proof externally blocked by GHCR limit.
- P1-02 password recovery: PR #44 candidate `365ccc7c9c8512b10b1f676cb9b73b20d54ad8e6`; Core CI PASS. Password-reset-specific browser proof NOT_RUN.
- P1-03a order-detail retry: code and regression test in PR #66; Core CI [39905102470](https://github.com/Report-Engainall/Nasr1/actions/runs/39905102470) PASS on `16bfe4f96513753dc145dfec17a020f121e1f711`.
- P1-03b source-linked reorder template: `src/components/CustomerOrders.tsx` calls the existing server RPC using the source order and validated product IDs/approved quantities. `src/test/customer-order-detail-retry.test.tsx` covers success, invalid product ID, RPC error and rapid double-click. The in-flight `useRef` prevents duplicate requests before rerender. Latest code/test head `ac9002163dfd5d1fadb3f3caa7d15a3599149d9f`; Core CI [39906092356](https://github.com/Report-Engainall/Nasr1/actions/runs/39906092356) was IN_PROGRESS at last readback, so exact-head result pending.
- P1-03c company invitation token handling: `src/components/CustomerCompanyMembers.tsx` removes the bearer token from the address bar before calling the existing accept service, while retaining the token in component state so a transient failure can be retried. `src/test/customer-company-members-page.test.tsx` covers URL cleanup before request and retry after temporary failure. Same CI run `39906092356` includes this code/test head, but result is pending.
- Browser acceptance for the order-detail and invitation retry controls: NOT_RUN. Production proof: NOT_RUN.
- Next task: P1-03d — apply the same safe address-bar token removal to customer activation links after authenticated acceptance starts; preserve login handoff and retry behavior.

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
