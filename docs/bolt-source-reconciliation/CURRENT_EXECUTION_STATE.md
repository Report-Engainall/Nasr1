# CURRENT EXECUTION STATE — LIVE MAIN CURSOR — 2026-10-30 — P3 COMPONENTS INTEGRATED / P2 PG17 RACE OPEN
> **Observed remote main:** `b52271629f054f5d9750e2d4dbf247e22c90f8c7` on `Report-Engainall/Nasr1:main`. Main-only branch remains in force; no local checkout was changed.
> **P3 intelligence code:** existing deterministic engines/contracts and tests remain integrated. New presentation batch is on main: `32c2fe451bb783af2a76388e9811ffb52ec28e7f` (LiquiditySummary, CashflowForecastCard, DeadStockCard, ReplenishmentCard, common state/evidence display and tests), `8ccc68aaf8ea65718b35c1fc9f5b23c54a6988ce` (accessible labels and locale-aware assertions), `b52271629f054f5d9750e2d4dbf247e22c90f8c7` (7/30/90 horizon assertion). Components are exported through `@/components/intelligence`. They keep currencies separate, null as unavailable, stock exposure outside net cash, dead-stock exposure withheld unless verified, and replenishment recommendation-only.
> **Exact Core:** [41017608436 FAILURE](https://github.com/Report-Engainall/Nasr1/actions/runs/41017608436) on exact SHA `b52271629f054f5d9750e2d4dbf247e22c90f8c7`. Unit-test phase completed successfully; PostgreSQL 17 acceptance failed at `scripts/test-database-migrations.mjs:3105`. The receipt race assertion did not observe both named authenticated sessions active waiting on locks in one sample: `ci-po-receive-a` was active on the warehouse advisory lock; `ci-po-receive-b` was still in `set_config`/transactionid wait. After gate release both RPC outcomes were successful. This is a P2-owned lock-barrier/observation test failure, not proof of duplicate receipt or corrupted inventory. Do not change/loosen P2 scripts from P3.
> **Exact P2 workflow:** [41017608501 IN_PROGRESS](https://github.com/Report-Engainall/Nasr1/actions/runs/41017608501) on `b52271629f054f5d9750e2d4dbf247e22c90f8c7`. Authenticated infrastructure and public UI smoke: SUCCESS. Local Supabase/Chromium: order persistence + cross-tenant denial SUCCESS; return/review/receipt/credit memo SUCCESS; audited Onyx XLSX export SUCCESS. Finance/task-print browser test FAILED at e2e/finance-task-print.spec.ts:69: first mobile navigation item was not focused; finance/operational-task print assertions were NOT reached. Hosted customer/order/tenant is SKIPPED, not PASS. P1 owns the AghbariApp.tsx focus fix; preserve P2 accessibility assertions.
> **Mobile menu accessibility:** P2 run [41014864616 FAILURE](https://github.com/Report-Engainall/Nasr1/actions/runs/41014864616) on code SHA 68fccf. Stable sidebar locator/label/expanded/visibility checks pass, but first navigation item focus fails at `e2e/finance-task-print.spec.ts:69`; finance/task print was not reached in that older run. P1 owns the production fix in `src/components/AghbariApp.tsx`; keep focus, Escape, return-focus and route-close assertions intact.
> **P1 integration:** intelligence workspace/route and mounting to live aggregate DTO remain pending. P1 may consume the new exported components but must not supply fixtures, zero sentinels, browser tenant/actor/role or invented totals. Keep aggregate-backed content UNAVAILABLE until P2 server DTO exists.
> **P2 integration still pending:** tenant-safe full-history aggregate service/RPC; atomic decision lifecycle persistence with idempotency/audit/no-side-effects; zero-paid free-AI enforcement and sanitized egress; actual health probes; canonical server RBAC DTO. The current PG17 concurrency harness needs deterministic session-readiness/barrier observation without weakening the dual-request lock/idempotency guarantee.
> **Acceptance:** authoritative CSV remains 143 populated task IDs / 18 DLV groups / 16 REF rows. All 16 REF rows remain `P3_IMPLEMENTED / CI_PENDING / P1_P2_PENDING`; no DLV roll-up is closed by this batch.
> **Release:** **NO-GO**. Hosted tenant path, target Onyx Pro round-trip, official WhatsApp receipt, live AI response, production deploy/migration/rollback/restore and owner sign-off remain unproven.
>
> ## Exact next commands
> 1. P2: repair the P2-owned purchase-receipt concurrency test setup at `scripts/test-database-migrations.mjs:3105`: complete both authenticated connections' identity/JWT/application_name initialization before issuing the two RPCs and observe actual blocking states reliably; preserve concurrent two-session, one canonical create/replay, one receipt, one inventory movement and audit assertions. Re-run PG17/Core on exact SHA.
> 2. P2: poll [41017608501](https://github.com/Report-Engainall/Nasr1/actions/runs/41017608501) to completion, record print results and retain hosted tenant as SKIPPED; after P1 drawer repair rerun unchanged accessibility assertions.
> 3. P1: repair first-item mobile drawer focus in `AghbariApp.tsx`, retain Escape and trigger-focus restoration, then mount typed intelligence components using only P2 server DTO and explicit unavailable states.
> 4. P2: deliver aggregate/outcome/AI/privacy/health/RBAC backend slices with PG17/no-side-effect proof; P3 integrates only tested exact-SHA patches.
>
> **P3 integration rule:** read live main immediately before each write; inspect only changed owner paths; one bounded batch per commit; CAS expected-head; `force=false`; verify resulting SHA and its own Actions.
---
# CURRENT EXECUTION STATE — 2026-10-30 — AUTHORITATIVE RESUME SNAPSHOT
> **P3 current execution cursor (2026-10-30):** live `main` = `2761904cfa661ac4fd221d9b2ff801cd970aaad8`. Exact-head Core: no Core workflow returned for this exact SHA. This status applies only to the exact SHA above; ancestor PASS results are not transferable. P3 source engines are implemented; P1 route mounting and P2 authenticated tenant aggregate/persistence remain separate acceptance dependencies. No DLV roll-up is closed.


> **P3 live cursor:** application code reviewed against main `e0915690c25f579d80bda0fcc7c41b4b92e7559a`. Exact-head Actions observed at cursor: One-main-branch cleanup #41013287453 completed/success; Aghbari Commerce checks #41013287473 in_progress/PENDING; P2 Playwright Critical Paths #41013287475 in_progress/PENDING. Do not transfer PASS from ancestor SHAs. P3 REF engines exist; all listed rows remain open for current-head CI and P1/P2 integration. This note is a cursor refresh, not a release gate.

## 1) Live repository snapshot
- Repository: `Report-Engainall/Nasr1`; remote branch: `main` only. GitHub returned no open pull requests.
- **Current code-bearing main SHA:** `a23c0b5cea98730f59093aa2f3e8f658509eddb4` (P3 evidence/decision engine batch; verify this exact SHA for code acceptance).
- P3 batch Core workflow: [41010611128 IN_PROGRESS](https://github.com/Report-Engainall/Nasr1/actions/runs/41010611128) on exact code SHA `a23c0b5cea98730f59093aa2f3e8f658509eddb4`; poll this run, do not duplicate it.
- Prior one-main cleanup: [41007817667 SUCCESS](https://github.com/Report-Engainall/Nasr1/actions/runs/41007817667) on ancestor SHA `af0d73aa50a73ebc6c86fb02977296f3e106d2e0`; it is not a check of the P3 code batch.
- Prior code/doc head `cf4418bd6bb5ea1b901663bfef3cc430ce6e049f` passed Core [41006802574](https://github.com/Report-Engainall/Nasr1/actions/runs/41006802574) and cleanup [41006802669](https://github.com/Report-Engainall/Nasr1/actions/runs/41006802669).
- P3 code commit `a23c0b5cea98730f59093aa2f3e8f658509eddb4` adds typed provenance/decision contracts, deterministic rules, focused tests and composable intelligence components. This is IMPLEMENTED / CI_PENDING until run 41010611128 completes.
- GitHub reports `main` as the only branch and no open PRs at the P3 batch integration check. Do not create remote branches/PRs, force-push, reset, or delete another programmer's work.

## 2) Exact evidence and unresolved blocker
- P1's Customer 360 source-lineage UI slice is included in main. Its Core run [41004028451 SUCCESS](https://github.com/Report-Engainall/Nasr1/actions/runs/41004028451) proves SHA `9f5d3af8e4f57bd758f3eb779cb6971be0a7d829`; do not poll or rerun that completed workflow. Current-main Core 41006802574 is also green.
- The latest P2 local Supabase/Chromium workflow [41006679265 FAILURE](https://github.com/Report-Engainall/Nasr1/actions/runs/41006679265) ran on parent SHA `63918d1af702f938353892f9fc9efd9709b9bf57`. The failing test is `e2e/finance-task-print.spec.ts:51`: Playwright's `getByRole('complementary', { name: 'القائمة الإدارية' })` cannot locate the deliberately `visibility:hidden` sidebar while the mobile drawer is closed. The DOM exposes stable `#admin-sidebar` with `aria-label="القائمة الإدارية"`. Fix the P2-owned test locator to `page.locator('#admin-sidebar')`, assert its accessible label and hidden/visible CSS states, and preserve focus/Escape/route-close checks. Do not change the production component unless a separate UI defect is reproduced.
- In that P2 workflow, authenticated-E2E infrastructure and public UI smoke passed; the local Supabase/Chromium job failed at the hidden-sidebar locator; hosted customer/order/tenant was SKIPPED because dedicated hosted credentials/approval were absent. SKIPPED is not PASS. This is a browser-test blocker, not evidence of a database authorization failure.
- The immediately following main commit `cf4418b` is documentation-only; the failing E2E file was not changed by it. P2 must re-run the P2 Playwright workflow after the locator correction on one exact new SHA.
- Acceptance remains open: DLV-001 through DLV-018 and their roll-up. DLV-002, DLV-003, DLV-010 and DLV-017 remain not globally closed. The existing CSV contains 143 unique populated task IDs, including the 16 REF-* reference-parity requirements. Keep this single CSV; do not create another matrix.
- Full production release remains **NO-GO**. No overall completion percentage is computable from partial evidence.

## 3) Active work allocation — these are the only live next tasks
- **P1 — UI/product journeys:** continue the first uncovered P1-owned acceptance leaf under DLV-002 / DLV-003, beginning with a route-level customer/admin state gap (loading, empty, error, retry or unauthorized) found in the existing focused tests and screen. Add a direct regression test and improve the real UI only where needed. The P1 Customer 360 slice already passed Core; do not repeat it or edit `e2e/**`, backend files or P3-reserved intelligence components.
- **P2 — backend/database/security/browser integration:** own DLV-017's failed P2 browser acceptance first. In `e2e/finance-task-print.spec.ts`, replace the hidden sidebar role lookup with the stable `#admin-sidebar` locator; assert `aria-label="القائمة الإدارية"`, closed `visibility:hidden`, opened `visibility:visible`, keyboard focus/Escape and return focus. Do not weaken the assertion or change the live UI merely to satisfy the test. Then rerun P2 Playwright on the exact resulting SHA. After it passes, respond to P3's secure aggregate request and continue the highest-risk OPEN P2 row from the existing CSV (tenant/security → finance/ledger → inventory/atomic orders → import/Onyx → health/backup).
- **P3 — business intelligence / integration captain:** first batch is IMPLEMENTED / CI_PENDING on `a23c0b5`. Read `docs/execution/contracts/P3_INTELLIGENCE_AGGREGATE_CONTRACT.md` for the P2 server-side aggregate/RPC request and `docs/execution/contracts/P3_INTELLIGENCE_P1_COMPONENT_CONTRACT.md` for P1's import/props contract. P3 owns `src/lib/intelligence/**` and `src/components/intelligence/**`. Only verified, complete, acceptable, lineage-backed signals can trigger decisions; unknown remains null; currency groups never combine without an approved FX source.
- W01–W10 remain parallel workstreams, not ten separate branches. P1 owns UI, P2 owns backend/data/security and `e2e/**`, P3 owns intelligence and global integration/governance.

## 4) Automatic resume / change-detection algorithm (mandatory)
1. Read only this file's first 80 lines, the role's execution command and its checkpoint. The live allocation above overrides historical task pointers below.
2. Run `git fetch origin main`, `git status --short --branch`, `git rev-parse HEAD`, `git rev-parse origin/main`, and `git worktree list --porcelain` once. Never assume a saved SHA is still HEAD.
3. Compare the saved resume SHA to `origin/main` with `git diff --name-status <saved-sha>..origin/main`. Inspect only paths changed since that SHA which intersect your ownership. If only governance/checkpoint files moved, reconcile the cursor and continue; do not rediscover the app or repeat completed inventories.
4. Inspect your own checkpoint and all listed local worktrees for uncommitted paths, local commits and in-progress tasks before editing. Preserve dirty work. Never `reset`, `clean`, force-push, discard, overwrite or stash another programmer's work.
5. Poll already-recorded workflow run IDs first. If a run is IN_PROGRESS, poll that same run. If SUCCESS, retain evidence and continue. If FAILED, open failed job logs and identify the root cause before retrying. Maximum two attempts for the same root cause, then use the safest alternative and move on.
6. Before taking a task, confirm its ID exists in the current acceptance CSV and is still OPEN/PARTIAL/BLOCKED with an executable local slice. The former pointer `AUTHZ-GL-DRAFT-STAFF-DENIAL-001` is **not present** in the current CSV; do not execute it. Existing AUTHZ GL post/void/reversal rows already have exact-SHA evidence on `5e53622`.
7. Use a separate detached worktree per programmer from the observed base SHA when available. P1/P2 commit locally and update only their own checkpoint. P3 alone owns the integration queue and remote `main`; integrate one commit at a time after ownership and duplicate-work checks, then run required checks on the merged SHA.
8. Checkpoint at least every 10 minutes and immediately after a task, commit, test failure, quota interruption or network loss. Record UTC, task ID, base/result SHA, dirty paths/local commit, run IDs, root cause, retries, blockers, cross-programmer contracts and one executable `exact_next_command`.
9. A local dirty tree or local commit is recoverable in the same workspace but is **not** remotely durable until P3 integrates it. Never claim it is on GitHub before the remote SHA confirms it.
10. If a task is externally blocked, record the exact missing dependency and continue the next independent safe task. Do not let one blocked integration stop the other workstreams.

## 5) Global ownership and truth rules
- P3 alone owns this global cursor, the existing acceptance CSV, requirement registry, execution log, master specification, protocol, reference gallery, command files and integration queue.
- P1 owns `docs/execution/P1_CHECKPOINT.md`; P2 owns `docs/execution/P2_CHECKPOINT.md`; P3 owns `docs/execution/P3_CHECKPOINT.md` and consolidates global state.
- The reference images are design/feature references only. Do not copy the other app's identity, customer data, financial figures or errors. All 84 source images remain available through seven committed contact sheets in `docs/reference-app/images/`.
- AI policy: paid spend = 0; no paid model/provider/fallback, billing method or auto-recharge. Deterministic/local logic first; official free API quota only when actually available and authorized. No account rotation or quota evasion. ChatGPT Free consumer UI is not an API. No raw PII, private price tiers, costs/margins, payment or customer financial data may be sent to external free models. When free quotas are exhausted, continue with deterministic code and label `RULE_BASED` / `MODEL_UNAVAILABLE` honestly.
- Proof labels remain distinct: IMPLEMENTED ≠ TESTED ≠ BROWSER_PROVEN ≠ HOSTED_PROVEN ≠ PRODUCTION_PROVEN. Never move a PASS from one SHA to another.
- Global release decision: **NO-GO** until REL-GATE-002 is satisfied.

**Sole live resume cursor.** Read this file first. Follow `docs/execution/CONTINUOUS_PARALLEL_EXECUTION_PROTOCOL.md`. Do not rescan the repository or regenerate the 330-RPC inventory. Detailed evidence remains in `EXECUTION_LOG.md`; acceptance remains in `REMAINING_SCREEN_ACCEPTANCE_MATRIX_2026-10-22.csv`.

## Historical batch — P2 API-OPS semantic authorization and no-side-effect proofs (verified on SHA 5e53622; do not use its old NEXT ACTION)

- Repository: `Report-Engainall/Nasr1`; branch: `main` only; no branches or PRs.
- **P2 code SHA:** `5e53622b66de3947758b14026432953560b267bb`.
- **P2 code-bearing SHA:** `5e53622b66de3947758b14026432953560b267bb`. The immediately following main movement was P1 checkpoint documentation only; this checkpoint itself is recorded in documentation-only commits.
- **Last verified database SHA:** `5e53622b66de3947758b14026432953560b267bb`.
- **PostgreSQL 17:** [41003314472 SUCCESS](https://github.com/Report-Engainall/Nasr1/actions/runs/41003314472), exact P2 code SHA above. Both `npm run test:db` baseline acceptance and focused import-finalizer tenant-scope test completed SUCCESS.
- **Core:** [41003314314 SUCCESS](https://github.com/Report-Engainall/Nasr1/actions/runs/41003314314), same exact P2 code SHA; Unit tests, migrations/Core, lint/build/smoke completed.
- **One-main cleanup:** [41003314373 SUCCESS](https://github.com/Report-Engainall/Nasr1/actions/runs/41003314373), same exact P2 code SHA.
- **P2 Playwright:** [41003314335 IN_PROGRESS](https://github.com/Report-Engainall/Nasr1/actions/runs/41003314335), same exact P2 code SHA. Authenticated-E2E infrastructure gate SUCCESS; public UI Chromium smoke SUCCESS; local Supabase/Chromium order-persistence and tenant-isolation job IN_PROGRESS; hosted customer/order/tenant test SKIPPED because dedicated hosted credentials and explicit non-production write approval are absent. SKIPPED is not a pass.
- No production DB writes, live Onyx/WhatsApp/AI calls, paid service, or secrets were used.

## Implemented and exact-SHA PostgreSQL 17 verified on 5e53622

1. **DLV-007 reorder-point denial** was already accepted on `7fe83d3`; not repeated.
2. **Import finalization approval guard:** migration `20261030010100_import_finalizer_manager_approval_guard.sql` restricts snapshot approval to active `admin/manager` roles. The prior `is_staff()` check admitted ordinary staff.
   - Same-tenant ordinary staff and customer receive `42501`; foreign-tenant caller receives opaque `P0002`.
   - Admin and manager pass the role gate and reach verified-manifest validation (`22023`); snapshots remain unchanged. Successful publication still requires a valid upload manifest.
3. **Import rollback:** same-tenant ordinary staff receives `42501`; foreign-tenant manager receives opaque `P0002`. Both denials compare the full import job, staged rows, request keys, upload sessions/chunks, snapshots, snapshot rows and audit entries byte-for-byte before/after.
4. **General-ledger posting:** same-tenant ordinary staff cannot post a balanced draft (`42501`); full entry/lines/reversal-links/audit snapshots remain identical. Admin then posts the same draft successfully.
5. **General-ledger void:** same-tenant ordinary staff cannot void a draft (`42501`); complete mutation snapshot remains identical.
6. **General-ledger reversal:** same-tenant ordinary staff cannot reverse a posted manual journal (`42501`); original/reversal entries, lines, mapping and audit snapshots remain identical.

No extra migration was needed for rollback or general-ledger post/void/reversal; their existing guards were correct and the acceptance evidence was missing.

## Resume coordination

- `active_task_id`: `API-OPS-001` — targeted semantic authorization is improved, but the historical 330/330 source mapping is not a complete semantic permission matrix.
- `next_task_id`: `AUTHZ-GL-DRAFT-STAFF-DENIAL-001`.
- `exact_next_command`: in `scripts/test-general-ledger-reversal.mjs`, create a manual draft as admin, switch to a profile whose only role is `staff`, call `create_general_journal_draft` with a new idempotency key and valid balanced payload, require SQLSTATE `42501`, and compare full accounting-entry, line, idempotency/reversal-link and audit snapshots before/after. Restore admin identity safely. Add no migration unless the guard fails. Run Core/PG17/P2 on one resulting SHA.
- P2 owns `supabase/**`, `scripts/**`, service logic and these central evidence files. P1 owns `src/components/**`, `src/routes/**`, `src/styles.css` and assigned UI tests. Do not edit P1-owned paths.
- Reserved/shared files: do not change package/lock/workflows/router root without a real dependency and separately coordinated owner.
- Retry policy: at most two attempts for the same failure/diagnosis; then isolate/fix or use a safe alternative and move on.
- External blockers: hosted customer E2E, live Onyx Pro round-trip, official WhatsApp delivery receipt, live AI provider response, production deploy/restore/rollback and owner sign-off remain `BLOCKED_EXTERNAL` or `UNVERIFIED`.
- Full production release remains `NO-GO`; no overall completion percentage is computable from partial acceptance evidence.

## Historical exact-SHA verification — code SHA eb83f6c only

All runs below test the same code SHA `eb83f6cd8824449ef3a1cbf2b5b55c823fdf517d`:

- Core [40991758166 — SUCCESS](https://github.com/Report-Engainall/Nasr1/actions/runs/40991758166): unit tests; ordered migrations and full PostgreSQL 17 semantic acceptance; DLV-011 exact finance print JSON key sets and real posted credit row in a rolled-back fixture transaction; customer-payment and quote-revocation tests; role-assignment denial/no-side-effect matrix; stock transfer/batch/reorder-point/stock-count and accounting tests; exact-head RPC inventory; backup/restore; lint; build; smoke and Chromium price visibility.
- P2 [40991758229 — SUCCESS](https://github.com/Report-Engainall/Nasr1/actions/runs/40991758229): public storefront smoke and local Supabase/Chromium authenticated order/tenant, return→credit memo, real Onyx XLSX download/parse, invoice/statement/credit-memo/task printing, customer-manager privacy/audit and immediate device-session revocation.
- Import finalizer tenant scope PostgreSQL 17 [40991758251 — SUCCESS](https://github.com/Report-Engainall/Nasr1/actions/runs/40991758251).
- One-main cleanup [40991758252 — SUCCESS](https://github.com/Report-Engainall/Nasr1/actions/runs/40991758252).
- Exact-head RPC artifact [12948614805](https://api.github.com/repos/Report-Engainall/Nasr1/actions/artifacts/12948614805/zip): 330 runtime public functions, 330/330 matched to migration/extension source, 0 unmatched, 174 migrations. Structural source mapping is not semantic security closure.

**Proof boundary:** P2 external customer/order/tenant Playwright was `SKIPPED`; local Supabase/Chromium passed. No hosted or production proof is claimed.

## Evidence and proof boundaries

- DLV-004: server rejects below-minimum / wrong pack-multiple quantity without order/stock side effects; authenticated local order persistence and cross-tenant denial passed.
- DLV-007: exact Core SHA `7fe83d3c35a2b8c5b28012c0207c3eb8e3468159` PASSes ordinary-staff reorder-point denial with SQLSTATE 42501 and byte-identical balance/on_hand/reserved/available/updated_at, full `stockKey` task and all reorder-point audit entries. Core/P2-local/PG17/cleanup succeeded on that SHA; broader stock lifecycle remains PARTIAL.
- DLV-008: historical payment/idempotency/lock proofs remain accepted on eb83f6c. DLV-008-OVERPAYMENT-ATOMIC-DENIAL-001 is TESTED_EXACT_SHA on `f6a3a9355dc25b37ca14364c0f19af8587121be7` (Core/P2/PG17/cleanup SUCCESS). DLV-008-INVOICE-PAYMENT-MULTICURRENCY-SETTLEMENT-002 is TESTED_EXACT_SHA on `f6bc9ca0ef9f47292093651b7bfcc298a5b7f518` (Core 41000407674, P2 41000407635, PG17 41000407668 and cleanup 41000407659 all SUCCESS): source-linked USD settlement, USD audit, source invoice found by existing keyset paging beyond 200-row detail cap, exact-cent statement delta (+40.25 paid/-40.25 outstanding; invoice total unchanged), YER unchanged, FX denial snapshot unchanged under SAVEPOINT and outer rollback verified. FX conversion and multi-source allocation remain PARTIAL.
- DLV-011: exact Core SHA `eb83f6cd8824449ef3a1cbf2b5b55c823fdf517d` asserts exact root/nested JSON keys for finance selector, invoice PDF, account statement and credit-memo PDF across admin/manager/accountant; the account statement contains a real source-linked posted credit row, reconciles invoice credit/outstanding/summary, then transaction rollback restores draft state. Existing staff/customer/foreign-tenant denials and UUID fallback pass. P2 local Chromium invoice, statement, reversed-credit-memo and task PDFs; real audited 27-column Onyx XLSX download/parse pass. Full role×template/export/hosted acceptance remains PARTIAL.
- DLV-015: exact Core SHA `cbbe9d02750f38e8006f501bd17adc884b70c603` PASSes ordinary-staff payment denial (`42501`) with complete invoice/customer/payment/audit snapshots unchanged byte-for-byte. Core [40996667761 SUCCESS], P2 [40996667698 SUCCESS], PG17 [40996667757 SUCCESS], cleanup [40996667712 SUCCESS]. Hosted customer/order/tenant path SKIPPED / BLOCKED_EXTERNAL; broader semantic RPC coverage remains PARTIAL.
- Matrix contains 123 unique populated task IDs and 18 DLV groups; 0/18 are fully release-closed. Global completion percentage is NOT COMPUTABLE from current evidence.
- Branch API returned only `main`; GitHub reports `protected=false`. No protection change was attempted.

## No-repeat set

- Do not repeat DLV-011 finance print RPC exact JSON allowlist checks and posted-credit statement row / rollback fixture on `eb83f6cd8824449ef3a1cbf2b5b55c823fdf517d`; do not repeat role-assignment denial/no-side-effect matrix on this SHA.
- Do not repeat DLV-007 ordinary-staff reorder-point denial on `7fe83d3`, DLV-015 ordinary-staff payment denial on `cbbe9d0`, manager reorder-point lifecycle, transfer race, stock-count stale snapshots or Onyx reconciliation absent regression. Do not repeat customer/foreign-tenant payment denial on historical `eb83f6c` or quote-response membership-revocation race,

Do not rerun these accepted tests without regression or changed dependencies: customer-payment same-tenant/foreign-tenant denial; customer quote-response membership-revocation/quote-lock race on `7fb457e832bfcf96072aa596ce437874bfc0447f`; customer order MOQ/pack-multiple rejection; confirmed-order reservation release; the tested stock transfer race and stock-count stale-snapshot guards; general journal customer-denial and void-state posting guard; generic reversal concurrency; purchase-receipt accounting; finance invoice/statement/reversed-credit-memo/task print browser paths; 27-column audited Onyx XLSX parse; customer-manager local privacy and device-session revoke flows; current SHA RPC inventory generation.

## External blockers / release

- Hosted customer/order/tenant Playwright remains `SKIPPED` on `7fb457e832bfcf96072aa596ce437874bfc0447f`; local Supabase/Chromium passed but is not hosted proof.
- Actual Onyx Pro target-version round-trip, official WhatsApp delivery receipt, live AI-provider response, production migration/deploy/rollback/restore evidence, and owner sign-off remain `BLOCKED_EXTERNAL` / `UNVERIFIED`.
- Isolated local PostgreSQL 17 backup/restore succeeded in Core; production restore is still unproven.
- release_decision: `NO-GO` for full production release.

Before every future write: fetch live `main`, inspect changed files/ownership, set `expected_main_sha` to the exact observed SHA, update only if it still matches, and never force-push/reset/rewrite published history.