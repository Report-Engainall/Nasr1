# P3 execution checkpoint — Admin navigation + AI audit + receivables guard — 2026-11-14

Repository: `Report-Engainall/Nasr1`  
Canonical branch: `main` (P3 checkpoint is carried on PR #469 until its evidence is terminal)  
P3 integration head at checkpoint update: `3aa73c371bdcbab2119ad564848df0714aee3f9c`  
Prepared follow-up (not yet attached to the branch): `7c4c80b9391b21b9332b12074a5398e851458aa5`  
No production deployment, hosted database writes, paid-provider activity or Vercel operation.

## Completed implementation / integration

### P1 — centralized admin navigation and access matrix
- Supplemental P1 branch originally at `8c0e8822c7add9fb4513c2e7c2d8ab7a1faf6ae0` was safely fast-forwarded onto PR #469 from `22265f06023cc67c2b20c1166805eebe51d3d2a5` using `force=false` and an expected-head lease.
- PR #469 now contains the four supplemental P1 files:
  - `src/components/AdminAccessMatrix.tsx`
  - `src/lib/admin-access-matrix.test.ts`
  - `src/test/admin-access-matrix-ui.test.tsx`
  - `.github/workflows/p1-admin-context-verification.yml`
- The access matrix derives its page labels from `ADMIN_NAV_ITEMS`; tests cover all 24 Arabic labels, 24 router registrations, all-role page and operation matrix cells, RTL/responsive rules, keyboard focus, breadcrumbs and active-page ARIA.
- PR branch was then advanced with a merge commit to incorporate current main `67153d567668bc176cb4f4d7c04acd3afccccacf` plus prior P1 head `8c0e8822c7add9fb4513c2e7c2d8ab7a1faf6ae0`. New PR head: `3aa73c371bdcbab2119ad564848df0714aee3f9c`.
- The P1 workflow file was merged by retaining the finance path filters introduced on main and adding the P1 navigation test paths to both push and pull_request; no stale workflow version replaced the current finance triggers.

### P3 — test-harness fixes
- Main commit `c469e6fdc3d855f961cf5f30fa9a92f66e053829` updates `scripts/test-ai-prompt-governance.mjs`: the scalar JSONB fixture is inserted and sanitized through `list_ai_gateway_audit` inside a rollback-only transaction, then rolled back. The later organization-admin query must assert the rolled-back fixture is absent. It no longer expects a deleted fixture to remain visible.
- The matching scalar-safe SQL guard already exists at `supabase/migrations/20261114130000_ai_gateway_audit_scalar_jsonb_guard.sql`; it normalizes malformed legacy scalar JSONB to an empty array for output while marking integrity false and retaining the source attempt count.
- Review of P2 run #43538759372 logs confirms the in-transaction RPC read advanced successfully and the failing assertion happened after rollback during the organization-admin read. Do not report an RPC defect from that test failure.
- `src/components/intelligence/AiGatewayOperationsPanel.test.tsx` was fixed to scope the saved-model assertions to `within(modelsPanel)`; the model identifiers are intentionally also shown in the setup summary outside that tab.

## Exact-SHA acceptance evidence

### PR #469 — head `3aa73c371bdcbab2119ad564848df0714aee3f9c`
- P1 run #43539885411: **FAILURE** in Vitest only. 118/119 files and 829/830 tests passed. The sole failure was the full access-matrix UI render test timing out at the default 5 seconds. The jsdom file-path test and AI Gateway model-tab test passed. Strict TypeScript: **SUCCESS**. Production build: **SUCCESS**.
- Prepared P1 test-only follow-up `7c4c80b9391b21b9332b12074a5398e851458aa5` changes `src/test/admin-access-matrix-ui.test.tsx` to index row headers, column headers and all data-test IDs once, preserving assertions for every role/page/operation; the test ceiling is 10 seconds. It is a descendant of `3aa73c...` and is not yet attached to PR #469 while its P2 run is active.
- P2 run #43539885395: infra gate **SUCCESS**; public read-only Storefront smoke **SUCCESS**; external customer/order/tenant job **SKIPPED**; local PostgreSQL 17/Chromium job is still running at migration application (step 17) at checkpoint update. This is **IN_PROGRESS**, not PASS.

### Prior exact-SHA runs
- P1 run #43538759295 on `8c0e8822...`: FAILURE due the old `new URL(..., import.meta.url)` source-file path under Vitest/jsdom; 820/821 tests passed, while strict TypeScript and production build passed. The path is fixed in the current PR head.
- P2 run #43538759372 on `8c0e8822...`: FAILURE at the stale post-rollback AI fixture assertion. The local PG17/Chromium steps before it passed; external customer/order/tenant E2E was **SKIPPED**. The test fix is included through current main ancestry and awaits exact-head retest.
- P1 run #43539360170 on main SHA `67153d56...`: FAILURE due non-unique global model text assertion in `AiGatewayOperationsPanel.test.tsx`; strict TypeScript and production build passed. The assertion is scoped to the Models tab in PR head `3aa73c...`.

### Main — SHA `67153d567668bc176cb4f4d7c04acd3afccccacf`
- P2 run #43539360392 is still **IN_PROGRESS** at Chromium finance document / operational task printing (step 35) at checkpoint update.
- Its local PostgreSQL 17 steps 21–34 succeeded, including customer receivable UUID identity/tenant/role checks, price-grid atomicity, cash-expense idempotency, purchase receipt accounting restrictions, storefront reviews/questions isolation, order persistence, stock/purchase XLSX, checkout replay, returns/credit memo and Onyx export. These results are specific to this SHA and do not prove missing cases not exercised by the tests.

## Independent P2 financial blocker — Issue #477

Open issue: [#477 — Posted credit memos must reduce executive customer receivables](https://github.com/Report-Engainall/Nasr1/issues/477).

Read-only review of `supabase/migrations/20261114010000_executive_receivable_customer_identity.sql` found that the new `fetch_executive_receivable_customer_aging()` subtracts payments but not posted `customer_return_credit_memos`, unlike the existing `fetch_staff_receivables_aging` contract. This can overstate open receivables after a posted credit memo. The current identity acceptance script does not cover this path.

P2 must fail closed on mismatched posted credit-note invoice/customer/organization/currency sources, aggregate and subtract only posted compatible credits, ignore draft/reversed credit notes, and include credit-note evidence. Required PG17 case: invoice 111.11 − payment 10.00 − posted credit 21.11 = open balance 80.00; include currency/source mismatch rejection, same-name UUID isolation, RLS/role and tenant tests. Do not claim finance reconciliation complete while #477 remains open.

## Next execution

1. Wait until P2 run #43539885395 on exact head `3aa73c...` is terminal; record all local PostgreSQL 17/Chromium outcomes and skipped gates.
2. Advance PR #469 from expected head `3aa73c...` to prepared descendant `7c4c80...` with `force=false` only after that P2 run is terminal. The change is a test-only performance improvement; then rerun P1 and P2 on the new exact SHA.
3. Observe main P2 run #43539360392 through its AI audit step to validate the rollback fixture correction on exact SHA `67153d...`.
4. Keep issue #477 assigned to P2 as a financial acceptance blocker; do not modify its database migration from P3.
5. Keep P4 PR #475 separate until its four read-only observability views are integrated into the existing registry/view switcher and included in strict type coverage.
6. No PR merge to main until required P1/P2 evidence is terminal and no merge conflict exists. No production DB writes, deployment, paid provider or Vercel activity.

## Current release boundary

- PR #469 remains **OPEN / UNMERGED**.
- P1 at `3aa73c...` has one test timeout; TypeScript/build passed. Optimized follow-up is prepared, not yet attached.
- P2 at `3aa73c...` remains **IN_PROGRESS**; external E2E is **SKIPPED**.
- Main P2 at `67153d...` remains **IN_PROGRESS** at financial printing.
- P2 issue #477 is **OPEN**; executive receivables are not yet proven credit-note-parity complete.
- Product release remains **NO-GO**.