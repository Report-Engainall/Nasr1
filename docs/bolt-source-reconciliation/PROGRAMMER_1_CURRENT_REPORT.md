# تقرير الاستئناف — المبرمج 1 / دمج ميزات المصادر الثلاثة

المستودع الهدف الوحيد: `Report-Engainall/Nasr1`
فرع المبرمج 1 المستمر: `integration/inventory-transfer-batches-20261019-rebased`
ملكية التقرير: المبرمج 1 فقط.
**task الحالي / next_source_task_id:** `NASR1-SOURCE-INTEGRATION-INV-TRANSFER-001` — لا تنتقل إلى مهمة مصدر أخرى حتى ينجح CI على رأس PR #3 نفسه ويُغلق هذا المصدر.

## الحالة الحية — تحقق بالـmetadata فقط

- `main` آخر رأس معروف: `0c089585d27665680dcc4ad2520dd4affc875804`; CI الأساس التاريخي: [39311791227](https://github.com/Report-Engainall/Nasr1/actions/runs/39311791227).
- PR #3: [feat(inventory): integrate atomic multi-product transfers and history](https://github.com/Report-Engainall/Nasr1/pull/3).
- الرأس الحي لـPR #3: `19ffe4e2062f860bef63af9064fb5f15d226d76c` (تحديث تقرير فقط). آخر رأس يغيّر كود/سجل الجرد هو `0bd0aaeba2e581e938bbb8fd6d1a14ac2893c33c`; فحصه المطابق [Actions 39321850629](https://github.com/Report-Engainall/Nasr1/actions/runs/39321850629) انتهى FAILURE: Unit tests SUCCESS، PostgreSQL 17 FAILURE عند الاستعلام المباشر تحت authenticated على `inventory_transfer_batches`. لا يجوز وصف هذا الرأس أو PR بأنه PASS.
- CI على الرأس السابق `b715d67d4e7f30a8e874465bf963ca6580c298d0`, [Actions 39321185653](https://github.com/Report-Engainall/Nasr1/actions/runs/39321185653): خطوة Unit tests = SUCCESS، **44/44 test files و332/332 tests PASS**؛ خطوة PostgreSQL 17 فشلت عند اختبار دفعة التحويل. لذلك لا يوجد CI PASS كامل على PR #3.
- PR #2 المكررة [مغلقة دون دمج](https://github.com/Report-Engainall/Nasr1/pull/2) بعد مقارنة الملفّات والفروق. PR #3 هي PR الدمج الوحيدة المستمرة للتحويل متعدد الأصناف.


## تحديث جرد READY_TO_REUSE — 19 أكتوبر 2026

- أُعيد استخدام قرارات `SOURCE_INTEGRATION_LEDGER.csv` وبصمات المصدر الموجودة لتسوية جميع صفوف `READY_TO_REUSE_FILE_AUDIT.csv` التي كانت تستخدم تسميات عامة `TARGET_PATH_MISSING_REVIEW_CONTENT` أو `TARGET_PATH_DIFFERS_REVIEW_CONTENT`. لم تُفتح مجددًا ملفات مانحة ذات blob مسجل، ولم يُعاد جلب أي مصدر مطابق.
- تدقيق الجرد قبل هذا التحديث: 69 صفًا. تم تحديث 60 صفًا، منها 7 صفوف من مستودع رابع غير داخل نطاق المصادر الثلاثة الحالية؛ وُسمت `KEEP_AS_REFERENCE` مع سبب صريح يمنع دمجها أو إعادة قراءة محتواها. بقية الصفوف استندت إلى القرار الموثق مسبقًا في ledger: إبقاء أفضل تنفيذ مستهدف، تكرار مثبت، مرجع فقط، تكييف ودمج، أو استبعاد لتعارض schema/أمان.
- البصمات: audit قبل التحديث `afbfeafd19c0e28b1448346daa43745ac15121f0`; commit التحديث `0bd0aaeba2e581e938bbb8fd6d1a14ac2893c33c`; blob النهائي `7e9b23bf15409324a742763426fdfd598d1dcd26`. التحقق المباشر بعد الكتابة أكد 69 صف بيانات و0 صفوف بقيت بتسميتي المراجعة العامتين.
- لم يُعدّل `SOURCE_INTEGRATION_LEDGER.csv`: ما زال PR #4 يتضمن تغييرات هذا الملف المملوك لـP1؛ الطلب إلى P2 بإزالة هذا التعارض موثق في [PR #4](https://github.com/Report-Engainall/Nasr1/pull/4). لا تحفظ فوق عمل متزامن.

## مصدر التحويل متعدد الأصناف — المهمة الحالية غير مغلقة

- المصدر: `Report-Engainall/aghbari-commerce@00d7446bba9652ea40178a08b00c9da9a2bba8a1`, `src/services/inventory.ts`, source blob `3506707a656e0db491b860d5e11ad28daeded5cf`. بصمة المصدر موثقة سابقًا؛ لم يُعد فتح الملف المانح.
- الميزة المتكاملة في فرع PR #3: `supabase/migrations/20261019240000_inventory_transfer_batches.sql`, `src/lib/inventory-transfer-batch.ts`, `src/components/InventoryTransferHistoryPage.tsx`, `src/routes/admin_.inventory-transfers.tsx`, `src/routeTree.gen.ts`, `src/test/inventory-transfer-batch.test.ts`, `src/test/inventory-transfer-history.test.tsx`, وأجزاء API/navigation/CI.
- العقد: RPC منفصل `transfer_inventory_batch` دون تغيير توقيع `transfer_inventory` الأحادي؛ تحقق مؤسسة/موظف نشط من الخادم، مخازن/منتجات فعّالة، row locks حتمية، حماية الكمية المحجوزة، idempotency مرتبط بحمولة الطلب، حركات مخزون مزدوجة وسجل تدقيق، وRPC سجل تحويلات محدود ومقيد بالمؤسسة.
- فشل قاعدة البيانات المثبت في [Actions 39314953094](https://github.com/Report-Engainall/Nasr1/actions/runs/39314953094): سكربت القبول يستدعي `select line_count,payload,organization_id from public.inventory_transfer_batches where id=$1::uuid` بينما `SET ROLE authenticated` ما يزال فعالًا. القراءة مقصودة لفحص fixture المميّز، لكنها في الدور الخطأ. اختبار الرفض اللاحق الذي يتوقع `permission denied` يجب أن يبقى.
- الإصلاح الدقيق سُلّم لمالك المسار المشترك P2 في [تعليق PR #4](https://github.com/Report-Engainall/Nasr1/pull/4#issuecomment-6276449060) و[تعليق التسلسل](https://github.com/Report-Engainall/Nasr1/pull/4#issuecomment-6276488796): reset role قبل القراءة المميزة، ثم إعادة هوية admin ودور authenticated قبل negative test. لا تُضاف grants أو policies ولا يسمح SELECT مباشر.
- `scripts/test-database-migrations.mjs` مسار محمي ومتعارض مع PR #4 حاليًا؛ لم أكتب فوقه. يملك P2 قفل التنسيق الحالي، ويجب أن يحرره بتغيير آمن ودمج متسلسل. بعد تحريره، أعيد تقديم فرع PR #3 للأمام دون force-push وأعيد CI على الرأس الجديد. لا دمج قبل CI PASS الكامل على head SHA نفسه.

## مراجعة مصدر PDF المالي الجاهز — حُسم قرار الملف

- المصدر المعروف: `Aghbari-Technologies/aghbari-commerce-evolved@d24695209b45f2352e0ba994e1f5109d7e2afc9d`, `src/lib/finance-document-pdf.ts`, source blob `ba1a74b4a50b4bedb0f6ae8c509de339dfe3223d`. لم يُعد جلب المصدر؛ استُخدمت البصمة والنسخة المرجعية المسجلة.
- ملف الهدف `src/lib/finance-document-pdf.ts` blob `5128fabce8b7a6c0b56433020b3f83f329165a24` مصنّف `ALREADY_PRESENT_BETTER` في `READY_TO_REUSE_FILE_AUDIT.csv`: تطبيق Nasr1 الحالي يضيف تحققًا ماليًا وتقارير كامل دفتر العميل، أموالًا بوحدات صحيحة، ملخص عملات، فئات متأخرات/استحقاق مجهول، وتسوية حالة الفاتورة على زمن إنشاء ثابت.
- تتبع المسار: `CustomerWorkflows.tsx` → `/api/invoice-pdf/$invoiceId` → `finance-pdf-server.ts` → RPC `get_customer_invoice_pdf` في `20261015230000_scoped_customer_invoice_pdf.sql`. الـRPC اشتقاقه من auth.uid() وprofile/customer/organization النشطين وصلاحية `invoices.read`؛ لا يمنح قراءة مباشرة للحقول المالية.
- أضيفت اختبارات `src/test/finance-document-pdf-source-reconciliation.test.ts` (6 tests): ملخصات عملات/مبالغ صحيحة، استبعاد الفواتير الملغاة، حماية aging buckets، حالة الفاتورة، إنشاء PDF عربي صالح، ورفض الإجماليات غير المتطابقة أو ملخص بلا timestamp.
- دليل الاختبارات: [Actions 39321185653](https://github.com/Report-Engainall/Nasr1/actions/runs/39321185653) على `b715d67d4e7f30a8e874465bf963ca6580c298d0` سجّل Unit tests SUCCESS، 44/44 ملفات و332/332 اختبارًا. الفشل الإجمالي لهذا التشغيل ظل في اختبار تحويل المخزون وليس في اختبارات PDF. الرأس اللاحق `38ab9d4f573a5d2efb13a38976542e03800de15b` له CI جديد مستقل؛ لا يوصف PASS قبل اكتماله.

## تعارضات ومسؤوليات

- P1 يملك `SOURCE_INTEGRATION_LEDGER.csv`, `READY_TO_REUSE_FILE_AUDIT.csv` وهذا التقرير. PR #4 ما زال يغيّر سجل المصادر؛ طلبت من مالكه إزالة التغيير لتفادي التعديل المتزامن. لا أحفظ فوق نسخته/قفل المسار.
- `WORK_COORDINATION.md`, `CURRENT_EXECUTION_STATE.md`, `EXECUTION_LOG.md`, وملفات الأرشيف/المواصفة ملكية P2؛ لا أعدلها ولا أنفذ مهام الأرشيف أو المواصفة المنفصلة.
- [PR #5](https://github.com/Report-Engainall/Nasr1/pull/5) يحتوي تقرير P1 في تغييراته رغم ملكيته الحصرية لـP1؛ طلبت إخراجه من PR #5 لتجنب add/add عندما تُدمج الفروع بالتتابع. هذا التقرير هو نسخة P1 الحية على فرعي.
- ممنوع: تعديل main مباشرة، تخفيف RLS، force-push/reset/clean، إنشاء فروع جلسات جديدة، أو وصف CI بأنه PASS دون نتيجة مطابقة للرأس.
