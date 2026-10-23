# الحالة التنفيذية الحالية الوحيدة — Nasr1 / متجر الأغبري
## قراءة Git الحية — 2026-10-23T17:25:00+03:00

هذا هو مؤشر الاستئناف المركزي الوحيد. لا تستخرج NEXT_TASK_ID من تقارير تاريخية؛ اجعل هذا القسم مرجع التنفيذ الجاري. رأس main والحالات أدناه تم التحقق منها من GitHub.

### خط الأساس
- المستودع الوحيد: `Report-Engainall/Nasr1`.
- `MAIN_SHA=f7565aefd7af6033d169167d1bebb3dc5cd248ce`.
- Core CI على main الجديد: [run 39966840332](https://github.com/Report-Engainall/Nasr1/actions/runs/39966840332) = IN_PROGRESS على SHA `f7565aefd7af6033d169167d1bebb3dc5cd248ce`. الفرق عن main السابق توثيقي فقط في ملفي تقرير/Checkpoint مملوكين لـP1.
- لا كتابة مباشرة إلى main. فرع #83 ما زال مبنيًا على `59547c7...`؛ حدّثه إلى main الحالي بدمج تقدمي غير قسري بعد اكتمال P2.

### المهمة الأساسية الحالية — AUTH-CENTRAL-SESSION-BACKEND-P2
- PR [#83](https://github.com/Report-Engainall/Nasr1/pull/83), الفرع `feat/p2-central-session-backend-20261023`.
- `HEAD_SHA=338e6504941506ef2c65e6a488f1f88fe4931425`; `BASE_SHA=59547c7d683cefd65cab445b97219aa701021676`; OPEN/Draft; not merged.
- Current exact-head Core [run 39968531790](https://github.com/Report-Engainall/Nasr1/actions/runs/39968531790) = QUEUED; P2 [run 39968531845](https://github.com/Report-Engainall/Nasr1/actions/runs/39968531845) = PENDING. No exact-head pass yet.
- Prior head `d2706613906ab401a28628de101a500b8b80b2d5` passed Core [39966420997](https://github.com/Report-Engainall/Nasr1/actions/runs/39966420997) with `PASS central session management`. The P2 job stalled during `playwright install-deps chromium`; head `8b413513...` then proved the public UI smoke SUCCESS and proceeded to the local Supabase job, but its overall Core/P2 did not reach terminal conclusions before the workflow was updated again.
- Workflow correction now covers all three Chromium sites: P2 public smoke, P2 local Supabase, and Core price-visibility acceptance. Browser binaries are installed separately; `ldd` checks linked system libraries; apt-backed `playwright install-deps chromium` runs only if missing libraries are detected and is bounded to eight minutes. The workflow fix is implemented, but needs exact-head CI proof.
- Root cause before this: `1f60e27...` Core omitted `accountant`; fixed on `d270661...` with `admin/manager/accountant` preserved and live session guard through `current_profile_id()`. Prior Core on `d270661...` passed and its SQL logs include central session acceptance.
- Earlier P2 failure on `9079ffa...` was the local PostgreSQL port mismatch (`55432` vs `54322`), corrected in `91c87e0...` via loopback-only endpoint validation.
- Session RPCs list/revoke tenant-bounded active sessions without secrets; listing/revoking is audited; self-bulk revoke preserves the current session; canonical profile/tenant scope now requires live `auth.sessions` row matching JWT.
- Current `main=f7565aefd7af6033d169167d1bebb3dc5cd248ce` is one P1 documentation-only commit ahead of this PR base. After exact-head tests reach terminal PASS, update branch to main non-forcibly and rerun Core/P2 on the new final SHA.
- لا تدمج #83 قبل Core وP2 النهائيين على الرأس النهائي ومراجعة العقد. PR #88 واجهة P1 تابعة للعقد وليست متكاملة نهائيًا قبل دمجه.

### مسار مالي موازٍ مستقل — FIN-INVOICE-001
- PR [#95](https://github.com/Report-Engainall/Nasr1/pull/95), الفرع `feat/p2-fin-receivables-aging-credit-memo-20261023`.
- `HEAD_SHA=024e155a2135a104a7dc1c6d8ced7e2018b0a467`; `BASE_SHA=59547c7d683cefd65cab445b97219aa701021676`; OPEN/Ready for review; not merged.
- الفجوة المثبتة: `fetch_staff_receivables_aging` يحسب المتبقي من الفاتورة ناقص المدفوعات لكنه لم يطرح الإشعارات الدائنة المنشورة، خلافًا لعقد كشف الحساب.
- التغيير يضيف تجميعًا مصدره نفس الفاتورة والمؤسسة، ويحسب `total - payments - posted credits` دون النزول عن الصفر؛ يستبعد المسودات والمعكوسات، ويرفض إشعارًا منشورًا لا يطابق مصدره أو عملته، ويضيف `credit_memo_amount` إلى تفاصيل بند التقادم.
- بعد تقوية fixture لاستبعاد أي بند دخل في طلب مرتجع سابق، الرأس الحالي `024e155a2135a104a7dc1c6d8ced7e2018b0a467` اجتاز Core [run 39964921878](https://github.com/Report-Engainall/Nasr1/actions/runs/39964921878) = SUCCESS وP2 [run 39964921887](https://github.com/Report-Engainall/Nasr1/actions/runs/39964921887) = SUCCESS على الرأس نفسه. سجل Core يحتوي على `PASS staff receivables aging`، بما في ذلك خصم الإشعارات المنشورة مرة واحدة واستبعاد المسودات والاستلام المادي. PR95 يبقى مفتوحًا Ready for review حتى ترتيب الدمج بعد عقد #83؛ لا ادعاء نجاح لاختبار الحساب المستضاف الذي بقي SKIPPED. المسارات الثلاثة لا تتداخل مع files workflow/اختبار قاعدة البيانات المشتركة المقفلة في #83.

### الترتيب التالي والطلبات المرتبطة
- `NEXT_TASK_ID=AUTH-CENTRAL-SESSION-BACKEND-P2`.
- `NEXT_ACTION`: انتظر Core/P2 على HEAD #83 `8b413513...`; إذا نجحا، حدّث الفرع إلى main الحالي `f7565a...` بدمج غير قسري وأعد الاختبارين على الرأس النهائي. بعد الدمج حدّث #95 فوق main الجديد وأعد CI إذا تغيّر الرأس.
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
- `MAIN_SHA=f7565aefd7af6033d169167d1bebb3dc5cd248ce`
- `CURRENT_BRANCH=feat/p2-central-session-backend-20261023`
- `BASE_SHA=59547c7d683cefd65cab445b97219aa701021676`
- `HEAD_SHA=338e6504941506ef2c65e6a488f1f88fe4931425`
- `TASK_STATUS=IMPLEMENTED; d270661 Core PASS; 8b413513 public UI smoke PASS but overall checks nonterminal; current 338e650 Core QUEUED / P2 PENDING`
- `FILES_CHANGED=28 paths in PR #83; latest functional fix scripts/test-purchase-receipt-accounting.mjs`
- `TESTS_RUN=Core 39966420997 PASS on d270661 incl. PASS central session management; 8b413513 P2 public UI smoke PASS but overall checks nonterminal; current Core 39968531790 QUEUED and P2 39968531845 PENDING on 338e650; main Core 39966840332 IN_PROGRESS on f7565a`
- `TESTS_FAILED_OR_SKIPPED=Core on 1f60e27 omitted accountant role, fixed in d270661. d270661 P2 stalled at apt install-deps; workflow optimized in 8b413513 then also Core price-visibility install optimized in 338e650. Current exact-head validation queued/pending. Hosted-account E2E SKIPPED without external non-production credentials`
- `MERGE_STATUS=NOT MERGED`
- `EXTERNAL_BLOCKERS=Onyx live sync/target import, official WhatsApp API, production DR`
- `LOCKED_PATHS=.github/workflows/*, bun.lock, scripts/test-database-migrations.mjs and session-related test fixtures in PR #83; matrix/WORK_COORDINATION under PR #43`
- `NEXT_TASK_ID=AUTH-CENTRAL-SESSION-BACKEND-P2`
- `NEXT_ACTION=finish Core/P2 on 338e650; merge current main f7565a into branch non-forcibly; rerun both on final SHA; merge only after PASS; update/retest PR95 afterward`
- `UPDATED_AT=2026-10-23T17:25:00+03:00`
