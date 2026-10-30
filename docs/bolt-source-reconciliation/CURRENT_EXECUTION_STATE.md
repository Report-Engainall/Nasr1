# CURRENT EXECUTION STATE — 2026-10-30

**Sole live resume cursor.** Read this file first, then verify the live GitHub `main` ref and exact-SHA Actions before doing work. The detailed chronology is in `docs/bolt-source-reconciliation/EXECUTION_LOG.md` and `docs/execution/NASR1_CONTINUOUS_EXECUTION_REPORT.md`; requirement definitions live in `docs/canonical/AGHBARI-REQUIREMENT-REGISTRY.md`; acceptance status lives only in `REMAINING_SCREEN_ACCEPTANCE_MATRIX_2026-10-22.csv`.

- repository: `Report-Engainall/Nasr1`
- branch: `main` only; do not create branches or PRs.
- current_main_sha: `5d3ed3c032d957e8880c600506d9949234145236` (last code-bearing main head reconciled and verified; this resume-state/matrix/log update is a documentation-only commit immediately after it. Re-read the live ref at resume.)
- last_verified_code_sha: `5d3ed3c032d957e8880c600506d9949234145236`
- state update base: `5d3ed3c032d957e8880c600506d9949234145236`; CAS required for this documentation batch.
- active_task_id: `AGH-GL-POST-STATE-001` — COMPLETE / TESTED_EXACT_SHA on current code SHA.
- next_task_id: `DLV-011` — close the remaining role × template PDF/XLSX output allowlist matrix; one next task only.
- next action: map the roles and generated output types already covered; add only the missing role/template parse assertions. For each output, inspect actual PDF/XLSX bytes or DOM before print, assert expected allowed fields, and prove unauthorized-field count is zero. Include sales/accounting/warehouse/purchasing/admin only where the existing capability contract permits the output. Keep hosted proof separate.
- owner: P2 (server/data/finance/print integration).
- reserved_files: `e2e/finance-task-print.spec.ts`; `src/test/finance-document-print.test.ts`; `src/lib/finance-document-pdf.test.ts`; `src/test/onyx-export.test.ts`; `src/test/task-print.test.ts`. Reconcile current ownership before touching any additional shared file.
- write_lease_holder: none (no active code-write reservation).
- expected_main_sha: none (acquire a new exact live SHA and CAS lease immediately before the next write).
- last actual code change: migration `supabase/migrations/20261030010000_general_journal_post_draft_only.sql` plus `scripts/test-database-migrations.mjs`; commit `5d3ed3c032d957e8880c600506d9949234145236`. The posting RPC now replays already-posted journals idempotently, but only permits new posting from `draft`; a `void`/non-draft journal returns SQLSTATE `22023` before any accounting mutation.
- earlier test correction: `9061d6d` added customer-denied journal-posting/no-side-effect acceptance; `b96b7cd` corrected the test to read RLS-protected state from the privileged fixture role. Do not repeat absent regression.

## Exact-SHA verification

All listed runs below test **the same code SHA** `5d3ed3c032d957e8880c600506d9949234145236`:

- Core [40981597874 — SUCCESS](https://github.com/Report-Engainall/Nasr1/actions/runs/40981597874): unit tests; all migrations and core PostgreSQL 17 workflows; exact-head RPC inventory generation/upload; stock, accounting, invitations, analytics, async export, import, local backup/restore; lint; build; preview smoke on port 4173; dev smoke on port 5173; Chromium price-visibility acceptance.
- Isolated PostgreSQL 17 [40981597786 — SUCCESS](https://github.com/Report-Engainall/Nasr1/actions/runs/40981597786): migrations and baseline acceptance, including journal state guard; no production database touched.
- P2 [40981598078 — SUCCESS](https://github.com/Report-Engainall/Nasr1/actions/runs/40981598078): public UI smoke and authenticated local Supabase/Chromium suite. It passed order persistence/tenant denial, return → review → warehouse receipt → credit memo, audited Onyx XLSX download, finance invoice/statement/credit-memo and task printing, customer-manager privacy/audit, and device-session revoke tests.
- One-main cleanup [40981597789 — SUCCESS](https://github.com/Report-Engainall/Nasr1/actions/runs/40981597789).
- Exact-head inventory: 330 functions, 330 matched, 0 unmatched, 174 migration files; artifact [12945281688](https://api.github.com/repos/Report-Engainall/Nasr1/actions/artifacts/12945281688/zip).

## Evidence and proof boundaries

- DLV-004: server rejects below-minimum / wrong pack-multiple quantity without order/stock side effects; authenticated local order persistence and cross-tenant denial passed.
- DLV-007: confirmed-order cancellation releases reservation once without decrementing on-hand; transfer race and batch transfer preserve stock/reservation invariants; stock-count stale snapshot/cancel and Onyx preview/apply/rollback guards passed. Overall inventory cycle remains PARTIAL.
- DLV-008: cash-expense source posting/void race, generic journal reversal idempotency/concurrency, purchase-receipt source-linked balanced draft, customer source accounting, and local return/credit-memo journey passed. Invoice/payment allocation and whole accounting cycle remain PARTIAL.
- DLV-011: print RPC access/tenant boundary and issuer/amounts passed; local browser printed invoice, statement, reversed credit memo and operational tasks; Onyx XLSX download parser checks 27 columns, actual populated columns, audit ID and absence of internal cost/margin/foreign-tier fields. Full role-by-template allowlists remain PARTIAL.
- DLV-015: inventory source-map completeness passed; semantic customer denial and void-state no-mutation tests passed for `post_general_journal_entry(uuid)`. The complete callable surface remains PARTIAL.
- Matrix contains 123 unique populated task IDs and 18 DLV groups; 0/18 are fully release-closed. Global completion percentage is NOT COMPUTABLE from current evidence.
- Branch API returned only `main`; GitHub reports `protected=false`. No protection change was attempted.

## No-repeat set

Do not rerun these accepted tests without regression or changed dependencies: customer order MOQ/pack-multiple rejection; confirmed-order reservation release; the tested stock transfer race and stock-count stale-snapshot guards; general journal customer-denial and void-state posting guard; generic reversal concurrency; purchase-receipt accounting; finance invoice/statement/reversed-credit-memo/task print browser paths; 27-column audited Onyx XLSX parse; customer-manager local privacy and device-session revoke flows; current SHA RPC inventory generation.

## External blockers / release

- Hosted customer/order/tenant Playwright remains `SKIPPED` by the external infrastructure gate; local Supabase/Chromium evidence is not hosted proof.
- Actual Onyx Pro target-version round-trip, official WhatsApp delivery receipt, live AI-provider response, production migration/deploy/rollback/restore evidence, and owner sign-off remain `BLOCKED_EXTERNAL` / `UNVERIFIED`.
- Isolated local PostgreSQL 17 backup/restore succeeded in Core; production restore is still unproven.
- release_decision: `NO-GO` for full production release.

Before every future write: fetch live `main`, inspect changed files/ownership, set `expected_main_sha` to the exact observed SHA, update only if it still matches, and never force-push/reset/rewrite published history.