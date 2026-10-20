# تقرير الحالة التنفيذي — المبرمج 1 / دمج ميزات المصادر الثلاثة

- **المستودع الوحيد المستهدف:** `Report-Engainall/Nasr1`
- **فرع P1 المستمر:** `integration/inventory-transfer-batches-20261019-rebased`
- **الملكية:** هذا التقرير و`SOURCE_INTEGRATION_LEDGER.csv` و`READY_TO_REUSE_FILE_AUDIT.csv` فقط.
- **المهمة الحالية:** `NASR1-SOURCE-SERVICE-WORKER-CACHE-BOUNDARY-001` — أضيف اختبار انحدار لحدود التخزين المؤقت في PWA على فرع P1 المستمر؛ سجل المصدر وسجل التدقيق محدّثان، والاختبار **بانتظار CI على الرأس النهائي** قبل الدمج.
- **المهمة التالية بعد إغلاق المهمة الحالية:** `NASR1-SOURCE-CUSTOMER-LIFECYCLE-PARITY-001` — مقارنة تفعيل حساب العميل ودورة دعواته في `src/CustomerActivation.tsx` و`src/CustomerPanel.tsx` و`src/services/customerInvitations.ts` مع مسارات Nasr1 الحالية؛ تكييف النقص المثبت فقط دون استيراد عقد الجداول القديمة.

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

## 5. الحالة الفعلية لسجلات المصدر

- `SOURCE_INTEGRATION_LEDGER.csv`: **116 صف بيانات** على فرع P1 بعد توثيق قرارات الدمج لهذه الجولة.
- `READY_TO_REUSE_FILE_AUDIT.csv`: **78 صف تدقيق** على فرع P1؛ أضيف قرار صريح لملف تصدير الكتالوج المانح.
- الصفوف المضافة تغطي مصدر معالج الصور واختباره، وقرار تكرار طابور offline واختباره. جميع البصمات المنقولة من الشجرة المانحة مسجلة؛ لم نعد فتح أي source blob كان له قرار مسجل.
- المراجعة الحالية سجلت 78 صفًا في audit؛ لا يعني ذلك إغلاق جميع ملفات المستودعات المانحة، بل تُواصل مراجعة العناصر المتبقية.
- المهمة الجارية `NASR1-SOURCE-SERVICE-WORKER-CACHE-BOUNDARY-001` ما تزال `IMPLEMENTED_PENDING_EXACT_SHA_CI` حتى ينجح CI على رأس PR النهائي. المهمة التالية هي `NASR1-SOURCE-CUSTOMER-LIFECYCLE-PARITY-001`.

## 5.1. مراجعة حدود PWA وتكافؤ تصدير الكتالوج — 2026-10-20

- **حدود Service Worker:** مصدر المانح Report-Engainall/aghbari-commerce@00d7446bba9652ea40178a08b00c9da9a2bba8a1، public/sw.js، blob 53936f83f2340c0e2d450edaa20db85619e8cf01. استُخدم كمرجع مقارنة فقط؛ عامل المانح يسمح بتخزين استجابات تنقل أوسع، لذا لم يُنسخ.
- **تنفيذ Nasr1 المحتفظ به:** public/sw.js blob 166e449316349394e8870cb14f90067893a0dd24 لا يخزّن التنقلات العميقة، ويستبعد مسارات auth/rest/api/rpc/storage/functions، ولا يقبل إلا GET من نفس الأصل للتخزين، مع قصر التنقل على shell الجذر وقائمة موارد ثابتة واضحة.
- **اختبار جديد:** src/test/service-worker-cache-boundary.test.ts يثبت تلك الحدود بالإضافة إلى تنظيف cache الخاص بنطاق التطبيق فقط. لا تغييرات schema/RPC/RLS ولا dependency جديدة. الحالة: **IMPLEMENTED — CI PENDING**؛ browser/production لم يُشغّلا.
- **تكافؤ تصدير الكتالوج:** Report-Engainall/aghbari-commerce/src/ExportPanel.tsx blob 3526a3232cce9159ab6554797e7afa8f49f7129e يستخدم مخطط SKU/tiers قديمًا. Nasr1 يملك PricingGrid وprice-grid-csv.ts وprice-grid-xlsx.ts على المخطط الحالي، ويصدّر أربع شرائح أسعار وملخص المخزون مع تهريب حقن الصيغ وحدود للحجم؛ لذلك سُجّل القرار ALREADY_PRESENT_BETTER دون نسخ مكوّن مانح.
- **المراجع الحية بعد إكمال توثيق P1:** ledger = 116 صف بيانات، audit = 78 صفًا. لا يثبت هذا حصر كل ملفات المستودعات المانحة؛ تُستكمل مراجعة النواقص حسب next task أعلاه.

## 6. حدود الدور

- الهدف الوحيد `Report-Engainall/Nasr1`. المستودعات الثلاثة للقراءة والمقارنة فقط.
- لا أتعامل مع ZIPs/الأرشيف أو استكمال المواصفة الأصلية المستقل.
- لا أعدّل `WORK_COORDINATION.md` أو `CURRENT_EXECUTION_STATE.md` أو `EXECUTION_LOG.md` أو بيانات الأرشيف.
- لا كتابة مباشرة على main، لا force-push/reset/clean، لا إنشاء فرع لكل جلسة، لا أسرار أو خدمات مدفوعة، ولا ادعاء PASS بلا رابط ورأس مطابق.
