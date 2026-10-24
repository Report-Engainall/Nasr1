# سجل عقود API والمهام الخلفية — Nasr1

**لقطة المصدر:** `Report-Engainall/Nasr1`، `main` عند `16a3d23e558696700bccbb3dbf9ea75b0fccf745` (24 أكتوبر 2026).  
**الحالة:** `PARTIAL` — سجل مداخل Edge Functions الخمسة موثق، وأصبح جرد كتالوج PostgreSQL 17 ومطابقة مصدر/منح الدوال العامة مختبرًا على SHA محدد (304/304، بلا مصادر غير معروفة). ما زالت المراجعة الدلالية لكل RPC مرشحة مفتوحة، كما أن أسرار الإنتاج والموصلات الخارجية غير مثبتة.



## AUTHORITATIVE RECONCILIATION — 2026-10-24 20:34 +03:00

- Live `main` SHA is `0bbaa6db9332fd0f812e00bd2b8fcda275fc5f3a`. The merged baseline #133, #135–#141 and #143–#146 remains the source of truth; do not recreate without a new regression.
- 304/304 public objects are mapped; 179 callable RPC candidates still require semantic review. Batches 8–10 are documented; batch 11 adds source-backed company invitation and address contracts and existing acceptance evidence.
- #142 last tested head `25deecf9b6fa94f6e8fa1b2acd26c55b36c0ead8` passed Core [40115494628](https://github.com/Report-Engainall/Nasr1/actions/runs/40115494628) and P2 [40115494634](https://github.com/Report-Engainall/Nasr1/actions/runs/40115494634). This batch changes its head; rerun exact-head checks before accepting.
- #163 exact head `1ea3227ad7649947cafc1ee8488b1d6a4c0b6b66`: Core/P2 [40115321226](https://github.com/Report-Engainall/Nasr1/actions/runs/40115321226) / [40115321235](https://github.com/Report-Engainall/Nasr1/actions/runs/40115321235) PASS. Hosted authenticated customer/tenant E2E remains SKIPPED.
- #169 exact head `d6ef27f09a2c73c0dae74d1be2c7768c1577fe40`: Core/P2 [40115015672](https://github.com/Report-Engainall/Nasr1/actions/runs/40115015672) / [40115015539](https://github.com/Report-Engainall/Nasr1/actions/runs/40115015539) PASS; the keyboard-only customer order-detail E2E from #124 remains preserved.
- #172 exact head `682761625993a203b5795daa953632f131ae886a`: Core/P2 [40115029836](https://github.com/Report-Engainall/Nasr1/actions/runs/40115029836) / [40115029831](https://github.com/Report-Engainall/Nasr1/actions/runs/40115029831) PASS; stale active warehouse balance sets are rejected and count lines have actor/audit metadata. Rebase/retest after migration prerequisites.
- #174 exact head `e0ca64f8f66203615eb74bf778f85f59156f2f62`: Core/P2 [40115104136](https://github.com/Report-Engainall/Nasr1/actions/runs/40115104136) / [40115104172](https://github.com/Report-Engainall/Nasr1/actions/runs/40115104172) PASS; route test checks generated declarations.
- #175 exact head `7de22e268fd5903ea6b589c0e3269c6d1b1c176c`: Core [40115637333](https://github.com/Report-Engainall/Nasr1/actions/runs/40115637333) PASS; P2 [40115637423](https://github.com/Report-Engainall/Nasr1/actions/runs/40115637423) was still running at latest poll. Test expectation uses Arabic digit `٥`, matching the locale, without weakening production formatting.
- Migration review/merge sequence remains #147 → #164 → #165 → #166 → #168 → #158 → refresh/retest #162 → #172. #148–#151 and #107/#119/#124/#167 were verified closed after matching file content was preserved in their current-base replacements.
- Independent review requests were sent but no formal approval had been recorded. Do not merge without actual approval and exact-head required gates.
- Hosted customer E2E, production migrations/restore, deployment, live Onyx/WhatsApp/AI remain NOT RUN or BLOCKED_EXTERNAL absent authorized proof.



## قواعد مشتركة

- جميع الأسرار الخادمية تبقى في إعداد Supabase Edge Function server-side. لا تُضف `SUPABASE_SERVICE_ROLE_KEY` أو `OUTBOX_WORKER_SECRET` أو `ASYNC_EXPORT_WORKER_SECRET` أو مفاتيح مزوّد الذكاء الاصطناعي إلى متغير `VITE_*` أو حمولة العميل أو السجلات.
- `Access-Control-Allow-Origin` أو نجاح CORS لا يثبت المصادقة أو التفويض؛ يجب أن تتحقق الوظيفة من جلسة المستخدم/الدور/المؤسسة أو سر العامل حسب نمطها.
- لا تُشغّل اختبارات الكتابة أو migrations على الإنتاج. نتائج PostgreSQL 17/Chromium المعزولة ليست دليل نشر أو اتصال خارجي.
- `SKIPPED` لحسابات العملاء المستضافة تبقى `BLOCKED_EXTERNAL` إذا لم تتوفر اعتمادات غير إنتاجية مخوّلة.

## مداخل Edge Functions

| المدخل | المصادقة ونطاق التفويض | حدود الطلب / دورة العمل | الأخطاء والسلوك الآمن | مصدر التنفيذ والاختبار |
|---|---|---|---|---|
| `outbox-worker` | POST فقط؛ سر خادمي `OUTBOX_WORKER_SECRET` تتم مقارنته بطريقة تقلل تسرب التوقيت؛ مفتاح الخدمة server-side فقط | قارئ streaming مشترك يوقف القراءة عند تجاوز 4096 بايت؛ `batch_size` عدد صحيح من 1 إلى 50؛ يطالب بـevents عبر `claim_outbox_events` مع lease مقداره 300 ثانية؛ تمييز processed/retry/dead-letter؛ redaction للسجلات | يرفض الطرق غير POST والمدخلات غير الصحيحة؛ لا يعد نجاح التسليم ما لم تثبت استجابة الموصل؛ فشل التنفيذ يتحول إلى retry أو dead-letter مسجل | [index.ts](../../supabase/functions/outbox-worker/index.ts)، [bounded reader](../../supabase/functions/_shared/bounded-body.ts)، [streaming limit tests](../../src/test/bounded-request-body.test.ts)، [logic.ts](../../supabase/functions/outbox-worker/logic.ts)، [source tests](../../src/test/outbox-worker-source.test.ts)، [logic tests](../../src/test/outbox-worker-logic.test.ts) |
| `async-export-worker` | وضع العامل يستخدم `ASYNC_EXPORT_WORKER_SECRET` ومفتاح الخدمة داخل الخادم؛ وضع المستخدم يستعمل JWT و`claim_my_async_export_job` للطلب المملوك له | جسم الطلب يقرأ streaming بحد 4096 بايت؛ العامل يقبل batch من 1 إلى 5، lease 300 ثانية؛ تصفية allowlist للحمولة؛ قفل المؤسسة في قراءات الطلبات والعملاء؛ تخزين artifact تحت organization/job؛ إعادة المحاولة محدودة حتى 5 محاولات | رفض طريقة/حمولة غير صحيحة؛ فشل claim يعطي رفضًا واضحًا؛ فحص lease owner قبل إتمام المهمة؛ لا يستطيع مستخدم قراءة/claim وظيفة مؤسسة أخرى | [index.ts](../../supabase/functions/async-export-worker/index.ts)، [bounded reader](../../supabase/functions/_shared/bounded-body.ts)، [streaming limit tests](../../src/test/bounded-request-body.test.ts)، [PG17 acceptance](../../scripts/test-async-export-jobs.mjs)، [route contract tests](../../src/test/async-export-route-contract.test.ts)، [job contract tests](../../src/test/async-export-job-contract.test.ts) |
| `async-export-download` | POST مع جلسة مستخدم صالحة؛ التحقق من ملكية التنزيل يمر عبر RPC خادمي | جسم الطلب يقرأ streaming بحد 2048 بايت؛ ينشئ رابطًا موقّعًا لـ60 ثانية كحد أعلى، مع عدم تجاوز انتهاء artifact المحفوظ؛ تسجيل/تحقق من التنزيل أحادي الاستخدام وفق عقد قاعدة البيانات | لا يعيد مسار artifact الداخلي كبديل للرابط؛ فشل الرابط أو الملكية لا يتحول إلى نجاح وهمي | [index.ts](../../supabase/functions/async-export-download/index.ts)، [bounded reader](../../supabase/functions/_shared/bounded-body.ts)، [streaming limit tests](../../src/test/bounded-request-body.test.ts)، [PG17 async-export acceptance](../../scripts/test-async-export-jobs.mjs) |
| `ai-gateway` | POST/OPTIONS؛ جلسة صالحة وprofile نشط ومؤسسة؛ `test_connection` محصور على admin/manager؛ صلاحيات الميزانية عبر RPC مقيدة | جسم الطلب يقرأ streaming بحد 4096 بايت؛ الأفعال الموثقة `ask` و`test_connection`؛ providers اختيارية مثل OpenAI-compatible وGemini؛ تقدير تكلفة/token قبل التنفيذ، حجز ميزانية، ثم سجل usage/attempt/outcome؛ `max_tokens` محدود | عند غياب إعداد المزوّد لا يخترع نجاح اتصال؛ يعيد fallback صريحًا أو خطأ؛ `cache-control: no-store`; الأخطاء مثل quota/provider unavailable تبقى مرئية | [index.ts](../../supabase/functions/ai-gateway/index.ts)، [bounded reader](../../supabase/functions/_shared/bounded-body.ts)، [streaming limit tests](../../src/test/bounded-request-body.test.ts)، [telemetry PG17 acceptance](../../scripts/test-ai-gateway-telemetry.mjs)، [logic tests](../../src/test/ai-gateway-logic.test.ts) |
| `product-image-upload` | POST/OPTIONS؛ جلسة صالحة، profile نشط، مؤسسة نشطة، دور موظف مسموح، والتحقق أن المنتج ينتمي إلى نفس المؤسسة | WebP فقط مع التحقق من التوقيع، حد أقصى 8 MiB، UUIDs ومسار التخزين مربوطان بالمؤسسة والمنتج؛ اسم ملف فريد دون overwrite | رفض نوع/حجم/معرّف/مؤسسة غير صالح؛ لا يسمح بمسار storage يختاره العميل خارج نطاق المؤسسة؛ مفتاح الخدمة لا يخرج من الخادم | [index.ts](../../supabase/functions/product-image-upload/index.ts)، [security contract](../../src/lib/product-image-security.ts) |

## API-OPS-001 — جرد الكتالوج والمنح المكتمل (TESTED_EXACT_SHA)

**رأس الشيفرة المختبر:** `672749855d733f691ab59de878420a210108fbbe`  
**Core / PostgreSQL 17:** [Run 40042438869](https://github.com/Report-Engainall/Nasr1/actions/runs/40042438869) — `SUCCESS` على SHA نفسه.  
**P2 Playwright:** [Run 40042438851](https://github.com/Report-Engainall/Nasr1/actions/runs/40042438851) — `SUCCESS` على SHA نفسه.  
**الملف التفصيلي:** [PUBLIC_RPC_FUNCTION_INVENTORY_2026-10-24.md](./PUBLIC_RPC_FUNCTION_INVENTORY_2026-10-24.md).

ينفّذ الجرد بعد تطبيق 120 migration بالترتيب على PostgreSQL 17 معزول؛ وقد طابق 304/304 كائنًا عامًا إلى مصدر migration أو extension، مع 0 صفوف بلا مصدر. تصنيف السطح: 179 دالة عامة مرشحة لمراجعة RPC، و40 callback للمشغلات، و67 دالة extension، و18 دالة عامة لا تملك امتياز EXECUTE لأي من `anon` أو `authenticated` أو `service_role`. من المرشحات 176 `SECURITY DEFINER` و3 `SECURITY INVOKER`. المنح المرصودة بين المرشحات هي `anon` 9 و`authenticated` 162 و`service_role` 18؛ تتداخل هذه الأعداد عندما يملك الكائن أكثر من منحة.

**حد الإثبات:** هذا يغلق فجوة **اكتشاف الكتالوج ومطابقة المصدر ورصد المنح الفعلية في بيئة الاختبار** فقط. لا يحوّل الجرد أو إشارات جسم الدالة الاستدلالية إلى إثبات سلامة؛ تبقى عقود الـ179 مرشحًا بحاجة إلى تدقيق دلالي واختبارات رفض/عزل/تكرار/تدقيق لكل مجال. كما لا يثبت إعداد أسرار الإنتاج أو الاتصال بمزوّد خارجي.

## RPC عالية المخاطر يجب أن تبقى عقودها متوافقة

هذه قائمة عقود حرجة تمت مراجعتها في مسارات الاختبار الحالية، وليست قائمة شاملة بكل `CREATE FUNCTION` أو كل grant في المستودع.

| RPC / المجال | عقد القبول المتوقع | دليل اختبار/مصدر |
|---|---|---|
| `claim_outbox_events` | لا يطالب العامل إلا بعد سر صالح؛ lease محدود؛ إعادة التسليم لها نتيجة مخزنة لا حذف صامت؛ retry/dead-letter والتدقيق متمايزون | [outbox worker](../../supabase/functions/outbox-worker/index.ts)، [outbox logic test](../../src/test/outbox-worker-logic.test.ts) |
| `claim_async_export_jobs` / `claim_my_async_export_job` | worker claims محدودة، lease-owner محفوظ، مستخدم يطالب فقط بوظيفته، مؤسسة/دور معزولان، لا انتقال حالة مباشرة من العميل | [async export worker](../../supabase/functions/async-export-worker/index.ts)، [acceptance](../../scripts/test-async-export-jobs.mjs) |
| `get_store_executive_analytics` | no anonymous execution؛ رفض دور العميل؛ عمودا العميل الحاليان `business_name/contact_name`؛ المؤسسة و30 يومًا واستبعاد cancelled تتطابق مع بيانات المصدر | [analytics migration](../../supabase/migrations/20261024010000_store_executive_analytics_customer_schema.sql)، [PR #135](https://github.com/Report-Engainall/Nasr1/pull/135) |
| `transfer_inventory_batch` | tenant/warehouse guard، ترتيب أقفال ثابت، منع oversell/استهلاك reserved stock، idempotency key، إعادة نفس batch عند تكرار payload، وتغيير payload بنفس المفتاح مرفوض | [database acceptance](../../scripts/test-database-migrations.mjs)، [PR #134](https://github.com/Report-Engainall/Nasr1/pull/134) |
| `set_admin_customer_tier` / حالة العميل | الرفض عبر المؤسسة مع SQLSTATE 42501/HTTP 403، بلا تغيير في صف المؤسسة الأخرى أو audit mutation؛ العمليات داخل المؤسسة تبقى وفق الدور | [PR #131](https://github.com/Report-Engainall/Nasr1/pull/131)، [P1 acceptance #119](https://github.com/Report-Engainall/Nasr1/pull/119) |
| حفظ/تعديل/حذف عنوان العميل | schema/UUID validation؛ لا يُعتبر أي نص غير فارغ إقرارًا بالنجاح؛ IDs غير الصالحة ترفض قبل RPC؛ نطاق المؤسسة والمالك محفوظ | [customer-address service](../../src/lib/customer-addresses.ts)، [PR #127](https://github.com/Report-Engainall/Nasr1/pull/127) |
| دفعات العملاء والإشعارات الدائنة | idempotency key + request fingerprint؛ replays بنفس payload تعيد العملية الأصلية، payload مختلف يتعارض؛ قفل invoice مشترك مع posted credits ومنع تجاوز الرصيد | [PR #112](https://github.com/Report-Engainall/Nasr1/pull/112)، [PR #123](https://github.com/Report-Engainall/Nasr1/pull/123)، [PR #104](https://github.com/Report-Engainall/Nasr1/pull/104) |

## الدفعة الدلالية الأولى — عقود عالية المخاطر أثبتتها بيئة محلية معزولة (TESTED_EXACT_SHA)

**رأس المستودع المختبر:** `e507cf7b50d39c34751a10cf1d162e9fbc481600` — Core [40043003244](https://github.com/Report-Engainall/Nasr1/actions/runs/40043003244) وP2 Playwright [40043003357](https://github.com/Report-Engainall/Nasr1/actions/runs/40043003357) انتهيا `SUCCESS` على الرأس نفسه. قاعدة الاختبار PostgreSQL 17 وSupabase محليان، مع حسابات ومؤسسات اصطناعية؛ لا توجد كتابة إلى الإنتاج.

| العقد / المسار | عقد التنفيذ الذي تحقق | دليل القبول على الرأس نفسه |
|---|---|---|
| `submit_customer_order` + `preview_customer_order_pricing` | واجهة Checkout ترسل معرّفات الأصناف والكميات فقط؛ الخادم يعيد التسعير من مصدر الحقيقة، ويتحقق من المستخدم النشط ونطاق المؤسسة وعنوان التوصيل، ويربط إعادة المحاولة ببصمة الطلب والعنوان. واجهة العميل ترفض نتيجة إرسال تحتوي حقولًا مالية، ومعاينة السلة/مراجعة الطلب تتطلب `visible=true` وبيانات خادم مكتملة. | [Storefront checkout](../../src/components/Storefront.tsx)، [RPC migration](../../supabase/migrations/20261015160000_customer_company_memberships.sql)، [pricing visibility tests](../../scripts/test-customer-price-visibility.mjs)، [P2 browser run](https://github.com/Report-Engainall/Nasr1/actions/runs/40043003357) — إنشاء الطلب وعزل المؤسسة وخصوصية السعر `SUCCESS`. |
| `save_product_price_grid` / شبكة الأسعار | تحديث متعدد الصفوف ذري؛ رفض الصف المكرر؛ إرجاع الصفوف التي حُفظت فعلًا؛ تدقيق الفاعل؛ rollback كامل عند قيمة غير صالحة؛ منع كاتب قديم عند تعارض التزامن ومنع دور العميل. | [atomicity test](../../scripts/test-price-grid-atomicity.mjs)، [P2 browser run](https://github.com/Report-Engainall/Nasr1/actions/runs/40043003357) — خطوة `atomic price grid writes, rollback, audit and stale-writer race` `SUCCESS`. |
| دفتر المصروفات ومحاسبة استلام المشتريات | اختبار ترحيل مصدر المصروف وعدم تكراره وتزامن الإبطال/الترحيل؛ واختبار مسودة قيد استلام مرتبطة بمصدر الشراء ورفض القيود/الأدوار غير المسموح بها. | [cash-expense acceptance](../../scripts/test-cash-expense-journal-posting.mjs)، [purchase receipt acceptance](../../scripts/test-purchase-receipt-accounting.mjs)، [P2 browser run](https://github.com/Report-Engainall/Nasr1/actions/runs/40043003357) — الخطوتان الماليّتان `SUCCESS`. |
| `request_async_export_job` / claims / تنزيل التصدير | المفتاح نفسه مع الفلاتر نفسها يعيد المهمة الأصلية؛ إعادة استخدام المفتاح بفلاتر مختلفة ترفض؛ لا تسريب بين المؤسسات؛ منع DML المباشر؛ lease للـworker ومالك التنفيذ وعدّ المحاولات محدد؛ تنزيل مرتبط بصاحب المهمة وصلاحيتها؛ التنظيف والتدقيق موثقان. | [async export acceptance](../../scripts/test-async-export-jobs.mjs)، [Core PostgreSQL 17 run](https://github.com/Report-Engainall/Nasr1/actions/runs/40043003244) — دورة التصدير المحلية `SUCCESS`. |
| الاستيراد وDQS ومصدر المخزون | تكرار المفتاح المتزامن ينتج مهمة/claim قانونية واحدة؛ payload مختلف يرفض؛ الاستنساخ الصريح لنية استيراد جديدة لا يخلط hash الملف؛ المنع المباشر لقراءة/كتابة مفاتيح idempotency، وعدم تحويل استيراد اللقطة إلى حركة مخزون ضمنية. | [import-idempotency acceptance](../../scripts/test-import-job-idempotency.mjs)، [Core PostgreSQL 17 run](https://github.com/Report-Engainall/Nasr1/actions/runs/40043003244) — خطوة جرد import snapshot وخطوة دورة التصدير `SUCCESS`. |
| جلسات الأجهزة وإبطالها | قائمة الجلسات لا تعرض مؤسسة أخرى أو جلسات منتهية ولا رموزًا/أسرارًا؛ رفض سحب جلسة خارج صلاحية الفاعل؛ بعد الإبطال يفقد JWT القديم هوية التطبيق ونطاق المؤسسة فورًا؛ العدد والتدقيق يتطابقان مع الجلسات المحذوفة. | [session acceptance](../../scripts/test-session-management.mjs)، [P2 browser run](https://github.com/Report-Engainall/Nasr1/actions/runs/40043003357) — مسار الإبطال الفوري `SUCCESS`. |
| المرتجعات والإشعارات الدائنة، XLSX الخاص بـOnyx، وطباعة المستند المالي/المهمة | المسارات المحلية اختُبرت لإنشاء/مراجعة/استلام المرتجع والإشعار الدائن، وتصدير طلب Onyx إلى XLSX مع التدقيق، والطباعة، وحدود دور customer-manager والخصوصية المالية. | [P2 browser run](https://github.com/Report-Engainall/Nasr1/actions/runs/40043003357) — خطوات المرتجعات، XLSX، الطباعة، وcustomer-manager/financial privacy `SUCCESS`. |

**حد الإثبات الخارجي:** وظيفة العميل والمؤسسة المستضافة في `Playwright customer order and tenant isolation` ظلت `SKIPPED` لعدم توفر اعتماد اختبار مخصص؛ ليست `PASS`. هذه الدفعة تثبت المسارات المحلية الاصطناعية فقط، ولا تثبت اتصالات الإنتاج أو Onyx Pro أو WhatsApp Business API أو أسرار workers في بيئة نشر.

## الدفعة الدلالية الثانية — إصلاح التفويض الحي لأسعار العملاء (TESTED_EXACT_SHA)

**PR:** [#144](https://github.com/Report-Engainall/Nasr1/pull/144) — مفتوح بانتظار المراجعة، وليس مدمجًا.  
**رأس الشيفرة المختبر:** `9fc736db3fc451731a94105d6e707a5c83fbf019`.  
**Core:** [Run 40044350881](https://github.com/Report-Engainall/Nasr1/actions/runs/40044350881) — `SUCCESS` على SHA نفسه.  
**P2 Playwright:** [Run 40044350890](https://github.com/Report-Engainall/Nasr1/actions/runs/40044350890) — `SUCCESS` على SHA نفسه.

| العقد | التغيير الدلالي | إثبات القبول |
|---|---|---|
| `get_storefront_product_prices` | استبدال اختيار الملف الشخصي عبر `auth.uid()` وحده بـ`current_profile_id()` المعتمد على الجلسة الحية في الخادم. يرفض RPC ملفًا نشطًا إذا كان صف جلسة Auth قد أُلغي، حتى عندما تبقى مطالبات JWT المرسلة للاختبار كما هي. | PostgreSQL 17 بعد تطبيق الهجرات؛ رفض استدعاء التسعير بعد حذف `auth.sessions` ضمن معاملة الاختبار. [Core run](https://github.com/Report-Engainall/Nasr1/actions/runs/40044350881). |
| `preview_customer_order_pricing` | ربط الهوية والمؤسسة بمساعدات الجلسة المركزية، واستخدام `current_customer_id()` لحل المالك أو عضوية الشركة المعتمدة، وفرض `catalog.read` لمعاينة السلة و`orders.create` لمراجعة الطلب. | اختبار مشتري الشركة يثبت نفس شريحة وسعر المالك المعتمد؛ عضو المالية فقط يُرفض من معاينة السلة ومراجعة الطلب؛ إلغاء الجلسة يمنع RPC رغم بقاء JWT قديم. [Core run](https://github.com/Report-Engainall/Nasr1/actions/runs/40044350881)، [P2 run](https://github.com/Report-Engainall/Nasr1/actions/runs/40044350890). |

**حد الإثبات:** تم اختبار هذه الحالات محليًا ببيانات اصطناعية. لا يوجد اختبار حساب العميل/المؤسسة المستضاف لأن بوابة E2E الخارجية ظلت `SKIPPED`; ولا يثبت هذا الإصلاح صحة كل الـ179 مرشح RPC أو إعداد أسرار الإنتاج. لا تزال مراجعة السعر الصفري كسنتينل في استجابة كتالوج مخفي السعر مسألة عقد منفصلة مفتوحة.

## الدفعة الدلالية الثالثة — قرار قبول/رفض عرض السعر لا يقبل NULL (PARTIAL; direct PG17 and Core/P2 passed)

**الاكتشاف:** `public.customer_respond_to_quote(p_quote_id uuid, p_accept boolean)` كانت تستخدم `CASE WHEN p_accept THEN 'accepted' ELSE 'rejected' END`. في PostgreSQL، `NULL` يدخل فرع `ELSE`؛ ما سمح لاستدعاء غير صالح برفض العرض ضمنيًا.

**المعالجة:** [PR #147](https://github.com/Report-Engainall/Nasr1/pull/147) يستخدم migration فريدة `20261024133000_customer_quote_response_explicit_decision.sql` ويرفض NULL للمعرّف أو القرار بـSQLSTATE `22023` قبل التغيير. يحافظ على صلاحية `quotes.manage`، والهوية النشطة وملكية العرض وحالة `quoted`، ويقصر EXECUTE على `authenticated`.

**إثبات الرأس الحالي:** SHA `5b351a544f412a48c0d5466b91b000c51100c889`. Core [40106804073 SUCCESS](https://github.com/Report-Engainall/Nasr1/actions/runs/40106804073)، وP2 [40106804081 SUCCESS](https://github.com/Report-Engainall/Nasr1/actions/runs/40106804081). سجل Core أثبت: `PASS customer quote decision runtime: NULL UUID/boolean rejected with 22023 and no mutation; explicit false and true persist their requested transitions.`

**تصحيح رقم migration:** كان #146 يستخدم إصدار `20261024130000` أيضًا، فأزيلت النسخة المتعارضة من #147 ونُقلت إلى `20261024133000_customer_quote_response_explicit_decision.sql`. الإصدارات يجب أن تبقى فريدة.

**الحالة:** `PARTIAL` — الكود والاختبارات اجتازت Core/P2 وPG17 على الرأس المذكور؛ PR مفتوح وينتظر مراجعة مستقلة ودمجًا مصرحًا به والتحقق من رأس الدمج. E2E المستضاف بقي `SKIPPED/BLOCKED_EXTERNAL`، ولا توجد دعوى قبول إنتاجي.

## الدفعة الدلالية الرابعة — رفض NULL في حالة المهمة التشغيلية (PARTIAL; all required CI passed)

**الاكتشاف والمعالجة:** [PR #148](https://github.com/Report-Engainall/Nasr1/pull/148) يضيف `20261024140000_operational_task_status_reject_null.sql` ويرفض الحالة NULL أو غير المدعومة بـSQLSTATE `22023` قبل بحث المهمة وقفلها أو تحديثها، مع الحفاظ على نطاق المؤسسة والدور والتعيين والانتقالات وسجل التدقيق.

**إثبات الرأس الحالي:** SHA `fbc34727822416c6521cd9bae841c8d0df0261c6`. Core [40106736245 SUCCESS](https://github.com/Report-Engainall/Nasr1/actions/runs/40106736245)، P2 [40106736237 SUCCESS](https://github.com/Report-Engainall/Nasr1/actions/runs/40106736237)، وPG17 [40106736232 SUCCESS](https://github.com/Report-Engainall/Nasr1/actions/runs/40106736232). سجل runtime: `PASS operational task status PG17 runtime: NULL/unsupported status raise 22023 before mutation; valid transition and single audit remain intact.`

**الحالة:** `PARTIAL` — جميع بوابات الكود وPG17 على SHA أعلاه ناجحة؛ PR مفتوح بانتظار مراجعة مستقلة ودمج مصرح به والتحقق بعد الدمج.

## الدفعة الدلالية الخامسة — قرار حالة الترويج لا يقبل NULL (PARTIAL; all required CI passed)

**الاكتشاف والمعالجة:** كانت `save_promotion` و`set_promotion_active` تحولان `NULL p_is_active` إلى `false`. [PR #149](https://github.com/Report-Engainall/Nasr1/pull/149) يضيف `20261024143000_promotion_null_active_decision.sql`، ويرفض القرار المفقود بـ`22023` قبل إنشاء/تحديث الترويج أو بحث الصف، محافظًا على تفويض المدير/المسؤول وعزل المؤسسة والتدقيق.

**إثبات الرأس الحالي:** SHA `21fabc9ecaf11fb3f22737e11070d23e83cb1872`. Core [40107006299 SUCCESS](https://github.com/Report-Engainall/Nasr1/actions/runs/40107006299)، P2 [40107006338 SUCCESS](https://github.com/Report-Engainall/Nasr1/actions/runs/40107006338)، وPG17 [40107006365 SUCCESS](https://github.com/Report-Engainall/Nasr1/actions/runs/40107006365). سجل runtime: `PASS promotion active decision PG17 runtime: NULL create/toggle rejected with 22023 and no mutation/audit; explicit true/false decisions persist.`

**الحالة:** `PARTIAL` — Core/P2/PG17 ناجحة على الرأس الموثق؛ PR مفتوح للمراجعة المستقلة والدمج المصرح به والتحقق من رأس الدمج.

## الدفعة الدلالية السادسة — إعلان واجهة المتجر لا يقبل حالة تفعيل مجهولة (PARTIAL; PG17 + Core/P2 passed)

**الاكتشاف والمعالجة:** كانت `save_storefront_announcement` تحول `NULL p_is_active` إلى `false` عند الإنشاء والتحديث. [PR #150](https://github.com/Report-Engainall/Nasr1/pull/150) يضيف `20261024144500_announcement_null_active_decision.sql` ويرفض NULL بـ`22023` قبل أي كتابة، دون تغيير التفويض أو سجل التدقيق.

**إثبات الرأس الحالي:** SHA `1b22b83b3297c87c57b20c62336f16b772b613e4`. Core [40107350234 SUCCESS](https://github.com/Report-Engainall/Nasr1/actions/runs/40107350234)، P2 [40107350238 SUCCESS](https://github.com/Report-Engainall/Nasr1/actions/runs/40107350238)، وPG17 [40107350314 SUCCESS](https://github.com/Report-Engainall/Nasr1/actions/runs/40107350314). سجل runtime: `PASS announcement active decision PG17 runtime: NULL create/update rejected with 22023 and no mutation/audit; explicit false deactivates once.`

**الحالة:** `PARTIAL` — Core/P2/PG17 ناجحة على SHA أعلاه؛ PR مفتوح وينتظر مراجعة مستقلة ودمجًا مصرحًا به.

## الدفعة الدلالية السابعة — لا تقبل قياسات AI قرار fallback مجهولًا (PARTIAL; exact-head recheck required)

**الاكتشاف والمعالجة:** كانت `complete_ai_gateway_usage_v2` لا ترفض صراحة `p_fallback_used=NULL` في مسار قياس `unknown`، بينما عقد v1 لم يكن يفرض هذا الحارس مبكرًا. [PR #151](https://github.com/Report-Engainall/Nasr1/pull/151) يضيف `20261024145000_ai_fallback_decision_reject_null.sql`، ويفرض قرار true/false صريحًا قبل قراءة/قفل حجز الاستخدام، مع رفض provider/result status المجهول في v1، وبقاء التشغيل محصورًا في `service_role`.

**دليل الرأس السابق:** SHA `c2b64beedd0cd3d473506fe55044388624196409` — PG17 [40107530116 SUCCESS](https://github.com/Report-Engainall/Nasr1/actions/runs/40107530116)، وسجل runtime: `PASS AI fallback decision PG17 runtime: NULL fallback rejected before mutation in v1/v2; explicit false completes with exact ledger flags.` لكن اختبار مصدر العقد فشل في assertion غير دقيق؛ تم إصلاحه في الرأس الأحدث `70c96242e28375bacde73d5a2b85ec538b982d5d`. على الرأس الأحدث Core [40107756122](https://github.com/Report-Engainall/Nasr1/actions/runs/40107756122)، P2 [40107756096](https://github.com/Report-Engainall/Nasr1/actions/runs/40107756096)، وPG17 [40107756187](https://github.com/Report-Engainall/Nasr1/actions/runs/40107756187) قيد إعادة التحقق وقت إعداد هذا التحديث.

**الحالة:** `PARTIAL` — اختبار PG17 نجح على الرأس السابق؛ لا تنقل النتيجة إلى الرأس الجديد. لا يُرفع إلى PASS إلا بعد نجاح Core/P2/PG17 على `70c96242...`، ثم المراجعة المستقلة والدمج والتحقق بعده.

**ترتيب migrations الملزم:** #144 (`11:00`) → #145 (`12:00`) → #146 (`13:00`) → #147 (`13:30`) → #148 (`14:00`) → #149 (`14:30`) → #150 (`14:45`) → #151 (`14:50`). لا تدمج طلبًا دون مراجعة مستقلة وبوابات القبول المطلوبة، وأعد الاختبارات بعد أي تغيير للرأس.

## اختبارات تثبتها Core الحالية

على `main` SHA `16a3d23e558696700bccbb3dbf9ea75b0fccf745`, Core run [40035355209](https://github.com/Report-Engainall/Nasr1/actions/runs/40035355209) انتهى `SUCCESS`. سجل القبول يتضمن:
- import profile، tenant-scoped synonyms، resumable chunk manifest، duplicate detection، DQS finalization وfull-snapshot analytics.
- concurrent same-key import replay، canonical job/claim، changed-payload rejection ورفض direct-table privileges.
- async-export idempotency، filter allowlist، role/tenant isolation، RPC-only writes، leases/retry cap/artifact expiry/one-time download authorization/audit.
- outbox/AI telemetry/inventory acceptance في مساراتها المحلية.

أما هذا السجل نفسه فيُحدّث كمرجع تعاقدي فقط؛ لا يُعد دليلاً على أن كل RPC في migrations قد جرى جرده أو أن secrets والموصلات مهيأة في الإنتاج.

## الدفعة الدلالية الثامنة — عقود الجرد الفعلي (مراجعة مصدر؛ القبول المتكامل ما زال جزئيًا)

المصادر التي روجعت مباشرة على الشجرة الحالية: `supabase/migrations/20261018090000_inventory_stock_count.sql`، `20261020120000_stock_count_start_audit.sql`، `20261019230000_purchase_orders_and_receiving.sql`، `20261018070000_inventory_transfer_command.sql`، `20261019240000_inventory_transfer_batches.sql`، `20261020060000_customer_return_receipts.sql` و`20261021100000_onyx_inventory_reconciliation_apply_rollback.sql`. هذه مراجعة مصدر محددة، وليست إغلاقًا لجميع RPC.

| RPC / callback | الهوية والتفويض/النطاق | المدخلات والأثر والعقد | التزامن، التكرار والتدقيق | الحالة |
|---|---|---|---|---|
| `start_stock_count(uuid,text,text)` | SECURITY DEFINER، `search_path=''`; يتطلب `auth.uid()` وprofile نشطًا يطابق `auth_user_id` ومؤسسة نشطة و`is_staff()`. المستودع يجب أن يكون نشطًا وفي المؤسسة نفسها؛ لا يكتفى بقيمة tenant من العميل. | `warehouse_id` غير فارغ، مفتاح تكرار يطابق `^[A-Za-z0-9_-]{16,128}# سجل عقود API والمهام الخلفية — Nasr1

**لقطة المصدر:** `Report-Engainall/Nasr1`، `main` عند `16a3d23e558696700bccbb3dbf9ea75b0fccf745` (24 أكتوبر 2026).  
**الحالة:** `PARTIAL` — سجل مداخل Edge Functions الخمسة موثق، وأصبح جرد كتالوج PostgreSQL 17 ومطابقة مصدر/منح الدوال العامة مختبرًا على SHA محدد (304/304، بلا مصادر غير معروفة). ما زالت المراجعة الدلالية لكل RPC مرشحة مفتوحة، كما أن أسرار الإنتاج والموصلات الخارجية غير مثبتة.



## AUTHORITATIVE RECONCILIATION — 2026-10-24 20:08 +03:00

- Live `main` is `0bbaa6db9332fd0f812e00bd2b8fcda275fc5f3a`, not the older `16a3d23e...` captured in historical notes below.
- Catalog and privilege inventory evidence remains scoped to its recorded tested SHA: 304/304 public objects mapped, zero unknown-source rows. This does **not** complete semantic review of 179 callable RPC candidates.
- #147 quote decision: Core/P2 PASS on exact head `fc2a7d5eb08c9bc99d3d90cc869b2e5f0296618a`; awaits independent review and ordered merge.
- #148/#149/#150 are **CLOSED_DUPLICATE**; changed file blobs were verified byte-identical to current-main-based #164/#165/#166 respectively. Use only #164→#165→#166 after #147, with Core/P2/PG17 passing on each present head and independent review still pending.
- #151 remains based on an old main SHA; refresh and rerun Core/P2/PG17 after preceding migrations. #162 is the selected DQS status-scoring fix; Core/P2/PG17 passed on its recorded head `e5ca28bb...`, but it must be refreshed and retested after the ordered migration sequence. Duplicate #167 is closed.
- #163 storefront recovery / nested subcategory routing: Core and P2 passed on exact head `17b2b434d5a4f1845959e9c8eb41a85530234b10`; hosted customer E2E remains skipped, not PASS.
- #172 stock-count snapshot completeness and per-line attribution is open at exact head `58a7d4aaa6e9c6707d6b05c31f539aa456bbdfc8`; Core `40114555238` and P2 `40114554880` are running, so the new SQL and regression tests remain UNVERIFIED until both complete successfully.
- Do not claim production secrets, live AI/Onyx/WhatsApp connectivity, production migrations/backups, deployment, or hosted customer tenant-isolation testing without external evidence.

## قواعد مشتركة

- جميع الأسرار الخادمية تبقى في إعداد Supabase Edge Function server-side. لا تُضف `SUPABASE_SERVICE_ROLE_KEY` أو `OUTBOX_WORKER_SECRET` أو `ASYNC_EXPORT_WORKER_SECRET` أو مفاتيح مزوّد الذكاء الاصطناعي إلى متغير `VITE_*` أو حمولة العميل أو السجلات.
- `Access-Control-Allow-Origin` أو نجاح CORS لا يثبت المصادقة أو التفويض؛ يجب أن تتحقق الوظيفة من جلسة المستخدم/الدور/المؤسسة أو سر العامل حسب نمطها.
- لا تُشغّل اختبارات الكتابة أو migrations على الإنتاج. نتائج PostgreSQL 17/Chromium المعزولة ليست دليل نشر أو اتصال خارجي.
- `SKIPPED` لحسابات العملاء المستضافة تبقى `BLOCKED_EXTERNAL` إذا لم تتوفر اعتمادات غير إنتاجية مخوّلة.

## مداخل Edge Functions

| المدخل | المصادقة ونطاق التفويض | حدود الطلب / دورة العمل | الأخطاء والسلوك الآمن | مصدر التنفيذ والاختبار |
|---|---|---|---|---|
| `outbox-worker` | POST فقط؛ سر خادمي `OUTBOX_WORKER_SECRET` تتم مقارنته بطريقة تقلل تسرب التوقيت؛ مفتاح الخدمة server-side فقط | قارئ streaming مشترك يوقف القراءة عند تجاوز 4096 بايت؛ `batch_size` عدد صحيح من 1 إلى 50؛ يطالب بـevents عبر `claim_outbox_events` مع lease مقداره 300 ثانية؛ تمييز processed/retry/dead-letter؛ redaction للسجلات | يرفض الطرق غير POST والمدخلات غير الصحيحة؛ لا يعد نجاح التسليم ما لم تثبت استجابة الموصل؛ فشل التنفيذ يتحول إلى retry أو dead-letter مسجل | [index.ts](../../supabase/functions/outbox-worker/index.ts)، [bounded reader](../../supabase/functions/_shared/bounded-body.ts)، [streaming limit tests](../../src/test/bounded-request-body.test.ts)، [logic.ts](../../supabase/functions/outbox-worker/logic.ts)، [source tests](../../src/test/outbox-worker-source.test.ts)، [logic tests](../../src/test/outbox-worker-logic.test.ts) |
| `async-export-worker` | وضع العامل يستخدم `ASYNC_EXPORT_WORKER_SECRET` ومفتاح الخدمة داخل الخادم؛ وضع المستخدم يستعمل JWT و`claim_my_async_export_job` للطلب المملوك له | جسم الطلب يقرأ streaming بحد 4096 بايت؛ العامل يقبل batch من 1 إلى 5، lease 300 ثانية؛ تصفية allowlist للحمولة؛ قفل المؤسسة في قراءات الطلبات والعملاء؛ تخزين artifact تحت organization/job؛ إعادة المحاولة محدودة حتى 5 محاولات | رفض طريقة/حمولة غير صحيحة؛ فشل claim يعطي رفضًا واضحًا؛ فحص lease owner قبل إتمام المهمة؛ لا يستطيع مستخدم قراءة/claim وظيفة مؤسسة أخرى | [index.ts](../../supabase/functions/async-export-worker/index.ts)، [bounded reader](../../supabase/functions/_shared/bounded-body.ts)، [streaming limit tests](../../src/test/bounded-request-body.test.ts)، [PG17 acceptance](../../scripts/test-async-export-jobs.mjs)، [route contract tests](../../src/test/async-export-route-contract.test.ts)، [job contract tests](../../src/test/async-export-job-contract.test.ts) |
| `async-export-download` | POST مع جلسة مستخدم صالحة؛ التحقق من ملكية التنزيل يمر عبر RPC خادمي | جسم الطلب يقرأ streaming بحد 2048 بايت؛ ينشئ رابطًا موقّعًا لـ60 ثانية كحد أعلى، مع عدم تجاوز انتهاء artifact المحفوظ؛ تسجيل/تحقق من التنزيل أحادي الاستخدام وفق عقد قاعدة البيانات | لا يعيد مسار artifact الداخلي كبديل للرابط؛ فشل الرابط أو الملكية لا يتحول إلى نجاح وهمي | [index.ts](../../supabase/functions/async-export-download/index.ts)، [bounded reader](../../supabase/functions/_shared/bounded-body.ts)، [streaming limit tests](../../src/test/bounded-request-body.test.ts)، [PG17 async-export acceptance](../../scripts/test-async-export-jobs.mjs) |
| `ai-gateway` | POST/OPTIONS؛ جلسة صالحة وprofile نشط ومؤسسة؛ `test_connection` محصور على admin/manager؛ صلاحيات الميزانية عبر RPC مقيدة | جسم الطلب يقرأ streaming بحد 4096 بايت؛ الأفعال الموثقة `ask` و`test_connection`؛ providers اختيارية مثل OpenAI-compatible وGemini؛ تقدير تكلفة/token قبل التنفيذ، حجز ميزانية، ثم سجل usage/attempt/outcome؛ `max_tokens` محدود | عند غياب إعداد المزوّد لا يخترع نجاح اتصال؛ يعيد fallback صريحًا أو خطأ؛ `cache-control: no-store`; الأخطاء مثل quota/provider unavailable تبقى مرئية | [index.ts](../../supabase/functions/ai-gateway/index.ts)، [bounded reader](../../supabase/functions/_shared/bounded-body.ts)، [streaming limit tests](../../src/test/bounded-request-body.test.ts)، [telemetry PG17 acceptance](../../scripts/test-ai-gateway-telemetry.mjs)، [logic tests](../../src/test/ai-gateway-logic.test.ts) |
| `product-image-upload` | POST/OPTIONS؛ جلسة صالحة، profile نشط، مؤسسة نشطة، دور موظف مسموح، والتحقق أن المنتج ينتمي إلى نفس المؤسسة | WebP فقط مع التحقق من التوقيع، حد أقصى 8 MiB، UUIDs ومسار التخزين مربوطان بالمؤسسة والمنتج؛ اسم ملف فريد دون overwrite | رفض نوع/حجم/معرّف/مؤسسة غير صالح؛ لا يسمح بمسار storage يختاره العميل خارج نطاق المؤسسة؛ مفتاح الخدمة لا يخرج من الخادم | [index.ts](../../supabase/functions/product-image-upload/index.ts)، [security contract](../../src/lib/product-image-security.ts) |

## API-OPS-001 — جرد الكتالوج والمنح المكتمل (TESTED_EXACT_SHA)

**رأس الشيفرة المختبر:** `672749855d733f691ab59de878420a210108fbbe`  
**Core / PostgreSQL 17:** [Run 40042438869](https://github.com/Report-Engainall/Nasr1/actions/runs/40042438869) — `SUCCESS` على SHA نفسه.  
**P2 Playwright:** [Run 40042438851](https://github.com/Report-Engainall/Nasr1/actions/runs/40042438851) — `SUCCESS` على SHA نفسه.  
**الملف التفصيلي:** [PUBLIC_RPC_FUNCTION_INVENTORY_2026-10-24.md](./PUBLIC_RPC_FUNCTION_INVENTORY_2026-10-24.md).

ينفّذ الجرد بعد تطبيق 120 migration بالترتيب على PostgreSQL 17 معزول؛ وقد طابق 304/304 كائنًا عامًا إلى مصدر migration أو extension، مع 0 صفوف بلا مصدر. تصنيف السطح: 179 دالة عامة مرشحة لمراجعة RPC، و40 callback للمشغلات، و67 دالة extension، و18 دالة عامة لا تملك امتياز EXECUTE لأي من `anon` أو `authenticated` أو `service_role`. من المرشحات 176 `SECURITY DEFINER` و3 `SECURITY INVOKER`. المنح المرصودة بين المرشحات هي `anon` 9 و`authenticated` 162 و`service_role` 18؛ تتداخل هذه الأعداد عندما يملك الكائن أكثر من منحة.

**حد الإثبات:** هذا يغلق فجوة **اكتشاف الكتالوج ومطابقة المصدر ورصد المنح الفعلية في بيئة الاختبار** فقط. لا يحوّل الجرد أو إشارات جسم الدالة الاستدلالية إلى إثبات سلامة؛ تبقى عقود الـ179 مرشحًا بحاجة إلى تدقيق دلالي واختبارات رفض/عزل/تكرار/تدقيق لكل مجال. كما لا يثبت إعداد أسرار الإنتاج أو الاتصال بمزوّد خارجي.

## RPC عالية المخاطر يجب أن تبقى عقودها متوافقة

هذه قائمة عقود حرجة تمت مراجعتها في مسارات الاختبار الحالية، وليست قائمة شاملة بكل `CREATE FUNCTION` أو كل grant في المستودع.

| RPC / المجال | عقد القبول المتوقع | دليل اختبار/مصدر |
|---|---|---|
| `claim_outbox_events` | لا يطالب العامل إلا بعد سر صالح؛ lease محدود؛ إعادة التسليم لها نتيجة مخزنة لا حذف صامت؛ retry/dead-letter والتدقيق متمايزون | [outbox worker](../../supabase/functions/outbox-worker/index.ts)، [outbox logic test](../../src/test/outbox-worker-logic.test.ts) |
| `claim_async_export_jobs` / `claim_my_async_export_job` | worker claims محدودة، lease-owner محفوظ، مستخدم يطالب فقط بوظيفته، مؤسسة/دور معزولان، لا انتقال حالة مباشرة من العميل | [async export worker](../../supabase/functions/async-export-worker/index.ts)، [acceptance](../../scripts/test-async-export-jobs.mjs) |
| `get_store_executive_analytics` | no anonymous execution؛ رفض دور العميل؛ عمودا العميل الحاليان `business_name/contact_name`؛ المؤسسة و30 يومًا واستبعاد cancelled تتطابق مع بيانات المصدر | [analytics migration](../../supabase/migrations/20261024010000_store_executive_analytics_customer_schema.sql)، [PR #135](https://github.com/Report-Engainall/Nasr1/pull/135) |
| `transfer_inventory_batch` | tenant/warehouse guard، ترتيب أقفال ثابت، منع oversell/استهلاك reserved stock، idempotency key، إعادة نفس batch عند تكرار payload، وتغيير payload بنفس المفتاح مرفوض | [database acceptance](../../scripts/test-database-migrations.mjs)، [PR #134](https://github.com/Report-Engainall/Nasr1/pull/134) |
| `set_admin_customer_tier` / حالة العميل | الرفض عبر المؤسسة مع SQLSTATE 42501/HTTP 403، بلا تغيير في صف المؤسسة الأخرى أو audit mutation؛ العمليات داخل المؤسسة تبقى وفق الدور | [PR #131](https://github.com/Report-Engainall/Nasr1/pull/131)، [P1 acceptance #119](https://github.com/Report-Engainall/Nasr1/pull/119) |
| حفظ/تعديل/حذف عنوان العميل | schema/UUID validation؛ لا يُعتبر أي نص غير فارغ إقرارًا بالنجاح؛ IDs غير الصالحة ترفض قبل RPC؛ نطاق المؤسسة والمالك محفوظ | [customer-address service](../../src/lib/customer-addresses.ts)، [PR #127](https://github.com/Report-Engainall/Nasr1/pull/127) |
| دفعات العملاء والإشعارات الدائنة | idempotency key + request fingerprint؛ replays بنفس payload تعيد العملية الأصلية، payload مختلف يتعارض؛ قفل invoice مشترك مع posted credits ومنع تجاوز الرصيد | [PR #112](https://github.com/Report-Engainall/Nasr1/pull/112)، [PR #123](https://github.com/Report-Engainall/Nasr1/pull/123)، [PR #104](https://github.com/Report-Engainall/Nasr1/pull/104) |

## الدفعة الدلالية الأولى — عقود عالية المخاطر أثبتتها بيئة محلية معزولة (TESTED_EXACT_SHA)

**رأس المستودع المختبر:** `e507cf7b50d39c34751a10cf1d162e9fbc481600` — Core [40043003244](https://github.com/Report-Engainall/Nasr1/actions/runs/40043003244) وP2 Playwright [40043003357](https://github.com/Report-Engainall/Nasr1/actions/runs/40043003357) انتهيا `SUCCESS` على الرأس نفسه. قاعدة الاختبار PostgreSQL 17 وSupabase محليان، مع حسابات ومؤسسات اصطناعية؛ لا توجد كتابة إلى الإنتاج.

| العقد / المسار | عقد التنفيذ الذي تحقق | دليل القبول على الرأس نفسه |
|---|---|---|
| `submit_customer_order` + `preview_customer_order_pricing` | واجهة Checkout ترسل معرّفات الأصناف والكميات فقط؛ الخادم يعيد التسعير من مصدر الحقيقة، ويتحقق من المستخدم النشط ونطاق المؤسسة وعنوان التوصيل، ويربط إعادة المحاولة ببصمة الطلب والعنوان. واجهة العميل ترفض نتيجة إرسال تحتوي حقولًا مالية، ومعاينة السلة/مراجعة الطلب تتطلب `visible=true` وبيانات خادم مكتملة. | [Storefront checkout](../../src/components/Storefront.tsx)، [RPC migration](../../supabase/migrations/20261015160000_customer_company_memberships.sql)، [pricing visibility tests](../../scripts/test-customer-price-visibility.mjs)، [P2 browser run](https://github.com/Report-Engainall/Nasr1/actions/runs/40043003357) — إنشاء الطلب وعزل المؤسسة وخصوصية السعر `SUCCESS`. |
| `save_product_price_grid` / شبكة الأسعار | تحديث متعدد الصفوف ذري؛ رفض الصف المكرر؛ إرجاع الصفوف التي حُفظت فعلًا؛ تدقيق الفاعل؛ rollback كامل عند قيمة غير صالحة؛ منع كاتب قديم عند تعارض التزامن ومنع دور العميل. | [atomicity test](../../scripts/test-price-grid-atomicity.mjs)، [P2 browser run](https://github.com/Report-Engainall/Nasr1/actions/runs/40043003357) — خطوة `atomic price grid writes, rollback, audit and stale-writer race` `SUCCESS`. |
| دفتر المصروفات ومحاسبة استلام المشتريات | اختبار ترحيل مصدر المصروف وعدم تكراره وتزامن الإبطال/الترحيل؛ واختبار مسودة قيد استلام مرتبطة بمصدر الشراء ورفض القيود/الأدوار غير المسموح بها. | [cash-expense acceptance](../../scripts/test-cash-expense-journal-posting.mjs)، [purchase receipt acceptance](../../scripts/test-purchase-receipt-accounting.mjs)، [P2 browser run](https://github.com/Report-Engainall/Nasr1/actions/runs/40043003357) — الخطوتان الماليّتان `SUCCESS`. |
| `request_async_export_job` / claims / تنزيل التصدير | المفتاح نفسه مع الفلاتر نفسها يعيد المهمة الأصلية؛ إعادة استخدام المفتاح بفلاتر مختلفة ترفض؛ لا تسريب بين المؤسسات؛ منع DML المباشر؛ lease للـworker ومالك التنفيذ وعدّ المحاولات محدد؛ تنزيل مرتبط بصاحب المهمة وصلاحيتها؛ التنظيف والتدقيق موثقان. | [async export acceptance](../../scripts/test-async-export-jobs.mjs)، [Core PostgreSQL 17 run](https://github.com/Report-Engainall/Nasr1/actions/runs/40043003244) — دورة التصدير المحلية `SUCCESS`. |
| الاستيراد وDQS ومصدر المخزون | تكرار المفتاح المتزامن ينتج مهمة/claim قانونية واحدة؛ payload مختلف يرفض؛ الاستنساخ الصريح لنية استيراد جديدة لا يخلط hash الملف؛ المنع المباشر لقراءة/كتابة مفاتيح idempotency، وعدم تحويل استيراد اللقطة إلى حركة مخزون ضمنية. | [import-idempotency acceptance](../../scripts/test-import-job-idempotency.mjs)، [Core PostgreSQL 17 run](https://github.com/Report-Engainall/Nasr1/actions/runs/40043003244) — خطوة جرد import snapshot وخطوة دورة التصدير `SUCCESS`. |
| جلسات الأجهزة وإبطالها | قائمة الجلسات لا تعرض مؤسسة أخرى أو جلسات منتهية ولا رموزًا/أسرارًا؛ رفض سحب جلسة خارج صلاحية الفاعل؛ بعد الإبطال يفقد JWT القديم هوية التطبيق ونطاق المؤسسة فورًا؛ العدد والتدقيق يتطابقان مع الجلسات المحذوفة. | [session acceptance](../../scripts/test-session-management.mjs)، [P2 browser run](https://github.com/Report-Engainall/Nasr1/actions/runs/40043003357) — مسار الإبطال الفوري `SUCCESS`. |
| المرتجعات والإشعارات الدائنة، XLSX الخاص بـOnyx، وطباعة المستند المالي/المهمة | المسارات المحلية اختُبرت لإنشاء/مراجعة/استلام المرتجع والإشعار الدائن، وتصدير طلب Onyx إلى XLSX مع التدقيق، والطباعة، وحدود دور customer-manager والخصوصية المالية. | [P2 browser run](https://github.com/Report-Engainall/Nasr1/actions/runs/40043003357) — خطوات المرتجعات، XLSX، الطباعة، وcustomer-manager/financial privacy `SUCCESS`. |

**حد الإثبات الخارجي:** وظيفة العميل والمؤسسة المستضافة في `Playwright customer order and tenant isolation` ظلت `SKIPPED` لعدم توفر اعتماد اختبار مخصص؛ ليست `PASS`. هذه الدفعة تثبت المسارات المحلية الاصطناعية فقط، ولا تثبت اتصالات الإنتاج أو Onyx Pro أو WhatsApp Business API أو أسرار workers في بيئة نشر.

## الدفعة الدلالية الثانية — إصلاح التفويض الحي لأسعار العملاء (TESTED_EXACT_SHA)

**PR:** [#144](https://github.com/Report-Engainall/Nasr1/pull/144) — مفتوح بانتظار المراجعة، وليس مدمجًا.  
**رأس الشيفرة المختبر:** `9fc736db3fc451731a94105d6e707a5c83fbf019`.  
**Core:** [Run 40044350881](https://github.com/Report-Engainall/Nasr1/actions/runs/40044350881) — `SUCCESS` على SHA نفسه.  
**P2 Playwright:** [Run 40044350890](https://github.com/Report-Engainall/Nasr1/actions/runs/40044350890) — `SUCCESS` على SHA نفسه.

| العقد | التغيير الدلالي | إثبات القبول |
|---|---|---|
| `get_storefront_product_prices` | استبدال اختيار الملف الشخصي عبر `auth.uid()` وحده بـ`current_profile_id()` المعتمد على الجلسة الحية في الخادم. يرفض RPC ملفًا نشطًا إذا كان صف جلسة Auth قد أُلغي، حتى عندما تبقى مطالبات JWT المرسلة للاختبار كما هي. | PostgreSQL 17 بعد تطبيق الهجرات؛ رفض استدعاء التسعير بعد حذف `auth.sessions` ضمن معاملة الاختبار. [Core run](https://github.com/Report-Engainall/Nasr1/actions/runs/40044350881). |
| `preview_customer_order_pricing` | ربط الهوية والمؤسسة بمساعدات الجلسة المركزية، واستخدام `current_customer_id()` لحل المالك أو عضوية الشركة المعتمدة، وفرض `catalog.read` لمعاينة السلة و`orders.create` لمراجعة الطلب. | اختبار مشتري الشركة يثبت نفس شريحة وسعر المالك المعتمد؛ عضو المالية فقط يُرفض من معاينة السلة ومراجعة الطلب؛ إلغاء الجلسة يمنع RPC رغم بقاء JWT قديم. [Core run](https://github.com/Report-Engainall/Nasr1/actions/runs/40044350881)، [P2 run](https://github.com/Report-Engainall/Nasr1/actions/runs/40044350890). |

**حد الإثبات:** تم اختبار هذه الحالات محليًا ببيانات اصطناعية. لا يوجد اختبار حساب العميل/المؤسسة المستضاف لأن بوابة E2E الخارجية ظلت `SKIPPED`; ولا يثبت هذا الإصلاح صحة كل الـ179 مرشح RPC أو إعداد أسرار الإنتاج. لا تزال مراجعة السعر الصفري كسنتينل في استجابة كتالوج مخفي السعر مسألة عقد منفصلة مفتوحة.

## الدفعة الدلالية الثالثة — قرار قبول/رفض عرض السعر لا يقبل NULL (PARTIAL; direct PG17 and Core/P2 passed)

**الاكتشاف:** `public.customer_respond_to_quote(p_quote_id uuid, p_accept boolean)` كانت تستخدم `CASE WHEN p_accept THEN 'accepted' ELSE 'rejected' END`. في PostgreSQL، `NULL` يدخل فرع `ELSE`؛ ما سمح لاستدعاء غير صالح برفض العرض ضمنيًا.

**المعالجة:** [PR #147](https://github.com/Report-Engainall/Nasr1/pull/147) يستخدم migration فريدة `20261024133000_customer_quote_response_explicit_decision.sql` ويرفض NULL للمعرّف أو القرار بـSQLSTATE `22023` قبل التغيير. يحافظ على صلاحية `quotes.manage`، والهوية النشطة وملكية العرض وحالة `quoted`، ويقصر EXECUTE على `authenticated`.

**إثبات الرأس الحالي:** SHA `5b351a544f412a48c0d5466b91b000c51100c889`. Core [40106804073 SUCCESS](https://github.com/Report-Engainall/Nasr1/actions/runs/40106804073)، وP2 [40106804081 SUCCESS](https://github.com/Report-Engainall/Nasr1/actions/runs/40106804081). سجل Core أثبت: `PASS customer quote decision runtime: NULL UUID/boolean rejected with 22023 and no mutation; explicit false and true persist their requested transitions.`

**تصحيح رقم migration:** كان #146 يستخدم إصدار `20261024130000` أيضًا، فأزيلت النسخة المتعارضة من #147 ونُقلت إلى `20261024133000_customer_quote_response_explicit_decision.sql`. الإصدارات يجب أن تبقى فريدة.

**الحالة:** `PARTIAL` — الكود والاختبارات اجتازت Core/P2 وPG17 على الرأس المذكور؛ PR مفتوح وينتظر مراجعة مستقلة ودمجًا مصرحًا به والتحقق من رأس الدمج. E2E المستضاف بقي `SKIPPED/BLOCKED_EXTERNAL`، ولا توجد دعوى قبول إنتاجي.

## الدفعة الدلالية الرابعة — رفض NULL في حالة المهمة التشغيلية (PARTIAL; all required CI passed)

**الاكتشاف والمعالجة:** [PR #148](https://github.com/Report-Engainall/Nasr1/pull/148) يضيف `20261024140000_operational_task_status_reject_null.sql` ويرفض الحالة NULL أو غير المدعومة بـSQLSTATE `22023` قبل بحث المهمة وقفلها أو تحديثها، مع الحفاظ على نطاق المؤسسة والدور والتعيين والانتقالات وسجل التدقيق.

**إثبات الرأس الحالي:** SHA `fbc34727822416c6521cd9bae841c8d0df0261c6`. Core [40106736245 SUCCESS](https://github.com/Report-Engainall/Nasr1/actions/runs/40106736245)، P2 [40106736237 SUCCESS](https://github.com/Report-Engainall/Nasr1/actions/runs/40106736237)، وPG17 [40106736232 SUCCESS](https://github.com/Report-Engainall/Nasr1/actions/runs/40106736232). سجل runtime: `PASS operational task status PG17 runtime: NULL/unsupported status raise 22023 before mutation; valid transition and single audit remain intact.`

**الحالة:** `PARTIAL` — جميع بوابات الكود وPG17 على SHA أعلاه ناجحة؛ PR مفتوح بانتظار مراجعة مستقلة ودمج مصرح به والتحقق بعد الدمج.

## الدفعة الدلالية الخامسة — قرار حالة الترويج لا يقبل NULL (PARTIAL; all required CI passed)

**الاكتشاف والمعالجة:** كانت `save_promotion` و`set_promotion_active` تحولان `NULL p_is_active` إلى `false`. [PR #149](https://github.com/Report-Engainall/Nasr1/pull/149) يضيف `20261024143000_promotion_null_active_decision.sql`، ويرفض القرار المفقود بـ`22023` قبل إنشاء/تحديث الترويج أو بحث الصف، محافظًا على تفويض المدير/المسؤول وعزل المؤسسة والتدقيق.

**إثبات الرأس الحالي:** SHA `21fabc9ecaf11fb3f22737e11070d23e83cb1872`. Core [40107006299 SUCCESS](https://github.com/Report-Engainall/Nasr1/actions/runs/40107006299)، P2 [40107006338 SUCCESS](https://github.com/Report-Engainall/Nasr1/actions/runs/40107006338)، وPG17 [40107006365 SUCCESS](https://github.com/Report-Engainall/Nasr1/actions/runs/40107006365). سجل runtime: `PASS promotion active decision PG17 runtime: NULL create/toggle rejected with 22023 and no mutation/audit; explicit true/false decisions persist.`

**الحالة:** `PARTIAL` — Core/P2/PG17 ناجحة على الرأس الموثق؛ PR مفتوح للمراجعة المستقلة والدمج المصرح به والتحقق من رأس الدمج.

## الدفعة الدلالية السادسة — إعلان واجهة المتجر لا يقبل حالة تفعيل مجهولة (PARTIAL; PG17 + Core/P2 passed)

**الاكتشاف والمعالجة:** كانت `save_storefront_announcement` تحول `NULL p_is_active` إلى `false` عند الإنشاء والتحديث. [PR #150](https://github.com/Report-Engainall/Nasr1/pull/150) يضيف `20261024144500_announcement_null_active_decision.sql` ويرفض NULL بـ`22023` قبل أي كتابة، دون تغيير التفويض أو سجل التدقيق.

**إثبات الرأس الحالي:** SHA `1b22b83b3297c87c57b20c62336f16b772b613e4`. Core [40107350234 SUCCESS](https://github.com/Report-Engainall/Nasr1/actions/runs/40107350234)، P2 [40107350238 SUCCESS](https://github.com/Report-Engainall/Nasr1/actions/runs/40107350238)، وPG17 [40107350314 SUCCESS](https://github.com/Report-Engainall/Nasr1/actions/runs/40107350314). سجل runtime: `PASS announcement active decision PG17 runtime: NULL create/update rejected with 22023 and no mutation/audit; explicit false deactivates once.`

**الحالة:** `PARTIAL` — Core/P2/PG17 ناجحة على SHA أعلاه؛ PR مفتوح وينتظر مراجعة مستقلة ودمجًا مصرحًا به.

## الدفعة الدلالية السابعة — لا تقبل قياسات AI قرار fallback مجهولًا (PARTIAL; exact-head recheck required)

**الاكتشاف والمعالجة:** كانت `complete_ai_gateway_usage_v2` لا ترفض صراحة `p_fallback_used=NULL` في مسار قياس `unknown`، بينما عقد v1 لم يكن يفرض هذا الحارس مبكرًا. [PR #151](https://github.com/Report-Engainall/Nasr1/pull/151) يضيف `20261024145000_ai_fallback_decision_reject_null.sql`، ويفرض قرار true/false صريحًا قبل قراءة/قفل حجز الاستخدام، مع رفض provider/result status المجهول في v1، وبقاء التشغيل محصورًا في `service_role`.

**دليل الرأس السابق:** SHA `c2b64beedd0cd3d473506fe55044388624196409` — PG17 [40107530116 SUCCESS](https://github.com/Report-Engainall/Nasr1/actions/runs/40107530116)، وسجل runtime: `PASS AI fallback decision PG17 runtime: NULL fallback rejected before mutation in v1/v2; explicit false completes with exact ledger flags.` لكن اختبار مصدر العقد فشل في assertion غير دقيق؛ تم إصلاحه في الرأس الأحدث `70c96242e28375bacde73d5a2b85ec538b982d5d`. على الرأس الأحدث Core [40107756122](https://github.com/Report-Engainall/Nasr1/actions/runs/40107756122)، P2 [40107756096](https://github.com/Report-Engainall/Nasr1/actions/runs/40107756096)، وPG17 [40107756187](https://github.com/Report-Engainall/Nasr1/actions/runs/40107756187) قيد إعادة التحقق وقت إعداد هذا التحديث.

**الحالة:** `PARTIAL` — اختبار PG17 نجح على الرأس السابق؛ لا تنقل النتيجة إلى الرأس الجديد. لا يُرفع إلى PASS إلا بعد نجاح Core/P2/PG17 على `70c96242...`، ثم المراجعة المستقلة والدمج والتحقق بعده.

**ترتيب migrations الملزم:** #144 (`11:00`) → #145 (`12:00`) → #146 (`13:00`) → #147 (`13:30`) → #148 (`14:00`) → #149 (`14:30`) → #150 (`14:45`) → #151 (`14:50`). لا تدمج طلبًا دون مراجعة مستقلة وبوابات القبول المطلوبة، وأعد الاختبارات بعد أي تغيير للرأس.

## اختبارات تثبتها Core الحالية

على `main` SHA `16a3d23e558696700bccbb3dbf9ea75b0fccf745`, Core run [40035355209](https://github.com/Report-Engainall/Nasr1/actions/runs/40035355209) انتهى `SUCCESS`. سجل القبول يتضمن:
- import profile، tenant-scoped synonyms، resumable chunk manifest، duplicate detection، DQS finalization وfull-snapshot analytics.
- concurrent same-key import replay، canonical job/claim، changed-payload rejection ورفض direct-table privileges.
- async-export idempotency، filter allowlist، role/tenant isolation، RPC-only writes، leases/retry cap/artifact expiry/one-time download authorization/audit.
- outbox/AI telemetry/inventory acceptance في مساراتها المحلية.

أما هذا السجل نفسه فيُحدّث كمرجع تعاقدي فقط؛ لا يُعد دليلاً على أن كل RPC في migrations قد جرى جرده أو أن secrets والموصلات مهيأة في الإنتاج.

، وملاحظات حتى 1000 حرف. يمنع جلسة مفتوحة أخرى للمستودع؛ ينشئ لقطة للمنتجات النشطة التي لديها أرصدة موجودة، ويرفض اللقطة الفارغة. | يقفل سجل المستودع والميزان عند أخذ اللقطة، ويستخدم قفلًا استشاريًا لمفتاح idempotency، ويعيد الجلسة نفسها فقط عندما تتطابق حمولة المفتاح. Trigger `audit_stock_count_session_start` يتحقق من actor/tenant ثانية ويسجل حدث بدء واحدًا metadata-only؛ لا يمنح العميل تنفيذ الـtrigger مباشرة. | **مصدر مراجع؛ فحص لقطة الأرصدة الناقصة كان فجوة مثبتة في الإكمال.** #172 يضيف قفلًا مشتركًا مع استلام المشتريات والتحقق من مجموعة الأرصدة؛ اختبار Core/P2 على الرأس الجديد ما زال جاريًا عند هذا التحديث. |
| `set_stock_count_line(uuid,uuid,numeric)` | هوية profile نشط تطابق الجلسة ومؤسسة المستودع، ودور موظف؛ session والمنتج يجب أن يكونا من لقطة المؤسسة نفسها. | يرفض NULL ومعرّفات غير صالحة وNaN/Infinity والكمية السالبة أو أكبر من الحد أو ذات أكثر من 3 منازل عشرية؛ لا يقبل المنتج خارج اللقطة أو جلسة مغلقة. | القفل على الجلسة والسطر يمنع تعديلًا متزامنًا غير منسق. **الفجوة السابقة:** كانت إعادة العد تستبدل القيمة دون `counted_by` أو audit للعد. #172 يضيف `stock_count_lines.counted_by` ويسجل old/new quantity والفاعل والجلسة والمنتج مع كل عد/إعادة عد، ويضيف assertions في اختبار الجرد. لم تثبت نتيجة هذه التغييرات حتى اكتمال Core/P2 على الرأس الأحدث. | **PARTIAL — إصدار/اختبار في #172، قبول غير محسوم.** |
| `complete_stock_count(uuid)` | يتطلب profile نشطًا داخل المؤسسة، و`operational_tasks_can_manage()` (مدير/مسؤول مخول)، وجلسة مفتوحة مملوكة للمؤسسة. | لا يسمح بالإكمال حتى تُعد كل السطور. يقارن لكل رصيد الكمية on-hand وreserved ووقت آخر حركة مع لقطة البداية، ويمنع عدًّا دون المخزون المحجوز، ثم يطبق فرق المخزون وحركاته وسجل التدقيق ذريًا. | كانت المقارنة أحادية الاتجاه على السطور الموجودة فقط؛ قد ينشئ استلام مشتريات رصيدًا جديدًا لمنتج لم يكن له رصيد عند أخذ اللقطة فيبقى خارج جرد الإكمال. #172 يضيف قفل المستودع مع قفل استلام المشتريات، ويقارن مجموعة الأرصدة النشطة والسطور في الاتجاهين ويرفض تغير المجموعة بـSQLSTATE `40001`؛ الاختبار يضيف منتجًا/رصيدًا بعد اللقطة ويثبت الرفض ثم الإلغاء الصريح. | **PARTIAL — فجوة منطقية محددة وإصلاح مختبر قيد التنفيذ؛ ليس PASS بعد.** |
| `cancel_stock_count(uuid,text)` | يتطلب profile نشطًا وصلاحية مدير/مسؤول، وجلسة مفتوحة في المؤسسة نفسها. | سبب الإلغاء مطلوب بعد التنظيف، 1–1000 حرف؛ لا يسمح بإلغاء جلسة مغلقة أو غريبة عن المؤسسة. | يقفل الجلسة ويحوّل الحالة إلى cancelled ويسجل actor وسبب الإلغاء؛ لا يحذف التاريخ أو الحركات. | **مصدر مراجع؛ قبول وحدة/خدمة متكامل ما زال مطلوبًا حيث لا تغطيه الاختبارات.** |
| `audit_stock_count_session_start()` (trigger-only) | SECURITY DEFINER; EXECUTE ممنوع عن `PUBLIC` و`anon` و`authenticated`; trigger يعيد التحقق من الجلسة والمستخدم والمؤسسة. | يُسجّل metadata معرّف المستودع والحالة والوقت؛ لا ينسخ ملاحظات أو قيم مالية أو جسمًا حرًا. | trigger يعمل عند INSERT فقط؛ إعادة idempotency لا تنشئ INSERT إضافيًا. | **عقد المصدر واضح؛ اختبار بدء الجرد الحالي يغطي سجلًا واحدًا وتطابق actor وidempotent replay.** |

### Writer interaction / race contract

- `receive_purchase_order` يستخدم `pg_advisory_xact_lock(hashtextextended(org || ':purchase-receiving-warehouse:' || warehouse, 0))` قبل إنشاء أرصدة ناقصة، ولذلك فهو مصدر سباق حقيقي مع لقطة الجرد.
- التحويل المفرد/الدفعي وإرجاع المخزون ومصالحة Onyx تقفل المستودع/المنتج/الأرصدة وفق عقود كل منها؛ يجب إبقاء ترتيب الأقفال متسقًا مع guard الجديد، وإعادة اختبارات سباق التحويل المفرد/الدفعي واستلام المشتريات والجرد بعد دمج #172.
- لا تجعل اختبار SQLSTATE 40001 وحده إشارة قبول كافية: يلزم إثبات عدم وجود حركة أو ترحيل جزئي عند رفض الإكمال، وصحة حالة الجلسة/الإلغاء وسجلات التدقيق، وإعادة تشغيل بوابات Core/P2/PG17 على رأس الدمج النهائي.

### Updated DQS follow-up state

الخلل في `calculate_import_job_quality(uuid)` لا يزال غير موجود إصلاحه في `main` حتى دمج التسلسل المعتمد. #162 يضيف الإصلاح والاختبارات، وقد اجتاز Core/P2/PG17 على الرأس `e5ca28bb81a605f4e6628baa7abbdc1b5c7216f8`، لكن الحالة الصحيحة قبل التحديث/إعادة الاختبار هي **OPEN — PR tested, independent review and ordered integration pending**, وليس “لم يتم تنفيذ شيء” ولا PASS للإنتاج. #167 أُغلق كنسخة مكررة من #162.


## الدفعة الدلالية التاسعة — التحصيل، ترحيل مصادر المالية، والمصروفات والعكس (مراجعة مصدر؛ القبول المتكامل جزئي)

المصادر: `20261023235900_customer_payment_idempotency.sql`، `20261023220000_customer_payment_credit_balance_guard.sql`، `20261020030000_accounting_customer_source_posting.sql`، `20261020020000_accounting_source_posting.sql`، `20261023200000_accounting_general_journal_reversal.sql`، `20261019100000_finance_cash_expenses.sql`.

| RPC / trigger | الهوية/المؤسسة والمنح | قيود الإدخال والأثر التجاري | التكرار والتزامن والتدقيق | الحالة |
|---|---|---|---|---|
| `record_customer_payment(uuid,numeric,text,uuid,text,text)` | SECURITY DEFINER، `search_path=''`; يتطلب `auth.uid()`، profile نشطًا مطابقًا لـ`auth_user_id`، `can_manage_finance()`، ومؤسسة مشتقة من profile الخادم. استعلام الفاتورة مقيّد بـ`id + organization_id`. التنفيذ ممنوح لـ`authenticated` فقط بعد سحب PUBLIC/anon. | يرفض invoice/key المفقودين والكمية null/غير finite/≤0/غير مقربة إلى خانتين، ويقيد طريقة الدفع ويقص reference/notes. يتحقق من الفاتورة غير الملغاة، عملة وائتمانات الفاتورة، والمدفوعات/الائتمانات المنشورة، ويرفض تجاوز الرصيد المتبقي. يعيد UUID الدفع بعد كتابة واحدة؛ لا يرحّل قيد الأستاذ تلقائيًا. | مفتاح تكرار scoped بالمؤسسة + fingerprint لحمولة invoice/amount/method/reference/notes؛ إعادة الحمولة نفسها ترجع سجل الدفع نفسه، واختلاف الحمولة يرفض. بعدها يستخدم advisory lock خاص بتسوية الفاتورة، متوافقًا مع قفل ترحيل credit memo، قبل حساب الرصيد وإدخال الدفع. | **مراجعة مصدر إيجابية؛ اختبارات سباق متكاملة للدفع مقابل ترحيل credit memo لا تزال شرط قبول واضحًا على الرأس النهائي.** |
| `create_customer_invoice_journal_draft` | profile نشط ومؤسسة حالية و`can_manage_finance()`; invoice والحسابات يجب أن تخص المؤسسة نفسها؛ الحسابات نشطة ومتوافقة النوع (receivable asset، revenue، tax liability). | يرفض الفاتورة void، ويقصر الترحيل الحالي على YER حتى تعتمد سياسة FX؛ يتحقق من subtotal + tax = total ومكونات الضريبة. ينشئ draft بسطور مدين/دائن متوازنة وسجل مصدر وتدقيق؛ الترحيل النهائي عملية منفصلة ومصرح بها. | advisory lock على invoice، fingerprint للحقول المصدرية ومخطط الحسابات، ويرجع القيد الموجود إذا تطابق fingerprint؛ يرفض key مستخدمًا لعملية أخرى. | **مراجعة مصدر؛ اختبار PG17 للتزامن/العملة/إعادة المحاولة يجب ربطه بالرأس المقبول.** |
| `create_customer_payment_journal_draft` | finance staff نشط، الدفع والفاتورة والحسابات ضمن المؤسسة نفسها؛ يلزم حساب تسوية asset نشط وفاتورة YER لها قيد منشور. | ينشئ مسودة قيد مرتبطة بمصدر الدفع؛ يتحقق من عدم تجاوز إجمالي المدفوعات إجمالي الفاتورة، ولا يعتمد تحديث رصيد محاسبي قبل الترحيل الصريح. | advisory lock على payment ID، fingerprint للمبلغ/العملة/الفاتورة والحسابات؛ يمنع mapping مختلفًا لقيد قائم أو إعادة استخدام مفتاح قيد آخر، ويكتب audit. | **مراجعة مصدر؛ يلزم إثبات اختبارات race مع الترحيل/الإلغاء على PG17.** |
| `record_cash_expense` / `void_cash_expense` | التسجيل: profile نشط و`can_manage_finance()`; الإبطال: دور مدير/مسؤول مخول، ومصروف من المؤسسة نفسها؛ revoke PUBLIC/anon مع grant authenticated. | يرفض المفتاح المفقود/المدخلات المالية غير الصحيحة؛ إبطال المسودة يغيّر حالتها مع audit، وإبطال مصروف منشور ينشئ قيد عكس مصدره داخل المعاملة، لا يمحو تاريخ الترحيل. | unique tenant/idempotency key وpayload conflict check عند التسجيل؛ `FOR UPDATE` على المصروف عند الإبطال؛ audit للإنشاء/الإبطال/العكس. Trigger عكس المصروف المنشور يراجع وجود قيد مصدر منشور ويعيد التوازن. | **مراجعة مصدر؛ يلزم قبول متكامل لسباق الإبطال مع الترحيل وإثبات عدم التكرار.** |
| `reverse_general_journal_entry(uuid,text,uuid)` | profile نشط في المؤسسة و`operational_tasks_can_manage()`؛ القيد الأصلي مطلوب في نفس المؤسسة. GRANT authenticated only. | السبب 5–500 حرف؛ يسمح بعكس قيود manual/adjustment المنشورة فقط، ويرفض القيود المرتبطة بمصدر حتى تستخدم سير العكس الخاص بها. يتأكد من وجود 2+ سطور ومن توازن مدين/دائن قبل إنشاء مسودة عكس بأسطر متعاكسة، ثم يتطلب ترحيلًا صريحًا. | advisory lock بمفتاح المؤسسة/idempotency؛ يرفض إعادة المفتاح بحمولة مختلفة، ويمنع العكس المزدوج للقيد نفسه، ويكتب سجل reversal والـaudit. Trigger الترحيل يربط العكس بالأصل ويتحقق من التوازن والمبالغ والحسابات قبل الترحيل. | **مراجعة مصدر؛ PG17 يجب أن يثبت استدعاءين متزامنين على المفتاح نفسه، وكذلك مفتاحين مختلفين للقيد الأصلي الواحد.** |
| `fetch_staff_finance_data()` | finance staff نشط ومؤسسة من profile؛ لا يقبل tenant parameter من العميل. | يبني JSON للفواتير والمدفوعات مع tenant filters وjoins على organization/customer/invoice، ويحتسب الائتمانات المنشورة في مجاميع التسوية. | يستعمل إجماليات مجمعة في الخادم، لكن قائمة المدفوعات محدودة إلى 1000 سجل دون cursor ظاهر في هذه الدالة؛ لا يجوز اعتبارها قبولًا لتصفح سجل كامل أو مجموع صفحات دون عقد pagination/aggregation مستقل. | **PARTIAL — حد 1000 معروف؛ أثبت اكتمال المؤشرات ومجموع كل الصفحات قبل إغلاق FIN-INVOICE-001.** |

### Acceptance gaps for this batch

1. اختبارات PostgreSQL 17 يجب أن تغطي منافسة دفعين يتشاركان آخر رصيد، دفع مقابل credit memo posting، نفس idempotency key مع نفس/مختلف payload، وتنافس عكسين على القيد الأصلي نفسه؛ يجب أن تكون assertions على UUID مصدر/قيد واحد وسجلات audit وإجماليات دفتر الأستاذ، لا على SQLSTATE وحده.
2. يجب اختبار منع الموظف المالي غير المخول والعميل والضيف ومستخدم مؤسسة أخرى قبل القراءة/التعديل، والتأكد من منح EXECUTE الفعلية في `pg_proc/pg_roles` مقابل عقد الدوال.
3. يجب أن تغطي معاملة العكس: القيد الأصلي يبقى منشورًا؛ العكس draft حتى الترحيل الصريح؛ لا يجوز حذف أو تعديل سطور التاريخ المنشور، ويجب أن تتوازن القيود بالعملة نفسها.
4. `fetch_staff_finance_data` يعرض حتى 1000 دفعة؛ يلزم pagination أو تجميعات خادم متفق عليها حتى لا يُعرض رصيد/تقرير كامل مبنيًا على أول 1000 فقط.


## الدفعة الدلالية العاشرة — الاستيراد المتقطع، طابور التصدير غير المتزامن، ودورة حياة العميل

المصادر المطابقة لـ`main`: `20261018060000_import_upload_chunk_contiguity.sql` (`record_import_upload_chunk`)، `20261020180000_import_job_request_idempotency.sql` (`create_import_job_idempotent`)، `20261020240000_async_export_jobs.sql`، و`20261023100000_customer_lifecycle_command.sql` (`set_admin_customer_status`).

| RPC / family | التفويض والنطاق | عقد الإدخال والأثر | التكرار والتزامن والتدقيق | حالة القبول |
|---|---|---|---|---|
| `record_import_upload_chunk(uuid,integer,bigint,integer,text)` | يستخرج المؤسسة من profile النشط الموافق لـ`auth.uid()` ويتطلب `is_staff()`; يقرأ جلسة الاستيراد بمعرفها والمؤسسة مع `FOR UPDATE`. التنفيذ للمصادق عليهم بعد سحب PUBLIC/anon. | يرفض الجلسات المغلقة/الملغاة/المنتهية؛ يتحقق من مدى رقم الشريحة وبصمة 64 hex والموضع والحجم، ويمنع تخطي الشرائح أو وجود فجوة في المقدمة. إعادة الشريحة الموجودة تقبل فقط إذا تطابق hash/offset/size. | قفل الجلسة يحمي تحديث verified_chunks من سباقين على الجلسة نفسها؛ لا يثبت ذلك وحده بصمة الملف الكامل أو ذرية commit/rollback. | مراجعة مصدر؛ اختبر جلسة من مؤسسة أخرى، شريحة مكررة بنفس/مختلف الحمولة، سباق نفس رقم الشريحة، وبصمة الملف النهائي والاستئناف. |
| `create_import_job_idempotent(...)` | يتطلب المصادقة والموظف، ويشتق المؤسسة من profile النشط. مفتاح الطلب مركب من المؤسسة والفاعل وrequest_key. | يقيد intent إلى `replace/merge/new_version` ويبني payload موحدًا للملف والمصدر والربط والفترة والنية. | `INSERT ... ON CONFLICT DO NOTHING` ثم يقفل سجل المفتاح؛ الحمولة المتطابقة تعيد job الملتزم، والحمولة المختلفة ترفض، والسجل الذي لا يترجم إلى job يفشل بخطأ تعارض بدل النجاح الوهمي. | مراجعة مصدر؛ يلزم اختبار PG17 متزامن لنفس المفتاح مع حمولة متطابقة/مختلفة وإثبات job واحد وعزل المؤسسة. |
| `request_async_export_job(text,jsonb)` | profile ومؤسسة نشطة، ودور admin/manager/accountant. لا يقبل tenant من العميل. التخزين في bucket خاص غير عام وحد ملف 25 MiB وCSV فقط. | يدعم `orders_csv`; يجب أن تكون filters object بتحويلي `date_from/date_to` فقط وتاريخين صالحين بمدى مرتب لا يتجاوز 366 يومًا. المفتاح 8–120 حرفًا من نمط محدد. | مفتاح unique بحسب المؤسسة/الفاعل مع request hash؛ التطابق يعيد job والاختلاف يرفض؛ يكتب audit عند الإنشاء. | مراجعة مصدر؛ تحقق من سياسات Storage ورابط التحميل الموقّع وتوافق metadata مع الملف النهائي. |
| `list_my_async_export_jobs` / `get_my_async_export_download` / `cancel_my_async_export_job` | تربط الاستعلامات المؤسسة والفاعل وjob ID؛ لا يكفي job ID منفردًا. صلاحية الدور مطلوبة؛ أخطاء job الأجنبي/غير الموجود لا ينبغي أن تكشف وجوده. | سجل التصدير محدود 1–50؛ تنزيل الملف يتطلب job جاهزًا وartifact سليمًا؛ الإلغاء يخضع لحالات قابلة للإلغاء ويسجل التدقيق. | يجب أن يمنع الإلغاء العامل من الإكمال لاحقًا وأن يمنع استخدام artifact بعد انتهاء الصلاحية. | مراجعة مصدر؛ اختبر معرفًا أجنبيًا/غير موجود برسالة موحدة، وسباق cancel/claim/complete، وحذف artifact منتهي الصلاحية. |
| `claim_async_export_jobs` / `complete_async_export_job` / `fail_async_export_job` / `sweep_expired_async_export_jobs` / `clear_expired_async_export_artifact` | تتطلب سياق `service_role` الموثوق ولا يجوز كشفها للعميل. تحدد حدود العامل: batch 1–10، lease 30–900 ثانية، sweep 1–200. | claim يستخدم `FOR UPDATE SKIP LOCKED`، ويحدد owner/expiry ويزيد attempts. complete يتحقق من worker والـlease ومن المسار `organization/job/orders.csv`; fail يستخدم retry bounded حتى خمس محاولات، ثم failed. | lease المنتهية تتحول إلى retry/failed؛ يجب التأكد من أن العامل القديم لا يستطيع complete بعد انتهاء lease، وأن التخزين والـDB لا يتباعدان. | مراجعة مصدر؛ يلزم اختبار عاملين متزامنين، expiry أثناء المعالجة، العامل القديم، خمس محاولات، وتطابق object storage مع حالة DB. |
| `set_admin_customer_status(uuid,text,text,text)` | profile نشط في المؤسسة الحالية ودور admin/manager؛ customer يتم تحميله بـ`id + organization_id` مع `FOR UPDATE`. | يشترط سببًا، ويستعمل expected status لتفادي الكتابة فوق حالة أحدث. الاستعادة لا تتم إلا من archived وإلى آخر حالة سابقة مثبتة في audit؛ إذا غاب الدليل يرفض بدل التخمين. | الانتقالات والسبب والفاعل والحالتين القديمة والجديدة تكتب في audit. | مراجعة مصدر؛ اختبر رفض مؤسسة أخرى، وسباق expected-status، وarchive/restore مع غياب سجل سابق، وإعادة الطلب بسرعة. |

### فجوات قبول متبقية
1. يلزم تشغيل PostgreSQL 17 على تسلسل المهاجرات النهائي، بجلسات فعلية اصطناعية لمؤسستين وأدوار مختلفة؛ مراجعة المصدر ليست قبولًا متكاملًا.
2. يلزم اختبار سياسة Storage والرابط الموقّع فعليًا؛ كون bucket خاصًا لا يثبت سلامة أذونات كل object.
3. يجب أن يثبت الاختبار أن العامل لا يستكمل job بعد lease منتهية/إلغاء، وأن retries تقف عند خمس محاولات وأن owner/tenant/path لا تتغير.
4. يجب اختبار idempotency عند الالتزام النهائي للاستيراد والتراجع، لا إنشاء job فقط، ومطابقة بصمة الملف والمقاطع عند الاستئناف.
5. قبول دورة العميل في الخدمة والواجهة المستضافة منفصل عن mocks واختبار المصدر.


## الدفعة الدلالية الحادية عشرة — دعوات تفعيل العميل، عضويات الشركة، وعناوين التوصيل

المصادر:
- `20261020140000_customer_activation_invitations.sql`
- `20261022130000_customer_company_invitation_sha256_auth_confirmation.sql`
- `20261015130000_customer_address_book.sql`
- `20261015160000_customer_company_memberships.sql`

| العملية | عقد الحماية والأثر | اختبارات القبول الموجودة | الفجوة المتبقية |
|---|---|---|---|
| `create_customer_activation_invitation(uuid,text,integer)` / `list_customer_activation_invitations(uuid)` / `revoke_customer_activation_invitation(uuid)` | الموظف والمستخدم والمؤسسة تُشتق من profile نشط؛ العميل يُقفل بـ`FOR UPDATE` داخل المؤسسة؛ عمر الدعوة 1–168 ساعة؛ token عشوائي لا يخزن خامًا بل SHA-256؛ الدعوات السابقة المعلقة تُبطل؛ الإنشاء والإبطال يسجلان audit؛ المنح مقصورة على authenticated. | `customer-activation-invitations-migration.test.ts` و`customer-activation-invitations.test.ts` مع اختبارات صفحات/حوار ومسار. | يلزم قبول متكامل لدعوة تفعيل عميل عبر حسابين اصطناعيين منفصلين، إعادة استخدام الرمز، سباق إلغاء/قبول، تطابق البريد المؤكد، ومنع ارتباط العميل بحساب موجود. |
| `accept_customer_activation_invitation(text)` | يرفض غير المصادق والملف الشخصي غير النشط والرمز غير الصحيح؛ يقفل profile والدعوة والعميل؛ يتحقق من المؤسسة النشطة ورسالة البريد المؤكد وكون الدعوة pending وغير منتهية؛ ينشئ الربط/الحالة ويكتب audit داخل المعاملة؛ replay لا يقبل حالة سابقة. | اختبار migration وservice يعملان على العقد العام، ومسار تفعيل الحساب مسجل في route tree. | يلزم سباق PostgreSQL 17 باستدعاءين للرمز نفسه، وتأكيد عدم إنشاء عضوية/ربط مزدوج، ورفض مؤسسة B دون اختلاف يكشف وجود الدعوة، وإثبات أن الفشل لا يترك حالة جزئية. |
| `create_customer_company_invitation(text,text)` / `accept_customer_company_invitation(text)` | tenant من profile؛ قفل صف الشركة؛ أدوار العضوية محصورة في buyer/finance/viewer؛ token 64-hex؛ تخزين SHA-256 للدعوات الجديدة، وتوافق MD5 محصور بالدعوات القديمة المعلقة؛ القبول يتطلب وجود `auth.users.email_confirmed_at` وتطابق البريد المحفوظ؛ يمنع عضوية نشطة ثانية ويقفل الدعوة ويكتب audit. | `customer-company-invitation-security-migration.test.ts` يثبت SHA-256 للكتابة الجديدة، توافق MD5 القديمة، تحقق البريد من auth.users، grants/RLS/SECURITY DEFINER؛ `scripts/test-company-invitation-expiry.mjs` يثبت انتهاءً دائمًا مع audit، replay مرفوض، وعضوية بلا امتياز عند فشل التأكيد؛ `company-invitation-route-security.test.ts` يمنع indexing/Referer ويزيل bearer من URL بعد القبول. | يلزم اختبار سباق قبولين، قبول متزامن مع revoke، وتغيير حالة الدعوة أثناء طلبها؛ إضافة إلى جلسات مؤسسة A/B مع أدوار customer/manager. |
| `list_customer_company_members()` / `revoke_customer_company_member(uuid)` / `revoke_customer_company_invitation(uuid)` | يستنتج الشركة من profile مالك العميل والمؤسسة الحالية؛ البحث/التحديث مقيدان بالعميل والمؤسسة والحالة؛ الإلغاء يكتب audit. قائمة الدعوات تحد آخر 100 سجل. | اختبار service/page، وexpiry migration script يغطي تنظيف الانتهاء في مسار المالك مع audit واحد. | حد 100 سجل بلا cursor معلن؛ يجب إما توثيق حد العرض أو إضافة pagination حتى لا يعتبر السجل الكامل. يلزم قبول cross-tenant وسباق revoke/accept/member-revoke. |
| `save_customer_address(...)` / `delete_customer_address(uuid)` | SECURITY DEFINER مع `search_path=''`; يحدد customer من profile المصادق عليه لا من user-supplied customer/org ID؛ يقفل صف العميل ثم العناوين؛ قاعدة فريدة تضمن عنوانًا افتراضيًا واحدًا؛ RLS تمنع القراءة العابرة وتمنع المنح المباشرة للكتابة؛ audit للتعديل والحذف. | `customer-addresses.test.ts` يختبر حقول قراءة آمنة، UUID/هاتف/رمز دولة صالح، تنظيف الحقول، عدم إرسال معرف العميل/المؤسسة، acknowledgement UUID، أخطاء قاعدة البيانات، ورفض ادعاء نجاح حذف/حفظ بلا رد صحيح. | يلزم اختبار PG17 للكتابة المتزامنة لعنوان افتراضي، عنوان A مقابل محاولة تعديل/حذف من B، ومطابقة سجل التدقيق/المالك بعد إعادة المحاولة. |
| `customer_addresses_own_read` / `customer_addresses_staff_read` وسياسات العضوية ذات الصلة | RLS تربط العنوان بالعميل والمؤسسة وprofile النشط؛ staff read مقيد بمؤسسة المستخدم النشط. لا تمنح authenticated write privileges مباشرة على جدول العناوين. | migration فيها assertion يفشل إذا حصل authenticated على INSERT/UPDATE/DELETE؛ service tests لا تمرر tenant/customer من المتصفح. | يلزم اختبار قاعدة بيانات يثبت deny لمسارات direct SQL من دور authenticated ومحاولة الوصول عبر tenant الآخر، وليس الاكتفاء بمطابقة نص migration. |

### خلاصة قبول الدفعة الحادية عشرة
المصدر يثبت وجود حواجز قوية حول tokens والعضويات والعناوين، واختبارات الوحدة/المهاجرات تغطي حالات ملموسة. لكنه لا يغلق بعد اختبارات السباق المتكامل لكل العمليات أو قبول جلسة المستخدم المستضافة. الحالة المناسبة لهذه العائلة: **PARTIAL — source contracts and several migration/unit tests verified; remaining cross-tenant/concurrency acceptance required**.


## الفجوات المفتوحة صراحة

1. مطابقة الكتالوج العام بالمصدر ورصد منح EXECUTE الفعلية: **TESTED_EXACT_SHA** على `672749855d733f691ab59de878420a210108fbbe`، 304/304 كائنات و0 مصادر مجهولة ([الفهرس](./PUBLIC_RPC_FUNCTION_INVENTORY_2026-10-24.md)). التدقيق الدلالي لكل 179 مرشح RPC واختبارات الرفض/العزل/التكرار/التدقيق: **OPEN / PARTIAL**.
2. إثبات إعداد `OUTBOX_WORKER_SECRET` و`ASYNC_EXPORT_WORKER_SECRET` في بيئة نشر فعلية: **NOT PROVEN** من مستودع Git.
3. اتصال AI بمزوّد فعلي: لا يُدّعى دون اعتماد صالح واستجابة فعلية. غياب المفتاح ينتج fallback/خطأ صريحًا.
4. اختبارات حساب العميل/المؤسسة المستضافة: **BLOCKED_EXTERNAL** إذا لم تتوفر اعتمادات اختبار غير إنتاجية مخولة.
5. عقد السعر المخفي في الكتالوج: **CLOSED_WITH_EVIDENCE** عبر [PR #145](https://github.com/Report-Engainall/Nasr1/pull/145)، المدمج على main بعد #144. العقد الجديد يعيد NULL/غياب السعر بدل sentinel صفري، مع قائمة حقول مسموحة تمنع تسرب base/tier price والتكلفة والهامش. لا تعد استخدام حالة `unit_price=0` التاريخية كحالة حالية؛ افحص regression فقط إذا ظهر مستهلك جديد أو انحدار مثبت.  
6. **DQS follow-up identified on merged #146:** `calculate_import_job_quality` currently scores each row as 100% valid whenever `status <> 'rejected'`. The base schema declares `import_job_rows.status` as free text defaulting to `pending` and no CHECK constraint, so `pending` or `invalid` rows can incorrectly earn validity points. Existing PG17 tests exercise `valid` rows and impossible dates but do not test pending/invalid status semantics. **OPEN — implement a forward migration after the outstanding 13:30–14:50 migration sequence and add PostgreSQL 17 assertions for `valid`, `invalid`, `pending`, and `rejected` statuses.** The current main does not yet include that follow-up fix.

## NEXT_ACTION

1. Poll P2 on #175 exact head `7de22e268fd5903ea6b589c0e3269c6d1b1c176c`; Core already passed. Repair only a proven failure.
2. Poll Core/P2 on the new #142 head after batch 11; previous #142 results do not transfer.
3. Update checkpoint PR #152 after #142/#175 terminal results and retest the exact new checkpoint head.
4. Preserve merge sequence #147 → #164 → #165 → #166 → #168 → #158 → refresh/retest #162 → #172; no merge without independent approval.
5. Next batch: Storage RLS/signed-download policies and customer return/credit-memo RPCs; use source plus PostgreSQL 17 allow/deny and concurrency evidence.
6. Hosted authenticated E2E, production migrations/restore, deployment, live Onyx/WhatsApp/AI remain BLOCKED_EXTERNAL/NOT RUN without authorized evidence.