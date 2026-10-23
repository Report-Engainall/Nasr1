# P1 Execution Checkpoint — live resume record

## Current state — 2026-10-23

- Status: IN_PROGRESS.
- Repository / branch / PR: `Report-Engainall/Nasr1` / `p1/remaining-work-execution-20261023` / [PR #66](https://github.com/Report-Engainall/Nasr1/pull/66).
- PR #65 was merged first as `1a1c473ba9449af1671fe345eface1ed78583db6`. P1 was forward-integrated with current `main` at `a3a6da9345847ac43460e6376200d74fe8f170a2`, preserving P1 as first parent and `c451261681a56078118776649e031801752eade6` as main second parent. No direct write to `main`.
- Requested original SHA `f858cf167c9d39c4be923c432128ba30d4d2b980`: Core [39910240078](https://github.com/Report-Engainall/Nasr1/actions/runs/39910240078) SUCCESS on exact SHA; P2 Playwright [39910240120](https://github.com/Report-Engainall/Nasr1/actions/runs/39910240120) CANCELLED on exact SHA. No browser PASS is inferred from Core CI.
- Exact fixed feature head `61fd03c12d4a49cf986904cd74a585c1217628c5`: Core [39913654316](https://github.com/Report-Engainall/Nasr1/actions/runs/39913654316) SUCCESS and P2 Playwright [39913654453](https://github.com/Report-Engainall/Nasr1/actions/runs/39913654453) SUCCESS. Both are evidence only for `61fd03c...`, not later commits.
- Tier command now exists in `supabase/migrations/20261023090000_admin_customer_tier_command.sql` and client wrapper `updateCustomerTier`. It requires active admin/manager in the tenant, valid tier, reason, and matching old tier under lock; emits before/after audit; blocks direct tier UPDATE. UI dialog is present in `src/components/AghbariApp.tsx` with API/UI/Postgres acceptance tests, but the old routed page was still bypassing it.
- **Routed customer page correction (this batch; exact-head CI pending):** `src/App.tsx` routes `/admin/customers` to `src/pages/admin/AdminCustomers.tsx`; that legacy page used stale `customer_tier` numeric and direct table updates despite the canonical schema using `tier` text, and it bypassed the tenant-scoped directory. `AdminCustomers.tsx` now hosts the canonical `Customers` directory inside `AuthProvider` and renders its notices accessibly; the adapter test `src/test/admin-customers-route.test.tsx` verifies route mounting and accessible notice/close behavior. This removes that old direct-write UI from the active route rather than duplicating another customer service.
- Concurrent P2 commit `624e85cd947b56e5282d78a1ae040a7ef0a0ecb2` expanded safe partial-email searches but malformed the wildcard-escape statement in `src/lib/customer-directory.ts`; fixed in `d4cdc75ef002258b9142614e58bd3453c78cd9a0`. Exact-head Core [39914410486](https://github.com/Report-Engainall/Nasr1/actions/runs/39914410486) was IN_PROGRESS and Playwright [39914410474](https://github.com/Report-Engainall/Nasr1/actions/runs/39914410474) PENDING at readback before this route batch.
- Exact-head verification is now available for P1 head `7b4afd00a5abd26cf983ee5f82247ccd0e7c89f1`: Core CI [39918895865](https://github.com/Report-Engainall/Nasr1/actions/runs/39918895865) SUCCESS and P2 Playwright Critical Paths [39918895866](https://github.com/Report-Engainall/Nasr1/actions/runs/39918895866) SUCCESS. These results apply only to this SHA; full authenticated production-browser and production-database proof remain NOT_RUN.
- Next action: read exact-head Core and Playwright results, fix only concrete failures, then proceed with the next P1 customer lifecycle gap. Avoid redoing directory paging/search, activation invites/memberships, Customer 360, order history, category, and audit work. Do not alter P2-locked customer workflow/storefront, finance, inventory, Onyx, or E2E files.

## Latest exact-head proof — 2026-10-23

- Tested P1 source SHA: `7b4afd00a5abd26cf983ee5f82247ccd0e7c89f1`.
- Core CI: **SUCCESS** — [39918895865](https://github.com/Report-Engainall/Nasr1/actions/runs/39918895865).
- P2 Playwright Critical Paths: **SUCCESS** — [39918895866](https://github.com/Report-Engainall/Nasr1/actions/runs/39918895866).
- This validates repository checks on that exact PR head only. It does not prove that all customer/admin workflows are browser-certified or that production data/migrations were exercised.
- Current main at sync start: `52df650957c857cc32c21c8804e3f5e88f73d9e7`. The integration commit below preserves P1’s customer lifecycle changes plus main’s order-input acceptance and coordination/backup workflow updates. All checks must run again on the resulting integration SHA before the PR is considered merge-ready.

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


### 2026-10-23 — P1-13 — IMPLEMENTED; exact-head CI pending
The admin customer-creation dialog relied on React's `saving` state alone. Two submit events dispatched before rerender could invoke `createCustomer` twice and create duplicate records. Added a synchronous in-flight ref guard before the first await; the guard is released in `finally` so a failed request can be retried. Exported the dialog component for isolated behavior testing. Added `src/test/customer-create-double-submit.test.tsx` covering batched rapid submit (one service call) and retry after failure. Functional paths changed: `src/components/AghbariApp.tsx`; test added: `src/test/customer-create-double-submit.test.tsx`. No migration or P2-owned file changed. Exact-head Core CI and Playwright results must be read on the commit created by this batch; browser/production proof is NOT RUN.


### 2026-10-23 — P1-14 — IMPLEMENTED; exact-head CI pending
Implemented least-privilege `customer_manager` role support against specification section 13.3. Added additive migration `20261023120000_customer_manager_role_scope.sql`: permits assigning the role; redefines tier/status commands to allow that role under existing tenant, row-lock, expected-state, reason and audit checks; adds `can_manage_customers` to tenant context; and adds a SECURITY DEFINER directory RPC returning non-financial customer fields. The role is deliberately not added to broad `public.is_staff()` and receives no direct customer-table read grant. Updated auth bootstrap and admin shell to restrict role-only sessions to customer management; the customer UI exposes tier/lifecycle actions but hides Customer 360 and financial columns. Added role-specific component coverage in `src/test/admin-customer-directory.test.tsx`. Not yet proven in P1-14: role-assignment UI, device management, browser and production paths. Activation invite management is handled by P1-15; each final CI result must match its exact SHA.


### 2026-10-23 — P1-15 — IMPLEMENTED; exact-head CI pending
Extended least-privilege customer_manager access to activation-link management with additive migration 20261023130000_customer_manager_activation_permissions.sql. Only existing create/list/revoke SECURITY DEFINER RPCs are redefined, each checking active identity, server-derived organization and explicit allowed roles including customer_manager. The customer acceptance RPC remains unchanged. The UI exposes the activation-link dialog to customer_manager. Added source-contract coverage and PostgreSQL acceptance for tenant-scoped non-financial directory, audited tier/status commands, invitation create/list/revoke, and denial of direct invitation-table reads. CI is pending on the final commit; browser and production proof remain NOT RUN.

### 2026-10-23 — P1 role assignment and device/session controls — follow-up PR #75

- Functional code head being validated: e9dd04d6a49ac4910e2a17d649485173ef486e66. Follow-up PR: https://github.com/Report-Engainall/Nasr1/pull/75. PR #66 was already merged at 066e5eb9054d599e611f1b110a2e94607bc672db, so the implementation remains on the existing P1 branch and is submitted separately; no alternate branch or direct main write was used.
- Role assignment UI: src/components/CustomerManagerRoleAssignment.tsx is wired into the admin settings shell. It calls the existing list_organization_user_roles and set_organization_user_roles RPCs, disables self-edit, prevents mixing customer and internal roles, requires an explicit internal replacement role when removing the only customer_manager role, and shows success only after matching server confirmation. UI tests are in src/test/customer-manager-role-assignment.test.tsx. The existing PostgreSQL acceptance in scripts/test-database-migrations.mjs covers non-admin denial, unauthorized direct role writes, self-edit denial, cross-organization denial, incompatible role sets, assignment and audit evidence.
- Device/session controls: src/components/DeviceManagement.tsx replaces the misleading customer-records-as-devices stub with current-browser session information and actual Supabase local sign-out / sign-out-other-sessions calls. It does not store access/refresh tokens or pretend that it can enumerate every device. Tests are in src/test/device-management.test.tsx.
- Exact SHA test evidence at checkpoint time: Core run 39937170618 on e9dd04d6a49ac4910e2a17d649485173ef486e66 had passed unit tests, PostgreSQL 17 migrations/core acceptance, invitation expiry, stock-count audit, async export, import idempotency, inventory snapshot, storefront favourites, backup/restore, lint, build, preview smoke and dev-server smoke. The Core browser price-visibility step was still IN_PROGRESS. P2 run 39937170509 had its E2E infrastructure gate PASS; public UI smoke was still IN_PROGRESS during Chromium/OS dependency installation, and authenticated customer-order/tenant-isolation was SKIPPED / BLOCKED_EXTERNAL because the dedicated non-production E2E credentials and explicit test-write authorization were not configured. Do not convert these in-progress/skipped states into PASS.
- Acceptance status: P1-CUST-MANAGER-ROLE-UI-001 is functionally implemented and its component tests passed; exact overall CI status is pending until the final browser steps conclude. Browser proof and production proof are NOT RUN/NOT PROVEN.
- Acceptance status: P1-DEVICE-SESSION-MGMT-001 remains PARTIAL. Central organization/device inventory, login history, selective per-device revocation and single-/multi-device policy controls are not implemented. The active P2 path lock forbids adding the required SQL/RLS/RPC work in this batch; this is a coordination lock, not an external-service pass. P2 must explicitly release/coordinate that path, then P1 must implement server-persisted device/session records, tenant-safe commands, audit coverage and PostgreSQL/browser acceptance before marking the full requirement IMPLEMENTED.
- This checkpoint records the code-head evidence above; this documentation commit creates a new SHA and therefore the latest Core/P2 runs must again be checked against the new exact head.

## Active resume — invitation expiry hardening — 2026-10-23T15:40+03:00

- LAST_COMPLETED_TASK_ID: P1-ROLE-ASSIGNMENT-SETTINGS-84
- CURRENT_BRANCH: `p1/validate-customer-invitation-response-20261023`
- BASE_SHA: `0396b29aeab8c09c430df0063821251208a38477` (original PR #90 base; current `main` before integration was `d3a27dc9c4b209e61bf6b3b9a54ceb8b4a26974d`, then PR #84 merged successfully as `cb72f35de524af82f63bbbcebec97213464921ed`).
- HEAD_SHA: `6d1cc62c56bf49c4ecda75a480021d8bad9938eb` (latest functional code/test commit before this checkpoint append).
- LAST_CONFIRMED_TESTS: PR #90 Core CI run [39952596164](https://github.com/Report-Engainall/Nasr1/actions/runs/39952596164) and P2 Playwright [39952595979](https://github.com/Report-Engainall/Nasr1/actions/runs/39952595979) passed on the previous code head `17001d51714a89183e3c7a7381128cfb52d85303`; those runs do not cover the new elapsed-in-flight regression yet. PR #84 Core run [39952308326](https://github.com/Report-Engainall/Nasr1/actions/runs/39952308326) and P2 Playwright [39952308332](https://github.com/Report-Engainall/Nasr1/actions/runs/39952308332) passed on `0ba76e85ae54411a8840985ba6b789cc76c1cf47`; PR #84 is merged, merge SHA `cb72f35de524af82f63bbbcebec97213464921ed`.
- FAILED_OR_NOT_RUN_TESTS: exact-head Core + P2 status for `6d1cc62c56bf49c4ecda75a480021d8bad9938eb` has not yet been read back; do not claim it passed. Post-merge main CI on `cb72f35...` also must be confirmed.
- FILES_CHANGED: `src/lib/customer-activation-invitations.ts`, `src/test/customer-activation-invitations.test.ts` (response-time expiry guard + delayed-response regression); this checkpoint and `PROGRAMMER_1_CURRENT_REPORT.md` are being appended for resumption.
- LOCKED_PATHS: P2 migrations/RPC/RLS, `src/lib/api.ts`, finance/import/Onyx backend paths, and P2-owned browser workflow fixtures remain untouched. Do not change shared `CURRENT_EXECUTION_STATE.md` or `WORK_COORDINATION.md` from P1.
- NEXT_ACTION: read Core and P2 workflow results for the newest PR #90 head and verify main's post-#84 CI by exact SHA. Fix only failures on that head. If the final integration checks are green and the PR remains mergeable, merge #90 with `expected_head_sha`; then re-read `refs/heads/main` and verify CI for the resulting merge SHA.
- BLOCKER: latest exact-head workflow results pending inspection; PR #90 was 11 commits behind the pre-merge main snapshot at initial comparison, so acceptance must include the current-base merge result.
- PR_URL: https://github.com/Report-Engainall/Nasr1/pull/90
- MERGE_STATUS: PR #90 OPEN; PR #84 MERGED; PR #88 remains Draft and blocked on P2 PR #83.
- UPDATED_AT: 2026-10-23T15:40+03:00

## Post-merge resume — 2026-10-23T15:53+03:00

- LAST_COMPLETED_TASK_ID: `P1-INVITE-EXPIRY-90`
- CURRENT_BRANCH: `p1/post-merge-resume-20261023`
- BASE_SHA: `59547c7d683cefd65cab445b97219aa701021676` (main at the start of this documentation-only continuation branch).
- HEAD_SHA: `59547c7d683cefd65cab445b97219aa701021676` (last confirmed application merge SHA; this record explicitly distinguishes application-tested code from subsequent resume-documentation commits).
- LAST_CONFIRMED_TESTS: PR #90 final functional/source+test head `aff7fc76eaa48b3c4cebdb4eea6fb2e2860ea8f6`: Core [39955806806 SUCCESS](https://github.com/Report-Engainall/Nasr1/actions/runs/39955806806); P2 Playwright [39955806654 SUCCESS](https://github.com/Report-Engainall/Nasr1/actions/runs/39955806654). The local Supabase order/tenant, return, Onyx-export and print acceptance jobs passed in that run. The separate external customer-order/tenant job was `SKIPPED` by the external-credential gate. PR #90 merged by squash as `59547c7d683cefd65cab445b97219aa701021676`. Previous main integration SHA `cb72f35de524af82f63bbbcebec97213464921ed` passed Core [39955478215 SUCCESS](https://github.com/Report-Engainall/Nasr1/actions/runs/39955478215).
- FAILED_OR_NOT_RUN_TESTS: post-merge main Core `test-and-build` run [39956957952](https://github.com/Report-Engainall/Nasr1/actions/runs/39956957952) is `IN_PROGRESS` at this checkpoint. No result is inferred until terminal. Production data, live email delivery and authenticated external-account E2E remain `NOT RUN / NOT PROVEN`. No Core/P2 workflow has yet been claimed for this new documentation-only branch head.
- FILES_CHANGED: functional files already delivered and merged by #90: `src/lib/customer-activation-invitations.ts`, `src/test/customer-activation-invitations.test.ts`, and `src/test/customer-activation-invitations-dialog.test.tsx`; this continuation only updates `PROGRAMMER_1_EXECUTION_CHECKPOINT.md` and `PROGRAMMER_1_CURRENT_REPORT.md`.
- LOCKED_PATHS: no edits to P2 migrations/RPC/RLS, `src/lib/api.ts`, finance/import/Onyx backend, P2 Playwright workflows, shared `CURRENT_EXECUTION_STATE.md`, `WORK_COORDINATION.md`, or shared acceptance matrix.
- NEXT_ACTION: verify main CI run `39956957952` on exact SHA `59547c7d683cefd65cab445b97219aa701021676`. Do not change the conclusion based on an in-progress run. Then resume the central-session dependency in coordination with P2: PR #82 currently has head `8e70899da67d53f0acf221d7e4eeb1a8f2f1b591`, and PR #83 head `49ea0ce8936bf319a1941ea0ba0a1f03ebec9c3c`; both have become `mergeable=false` after main advanced, so P2 must merge-conflict-aware update and re-run exact-head Core + required local browser tests. Keep P1 PR #88 Draft until P2 contract #83 is integrated and proven. After that, update/revalidate #88 against new main and continue the next independent P1 screen gap.
- BLOCKER: post-merge main CI is still running at the last read; #82/#83 need current-main integration owned by P2; #88 depends on #83 and must not be merged before integration. External authenticated customer account is unavailable and is not a passing result.
- PR_URL: https://github.com/Report-Engainall/Nasr1/pull/90
- MERGE_STATUS: PR #90 MERGED as `59547c7d683cefd65cab445b97219aa701021676`; PR #84 MERGED as `cb72f35de524af82f63bbbcebec97213464921ed`; P1 docs continuation PR for this branch to be opened separately.
- UPDATED_AT: 2026-10-23T15:53+03:00

## Post-merge CI readback correction — 2026-10-23T16:02+03:00

- Main merge SHA `59547c7d683cefd65cab445b97219aa701021676` is now confirmed by Core run [39956957952 SUCCESS](https://github.com/Report-Engainall/Nasr1/actions/runs/39956957952). This resolves the post-merge Core blocker recorded above for that exact application SHA.
- The application merge SHA is unchanged. The P1 checkpoint/report documentation branch has its own later documentation commits; do not label those commits as tested application heads unless their own workflows finish.
- Current P2 dependency readback: #82 head `8e70899da67d53f0acf221d7e4eeb1a8f2f1b591`, #83 head `49ea0ce8936bf319a1941ea0ba0a1f03ebec9c3c`, and P1 #88 head `895b27384e21f654bf3e1124303304266ddccb3f` all read `mergeable=true` at this timestamp, but that flag alone is not proof of current-base exact-head CI or required review. #82 exact head has prior Core/P2 success; #83 must have terminal current-head Core/P2 before integration; #88 remains Draft and dependent on #83.
- LAST_COMPLETED_TASK_ID remains `P1-INVITE-EXPIRY-90`; NEXT_ACTION: create a small documentation PR for this checkpoint/report update, validate its checks, then continue with the next independent P1 UI gap. Keep #88 unmerged until the backend contract is integrated and current-head verified.
- UPDATED_AT: 2026-10-23T16:02+03:00

## P1 central-session UI repeated-action guard — 2026-10-23T16:10+03:00

- LAST_COMPLETED_TASK_ID: `P1-SESSION-REVOKE-DOUBLE-CLICK-GUARD` implementation/test added; exact-head validation pending.
- CURRENT_BRANCH: `p1/central-device-session-ui-20261023` (UI feature branch for PR #88). Documentation updates remain isolated on `p1/post-merge-resume-20261023`.
- BASE_SHA: `0396b29aeab8c09c430df0063821251208a38477` original #88 base; live main when this follow-up began was `59547c7d683cefd65cab445b97219aa701021676`.
- HEAD_SHA: `9310fbb76a7df9db9c45026d9b53053a9ab2d201` exact code/test head; docs branch current head when updated is separate and not yet tested.
- LAST_CONFIRMED_TESTS: previous PR #88 head `895b27384e21f654bf3e1124303304266ddccb3f` had Core [39950279851 SUCCESS](https://github.com/Report-Engainall/Nasr1/actions/runs/39950279851) and P2 [39950279733 SUCCESS](https://github.com/Report-Engainall/Nasr1/actions/runs/39950279733), but those runs do not cover this new change. Exact-new-head Core [39957639395](https://github.com/Report-Engainall/Nasr1/actions/runs/39957639395) and P2 [39957639394](https://github.com/Report-Engainall/Nasr1/actions/runs/39957639394) are queued at time of record.
- FAILED_OR_NOT_RUN_TESTS: do not claim test success for `9310fbb...` until both new-head workflows complete. Authenticated production and live organization-session proof are NOT RUN; contract integration depends on P2 #83.
- FILES_CHANGED: `src/components/DeviceManagement.tsx` and `src/test/device-management.test.tsx`. Component now uses a synchronous ref lock against duplicate per-session revoke events; regression test submits two rapid clicks while the mocked RPC remains in flight and asserts one RPC call.
- LOCKED_PATHS: no change to P2 migration/RPC/RLS/types/API files, no modification to `.github/workflows/p2-playwright-critical-paths.yml`, no edits to shared `CURRENT_EXECUTION_STATE.md`, `WORK_COORDINATION.md` or acceptance matrix.
- NEXT_ACTION: verify exact-head Core and P2 runs on `9310fbb...`; fix only evidence-backed failures. Keep #88 Draft until P2 #83 is merged and current-main contract acceptance is green; then integrate #88 with the current main SHA without force-push and rerun UI + server-backed browser acceptance.
- BLOCKER: P2 #83 session backend not yet merged; last live head `49ea0ce8936bf319a1941ea0ba0a1f03ebec9c3c`. New exact-head workflows queued. This component unit regression is not proof of end-to-end session revocation.
- PR_URL: https://github.com/Report-Engainall/Nasr1/pull/88
- MERGE_STATUS: #88 remains Draft/open; #83 remains P2-owned/open; P1 documentation PR #93 is open.
- UPDATED_AT: 2026-10-23T16:10+03:00

## P1 session UI network-failure retry coverage — 2026-10-23T16:15+03:00

- LAST_COMPLETED_TASK_ID: `P1-INVITE-EXPIRY-90`. CURRENT_TASK_ID: `P1-SESSION-LIST-NETWORK-RETRY-TEST` (implementation committed; exact-head validation pending).
- CURRENT_BRANCH: `p1/central-device-session-ui-20261023`.
- BASE_SHA: original PR #88 base `0396b29aeab8c09c430df0063821251208a38477`; main at latest integration point `59547c7d683cefd65cab445b97219aa701021676`.
- HEAD_SHA: new functional/test commit `7adeec2fa2490840aa213449a2d87f49b4e97b74`.
- LAST_CONFIRMED_TESTS: Core `39957639395` and P2 `39957639394` were originally started on predecessor `9310fbb76a7df9db9c45026d9b53053a9ab2d201`; Core was still running when read. First P2 attempt failed only at public-browser dependency installation because the configured Lovable package mirror returned HTTP 429 for multiple tarballs; this is an external rate-limit failure, not test/assertion failure. Failed job rerun attempt 2 was started, but its result is not yet an exact-head proof for the new `7adeec2...` commit.
- FAILED_OR_NOT_RUN_TESTS: no PASS claim for new `7adeec2...` head. Required Core and P2 exact-head workflows must be read after they complete; external authenticated customer-account E2E remains skipped by credential gate.
- FILES_CHANGED: `src/test/device-management.test.tsx` now verifies that a network rejection from `list_organization_sessions` displays an alert, clears potentially stale rows, and the Retry control loads server data again on a succeeding call. Earlier in this branch `src/components/DeviceManagement.tsx` also received a synchronous ref lock and rapid-double-click regression. No additional application code changed for this network-retry test.
- LOCKED_PATHS: P2 DB migrations/RPC/RLS/types/API, `.github/workflows/p2-playwright-critical-paths.yml`, shared `CURRENT_EXECUTION_STATE.md`, `WORK_COORDINATION.md`, and shared acceptance matrix untouched.
- NEXT_ACTION: inspect workflow runs bound to exact branch SHA `7adeec2...`; if Core fails, use the failing test/log to fix the root cause. Re-run P2 after rate-limit failure on the current head; verify actual local Supabase job rather than treating a skipped job as pass. Keep #88 Draft until P2 #83 is integrated and the session RPC contract works end to end.
- BLOCKER: external package mirror HTTP 429 on predecessor P2 run; new current-head tests awaiting CI. Backend contract remains P2-owned/open.
- PR_URL: https://github.com/Report-Engainall/Nasr1/pull/88
- MERGE_STATUS: #88 Draft/open, #83 P2-owned/open; P1 docs PR #93 open and will receive this checkpoint refresh.
- UPDATED_AT: 2026-10-23T16:15+03:00

## Latest resume — P1 central device/session UI — 2026-10-23T16:19:11.592+03:00

- LAST_COMPLETED_TASK_ID: `P1-DEVICE-SESSION-UI-SYNC-MAIN-001` (integrated the current main tip into the existing PR branch without changing P2-owned paths).
- CURRENT_BRANCH: `p1/central-device-session-ui-20261023`.
- BASE_SHA: `59547c7d683cefd65cab445b97219aa701021676` (main tip verified before integration).
- HEAD_SHA: `f7839b615282a1627804fce360d6ceda5fe56e48` (functional merge/sync commit; checkpoint/report update is a documentation-only child).
- LAST_CONFIRMED_TESTS: exact HEAD `f7839b615282a1627804fce360d6ceda5fe56e48` Core run [39959906007](https://github.com/Report-Engainall/Nasr1/actions/runs/39959906007) failed before tests at dependency installation: multiple package downloads from `europe-west1/4-npm.pkg.dev/lovable-core-prod/sandbox-npm-cache` returned HTTP 429. This is an infrastructure/rate-limit failure, not evidence of a code-test failure. Re-run of the failed job was requested; its result is pending. P2 Playwright [39959905948](https://github.com/Report-Engainall/Nasr1/actions/runs/39959905948) was still running at last read; its public smoke and authenticated external-account coverage must be read separately. The authenticated customer order/tenant job was skipped, not passed.
- FAILED_OR_NOT_RUN_TESTS: no unit, PostgreSQL, lint, build or preview/browser application assertions ran in Core run 39959906007 because installation failed. Authenticated external customer-session browser proof remains NOT RUN/BLOCKED_EXTERNAL until valid isolated fixtures are supplied. No production proof.
- FILES_CHANGED: `src/components/DeviceManagement.tsx`, `src/test/device-management.test.tsx`; branch sync used main tree plus the two P1-owned file revisions only. Compared with current main, the PR diff remains limited to these two paths.
- LOCKED_PATHS: P2-owned migrations, RPC, RLS, generated DB types, Auth enforcement, and P2-owned workflow/fixture files. No P2-owned path was edited.
- NEXT_ACTION: read the Core rerun and P2 Playwright conclusions for the newest exact branch SHA; if the dependency 429 recurs, determine whether the workflow can use an approved non-paid public registry/cache path without weakening lockfile verification. Fix only failures attributable to this branch. Keep #88 partial until P2 PR #83 is merged and the integrated contract passes; then run the required server-backed browser acceptance.
- BLOCKER: transient npm-cache registry HTTP 429 blocked Core checks; P2 server contract #83 remains open and is required for end-to-end session management.
- PR_URL: https://github.com/Report-Engainall/Nasr1/pull/88
- MERGE_STATUS: OPEN / NOT READY — backend contract #83 and exact-head acceptance still required.
- UPDATED_AT: 2026-10-23T16:19:11.592+03:00

## Exact-head readback — session UI Core passed; P2 browser infrastructure blocked — 2026-10-23T16:22+03:00

- LAST_COMPLETED_TASK_ID: `P1-INVITE-EXPIRY-90`; CURRENT_TASK_ID: `P1-DEVICE-SESSION-MGMT-UI-001` (UI/test added; P2 end-to-end acceptance pending).
- CURRENT_BRANCH: `p1/central-device-session-ui-20261023`.
- BASE_SHA: original PR #88 base `0396b29aeab8c09c430df0063821251208a38477`; current main integration SHA `59547c7d683cefd65cab445b97219aa701021676`.
- HEAD_SHA: `7adeec2fa2490840aa213449a2d87f49b4e97b74`.
- LAST_CONFIRMED_TESTS: Core [39958053579 SUCCESS](https://github.com/Report-Engainall/Nasr1/actions/runs/39958053579) on exact `7adeec2...`. Steps prove Bun lockfile verification, dependency install, unit tests, isolated PostgreSQL 17 migrations/core workflows, audit/idempotency/import/favourites/backup-restore, lint/build/smoke and price-visibility acceptance all succeeded. New session list network-failure retry and rapid repeated-revoke regression are included in this exact head's Unit Tests.
- FAILED_OR_NOT_RUN_TESTS: P2 [39958054156 FAILURE](https://github.com/Report-Engainall/Nasr1/actions/runs/39958054156) on exact `7adeec2...`, attempt 2 failed at public UI smoke dependency installation; logs show repeated HTTP 429 from the configured Lovable npm mirror and `HTTP 429 persisted after three bounded attempts`. The local Supabase/Chromium job was `SKIPPED` because the dependency-install job failed. This is an external CI setup failure, not a functional assertion failure; nevertheless end-to-end central-session acceptance is NOT PROVEN.
- P2 dependency head: PR #83 now has head `04241376b769403bc6a6357265c51cf1ca66e3e2`; Core [39958234359](https://github.com/Report-Engainall/Nasr1/actions/runs/39958234359) failed at the same dependency-install step with HTTP 429 before migrations/tests; P2 run [39958234348](https://github.com/Report-Engainall/Nasr1/actions/runs/39958234348) was still in progress at readback. The exact log and evidence were posted to #83 comment 6365616497.
- FILES_CHANGED: `src/components/DeviceManagement.tsx`, `src/test/device-management.test.tsx`; synchronous per-session revoke guard and retry recovery for network failure. Core validation passed. No P2-owned migration/RPC/RLS/API/lockfile/workflow path changed.
- LOCKED_PATHS: P2 schema/RPC/RLS/API/types, `.github/workflows/p2-playwright-critical-paths.yml`, package configuration and lockfiles, shared `CURRENT_EXECUTION_STATE.md`, `WORK_COORDINATION.md`, acceptance matrix untouched.
- NEXT_ACTION: after the package-mirror HTTP 429 blocker is addressed/recovered by the workflow owner, rerun P2 Playwright on current #88 head and ensure the isolated local Supabase/Chromium job actually runs and passes (not skipped). Keep #88 Draft until #83 is current-main integrated and current-head Core + backend/Chromium acceptance passes. Separately, inspect latest PR #93 documentation checks; its prior attempt also hit the same dependency mirror rate limit.
- BLOCKER: recurring external Lovable package-mirror HTTP 429 causes P2 workflow setup failure; PR #83 backend not merged.
- PR_URL: https://github.com/Report-Engainall/Nasr1/pull/88
- MERGE_STATUS: #88 Draft/open; #83 P2-owned/open; checkpoint/report PR #93 open. Main `59547c7d...` post-merge Core run `39956957952` SUCCESS remains proven.
- UPDATED_AT: 2026-10-23T16:22+03:00

## Latest resume — duplicate server-session inventory acceptance — 2026-10-23T16:25+03:00

- LAST_COMPLETED_TASK_ID: `P1-DEVICE-SESSION-DUPLICATE-ROW-ACCEPTANCE-001` (added the missing regression test for duplicate server session identifiers).
- CURRENT_BRANCH: `p1/central-device-session-ui-20261023`.
- BASE_SHA: `59547c7d683cefd65cab445b97219aa701021676` (current main at branch synchronization).
- HEAD_SHA: `73864a23839d75f275e44bc52893f0533383033e` (exact code/test SHA; this checkpoint commit is a docs-only child).
- LAST_CONFIRMED_TESTS: no application tests have completed on `73864a23839d75f275e44bc52893f0533383033e` yet. Exact-head Core run [39960886831](https://github.com/Report-Engainall/Nasr1/actions/runs/39960886831) is QUEUED; P2 Playwright [39960886827](https://github.com/Report-Engainall/Nasr1/actions/runs/39960886827) is PENDING. CodeRabbit status is SUCCESS (review bot status only, not test evidence).
- FAILED_OR_NOT_RUN_TESTS: the prior functional head Core run [39959906007](https://github.com/Report-Engainall/Nasr1/actions/runs/39959906007) failed during dependency installation because the configured Lovable npm cache returned HTTP 429; no test/build/DB steps ran. The prior P2 Playwright run [39959905948](https://github.com/Report-Engainall/Nasr1/actions/runs/39959905948) concluded CANCELLED; customer-order/tenant acceptance was SKIPPED. The cancelled/failing earlier run is not success evidence for this head.
- FILES_CHANGED: `src/test/device-management.test.tsx` adds a regression test where the server returns duplicate `session_id` values and asserts the UI fails closed, reports an alert, and renders neither record. Earlier P1 branch edits remain in `src/components/DeviceManagement.tsx`; this task makes no application implementation change.
- LOCKED_PATHS: P2-owned migrations, RPC, RLS, generated database types, Auth enforcement, P2 workflow/fixture files; shared `CURRENT_EXECUTION_STATE.md` and `WORK_COORDINATION.md`; P3 acceptance files. None were edited.
- NEXT_ACTION: read terminal Core and P2 results for exact current branch HEAD (after this checkpoint commit, the new SHA also needs its own CI). If dependency download fails again with HTTP 429, record the exact runner evidence and retry safely; do not weaken Bun frozen-lockfile verification. Keep PR #88 PARTIAL until P2 PR #83 merges and an authenticated isolated-browser run proves selected-session revocation plus denial on a subsequent protected request.
- BLOCKER: exact-head CI pending; dependency cache returned HTTP 429 on the prior head; P2 backend contract PR #83 remains open.
- PR_URL: https://github.com/Report-Engainall/Nasr1/pull/88
- MERGE_STATUS: OPEN / NOT READY — exact-head CI and server-backed browser acceptance still required.
- UPDATED_AT: 2026-10-23T16:25+03:00

## P1 exact-session-acknowledgement regression — 2026-10-23T16:27+03:00

- LAST_COMPLETED_TASK_ID: `P1-INVITE-EXPIRY-90`; CURRENT_TASK_ID: `P1-SESSION-REVOCATION-EXACT-ACK-TEST` (new test committed; CI pending).
- CURRENT_BRANCH: `p1/central-device-session-ui-20261023`.
- BASE_SHA: original PR #88 base `0396b29aeab8c09c430df0063821251208a38477`; current main anchor `59547c7d683cefd65cab445b97219aa701021676`.
- HEAD_SHA: `5f500eb2129f5745bb924beb06e6a4764ab9a0e0`.
- LAST_CONFIRMED_TESTS: predecessor head `7adeec2fa2490840aa213449a2d87f49b4e97b74` Core [39958053579 SUCCESS](https://github.com/Report-Engainall/Nasr1/actions/runs/39958053579), including network-list failure/retry and rapid-revoke double-click regression. The new mismatched-acknowledgement test is only on `5f500eb...`; Core [39959076957](https://github.com/Report-Engainall/Nasr1/actions/runs/39959076957) and P2 [39959076848](https://github.com/Report-Engainall/Nasr1/actions/runs/39959076848) were queued at record time.
- FAILED_OR_NOT_RUN_TESTS: no test result is claimed for `5f500eb...` yet. P2 dependency-install runs on prior heads repeatedly failed with HTTP 429 from the Lovable npm mirror; local Supabase/Chromium acceptance was skipped where dependency installation failed.
- FILES_CHANGED: only `src/test/device-management.test.tsx` in this unit. It verifies a success-shaped RPC result for another session ID does not trigger success notice and hides potentially stale session rows.
- LOCKED_PATHS: no P2 migration/RPC/RLS/API/lockfile/workflow, shared `CURRENT_EXECUTION_STATE.md`, `WORK_COORDINATION.md`, or shared matrix changes.
- NEXT_ACTION: run Core and P2 on `5f500eb...`; fix concrete code/test failures. P2 test must actually execute local Supabase/Chromium, not skip, before #88 can graduate from Draft after PR #83 is integrated.
- BLOCKER: recurring HTTP 429 from external Lovable package mirror prevents P2 test setup; P2 PR #83 current head `5c0367b631a80cc13d10ba5219d3f1966d0185ec` has separate current-head Core/P2 checks in progress.
- PR_URL: https://github.com/Report-Engainall/Nasr1/pull/88
- MERGE_STATUS: #88 Draft/open; #83 Draft/open; checkpoint PR #93 open, with its previous run failing at dependency install due same HTTP 429.
- UPDATED_AT: 2026-10-23T16:27+03:00

## Latest resume — audited self-session revocation UI integration — 2026-10-23T16:28+03:00

- LAST_COMPLETED_TASK_ID: `P1-DEVICE-SESSION-SELF-REVOCATION-RPC-001`.
- CURRENT_BRANCH: `p1/central-device-session-ui-20261023`.
- BASE_SHA: `59547c7d683cefd65cab445b97219aa701021676`.
- HEAD_SHA: `8248a7f8dc3145063ee319fa35de41305d19705a` (functional code/test commit; current checkpoint/report append is a docs-only child).
- LAST_CONFIRMED_TESTS: code/test commit `8248a7f8dc3145063ee319fa35de41305d19705a` has Core CI [39961454298](https://github.com/Report-Engainall/Nasr1/actions/runs/39961454298) IN_PROGRESS and P2 Playwright [39961454316](https://github.com/Report-Engainall/Nasr1/actions/runs/39961454316) IN_PROGRESS at the time of this checkpoint. CodeRabbit reports SUCCESS, which is not a replacement for test evidence.
- IMPLEMENTED: `DeviceManagement.tsx` now calls P2's `revoke_other_auth_sessions` RPC instead of `auth.signOut({scope:'others'})` for the “other sessions” action. It validates the exact current `session_id`, finite non-negative count, unique UUID deletion list whose length matches the count, exclusion of the current session, and parseable server timestamp before showing success. The action has a synchronous in-flight guard and requires a current session ID. The current-device local logout remains unchanged.
- TESTS_ADDED: component acceptance verifies that the server RPC is called, the current session remains visible while other-session rows disappear, and a malformed/mismatched acknowledgment never displays success. The prior duplicate-session-ID test remains.
- FAILED_OR_NOT_RUN_TESTS: no terminal test conclusion is available yet for `8248a7f...`; no local test command was run through this remote GitHub editing session. Earlier Core failure `39959906007` was pre-test HTTP 429 during dependency installation; prior Playwright `39959905948` was cancelled. Those outcomes are not evidence for the new head.
- FILES_CHANGED: `src/components/DeviceManagement.tsx`, `src/test/device-management.test.tsx`; this checkpoint and current report updated below.
- LOCKED_PATHS: P2 migrations/RPC/RLS/generated types/Auth enforcement and workflows/fixtures; shared `CURRENT_EXECUTION_STATE.md` / `WORK_COORDINATION.md`; P3 acceptance files — untouched.
- NEXT_ACTION: inspect terminal Core/P2 Actions for the exact newest branch head after this checkpoint append; fix only real failures. P2 PR #83 remains the server contract dependency; after it merges into main, refresh this branch and prove list/revoke behavior using isolated authenticated browser checks, including denial of a later protected request with the revoked session.
- BLOCKER: exact-head Core/P2 results pending; backend contract PR #83 must merge before integrated browser acceptance.
- PR_URL: https://github.com/Report-Engainall/Nasr1/pull/88
- MERGE_STATUS: OPEN / NOT READY — retain PARTIAL until backend integration and browser proof.
- UPDATED_AT: 2026-10-23T16:28+03:00

## Latest resume — correct bulk-revocation test callback fixture — 2026-10-23T16:33+03:00

- LAST_COMPLETED_TASK_ID: `P1-DEVICE-SESSION-RPC-ACK-FIXTURE-001`.
- CURRENT_BRANCH: `p1/central-device-session-ui-20261023`.
- BASE_SHA: `59547c7d683cefd65cab445b97219aa701021676`.
- HEAD_SHA: `ddb80804b8749cb8dff182344ca9713e2beb64ec` (test fixture correction; checkpoint/report update is a docs-only child).
- LAST_CONFIRMED_TESTS: prior functional code/test SHA `8248a7f8dc3145063ee319fa35de41305d19705a`, Core run [39961454298](https://github.com/Report-Engainall/Nasr1/actions/runs/39961454298), ran 136 test files: **135 passed / 1 failed; 855 tests passed / 1 failed**. The failed test was `src/test/device-management.test.tsx > uses the server-owned self-scoped RPC to revoke other sessions and preserves the current session`. Exact log showed the assertion failed because the test called `mount()` (which passes `mocks.onNotice`) but asserted a separate unmounted `vi.fn()`. Fixed the two new tests to observe `mocks.onNotice`; no assertion was weakened. New-head CI is pending readback.
- FAILED_OR_NOT_RUN_TESTS: for the later docs HEAD `0c582c1ca0cf92f0b1a959d26a1e82af66c84d39`, Core run [39961596225](https://github.com/Report-Engainall/Nasr1/actions/runs/39961596225) and P2 Playwright [39961596206](https://github.com/Report-Engainall/Nasr1/actions/runs/39961596206) failed before test execution at frozen-lock dependency downloads with HTTP 429 from `lovable-core-prod/sandbox-npm-cache`; this is separate from the 1 assertion failure on the earlier functional SHA. Latest commit `ddb80804...` needs its own exact-head CI results.
- FILES_CHANGED: `src/test/device-management.test.tsx` now uses the actual mounted `mocks.onNotice` callback for both success and malformed-ack assertions. The preceding UI implementation remains in `src/components/DeviceManagement.tsx`.
- LOCKED_PATHS: P2 SQL/RPC/RLS/type/Auth/workflow/fixture files, shared execution-state/coordination, and P3 acceptance files unchanged.
- NEXT_ACTION: read Core + P2 Actions on latest code/test SHA `ddb80804b8749cb8dff182344ca9713e2beb64ec` and final doc HEAD once saved. If the unit test fails again, follow the new exact assertion and fix its cause. If installs fail at HTTP 429, record the infrastructure blocker and request safe rerun; do not alter the frozen lockfile. Then sync to main after P2 #83 merge and run integrated session browser acceptance.
- BLOCKER: exact-head tests pending; previous feature-head unit failure was a test callback-fixture defect now corrected; transient package-cache HTTP 429 recurred. P2 PR #83 also has a failing local Supabase Playwright job (reported to P2 in comment 6366037526).
- PR_URL: https://github.com/Report-Engainall/Nasr1/pull/88
- MERGE_STATUS: OPEN / NOT READY.
- UPDATED_AT: 2026-10-23T16:33+03:00

## Current live branch checkpoint — after main-sync and exact-ack test — 2026-10-23T16:35+03:00

- LAST_COMPLETED_TASK_ID: `P1-INVITE-EXPIRY-90`; CURRENT_TASK_ID: `P1-DEVICE-SESSION-MGMT-UI-001` (current-base code/test head awaiting final exact-head CI and P2 contract integration).
- CURRENT_BRANCH: `p1/central-device-session-ui-20261023`.
- BASE_SHA: `59547c7d683cefd65cab445b97219aa701021676` (current main; the UI branch now has a merge commit syncing this main).
- HEAD_SHA: `f7839b615282a1627804fce360d6ceda5fe56e48` (current live PR #88 head).
- LAST_CONFIRMED_TESTS: predecessor `5f500eb2129f5745bb924beb06e6a4764ab9a0e0` Core run [39959076957 SUCCESS, attempt 2](https://github.com/Report-Engainall/Nasr1/actions/runs/39959076957) including Unit tests (duplicate revocation, network retry, exact-session acknowledgement), PostgreSQL 17 workflow checks, lint/build/smoke, and browser price-visibility acceptance. That run does not validate the newer merge head `f7839b...`. Current-head Core [39959906007](https://github.com/Report-Engainall/Nasr1/actions/runs/39959906007) and P2 Playwright [39959905948](https://github.com/Report-Engainall/Nasr1/actions/runs/39959905948) were in progress at this checkpoint.
- FAILED_OR_NOT_RUN_TESTS: predecessor P2 run [39959076848 FAILURE, attempt 2](https://github.com/Report-Engainall/Nasr1/actions/runs/39959076848) failed at app dependency installation due repeated HTTP 429 from Lovable's package mirror; local Supabase/Chromium job was skipped. End-to-end organization session listing/revocation therefore remains NOT PROVEN. Current head must receive both terminal results.
- P2 backend dependency: PR #83 live head `b7830efa562021e0139736a33d0235037cd8f976`; Core [39959552835 SUCCESS](https://github.com/Report-Engainall/Nasr1/actions/runs/39959552835), P2 Playwright [39959552757](https://github.com/Report-Engainall/Nasr1/actions/runs/39959552757) still in progress at readback. Do not merge #88 until P2's backend contract is integrated in main and current-head local Supabase/Chromium acceptance of session RPCs passes.
- FILES_CHANGED in P1 code PR: `src/components/DeviceManagement.tsx`, `src/test/device-management.test.tsx`; current PR diff remains limited to these two P1-owned paths. This UI branch sync used a normal merge commit, no force-push.
- LOCKED_PATHS: no P2 migration/RPC/RLS/types/API, `bun.lock`, CI workflow, shared execution-state/coordination or acceptance matrix changes by P1.
- NEXT_ACTION: inspect current-head Core/P2 terminal results for `f7839b...`; if both pass, keep #88 Draft until #83 backend integration, then rerun selective revocation browser acceptance on the integrated main base. P1 checkpoint/report PR #93 remains open because its prior documentation-head Core/P2 attempts failed before tests with package-mirror HTTP 429; current docs branch head is separate from the code PR head.
- BLOCKER: central-session server contract remains P2-owned/unmerged; prior P2 setup failure was persistent external registry rate limiting. New current-head workflows are running.
- PR_URL: https://github.com/Report-Engainall/Nasr1/pull/88
- MERGE_STATUS: #88 Draft/open; #83 Draft/open; #82 open/P2-owned; checkpoint/report PR #93 open and not merged due CI setup failure.
- UPDATED_AT: 2026-10-23T16:35+03:00

## Latest resume — bulk-session action duplicate-click guard — 2026-10-23T16:37+03:00

- LAST_COMPLETED_TASK_ID: `P1-DEVICE-SESSION-BULK-DOUBLE-SUBMIT-001`.
- CURRENT_BRANCH: `p1/central-device-session-ui-20261023`.
- BASE_SHA: `59547c7d683cefd65cab445b97219aa701021676`.
- HEAD_SHA: `572ab73dc3dab53d2042f2fa8f1f0f1388ba3633` (code/test head; next checkpoint commit is documentation-only).
- LAST_CONFIRMED_TESTS: latest exact code/test Core run [39962147380](https://github.com/Report-Engainall/Nasr1/actions/runs/39962147380) IN_PROGRESS; P2 Playwright [39962147845](https://github.com/Report-Engainall/Nasr1/actions/runs/39962147845) IN_PROGRESS. CodeRabbit status SUCCESS is not test evidence. The latest test commit adds a deferred-RPC rapid-double-click test asserting only one `revoke_other_auth_sessions` call is emitted and the success notice appears after server acknowledgement.
- PREVIOUS_FAILURE_AND_FIX: Core [39961454298](https://github.com/Report-Engainall/Nasr1/actions/runs/39961454298) on earlier SHA `8248a7f8...` ran 136 files with 855/856 tests passing; one new UI test observed an unmounted callback. Fixed on `ddb80804b8749cb8dff182344ca9713e2beb64ec` by asserting the callback the shared mount helper actually passes. The corrected-head Core [39961918566](https://github.com/Report-Engainall/Nasr1/actions/runs/39961918566) was still IN_PROGRESS at last read; its result is not yet known.
- INFRASTRUCTURE: separate run [39961596225](https://github.com/Report-Engainall/Nasr1/actions/runs/39961596225) on prior docs head failed at dependency installation with repeated HTTP 429 from the Lovable npm cache; no tests ran in that attempt. Do not conflate it with the earlier unit assertion failure.
- FILES_CHANGED: `src/components/DeviceManagement.tsx`, `src/test/device-management.test.tsx`; checkpoint/report appended.
- LOCKED_PATHS: P2 database/RPC/RLS/type/Auth/workflow/fixture paths; shared `CURRENT_EXECUTION_STATE.md` and `WORK_COORDINATION.md`; P3 acceptance paths — untouched.
- NEXT_ACTION: read exact-head Core/P2 outcomes for the latest branch head after this checkpoint commit; investigate any remaining failing assertion from the actual log, retry only infrastructure flake safely, preserve Bun lock verification. Keep the UI feature PARTIAL until PR #83 backend is merged and authenticated browser acceptance proves selective revocation then denial of later protected requests.
- BLOCKER: exact-head CI pending; P2 PR #83 P2 Playwright [39960901154](https://github.com/Report-Engainall/Nasr1/actions/runs/39960901154) failed local Supabase acceptance and that issue was reported to P2 via comment 6366037526.
- PR_URL: https://github.com/Report-Engainall/Nasr1/pull/88
- MERGE_STATUS: OPEN / NOT READY.
- UPDATED_AT: 2026-10-23T16:37+03:00

## Latest resume — exact-head Core result + invitation and settings integration readback — 2026-10-23T16:46+03:00

- LAST_COMPLETED_TASK_ID: `P1-DEVICE-SESSION-BULK-DOUBLE-SUBMIT-001`; its code/test head has a green Core CI result.
- CURRENT_BRANCH: `p1/central-device-session-ui-20261023`.
- BASE_SHA: `59547c7d683cefd65cab445b97219aa701021676`.
- HEAD_SHA: `572ab73dc3dab53d2042f2fa8f1f0f1388ba3633` is the last fully tested code/test SHA. Documentation-only branch head before this update: `7d756c62743fbbd92e52d9a392f6c441add61951`.
- LAST_CONFIRMED_TESTS: code/test SHA `572ab73dc3dab53d2042f2fa8f1f0f1388ba3633`, Core [39962147380](https://github.com/Report-Engainall/Nasr1/actions/runs/39962147380) = SUCCESS: **136/136 test files, 857/857 tests**; migrations + PostgreSQL 17 core acceptance, invitation expiry, stock-count start audit, async export, import idempotency, inventory snapshot, saved products, backup/restore, lint, build, preview 4173, dev 5173, and Chromium price-visibility acceptance all succeeded. This includes the fixed mounted-notice fixture and rapid-double-click test.
- P2_BROWSER_RESULT: P2 Playwright [39962147845](https://github.com/Report-Engainall/Nasr1/actions/runs/39962147845): public UI smoke SUCCESS; external customer-order/tenant job SKIPPED; local Supabase job CANCELLED. No authenticated session-revocation browser proof.
- LATEST_DOCS_HEAD_CHECKS: current documentation-only child `7d756c62743fbbd92e52d9a392f6c441add61951`: Core [39962288619](https://github.com/Report-Engainall/Nasr1/actions/runs/39962288619) still IN_PROGRESS at last read, with unit tests, PostgreSQL 17, lint/build, preview and dev-smoke steps successful; Chromium price-visibility acceptance had not yet become terminal. P2 [39962288636](https://github.com/Report-Engainall/Nasr1/actions/runs/39962288636) public smoke IN_PROGRESS; authenticated external path SKIPPED. Do not mark this docs SHA green until its run is terminal.
- P1-ROLE-UI-READBACK: on current `main`, `src/components/AdminPages.tsx` blob `f40d28dd03dd32cda00e181465115266c6330a8a` imports `CustomerManagerRoleAssignment` and mounts it in the actual access-settings tab behind `canManageRoles`; `src/test/customer-manager-role-assignment-settings-wiring.test.tsx` blob `eeb72df65158681064c81652087e7e9a0e01f1e5` mounts `SettingsPage` and checks real tab wiring and customer-manager denial. The green 857-test Core suite above covers the integrated current-main page. No duplicate UI work is needed.
- INVITATION_BLOCKER: #90 is merged into main at `59547c7d683cefd65cab445b97219aa701021676`, but its historical P2 Playwright run was cancelled. The prior invitation-create failure is a confirmed pgcrypto schema defect. P2 fix PR #82 is still OPEN at `8e70899da67d53f0acf221d7e4eeb1a8f2f1b591`, and live comparison reports 18 ahead / 13 behind current main. P1 coordination comments: [#82 comment 6366161962](https://github.com/Report-Engainall/Nasr1/pull/82#issuecomment-6366161962) and [handoff #86 comment 6366213509](https://github.com/Report-Engainall/Nasr1/issues/86#issuecomment-6366213509). Do not claim invite-create browser proof until P2 syncs and reruns the dedicated local Chromium scenario.
- P2_SESSION_BLOCKER: PR #83 branch is synced to main (66 ahead, 0 behind at last comparison), Core [39960901244](https://github.com/Report-Engainall/Nasr1/actions/runs/39960901244) succeeded, but P2 Playwright [39960901154](https://github.com/Report-Engainall/Nasr1/actions/runs/39960901154) failed in local PostgreSQL purchase-receipt acceptance. P1 reported exact failure in comment 6366037526. P1 must not edit P2-owned workflow/migration paths.
- FILES_CHANGED: `src/components/DeviceManagement.tsx`, `src/test/device-management.test.tsx`, this checkpoint/report only. P2 and P3 paths remain untouched.
- NEXT_ACTION: read final CI for the newest docs head; if green, preserve that exact SHA/run. Keep #88 draft and partial until #83's exact-head Core + P2 acceptance are green and merged to main; then sync and prove actual authenticated session list, selective revocation, retained current session, audit and subsequent protected-request denial. Continue coordinating #82 invitation fix separately.
- BLOCKER: no authenticated central-session browser proof; #83 P2 acceptance fails; #82 is 13 commits behind main.
- PR_URL: https://github.com/Report-Engainall/Nasr1/pull/88
- MERGE_STATUS: DRAFT / OPEN / NOT READY.
- UPDATED_AT: 2026-10-23T16:46+03:00

## Active resume — stale session-list response hardening — 2026-10-23T17:00+03:00

- LAST_COMPLETED_TASK_ID: `P1-DEVICE-SESSION-STALE-LIST-RESPONSE-001` (implementation committed; exact-head verification pending).
- CURRENT_BRANCH: `p1/central-device-session-ui-20261023`.
- BASE_SHA: `59547c7d683cefd65cab445b97219aa701021676`.
- HEAD_SHA (functional code/test commit): `f3673f85a88762be52a4c8ca7597be475639eda9`. This checkpoint/report update is documentation-only; read the live PR head for the exact documentation commit and test runs.
- LAST_CONFIRMED_TESTS: prior head `58e795f6ab601093b02286a18bce080e55424c63` — Core [39965165177](https://github.com/Report-Engainall/Nasr1/actions/runs/39965165177) SUCCESS; P2 Playwright [39965165130](https://github.com/Report-Engainall/Nasr1/actions/runs/39965165130) SUCCESS. Those runs predate this functional fix and do not prove it. P2 PR #83 exact head `91c87e003b5196eb9b5be02326e8aa52b3a3f4d3`: Core [39961778913](https://github.com/Report-Engainall/Nasr1/actions/runs/39961778913) SUCCESS; P2 Playwright [39961778847](https://github.com/Report-Engainall/Nasr1/actions/runs/39961778847) SUCCESS, including its local Supabase/Chromium commerce job.
- FAILED_OR_NOT_RUN_TESTS: Core and P2 Playwright for `f3673f85a88762be52a4c8ca7597be475639eda9` PENDING at checkpoint time. The new session-specific browser spec and local seeding script are present in PR #88, but the existing P2 workflow explicitly runs only the critical-path, return, Onyx export, finance-print, and public-smoke specs; it did not invoke `e2e/device-session-management.spec.ts` or `scripts/seed-p1-device-session-playwright.mjs` on SHA `58e795f...`. This gap was handed to P2 in [PR #83 comment 6366644229](https://github.com/Report-Engainall/Nasr1/pull/83#issuecomment-6366644229). No authenticated session-revocation browser PASS is claimed yet.
- FILES_CHANGED: functional commit modifies `src/components/DeviceManagement.tsx` and `src/test/device-management.test.tsx`; PR #88 also carries the new `e2e/device-session-management.spec.ts` and `scripts/seed-p1-device-session-playwright.mjs` from the concurrent P1 batch.
- LOCKED_PATHS: P2 migrations/RPC/RLS/Auth/generated types and `.github/workflows/p2-playwright-critical-paths.yml`; shared `CURRENT_EXECUTION_STATE.md` and `WORK_COORDINATION.md`; P3 acceptance paths. No locked path changed.
- NEXT_ACTION: read Core + P2 workflow results on the live latest #88 head. Fix only concrete failures. Coordinate with P2 to execute the P1-owned session browser spec inside the existing isolated local Supabase job; it must revoke a same-tenant target session and prove a later protected tenant-context RPC is denied while the JWT has not yet expired, and prove bulk self-revocation retains the current session. Keep #88 Draft until backend #83 is merged and this exact integrated acceptance runs.
- BLOCKER: exact-head CI pending; session-specific E2E is not yet wired into the P2-owned workflow; external authenticated E2E remains gated.
- PR_URL: https://github.com/Report-Engainall/Nasr1/pull/88
- MERGE_STATUS: DRAFT / OPEN / NOT READY.
- UPDATED_AT: 2026-10-23T17:00+03:00


## Active resume — local sign-out duplicate-action guard — 2026-10-23T17:15+03:00

- LAST_COMPLETED_TASK_ID: `P1-DEVICE-SESSION-LOCAL-SIGNOUT-DOUBLE-SUBMIT-001` (code/test implemented in `f1c298299281f1e10755c3786c3900724f5c5632`; exact-head CI pending).
- CURRENT_BRANCH: `p1/central-device-session-ui-20261023`.
- BASE_SHA: `f7565aefd7af6033d169167d1bebb3dc5cd248ce` (current main after the merged invitation/checkpoint PR #93).
- HEAD_SHA (functional code/test commit): `f1c298299281f1e10755c3786c3900724f5c5632`. The subsequent resume-doc commit is documentation-only; resolve the live branch head at the next start.
- LAST_CONFIRMED_TESTS: code/test parent `d23de924cccc839208eb64c4bbc9528d9feddb4c` Core [39967378247](https://github.com/Report-Engainall/Nasr1/actions/runs/39967378247) SUCCESS. That head includes the stale-list-response guard, but predates local sign-out hardening. Stale-list functional commit `f3673f85a88762be52a4c8ca7597be475639eda9` Core [39966125912](https://github.com/Report-Engainall/Nasr1/actions/runs/39966125912) SUCCESS. Do not transfer either PASS to `f1c2982...`.
- FAILED_OR_NOT_RUN_TESTS: Core and P2 Playwright for `f1c298299281f1e10755c3786c3900724f5c5632` were not yet terminal at this checkpoint. Authenticated central-session browser acceptance remains NOT_PROVEN: `e2e/device-session-management.spec.ts` and its local seed script are not invoked by the P2 workflow version read at blob `2a74366b6b0c7b7a23f25aae3578d67d5d1d9341`. P1 requested P2 wiring in [PR #83 comment 6366644229](https://github.com/Report-Engainall/Nasr1/pull/83#issuecomment-6366644229) and reiterated after main advanced in [comment 6366901182](https://github.com/Report-Engainall/Nasr1/pull/83#issuecomment-6366901182).
- FILES_CHANGED: `src/components/DeviceManagement.tsx`, `src/test/device-management.test.tsx`; session-specific browser spec and local fixture script remain in the branch. PR #88 history includes main checkpoint/report merge commit `d23de924cccc839208eb64c4bbc9528d9feddb4c`; no force-push.
- LOCKED_PATHS: P2 migrations/RPC/RLS/Auth/generated types and `.github/workflows/p2-playwright-critical-paths.yml`; shared `CURRENT_EXECUTION_STATE.md` and `WORK_COORDINATION.md`; P3 acceptance paths. P1 did not change these files.
- NEXT_ACTION: get Core + P2 workflow terminal results for the live #88 head; fix specific failures only. Then require P2 to run the new session spec in isolated local Supabase/PG17, proving exact same-tenant session revocation, subsequent protected-tenant RPC denial while JWT time has not expired, and bulk self-revocation preserving the caller session. Keep #88 Draft until backend #83 is merged and the scenario is run on the integrated base.
- BLOCKER: new local sign-out test still needs exact-head CI; session E2E runner is not yet wired by P2. P2 PR #83 live head `d2706613906ab401a28628de101a500b8b80b2d5` was 69 ahead / 1 behind main; Core [39966420997](https://github.com/Report-Engainall/Nasr1/actions/runs/39966420997) SUCCESS, P2 Playwright [39966421033](https://github.com/Report-Engainall/Nasr1/actions/runs/39966421033) IN_PROGRESS at last read.
- PR_URL: https://github.com/Report-Engainall/Nasr1/pull/88
- MERGE_STATUS: DRAFT / OPEN / NOT READY.
- UPDATED_AT: 2026-10-23T17:15+03:00


## Active resume — require valid server revocation timestamp — 2026-10-23T17:24+03:00

- LAST_COMPLETED_TASK_ID: `P1-DEVICE-SESSION-REVOKE-TIMESTAMP-ACK-001` (implemented; exact-head CI pending).
- CURRENT_BRANCH: `p1/central-device-session-ui-20261023`.
- BASE_SHA: `f7565aefd7af6033d169167d1bebb3dc5cd248ce`.
- HEAD_SHA (functional code/test): `f6d0c75326cc6ab650359b983d6fd6749ec647f3`. The next checkpoint/report-only commit is a new head; re-read the live #88 head and exact-SHA checks at session start.
- LAST_CONFIRMED_TESTS: stale-list-response code/test `f3673f85a88762be52a4c8ca7597be475639eda9` Core [39966125912](https://github.com/Report-Engainall/Nasr1/actions/runs/39966125912) SUCCESS. local-sign-out guard code/test `f1c298299281f1e10755c3786c3900724f5c5632` Core [39968018993](https://github.com/Report-Engainall/Nasr1/actions/runs/39968018993) SUCCESS. The latter confirms the local sign-out change, but neither run proves `f6d0c753...`.
- FAILED_OR_NOT_RUN_TESTS: Core and P2 Playwright for `f6d0c753...` PENDING at checkpoint time. Dedicated session browser acceptance remains NOT_PROVEN because current P2 workflow does not invoke `e2e/device-session-management.spec.ts` or `scripts/seed-p1-device-session-playwright.mjs`. Handoff is documented in #83 comments [6366644229](https://github.com/Report-Engainall/Nasr1/pull/83#issuecomment-6366644229) and [6366901182](https://github.com/Report-Engainall/Nasr1/pull/83#issuecomment-6366901182).
- FILES_CHANGED: `src/components/DeviceManagement.tsx`, `src/test/device-management.test.tsx`. Success for organization-session revocation now requires a matching `session_id`, `revoked === true`, and a parseable server `revoked_at` timestamp; a negative regression rejects an invalid timestamp without showing success.
- LOCKED_PATHS: P2 migrations/RPC/RLS/Auth/types/workflows; shared `CURRENT_EXECUTION_STATE.md` and `WORK_COORDINATION.md`; P3 acceptance matrix/paths. No locked file was edited.
- NEXT_ACTION: inspect Core + P2 workflow status for live #88 head. Fix only exact failures. Then require P2 to wire and run the session browser spec against local Supabase/PostgreSQL 17 and the integrated contract, proving same-tenant selective revocation, protected tenant-context RPC denial for the revoked-but-unexpired JWT, and retention of the current session after self-scoped bulk logout. Do not mark browser proof PASS from the generic order/tenant job.
- BLOCKER: exact-head CI pending; session-specific browser test remains unwired in P2-owned workflow. P2 PR #83 live head at this checkpoint: `338e6504941506ef2c65e6a488f1f88fe4931425`, base remains old main `59547c7...`; resync and merge are P2-owned.
- PR_URL: https://github.com/Report-Engainall/Nasr1/pull/88
- MERGE_STATUS: DRAFT / OPEN / NOT READY.
- UPDATED_AT: 2026-10-23T17:24+03:00


## Active resume — local sign-out failure/retry acceptance — 2026-10-23T17:29+03:00

- LAST_COMPLETED_TASK_ID: `P1-DEVICE-SESSION-LOCAL-SIGNOUT-RETRY-001` (regression test committed; exact-head CI pending).
- CURRENT_BRANCH: `p1/central-device-session-ui-20261023`.
- BASE_SHA: `f7565aefd7af6033d169167d1bebb3dc5cd248ce`.
- HEAD_SHA (functional code/test commit): `8d3ee29f48c6f9f600722b2354f9d3fc40b41ca5`. Current checkpoint/report commit will supersede this HEAD without changing code; resolve the live branch at next session.
- LAST_CONFIRMED_TESTS: local sign-out handler (single-flight, state clear only after server confirmation) Core [39968018993](https://github.com/Report-Engainall/Nasr1/actions/runs/39968018993) SUCCESS on code SHA `f1c298299281f1e10755c3786c3900724f5c5632`; timestamp-ack validation Core [39968697854](https://github.com/Report-Engainall/Nasr1/actions/runs/39968697854) SUCCESS on code SHA `f6d0c75326cc6ab650359b983d6fd6749ec647f3`. Neither includes the new retry regression on `8d3ee29...`.
- FAILED_OR_NOT_RUN_TESTS: new test is awaiting current-head Core. Core/P2 runs on prior documentation head `052386744dc02d76e002ce172d54c2cd6d6bf9ac` were running, not terminal, at last check. Session-specific browser acceptance remains NOT_PROVEN; latest read of P2 branch `dda512495c43f2fd84517635cd83421ef49e92c0` showed its workflow still lacks `e2e/device-session-management.spec.ts` and `scripts/seed-p1-device-session-playwright.mjs`.
- FILES_CHANGED: `src/test/device-management.test.tsx`. The regression causes local `signOut` to reject once then succeed on retry; it expects the error to preserve the visible session, not fire a success notice, and release the action guard; retry must call the local-scope API once more, clear session details after acknowledgement, and emit one success notice.
- LOCKED_PATHS: P2 server workflows/migrations/RPC/RLS/Auth/types; shared `CURRENT_EXECUTION_STATE.md`/`WORK_COORDINATION.md`; P3-owned route/screens in PR #89. No locked path edited.
- NEXT_ACTION: check exact-head Core/P2 run for `8d3ee29...`. If test passes, verify latest branch head CI and continue with the next P1 screen gap only outside PR #89 changed paths and P2-owned files; keep session PR #88 Draft until P2 wires and proves dedicated local Supabase session E2E after #83 is integrated.
- BLOCKER: central-session integration browser tests are not wired by P2. P2 PR #83 at checkpoint: `dda512495c43f2fd84517635cd83421ef49e92c0`, Core [39968531790](https://github.com/Report-Engainall/Nasr1/actions/runs/39968531790) SUCCESS on predecessor SHA `338e650...`; P2 Playwright was still running/cancelled during branch advances and must be re-read at current head.
- PR_URL: https://github.com/Report-Engainall/Nasr1/pull/88
- MERGE_STATUS: DRAFT / OPEN / NOT READY.
- UPDATED_AT: 2026-10-23T17:29+03:00


## Current live checkpoint — P2 central-session backend integrated; P1 sync proof pending — 2026-10-23T17:38+03:00

- LAST_COMPLETED_TASK_ID: `P1-SESSION-UI-REGRESSION-HARDENING` (stale-list response, selected-session acknowledgment, local sign-out single-flight, and error/retry regression committed; old-head exact CI green).
- CURRENT_BRANCH: `p1/central-device-session-ui-20261023`.
- BASE_SHA: `bd0d2df489e40b2dc5f83882d90565c7799a448c` (PR #83 backend merge SHA).
- PRE_SYNC_HEAD_SHA: `428c98bece43296dbebd9ce30c78cffe48541348`; normal two-parent main-sync commit is created now and must receive new exact-head CI.
- LAST_CONFIRMED_TESTS: pre-sync PR #88 head `428c98bece43296dbebd9ce30c78cffe48541348` Core [39969541171](https://github.com/Report-Engainall/Nasr1/actions/runs/39969541171) SUCCESS and P2 Playwright [39969541110](https://github.com/Report-Engainall/Nasr1/actions/runs/39969541110) SUCCESS. P2 local Supabase/PostgreSQL 17 + Chromium job [120466867487](https://github.com/Report-Engainall/Nasr1/actions/runs/39968858140/job/120466867487) passed order persistence / tenant denial, customer return / credit memo, Onyx XLSX export, and finance/task print. The successful run did **not** invoke the dedicated P1 session-browser spec.
- BACKEND INTEGRATION: P2 PR #83 merged at main SHA `bd0d2df489e40b2dc5f83882d90565c7799a448c` on 2026-10-23 17:26+03. Exact pre-merge P2 head `dda512495c43f2fd84517635cd83421ef49e92c0`: Core [39968857948](https://github.com/Report-Engainall/Nasr1/actions/runs/39968857948) SUCCESS; P2 Playwright [39968858140](https://github.com/Report-Engainall/Nasr1/actions/runs/39968858140) SUCCESS. The Core migration test imports `runSessionManagementAcceptance` from `scripts/test-session-management.mjs`; this proves DB/RPC contract checks on that tested P2 head, not browser revocation flow.
- FAILED_OR_NOT_RUN_TESTS: current merge head Core + P2 local browser acceptance are pending after this sync. `e2e/device-session-management.spec.ts` and `scripts/seed-p1-device-session-playwright.mjs` are present in #88 but not invoked by `.github/workflows/p2-playwright-critical-paths.yml` (main blob `1b2b0eade154b8b4e8ed0bed0fa9b7067b5666b7`). Thus still NOT_PROVEN: actual session revocation followed by protected tenant-context RPC denial for a still-unexpired revoked JWT; self-scoped bulk revocation retaining the caller’s live session.
- P1-01 / P1-02: PR #50 category rename and PR #44 password-recovery route hardening are merged. Post-merge main Core [39969622689](https://github.com/Report-Engainall/Nasr1/actions/runs/39969622689) SUCCESS on `bd0d2df489e40b2dc5f83882d90565c7799a448c`; the feature-specific historical Core evidence remains recorded above. Password-reset authenticated browser proof remains NOT_RUN, not a production claim.
- FILES_CHANGED: #88 owns only the session component/test, its dedicated E2E spec and local seed, and P1 checkpoint/report. P2 paths were integrated through main; no P2-owned path changed in the P1 branch.
- LOCKED_PATHS: `.github/workflows/p2-playwright-critical-paths.yml`, P2 migrations/RPC/RLS/Auth/types/seed scripts, shared `CURRENT_EXECUTION_STATE.md`/`WORK_COORDINATION.md`, and P3-owned paths in #89.
- NEXT_ACTION: verify Core and P2 run results on the exact new merge HEAD. If green, request P2’s follow-up wiring of the dedicated session spec in a separate P2-owned workflow change; do not edit the locked workflow from P1. Keep #88 Draft until the specific browser scenario is executed against the integrated backend and passes.
- BLOCKER: no browser run currently invokes `e2e/device-session-management.spec.ts`; P2 must own the runner integration. P3 route work remains locked while PR #89 is open.
- PR_URL: https://github.com/Report-Engainall/Nasr1/pull/88
- MERGE_STATUS: DRAFT / OPEN / NOT READY.
- UPDATED_AT: 2026-10-23T17:38+03:00


## P1 live resumption — local session-fixture guard + acceptance wiring audit — 2026-10-23T14:38:56.566Z

- LAST_COMPLETED_TASK_ID: `P1-DEVICE-SESSION-LOCAL-ENDPOINT-GUARD-CODE` (implementation committed; exact-head checks are not yet terminal).
- CURRENT_TASK_ID: `P1-DEVICE-SESSION-MGMT-UI-001`.
- CURRENT_BRANCH: `p1/central-device-session-ui-20261023`.
- BASE_SHA: `bd0d2df489e40b2dc5f83882d90565c7799a448c` (PR #88 base recorded by the live PR record; branch integrated P2 session contract through its main-sync commit).
- HEAD_SHA: `7a3bc8a3e952c021bf122e484416b12ba2a82379` — code/test head immediately before the resume-record commits below. The checkpoint/report updates are documentation-only and do not alter the tested code.
- LAST_CONFIRMED_TESTS: no terminal result is claimed for `7a3bc8a3e952c021bf122e484416b12ba2a82379`. Exact-head Core run [39971268285](https://github.com/Report-Engainall/Nasr1/actions/runs/39971268285) was IN_PROGRESS and P2 Playwright [39971268281](https://github.com/Report-Engainall/Nasr1/actions/runs/39971268281) was PENDING at readback. These must be rechecked on the final branch head. Predecessor Core/P2 results on `5f500eb2129f5745bb924beb06e6a4764ab9a0e0` do not validate the new guard/test.
- FAILED_OR_NOT_RUN_TESTS: exact-head Vitest/Core and isolated PostgreSQL/Chromium results remain pending. P2 job inspection on the predecessor run showed the local setup invokes `scripts/seed-p2-local-playwright.mjs`, followed by order/finance acceptance; it did not invoke `scripts/seed-p1-device-session-playwright.mjs` or select `e2e/device-session-management.spec.ts`. Therefore central-session browser acceptance is NOT PROVEN regardless of the generic P2 job conclusion. The hosted-account E2E remains subject to its explicit missing-credentials gate and is not counted as a pass.
- FILES_CHANGED in this implementation unit: `scripts/lib/p1-device-session-endpoints.mjs`, `scripts/lib/p1-device-session-endpoints.d.mts`, `scripts/seed-p1-device-session-playwright.mjs`, `src/test/p1-device-session-endpoints.test.ts`; prior PR #88 changes remain in `src/components/DeviceManagement.tsx`, `src/test/device-management.test.tsx`, `e2e/device-session-management.spec.ts`, and its isolated seed script.
- IMPLEMENTED: the seeder now validates through a pure local-only guard and allows PostgreSQL loopback ports `54322` (default local Supabase) and `55432` (the port configured by the current isolated P2 workflow), while still requiring the API on HTTP loopback port `54321`. Vitest coverage includes both allowed ports and rejects remote endpoints, unexpected ports, incorrect database paths, embedded API credentials, and malformed URLs.
- LOCKED_PATHS: `.github/workflows/p2-playwright-critical-paths.yml`, P2 migrations/RPC/RLS/API/generated DB types, finance/inventory/data-service paths, `package.json`, `bun.lock`, shared `docs/bolt-source-reconciliation/CURRENT_EXECUTION_STATE.md`, `WORK_COORDINATION.md`, and the shared acceptance matrix remain untouched.
- NEXT_ACTION: read terminal Core and P2 checks on the final #88 head; fix only evidenced failures. Coordinate with P2 to run the new P1 local seed and `e2e/device-session-management.spec.ts` within the isolated local Supabase/Chromium job (without P1 editing the P2-owned workflow). Do not mark browser proof or merge #88 until that exact session acceptance executes and passes after the contract is integrated.
- BLOCKER: P1 session browser spec/seeder are not wired into the current P2 workflow; this requires workflow-owner coordination. Current exact-head checks are pending. Hosted/external-account testing remains NOT RUN where credentials are absent.
- PR_URL: https://github.com/Report-Engainall/Nasr1/pull/88
- MERGE_STATUS: #88 Draft/open; keep Draft until exact-head Core plus actual session-management Chromium acceptance pass.
- UPDATED_AT: 2026-10-23T14:38:56.566Z


## Latest live readback — Core PASS; session browser acceptance still not proven — 2026-10-23T14:44:49.787Z

- LAST_COMPLETED_TASK_ID: `P1-DEVICE-SESSION-LOCAL-ENDPOINT-GUARD-CODE` — seeder now supports the isolated local PostgreSQL port with a fail-closed localhost boundary; the new Vitest guard coverage is included in Core.
- CURRENT_TASK_ID: `P1-DEVICE-SESSION-MGMT-UI-001`.
- CURRENT_BRANCH: `p1/central-device-session-ui-20261023`.
- BASE_SHA: `bd0d2df489e40b2dc5f83882d90565c7799a448c` (PR #88 base recorded by GitHub at latest readback).
- LAST_CODE_SHA: `7a3bc8a3e952c021bf122e484416b12ba2a82379`.
- EXACT_HEAD_CI_READBACK_SHA: `b611b293ffc62e8f078fb3586148023ab6038aa5` (current PR #88 head before this status-note commit; contains no code changes after LAST_CODE_SHA).
- LAST_CONFIRMED_TESTS: Core CI [run 39971452491](https://github.com/Report-Engainall/Nasr1/actions/runs/39971452491) **SUCCESS** on exact head `b611b293...`; this includes the unit test suite containing `src/test/p1-device-session-endpoints.test.ts`, build and configured Core gates. It does not establish the new session-management Chromium acceptance.
- FAILED_OR_NOT_RUN_TESTS: P2 Playwright [run 39971452473](https://github.com/Report-Engainall/Nasr1/actions/runs/39971452473) was still **IN_PROGRESS** at readback. Jobs: authenticated external-account gate SUCCESS; public UI smoke SUCCESS; hosted-account customer-order job SKIPPED due its explicit credentials gate; isolated local Supabase order/tenant job IN_PROGRESS at “Start isolated local Supabase services”. This workflow does not invoke `scripts/seed-p1-device-session-playwright.mjs` or `e2e/device-session-management.spec.ts`, so central-session browser acceptance is **NOT PROVEN**, regardless of the generic P2 job's eventual result.
- FILES_CHANGED since code SHA: only this checkpoint/report status bookkeeping. Code change files remain `scripts/lib/p1-device-session-endpoints.mjs`, `scripts/lib/p1-device-session-endpoints.d.mts`, `scripts/seed-p1-device-session-playwright.mjs`, `src/test/p1-device-session-endpoints.test.ts`, alongside pre-existing #88 UI/browser files.
- LOCKED_PATHS: P2-owned `.github/workflows/p2-playwright-critical-paths.yml`, migrations/RPC/RLS/API/generated DB types, finance/inventory/services, `package.json`, `bun.lock`, shared `CURRENT_EXECUTION_STATE.md`, `WORK_COORDINATION.md`, shared acceptance matrix remain untouched.
- NEXT_ACTION: P2 must wire the P1 seed and the two `device-session-management.spec.ts` tests into the isolated local Supabase/Chromium job after environment export/app startup. Handoff comment recorded on #88 as [comment 6367467756](https://github.com/Report-Engainall/Nasr1/pull/88#issuecomment-6367467756). Then run Core + this exact browser acceptance on the new head; only promote #88 after the session tests truly execute and pass.
- BLOCKER: missing session-specific browser invocation in P2-owned workflow; this P1 branch cannot edit that locked file without ownership transfer. External hosted-account E2E remains NOT RUN/SKIPPED, not PASS.
- PR_URL: https://github.com/Report-Engainall/Nasr1/pull/88
- MERGE_STATUS: #88 OPEN / DRAFT / NOT MERGE-READY.
- INDEPENDENT_NEXT_CANDIDATE: PR #96 storefront admin-navigation gate has Core/P2 success on its exact head `844aebd2c63a479b02d5bb17c08d06180bd64f3d`, but its base is one main commit behind and it edits the same checkpoint/report files as #88. Do not merge it until it is brought onto current main, re-tested, and the shared documentation overlap is reconciled.
- UPDATED_AT: 2026-10-23T14:44:49.787Z


## P1 — prove revoked session JWT remains unexpired during protected-RPC denial — 2026-10-23T17:46+03:00

- LAST_COMPLETED_TASK_ID: `P1-SESSION-E2E-UNEXPIRED-JWT-001` (regression assertions implemented in `e2e/device-session-management.spec.ts`; exact-head CI pending).
- CURRENT_TASK_ID: `P1-DEVICE-SESSION-MGMT-UI-001`.
- CURRENT_BRANCH: `p1/central-device-session-ui-20261023`.
- BASE_SHA: `bd0d2df489e40b2dc5f83882d90565c7799a448c` (P2 session contract merge on main).
- FUNCTIONAL_HEAD_SHA: `916f68fbb362c6d430efbef294391155e601c156`. This checkpoint/report commit is documentation-only and will advance branch HEAD; re-read the live PR head for exact CI.
- LAST_CONFIRMED_TESTS: previous code/documentation head `b611b293ffc62e8f078fb3586148023ab6038aa5` Core CI [39971452491 SUCCESS](https://github.com/Report-Engainall/Nasr1/actions/runs/39971452491) and P2 Playwright [39971452473 SUCCESS](https://github.com/Report-Engainall/Nasr1/actions/runs/39971452473). The P2 workflow's configured local Supabase/Chromium scenarios completed, but the new `e2e/device-session-management.spec.ts` was not invoked by that workflow; these runs do **not** prove central-session revocation.
- FAILED_OR_NOT_RUN_TESTS: exact-head Core/P2 outcomes for functional SHA `916f68fbb362c6d430efbef294391155e601c156` are not yet available at this checkpoint. The new browser assertions have not yet been executed in CI because the P2-owned workflow does not invoke the P1 session seed/spec.
- IMPLEMENTED: `expectProtectedTenantRpcDenied(page, expectedSessionId)` now decodes only non-secret `session_id` and `exp` claims from the existing local browser token, asserts the token matches the exact revoked target/sibling, captures the request start time, and asserts `exp` is still in the future both before the protected tenant-context RPC request and after its denied response. It never prints or returns the access token.
- FILES_CHANGED: `e2e/device-session-management.spec.ts` functional/test change; this checkpoint and current report are the resume record.
- LOCKED_PATHS: `.github/workflows/p2-playwright-critical-paths.yml`, P2 migrations/RPC/RLS/Auth/API/generated types and seed/workflow files, shared `CURRENT_EXECUTION_STATE.md`, `WORK_COORDINATION.md`, shared acceptance matrix, and P3-owned #89 files remain untouched.
- NEXT_ACTION: verify exact-head Core and P2 results on the live branch SHA. Continue the handoff to P2 to invoke `scripts/seed-p1-device-session-playwright.mjs` and both tests in `e2e/device-session-management.spec.ts` inside isolated local Supabase/Chromium after DB migration and app environment export. Require proof of targeted same-tenant revocation followed by denial while JWT is still unexpired, plus self-scoped bulk revocation preserving the current session and denying the sibling token. Do not edit the locked workflow from P1.
- BLOCKER: the dedicated session-browser spec is still not wired into the P2-owned workflow. P1 handoff comment on #83: [6367496372](https://github.com/Report-Engainall/Nasr1/pull/83#issuecomment-6367496372).
- PR_URL: https://github.com/Report-Engainall/Nasr1/pull/88
- MERGE_STATUS: OPEN / DRAFT / NOT MERGE-READY until the dedicated integrated session browser scenarios execute and pass.
- UPDATED_AT: 2026-10-23T17:46+03:00


## P1 live CI readback — updated session expiry assertions; dedicated session spec remains unexecuted — 2026-10-23T17:52+03:00

- LAST_COMPLETED_TASK_ID: `P1-SESSION-E2E-UNEXPIRED-JWT-001` (the browser spec now asserts the exact revoked session ID and an unexpired JWT at request start and after denial).
- CURRENT_BRANCH: `p1/central-device-session-ui-20261023`.
- BASE_SHA: `bd0d2df489e40b2dc5f83882d90565c7799a448c`.
- FUNCTIONAL_HEAD_SHA: `916f68fbb362c6d430efbef294391155e601c156`.
- LAST_CONFIRMED_TESTS: Core [39972851057 SUCCESS](https://github.com/Report-Engainall/Nasr1/actions/runs/39972851057) and P2 [39972851031 SUCCESS](https://github.com/Report-Engainall/Nasr1/actions/runs/39972851031) both ran on exact pre-status documentation head `37be3a6ae29be70cc87d8e7a4c236a460e215d5d`, which includes functional SHA `916f68f...`. Core unit tests, PostgreSQL 17 migrations/acceptance, lint/build/preview/dev smoke, and configured price-visibility Chromium checks passed. P2 public UI smoke and the configured isolated local Supabase job succeeded; hosted customer-order/tenant isolation was explicitly skipped by its external-infrastructure gate.
- FAILED_OR_NOT_RUN_TESTS: the session-specific `e2e/device-session-management.spec.ts` remains **NOT RUN** by the P2 workflow, which still invokes only the configured commerce critical-path/returns/Onyx/finance specs. Generic Playwright success is not central-session acceptance.
- FILES_CHANGED: `e2e/device-session-management.spec.ts`; this checkpoint/report update is documentation-only. The E2E spec now checks that the exact expected `session_id` is present and that `exp` exceeds both the protected-request start time and the time after its denied response.
- LOCKED_PATHS: `.github/workflows/p2-playwright-critical-paths.yml`, P2 seed/workflow and SQL/RPC/RLS/API/type/finance paths, shared `CURRENT_EXECUTION_STATE.md`, `WORK_COORDINATION.md`, shared acceptance matrix, and P3 #89 paths. No locked paths edited.
- NEXT_ACTION: P2 must add `scripts/seed-p1-device-session-playwright.mjs` plus both tests from `e2e/device-session-management.spec.ts` to the existing isolated local Supabase/Chromium job, after DB setup and environment export. Re-read the exact final SHA/run and require targeted same-tenant revocation → protected RPC denial with still-unexpired token, plus self-scoped bulk revoke retaining current session and denying sibling session. The request is recorded at [#83 comment 6367739971](https://github.com/Report-Engainall/Nasr1/pull/83#issuecomment-6367739971).
- BLOCKER: missing session-specific invocation is P2-owned; hosted/production E2E remains NOT RUN.
- PR_URL: https://github.com/Report-Engainall/Nasr1/pull/88
- MERGE_STATUS: OPEN / DRAFT / NOT MERGE-READY.
- UPDATED_AT: 2026-10-23T17:52+03:00


## P1 live readback — stricter revoked-JWT denial assertion; related PR checkpoints — 2026-10-23T14:55:38.344Z

- LAST_COMPLETED_TASK_ID: `P1-SESSION-E2E-UNEXPIRED-JWT-001` — the browser helper now verifies the exact revoked `session_id`, proves `exp` remains later than request start and response, and requires HTTP **403** from the current tenant-authorization RPC. This removes the prior false-positive path that accepted any server 5xx as successful revocation denial.
- CURRENT_TASK_ID: `P1-DEVICE-SESSION-MGMT-UI-001`.
- CURRENT_BRANCH: `p1/central-device-session-ui-20261023`.
- BASE_SHA: `bd0d2df489e40b2dc5f83882d90565c7799a448c` as recorded by PR #88; live `main` pointer last read at `75ef8774917e25f11c328568bc316330546aefba`.
- HEAD_SHA: `87ecae031fd78caccd9fe5710ed66f5e6b61b3ba` (current code head before this checkpoint/report update; the just-added 403 assertion is included).
- LAST_CONFIRMED_TESTS: predecessor head `b611b293...` Core SUCCESS [39971452491](https://github.com/Report-Engainall/Nasr1/actions/runs/39971452491); that predecessor does **not** validate the newer JWT-expiry/403 assertion. The prior functional head `916f68f...` also predates the HTTP-403 tightening.
- FAILED_OR_NOT_RUN_TESTS: exact-head Core run [39973709057](https://github.com/Report-Engainall/Nasr1/actions/runs/39973709057) is IN_PROGRESS; P2 run [39973708325](https://github.com/Report-Engainall/Nasr1/actions/runs/39973708325) is PENDING. The P2 workflow currently on live `main` blob `1b2b0eade154b8b4e8ed0bed0fa9b7067b5666b7` still contains neither `scripts/seed-p1-device-session-playwright.mjs` nor `e2e/device-session-management.spec.ts`; no dedicated session-browser proof is claimed. The prior P2 local database job eventually ran other commerce scenarios only; the hosted customer-order job remained SKIPPED and is not PASS.
- FILES_CHANGED: `e2e/device-session-management.spec.ts` (HTTP result must now be 403, not arbitrary >=400); the local endpoint helper/seeder/tests from the preceding unit remain included in the branch. This update modifies only the two P1 resumption documents.
- LOCKED_PATHS: do not edit `.github/workflows/p2-playwright-critical-paths.yml`, P2 migrations/RPC/RLS/API/generated types, finance/inventory service files, `package.json`, `bun.lock`, `CURRENT_EXECUTION_STATE.md`, `WORK_COORDINATION.md`, or the common acceptance matrix.
- NEXT_ACTION: read terminal Core/P2 on the new code head, then obtain P2's wired session test in a later head. The current workflow-owner handoff is recorded on #88 [comment 6367467756](https://github.com/Report-Engainall/Nasr1/pull/88#issuecomment-6367467756) and P2 was also notified on #83 [comment 6367496372](https://github.com/Report-Engainall/Nasr1/pull/83#issuecomment-6367496372). Keep #88 Draft until the targeted two-test Chromium suite executes and passes.
- INDEPENDENT PR #96: branch head `f831033690a524779fc3fafab0bf6269494240f2` is now a normal merge commit including live main `75ef877...`; compare from current main shows only `src/components/Storefront.tsx` and `src/test/storefront-admin-navigation-access.test.ts`. Core [39973108364 SUCCESS](https://github.com/Report-Engainall/Nasr1/actions/runs/39973108364). P2 [39973108292](https://github.com/Report-Engainall/Nasr1/actions/runs/39973108292) is still IN_PROGRESS on the isolated local Supabase job; the external customer-order job is SKIPPED. Do not merge until this P2 run reaches a terminal conclusion and current main/head are rechecked.
- INDEPENDENT PR #97: the implementation head `ed4ee7ad...` passed Core `39972341560` and P2 `39972341569`, but documentation-only head `a2372eed...` started newer runs `39973415690` and `39973415713`; those results must be read on the latest head before merge. It is Draft and behind live main by one commit; synchronize and remove shared checkpoint/report changes from its final diff before merging.
- PR_URL: https://github.com/Report-Engainall/Nasr1/pull/88
- MERGE_STATUS: #88 OPEN / DRAFT / NOT MERGE-READY. No P1 merge performed on stale or insufficient session-browser evidence.
- UPDATED_AT: 2026-10-23T14:55:38.344Z
