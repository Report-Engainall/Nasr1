# بروتوكول التشغيل المتوازي والاستئناف الدائم — Nasr1

**المنتج:** متجر الأغبري | Aghbari Commerce — **المستودع:** Report-Engainall/Nasr1 — **الفرع:** main فقط — **زمن الدفعة:** 180 دقيقة — **المبرمجان:** P1 وP2.

هذا البروتوكول عقد التشغيل. لا ينشئ فرعاً أو PR أو مستودعاً جديداً. مؤشر الاستئناف العالمي الوحيد هو docs/bolt-source-reconciliation/CURRENT_EXECUTION_STATE.md؛ وP1_CHECKPOINT.md سجل فرعي لتفاصيل P1 وليس مؤشراً بديلاً.

## 1. قواعد حاكمة

1. استئناف الجلسة يبدأ بأول 60 سطراً من CURRENT_EXECUTION_STATE.md، ثم هذا الملف، ثم تكليف المبرمج، ثم P1_CHECKPOINT.md عند الحاجة. لا مسح شامل ولا إعادة بحث عن ميزات مثبتة.
2. تحقق من رأس main مرة واحدة. إذا طابق SHA المحفوظ اذهب مباشرة إلى NEXT ACTION. إذا تغيّر، قارن فقط قائمة الملفات بين SHA المحفوظ والرأس الجديد، وافحص المتأثر منها فقط.
3. لا تنقل PASS من SHA إلى SHA آخر. TESTED_EXACT_SHA لا يثبت إلا بنتيجة نهائية ناجحة على SHA نفسه؛ PENDING/IN_PROGRESS/SKIPPED/مفقود ليست نجاحاً.
4. لا تعديل أو ترحيل أو تجربة على الإنتاج دون اعتماد وبيانات دخول مصرح بها. اختبارات DB في PostgreSQL 17 معزول أو بيئة الاختبار المعتمدة.
5. ميزانية الخدمات الجديدة صفر. لا تفعيل خدمة مدفوعة أو مزود مدفوع أو إضافة اعتماد إلا بموافقة صريحة. لا إرسال بيانات حساسة لخدمة خارجية.
6. ممنوع Fake Success: Mock ليس إثباتاً حياً، وwa.me ليس إيصال WhatsApp، وملف Excel محلي ليس إثبات استيراد Onyx، ووجود route لا يعني UAT.
7. لا إعادة بناء أو حذف أو reset أو clean أو force-push. لا حذف عمل غير ملتزم به. لا إضعاف RLS أو تجاوز صلاحية لإرضاء الاختبار.
8. الحاجز الخارجي لا يوقف باقي العمل: استكمل البديل المحلي الآمن، سجل المحدود BLOCKED_EXTERNAL مع السبب وما يلزم لإثباته، وانتقل مباشرة لصف قبول آخر.
9. لا تكرر اختباراً موجوداً في No-repeat set إلا بسبب regression محدد أو dependency change أو ضرورة تحقق SHA بسبب تعديل مؤثر.
10. هدف كل دفعة: إغلاق 3 صفوف قبول تفصيلية على الأقل من المصفوفة الحالية، مع أدلة exact-SHA. لا تُنشئ معرفات أخرى ولا تحتسب ثلاثة commits أو اختبارات فرعية إغلاقاً. عند تعذر إغلاق 3 بسبب عائق مثبت، سجل العدد الفعلي والسبب ولا تزور النتيجة.

## 2. تقسيم المتطلبات إلى 10 مسارات

| المسار | معرفات/المجال | P1 — الواجهة | P2 — الخادم والبيانات |
|---|---|---|---|
| W01 الحوكمة والتتبع | DLV-001 | ربط دليل UX بمتطلبات موجودة | registry/CSV، قياس التغطية، SHA والأدلة |
| W02 المسارات والهوية | DLV-002, ROUTES-001, IDENTITY-001 | RTL، التنقل، responsive، states، PWA UI | عقود الهوية وبيانات PWA وسياسات الوصول |
| W03 الكتالوج | DLV-003 | دورة المنتج والبحث والتفاصيل والواجهات | schema/RPC/RLS/validation/search/image/storage |
| W04 السلة والطلب | DLV-004 | cart/checkout/retry/error UX | atomic order/idempotency/reservations/server validation |
| W05 الهوية والجلسات | DLV-005/006/014 | التسجيل والموافقة والجلسات والعمل دون اتصال | Auth/RLS/invitation/membership/revocation/tenant scope |
| W06 المخزون والمالية | DLV-007/008 | صفحات المخزون والمالية والمشتريات | inventory/ATP/locks/ledger/payments/currency/audit |
| W07 الاستيراد وOnyx | DLV-009 وOnyx من INTEGRATION-001 | import/export/preview/history UI | staging/chunk/DQS/replay/reconciliation/Onyx contract |
| W08 التحليلات | DLV-010 | Customer 360 والتقارير والفلاتر والتصدير | KPI/source lineage/tenant-safe aggregation |
| W09 الطباعة والذكاء والاتصالات | DLV-011/012/013 وWhatsApp من INTEGRATION-001 | PDF/print/AI/WhatsApp UI وdisabled states | allowlists/AI gateway/policy/usage/fallback/outbox/provider receipts |
| W10 أمن API والتشغيل والتسليم | DLV-015/016/017/018, API-OPS-001, REL-GATE-002 | accessibility/performance/route UX/handover UI | RPC/Edge semantic security, health/logs, backup/restore/rollback/release |

المسارات تعمل بالتوازي، لكن P1 وP2 يلمسان طبقتين وملفات مختلفة. لكل ملف مالك واحد. لا يعمل المبرمجان على الملف نفسه في الوقت نفسه.

## 3. ملكية الملفات

**P1 فقط:** src/components/**, src/routes/**, src/styles.css, اختبارات UI في src/test/** وملفات e2e/** المكلف بها. لا يغير supabase/** أو scripts/** أو src/lib/api.ts أو src/lib/supabase.ts أو ملفات الحالة المركزية.

**P2 فقط:** supabase/**, scripts/**, src/lib/api.ts, src/lib/supabase.ts، منطق الخدمات والـdomain، CURRENT_EXECUTION_STATE.md، مصفوفة CSV، EXECUTION_LOG.md وسجلات التسليم. لا يغير components/routes/styles أو اختبارات المتصفح المملوكة لـP1.

الملفات المشتركة مثل package.json وlockfiles وrouter root وworkflows والأنواع المشتركة لها مالك يحدده P2 قبل لمسها. لا تضف dependencies بلا حاجة مثبتة.

## 4. التنسيق المكتوب بين P1 وP2

- P2 يعيّن Task ID ومالك المهمة وSHA وreserved_files في مؤشر الاستئناف.
- P1 يواصل مستقلاً في ملفات UI. عند احتياج backend يكتب طلباً منظماً في P1_CHECKPOINT.md: العملية، payload، response، صلاحيات الدور/المؤسسة، أخطاء HTTP/SQLSTATE، idempotency/audit، واختبار القبول المطلوب. لا ينشئ API أو RPC بنفسه.
- P2 يرد في P1_CHECKPOINT.md بعقد موجود أو جديد وملفات يملكها ونتائج اختباره. P1 يستهلك العقد بعد اعتماده.
- لا ينتظر أحد الآخر إذا كان لديه مسار مستقل. لا تعرض الواجهة نجاحاً قبل وجود عقد خدمة حقيقي.
- P2 ينسق تشغيل Core/P2/PG17 المشتركة مرة واحدة على SHA متفق عليه. P1 يرسل نتائج اختبارات UI ولا ينشئ workflow موازياً مطابقاً.

## 5. الدمج الآمن على main

- main فقط؛ لا branches ولا PRs. قبل الالتزام: git fetch origin main، git status --short، git rev-parse origin/main، git diff -- للملفات المملوكة فقط.
- commits صغيرة لكل وحدة قبول، ولا تترك ساعات من العمل دون حفظ.
- الدفع العادي fast-forward فقط: git push origin HEAD:main. ممنوع force/reset/clean.
- إذا رفض الدفع لأن main تقدم: fetch مرة واحدة، قارن الملفات الجديدة فقط، أعد ترتيب commit فوق الرأس الجديد إذا كانت المسارات منفصلة. عند تداخل ملف مع المبرمج الآخر، لا تحذف أو تدمج عشوائياً؛ نسّق مع مالك الملف.
- باستخدام GitHub API: أنشئ commit على رأس main المرصود ثم update_ref مع expected_sha لذلك الرأس وforce=false. رفض CAS يعني إعادة قراءة الرأس والملفات المتغيرة فقط.
- أي commit code جديد يجعل نتائج SHA الأقدم تاريخية، ولا يثبت الكود الجديد.

## 6. استئناف خلال دقيقة عند نفاد الرصيد أو انقطاع الاتصال

1. اقرأ أول 60 سطراً من CURRENT_EXECUTION_STATE.md.
2. اقرأ active_task_id/next_task_id/last_verified_code_sha/reserved_files/expected_main_sha/exact_next_command.
3. fetch واحد لـmain؛ إذا تحرك، compare للملفات المتغيرة فقط.
4. افحص git status والـdiff للملفات المحجوزة؛ احتفظ بأي تغييرات غير ملتزمة ولا تمسحها.
5. افحص run الموجود للـSHA نفسه. لا تنشئ run جديداً إذا كان الحالي يعمل؛ استعلم عن نفس run.
6. اقرأ P1_CHECKPOINT.md فقط إن كانت المهمة P1 أو تحتوي عقد API مطلوباً. لا تقرأ السجلات التاريخية كاملة.

### checkpoint كل 10 دقائق أو بعد كل commit/فشل/توقف

يُسجل: UTC، المبرمج، Task ID، الحالة، base/result SHA، الملفات، أمر الاختبار ونتيجته، رابط CI/artifact، السبب الجذري للفشل، ما لم يتم، العائق الخارجي، reserved_files، و**الأمر التالي الحرفي**. عند انقطاع جلسة أثناء CI يُحفظ run ID وحالته ليستعلم عنها القادم بدلاً من تكرارها.

## 7. منع الدوران

- محاولتان كحد أقصى لنفس الفشل إذا كان السبب نفسه. بعد الثانية: عزل السبب، إصلاح واحد أو بديل اختبار مكافئ للجزء المتاح، توثيق المتبقي، ثم الانتقال.
- الاستكشاف فقط لسبب محدد: regression، عقد مجهول، ملف/جدول غير موجود، migration فاشلة أو تعارض SHA. لا بحث عام ولا إعادة جرد.
- لا تنتظر مزوداً أو موافقة أو CI معلقاً؛ اعمل في مسار آخر وافحص لاحقاً عبر run المسجل.
- حدّث No-repeat set بعد كل دليل ناجح.

## 8. جدولة دفعة 180 دقيقة

0–10 استئناف وملكية؛ 10–20 توزيع وتثبيت عقود؛ 20–130 تنفيذ متوازٍ؛ 130–165 تكامل واختبارات exact-SHA؛ 165–180 تحديث المصفوفة والمؤشر وتحرير الحجز. ثلاث صفوف قبول تفصيلية COMPLETE_VERIFIED هدف إلزامي للدفعة متى كانت البيئة تسمح، وليس مجرد ثلاثة commits. إذا منع حاجز موثق الوصول للثلاثة، سجّل النتيجة الحقيقية واستمر في بقية المتاح.

## 9. البدائل وحدودها

- غياب Onyx sandbox: اختبر mapping/validation/idempotency/reconcile/rollback محلياً؛ live round-trip يبقى BLOCKED_EXTERNAL.
- غياب WhatsApp الرسمي: اختبر outbox/retry/dedupe/disabled UI؛ لا تدّعِ إرسالاً.
- غياب AI provider: اختبر local/free fallback والسياسات وعزل tenant وusage limits/prompt-injection؛ لا تدّعِ live response.
- غياب production credentials: اختبر backup/restore/migration/rollback في بيئة معزولة وجهّز runbook؛ production proof يبقى BLOCKED_EXTERNAL.
- انقطاع الإنترنت: checkpoint ثم تابع الاختبارات المحلية؛ لا تعِد الجلب والاستكشاف.

## 10. تعريف الإغلاق

صف القبول لا يغلق إلا بتنفيذ مدمج، وعقد وبيانات وصلاحيات صحيحة، واختبار مناسب على SHA الدقيق، ورفض بلا side effects عند الحاجة، وحالة واجهة صحيحة، ودليل قابل للفتح. لا يغلق DLV roll-up قبل صفوفه التابعة. REL-GATE-002 يبقى NO-GO حتى تحقق شروط الوثيقة الأصلية؛ لا تخفض المعايير لإرضاء الوقت.
