# تصحيح الحالة الحية والتحقق المستقل — 22 أكتوبر 2026، 22:20 Asia/Aden

> **هذه الإضافة هي أحدث تصحيح زمني وتعلو على التفاصيل التاريخية أدناه.** أُعيد تشغيل P1 بتوجيه المالك. دور P1 هو التحقق المستقل فقط؛ لا يجري تغييرات تطبيق/قاعدة بيانات متوازية ولا يعالج كود P2.

## رأس GitHub والأدلة المطابقة

- **المستودع:** https://github.com/Report-Engainall/Nasr1
- **رأس main عند القراءة:** `bf06c73226033da8e4f81e24981eb64e6e7fca99`
- **Core CI على رأس main نفسه:** SUCCESS — https://github.com/Report-Engainall/Nasr1/actions/runs/39833065820
- **PR #52 / INV-009 concurrency acceptance:** رأس `45a8cc2a00c57965f9c08ccac7965ae7838b206b`. Core CI FAILURE — https://github.com/Report-Engainall/Nasr1/actions/runs/39837521493. سبب الفشل الصريح: `DATABASE_ACCEPTANCE_FAILED onyx reconciliation concurrency: PostgresError: Onyx source is not warehouse-scoped; aggregate stock cannot be assigned safely to one warehouse`. فشل الاختبار أثناء preview قبل وصوله إلى حواجز التزامن/الـidempotency؛ لا يوجد إثبات للسباق على هذا الرأس. سُجلت ملاحظة P1 في PR #52 (تعليق GitHub رقم 6349297451).
- **PR #52 Playwright:** FAILURE — https://github.com/Report-Engainall/Nasr1/actions/runs/39837521468. أظهر السجل فشل تشغيل Supabase المحلي بسبب `toomanyrequests` عند سحب `ghcr.io/supabase/postgres:17.6.1.095`. التصنيف: `BLOCKED_EXTERNAL`؛ لم يصل اختبار المتصفح المقصود إلى التنفيذ.
- **PR #51 / بروتوكول الإقلاع:** Core CI SUCCESS على `87b2599e9dab237c7f1138cb4f1a0ab773148af2` — https://github.com/Report-Engainall/Nasr1/actions/runs/39836914928. Playwright فشل بسبب GHCR throttling كما سبق — https://github.com/Report-Engainall/Nasr1/actions/runs/39836915007. تعليقات P1: 6349301583.
- **PR #50 / إدارة التصنيفات:** Core CI SUCCESS على `3301a3806ae7ffd62064b97b5796b12b2dd0eff9` — https://github.com/Report-Engainall/Nasr1/actions/runs/39836522643. Playwright فشل قبل اختبار المتصفح بسبب سحب صورة PostgreSQL من GHCR — https://github.com/Report-Engainall/Nasr1/actions/runs/39836522607. تعليقات P1: 6349302357.
- لا يُستنتج من إخفاق GHCR وجود regression في التطبيق؛ كذلك لا يُحوّل إلى `BROWSER_PROVEN`. يلزم إعادة تشغيل المسار بعد استعادة سحب الصور، وعلى SHA نهائي مطابق.

## مؤشر الاستئناف الواحد — أولوية مباشرة

**next_task_id = INV-009-ONYX-CONCURRENCY-TEST-FIX-20261022**

- **المالك:** P2 (البناء والإصلاح). أعد فحص fixture في `scripts/test-onyx-reconciliation-concurrency.mjs` عند الأسطر 163–190؛ الكود الظاهر يبني `warehouse_code` و`warehouse_name` في صف المصدر، ومع ذلك ترفضه قاعدة البيانات في مرحلة preview بأنه غير محدد للمخزن. افحص قيمة JSON المحفوظة فعليًا، ومقارنة scope في RPC، وتعاقد fixture في `scripts/test-onyx-reconciliation.mjs`. أصلح fixture/precondition مع إبقاء تحقق النطاق الخادمي الصارم كما هو.
- أعد تشغيل Core CI / PostgreSQL 17 حتى نجاح قبول التزامن على **الرأس النهائي نفسه**؛ يجب أن يثبت الاختبار أن الجلستين تنتظران، ثم تطبيقًا واحدًا وreplay واحدًا وحركة مخزون واحدة وسجل تدقيق واحدًا مع بقاء المحجوز.
- أعد تشغيل Playwright بعد حل GHCR pull throttling؛ حتى النجاح يبقى browser proof منفصلًا عن Core/DB proof.
- لا تختبر على الإنتاج، ولا تكتب مباشرة على main، ولا تخفف اختبارات النطاق لتجاوز الفشل.
- بعد حسم INV-009 على SHA مثبت، ارجع إلى الفجوة الأقدم المفتوحة في المصفوفة، بدءًا من `NASR1-ORIGINAL-SPEC-IDENTITY-AND-ONYX-SYNC-EVIDENCE-011` إذا ظلت مفتوحة على الحالة الحية. لا تنشئ مؤشر استئناف ثانٍ.

---

# الحالة التنفيذية الحالية الوحيدة — متجر الأغبري | Nasr1
## قراءة مباشرة بتاريخ 22 أكتوبر 2026

هذه هي الصفحة الوحيدة التي تحمل مؤشر الاستئناف الديناميكي. السجل السابق محفوظ في history/CURRENT_EXECUTION_STATE_PRE_REWRITE_2026-10-22.md. لا تستخرج عملًا حيًا من فقرة تاريخية أو تقرير قديم.

### الحقيقة الحية
- المستودع الوحيد: https://github.com/Report-Engainall/Nasr1
- رأس main المقروء: 0395367d869d0d63fba669940a92eeca0ae3e893.
- Core CI على رأس main نفسه 0395367d869d0d63fba669940a92eeca0ae3e893: https://github.com/Report-Engainall/Nasr1/actions/runs/39789165220 — SUCCESS بعد قراءة الحالة النهائية ووظائف التشغيل. هذا إثبات للرأس المذكور فقط.
- PRs المدمجة: #18 → f00e609013e248de4ecb94c41e31296884f899cf؛ #26 → 6e97fb35be9ebf65c546a3d5e9615063853c8eab؛ #29 → 1eb57a661b413c9c7d0321dccca70e5d6a0e42fe؛ #32 (محاسبة استلام المشتريات) → 3692be6e7bd2ef9db6d78c89813cbddd74df6e08؛ #34 (مهام المشتريات/الاستلام) → 9c1dbda4065964567ad36ebc8b6489f6eca935c4؛ #38 (اختبار خصوصية السلة والـcheckout) → 0395367d869d0d63fba669940a92eeca0ae3e893.
- دليل محاسبة استلام المشتريات: Core 39664466105 وP2 Playwright 39664466118 نجحا على SHA bf39642529c984ec2ff03cb49fbfbce665349d17 قبل الدمج؛ كما اجتاز main Core في 6f1985f8babe414f11f4c5a809e6f9312e0faefa / Actions 39681956093. لا تكرر نقل أو دمج الميزة.
- دليل مهام المشتريات: PR #34 مدمج على 9c1dbda... واجتاز main Core Actions 39678996166 على SHA الدمج نفسه.
- PR #31 مسودة توثيقية تغيّر أدلة P1 فقط. تجنّب هذه الملفات حتى الحسم: PROGRAMMER_1_CURRENT_REPORT.md، PROGRAMMER_1_SINGLE_BOOT_ENTRYPOINT.txt، SOURCE_INTEGRATION_LEDGER.csv، READY_TO_REUSE_FILE_AUDIT.csv.
- المبرمج 1 متوقف حسب توجيه المالك. لا تنتظر عودته؛ أكمل المسارات المستقلة على فروع متابعة، مع قفل واضح للملفات المتداخلة.

- PR #40 (P2 Onyx source trace/sync evidence) — مسودة غير مدمجة: https://github.com/Report-Engainall/Nasr1/pull/40. فرع `feat/p2-onyx-source-trace-sync-evidence-20261022` والرأس الحالي `8c414a06b584a37d56f3f4aaafcb8d3f53863e42`؛ Core CI #39799542472 ما زال QUEUED، وP2 Playwright #39799542477 لم يصل إلى نتيجة نهائية (آخر قراءة: infrastructure gate IN_PROGRESS وبقية الوظائف QUEUED). لا يُعتمد TESTED_EXACT_SHA حتى نجاح الفحوصات على رأس نهائي مطابق.

### مؤشر الاستئناف الديناميكي الوحيد
**next_task_id = NASR1-ORIGINAL-SPEC-IDENTITY-AND-ONYX-SYNC-EVIDENCE-011**

الخطوة التالية المحددة:
1. تتبّع حقول مصدر Onyx وexternal IDs وtenant/source IDs من اللقطة/الاستيراد حتى تصدير الطلبات الفعلي وسجل الـaudit، دون ادعاء مزامنة حية من مجرد وجود snapshot.
2. ميّز بدقة بين آخر محاولة مزامنة وحالتها/خطئها، واللقطة المستوردة، والاتصال الحي المثبت. لا تخترع حالة مزامنة غير محفوظة.
3. أتمم قبول الطباعة المالية بحسب الدور والمؤسسة: الفاتورة، كشف الحساب، الإشعار الدائن، وكل المهام المسموح بها؛ اختبر منع الوصول عبر المؤسسات ورفض الدور.
4. عند أي فجوة مثبتة، نفّذ إصلاحًا وظيفيًا موضعيًا واختبارات ذات صلة. عند اكتمال هذه الخطوات بأدلة على الرأس الحالي، أغلق المؤشر وانتقل إلى الفجوة التالية غير المكتملة في المصفوفة.

### مسارات العمل الموازية
- بوابة الدمج #38: متابعة Core #39789165220 حتى النهاية على SHA 0395367... وإصلاح الفشل إن ظهر.
- Onyx/المخزون: الذرية وحداثة snapshot وحماية المحجوز والتزامن وعزل المؤسسة والتراجع التعويضي، مع الفصل بين snapshot والمزامنة الحية.
- المالية: دورة الأستاذ العام والمستندات والأرصدة والمدفوعات والطباعة حسب الدور. مسار استلام المشتريات ومسودات القيد المصدرية مدمج، فلا تكررها.
- الاستيراد/التصدير/DQS: pipeline واحد، idempotency، حفظ الأكواد كنصوص، سلامة CSV/XLSX، نتائج جودة قابلة للتفسير.
- المهام: توليد من أحداث حقيقية؛ مهام الشراء/الاستلام وفرق الجرد أضيفت، لكن تحقق من بقية مصادر المهام والطباعة.
- الإدارة والعملاء والشركات والصلاحيات والهوية/PWA والتقارير/AI والتكاملات: أكمل النواقص الحقيقية فقط حسب مصفوفة الإغلاق.

المصفوفة الوحيدة للأعمال المتوازية: docs/bolt-source-reconciliation/REMAINING_SCREEN_ACCEPTANCE_MATRIX_2026-10-22.csv. تشمل المتاجر والإدارة والمالية/Onyx والاستيراد وDQS والتقارير/AI والمهام والطباعة والأمن وPWA والتكاملات، وأضيفت لها بوابات صريحة للأداء والنسخ الاحتياطي/الاستعادة وقبول قالب Onyx ذي 27 عمودًا ووثائق التسليم وAPI.

### قواعد الإثبات
الحالات منفصلة: IMPLEMENTED، INTEGRATED، TESTED_EXACT_SHA، BROWSER_PROVEN، PRODUCTION_PROVEN، CLOSED_WITH_EVIDENCE، BLOCKED_EXTERNAL، NOT RUN. الاختبار الذي لم يُشغّل يبقى NOT RUN. مسؤولية فحص المتصفح النهائية لـBolt New كما طلب المالك؛ لا توقف الأعمال التي لا تعتمد عليه ولا تدّع Browser/Production proof من CI. لا تعديلات أو معاملات إنتاجية.
لا تعِد استخراج أرشيفات سبق توثيقها، ولا تحول التقارير إلى بديل عن الكود. عند الفشل خذ الخطأ الفعلي وأصلحه مع اختبارات التبعية. لا next_task_id ثانٍ.
