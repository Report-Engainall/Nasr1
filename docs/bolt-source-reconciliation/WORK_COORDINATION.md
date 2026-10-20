## P2 ownership and current cross-PR coordination — 20 October 2026

- PR #18 branch feat/p2-customer-return-intake-20261020; tested code SHA 05be5beb50c56e00ec9ee733b2089a259c3d0b3e. Exact-SHA CI run 39459540700: PASS (migration/DB acceptance including AI telemetry, unit tests, lint, build, preview smoke and dev smoke).
- AI task NASR1-ORIGINAL-SPEC-AI-GATEWAY-USAGE-AUDIT-009 is TESTED_EXACT_SHA=PASS. Playwright job 39459540701 was green only because Playwright runner steps were skipped at the missing-credentials gate; BROWSER_PROVEN=NOT RUN and PRODUCTION_PROVEN=NOT RUN.
- Next single live task: NASR1-ORIGINAL-SPEC-CUSTOMER-PRICE-PRIVACY-RECONCILIATION-010. Existing PR #12 head 6417e723a532b4bfd2c1a81c59ff6a78722ed721 fails exact-head CI 39438180471 because the customer visibility trigger calls auth.role() in the isolated Postgres environment. Its diff includes the P1-locked migration test harness. Do not edit scripts/test-database-migrations.mjs or P1 paths; reconcile the trigger and add independent acceptance on the P2 branch instead of weakening roles/RLS.
- No donor repository edits, archive redownload/extraction, or fingerprint recalculation. Existing P1 file ownership and branch lock remain in force.
- Active single P2 task: NASR1-ORIGINAL-SPEC-AI-GATEWAY-USAGE-AUDIT-009 on feat/p2-customer-return-intake-20261020 / PR #18. Added a migration, patched Edge Gateway telemetry, added unit and standalone DB tests, and registered the separate DB acceptance.
- P1 paths untouched: scripts/test-database-migrations.mjs, src/lib/api.ts, src/components/AghbariApp.tsx, src/routeTree.gen.ts, .github/workflows/commerce-checks.yml and P1 integration ledgers/report.
- Failed provider usage remains NULL when unobserved; request state distinguishes measured/partial/unknown and conservative estimates still protect quotas. No-provider outcomes are tenant/actor bound and idempotent. No prompts/secrets stored.
- IMPLEMENTED/INTEGRATED only until exact-head CI passes. Browser/production proof remains separate; source archives remain read-only and were not re-extracted or re-hashed.
## P2 readback — DQS calendar integrity and CSV/XLSX spreadsheet safety — 20 October 2026

- Tested application/test SHA: `c1e67c8fc006ad11f40af4547e5eb8afc34e12ae`. CI workflow **Aghbari Commerce checks** run [39452983497](https://github.com/Report-Engainall/Nasr1/actions/runs/39452983497) completed `success`; same-head evidence includes PostgreSQL 17 migrations/database acceptance and application build. Preserve this SHA association; it does not certify any later code SHA.
- `NASR1-ORIGINAL-SPEC-DQS-CSV-XLSX-HARDENING-008`: `IMPLEMENTED`, `INTEGRATED`, `TESTED_EXACT_SHA`. Added `supabase/migrations/20261020120000_dqs_calendar_date_validity.sql` rather than rewriting historical migrations. The persisted DQS now rejects impossible calendar dates and mixed separators, requires a nonblank matching key for temporal integrity, falls back to the matching key for empty required-field lists, and includes cost in numeric-consistency scoring to match the client accumulator. Client scoring uses actual month/day/leap-year validation.
- DQS acceptance mutates only its own CI import-job fixtures, verifies `2026-02-31` reduces temporal integrity and aggregate DQS, checks leap-day formats and blank matching-key behavior, then restores original row values before the existing finalization and saved Onyx-snapshot assertions. CSV adversarial tests cover `= + - @`, leading controls/whitespace and ordinary labels. XLSX string cells remain inline strings, not executable formula cells, where covered by the target export test suite.
- `BROWSER_PROVEN=NOT RUN / BLOCKED_EXTERNAL`; the separate Playwright gate records its missing dedicated non-production Supabase secrets and never claims a browser pass. `PRODUCTION_PROVEN=NOT RUN`.
- Archive fingerprints and integration decisions were reused. No donor archive was re-downloaded or re-extracted. The recorded source-tree/extraction-report discrepancy (2,329 tree entries vs 2,044 reported extracted files) remains unresolved and is not reclassified as reconciled.
- The finance print, Onyx reconciliation, task-center filter/print parity, and browser gate proofs remain separate; none is promoted to a higher proof state by this DQS run.
- **next_task_id الوحيد:** `NASR1-ORIGINAL-SPEC-AI-GATEWAY-USAGE-AUDIT-009` — inspect AI provider routing, permission enforcement, usage/audit persistence, quota/rate limiting, privacy/minimal payloads and fail-closed behavior, and verify tests against the actual schema without touching P1-locked API/workflow paths.

## P2 readback — Task-center print parity and browser-test gate — 20 October 2026

- Branch: `feat/p2-customer-return-intake-20261020`; PR #18: https://github.com/Report-Engainall/Nasr1/pull/18.
- Exact tested application-code SHA for this batch: `d9590e4b8aefed27682a14c1915e26661e31e575`. GitHub Actions [39452487876](https://github.com/Report-Engainall/Nasr1/actions/runs/39452487876) completed `SUCCESS`: frozen Bun lockfile, unit tests, PostgreSQL 17 migration/acceptance, Lint, production build, production-preview smoke (4173), and dev-server smoke (5173).
- `NASR1-ORIGINAL-SPEC-TASK-CENTER-PRINT-FILTER-PARITY-007`: `IMPLEMENTED`, `INTEGRATED`, `TESTED_EXACT_SHA`. Files changed: `src/components/TaskCenter.tsx`, `src/lib/task-print.ts`, `src/test/task-print.test.ts`. The print scope supports the exact currently displayed results (role + status + priority + assignee + date range + search), all rows allowed to the active account, or a selected allowed role. The print helper rechecks allowed roles; the print list shares the current non-role filters.
- Browser E2E suite/workflow: `IMPLEMENTED` but `BROWSER_PROVEN=NOT RUN / BLOCKED_EXTERNAL`. The exact-head run [39452487724](https://github.com/Report-Engainall/Nasr1/actions/runs/39452487724) explicitly gated execution because dedicated non-production Supabase URL/key, two users from different organizations, test phone, and the affirmative non-production-write confirmation are absent. Setup, Chromium, built app, and Playwright steps were skipped by this gate; the job's green status is a gate success, **not** a browser test pass. No test order was created and production was not touched. To unblock, follow `docs/bolt-source-reconciliation/P2_PLAYWRIGHT_E2E_SETUP.md`.
- Onyx reconciliation remains `TESTED_EXACT_SHA` at `acadfb1321166ef5246f83ddb7703ca8a9650cb6`, run [39450490958](https://github.com/Report-Engainall/Nasr1/actions/runs/39450490958); print-parity changes did not modify its database/RPC code. This database CI is not browser or production proof.
- Archive review reused existing manifest/fingerprint and source integration evidence. No donor ZIP was redownloaded, extracted, or rehashed. The source recursive-tree/extraction-report discrepancy remains unresolved evidence (2,329 tree entries versus 2,044 reported extracted files); it is not silently treated as reconciled.
- Status axes remain separate: `IMPLEMENTED` is not `INTEGRATED`; `TESTED_EXACT_SHA` is not `BROWSER_PROVEN`; `BROWSER_PROVEN` is not `PRODUCTION_PROVEN`.
- Historical next-task checkpoint (superseded after CI proof): `NASR1-ORIGINAL-SPEC-DQS-CSV-XLSX-HARDENING-008` — trace DQS scoring into persisted import/snapshot records and the user-facing flow; validate CSV/XLSX formula-injection handling and parser bounds with adversarial tests; remediate only demonstrable target-side gaps while preserving P1 ownership/locks.

## P2 readback — Onyx reconciliation CI result — 20 October 2026

- `NASR1-ORIGINAL-SPEC-ONYX-INVENTORY-RECONCILIATION-005`: `IMPLEMENTED`, `INTEGRATED`, `TESTED_EXACT_SHA`.
- Exact tested application-code SHA: `acadfb1321166ef5246f83ddb7703ca8a9650cb6`; GitHub Actions [39450490958](https://github.com/Report-Engainall/Nasr1/actions/runs/39450490958) completed `SUCCESS`. The workflow completed unit tests, isolated PostgreSQL 17 migration/acceptance, lint (repository-wide Prettier rule excluded by workflow), build, preview smoke (4173), and dev smoke (5173). The database acceptance includes role/tenant denial, unscoped source denial, reservation and stale-stock rejection, idempotency, successful apply and compensating rollback, and refusal to roll back over later movement history.
- Current PR #18 HEAD is a documentation-only successor to `acadfb1321166ef5246f83ddb7703ca8a9650cb6`; subsequent commits in this sequence only updated P2 documentation/state records and did not change application code. Read the live PR metadata for the current HEAD rather than relying on a SHA copied into this note. The workflow is verified for the exact application-code SHA above; **do not label the later documentation HEAD as CI-tested**, because the workflow did not trigger for documentation-only updates.
- `BROWSER_PROVEN = NOT RUN`; `PRODUCTION_PROVEN = NOT RUN`; no real external Onyx connection/sync is claimed.
- P2 records updated: `PROGRAMMER_2_CURRENT_REPORT.md`, `CURRENT_EXECUTION_STATE.md`, `EXECUTION_LOG.md`, `WORK_COORDINATION.md`, and `P2_MULTI_PROJECTS_TRANSFER_REVIEW_2026-10-20.md`. No P1-owned ledger/report/locked code paths changed; no main or donor repository writes.
- Next single task: `NASR1-ORIGINAL-SPEC-PLAYWRIGHT-CRITICAL-PATHS-006` — adapt the extracted Playwright critical-path suite to Nasr1's actual auth/routes and prove catalog → cart → order → refresh plus cross-organization isolation using dedicated CI credentials; absent credentials must be reported `NOT RUN/BLOCKED_EXTERNAL`, never silently skipped. Afterward continue the task-center print-all/filter parity and remaining original-spec gaps.

---

## P2 live update — NASR1-ORIGINAL-SPEC-ONYX-INVENTORY-RECONCILIATION-005 — 20 October 2026

- Scope: implemented target-native warehouse-scoped preview → apply → compensating rollback using `onyx_snapshots/onyx_snapshot_rows`, `inventory_balances`, `inventory_movements`, and audit records; donor SQL was not copied.
- Code paths: `supabase/migrations/20261020110000_onyx_inventory_reconciliation_apply_rollback.sql`, `src/lib/onyx-inventory-reconciliation.ts`, `src/components/OnyxInventoryReconciliationActions.tsx`, `src/components/OnyxSnapshotCenter.tsx`, `src/test/onyx-inventory-reconciliation.test.ts`, `scripts/test-onyx-reconciliation.mjs`; `package.json` test:db runs the PostgreSQL acceptance script.
- Guardrails in implementation: active staff tenant context; manager/admin for stock-changing commands; warehouse-scoped source evidence; rejects unscoped aggregate snapshots, duplicate/invalid item codes, nonnegative quantity violations, unknown/foreign products, reservations above target, and source/stock/movement drift; idempotency keys for preview/apply/rollback; two-pass validation before stock writes; append-only stock movements and audit; rollback denied when later stock changes exist. Table direct DML is revoked from authenticated and anonymous roles.
- `IMPLEMENTED` / `INTEGRATED`: present in P2 branch and wired into existing Onyx Snapshot Center; preview is explicitly non-mutating.
- `TESTED_EXACT_SHA`: **PENDING**. Current application commit `acadfb1321166ef5246f83ddb7703ca8a9650cb6`; workflow [39450490958](https://github.com/Report-Engainall/Nasr1/actions/runs/39450490958) is still in progress at last readback (unit tests running). Do not claim PASS until the workflow concludes successfully on the exact code SHA or a final SHA with this code unchanged and CI rerun.
- `BROWSER_PROVEN = NOT RUN`; `PRODUCTION_PROVEN = NOT RUN`; live Onyx connection/sync is not claimed.
- Source-review state: the previously listed controlled reconciliation gap is now implemented on this branch; remaining work includes real authenticated Playwright critical paths and tenant isolation, task-center print-all/filter parity, extraction-count discrepancy triage, identity/sync-evidence review, AI fallback/usage-ledger behavior, and remaining original-spec gaps.
- Do not advance the single live task pointer until the exact-SHA workflow is green. **next_task_id remains `NASR1-ORIGINAL-SPEC-ONYX-INVENTORY-RECONCILIATION-005` pending CI acceptance.** No P1-owned source ledgers/reports or locked code paths were edited; no main or donor repository writes.

---

# WORK_COORDINATION — فصل عمل المبرمجين في Nasr1

مالك الملف: المبرمج 2 فقط. هذا هو سجل التعارض الوحيد؛ كل قفل يضاف هنا ويغلق بعد تحرير المسار.

## تحديث مالك P2 — مصدر Bolt الواحد ومهمة المرتجعات (2026-10-20)

- مرجع مصدر Bolt لهذه المهمة فقط: incoming-archives/nasr1-bolt-recovery-2026-10-17/project-bolt-github-7sl6ykzz (2).zip، Git Blob SHA-1 4835a0565f799a272dfca0ff49fbc3ce0d760474، SHA-256 1a692b013da35b4cb034f5b18f8160ec66bca778bc4649bd5128abc7fccb9be1، 1,009,556 بايت؛ لا تنزيل/فتح/مقارنة أي نسخة Bolt أخرى.
- مقارنة الأرشيف المثبت مع main checkpoint e815d1e01e5190220083e0593b8b9d152fc3783a: 270 مطابقًا، 67 مختلفًا، 22 archive-only، 168 target-only. تقرير القرارات في P2_SINGLE_ARCHIVE_RECONCILIATION_2026-10-20.md ومصفوفة المسارات في P2_SINGLE_ARCHIVE_DECISION_MATRIX_2026-10-20.csv.
- فرع P2 الحالي: feat/p2-customer-return-intake-20261020. بدأت تغييرات التنفيذ من e815d1e01e5190220083e0593b8b9d152fc3783a. main الحالي عند القراءة 0303cff02ff548aad74e68372bf02991237603af؛ إضافات main الأحدث P1 منفصلة عن ملفات الكود المعدلة هنا.
- ملفات P2 قيد العمل: customer return migration + validator + customer form/history + task-center review queue + tests + PostgreSQL acceptance script + package test:db + P2 report files. لم يتغير src/lib/api.ts أو src/components/AghbariApp.tsx أو src/routeTree.gen.ts أو workflow.
- قفل تعارض PR #12: P1 يعدل scripts/test-database-migrations.mjs وAdminPages.tsx وCustomerWorkflows.tsx وStorefront.tsx وfinance-document-pdf.ts والـAPI PDF وبعض اختبارات المتجر ومهاجرة price visibility. لم تتغير هذه الملفات في فرع P2؛ أُضيفت scripts/test-customer-returns.mjs مستقلة لتجنب تعديل harness أثناء عمل P1.
- ملفات P1 المحمية غير معدلة: SOURCE_INTEGRATION_LEDGER.csv، READY_TO_REUSE_FILE_AUDIT.csv، PROGRAMMER_1_CURRENT_REPORT.md. مصدر الأرشيف read-only؛ لم تحدث تغييرات على main.
- القبول الحالي لا يزال CI_PENDING حتى تشغيل workflow على PR النهائي، ولا يُنقل PASS من SHA سابق. Live authenticated browser، production DB/migration، deployment proof غير منفذة.
- المهام التالية: NASR1-ORIGINAL-SPEC-RETURNS-RECEIPT-POSTING-002 بعد قبول intake، ثم تنفيذ إدارة التصنيفات الإدارية بعقد tenant/RPC ومسار تنقل آمن بدل نسخ كود archive القديم.


## خط الأساس المثبت
- main آخر رأس مؤكد عند إعداد البروتوكول: 0c089585d27665680dcc4ad2520dd4affc875804.
- CI مطابق لذلك الرأس: [39311791227 SUCCESS](https://github.com/Report-Engainall/Nasr1/actions/runs/39311791227).
- الأرشيفات تم التحقق منها سابقًا في [39294387493](https://github.com/Report-Engainall/Nasr1/actions/runs/39294387493). لا تنزل/تستخرج مرة ثانية.
- ميزات المصادر الثلاثة مسؤولية المبرمج 1؛ ملفات الأرشيف والمواصفة المفتوحة مسؤولية المبرمج 2.

## ملكية دائمة
| المجال/الملف | المالك | الحدود |
|---|---|---|
| SOURCE_INTEGRATION_LEDGER.csv | المبرمج 1 | المصادر الثلاثة فقط؛ لا يسجل أرشيف Bolt |
| READY_TO_REUSE_FILE_AUDIT.csv وPROGRAMMER_1_CURRENT_REPORT.md | المبرمج 1 | مصدر/بصمة/قرار/اختبار؛ لا يعدل حالة/سجل Bolt |
| ARCHIVE_MANIFEST.csv وARCHIVE_MEMBERS.csv وARCHIVE_FEATURE_INTEGRATION_2026-10-19.md | المبرمج 2 | أرشيفا Bolt؛ لا يعيد جرد الزوج كاملًا |
| PROGRAMMER_2_CURRENT_REPORT.md | المبرمج 2 | archive deltas ثم المواصفة |
| WORK_COORDINATION.md وCURRENT_EXECUTION_STATE.md وEXECUTION_LOG.md | المبرمج 2 | التنسيق والحالة المشتركة؛ الطرف الآخر يرسل إثباتًا مختصرًا له بدل التعديل |
| رسائل الإقلاع والـmaster handoff | المبرمج 2 | لا يحررها الطرفان بالتزامن |

## تعارضات معروفة — لا تعِد التحقيق
| المسار/النطاق | الحالة | الإجراء |
|---|---|---|
| PR #3 / inventory transfer batch / scripts/test-database-migrations.mjs | آخر فشل موثق في CI [39314953094](https://github.com/Report-Engainall/Nasr1/actions/runs/39314953094): permission denied على inventory_transfer_batches أثناء قراءة اختبارية تحت authenticated | ضمن نطاق المبرمج 1 لأنها ميزة من Report-Engainall/aghbari-commerce. أصلح test harness مع إبقاء direct SELECT ممنوعًا. |
| PR #2 / older inventory transfer | نسخة أقدم متداخلة مع PR #3 | المبرمج 1 يحتفظ بالفروق الفريدة فقط، ولا يدمج PR #2. |
| أي PR مفتوح يجمع كودًا من مصدر مانح مع تغييرات مواصفة أو أرشيف | ملكية محتوى لا ملكية رقم PR | صنّف التغييرات من قائمة الملفات/الـdiff مرة واحدة؛ كل مبرمج يحرر نطاقه فقط، ولا يستولي أحد على فرع الآخر. |
| الملفات المحمية: src/lib/api.ts، src/components/AghbariApp.tsx، src/routeTree.gen.ts، .github/workflows/commerce-checks.yml، scripts/test-database-migrations.mjs | تحتاج قفلًا قصيرًا عند تغييرها | المبرمج صاحب PR الذي يغيّر المسار يملكه مؤقتًا؛ الآخر يفتح request/patch هنا أو يعمل في مسار مستقل. |

## قواعد التسلسل
1. قبل لمس كود، افحص metadata للـPR/branch الحالي وملفاته المتغيرة فقط. لا تعِد جلب المصدر نفسه إذا لم يتغير blob.
2. لا main direct writes، لا reset/clean/force-push، لا تعديلات موازية للملف نفسه.
3. لا دمج PRs بالتوازي. بعد أي دمج، اقرأ main HEAD الجديد فقط، وادمج الفرع الثاني fast-forward/rebase دون إسقاط عمل الطرفين، وشغّل CI من جديد.
4. لا تعديل على سجل الطرف الآخر. صاحب الحالة المشتركة فقط يحدّث CURRENT_EXECUTION_STATE/EXECUTION_LOG؛ صاحب قرار المصادر فقط يحدّث source ledger/audit.
5. بعد أي فشل، وثق الرسالة الحرفية والـSHA/URL؛ شغّل الاختبار المرتبط قبل إعادة suite كاملة.
6. كل دور يحمل next task ID واحدًا. بعد إكمال archive tasks ينتقل المبرمج 2 تلقائيًا إلى next_task_id في المواصفة الأصلية.


## P2 live coordination update — 2026-10-19

| Work item | Live evidence | Status / owner |
|---|---|---|
| Main | 0c089585d27665680dcc4ad2520dd4affc875804 | Unchanged by P2 |
| P2 PR | https://github.com/Report-Engainall/Nasr1/pull/4; branch feature/accounting-general-ledger-20261019 | Archive decisions closed; financial statements implemented; exact-SHA CI pass |
| CI | https://github.com/Report-Engainall/Nasr1/actions/runs/39320266809; SHA 869f0909bda0524275834952f64e1ce1609e79c0 | 44/44 test files, 336/336 tests, PostgreSQL 17, lint, build, preview/dev smoke pass |
| P1 PR | https://github.com/Report-Engainall/Nasr1/pull/3; head bf31eea06d020955b0912d252087c72f98e023f5 | Open; P2 did not edit its paths, source ledger, reuse audit, workflow, migration test harness or report |
| Archive decision matrix | ARCHIVE_MEMBERS.csv blob a7a824a281ab02c65b597ffad34d672d61b7c10b at archive-decision commit | 717/717 rows decided; pending review statuses 0; prior Action 39294387493 retained |
| Next P2 task | NASR1-ORIGINAL-SPEC-ACCOUNTING-SOURCE-POSTING-004 | Must be explicit, source amount derived, idempotent, tenant-scoped and audited; no unconfigured currency conversion |

### P2 file ownership / lock
P2 owns WORK_COORDINATION.md, CURRENT_EXECUTION_STATE.md, EXECUTION_LOG.md, ARCHIVE_MANIFEST.csv, ARCHIVE_MEMBERS.csv, ARCHIVE_FEATURE_INTEGRATION_2026-10-19.md and PROGRAMMER_2_CURRENT_REPORT.md. P1/shared paths remain locked: src/lib/api.ts, src/components/AghbariApp.tsx, src/routeTree.gen.ts, .github/workflows/commerce-checks.yml, SOURCE_INTEGRATION_LEDGER.csv, READY_TO_REUSE_FILE_AUDIT.csv and P1 report. Historical mentions of the migration harness as P1-locked are superseded for PR #6: the latest P1 report says PR #3 is merged and P2 owns scripts/test-database-migrations.mjs for this source-posting batch.


## P2 live coordination update — cash-expense posting, 2026-10-19

| Item | Status / evidence | Owner |
|---|---|---|
| Exact code SHA | `df43fb05e9e8a31a8b45e40d38a94f85ff12691b`; [Actions 39321543032 SUCCESS](https://github.com/Report-Engainall/Nasr1/actions/runs/39321543032) | P2 branch / PR #4 |
| CI summary | 45/45 test files, 339/339 tests; PostgreSQL 17 migrations/repo acceptance; lint/build/preview/dev smoke | Code+CI proved; dedicated source-posting SQL flow coverage remains NOT RUN |
| Protected DB harness | P1 PR #3 is merged; the latest P1 report confirms P2 owns `scripts/test-database-migrations.mjs` for PR #6 | Released to P2 for PR #6; keep existing acceptance coverage and append focused source-posting cases |
| P1 paths and ledgers | `src/lib/api.ts`, `src/components/AghbariApp.tsx`, `src/routeTree.gen.ts`, workflow, `SOURCE_INTEGRATION_LEDGER.csv`, `READY_TO_REUSE_FILE_AUDIT.csv`, P1 report | Locked to P1; harness is excluded for PR #6 following P1's explicit ownership statement |
| Next P2 task | `NASR1-ORIGINAL-SPEC-ACCOUNTING-SOURCE-POSTING-INVOICES-PAYMENTS-006` | Extend target-native mapping to customer invoices/payments; no double count or guessed VAT/FX |


## P2 live update — source-linked invoice/payment accounting, 2026-10-20

| Item | Current evidence | Status |
|---|---|---|
| Main forward integration | main `f7cffd41cd63e16c6020fe379edf27416c5e0ce8` is the second parent of merge commit `dec9026ef5c1f2c894774f8b68933df5e2dfe01b` | Preserved both lines of history; no force push |
| Exact-head CI | [Action 39336158916](https://github.com/Report-Engainall/Nasr1/actions/runs/39336158916), SHA `dec9026ef5c1f2c894774f8b68933df5e2dfe01b` | PASS: unit, PostgreSQL 17 acceptance, lint, build, preview/dev smoke |
| PR | https://github.com/Report-Engainall/Nasr1/pull/6 | Open; new documentation head must also pass before merge |
| Harness ownership | P1 PR #3 merged; latest P1 report confirms P2 ownership in PR #6 | P2-owned for this task; P1 ledgers/report untouched |
| Live tenant/browser/production | No authenticated live-tenant or production mutation was run | NOT RUN |
| Next P2 task | `NASR1-ORIGINAL-SPEC-CUSTOMER-PRICE-VISIBILITY-007` | Inspect current price privacy, connect admin display controls to routed customer screens and test the server boundary |

## قفل P2 — استلام وفحص المرتجعات بعد الموافقة (2026-10-20)

- المالك P2؛ التنفيذ فوق رأس intake `7244ad3ab9d37bf68a3ba2acd918455520798416` في PR #18؛ نجاح CI لذلك الرأس لا يُنقل إلى الإضافة الحالية.
- ملفات العمل: `supabase/migrations/20261020060000_customer_return_receipts.sql`, `src/lib/customer-return-receipts.ts`, `src/components/CustomerReturnReceiptQueue.tsx`, `src/test/customer-return-receipts.test.ts`, وتعديلات P2 في `scripts/test-customer-returns.mjs`, `src/components/TaskCenter.tsx`، وسجلات الاستئناف/التنفيذ المملوكة لـ P2.
- حدود الملكية: لا تعديل `scripts/test-database-migrations.mjs` أو `src/lib/api.ts` أو `src/components/AghbariApp.tsx` أو `src/routeTree.gen.ts` أو workflow؛ لا تغيير لدفاتر P1 أو سجلات مصادرهم.
- الحراسة: RPCs مؤسسية ومخولة، لا DML مباشر للعميل على جداول الاستلام؛ مخزن نشط في المؤسسة؛ تحقق من request/line ownership والكمية المتبقية؛ fingerprint + advisory lock يمنع تكرار الإيصال؛ فقط الكمية الصالحة تحرك الرصيد، والتالف محفوظ في سجل الاستلام.
- CI لهذا الرأس: PENDING إلى أن تؤكد Actions على SHA النهائي. لا دمج قبل نجاح CI المطابق.

## P2 work closure checkpoint — returns + credit memo (2026-10-20)

- Evidence SHA: `9758e0b2961b1383b78f2ecf94f75e53e184e17f`; exact-head [CI Run 39366508410 PASS](https://github.com/Report-Engainall/Nasr1/actions/runs/39366508410). Branch `feat/p2-customer-return-intake-20261020`, PR #18 stays OPEN.
- Receipt workflow and source-linked credit memo/ledger draft/post flow passed unit tests, isolated PostgreSQL 17 migration/acceptance, lint, build, preview smoke, and dev smoke.
- This evidence applies only to this exact SHA and CI workflow. It does not prove browser E2E with a signed-in user, production DB migration, or deployment.
- P2 ownership only. No main write and no edits to P1 protected evidence files. The test migration harness stays P1-owned; return acceptance additions remain in `scripts/test-customer-returns.mjs`.
- Next lock/owner task: `NASR1-ORIGINAL-SPEC-ROLE-BASED-PRINTING-004`. Review invoices/statements/credit memos against role/tenant permissions; then continue the remaining canonical spec gaps. Do not call the overall app complete.


## تنسيق P2 — مراجعة NASR-MULTI-PROJECTS-TRANSFER (2026-10-20)
- مالك النطاق: P2. الوثيقة التفصيلية: docs/bolt-source-reconciliation/P2_MULTI_PROJECTS_TRANSFER_REVIEW_2026-10-20.md؛ أمر القبول: docs/bolt-source-reconciliation/P2_ADDITIONAL_ACCEPTANCE_MANDATE_2026-10-20.md.
- مصدر إضافي للقراءة فقط، مستقل عن أرشيف استعادة Bolt المعتمد: Report-Engainall/NASR-MULTI-PROJECTS-TRANSFER. لا تعدل المصدر ولا تعِد استخراج ZIPs. مبرمج 1 يظل مالك المستودعات الثلاثة وسجلاتها.
- تباين الملفات: extraction report=2,044، tracked blobs داخل EXTRACTED_PROJECTS=2,011، الفرق=33 ويحتاج تسوية قبل الادعاء بأن كل عضو ظاهر؛ زوج 7wyze9ut لهما SHA256 متطابق و35/35 ملفًا متتبعًا متطابقًا.
- قفل وظيفي: Nasr1/src/components/OnyxSnapshotCenter.tsx يعرض حاليًا مقارنة تحليلية فقط؛ SQL المانح 20260909005534_inventory_reconciliation_controlled_apply_rollback.sql يستخدم schema مختلفًا فلا ينسخ. لا تعدل مخزونًا حيًا دون preview freshness lock + reserved quantity guards + atomic movement/audit + compensating rollback checks.
- تعديل صغير تمت إضافته على فرع PR #18: src/lib/unified-import.ts وsrc/test/unified-import-safety.test.ts لتطبيع Unicode/التشكيل/التطويل وتعريف aliases إضافية. آخر اختبار/CI بعد الحفظ الأخير لم يثبت بعد؛ الحالة PENDING حتى ينجح workflow على HEAD نفسه.
- PR #12 (خصوصية السعر) ما زال غير مدمج، وعليه Action 39339667293 failure على SHA b3daf67de14c935fdafb0c2bf06c2f02e6be6ec5. لا تعتبره مثبتًا ولا تكرر الميزة؛ افحص job logs وأصلح الاختبار/السبب الحقيقي.
- لا تتغير ملكية P1 ولا ملفاته. لا تكتب إلى main. next_task_id الوحيد في P2 يبقى NASR1-ORIGINAL-SPEC-ROLE-BASED-PRINTING-004 إلى أن يغلق بدليل.


## تحديث P2 — نتائج CI وتثبيت سبب فشل PR #12 (20 أكتوبر 2026)
- تحسين normalizeHeader في src/lib/unified-import.ts مع اختبارات src/test/unified-import-safety.test.ts: PASS على SHA 49fa336b6a04db3d3272ac78d78cc17b89bc7a89، [Action 39437730603](https://github.com/Report-Engainall/Nasr1/actions/runs/39437730603) SUCCESS. لا يثبت browser أو production.
- فشل PR #12 السابق [39339667293](https://github.com/Report-Engainall/Nasr1/actions/runs/39339667293) تشخّص من log: خطأ SQL syntax في customer apostrophe ضمن COMMENT بالمهاجرة 20261020040000_customer_price_visibility_controls.sql. أصلحنا customer\\'s إلى customer''s بالـcommit 6417e723a532b4bfd2c1a81c59ff6a78722ed721. CI المخصص لهذا الرأس [39438180471](https://github.com/Report-Engainall/Nasr1/actions/runs/39438180471) كان IN_PROGRESS عند آخر قراءة؛ لا merge أو PASS قبل نتيجته.
- أحدث رأس وثائق P2 سابقًا e7867d548bea5ee8529cdb8001f290b79da6c939 كان له Action 39438007926 IN_PROGRESS؛ تُعاد قراءة HEAD/CI بعد هذا التحديث.
- الملكية لا تتغير: P2 يملك PR #18/12 وملفاته المحددة، P1 يملك donor integration ledgers. next_task_id الوحيد يظل NASR1-ORIGINAL-SPEC-ROLE-BASED-PRINTING-004 إلى أن يُغلق بأدلة.


## P2 current lock / acceptance — role-based finance printing (2026-10-20)

- P2 changed only `supabase/migrations/20261020100000_staff_finance_document_print.sql`, `src/lib/finance-document-print.ts`, `src/components/FinanceDocumentPrintActions.tsx`, related new tests, `src/components/GeneralLedgerWorkspace.tsx`, and P2-owned `scripts/test-customer-returns.mjs` / P2 execution records.
- The P2 UI integration is in GeneralLedgerWorkspace. P1 customer-facing components and APIs remain unmodified: `src/components/CustomerWorkflows.tsx`, `src/lib/finance-document-pdf.ts`, `src/routes/api.invoice-pdf.$invoiceId.ts`, `src/routes/api.statement-pdf.ts`, `src/lib/api.ts`, `src/routeTree.gen.ts`, and P1 ledgers/report.
- Exact code head `fb8390e9a4693f1d28247bab8fcb308408845284`; [Action 39443178771 SUCCESS](https://github.com/Report-Engainall/Nasr1/actions/runs/39443178771). Unit, isolated PostgreSQL 17 migrations/acceptance, lint, build, preview and dev smoke passed on that SHA.
- `BROWSER_PROVEN=NOT RUN`; `PRODUCTION_PROVEN=NOT RUN`. No permissions were weakened; financial role is required on the same active profile and organization is server-derived.
- Continue with the only live `next_task_id`: `NASR1-ORIGINAL-SPEC-ONYX-INVENTORY-RECONCILIATION-005`. The next P2 area is Onyx inventory reconciliation apply/rollback; P1 donor source integrations and their ledgers remain read-only/owned by P1.

### P2 coordination note
The task-print patch touched only `src/components/TaskCenter.tsx`, `src/lib/task-print.ts`, and `src/test/task-print.test.ts`. P1-owned code and ledgers remain untouched: `src/lib/api.ts`, `src/components/AghbariApp.tsx`, `src/routeTree.gen.ts`, `.github/workflows/commerce-checks.yml`, `SOURCE_INTEGRATION_LEDGER.csv`, `READY_TO_REUSE_FILE_AUDIT.csv`, and P1's report. The Playwright gate was added in separate new P2-owned files; its browser run remains explicitly blocked on external test credentials.


## P2/P1 cross-PR handoff — price privacy accepted, protected harness review required — 20 October 2026

- P2 price-privacy work has exact-SHA CI PASS on PR #12 head `be595fc74b8bbf64b308b84210d86a9aa1d464b8`, Action [39463202326](https://github.com/Report-Engainall/Nasr1/actions/runs/39463202326). That proves the current migration, stand-alone PostgreSQL acceptance, unit/lint/build and HTTP smoke only; Browser and Production remain NOT RUN.
- P2 did not modify `scripts/test-database-migrations.mjs` in this reconciliation. A previous, already-existing PR #12 diff includes that file, which this coordination record lists as P1-owned/locked for the customer-price privacy task. **P1 action requested:** review the historical diff and either remove/restore it in a P1-controlled edit or explicitly release ownership of that path in WORK_COORDINATION before PR #12 is merged. P2 will not edit the protected harness, suppress its tests, or widen grants/RLS to make acceptance pass.
- The dedicated P2 test `scripts/test-customer-price-visibility.mjs` is wired into `test:db` and prints a price-privacy PASS from isolated PostgreSQL 17. The run retains prior failed Actions as root-cause evidence. PR #12 remains OPEN and not merged.
- Continue P2-only work on this PR #18 branch; do not write `main`, donor repositories, P1 ledgers, `src/lib/api.ts`, `src/components/AghbariApp.tsx`, `src/routeTree.gen.ts`, or `.github/workflows/commerce-checks.yml`.
- Single current task pointer after acceptance of task #010: `NASR1-ORIGINAL-SPEC-IDENTITY-AND-ONYX-SYNC-EVIDENCE-011`. Identity/sync inspection must distinguish saved snapshots from confirmed live Onyx API sync; no production or browser claim may be inferred from CI smoke tests.


## P2/P1 shared-path coordination — customer activation — 2026-10-20 20:42 +03

- Live coordination check: P2 PR #18 is open on `feat/p2-customer-return-intake-20261020`, head `f11f412afd6799aa1809deedcbe434abbcc598b0`. P1 PR #26 is open/draft; its changed-file list includes the activation dialog/page/service/migration/tests and P1-owned report/ledger/audit, but does not include `src/components/AghbariApp.tsx`, `src/routeTree.gen.ts`, or `scripts/test-database-migrations.mjs`. P1's PR description explicitly requests P2 integration of those three shared paths.
- P2 will own edits to the three requested paths on PR #18 only; P1 must not edit them in parallel. P2 will not edit `PROGRAMMER_1_CURRENT_REPORT.md`, `SOURCE_INTEGRATION_LEDGER.csv`, or `READY_TO_REUSE_FILE_AUDIT.csv`. Keep RLS/direct-table revokes unchanged.
- Current P2 blocker to clear first: dialog wiring, generator-backed route registration, and actual PostgreSQL/RLS acceptance must be integrated and tested on one exact final SHA before P1 can close PR #26. A green workflow status alone is not browser proof; missing external E2E secrets remain NOT RUN/BLOCKED_EXTERNAL.


## P2 activation closure + P1 handoff — exact-SHA evidence — 2026-10-20

- P2 activation integration tested at `316f02e7235cd1369ff9366b21c05d85d1c87e2c`; [CI 39472690016 SUCCESS](https://github.com/Report-Engainall/Nasr1/actions/runs/39472690016). Unit tests 66/66 files, PostgreSQL 17 migrations/acceptance including activation security, lint, build, preview smoke 4173 and dev smoke 5173 passed. Playwright actual test steps are `NOT RUN / BLOCKED_EXTERNAL` under workflow 39472690030; production remains `NOT RUN`.
- Current P2 changes close the three requested shared paths: `src/components/AghbariApp.tsx`, `src/routeTree.gen.ts`, `scripts/test-database-migrations.mjs`. The target-native dialog is integrated into the approved customer table, route `/customer/activate/$token` is registered, and dedicated PostgreSQL acceptance verifies Auth-row email confirmation, tenant/staff/email/token/expiry/replay/revocation guards, hash-only bearer storage, audit, and direct table DML denial for both anon and authenticated.
- No RLS or direct table grants were widened. `setIdentity()` no longer fabricates `email_confirmed_at` in the JWT; any remaining confirmation-claim helper is localized to legacy customer-company membership tests, which exercise a distinct RPC contract.
- P1 handoff posted to [PR #26](https://github.com/Report-Engainall/Nasr1/pull/26), comment ID `6297892775`. Important integration hazard: P1's prior `20261020110000_customer_activation_invitations.sql` collides by migration version with P2's `20261020110000_onyx_inventory_reconciliation_apply_rollback.sql`. The tested P2 activation migration uses version `20261020140000`; do not merge duplicate migration versions. Reconcile P1's PR with this tested implementation/version before any merge.
- PR #18 stays open; no direct main write and no parallel PR merges. P1-owned `PROGRAMMER_1_CURRENT_REPORT.md`, `SOURCE_INTEGRATION_LEDGER.csv`, and `READY_TO_REUSE_FILE_AUDIT.csv` remain outside P2 edits. Do not edit P1's report/sources.
- Earlier failures remain in the execution log: duplicate SQL function/audit sections in an early P2 draft due to JS replacement-string expansion; DB script duplicate `accepted` identifier; legacy company-invitation fixtures that relied on the old JWT confirmation claim. Each was corrected and the exact SHA above passed. These records are not to be deleted.
- **Single next task after activation closure:** `NASR1-ORIGINAL-SPEC-IDENTITY-AND-ONYX-SYNC-EVIDENCE-011`. P2 now moves to this pointer; no other active P2 task runs in parallel. The 2,329 vs 2,044 archive source-count discrepancy remains unresolved evidence.

## P2 current result and ownership lock — Onyx provenance repair — 2026-10-20 21:30 +03

- Activation shared-path work completed before resuming the single pointer NASR1-ORIGINAL-SPEC-IDENTITY-AND-ONYX-SYNC-EVIDENCE-011. The whole acceptance suite passed on code SHA efcf786c9103d6ec4000773423150020d091a9aa via [Actions 39475081683](https://github.com/Report-Engainall/Nasr1/actions/runs/39475081683).
- Onyx root failure [39474066438](https://github.com/Report-Engainall/Nasr1/actions/runs/39474066438): import_jobs has no updated_at. RPC now yields NULL for unknown update time and does not treat the import-job ID as an external source-record ID. PostgreSQL 17 Onyx acceptance passed. RLS/direct grants were not widened.
- Exact-SHA CI passed 68/68 unit files, 475/475 tests, PostgreSQL 17 migrations/core/activation/returns/Onyx acceptance, lint, build, preview smoke 4173 and dev smoke 5173. [Playwright 39475081580](https://github.com/Report-Engainall/Nasr1/actions/runs/39475081580) skipped the actual browser work under its external-infrastructure gate, so BROWSER_PROVEN=NOT RUN / BLOCKED_EXTERNAL; production remains NOT RUN.
- P1 handoff refresh is PR #26 comment 6298231018. PR #26 remains draft and migration 20261020110000_customer_activation_invitations.sql conflicts with P2 migration 20261020110000_onyx_inventory_reconciliation_apply_rollback.sql. Resolve version/content before merge; do not merge PRs concurrently.
- P2 did not edit PROGRAMMER_1_CURRENT_REPORT.md, SOURCE_INTEGRATION_LEDGER.csv, READY_TO_REUSE_FILE_AUDIT.csv, or donor repositories. Existing ownership lock on AghbariApp.tsx, routeTree.gen.ts and scripts/test-database-migrations.mjs stands; they are not the current Onyx batch edit targets.
- Keep 2,329 vs 2,044 as an unresolved archive-count discrepancy; do not redownload/extract/recalculate fingerprints.
- Exactly one task is active: NASR1-ORIGINAL-SPEC-IDENTITY-AND-ONYX-SYNC-EVIDENCE-011. Next bounded action: trace source IDs/provenance through imports, inventory, reporting and financial documents. No parallel task pointer.


## P2 live checkpoint — activation acceptance and report-level Onyx provenance — 2026-10-20

- Rechecked PR #18 live at `0c817109eb630e8c3870e533fef5fcb1766881be` and current `main` at `ccbc82ffe36d52beb7e9fe1ab1cb17f4de358f21`. P2 remains the only writer on branch `feat/p2-customer-return-intake-20261020`; do not write `main`. PR #18's base field still reports `c3fa1c52bd9c34d111e484b407d5eea2c2cefc07`; base/rebase work was intentionally not attempted while the P1/P2 migration collision remains unresolved.
- Shared-path coordination: P1 PR #26 changed-file list does not overlap the current report-provenance batch (`src/components/UnifiedOnyxAnalysisPanel.tsx`, `src/test/UnifiedOnyxAnalysisPanel.test.tsx`). This batch also did not touch the P2-owned shared paths `src/components/AghbariApp.tsx`, `src/routeTree.gen.ts`, or `scripts/test-database-migrations.mjs`. PR #27 touches `src/components/ExecutiveStoreAnalytics.tsx`, `src/lib/sales-forecast.ts`, `src/test/sales-forecast.test.ts`, not these files. PR #12 still has a historical change to `scripts/test-database-migrations.mjs`; that ownership overlap must be reconciled before any overlapping PR is merged.
- P1 activation handoff posted with tested exact SHA and PostgreSQL evidence at [PR #26 comment 6298705621](https://github.com/Report-Engainall/Nasr1/pull/26#issuecomment-6298705621). Do not merge PR #18 and #26 concurrently or merge both migration files with version `20261020110000`: P1 `customer_activation_invitations` vs P2 `onyx_inventory_reconciliation_apply_rollback`. P1-owned report/ledger/reuse-audit and all donor repositories remain unmodified.
- Report-level Onyx provenance is now rendered via the existing DB-backed evidence RPC from the selected snapshot in the actual Reports view. Exact code/test HEAD `0c817109eb630e8c3870e533fef5fcb1766881be` passed [Action 39478994572](https://github.com/Report-Engainall/Nasr1/actions/runs/39478994572), including 68/68 unit test files and PostgreSQL 17/RLS. Playwright gates skipped actual browser execution; production remains NOT RUN. Prior failed selector runs remain recorded, and no access rules were weakened.
- Do not reopen archive extraction work or treat 2,329 vs 2,044 as proof of lost files. Exactly one active task remains `NASR1-ORIGINAL-SPEC-IDENTITY-AND-ONYX-SYNC-EVIDENCE-011`; next bounded trace is the source/export/finance-document path.


## P2 live checkpoint — Onyx evidence CSV export + finance issuer identity — 2026-10-20

- P2 was the only writer for these four checkpoint docs; latest concurrent code/test commit sequence ending in 3fb70618eabd9f93d67f734987a1f196ca4c9084 was read back before changing only P2-owned docs. This update does not touch P1-owned report/ledgers/reuse audit or donor repos. Shared paths AghbariApp.tsx, routeTree.gen.ts, and scripts/test-database-migrations.mjs were not changed by the current CSV/issuer sub-batches.
- New CSV source-evidence export/test files are on the same P2 branch. They are based on the existing same-tenant evidence RPC and explicitly preserve “snapshot/import record” separately from “live connection/sync”. Full browser test remains BLOCKED_EXTERNAL despite workflow-level success.
- Do not merge PR #18 with PR #26 in parallel. Migration timestamp collision and archive count mismatch remain unresolved. Only active pointer: NASR1-ORIGINAL-SPEC-IDENTITY-AND-ONYX-SYNC-EVIDENCE-011; bounded next work is outbound export tenant/source identity, then policy-backed finance role and amount-visibility tests.


## P2 live checkpoint — Onyx source evidence CSV export and exact-SHA verification — 2026-10-20

- Target: `Report-Engainall/Nasr1`, branch `feat/p2-customer-return-intake-20261020`, PR #18. Code/test SHA: `3fb70618eabd9f93d67f734987a1f196ca4c9084`; base reference: `c3fa1c52bd9c34d111e484b407d5eea2c2cefc07`.
- Exact-SHA CI PASS: [Aghbari Commerce checks 39481288019](https://github.com/Report-Engainall/Nasr1/actions/runs/39481288019). Confirmed 69/69 unit-test files passed (including the new Onyx CSV formatter and browser download tests); isolated PostgreSQL 17 migrations/workflow acceptance passed; lint passed with 0 errors (11 warnings); build passed; production-preview smoke on 4173 and dev smoke on 5173 passed.
- Implemented/integrated `src/lib/onyx-source-evidence-export.ts` and a download control in `src/components/OnyxSnapshotSourceEvidencePanel.tsx`. CSV is rendered only from the existing tenant-scoped `get_onyx_snapshot_source_evidence` RPC response; it exports the database organization identity, snapshot/import linkage and SHA-256 hashes, bounded external-ID samples, truncation indicators and explicit unavailable values. Leading controls/whitespace are scanned by character code and spreadsheet-formula prefixes `= + - @` are neutralized; CSV quotes are escaped. Unit tests cover malicious cells, quoted commas/quotes, missing import links and the unproven live-sync boundary.
- The panel is wired in the existing Onyx Snapshot Center and report analysis paths. It does not re-query around RLS, invent an external source record ID, or label a saved snapshot/import as a live sync. `live_sync_evidence.status=not_proven`, `live_connection_proven=false`, and last live-sync time unavailable remain intentional because no live connection evidence/credential was verified.
- Activation integration revalidated on the same code/test SHA: admin customer invitation control, generated `/customer/activate/$token` route and PostgreSQL acceptance remain present. Database acceptance tests use `auth.users.email_confirmed_at` for email truth, hash-only invitation tokens, tenant/role/email/expiry/replay guards, audit assertions and direct-table-DML denial. No RLS/grants were weakened.
- Preserved failure: [run 39481109555](https://github.com/Report-Engainall/Nasr1/actions/runs/39481109555) failed lint because `no-control-regex` rejected the initial control-character regex. The guard was changed to a character-code scan in commit `3fb70618eabd9f93d67f734987a1f196ca4c9084`; no lint rule was disabled. That exact SHA passed run 39481288019.
- Browser/production proof remains separate: [Playwright workflow 39481288053](https://github.com/Report-Engainall/Nasr1/actions/runs/39481288053) exited successfully after the external-infrastructure gate skipped app launch and actual browser tests. `BROWSER_PROVEN=NOT RUN / BLOCKED_EXTERNAL`; `PRODUCTION_PROVEN=NOT RUN`; local shell tests `NOT RUN`.
- Activation evidence was handed to P1 in [PR #26 comment 6299113226](https://github.com/Report-Engainall/Nasr1/pull/26#issuecomment-6299113226). Merge remains blocked by P1 migration `20261020110000_customer_activation_invitations.sql` colliding with P2 migration `20261020110000_onyx_inventory_reconciliation_apply_rollback.sql`; P2's activation migration remains `20261020140000_customer_activation_invitations.sql`. Do not merge PR #18 and #26 concurrently. P1-owned `PROGRAMMER_1_CURRENT_REPORT.md`, `SOURCE_INTEGRATION_LEDGER.csv` and `READY_TO_REUSE_FILE_AUDIT.csv` were not edited.
- Archive discrepancy 2,329 tree entries versus 2,044 reported extracted files remains unresolved evidence; no re-download, re-extraction or fingerprint recalculation was done.
- State axes: `IMPLEMENTED=YES`, `INTEGRATED=YES`, `TESTED_EXACT_SHA=PASS`; `BROWSER_PROVEN=NOT RUN / BLOCKED_EXTERNAL`; `PRODUCTION_PROVEN=NOT RUN`.


Coordination readback: PR #26 remains open Draft at HEAD `c73cfbc52bf1fc6df3603975e0aa06b2bb0deeb8`. Current P1 diff does not include the three activation shared paths `src/components/AghbariApp.tsx`, `src/routeTree.gen.ts`, or `scripts/test-database-migrations.mjs`; P2 revalidated these on green exact-SHA CI. P1 handoff comment #6299113226 records the evidence and migration-version collision. P1 remains owner of its report/source CSV files; do not edit them.



## P2 FINAL BATCH CHECKPOINT — Onyx provenance + source-backed finance print — 2026-10-20

- Target only: `Report-Engainall/Nasr1`; branch `feat/p2-customer-return-intake-20261020`; PR #18. Code/test HEAD: `6360029af6f382c19d7e42b68eb4b7ad35c0bce2`; PR base SHA: `c3fa1c52bd9c34d111e484b407d5eea2c2cefc07`.
- Exact-HEAD CI PASS: [Aghbari Commerce checks #39485608035](https://github.com/Report-Engainall/Nasr1/actions/runs/39485608035). Evidence: 69/69 unit-test files pass; all migrations and core-workflow acceptance on isolated PostgreSQL 17 pass; lint pass; production build pass; preview smoke port 4173 pass; dev smoke port 5173 pass.
- Onyx inbound evidence export: `src/lib/onyx-source-evidence-export.ts` plus download action in `src/components/OnyxSnapshotSourceEvidencePanel.tsx`; UI and formatter tests pass on this HEAD. Output is built only from the existing tenant-scoped evidence RPC and includes organization identity, snapshot/import relationship, source-file SHA-256, source IDs and bounded external-ID examples, truncation flags and explicit `NOT_RECORDED/NOT_AVAILABLE` states. CSV formula-like text is neutralized after scanning leading control/whitespace characters; CSV quoting is escaped.
- Onyx outbound order export: approved-order/tenant/actor checks remain server-side in `record_onyx_order_export`; `src/lib/onyx-export.ts` now embeds the returned persisted audit event ID in the resulting XLSX. The workbook deliberately reports compatibility `غير مثبت`; central audit proves preparation, not that a browser completed download or that Onyx accepted the file.
- Live Onyx connection/sync: **NOT PROVEN**. No live connection credential/response or successful live sync evidence is asserted. The evidence export uses `live_sync_evidence.status=not_proven`, `live_connection_proven=false`, and marks live sync time unavailable rather than inventing one.
- Source-backed finance printing: `scripts/test-database-migrations.mjs` now verifies admin/manager/accountant successful invoice and statement reads and issuer identity from the current organization; staff/customer denials; and cross-tenant isolation for invoice, statement, and an actual persisted credit memo. The credit memo path uses an actual invoice line, an approved return request, a received return via RPC, and `prepare_customer_return_credit_memo`; the authorized PDF RPC returns the original return-request, invoice, journal and line identities. The resulting journal remains `draft`; no financial posting was performed by printing.
- Financial values in the CI fixture reconcile to persisted source data: invoice total 370,000; payment 100,000; outstanding 270,000. The posted general-ledger totals remain unchanged by the draft return-credit journal. The role-based staff print RPC test does **not** claim that customer-facing price/total hiding has been verified; that remains explicitly assigned to the next price-privacy task.
- The ledger test initially failed at run [39485302880](https://github.com/Report-Engainall/Nasr1/actions/runs/39485302880) because it assumed only one ledger entry after the new source-linked return fixture created a draft journal. Fixed on `6360029af6f382c19d7e42b68eb4b7ad35c0bce2`: the test now checks both source entries, asserts the return journal is still draft, and preserves the posted-entry count and debit/credit totals. Exact-HEAD run #39485608035 passes.
- Earlier failures retained in chronology: run [39481109555](https://github.com/Report-Engainall/Nasr1/actions/runs/39481109555) was the `no-control-regex` lint rejection; fixed using a character-code scan with lint policy intact. Run [39482609393](https://github.com/Report-Engainall/Nasr1/actions/runs/39482609393) exposed a finance-payment UI test selecting the wrong form and omitting mounted finance RPC mocks; fixed by scoping the form and adding specific test mocks. Run [39485302880](https://github.com/Report-Engainall/Nasr1/actions/runs/39485302880) is also retained as described above.
- Customer activation remains integrated and exact-head tested: admin invitation dialog, generated `/customer/activate/$token` route, PostgreSQL guards using `auth.users.email_confirmed_at`, hash-only invitation token, tenant/email/role/expiry/replay guard, direct invitation-table DML denial and audit. P1 handoff: [PR #26 comment 6299113226](https://github.com/Report-Engainall/Nasr1/pull/26#issuecomment-6299113226).
- Browser and production axes remain separate: [Playwright Critical Paths #39485607806](https://github.com/Report-Engainall/Nasr1/actions/runs/39485607806) completed successfully, but its app setup/actual browser checks were skipped by the external-credentials/infrastructure gate. `BROWSER_PROVEN=NOT RUN / BLOCKED_EXTERNAL`; `PRODUCTION_PROVEN=NOT RUN`; local shell tests `NOT RUN`.
- Merge blocker remains: P1 PR #26's `20261020110000_customer_activation_invitations.sql` conflicts by migration version with P2 `20261020110000_onyx_inventory_reconciliation_apply_rollback.sql`; P2's tested activation migration is at `20261020140000_customer_activation_invitations.sql`. Do not merge PR #18 and PR #26 concurrently. No P1-owned report or source ledger/audit files were modified.
- Archive discrepancy `2,329` tree entries versus `2,044` reported extracted files remains unresolved evidence, not proven loss or a closed issue. No archive re-download, extraction, or fingerprint recalculation was performed.
- Status axes: `IMPLEMENTED=YES`, `INTEGRATED=YES`, `TESTED_EXACT_SHA=PASS`; `BROWSER_PROVEN=NOT RUN / BLOCKED_EXTERNAL`; `PRODUCTION_PROVEN=NOT RUN`.

Coordination and file ownership: PR #18 remains the P2 branch/PR. P1 PR #26 remains separate and contains overlapping Storefront/auth/API changes. P2 did not modify `PROGRAMMER_1_CURRENT_REPORT.md`, `SOURCE_INTEGRATION_LEDGER.csv`, or `READY_TO_REUSE_FILE_AUDIT.csv`. Activation test evidence is recorded in P1 handoff comment #6299113226. Resolve the migration-version collision before any merge; never merge PR #18 and #26 concurrently.

**Superseding single active `next_task_id`: `NASR1-ORIGINAL-SPEC-CUSTOMER-PRICE-PRIVACY-RECONCILIATION-010`.**

The saved 011 work now has exact-SHA CI evidence for source-provenance exports, Onyx order-export audit correlation, activation guards, and source-backed finance printing. Live Onyx synchronization remains unproven and must stay labeled as such; customer-facing price/total hiding policy is not yet verified by this finance-print batch.

**Next task only:** inspect PR #12 source evidence at HEAD `be595fc74b8bbf64b308b84210d86a9aa1d464b8` and CI `39463202326`, then implement/test price visibility on the P2 branch without editing any P1-locked path. PR #26 currently owns overlapping diffs in `src/components/Storefront.tsx`, `src/lib/auth.tsx`, `src/lib/auth-redirect.ts`, and `src/lib/api.ts`; do not touch these without explicit path-level coordination. Prioritize isolated backend/RPC and database acceptance work until the shared-path ownership is resolved. Do not merge PRs concurrently.



## P2 CURRENT CHECKPOINT — customer price privacy, invoice PDF masking, exact-SHA CI — 2026-10-20

- Target `Report-Engainall/Nasr1`, branch `feat/p2-customer-return-intake-20261020`, PR #18. Exact code/test HEAD: `b261d49fe65c631b989ae68af58ecf64d1e7aa98`; base SHA `c3fa1c52bd9c34d111e484b407d5eea2c2cefc07`.
- Exact-HEAD CI: [Aghbari Commerce checks #39488147019](https://github.com/Report-Engainall/Nasr1/actions/runs/39488147019) — **SUCCESS** on `b261d49fe65c631b989ae68af58ecf64d1e7aa98`. Job steps: verified Bun lockfile, dependencies installed, unit tests PASS, all migrations/core workflow acceptance on isolated PostgreSQL 17 PASS, lint PASS, build PASS, preview smoke port 4173 PASS, dev smoke port 5173 PASS.
- Price-privacy database migration `supabase/migrations/20261020040000_customer_price_visibility_controls.sql` was added. It sets conservative defaults and puts visibility decisions in tenant-scoped server RPCs: `get_public_storefront_settings()`, `get_storefront_product_prices(uuid[], numeric)`, `preview_customer_order_pricing(jsonb, text)`, `get_customer_invoice_pdf(uuid)`. Direct raw monetary columns/RLS grants were not widened.
- Settings UI is integrated into the existing Storefront tab in `src/components/AdminPages.tsx` using persisted organization settings and existing `canManageStorefrontContent` authority. It exposes five controls: product-card price, cart/review pricing, order pricing, customer invoice amounts, and customer-tier visibility. Ordinary staff do not see the controls (test `src/test/admin-price-privacy-settings.test.tsx`).
- Invoice PDF flow is linked end-to-end from server response to PDF generation: `src/routes/api.invoice-pdf.$invoiceId.ts` requires an explicit server-returned `financial_details_visible` boolean; `src/lib/finance-document-pdf.ts` hides the per-line unit-price/line-total fields and totals section if false. `src/test/finance-document-pdf-source-reconciliation.test.ts` verifies that hidden data remains absent and the PDF text does not print the financial fields.
- The first privacy CI attempt exposed a stale existing PostgreSQL assertion that expected default customer invoice amounts. The server’s defined default is `show_price_in_invoice=false` and correctly omits `subtotal`, `tax_amount`, `total_amount`, `unit_price`, and `line_total` keys from RPC JSON. The old assertion was replaced with explicit key-absence assertions; exact-head run #39488147019 then passed.
- **Remaining integration dependency:** do not edit `src/components/Storefront.tsx` while P1 PR #26 owns its current diff. Customer-facing cards/cart/order review still need P1 to consume the server visibility/pricing RPCs and suppress hidden amounts (never format a non-price sentinel as zero). P2 has posted the contract/integration handoff in [PR #26 comment #6300246106](https://github.com/Report-Engainall/Nasr1/pull/26#issuecomment-6300246106). This vertical slice is not yet claimed `BROWSER_PROVEN` or production-proven.
- `package.json` also overlaps P1. P2 currently wires the privacy acceptance script into `test:db`; PR #26 currently adds separate customer-cart persistence and admin-catalog acceptance scripts on its branch. Resolve this overlap only during the required sequential merge/rebase, retaining **all** scripts; do not call files/scripts from P1 that are not yet present in the checked-out branch.
- Playwright workflow [39488147057](https://github.com/Report-Engainall/Nasr1/actions/runs/39488147057) returned workflow SUCCESS but its app install, launch and actual critical-path browser tests were **SKIPPED** by the external-infrastructure gate. Status: `BROWSER_PROVEN=NOT RUN / BLOCKED_EXTERNAL`; `PRODUCTION_PROVEN=NOT RUN`.
- Existing release blocker remains: P1 `20261020110000_customer_activation_invitations.sql` conflicts by migration version with P2 `20261020110000_onyx_inventory_reconciliation_apply_rollback.sql`. Keep PR #18 and PR #26 sequential; never merge both concurrently.
- Onyx live connection/sync remains `NOT PROVEN`; saved snapshot and import history are not treated as live sync evidence. Archive enumeration difference (2,329 versus 2,044 reported extracted files) remains unresolved evidence, not proof of data loss.
- Status axes: `IMPLEMENTED=YES`, `INTEGRATED=SERVER+ADMIN SETTINGS+INVOICE PDF=YES`, `TESTED_EXACT_SHA=PASS`; `CUSTOMER_STOREFRONT_UI=BLOCKED_P1_SHARED_PATH`; `BROWSER_PROVEN=NOT RUN / BLOCKED_EXTERNAL`; `PRODUCTION_PROVEN=NOT RUN`.


**Single active `next_task_id`: `NASR1-ORIGINAL-SPEC-CUSTOMER-PRICE-PRIVACY-RECONCILIATION-010`.**

Next action only: after P1 confirms its Storefront path is ready for integration, wire product cards and cart/order-review surfaces to the server pricing/visibility RPCs without changing P1 work blindly. Keep the server response authoritative; do not render hidden values or a sentinel as zero. Re-run exact-HEAD CI, then browser prove the enabled and disabled state once external credentials/infrastructure are available. In parallel, resolve `package.json` test script overlap only with a coordinated sequential rebase; preserve both P1 acceptance scripts and all P2 suites. Do not advance the pointer until customer-facing product/cart/order visibility is wired and verified.




## P2 receipt concurrency acceptance checkpoint — 2026-10-20

- **Code/test SHA verified:** `40afb151019eb40306964606c3de8ee26cf6d6b0`; PR #18 and branch `feat/p2-customer-return-intake-20261020` pointed to this exact SHA when recorded.
- **CI:** [Aghbari Commerce checks #39489672958](<https://github.com/Report-Engainall/Nasr1/actions/runs/39489672958>) = **SUCCESS on the exact SHA**. Confirmed successful steps: frozen Bun lockfile validation, dependencies, unit tests, migrations plus PostgreSQL 17 database acceptance, lint, build, production-preview smoke on port 4173, and dev-server smoke on port 5173. The unit-test summary reports 70/70 test files passed. Database acceptance output explicitly prints both `PASS customer returns` and `PASS customer price privacy`.
- **Return receipt hardening:** `scripts/test-customer-returns.mjs` now checks a repeated key/payload returns the original receipt; reused key with changed notes fails; a fresh-key receipt after the return has been fully received is rejected; receipt header identity resolves to the active manager and persists organization, return request, warehouse and receipt number; receipt audit rows reference the corresponding receipt and authenticated actor; customer role is denied the administrative receiving RPC.
- **Concurrency evidence:** two separate PostgreSQL sessions now call `receive_customer_return` concurrently with the same key and identical payload. Acceptance requires both results to return the same persisted receipt id, with exactly one `idempotent_replay=false` creation and one `idempotent_replay=true` replay. The PostgreSQL 17 acceptance step passed after this change.
- **Credit-memo integrity retained:** credit amount/tax derive from the source invoice line and persisted return quantities; memo/journal preparation begins in draft; retry returns the existing memo and journal; printing is not financial posting. The tests retain staff/customer permission checks, tenant isolation, and balanced-journal assertions.
- **Failure history retained:** [run 39489133012](https://github.com/Report-Engainall/Nasr1/actions/runs/39489133012) failed because the new acceptance script had a misplaced nested `expectFailure` and Node reported `SyntaxError: missing ) after argument list` at line 437. This was a test-authoring syntax defect, not a receipt RPC failure; it was corrected in `cdaec83e816888d67f4f7e10245074d462cc2cdf`, whose CI [39489456696](https://github.com/Report-Engainall/Nasr1/actions/runs/39489456696) passed before concurrency assertions were added.
- **Browser boundary:** [P2 Playwright run 39489673144](<https://github.com/Report-Engainall/Nasr1/actions/runs/39489673144>) completed with workflow success on the same SHA, but the external-infrastructure gate skipped dependency installation, application build/launch and actual browser/tenant-isolation tests. `BROWSER_PROVEN=NOT RUN / BLOCKED_EXTERNAL`; `PRODUCTION_PROVEN=NOT RUN`.
- **Single active `next_task_id`:** `NASR1-ORIGINAL-SPEC-CUSTOMER-PRICE-PRIVACY-RECONCILIATION-010`. Server-side visibility policy, authorized settings and invoice-PDF omission are implemented and PostgreSQL-tested. Customer-facing Storefront card/cart/order-review UI remains unproven and is not marked complete. P1 PR #26 remains open and owns the overlapping Storefront/API/auth paths; P2 requested a path-level handoff in [PR #26 comment](<https://github.com/Report-Engainall/Nasr1/pull/26#issuecomment-6300348893>). Preserve this pointer until the P1-owned UI is integrated and exact-SHA-tested. Do not edit those shared paths or merge PRs concurrently.
- **Coordination blockers preserved:** PR #26 currently remains open. The migration-version collision between P1's `20261020110000_customer_activation_invitations.sql` and P2's `20261020110000_onyx_inventory_reconciliation_apply_rollback.sql` remains a sequential-merge blocker; reconcile versions/contracts before any merge. The archive-count discrepancy (2,329 vs 2,044) remains unresolved evidence and was not re-extracted or recalculated.
- **Status axes:** `IMPLEMENTED=YES`; `INTEGRATED=RETURN RECEIPT + CREDIT MEMO/PDF + ROLE-BASED FINANCE PRINT=YES`; `TESTED_EXACT_SHA=PASS`; `BROWSER_PROVEN=NOT RUN / BLOCKED_EXTERNAL`; `PRODUCTION_PROVEN=NOT RUN`.



## P2 storefront privacy presentation helper checkpoint — 2026-10-20

- **Code/test SHA:** `47ee8b8aa6e7e5c78a1047f695797b9f8d34f2c6`; P2 branch `feat/p2-customer-return-intake-20261020`.
- **Exact CI:** [Aghbari Commerce checks #39491538001](https://github.com/Report-Engainall/Nasr1/actions/runs/39491538001) = **SUCCESS on this exact SHA**. Confirmed: 71/71 Vitest files passed; PostgreSQL 17 migration/database acceptance passed; lint passed; build passed; preview smoke on port 4173 passed; dev smoke on port 5173 passed. New `src/test/storefront-price-visibility-presentation.test.ts` reports 15 passing tests.
- **New isolated implementation:** `src/lib/storefront-price-visibility.ts`. `resolveStorefrontPricePresentation` suppresses all price output unless the policy is explicit boolean `true` and the server amount is a finite non-negative number; a disabled policy suppresses the SQL zero sentinel without returning an amount. `resolveCustomerOrderPricingPresentation` requires both the active surface policy and server `visible=true`, rejects incomplete/malformed server-priced lines and totals, and passes source amounts through without calculating them. Customer-tier display requires an explicit true policy/server decision.
- **Integration status:** the helper and tests are `IMPLEMENTED` and `TESTED_EXACT_SHA`, but **not yet `INTEGRATED` into customer-facing Storefront UI**. Current P1 PR #26 head at checkpoint was `3c215994fdf4c082dc996105447e63bd1cf9a326`; its `src/components/Storefront.tsx` blob still had no reference to price-visibility policy/helper, and P1 owns that path. Handoff instructions were posted at [PR #26 comment 6300674171](https://github.com/Report-Engainall/Nasr1/pull/26#issuecomment-6300674171). Do not modify P1's Storefront/API/Auth paths without coordinated release of ownership.
- **P1 CI status at checkpoint:** [run 39491518290](https://github.com/Report-Engainall/Nasr1/actions/runs/39491518290) passed unit tests and PostgreSQL 17 acceptance but failed lint at `src/lib/admin-catalog-commands.ts:5:455` for `@typescript-eslint/no-explicit-any`. P2 reported the exact finding at [PR #26 comment 6300705160](https://github.com/Report-Engainall/Nasr1/pull/26#issuecomment-6300705160). Do not remove authorization/validation to solve lint.
- **Browser boundary:** [P2 Playwright workflow #39491537907](https://github.com/Report-Engainall/Nasr1/actions/runs/39491537907) completed with workflow success on the same code SHA, but dependency setup, build/launch and real browser/tenant-isolation steps were skipped by the external-infrastructure gate. `BROWSER_PROVEN=NOT RUN / BLOCKED_EXTERNAL`; `PRODUCTION_PROVEN=NOT RUN`.
- **Single active `next_task_id`:** `NASR1-ORIGINAL-SPEC-CUSTOMER-PRICE-PRIVACY-RECONCILIATION-010`. Continue by integrating the guard into P1-owned product cards/detail and cart/order-review after coordinated handoff, then add real Storefront enabled/disabled UI tests and exact-SHA CI. Do not mark this task complete before the visible UI is wired and tested.
- **Unresolved shared release blockers:** P1/P2 same-version migration collision (`20261020110000_customer_activation_invitations.sql` vs `20261020110000_onyx_inventory_reconciliation_apply_rollback.sql`) still requires sequential reconciliation; archive count evidence `2,329` vs `2,044` remains unresolved. No archive was re-extracted/rehashed and no concurrent PR merge was done.
- **Status axes:** `IMPLEMENTED=PRICE PRESENTATION GUARD+UNIT TESTS=YES`; `INTEGRATED=STOREFRONT UI=NO / P1 HANDOFF PENDING`; `TESTED_EXACT_SHA=PASS`; `BROWSER_PROVEN=NOT RUN / BLOCKED_EXTERNAL`; `PRODUCTION_PROVEN=NOT RUN`.


## P2 follow-up — P1 CI recovery, customer UI still pending — 2026-10-20

- P2 docs-head exact CI [39491995765](https://github.com/Report-Engainall/Nasr1/actions/runs/39491995765) completed **SUCCESS** on `17650f57f35600fcae38610a1bb214dc6f044029`. This is a docs-only descendant of the helper/test code SHA `47ee8b8aa6e7e5c78a1047f695797b9f8d34f2c6`, which passed [CI 39491538001](https://github.com/Report-Engainall/Nasr1/actions/runs/39491538001): 71/71 Vitest files, 15 new helper tests, PostgreSQL 17 acceptance, lint, build, preview smoke and dev smoke.
- P1 has addressed the previously recorded lint blocker. Current PR #26 head is `20822761dfdd5a6bd331ea1f172d8c7dcad2cad6`, and [CI 39491944048](https://github.com/Report-Engainall/Nasr1/actions/runs/39491944048) completed SUCCESS with unit tests, PostgreSQL 17 acceptance, lint, build, preview smoke and dev smoke. The earlier failing head/run `3c215994...` / `39491518290` remains historical and is not erased.
- Current P1 `src/components/Storefront.tsx` is still blob `f3fe744f1cef6a7a9f093f4794e01d46f7e65518` and contains no imports/references to `resolveStorefrontPricePresentation`, `resolveCustomerOrderPricingPresentation`, `isCustomerTierVisible`, or the five server policy keys. Therefore P1 CI green is **not** evidence that customer price privacy UI is integrated.
- P2 sent the ready helper contract in [PR #26 comment 6300674171](https://github.com/Report-Engainall/Nasr1/pull/26#issuecomment-6300674171). No P1-owned code was overwritten. P1 must wire the guard into product cards/detail and cart/order-review and test enabled/disabled states before the privacy task can close.
- Browser proof remains `NOT RUN / BLOCKED_EXTERNAL`; [P2 Playwright 39491995764](https://github.com/Report-Engainall/Nasr1/actions/runs/39491995764) succeeded at workflow level while the external gate skipped actual browser execution. Production proof remains NOT RUN.
- Keep the **single active** `next_task_id=NASR1-ORIGINAL-SPEC-CUSTOMER-PRICE-PRIVACY-RECONCILIATION-010`. Do not advance the pointer, edit P1-owned shared paths without coordination, or merge PR #18/#26 concurrently.


## P2 final price-sentinel hardening checkpoint — 2026-10-20

- **Code/test SHA:** `b9cd77e09d650484d33540c9b99d4c943531c750`; [Aghbari Commerce checks #39492486420](https://github.com/Report-Engainall/Nasr1/actions/runs/39492486420) = **SUCCESS on the exact SHA**.
- CI evidence: 71/71 Vitest files passed; `src/test/storefront-price-visibility-presentation.test.ts` passed **16 tests**; all migrations and PostgreSQL 17 acceptance passed; lint, build, preview smoke (4173), and dev smoke (5173) passed. DB output includes `PASS customer price privacy` and `PASS customer returns`.
- Additional hardening in `src/lib/storefront-price-visibility.ts`: the product-card price guard now suppresses zero even when `show_price_on_cards` is read as true, covering a timing mismatch between a separately fetched public setting and the price RPC. This prevents the RPC zero sentinel from being formatted as `0.00` if settings are stale. A dedicated test covers that case.
- P2 Playwright [run 39492486345](https://github.com/Report-Engainall/Nasr1/actions/runs/39492486345) completed as workflow success on the same code SHA, but app setup/build/launch and actual Playwright/tenant-isolation tests were skipped by the external-infrastructure gate. `BROWSER_PROVEN=NOT RUN / BLOCKED_EXTERNAL`; `PRODUCTION_PROVEN=NOT RUN`.
- P1 latest known head is `20822761dfdd5a6bd331ea1f172d8c7dcad2cad6`; [CI 39491944048](https://github.com/Report-Engainall/Nasr1/actions/runs/39491944048) succeeded. However, P1's `src/components/Storefront.tsx` is still blob `f3fe744f1cef6a7a9f093f4794e01d46f7e65518` and has not yet integrated the helper or the five visibility settings. The helper is committed and ready on P2; see [handoff comment 6300814459](https://github.com/Report-Engainall/Nasr1/pull/26#issuecomment-6300814459). No P1-owned code was modified by P2.
- **Single active `next_task_id`:** `NASR1-ORIGINAL-SPEC-CUSTOMER-PRICE-PRIVACY-RECONCILIATION-010`. Continue by coordinating helper adoption on P1's customer UI and adding real enabled/disabled Storefront UI acceptance; do not mark the task complete merely because server logic and the helper are green.
- Existing migration-version collision and archive count discrepancy remain release/evidence blockers as previously recorded. No PR merge, production operation, archive re-extraction or archive rehash was performed.
- **Status axes:** `IMPLEMENTED=GUARD+UNIT TESTS=YES`; `INTEGRATED=STOREFRONT UI=NO / P1 HANDOFF PENDING`; `TESTED_EXACT_SHA=PASS`; `BROWSER_PROVEN=NOT RUN / BLOCKED_EXTERNAL`; `PRODUCTION_PROVEN=NOT RUN`.


## P2 exact-head closeout — customer return receipt and source-linked credit memo — P2 ownership and exact-head boundary (2026-10-20)

- Exact current PR #18 head: `5ffab62b35640431d00515ede77373148b46bd7c`; exact-head checks #39492928362 passed all 71/71 unit files (498 tests), PostgreSQL 17 acceptance, lint, build and both smoke probes.
- P2 returns receipt/credit ledger is integrated and DB-tested. Actual browser execution remains NOT RUN: Playwright run #39492928331 reported gate success with the runner/test steps skipped because dedicated non-production URL/key/accounts/write authorization were unavailable. Production migration/deployment remains NOT RUN.
- Keep historical red CI #39487393265 and its EOF/parser cause visible; later source SHA changed the broken test and full current-head suite passes.
- Next task pointer is only `NASR1-ORIGINAL-SPEC-CUSTOMER-PRICE-PRIVACY-RECONCILIATION-010`. Relevant open owner PR is #12 (`feature/customer-price-visibility-20261020`, head `be595fc74b8bbf64b308b84210d86a9aa1d464b8)). Its Storefront contains some pricing settings but does not import/use the P2 fail-closed presentation helpers `resolveStorefrontPricePresentation` / `resolveCustomerOrderPricingPresentation`; full customer-facing card/detail/order-review and enabled/disabled tests remain pending.
- P2 must not edit P1-owned `src/components/Storefront.tsx`, `src/lib/api.ts`, `src/components/AghbariApp.tsx`, `src/routeTree.gen.ts`, `.github/workflows/commerce-checks.yml`, P1 source integration ledgers or P1 report. Coordinate a path-level handoff in PR #12; keep PRs open and do not merge concurrently.


## P2 checkpoint — customer price privacy UI matrix closed on PR #12 branch — 2026-10-20

- The preceding P2 return/credit-memo batch remains exact-head tested on PR #18: branch `feat/p2-customer-return-intake-20261020`, code head `5ffab62b35640431d00515ede77373148b46bd7c`, [CI 39492928362](https://github.com/Report-Engainall/Nasr1/actions/runs/39492928362) passed 71/71 Vitest files, 498 tests, PostgreSQL 17 migration/acceptance, lint, build, preview smoke 4173 and dev smoke 5173. The later P2 documentation head `a680b5e7b5e9010f4f175e28f271d3706b8c00d3` has its own successful commerce CI [39494087599](https://github.com/Report-Engainall/Nasr1/actions/runs/39494087599). Playwright [39494087931](https://github.com/Report-Engainall/Nasr1/actions/runs/39494087931) remains a gate success only, not browser proof.
- Closed the bounded UI acceptance gap for `NASR1-ORIGINAL-SPEC-CUSTOMER-PRICE-PRIVACY-RECONCILIATION-010` without modifying any P1-owned Storefront/API/auth/generated-route file: new `src/test/storefront-price-visibility-ui.test.tsx` on PR #12 branch `feature/customer-price-visibility-20261020`, exact commit/SHA `3596f358a7172e92082b29cde1352795905c0c29`, exact CI [39495548322](https://github.com/Report-Engainall/Nasr1/actions/runs/39495548322) = SUCCESS.
- Evidence on that exact SHA: 56/56 Vitest files and 412/412 tests; migrations and isolated PostgreSQL 17 acceptance passed, including `PASS customer price privacy`; lint, build, production-preview smoke 4173 and dev smoke 5173 passed. The new 9-test component matrix covers product cards and direct product detail when disabled/enabled; hidden cart monetary fields despite legacy local-storage amounts; visible cart amounts only from a valid server preview; hidden/malformed/errored previews fail closed; checkout/order-review disabled/enabled matrix; and continued non-financial `validate_checkout_cart`.
- Failure preserved: CI [39495218015](https://github.com/Report-Engainall/Nasr1/actions/runs/39495218015) on prior commit `f8736b1a5ca9457feb95795dc917c418b2affab6` failed only two new assertions because the tests searched accessible `aria-label` attributes through `textContent`. Fixed assertions to query the actual accessible total groups. The corrected exact-head CI above passed; the earlier failure remains history.
- Privacy behavior is validated on PR #12's branch, not merged to `main`. PR #12 remains open, and its existing P1-protected migration-test-harness diff plus the P1/P2 migration-version collision remain separate release coordination blockers. No PR merge was performed.
- `BROWSER_PROVEN=NOT RUN / BLOCKED_EXTERNAL`: Playwright workflow skips setup/build/browser steps when dedicated non-production Supabase credentials, two distinct-organization users, phone, and explicit non-production-write confirmation are missing. `PRODUCTION_PROVEN=NOT RUN`; no production migration/deployment or live authenticated-browser claim.
- **Single next task:** `NASR1-ORIGINAL-SPEC-PLAYWRIGHT-CRITICAL-PATHS-006`. The gated cross-tenant E2E spec exists, but credentials are not present; continue with a safe, separately labeled browser proof where possible and preserve the full real-auth order/tenant-isolation scenario as `NOT RUN / BLOCKED_EXTERNAL` until an isolated project and two authorized accounts are available. Do not invent credentials, write to production, or call a gate success a browser pass.
