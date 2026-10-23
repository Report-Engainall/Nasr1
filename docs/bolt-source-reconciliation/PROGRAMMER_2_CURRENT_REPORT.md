# تقرير P2 — الحالة الحية 2026-10-23T19:55:00+03:00

REPOSITORY=Report-Engainall/Nasr1
MAIN_SHA=15a3c10fa5f5aa29dc59f2cf732950cddaa0efcb; MAIN_TREE=539b6073bbefacd3d569d667b913748f2466ab67
PR #101 MERGED at 15a3c10fa5f5aa29dc59f2cf732950cddaa0efcb; PR head df18dd58a0f0f74a420f55d6e14c0e352af8f7b0.
Main Core run 39990714405 = SUCCESS on exact main SHA 15a3c10fa5f5aa29dc59f2cf732950cddaa0efcb.
PR-head Core 39990033594 = SUCCESS and P2 Playwright 39990033892 = SUCCESS on exact PR head df18dd58a0f0f74a420f55d6e14c0e352af8f7b0. The P2 tree hash is 539b6073bbefacd3d569d667b913748f2466ab67, matching current main's tree; however, the P2 workflow itself did not run on the exact merge commit SHA, so MAIN_P2_EXACT_SHA=NOT RUN.
CodeRabbit’s major linked-reversal-draft finding is fixed in a forward migration and covered in the PostgreSQL 17 database acceptance. Core previously caught malformed SQL dollar quoting on a6fb9b4; corrected on df18dd58a0f0f74a420f55d6e14c0e352af8f7b0, then exact-head Core/P2 passed. Review thread resolved. No claim of independent human approval.
The hosted customer-account E2E step 120539173603 was SKIPPED for missing dedicated non-production credentials; not PASS. No production writes or live external service calls.

## FIN-LEDGER-001 — integrated
- The reversal lifecycle uses the existing accounting journal: only posted manual/adjustment source entries may be reversed; draft reversal and explicit separate posting; balanced mirrored lines; tenant/role checks; audit, concurrency and idempotency protection.
- The UI retains the same idempotency key if server mutation succeeded but refresh failed. Added regression test in src/test/general-journal-reversal-action.test.tsx.
- void_general_journal_draft now rejects voiding a linked reversal draft while preserving ordinary unlinked-draft cancellation; PostgreSQL 17 acceptance verifies denial leaves the linked draft retryable.
- PR: https://github.com/Report-Engainall/Nasr1/pull/101
- Merge commit: 15a3c10fa5f5aa29dc59f2cf732950cddaa0efcb
- Exact main Core: https://github.com/Report-Engainall/Nasr1/actions/runs/39990714405 SUCCESS.
- Exact PR-head Core: https://github.com/Report-Engainall/Nasr1/actions/runs/39990033594 SUCCESS. Exact PR-head P2: https://github.com/Report-Engainall/Nasr1/actions/runs/39990033892 SUCCESS.

## NEXT_TASK_ID=FIN-INVOICE-001-SUMMARY-PAGINATION-NO-DOUBLE-COUNT
Verify with synthetic PostgreSQL 17 fixtures that fetch_general_ledger pagination limits only entry detail, while summary totals and account aggregates remain complete and do not double-count. Current implementation aggregates accounts/summary separately from the LIMIT/OFFSET detail subquery; existing DB coverage is too small to prove behavior beyond the page cap. Add a meaningful regression test before altering correct SQL.

## سجل P2 التاريخي (لا يحدد حالة التنفيذ الحالية)
