# CURRENT EXECUTION STATE — 2026-10-30

**Sole live resume cursor.** Read this file first, then verify the live GitHub `main` ref and exact-SHA Actions before doing work. The detailed chronology is in `docs/bolt-source-reconciliation/EXECUTION_LOG.md` and `docs/execution/NASR1_CONTINUOUS_EXECUTION_REPORT.md`; requirement definitions live in `docs/canonical/AGHBARI-REQUIREMENT-REGISTRY.md`; acceptance status lives only in `REMAINING_SCREEN_ACCEPTANCE_MATRIX_2026-10-22.csv`.

- repository: `Report-Engainall/Nasr1`
- branch: `main` only; do not create branches or PRs.
- current_main_sha: `7fb457e832bfcf96072aa596ce437874bfc0447f` (code commit verified by Core, P2 local and cleanup; this checkpoint contains evidence documents only).
- last_verified_code_sha: `7fb457e832bfcf96072aa596ce437874bfc0447f`
- state update base: `7fb457e832bfcf96072aa596ce437874bfc0447f`; compare-and-swap required.
- active_task_id: `DLV-015-CUSTOMER-QUOTE-REVOKE-RACE-001` — COMPLETE / TESTED_EXACT_SHA on `7fb457e832bfcf96072aa596ce437874bfc0447f`. PostgreSQL 17 proved the member response waited on the quote-row lock, membership revocation committed, then response rejected with `42501`; quote status/responded_by/updated_at/audit unchanged.
- next_task_id: `DLV-011-FINANCE-PRINT-RPC-ALLOWLIST-001` — exact JSON key allowlists for finance print RPC payloads across authorized roles.
- next action: extend only `scripts/test-database-migrations.mjs` inside the existing finance print role loop. For admin, manager and accountant, assert exact sorted JSON keys (no extra keys) for finance selector root and each customer/invoice/credit_memo row; staff invoice PDF root/invoice/customer/line; account statement root/customer/invoice/payment/credit/summary/truncated; and credit-memo PDF root/memo/customer/invoice/return_request/journal/line. Reuse existing fixtures and role sessions. Preserve ordinary-staff/customer/foreign-tenant denial assertions. Do not edit P1 UI/E2E files. Change SQL only if the exact key-set regression proves a server response defect; rerun isolated PostgreSQL 17.
- owner: P2 (RPC/data contracts and PostgreSQL acceptance).
- reserved_files: `scripts/test-database-migrations.mjs` only; no SQL migration unless exact response-key evidence proves a server contract defect. Central state/matrix/log remain P2-exclusive.
- write_lease_holder: none.
- expected_main_sha: none; reread live `main` and acquire exact-SHA CAS before writing.
- last actual code change: `scripts/test-customer-quote-response-decision.mjs`; commit `7fb457e832bfcf96072aa596ce437874bfc0447f`. Added a deterministic two-session PostgreSQL 17 race: buyer response demonstrably waits on `sales_quotes FOR UPDATE`, a separate transaction commits membership status `revoked`, then response fails with SQLSTATE `42501`; quote status, responded_by, updated_at and audit count match the baseline. Test baseline records the staff pricing actor actually present. No migration changed.
- earlier test correction: `9061d6d` added customer-denied journal-posting/no-side-effect acceptance; `b96b7cd` corrected the test to read RLS-protected state from the privileged fixture role. Do not repeat absent regression.

## Exact-SHA verification

All runs below test the same code SHA `7fb457e832bfcf96072aa596ce437874bfc0447f`:

- Core [40989774771 — SUCCESS](https://github.com/Report-Engainall/Nasr1/actions/runs/40989774771): Unit tests; ordered migrations and PostgreSQL 17 workflows; customer quote decision + membership-revocation/quote-row-lock race; import snapshot contract; exact-head RPC inventory; backup/restore; lint; build; dev-server smoke; Chromium price visibility.
- P2 [40989774803 — SUCCESS](https://github.com/Report-Engainall/Nasr1/actions/runs/40989774803): public UI smoke; local Supabase/Chromium authenticated order/tenant denial, return→credit memo, audited Onyx XLSX download/parse, finance/task PDFs, customer-manager privacy/audit, device-session revocation.
- One-main cleanup [40989774726 — SUCCESS](https://github.com/Report-Engainall/Nasr1/actions/runs/40989774726).
- Exact-head RPC inventory: 330 runtime public functions, 330/330 matched, 0 unmatched, 174 migrations; artifact [12949205362](https://api.github.com/repos/Report-Engainall/Nasr1/actions/artifacts/12949205362/zip).

**Proof boundary:** P2 hosted customer/order/tenant Playwright was `SKIPPED`; local Supabase/Chromium succeeded. This is not hosted E2E or production proof.

## Evidence and proof boundaries

- DLV-004: server rejects below-minimum / wrong pack-multiple quantity without order/stock side effects; authenticated local order persistence and cross-tenant denial passed.
- DLV-007: confirmed-order cancellation releases reservation once without decrementing on-hand; transfer race and batch transfer preserve stock/reservation invariants; stock-count stale snapshot/cancel and Onyx preview/apply/rollback guards passed. Overall inventory cycle remains PARTIAL.
- DLV-008: exact code SHA `7fb457e832bfcf96072aa596ce437874bfc0447f` includes PostgreSQL 17 `record_customer_payment` denial tests: same-tenant customer `42501`, foreign-tenant manager `P0002`; both preserve invoice status/total, customer balance, payment count/sum and payment-audit count. Existing cash-expense, reversal, receipt, source-journal and return/credit-memo evidence remains valid. Full invoice/payment allocation, multi-currency settlement and statement lifecycle remain PARTIAL.
- DLV-011: exact code SHA `7fb457e832bfcf96072aa596ce437874bfc0447f` retains finance print RPC role/tenant access boundaries and issuer/amount checks; local Chromium passed invoice, statement, reversed credit memo and task PDF prints. Onyx XLSX actual download parsed with 27 columns and no internal cost/margin/foreign-tier fields. Existing UI adapter tests assert payload allowlists/private sentinels; next add exact SQL RPC response-key allowlists for admin/manager/accountant. Overall role×template PDF/XLSX acceptance remains PARTIAL.
- DLV-015: artifact [12949205362](https://api.github.com/repos/Report-Engainall/Nasr1/actions/artifacts/12949205362/zip) on code SHA `7fb457e832bfcf96072aa596ce437874bfc0447f`: 330 runtime public functions, 330/330 source-matched, 0 unmatched, 174 migrations. New quote-response race proves committed buyer membership revocation while RPC waits on quote lock yields `42501` with quote status/responded_by/timestamp/audit unchanged. Payment no-side-effect denials remain covered. Full callable RPC/Edge semantic review remains PARTIAL.
- Matrix contains 123 unique populated task IDs and 18 DLV groups; 0/18 are fully release-closed. Global completion percentage is NOT COMPUTABLE from current evidence.
- Branch API returned only `main`; GitHub reports `protected=false`. No protection change was attempted.

## No-repeat set

Do not rerun these accepted tests without regression or changed dependencies: customer-payment same-tenant/foreign-tenant denial; customer quote-response membership-revocation/quote-lock race on `7fb457e832bfcf96072aa596ce437874bfc0447f`; customer order MOQ/pack-multiple rejection; confirmed-order reservation release; the tested stock transfer race and stock-count stale-snapshot guards; general journal customer-denial and void-state posting guard; generic reversal concurrency; purchase-receipt accounting; finance invoice/statement/reversed-credit-memo/task print browser paths; 27-column audited Onyx XLSX parse; customer-manager local privacy and device-session revoke flows; current SHA RPC inventory generation.

## External blockers / release

- Hosted customer/order/tenant Playwright remains `SKIPPED` on `7fb457e832bfcf96072aa596ce437874bfc0447f`; local Supabase/Chromium passed but is not hosted proof.
- Actual Onyx Pro target-version round-trip, official WhatsApp delivery receipt, live AI-provider response, production migration/deploy/rollback/restore evidence, and owner sign-off remain `BLOCKED_EXTERNAL` / `UNVERIFIED`.
- Isolated local PostgreSQL 17 backup/restore succeeded in Core; production restore is still unproven.
- release_decision: `NO-GO` for full production release.

Before every future write: fetch live `main`, inspect changed files/ownership, set `expected_main_sha` to the exact observed SHA, update only if it still matches, and never force-push/reset/rewrite published history.