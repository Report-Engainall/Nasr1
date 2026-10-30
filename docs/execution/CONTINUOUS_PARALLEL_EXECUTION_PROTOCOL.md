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


## 11. أمر نافذ — التشغيل الثلاثي P1/P2/P3 والاستئناف الدائم (2026-10-30)
هذا القسم أحدث من أي توزيع ثنائي أقدم. الفريق الآن ثلاثة مبرمجين. لا يغيّر المستودع التنفيذي: `Report-Engainall/Nasr1` والفرع البعيد الوحيد `main`.

### 11.1 الملكية المنفردة ومنع التعارض
| الدور | الملكية الأساسية | الملفات المحجوزة |
|---|---|---|
| P1 — UX/UI/Product journeys | واجهة العميل والإدارة، routes، RTL، accessibility، responsive، حالات التحميل/الفراغ/الخطأ/retry/offline، ربط الشاشات | `src/routes/**`, `src/styles.css`, `src/components/**` افتراضياً، UI tests في `src/test/**`؛ يستثنى حجز P3 أدناه |
| P2 — Backend/Data/Security | SQL/migrations/RLS/RPC/Edge، المعاملات، المخزون، المالية، الاستيراد، Onyx/WhatsApp contracts، AI gateway/provider adapters | `supabase/**`, `scripts/**`, `src/lib/api.ts`, `src/lib/supabase.ts`, `src/lib/auth.tsx`, و`src/lib/**` باستثناء مسارات P3 |
| P3 — Intelligence/Decision/Integration Captain | ذكاء الأعمال والقرار والسيولة والتنبؤ ومصدر الدليل والتعلم، مرجع الصور، الوثائق المركزية، integration queue وglobal resume | `docs/**` المركزية، `AGENTS.md`, `src/components/intelligence/**`, `src/lib/intelligence/**`, `src/components/ExecutiveStoreAnalytics.tsx`, `src/components/StaffDashboardMetrics.tsx`, `src/components/AdminCustomer360.tsx`, `src/components/TaskCenter.tsx`, `src/lib/business-intelligence.ts`, `src/lib/sales-forecast.ts`, `src/lib/executive-analytics.ts`, `src/lib/customer-360-summary.ts` والاختبارات المخصصة لهذه المكونات/المكتبات. |

P1 يملك `AghbariApp.tsx` وroutes وتركيب الشاشات؛ P3 يسلم Component API/props إلى P1 ولا يعدل ملفات التركيب. P3 لا يلمس API أو RPC أو Edge؛ يرسل عقداً إلى P2. P2 لا يعدل components/routes أو ملفات الذكاء المحجوزة. أي ملف مشترك جديد يسجل في lease واحد قبل التعديل.

### 11.2 تقسيم العمل على 10 مسارات
| المسار | P1 | P2 | P3 |
|---|---|---|---|
| W01 الحوكمة/التتبع | أدلة UX والمتصفح | أدلة DB/API/SHA | registry/matrix/state/log/coverage |
| W02 الهوية والمسارات | RTL/navigation/PWA UX | Auth/RLS/profile/tenant/session | التتبع/القبول |
| W03 الكتالوج | تفاصيل/بحث/منتجات/صور | schema/RPC/RLS/storage/search | quality signals عند الحاجة |
| W04 السلة والطلبات | cart/checkout/recovery UX | atomic order/reservations/idempotency | قياس outcome |
| W05 العضوية والجلسات | registration/approval/devices/offline UI | invitations/membership/revocation/scope | privacy evidence |
| W06 المخزون والمالية | المخزون/المشتريات/الفواتير UI | ATP/ledger/payments/currency/locks/RLS | liquidity/dead-stock/replenishment decisions |
| W07 الاستيراد وOnyx | upload/preview/history/export UX | chunks/hash/DQS/staging/reconcile/contracts | source lineage/passport |
| W08 التحليلات | عرض وتركيب التقارير | tenant-safe aggregation/RPC | analytics/forecast/decisions/learning |
| W09 AI/communications | assistant/settings/WhatsApp states | free quota adapters/AI gateway/privacy/outbox/receipts | deterministic policy/action cards |
| W10 API/ops/release | accessibility/performance/health UI | semantic authorization/health probes/backup/restore | evidence/runbooks/release governance |

كل workstream يعمل على المهام المفتوحة فقط من المصفوفة؛ لا يوجد عشرة فروع، بل عشرة مسارات عمل متوازية بملاك ومهام. يستمر كل مبرمج في مسار مستقل حين ينتظر عقداً من الآخر.

### 11.3 نموذج التزامن والدمج
- GitHub remote main فقط؛ ممنوع إنشاء فروع أو PRs دائمة أو مستودعات أخرى.
- الأفضل: detached local worktree لكل مبرمج على base SHA المسجل؛ لا تنشأ refs بعيدة. commits محلية صغيرة من ملفات المالك فقط.
- P3 هو Integration Captain الوحيد. يراجع checkpoints وdiffs/leases، يدمج commits محلياً بالتتابع، يمنع الدمج المكرر، ثم يشغل الاختبارات على الشجرة الموحدة.
- لا push متزامن. P3 وحده يحدّث remote main باستخدام fast-forward/CAS وexpected SHA. عند CAS rejection: fetch واحد، قارن paths التي تحركت فقط، لا تعاود discovery.
- إذا لم تتوفر worktrees: مشاركة مساحة العمل مشروطة بملف lease ومسار واحد لكل مبرمج؛ git index/commit/push عملية متسلسلة وليست متزامنة.
- package.json/lockfiles/workflows/router generated files لا يلمسها إلا مالك محدد مسبقاً (P2) وبعد إعلان الحاجة لـP3. لا تضف dependency لمجرد تحسين بصري.

### 11.4 ثلاثة checkpoints ومؤشر عالمي واحد
- Global resume cursor الوحيد: `docs/bolt-source-reconciliation/CURRENT_EXECUTION_STATE.md`، يملكه P3.
- P1 checkpoint: `docs/execution/P1_CHECKPOINT.md` (موجود).
- P2 checkpoint: `docs/execution/P2_CHECKPOINT.md`.
- P3 checkpoint: `docs/execution/P3_CHECKPOINT.md`.
- P1/P2 لا يعدلان المصفوفة أو سجل التنفيذ المركزي أو المؤشر العالمي؛ يسجلان التقدم والطلبات في ملف كل منهما. P3 يدمجها في السجل المركزي. لا تنشئ memory/ledger/matrix ثانية.
- checkpoint كل 10 دقائق كحد أقصى، وبعد task/commit/failure، وقبل أي انقطاع متوقع. احتفظ بالعمل غير الملتزم ولا تمسحه.
- كل checkpoint: UTC, task ID, state, base/result SHA, reserved paths, working tree changes/local commit, tests and results, CI run IDs/links, root cause, retry count, blocker, request to another programmer, integration status, **exact next command**.

### 11.5 استئناف خلال دقيقة ومنع إعادة الاستكشاف
1. اقرأ أول 80 سطراً فقط من CURRENT_EXECUTION_STATE.
2. اقرأ ملف تكليف دورك ثم checkpoint الخاص بك.
3. راجع معرض الصور `docs/reference-app/README.md` فقط عند بداية session جديدة أو task مرجعي، ولا تعِد استخراج الأرشيف.
4. تحقق من main SHA وActions لنفس SHA مرة واحدة. إذا تطابق SHA المحفوظ، نفذ exact_next_command؛ إذا تحرك، قارن قائمة paths المتغيرة وافحص المرتبط بمهمتك فقط.
5. اقرأ ملفات أخرى فقط إذا كان checkpoint يسجل عقداً ناقصاً/سبباً محدداً. يمنع rescan الشامل، إعادة جرد RPC 330، وطلب إعادة الملفات من المالك.
6. افحص Actions المسجلة قبل تشغيل أخرى. IN_PROGRESS تعني polling لنفس run لا بدء نسخة ثانية.
7. محاولتان لنفس root cause فقط؛ بعدها إصلاح واحد أو بديل مكافئ للجزء القابل للتنفيذ، وثّق المتبقي BLOCKED/UNVERIFIED، ثم انتقل إلى مهمة مستقلة.
8. عائق خارجي لا يوقف كامل المشروع: نفذ contract/fixtures المحلي الآمن، سجل الجزء الخارجي وحده BLOCKED_EXTERNAL، تابع بقية العمل.

### 11.6 سياسة التكلفة والخصوصية
- التكلفة المدفوعة = صفر. لا paid provider/model/fallback ولا billing method ولا Auto-Recharge.
- deterministic code هو الأساس. free APIs فقط بعد التحقق من الموديل والحصة وشروط البيانات. ChatGPT Free UI ليس API ولا يجوز automation/cookie extraction.
- لا تتجاوز quotas بتعدد الحسابات أو تدوير مفاتيح. احترم 429 وRetry-After وcooldown. عند نفاد كل free quota يعود المسار إلى قواعد محلية معلّمة RULE_BASED.
- يمنع نقل PII والأسعار الخاصة والتكلفة والهوامش وكشوف الحساب والأرقام المالية الخام إلى مزود خارجي؛ سياسة مزود مجهولة = disabled.
- لا كتابة على production أو إرسال واتساب/طلب/دفعة/مزامنة حية دون credentials وتصريح مستقل.

### 11.7 متطلبات التسليم لكل مبرمج
P1: acceptance IDs، paths، local commit, UI test/browser proof، API contract requests.
P2: acceptance IDs، migration/RPC/API, PG17/security/transaction tests, exact SHA, privacy/tenant proof.
P3: deterministic engine/evidence, integration queue, merged SHA, exact CI and matrix/cursor/log update.
لا يعتبر commit أو شاشة أو CI على SHA سابق إغلاقاً. هدف الدفعة إغلاق 3 صفوف قبول تفصيلية إن سمحت الأدلة؛ وإن منع حاجز مثبت ذلك يسجل العدد الحقيقي دون ادعاء.

