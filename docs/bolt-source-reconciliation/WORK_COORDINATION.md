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


## قفل/تنسيق — تكليف مصادر NASR المستخرجة ومعايير المواصفة الإضافية (2026-10-20)

- المالك: P2. المستودع الهدف Report-Engainall/Nasr1 فقط. أُضيف docs/bolt-source-reconciliation/P2_ADDITIONAL_ACCEPTANCE_MANDATE_2026-10-20.md إلى أمر الإقلاع. التنفيذ البرمجي لم يُثبت بمجرد إضافة هذا السجل.
- المصدر الإضافي للقراءة فقط: Report-Engainall/NASR-MULTI-PROJECTS-TRANSFER/EXTRACTED_PROJECTS، بالتفتيش التكراري. تقرير الاستخراج يسجل 9 أرشيفات و2,044 ملفًا؛ project-bolt-github-7wyze9ut (2) و(3) متطابقان حسب SHA-256 ويجب عدم تكرار احتساب المحتوى. لا تعد تنزيل/استخراج/بصمة ملف دون فجوة دليل محددة.
- لا يتداخل هذا النطاق مع ملكية P1 للثلاثة donor repos أو SOURCE_INTEGRATION_LEDGER.csv وREADY_TO_REUSE_FILE_AUDIT.csv وPROGRAMMER_1_CURRENT_REPORT.md. استخدم مسارات مستقلة واطلب patch عبر هذا السجل عند تعارض ملكية ملف.
- ملفات التعليمات المحدثة على فرع P2: BOLT_BOOT_MESSAGE_2026-10-18.txt وBOLT_SINGLE_ENTRYPOINT_MASTER_HANDOFF_REPLACEMENT_2026-10-18.md وPROGRAMMER_2_CURRENT_REPORT.md وWORK_COORDINATION.md. لم تُكتب تعديلات مباشرة إلى main. لا تعلن أي بند جديد مكتملًا حتى يوجد code path/tests/CI مناسب.
- المعايير تشمل identity/price privacy، atomic audited price grid، inventory locking/idempotency، Onyx source/sync provenance، import DQS/leading-zero/formula safety، AI fallback/usage ledger، وطباعة المهام/الفواتير/الكشوف/الإشعارات الدائنة بصلاحيات tenant/role نفسها.
- تبقى المهمة التالية واحدة فقط وفق المراجعة الحية؛ يعاد التحقق من branch/PR/CI قبل تحريك next_task_id. لا تدمج PR قبل PASS على head SHA نفسه، ولا تضعف RLS أو تخترع بيانات/تكلفة.
