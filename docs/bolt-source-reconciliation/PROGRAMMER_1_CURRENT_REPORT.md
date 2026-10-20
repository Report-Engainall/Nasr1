# تقرير الحالة التنفيذي — المبرمج 1 / دمج ميزات المصادر الثلاثة

- **المستودع الوحيد المستهدف:** `Report-Engainall/Nasr1`
- **فرع P1 المستمر:** `integration/inventory-transfer-batches-20261019-rebased`
- **الملكية:** هذا التقرير و`SOURCE_INTEGRATION_LEDGER.csv` و`READY_TO_REUSE_FILE_AUDIT.csv` فقط.
- **المهمة الحالية / next_source_task_id:** `NASR1-SOURCE-CUSTOMER-LIFECYCLE-PARITY-001` — تكييف دورة دعوة العميل من المصدر إلى عقود Nasr1 الحالية. وصل تنفيذ التهيئة إلى الفرع، وأضيف اختبار انحدار ثابت لعقد أمان migration اجتاز CI على الرأس الدقيق `a45cdd1963137c01e30188d83ba14d8a4888cccf` ([Actions 39454365456](https://github.com/Report-Engainall/Nasr1/actions/runs/39454365456)). لكن هذا الاختبار لا يثبت سلوك قاعدة البيانات الفعلي؛ الإغلاق ما زال يتطلب ربط نافذة الدعوة بواجهة العملاء وتسجيل routeTree بواسطة P2، وإضافة قبول PostgreSQL/RLS متخصص في harness المحمي، ثم CI على الرأس النهائي الموحّد. لا يُدّعى PASS أو اكتمال تكامل الواجهة قبل هذه الشروط.
- **المهمة التالية بعد إغلاقها:** اقرأ أول عنصر مصدر غير مغلق من ledger بعد تسوية دورة العميل؛ لا تقدّم أي مهمة على أنها مكتملة قبل تحقق الواجهة/الخدمة/قاعدة البيانات/RLS/المسار والاختبارات وCI المطابق.

## 1. إغلاق تحويل المخزون متعدد الأصناف

- **الحالة:** مندمج ومختبر. [PR #3](https://github.com/Report-Engainall/Nasr1/pull/3) أُغلق بالدمج؛ [PR #2](https://github.com/Report-Engainall/Nasr1/pull/2) المكرر بقي مغلقًا دون دمج.
- **الرأس الذي اختُبر:** `01ef17b05c2bf507003efccbb897f76318e0df02`.
- **دليل CI المطابق:** [Actions 39323966139](https://github.com/Report-Engainall/Nasr1/actions/runs/39323966139) — SUCCESS على SHA المطابق؛ نجحت اختبارات الوحدة، وقبول PostgreSQL 17/RLS، وlint/build، وسموك preview/dev.
- **تغطية التحويل المثبتة:** عزل المؤسسة، التحويل الذري متعدد المنتجات، حماية المحجوز، دفتر حركات المخزون، idempotency وإعادة التشغيل/تعارض الحمولة، rollback، ورفض القراءة/الكتابة المباشرتين لجدول رؤوس الدفعات.
- **الأمان:** لم تُضف أي grants أو سياسات توسّع الوصول المباشر. لم يتغير RLS لإصلاح الاختبار.
- **المصدر:** `Report-Engainall/aghbari-commerce@00d7446bba9652ea40178a08b00c9da9a2bba8a1`, `src/services/inventory.ts`, source blob `3506707a656e0db491b860d5e11ad28daeded5cf`. بصمة المصدر وقرار التكييف موثقان بالفعل في ledger؛ لم يُعد جلب الملف المانح.

## 2. حد إجمالي بكسلات صورة المنتج — مغلق ومندمج

### التشخيص والتغيير
- **المصدر الجديد:** `Report-Engainall/aghbari-commerce@00d7446bba9652ea40178a08b00c9da9a2bba8a1`.
- **بصمات المصدر المسجلة:** `src/services/imagePipeline.ts` = `cbdc91a0444ea35ac949bd00f0eefe388700880d`؛ `src/services/imagePipeline.test.ts` = `839e6327d35718ca8d00392e090cce5d3133482a`.
- كان Nasr1 يحدد أقصى عرض/ارتفاع بـ12,000، لكنه لا يضع حدًا لمساحة الصورة المفكوكة قبل تخصيص canvas؛ يمكن لصورة حتى 12,000×12,000 أن تتجاوز حد الذاكرة المعقول. يطبق المصدر حدًا إجماليًا قدره 25,000,000 بكسل.
- **التكييف المنفذ:** أضيف `MAX_SOURCE_PIXELS = 25_000_000` داخل `src/lib/product-image.ts`؛ يُرفض الحجم الإجمالي الزائد داخل `fitProductImageDimensions` قبل تخصيص canvas. أبقينا التنفيذ الهدف الحالي: 8 MiB كحد لملف الإدخال، 1600 بكسل للإخراج، WebP، التحقق من المؤسسة/المنتج/الدور في Edge Function، ومسار رفع الخادم. لم ننسخ تدفق المصادقة/التخزين القديم ولا نضيف أي حزمة.
- **اختبارات الانحدار المضافة:** 25,005,000 بكسل مرفوضة، و25,000,000 حد صالح، وإثبات أن canvas لا يُنشأ عند الرفض وإغلاق `ImageBitmap`.
- ملفات التغيير: `src/lib/product-image.ts` blob الحالي `8fce9c518a5ee3e4bc4a74db844e67942ac07e40`؛ `src/lib/product-image.test.ts` blob الحالي `c753e417c8d3afd38f1acf80d5c3a1411bfeec8f`.
- **CI على رأس الكود المطابق:** [Actions 39332901589](https://github.com/Report-Engainall/Nasr1/actions/runs/39332901589) على `b22e3880031feae66acb7f23f165e47178cde553` انتهى **SUCCESS**. ثبتت الخطوات: تثبيت Bun والتحقق من lockfile، unit tests، تطبيق migrations وقبول PostgreSQL 17/RLS، lint، build، production-preview smoke وdev-server smoke، وتنظيف الحاويات. هذا دليل لاختبار كود الصورة على الرأس نفسه؛ browser/manual وproduction deployment غير مثبتين.
- **الإغلاق النهائي:** دُمج PR #11 إلى `main` عند `f7cffd41cd63e16c6020fe379edf27416c5e0ce8`. اجتاز تشغيل `39366594237` CI على الرأس `25bc0c969cfe8740860b19518caf21135caf67ad` لاحقًا، شاملًا 54/54 ملف اختبار و395/395 اختبارًا وقبول PostgreSQL 17/RLS وlint/build/preview/dev smoke. لا تعِد فتح المهمة ما لم يظهر فشل أو مصدر جديد أو regression.
- **سجل المصدر:** ledger يحتوي `NASR1-SOURCE-IMAGE-PIXEL-GUARD-001` و`NASR1-SOURCE-IMAGE-PIXEL-GUARD-TEST-001` بحالة `IMPLEMENTED_PENDING_EXACT_SHA_CI`. audit سجل البصمات والقرار وعدم نسخ الملفات الخام.

## 3. قرار مصدر طابور العمليات غير المتصلة

- **المصدر:** `src/services/offlineQueue.ts` blob `7d68cdb19bd15056f58a5d92527dda78346f9209`؛ اختبار المصدر `src/services/offlineQueue.test.ts` blob `df7d5c4ec370652841b89d07b255a1d4dbd468b3`.
- طابور المانح يقبل فقط وضع/حذف عنصر سلة محلي؛ لا يقبل إنشاء الطلب ولا تحديث المخزون.
- Nasr1 يملك بالفعل `src/lib/offline-cart.ts` بمسودة سلة مرتبطة بملف العميل، وادعاء ضيف لمرة واحدة، وإزالة مفاتيح legacy غير المقيدة. يُخزن المنتج والكمية فقط؛ السعر والمخزون وتأكيد الطلب تظل خادمية. اختبارات الهدف الحالية تخص هذا العقد.
- **القرار:** `DUPLICATE_PROVEN`، لا استيراد طابور ثانٍ ولا نسخ اختبارات المانح. يسجل ledger/audit القرار وبصمات المصدر ودليل الاختبارات الحالي [Actions 39329226396](https://github.com/Report-Engainall/Nasr1/actions/runs/39329226396) على `b4d1f2e9cbe1db4e34c7d82b5ca6e1880b3fe43b`. لم تُشغّل اختبارات المانح ولم يُنسخ ملفه.

## 4. عطل CI منفصل يملكه P2 — PR #6

- [PR #6](https://github.com/Report-Engainall/Nasr1/pull/6) يعمل على ربط الفواتير/المدفوعات بقيود الأستاذ، ويملك P2 التعديل على `scripts/test-database-migrations.mjs`.
- [Actions 39326813015](https://github.com/Report-Engainall/Nasr1/actions/runs/39326813015) فشل عند اختبار قيد الفاتورة في السطر 3288: الاختبار ينتظر رسالة `invoice has an active accounting journal` بينما الحارس الفعلي يعيد `invoice has accounting history; source amounts and identity cannot be changed`. هذا mismatch في توقع الاختبار؛ لا يعني فشل قاعدة المنع.
- تم إرسال تعليق على PR #6 بطلب تعديل regex الخاص بالاختبار فقط ومراجعة assertion التالي، مع إبقاء الحارس ومنع القراءة المباشرة دون تغيير. **لم أحرر ملف الاختبار المشترك أو أكتب فوق عمل P2.**
- لا تدمج PR أخرى قبل CI PASS على رأسها نفسه.

## 5. حالة سجلات المصدر والاختبارات

- قبل توثيق دورة دعوة العميل: `SOURCE_INTEGRATION_LEDGER.csv` كان يحوي 116 صف بيانات و`READY_TO_REUSE_FILE_AUDIT.csv` كان يحوي 78 صف تدقيق. أضيفت 3 قرارات صريحة عن ملفات المانح الثلاثة لهذه المهمة؛ لم تُنسخ الملفات القديمة خامًا. بعد تسجيل اختبار أمان migration كعنصر مستقل: 120 صف بيانات في ledger و81 صف تدقيق في audit.
- **Service Worker:** تم إثبات تنفيذ حد التخزين المؤقت واختباره على SHA `93f6d6b3f19f4d94e075b8b6bd0ea8892dbe06b0` في [Actions 39444658074](https://github.com/Report-Engainall/Nasr1/actions/runs/39444658074). وحدة الاختبار، PostgreSQL 17/RLS، lint/build، preview وdev smoke جميعها SUCCESS. لا يوجد دليل browser/production.
- **تصدير الكتالوج:** القرار `ALREADY_PRESENT_BETTER` قائم؛ يستخدم Nasr1 التصدير الحالي CSV/XLSX وتهريب حقن الصيغ وحدود الصفوف، ولا يستورد مكون المانح القديم.
- لا تعني هذه الصفوف أن كامل المستودعات المانحة قد أُغلق؛ تستمر مراجعة العناصر غير المغلقة حسب task IDs المسجلة.

## 5.1. مراجعة حدود PWA وتكافؤ تصدير الكتالوج — 2026-10-20

- مصدر Service Worker: `Report-Engainall/aghbari-commerce@00d7446bba9652ea40178a08b00c9da9a2bba8a1`, `public/sw.js`, blob `53936f83f2340c0e2d450edaa20db85619e8cf01`. استُخدم كمرجع فقط لأن سياسة التخزين في المصدر أوسع من سياسة Nasr1.
- `public/sw.js` في الهدف بقي بسياسة أشد تقييدًا: التنقلات المخبأة محدودة إلى shell الجذر، ومسارات المصادقة وREST/RPC والتخزين والدوال لا تُحفظ ضمن cache. الاختبار `src/test/service-worker-cache-boundary.test.ts` اجتاز CI المذكور أعلاه على SHA المطابق.
- مصدر تصدير الكتالوج `Report-Engainall/aghbari-commerce/src/ExportPanel.tsx`, blob `3526a3232cce9159ab6554797e7afa8f49f7129e`، يستخدم عقد SKU/شرائح سعر قديمًا؛ هدف Nasr1 الحالي أشمل وفق schema الحالية. قرار `ALREADY_PRESENT_BETTER`، دون نسخ.

## 6. دورة دعوة تفعيل العميل — تشخيص وتكييف جارٍ

- المصادر الثلاثة الجديدة التي تمت قراءتها مرة واحدة بعد التحقق من غياب قرار blob مسجل: `src/CustomerActivation.tsx` = `a51b02c18a083ba53e87ce1c4d2865206d2d587b`؛ `src/CustomerPanel.tsx` = `48fd6183f5b318337336d6e5af3e371279ff0e3a`؛ `src/services/customerInvitations.ts` = `8daf05fbb2d65988f06cca0db3d8ede43c439cd8`، من `Report-Engainall/aghbari-commerce@00d7446bba9652ea40178a08b00c9da9a2bba8a1`. لن يُعاد جلب هذه blobs ما دامت البصمات ثابتة.
- قرار عدم النسخ: خدمة المانح تقرأ `customer_invitations` مباشرة وتتصل بـRPCs ومخطط شرائح قديم وبمسار `/?invite=`; لا يُنقل أي من ذلك. الهدف يستخدم جدولًا منفصلًا `customer_activation_invitations` مع إلغاء الوصول المباشر للجدول إلى `PUBLIC, anon, authenticated`، ويتيح العمليات عبر RPCs `SECURITY DEFINER` ذات تحقق المؤسسة/الموظف/العميل وتخزين hash للرمز وتدقيق.
- تنفيذ الهدف الموجود جرى تحصينه في هذه التغييرات: الحفاظ على رمز العميل الصحيح فقط في مسار إعادة توجيه تأكيد البريد (ومن دون تمرير معاملات عامة)، إزالة رمز الحامل من عنوان المتصفح بعد قبول الدعوة، ورفض قبول الدعوة إذا كان الحساب موظفًا عبر `public.is_staff()` بالإضافة إلى فحوص الأدوار الموجودة.
- أضيفت اختبارات وحدات لعقد خدمة الدعوات، صفحة التفعيل، نافذة الدعوة، ومنطق إعادة توجيه البريد. **لم تُشغَّل محليًا في هذه الجلسة**؛ نُفّذت عبر CI على الرأس الدقيق المذكور أدناه: 59/59 test files و417/417 tests ناجحة. هذا نجاح مجموعة الاختبارات العامة للمشروع؛ لا يُغني عن اختبارات PostgreSQL المتخصصة لدعوات التفعيل التي لا تزال بانتظار P2.
- **حظر الإغلاق الحالي:** `src/components/AghbariApp.tsx` و`src/routeTree.gen.ts` و`scripts/test-database-migrations.mjs` مسارات محمية/مشتركة يملك P2 تنسيقها. أُعد طلب patch محدد إلى P2 لربط نافذة الدعوة بصفوف العملاء، توليد الشجرة من route الملف الجديد، وإضافة اختبارات قبول PostgreSQL تُثبت منع SELECT المباشر وتحقق RPCs من المؤسسة/البريد/الرمز ودور الموظف. لم تُعدّل هذه المسارات، ولم تُخفف RLS.
- البصمات الحالية للملفات المعدلة: `src/lib/auth.tsx` = `90664574dcb68fa3113efd6b7120925adec1fa7e`; `src/components/CustomerActivationInvitationPage.tsx` = `2afb92b62346c22315ce35577a933284e1c8b43a`; `supabase/migrations/20261020110000_customer_activation_invitations.sql` = `cef9cb41c88620114af4c37761515a1b177538b5`; `src/lib/auth-redirect.ts` = `59f73ab50a940c5cf9bd79d142de522733c3252b`; الاختبارات الجديدة: `src/test/auth-redirect.test.ts` = `e4185e948bafac0be0de6af329edb60637b2c778`, `src/test/customer-activation-invitations.test.ts` = `2ff098ebc1a30aec26b4e5be89867f07c5cf2168`, `src/test/customer-activation-invitations-page.test.tsx` = `8d4378758855914c6de2c31192018d4e99afb08c`, `src/test/customer-activation-invitations-dialog.test.tsx` = `6de0954b2f0fdd19134db99f26b2f1ac03eb874d`.
- **دليل CI الكامل على كود الميزة:** [Actions 39450307654](https://github.com/Report-Engainall/Nasr1/actions/runs/39450307654) على الرأس المطابق `0dc58452401e762553a0c1993ded83dc0b614ea2` انتهى `SUCCESS`: 59/59 test files، 417/417 tests، تطبيق migrations وقبول PostgreSQL 17 الحالي، lint، build، preview smoke على 4173، وdev smoke على 5173. هذا التشغيل يثبت اجتياز المجموعة الحالية وليس اختبارات دعوات التفعيل المتخصصة؛ لم يكن مقطع قبول خاص بجدول/RPC الدعوات قد أضيف إلى harness بعد. لم يُشغّل runtime محلي ولا browser أو production حقيقي.
- **دليل الرأس التوثيقي المطابق:** [Actions 39451065591](https://github.com/Report-Engainall/Nasr1/actions/runs/39451065591) اكتمل `SUCCESS` على رأس التوثيق `0428b9337ad9d492c43f5bf18c8fa902e583c6a9` الذي حدّث التقرير والـCSV فقط: وحدة الاختبارات، PostgreSQL 17، lint/build، preview 4173 وdev 5173 جميعها ناجحة. هذه نتيجة منفصلة ومطابقة للرأس المذكور؛ لا تعني إغلاق حواجز P2 المتبقية.
- **حالة التكامل:** PR [#26](https://github.com/Report-Engainall/Nasr1/pull/26) ما زال Draft وغير مدمج. `src/components/AghbariApp.tsx` و`src/routeTree.gen.ts` و`scripts/test-database-migrations.mjs` يملكها P2. أُرسلت طلبات محددة إلى [PR #18](https://github.com/Report-Engainall/Nasr1/pull/18) لإضافة زر/نافذة الدعوة، توليد المسار، واختبارات مباشرة تثبت رفض الوصول إلى الجدول والتحقق من RPCs. لم يرد P2 حتى آخر قراءة، ولم تُظهر قائمة ملفات PR #18 تعديل المسارات الثلاثة. أُرسل تحديث بالأدلة إلى PR #18 في التعليق 6294902282 بعد نجاح Actions 39451065591.
- **التحصين الأمني:** فحص تأكيد البريد يعتمد على `auth.users.email_confirmed_at` الموثوق بدل claim غير مضمون في JWT ([Supabase JWT Claims Reference](https://supabase.com/docs/guides/auth/jwt-fields)). RLS مفعّل ولا توجد صلاحيات جدول مباشرة لـ`authenticated`؛ لا تدمج حتى تُنجز تبعيات P2 ويُشغّل CI على الرأس النهائي الناتج. تحديث التقرير وCSV بعد تشغيل CI سيغيّر الرأس التوثيقي، لذا يلزم CI آخر على رأس التوثيق الجديد قبل أي دمج.

## 6.1. قراءة CI على الرأس الدقيق — 2026-10-20

- القراءة الحية الأخيرة قبل تحديث سجلات P1: [Actions 39451534079](https://github.com/Report-Engainall/Nasr1/actions/runs/39451534079) انتهى **SUCCESS** على الرأس المطابق `1cb42c4416ecbeaeec55497adc0987224011f42f`. الخطوات التي تمت قراءتها من سجل الوظيفة: Bun frozen-lock verification، تثبيت الاعتماديات، Unit tests، PostgreSQL 17 migrations/core-workflow acceptance، lint، build، preview smoke على 4173، dev smoke على 5173، والتنظيف — كلها SUCCESS.
- هذا دليل عام على الرأس المذكور فقط. يلزم تشغيل CI على الرأس التوثيقي النهائي الناتج عن تحديث هذا التقرير والسجلين، ولا يجوز نقل نتيجة 39451534079 إلى رأس لاحق.
- لا يغلق هذا دورة دعوة تفعيل العميل: PR #26 ما زال Draft وغير مدمج، وربط `AghbariApp.tsx` وتوليد `routeTree.gen.ts` وقبول RLS/RPC المتخصص في `scripts/test-database-migrations.mjs` لا تزال تبعيات P2. لا تغييرات في grants أو سياسات RLS.

## 6.2. اختبار انحدار ثابت لعقد أمان migration لدعوات التفعيل — 2026-10-20

- **الملف الجديد:** `src/test/customer-activation-invitations-migration.test.ts`; Git blob الهدف `9457bbd61e506b76d2a34ee57914bb0f5fb4f591`. يراجع migration `supabase/migrations/20261020110000_customer_activation_invitations.sql` blob `cef9cb41c88620114af4c37761515a1b177538b5`.
- **دليل الكود والاختبار على الرأس المطابق:** [Actions 39454365456](https://github.com/Report-Engainall/Nasr1/actions/runs/39454365456) على `a45cdd1963137c01e30188d83ba14d8a4888cccf` انتهى **SUCCESS**؛ 60/60 test files، PostgreSQL 17 migration/core-workflow acceptance، lint، build، preview smoke 4173، dev smoke 5173، والتنظيف.
- تغطية الانحدار الثابت: RLS مفعّل؛ سحب صلاحيات الجدول المباشرة من `PUBLIC`, `anon`, و`authenticated`؛ أربع دوال `SECURITY DEFINER` مع `search_path` فارغ؛ تنفيذ RPC مسموح لـ`authenticated` فقط؛ تجزئة الرموز بـSHA-256؛ انتهاء الصلاحية؛ حواجز المؤسسة والبريد ودور الموظف وتأهيل العميل والاستخدام لمرة واحدة؛ وأحداث التدقيق.
- **دليل توثيقي منفصل:** الرأس السابق `0e393fbff8981847490d7fb04db82fc26a7e16ed` اجتاز [Actions 39454952142](https://github.com/Report-Engainall/Nasr1/actions/runs/39454952142) على SHA نفسه. يخص ذلك الحالة التوثيقية السابقة فقط؛ التعديل الحالي يضيف هذا القسم ويحتاج تشغيل CI جديد على الرأس النهائي.
- **حدود الإثبات:** اختبار Vitest يفحص نص migration فقط؛ لا يثبت منع الأدوار الفعلية من الاستعلام ولا يجري دورة RPC كاملة. تبقى اختبارات القبول PostgreSQL/RLS الخاصة بدعوات التفعيل على مسؤولية P2.  P2 acceptance fixture requirement: the current harness places email_confirmed_at in JWT claims but does not create/seed auth.users; because accept_customer_activation_invitation checks auth.users.email_confirmed_at, the P2-owned isolated test must provide an auth.users fixture. No production migration or RLS policy was changed.
## 7. حدود الدور

- الهدف الوحيد `Report-Engainall/Nasr1`. المستودعات الثلاثة للقراءة والمقارنة فقط.
- لا أتعامل مع ZIPs/الأرشيف أو استكمال المواصفة الأصلية المستقل.
- لا أعدّل `WORK_COORDINATION.md` أو `CURRENT_EXECUTION_STATE.md` أو `EXECUTION_LOG.md` أو بيانات الأرشيف.
- لا كتابة مباشرة على main، لا force-push/reset/clean، لا إنشاء فرع لكل جلسة، لا أسرار أو خدمات مدفوعة، ولا ادعاء PASS بلا رابط ورأس مطابق.


## 6.3. Live PR/CI reconciliation — 2026-10-20 19:50 Asia/Aden

- **Inventory transfer: closed and proven.** Live PR metadata for [PR #3](https://github.com/Report-Engainall/Nasr1/pull/3): `state=closed`, `merged=true`, merge commit `669c99605be1e9d9ac2a87d82ecf1514a19a6feb`, tested head `01ef17b05c2bf507003efccbb897f76318e0df02`. [Actions 39323966139](https://github.com/Report-Engainall/Nasr1/actions/runs/39323966139) completed SUCCESS on that exact head; confirmed steps included unit tests, isolated PostgreSQL 17 migration/core workflow acceptance, lint, build, production-preview smoke 4173, dev smoke 5173 and cleanup. The historical `permission denied` occurred because a fixture-inspection SELECT ran under `authenticated`; the final fix preserves direct-table denial and does not change RLS/grants. No change to PR #3 or the duplicate PR #2 was needed in this session.
- **Current source task remains `NASR1-SOURCE-CUSTOMER-LIFECYCLE-PARITY-001`.** P1 PR #26 is still open/Draft and unmerged. Live metadata head `e5a05f17b65c0feaddc60db5d64eade68deb4bd1`; [Actions 39455301568](https://github.com/Report-Engainall/Nasr1/actions/runs/39455301568) completed SUCCESS on this exact SHA. All listed generic workflow steps succeeded: frozen Bun lockfile verification, dependency install, unit tests, PostgreSQL 17 current migration/core acceptance, lint, build, preview smoke 4173, dev smoke 5173 and cleanup. This does not assert activation-specific database/RLS coverage or end-to-end UI wiring.
- **P2 dependency revalidated against live current metadata.** PR #18 is open, current head `7279a9b97532c0939a0ab5eb35773601c9a6626f`. The current changed-file list still excludes `src/components/AghbariApp.tsx`, `src/routeTree.gen.ts`, and `scripts/test-database-migrations.mjs`. The existing minimal patch has been handed off again with the current refs at [PR #18 comment 6296307002](https://github.com/Report-Engainall/Nasr1/pull/18#issuecomment-6296307002); earlier exact UI and security patches remain in comments 6294655790, 6294789770 and 6295354131. No P2-owned path was edited by P1.
- **Root cause for the outstanding test fixture:** the isolated harness sets `email_confirmed_at` only in mocked JWT claims, while `accept_customer_activation_invitation` validates authoritative `auth.users.email_confirmed_at`. P2 must seed a minimal isolated auth-user row for positive/negative activation acceptance tests. Then it must exercise tenant/email/token/expiry/revocation/staff/replay controls and prove authenticated direct `SELECT/INSERT/UPDATE/DELETE` on `customer_activation_invitations` remain denied. Use elevated role only to inspect fixtures and restore the intended role before each denial assertion. Do not alter production migration semantics, grants, or RLS to pass the harness.
- **Action taken:** posted the current-head handoff to PR #18 and refreshed the P1-owned `SOURCE_INTEGRATION_LEDGER.csv` and `READY_TO_REUSE_FILE_AUDIT.csv` with the exact-head CI reference and current P2 blockers. Their updates are commits `ebbd8c65c3d022faa3792b592629de149b9f9ecc` and `f24671bf44fb08f159382e9834e63c09a6c61427`. The report update is a further docs-only commit; its resulting SHA still requires an exact-head workflow result before that new snapshot can be described as CI-passing.
- **Boot artifact exception:** `docs/bolt-source-reconciliation/DUAL_PROGRAMMER_OPERATING_PROTOCOL.md` returned GitHub `404 Not Found` both on the default ref and the current P1 branch ref. The current `WORK_COORDINATION.md` and master handoff were read; neither was modified. Do not claim the missing file was read.

**Next action / next_source_task_id:** keep `NASR1-SOURCE-CUSTOMER-LIFECYCLE-PARITY-001` open until the P2 branch integrates the actual customer-table dialog, regenerated route tree and feature-specific PostgreSQL/RLS acceptance; then inspect combined PR/CI metadata, rebase/forward-integrate without overwriting P2-owned work, and run CI on the final exact head. Do not advance to another source while this task remains unclosed.
