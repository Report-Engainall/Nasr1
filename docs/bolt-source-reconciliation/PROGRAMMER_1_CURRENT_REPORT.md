# تقرير الحالة التنفيذي — المبرمج 1 / دمج ميزات المصادر الثلاثة

- **المستودع الوحيد المستهدف:** `Report-Engainall/Nasr1`
- **فرع P1 المستمر:** `integration/inventory-transfer-batches-20261019-rebased`
- **الملكية:** هذا التقرير و`SOURCE_INTEGRATION_LEDGER.csv` و`READY_TO_REUSE_FILE_AUDIT.csv` فقط.
- **المهمة المغلقة:** `NASR1-SOURCE-CUSTOMER-COMPANY-MEMBERS-001` — ثبت أن مكوّن الهدف أفضل من المانح وأن الخدمات/المسارات/الاختبارات/مهاجرات SQL مطابقة ببصمات blob؛ لم يكن هناك نقص يستدعي نسخ ملفات أو تعديل RLS.
- **المهمة المغلقة:** `NASR1-SOURCE-FINANCE-PDF-TEST-RECONCILIATION-001` — اختبار الهدف أقوى ويحتوي جميع سلوكيات اختبار المصدر مع تغطية إضافية للمجاميع والأعمار والعملات والتقسيم إلى صفحات؛ لم تُفقد حالة اختبار من المصدر.
- **المهمة الحالية / next_source_task_id:** `NASR1-SOURCE-CUSTOMER-WORKFLOWS-RECONCILIATION-001` — مراجعة `src/components/CustomerWorkflows.tsx` من `Aghbari-Technologies/aghbari-commerce-evolved@d24695209b45f2352e0ba994e1f5109d7e2afc9d`, blob `c7a085418aa215c89864ffa85739b4dc15b48d54`, مقابل هدف مختلف البصمة `2c62fa3d331badfe0d7b205003abb3ca226b204c`. المكوّن ليس ضمن قائمة ملفات PR #6 المفتوح؛ افحص الفرق الوظيفي قبل أي تعديل ولا تستبدل ملف الهدف كاملًا.

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

## 5. قرار مصدر طابور العمليات غير المتصلة

- **المصدر:** `src/services/offlineQueue.ts` blob `7d68cdb19bd15056f58a5d92527dda78346f9209`؛ اختبار المصدر `src/services/offlineQueue.test.ts` blob `df7d5c4ec370652841b89d07b255a1d4dbd468b3`.
- طابور المانح يقبل فقط وضع/حذف عنصر سلة محلي؛ لا يقبل إنشاء الطلب ولا تحديث المخزون.
- Nasr1 يملك بالفعل `src/lib/offline-cart.ts` بمسودة سلة مرتبطة بملف العميل، وادعاء ضيف لمرة واحدة، وإزالة مفاتيح legacy غير المقيدة. يُخزن المنتج والكمية فقط؛ السعر والمخزون وتأكيد الطلب تظل خادمية. اختبارات الهدف الحالية تخص هذا العقد.
- **القرار:** `DUPLICATE_PROVEN`، لا استيراد طابور ثانٍ ولا نسخ اختبارات المانح. يسجل ledger/audit القرار وبصمات المصدر ودليل الاختبارات الحالي [Actions 39329226396](https://github.com/Report-Engainall/Nasr1/actions/runs/39329226396) على `b4d1f2e9cbe1db4e34c7d82b5ca6e1880b3fe43b`. لم تُشغّل اختبارات المانح ولم يُنسخ ملفه.

## 6. عطل CI منفصل يملكه P2 — PR #6

- [PR #6](https://github.com/Report-Engainall/Nasr1/pull/6) يعمل على ربط الفواتير/المدفوعات بقيود الأستاذ، ويملك P2 التعديل على `scripts/test-database-migrations.mjs`.
- [Actions 39326813015](https://github.com/Report-Engainall/Nasr1/actions/runs/39326813015) فشل عند اختبار قيد الفاتورة في السطر 3288: الاختبار ينتظر رسالة `invoice has an active accounting journal` بينما الحارس الفعلي يعيد `invoice has accounting history; source amounts and identity cannot be changed`. هذا mismatch في توقع الاختبار؛ لا يعني فشل قاعدة المنع.
- تم إرسال تعليق على PR #6 بطلب تعديل regex الخاص بالاختبار فقط ومراجعة assertion التالي، مع إبقاء الحارس ومنع القراءة المباشرة دون تغيير. **لم أحرر ملف الاختبار المشترك أو أكتب فوق عمل P2.**
- لا تدمج PR أخرى قبل CI PASS على رأسها نفسه.

## 7. الحالة الفعلية لسجلات المصدر

- `SOURCE_INTEGRATION_LEDGER.csv`: 118 صف بيانات بعد إضافة 8 قرارات لعضويات الشركة وصف واحد لمراجعة اختبار PDF إلى الـ109 السابقة.
- `READY_TO_REUSE_FILE_AUDIT.csv`: 82 صف بيانات بعد إضافة 8 صفوف عضوية وصف واحد لمراجعة اختبار PDF إلى الـ73 السابقة.
- الصفوف المضافة تغطي مصدر معالج الصور واختباره، وقرار تكرار طابور offline واختباره. جميع البصمات المنقولة من الشجرة المانحة مسجلة؛ لم نعد فتح أي source blob كان له قرار مسجل.
- المراجعة السابقة لجرد الملفات على main أظهرت 69 صفًا في audit، 62 منها تعود للمصادر الثلاثة المحددة، وصفر صفوف بقيت بتسميات المراجعة العامة القديمة. بعد الصفوف الأربعة الحالية صار عدد audit 73 إجمالًا.
- مهمة حماية الصور مغلقة بعد CI PASS على رأس PR المطابق والدمج إلى main. المهمة التالية الآن `NASR1-SOURCE-CUSTOMER-COMPANY-MEMBERS-001`: المصدر المرشح `Aghbari-Technologies/aghbari-commerce-evolved@d24695209b45f2352e0ba994e1f5109d7e2afc9d`, `src/components/CustomerCompanyMembers.tsx`, blob `259caa2d675cd49d12864fa600b321ea73dcaae4`. مسار هدف بالاسم نفسه موجود، لكن مجرد وجود component لا يثبت اكتمال مسار العضويات؛ يجب مقارنة service/DB-RLS/RPC/route/tests. لم يُفتح محتوى ملف المانح بعد ولم تُسجل له بصمة قرار في السجلات.

## 8. حدود الدور

- الهدف الوحيد `Report-Engainall/Nasr1`. المستودعات الثلاثة للقراءة والمقارنة فقط.
- لا أتعامل مع ZIPs/الأرشيف أو استكمال المواصفة الأصلية المستقل.
- لا أعدّل `WORK_COORDINATION.md` أو `CURRENT_EXECUTION_STATE.md` أو `EXECUTION_LOG.md` أو بيانات الأرشيف.
- لا كتابة مباشرة على main، لا force-push/reset/clean، لا إنشاء فرع لكل جلسة، لا أسرار أو خدمات مدفوعة، ولا ادعاء PASS بلا رابط ورأس مطابق.
