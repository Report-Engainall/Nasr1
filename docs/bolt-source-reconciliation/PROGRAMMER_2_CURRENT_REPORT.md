# تقرير الاستئناف — المبرمج 2 (دمج المصدر)

**آخر تحديث موثق:** 2026-10-19  
**الهدف:** Report-Engainall/Nasr1 — التسليم إلى main عبر PR فقط.

## المهمة الحالية الوحيدة
NASR1-SOURCE-INTEGRATION-INV-TRANSFER-001: إصلاح CI في PR #3 لميزة تحويل دفعة متعددة الأصناف، ثم دمجها بعد إثبات كامل.

## خط الأساس والأدلة الموجودة
- main HEAD عند إعداد هذا التقرير: 0c089585d27665680dcc4ad2520dd4affc875804؛ CI [39311791227 — SUCCESS](https://github.com/Report-Engainall/Nasr1/actions/runs/39311791227) على SHA مطابق.
- PR #3 source integration: [الرابط](https://github.com/Report-Engainall/Nasr1/pull/3)، branch integration/inventory-transfer-batches-20261019-rebased، head bf31eea06d020955b0912d252087c72f98e023f5، CI [39314953094 — FAILURE](https://github.com/Report-Engainall/Nasr1/actions/runs/39314953094).
- الفشل الحالي المؤكد: PostgresError permission denied for table inventory_transfer_batches؛ العملية المسجلة select line_count,payload,organization_id from public.inventory_transfer_batches where id=$1::uuid. حدث لأن اختبار الفحص يقرأ الجدول بينما دور authenticated نشط. لا تغيّر grants/RLS لتجاوز الاختبار.
- الإصلاح المطلوب: بعد نتيجة RPC، نفّذ reset role ثم أجرِ assertions التي تحتاج اتصال الاختبار المميز. لتأكيد منع القراءة المباشرة، فعّل authenticated فقط حول expectFailure(select ... inventory_transfer_batches) ثم نفّذ reset role بعدها. كرر النمط نفسه حول RPC replays/requests التي يجب أن تعمل كمستخدم authenticated. أعد CI كاملًا بعد الإصلاح.
- PR #2 الأقدم: [الرابط](https://github.com/Report-Engainall/Nasr1/pull/2)، branch integration/inventory-transfer-batches-20261019، head 54a6db0bf1da4db579092cc0d596dd0016d7e394. مسار أقدم متداخل، ويستخدم اسم migration قديم 20261019220000_inventory_transfer_batches.sql. لا تدمجه؛ قارن الفروق مرة واحدة وانقل الفريد فقط قبل إغلاقه.
- PR #4 Accounting General Ledger ملك المبرمج 1: [الرابط](https://github.com/Report-Engainall/Nasr1/pull/4)، head a1ff5fc9a4c2486bc9cb51e8370d3bde35eccccd، CI [39315048042 — SUCCESS](https://github.com/Report-Engainall/Nasr1/actions/runs/39315048042). لا تعدل ملفاته/فرعه.
- المصدر الذي تم فتحه فعليًا: Report-Engainall/aghbari-commerce@00d7446bba9652ea40178a08b00c9da9a2bba8a1، path src/services/inventory.ts، blob 3506707a656e0db491b860d5e11ad28daeded5cf. نسخة READY_TO_REUSE staged المطابقة لها نفس blob. استخدم السجل؛ لا تعِد جلب المصدر أو فتحه.
- سبق جلب محتويات InventoryTransferHistoryPage.tsx وapi.ts وrouteTree.gen.ts وAghbariApp.tsx وملفات SQL والاختبارات والـworkflow ذات الصلة. لا تكرر جلب محتواها ما دامت blobs نفسها.
- في محاولة CI أقدم فشل SHA بسبب fragment SQL مكرر بعد نهاية الدالة (syntax error عند THEN/unterminated string)؛ تمت إزالة الجزء المكرر في commit cb005140efdcd3289e5e8c228ef72d0828c3a8dd. لا تعِد تشخيص هذا الخطأ ما لم يظهر في SHA جديد.

## التصميم الذي يجب الحفاظ عليه
- RPC منفصل transfer_inventory_batch؛ لا تغيّر signature أو contract RPC الأصلي ذي المنتج الواحد transfer_inventory.
- ذرّية لكل الدفعة، تحقق المؤسسة/الموظف/المستودعات/الأصناف، حماية حجوزات الكمية، منتجات فريدة، كمية حتى 3 منازل عشرية، idempotency/replay/conflict، movement pair لكل صنف، audit log، وقراءة عبر list_inventory_transfer_history محدودة بـ500 ومقيدة بالمؤسسة الحالية.
- لا تمنح authenticated SELECT مباشرًا على inventory_transfer_batches. واجهة السجل تستدعي list_inventory_transfer_history فقط.

## بعد دمج ميزة النقل
- استكمل أول عنصر غير محسوم في READY_TO_REUSE_FILE_AUDIT.csv/PROVENANCE_MANIFEST.csv؛ لا تعِد بحث manifest/trees أو الملف صاحب blob المطابق. افحص فقط الأدلة الناقصة أو blob المتغير، وادمج/كيّف الفائدة المثبتة التي لا توجد في Nasr1.
- أنت وحدك تعدل SOURCE_INTEGRATION_LEDGER.csv وREADY_TO_REUSE_FILE_AUDIT.csv وPROGRAMMER_2_CURRENT_REPORT.md. لا تعدل الحالة التنفيذية أو سجل الأحداث؛ سلّم P1 ملخص دليل ليضيفه.
- next_source_task_id واحد فقط: NASR1-SOURCE-INTEGRATION-INV-TRANSFER-001 حتى ينجح CI ويدمج المصدر على main. لا تبدأ ميزة أخرى قبل ذلك.

## عند كل حفظ
اكتب base/head SHA وblob/path لكل مصدر، تغيير الكود، أمر الاختبار، النتيجة الفعلية، رابط CI المطابق، الفشل الذي تم إصلاحه، والـnext_source_task_id. الفحص أو التقرير وحده ليس إنجازًا.
