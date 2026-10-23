# تقرير P2 — الحالة الحية 2026-10-23T19:17:00+03:00

REPOSITORY=Report-Engainall/Nasr1
MAIN_SHA=c22ba48b2f44f4b752e3f5c5df78f0cc792b0a99; MAIN_TREE=ce3773a9c69ca2ee9acc2daa3fc759753bd4cdd9; Core run 39983210712=SUCCESS on exact current main.
PR #54 merged at afa4840c137d9da853c8486b005adb1ffd5fdd0a; PR #52 merged at c11ea018b81c6e47a9bbbc36d4d7b8f432892f8d. INV-009 is closed with local reconciliation/concurrency/audit evidence only; Onyx live target import/sync remains BLOCKED_EXTERNAL.
PR #99 / ORD-001 merged at 8e48c592d06ee8bc35b73cfe89f5f0fd51c33ec2 and has exact-tree Core/P2 plus local order/tenant Chromium evidence on its tested tree at merge. Current main later advanced with PR #88.
PR #88 central device-session UI is merged at c22ba48b2f44f4b752e3f5c5df78f0cc792b0a99. Final feature head 5021734e2beadef83fe9209aa2611b4399eafd4e; Core 39982277415/P2 39982277637 PASS; hosted customer-auth E2E was skipped.
OPS-DR-001=CLOSED_WITH_EVIDENCE for isolated PostgreSQL 17 restore only (run 39969721081/job 120468865117; backup SHA-256 59d58847641f4a66b76421477f85bd9ae06734baad419f283569d8dff27f9be1; backup 394 ms, restore 1012 ms, total 4607 ms; 23 tables/1048 rows; temporary DB removed). No production restore, RTO or RPO claim.
Open PRs: #101 P2 finance reversal, #100 P2 central docs, #97 P1 draft product submission guard, #89 P3 catalog/route fixes. P1/P3 files remain locked.
FIN-LEDGER-001 implementation: PR #101, branch p2/general-ledger-reversal-20261023, exact head 9f2407ca838dfa258257cd8535fd29e97c327c38, base c22ba48b2f44f4b752e3f5c5df78f0cc792b0a99. Seven changed paths: supabase/migrations/20261023200000_accounting_general_journal_reversal.sql; scripts/test-general-ledger-reversal.mjs; scripts/test-database-migrations.mjs; src/integrations/supabase/types.ts; src/components/GeneralJournalReversalAction.tsx; src/components/GeneralLedgerWorkspace.tsx; src/test/general-ledger-statements-ui.test.tsx. Scope is posted manual/adjustment entries only; source-linked invoice/payment/cash-expense/purchase workflows are not duplicated.
TASK_STATUS=IMPLEMENTED; exact-head acceptance pending
TESTS_RUN=Main Core 39983210712 PASS. PR #101 Core 39985455274 IN_PROGRESS; P2 Playwright 39985455240 IN_PROGRESS on exact head 9f2407ca838dfa258257cd8535fd29e97c327c38. Public UI smoke 120523317686 PASS; isolated local Supabase/PG17 acceptance 120523647680 IN_PROGRESS.
TESTS_FAILED_OR_SKIPPED=Hosted customer E2E 120523368573 SKIPPED because dedicated non-production credentials are absent; not PASS. Head 3087df8f2ca8132dfd08ab102dfbbc219db927a9 is historical and does not validate the fixed current head.
NEXT_TASK_ID=FIN-LEDGER-001-MANUAL-JOURNAL-REVERSAL-ACCEPTANCE
NEXT_ACTION=Read terminal Core/PostgreSQL17/P2 conclusions for exact head 9f2407ca838dfa258257cd8535fd29e97c327c38; address evidenced failures only, rerun final head, then merge PR #101 after mandatory checks and review pass.
UPDATED_AT=2026-10-23T19:17:00+03:00

## سجل P2 التاريخي (لا يحدد حالة التنفيذ الحالية)
