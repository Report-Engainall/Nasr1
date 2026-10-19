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
