# الحالة التنفيذية الحالية الوحيدة — Nasr1 / متجر الأغبري
## قراءة Git الحية — 2026-10-23T16:55:00+03:00

هذا هو مؤشر الاستئناف المركزي الوحيد. لا تستخرج NEXT_TASK_ID من تقارير تاريخية؛ اجعل هذا القسم مرجع التنفيذ الجاري. رأس main والحالات أدناه تم التحقق منها من GitHub.

### خط الأساس
- المستودع الوحيد: `Report-Engainall/Nasr1`.
- `MAIN_SHA=59547c7d683cefd65cab445b97219aa701021676`.
- Core CI على main: [run 39956957952](https://github.com/Report-Engainall/Nasr1/actions/runs/39956957952) = SUCCESS على SHA نفسه.
- لا كتابة مباشرة إلى main. أحدث main لا يزال `59547c7d683cefd65cab445b97219aa701021676` وقت هذه القراءة.

### المهمة الأساسية الحالية — AUTH-CENTRAL-SESSION-BACKEND-P2
- PR [#83](https://github.com/Report-Engainall/Nasr1/pull/83), الفرع `feat/p2-central-session-backend-20261023`.
- `HEAD_SHA=91c87e003b5196eb9b5be02326e8aa52b3a3f4d3`; `BASE_SHA=59547c7d683cefd65cab445b97219aa701021676`; OPEN/Draft; not merged.
- Core CI [run 39961778913](https://github.com/Report-Engainall/Nasr1/actions/runs/39961778913) = SUCCESS على SHA `91c87e0...`.
- P2 Playwright [run 39961778847](https://github.com/Report-Engainall/Nasr1/actions/runs/39961778847) لم يصل إلى نتيجة نهائية عند القراءة. Public read-only UI smoke = SUCCESS؛ infrastructure gate = SUCCESS؛ الاختبار المستضاف الذي يحتاج اعتمادات خارجية = SKIPPED؛ local Supabase/PG17 job ما زال يعمل، وآخر خطوة مقروءة تثبيت اعتمادات Chromium من المتصفح المحفوظ.
- سبب الفشل السابق على SHA `9079ffa7dc56051f29f5ab344dd4522e208cb841`: اختبار استلام المشتريات رفض منفذ PostgreSQL الديناميكي `55432` رغم أنه المنفذ المحلي الذي يخصصه workflow. أُصلح ذلك في `91c87e0...` باستعمال حارس endpoint المحلي المشترك؛ النتيجة الجديدة لهذا المسار لا تزال تنتظر P2 النهائي.
- عقد الجلسات يضيف `list_organization_sessions`, `revoke_organization_session` و`revoke_other_auth_sessions()`; يتحقق من جلسة `auth.sessions` الحية المطابقة لـJWT، ويقيد الجلسات بالمؤسسة والمستخدمين النشطين، ويحجب الأسرار، ويحفظ التدقيق والأنواع الرسمية. فحوص PostgreSQL 17/الوحدة نجحت على الرأس الحالي ضمن Core؛ لا تغلق المهمة حتى ينتهي P2 ويُراجع عقد SECURITY DEFINER على هذا الرأس نفسه.
- لا تدمج #83 قبل Core وP2 النهائيين على الرأس النهائي ومراجعة العقد. PR #88 واجهة P1 تابعة للعقد وليست متكاملة نهائيًا قبل دمجه.

### مسار مالي موازٍ مستقل — FIN-INVOICE-001
- PR [#95](https://github.com/Report-Engainall/Nasr1/pull/95), الفرع `feat/p2-fin-receivables-aging-credit-memo-20261023`.
- `HEAD_SHA=024e155a2135a104a7dc1c6d8ced7e2018b0a467`; `BASE_SHA=59547c7d683cefd65cab445b97219aa701021676`; OPEN/Draft; not merged.
- الفجوة المثبتة: `fetch_staff_receivables_aging` يحسب المتبقي من الفاتورة ناقص المدفوعات لكنه لم يطرح الإشعارات الدائنة المنشورة، خلافًا لعقد كشف الحساب.
- التغيير يضيف تجميعًا مصدره نفس الفاتورة والمؤسسة، ويحسب `total - payments - posted credits` دون النزول عن الصفر؛ يستبعد المسودات والمعكوسات، ويرفض إشعارًا منشورًا لا يطابق مصدره أو عملته، ويضيف `credit_memo_amount` إلى تفاصيل بند التقادم.
- بعد تقوية fixture لاستبعاد أي بند دخل في طلب مرتجع سابق، الرأس الحالي هو `024e155a2135a104a7dc1c6d8ced7e2018b0a467`. Core [run 39964921878](https://github.com/Report-Engainall/Nasr1/actions/runs/39964921878) قيد التنفيذ في Unit tests؛ P2 [run 39964921887](https://github.com/Report-Engainall/Nasr1/actions/runs/39964921887) لا يزال بانتظار وظيفة اختبار Supabase المحلية. الرأس السابق `d2f904...` اجتاز Core/P2، بما فيه سطر القبول `PASS staff receivables aging`, لكنه لا يُثبت رأس الاختبار المعدّل. المسارات الثلاثة في PR95 لا تتداخل مع ملفات workflow/اختبار قاعدة البيانات المشتركة المقفلة في #83.

### الترتيب التالي والطلبات المرتبطة
- `NEXT_TASK_ID=AUTH-CENTRAL-SESSION-BACKEND-P2`.
- `NEXT_ACTION`: راجع النتيجة النهائية لـP2 على #83 `91c87e0...`; أصلح أي فشل مثبت فقط؛ نفّذ مراجعة SQL/SECURITY DEFINER؛ عند تحقق جميع الشروط حوّل المسودة إلى Ready وادمج، ثم أعد التحقق من main وتشغيل Core على SHA ما بعد الدمج.
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
- `HEAD_SHA=91c87e003b5196eb9b5be02326e8aa52b3a3f4d3`
- `TASK_STATUS=IMPLEMENTED; Core/P2 on HEAD 91c87e0 still waiting for P2 terminal result`
- `FILES_CHANGED=28 paths in PR #83; latest functional fix scripts/test-purchase-receipt-accounting.mjs`
- `TESTS_RUN=Core 39961778913 SUCCESS on 91c87e0; P2 39961778847 stuck at Chromium OS deps step (15-minute step timeout configured); do not merge until terminal result`
- `TESTS_FAILED_OR_SKIPPED=older P2 39960901154 failed at purchase-receipt local endpoint guard; fixed in 91c87e0, final retry pending; hosted-account E2E SKIPPED for missing external non-production credentials`
- `MERGE_STATUS=NOT MERGED`
- `EXTERNAL_BLOCKERS=Onyx live sync/target import, official WhatsApp API, production DR`
- `LOCKED_PATHS=.github/workflows/*, bun.lock, scripts/test-database-migrations.mjs and session-related test fixtures in PR #83; matrix/WORK_COORDINATION under PR #43`
- `NEXT_TASK_ID=AUTH-CENTRAL-SESSION-BACKEND-P2`
- `NEXT_ACTION=finish exact-head P2, review security-definer contract, merge only after acceptance, verify post-merge main CI`
- `UPDATED_AT=2026-10-23T16:47:00+03:00`
