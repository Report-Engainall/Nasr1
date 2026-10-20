# نقطة الدخول التنفيذية الوحيدة — متجر الأغبري | Nasr1
## أمر حاكم بديل — 18 أكتوبر 2026 — استخراج المصادر والدمج الفعلي

اقرأ هذه الوثيقة كاملة قبل تعديل الكود. هي نقطة الإقلاع الحالية الوحيدة وتتقدم على كل رسالة أو ملف تنفيذ أقدم متعارض. المواصفة الهندسية وسجلات التاريخ مراجع متطلبات، أما المهمة الحية فتؤخذ من CURRENT_EXECUTION_STATE.md بعد مطابقة HEAD وCI.

**هدف تعديل الكود الوحيد:** https://github.com/Report-Engainall/Nasr1 على main.
**مصادر القراءة فقط:** https://github.com/Report-Engainall/report-insight-engine
**أرشيفات استعادة Bolt:** https://github.com/Report-Engainall/report-insight-engine/tree/main/incoming-archives/nasr1-bolt-recovery-2026-10-17
**رسالة النسخ:** BOLT_BOOT_MESSAGE_2026-10-18.txt
**مؤشر الاستئناف:** CURRENT_EXECUTION_STATE.md
**السجل:** EXECUTION_LOG.md وSOURCE_INTEGRATION_LEDGER.csv وARCHIVE_MANIFEST.csv وARCHIVE_MEMBERS.csv
**المواد الجاهزة:** READY_TO_REUSE/PROVENANCE_MANIFEST.csv وجميع الملفات الفعلية تحت READY_TO_REUSE

## تكليف P2 الإضافي — مصادر NASR المستخرجة وقبول المواصفة (20 أكتوبر 2026)

اقرأ ونفّذ أيضًا docs/bolt-source-reconciliation/P2_ADDITIONAL_ACCEPTANCE_MANDATE_2026-10-20.md. هذا نطاق إضافي لا يلغي next_task_id الحي ولا يكرر ملكية المبرمج 1. مصدر القراءة الإضافي هو Report-Engainall/NASR-MULTI-PROJECTS-TRANSFER/EXTRACTED_PROJECTS فقط؛ لا تعِد استخراج الملفات الموجودة ولا تعدّ الأرشيفين المتطابقين مرتين. يجب مراجعة الوظائف المرشحة مقابل Nasr1 الحالي ثم دمج الفجوات المثبتة فقط واختبارها.


## 1. حواجز إلزامية

1. Nasr1/main هو الهدف الوحيد. لا تنشئ متجرًا أو مستودعًا أو قاعدة بيانات أو Supabase project بديلًا، ولا تنقل التنفيذ إلى Report-Advisor أو Aghbari-Technologies/aghbari-commerce-evolved. بقية المستودعات والفروع وPRs والأرشيفات مصادر للقراءة والمقارنة فقط.
2. لا تستخدم reset أو clean أو force-push أو إعادة كتابة التاريخ، ولا تمحُ عملًا غير محفوظ. افحص الحالة واحفظ التغييرات. إن تقدم main، أعد القراءة وابنِ على الرأس الجديد.
3. حافظ على الكود والواجهات الحالية وهوية Nasr1 وRTL؛ أكمل فوق الموجود ولا تعِد البناء من الصفر.
4. لا تنشئ بيانات وهمية أو أزرارًا شكلية. **لا توجد فواتير تاريخية سابقة مطلوب افتراضها أو اختلاقها.** لا تضف فواتير أو دفعات أو أرصدة افتتاحية تجريبية. اعرض الحالة الفارغة إن لم توجد معاملات حقيقية.
5. لا تضف خدمات أو APIs أو مكتبات أو خطط قد تفرض تكلفة أو فوترة تلقائية. استخدم الموجود والبدائل المجانية فقط.
6. قراءة ملف أو نسخه إلى مجلد مرجعي أو ذكره في تقرير ليست دمجًا. الدمج يعني إدخاله في الوحدة الفعلية، وربطه بالخدمات والمسارات والبيانات والصلاحيات اللازمة، ثم اختباره.

## 2. إقلاع الجلسة والتنفيذ

1. تحقق من main HEAD الحي وbranch وحالة الشجرة وGitHub Actions المطابق لذلك SHA. إن لم تتوفر workspace محلية، اكتب git fetch/status والاختبارات المحلية NOT RUN بدل ادعاء تشغيلها.
2. اقرأ CURRENT_EXECUTION_STATE.md وقارنه بالحالة الحية، وصحح المؤشر القديم. استخدم next_task_id واحدًا فقط؛ لا تكرر إنجازًا مثبتًا ما لم يتغير مصدر/مدخل/اعتماد أو يظهر فشل أو regression أو ثغرة.
3. اقرأ EXECUTION_LOG.md وSOURCE_INTEGRATION_LEDGER.csv وARCHIVE_MANIFEST.csv وARCHIVE_MEMBERS.csv وكل ملف من READY_TO_REUSE.
4. نفّذ تغيير كود مترابطًا ذا معنى؛ التلخيص والخطة وتغيير الحالة وحده لا يكفي. شغّل الاختبارات المتعلقة وأصلح الفشل، ثم احفظ commit آمنًا في main. أعد قراءة SHA النهائي وCI المطابق له بصورة مستقلة.
5. إذا تعذر مصدر، سجّل الرابط وطريقة المحاولة ورسالة الخطأ الحرفية وما بقي غير مفحوص، ثم نفذ في الجلسة نفسها أقرب عمل مستقل ممكن بدل التوقف.

## 3. READY_TO_REUSE — كل ملف، بلا استثناء

افحص كل صف وكل ملف مادي من PROVENANCE_MANIFEST.csv وجميع المجلدات الفرعية، لا README أو أسماء الملفات وحدها. كان العدد المرصود سابقًا 69 صفًا؛ أعد العد من manifest الحي.

لكل عنصر: راجع repository/branch/commit/blob/path والبصمة والمحتوى، قارنه بالكود الحي في Nasr1 وتتبع imports والخدمات والعقود والـroutes والاختبارات والـSQL/RLS/RPC والتبعيات. احتفظ بالأصل المرجعي كما هو.

يجب تسجيل قرار مستقل لكل ملف: ALREADY_PRESENT_EXACT، ALREADY_PRESENT_BETTER، INTEGRATE_AS_IS، ADAPT_AND_INTEGRATE، COMPLETE_EXISTING، KEEP_AS_REFERENCE، DUPLICATE_PROVEN، EXCLUDED_SECURITY، INCOMPATIBLE_WITH_EVIDENCE، BLOCKED. سجّل المصدر والبصمة ومسار الهدف والسبب والتبعيات وأمر الاختبار ونتيجته ورابط الدليل. لا تترك ملفًا مفحوصًا دون قرار؛ لا تستخدم DUPLICATE دون مسار النسخة الأفضل، ولا BLOCKED بلا URL ومحاولة ورسالة خطأ محددة.

ادمج/كيّف كل فائدة مثبتة غير موجودة أو ناقصة داخل الوحدة الفعلية في Nasr1 ووصل imports/services/routes/UI/schema/security/tests اللازمة. لا تهمل helpers وtests وvalidators وretry/idempotency وOutbox وSQL/RLS والتوثيق الأمني. لا تطبق SQL من مصدر مانح مباشرة؛ افحص مخطط Nasr1 وترتيب migrations والقيود وRLS/grants/RPC/search_path وعزل tenant قبل الدمج.

## 4. تنزيل واختبار وفك أرشيفي Bolt

المجلد: https://github.com/Report-Engainall/report-insight-engine/tree/main/incoming-archives/nasr1-bolt-recovery-2026-10-17

- Nasr1_Bolt_Before_Failure.zip — حجم metadata المرصود 1,003,172 بايت؛ Git blob SHA-1: 7c35f3ecde19dc5596fd22053be61924ef3d5318.
- Nasr1_Bolt_Restored_Current.zip — حجم metadata المرصود 997,589 بايت؛ Git blob SHA-1: f01684a56e093a33a173b0965d1d7239c48f0936.
- README_AR.md.

metadata لا تثبت تنزيل البايتات أو اختبار CRC أو فك المحتوى أو الدمج؛ Git blob SHA-1 ليس SHA-256 للـZIP.

حاول جلب البايتات الفعلية في بيئة Bolt/workspace بأداة مجانية (raw GitHub أو API/CLI أو curl/wget). لكل ZIP قِس الحجم، احسب SHA-256، نفذ unzip -t أو اختبار integrity مكافئ وسجّل النتيجة. افحص المسارات لمنع zip-slip والروابط الرمزية غير الآمنة، واستخرج إلى مجلد مؤقت خارج التطبيق. راجع السكربتات قبل تشغيلها، ولا تنقل .env أو secrets أو tokens أو بيانات العملاء إلى Git.

بعد الاستخراج الفعلي فقط، اكتب أعضاء ARCHIVE_MEMBERS.csv بمساراتها وأحجامها وSHA-256 ونوعها وحالة الاستخراج والقرار. لا تخمّن الأعضاء أو البصمات. قارن Before_Failure مع Restored_Current ملفًا بملف، ثم قارن كليهما مع Nasr1/main وجميع READY_TO_REUSE؛ حدد الملفات المفقودة والجديدة والمتغيرة والمكررة بحسب المحتوى والبصمات. ادمج كل فائدة ثبت غيابها ووصلها فعليًا واختبرها. نسخ الملفات إلى مجلد مرجعي لا يساوي الدمج.

إذا تعذر تنزيل binary، سجّل URL والطريقة ورسالة الخطأ الحرفية، ثم واصل فورًا بمصدر نصي متاح أو إصلاح مستقل؛ لا تتوقف ولا تدّعِ فكًا لم يحدث.

## 5. كل الفروع وPRs واللقطات والأرشيفات

افحص كل الفروع وPRs وcommits وdiffs المتاحة مع pagination حتى نهاية القوائم، من Nasr1 والمصادر المانحة ذات الصلة. افحص لقطات Bolt المتاحة أيضًا. آخر حالة مرصودة أظهرت recovery/bolt-snapshot-2026-10-17 وPR #1 كمسودة؛ أعد فحصها حيًا وقارن الملفات، ولا تدمج فرعًا أو PR كاملًا عميانيًا.

راجع incoming-archives/commerce-source-reconciliation والأرشيفات وأدوات الجرد والـworkflows التابعة لها إذا ظلت متاحة. لا تخلطها بمجلد recovery الجديد ولا تعتمد على حجم تاريخي أو اسم بدل البايتات الفعلية. لكل ملف مصدر/عضو أرشيف صف مستقل في SOURCE_INTEGRATION_LEDGER.csv، ولا تختصر مجموعة ملفات في قرار جماعي.

## 6. بناء النسخة الشاملة الموحدة بالترتيب

**أولًا — الأمان وصحة البيانات:** عزل tenant، RLS وRPC وتفويض الخادم، منع تزوير الأسعار والإجماليات من المتصفح، دقة النقدية والمدفوعات والذمم، التزامن ومنع التكرار وسجل التدقيق.

**ثانيًا — التجارة والمخزون والاستيراد والتكامل:** كتالوج وسلة وطلبات ومشتريات وحركات مخزون وجرد وتنبيهات؛ أسعار جملة الجملة/الجملة/التجزئة يحددها الخادم بحسب تصنيف العميل؛ CSV/Excel validation/preview/hash/resume؛ retries/Outbox؛ Onyx Pro عبر external IDs ووقت/حالة آخر مزامنة وسجل الأخطاء. لا تدّعِ Onyx حيًا دون دليل اتصال ومزامنة فعليين.

**ثالثًا — المحاسبة ولوحة الإدارة والتحليلات:** المستندات المالية، دليل الحسابات وقيود اليومية/دفتر الأستاذ وميزان المراجعة والأرباح والخسائر والمركز المالي والتدفق النقدي حين يدعمها النموذج، النقدية والبنوك والمصروفات والذمم وأعمارها وتخصيص الدفعات والمرتجعات والتسويات وإقفال الفترة والتدقيق. إن نقص المخطط فنفّذ migrations/services/permissions/tests؛ لا تضع صفحة أو زرًا شكليًا.

**مركز المهام:** يولّد من أحداث محفوظة فعلية فقط، بمنع التكرار idempotency ومصالحة وإسناد وتدقيق حسب tenant/role. الطباعة لكل المهام أو حسب المبيعات/المحاسبة/المخزن/المشتريات/الإدارة يجب أن تستخدم الفلاتر والصلاحيات نفسها المستخدمة في الشاشة ولا تتجاوز RLS أو تكشف مهامًا مخفية. لا تولّد مهام demo.

## 7. الاختبارات والتسليم

شغّل الاختبارات المرتبطة: frozen install/lock، unit/Vitest، TypeScript/lint، PostgreSQL migrations/acceptance، RLS/RPC/tenant isolation، build، routes، preview/dev smoke، والمتصفح إن توفرت الأداة. أصلح الفشل من جذره؛ غير المشغّل = NOT RUN. لا تختبر بتغييرات مباشرة على الإنتاج.

افصل الحالات: IMPLEMENTED، INTEGRATED، TESTED، BROWSER-PROVEN، PRODUCTION-PROVEN؛ كل منها يتطلب دليلًا منفصلًا. حدّث CURRENT_EXECUTION_STATE.md وEXECUTION_LOG.md وSOURCE_INTEGRATION_LEDGER.csv وARCHIVE_MANIFEST.csv وARCHIVE_MEMBERS.csv وفق ما تحقق فقط. سلّم SHA ورابط commit وCI المطابق والملفات المتغيرة والأوامر والنتائج والمصادر المدمجة ومساراتها واختباراتها وما بقي مرجعًا/محجوبًا ولماذا، ثم next_task_id واحدًا. لا تدعِ اكتمال المصالحة أو التطبيق ما دام عنصر جوهري غير مفحوص أو غير مثبت.


## P2 live checkpoint — Onyx source evidence CSV export and exact-SHA verification — 2026-10-20

- Target: `Report-Engainall/Nasr1`, branch `feat/p2-customer-return-intake-20261020`, PR #18. Code/test SHA: `3fb70618eabd9f93d67f734987a1f196ca4c9084`; base reference: `c3fa1c52bd9c34d111e484b407d5eea2c2cefc07`.
- Exact-SHA CI PASS: [Aghbari Commerce checks 39481288019](https://github.com/Report-Engainall/Nasr1/actions/runs/39481288019). Confirmed 69/69 unit-test files passed (including the new Onyx CSV formatter and browser download tests); isolated PostgreSQL 17 migrations/workflow acceptance passed; lint passed with 0 errors (11 warnings); build passed; production-preview smoke on 4173 and dev smoke on 5173 passed.
- Implemented/integrated `src/lib/onyx-source-evidence-export.ts` and a download control in `src/components/OnyxSnapshotSourceEvidencePanel.tsx`. CSV is rendered only from the existing tenant-scoped `get_onyx_snapshot_source_evidence` RPC response; it exports the database organization identity, snapshot/import linkage and SHA-256 hashes, bounded external-ID samples, truncation indicators and explicit unavailable values. Leading controls/whitespace are scanned by character code and spreadsheet-formula prefixes `= + - @` are neutralized; CSV quotes are escaped. Unit tests cover malicious cells, quoted commas/quotes, missing import links and the unproven live-sync boundary.
- The panel is wired in the existing Onyx Snapshot Center and report analysis paths. It does not re-query around RLS, invent an external source record ID, or label a saved snapshot/import as a live sync. `live_sync_evidence.status=not_proven`, `live_connection_proven=false`, and last live-sync time unavailable remain intentional because no live connection evidence/credential was verified.
- Activation integration revalidated on the same code/test SHA: admin customer invitation control, generated `/customer/activate/$token` route and PostgreSQL acceptance remain present. Database acceptance tests use `auth.users.email_confirmed_at` for email truth, hash-only invitation tokens, tenant/role/email/expiry/replay guards, audit assertions and direct-table-DML denial. No RLS/grants were weakened.
- Preserved failure: [run 39481109555](https://github.com/Report-Engainall/Nasr1/actions/runs/39481109555) failed lint because `no-control-regex` rejected the initial control-character regex. The guard was changed to a character-code scan in commit `3fb70618eabd9f93d67f734987a1f196ca4c9084`; no lint rule was disabled. That exact SHA passed run 39481288019.
- Browser/production proof remains separate: [Playwright workflow 39481288053](https://github.com/Report-Engainall/Nasr1/actions/runs/39481288053) exited successfully after the external-infrastructure gate skipped app launch and actual browser tests. `BROWSER_PROVEN=NOT RUN / BLOCKED_EXTERNAL`; `PRODUCTION_PROVEN=NOT RUN`; local shell tests `NOT RUN`.
- Activation evidence was handed to P1 in [PR #26 comment 6299113226](https://github.com/Report-Engainall/Nasr1/pull/26#issuecomment-6299113226). Merge remains blocked by P1 migration `20261020110000_customer_activation_invitations.sql` colliding with P2 migration `20261020110000_onyx_inventory_reconciliation_apply_rollback.sql`; P2's activation migration remains `20261020140000_customer_activation_invitations.sql`. Do not merge PR #18 and #26 concurrently. P1-owned `PROGRAMMER_1_CURRENT_REPORT.md`, `SOURCE_INTEGRATION_LEDGER.csv` and `READY_TO_REUSE_FILE_AUDIT.csv` were not edited.
- Archive discrepancy 2,329 tree entries versus 2,044 reported extracted files remains unresolved evidence; no re-download, re-extraction or fingerprint recalculation was done.
- State axes: `IMPLEMENTED=YES`, `INTEGRATED=YES`, `TESTED_EXACT_SHA=PASS`; `BROWSER_PROVEN=NOT RUN / BLOCKED_EXTERNAL`; `PRODUCTION_PROVEN=NOT RUN`.

### Resume command
Read this checkpoint and `PROGRAMMER_2_CURRENT_REPORT.md`, then execute only `NASR1-ORIGINAL-SPEC-CUSTOMER-PRICE-PRIVACY-RECONCILIATION-010`. Do not revisit the closed Onyx CSV substep unless its exact-head tests regress. Re-read and verify the new code/test SHA separately from any later documentation-only HEAD; never label a doc-only successor as CI-tested without a matching run.
