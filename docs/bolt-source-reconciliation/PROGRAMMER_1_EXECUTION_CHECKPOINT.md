# P1 Execution Checkpoint — live resume record

> Update and commit this checkpoint after every task, blocker, and before stopping. Keep a concise current state and append dated history; do not erase prior evidence.

## Current state

- Overall status: IN_PROGRESS
- Current task: P1-03 — add customer-facing action to save a previous order as a source-linked reorder template, using the existing server RPC and its tenant/ownership checks.
- Active P1 implementation branch: `p1/remaining-work-execution-20261023`
- Main SHA at assignment: `76baf9dbe7860a764abc18e75835abb8750d56a3`
- Current branch HEAD before this checkpoint update: `16bfe4f96513753dc145dfec17a020f121e1f711`
- P1-01 candidate: PR [#50](https://github.com/Report-Engainall/Nasr1/pull/50), exact code head `3301a3806ae7ffd62064b97b5796b12b2dd0eff9`; Core CI/isolated PostgreSQL acceptance passed; authenticated browser step was BLOCKED_EXTERNAL by GHCR rate limiting before assertions.
- P1-02 candidate: PR [#44](https://github.com/Report-Engainall/Nasr1/pull/44), exact code head `365ccc7c9c8512b10b1f676cb9b73b20d54ad8e6`; Core CI [run 39904405152](https://github.com/Report-Engainall/Nasr1/actions/runs/39904405152) SUCCESS. P2 Playwright Critical Paths [run 39904405190](https://github.com/Report-Engainall/Nasr1/actions/runs/39904405190) SUCCESS, but neither run proves password-reset-specific authenticated browser behavior.
- P1-03a order-detail retry: code is in `src/components/CustomerOrders.tsx`, regression test `src/test/customer-order-detail-retry.test.tsx`, task SHA `16bfe4f96513753dc145dfec17a020f121e1f711`; Core CI [run 39905102470](https://github.com/Report-Engainall/Nasr1/actions/runs/39905102470) COMPLETED SUCCESS on that exact SHA (24/24 steps). The retry regression passed within the unit-test step; PostgreSQL 17, lint, build and smoke checks also passed.
- P1-03a browser acceptance for the actual order-detail retry button: NOT_RUN. Production proof: NOT_RUN.
- Last update: 2026-10-23
- Next task: finish source-linked reorder-template action in `src/components/CustomerOrders.tsx`, with a test and exact-head CI.

## Fixed task queue

1. P1-01: reconcile category rename already proposed in PR #50; do not build a duplicate.
2. P1-02: close password-reset route metadata/error-handling gap in PR #44 if it remains on live main.
3. P1-03: complete real client/storefront routes and actions from the original spec, in small screen groups.
4. P1-04: complete commercial-admin routes/actions: products, categories, customers, companies/members, staff/roles, prices and order UI within P1 ownership.
5. P1-05: close additional specification requirements within P1 ownership; source-ledger review only where it blocks an actual requirement.
6. P1-06: run focused regression tests and exact-head CI for P1-owned changed paths; manual browser/UAT proof stays NOT_RUN until final acceptance.

## Required update format after every task

- Timestamp:
- Task ID / status: DONE | IN_PROGRESS | BLOCKED | NOT_RUN
- Active branch / base SHA / resulting HEAD SHA:
- Root cause or exact gap:
- Changed paths:
- Tests actually run and result:
- Exact CI links and conclusions:
- Tests not run / blocker and verbatim error:
- P2 handoff or file lock, if any:
- Next task ID and first action:
- Evidence status: IMPLEMENTED / INTEGRATED / TESTED_EXACT_SHA / BROWSER_PROVEN / PRODUCTION_PROVEN (mark each independently)

## History

### Initial checkpoint
No P1 application-code work was executed by the initial documentation update. The main baseline and old PR/test reports must not be treated as proof for later heads.

### 2026-10-23 — P1-01 — CLOSED_WITH_EVIDENCE (implementation acceptance; merge pending)
- Live main SHA: `76baf9dbe7860a764abc18e75835abb8750d56a3`. Reviewed task paths and PR #50 only, not the repository wholesale.
- No additional code gap found in PR #50. The Data Center uses existing `renameAdminCatalogCategory`, awaits the server response, fails closed on malformed/mismatched responses, refetches after success, and surfaces errors. The RPC derives actor/organization server-side, limits execution to active admin/manager profiles, locks tenant/parent/name changes, rejects archived categories and active duplicates, updates only the name, and writes before/after audit values while preserving ID, parent, code and sort order.
- PR #50 files reviewed: `WORK_COORDINATION.md`, `scripts/test-admin-catalog-commands.mjs`, `src/components/AghbariApp.tsx`, `src/lib/admin-catalog-commands.ts`, three category rename tests, and `supabase/migrations/20261022200000_admin_catalog_category_rename.sql`.
- Exact-head Core CI [39836522643](https://github.com/Report-Engainall/Nasr1/actions/runs/39836522643) SUCCESS on `3301a3806ae7ffd62064b97b5796b12b2dd0eff9`. `package.json` test:db invokes the category-command PostgreSQL acceptance script.
- Authenticated browser run [39836522607](https://github.com/Report-Engainall/Nasr1/actions/runs/39836522607) was BLOCKED_EXTERNAL before browser assertions by GHCR `toomanyrequests`; not BROWSER_PROVEN. Production proof NOT_RUN.
- PR #50 remains open and unmerged. Its `WORK_COORDINATION.md` also intersects P2 PRs #40/#48; merge order requires explicit serialization. No P2-owned files were edited.
- Evidence: IMPLEMENTED=YES in PR #50; INTEGRATED=YES within candidate branch, NOT_YET_MERGED_TO_MAIN; TESTED_EXACT_SHA=YES for Core CI/isolated DB; BROWSER_PROVEN=BLOCKED_EXTERNAL; PRODUCTION_PROVEN=NOT_RUN.

### 2026-10-23 — P1-02 — CLOSED_WITH_EVIDENCE (merge pending; route-specific browser acceptance deferred)
- Live main had only `noindex` on forgot-password and lacked `nofollow`/referrer protection there; reset-password lacked both directives. PR #44 already contained route metadata and a route-security regression test, so no duplicate route or auth contract was created.
- Confirmed gap in PR #44: the reset route handled a returned Supabase error but did not catch a rejected `updateUser({ password })` promise. Added a user-facing transport failure message and `finally` cleanup for busy state while retaining the authenticated Supabase update flow. Extended `src/test/password-reset-route-security.test.ts`.
- Changed paths: `src/routes/reset-password.tsx`, `src/test/password-reset-route-security.test.ts`. No database, route tree, `src/lib/api.ts`, or P2-owned path changed.
- Exact code SHA `365ccc7c9c8512b10b1f676cb9b73b20d54ad8e6`; Core CI [39904405152](https://github.com/Report-Engainall/Nasr1/actions/runs/39904405152) SUCCESS with unit tests, PostgreSQL 17 workflow acceptance, lint, build and smoke tests. P2 Playwright [39904405190](https://github.com/Report-Engainall/Nasr1/actions/runs/39904405190) SUCCESS on the same SHA, but does not specifically prove password-reset behavior.
- PR #44 remains open/unmerged; main remains unchanged. Evidence: IMPLEMENTED=YES; INTEGRATED=YES in candidate branch only; TESTED_EXACT_SHA=YES for Core CI; BROWSER_PROVEN=NOT_RUN; PRODUCTION_PROVEN=NOT_RUN.

### 2026-10-23 — P1-03a — CLOSED_WITH_EVIDENCE (order-detail retry)
- Root cause: the order listing had retry, but the order-detail view did not expose `refetch`; a transient query failure rendered an alert with no retry button.
- Ownership check: reviewed the changed-file lists of all 24 open PRs. `src/components/CustomerOrders.tsx`, `src/routes/orders.index.tsx`, `src/routes/orders.$id.tsx`, and `src/lib/useFetch.ts` are not currently modified by an open PR. Storefront `src/components/Storefront.tsx` remains locked by open PR #12 and was not edited.
- Implementation: `src/components/CustomerOrders.tsx` now exposes an accessible retry action on order-detail query failure and calls the existing `useFetch` refetch function. New test `src/test/customer-order-detail-retry.test.tsx` simulates an initial transient error, retries, and asserts a server-backed order appears without reload.
- Exact SHA tested: `16bfe4f96513753dc145dfec17a020f121e1f711`. Core CI [39905102470](https://github.com/Report-Engainall/Nasr1/actions/runs/39905102470) COMPLETED SUCCESS, 24/24 steps, including unit tests, PostgreSQL 17, lint, build, preview/dev smoke and Chromium price-visibility acceptance. This browser acceptance is not browser proof for the order-detail retry button.
- Changed paths: `src/components/CustomerOrders.tsx`, `src/test/customer-order-detail-retry.test.tsx`. No service/RPC, migration, pricing, inventory, finance, import/export, or P2-owned path was changed.
- Evidence: IMPLEMENTED=YES; INTEGRATED=YES in P1 branch; TESTED_EXACT_SHA=YES; BROWSER_PROVEN=NOT_RUN for this component; PRODUCTION_PROVEN=NOT_RUN.

### 2026-10-23 — P1-03b — IN_PROGRESS (source-linked reorder template from order detail)
- The existing customer order-detail view has no action to preserve an order as a saved reorder template. Existing server RPC `save_reorder_template(p_name,p_lines,p_source_order_id)` already validates the current customer profile/organization, verifies that the source order belongs to the same customer and organization, and rejects inactive/unavailable products. Existing `/reorder` workspace loads saved templates and applies template items to the customer-scoped cart; its file `src/components/CustomerWorkflows.tsx` is touched by open PR #12, so this task will add its entry action only in the unowned `src/components/CustomerOrders.tsx` and reuse the existing RPC.
- Do not label this a submitted new order: it saves a source-linked template to be applied through the existing reorder workspace, and checkout still performs its own authoritative current-price/stock validation. No new backend contract will be created.
- First action: read the exact existing `save_reorder_template` server implementation and add a guarded order-detail action that sends only product IDs and approved/requested quantities, fails closed on any missing product ID or malformed RPC response, and gets a focused component test before exact-head CI.
