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
