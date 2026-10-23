# الحالة التنفيذية الحالية الوحيدة — Nasr1 / متجر الأغبري
## قراءة Git الحية — 2026-10-23T17:00:00+03:00

هذا هو مؤشر الاستئناف المركزي الوحيد. لا تستخرج NEXT_TASK_ID من تقارير تاريخية؛ اجعل هذا القسم مرجع التنفيذ الجاري. رأس main والحالات أدناه تم التحقق منها من GitHub.

### خط الأساس
- المستودع الوحيد: `Report-Engainall/Nasr1`.
- `MAIN_SHA=59547c7d683cefd65cab445b97219aa701021676`.
- Core CI على main: [run 39956957952](https://github.com/Report-Engainall/Nasr1/actions/runs/39956957952) = SUCCESS على SHA نفسه.
- لا كتابة مباشرة إلى main. أحدث main لا يزال `59547c7d683cefd65cab445b97219aa701021676` وقت هذه القراءة.

### المهمة الأساسية الحالية — AUTH-CENTRAL-SESSION-BACKEND-P2
- PR [#83](https://github.com/Report-Engainall/Nasr1/pull/83), الفرع `feat/p2-central-session-backend-20261023`.
- `HEAD_SHA=1f60e27ecef78c86cc3b343b10335e5b09dfff33`; `BASE_SHA=59547c7d683cefd65cab445b97219aa701021676`; OPEN/Draft; not merged.
- Core CI [run 39965936282](https://github.com/Report-Engainall/Nasr1/actions/runs/39965936282) قيد التنفيذ على الرأس الدقيق؛ P2 Playwright [run 39965936142](https://github.com/Report-Engainall/Nasr1/actions/runs/39965936142) Pending على الرأس الدقيق. لا تنقل نتائج الرأس الأسبق إلى هذا الرأس.
- الرأس السابق `91c87e003b5196eb9b5be02326e8aa52b3a3f4d3` اجتاز Core `39961778913` وP2 `39961778847`; نجح مسار local Supabase/PG17 وChromium في P2، فيما hosted-account E2E بقي SKIPPED لغياب اعتمادات اختبار خارجية غير إنتاجية.
- سبب الفشل السابق على SHA `9079ffa7dc56051f29f5ab344dd4522e208cb841`: اختبار استلام المشتريات رفض منفذ PostgreSQL الديناميكي `55432` بدل `54322`; أُصلح في `91c87e0...` بحارس loopback المشترك.
- مراجعة SECURITY DEFINER وجدت أن `can_manage_finance()` كان يقرر الدور باستخدام `auth.uid()` فقط دون جلسة حية. الرأس `1f60e27...` يربطه الآن بـ`current_profile_id()` ويضيف قبول PostgreSQL يؤكد أن بوابات المالية والأدوار والموظفين والمهام التشغيلية ترفض JWT بعد حذف صف جلسته. اختبارات هذا التعديل ما زالت جارية على الرأس الجديد.
- عقد الجلسات يضيف `list_organization_sessions`, `revoke_organization_session` و`revoke_other_auth_sessions()`; يقيد الجلسات بالمؤسسة والمستخدمين النشطين، يحجب الأسرار، يسجل العرض والإلغاء، ويجعل هوية التطبيق معتمدة على صف `auth.sessions` الحي المطابق لـJWT. لا تغلق المهمة حتى Core/P2 النهائيين ومراجعة SECURITY DEFINER على نفس الرأس.
- لا تدمج #83 قبل Core وP2 النهائيين على الرأس النهائي ومراجعة العقد. PR #88 واجهة P1 تابعة للعقد وليست متكاملة نهائيًا قبل دمجه.

### مسار مالي موازٍ مستقل — FIN-INVOICE-001
- PR [#95](https://github.com/Report-Engainall/Nasr1/pull/95), الفرع `feat/p2-fin-receivables-aging-credit-memo-20261023`.
- `HEAD_SHA=024e155a2135a104a7dc1c6d8ced7e2018b0a467`; `BASE_SHA=59547c7d683cefd65cab445b97219aa701021676`; OPEN/Draft; not merged.
- الفجوة المثبتة: `fetch_staff_receivables_aging` يحسب المتبقي من الفاتورة ناقص المدفوعات لكنه لم يطرح الإشعارات الدائنة المنشورة، خلافًا لعقد كشف الحساب.
- التغيير يضيف تجميعًا مصدره نفس الفاتورة والمؤسسة، ويحسب `total - payments - posted credits` دون النزول عن الصفر؛ يستبعد المسودات والمعكوسات، ويرفض إشعارًا منشورًا لا يطابق مصدره أو عملته، ويضيف `credit_memo_amount` إلى تفاصيل بند التقادم.
- بعد تقوية fixture لاستبعاد أي بند دخل في طلب مرتجع سابق، الرأس الحالي `024e155a2135a104a7dc1c6d8ced7e2018b0a467` اجتاز Core [run 39964921878](https://github.com/Report-Engainall/Nasr1/actions/runs/39964921878) = SUCCESS وP2 [run 39964921887](https://github.com/Report-Engainall/Nasr1/actions/runs/39964921887) = SUCCESS على الرأس نفسه. سجل Core يحتوي على `PASS staff receivables aging`، بما في ذلك خصم الإشعارات المنشورة مرة واحدة واستبعاد المسودات والاستلام المادي. PR95 يبقى مفتوحًا كمسودة حتى ترتيب الدمج بعد عقد #83؛ لا ادعاء نجاح لاختبار الحساب المستضاف الذي بقي SKIPPED. المسارات الثلاثة لا تتداخل مع files workflow/اختبار قاعدة البيانات المشتركة المقفلة في #83.

### الترتيب التالي والطلبات المرتبطة
- `NEXT_TASK_ID=AUTH-CENTRAL-SESSION-BACKEND-P2`.
- `NEXT_ACTION`: راجع النتيجة النهائية لـCore وP2 على رأس #83 الحالي `1f60e27...`; أصلح أي فشل مثبت فقط؛ نفّذ مراجعة SQL/SECURITY DEFINER؛ عند تحقق جميع الشروط حوّل المسودة إلى Ready وادمج، ثم أعد التحقق من main وتشغيل Core على SHA ما بعد الدمج.
- المهمة التالية بعد #83: `PR82-CUSTOMER-MANAGER-AUTHORIZATION-ACCEPTANCE`. PR [#82](https://github.com/Report-Engainall/Nasr1/pull/82) ما زال مفتوحًا ورأسه `8e70899da67d53f0acf221d7e4eeb1a8f2f1b591` متفرعًا من base قديم `0396b29...`; نجاح Core/P2 السابق يخص هذا الرأس وحده. حدّثه بالتتابع بعد #83 وكرر الاختبارات المطلوبة على الرأس الجديد.
- PR [#71](https://github.com/Report-Engainall/Nasr1/pull/71) مدمج؛ فحوص Core وP2 نجحت على رأسه `09c052d9f39e92e81b8dc994f54554c1fa9fdf49`. إثبات النسخ والاستعادة يخص PostgreSQL 17 المحلي المعزول فقط، وليس استعادة الإنتاج أو RTO/RPO.
- PR #54 و#52 و#84 و#90 مدمجة. لا تُستأنف بالاعتماد على التقارير القديمة.
- PR #88 واجهة الأجهزة التابعة لـ#83، و#89 من P3 ما زال مفتوحًا على main الحالي، و#43 اختبار واجهة الأدوار ما زال مفتوحًا لكن قاعدته قديمة؛ CI Core السابق له نجح وP2 فشل في خطوة محاسبة مستقلة عن اختبار الأدوار. لا تعدّل ملفات P1/P3 المحمية أو تُدمج #43 قبل مزامنة القاعدة وإعادة اختباره من قبل مالك مساره.

### العوائق الخارجية والملفات المقفلة
- `INTEGRATION-001=BLOCKED_EXTERNAL`: لا اعتماد/استجابة حقيقية تثبت اتصال Onyx أو WhatsApp Business API الرسمي.
- `ONYX-XLSX-001=BLOCKED_EXTERNAL`: تصدير XLSX المحلي مثبت على أدلة سابقة، لكن قبول الاستيراد في نسخة Onyx الهدف غير مثبت.
- `OPS-DR-001`: استعادة PostgreSQL محلية معزولة مثبتة على PR #71 فقط؛ استعادة الإنتاج `NOT RUN`.
- مصفوفة القبول و`WORK_COORDINATION.md` مقفولتان حاليًا ضمن PR #43؛ لم تُعدلا بالتوازي. `CURRENT_EXECUTION_STATE.md` و`PROGRAMMER_2_CURRENT_REPORT.md` و`EXECUTION_LOG.md` تحت تحديث P2 في PR #92. ملفات workflow و`scripts/test-database-migrations.mjs` و`bun.lock` المتأثرة في #83 ممنوع لمسها من PR آخر بالتوازي.
- لا ادعاء اتصال حي أو إنتاجي، ولا مزود مدفوع إلزامي، ولا أرصدة/نتائج مختلقة.

### الحقول الإلزامية لتسليم الجلسة
- `LAST_COMPLETED_TASK_ID=OPS-DR-001` — PR #71 مدمج؛ إثبات محلي معزول فقط.
- `MAIN_SHA=59547c7d683cefd65cab445b97219aa701021676`
- `CURRENT_BRANCH=feat/p2-central-session-backend-20261023`
- `BASE_SHA=59547c7d683cefd65cab445b97219aa701021676`
- `HEAD_SHA=1f60e27ecef78c86cc3b343b10335e5b09dfff33`
- `TASK_STATUS=IMPLEMENTED; prior head 91c87e0 Core/P2 SUCCESS; current head Core/P2 pending`
- `FILES_CHANGED=28 paths in PR #83; latest functional fix scripts/test-purchase-receipt-accounting.mjs`
- `TESTS_RUN=Core 39961778913 and P2 39961778847 SUCCESS on 91c87e0; new head 1f60e27 Core 39965936282 IN PROGRESS and P2 39965936142 PENDING`
- `TESTS_FAILED_OR_SKIPPED=older P2 39960901154 failed at purchase-receipt local endpoint guard, fixed; hosted-account E2E SKIPPED for missing external non-production credentials; exact-head rerun after finance-helper session gate fix is pending`
- `MERGE_STATUS=NOT MERGED`
- `EXTERNAL_BLOCKERS=Onyx live sync/target import, official WhatsApp API, production DR`
- `LOCKED_PATHS=.github/workflows/*, bun.lock, scripts/test-database-migrations.mjs and session-related test fixtures in PR #83; matrix/WORK_COORDINATION under PR #43`
- `NEXT_TASK_ID=AUTH-CENTRAL-SESSION-BACKEND-P2`
- `NEXT_ACTION=finish exact-head P2, review security-definer contract, merge only after acceptance, verify post-merge main CI`
- `UPDATED_AT=2026-10-23T17:00:00+03:00`
