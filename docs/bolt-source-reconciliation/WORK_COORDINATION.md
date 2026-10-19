# سجل التنسيق التنفيذي — مبرمجان / Nasr1

**المسؤول عن هذا الملف:** المبرمج 1 فقط.  
**آخر تحقق حي مسجل:** 2026-10-19.  
**main HEAD:** 0c089585d27665680dcc4ad2520dd4affc875804؛ CI [39311791227 — SUCCESS](https://github.com/Report-Engainall/Nasr1/actions/runs/39311791227) على SHA نفسه.

## قائمة العمل الحالية
| المالك | task ID | الفرع / PR | آخر head SHA | الحالة والدليل | الخطوة التالية |
|---|---|---|---|---|---|
| المبرمج 1 | NASR1-ORIGINAL-SPEC-INTERFACE-COMPLETION-002 / محاسبة دفتر الأستاذ ضمن المواصفة | feature/accounting-general-ledger-20261019 / [PR #4](https://github.com/Report-Engainall/Nasr1/pull/4) | a1ff5fc9a4c2486bc9cb51e8370d3bde35eccccd | [CI #39315048042 PASS](https://github.com/Report-Engainall/Nasr1/actions/runs/39315048042) على SHA نفسه؛ PR مفتوح لا يعني أن main يحتوي التغيير | راجع تداخل المسارات المشتركة، ثم دمج متسلسل بعد CI/الحالة الحية؛ بعدها واصل next_task_id |
| المبرمج 2 | NASR1-SOURCE-INTEGRATION-INV-TRANSFER-001 | integration/inventory-transfer-batches-20261019-rebased / [PR #3](https://github.com/Report-Engainall/Nasr1/pull/3) | bf31eea06d020955b0912d252087c72f98e023f5 | [CI #39314953094 FAIL](https://github.com/Report-Engainall/Nasr1/actions/runs/39314953094): permission denied for table inventory_transfer_batches أثناء SELECT تحت authenticated | أصلح اختبار الدور/الاتصال دون تخفيف RLS، وشغّل CI مجددًا على head جديد |
| المبرمج 2 | PR قديم تابع لنفس ميزة النقل | integration/inventory-transfer-batches-20261019 / [PR #2](https://github.com/Report-Engainall/Nasr1/pull/2) | 54a6db0bf1da4db579092cc0d596dd0016d7e394 | نسخة أقدم متداخلة مع PR #3 وبها migration filename قديم | قارن الفروق مرة واحدة، احتفظ بالفريد فقط، أغلق القديم بعد عدم فقد تغيير |
| مرجع تاريخي | استعادة Bolt | [PR #1](https://github.com/Report-Engainall/Nasr1/pull/1) | d637260e541bc180b8d2fd46e984953128187745 | Draft تاريخي، لا يدخل في النطاق المتوازي الحالي تلقائيًا | لا تلمسه إلا عند طلب صريح أو دليل جديد |

## سياسة المسارات المشتركة
- المسارات المتداخلة حاليًا بين PR #3 وPR #4، على الأقل: scripts/test-database-migrations.mjs وdocs/bolt-source-reconciliation/CURRENT_EXECUTION_STATE.md وEXECUTION_LOG.md وSOURCE_INTEGRATION_LEDGER.csv. راجع file list من PR metadata فقط؛ لا تعِد جلب الشيفرة الكاملة بلا تغيير.
- قبل أي تحرير لمسار مشترك، دوّن المسار، المالك، PR/branch، base SHA، head SHA، الغرض، والمنتظر بعد الدمج. المالك النشط لا يحرر المسار إلا على فرعه، والطرف الآخر لا يحرر الملف نفسه بالتزامن. يستطيع الطرف الآخر الاستمرار في ملفات مستقلة.
- ملكيات دائمة: P1 يملك WORK_COORDINATION.md وCURRENT_EXECUTION_STATE.md وEXECUTION_LOG.md؛ P2 يملك SOURCE_INTEGRATION_LEDGER.csv وREADY_TO_REUSE_FILE_AUDIT.csv. ملفات الاختبار/الربط المشتركة تُسلسل حسب المالك النشط أدناه.
- قفل الجلسة المشتركة الحالي: scripts/test-database-migrations.mjs. فشل P2 الحالي في اختبار صلاحيات القراءة؛ P2 يقدم إصلاحًا دقيقًا على فرعه، بينما P1 يحافظ على تغييرات دفتر الأستاذ الخاصة به. بعد دمج PR الأول، يعيد صاحب الفرع الثاني تأسيس فرعه على main الجديد ويجمع الاختبارات المتقابلة ثم يعيد CI.
- لا merge متزامن. لا cherry-pick عشوائي ولا force-push. احتفظ بقائمة التغييرات قبل/بعد rebase وسجل head SHA الجديد.

## منع التكرار
- أي source SHA/blob/path مسجل في تقرير P2 أو READY_TO_REUSE_FILE_AUDIT.csv يستخدم كما هو ما دام لم يتغير. لا تعِد البحث/الجلب/فتح المحتوى لتوليد نفس النتيجة.
- لا يعاد اختبار SHA نفسه بلا defect أو سبب؛ تُشغّل اختبارات جديدة بعد أي commit يغير blobs ذات الصلة.
- لا يتكرر استكشاف route tree/المشتريات/العروض/الكتالوج/CSV أو archive ZIPs التي تم إثباتها في CURRENT_EXECUTION_STATE.md وEXECUTION_LOG.md. تعامل معها كخط أساس مثبت، وافحص deltas فقط.
- كل دور يحتفظ بتقرير واحد وnext task واحد. لا يكتب أحد تفاصيل جلسة الطرف الآخر داخل تقريره؛ يسلمها له كسطر evidence قصير.

## قفل/طلب تعديل مشترك — السجل الحي
أضف صفًا عند كل قفل، وأغلقه عند تحرير المسار:
| path | owner | branch/PR | base SHA | head SHA | purpose | status |
|---|---|---|---|---|---|---|
| scripts/test-database-migrations.mjs | P2 لإصلاح فشل نقل المخزون؛ على P2/P1 التنسيق قبل دمج تغييرات PR #4 | PR #3 مقابل PR #4 | 0c089585d27665680dcc4ad2520dd4affc875804 | bf31eea06d020955b0912d252087c72f98e023f5 | فصل الفحص المميز عن negative RLS test | ACTIVE — يمنع التحرير المتزامن |
