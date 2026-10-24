# سجل عقود API والمهام الخلفية — Nasr1

**لقطة المصدر:** `Report-Engainall/Nasr1`، `main` عند `16a3d23e558696700bccbb3dbf9ea75b0fccf745` (24 أكتوبر 2026).  
**الحالة:** `PARTIAL` — سجل مداخل Edge Functions الخمسة موثق، وأصبح جرد كتالوج PostgreSQL 17 ومطابقة مصدر/منح الدوال العامة مختبرًا على SHA محدد (304/304، بلا مصادر غير معروفة). ما زالت المراجعة الدلالية لكل RPC مرشحة مفتوحة، كما أن أسرار الإنتاج والموصلات الخارجية غير مثبتة.

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

## الفجوات المفتوحة صراحة

1. مطابقة الكتالوج العام بالمصدر ورصد منح EXECUTE الفعلية: **TESTED_EXACT_SHA** على `672749855d733f691ab59de878420a210108fbbe`، 304/304 كائنات و0 مصادر مجهولة ([الفهرس](./PUBLIC_RPC_FUNCTION_INVENTORY_2026-10-24.md)). التدقيق الدلالي لكل 179 مرشح RPC واختبارات الرفض/العزل/التكرار/التدقيق: **OPEN / PARTIAL**.
2. إثبات إعداد `OUTBOX_WORKER_SECRET` و`ASYNC_EXPORT_WORKER_SECRET` في بيئة نشر فعلية: **NOT PROVEN** من مستودع Git.
3. اتصال AI بمزوّد فعلي: لا يُدّعى دون اعتماد صالح واستجابة فعلية. غياب المفتاح ينتج fallback/خطأ صريحًا.
4. اختبارات حساب العميل/المؤسسة المستضافة: **BLOCKED_EXTERNAL** إذا لم تتوفر اعتمادات اختبار غير إنتاجية مخولة.
5. `get_storefront_product_prices` عند إخفاء سعر البطاقة يعيد حاليًا صف المنتج مع `unit_price = 0` كسنتينل (اختبار قاعدة البيانات يثبت أن القيمة لا تمثل سعرًا فعليًا، ومكوّن العرض يخفي الصفر في DOM حتى إذا كانت سياسة العرض غير صحيحة/قديمة). لا يوجد في دليل المتصفح الحالي إثبات لتسرب قيمة مالية ظاهرة؛ لكن بقاء الصفر الرقمي داخل استجابة RPC عقد متبقٍ يحتاج قرارًا: الإبقاء عليه مع توثيق الحد، أو الانتقال إلى عقد لا يحمل مبلغًا (NULL/حذف حقل) بعد مراجعة جميع المستهلكين. **OPEN — contract review, no proven DOM leak**.  
6. Onyx Pro import/sync الحي وWhatsApp Business API الرسمي: **BLOCKED_EXTERNAL** حتى وجود بيئة مخولة واستجابة خارجية حقيقية.

## NEXT_ACTION

لا تبدأ الجرد من الصفر: اكتمل جرد 304/304 كائنات المصدر والمنح، واختُبرت دفعتان دلاليتان: مسارات المالية/التصدير/الاستيراد/الجلسات في القسم الأول، وتصحيح تفويض سعر العميل في [PR #144](https://github.com/Report-Engainall/Nasr1/pull/144) في القسم الثاني. تابع بقية المرشحين الـ179 ضمن مجموعات قابلة للاختبار، دون تكرار ما ثبت: أولًا القيود/الفواتير/الدفعات/الإشعارات الدائنة التي لا يغطيها الاختبار الحالي، ثم صلاحيات المخزون/الاستيراد/التصدير، ثم العملاء/الدعوات/الأدوار. وثّق لكل RPC تحقق المؤسسة والدور وحدود المدخلات والتزامن/الاست idempotency والمخرجات والأخطاء والتدقيق على SHA واحد. أبقِ عقد `unit_price=0` عند إخفاء سعر البطاقة مفتوحًا حتى مراجعة كل مستهلك؛ لا تغيير ضمني. الأسرار/الموصلات الخارجية وحساب العميل المستضاف `BLOCKED_EXTERNAL`; لذلك يبقى `API-OPS-001` `PARTIAL` حتى إكمال المراجعة الدلالية.