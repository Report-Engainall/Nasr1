# تقرير الحالة التنفيذي — المبرمج 1 / دمج ميزات المصادر الثلاثة

- **المستودع الوحيد المستهدف:** `Report-Engainall/Nasr1`
- **فرع P1 المستمر:** `integration/inventory-transfer-batches-20261019-rebased`
- **الملكية:** هذا التقرير و`SOURCE_INTEGRATION_LEDGER.csv` و`READY_TO_REUSE_FILE_AUDIT.csv` فقط.
- **المهمة المغلقة:** `NASR1-SOURCE-CUSTOMER-COMPANY-MEMBERS-001` — ثبت أن مكوّن الهدف أفضل من المانح وأن الخدمات/المسارات/الاختبارات/مهاجرات SQL مطابقة ببصمات blob؛ لم يكن هناك نقص يستدعي نسخ ملفات أو تعديل RLS.
- **المهمة المغلقة:** `NASR1-SOURCE-FINANCE-PDF-TEST-RECONCILIATION-001` — اختبار الهدف أقوى ويحتوي جميع سلوكيات اختبار المصدر مع تغطية إضافية للمجاميع والأعمار والعملات والتقسيم إلى صفحات؛ لم تُفقد حالة اختبار من المصدر.
- **المهمة المغلقة:** `NASR1-SOURCE-CUSTOMER-WORKFLOWS-RECONCILIATION-001` — الهدف يحتفظ بالصفحات المصدرة ويضيف كفاءة وسلامة أكبر في السلة حسب الملف وأعمار الذمم؛ لم يُنسخ المكوّن القديم.
- **المهمة المغلقة:** `NASR1-SOURCE-ADMIN-PAGES-RECONCILIATION-001` — الهدف يحتفظ بلوحات الإدارة المصدرية ويضيف إدارة إعلانات المتجر على RPCs آمنة وقاعدة بيانات معزولة بالمؤسسة؛ لا ميزة مانحة مفقودة تستحق النقل.
- **المهمة المغلقة:** `NASR1-SOURCE-STOREFRONT-RECONCILIATION-001` — هدف Nasr1 أوسع وأأمن في البحث والتصنيف والعروض والتسعير والسلة غير المتصلة؛ لم تُنسخ النسخة الأقدم.
- **المهمة الحالية / next_source_task_id:** `NASR1-SOURCE-PURCHASING-SERVICE-RECONCILIATION-001` — فحص خدمة التوريد من `Report-Engainall/aghbari-commerce@00d7446bba9652ea40178a08b00c9da9a2bba8a1`: `src/services/purchasing.ts` blob `70117c47145ad81e4c0a9d973811c139ea954c2e` واختبار المدخلات `src/services/purchasing.input.test.ts` blob `8f20558e55452fa4b5a3925dc45e8485f1b37298`. مسار الخدمة غير موجود بالهدف بحسب شجرة الملفات، لكن هدفه يحتوي `PurchaseOrdersPage.tsx` و`src/lib/purchase-orders.ts` وmigration `20261019230000_purchase_orders_and_receiving.sql`; تتبع الاختلاف الوظيفي والعقد الأمني قبل أي نقل.

## 1. إغلاق تحويل المخزون متعدد الأصناف

- **الحالة:** مندمج ومختبر. [PR #3](https://github.com/Report-Engainall/Nasr1/pull/3) أُغلق بالدمج؛ [PR #2](https://github.com/Report-Engainall/Nasr1/pull/2) المكرر بقي مغلقًا دون دمج.
- **الرأس الذي اختُبر:** `01ef17b05c2bf507003efccbb897f76318e0df02`.
- **دليل CI المطابق:** [Actions 39323966139](https://github.com/Report-Engainall/Nasr1/actions/runs/39323966139) — SUCCESS على SHA المطابق؛ نجحت اختبارات الوحدة، وقبول PostgreSQL 17/RLS، وlint/build، وسموك preview/dev.
- **تغطية التحويل المثبتة:** عزل المؤسسة، التحويل الذري متعدد المنتجات، حماية المحجوز، دفتر حركات المخزون، idempotency وإعادة التشغيل/تعارض الحمولة، rollback، ورفض القراءة/الكتابة المباشرتين لجدول رؤوس الدفعات.
- **الأمان:** لم تُضف أي grants أو سياسات توسّع الوصول المباشر. لم يتغير RLS لإصلاح الاختبار.
- **المصدر:** `Report-Engainall/aghbari-commerce@00d7446bba9652ea40178a08b00c9da9a2bba8a1`, `src/services/inventory.ts`, source blob `3506707a656e0db491b860d5e11ad28daeded5cf`. بصمة المصدر وقرار التكييف موثقان بالفعل في ledger؛ لم يُعد جلب الملف المانح.

## 2. المهمة المغلقة — حد إجمالي بكسلات صورة المنتج

### التشخيص والتغيير
- **المصدر الجديد:** `Report-Engainall/aghbari-commerce@00d7446bba9652ea40178a08b00c9da9a2bba8a1`.
- **بصمات المصدر المسجلة:** `src/services/imagePipeline.ts` = `cbdc91a0444ea35ac949bd00f0eefe388700880d`؛ `src/services/imagePipeline.test.ts` = `839e6327d35718ca8d00392e090cce5d3133482a`.
- كان Nasr1 يحدد أقصى عرض/ارتفاع بـ12,000، لكنه لا يضع حدًا لمساحة الصورة المفكوكة قبل تخصيص canvas؛ يمكن لصورة حتى 12,000×12,000 أن تتجاوز حد الذاكرة المعقول. يطبق المصدر حدًا إجماليًا قدره 25,000,000 بكسل.
- **التكييف المنفذ:** أضيف `MAX_SOURCE_PIXELS = 25_000_000` داخل `src/lib/product-image.ts`؛ يُرفض الحجم الإجمالي الزائد داخل `fitProductImageDimensions` قبل تخصيص canvas. أبقينا التنفيذ الهدف الحالي: 8 MiB كحد لملف الإدخال، 1600 بكسل للإخراج، WebP، التحقق من المؤسسة/المنتج/الدور في Edge Function، ومسار رفع الخادم. لم ننسخ تدفق المصادقة/التخزين القديم ولا نضيف أي حزمة.
- **اختبارات الانحدار المضافة:** 25,005,000 بكسل مرفوضة، و25,000,000 حد صالح، وإثبات أن canvas لا يُنشأ عند الرفض وإغلاق `ImageBitmap`.
- ملفات التغيير: `src/lib/product-image.ts` blob الحالي `8fce9c518a5ee3e4bc4a74db844e67942ac07e40`؛ `src/lib/product-image.test.ts` blob الحالي `c753e417c8d3afd38f1acf80d5c3a1411bfeec8f`.
- **CI المطابق لرأس PR النهائي:** [Actions 39333274431](https://github.com/Report-Engainall/Nasr1/actions/runs/39333274431) على `f3c2a6c002e37b3adeef7028163a176717e7ff6c` انتهى **SUCCESS**: frozen lockfile، unit tests، PostgreSQL 17 migration/RLS acceptance، lint، build، production-preview smoke، dev-server smoke وتنظيف الحاويات.
- **الدمج والتحقق بعده:** [PR #11](https://github.com/Report-Engainall/Nasr1/pull/11) مغلق بالدمج إلى `main`؛ merge commit `f7cffd41cd63e16c6020fe379edf27416c5e0ce8`. أُعيدت قراءة ملفات التنفيذ من `main` وتأكد وجود حد `25_000_000` واختبار الانحدار وسجلات البصمات. browser/manual وproduction deployment غير مثبتين.
- **سجل المصدر:** ledger يحتوي `NASR1-SOURCE-IMAGE-PIXEL-GUARD-001` و`NASR1-SOURCE-IMAGE-PIXEL-GUARD-TEST-001` بحالة `IMPLEMENTED_PENDING_EXACT_SHA_CI`. audit سجل البصمات والقرار وعدم نسخ الملفات الخام.

## 3. مصالحة عضويات الشركة وجهات الاتصال — مغلق كميزة موجودة أصلًا

- **المصدر:** `Aghbari-Technologies/aghbari-commerce-evolved@d24695209b45f2352e0ba994e1f5109d7e2afc9d`. لم تُنسخ ملفات إلى Nasr1 لأن مسارات التنفيذ كانت مطابقة للبصمة أو أن تنفيذ الهدف أفضل.
- **مكوّن الواجهة:** `src/components/CustomerCompanyMembers.tsx`, donor blob `259caa2d675cd49d12864fa600b321ea73dcaae4`; target blob `d000b2526228e476586d0e0cd2873d48c259f045`. أبقينا نسخة الهدف؛ `CompanyInvitationAcceptancePage` تقبل `initialToken` اختياريًا، وبعد القبول تستبدل التاريخ بمسار ثابت يخلو من token. المانح أقدم ويقرأ query مرة واحدة ثم يكتب `pathname`.
- **الخدمة:** `src/lib/customer-company-members.ts` blob `8578774e4074cf726ecf46d9ab3b92e48045b85d` سبق توثيقها في `NASR1-REUSE-MEMBERS-001` ولا أعيد فتح ملف المصدر. خدمة جهات الاتصال `src/lib/customer-company-contacts.ts` blob `12ff3c0de70dc8e8bcc1b49e4896aad46d1b8a35` مطابقة حرفيًا للمصدر.
- **المسارات:** `/company/members` و`/company/accept-invitation` مطابقان للمانح وموجودان في `src/routeTree.gen.ts` مع تسجيل الأنواع وخريطة المسارات. `src/components/CustomerWorkflows.tsx` يعرض رابط `/company/members`.
- **البيانات والأمان:** `20261015150000_customer_company_contacts.sql` blob `2d18cee559a7d382530ffc666dc6f9798066790e` و`20261015160000_customer_company_memberships.sql` blob `81e0bfc50b2d8cd29fe96af7a7fd9b0f93a99a65` كلاهما مطابق تمامًا. يتضمنان RLS وتقييد grants على الجداول، ووظائف SECURITY DEFINER مع `search_path=''`، تحقق مالك العميل والمؤسسة والبريد/الدور، دعوة أحادية الاستخدام محددة الصلاحية، قبولًا بقفل الصف والتحقق من البريد، إلغاء العضوية/الدعوة وسجلات التدقيق. لا كتابة مباشرة إلى جداول العضويات ولا تخفيف RLS. أبقينا أيضًا migration الهدف الأحدث `20261019180000_company_member_promotion_checkout.sql`.
- **الاختبارات:** `src/test/customer-company-members.test.ts` blob `39a6b81982d22e312dcc023dccfcbc0b27b8eaf3` و`src/test/customer-company-contacts.test.ts` blob `9e4337c538e68e74ec06a4fca271e4358bd154d6` متطابقان مع المصدر. [Actions 39333274431](https://github.com/Report-Engainall/Nasr1/actions/runs/39333274431) على الرأس `f3c2a6c002e37b3adeef7028163a176717e7ff6c` نجحت في مجموعة الوحدة وPostgreSQL 17/RLS وlint/build/preview/dev. هذا دليل CI على شجرة الهدف المختبرة، وليس اختبارًا مستقلًا للمصدر المانح أو إثباتًا يدويًا في المتصفح/الإنتاج.
- **السجلات:** أضيفت 8 عناصر إلى ledger و8 عناصر إلى audit لمسارات جديدة غير مسجلة. لم يتكرر صف خدمة العضويات الذي كان مسجلًا مسبقًا، ولم تُنسخ ملفات المصدر المرجعية.

## 4. مصالحة اختبارات PDF المحاسبية — مغلقة: اختبار الهدف أوسع

- المصدر `src/lib/finance-document-pdf.test.ts` blob `24c9ee11b081d1645faf08dd1fe2f723936bc656`; هدف Nasr1 blob `f66fb316924da4843fe67ea0234e20873c6fae54`.
- احتفظ الهدف بتوليد كشف الحساب والفاتورة، فصل العملات، رفض القيم المالية الناقصة/السالبة/غير المتسقة، والتأكد من رفض طلب PDF غير المصادق عليه قبل استدعاء Supabase. زاد تغطية العمر المستحق per currency، التاريخ غير المعروف، الملخص الحسابي الرسمي باستخدام وحدات نقدية صحيحة بدون فقد دقة، reconciliation لعقد RPC، الترقيم لصفحات متعددة، تنسيق التاريخ، والمدفوعات غير الموجبة.
- الاختبار الإضافي `src/test/finance-document-pdf-source-reconciliation.test.ts` موجود بالهدف blob `c2f8adc96a50bf1a873c00a25a78a35d0a876652` ويختبر الملخص authoritative والـas-of timestamp. لم ننسخ/نشغل ملف المصدر بشكل منفصل؛ قرار التغطية قائم على المقارنة مع اختبارات الهدف. [Full CI](https://github.com/Report-Engainall/Nasr1/actions/runs/39333274431) نجح على `f3c2a6c002e37b3adeef7028163a176717e7ff6c` بما يشمل unit/PostgreSQL 17/RLS/lint/build/preview/dev. لا دليل تشغيل يدوي أو نشر إنتاجي.
- أضيف صف واحد في ledger وصف واحد في audit، كـ`ALREADY_PRESENT_BETTER`.

## 5. مصالحة CustomerWorkflows — مغلقة: الهدف أوسع وأأمن

- **البصمات:** المانح `src/components/CustomerWorkflows.tsx` blob `c7a085418aa215c89864ffa85739b4dc15b48d54`; الهدف blob `2c62fa3d331badfe0d7b205003abb3ca226b204c`. كلاهما يصدّر 11 مساحة عمل: الفواتير، كشف الحساب، عروض الأسعار، إعادة الطلب، الباركود، المساعد، وضع عدم الاتصال، عروض موظفي المبيعات، مالية الموظفين، العناوين وجهات اتصال الشركة.
- **فروق الهدف المفيدة:** انتقال مسودة السلة إلى `offline-cart.ts` المحمية بملف العميل بدل مفاتيح localStorage العامة القديمة؛ `validateCustomerPaymentInput`؛ ربط `CashExpenseLedger` و`GeneralLedgerWorkspace`؛ وكشف أعمار الذمم بصفحات محدودة وبمرجع وقت UTC وزر طباعة.
- **DB/RLS/RPC:** `20261018030000_staff_receivables_aging.sql` blob `a308eb61e253bc15a2b15b0af9f51cce5a4265c6` يعرّف `fetch_staff_receivables_aging` بصلاحية `can_manage_finance()`، و`SECURITY DEFINER` مع `search_path=''`، تحقق حدود الصفحة ومنح EXECUTE للمصادقين فقط. `20261018040000_customer_statement_full_aging_summary.sql` يقدم ملخصًا authoritative مؤرخًا لمجاميع العملاء حسب العملة. لم يتغير RLS.
- **الاختبارات:** `CustomerWorkflows.finance.test.tsx` blob `ed41c7e1f681d58a97031d4f7e514a22f2729e3c` مطابق للمصدر والهدف ويختبر رفض الدفع الزائد قبل RPC. `CustomerWorkflows.finance-aging.test.tsx` blob `51959b0a0eb98d1a06ddbd3d6952434ea31093a7` يثبت عرض تقرير الذمم والطباعة مع منع RPC/العرض للمستخدم غير المصرح له. routes مسجلة في شجرة الهدف واختبارات CI/route smoke نجحت. [Actions 39333274431](https://github.com/Report-Engainall/Nasr1/actions/runs/39333274431) نجح على الرأس `f3c2a6c002e37b3adeef7028163a176717e7ff6c` بكل مراحل unit/PostgreSQL 17/RLS/lint/build/preview/dev.
- **القرار:** `ALREADY_PRESENT_BETTER`؛ لا تستبدل ملفًا أكثر تقدمًا بنسخة مانحة قديمة. أضيف صفان إلى ledger وصفان إلى audit.

## 6. مصالحة AdminPages — مغلقة: الهدف أوسع

- **البصمات:** المانح `src/components/AdminPages.tsx` blob `0106d26a15a9eedbbf7b4c149eb535a8e408c71c`; هدف Nasr1 blob `977b578a4740f468fe1ae47764c29399c47feaac`. واجهات Notifications وAiCenter وOrderDetail وSuppliers وDevices وSettingsPage وأدوات الإدارة المصدرية باقية؛ الهدف يضيف إدارة إعلانات الواجهة ويتيح تبويبها للإداري/المدير دون توسيع إدارة الأدوار التي تبقى للإداري.
- **التتبّع التشغيلي:** `SettingsPage` يستدعي `fetchAdminStorefrontAnnouncements` و`saveStorefrontAnnouncement` في target API؛ migration `20261019110000_storefront_announcements.sql` blob `a9ae2a33a844064acfea60da96f387e9bdd546ea` ينشئ `storefront_announcements` مع RLS، ويسحب صلاحيات الجدول من `PUBLIC/anon/authenticated` ويمنح الجدول لـ`service_role` فقط. وظائف القراءة العامة تصفي بحسب المؤسسة والجمهور في الخادم، وقراءة/كتابة الإدارة تتطلب ملفًا نشطًا بدور admin/manager ونفس المؤسسة؛ دوال SECURITY DEFINER تستخدم `search_path=''`، والتحقق يشمل النص والرابط واللون والأولوية والجمهور والفترة، مع audit log.
- **واجهة العرض/الاختبار:** `StorefrontAnnouncementSlider.tsx` blob `0502aadfa8188517f85eb2ce5e0d929a9534cd1b` يحجب الروابط غير الآمنة ويستجيب إلى reduced motion؛ اختبار `storefront-announcement-slider.test.tsx` blob `c9f6c100d725a77aaba3869ce447d555c4bd88ca` يغطي العرض/التنقل/الرابط الآمن/عدم التدوير للحركة المخففة/الحالة الفارغة. [Actions 39333274431](https://github.com/Report-Engainall/Nasr1/actions/runs/39333274431) اجتاز كامل CI على الرأس `f3c2a6c002e37b3adeef7028163a176717e7ff6c`, بما فيه PostgreSQL 17/RLS والوحدة وlint/build/preview/dev. لا نسخ من المانح، ولا تغيير RLS.
- **القرار:** `ALREADY_PRESENT_BETTER`; أضيف صف واحد في ledger وصف واحد في audit.

## 7. مصالحة Storefront — مغلقة: الهدف أوسع وأأمن

- **بصمات المصدر/الهدف:** `src/components/Storefront.tsx` donor `3455340cac95a1ad656729296b3ea8a67eb492f3`, target `062dc33f1c971d0900808783aaa506296dab0d2f`. أبقينا نسخة الهدف.
- **فروق وظيفية مثبتة:** الهدف يستقبل query/category/available-only من route ذي `validateSearch`، يطبع/يقيد نص البحث، يدعم البحث المتقدم والتصفية على توفر معروف موجب، يحفظ السلة في `offline-cart.ts` بمفتاح profile بدل localStorage عام، يطلب تحقق السلة من الخادم قبل إنشاء الطلب، ويستخدم RPCs لعروض المتجر والأسعار حسب فئة العميل بدل الاعتماد على قيمة خصم عرض خام. كما يعرض شريط الإعلانات الآمن.
- **DB/RLS/RPC:** `get_storefront_promotions` و`get_storefront_product_prices` و`preview_order_pricing` و`place_order` في migrations الهدف تتحقق من نطاق المؤسسة وفئة العميل وتحسب الخصم/السعر على الخادم. صلاحيات جداول العروض المباشرة مسحوبة من browser roles، وتُبقى مراجعة السلة/المخزون خادمية. لم يُضف أي migration مانح ولا تغيّر RLS.
- **اختبار المصدر:** `src/test/storefront-discovery.test.tsx` blob `c566ec04bb57d2a8cd1b060c5853c4c08e862aa8` يغطي 3 حالات. اختبار الهدف blob `2b4f89b267cc14b9a822366b7b53836f16e5c10b` يغطي 11 سيناريو، منها routes/search/category/availability/promotions/offline isolation/checkout server validation/invitation token cleanup؛ `public-catalog-privacy.test.ts` blob `64d6856a6eb1d4b28326723fb370792f9f8fbcb6` يغطي عزل المؤسسة وإخفاء التكلفة والسعر الخام وفشل التسعير المغلق.
- **CI:** [Actions 39333274431](https://github.com/Report-Engainall/Nasr1/actions/runs/39333274431) اجتاز unit وPostgreSQL 17/RLS وlint/build وpreview/dev smoke على SHA `f3c2a6c002e37b3adeef7028163a176717e7ff6c`; شجرة كود التطبيق هذه دُمجت إلى main مع PR #11. هذا لا يثبت اختبار المتصفح اليدوي أو نشر الإنتاج.
- **القرار:** `ALREADY_PRESENT_BETTER`; أضيف صفان ledger وصفان audit. لا نسخ للملف المصدر الأقدم أو اختباراته.

## 8. قرار مصدر طابور العمليات غير المتصلة

- **المصدر:** `src/services/offlineQueue.ts` blob `7d68cdb19bd15056f58a5d92527dda78346f9209`؛ اختبار المصدر `src/services/offlineQueue.test.ts` blob `df7d5c4ec370652841b89d07b255a1d4dbd468b3`.
- طابور المانح يقبل فقط وضع/حذف عنصر سلة محلي؛ لا يقبل إنشاء الطلب ولا تحديث المخزون.
- Nasr1 يملك بالفعل `src/lib/offline-cart.ts` بمسودة سلة مرتبطة بملف العميل، وادعاء ضيف لمرة واحدة، وإزالة مفاتيح legacy غير المقيدة. يُخزن المنتج والكمية فقط؛ السعر والمخزون وتأكيد الطلب تظل خادمية. اختبارات الهدف الحالية تخص هذا العقد.
- **القرار:** `DUPLICATE_PROVEN`، لا استيراد طابور ثانٍ ولا نسخ اختبارات المانح. يسجل ledger/audit القرار وبصمات المصدر ودليل الاختبارات الحالي [Actions 39329226396](https://github.com/Report-Engainall/Nasr1/actions/runs/39329226396) على `b4d1f2e9cbe1db4e34c7d82b5ca6e1880b3fe43b`. لم تُشغّل اختبارات المانح ولم يُنسخ ملفه.

## 9. عطل CI منفصل يملكه P2 — PR #6

- [PR #6](https://github.com/Report-Engainall/Nasr1/pull/6) يعمل على ربط الفواتير/المدفوعات بقيود الأستاذ، ويملك P2 التعديل على `scripts/test-database-migrations.mjs`.
- [Actions 39326813015](https://github.com/Report-Engainall/Nasr1/actions/runs/39326813015) فشل عند اختبار قيد الفاتورة في السطر 3288: الاختبار ينتظر رسالة `invoice has an active accounting journal` بينما الحارس الفعلي يعيد `invoice has accounting history; source amounts and identity cannot be changed`. هذا mismatch في توقع الاختبار؛ لا يعني فشل قاعدة المنع.
- تم إرسال تعليق على PR #6 بطلب تعديل regex الخاص بالاختبار فقط ومراجعة assertion التالي، مع إبقاء الحارس ومنع القراءة المباشرة دون تغيير. **لم أحرر ملف الاختبار المشترك أو أكتب فوق عمل P2.**
- لا تدمج PR أخرى قبل CI PASS على رأسها نفسه.

## 10. الحالة الفعلية لسجلات المصدر

- `SOURCE_INTEGRATION_LEDGER.csv`: 123 صف بيانات بعد توثيق عضويات الشركة، واختبار PDF، وCustomerWorkflows وAdminPages وStorefront.
- `READY_TO_REUSE_FILE_AUDIT.csv`: 87 صف بيانات بعد توثيق عضويات الشركة، واختبار PDF، وCustomerWorkflows وAdminPages وStorefront.
- الصفوف المضافة تغطي مصدر معالج الصور واختباره، وقرار تكرار طابور offline واختباره. جميع البصمات المنقولة من الشجرة المانحة مسجلة؛ لم نعد فتح أي source blob كان له قرار مسجل.
- المراجعة السابقة لجرد الملفات على main أظهرت 69 صفًا في audit، 62 منها تعود للمصادر الثلاثة المحددة، وصفر صفوف بقيت بتسميات المراجعة العامة القديمة. بعد الصفوف الأربعة الحالية صار عدد audit 73 إجمالًا.
- مهام التحويل متعدد الأصناف وحماية الصور وعضويات الشركات واختبار PDF وCustomerWorkflows وAdminPages وStorefront مغلقة بأدلةها. المهمة الحالية `NASR1-SOURCE-PURCHASING-SERVICE-RECONCILIATION-001` تقارن خدمة شراء من المستودع `Report-Engainall/aghbari-commerce` مع خدمة الشراء ومهاجرات الهدف.

## 11. حدود الدور

- الهدف الوحيد `Report-Engainall/Nasr1`. المستودعات الثلاثة للقراءة والمقارنة فقط.
- لا أتعامل مع ZIPs/الأرشيف أو استكمال المواصفة الأصلية المستقل.
- لا أعدّل `WORK_COORDINATION.md` أو `CURRENT_EXECUTION_STATE.md` أو `EXECUTION_LOG.md` أو بيانات الأرشيف.
- لا كتابة مباشرة على main، لا force-push/reset/clean، لا إنشاء فرع لكل جلسة، لا أسرار أو خدمات مدفوعة، ولا ادعاء PASS بلا رابط ورأس مطابق.
