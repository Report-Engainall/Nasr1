# P3 execution checkpoint — Admin navigation + AI audit + receivables guard — 2026-11-14

Repository: `Report-Engainall/Nasr1`  
Canonical branch: `main`  
PR #469 branch: `p1/admin-navigation-registry-20261114`  
Latest main integrated below: `a7af54b7ed51307b94b9a4ecac6c4614c1ce3e4e`  
Prior PR integration / P2-tested head: `3aa73c371bdcbab2119ad564848df0714aee3f9c`  
P1 test optimization: `7c4c80b9391b21b9332b12074a5398e851458aa5`  
Prior checkpoint descendant: `8205d318f63592ebb6573acbcab92dedba4ddc04`  
No production deployment, hosted database writes, paid provider, secrets or Vercel activity.

## Completed implementation and integration

### P1 — central navigation and permissions matrix
- The supplemental P1 changes were safely fast-forwarded from the helper branch to PR #469 with `force=false` and expected-head checks.
- `AdminAccessMatrix.tsx` derives page labels from `ADMIN_NAV_ITEMS`; duplicate label dictionaries are removed.
- Regression coverage includes all 24 Arabic page labels, 24 TanStack route registrations, all role/page/operation matrix cells, RTL, responsive breakpoints, keyboard focus, breadcrumbs and active-page ARIA.
- P1 workflow path filters preserve the current finance-focused paths while adding the P1-owned navigation files under push and pull_request.
- P1 jsdom file-path test was corrected to resolve source files from `process.cwd()`.
- AI Gateway duplicate-text test was scoped to the active Models tab. The latest main revision `a7af54b...` contains a harmless local variable naming refinement (`modelPanel`) and is preserved in this merge.

### P1 — test performance improvement
- P1 run #43539885411 on exact SHA `3aa73c...`: Vitest failed only the full access-matrix UI test due the default 5-second timeout; 118/119 files and 829/830 tests passed. Strict TypeScript and production build both succeeded.
- Prepared commit `7c4c80b9391b21b9332b12074a5398e851458aa5` changes only `src/test/admin-access-matrix-ui.test.tsx`: it indexes row headers, column headers and `data-testid` nodes once, preserving checks over every page, operation and role; timeout for this large render is 10 seconds.
- This optimization is **not yet tested**. The next exact-SHA P1 run must prove the matrix test passes; do not infer success from the code change.

### P3 — AI audit rollback-only assertion
- Main contains the correction in `scripts/test-ai-prompt-governance.mjs` from commit `c469e6fdc3d855f961cf5f30fa9a92f66e053829`: scalar JSONB is read and sanitized inside a rollback-only transaction; after rollback the later admin query must not see that fixture.
- The scalar-safe SQL guard remains in `supabase/migrations/20261114130000_ai_gateway_audit_scalar_jsonb_guard.sql`.
- Inspection of the failing earlier log confirmed the RPC read inside the transaction succeeded; the stale post-rollback expectation caused the old failure.

## Exact-SHA acceptance evidence

### PR #469 — P2 tested head `3aa73c371bdcbab2119ad564848df0714aee3f9c`
- P2 run [#43539885395](https://github.com/Report-Engainall/Nasr1/actions/runs/43539885395): **SUCCESS** on this exact SHA.
- Authenticated infrastructure gate: SUCCESS.
- Public read-only Storefront smoke: SUCCESS.
- Local PostgreSQL 17 + authenticated Chromium: SUCCESS.
- Critical local acceptance steps 21–39 succeeded, covering customer UUID identity/same-name separation/tenant FK/accountant access/customer denial; atomic pricing; cash-expense posting/idempotency; purchase receipt accounting restrictions; product review/questions moderation and isolation; authenticated order persistence and cross-tenant denial; warehouse and purchase XLSX; checkout replay; customer returns and credit memo; Onyx export; financial printing; customer-manager privacy/audit; device-session revocation; AI lifecycle, four-eyes, tenant isolation and append-only audit.
- Local app/Supabase cleanup, proof boundary and artifact upload: SUCCESS.
- Artifacts uploaded: `p2-local-authenticated-e2e-43539885395-3aa73c371bdcbab2119ad564848df0714aee3f9c` and `p2-public-ui-smoke-43539885395-fb17c05da35f3f9523400b3e5e02979b040a8919`.
- External customer/order/tenant job: **SKIPPED**; it is not a pass and no claim of external live tenant E2E is made.

### Main — `67153d567668bc176cb4f4d7c04acd3afccccacf`
- P2 run [#43539360392](https://github.com/Report-Engainall/Nasr1/actions/runs/43539360392): **SUCCESS** on exact SHA.
- Local PostgreSQL 17/Chromium passed financial printing, customer-manager privacy and audit, device-session immediate revocation, AI prompt lifecycle, maker-checker, tenant isolation, append-only audit, proof-boundary recording, local teardown and artifact upload.
- AI test emitted `AI_PROMPT_GOVERNANCE_ACCEPTANCE_PASS`; PostgreSQL 17 source, maker-checker, third-party activation, append-only audit, immutable content, tenant isolation, idempotency and runtime session guard were proved.
- External customer/order/tenant job: **SKIPPED**, not a pass.

### P1 status on previous integrated head
- P1 run [#43539885411](https://github.com/Report-Engainall/Nasr1/actions/runs/43539885411), SHA `3aa73c...`: **FAILURE** only due the large full-matrix UI test timeout (829/830 tests). TypeScript and production build succeeded. Optimized follow-up awaits a new run.
- Earlier jsdom path failure and duplicate AI Gateway model assertion have been corrected.

## Independent P2 finance blocker — Issue #477

Open: [#477 — Posted credit memos must reduce executive customer receivables](https://github.com/Report-Engainall/Nasr1/issues/477).

Read-only comparison found `fetch_executive_receivable_customer_aging()` in `supabase/migrations/20261114010000_executive_receivable_customer_identity.sql` subtracts customer payments but not posted `customer_return_credit_memos`, unlike the existing `fetch_staff_receivables_aging` contract. It may overstate receivables after a posted credit memo. The current identity test does not verify credit-note deduction.

P2 must fail closed on posted credit-note invoice/customer/organization/currency mismatches; aggregate and subtract only posted compatible credit memos; ignore draft/reversed notes; include credit evidence; preserve customer UUID and tenant isolation. Required local PG17 arithmetic: invoice 111.11 − payment 10.00 − posted credit 21.11 = 80.00, with mismatch rejection, same-name UUID separation, permissions and RLS. Do not claim receivables financially reconciled while #477 remains open.

## Immediate next actions
1. The previous P2 run on `3aa73c...` is terminal SUCCESS; therefore the branch can now advance safely.
2. Re-run P1 and P2 after incorporating the latest main commit `a7af54b...`, the P1 matrix query optimization and this checkpoint. Bind both new runs to the exact resulting SHA.
3. P1 must prove every matrix cell remains asserted and the timed test now completes. P2 must again pass local PostgreSQL 17, Chromium, device sessions, AI audit and artifact upload. External SKIPPED remains SKIPPED.
4. Keep P2 issue #477 open as a separate financial blocker; P3 does not edit its migration.
5. Keep P4 PR #475 separate until the observability views are reconciled with the existing registry/view switcher and strict type coverage.
6. P3 may merge PR #469 only after the new exact-SHA P1/P2 results are terminal, all required checks are green and no base divergence/conflict remains. No production writes or deployment.

## Current release boundary
- PR #469 remains **OPEN / UNMERGED** pending new P1/P2 tests.
- P2 on `3aa73c...`: **SUCCESS**; external E2E **SKIPPED**.
- P1 on `3aa73c...`: **FAILURE** from one matrix UI timeout; TypeScript/build **SUCCESS**; optimization awaits exact-SHA rerun.
- P2 on main `67153d...`: **SUCCESS**; external E2E **SKIPPED**.
- Issue #477: **OPEN**, preventing financial reconciliation acceptance.
- Product release remains **NO-GO**.