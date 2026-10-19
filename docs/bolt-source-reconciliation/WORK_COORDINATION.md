# WORK_COORDINATION — فصل عمل المبرمجين في Nasr1

مالك الملف: المبرمج 2 فقط. هذا هو سجل التعارض الوحيد؛ كل قفل يضاف هنا ويغلق بعد تحرير المسار.

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
P2 owns WORK_COORDINATION.md, CURRENT_EXECUTION_STATE.md, EXECUTION_LOG.md, ARCHIVE_MANIFEST.csv, ARCHIVE_MEMBERS.csv, ARCHIVE_FEATURE_INTEGRATION_2026-10-19.md and PROGRAMMER_2_CURRENT_REPORT.md. P1/shared paths remain locked: src/lib/api.ts, src/components/AghbariApp.tsx, src/routeTree.gen.ts, .github/workflows/commerce-checks.yml, scripts/test-database-migrations.mjs, SOURCE_INTEGRATION_LEDGER.csv, READY_TO_REUSE_FILE_AUDIT.csv and P1 report. P2 can use a new migration and P2-owned component/helper/test files. If a locked path becomes necessary, record the request here and wait until its owner releases the lock.


## P2 live coordination update — cash-expense posting, 2026-10-19

| Item | Status / evidence | Owner |
|---|---|---|
| Exact code SHA | `df43fb05e9e8a31a8b45e40d38a94f85ff12691b`; [Actions 39321543032 SUCCESS](https://github.com/Report-Engainall/Nasr1/actions/runs/39321543032) | P2 branch / PR #4 |
| CI summary | 45/45 test files, 339/339 tests; PostgreSQL 17 migrations/repo acceptance; lint/build/preview/dev smoke | Code+CI proved; dedicated source-posting SQL flow coverage remains NOT RUN |
| Protected DB harness | `scripts/test-database-migrations.mjs` is changed in open P1 PR #3 | P2 requests one coordinated patch to add create/post/replay/source-void/reversal/cross-tenant cases; P2 does NOT edit this path |
| P1 paths and ledgers | `src/lib/api.ts`, `src/components/AghbariApp.tsx`, `src/routeTree.gen.ts`, workflow, DB harness, `SOURCE_INTEGRATION_LEDGER.csv`, `READY_TO_REUSE_FILE_AUDIT.csv`, P1 report | Locked to P1 until explicit release |
| Next P2 task | `NASR1-ORIGINAL-SPEC-ACCOUNTING-SOURCE-POSTING-INVOICES-PAYMENTS-006` | Extend target-native mapping to customer invoices/payments; no double count or guessed VAT/FX |
