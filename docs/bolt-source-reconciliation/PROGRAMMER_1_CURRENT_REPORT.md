# P1 LIVE RESUME UPDATE — 24 October 2026

**The canonical execution checkpoint is PR #152. This report describes P1 ownership; it is not a second resume pointer. Keep its claims synchronized with CURRENT_EXECUTION_STATE.md and the acceptance matrix.**

- Main: `0bbaa6db9332fd0f812e00bd2b8fcda275fc5f3a`; exact-head main check `40111286682` SUCCESS. No direct writes to main.
- #134 head `f141391968fefd9f568624cdfb98be935d7c9da6`: Core `40118402370` and P2 `40118402229` SUCCESS; inventory batch concurrency proves one canonical batch and no duplicate transfer/audit effects. Review outstanding.
- #142 head `a4fa6f3a331bf1f02a7ff720f90c1c2e461ccb1c`: Core `40119888408` and P2 `40119888434` SUCCESS. Bounded 2 KiB JSON-delete body handling is included. API-OPS remains PARTIAL until the 179 callable RPC candidates have semantic authorization/tenant/role/input/output/effect/idempotency/concurrency/audit review and allow/deny evidence.
- #147 head `fc2a7d5eb08c9bc99d3d90cc869b2e5f0296618a`: Core `40111802394` / P2 `40111802434` SUCCESS; Core logs prove exact-head PostgreSQL 17 quote decision acceptance. #158 head `afc685636df26ce9b35e84ffc9565f552c3c2d7e`: Core `40118708860`, PG17 `40118708851`, P2 `40118708956` SUCCESS; concurrency produces one payment and one audit row. #162 head `e5ca28bb81a605f4e6628baa7abbdc1b5c7216f8`: PG17 `40113018797`, Core `40113018846`, P2 `40113018801` SUCCESS and scores only explicitly valid rows.
- #172 head `682761625993a203b5795daa953632f131ae886a`: Core `40115029836` / P2 `40115029831` SUCCESS. Draft #181 adds SQLSTATE and no-side-effect assertions; it needs integration and exact-head retesting.
- #179 head `4f34704fe2b6cf63942f6cf6b3532ef780130a91`: Core `40119746804` / local P2 `40119746870` SUCCESS. Its finalizer requires matching source/config fingerprints, uses idempotent job creation, and refuses success if an older matching ready snapshot remains. #180 must apply before #179 by migration timestamp.
- #180 head `f31e3547e99b085fb0b8db0b2be098809acac247`: dedicated PostgreSQL 17 `40118418761`, Core `40118418698`, local P2 `40118418782` SUCCESS; a foreign-tenant denial cannot change staged import or audit rows.
- #155 head `fd7944fc2a322676d3a8cf3cff08fe64f9ccc934` combines signed stock-metric export parity with XML 1.0 control sanitization. Core `40120144157` and local P2 `40120144155` are terminal SUCCESS on this exact head. #183 was closed unmerged after porting its XML fix into #155; hosted customer E2E remains SKIPPED.
- Hosted authenticated customer/tenant E2E remains SKIPPED; no production Onyx import, production writes/migrations, WhatsApp delivery, live AI provider, deployment or restore is proven. A reviewer assignment is not approval.

## NEXT ACTION — P1
1. Request independent review for #155; its exact-head Core and local P2 gates passed, while hosted customer E2E remains SKIPPED.
2. Obtain independent submitted review for the security/transaction PRs; CI alone is insufficient for merge.
3. Continue semantic review of the remaining 179 RPC candidates in #142.
4. Integrate #181 with #172, then rerun exact-head Core/P2/PostgreSQL 17.
5. Preserve migration order #180 before #179 and #147 → #164 → #165 → #166 → #168 → #158 → #162 → #172; keep this report aligned with the canonical checkpoint.

---

# تقرير الحالة التنفيذي — المبرمج 1 / إدارة جلسات الأجهزة المركزية

- **المستودع:** `Report-Engainall/Nasr1`
- **فرع P1 الحالي:** `p1/central-device-session-ui-20261023`
- **PR الحالي:** [#88 — Draft/open، غير مدمج](https://github.com/Report-Engainall/Nasr1/pull/88)
- **BASE_SHA لإعادة التكامل:** `8e48c592d06ee8bc35b73cfe89f5f0fd51c33ec2`
- **رأس الميزة قبل إعادة التكامل:** `0d51e2090951e1dab80d4fbdf8e92bcfbb256de8`
- **آخر رأس وظيفي مختبَر بدقة:** `5114ea8227f570662533219af1dc3a013cd49f75` — Core CI **SUCCESS** [39981579136](https://github.com/Report-Engainall/Nasr1/actions/runs/39981579136)؛ P2 Playwright **SUCCESS** [39981579236](https://github.com/Report-Engainall/Nasr1/actions/runs/39981579236)، بما يشمل Chromium/Supabase المحلي لاختبار صلاحية وإلغاء الجلسة فورًا.
- **المهمة:** `P1-DEVICE-SESSION-MGMT-UI-001` — ربط إدارة الأجهزة والجلسات بعقد الخادم، ورفض بيانات الجلسات غير الصحيحة، وحماية الجلسة الحالية، واشتراط إقرار مطابق من الخادم قبل إظهار نجاح الإلغاء.
- **الاختبارات المثبتة على الرأس السابق فقط:** Core CI [39977276920 SUCCESS](https://github.com/Report-Engainall/Nasr1/actions/runs/39977276920)؛ P2 Playwright [39977276972 SUCCESS](https://github.com/Report-Engainall/Nasr1/actions/runs/39977276972). خطوة Chromium الخاصة بتفويض إدارة الجلسات والإلغاء الفوري نجحت مع Supabase محلي معزول.
- **المتبقي:** التحقق من CI على commit التوثيق الحالي؛ اختبار الحساب الخارجي تخطّاه حاجز الاعتماد؛ الإنتاج NOT RUN.
- **الملفات في صافي التغيير المقصود:** هذا التقرير ونقطة الاستئناف وواجهة الجلسات واختبارها وأدوات/اختبارات Playwright الخاصة بـP1.
- **NEXT_ACTION:** فحص Core وP2 Playwright على رأس commit التوثيق الحالي. إذا نجحا وظل صافي الملفات ضمن ملكية P1، اجعل PR #88 جاهزًا وادمجه عبر GitHub ثم تحقق من SHA الدمج وCI الخاص بـ`main`.
- **حدود الإثبات:** نجاح المتصفح المحلي يخص تدفق الجلسات الذي اختُبر؛ لا يثبت الحسابات الخارجية أو الإنتاج.

> الأقسام التالية تحتفظ بالسجل التاريخي من تكاملات سابقة؛ هذا الملخص هو نقطة الاستئناف الحالية لهذا الفرع.


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
- **Action taken:** posted the current-head handoff to PR #18 and refreshed the P1-owned `SOURCE_INTEGRATION_LEDGER.csv` and `READY_TO_REUSE_FILE_AUDIT.csv` with the exact-head CI reference and current P2 blockers. Their updates are commits `ebbd8c65c3d022faa3792b592629de149b9f9ecc` and `f24671bf44fb08f159382e9834e63c09a6c61427`. The evidence snapshot at SHA `ec310b147434c9689c00a04ff9d3dc606a016f82` subsequently passed exact-head [Actions 39461499488](https://github.com/Report-Engainall/Nasr1/actions/runs/39461499488): all unit, PostgreSQL 17, lint/build, preview/dev smoke and cleanup steps succeeded. The P1 source ledger and reuse audit were then refreshed in docs-only commits `96d5fe31c3389a0d69fd42a9774c5539673971f4` and `7dc5afcbf6853c1b9b4459cd011e6e687a8a0347` to preserve that explicit evidence and current P2 blockers; the live PR checks are authoritative for any subsequent HEAD. Do not project a prior SHA's CI result onto another SHA.
- **Boot artifact exception:** `docs/bolt-source-reconciliation/DUAL_PROGRAMMER_OPERATING_PROTOCOL.md` returned GitHub `404 Not Found` both on the default ref and the current P1 branch ref. The current `WORK_COORDINATION.md` and master handoff were read; neither was modified. Do not claim the missing file was read.

**Next action / next_source_task_id:** keep `NASR1-SOURCE-CUSTOMER-LIFECYCLE-PARITY-001` open until the P2 branch integrates the actual customer-table dialog, regenerated route tree and feature-specific PostgreSQL/RLS acceptance; then inspect combined PR/CI metadata, rebase/forward-integrate without overwriting P2-owned work, and run CI on the final exact head. Do not advance to another source while this task remains unclosed.


## 6.4. Latest exact-head CI confirmation — 2026-10-20

- Re-read the live PR #26 metadata: the P1 branch head at the test point was `ec310b147434c9689c00a04ff9d3dc606a016f82`. [Actions 39461499488](https://github.com/Report-Engainall/Nasr1/actions/runs/39461499488) completed `SUCCESS` on that exact SHA. Job `test-and-build` completed all steps successfully: Bun frozen-lockfile verification, dependency installation, unit tests, isolated PostgreSQL 17 migration/core-workflow acceptance, lint, build, production-preview smoke 4173, dev-server smoke 5173, post steps and container cleanup.
- This proves the general repo workflow on SHA `ec310b147434c9689c00a04ff9d3dc606a016f82`; it is not an assertion that the activation RPC denial matrix has been executed. At the check captured in this section, P2 PR #18 head was `7279a9b97532c0939a0ab5eb35773601c9a6626f`; its changed-file list excluded `src/components/AghbariApp.tsx`, `src/routeTree.gen.ts`, and `scripts/test-database-migrations.mjs`. Handoff follow-up: [PR #18 comment 6296307002](https://github.com/Report-Engainall/Nasr1/pull/18#issuecomment-6296307002).
- The P1-owned evidence CSVs were refreshed after that run to explicitly bind its ID/SHA and current blockers: ledger update commit `96d5fe31c3389a0d69fd42a9774c5539673971f4`; reuse audit update commit `7dc5afcbf6853c1b9b4459cd011e6e687a8a0347`. Those were docs-only changes. Do not infer the job's result for another SHA; rely on the live check attached to the exact current branch head.
- **Current release gate:** do not mark customer activation parity complete or release-ready until P2 adds the approved-customer dialog to the current admin table, regenerates the activation route tree, seeds an authoritative isolated `auth.users` fixture and runs the activation RPC/direct-table denial acceptance. Direct table grants and RLS remain unchanged.



## 6.5. Live coordination refresh — latest P1 exact-head CI and P2 branch state

- Latest P1 evidence snapshot before this ledger/report refresh: `b38a3f0bfe35bc4cc2a7df9a4a452f90ec0f96aa`. [Actions 39463736817](https://github.com/Report-Engainall/Nasr1/actions/runs/39463736817) completed `SUCCESS` on that exact SHA. All checks passed: Bun frozen-lockfile verification, dependency install, unit tests, PostgreSQL 17 migrations/core acceptance, lint, build, preview smoke on 4173, dev smoke on 5173, and cleanup.
- P1 evidence rows were refreshed after this CI result: `SOURCE_INTEGRATION_LEDGER.csv` commit `3007fbda7a2808529a11202bfdf6b1d4c5a16d0b`; `READY_TO_REUSE_FILE_AUDIT.csv` commit `331838734320c245c51c022d33a901935877069f`. Both preserve the exact SHA/run and do not claim feature-specific activation acceptance.
- Live P2 PR #18 has since advanced to `f11f412afd6799aa1809deedcbe434abbcc598b0`, while its current changed-file list still excludes `src/components/AghbariApp.tsx`, `src/routeTree.gen.ts`, and `scripts/test-database-migrations.mjs`. Compare against `main` shows 99 commits ahead and 34 behind, across 56 changed paths. I added [coordination comment 6296661975](https://github.com/Report-Engainall/Nasr1/pull/18#issuecomment-6296661975) requesting forward integration of live `main` on the existing P2 branch without history rewriting, exact-head CI, and the three missing activation gates. After refresh, [comment 6296674783](https://github.com/Report-Engainall/Nasr1/pull/18#issuecomment-6296674783) records the latest exact P1 CI pass.
- **No P2-owned code was changed.** The activation dialog exists in P1's diff, but the customer table cannot expose it until the P2-owned UI wiring lands. Its path source also needs generated route-tree registration. The current migration contract still requires runtime PostgreSQL verification using a minimal isolated `auth.users` row with authoritative `email_confirmed_at`. Direct authenticated `SELECT/INSERT/UPDATE/DELETE` to the invitation table must remain denied.
- **Release status remains NOT READY.** General CI passes for P1's latest tested snapshot; activation parity is not complete. Do not merge PR #26, do not mark the source closed, and do not advance the one active source-task pointer until P2's combined UI/route/RLS acceptance patch lands and the combined head passes exact-head CI. For any newer branch SHA, only that SHA's own GitHub check can prove CI.



## 6.6. Current session live recheck — 2026-10-20 20:18 Asia/Aden

- Boot evidence: `docs/bolt-source-reconciliation/DUAL_PROGRAMMER_OPERATING_PROTOCOL.md` returned GitHub 404 on both `main` and this P1 branch; no content was fabricated. Read-only files successfully read: `WORK_COORDINATION.md` blob `48854da3b1f6f99ff6dd9320d3e96b5898dac974` and `BOLT_SINGLE_ENTRYPOINT_MASTER_HANDOFF_REPLACEMENT_2026-10-18.md` blob `f1a34dba846bea186c44fc54c9efa388410b4ec4`. Re-read this P1 report before deciding the current task pointer.
- **Inventory-transfer RLS failure is resolved, not open.** Live PR #3 metadata says `state=closed`, `merged=true`; merge commit `669c99605be1e9d9ac2a87d82ecf1514a19a6feb`; tested head `01ef17b05c2bf507003efccbb897f76318e0df02`. Actions [39323966139](https://github.com/Report-Engainall/Nasr1/actions/runs/39323966139) is completed `success` with exact `head_sha=01ef17b05c2bf507003efccbb897f76318e0df02`. Its `test-and-build` gate passed. The root issue was test fixture inspection running under `authenticated`; the fix reset the role for privileged fixture inspection and restored authenticated role before the direct-table denial assertion. No grant/policy or production RLS was relaxed. Duplicate PR #2 remains closed/unmerged.
- **Active source task remains** `NASR1-SOURCE-CUSTOMER-LIFECYCLE-PARITY-001`. Current P1 PR #26 head before this docs save: `13359fd43631718ccb89f8fc7adc1a0703d26765`; base/main at read time: `ccbc82ffe36d52beb7e9fe1ab1cb17f4de358f21`. Actions [39464172326](https://github.com/Report-Engainall/Nasr1/actions/runs/39464172326) reports `success` and its API `head_sha` matches `13359fd43631718ccb89f8fc7adc1a0703d26765`. The job `test-and-build` succeeded; this is general workflow evidence, not feature-specific activation RPC/RLS acceptance. PR #26 stays draft/open and must not be merged yet.
- Current P2 PR #18 head: `f11f412afd6799aa1809deedcbe434abbcc598b0`. Actions [39463815150](https://github.com/Report-Engainall/Nasr1/actions/runs/39463815150) and [39463815138](https://github.com/Report-Engainall/Nasr1/actions/runs/39463815138) each report `success` on that exact head (general commerce workflow and Playwright critical paths). Its current changed-file list still excludes `src/components/AghbariApp.tsx`, `src/routeTree.gen.ts`, and `scripts/test-database-migrations.mjs`; therefore those green runs do not close customer activation parity.
- Posted a path-specific P2 handoff to [PR #18 comment 6296834341](https://github.com/Report-Engainall/Nasr1/pull/18#issuecomment-6296834341): wire the target-native invitation dialog into the authorized customer table; regenerate/register the `customer.activate.$token` route; seed an isolated authoritative `auth.users.email_confirmed_at` fixture and run runtime RPC acceptance plus authenticated direct `SELECT/INSERT/UPDATE/DELETE` denial tests. Test fixture inspection under elevated role only; restore `authenticated` before each denial assertion. No protected P2 path was modified by P1.
- Refreshed P1-owned evidence rows using the unchanged donor blob fingerprints from the existing ledger/audit; donor files were not re-fetched. Updated ledger blob after this commit: `338c52b6ed19b23726d5d90fd15101dce4695fa7`; updated audit blob after this commit: `faa8eace111dbbda803c0d159b48fb76ba9502db`. This commit changes only P1-owned evidence files; its own exact-head CI must be checked separately before any merge.
- **Close criteria not yet met:** UI + generated route + PostgreSQL/RLS/RPC acceptance must land together and pass CI on the final combined SHA. Keep the current source task open; do not advance to another donor task and do not edit P2-owned/shared paths.


## 6.7 Live recheck — 2026-10-20 20:42 Asia/Aden

- **Exact live refs:** PR [#26](https://github.com/Report-Engainall/Nasr1/pull/26) remains open/draft/unmerged, base `main` at `ccbc82ffe36d52beb7e9fe1ab1cb17f4de358f21`, P1 branch `integration/inventory-transfer-batches-20261019-rebased`, head `2ced1b676c34cd750910bfce503abbaa78d598a8`. GitHub Actions [39465473756](https://github.com/Report-Engainall/Nasr1/actions/runs/39465473756) completed SUCCESS on that exact SHA; the `test-and-build` job passed frozen Bun lock verification, unit tests, PostgreSQL 17 migration/core acceptance, lint, build, preview smoke on 4173, dev smoke on 5173, and cleanup. Do not infer browser-authenticated or production proof from this run.
- **Service Worker cache-boundary task:** closed for P1 code/test/CI scope. Current target `public/sw.js` blob `166e449316349394e8870cb14f90067893a0dd24`; target test `src/test/service-worker-cache-boundary.test.ts` blob `3df0bee116f65bc30fece458b1591cdf368a30e9`. The regression checks same-origin GET only, exclusion of auth/REST/RPC/storage/functions traffic, root-only navigation persistence, allowlisted static extensions, and deletion confined to the `aghbari-shell-` namespace. The whole unit suite passed on exact head `2ced1b676c34cd750910bfce503abbaa78d598a8`; prior dedicated cache-boundary evidence [39444658074](https://github.com/Report-Engainall/Nasr1/actions/runs/39444658074) is retained. Status: IMPLEMENTED + INTEGRATED + TESTED_EXACT_SHA. BROWSER_PROVEN=NOT RUN; PRODUCTION_PROVEN=NOT RUN.
- **Independent purchase-route reconnect:** `src/routes/admin_.purchase-orders.tsx` blob `a06f2e0c35f584035be956430096d373f465100c` is registered in `src/routeTree.gen.ts` blob `abd88d21462cbe87aa1498d0ae38acf6945cbcf6`. The current workflow explicitly probes `/admin/purchase-orders` and its Arabic route title in both production-preview and dev smoke loops; Actions 39465473756 passed both steps on exact head. The stale `IMPLEMENTED_PENDING_CI` ledger status is updated to exact-SHA tested evidence. This is preview/dev smoke, not an authenticated browser or deployed production test.
- **Customer lifecycle source parity (P1-only scope):** the donor fingerprints already recorded in the ledger remain authoritative; donor files were not re-fetched or copied. The source comparison decisions remain: activation form → adapt target auth/validated token path; customer panel → keep target-native dialog and record UI wiring gap; service → reject the donor's legacy table/RPC contract and retain the target's hash-only, tenant-scoped RPC design. A live target read confirms migration blob `cef9cb41c88620114af4c37761515a1b177538b5`, page/dialog/service tests `8d4378758855914c6de2c31192018d4e99afb08c`, `6de0954b2f0fdd19134db99f26b2f1ac03eb874d`, `2ff098ebc1a30aec26b4e5be89867f07c5cf2168`, and static migration regression `9457bbd61e506b76d2a34ee57914bb0f5fb4f591` exist at this P1 head.
- **Remaining customer activation delta — BLOCKED_BY_P2, not closed:** live P1 `src/components/AghbariApp.tsx` blob `6b92ea7136012247062ddc7eeef30c9c61239514` does not reference the target activation dialog; `src/routeTree.gen.ts` does not register `/customer/activate/$token`; and `scripts/test-database-migrations.mjs` blob `ce2ecc54560d6aabe7d9fb37a01191b0fcdad60c` does not contain the feature-specific `customer_activation_invitations` / `accept_customer_activation_invitation` PostgreSQL/RLS assertions. These are P2-owned shared paths; P1 did not modify them. Live PR [#18](https://github.com/Report-Engainall/Nasr1/pull/18) head is `f11f412afd6799aa1809deedcbe434abbcc598b0`; P2's 20:42 checkpoint identifies `NASR1-P2-CUSTOMER-ACTIVATION-SHARED-PATH-INTEGRATION-012` as its active task. The green general CI/Playwright workflow status is not feature-specific RPC/RLS acceptance and is not proof that a signed-in Playwright test actually ran. Required gates remain dialog wiring, generated route registration, authoritative `auth.users.email_confirmed_at` fixture, one-use/replay/expiry/tenant/staff/email/audit assertions, and denial of direct authenticated SELECT/INSERT/UPDATE/DELETE.
- **State separation:** service-worker implementation/test are tested at exact SHA; purchase route smoke is exact-SHA tested; customer source comparison is documented, but full activation feature status remains NOT INTEGRATED / FEATURE-SPECIFIC POSTGRES NOT RUN / BROWSER NOT PROVEN / PRODUCTION NOT PROVEN. Keep PR #26 draft and unmerged.

## 6.8 Unmatched source-module sweep — 2026-10-20

- **Task transition:** the Service Worker boundary is closed at P1 code/test/CI scope. Customer lifecycle source parity is compared and documented; full activation remains externally blocked on P2-owned UI/route/runtime-RLS integration. P1 proceeds with independent donor coverage without editing shared/P2 paths.
- **Candidate basis:** compared current donor repository trees at `Report-Engainall/aghbari-commerce@00d7446bba9652ea40178a08b00c9da9a2bba8a1` and `Report-Engainall/aghbari-store@df3d7dd13276910d90a7273c8ace13e9a74ee277` against the current Nasr1 tree at `a4a95d05c023088de954f78476d1cdb04bd1f9d8`, excluding previously fingerprinted/ledgered paths. No ZIPs were fetched, scanned or extracted.
- **Seven previously unledgered runtime-module candidates reviewed and recorded** in both P1 CSVs: dashboard metrics, admin mutation service, auth client, category read service, telemetry module, React Router route guards, and preview data fixtures. Decisions:
  - `ALREADY_PRESENT_BETTER`: `src/services/dashboardMetrics.ts`, `src/services/auth.ts`, `src/services/categories.ts`. Nasr1 already has target-native live Reports/ExecutiveStoreAnalytics and status/low-stock analysis, its centralized auth + target invitation contract, and tenant-scoped category reads; the legacy dashboard RPC uses the wrong company/schema contract and does not justify a duplicate.
  - `INCOMPATIBLE_WITH_EVIDENCE`: `src/services/admin.ts`, `src/components/guards/RouteGuards.tsx`. These bundle older RPC/product-tier/inventory shapes or React Router/AuthContext semantics that do not match Nasr1's current price-grid, inventory command, tenant and TanStack contracts. No wholesale copy is safe or needed.
  - `KEEP_AS_REFERENCE`: `src/lib/telemetry.ts`, because it only emits console logging in DEV and contains no actual persistent production transport.
  - `EXCLUDED_SECURITY`: `src/lib/previewData.ts`, because it contains fake sample products/prices/stock and must not become operational fallback data.
- **No code was copied for these seven** because the comparison did not prove a safe, independent end-to-end capability gap. This is an evidence-based non-merge decision, not a claim that every donor SQL migration has been semantically reconciled. P1 keeps current target implementations and source hashes; no donor runtime was executed.
- **Exact target evidence:** Actions [39469140134](https://github.com/Report-Engainall/Nasr1/actions/runs/39469140134) completed SUCCESS on exact target SHA `a4a95d05c023088de954f78476d1cdb04bd1f9d8`. Unit tests, isolated PostgreSQL 17 migration/core acceptance, lint/build, production-preview route/title smoke (4173), and dev route/title smoke (5173) all passed. This tests Nasr1's existing implementation, not the donor modules. Browser-authenticated and deployed production proof remain NOT RUN.
- **P1 next single task after this module sweep:** `NASR1-SOURCE-UNASSESSED-MIGRATION-SEMANTIC-GAP-001` — identify only donor SQL migrations not already covered by existing source-ledger decisions, compare their business effect against the target's active migration/RPC/RLS contracts, and integrate only a proven missing behavior. Do not wholesale-apply legacy migrations or repeat the seven module decisions. Customer activation still remains a separate P2 dependency; PR #26 stays draft/unmerged until the combined feature gates are satisfied.

## 6.9 Target-native stock-count start audit — implementation candidate, CI pending

- **Source reviewed read-only:** `Report-Engainall/aghbari-store@df3d7dd13276910d90a7273c8ace13e9a74ee277`, `supabase/migrations/20261014000000_audit_commercial_draft_creation.sql`, blob `e2afc69488e9790df9537701313c4c1032249a8f`. Its intent is a metadata-only audit event on creation of a physical stock count. No source repository was modified.
- **Root gap established against Nasr1:** `supabase/migrations/20261019230000_purchase_orders_and_receiving.sql` already writes purchase-order created/submitted/cancelled/received events; `supabase/migrations/20261018070000_inventory_transfer_command.sql` already writes inventory-transfer events; `supabase/migrations/20261018090000_inventory_stock_count.sql` already logs count completion and cancellation, but its `start_stock_count()` inserts `public.stock_count_sessions` without a start event. Nasr1's table is `stock_count_sessions`, not the donor's legacy `stock_counts`; copying the donor migration wholesale or adding duplicate PO/transfer triggers is incorrect.
- **Target adaptation:** added `supabase/migrations/20261020120000_stock_count_start_audit.sql` and `src/test/stock-count-start-audit-migration.test.ts`. The trigger writes `inventory.stock_count.started` / `stock_count_session` for a newly inserted open session, validates `NEW.started_by` against the authenticated user and active profile in the same organization, runs as SECURITY DEFINER with an empty search path, revokes direct function execution from PUBLIC/anon/authenticated, and records only warehouse, status, and start time. It does not store notes or idempotency keys, change table grants/RLS, or run on UPDATE. Existing idempotent replay returns an existing session and does not fire INSERT a second time.
- **State now:** IMPLEMENTED/INTEGRATED in code commit `8d55efde1504627839b167c25d93aaa48b0ff3cd`; `src/test/stock-count-start-audit-migration.test.ts` static migration contract regression is included. Exact-head GitHub Actions [39471126992](https://github.com/Report-Engainall/Nasr1/actions/runs/39471126992) completed SUCCESS on that SHA. Unit tests, isolated PostgreSQL 17 migration/core acceptance, lint, build, preview smoke on port 4173, dev smoke on port 5173 and cleanup all passed. The PostgreSQL harness executes `start_stock_count()` and same-key replay, so the inserted session and trigger are exercised by the database run; however, the current P2-owned harness does not assert exactly-one event or inspect its metadata. `TESTED_EXACT_SHA=PASS` for migration + static contract test and broad PostgreSQL harness; feature-specific audit-row assertion remains `BLOCKED_BY_P2`. BROWSER_PROVEN=NOT RUN; PRODUCTION_PROVEN=NOT RUN.
- **P2 coordination:** PR #18 is the owner of `scripts/test-database-migrations.mjs`; request a runtime assertion there that the session produces exactly one `inventory.stock_count.started` audit row across start + same-key replay, with tenant/actor/entity and safe metadata verified. P1 does not edit that locked test harness.
- **Next source subtask after the exact-SHA gates:** continue `NASR1-SOURCE-UNASSESSED-MIGRATION-SEMANTIC-GAP-001` with the next unledgered source migration candidate only after this start-audit event and its test evidence are read back; do not wholesale-import SQL or advance this item on a green but unrelated check.





## 6.10 Live P2 activation integration — refreshed 2026-10-20

- **Live state:** PR #18 https://github.com/Report-Engainall/Nasr1/pull/18, branch `feat/p2-customer-return-intake-20261020`, exact current head `b7117a1fa576075248eaaf101b22b7521d49cf3e`. The branch contains `src/components/AghbariApp.tsx`, `src/routeTree.gen.ts`, `scripts/test-database-migrations.mjs`, the invitation dialog/page, and `src/routes/customer.activate.$token.tsx`. The generated route tree currently registers that route.
- **Latest-head CI:** PostgreSQL acceptance run [39474666679](https://github.com/Report-Engainall/Nasr1/actions/runs/39474666679) was `IN_PROGRESS` at last readback for this head. Playwright run [39474667220](https://github.com/Report-Engainall/Nasr1/actions/runs/39474667220) completed `SUCCESS`, but workflow success alone does not prove the signed-in customer-activation page was exercised. Historical DB failure [39474112184](https://github.com/Report-Engainall/Nasr1/actions/runs/39474112184) belongs to prior head `13087ae537c1628f7748e557b553b5b3fad7bccd` and came from legacy `accept_customer_company_invitation(text)` confirmed-email rejection, not the new activation RPC; see [comment 6297847869](https://github.com/Report-Engainall/Nasr1/pull/18#issuecomment-6297847869).
- **Migration overlap is still unresolved:** P1 migration `supabase/migrations/20261020110000_customer_activation_invitations.sql` blob `cef9cb41c88620114af4c37761515a1b177538b5`; P2 migration `supabase/migrations/20261020140000_customer_activation_invitations.sql` blob `f62ec20998ddc4b6a00517bdab1f55c9a73d58da`. Both declare the same invitation table and overlapping create/list/revoke/accept RPCs. `CREATE TABLE IF NOT EXISTS` does not reconcile table constraints; later `CREATE OR REPLACE FUNCTION` changes the active contract. Keep one canonical migration or justify the later one as a forward-only delta, then run the full ordered chain. Coordination warning: [comment 6297665207](https://github.com/Report-Engainall/Nasr1/pull/18#issuecomment-6297665207).
- **P1 runtime handoffs:** current P2 harness blob `5975d49b3b7a4438c2a961d35ef2d2910d28017b` contains neither exact-one `inventory.stock_count.started` assertion nor `create_import_job_idempotent` concurrency/intent acceptance. Handoffs: [stock audit](https://github.com/Report-Engainall/Nasr1/pull/18#issuecomment-6297636927), [import idempotency](https://github.com/Report-Engainall/Nasr1/pull/18#issuecomment-6298046143). P1 did not modify the P2 harness or activation paths.
- Status distinction: activation UI and route are present, but the latest exact-head PostgreSQL result was not complete at read time; activation-specific browser and production proof remain NOT RUN/NOT PROVEN.

## 6.11 Donor SQL migration decisions — 2026-10-20

- **Source fixed point:** `Report-Engainall/aghbari-store@df3d7dd13276910d90a7273c8ace13e9a74ee277` was compared against P1 source-review head `3c23c8b1d754e412e336759c766177c4e347d963` and both owned CSV ledgers. No ZIP was downloaded, scanned, extracted or fingerprinted.
- `ALREADY_PRESENT_BETTER`: old import/orders/pricing bundle `5dfdb87b...`, simple order price snapshot `bfdc0d12...`, procurement/finance bundle `6238e17f...`, and tenant-safe customer/price boundary `5ba83f98...`. Nasr1 has newer tenant-scoped import sessions/chunk continuity, audited order-review/price-grid commands, purchase orders/receipts/transfers/stock-count/expenses, and current pricing/statement guards. No old schema was imported.
- `INCOMPATIBLE_WITH_EVIDENCE`: donor core bootstrap `b05dd91e...` and membership-policy repair `334da58a...` assume legacy tables and identity/role contracts.
- `EXCLUDED_SECURITY`: seed data `c9df992c...` contains sample organization/admin/products/prices/stock/commercial rows; baseline RLS `e9c66f89...` includes permissive organization insert, self-membership mutation and unscoped catalogue reads.
- `KEEP_AS_REFERENCE`: private membership helper `8b68bbdf...`, policy-center/approved-quantity bundle `728ae41d...`, and organization statement RPC `ba9dea66...` depend on donor schema/auth contracts. Nasr1 has customer statements/PDF and ledger-backed financial statements; immutable organization-wide snapshots are not claimed to exist.
- The donor import-upload claim was not copied as a table/RPC. Its request-idempotency principle is now adapted to Nasr1's current contract in section 6.12; the ledger records `ADAPT_AND_INTEGRATE`.
- **Next single source task:** `NASR1-SOURCE-UNASSESSED-MIGRATION-SEMANTIC-GAP-001` — continue reviewing still-unledgered SQL migrations from all three donors, respecting recorded blob fingerprints and decisions. Do not repeat the 12 decisions here or import legacy migration bundles wholesale.

## 6.12 Target-native import request idempotency — exact-head evidence

- **Gap:** donor `Report-Engainall/aghbari-store@df3d7dd13276910d90a7273c8ace13e9a74ee277` migration `supabase/migrations/20261015000000_import_upload_idempotency_claims.sql`, blob `662660bf12cb4e8e17dc5ea9ab98c026eb9e5136`, uses old `import_uploads/organization_members` and file-identity locking. Nasr1's existing `create_import_job()` unconditionally inserted a job and duplicate lookup was advisory; locking only on file hash would suppress valid explicit replace/merge/new-version operations.
- **Implementation:** code SHA `705fbd0d2309b25f8ee85d9140b0e807b7032409`, Actions [39473864704](https://github.com/Report-Engainall/Nasr1/actions/runs/39473864704) SUCCESS on that exact SHA. Added migration `supabase/migrations/20261020180000_import_job_request_idempotency.sql` blob `9db693b4dbba4dcc397ba6b62800d4f2fa3aa246`; API `src/lib/api.ts` blob `bef1c462ddc8e3e78a40974adedfb3a909bd2bcc`; UI `src/components/UnifiedImportEngine.tsx` blob `128b0412765835678b7362b82ee70f789dfacce5`; test `src/test/import-job-idempotency-contract.test.ts` blob `0028106972d9a2f3b88b7013ce13dd2fd501ebfe`.
- **Mechanism:** the server derives organization and active actor profile; private `import_job_request_keys` uses `(organization_id, actor_profile_id, request_key)`, RLS is enabled and direct table grants are revoked, the SECURITY DEFINER function fixes the search path, and only authenticated callers may execute it. Same-key/same-payload retries return the original job; changed payload or intent is rejected; replace/merge/new_version obtain fresh attempt keys. The function delegates actual creation to the existing canonical `public.create_import_job` inside the same transaction.
- **What is and is not proved:** the static regression test and general PostgreSQL 17 migration/core acceptance passed at exact code SHA `705fbd0d2309b25f8ee85d9140b0e807b7032409`. The current P2-owned harness blob `5975d49b3b7a4438c2a961d35ef2d2910d28017b` has not yet added the feature-specific same-key concurrent retry, payload mismatch, different intentional key, and direct-table-denial matrix; therefore `IMPLEMENTED=YES`, `INTEGRATED=YES`, `TESTED_EXACT_SHA=PASS` for code/static suite/general CI, while `FEATURE_SPECIFIC_PG17_CONCURRENCY=BLOCKED_BY_P2`, `BROWSER_PROVEN=NOT RUN`, `PRODUCTION_PROVEN=NOT RUN`. Runtime-test request: [PR #18 comment 6298046143](https://github.com/Report-Engainall/Nasr1/pull/18#issuecomment-6298046143).
- **Next single task ID:** `NASR1-SOURCE-UNASSESSED-MIGRATION-SEMANTIC-GAP-001`. P2 runtime acceptance remains a cross-PR dependency, not a reason to claim a green feature test.



## 6.13 Live P1 resume — cache-boundary closure and next unassessed migration — 2026-10-20

- **Repository/branch/PR:** only target `Report-Engainall/Nasr1`; branch `integration/inventory-transfer-batches-20261019-rebased`; PR [#26](https://github.com/Report-Engainall/Nasr1/pull/26) remains OPEN/DRAFT and is not merge-approved.
- **Latest exact code/test evidence before this docs-only refresh:** code SHA `8953a6ca72b6e5d90fbf179ab5ff729f2774c806`; [Actions 39478172249 SUCCESS](https://github.com/Report-Engainall/Nasr1/actions/runs/39478172249) on that exact SHA. The workflow completed frozen Bun lock validation/install, all unit tests, ordered target migrations and isolated PostgreSQL 17 core acceptance, target-native import request-idempotency concurrency/intent acceptance, target-native saved-products tenant RPC acceptance, lint, build, preview smoke on 4173, dev smoke on 5173, and cleanup.
- **Service Worker boundary — CLOSED for code/source and exact-head CI:** target `public/sw.js` blob `166e449316349394e8870cb14f90067893a0dd24`; regression test `src/test/service-worker-cache-boundary.test.ts` blob `3df0bee116f65bc30fece458b1591cdf368a30e9`. The test remains inside the complete unit suite passed at the exact SHA above. Target behavior remains stricter than donor: persist only public root navigation; do not cache auth/API/RPC/storage/function traffic; persist only successful same-origin basic static assets on the extension allowlist; delete only obsolete `aghbari-shell-*` caches. Ledger and reuse-audit evidence were refreshed. `IMPLEMENTED=YES; INTEGRATED=YES; TESTED_EXACT_SHA=PASS`; `BROWSER_PROVEN=NOT RUN; PRODUCTION_PROVEN=NOT RUN`.
- **Customer lifecycle source comparison:** donor source at `Report-Engainall/aghbari-commerce@00d7446bba9652ea40178a08b00c9da9a2bba8a1`: activation page blob `a51b02c18a083ba53e87ce1c4d2865206d2d587b`, panel blob `48fd6183f5b318337336d6e5af3e371279ff0e3a`, legacy service blob `8daf05fbb2d65988f06cca0db3d8ede43c439cd8`. Keep `ADAPT_IN_PLACE` / `ADAPT_TARGET_NATIVE_UI` / `REPLACE_LEGACY_SERVICE_WITH_TARGET_NATIVE_RPC`: the donor’s direct `customer_invitations` reads, `?invite=` links, enum/legacy customer tiers and legacy RPCs do not match target contracts and are not copied.
- **P2 cross-branch progress, not combined-head proof:** PR [#18](https://github.com/Report-Engainall/Nasr1/pull/18) head `358a073d0e9b78ecfabd13d3b3297319862b7f5d) includes the admin invitation dialog wiring, generated route-tree update and an expanded PostgreSQL harness. Actions [39477827996](https://github.com/Report-Engainall/Nasr1/actions/runs/39477827996) and [39477828020](https://github.com/Report-Engainall/Nasr1/actions/runs/39477828020) both report SUCCESS on that exact P2 head. The harness blob `5975d49b3b7a4438c2a961d35ef2d2910d28017b) includes authoritative `auth.users.email_confirmed_at`, denial of direct invitation-table SELECT/INSERT/UPDATE/DELETE, staff/tenant/email/expiry/one-use/replay/revocation checks and audit assertions. This does **not** prove the customer activation gates on a combined PR #26 head.
- **Remaining activation blocker:** P1 migration `supabase/migrations/20261020110000_customer_activation_invitations.sql` blob `cef9cb41c88620114af4c37761515a1b177538b5` and P2 migration `supabase/migrations/20261020140000_customer_activation_invitations.sql` blob `f62ec20998ddc4b6a00517bdab1f55c9a73d58da` both create the same table and overlapping create/list/revoke/accept RPC contracts. P1 has sent a fresh handoff in PR #18 comment [6298655589](https://github.com/Report-Engainall/Nasr1/pull/18#issuecomment-6298655589). Before combining, keep one canonical migration or prove the second is a genuine forward-only delta, then run the full ordered migration suite and relevant acceptance on the combined exact head. P1 did not edit P2-owned UI, route tree or test harness.
- **Unassessed donor migration review:** compared the 35 SQL migrations from `Aghbari-Technologies/aghbari-commerce-evolved@d24695209b45f2352e0ba994e1f5109d7e2afc9d) against the target Git tree at code SHA `8953a6ca72b6e5d90fbf179ab5ff729f2774c806`: all 35 source blob SHAs equal the corresponding active target blobs. The customer-company-membership migration was already recorded by `NASR1-SOURCE-CUSTOMER-COMPANY-MEMBERS-001`; 34 remaining files were added individually to `SOURCE_INTEGRATION_LEDGER.csv) as `ALREADY_PRESENT_EXACT`. No donor migration was copied or separately run.
- **First older core candidate:** `Report-Engainall/aghbari-commerce@00d7446bba9652ea40178a08b00c9da9a2bba8a1/supabase/migrations/0001_operational_core.sql`, blob `14a804f2b15792ef6fc5788b1a434b670c778a4f), is recorded `INCOMPATIBLE_WITH_EVIDENCE`. It defines a conflicting older core contract: `profiles.id` directly references `auth.users`, role/tier/order-status enums and `customers.name/is_active`; target baseline blob `18dcf88b95ff41aa84123ff1a2518ca9a7828535` has internal profile IDs plus `auth_user_id`, separate `user_roles`, and `customers.customer_code/business_name/status/profile_id`. Replaying the donor baseline would conflict with target tables/types and introduce incompatible identity/RLS/RPC assumptions. It was not staged, run or applied; target-only PostgreSQL acceptance passed at the exact code SHA above. The reuse audit now records the exclusion evidence.
- **Owned evidence snapshots after this refresh:** source ledger blob `00adbf070de86dbe1cb35ca8cd984c52b1eb89b2` (175 data rows); reuse audit blob `9663be4f8dda00caeef765f355947809c6559621` (102 data rows). These docs-only commits trigger fresh CI; do not label a docs head PASS until its own run is read back. Latest known docs-head run when this section was prepared was [39478868718](https://github.com/Report-Engainall/Nasr1/actions/runs/39478868718), QUEUED on `6f3ac967ed23560a990b8798e83e85972d28caaf`; the earlier code SHA’s action remains the exact successful code-suite evidence above.
- **Next single source task:** `NASR1-SOURCE-UNASSESSED-MIGRATION-SEMANTIC-GAP-001` — next candidate only: `Report-Engainall/aghbari-commerce@00d7446bba9652ea40178a08b00c9da9a2bba8a1:supabase/migrations/0002_server_authoritative_commands.sql` blob `f4397eb5303ef94e699b1a9d2e498914952317da`. Review its server-side catalog/checkout behavior against target UI, RPCs, pricing and transaction guards before assigning a decision; do not copy its legacy SQL as-is.


## 6.14. تحديث حي: إغلاق Service Worker ومقارنة دورة العملاء ومصدر أوامر الطلب — 2026-10-20

### إثبات الرأس وCI
- المستودع الهدف الوحيد: `Report-Engainall/Nasr1`; الفرع المستمر: `integration/inventory-transfer-batches-20261019-rebased`; PR #26 مفتوح Draft وغير مدمج.
- الرأس الذي فُحص حيًا قبل تحديث السجلات: `c73cfbc52bf1fc6df3603975e0aa06b2bb0deeb8`. [Actions 39478964933](https://github.com/Report-Engainall/Nasr1/actions/runs/39478964933) انتهى `SUCCESS` على SHA نفسه، ووظيفة `test-and-build` اكتملت بنجاح. خطوات التحقق المؤكدة: Bun frozen-lockfile، تثبيت الاعتماديات، Unit tests، migrations وقبول PostgreSQL 17 الأساسي، اختبار تزامن idempotency للاستيراد، قبول قاعدة بيانات العناصر المحفوظة، lint، build، production-preview smoke على 4173، dev smoke على 5173 والتنظيف.
- ملفات Service Worker على الرأس نفسه: `public/sw.js` blob `166e449316349394e8870cb14f90067893a0dd24` و`src/test/service-worker-cache-boundary.test.ts` blob `3df0bee116f65bc30fece458b1591cdf368a30e9`. القرار هو الإبقاء على كود Nasr1 الأكثر تقييدًا: same-origin GET فقط، لا cache لمسارات auth/REST/RPC/storage/functions، التنقلات تحفظ shell الجذر فقط، والأصول الثابتة ضمن allowlist. لا يوجد اختبار متصفح يدوي لمسار Service Worker ولا إثبات نشر إنتاجي؛ حالتهما `NOT RUN`.

### مطابقة دورة دعوة العميل — P1 انتهت من المقارنة، والتكامل المشترك ليس مغلقًا
- بصمات الهدف على الرأس الحالي: صفحة التفعيل `src/components/CustomerActivationInvitationPage.tsx` = `2afb92b62346c22315ce35577a933284e1c8b43a`؛ النافذة `src/components/CustomerActivationInvitationDialog.tsx` = `798dea1dc5264b7d58d0f71c676471242c0e7b00`؛ الخدمة `src/lib/customer-activation-invitations.ts` = `71aa1c0594959dfc2201a6d61ed2818bfb07dac4`؛ مسار الملف `src/routes/customer.activate.$token.tsx` = `0259aff2d49b26c85498e46aea5f87f81cd0da5d`.
- مصدر المقارنة `Report-Engainall/aghbari-commerce@00d7446bba9652ea40178a08b00c9da9a2bba8a1`: `CustomerActivation.tsx` blob `a51b02c18a083ba53e87ce1c4d2865206d2d587b`، `CustomerPanel.tsx` blob `48fd6183f5b318337336d6e5af3e371279ff0e3a`، `customerInvitations.ts` blob `8daf05fbb2d65988f06cca0db3d8ede43c439cd8`. القرار: عدم نقل عقد الجدول القديم أو direct table reads أو المسار القديم؛ التنفيذ الهدف يستخدم RPCs وRLS وعنوان تفعيل ذي رمز لمرة واحدة.
- قراءة PR #18 الحية: الرأس `f224e2d8d36707f3bafec73a62b7298f4d479349`، وتغييرات PR تتضمن واجهة الدعوة ومسار الملف و`routeTree.gen.ts` وharness. [Actions 39479581782](https://github.com/Report-Engainall/Nasr1/actions/runs/39479581782) و[Playwright 39479579942](https://github.com/Report-Engainall/Nasr1/actions/runs/39479579942) و[Playwright 39479572526](https://github.com/Report-Engainall/Nasr1/actions/runs/39479572526) انتهت جميعها بنجاح على الرأس P2 المذكور. اختبارات Playwright المسماة هنا تخص تدفق الطلب وعزل المؤسسة؛ لا أعدّها اختبارًا حيًا للإنتاج ولا أزعم أن الفرعين اختُبرا كتركيب موحّد.
- **الحاجز المشترك الباقي:** migration الهدف على فرع P1 `supabase/migrations/20261020110000_customer_activation_invitations.sql` blob `cef9cb41c88620114af4c37761515a1b177538b5`، بينما PR #18 يحتوي `supabase/migrations/20261020140000_customer_activation_invitations.sql` blob `f62ec20998ddc4b6a00517bdab1f55c9a73d58da`. كلاهما يعرّف جدول الدعوات وRPCs نفسها. يلزم اختيار migration مرجعية واحدة أو كتابة forward delta مدروس قبل الدمج؛ لا أعدّل ملف migration الخاص بـP2 أو `scripts/test-database-migrations.mjs` ولا أرخّي RLS. لذلك: `P1_SOURCE_REVIEW=COMPLETE`; `COMBINED_INTEGRATION=BLOCKED_MIGRATION_RECONCILIATION`; `BROWSER_PROVEN=NOT RUN` لدعوات العميل على PR #26؛ `PRODUCTION_PROVEN=NOT RUN`.

### قرار مصدر migration 0002
- المصدر `Report-Engainall/aghbari-commerce@00d7446bba9652ea40178a08b00c9da9a2bba8a1`, الملف `supabase/migrations/0002_server_authoritative_commands.sql`, blob `f4397eb5303ef94e699b1a9d2e498914952317da`. لم يُطبّق SQL المانح ولم يُنسخ.
- أمر المانح `create_order` يعيد الطلب السابق عند إعادة استخدام المفتاح إذا تطابق العميل والمخزن فقط؛ لا يتحقق من hash الحمولة في هذه migration. Nasr1 يملك حاليًا مسارًا أقوى: `submit_customer_order` يلتف على أمر خادمي، و`place_order` يحسب `idempotency_payload_hash` ويقفل محاولة المفتاح تنافسيًا ويرفض إعادة استخدام المفتاح لحمولة مختلفة. كما أن أسعار الفئة مشتقة من سياق العميل/المؤسسة على الخادم، والجدول الخام للأسعار غير قابل للقراءة مباشرة؛ توجد لقطات عناوين التسليم والترويج وتاريخ الطلب وoutbox.
- **القرار:** `ALREADY_PRESENT_BETTER` لأمر الطلب، ولا نقل لعقد المانح الذي يعتمد `customers.tier/is_active` و`warehouses` و`product_prices/price_lists` القديمة. واجهة Nasr1 الحالية تستدعي `validate_checkout_cart` ثم `submit_customer_order`، وتمنع عرض الإجماليات المالية في ملخص العميل. قرار المصدر والملفات المكافئة واختبار CI الحالي مسجلة في ledger/audit.
- المصدر التالي الوحيد بعد هذا القرار: `NASR1-SOURCE-UNASSESSED-MIGRATION-SEMANTIC-GAP-002` — `supabase/migrations/0003_command_hardening.sql`، blob `f8de4174145f9145e801ef0bbc1e2afb8debe591`. لا يُعاد فحص ملفات دعوة العميل أو الأرشيفات ما دامت بصماتها المسجلة ثابتة.


### 6.14.1. قرار المصدر وقت المراجعة — محدث بالقسم 6.17

- قرار عدم نسخ `0002_server_authoritative_commands.sql` الخام ما زال صحيحًا لأن مخطط المصدر مختلف؛ في وقت كتابة هذا القسم لم يكن الترقيم الخادمي مدمجًا. اكتملت الفجوة لاحقًا بتنفيذ Nasr1-native، ودليله التفصيلي في القسم 6.17. يحتفظ ملف المانح بتصنيف `KEEP_AS_REFERENCE`.

## 6.15. دفعة تنفيذ وظيفي: سلة عميل محفوظة على الخادم عبر الأجهزة — 2026-10-20

### الفجوة المثبتة والمصدر
- المصدر للقراءة فقط: `Report-Engainall/aghbari-commerce@00d7446bba9652ea40178a08b00c9da9a2bba8a1`, `supabase/migrations/0006_cart_and_cancellation_hardening.sql`, blob `04aaed5fd13911f882f80cf18fd6b45ea399f7d1`.
- الهدف قبل الدفعة كان يحفظ مسودة السلة في `localStorage` فقط عبر `src/lib/offline-cart.ts`; لا توجد دالة قراءة/كتابة سلة عميل على الخادم. لذلك السلة لا تنتقل إلى جهاز آخر ولا تستعيد نفسها من الحساب بعد تبديل الجهاز. هذا نقص تشغيل فعلي وليس ملفًا ناقصًا فقط.
- القرار: `ADAPT_AND_INTEGRATE` لوظيفة السلة وحدها. لم يُنقل مخطط المانح القديم أو عقود `customers.tier/is_active`، ولم يُنسخ `transition_order` القديم الذي يستخدم أدوار/status ومسميات جداول مختلفة. تبقى معالجة الإلغاء مع قيود Nasr1 الخاصة بالحجز وحركات المخزون.

### ما نُفّذ فعليًا
- أضيفت migration `supabase/migrations/20261020210000_customer_persistent_cart.sql` (blob الأولي `075efd8cedb4392434e8ad794c01e7f72913d870`) لجداول `customer_carts` و`customer_cart_items`، مع RLS مفعّل ومنع كل وصول مباشر من `PUBLIC/anon/authenticated`. واجهة العميل لا تستخدم إلا RPC.
- أضيفت `public.get_customer_cart()` و`public.sync_customer_cart(jsonb)`؛ كلاهما `SECURITY DEFINER` مع `search_path = ''`، وهوية المؤسسة والملف من الجلسة الحالية، والرفض لحسابات الموظفين، وفحص الدور والملف النشط والمنتج النشط في المؤسسة نفسها. التحقق يتم بالكامل قبل استبدال السلة؛ الحد 100 صنف/10000 لكل كمية؛ رفض المعرّفات أو الكميات غير الصحيحة والأسطر المكررة وأي حقول زائدة مثل السعر؛ قفل صف السلة يمنع كتابة بنود مختلطة بالتزامن. لا تحفظ السلة سعرًا أو إجماليًا؛ التحقق المالي والمخزون يبقيان على الخادم عند إتمام الطلب.
- أضيفت خدمة العميل `src/lib/customer-cart.ts`، واختبارات عقد الخدمة وقيود migration، واختبار PostgreSQL مستقل `scripts/test-customer-cart-persistence.mjs` يغطي عزل عميلين، عزل مؤسسة، رفض الموظفين، idempotency عند تكرار الحالة، الكتابة المتوازية، rollback على payload غير صحيح، ومنع القراءة/الكتابة المباشرة، وتفريغ السلة.
- رُبطت `Storefront.tsx` بسحب السلة عند فتح حساب العميل وبمزامنة متأخرة قصيرة بعد تعديلها، مع حالة واضحة للاتصال/المزامنة وزر إعادة المحاولة. تظل المسودة المحلية متاحة عند انقطاع الإنترنت؛ لا يعتمد الطلب دون تحقق الخادم. لا تغيير في `src/lib/api.ts` أو `src/routeTree.gen.ts` أو ملفات P2.

### الفشل السابق والسبب الجذري
- [Actions 39483696866](https://github.com/Report-Engainall/Nasr1/actions/runs/39483696866) على SHA `1ff4a5076c0729945740ba4dd2ff50ff41a95f2c` فشل في Unit tests فقط: `src/test/customer-cart.test.ts` (5 اختبارات). السبب الجذري المثبت من سجل الاختبار أن regex التحقق من UUID اشترط version nibble من 1 إلى 8 وvariant محددًا، بينما UUIDs صحيحة نحويًا في PostgreSQL ومستخدمة للمعرفات الاختبارية تحتوي على مجموعات صفرية. خفّضت قيود العميل إلى شكل UUID عام؛ لم ألمس صلاحيات قاعدة البيانات أو أضعف التحقق من المؤسسة.
- تحديث تاريخي لهذه النسخة من التقرير: بعد إصلاح اختبار UUID، فشل قبول PostgreSQL 17 على SHA `92b28f325068e4dc69cd81d8ccd5982e6bbc7cf0` لأن الترحيل استدعى دالة غير موجودة `pg_catalog.jsonb_object_length(jsonb)`. أُصلح السبب الجذري وأُعيد اختبار الرأس المصحح؛ انظر القسم 6.15.1.
- حالة الدليل وقت كتابة المقطع الأول: `IMPLEMENTED`; `INTEGRATED`; `TESTED_EXACT_SHA=PENDING`. أُغلقت حالة CI لاحقًا في القسم 6.15.1؛ لا يتغير حد إثبات المتصفح/الإنتاج.

### قرار المصدر التالي الوحيد بعد الإغلاق
- `NASR1-SOURCE-UNASSESSED-MIGRATION-SEMANTIC-GAP-007-AGHBCOM-STAFF-CATALOG-0007` — المصدر التالي `supabase/migrations/0007_staff_catalog_commands.sql`, blob `239789342a29a824852185cdbb95de7906900dbc`. لا تنقل العقود القديمة قبل مطابقتها مع واجهات وأوامر Nasr1 الحالية.


## 6.15.1. إغلاق سلة العميل المحفوظة — إصلاح الجذر وإثبات SHA مطابق (2026-10-20)

- **الفشل الأول محفوظ:** [Actions 39483696866](https://github.com/Report-Engainall/Nasr1/actions/runs/39483696866) على `1ff4a5076c0729945740ba4dd2ff50ff41a95f2c` فشل في 5 اختبارات من `src/test/customer-cart.test.ts` بسبب validator كان يفرض أرقام إصدار/variant على UUID؛ خُففت القاعدة إلى شكل UUID عام، دون تغيير تحقق المؤسسة أو الصلاحيات.
- **الفشل الثاني محفوظ:** [Actions 39484145821](https://github.com/Report-Engainall/Nasr1/actions/runs/39484145821) على `92b28f325068e4dc69cd81d8ccd5982e6bbc7cf0` اجتاز Unit tests لكنه فشل في قبول PostgreSQL 17 لأن `jsonb_object_length(jsonb)` غير موجودة. السبب كان خطأً في SQL، لا RLS ولا grants.
- **الإصلاح:** في `supabase/migrations/20261020210000_customer_persistent_cart.sql` استُبدل الاستدعاء غير الموجود بتحقق مرحلي من نوع JSON object، ثم طرح مفاتيح `product_id` و`quantity` والتحقق من عدم بقاء مفاتيح إضافية. بصمة الترحيل النهائية: `3001681069d2567fb9c17e74be1d85de5bb8e47d`. اختبار العقد `src/test/customer-cart-persistence-migration.test.ts` بصمته `e15a11d281fdd7e219276f393d05dd4b3cd6d02c`.
- **الرأس المختبر:** [commit `dc8377209b81d1a6a307242ede3d71f9d3f18949`](https://github.com/Report-Engainall/Nasr1/commit/dc8377209b81d1a6a307242ede3d71f9d3f18949). [Actions 39484437993 — SUCCESS](https://github.com/Report-Engainall/Nasr1/actions/runs/39484437993) على SHA نفسه. 67/67 ملف اختبار اجتاز؛ تطبيق migrations وقبول PostgreSQL 17 نجحا، بما في ذلك اختبار السلة الفعلي: عزل المؤسسة/الملف، replay idempotency، تسلسل الكتابة المتزامنة، rollback للتحقق غير الصحيح، منع الوصول المباشر مع RPC-only privileges. كما نجح قبول idempotency للاستيراد والعناصر المحفوظة، lint، build، production-preview smoke على 4173، dev smoke على 5173 والتنظيف.
- **الحالة:** `IMPLEMENTED=YES`; `INTEGRATED=YES`; `TESTED_EXACT_SHA=PASS (dc8377209b81d1a6a307242ede3d71f9d3f18949)`; `BROWSER_PROVEN=NOT RUN`; `PRODUCTION_PROVEN=NOT RUN`. الـpreview/dev smoke اختبار CI وليس اختبار مستخدم يدويًا ولا إثبات نشر إنتاجي.
- **الاستئناف التالي الوحيد:** `NASR1-SOURCE-UNASSESSED-MIGRATION-SEMANTIC-GAP-007-AGHBCOM-STAFF-CATALOG-0007`. المصدر والبصمة مسجلان؛ قارن الميزة كاملة ولا تنقل schema/RPC قديمة قبل إثبات فجوة في Nasr1.


## 6.16. إغلاق أوامر كتالوج الموظفين 0007 — إصلاح السبب الجذري وإثبات CI مطابق (2026-10-20)

### قرار مصدر مثبت
- المصدر: `Report-Engainall/aghbari-commerce/supabase/migrations/0007_staff_catalog_commands.sql`، بصمة Git blob: `239789342a29a824852185cdbb95de7906900dbc`، مصدره commit `00d7446bba9652ea40178a08b00c9da9a2bba8a1`.
- المصدر المانح لا يحتوي الدالة `save_admin_catalog_product`؛ بل يقدّم أوامر قديمة `create_category`, `upsert_product`, `set_product_price`, `adjust_inventory` مع اعتماد على `audit_events` ومخطط سعر مختلف. القرار: `ADAPT_AND_INTEGRATE`، وعدم نقل SQL المانح الخام.
- مخطط Nasr1 الفعلي يحتفظ بأسعار الشرائح في `product_prices`، والتدفق المعتمد هو `get_admin_product_price_grid()` و`save_product_price_grid(jsonb)`. الدالة الجديدة لا تكتب إلى أعمدة شرائح قديمة على `products` ولا تخلق مسار تسعير موازيًا.
- سجل التدقيق الصحيح هو `audit_logs(organization_id, actor_id, action, entity_type, entity_id, old_value, new_value)`. أوامر الإنشاء/التعديل/الأرشفة تشتق المؤسسة والمستخدم من سياق الخادم، وتتحقق من الملف النشط والدور، وتعزل التصنيف والمنتج عن المؤسسات الأخرى. الكتابة المباشرة على `categories`, `product_prices`, `audit_logs` ممنوعة، وتعديل/حذف المنتج المباشر ممنوع؛ مسار إدخال المنتج يبقى ضمن RLS المؤسسة القائم حتى لا ينكسر قبول P2 للبيانات الاختبارية.

### السبب الجذري للفشل
- اختبار PostgreSQL كان يمرر `JSON.stringify(payload)` إلى معامل `$1::jsonb` في عميل `postgres`. العميل كان يعيد ترميز النص كسلسلة JSON scalar؛ ولذلك كانت الدالة ترى `jsonb_typeof(p_payload) = 'string'` لا كائن JSON، ولم يكن الخطأ الأصلي دليلًا على وجود حقل منتج فعلي غير معروف.
- أصلح الاختبار ليربط كائن JavaScript مباشرة (`[payload]`, `[created.id, update]`). أبقيت allowlist صارمة وأضفت تشخيصًا يعرض أسماء المفاتيح المرفوضة؛ اختبار `shadow_tier_price` يثبت رفض الحقل غير المسموح مع `DETAIL: unsupported fields: shadow_tier_price`.
- أصلحت تعارض السعر المتزامن بترجمة SQLSTATE `40001` إلى رسالة إعادة التحميل المعتمدة، وأزلت `any` من محوّل الحمولة TypeScript بدل تخفيض قاعدة lint.

### الملفات المنفذة وبصمات Git blob عند الرأس المختبر
- `supabase/migrations/20261020220000_staff_catalog_commands.sql` — `309844a812fcb4c3564c1d7d8cc8eb22d0bb50fa`
- `scripts/test-admin-catalog-commands.mjs` — `4259e03bf3bff659c83adffdb658871a7b9dc9ef`
- `src/test/staff-catalog-commands-migration.test.ts` — `044e1011cb2fbd070507aad5f93b56d48e2c15b8`
- `src/lib/admin-catalog-commands.ts` — `ecc91c45a535fc966788b09a7a49cadde23a3025`
- لم تُعدّل ملفات المبرمج 2 المحمية: `src/lib/api.ts`, `src/components/AghbariApp.tsx`, `src/routeTree.gen.ts`, `package.json`, workflows الخاصة به، أو `scripts/test-database-migrations.mjs`.

### الاختبار والنتيجة
- الرأس المختبر المطابق: [`20822761dfdd5a6bd331ea1f172d8c7dcad2cad6`](https://github.com/Report-Engainall/Nasr1/commit/20822761dfdd5a6bd331ea1f172d8c7dcad2cad6).
- [Actions 39491944048 — SUCCESS على SHA نفسه](https://github.com/Report-Engainall/Nasr1/actions/runs/39491944048): وحدة الاختبارات، تطبيق migrations وقبول PostgreSQL 17 (بما في ذلك product/category CRUD soft archive وallowlist وstale-price conflict وعزل المؤسسة وسياق audit ومنع DML المباشر)، import idempotency concurrency، saved-products acceptance، lint، build، preview smoke 4173، dev smoke 5173 والتنظيف كلها ناجحة.
- الحالة: `IMPLEMENTED=YES`; `INTEGRATED=YES`; `TESTED_EXACT_SHA=PASS (20822761dfdd5a6bd331ea1f172d8c7dcad2cad6; Actions 39491944048)`; `BROWSER_PROVEN=NOT RUN`; `PRODUCTION_PROVEN=NOT RUN`.

### الاستئناف التالي من السجل الحي
- `NASR1-SOURCE-UNASSESSED-MIGRATION-SEMANTIC-GAP-001-AGHBCOM-CATALOG-0002`: تحقيق pagination الكتالوج الخادمية على عقود Nasr1 الحالية؛ لا نقل `0002_server_authoritative_commands.sql` خامًا، ولا تعديل `src/lib/api.ts` دون تنسيق مع P2.

## 6.17. إغلاق ترقيم الكتالوج الخادمي — سبب الجذر والبصمات وقبول SHA النهائي

### السبب الجذري والتصحيح
- فشل PostgreSQL 17 الأول على SHA `e4d1fb33dc3a43b800c67b8f1c98d3d45d400c0b` لأن الترحيل أشار إلى `inventory_balances.organization_id`، وهو عمود غير موجود في مخطط Nasr1.
- الإصلاح لا يغيّر المخطط ولا يضيف حقلًا وهميًا: ربط الأرصدة يستعمل `inventory_balances.product_id` و`warehouse_id`، مع `EXISTS` يتحقق من `warehouses.organization_id` و`is_active`. تقييد المنتج نفسه إلى المؤسسة يتم عبر `products.organization_id` المستخرج من سياق الخادم.
- لم يُنسخ donor SQL `0002_server_authoritative_commands.sql`; توافق مخططه أقدم. استُخدم RPC `get_storefront_catalog_page` لخدمة بحث/تصنيف/availability/count و`OFFSET/LIMIT`، مع ترتيب ثابت وحد صفحة أقصى 100.
- التسعير يستعمل RPC الحالي `get_storefront_product_prices`؛ لم تُكشف مفاتيح أسعار الشرائح ولم يُنشأ مسار تسعير ثانٍ. الكتالوج المرقّم لا يسقط على cache عام عند فشل طلب مقيّد بالمؤسسة.

### الملفات وبصمات Git blob
- `supabase/migrations/20261020230000_storefront_catalog_pagination.sql`: `19179c346848a8991d71cb1897d80e61732d4501`.
- `src/lib/storefront-catalog.ts`: `5ca04b24ddea87c1d89c136b3c3524d823c9c670`.
- `src/components/Storefront.tsx`: `905825d6df7dabaaf5ed8c08c39c45dc9cdeffd8`.
- `src/test/storefront-catalog-pagination.test.ts`: `27cfed01146e29a8feec9c62772e72ce6e27b685` — 6 unit tests.
- `scripts/test-admin-catalog-commands.mjs`: `f5bab2c46e4bb7a0915bb5bda3ecff69cacf9501` — PostgreSQL acceptance of category/search paging, total count, no duplicates/missing rows, authorized display-price boundary and availability filter.

### النتيجة المثبتة
- كود الرأس المختبر: [`83a0b11edafb83f8552a063b9c4643956f899a6b`](https://github.com/Report-Engainall/Nasr1/commit/83a0b11edafb83f8552a063b9c4643956f899a6b).
- [Actions 39495527676 — SUCCESS على SHA نفسه](https://github.com/Report-Engainall/Nasr1/actions/runs/39495527676): 71/71 test files؛ 474/474 tests؛ PostgreSQL 17 migrations and core acceptance؛ import-idempotency concurrency؛ saved-products acceptance؛ lint/build؛ production-preview smoke 4173؛ dev smoke 5173.
- الحالة: `IMPLEMENTED=YES`; `INTEGRATED=YES`; `TESTED_EXACT_SHA=PASS`; `BROWSER_PROVEN=NOT RUN`; `PRODUCTION_PROVEN=NOT RUN`. سموك المعاينة ليس إثبات نشر إنتاج أو جلسة متصفح مصادق عليها.

### المهمة التالية
`NASR1-SOURCE-UNASSESSED-MIGRATION-SEMANTIC-GAP-004-AGHBCOM-EXPORT-JOBS-0004` — دورة تصدير غير متزامن تشمل ملكية المؤسسة والمنفّذ، مفاتيح idempotency، worker lease/retry، ملفات خاصة ذات انتهاء، وتنزيلًا قصير العمر. لا تنقل scaffold المانح وحده.
 
## 6.18. تنفيذ دورة تصدير الطلبات غير المتزامن وربطها بالواجهة — 2026-10-20

### نتيجة التكامل
- المصدر `Report-Engainall/aghbari-commerce/supabase/migrations/0004_import_storage.sql` ظل مرجعًا للقراءة فقط؛ لم يُنسخ أو يُطبّق خامًا. نُفّذ بديل Nasr1-native يغطي دورة التصدير كاملة.
- رأس الكود المختبر: [`7a62ac5cf68b05db5e6f313cab84104cf49cf773`](https://github.com/Report-Engainall/Nasr1/commit/7a62ac5cf68b05db5e6f313cab84104cf49cf773).
- [Actions 39498693983 — SUCCESS على SHA المطابق](https://github.com/Report-Engainall/Nasr1/actions/runs/39498693983).
- النتائج: unit tests، ترحيلات وقبول PostgreSQL 17، اختبار دورة التصدير، import idempotency concurrency، saved-products acceptance، lint، build، preview smoke 4173، dev smoke 5173 والتنظيف نجحت. لا يوجد إثبات جلسة متصفح يدوي مصادق عليها ولا نشر إنتاج فعلي؛ كلاهما `NOT RUN`.

### حدود الأمان والتشغيل
- الطلبات مربوطة بالمستخدم الفعال والمؤسسة ومفتاح idempotency مع hash للمرشحات؛ إعادة استخدام المفتاح بمرشحات مختلفة تُرفض.
- صلاحيات الطلبات للمسؤول/المدير/المحاسب؛ جدول المهام بلا وصول مباشر للمستخدمين. الكتابة تمر عبر RPCs الخادمية، وسجل التدقيق يثبت الطلب والإكمال والفشل النهائي.
- العامل يستخدم `FOR UPDATE SKIP LOCKED` وlease لمدة محدودة، حدًا أقصى خمسة محاولات وإعادة محاولة متدرجة، ومعالجة أخطاء منقحة بدل تخزين بيانات حساسة.
- مصدر الطلبات يقتصر على الطلبات المعتمدة التي لا تتطلب مراجعة كمية؛ المرشحات مؤسسية. الحدود 1000 طلب و10000 بند و25 MiB.
- ملفات CSV عربية بترميز UTF-8 BOM، تهريب للخلايا وحماية من CSV formula injection، SHA-256، تخزين خاص مع انتهاء بعد 7 أيام، وروابط تنزيل موقعة لمدة 60 ثانية فقط. التنظيف يحذف الملف الخاص بعد انتهاء صلاحيته.
- واجهة RTL على `/admin/exports` تشمل تواريخ التصدير، سجل الحالة، التحديث كل 5 ثوانٍ، إلغاء الطلبات المعلقة، تنبيه العامل وتنزيل الرابط المؤقت. يوجد رابط من صفحة التقارير. لم تُمس `src/components/AghbariApp.tsx` أو `src/routeTree.gen.ts` أو `src/lib/api.ts` أو `package.json`.

### الملفات وبصمات Git blob على رأس الكود المختبر
- `supabase/migrations/20261020240000_async_export_jobs.sql` — `503f7832a90a2272af86f1b05f95d0d2a802c93f`.
- `supabase/functions/async-export-worker/index.ts` — `e091a2a23fd6afd631e6d9b0d28aa6e0b1bc8bc4`.
- `supabase/functions/async-export-download/index.ts` — `006bd9af09b53201c187d2e0649918bab4bc9bc8`.
- `src/lib/async-export-csv.ts` — `f4423da23c2c0d850b770a7de4f4b80ac962e034`.
- `src/lib/async-export-jobs.ts` — `f899ae1b85c88d605626f1d4f04f5c5298c94627`.
- `src/test/async-export-job-contract.test.ts` — `6dee673db47877d5138dbdd936f32a3fc213c53e`.
- `scripts/test-async-export-jobs.mjs` — `8bff84f46a3da04a9d3a5c4f2378bbd1b05c633b`.
- `src/components/AsyncExportCenter.tsx` — `29ff7ba59d04dea40455dcbb8cbaf98ff862a97f`.
- `src/routes/admin_.exports.tsx` — `d48af7450b5ab1bfb02e8c789f09412d44cdcf79`.
- `src/test/async-export-route-contract.test.ts` — `209e282a76616b78ab879c04d6b0b74ec7fde5b0`.
- `src/routes/admin_.reports.tsx` — `febf62ff1a178764a295416a2e31fc82c5bd3bb0`.

### الحالة
`IMPLEMENTED=YES`; `INTEGRATED=YES`; `TESTED_EXACT_SHA=PASS (7a62ac5cf68b05db5e6f313cab84104cf49cf773; Actions 39498693983)`; `BROWSER_PROVEN=NOT RUN`; `PRODUCTION_PROVEN=NOT RUN`.

### الاستئناف
المهمة التشغيلية التالية هي `NASR1-SOURCE-CUSTOMER-LIFECYCLE-PARITY-001-ACTIVATION`، وهي مرتبطة بتغييرات دورة العميل التي يجريها P2. لا تُعدّل المسارات المملوكة له؛ افحص رأس PR #18 وسجله فقط للتمييز بين ما دُمج وما لا يزال بانتظاره، ثم انتقل إلى أقرب مهمة غير محجوبة لا تشترك في ملكية الملفات.

## 6.19. قبول PostgreSQL 17 المطابق: كتالوج الموظفين وسجل بدء جرد المخزون — 2026-10-21

### كتالوج الموظفين 0007 — إغلاق الفشل الأصلي وإعادة إثباته

- الفشل التاريخي على SHA `298bd1f98d3f516203b798d09283083c65ee61f9` في [Actions 39486351594](https://github.com/Report-Engainall/Nasr1/actions/runs/39486351594) لم يكن بسبب حقل منتج فعلي. كان الاختبار يمرر `JSON.stringify(payload)` إلى Postgres.js كمعامل نصي ثم يصبّه إلى `$1::jsonb`؛ أصبحت قيمة JSON scalar string، فرفضتها الدالة قبل فحص حقول المنتج.
- التصحيح في `scripts/test-admin-catalog-commands.mjs` يستخدم `admin.json(payload)` و`admin.json(update)`، بينما تبقى allowlist صارمة؛ تضيف SQL أسماء المفاتيح المرفوضة في DETAIL ولا تخفف الحقول المسموحة. المخطط المستهدف يستخدم `product_prices` وRPC السعر القياسي `save_product_price_grid`/`get_admin_product_price_grid`، والتدقيق في `audit_logs` مع actor والمؤسسة وقيم before/after.
- ملفات الإثبات على رأس الكود المختبَر: migration `supabase/migrations/20261020220000_staff_catalog_commands.sql` blob `309844a812fcb4c3564c1d7d8cc8eb22d0bb50fa`؛ runtime script blob `29f3ae2db8a320695181c7664a969d9885c96914`؛ static contract test blob `307a78ef0da765132bd63171c8e1969ca83938e0`؛ helper blob `ecc91c45a535fc966788b09a7a49cadde23a3025`. المصدر المانح `Report-Engainall/aghbari-commerce/supabase/migrations/0007_staff_catalog_commands.sql` blob `239789342a29a824852185cdbb95de7906900dbc` بقي مرجعًا ولم يُطبق SQL المانح خامًا.

### سجل بدء الجرد — اختبار runtime مستقل دون لمس harness المملوك لـP2

- أُضيف `scripts/test-stock-count-start-audit.mjs` blob `631f14a483588bf5e76f50bd6b824cddf654781c` وأُدرج في `.github/workflows/commerce-checks.yml` blob `ab6621945156a437e8bb29cd60708ea92230fe65`. لم يتغير `scripts/test-database-migrations.mjs` أو `package.json` أو أي مسار مشترك مملوك لـP2.
- الاختبار يستدعي `start_stock_count` بهوية مدير ومخزن من نفس المؤسسة، ويثبت إنشاء session بهوية profile الصحيحة، وسجل تدقيق واحد بالضبط باسم `inventory.stock_count.started` وبحقول metadata المعتمدة (`warehouse_id`, `status`, `started_at`). يعيد استدعاء الأمر بنفس idempotency key ثم يثبت عدم إنشاء سجل تدقيق مكرر، وينظف جلسة الاختبار عبر أمر الإلغاء الخادمي.
- migration الحالية `supabase/migrations/20261020120000_stock_count_start_audit.sql` blob `8bc0117a08aefb2ae006538c931f9e31793460fe` وstatic test `src/test/stock-count-start-audit-migration.test.ts` blob `df218a87689b16558bcb7dc7bf857c990adb9af6` ظلا كما هما؛ لم تتغير سياسات RLS أو صلاحيات الكتابة المباشرة.

### دليل القبول النهائي

- commit الكود والاختبار: [`9e070285e3e001a8661fe5c297f19face97fdcf5`](https://github.com/Report-Engainall/Nasr1/commit/9e070285e3e001a8661fe5c297f19face97fdcf5).
- [GitHub Actions 39501610331 — SUCCESS على SHA نفسه](https://github.com/Report-Engainall/Nasr1/actions/runs/39501610331): 73/73 ملف اختبار و480/480 اختبارًا؛ قبول PostgreSQL 17 نجح؛ خطوة اختبار سجل الجرد الجديد نجحت؛ تصدير الطلبات وimport idempotency والمنتجات المحفوظة نجحت؛ lint/build/preview smoke 4173/dev smoke 5173 والتنظيف نجحت.
- حالة الكتالوج: `IMPLEMENTED=YES`; `INTEGRATED=YES`; `TESTED_EXACT_SHA=PASS (9e070285e3e001a8661fe5c297f19face97fdcf5; Actions 39501610331)`.
- حالة سجل بدء الجرد: `IMPLEMENTED=YES`; `INTEGRATED=YES`; `TESTED_EXACT_SHA=PASS (9e070285e3e001a8661fe5c297f19face97fdcf5; Actions 39501610331)`.
- `BROWSER_PROVEN=NOT RUN`; `PRODUCTION_PROVEN=NOT RUN`. نجاح سموك CI المحلي لا يثبت نشر الإنتاج أو جلسة متصفح موثقة.

## 6.20. إزالة تصادم version prefix لمهاجر عدم تكرار الاستيراد — 2026-10-21

- اكتُشف في مقارنة الفرعين الحيين أن P1 migration `supabase/migrations/20261020170000_import_job_request_idempotency.sql` تشارك البادئة `20261020170000` مع migration المملوكة لـP2 `supabase/migrations/20261020170000_finance_document_issuer_identity.sql` على رأس P2 `becfe80381604a37e3cea8f865d68cf13a68c754`. تكرار البادئة يمنع قبول سلسلة migrations المشتركة.
- نُقلت migration المملوكة لـP1 إلى `supabase/migrations/20261020180000_import_job_request_idempotency.sql` دون أي تغيير في SQL أو صلاحيات RPC؛ Git blob بقي مطابقًا `9db693b4dbba4dcc397ba6b62800d4f2fa3aa246`. تحديث اختبار العقد غير المشترك مع P2 `src/test/import-job-idempotency-contract.test.ts` إلى blob `f8591475cceff314e4536b68bc4ff99c1c146311` غيّر مسار القراءة فقط.
- إعادة القراءة من HEAD أثبتت حذف المسار القديم، وجود الجديد بنفس blob، وغياب البادئة `20261020180000` من migrations لدى P2. كما لم يعد في مجموعة migrations على فرع P1 أي تكرار لبادئات timestamp.
- قبول الكود المطابق: [commit `1b8b9be1fd7aca1e9fff20a0891c2db7d83ae6ff`](https://github.com/Report-Engainall/Nasr1/commit/1b8b9be1fd7aca1e9fff20a0891c2db7d83ae6ff)؛ [Actions 39502788878 — SUCCESS](https://github.com/Report-Engainall/Nasr1/actions/runs/39502788878): 73/73 ملف اختبار و480/480 اختبارًا، PostgreSQL 17، اختبار عدم التكرار المتزامن للاستيراد، سجل تدقيق بدء الجرد، التصدير والمنتجات المحفوظة، lint/build، وسموك preview/dev.
- ما زال الدمج المشترك PR #26 + PR #18 **غير مثبت**: migration تفعيل P1 `20261020110000_customer_activation_invitations.sql` blob `cef9cb41c88620114af4c37761515a1b177538b5` تتصادم بالبادئة مع migration Onyx لدى P2 `20261020110000_onyx_inventory_reconciliation_apply_rollback.sql` blob `9e1e7fde3faaa7887809ebbcef214bc044197223`؛ وP2 لديه أيضًا migration تفعيل منفصلة عند `20261020140000_customer_activation_invitations.sql` blob `f62ec20998ddc4b6a00517bdab1f55c9a73d58da`. نسخة P1 تستمد البريد المؤكد من `auth.users` بينما نسخة P2 تقرأ البريد من JWT، لذلك لا ندمج النسختين أو نغيّر اختبار P2/ملفاته بلا تنسيق صريح.
- حالة التصفح/الإنتاج: `BROWSER_PROVEN=NOT RUN`; `PRODUCTION_PROVEN=NOT RUN`. CI لا يثبت نشر قاعدة الإنتاج أو جلسة مستخدم فعلية.


## 6.21 إغلاق فشل كتالوج الموظفين — 2026-10-21

- الفشل الأصلي: [Actions 39486351594](https://github.com/Report-Engainall/Nasr1/actions/runs/39486351594) على الرأس التاريخي `298bd1f98d3f516203b798d09283083c65ee61f9`. النسخة الفاشلة من الاختبار مررت `JSON.stringify(payload)` إلى `$1::jsonb`، فتحولت الحمولة إلى JSON string scalar بدل object؛ لم يكن هناك حقل مشروع مفقود. الإصلاح يستخدم `admin.json(payload)` ويحافظ على allowlist صارمة ويرفض `shadow_tier_price` صراحة.
- المصدر blob `239789342a29a824852185cdbb95de7906900dbc`; target SQL blob `309844a812fcb4c3564c1d7d8cc8eb22d0bb50fa`; runtime test blob `29f3ae2db8a320695181c7664a969d9885c96914`. الأسعار تمر عبر `save_product_price_grid` و`product_prices`، والتدقيق عبر أعمدة `audit_logs` الفعلية. لا تُطبق SQL المانح خامًا.
- إثبات القبول: [Actions 39501610331](https://github.com/Report-Engainall/Nasr1/actions/runs/39501610331) نجح على code/test SHA `9e070285e3e001a8661fe5c297f19face97fdcf5`; شمل إنشاء/تعديل/أرشفة المنتج، إنشاء/أرشفة التصنيف، رفض الحقول غير المسموحة، رفض تحديث السعر القديم، عزل المؤسسات، هوية سجل التدقيق ومنع DML المباشر. [Actions 39503228966](https://github.com/Report-Engainall/Nasr1/actions/runs/39503228966) نجح أيضًا على الرأس `90df8540847489b0bcd5a5b1770599295672dc17`. `BROWSER_PROVEN=NOT RUN`; `PRODUCTION_PROVEN=NOT RUN`.


## 6.22. جسر استيراد المخزون إلى لقطة Onyx — إثبات جزئي مع تعليق الكتابة التشغيلية — 2026-10-21

### ما نُفّذ واختُبر

- أُضيف الاختبار المستقل المملوك لـP1 `scripts/test-import-inventory-snapshot-contract.mjs`، blob `2acbc8e7b1e6c620f15205b251bcdd5244482292`، وأُدرج في `.github/workflows/commerce-checks.yml`، blob `b94dde30298bb4a090b4bf08ffcb4b6e267f92dd`. لم تُعدّل ملفات P2 المشتركة (`src/lib/api.ts`, `src/components/AghbariApp.tsx`, `src/routeTree.gen.ts`, `package.json`, `scripts/test-database-migrations.mjs`, أو `scripts/test-onyx-reconciliation.mjs`).
- الاختبار يشغّل مسار PostgreSQL الحقيقي: ملف استيراد بتعريف نشط صريح `report_type=inventory_stock` و`matching_key=item_code`، ثم `create_import_job`، صفوف `import_job_rows`، جلسة/شريحة رفع متصلة، ثم `finalize_import_job`. ويثبت أن اللقطة الجاهزة تحفظ المؤسسة، وبصمة الملف، نوع التقرير، عدد الصفوف، `canonical_key/item_code`، الكمية، `row_hash`، وهوية المستودع `warehouse_id/warehouse_code/warehouse_name`.
- أُثبت أن الاستيراد العام وتشغيل المقارنة للقراءة لا يغيّران أرصدة المخزون أو المحجوز أو توقيت تحديث الرصيد أو عدد قيود `inventory_movements`. أرجعت المقارنة صفًا واحدًا متغيرًا وصفًا مطابقًا، دون تعديل الكميات.
- نتيجة القبول على SHA `1e0f0f9de775fa46e698eb20dd0e3f7458a901b3`: [GitHub Actions 39620354015 — SUCCESS](https://github.com/Report-Engainall/Nasr1/actions/runs/39620354015). اجتازت 480/480 اختبارات وحدات، وكل الترحيلات وقبول PostgreSQL 17، والاختبار الجديد، وlint/build وسموكات preview/dev.

### لماذا تبقى المهمة 0009 مفتوحة؟

- ترحيل المانح `0009_fix_import_inventory_delta.sql` blob `0a6ce547791c5103c89fc74be0e4424cdec5d146` يستخدم مخططًا قديمًا (`import_rows`, `products.sku`, `inventory_balances.organization_id/quantity`, `price_lists`, `audit_events`)؛ لم يُنسخ ولم يُشغّل.
- الدالة الافتراضية للملف التعريفي `Unified CSV` نوعها `tabular`؛ قبول أمر Onyx يتطلب ملفًا تعريفيًا صريحًا لنوع مخزون، ويحافظ الاختبار على عدم وجود أي كتابة مخزون تلقائية عند إنهاء الاستيراد.
- ما يزال `preview_onyx_inventory_reconciliation/apply_onyx_inventory_reconciliation/rollback_onyx_inventory_reconciliation` خاصًا بعمل P2 داخل PR #18 وليس مثبتًا على رأس PR #26 نفسه. كما أن migration P2 `20261020110000_onyx_inventory_reconciliation_apply_rollback.sql` تتشارك بادئة الزمن مع migration تفعيل P1 `20261020110000_customer_activation_invitations.sql`. يلزم أولًا حل تصادم الترحيلات وعقد التكامل المشترك، ثم اختبار معاينة/تطبيق/إعادة محاولة/تراجع فعلي على PostgreSQL 17.
- طُلب التنسيق من P2 في [PR #18، التعليق 6318750176](https://github.com/Report-Engainall/Nasr1/pull/18#issuecomment-6318750176). إلى أن يثبت الدمج المشترك، الحالة هي `PARTIAL_TARGET_SNAPSHOT_CONTRACT=IMPLEMENTED`; `TESTED_EXACT_SHA=PASS (1e0f0f9de775fa46e698eb20dd0e3f7458a901b3; Actions 39620354015)`; `OPERATIONAL_STOCK_DELTA=NOT PROVEN`; `COMBINED_PR26_PR18=NOT PROVEN`.
- `BROWSER_PROVEN=NOT RUN`; `PRODUCTION_PROVEN=NOT RUN`. لا تُعتبر هذه الدفعة إغلاقًا للمهمة المصدرية 0009.


## 6.16. P1 catalog 0007 closeout and successor task — 2026-10-21

- **Live pre-documentation code/test head:** `7b070783d25c4b0b6064a3792213ac45671c0f78`; [GitHub Actions 39621935392](https://github.com/Report-Engainall/Nasr1/actions/runs/39621935392) completed SUCCESS on that exact SHA. GitHub reported PR #26 open/Draft/unmerged. This run passed frozen Bun lock verification, dependency installation, all unit tests, isolated PostgreSQL 17 migrations/core acceptance, the staff catalog script, stock-count audit, asynchronous export, import snapshot and idempotency acceptance, saved-products, lint, build, preview smoke, dev smoke and cleanup.
- **Root cause from the failed snapshot:** failed SHA `298bd1f98d3f516203b798d09283083c65ee61f9` had test blob `37b2fd0d50821e0176c131dae966f1fdb58afe53` and SQL blob `5c93ec54f21edc8555193deb732f459c7eb6fc4b`. Its create payload keys (`name`, `item_code`, `barcode`, `unit`, `description`, `category_id`, `base_price`, three tier-price values, `status`) were all allowlisted. The older SQL combined the JSON-object type check and extra-key test under the same generic error, so the message did not prove any individual field was invalid. The test sent a plain string binding via `JSON.stringify(p)`; the corrected test binds typed JSON with `admin.json(payload)`. No allowlist was loosened.
- **Current target-native SQL:** `supabase/migrations/20261020220000_staff_catalog_commands.sql`, blob `309844a812fcb4c3564c1d7d8cc8eb22d0bb50fa`; runtime test `scripts/test-admin-catalog-commands.mjs`, blob `29f3ae2db8a320695181c7664a969d9885c96914`. Product metadata writes stay on the actual Nasr1 product columns; base/tier-price values flow through `save_product_price_grid` and `product_prices`, with optimistic stale-value rejection. Auditing uses `audit_logs(organization_id, actor_id, action, entity_type, entity_id, old_value, new_value)`, deriving actor and tenant from the authenticated profile. No donor SQL was applied raw.
- **Exact runtime evidence:** Actions 39621935392 on `7b070783d25c4b0b6064a3792213ac45671c0f78` logged `PASS admin catalog commands: create/update/archive product and category, explicit key rejection, canonical price RPC/stale-write rejection, tenant isolation, audit identity, and direct-DML denial`. The expected rejection identifies `shadow_tier_price` in SQL DETAIL. The dedicated feature run remains Actions 39501610331 on `9e070285e3e001a8661fe5c297f19face97fdcf5`. Browser/manual and production proof remain NOT RUN.
- **Statuses:** IMPLEMENTED=YES; INTEGRATED=YES; TESTED_EXACT_SHA=PASS; BROWSER_PROVEN=NOT RUN; PRODUCTION_PROVEN=NOT RUN.
- **Successor:** `NASR1-SOURCE-UNASSESSED-MIGRATION-SEMANTIC-GAP-009-AGHBCOM-IMPORT-INVENTORY-0009`. Snapshot creation/read-only comparison are proven, but operational quantity delta and combined PR #26/#18 preview/apply/replay/rollback are not. Keep stock mutation deferred until the P2-owned canonical reconciliation contract and migration ordering are read back; do not add parallel stock writes or edit protected P2 paths.


## 6.17. Successor task 0009 — import snapshot / Onyx reconciliation integration review — 2026-10-21

- **P1 starting snapshot:** branch `integration/inventory-transfer-batches-20261019-rebased` at `7b70a9e448b8d1e17a8ff5869b4c2d8e394114b4`; exact-head [Actions 39626649853](https://github.com/Report-Engainall/Nasr1/actions/runs/39626649853) SUCCESS. Documentation updates require a separate exact-head check.
- **Compatibility fact established:** active target migration `20261009070000_platform_spec_foundations.sql` defines `finalize_import_job` to persist `onyx_snapshot_rows.row_hash = md5(r.data::text)`. P2's Onyx apply RPC recomputes the same hash from the selected snapshot row. P1 acceptance test `scripts/test-import-inventory-snapshot-contract.mjs` blob `15d4b5985e5538a86563a1aee9ee2e27fb884db8` directly asserts `row_hash = md5(data::text)` using a PostgreSQL computed value, and creates a real ready `inventory_stock` snapshot with row status/canonical key, item_code, quantity and warehouse ID/code/name and proves generic finalization + read-only comparison leave balances/movements unchanged. Exact evidence: [Actions 39620354015](https://github.com/Report-Engainall/Nasr1/actions/runs/39620354015).
- **P2 implementation exists only on the parallel branch as of this review:** branch `feat/p2-customer-return-intake-20261020`, exact SHA `506089a8692ef716ca2c61e21d1f7c417afa1e5c`; Onyx migration blob `9e1e7fde3faaa7887809ebbcef214bc044197223`, service `src/lib/onyx-inventory-reconciliation.ts` blob `d37edb505a0e20f8936e3283be097ed7ac9c75bd`, acceptance script `scripts/test-onyx-reconciliation.mjs` blob `b72586bee11fd63118319982205ca8acc49e34de`. [P2 commerce CI 39627035588](https://github.com/Report-Engainall/Nasr1/actions/runs/39627035588) is SUCCESS on that exact SHA. P2 Playwright run [39627035716](https://github.com/Report-Engainall/Nasr1/actions/runs/39627035716) later completed SUCCESS on the same P2 SHA: local Supabase authenticated order persistence/cross-tenant denial and read-only public Storefront browser smoke succeeded; separate externally credentialed customer workflow was SKIPPED. This is not browser proof of the Onyx reconciliation UI.
- **Integration blocker remains real:** P1 head includes `supabase/migrations/20261020110000_customer_activation_invitations.sql` (blob `cef9cb41c88620114af4c37761515a1b177538b5`), while P2 has `20261020110000_onyx_inventory_reconciliation_apply_rollback.sql` and a distinct `20261020140000_customer_activation_invitations.sql` (activation blob `f62ec20998ddc4b6a00517bdab1f55c9a73d58da`). The activation migration blobs differ: P2 resolves email and confirmation from authoritative `auth.users`; P1 currently derives email from JWT claims. Do not apply both activation feature migrations as independent features or rely on concurrent merges to solve the shared timestamp.
- **Action / ownership:** P1 posted the exact compatibility findings to [PR #18 comment 6319928443](https://github.com/Report-Engainall/Nasr1/pull/18#issuecomment-6319928443). Do not edit P2-owned Onyx migration/service/UI or the shared database harness without coordination. When migration ordering and one authoritative activation migration are agreed and the Onyx files are integrated into a common tree, extend the P1-owned import snapshot runtime test to exercise the actual finalized snapshot through preview (zero writes), apply + idempotent replay, stale-source/balance rejection with atomicity, compensating rollback and cross-tenant denial.
- **State:** `IMPLEMENTED=PARTIAL_SNAPSHOT_CONTRACT`; `INTEGRATED=READ_ONLY_SNAPSHOT_ONLY`; `TESTED_EXACT_SHA=PASS` for the P1 snapshot contract and P2 Onyx database acceptance on its own branch; `COMBINED_BRANCH_POSTGRES_ACCEPTANCE=NOT RUN`; `BROWSER_PROVEN=NOT RUN`; `PRODUCTION_PROVEN=NOT RUN`. Operational inventory delta remains deferred until combined-head proof passes. No duplicate or parallel stock writer was added.


## 6.18. P1 source-import row hash assertion — exact tested code head

- Added a target-native runtime assertion in `scripts/test-import-inventory-snapshot-contract.mjs`, blob `15d4b5985e5538a86563a1aee9ee2e27fb884db8`: the test now selects PostgreSQL's `md5(data::text)` for each finalized Onyx row and asserts it exactly equals the persisted `row_hash`. This directly proves the hash format consumed by P2's Onyx apply-time freshness guard, beyond checking hash length alone.
- Code/test SHA: `01f20c07012735d4f32a6d0c7c011c4fcb9fe638`; [Actions 39628121399](https://github.com/Report-Engainall/Nasr1/actions/runs/39628121399) `test-and-build` job completed SUCCESS on this exact SHA. Confirmed steps include unit tests, all ordered migrations + PostgreSQL 17 acceptance, `Verify inventory import snapshot contract without implicit stock mutation`, lint, build, preview smoke and dev smoke; no step failed. At last API read, job state was completed/success while workflow status still reported in_progress; final documentation head needs its own exact-head check.
- This tightens the source snapshot contract only. `OPERATIONAL_STOCK_DELTA` remains unproven on combined PR #26/#18; do not promote task 0009 to closed until the P2 migration timestamp + activation variant are reconciled and preview/apply/replay/atomic rejection/compensating rollback are executed against a snapshot created by the actual import finalizer.


## 6.19. Task 0009 — importer-to-Onyx operational integration, exact PostgreSQL 17 proof — 2026-10-21

- **Code/test SHA:** `e5466fcc1958d0d1ae0a1f532cb0c7e6f8d4c1ba`; [Actions 39630570096](https://github.com/Report-Engainall/Nasr1/actions/runs/39630570096) check-run `test-and-build` completed SUCCESS on this exact SHA at `2026-10-21T16:00:26Z`. No step failed.
- **Target-native migration:** `supabase/migrations/20261021100000_onyx_inventory_reconciliation_apply_rollback.sql`, blob `9e1e7fde3faaa7887809ebbcef214bc044197223`. SQL is byte-identical to the P2-reviewed implementation with a unique P1 migration prefix; no donor 0009 SQL was copied.
- **Runtime test:** `scripts/test-import-inventory-snapshot-contract.mjs`, blob `29099388384becc589ae9e6602204bb05864be75`. It finalizes a real `inventory_stock` import, proves `row_hash=md5(data::text)`, then executes canonical Onyx preview (no write) + replay, apply + replay, compensating rollback + replay, staff denial, unavailable/foreign snapshot denial, authenticated direct-DML denial, stale-apply atomic rejection, later-movement rollback refusal, and audit actor/tenant checks.
- **Exact PostgreSQL 17 log:** `PASS inventory->Onyx reconciliation: real finalized snapshot hash/tenant/warehouse scope; preview no-write + replay; staff/tenant/direct-DML denial; apply/replay; compensating rollback/replay; atomic stale-apply denial; later-movement rollback refusal; audit actor/tenant.`. The first expanded run exposed an assertion-only PG numeric-text vs JS-number mismatch and assumption about which UUID locks second. Those assertions were fixed without weakening authorization or atomicity; the corrected run passed.
- **Statuses:** `IMPLEMENTED=YES`; `INTEGRATED=P1 migration + actual-import snapshot test=YES`; `TESTED_EXACT_SHA=PASS (e5466fcc1958d0d1ae0a1f532cb0c7e6f8d4c1ba; Actions 39630570096)`; `BROWSER_PROVEN=NOT RUN`; `PRODUCTION_PROVEN=NOT RUN`.
- **Cross-PR release coordination remains open:** PR #18 has the same Onyx SQL at its old migration path; coordinate convergence onto `supabase/migrations/20261021100000_onyx_inventory_reconciliation_apply_rollback.sql` to avoid retaining duplicate migrations. Customer-activation migration variants also differ in confirmed-email trust boundary (P2 corrective variant reads authoritative `auth.users`; P1's earlier variant derives email from JWT). Do not merge variants blindly. Handoff: [PR #18 comment 6320358607](https://github.com/Report-Engainall/Nasr1/pull/18#issuecomment-6320358607). This distinct release blocker does not invalidate P1's exact-head database acceptance.

## 6.20. Source migration 0010 — order concurrency — existing stronger target

- Donor `0010_order_concurrency_hardening.sql` (blob `858108b845ecb2173bfe5b15e621c29a612bc246`) defines legacy `public.create_order` using `current_organization_id/current_customer_id`, `price_lists/pp.amount`, old `inventory_balances.organization_id + quantity`, legacy movement columns and `audit_events`; it is incompatible with the Nasr1 schema and was not copied.
- Stronger target contract already exists in `20261009040000_checkout_integrity.sql` (blob `848ebce31dddc8a99e4a95e5c87825640fc5cfb3`), `20261019180000_company_member_promotion_checkout.sql` (blob `ca4384641a7c4c0ea916aee8e663d6724159ea13`), and `20261009050000_order_transition_integrity.sql` (blob `57ba9360e48cbf1cf4ba7c30b37631102bea776c`). It derives actor/tenant server-side, gates customer capability, validates payload before replay, compares exact idempotency hash, uses advisory and row locks, authorizes current tenant products/prices and stock, and performs target-native transactional order/stock/audit/outbox work.
- [Actions 39630570096](https://github.com/Report-Engainall/Nasr1/actions/runs/39630570096) passed on `e5466fcc1958d0d1ae0a1f532cb0c7e6f8d4c1ba`; PostgreSQL 17 core acceptance logged checkout/idempotency, tenant isolation and stock/pricing workflow PASS. Separate high-contention order-race stress is `NOT RUN`.
- **Decision:** `ALREADY_PRESENT_BETTER`; `DONOR_SQL_NOT_APPLIED`; `TESTED_EXACT_SHA=PASS` for target checkout/database suite; `ORDER_RACE_STRESS=NOT RUN`; `BROWSER_PROVEN=NOT RUN`; `PRODUCTION_PROVEN=NOT RUN`.
- Next source task: `NASR1-SOURCE-UNASSESSED-MIGRATION-SEMANTIC-GAP-011-AGHBCOM-ORDER-INPUT-0011`.


## 6.16 — Exact-head closeout: staff catalog 0007 + next source decision — 2026-10-21

- **Verified code/test head:** `527700144cb55daa2865180e9c231d9187de280b` on `integration/inventory-transfer-batches-20261019-rebased`. The branch API and Actions run metadata agree on the exact SHA.
- **Exact-head CI:** [Actions 39632513991](https://github.com/Report-Engainall/Nasr1/actions/runs/39632513991) COMPLETED/SUCCESS on the same SHA `527700144cb55daa2865180e9c231d9187de280b`. PostgreSQL 17 job log explicitly records: `PASS admin catalog commands: create/update/archive product and category, explicit key rejection, canonical price RPC/stale-write rejection, tenant isolation, audit identity, and direct-DML denial`. Unit tests, remaining PostgreSQL 17 acceptance, stock-count audit, async export, import idempotency/concurrency, persistent storefront favourites, lint and build passed.
- **Task NASR1-SOURCE-UNASSESSED-MIGRATION-SEMANTIC-GAP-007-AGHBCOM-STAFF-CATALOG-0007: CLOSED.** Source blob `239789342a29a824852185cdbb95de7906900dbc` was adapted, not copied raw. Target SQL blob `309844a812fcb4c3564c1d7d8cc8eb22d0bb50fa`; test blob `29f3ae2db8a320695181c7664a969d9885c96914`. Root cause was the plain-string `JSON.stringify(p)` passed to `$1::jsonb`, which triggered a scalar/type path while the old SQL returned a misleading unsupported-fields message. The test now uses `admin.json(payload)`; the allowlist remains strict and the actual negative key `shadow_tier_price` is rejected with SQL DETAIL. All tier-price writes go through `save_product_price_grid` and `product_prices`; auditing uses target-native `audit_logs`, authenticated profile identity and organization scope. No protected P2 path was changed.
- **Next source 0011 assessed:** donor `supabase/migrations/0011_order_input_hardening.sql`, blob `b74d858058474d39ae088054b13fa55ab6763850`, is `ALREADY_PRESENT_BETTER` in Nasr1's target-native `submit_customer_order/create_staff_order` contracts. The donor's `create_order`, legacy helpers, order/customer enums, `price_lists.amount`, and `audit_events` must not be imported. Current PostgreSQL acceptance proves replay and same-key payload conflict; dedicated malformed-line, quantity-bound, inactive-product and cross-tenant negative-case matrix was not separately demonstrated in this review and remains `NOT RUN`.
- **Next unassessed source item:** `0012_cross_tenant_integrity.sql`, blob `67cae6d6f3a62be65b39d17ff6d1a7bbc0cef318`. Its composite foreign-key proposals require schema-by-schema reconciliation; do not apply donor SQL wholesale. Start with the current Nasr1 table/key layout and tenant-integrity constraints.
- `IMPLEMENTED` / `INTEGRATED` / `TESTED_EXACT_SHA`: catalog accepted as above. `BROWSER_PROVEN=NOT RUN`; `PRODUCTION_PROVEN=NOT RUN`. No claim of authenticated-browser or deployed-production verification.


## 6.21 — Live exact-head closeout and next finance parity review — 2026-10-21

- **Current observed PR/branch head while this update was prepared:** `a0650379499123deab79479b13714464db264792`; PR #26 remains open/draft/unmerged. The previously cited failure [Actions 39486351594](https://github.com/Report-Engainall/Nasr1/actions/runs/39486351594) belongs to historical snapshot `298bd1f98d3f516203b798d09283083c65ee61f9`, not the then-current head.
- **Verified code/test head:** `5ac8969dcdf344822237e99449f9abce043f70ad`; [Actions 39638446987](https://github.com/Report-Engainall/Nasr1/actions/runs/39638446987) completed `SUCCESS` on that exact SHA. Its single test-and-build job passed unit tests, ordered PostgreSQL 17 migrations/core acceptance, stock-count audit, asynchronous export, import idempotency, inventory snapshot, saved products, lint, build, preview smoke 4173 and dev smoke 5173.
- **New concurrent trigram-index task:** migration `20261021160000_target_native_catalog_trigram_search.sql` initially failed on the next branch head because isolated PostgreSQL had no `extensions` schema. Fix adds `CREATE SCHEMA IF NOT EXISTS extensions` before installing `pg_trgm`; static test asserts ordering, and the runtime catalog test checks both actual index definitions and the installed operator schema. Source code/test head `a0650379499123deab79479b13714464db264792` has Actions 39640035840 pending when this report text was prepared; do not call it PASS until the run completes.
- **Staff catalog task 0007 — CLOSED:** source blob `239789342a29a824852185cdbb95de7906900dbc`; target SQL blob `309844a812fcb4c3564c1d7d8cc8eb22d0bb50fa`; feature runtime test currently evolves in the active branch. The create payload keys were allowlisted. Root cause was plain-string `JSON.stringify(payload)` at a `$1::jsonb` boundary combined with a generic type/unknown-key error. Typed `admin.json(payload)` preserves an object; allowlist remains strict and the negative key `shadow_tier_price` is named in SQL DETAIL. Tier price mutation stays on `save_product_price_grid` / `product_prices`; audit uses target `audit_logs`, actor identity and tenant. No P2-owned shared file was edited by this update.
- **Source task 0012 — CLOSED / target-native composite tenant integrity:** donor blob `67cae6d6f3a62be65b39d17ff6d1a7bbc0cef318` was not copied raw because it refers to incompatible legacy tables/columns. Target migrations: `20261021130000_target_native_tenant_integrity.sql` blob `38f8504128aa52fe6c836a9e485913c3370b1025`; `20261021140000_target_native_tenant_integrity_additional.sql` blob `eb6c506a2d88dccf032a61ee68b5f03dd7ef5e99`; static test `src/test/tenant-composite-integrity-migration.test.ts` blob `26f788427a4840861570cdb011d9f132b28a05f0`. PostgreSQL 17 acceptance passed cross-tenant product/category, address, invitations, membership, saved product, transfer and Onyx relationship guards on exact head `5ac8969dcdf344822237e99449f9abce043f70ad`.
- **Next OPEN source task 0013 — finance/B2B pipeline parity:** donor `supabase/migrations/0013_finance_b2b_pipeline.sql`, blob `75962ddec0c3c58d20c62e14a7303bfeb4782543`, uses legacy `companies/company_memberships/sales_invoices/payments/cash_accounts/company_id` contracts; do not copy it or create a parallel write path. Nasr1 already has `customer_invoices/customer_payments`, canonical `record_customer_payment`, finance-controlled cash-expense commands, double-entry `accounting_accounts/accounting_journal_entries/accounting_journal_lines`, and tenant-scoped invoice/payment source-posting/reversal flows. However, exact parity for the legacy cash-account surface and every `get_staff_dashboard_metrics` result has **not** been proven. Keep 0013 OPEN until these KPIs/treasury semantics are compared and a targeted PostgreSQL acceptance is run.
- **Evidence statuses:** `0007 IMPLEMENTED + INTEGRATED + TESTED_EXACT_SHA=PASS`; `0012 IMPLEMENTED + INTEGRATED + TESTED_EXACT_SHA=PASS`; `0013 TARGET_FINANCE_PRESENT, PARITY_REVIEW_OPEN`; `BROWSER_PROVEN=NOT RUN`; `PRODUCTION_PROVEN=NOT RUN`. Browser checks remain assigned to Bolt as requested.

## 6.22 — Source 0013 finance/B2B parity + exact-head acceptance — 2026-10-21

- **Accepted code/test head:** `2688d210d69ad766ac406b2c520d284ba8673e54` on `integration/inventory-transfer-batches-20261019-rebased`; PR #26 remains open/draft/unmerged. [Actions 39644648317](https://github.com/Report-Engainall/Nasr1/actions/runs/39644648317) completed SUCCESS on this exact SHA. No browser or production claim is made.
- **Root-cause / source decision:** donor `supabase/migrations/0013_finance_b2b_pipeline.sql` (`75962ddec0c3c58d20c62e14a7303bfeb4782543`) is written for `companies/company_memberships/sales_invoices/payments/cash_accounts/company_id`. Those are not Nasr1’s schema. Raw application would split finance state and introduce mutable `received/spent` balances separate from the existing double-entry ledger. The donor SQL was not copied or applied.
- **Target-native implementation:** `supabase/migrations/20261021170000_staff_dashboard_metrics_finance_parity.sql`, blob `866b70c64bac99a72575978c5c706624feb79dc6`, implements the full 12-field dashboard metrics contract. It derives organization from the active authenticated profile and requires staff/finance authorization; all source aggregates are tenant-scoped; grants are authenticated-only. Order-state mapping and invoice-minus-payments receivables are covered.
- **Numeric integrity:** an active product without a warehouse balance makes the stock aggregate `NULL` (unknown); distinct product units are not added; positive receivables across YER/USD are not combined. The screen renders `غير متاح` for unknown totals, instead of inventing zero or an FX conversion.
- **UI integration:** `src/components/StaffDashboardMetrics.tsx`, blob `4aa2fa76ef27eaec83b8d1d256e2049444ed16bd`; rendered from `src/components/ExecutiveStoreAnalytics.tsx`, blob `3391d1b81fe03e1e1590afaaee8c7693ac31db0f`. Existing treasury/account balances continue through `accounting_accounts` and posted double-entry journals; payment writes stay on `record_customer_payment`; expense sources retain explicit journal mapping/reversal. No parallel `cash_accounts` table or direct browser write path was added.
- **Acceptance evidence:** static contract `src/test/finance-dashboard-metrics-migration.test.ts`, blob `b60dd5a10bb785fcaad852f6ccfbfd21e0f7d123`; PostgreSQL acceptance harness `scripts/test-admin-catalog-commands.mjs`, blob `476985b72f7f9c3cd88bd45b69d59fcebd5d8dcc`; order negative-matrix helper `scripts/test-order-input-hardening.mjs`, blob `1655ed594ead3b40afb2ccca8ac409baaa541ac1`. Action log records `PASS admin catalog + finance dashboard` with KPI mapping, unknown-stock/multi-unit handling, multi-currency safety and cross-tenant isolation. The workflow reports 79/79 unit-test files and 505/505 unit tests passing, PostgreSQL 17 migration/core acceptance passing, lint/build passing, and preview/dev smoke passing.
- **Source 0011 negative-input matrix corrected:** the same exact-head PostgreSQL 17 command calls `runOrderInputHardeningAcceptance`; it exercises 24 invalid customer/staff input cases (shape, item row bounds, malformed IDs, quantity limits, aggregate limit, inactive/foreign product and payment terms), and asserts no invalid order persists. This case matrix is no longer `NOT RUN`.
- **Status distinctions:** finance metrics `IMPLEMENTED=YES`, `INTEGRATED=YES`, `TESTED_EXACT_SHA=PASS (2688d210d69ad766ac406b2c520d284ba8673e54; Actions 39644648317)`; `BROWSER_PROVEN=NOT RUN`; `PRODUCTION_PROVEN=NOT RUN`. The generic-ledger treatment deliberately replaces legacy cash-account storage; a cash-account-specific write model was not introduced.
- **Next integration blocker/task:** combined PR #26 + PR #18 convergence for importer→Onyx operational reconciliation and customer-activation migration ordering remains OPEN. P2-owned files remain untouched. Do not claim common-head or browser proof until the authoritative activation migration and unique Onyx migration path are reconciled and the combined-tree test is run.

## 6.23 — Activation email trust boundary aligned; latest exact-head test proof — 2026-10-21

- **Latest P1 code head:** `896a3b0477117411fc389c312b64203a469cd03e`; PR #26 remains open/unmerged. Exact-head GitHub Actions [39645796731](https://github.com/Report-Engainall/Nasr1/actions/runs/39645796731) = COMPLETED/SUCCESS. It ran 79/79 test files (505/505 tests), isolated PostgreSQL 17 migration/core acceptance, lint, build and preview/dev smoke.
- **Activation security root cause:** P1 previously checked `auth.users.email_confirmed_at` but initialized the comparison email from `auth.jwt()->>'email'`. The authoritative P2 SQL derives the confirmed email from `auth.users`. P1 now uses exactly the same Git blob `f62ec20998ddc4b6a00517bdab1f55c9a73d58da` as P2's `20261020140000_customer_activation_invitations.sql`; P1's migration path remains `20261020110000_customer_activation_invitations.sql` to preserve standalone P1 migration coverage.
- Regression test `src/test/customer-activation-invitations-migration.test.ts`, blob `76a57d0cc790ea1376fff785112b7b1bb57d10d7`, asserts the migration does not trust the JWT email and reads the confirmed Auth email from `auth.users`. The ordered P1 migrations/core workflow and unit suite passed on exact SHA 896a3b0477117411fc389c312b64203a469cd03e.
- **Combined integration remains unproven:** P1 head `18b0c8a8f3f03a3f5ad188357690223e3749628f` uses the canonical activation migration path/blob also present in PR #18 (`20261020140000_customer_activation_invitations.sql`, blob `f62ec20998ddc4b6a00517bdab1f55c9a73d58da`); the former P1-only `20261020110000` path is absent. The Onyx apply/rollback path/blob also matches (`20261021100000_onyx_inventory_reconciliation_apply_rollback.sql`, blob `9e1e7fde3faaa7887809ebbcef214bc044197223`). Path-level duplication is resolved; combined PR #26 + PR #18 PostgreSQL acceptance remains `NOT RUN`. P2-owned UI, generated route, workflow and package files remain untouched by P1. Coordination follow-up: [PR #18 comment 6322979791](https://github.com/Report-Engainall/Nasr1/pull/18#issuecomment-6322979791).
- **Status:** activation security `IMPLEMENTED=YES; INTEGRATED_P1=YES; TESTED_EXACT_SHA=PASS (896a3b0477117411fc389c312b64203a469cd03e; Actions 39645796731)`; `COMBINED_PR26_PR18_ACCEPTANCE=NOT RUN`; `BROWSER_PROVEN=NOT RUN`; `PRODUCTION_PROVEN=NOT RUN`.

## 6.24 — Exact-head closeout: catalog, finance, order race and canonical migration path — 2026-10-21

- **Verified P1 code/test SHA:** `18b0c8a8f3f03a3f5ad188357690223e3749628f`; GitHub Actions [39647895468](https://github.com/Report-Engainall/Nasr1/actions/runs/39647895468) completed SUCCESS on this exact SHA. The run reports 79/79 test files and 505/505 unit tests PASS; PostgreSQL 17 migration/core acceptance, lint, build, preview smoke (4173) and dev-server smoke (5173) PASS.
- **Catalog 0007 root cause:** the strict allowlist was correct; the failing test bound `JSON.stringify(payload)` as a scalar string to `$1::jsonb`, then the type failure was surfaced as `catalog payload contains unsupported fields`. The harness now binds the actual object using `admin.json(payload)`; SQL reports real invalid keys. Do not relax the allowlist. Current PostgreSQL runtime proves product create/update/archive, category create/archive, unauthorized fields denied, the canonical product-price RPC and stale-grid conflict, tenant isolation, audit actor/org, and direct-DML denial.
- **Finance/B2B 0013 adapted to Nasr1:** the donor assumes legacy companies/company_memberships/sales_invoices/payments/cash_accounts with mutable received/spent values; it was not copied. The target-native `get_staff_dashboard_metrics()` has a 12-field contract and tenant-scoped authorization. Missing inventory coverage and mixed product units return NULL; receivables across positive YER/USD balances return NULL. The KPI component is rendered in the existing executive analytics view. Cash/bank source-of-truth remains the double-entry general ledger, not a parallel cash table.
- **Order concurrency 0010 now directly tested:** four independent authenticated PostgreSQL 17 sessions issue the same staff-order key/payload concurrently; the acceptance log proves one creator, three replays returning the same order UUID, one persisted item set, and rejection of a different payload using the same key. This replaces the prior `ORDER_RACE_STRESS=NOT RUN` status.
- **Order input 0011:** the PostgreSQL runtime matrix rejects 24 invalid customer/staff order payloads (malformed shapes/IDs, item/quantity bounds, aggregate cap, inactive or foreign product and forged payment terms) and checks that none persisted.
- **Import/Onyx 0009:** PostgreSQL runtime acceptance proves the real finalized-import-snapshot→preview→apply/replay→compensating-rollback/replay workflow, hash/tenant/warehouse scope, no-write preview, stale-apply atomicity, refusal to rollback over later stock movements and audit identity.
- **Activation migration convergence:** P1 now carries only `supabase/migrations/20261020140000_customer_activation_invitations.sql`, blob `f62ec20998ddc4b6a00517bdab1f55c9a73d58da`, exactly matching the P2 path and blob; the old P1-only `20261020110000` file was deleted. The Onyx migration also has the same path and blob as P2: `supabase/migrations/20261021100000_onyx_inventory_reconciliation_apply_rollback.sql`, blob `9e1e7fde3faaa7887809ebbcef214bc044197223`.
- **Files verified on this SHA:** runtime harness `scripts/test-admin-catalog-commands.mjs` blob `8012fd9d97762cbf6b97411ac5be3f72ed3fcc72`; finance SQL `866b70c64bac99a72575978c5c706624feb79dc6`; dashboard UI `4aa2fa76ef27eaec83b8d1d256e2049444ed16bd` and executive integration `3391d1b81fe03e1e1590afaaee8c7693ac31db0f`; finance contract test `b60dd5a10bb785fcaad852f6ccfbfd21e0f7d123`; order input matrix `1655ed594ead3b40afb2ccca8ac409baaa541ac1`; activation SQL `f62ec20998ddc4b6a00517bdab1f55c9a73d58da` and static regression `b82e19d8f72185e108b09d5cb490900d4bb45e2d`; Onyx runtime test `7fa2e7cbee5ae3c04c743893f93dd3c1670be415`.
- **Remaining, explicitly not proven:** combined PR #26 + PR #18 CI has not been run. P2-owned customer-invitation panel/service/route wiring remains P2 responsibility. `BROWSER_PROVEN=NOT RUN`; `PRODUCTION_PROVEN=NOT RUN`. CI preview/dev smoke is not a browser acceptance or production proof.



**Evidence-head note:** the docs-only commit `e167624a7ba93f885e43782d94ce3b515990b4ef` has a separate full CI success, [Actions 39649079344](https://github.com/Report-Engainall/Nasr1/actions/runs/39649079344). The last code-bearing feature head remains `18b0c8a8f3f03a3f5ad188357690223e3749628f`, with its own exact-head proof Actions 39647895468. No browser-authenticated or production proof is claimed.

## 6.25 — Explicit PR #26 / PR #18 overlap and remaining integration gate — 2026-10-21

- Exact PR heads re-read: P1 `9f82d34015a63044e5c2072fa7faf80a5ca86ac5` (open/draft); P2 `2bcb2d64fca5da2a72420931c8b5e424c667ff81` (open). GitHub reports 14 overlapping changed paths:
  - `package.json`
  - `src/components/CustomerActivationInvitationDialog.tsx`
  - `src/components/CustomerActivationInvitationPage.tsx`
  - `src/lib/auth-redirect.ts`
  - `src/lib/auth.tsx`
  - `src/lib/customer-activation-invitations.ts`
  - `src/routes/customer.activate.$token.tsx`
  - `src/test/auth-redirect.test.ts`
  - `src/test/customer-activation-invitations-dialog.test.tsx`
  - `src/test/customer-activation-invitations-migration.test.ts`
  - `src/test/customer-activation-invitations-page.test.tsx`
  - `src/test/customer-activation-invitations.test.ts`
  - `supabase/migrations/20261020140000_customer_activation_invitations.sql`
  - `supabase/migrations/20261021100000_onyx_inventory_reconciliation_apply_rollback.sql`
- The activation and Onyx migrations now have canonical path+blob matches. P1 did not modify P2's dialog/page, auth client, route, package manifest or workflow.
- P2 owns activation UI route/component integration on its branch. The overlapping paths need combined-tree acceptance before merge. Since the combined PR #26 + PR #18 tree has not been exercised, `COMBINED_PR26_PR18_ACCEPTANCE=NOT RUN`; do not declare cross-PR integration closed.
- Documentation CI for prior checkpoint `e167624a7ba93f885e43782d94ce3b515990b4ef` passed (Actions `39649079344`); another P1 handoff-only correction commit followed it. The current handoff/audit correction will trigger another exact-head CI.

## 6.26 — Customer storefront price-visibility policy integrated; combined P1/P2 head proven — 2026-10-21

- **Task closed at implementation/core-CI level:** `NASR1-ORIGINAL-SPEC-CUSTOMER-PRICE-PRIVACY-RECONCILIATION-010`. P1 changed only `src/components/Storefront.tsx` plus a dedicated component regression test; no changes were made to P2-owned `src/lib/api.ts`, `src/components/AghbariApp.tsx`, `src/routeTree.gen.ts`, `package.json`, or workflow files.
- **Root cause:** the reusable `resolveStorefrontPricePresentation` / `StorefrontPricePresentation` fail-closed guard existed, but the live `ProductGrid` and `ProductDetail` JSX still rendered `product.display_price` directly. They were not wired to the public `show_price_on_cards` policy, so disabling or failing to load that policy could not suppress the direct-rendered amount.
- **Target-native repair:** `Storefront.tsx` now passes `settings?.show_price_on_cards` to product cards, product details, wishlist cards and comparison cards. Every card/detail price flows through `StorefrontPricePresentation`; the detail-only “السعر الظاهر قبل تأكيد الطلب” fact is omitted whenever the guard hides the price. The resolver suppresses false/malformed/unknown policy values, invalid amounts and the zero sentinel. Prices remain server-resolved; no new pricing RPC, browser price calculation, or parallel price store was introduced.
- **Regression coverage:** `src/test/storefront-price-policy-integration.test.tsx`, blob `ef473e49e524a72c98c7859132aa5f83645d0226`, renders the real exported `ProductGrid` and `ProductDetail` and checks enabled display, hidden policy values, detail copy suppression, and the zero sentinel. `src/components/Storefront.tsx` blob `ca56ebae3688cfa4896f4e21f8abdcb726b0b604`; reused renderer blob `251a004ab0538a10560a82932261a10d6ea5a482`; resolver blob `dffe14a0a5298b9cdfa28c9af2e233ba64e02b4c`.
- **Code/test ancestry:** Storefront integration commit `0b2f21c76783f0aee4fbfe8f26586968712fa253`; component acceptance-test commit `bb37f52b542d79ec2054d7b549ecd039c8c5b050`. Both are included in the combined integration head `65267f08f9c5e17204d33805ca2eb23be0b10bd4`, which provided the combined P1/P2 code/test ancestry before PR #18 and PR #26 were merged.
- **Exact-head evidence:** [Core Aghbari Commerce checks](https://github.com/Report-Engainall/Nasr1/actions/runs/39657406222) = COMPLETED/SUCCESS on exact SHA `65267f08f9c5e17204d33805ca2eb23be0b10bd4`; [P2 Playwright Critical Paths](https://github.com/Report-Engainall/Nasr1/actions/runs/39657406198) = COMPLETED/SUCCESS on the same SHA. Core CI passed the unit suite, ordered PostgreSQL 17 migrations/core acceptance, lint, build and preview/dev smoke. Playwright passed isolated local Supabase authenticated order persistence/tenant denial, price-grid and cash-expense runtime checks, and customer return review/receipt/credit-memo Chromium flow. Its hosted-account E2E path was skipped because dedicated external credentials were not configured.
- **Proof boundary:** `IMPLEMENTED=YES; INTEGRATED=YES; TESTED_EXACT_SHA=PASS`; `BROWSER_PROVEN=NOT RUN` for the specific hide/show price-policy interaction; `PRODUCTION_PROVEN=NOT RUN`. A generic public storefront smoke is not misreported as price-policy browser proof. PR #18 was merged at `f00e609013e248de4ecb94c41e31296884f899cf`; PR #26 was merged at `6e97fb35be9ebf65c546a3d5e9615063853c8eab`. The verified current `main` SHA at this report update is `6e97fb35be9ebf65c546a3d5e9615063853c8eab`. PR #29 is now merged as `1eb57a661b413c9c7d0321dccca70e5d6a0e42fe`; its dedicated browser gate and reconciled records are in `main`.
- **Next active integration gate:** review the live ledger against the newly proven combined head before closing the remaining cross-PR migration/ownership items. Do not reopen or recreate PR #18/#26; both are merged. PR #29 is closed/merged; continue from live `main`, not the former integration branch. Coordination update: [PR #18 comment 6324078756](https://github.com/Report-Engainall/Nasr1/pull/18#issuecomment-6324078756).

## 6.27 — Merge-state correction and dedicated Chromium price-policy proof — 2026-10-21

- **Verified merge state:** PR #18 merged as `f00e609013e248de4ecb94c41e31296884f899cf`; PR #26 merged as `6e97fb35be9ebf65c546a3d5e9615063853c8eab`. The live `main` ref read-back at this update was exactly `6e97fb35be9ebf65c546a3d5e9615063853c8eab`. The earlier report statement that these PRs remained Draft/open was stale and has been corrected here.
- **Catalog task 0007 — root cause and evidence:** the command allowlist was correct; the test bound `JSON.stringify(payload)` as scalar text to `$1::jsonb`, not an object. Replaced with `admin.json(payload)`, retained strict allowlisting, target-native `product_prices` / existing price-grid RPC, tenant-scoped `audit_logs`, direct-DML denial and price-conflict validation. Source hash: `239789342a29a824852185cdbb95de7906900dbc`. Exact implementation/test SHA `18b0c8a8f3f03a3f5ad188357690223e3749628f`; [Actions 39647895468 SUCCESS](https://github.com/Report-Engainall/Nasr1/actions/runs/39647895468).
- **Customer price policy 010:** the existing fail-closed renderer was not wired into the active `ProductGrid` and `ProductDetail`; those paths rendered `display_price` directly. The fix in `src/components/Storefront.tsx` blob `ca56ebae3688cfa4896f4e21f8abdcb726b0b604` passes `settings?.show_price_on_cards` through store, wishlist, comparison and detail surfaces; price DOM is emitted only when the policy is boolean true and the server-resolved amount is valid/nonzero. Component regression test blob `ef473e49e524a72c98c7859132aa5f83645d0226`.
- **Dedicated browser proof:** PR #29 adds `e2e/storefront-price-visibility.spec.ts` (blob `45e183aef4f0b4e9e329cba67ea66a191356f5ae`) plus a local harness/fixture and a P1-owned step in `commerce-checks.yml`. Exact SHA `bbcb894f003fc2e1b0a5b85c67c128b779d3f30c` passed [Core Actions 39661182977](https://github.com/Report-Engainall/Nasr1/actions/runs/39661182977) and [P2 Playwright Critical Paths 39661182935](https://github.com/Report-Engainall/Nasr1/actions/runs/39661182935). Chromium directly rendered the real `ProductGrid` and `ProductDetail` and passed hide/show/malformed-policy/zero-sentinel assertions; the P2 run also passed the local-Supabase/Chromium order, tenant-isolation and customer-return suite. The hosted-account E2E gate was skipped because external credentials were not configured.
- **Test-fixture failures and actual repairs:** the first HTML fixture was under `e2e/` and Vite returned 404, so it was moved to `public/e2e/fixtures/`; the harness used the wrong Supabase environment variable name, so it now sets `VITE_SUPABASE_PUBLISHABLE_KEY`; React did not mount on the standalone static page without the Vite React Refresh preamble, so the fixture now initializes `/@react-refresh`. The final exact-head browser step passed after these repairs.
- **Proof boundary:** `IMPLEMENTED=YES; INTEGRATED_IN_MAIN=YES` for the code from PR #26; `TESTED_EXACT_SHA=PASS` and `BROWSER_PROVEN=PASS` for component-level policy behavior on SHA `bbcb894f003fc2e1b0a5b85c67c128b779d3f30c`. This does not prove the remote `get_public_storefront_settings` RPC against a production deployment. `REMOTE_SETTINGS_RPC_PROVEN=NOT RUN; PRODUCTION_PROVEN=NOT RUN`. PR #29 is the delivery PR for the new test and reconciled ledgers.
- **P2 boundary preserved:** no edits were made to `src/lib/api.ts`, `src/components/AghbariApp.tsx`, `src/routeTree.gen.ts`, `package.json`, `.github/workflows/p2-playwright-critical-paths.yml`, or `e2e/public-storefront-smoke.spec.ts`.

## 6.28 — PR #29 merged; post-merge main acceptance proven — 2026-10-21

- **Final integration merge:** PR [#29](https://github.com/Report-Engainall/Nasr1/pull/29) merged at `2026-10-21T19:33:11Z`, merge commit `1eb57a661b413c9c7d0321dccca70e5d6a0e42fe`. The direct `refs/heads/main` read-back at this checkpoint exactly matched the merge commit; the merge commit parents are prior main `6e97fb35be9ebf65c546a3d5e9615063853c8eab` and PR29 head `f97dae32eb1308e677a3ce04c6e5442146e40a02`.
- **All three integration PRs closed correctly:** PR #18 merged as `f00e609013e248de4ecb94c41e31296884f899cf`; PR #26 merged as `6e97fb35be9ebf65c546a3d5e9615063853c8eab`; PR #29 merged as `1eb57a661b413c9c7d0321dccca70e5d6a0e42fe`.
- **Post-merge exact-main CI:** [Aghbari Commerce checks 39662642889](https://github.com/Report-Engainall/Nasr1/actions/runs/39662642889) COMPLETED/SUCCESS on the exact main SHA `1eb57a661b413c9c7d0321dccca70e5d6a0e42fe`. It passed unit tests, ordered PostgreSQL 17 migrations/core workflow acceptance, stock-count audit, asynchronous export, import idempotency/snapshot contracts, tenant-safe favorites, lint, build, preview/dev smoke, and the dedicated Chromium price-policy step.
- **Combined PR-head P2 acceptance:** [P2 Playwright Critical Paths 39662020868](https://github.com/Report-Engainall/Nasr1/actions/runs/39662020868) COMPLETED/SUCCESS on PR29 head `f97dae32eb1308e677a3ce04c6e5442146e40a02`; [Core checks 39662020790](https://github.com/Report-Engainall/Nasr1/actions/runs/39662020790) also COMPLETED/SUCCESS on that exact PR head. P2's local PostgreSQL/Supabase Chromium tests passed order persistence, cross-tenant denial and customer-return workflow. Its external hosted-account E2E path was skipped because dedicated external credentials were unavailable.
- **Price-policy proof boundary:** `IMPLEMENTED=YES; INTEGRATED_IN_MAIN=YES; TESTED_EXACT_SHA=PASS; BROWSER_PROVEN=PASS` for component-level `ProductGrid`/`ProductDetail` hide/show/malformed-policy/zero-sentinel behavior. The price comes from existing server-resolved data and the existing renderer; no parallel pricing RPC or client-side price calculation was introduced. `REMOTE_SETTINGS_RPC_PROVEN=NOT RUN; PRODUCTION_PROVEN=NOT RUN` — do not elevate the local fixture result into production proof.
- **Catalog task 0007 remains closed with scoped proof:** typed `admin.json(payload)` fixes the JSON scalar/object root cause while retaining the strict allowlist; PostgreSQL 17 confirmed product/category commands, price-grid permission boundaries, audit actor/tenant, conflict detection, tenant isolation and direct-DML denial at exact implementation/test SHA `18b0c8a8f3f03a3f5ad188357690223e3749628f`, [Actions 39647895468 SUCCESS](https://github.com/Report-Engainall/Nasr1/actions/runs/39647895468). This SQL-command task itself does not claim browser or production proof.
- **Handoff discipline:** PRs #18, #26 and #29 are already merged. At every restart, read the live `refs/heads/main` to obtain the current head; the SHA recorded here is the verified code-merge anchor for the completed work, not a promise that future documentation-only commits cannot advance `main`.


## 6.29 — P1 invitation expiry guard and PR #84 integration — 2026-10-23T15:40+03:00

- **PR #84 closed by integration:** customer-manager assignment is now reachable from the real administrator access-settings tab. Reviewed the effective diff against current main (the only remaining functional delta was `src/components/AdminPages.tsx` plus its real-settings wiring test); the customer-directory privacy sanitization was already present in main. Squash merge succeeded through PR #84 at `cb72f35de524af82f63bbbcebec97213464921ed`. This does not imply post-merge main CI passed; check that exact SHA's workflow.
- **P1-INVITE-EXPIRY-90 — regression hardening implemented, verification pending:** `createCustomerActivationInvitation` previously compared the returned expiry only with request-start time. A slow response could therefore return after the link's expiry while still passing the guard. The adapter now compares expiry against `Date.now()` after receiving/validating the server response, while retaining the request-start-based requested-TTL upper bound and five-minute clock-skew allowance.
- Added `src/test/customer-activation-invitations.test.ts` regression coverage simulating a response that arrives after its returned expiry. The last functional code/test commit before checkpoint/report documentation updates is `6d1cc62c56bf49c4ecda75a480021d8bad9938eb`.
- **Prior exact-head results (not applicable to the new code):** Core run [39952596164](https://github.com/Report-Engainall/Nasr1/actions/runs/39952596164) and P2 Playwright [39952595979](https://github.com/Report-Engainall/Nasr1/actions/runs/39952595979) succeeded on prior #90 head `17001d51714a89183e3c7a7381128cfb52d85303). Newest code/test-head results and post-merge main CI are pending readback; no PASS is claimed for those heads.
- **Branch and base evidence:** P1 branch `p1/validate-customer-invitation-response-20261023`; PR #90 original base `0396b29aeab8c09c430df0063821251208a38477`. Main at inspection start was `d3a27dc9c4b209e61bf6b3b9a54ceb8b4a26974d`; PR #84 then merged as `cb72f35de524af82f63bbbcebec97213464921ed`. Initial compare showed PR #90 branch was 11 commits behind pre-merge main, therefore final acceptance must rely on current PR workflow and exact post-merge CI rather than historical green statuses.
- **Files touched by this execution:** `src/lib/customer-activation-invitations.ts`, `src/test/customer-activation-invitations.test.ts`, `docs/bolt-source-reconciliation/PROGRAMMER_1_EXECUTION_CHECKPOINT.md`, `docs/bolt-source-reconciliation/PROGRAMMER_1_CURRENT_REPORT.md`. No P2-owned migration/RPC/RLS/API/E2E path modified.
- **NEXT_ACTION:** verify newest PR #90 Core + P2 results and main CI for `cb72f35...`; fix failures if any; then merge #90 only after current-base acceptance and verify the new main SHA. PR #88 remains Draft until P2 PR #83 is accepted and integrated. Authenticated production proof remains NOT RUN.


## 6.30 — P1 invitation expiry guard merged; post-merge verification pending — 2026-10-23T15:53+03:00

- **Integrated change:** PR [#90](https://github.com/Report-Engainall/Nasr1/pull/90) merged successfully through GitHub at `59547c7d683cefd65cab445b97219aa701021676`. It rejects server invitation responses that are expired at response time or exceed the requested TTL plus the existing five-minute clock-skew allowance.
- **Regression test:** `src/test/customer-activation-invitations.test.ts` now covers expiry while the RPC response is in flight. The adapter plus dialog rejection tests were exercised by Core CI on exact PR head `aff7fc76eaa48b3c4cebdb4eea6fb2e2860ea8f6`; Core [39955806806 SUCCESS](https://github.com/Report-Engainall/Nasr1/actions/runs/39955806806). The corresponding P2 Playwright run [39955806654 SUCCESS](https://github.com/Report-Engainall/Nasr1/actions/runs/39955806654); public read-only smoke and local Supabase acceptance passed. External authenticated customer-order/tenant test was skipped under its credential gate; production proof and email delivery are not claimed.
- **Post-merge gate:** main `59547c7d...` triggered [Core run 39956957952](https://github.com/Report-Engainall/Nasr1/actions/runs/39956957952), which was `IN_PROGRESS` during this record. Do not re-label main as tested-success until the run reaches a terminal successful result on exactly that SHA.
- **Prior integration:** P1 role-assignment UI PR [#84](https://github.com/Report-Engainall/Nasr1/pull/84) merged at `cb72f35de524af82f63bbbcebec97213464921ed`; post-merge Core [39955478215 SUCCESS](https://github.com/Report-Engainall/Nasr1/actions/runs/39955478215) was confirmed on that exact SHA.
- **Session-management handoff:** P1 commented on #82 and #83 after main advanced to `59547c7d...`. Their latest live heads are #82 `8e70899da67d53f0acf221d7e4eeb1a8f2f1b591` and #83 `49ea0ce8936bf319a1941ea0ba0a1f03ebec9c3c`; the current API readback reports `mergeable=false` for both after the main-base update. P2 owns the database/RPC changes and must update these branches conflict-aware and re-run exact-head Core + required local Chromium acceptance. P1 did not edit migrations, RPC/RLS, P2 workflows, `CURRENT_EXECUTION_STATE.md`, `WORK_COORDINATION.md`, or the shared acceptance matrix. PR #88 stays Draft until #83 is integrated and proven.
- **Resume cursor:** branch `p1/post-merge-resume-20261023`; base merge SHA `59547c7d683cefd65cab445b97219aa701021676`. Active blocker: post-merge Core result pending at record time, then P2 central-session current-base integration. Next action is to verify [run 39956957952](https://github.com/Report-Engainall/Nasr1/actions/runs/39956957952) against exact main SHA before changing status.


## 6.31 — Post-merge main Core CI confirmed — 2026-10-23T16:02+03:00

- Main merge SHA `59547c7d683cefd65cab445b97219aa701021676` has now passed Core `test-and-build` on the exact SHA: [Actions run 39956957952 SUCCESS](https://github.com/Report-Engainall/Nasr1/actions/runs/39956957952). This updates the earlier `IN_PROGRESS` note in section 6.30; the confirmed scope is the repository Core workflow only.
- PR #90 remains merged as `59547c7d...`. Its final PR-head Core + P2 tests passed on `aff7fc76eaa48b3c4cebdb4eea6fb2e2860ea8f6`; external customer-account E2E stayed skipped by its credential gate. No production proof or live email delivery is claimed.
- Latest dependency readback: #82 `8e70899da67d53f0acf221d7e4eeb1a8f2f1b591`, #83 `49ea0ce8936bf319a1941ea0ba0a1f03ebec9c3c`, and #88 `895b27384e21f654bf3e1124303304266ddccb3f` now report `mergeable=true`, but #88 remains Draft and must not be integrated until #83's current final backend SHA passes Core and P2. Check live states again before any decision.
- P1 resume cursor: `p1/post-merge-resume-20261023`; application base/current main at fork `59547c7d...`. Next action: submit this checkpoint/report as a separate P1 documentation PR and inspect its exact-head checks, then continue independent P1 UI work after coordinating current path ownership. Shared P2 state and coordination files remain untouched.


## 6.32 — P1 device-session UI double-submit guard — 2026-10-23T16:10+03:00

- **Functional P1 UI improvement:** PR [#88](https://github.com/Report-Engainall/Nasr1/pull/88) now includes a synchronous in-flight `useRef` guard for per-session revocation, in addition to its existing state-based disabled control. This prevents duplicated revoke RPC calls before UI state rerenders. Added `src/test/device-management.test.tsx` acceptance that keeps the mocked revoke RPC pending, dispatches rapid repeated clicks, and verifies one server call.
- **New exact head:** `9310fbb76a7df9db9c45026d9b53053a9ab2d201`. Core [39957639395](https://github.com/Report-Engainall/Nasr1/actions/runs/39957639395) and P2 [39957639394](https://github.com/Report-Engainall/Nasr1/actions/runs/39957639394) were queued at the time of this entry. Prior green runs on `895b273...` are not evidence for this new head.
- **Scope proof:** only P1-owned `src/components/DeviceManagement.tsx` and `src/test/device-management.test.tsx` changed in the UI branch. No P2 migration/RPC/RLS/API/types or E2E workflow path changed. New action regression remains unit-level until current-head workflows and the P2 backend dependency are resolved.
- **Dependency:** P2 #83 still open; last live head `49ea0ce8936bf319a1941ea0ba0a1f03ebec9c3c`. PR #88 must stay Draft until the session backend is current-main integrated, its exact-head Core + local Supabase/Chromium acceptance passes, and the final UI branch is revalidated. No production session or authenticated customer-account acceptance is claimed.
- **Resume:** inspect latest #88 exact-head runs; fix failures; then wait for P2 #83 integration and rebase/forward-integrate carefully from current main using no force-push.


## 6.33 — Session-list retry test and external CI rate-limit diagnosis — 2026-10-23T16:15+03:00

- Added regression `recovers from a network failure when the administrator retries the session list` to `src/test/device-management.test.tsx`. It verifies that list RPC rejection shows an accessible error, stale server rows are not retained, and Retry makes a second list call and restores server-returned data.
- Current P1 UI PR #88 exact source/test head is now `7adeec2fa2490840aa213449a2d87f49b4e97b74`. The prior head `9310fbb76a7df9db9c45026d9b53053a9ab2d201` has an active Core run `39957639395`; P2 run `39957639394` first failed while installing app dependencies because many packages from the configured Lovable npm mirror returned HTTP 429. The failed job is being retried, but the prior run cannot prove the newly added network-retry test. Exact-current-head Core + P2 are pending/re-triggered after this test-only commit.
- The network-retry UI code already fails closed and provides Retry; only its regression coverage was added in this batch. P1 session revocation was also synchronously guarded against duplicate clicks with a pending-RPC test in the predecessor commit.
- No migration/RPC/RLS/API/E2E workflow or shared coordination file changed. Backend proof remains blocked on P2 #83; #88 must stay Draft.
- NEXT_ACTION: read Core/P2 runs for exact `7adeec2...`, diagnose any specific assertion/build error; rerun past the external 429 dependency failure and verify the required jobs instead of accepting skipped jobs as passing.


## 6.34 — Exact-head P1 session UI result and CI infrastructure blocker — 2026-10-23T16:22+03:00

- Core run [39958053579 SUCCESS](https://github.com/Report-Engainall/Nasr1/actions/runs/39958053579) proves PR #88 UI/test head `7adeec2fa2490840aa213449a2d87f49b4e97b74`. Unit tests, DB migration/core workflow tests, lint/build/smoke and existing PostgreSQL 17 acceptance steps completed successfully. This includes the new repeated-revoke event guard and network-failure retry regression on the exact same head.
- P2 run [39958054156 FAILURE](https://github.com/Report-Engainall/Nasr1/actions/runs/39958054156), attempt 2, failed before browser application assertions at `Install app dependencies from the verified Bun lockfile` due repeated HTTP 429 for package downloads from the configured Lovable mirror. Its local Supabase/Chromium job was SKIPPED, so the central device/session UI is not end-to-end proven or merge-ready.
- P2 #83 latest head `04241376b769403bc6a6357265c51cf1ca66e3e2` similarly failed Core at dependency installation before migrations/tests; run [39958234359](https://github.com/Report-Engainall/Nasr1/actions/runs/39958234359). P2 run [39958234348](https://github.com/Report-Engainall/Nasr1/actions/runs/39958234348) remained in progress at readback. Exact evidence was posted to PR #83, comment 6365616497.
- PR #93 documentation PR's prior retry also hit HTTP 429 in both Core/P2 dependency installation; that PR must not be merged until a later exact-head CI attempt completes successfully. No package lock, workflow, migration, RPC/RLS/API, shared execution-state, or shared coordination paths were changed to conceal or bypass these failures.
- NEXT_ACTION: coordinate recovery of dependency registry/rate limiting with its workflow owner; then rerun current-head P2 Playwright for #88 and verify local Supabase/Chromium actually passed. Keep #88 Draft until PR #83 backend is integrated on current main. Review PR #93's latest exact-head workflow status separately.


## 6.35 — Exact session-revoke acknowledgement regression added — 2026-10-23T16:27+03:00

- Added `src/test/device-management.test.tsx` coverage for a malformed-but-success-shaped revoke RPC response that names a different session ID. Expected behavior: no success notice, visible error, and no stale session row displayed. Current #88 exact head is `5f500eb2129f5745bb924beb06e6a4764ab9a0e0`.
- New Core run [39959076957](https://github.com/Report-Engainall/Nasr1/actions/runs/39959076957) and P2 run [39959076848](https://github.com/Report-Engainall/Nasr1/actions/runs/39959076848) were queued at this update. Do not infer their outcomes. Prior Core green `39958053579` is only for predecessor `7adeec2...`.
- Main dependency remains P2 PR #83; live head at record time was `5c0367b631a80cc13d10ba5219d3f1966d0185ec`, with its own workflows active. P2 test installation has seen repeated HTTP 429 from the configured Lovable npm package mirror before application/browser steps; external-account jobs are separately gated. No registry/lockfile/workflow modifications were made from P1.
- Next: confirm Core and P2 exact-head results for `5f500eb...`, keep #88 Draft until the #83 session backend is integrated and server-backed browser acceptance completes.


## 6.36 — Current main-sync head and handoff — 2026-10-23T16:35+03:00

- Live P1 UI PR #88 head advanced by a normal merge commit to `f7839b615282a1627804fce360d6ceda5fe56e48`, syncing current main SHA `59547c7d683cefd65cab445b97219aa701021676`. PR file diff remains exactly `src/components/DeviceManagement.tsx` + `src/test/device-management.test.tsx`; no force-push or P2 backend-file change.
- Previous head `5f500eb2129f5745bb924beb06e6a4764ab9a0e0` Core [39959076957 SUCCESS, attempt 2](https://github.com/Report-Engainall/Nasr1/actions/runs/39959076957) passed all Core steps, including the new exact-session acknowledgement test. P2 [39959076848 FAILURE, attempt 2](https://github.com/Report-Engainall/Nasr1/actions/runs/39959076848) failed before app/browser tests at dependency setup due repeated mirror HTTP 429; the local-Supabase job was skipped.
- Current sync-head Core [39959906007](https://github.com/Report-Engainall/Nasr1/actions/runs/39959906007) and P2 [39959905948](https://github.com/Report-Engainall/Nasr1/actions/runs/39959905948) were running at the time recorded. Do not project predecessor PASS status to the current merge head.
- P2 PR #83 live head `b7830efa562021e0139736a33d0235037cd8f976` has Core [39959552835 SUCCESS](https://github.com/Report-Engainall/Nasr1/actions/runs/39959552835) while P2 [39959552757](https://github.com/Report-Engainall/Nasr1/actions/runs/39959552757) remained in progress. P2's central-session backend still is not in main, so #88 must stay Draft even if UI/Core tests are green.
- Documentation PR #93 remains open. Its previous head `0fb97ce055da170fab2173a53462ce5eafae0508` Core and P2 attempts failed at dependency installation with HTTP 429 before test execution; no docs PR merge is claimed.
- NEXT_ACTION: verify both workflows on exact #88 head `f7839b...`, then resume after P2 #83 integration and require actual local Supabase/Chromium session-contract acceptance. Main SHA remains `59547c...` at this checkpoint.


## P1 central device/session UI — live execution update (2026-10-23T16:19:11.592+03:00)

**Task:** `P1-DEVICE-SESSION-UI-SYNC-MAIN-001` / `P1-DEVICE-SESSION-MGMT-001`  
**Branch / PR:** `p1/central-device-session-ui-20261023` / [PR #88](https://github.com/Report-Engainall/Nasr1/pull/88)  
**BASE_SHA:** `59547c7d683cefd65cab445b97219aa701021676`  
**Functional HEAD:** `f7839b615282a1627804fce360d6ceda5fe56e48`

### Completed in this unit
- Fast-forwarded the existing PR branch by a merge commit whose first parent is the verified current `main` SHA and whose second parent is the prior PR head. This removed the 13-commit behind/diverged condition without rewriting published history.
- Verified the updated branch compares to `main` as `ahead`, `ahead_by=10`, `behind_by=0`; the code diff is confined to `src/components/DeviceManagement.tsx` and `src/test/device-management.test.tsx`.
- Existing UI test coverage includes server-backed listing, exact-target revocation acknowledgement, duplicate-action prevention, network retry, malformed server contract rejection, RPC failure, non-admin denial, and separation of account-level versus organization-level sign-out. No parallel page/backend implementation was introduced.

### Verification (exact SHA)
- Core CI [run 39959906007](https://github.com/Report-Engainall/Nasr1/actions/runs/39959906007) on `f7839b615282a1627804fce360d6ceda5fe56e48`: **FAIL before tests** at `bun install --frozen-lockfile` because package archive downloads from the configured Lovable npm cache returned HTTP 429. Unit/PostgreSQL/lint/build steps were skipped; this is not a code PASS or FAIL.
- A failed-job retry was requested for run 39959906007; outcome pending when this report entry was written.
- P2 Playwright [run 39959905948](https://github.com/Report-Engainall/Nasr1/actions/runs/39959905948) on the same functional HEAD was in progress at last read; authenticated customer order/tenant test was skipped. No authenticated session-revocation browser proof or production proof is claimed.
- PR #83 remains the dependency for server-side tenant-scoped session inventory and selective revocation. Until it is integrated, #88 must remain PARTIAL and must not claim end-to-end session management.

### Files changed
- `src/components/DeviceManagement.tsx`
- `src/test/device-management.test.tsx`
- This report and `PROGRAMMER_1_EXECUTION_CHECKPOINT.md` for resume evidence only.

### Next action
Read the exact-head Core retry and P2 Playwright results. Resolve only a proven code failure; if the dependency registry is still throttling, use an approved fallback that preserves the frozen lockfile and do not weaken dependency-integrity checks. Coordinate after #83 is merged and run the integrated UI/API/browser acceptance before recommending merge.

**LOCKED_PATHS:** P2-owned SQL migrations, RPC/RLS, Auth enforcement, generated database types and workflow fixtures — unchanged.  
**BLOCKER:** npm cache HTTP 429 and open backend dependency #83.  
**STATUS:** branch synchronized to main; acceptance pending; PR #88 not ready to merge.


## P1 duplicate session-row rejection acceptance — 2026-10-23T16:25+03:00

**Task ID:** `P1-DEVICE-SESSION-DUPLICATE-ROW-ACCEPTANCE-001`  
**Repository/branch:** `Report-Engainall/Nasr1` / `p1/central-device-session-ui-20261023`  
**PR:** [#88 — server-backed device session controls](https://github.com/Report-Engainall/Nasr1/pull/88)  
**Base SHA:** `59547c7d683cefd65cab445b97219aa701021676`  
**Code/test SHA:** `73864a23839d75f275e44bc52893f0533383033e`

### Implementation
Added a focused regression test to `src/test/device-management.test.tsx`. The mock server returns two inventory entries with the same `session_id`; the expected behavior is a visible error alert and fail-closed clearing of all entries, including both display names. The UI implementation already rejects duplicate IDs, so this closes a test gap without duplicating implementation or touching backend contracts.

### Actual verification state
- Core CI [run 39960886831](https://github.com/Report-Engainall/Nasr1/actions/runs/39960886831): **QUEUED** on the exact code/test head at checkpoint time.
- P2 Playwright [run 39960886827](https://github.com/Report-Engainall/Nasr1/actions/runs/39960886827): **PENDING** at checkpoint time.
- Previous Core run [39959906007](https://github.com/Report-Engainall/Nasr1/actions/runs/39959906007) failed before tests at package installation due to repeated HTTP 429 responses from the configured Lovable npm cache; unit, PostgreSQL, lint/build and smoke checks were skipped. Previous P2 run [39959905948](https://github.com/Report-Engainall/Nasr1/actions/runs/39959905948) was cancelled. Neither is a pass for the new change.
- No local test execution is claimed in this connector-only change workflow; wait for the exact-head Actions conclusions before closing the task.

### Files changed
- `src/test/device-management.test.tsx` (new test only in this unit).
- `PROGRAMMER_1_EXECUTION_CHECKPOINT.md` and this report appended for resumption.

### Next action / release condition
Read exact-head CI results on the final branch SHA after the checkpoint commit. Retry transient package-cache 429 failures without bypassing the frozen lockfile or changing test assertions. Then wait for P2 PR #83 to land, test this UI against the integrated backend, and require authenticated isolated-browser evidence of list scoping, selective revocation, audit readback and denial of later protected requests before recommending a merge.

**LOCKED_PATHS:** P2 migrations/RPC/RLS/types/workflows and P3 acceptance files — unchanged.  
**BLOCKER:** exact-head CI and authenticated browser acceptance pending; P2 #83 is still open.  
**STATUS:** implemented regression test; test result pending; PR #88 not ready to merge.


## P1 audited self-session revocation RPC wiring — 2026-10-23T16:28+03:00

**Task:** `P1-DEVICE-SESSION-SELF-REVOCATION-RPC-001`  
**Branch/PR:** `p1/central-device-session-ui-20261023` / [PR #88](https://github.com/Report-Engainall/Nasr1/pull/88)  
**Base SHA:** `59547c7d683cefd65cab445b97219aa701021676`  
**Functional code/test SHA:** `8248a7f8dc3145063ee319fa35de41305d19705a`

### Change delivered
The “sign out other sessions” button previously called `supabase.auth.signOut({scope:'others'})`, which did not consume the P2-owned auditable, server-enforced contract. It now calls `revoke_other_auth_sessions` and fails closed unless the response proves the same current session was retained, the revoked count is a non-negative integer, the server-reported UUID list is unique and count-aligned, the current session is absent from that list, and `revoked_at` is parseable. The UI reports the number only after that exact response validation. A synchronous guard blocks rapid duplicate invocation. Current-device logout remains on `scope:'local'`; organization-level selected-session revoke remains separate.

### Regression coverage
- Added a successful RPC-flow test verifying the current session remains visible and other session rows are absent after server acknowledgment.
- Added malformed acknowledgment coverage (wrong current session, duplicate IDs, mismatched count/invalid timestamp) asserting no success notice.
- Retained existing coverage for per-session acknowledgment mismatch, list duplicate IDs, malformed list shape, RPC/network failures, retry and admin gating.

### Exact-head verification
- Core CI [39961454298](https://github.com/Report-Engainall/Nasr1/actions/runs/39961454298): **IN PROGRESS** on `8248a7f8dc3145063ee319fa35de41305d19705a`.
- P2 Playwright [39961454316](https://github.com/Report-Engainall/Nasr1/actions/runs/39961454316): **IN PROGRESS** on the same SHA.
- No local test command is claimed. The earlier HTTP 429 install failure was on an older SHA and must not be presented as a functional failure or a pass for this head.
- P2 PR #83 is still required. PostgreSQL acceptance of the contract and UI unit tests do not replace an authenticated browser proof of revocation followed by rejection on a later protected request.

### Files changed
- `src/components/DeviceManagement.tsx`
- `src/test/device-management.test.tsx`
- `PROGRAMMER_1_EXECUTION_CHECKPOINT.md` and this report for resume evidence.

### Next action and gates
Read CI on the final checkpoint SHA; repair concrete failures only. Once #83 merges, update the P1 branch on the current main, rerun Core and P2 browser acceptance on the exact integration head, and preserve the PARTIAL state until authenticated browser proof passes.

**LOCKED_PATHS:** P2 database/API/RLS/Auth/workflow files, shared execution-state/coordination files, and P3 acceptance files — unchanged.  
**BLOCKER:** terminal CI pending; P2 PR #83 open.  
**STATUS:** implementation committed; acceptance pending; do not merge yet.


## P1 self-session RPC acceptance fixture correction — 2026-10-23T16:33+03:00

**Task ID:** `P1-DEVICE-SESSION-RPC-ACK-FIXTURE-001`  
**Branch/PR:** `p1/central-device-session-ui-20261023` / [#88](https://github.com/Report-Engainall/Nasr1/pull/88)  
**Base SHA:** `59547c7d683cefd65cab445b97219aa701021676`  
**Corrected code/test SHA:** `ddb80804b8749cb8dff182344ca9713e2beb64ec`

### Failure observed and fix
Core CI on the previous code/test head `8248a7f8dc3145063ee319fa35de41305d19705a` ran 136 test files and failed one new bulk-revocation test (855/856 individual tests passed). The exact failed assertion was that the success notice callback had not been called with the expected text. The test helper `mount()` mounts with `mocks.onNotice`, while the test created and asserted against a different `vi.fn()`. Fixed only the test fixture to observe the callback actually passed into the component. The assertions about exact RPC, current session retention and hidden revoked rows remain intact; no code behavior was relaxed.

### Separate infrastructure failure
On docs SHA `0c582c1ca0cf92f0b1a959d26a1e82af66c84d39`, both Core [39961596225](https://github.com/Report-Engainall/Nasr1/actions/runs/39961596225) and P2 Playwright [39961596206](https://github.com/Report-Engainall/Nasr1/actions/runs/39961596206) failed at dependency download with HTTP 429 from `lovable-core-prod/sandbox-npm-cache` before executing tests. This is independent of the functional-head unit assertion. Latest corrected code/test SHA `ddb80804...` requires fresh exact-head Core and P2 runs.

### Related P2 dependency
P2's session backend branch is synced to main, but P2 Playwright run [39960901154](https://github.com/Report-Engainall/Nasr1/actions/runs/39960901154) failed its local Supabase job in purchase-receipt acceptance with `Purchase receipt accounting acceptance is restricted to local PostgreSQL 17.`; the failure and exact SHA were reported to P2 via PR #83 comment 6366037526. No P2-owned path was changed in P1.

### Next action
Inspect new exact-head Core/P2 results for `ddb80804...`. Preserve the error if any test still fails and fix the concrete cause. Keep #88 unmerged/partial until P2 #83 lands, its backend acceptance is green, and authenticated browser acceptance verifies the actual session revocation and subsequent request denial.

**Files changed in this unit:** `src/test/device-management.test.tsx`; checkpoint/report appended.  
**LOCKED_PATHS:** P2 API/database/auth/workflow paths and P3 acceptance — unchanged.  
**STATUS:** test fixture fixed; new exact-head CI pending; PR #88 not merge-ready.


## P1 bulk-session double-submit regression — 2026-10-23T16:37+03:00

**Task ID:** `P1-DEVICE-SESSION-BULK-DOUBLE-SUBMIT-001`  
**Branch/PR:** `p1/central-device-session-ui-20261023` / [#88](https://github.com/Report-Engainall/Nasr1/pull/88)  
**Base SHA:** `59547c7d683cefd65cab445b97219aa701021676`  
**Functional code/test SHA:** `572ab73dc3dab53d2042f2fa8f1f0f1388ba3633`

### Change
Added an async/deferred-RPC regression proving that two rapid clicks on the own-account “other sessions” action issue exactly one `revoke_other_auth_sessions` call. The test resolves the server acknowledgement and then asserts the success notice only follows the acknowledgement. This directly tests the synchronous `otherSessionsInFlight` guard added in `DeviceManagement.tsx`.

### Test history — keep each SHA separate
- SHA `8248a7f8dc3145063ee319fa35de41305d19705a`, Core run [39961454298](https://github.com/Report-Engainall/Nasr1/actions/runs/39961454298): **1 failure / 855 passing tests** in the newly added successful-RPC test. The assertion used a callback different from the one mounted. It was fixed in test setup on SHA `ddb80804b8749cb8dff182344ca9713e2beb64ec`; assertions were not weakened.
- Corrected SHA `ddb80804b8749cb8dff182344ca9713e2beb64ec`, Core [39961918566](https://github.com/Report-Engainall/Nasr1/actions/runs/39961918566) was still in progress at last read; P2 Playwright [39961918709](https://github.com/Report-Engainall/Nasr1/actions/runs/39961918709) was CANCELLED.
- Latest SHA `572ab73dc3dab53d2042f2fa8f1f0f1388ba3633`, Core [39962147380](https://github.com/Report-Engainall/Nasr1/actions/runs/39962147380) and P2 Playwright [39962147845](https://github.com/Report-Engainall/Nasr1/actions/runs/39962147845) are IN PROGRESS.
- A separate documentation-head run [39961596225](https://github.com/Report-Engainall/Nasr1/actions/runs/39961596225) failed before tests because repeated npm-cache package download requests returned HTTP 429. That is an infrastructure problem, not test evidence for the current functional head.

### P2 dependency and coordination
PR #83 has current-main sync. Its Core run [39960901244](https://github.com/Report-Engainall/Nasr1/actions/runs/39960901244) succeeded, but P2 Playwright [39960901154](https://github.com/Report-Engainall/Nasr1/actions/runs/39960901154) failed its local Supabase acceptance at purchase-receipt acceptance. P1 posted exact evidence to #83 comment 6366037526; P1 made no changes to P2-owned workflows, fixtures, DB or RPC paths.

### Next action
Read latest exact-head runs. Fix only demonstrated UI/test defects; retry rate-limited install failures without weakening dependency verification. Then refresh this branch after #83 integrates and require authenticated browser proof of actual self-scoped and admin-selected session revocation, retained current session, audit and subsequent protected-request denial.

**Files changed:** `src/components/DeviceManagement.tsx`, `src/test/device-management.test.tsx`, the two P1-owned resume documents.  
**LOCKED_PATHS:** P2 database/API/RLS/Auth/workflows and P3 acceptance paths — unchanged.  
**STATUS:** implementation/test additions committed; CI pending; PR #88 remains not merge-ready.


## P1 live readback — code acceptance green, integration gates remain — 2026-10-23T16:46+03:00

### Verified P1 code/test head
- Code/test SHA `572ab73dc3dab53d2042f2fa8f1f0f1388ba3633`.
- [Core CI #39962147380](https://github.com/Report-Engainall/Nasr1/actions/runs/39962147380) COMPLETED SUCCESS: 136 test files / 857 tests, PostgreSQL 17 migrations/core acceptance, invitation expiry, stock-count audit, async export, import idempotency, inventory snapshot, saved products, backup/restore, lint, build, dev/preview smoke, and Chromium price-visibility test all passed.
- [P2 Playwright #39962147845](https://github.com/Report-Engainall/Nasr1/actions/runs/39962147845) had public UI smoke SUCCESS, external customer-order/tenant acceptance SKIPPED and local Supabase job CANCELLED. This does not prove the new session RPC works against a running backend.

### Exact current branch head
The docs-only branch head `7d756c62743fbbd92e52d9a392f6c441add61951` has its own check runs, separate from the tested code head above. Core [39962288619](https://github.com/Report-Engainall/Nasr1/actions/runs/39962288619) was still IN_PROGRESS at the last read; unit/DB/lint/build and preview/dev-smoke steps were successful while Chromium price-visibility acceptance remained non-terminal. P2 [39962288636](https://github.com/Report-Engainall/Nasr1/actions/runs/39962288636) was still in public UI smoke, and authenticated external customer/tenant acceptance was skipped. Re-read before claiming the docs head green.

### Previously completed current-main UI task — no duplicate rebuild
Verified that main's `src/components/AdminPages.tsx` (blob `f40d28dd03dd32cda00e181465115266c6330a8a`) imports and mounts `CustomerManagerRoleAssignment` inside the real `SettingsPage` access tab under `canManageRoles`. The wiring test `src/test/customer-manager-role-assignment-settings-wiring.test.tsx` (blob `eeb72df65158681064c81652087e7e9a0e01f1e5`) tests the actual page/tab and denies the customer-manager role. The above 857-test current-main-based Core suite passed; the feature is already integrated, so P1 did not create a duplicate panel.

### Invitation create failure remains with P2
- PR #90 is in current main but its P2 Playwright attempt was cancelled. Its UI adapter now rejects expired/overlong/foreign invitation responses; it does not mask server errors as success.
- The browser's root failure was real: pgcrypto was called as `public.gen_random_bytes` although the installed extension schema was different. P2's migration fix is in open PR #82 at `8e70899da67d53f0acf221d7e4eeb1a8f2f1b591`; live compare now reports `ahead_by=18`, `behind_by=13` from main `59547c7...`. P1 recorded the sync + exact-head retest requirement at [#82 comment 6366161962](https://github.com/Report-Engainall/Nasr1/pull/82#issuecomment-6366161962) and [handoff #86 comment 6366213509](https://github.com/Report-Engainall/Nasr1/issues/86#issuecomment-6366213509). No P2 migration/workflow path was changed by P1.
- PR #83 central-session backend is 66 ahead / 0 behind main, Core PASS on [39960901244](https://github.com/Report-Engainall/Nasr1/actions/runs/39960901244), but its local P2 Playwright job [39960901154](https://github.com/Report-Engainall/Nasr1/actions/runs/39960901154) is FAIL because purchase-receipt acceptance rejected the runtime as not local PostgreSQL 17. P1 reported the exact failure in comment 6366037526; the workflow/harness fix is P2-owned.

### Status / next action
- Session UI: implemented and Core-tested at the code/test SHA; PR #88 remains **DRAFT / PARTIAL**. Do not merge until #83's P2 workflow acceptance is fixed, the backend is merged, and browser proof establishes selective revocation and denial of subsequent protected requests.
- Invitation create: **NOT PROVEN in browser on current main**; await synced #82 exact-head Core + local Supabase/Chromium success and post-merge verification.
- Files changed by P1: only `DeviceManagement.tsx`, `device-management.test.tsx`, and P1-owned checkpoint/report.


## P1 — reject stale session-list responses — 2026-10-23T17:00+03:00

### Root cause and fix
A session list read can outlive a newer read triggered by a successful revocation. Without ordering, an earlier response could overwrite the newer server state and make a revoked session appear in the UI again. `src/components/DeviceManagement.tsx` now assigns a monotonically increasing request ID to each organization-session list request. Only the newest request may update session rows, error state, or loading state, including when an old request fails. A new request also invalidates pending reads when the caller is no longer authorized.

### Regression acceptance
Added a deferred-RPC component test in `src/test/device-management.test.tsx`: the initial server list remains pending; the account-scoped revocation succeeds; the subsequent list returns only the current session; then the stale pre-revocation list is released. The expected behavior is that the revoked row remains absent and the error state stays clear.

### Exact-head evidence
- Functional commit: `f3673f85a88762be52a4c8ca7597be475639eda9`.
- Latest prior exact-head Core run [39965165177](https://github.com/Report-Engainall/Nasr1/actions/runs/39965165177) and P2 Playwright [39965165130](https://github.com/Report-Engainall/Nasr1/actions/runs/39965165130) passed on parent SHA `58e795f6ab601093b02286a18bce080e55424c63`; they do **not** prove this new code/test. Exact-head results for `f3673f85...` are pending.
- P2 session backend exact-head Core [39961778913](https://github.com/Report-Engainall/Nasr1/actions/runs/39961778913) and Playwright [39961778847](https://github.com/Report-Engainall/Nasr1/actions/runs/39961778847) both passed on P2 SHA `91c87e003b5196eb9b5be02326e8aa52b3a3f4d3`. This is evidence for the backend branch and its configured commerce tests, not proof the P1 session E2E was run.
- The new `e2e/device-session-management.spec.ts` / `scripts/seed-p1-device-session-playwright.mjs` are in #88, but the inspected P2 workflow at current head does not invoke them. P1 handed this gap to P2 at [comment 6366644229](https://github.com/Report-Engainall/Nasr1/pull/83#issuecomment-6366644229). Session browser proof remains NOT_PROVEN until the explicit tests run on an integrated backend.

### Next action and ownership
Read the latest #88 Core and Playwright results by exact SHA; repair concrete failures only. P2 owns the workflow/backend fixture connection and must make the session spec run inside local-only Supabase/PG17. Do not modify its workflow, migrations, RPC, RLS or generated types from P1. Do not merge #88 until that scenario plus post-revocation protected-request denial is proven.

**Branch:** `p1/central-device-session-ui-20261023`  
**PR:** [#88](https://github.com/Report-Engainall/Nasr1/pull/88)  
**BASE_SHA:** `59547c7d683cefd65cab445b97219aa701021676`  
**FUNCTIONAL_HEAD_SHA:** `f3673f85a88762be52a4c8ca7597be475639eda9`  
**STATUS:** Implemented; exact-head CI pending; session E2E wiring pending with P2.


## P1 — current-device sign-out is single-flight and clears stale auth details — 2026-10-23T17:15+03:00

### Root cause and fix
The current-device sign-out handler relied on the button becoming disabled after React state updated and kept the locally rendered session object after the auth API acknowledged logout. A rapid double click could therefore issue duplicate `supabase.auth.signOut({ scope: 'local' })` calls, and the current-session details could remain visible until a later navigation. The handler now takes a synchronous `useRef` single-flight lock, refuses execution if another action is active, and clears the locally held current-session and organization-session rows only after a successful auth-service response. On error it retains the session state for an honest retry and shows an error rather than success.

### Regression acceptance
Added a deferred-signOut component test in `src/test/device-management.test.tsx`: two rapid clicks while the first sign-out is pending must call the service once; after a successful response the user notice fires once, the account email/session details disappear, and the action stays disabled. The previously completed `P1-DEVICE-SESSION-STALE-LIST-RESPONSE-001` guards against stale list replies restoring revoked sessions after a newer read.

### Exact-head evidence and route wiring
- Local sign-out implementation/test commit: `f1c298299281f1e10755c3786c3900724f5c5632`; Core CI is pending on this SHA.
- Previous head `d23de924cccc839208eb64c4bbc9528d9feddb4c` Core [39967378247](https://github.com/Report-Engainall/Nasr1/actions/runs/39967378247) SUCCESS; it predates this sign-out change. Its P2 Playwright [39967378245](https://github.com/Report-Engainall/Nasr1/actions/runs/39967378245) was still running when this new code was committed.
- `src/components/AghbariApp.tsx` blob `6acb7515e4c77cdc9416d1475672c4b7552a772c` imports and renders `DeviceManagement` for the `devices` view and maps that view to `/admin/devices`. `src/routes/admin_.devices.tsx` blob `97d76c572af13d5714baf3b1f0652da98114885f` mounts `AdminApp initialView="devices"` at the real route. This is source-level route wiring, not a claim of authenticated browser acceptance.
- The session browser spec and seeding script are committed in #88 but not executed by the currently inspected P2 workflow. P1 handed this to P2 via comments [6366644229](https://github.com/Report-Engainall/Nasr1/pull/83#issuecomment-6366644229) and [6366901182](https://github.com/Report-Engainall/Nasr1/pull/83#issuecomment-6366901182).

### Next action / ownership
Read exact-head CI after the current resume-doc commit. Fix code/test failures only. P2 owns backend/session RPC/RLS and the local-only Playwright workflow wiring; do not change those locked paths in P1. Once P2 runs the dedicated browser test on its synced branch and merges the server contract, rerun the exact integrated scenario against #88. Keep #88 Draft pending this proof.

**Branch:** `p1/central-device-session-ui-20261023`  
**PR:** [#88](https://github.com/Report-Engainall/Nasr1/pull/88)  
**BASE_SHA:** `f7565aefd7af6033d169167d1bebb3dc5cd248ce`  
**FUNCTIONAL_HEAD_SHA:** `f1c298299281f1e10755c3786c3900724f5c5632`  
**STATUS:** Two P1 UI regressions implemented; stale-list guard Core-tested; new single-flight logout test awaits exact-head CI; session E2E remains blocked on P2 workflow wiring.


## P1 — validate the full server acknowledgment for session revocation — 2026-10-23T17:24+03:00

### Change
The selected-session UI previously accepted any object with the correct `session_id` and `revoked: true`. It did not validate that the server returned a parseable `revoked_at` value even though that timestamp is part of the acknowledged revocation/audit contract. The handler now fails closed unless the selected ID matches, `revoked === true`, and `revoked_at` is a valid date. The UI shows no success on malformed acknowledgement.

### Regression
Added a component regression where the RPC returns the correct target session ID and `revoked: true`, but `revoked_at: "not-a-timestamp"`. It asserts the exact target RPC was called, no success notice was shown, the error remains visible and stale session rows are not rendered while acceptance is unresolved.

### Evidence
- Functional commit: `f6d0c75326cc6ab650359b983d6fd6749ec647f3`; exact-head CI was pending at this report update.
- Prior Core only: stale-list guard SHA `f3673f85a88762be52a4c8ca7597be475639eda9`, run [39966125912 SUCCESS](https://github.com/Report-Engainall/Nasr1/actions/runs/39966125912). Local sign-out SHA `f1c298299281f1e10755c3786c3900724f5c5632`, run [39968018993 SUCCESS](https://github.com/Report-Engainall/Nasr1/actions/runs/39968018993). These are predecessor SHAs, not proof for the new timestamp validation.
- PR #88 is [open/Draft](https://github.com/Report-Engainall/Nasr1/pull/88). Session browser spec and local seeding script exist in the branch, but the inspected P2 workflow did not invoke them. Handoff remains with P2 under comments [6366644229](https://github.com/Report-Engainall/Nasr1/pull/83#issuecomment-6366644229) and [6366901182](https://github.com/Report-Engainall/Nasr1/pull/83#issuecomment-6366901182).

### Next action / ownership
Read exact Core and P2 results on the latest PR #88 head after this checkpoint commit. P2 alone owns the workflow/backend integration; P1 will not edit its workflow, migration, RPC/RLS/Auth or generated type paths. Keep #88 Draft until the integrated session browser tests run and prove post-revocation protected-request denial.

**Branch:** `p1/central-device-session-ui-20261023`  
**PR:** [#88](https://github.com/Report-Engainall/Nasr1/pull/88)  
**BASE_SHA:** `f7565aefd7af6033d169167d1bebb3dc5cd248ce`  
**FUNCTIONAL_HEAD_SHA:** `f6d0c75326cc6ab650359b983d6fd6749ec647f3`  
**STATUS:** Implemented; exact-head CI pending; session E2E not yet wired by P2.


## P1 — local sign-out failure preserves retry path — 2026-10-23T17:29+03:00

Added an explicit error/retry regression test for the current-device sign-out action in `src/test/device-management.test.tsx`. The first mocked `supabase.auth.signOut({ scope: 'local' })` rejects with a network error; acceptance requires the existing account/session details to remain visible, an error alert to show, no success notice, and the button to become available again. A second click then succeeds and must clear the visible session details and issue exactly one success notice. This complements the current-head implementation guard that prevents overlapping clicks and clears auth-derived display state only after a successful response.

- Test commit: `8d3ee29f48c6f9f600722b2354f9d3fc40b41ca5`; exact-head Core/P2 results pending.
- Previous implementation heads: [Core 39968018993](https://github.com/Report-Engainall/Nasr1/actions/runs/39968018993) successful at `f1c2982...`; [Core 39968697854](https://github.com/Report-Engainall/Nasr1/actions/runs/39968697854) successful at `f6d0c75...`. Neither run tests the new retry test. No local test command was run by this session.
- Session browser blocker remains P2-owned: workflow on PR #83 `dda5124...` did not invoke the dedicated P1 session spec/seed script. The #88 PR remains Draft until that local-only browser contract test actually runs on the integrated backend.

**Branch:** `p1/central-device-session-ui-20261023`  
**PR:** [#88](https://github.com/Report-Engainall/Nasr1/pull/88)  
**BASE_SHA:** `f7565aefd7af6033d169167d1bebb3dc5cd248ce`  
**FUNCTIONAL_HEAD_SHA:** `8d3ee29f48c6f9f600722b2354f9d3fc40b41ca5`  
**STATUS:** Implemented; exact-head CI pending; authenticated session E2E not yet executed.


## P1 live readback — P2 backend merged; integrated session UI needs exact-head browser proof — 2026-10-23T17:38+03:00

### P2 dependency resolved, acceptance still incomplete
P2 PR #83 merged to `main` at `bd0d2df489e40b2dc5f83882d90565c7799a448c`. Its pre-merge Core run [39968857948](https://github.com/Report-Engainall/Nasr1/actions/runs/39968857948) and P2 Playwright run [39968858140](https://github.com/Report-Engainall/Nasr1/actions/runs/39968858140) both succeeded on `dda512495c43f2fd84517635cd83421ef49e92c0`. The Core migration workflow calls `runSessionManagementAcceptance` in `scripts/test-session-management.mjs`; the isolated local Supabase browser job succeeded for its configured order, tenant isolation, returns/credit memo, Onyx export and finance/task print scenarios. However, the P2 workflow blob `1b2b0eade154b8b4e8ed0bed0fa9b7067b5666b7` does not invoke P1's `e2e/device-session-management.spec.ts` or local seed script, so those generic browser passes do not prove the session-specific sequence.
 
### P1 branch sync and code evidence
P1's pre-sync head `428c98bece43296dbebd9ce30c78cffe48541348` Core [39969541171](https://github.com/Report-Engainall/Nasr1/actions/runs/39969541171) and P2 Playwright [39969541110](https://github.com/Report-Engainall/Nasr1/actions/runs/39969541110) both passed. This head includes the current-session single-flight sign-out, clear-on-ack behavior, retry-after-network-failure regression, stale session-list response guard and full acknowledgment validation (`session_id`, `revoked === true`, valid `revoked_at`). Those tests establish UI-level behavior against mocks, not the authenticated browser/backend journey. The main-sync merge commit created here must receive a fresh exact-head CI run.

### Other ordered P1 tasks
P1-01 category rename (#50) and P1-02 password recovery metadata/reset handling (#44) are merged. Current main Core [39969622689](https://github.com/Report-Engainall/Nasr1/actions/runs/39969622689) passed on `bd0d2df489e40b2dc5f83882d90565c7799a448c`; password-reset authenticated browser acceptance is still NOT_RUN. P1 is moving next to any independently confirmed product/admin form gap outside P3's active #89 paths.

### Required next action
Read current #88 Core + P2 runs by exact post-sync SHA. If green, hand the missing session-spec invocation to P2 in a separate workflow-only follow-up; keep #88 Draft until same-tenant selective revocation is browser-proven to deny a subsequent protected tenant-context request for the revoked-but-unexpired session, and self-scoped bulk revocation is proven to preserve the current session. Do not edit P2's locked workflow or DB paths from P1.

**Branch:** `p1/central-device-session-ui-20261023`  
**PR:** [#88](https://github.com/Report-Engainall/Nasr1/pull/88)  
**BASE_SHA:** `bd0d2df489e40b2dc5f83882d90565c7799a448c`  
**PRE_SYNC_HEAD_SHA:** `428c98bece43296dbebd9ce30c78cffe48541348`  
**STATUS:** P2 backend integrated; P1 exact post-sync CI pending; dedicated session E2E not yet invoked; PR stays Draft.


## P1 live resumption — local session-fixture guard + acceptance wiring audit — 2026-10-23T14:38:56.566Z

- LAST_COMPLETED_TASK_ID: `P1-DEVICE-SESSION-LOCAL-ENDPOINT-GUARD-CODE` (implementation committed; exact-head checks are not yet terminal).
- CURRENT_TASK_ID: `P1-DEVICE-SESSION-MGMT-UI-001`.
- CURRENT_BRANCH: `p1/central-device-session-ui-20261023`.
- BASE_SHA: `bd0d2df489e40b2dc5f83882d90565c7799a448c` (PR #88 base recorded by the live PR record; branch integrated P2 session contract through its main-sync commit).
- HEAD_SHA: `7a3bc8a3e952c021bf122e484416b12ba2a82379` — code/test head immediately before the resume-record commits below. The checkpoint/report updates are documentation-only and do not alter the tested code.
- LAST_CONFIRMED_TESTS: no terminal result is claimed for `7a3bc8a3e952c021bf122e484416b12ba2a82379`. Exact-head Core run [39971268285](https://github.com/Report-Engainall/Nasr1/actions/runs/39971268285) was IN_PROGRESS and P2 Playwright [39971268281](https://github.com/Report-Engainall/Nasr1/actions/runs/39971268281) was PENDING at readback. These must be rechecked on the final branch head. Predecessor Core/P2 results on `5f500eb2129f5745bb924beb06e6a4764ab9a0e0` do not validate the new guard/test.
- FAILED_OR_NOT_RUN_TESTS: exact-head Vitest/Core and isolated PostgreSQL/Chromium results remain pending. P2 job inspection on the predecessor run showed the local setup invokes `scripts/seed-p2-local-playwright.mjs`, followed by order/finance acceptance; it did not invoke `scripts/seed-p1-device-session-playwright.mjs` or select `e2e/device-session-management.spec.ts`. Therefore central-session browser acceptance is NOT PROVEN regardless of the generic P2 job conclusion. The hosted-account E2E remains subject to its explicit missing-credentials gate and is not counted as a pass.
- FILES_CHANGED in this implementation unit: `scripts/lib/p1-device-session-endpoints.mjs`, `scripts/lib/p1-device-session-endpoints.d.mts`, `scripts/seed-p1-device-session-playwright.mjs`, `src/test/p1-device-session-endpoints.test.ts`; prior PR #88 changes remain in `src/components/DeviceManagement.tsx`, `src/test/device-management.test.tsx`, `e2e/device-session-management.spec.ts`, and its isolated seed script.
- IMPLEMENTED: the seeder now validates through a pure local-only guard and allows PostgreSQL loopback ports `54322` (default local Supabase) and `55432` (the port configured by the current isolated P2 workflow), while still requiring the API on HTTP loopback port `54321`. Vitest coverage includes both allowed ports and rejects remote endpoints, unexpected ports, incorrect database paths, embedded API credentials, and malformed URLs.
- LOCKED_PATHS: `.github/workflows/p2-playwright-critical-paths.yml`, P2 migrations/RPC/RLS/API/generated DB types, finance/inventory/data-service paths, `package.json`, `bun.lock`, shared `docs/bolt-source-reconciliation/CURRENT_EXECUTION_STATE.md`, `WORK_COORDINATION.md`, and the shared acceptance matrix remain untouched.
- NEXT_ACTION: read terminal Core and P2 checks on the final #88 head; fix only evidenced failures. Coordinate with P2 to run the new P1 local seed and `e2e/device-session-management.spec.ts` within the isolated local Supabase/Chromium job (without P1 editing the P2-owned workflow). Do not mark browser proof or merge #88 until that exact session acceptance executes and passes after the contract is integrated.
- BLOCKER: P1 session browser spec/seeder are not wired into the current P2 workflow; this requires workflow-owner coordination. Current exact-head checks are pending. Hosted/external-account testing remains NOT RUN where credentials are absent.
- PR_URL: https://github.com/Report-Engainall/Nasr1/pull/88
- MERGE_STATUS: #88 Draft/open; keep Draft until exact-head Core plus actual session-management Chromium acceptance pass.
- UPDATED_AT: 2026-10-23T14:38:56.566Z


## Latest live readback — Core PASS; session browser acceptance still not proven — 2026-10-23T14:44:49.787Z

- LAST_COMPLETED_TASK_ID: `P1-DEVICE-SESSION-LOCAL-ENDPOINT-GUARD-CODE` — seeder now supports the isolated local PostgreSQL port with a fail-closed localhost boundary; the new Vitest guard coverage is included in Core.
- CURRENT_TASK_ID: `P1-DEVICE-SESSION-MGMT-UI-001`.
- CURRENT_BRANCH: `p1/central-device-session-ui-20261023`.
- BASE_SHA: `bd0d2df489e40b2dc5f83882d90565c7799a448c` (PR #88 base recorded by GitHub at latest readback).
- LAST_CODE_SHA: `7a3bc8a3e952c021bf122e484416b12ba2a82379`.
- EXACT_HEAD_CI_READBACK_SHA: `b611b293ffc62e8f078fb3586148023ab6038aa5` (current PR #88 head before this status-note commit; contains no code changes after LAST_CODE_SHA).
- LAST_CONFIRMED_TESTS: Core CI [run 39971452491](https://github.com/Report-Engainall/Nasr1/actions/runs/39971452491) **SUCCESS** on exact head `b611b293...`; this includes the unit test suite containing `src/test/p1-device-session-endpoints.test.ts`, build and configured Core gates. It does not establish the new session-management Chromium acceptance.
- FAILED_OR_NOT_RUN_TESTS: P2 Playwright [run 39971452473](https://github.com/Report-Engainall/Nasr1/actions/runs/39971452473) was still **IN_PROGRESS** at readback. Jobs: authenticated external-account gate SUCCESS; public UI smoke SUCCESS; hosted-account customer-order job SKIPPED due its explicit credentials gate; isolated local Supabase order/tenant job IN_PROGRESS at “Start isolated local Supabase services”. This workflow does not invoke `scripts/seed-p1-device-session-playwright.mjs` or `e2e/device-session-management.spec.ts`, so central-session browser acceptance is **NOT PROVEN**, regardless of the generic P2 job's eventual result.
- FILES_CHANGED since code SHA: only this checkpoint/report status bookkeeping. Code change files remain `scripts/lib/p1-device-session-endpoints.mjs`, `scripts/lib/p1-device-session-endpoints.d.mts`, `scripts/seed-p1-device-session-playwright.mjs`, `src/test/p1-device-session-endpoints.test.ts`, alongside pre-existing #88 UI/browser files.
- LOCKED_PATHS: P2-owned `.github/workflows/p2-playwright-critical-paths.yml`, migrations/RPC/RLS/API/generated DB types, finance/inventory/services, `package.json`, `bun.lock`, shared `CURRENT_EXECUTION_STATE.md`, `WORK_COORDINATION.md`, shared acceptance matrix remain untouched.
- NEXT_ACTION: P2 must wire the P1 seed and the two `device-session-management.spec.ts` tests into the isolated local Supabase/Chromium job after environment export/app startup. Handoff comment recorded on #88 as [comment 6367467756](https://github.com/Report-Engainall/Nasr1/pull/88#issuecomment-6367467756). Then run Core + this exact browser acceptance on the new head; only promote #88 after the session tests truly execute and pass.
- BLOCKER: missing session-specific browser invocation in P2-owned workflow; this P1 branch cannot edit that locked file without ownership transfer. External hosted-account E2E remains NOT RUN/SKIPPED, not PASS.
- PR_URL: https://github.com/Report-Engainall/Nasr1/pull/88
- MERGE_STATUS: #88 OPEN / DRAFT / NOT MERGE-READY.
- INDEPENDENT_NEXT_CANDIDATE: PR #96 storefront admin-navigation gate has Core/P2 success on its exact head `844aebd2c63a479b02d5bb17c08d06180bd64f3d`, but its base is one main commit behind and it edits the same checkpoint/report files as #88. Do not merge it until it is brought onto current main, re-tested, and the shared documentation overlap is reconciled.
- UPDATED_AT: 2026-10-23T14:44:49.787Z


## P1 live execution — revoked JWT expiry guard added to session browser acceptance — 2026-10-23T17:46+03:00

**Task:** `P1-SESSION-E2E-UNEXPIRED-JWT-001`  
**Repository / branch:** `Report-Engainall/Nasr1` / `p1/central-device-session-ui-20261023`  
**PR:** [#88 — server-backed central device session controls](https://github.com/Report-Engainall/Nasr1/pull/88)  
**Base SHA:** `bd0d2df489e40b2dc5f83882d90565c7799a448c`  
**Functional code/test SHA before this docs-only commit:** `916f68fbb362c6d430efbef294391155e601c156`

### Implemented in this unit
- Strengthened the existing `expectProtectedTenantRpcDenied` assertion instead of creating a separate browser test.
- Both targeted administrative revocation and self-scoped sibling-session revocation now pass their expected session IDs into the protected-request check.
- The browser check decodes only `session_id` and `exp` from the access token in local storage, verifies the ID matches the exact revoked session, and captures the current epoch time just before the protected tenant-context RPC.
- The assertion requires the JWT expiry to be later than the request start and still later than the time after the rejected response. The token itself is not logged or returned by the browser helper.

### Exact-head evidence
- Previous head `b611b293ffc62e8f078fb3586148023ab6038aa5`: Core [39971452491 SUCCESS](https://github.com/Report-Engainall/Nasr1/actions/runs/39971452491); P2 Playwright [39971452473 SUCCESS](https://github.com/Report-Engainall/Nasr1/actions/runs/39971452473). These runs predate this new assertion.
- New functional/test SHA `916f68fbb362c6d430efbef294391155e601c156`: Core and P2 status were not yet terminal/available at the time of this entry. No PASS is inferred from predecessor runs.
- Important boundary: P2 run #39971452473 succeeded for the existing configured local PostgreSQL/Chromium tests (order/tenant, returns/credit memo, Onyx XLSX and finance/task print), but the workflow did not invoke `scripts/seed-p1-device-session-playwright.mjs` or `e2e/device-session-management.spec.ts`. Therefore targeted session revocation and same-token post-revocation denial remain NOT_PROVEN.

### Ownership and next action
- P1 left `.github/workflows/p2-playwright-critical-paths.yml` and all P2-owned SQL/RPC/RLS/Auth/API/type paths unchanged.
- P1 posted the implementation/acceptance handoff to P2 on [PR #83 comment 6367496372](https://github.com/Report-Engainall/Nasr1/pull/83#issuecomment-6367496372), asking P2 to wire the existing seed and both session-spec tests into the isolated local Supabase/Chromium job.
- Next: read the exact live branch SHA and its Core/P2 workflow results; fix any failure evidenced at that SHA. Keep #88 Draft until the dedicated scenario actually runs and passes. Hosted-account/production proof remains NOT RUN.

**Status:** `IMPLEMENTED — CI PENDING — SESSION BROWSER ACCEPTANCE NOT PROVEN — PR DRAFT`  
**UPDATED_AT:** 2026-10-23T17:46+03:00


## P1 live CI readback — updated session expiry assertions; dedicated session spec remains unexecuted — 2026-10-23T17:52+03:00

- LAST_COMPLETED_TASK_ID: `P1-SESSION-E2E-UNEXPIRED-JWT-001` (the browser spec now asserts the exact revoked session ID and an unexpired JWT at request start and after denial).
- CURRENT_BRANCH: `p1/central-device-session-ui-20261023`.
- BASE_SHA: `bd0d2df489e40b2dc5f83882d90565c7799a448c`.
- FUNCTIONAL_HEAD_SHA: `916f68fbb362c6d430efbef294391155e601c156`.
- LAST_CONFIRMED_TESTS: Core [39972851057 SUCCESS](https://github.com/Report-Engainall/Nasr1/actions/runs/39972851057) and P2 [39972851031 SUCCESS](https://github.com/Report-Engainall/Nasr1/actions/runs/39972851031) both ran on exact pre-status documentation head `37be3a6ae29be70cc87d8e7a4c236a460e215d5d`, which includes functional SHA `916f68f...`. Core unit tests, PostgreSQL 17 migrations/acceptance, lint/build/preview/dev smoke, and configured price-visibility Chromium checks passed. P2 public UI smoke and the configured isolated local Supabase job succeeded; hosted customer-order/tenant isolation was explicitly skipped by its external-infrastructure gate.
- FAILED_OR_NOT_RUN_TESTS: the session-specific `e2e/device-session-management.spec.ts` remains **NOT RUN** by the P2 workflow, which still invokes only the configured commerce critical-path/returns/Onyx/finance specs. Generic Playwright success is not central-session acceptance.
- FILES_CHANGED: `e2e/device-session-management.spec.ts`; this checkpoint/report update is documentation-only. The E2E spec now checks that the exact expected `session_id` is present and that `exp` exceeds both the protected-request start time and the time after its denied response.
- LOCKED_PATHS: `.github/workflows/p2-playwright-critical-paths.yml`, P2 seed/workflow and SQL/RPC/RLS/API/type/finance paths, shared `CURRENT_EXECUTION_STATE.md`, `WORK_COORDINATION.md`, shared acceptance matrix, and P3 #89 paths. No locked paths edited.
- NEXT_ACTION: P2 must add `scripts/seed-p1-device-session-playwright.mjs` plus both tests from `e2e/device-session-management.spec.ts` to the existing isolated local Supabase/Chromium job, after DB setup and environment export. Re-read the exact final SHA/run and require targeted same-tenant revocation → protected RPC denial with still-unexpired token, plus self-scoped bulk revoke retaining current session and denying sibling session. The request is recorded at [#83 comment 6367739971](https://github.com/Report-Engainall/Nasr1/pull/83#issuecomment-6367739971).
- BLOCKER: missing session-specific invocation is P2-owned; hosted/production E2E remains NOT RUN.
- PR_URL: https://github.com/Report-Engainall/Nasr1/pull/88
- MERGE_STATUS: OPEN / DRAFT / NOT MERGE-READY.
- UPDATED_AT: 2026-10-23T17:52+03:00


## P1 live readback — stricter revoked-JWT denial assertion; related PR checkpoints — 2026-10-23T14:55:38.344Z

- LAST_COMPLETED_TASK_ID: `P1-SESSION-E2E-UNEXPIRED-JWT-001` — the browser helper now verifies the exact revoked `session_id`, proves `exp` remains later than request start and response, and requires HTTP **403** from the current tenant-authorization RPC. This removes the prior false-positive path that accepted any server 5xx as successful revocation denial.
- CURRENT_TASK_ID: `P1-DEVICE-SESSION-MGMT-UI-001`.
- CURRENT_BRANCH: `p1/central-device-session-ui-20261023`.
- BASE_SHA: `bd0d2df489e40b2dc5f83882d90565c7799a448c` as recorded by PR #88; live `main` pointer last read at `75ef8774917e25f11c328568bc316330546aefba`.
- HEAD_SHA: `87ecae031fd78caccd9fe5710ed66f5e6b61b3ba` (current code head before this checkpoint/report update; the just-added 403 assertion is included).
- LAST_CONFIRMED_TESTS: predecessor head `b611b293...` Core SUCCESS [39971452491](https://github.com/Report-Engainall/Nasr1/actions/runs/39971452491); that predecessor does **not** validate the newer JWT-expiry/403 assertion. The prior functional head `916f68f...` also predates the HTTP-403 tightening.
- FAILED_OR_NOT_RUN_TESTS: exact-head Core run [39973709057](https://github.com/Report-Engainall/Nasr1/actions/runs/39973709057) is IN_PROGRESS; P2 run [39973708325](https://github.com/Report-Engainall/Nasr1/actions/runs/39973708325) is PENDING. The P2 workflow currently on live `main` blob `1b2b0eade154b8b4e8ed0bed0fa9b7067b5666b7` still contains neither `scripts/seed-p1-device-session-playwright.mjs` nor `e2e/device-session-management.spec.ts`; no dedicated session-browser proof is claimed. The prior P2 local database job eventually ran other commerce scenarios only; the hosted customer-order job remained SKIPPED and is not PASS.
- FILES_CHANGED: `e2e/device-session-management.spec.ts` (HTTP result must now be 403, not arbitrary >=400); the local endpoint helper/seeder/tests from the preceding unit remain included in the branch. This update modifies only the two P1 resumption documents.
- LOCKED_PATHS: do not edit `.github/workflows/p2-playwright-critical-paths.yml`, P2 migrations/RPC/RLS/API/generated types, finance/inventory service files, `package.json`, `bun.lock`, `CURRENT_EXECUTION_STATE.md`, `WORK_COORDINATION.md`, or the common acceptance matrix.
- NEXT_ACTION: read terminal Core/P2 on the new code head, then obtain P2's wired session test in a later head. The current workflow-owner handoff is recorded on #88 [comment 6367467756](https://github.com/Report-Engainall/Nasr1/pull/88#issuecomment-6367467756) and P2 was also notified on #83 [comment 6367496372](https://github.com/Report-Engainall/Nasr1/pull/83#issuecomment-6367496372). Keep #88 Draft until the targeted two-test Chromium suite executes and passes.
- INDEPENDENT PR #96: branch head `f831033690a524779fc3fafab0bf6269494240f2` is now a normal merge commit including live main `75ef877...`; compare from current main shows only `src/components/Storefront.tsx` and `src/test/storefront-admin-navigation-access.test.ts`. Core [39973108364 SUCCESS](https://github.com/Report-Engainall/Nasr1/actions/runs/39973108364). P2 [39973108292](https://github.com/Report-Engainall/Nasr1/actions/runs/39973108292) is still IN_PROGRESS on the isolated local Supabase job; the external customer-order job is SKIPPED. Do not merge until this P2 run reaches a terminal conclusion and current main/head are rechecked.
- INDEPENDENT PR #97: the implementation head `ed4ee7ad...` passed Core `39972341560` and P2 `39972341569`, but documentation-only head `a2372eed...` started newer runs `39973415690` and `39973415713`; those results must be read on the latest head before merge. It is Draft and behind live main by one commit; synchronize and remove shared checkpoint/report changes from its final diff before merging.
- PR_URL: https://github.com/Report-Engainall/Nasr1/pull/88
- MERGE_STATUS: #88 OPEN / DRAFT / NOT MERGE-READY. No P1 merge performed on stale or insufficient session-browser evidence.
- UPDATED_AT: 2026-10-23T14:55:38.344Z


## Active resume — P2 workflow integrated; run real central-session browser acceptance — 2026-10-23T18:05+03:00

- LAST_COMPLETED_TASK_ID: `P1-SESSION-JWT-EXPIRY-ASSERTIONS-CODE-001` — the browser spec now checks exact revoked `session_id`, expiry later than request start, expiry still in the future after the denied RPC, and HTTP 403.
- CURRENT_TASK_ID: `P1-DEVICE-SESSION-MGMT-001`.
- CURRENT_BRANCH: `p1/central-device-session-ui-20261023`.
- BASE_SHA: `f9beca0553fc7e546415b42b83274898fcf9449a` (latest main before this merge commit; includes merged P2 PR #82 and its conditional session-spec runner).
- PRE_SYNC_HEAD_SHA: `1267f76ba825f739372a5e05dd5efc7cc165250b`.
- LAST_CONFIRMED_TESTS: Core [39973840052 SUCCESS](https://github.com/Report-Engainall/Nasr1/actions/runs/39973840052) and P2 [39973840047 SUCCESS](https://github.com/Report-Engainall/Nasr1/actions/runs/39973840047) on the pre-sync head `1267f76ba825f739372a5e05dd5efc7cc165250b`. These prove configured Core/browser checks only; session-specific seed/spec was skipped because the P2 workflow update had not yet reached main at that run.
- FAILED_OR_NOT_RUN_TESTS: the dedicated `e2e/device-session-management.spec.ts` remains NOT PROVEN until the newly integrated runner actually executes both session tests. P2 PR #82's own Core + customer-manager authorization/financial privacy/audit Chromium acceptance passed on `4437526cebed13717bd71c084df447696b18183a`; its conditional P1 session steps skipped on #82 because P1-owned seed/spec files were absent from that PR.
- FILES_CHANGED: P1 session UI/E2E/fixture guard files from the prior #88 head plus these reconciled checkpoint/report ledgers. Current main copies of P2-owned workflow, migrations/RPC/RLS/Auth/API/types/finance paths are preserved unchanged.
- LOCKED_PATHS: `.github/workflows/p2-playwright-critical-paths.yml`, P2 seed/workflow and SQL/RPC/RLS/Auth/API/type/finance paths, shared `CURRENT_EXECUTION_STATE.md`, `WORK_COORDINATION.md`, shared acceptance matrix, and P3-owned #89 paths. Do not edit these.
- NEXT_ACTION: verify this merge commit becomes the #88 branch head; then inspect exact-head Core + P2 runs. The steps `Seed P1 local device-session fixtures when the session acceptance suite is present` and `Run central device-session authorization and immediate-revocation Chromium acceptance` must be non-skipped and successful. If they fail, inspect artifacts/logs and fix only P1-owned code/fixture/spec. Keep #88 Draft until both dedicated scenarios pass, then verify the live base again before any merge.
- BLOCKER: integrated session browser proof pending on the freshly synced head. Hosted-account E2E remains explicitly skipped without its external credentials.
- PR_URL: https://github.com/Report-Engainall/Nasr1/pull/88
- MERGE_STATUS: OPEN / DRAFT / NOT MERGE-READY until exact integrated session acceptance passes.
- UPDATED_AT: 2026-10-23T18:05+03:00


## P1 live test correction — session E2E row selection was ambiguous — 2026-10-23T18:14+03:00

**Head under test:** `d7def4dcf2b714a9a1d9ef0643fc32923cf52e5d`  
**P2 run:** [39975835151](https://github.com/Report-Engainall/Nasr1/actions/runs/39975835151)  
**Core run:** [39975835128](https://github.com/Report-Engainall/Nasr1/actions/runs/39975835128)  
**Failure:** Playwright strict-mode violation at test locators using `page.locator("article")`. The current-session summary is itself an article, while the server-backed organization session list contains row articles under a separate labelled section. The locator matched multiple nested articles, so both scenarios failed before revocation behavior was reached. No backend authorization failure has yet been demonstrated.

**Correction:** scope the session-row locators to `section[aria-labelledby="organization-session-list-title"] article` for target, current and sibling records. This changes only the P1-owned spec. The fixture seed succeeded (`P1_DEVICE_SESSION_FIXTURES_READY localOnly=true adminRole=true sameTenantManagerTarget=true credentialsMasked=true`); the session assertion must now be rerun on the new SHA.

**Status:** `ROOT CAUSE CONFIRMED — LOCATOR FIX IMPLEMENTED — RETEST PENDING`  
**Next:** inspect new exact-head Core and P2 runs; require P1 seed + central session Chromium tests to conclude success before making #88 ready.  
**UPDATED_AT:** 2026-10-23T18:14+03:00


## P1 live test follow-up — avoid ambiguous manager sessions after retries — 2026-10-23T18:17+03:00

The first integrated test reached the P1 seed step successfully, then both scenarios failed at test-row selection before invoking revoke RPCs. Scoping to the labelled organization-session list removed the parent/child article ambiguity, but the target manager may have several session records left by prior attempts. The target row now keys on `revokedSessionId.slice(0, 8)` captured from that specific browser session; confirmation still checks the target email. This prevents duplicate same-profile sessions from producing a broad match.

**Status:** `TEST LOCATOR ROOT CAUSE REFINED — EXACT SESSION ID SELECTOR COMMITTED — RETEST PENDING`  
**Next:** inspect the new exact-head run; do not infer backend behavior from the previous pre-revocation locator failures.  
**UPDATED_AT:** 2026-10-23T18:17+03:00



## Active resume — latest main sync; session row matching refined — 2026-10-23T18:20+03:00

- LAST_COMPLETED_TASK_ID: `P1-SESSION-LOCATOR-FIX-002` — target row selection uses the captured target `session_id` prefix within the server-backed session-list section, avoiding nested `article` and same-email historic-session collisions.
- CURRENT_TASK_ID: `P1-DEVICE-SESSION-MGMT-001`.
- CURRENT_BRANCH: `p1/central-device-session-ui-20261023`.
- BASE_SHA: `78d8492a14ef025f53c8b669e44d622d95de525a` (latest main before this merge commit; includes P2 conditional session-test workflow and merged P2 authorization acceptance).
- PRE_SYNC_HEAD_SHA: `d7d850783ff61f6dfc525f50bf183c9e89e6f4e1`.
- LAST_CONFIRMED_TESTS: Core #39975835128 SUCCESS. P2 #39975835151 reached the P1 session test; the seed passed, but the spec failed before revocation because the selector matched multiple nested/session rows. The exact-session-ID selector was committed afterward and has not yet run.
- FILES_CHANGED: P1 session UI/E2E/fixture guard plus reconciled checkpoint/report. Main's role-settings test and P2 workflow/backend paths remain unchanged.
- LOCKED_PATHS: P2 workflow, seed, migrations/RPC/RLS/Auth/API/types/finance; shared `CURRENT_EXECUTION_STATE.md`, `WORK_COORDINATION.md`, acceptance matrix, and P3 #89 paths.
- NEXT_ACTION: inspect fresh exact-head CI; confirm P1 seed + session spec execute and both security scenarios pass through real revocation and still-unexpired-token denial. Fix only P1-owned code based on logs. Keep #88 Draft until proven.
- BLOCKER: integrated session acceptance rerun.
- PR_URL: https://github.com/Report-Engainall/Nasr1/pull/88
- MERGE_STATUS: OPEN / DRAFT.
- UPDATED_AT: 2026-10-23T18:20+03:00
