# بروتوكول التنفيذ المتوازي — P2 بالتنسيق مع P1
التاريخ: 2026-10-21
المستودع الوحيد: Report-Engainall/Nasr1
فرع P2: feat/p2-customer-return-intake-20261020
PR P2: https://github.com/Report-Engainall/Nasr1/pull/18
SHA عند بدء أصل البروتوكول: 3709d6bb27e15a3eda1e632c0c30b10a3787236d؛ التزامن الحالي مع main تم في 2ecc14e4235039e9378c87e9df44517f74ce82be.

## 1. قاعدة التشغيل
هذا البروتوكول يفتح جبهات العمل بالتوازي ولا يسمح بتحويل «وجود كود» أو «نجاح فحوص عامة» إلى ادعاء اكتمال. يُغلق كل بند فقط عند وجود مسار واجهة/خادم/قاعدة بيانات حيث يلزم، وصلاحيات موثقة، واختبار سلبي/تزامن مناسب، ودليل CI على SHA النهائي. اختبارات المتصفح والبيئة الإنتاجية محاور مستقلة.

- P1 يملك ملفات الدمج المصدرية وسجلاته، بما فيها Storefront وAPI وAghbariApp وrouteTree.gen.ts وpackage.json وcommerce-checks workflow وSOURCE_INTEGRATION_LEDGER.csv وREADY_TO_REUSE_FILE_AUDIT.csv وPROGRAMMER_1_CURRENT_REPORT.md.
- P2 يملك WORK_COORDINATION.md وCURRENT_EXECUTION_STATE.md وEXECUTION_LOG.md وPROGRAMMER_2_CURRENT_REPORT.md وبروتوكول P2 هذا واختبارات/مكونات P2 غير المتعارضة.
- لا يستبدل أي مبرمج نسخة ملف مشترك كاملة. قبل تغيير مسار محمي: تعليق مسار/بصمة على PR المعني، موافقة مالك المسار أو تسليم صريح، ثم patch محدود يدمج التغييرين.
- لا تُدمج PR #18 وPR #26 بالتزامن. يُحدَّث كل فرع إلى main الحالي، وتحل تعارضاته مع اختبارات قبول جديدة، ثم يتم الدمج المتسلسل.
- لا يُنسب PASS إلى SHA لاحق اعتمادًا على CI SHA أقدم؛ يُسجل رأس الكود والـCI ونتيجة الاختبار لكل محور.

## 2. سجل الجبهات المتوازية

| الجبهة | المالك/المسار | الحالة التنفيذية الحالية | معيار الإغلاق |
|---|---|---|---|
| دورة المرتجع الكاملة | P2: migrations وRPCs ومكونات CustomerReturn* وP2 E2E | إثبات Chromium المخصص لدورة المرتجع نجح على main-sync SHA `2ecc14e4235039e9378c87e9df44517f74ce82be` ضمن [P2 Playwright 39653248451](https://github.com/Report-Engainall/Nasr1/actions/runs/39653248451): طلب عميل → منع أدوات الإدارة عن العميل → مراجعة المدير → استلام وفحص المخزن → مسودة إشعار دائن مرتبطة بالفاتورة. نجح أيضًا قبول PostgreSQL 17 لترحيل المصروفات/القيد/التدقيق/تزامن الإلغاء والترحيل في التشغيل نفسه. الإشعار بقي مسودة؛ لم يُثبت استرداد نقدي أو نشر قيد الإشعار الدائن. | إبقاء قبول PostgreSQL وحدود الكميات/التكرار والتزامن محمية، ثم قبول مستقل لترحيل/عكس قيد الإشعار الدائن على المصدر الفعلي؛ لا نقد مسترد ولا ضريبة مستنتجة. |
| خصوصية الأسعار في المتجر | P1 يملك src/components/Storefront.tsx وsrc/lib/api.ts؛ P2 يملك helpers/renderers | حارس P2 fail-closed ومكونات Product card/detail وcart/order موجودة على PR #18؛ تكامل العرض الفعلي في Storefront لم يُثبت بعد. تعليق التنسيق على PR #26 رقم 6323249569. | دمج show_price_on_cards على card/detail، وكتم صفر الإخفاء، واستخدام preview_customer_order_pricing المناسب لكل سطح، ومنع تسرب base_price/cost/margin/tenant metadata، واختبارات مخرجات المتصفح على بيانات سليمة ومخفية ومفقودة ومعطوبة وفشل RPC. |
| دعوات تفعيل العميل | P1 يقود PR #26؛ P2 يملك قبول SQL المرجعي والاختبارات المحلية | PR #26 الآن على head `6974e2c6361c67ba6632d3ace3767a87bfc9f8f6` وما زال Draft. CI الأساسي [39653605115](https://github.com/Report-Engainall/Nasr1/actions/runs/39653605115) نجح على SHA نفسه. لكن [P2 Playwright 39653605064](https://github.com/Report-Engainall/Nasr1/actions/runs/39653605064) فشل قبل إنشاء fixture أو تشغيل أي اختبار متصفح بسبب migration `20261021150000_customer_cart_atomic_checkout.sql` عند `DROP TRIGGER`/`CREATE CONSTRAINT TRIGGER`، خطأ SQLSTATE 42601: multiple commands in a prepared statement. P2 سجل السبب الجذري في comment `6323610588`؛ هذا migration مملوك لـP1 ولم يُعدّل من P2. | إصلاح توافق تنفيذ المهاجرة دون إسقاط قيد السلة الذري، ثم إعادة تشغيل PostgreSQL 17/Chromium على SHA جديد؛ بعد ذلك فقط إثبات routeTree والنافذة/التفعيل وإزالة Draft. |
| توقعات المبيعات والسيناريوهات | PR #27، مع تنسيق P1 لملف ExecutiveStoreAnalytics.tsx | اختبارات/كود forecast موجودة على PR #27؛ CI 39467476202 نجح على SHA caa1f4101428655518435783051a03b29aa90e04. لا يوجد إثبات متصفح مخصص على صفحة التقارير. | إثبات دخول لوحة التوقعات من /admin/reports، وإظهار unavailable للبيانات الناقصة أو المتعارضة، وفصل السيناريو الافتراضي عن المبيعات الفعلية وعدم حفظه كسجل مبيعات. |
| ربط المصروف بدفتر الأستاذ | P2: scripts/test-cash-expense-journal-posting.mjs وP2 workflow | نجح الاختبار المخصص على SHA `2ecc14e4235039e9378c87e9df44517f74ce82be` داخل [Playwright 39653248451](https://github.com/Report-Engainall/Nasr1/actions/runs/39653248451): حفظ المصروف، منع تكرار المصدر وتعارض الحمولة، مسودة قيد متوازنة، رابط source posting ثابت، صلاحيات وتدقيق، ظهور في الأستاذ العام، وسباق post/void ينتهي بقيد عكسي واحد متوازن أو رفض الترحيل. | يبقى قبول مصدر إيصالات الشراء/أوامر الشراء وقيود الإشعارات الدائنة والإلغاء/العكس لكل نوع مستند جبهة منفصلة. |
| بقية ترحيل مصادر الأستاذ | P2 | يوجد قبول مفصل للفواتير والمدفوعات والعكس في test-database-migrations.mjs؛ قبول المصروف كان غير مستقل. يجب مواصلة التحقق من إيصالات الشراء/المشتريات، الإلغاءات، مصادر المرتجع وOnyx. | لكل مصدر: مسودة مرتبطة بهوية المصدر، منع التكرار، مدين=دائن، source guard وقت الترحيل، tenant/role guard، عكس ذري، وتطابق التقارير مع القيود المرحلة فقط. |
| التقارير المالية والمطابقة | P2 بالتنسيق مع P1 | Finance parity snapshot/تقارير الأستاذ موجودة؛ فجوات reconciliation لم تُغلق كليًا. | بيانات فعلية فقط، استبعاد المسودات/المعكوس/المصدر المكرر وفق السياسة، ومطابقة نتائج التقارير مع قيود الأستاذ على قاعدة PostgreSQL. |
| التسعير الجماعي الذري | P1 لواجهة/أوامر الكتالوج مع قبول P2 غير المتعارض | المهاجرة `20261019130000_product_price_grid_actual_price_tables.sql` تنفذ كتابة ذرية وتراجع الدفعة كلها عند الصف الغريب/المؤسسة الأخرى، مع `FOR UPDATE` وexpected-value guard وتدقيق actor/old/new؛ القبول القديم داخل `test-database-migrations.mjs` يثبت ذلك مبدئيًا. أضيف الآن سكربت P2 منفصل `scripts/test-price-grid-atomicity.mjs` إلى workflow المحلي لاختبار صفّين، نتائج IDs، عودة كل شيء عند فشل الصف الثاني دون تدقيق جزئي، تكرار IDs، سباق stale writers ورفض العميل؛ الحكم النهائي قيد انتظار CI على SHA الناتج. | نجاح الاختبار الجديد على SHA النهائي، ثم إبقاء واجهة الشبكة تعرض نتيجة committed row count/IDs أو رسالة فشل صريحة مع عدم حفظ أي صف؛ لا يدّعي قبول السعر الرقمي من المتصفح. |
| المخزون والنقل والتزامن | P1 للكتالوج/النقل وP2 لـOnyx reconciliation | نقل الدفعات وOnyx apply/rollback لهما مسارات واختبارات سابقة؛ قبول الرأس المشترك بعد تحديث main ما يزال مطلوبًا. | اختبار PostgreSQL للتزامن، الحجز، oversell، تعارض الرصيد، idempotency، rollback مع حركة أحدث، وسلامة tenant/source snapshot. |
| مركز الاستيراد وجودة البيانات | P1 يملك UnifiedImportEngine / scripts integration | توجد مهاجرات idempotency واختبارات DQS وصيغ CSV/XLSX؛ يلزم rebase/CI على الرأس النهائي وفحص دورة resume/cancel. | validate-before-write، منع التكرار، صفوف ناجحة وفاشلة بمراجع واضحة، إلغاء/استئناف لا يكرر الكتابة، تهريب الصيغ، لا تحديث مخزون ضمني عند snapshot import. |
| Onyx وسجلات المصدر | P2 يملك reconciliation/evidence؛ P1 يملك importer | reconcile/apply/rollback وsource evidence موجودة، لكنها لا تثبت اتصال Onyx حيًا أو مزامنة بعيدة. | ذكر source snapshot وexternal IDs ووقت/حالة/خطأ sync؛ لا تظهر «تمت المزامنة» إلا مع استجابة نجاح فعلية؛ اختبار tenant وreplay وsource drift. |

## 3. تسلسل القبول وإدارة الفشل
1. استخرج رأس الفرع الحي، والرأس الأساسي main، وآخر CI والـjobs لكل Workflow؛ لا تعتمد على README أو ملخص قديم.
2. نفّذ الاختبارات المحددة للجبهة على PostgreSQL 17/محاكي محلي معزول. لا تُنشأ مستخدمون أو معاملات في قاعدة مستضافة أو إنتاج.
3. إذا فشل الاختبار: احفظ نص الخطأ، وعينة السياق/SQL/step؛ حدّد هل هو سلوك أو assertion أو تهيئة؛ أصلح السبب الجذري؛ ثم أعد الاختبار.
4. بعد قبول كل دفعة، حدّث السجلات المملوكة لك مع إبقاء الفشل السابق وسبب الإصلاح. لا تمحُ التاريخ ولا تغيّر فشلًا قديمًا إلى PASS.
5. قبل merge: احسب فرق main، افحص المسارات المتقاطعة، حدّث الفرع دون force push غير مبرر، ثم شغّل CI على الرأس الناتج نفسه. إذا كان الدمج يتطلب مسارًا مملوكًا لـP1، أرسل طلب handoff محددًا بالبصمة قبل التعديل.
6. عالج الجبهات بالتوازي عبر مالك مستقل واختبارات منفصلة، لكن لا تُجرَ تغييرات متزامنة على نفس الفرع أثناء Workflow مطلوب إثباته؛ بعد أي push، أعد قراءة تشغيلات SHA الجديد.
7. معايير الحقيقة: IMPLEMENTED ≠ INTEGRATED؛ CI PASS ≠ BROWSER PROVEN؛ BROWSER PROVEN ≠ PRODUCTION PROVEN؛ وجود ملف ≠ اكتمال المواصفة.

## 4. حالة الفروع الحالية — قراءة مباشرة بتاريخ 2026-10-21
- main: `ccbc82ffe36d52beb7e9fe1ab1cb17f4de358f21`.
- فرع P1 / PR #26: head `6974e2c6361c67ba6632d3ace3767a87bfc9f8f6`، PR مفتوح وDraft. [Commerce checks 39653605115](https://github.com/Report-Engainall/Nasr1/actions/runs/39653605115) SUCCESS على الرأس نفسه. [P2 Playwright 39653605064](https://github.com/Report-Engainall/Nasr1/actions/runs/39653605064) FAILURE قبل fixtures/browser بسبب migration `20261021150000_customer_cart_atomic_checkout.sql` (SQLSTATE 42601: multiple commands in a prepared statement); اختبارات الطلب والمرتجع skipped وليست فاشلة سلوكيًا.
- P1 next task وفق `PROGRAMMER_1_SINGLE_BOOT_ENTRYPOINT.txt`: `NASR1-SOURCE-UNASSESSED-MIGRATION-SEMANTIC-GAP-011-AGHBCOM-ORDER-INPUT-0011`. هذا مؤشر مستقل لا يستبدل مهمة P2 الحالية.
- فرع P2/PR #18: تزامن مع main عبر merge commit `2ecc14e4235039e9378c87e9df44517f74ce82be` ذي parent ثانٍ `ccbc82ffe36d52beb7e9fe1ab1cb17f4de358f21`. المقارنة الحالية `main...P2` = 35 ahead / 0 behind. [Commerce checks 39653248172](https://github.com/Report-Engainall/Nasr1/actions/runs/39653248172) و[P2 Playwright 39653248451](https://github.com/Report-Engainall/Nasr1/actions/runs/39653248451) SUCCESS على merge SHA نفسه.
- فرع PR #27: head `caa1f4101428655518435783051a03b29aa90e04`، [Commerce checks 39467476202](https://github.com/Report-Engainall/Nasr1/actions/runs/39467476202) SUCCESS؛ اختبار المتصفح على `/admin/reports` لا يزال مطلوبًا.
- حافظ على سياسة P1: لا reset/clean/force-push ولا كتابة على main مباشرة؛ اقرأ head قبل كل دفع واستخدم expected-head. لا تعدل `SOURCE_INTEGRATION_LEDGER.csv` أو `READY_TO_REUSE_FILE_AUDIT.csv` أو `PROGRAMMER_1_CURRENT_REPORT.md` أو `PROGRAMMER_1_SINGLE_BOOT_ENTRYPOINT.txt`؛ هذه ملكية P1. تحديثات P2 تبقى داخل ملفات P2 وسجلات P2.
- لا تدمج PR #18 وPR #26 بالتزامن؛ لا تُزال حالة Draft من PR #26 قبل إصلاح migration failure وقبول route/UI/browser.

## 5. التعليقات التنسيقية المسجلة
- PR #26 — price privacy/activation/scope coordination: https://github.com/Report-Engainall/Nasr1/pull/26#issuecomment-6323249569
- PR #27 — forecast page/browser acceptance: https://github.com/Report-Engainall/Nasr1/pull/27#issuecomment-6323250396
- PR #18 — return browser proof and cash-expense acceptance: https://github.com/Report-Engainall/Nasr1/pull/18#issuecomment-6323251176

## 6. نقطة الاستئناف الواحدة
next_task_id=NASR1-ORIGINAL-SPEC-CUSTOMER-PRICE-PRIVACY-RECONCILIATION-010.
هذا هو أعلى بند محجوب بملكية المسار: P2 يملك guards والـrenderers والقبول، وP1 يملك دمج العرض الفعلي في Storefront/API. بالتوازي يستمر قبول ترحيل المصروفات على PR #18، ثم يبدأ التحقق من ترحيل إيصالات الشراء/المصروفات وتقارير المطابقة في المسارات غير المتعارضة. لا تدّع إغلاق task 010 قبل أن يدمج P1 أو يسلّم المسار صراحةً ويثبت اختبارات واجهة حقيقية.


## 7. الالتزام ببروتوكول الإقلاع P1 — الحواجز المتبادلة

- المرجع الذي قرأه P2 حيًا: `docs/bolt-source-reconciliation/PROGRAMMER_1_SINGLE_BOOT_ENTRYPOINT.txt` على فرع `integration/inventory-transfer-batches-20261019-rebased`، head `6974e2c6361c67ba6632d3ace3767a87bfc9f8f6`. يميز P1 بين كود/اختبار SHA المطابق، `BROWSER_PROVEN=NOT RUN` و`PRODUCTION_PROVEN=NOT RUN`، ويمنع reset/clean/force-push والكتابة مباشرة على main، ويطلب إعادة قراءة الرأس واستعمال expected-head.
- مؤشر الاستئناف لدى P1 يبقى `NASR1-SOURCE-UNASSESSED-MIGRATION-SEMANTIC-GAP-011-AGHBCOM-ORDER-INPUT-0011`; مؤشر P2 المستقل يبقى `NASR1-ORIGINAL-SPEC-CUSTOMER-PRICE-PRIVACY-RECONCILIATION-010`. لا يكتب أي مبرمج فوق مؤشر أو سجل الآخر.
- ملكية P1 لا تزال تشمل `Storefront.tsx`, `src/lib/api.ts`, `AghbariApp.tsx`, `routeTree.gen.ts`, `package.json`, `commerce-checks.yml`, `SOURCE_INTEGRATION_LEDGER.csv`, `READY_TO_REUSE_FILE_AUDIT.csv`, `PROGRAMMER_1_CURRENT_REPORT.md` و`PROGRAMMER_1_SINGLE_BOOT_ENTRYPOINT.txt`. P2 لم يحرر مهاجرة عربة العميل التي أوقفَت تشغيل P1؛ التعليق التشخيصي المرسل إلى PR #26 هو `6323610588`.
- تتطلب أي handoff من P1: المسار الدقيق + SHA الذي يسمح به + اختبار القبول المتوقع. لا تُعتبر الموافقة الضمنية على ملف مشترك تفويضًا؛ وبعد handoff لا يؤخذ الملف كاملًا من أي فرع، بل يدمج patch محدد ثم CI كامل على SHA جديد.
