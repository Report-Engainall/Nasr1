# P3 execution checkpoint — Admin navigation + AI audit + receivables guard — 2026-11-14

Repository: `Report-Engainall/Nasr1`  
Canonical branch: `main`  
PR #469 integration branch: `p1/admin-navigation-registry-20261114`  
Current PR head when this checkpoint is committed: `3aa73c371bdcbab2119ad564848df0714aee3f9c`  
Prepared P1 test optimization: `7c4c80b9391b21b9332b12074a5398e851458aa5` (included as parent of this checkpoint)  
P3 checkpoint prepared descendant: pending branch update after current PR P2 run became terminal.

No production deployment, hosted database writes, paid-provider activity, secret changes or Vercel operations.

## Completed implementation / integration

### P1 — centralized admin navigation and access matrix
- Supplemental P1 branch originally at `8c0e8822c7add9fb4513c2e7c2d8ab7a1faf6ae0` was safely fast-forwarded onto PR #469 from `22265f06023cc67c2b20c1166805eebe51d3d2a5` using `force=false` and an exact expected-head lease.
- The four P1 files are integrated:
  - `src/components/AdminAccessMatrix.tsx`
  - `src/lib/admin-access-matrix.test.ts`
  - `src/test/admin-access-matrix-ui.test.tsx`
  - `.github/workflows/p1-admin-context-verification.yml`
- `AdminAccessMatrix.tsx` now derives page labels from `ADMIN_NAV_ITEMS`; duplicate label dictionaries are removed. Tests cover all 24 Arabic labels, 24 router registrations, all role/page/operation cells, RTL/responsive rules, keyboard focus, breadcrumbs and active-page ARIA.
- PR #469 now contains main ancestry at `67153d567668bc176cb4f4d7c04acd3afccccacf` plus P1 head `8c0e8822...`, via merge commit `3aa73c371bdcbab2119ad564848df0714aee3f9c`.
- P1 workflow path filters retain current finance triggers from main while adding the three supplemental navigation-test paths to push and pull_request.
- The jsdom file-path issue was fixed using `resolve(process.cwd(), "src")`; the AI Gateway model assertions were scoped to `within(modelsPanel)` because model names appear in the saved-settings summary and in the Models tab.

### P1 — prepared test performance follow-up
- P1 run #43539885411 on exact SHA `3aa73c...`: Vitest **FAILURE** at one test only (118/119 files, 829/830 tests); the full comparison table test exceeded the default 5-second timeout because it issued repeated global DOM queries. Strict TypeScript **SUCCESS**; production build **SUCCESS**.
- Prepared commit `7c4c80b9391b21b9332b12074a5398e851458aa5` changes only `src/test/admin-access-matrix-ui.test.tsx`: it indexes row headers, column headers and `data-testid` nodes once, while retaining assertions over every registered page, operation and role; gives this heavy matrix test a 10-second ceiling.
- This optimization has not yet been tested. It is included in the ancestry of the checkpoint commit and must receive new exact-SHA P1/P2 runs after the branch update.

### P3 — AI audit rollback-only test correction
- P3 test correction was committed on main in `c469e6fdc3d855f961cf5f30fa9a92f66e053829`, changing `scripts/test-ai-prompt-governance.mjs`: a scalar JSONB fixture is read/sanitized inside a rollback-only transaction, then must be absent from the post-rollback admin query. The inside-transaction sanitation, constraint restoration, no-persisted-fixture assertion, Maker/Checker, tenant isolation, append-only audit and role checks remain.
- The scalar-safe SQL guard exists in `supabase/migrations/20261114130000_ai_gateway_audit_scalar_jsonb_guard.sql`.
- Log review of the old run #43538759372 confirms the RPC read inside the rollback transaction completed and the stale post-rollback assertion was the failure; no RPC defect was evidenced by that run.

## Exact-SHA acceptance evidence

### PR #469 — head `3aa73c371bdcbab2119ad564848df0714aee3f9c`

- P2 run [#43539885395](https://github.com/Report-Engainall/Nasr1/actions/runs/43539885395): **SUCCESS** on this exact SHA.
  - Authenticated infrastructure gate: SUCCESS.
  - Public read-only Storefront smoke: SUCCESS.
  - Local PostgreSQL 17 / authenticated Chromium job: SUCCESS.
  - Steps 21–39 passed, including receivable UUID identity / same-name separation / cross-tenant FK / accountant access / customer denial; atomic price grid; cash-expense posting and idempotency; source-linked purchase-receipt accounting restrictions; storefront review/questions isolation; authenticated order persistence and tenant denial; warehouse and purchase XLSX; checkout replay; returns and credit memo; Onyx export; financial printing; Customer Manager privacy and audit; immediate device-session revocation; AI prompt lifecycle, four-eyes, foreign-tenant isolation and append-only audit.
  - Local app/Supabase cleanup: SUCCESS; authenticated traces/report/server log artifact upload: SUCCESS; all post-job cleanup steps: SUCCESS.
  - Artifacts: `p2-local-authenticated-e2e-43539885395-3aa73c371bdcbab2119ad564848df0714aee3f9c` and `p2-public-ui-smoke-43539885395-fb17c05da35f3f9523400b3e5e02979b040a8919`.
  - External customer/order/tenant job: **SKIPPED**. Do not count as a pass or claim that external live tenant E2E was performed.
- P1 run [#43539885411](https://github.com/Report-Engainall/Nasr1/actions/runs/43539885411): **FAILURE** only in the large access-matrix test timeout (829/830 tests). Strict TypeScript and production build: **SUCCESS**. Prepared optimization above is not yet tested.
- Older P1 #43538759295 on SHA `8c0e8822...` failed on the jsdom `import.meta.url` path; fixed in `3aa73c...`.
- Older P2 #43538759372 on SHA `8c0e8822...` failed due the stale post-rollback assertion; the assertion correction is validated below on main and on PR P2 #43539885395.

### Main — SHA `67153d567668bc176cb4f4d7c04acd3afccccacf`

- P2 run [#43539360392](https://github.com/Report-Engainall/Nasr1/actions/runs/43539360392): **SUCCESS** on exact SHA.
- Local PostgreSQL 17 / authenticated Chromium job passed customer receivable identity, same-name UUID separation, tenant FK, accountant access/customer denial; atomic price grid; cash-expense posting/idempotency; source-linked purchase receipt; storefront review/questions isolation; order persistence; warehouse/purchase XLSX; checkout replay; returns/credit memo; Onyx export; finance printing; Customer Manager privacy; device-session immediate revocation; and AI lifecycle/Maker-Checker/tenant isolation/append-only audit.
- The AI harness emitted `AI_PROMPT_GOVERNANCE_ACCEPTANCE_PASS` proving the local PG17 source, maker-checker, third-party activation, append-only audit, immutable content, tenant isolation, idempotency and runtime session guard.
- Local app/Supabase teardown, proof boundary and both evidence artifact uploads: **SUCCESS**.
- External customer/order/tenant job: **SKIPPED**, not a pass.

## Independent P2 financial blocker — Issue #477

Open issue: [#477 — Posted credit memos must reduce executive customer receivables](https://github.com/Report-Engainall/Nasr1/issues/477).

Read-only review of `supabase/migrations/20261114010000_executive_receivable_customer_identity.sql` found that `fetch_executive_receivable_customer_aging()` subtracts customer payments but not posted `customer_return_credit_memos`, unlike `fetch_staff_receivables_aging`. This can overstate receivables after a posted credit memo. Current identity acceptance verifies UUID separation and access scope but does not prove credit-note deduction.

P2 must fail closed on posted credit-note invoice/customer/organization/currency mismatch; aggregate and subtract only posted compatible credits; ignore draft/reversed memos; add credit evidence; preserve customer UUID and tenant isolation. Required PostgreSQL 17 case: invoice 111.11 − payment 10.00 − posted credit 21.11 = 80.00. Include currency/source mismatch rejection, same-name UUID isolation, RLS/roles and evidence IDs. Do not call executive receivables financially reconciled while #477 remains open.

## Next execution

1. Attach the prepared P1 test optimization and this checkpoint descendant to PR #469 using `force=false` and expected head `3aa73c...` only after the P2 run above is terminal (now terminal).
2. Rerun P1 and P2 on the resulting exact branch SHA. P1 must prove the full matrix test passes; P2 must prove the same resulting SHA, including AI and device session tests. Any SKIPPED gate remains SKIPPED.
3. Keep Issue #477 assigned to P2 as a separate financial acceptance blocker; P3 does not alter its migration.
4. Keep P4 PR #475 separate until its four observability views are reconciled with the existing registry/view switcher and strict type coverage.
5. No merge to main until the new exact-SHA P1/P2 results are terminal and all PR conflicts are resolved. No production DB writes, deployment, paid providers, secrets or Vercel operations.

## Current release boundary

- PR #469 remains **OPEN / UNMERGED**.
- P2 on `3aa73c...`: **SUCCESS**, external E2E **SKIPPED**.
- P1 on `3aa73c...`: **FAILURE** from one matrix UI test timeout; TypeScript/build **SUCCESS**; optimization awaits rerun.
- P2 on main `67153d...`: **SUCCESS**, external E2E **SKIPPED**.
- Issue #477: **OPEN**; executive receivables credit-note parity remains unproven.
- Product release remains **NO-GO**.