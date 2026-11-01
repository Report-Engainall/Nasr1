# P3 Historical Branch Evidence Appendix — 2026-11-01

**Purpose:** Preserve P3 closeout details and source-refactor history that existed in the pre-synchronization P3 branch, without replacing the newer canonical `P3.md` on `main` or reintroducing stale branch state.

## 1. Source and authority boundary

- Repository: `Report-Engainall/Nasr1`.
- Current `main` reviewed for this appendix: `6cb364193285840b6d68a620d0db69eadb5d6ef1`.
- Pre-synchronization P3 source checkpoint: `9ba18bbe719b8508f6f6e5e011f9c61d6f0972fb`.
- P3 branch `P3.md` blob at that checkpoint: `5b8e0f62207c0b618905d9ccc24eb1d5bcd469db` (106,319 bytes).
- Current `main` P3.md blob: `9958ba73c67d9586d9f1a48be6aafd448e045c8d` (24,074 bytes).

The old branch P3.md contains many append-only execution snapshots, exact-SHA check records, review notes and a detailed per-finding table. Some snapshots predate later P2 merges, current source changes and the present branch synchronization. They must remain historical evidence, not be interpreted as current status. This appendix preserves the important ledger and refactor inventory without replacing the canonical main document with the old 106 KB snapshot.

## 2. Historical 98-row P3 closeout ledger

The P3 branch carries `docs/engineering/remediation/codeinspector-2026-10-31/P3_CLOSEOUT.csv` as a separate 98-row audit matrix. Its current branch blob is `875e9c520f7ef8e3b3a7cbf50371989e163638d3`.

Verified using CSV-aware parsing:
- 98 data rows and 98 unique issue IDs.
- `IN_PROGRESS`: 77.
- `OPEN`: 17.
- `NOT_APPLICABLE_DUPLICATE`: 4.
- `DONE_VERIFIED`: 0.

The four duplicate records are three repeated JS0001 occurrences at `scripts/test-ai-gateway-telemetry.mjs:116` and one repeated TS0003 occurrence at `src/components/CustomerWorkflows.finance-aging.test.tsx:78`. The ledger retains all 98 raw rows while preserving 94 unique source findings.

**Closure rule:** None of the 98 records is CodeInspector-closed. The historical scan input SHA remains unknown, so CI, source refactors and the recovered PDF cannot prove the findings disappeared from a fresh current-main analyzer run.

## 3. Historical P3 TS0003 test/spec refactor inventory

The pre-sync P3.md recorded 29 test/spec refactors. The inventory below is preserved as historical branch evidence. It does **not** assert that all 29 files are present in the current PR #351 diff or that all 29 changes should be replayed over current `main`. The current synchronization deliberately retained main's version for 31 overlapping paths pending individual source review.

1. `src/lib/intelligence/cashflow-schedule-client.test.ts`
2. `src/lib/intelligence/inventory-intelligence-client.test.ts`
3. `src/lib/intelligence/scenario-lab.test.ts`
4. `src/lib/customer-360-xlsx.test.ts`
5. `src/test/product-image-edge-handler.test.ts`
6. `src/test/quick-order-quantity-controls.test.tsx`
7. `src/test/finance-document-print-ui.test.tsx`
8. `src/test/general-ledger-statements-ui.test.tsx`
9. `src/test/customer-return-receipt-queue.test.tsx`
10. `src/test/storefront-saved-products.test.ts`
11. `src/test/auth-session-cache-boundary.test.tsx`
12. `src/test/auth-session-refresh.test.tsx`
13. `src/components/intelligence/IntelligenceWorkspace.test.tsx`
14. `src/test/admin-customer-360-display.test.tsx`
15. `src/test/device-management-session-cap.test.tsx`
16. `src/test/cash-expense-journal-linker.test.tsx`
17. `src/test/cart-checkout-route-acceptance.test.tsx`
18. `src/test/customer-activation-invitations.test.ts`
19. `src/test/customer-order-detail-route-acceptance.test.tsx`
20. `src/test/customer-workflow-tenant.test.tsx`
21. `e2e/device-session-management.spec.ts`
22. `src/test/device-management.test.tsx`
23. `src/test/customer-invoice-route-acceptance.test.tsx`
24. `src/test/customer-order-list-route-acceptance.test.tsx`
25. `src/test/customer-quotes-route-acceptance.test.tsx`
26. `src/test/customer-reorder-route-acceptance.test.tsx`
27. `src/test/admin-orders-status-transition-ui.test.tsx`
28. `src/test/customer-addresses-route-acceptance.test.tsx`
29. `src/test/storefront-discovery.test.tsx`

The pre-sync record states that the refactors extracted named fixtures/builders/query-response helpers from nested callbacks and were intended to preserve test cases, assertions, permission checks, tenant boundaries and error cases. It also records an initial scoping regression in `fillAddressFields`, corrected by passing its resolver explicitly in commit `d3a97f470fb47e3a29366da9fdc25aaa4276a791`; the initial failure and correction remain part of the audit trail.

P2 batch 10 separately addressed the P3 baseline overlap in `src/test/customer-activation-invitations-dialog.test.tsx`, integrated at main merge SHA `3312d571dbb31af3e776cd3f774ba4e725a20492`. That file is not counted as one of the 29 P3-owned refactors above.

## 4. Historical JS, Python and Service Worker evidence

The pre-sync record documented these remediation themes:
- JS0001: acceptance scripts distinguish recoverable conditions from fatal failures; expected failures are captured/asserted; cleanup failures fail the process rather than being swallowed.
- JS0007: targeted raw-console diagnostics were migrated to structured logging with redaction and bounded context.
- JS0005: Service Worker install/activate asynchronous work is attached to lifecycle-aware `waitUntil` and preserves cached offline fallback.
- PY0002/PY0003/PY0005: three archive/reconciliation tools use smaller helpers, structured exception context and traceback handling while retaining CLI, exit-code, atomic-write, restoration and no-overwrite contracts.
- The P3 follow-up introduced a fail-closed cleanup regression test: failure of `RESET ROLE` must prevent subsequent `ROLLBACK` / JWT cleanup SQL on the same connection, and the caller must close the connection.

These are historical assertions tied to their recorded source SHAs and CI runs. Current source is independently tested on the current P3 PR head; the original findings still await an authorized fresh CodeInspector scan.

## 5. Current P3 synchronization and exact-head verification

Current P3 PR: [#351](https://github.com/Report-Engainall/Nasr1/pull/351)

- Current `main`: `6cb364193285840b6d68a620d0db69eadb5d6ef1`.
- Current P3 head: `14f40db314f479b29c0ae6020c63c24ebb244be8`.
- Current diff: 67 commits ahead / 0 behind; 12 changed paths.
- Against the historical common base, 31 paths had changes on both sides. The current main versions were deliberately retained pending individual three-way reconciliation. Five other paths were already byte-identical between the old P3 head and main. The prior stale compare's 114 main-side-only paths were not reintroduced.
- The latest code-head CI was terminal: Core test/build SUCCESS (run 41332058739); local Supabase/PostgreSQL 17 and Playwright acceptance SUCCESS (41332058726); Python 3.12 tooling SUCCESS including `py_compile scripts/diagnostic_logging.py` (41332058783); JavaScript/service-worker/logger checks SUCCESS (41332058783); public UI smoke SUCCESS; P3 Gitleaks check reports no findings.
- Scope qualification: the P3 Gitleaks job uses `--no-merges --first-parent <base>^..<head>` and scanned only the PR range (26 commits). It is **not** a full-history scan. Full-history Gitleaks evidence is recorded separately on PR #350.
- Hosted customer-order/tenant E2E and CodeRabbit were SKIPPED, not PASS.
- Independent P2 approval remains outstanding. The maintainer's prior reviews are COMMENTED, not APPROVED.

**Current integration status:** P3's 98-row CSV and the 11 non-overlapping source/tooling paths are retained in PR #351. The 31 overlapping paths remain excluded from that PR diff until reviewed. The PR is not a complete P3 closeout and must not be merged on the strength of a green CI result alone.

## 6. Fresh analyzer requirement

The historical P3 baseline maps to the older 239-finding report, whose original input SHA is unknown. The user's supplemental 181-finding report is a separate artifact and also has no input SHA. Neither report can be bound to current `main` by inference.

Required closeout remains:
1. Run the authorized CodeInspector scan on a named current-main SHA.
2. Preserve raw report/export and scanner version.
3. Match each row by rule, path and source context, not historical line number alone.
4. Update `P3_CLOSEOUT.csv` only with exact-source evidence.
5. Mark `DONE_VERIFIED` only when the fresh analyzer shows the finding is absent or below the rule threshold.

No row in this appendix is marked closed.
