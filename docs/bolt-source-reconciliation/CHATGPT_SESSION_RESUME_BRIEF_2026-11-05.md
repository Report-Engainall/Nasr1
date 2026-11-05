# OWNER CLARIFICATION — EXECUTION ORDER CORRECTION — 2026-11-05

**Highest priority: do not connect to Bolt yet.** The current phase is to continue completing the greatest practical amount of the existing Aghbari product body on NASR1/main first. The earlier text in this brief that labels BOLT-RUNTIME-001 as the immediate next action or says to stop DLV work until Bolt is verified is superseded by this owner clarification.

Current work: implement and accept all source/product-level gaps that can be completed without Bolt-provisioned resources. Preserve all screens, routes, workflows, business engines, SQL/migrations, RPC contracts, tests and documentation. Lovable source detachment is already complete; do not repeat it or reintroduce it. Do not create a Bolt project, sign in, import/sync main, provision Bolt DB, or run Bolt Preview during this phase. Continue on Report-Engainall/Nasr1 main only.

Activate BOLT-RUNTIME-001 only when the product body is at practical handoff readiness: source-level/product feature items that do not require Bolt's own provisioned resources are completed or have precise evidence-backed blockers. No arbitrary percentage or unsupported completion claim. At that later point, import the then-current main once into Bolt, use Bolt's built-in database/auth/storage/server functions, preserve every existing data/security/business contract, and let Bolt run Preview plus real E2E/security/commerce acceptance on one exact SHA. Do not use the historical ZIP as an overlay, separate external Supabase, Lovable services, paid billing, or weakened access controls.

CURRENT NEXT ACTION: BODY-COMPLETION-ON-MAIN-001.
DEFERRED ACTION: BOLT-RUNTIME-001 (only after the product-body handoff gate).

---
# SESSION RESUME — FINAL VERIFIED CURSOR — 2026-11-05

- Last verified main before this documentation correction: `Report-Engainall/Nasr1@main` SHA `9cb9d23ee1149fbe2a66988da48a6c076c8e15fe`. Fetch live `main` again before importing; this final follow-up changes documentation only.
- Application code SHA proven by CI: `45ca19c47a985b2d12d23c846ba068222a4e17ce` (the one commit from `45ca19c47a985b2d12d23c846ba068222a4e17ce` to `9cb9d23ee1149fbe2a66988da48a6c076c8e15fe` is documentation-only).
- Portability source commit: `b0a091e0a506da43a9b0d0dd0d1e9b992498ca63`; CI/test correction commit: `45ca19c47a985b2d12d23c846ba068222a4e17ce`.
- Core [41940874587 SUCCESS](https://github.com/Report-Engainall/Nasr1/actions/runs/41940874587): 272 files / 1,786 tests PASS, PG17/backup-restore/lint/build/Nitro-Vite preview/dev/price visibility PASS.
- P2 [41940874520 SUCCESS](https://github.com/Report-Engainall/Nasr1/actions/runs/41940874520): public UI 17/17; local authenticated E2E SUCCESS including orders/tenant, stock-count and purchase XLSX, checkout retry, returns, Onyx, print, customer-manager privacy/audit, and device-session revocation. Hosted customer/order/tenant remains SKIPPED_EXTERNAL.
- P1 TypeScript/static/secret scan/main cleanup all PASS on `45ca19c47a985b2d12d23c846ba068222a4e17ce`. Vercel check FAILURE; not Bolt evidence.
- Bolt runtime is still NOT VERIFIED. No Bolt project, built-in DB, auth, storage, server functions or Preview was accessed from ChatGPT.
- NEXT_ACTION_ID: `BOLT-RUNTIME-001`. Fetch and import the live latest `main` into Bolt (last verified pre-update cursor `9cb9d23ee1149fbe2a66988da48a6c076c8e15fe`); do not import the old ZIP over main; select Bolt's built-in Database, not a separate external Supabase connection; map the complete existing SQL/RPC/transaction/RLS-equivalent auth/storage/Edge contracts; preserve idempotency, audit, tenant isolation and pricing privacy; run Preview and the full acceptance suite on a single exact SHA. Do not mark done until Bolt returns evidence.
- Use `docs/bolt-source-reconciliation/BOLT_EXECUTION_PROMPT_AR_2026-11-05.md` as the single handoff instruction. Do not repeat completed archive, Core or P2 work.

---

# SESSION RESUME OVERRIDE — 2026-11-05 — CURRENT MAIN `45ca19c47a985b2d12d23c846ba068222a4e17ce`

Continue only from `Report-Engainall/Nasr1@main`; no branch or rebuild.

- Latest verified main SHA: `45ca19c47a985b2d12d23c846ba068222a4e17ce`.
- Application portability baseline: `b0a091e0a506da43a9b0d0dd0d1e9b992498ca63`.
- CI correction/test SHA: `45ca19c47a985b2d12d23c846ba068222a4e17ce`. Core PASS: 272/272 files, 1,786/1,786 tests; PostgreSQL 17, backup/restore, lint, build, Nitro/Vite preview, dev smoke and price visibility PASS. P1 TypeScript, static analysis, secret scan and branch cleanup PASS.
- P2 exact-head run `41940874520`: public UI 17/17 PASS; local Supabase authenticated E2E had passed through order/tenant, stock-count XLSX, purchase-order XLSX, checkout replay, returns/credit memo and Onyx XLSX; finance/task print was active in the last observation. Hosted customer/order/tenant test SKIPPED_EXTERNAL.
- Changed in `45ca19c`: Core and P2 preview launchers now use Vite preview for the actual Nitro output; auth test expects Bolt-native setup messaging; two new runtime-diagnostic privacy tests. No product screen, business engine or database migration was removed.
- The legacy Vercel status is FAILURE and is not a Bolt acceptance result.
- Bolt runtime remains NOT VERIFIED. ChatGPT has not connected to Bolt or changed any Bolt project resource. The immediate task remains `BOLT-RUNTIME-001`: import latest main, use Bolt's built-in Database (not an external Supabase connection), map existing database/auth/storage/server-function contracts without weakening RLS-equivalent tenant checks, atomic RPCs, audit, idempotency or pricing privacy, then run Bolt Preview and full acceptance on one exact SHA.
- Bolt single-message execution instructions: `docs/bolt-source-reconciliation/BOLT_EXECUTION_PROMPT_AR_2026-11-05.md`.
- Never repeat the archive audit or auth patch; do not redo passed Core/P2 steps. First inspect the P2 run's terminal state, record it, then proceed to Bolt integration.

---

## EXECUTION OVERRIDE — 2026-11-05 — SOURCE PORTABILITY BATCH COMPLETED; BOLT DATABASE PORT IS NEXT

- Latest application-source commit: `b0a091e0a506da43a9b0d0dd0d1e9b992498ca63` (the docs handoff commit may be newer; preserve this code SHA as the source change reference).
- Removed the Lovable Vite package/config, editor-preview auth bridge and editor telemetry; replaced with native Vite/TanStack Start/Nitro/React/Tailwind/path-alias configuration and vendor-neutral browser error diagnostics.
- Updated Bolt database bootstrap guidance and accepted the standard `SUPABASE_ANON_KEY` naming alternative without exposing server secrets.
- No Bolt database, auth, storage, server function or Preview test has been run yet. Existing Supabase/PostgreSQL contracts and migrations remain preserved for a faithful Bolt mapping.
- Use the one-shot prompt `docs/bolt-source-reconciliation/BOLT_EXECUTION_PROMPT_AR_2026-11-05.md` when importing the latest main into Bolt. Do not spend credits on another plan-only pass.
- NEXT_ACTION_ID: `BOLT-RUNTIME-BOLT-DB-PORT-001`.

---

# CHATGPT SESSION RESUME — AGHBARI COMMERCE — 2026-11-05

انسخ الرسالة كاملة عند بدء أي جلسة ChatGPT جديدة. هذه هي ذاكرة الاستئناف التنفيذية؛ لا تطلب من المستخدم إعادة شرح التاريخ.

## 1) دورك وطريقة العمل
أنت المسؤول التنفيذي عن مواصلة مشروع متجر الأغبري، لا محلل يكرر الخطط. ابدأ من المستودع والوثائق الحالية، واتخذ الخطوة العملية التالية مباشرة. المستخدم يرفض الدوران والتلخيص المتكرر والفحوصات التي لا تضيف إنجازًا جديدًا. في كل انطلاقة أنجز تغييرات حقيقية متعددة ومترابطة كلما أمكن، ولا تستهلك الجلسة في إعادة اكتشاف ما هو موثق.

## 2) المشروع ومصدر الحقيقة
- المنتج: متجر الأغبري | Aghbari Commerce.
- المستودع الوحيد: https://github.com/Report-Engainall/Nasr1
- الفرع الوحيد: `main`.
- قبل التعديل، احصل على HEAD الحالي مباشرة من GitHub؛ لا تعتمد SHA قديمًا في هذه الرسالة إذا تقدم المستودع.
- نقطة كود التطبيق التي فُحصت عند بدء مصالحة الأرشيف: `a15b4751920c0678fbe8edb7c9a6b545206cf8b2`. التزامات التوثيق اللاحقة لا تعني اختبار التطبيق على SHA أحدث.
- اقرأ أعلى `docs/bolt-source-reconciliation/CURRENT_EXECUTION_STATE.md` أولًا؛ تعليمات `EXECUTION OVERRIDE — 2026-11-05` هي أولوية الاستئناف الحالية، وتسبق مؤشرات NEXT_ACTION القديمة حتى إغلاق BOLT-RUNTIME-001.

## 3) قرار المالك النهائي — لا Lovable ولا حذف للمنجز
المستخدم لا يريد أي اعتماد تشغيلي أو برمجي على Lovable أو Lovable Cloud أو حسابه أو إعداداته أو Telemetry أو preview/session bridge الخاص به.
الهدف هو تشغيل نفس التطبيق الموجود في بيئة Bolt، مستفيدًا من قاعدة البيانات والمصادقة والتخزين ووظائف الخادم التي يتيحها Bolt في مساحة العمل. Bolt هو من يربط التطبيق بقاعدة البيانات المتاحة لديه وينفذ التشغيل وPreview والاختبارات داخل بيئته.

هذا ليس مشروعًا جديدًا ولا إعادة بناء ولا إعادة تصميم. احتفظ وطوّر كل ما سبق بناؤه:
- جميع واجهات العميل ولوحة الإدارة وجميع الشاشات والمسارات والمكونات والأنماط والهوية وRTL والترجمات.
- جميع الوظائف وسير العمل وقواعد الأعمال والطلبات والمنتجات والتسعير والمخزون والمشتريات والمحاسبة والتحصيل والمرتجعات.
- جميع محركات Onyx والاستيراد/التصدير والتقارير وCustomer 360 والذكاء الاصطناعي والمهام والقرارات والسيولة والتنبؤات والذكاء والتحليلات وPWA.
- جميع ملفات SQL/migrations وRPC وEdge Functions والاختبارات والمستندات والأصول.
- لا تحذف ميزة أو اختبارًا أو محركًا أو شاشة لمجرد تسهيل النقل. لا تختزل النطاق ولا تنشئ بدائل شكلية. غيّر محولات البيئة والاتصال فقط بقدر الحاجة، مع الحفاظ على السلوك والعقود والأمان.

## 4) الأرشيف المرسل من المستخدم — مساره واسمه الدقيق
- الاسم كما رفعه المستخدم: `project-bolt-github-8ccbjvhg (2).zip`.
- مساره المحلي في حاوية ChatGPT السابقة: `/mnt/data/project-bolt-github-8ccbjvhg (2).zip`.
- SHA-256: `db56924e7d629e480c96652ada8090f9605f466ccb773580446ce5b45cb09bc9`.
- الحجم نحو 6.5 MiB، ويحتوي 1,119 ملفًا، والجذر الداخلي `project/`، ولا يحتوي بيانات Git metadata.
- تنبيه: مسار `/mnt/data/...` خاص بحاوية ChatGPT السابقة وليس مسارًا يستطيع Bolt الوصول إليه. إذا احتاج Bolt إلى فحص الأرشيف في حسابه الجديد، يجب أن يرفعه المستخدم كمرفق إلى Bolt؛ لكن نتيجة المصالحة والأدلة المهمة محفوظة في GitHub ولا ينبغي إعادة الفحص دون سبب.
- SHA نقطة الأرشيف: `3f33dba1d1879fc1426a2428e331b496c6241dae`. مقارنة GitHub وقت الفحص مع `a15b4751920c0678fbe8edb7c9a6b545206cf8b2` أعطت 46 commits ahead و0 behind لصالح main؛ الأرشيف سلف تاريخي لـ main وليس إصدارًا أحدث.
- ميزة Excel لقائمة مراجعة المرتجعات وملفاتها الأربعة متطابقة في main، فلا تعِد دمجها. main يحتوي أعمالًا أحدث من الأرشيف، منها اختبارات E2E لشراء/جرد وWorkflow النسخ الاحتياطي والاستعادة.
- الأرشيف يحتوي `.env` بقيم حساسة؛ يمنع نسخها أو إظهارها أو رفعها إلى Git. لا تستبدل `bun.lock` بـ `package-lock.json` القديم، ولا ترفع `tsconfig.tsbuildinfo`، ولا تنسخ `supabase/config.toml` القديم فوق الحالي.
- تقرير المصالحة: `docs/bolt-source-reconciliation/BOLT_ARCHIVE_RECONCILIATION_2026-11-05.md`.

## 5) Patch المصادقة المرفوع منفصلًا
- الملف: `auth-session-refresh-race.patch`.
- SHA-256: `28ba873d4f31ca547851003434d623154ff4564f3c234eb0a22f70c0097926fd`.
- التغيير موجود بالفعل في `src/lib/auth.tsx` والاختبارات موجودة في `src/test/auth-session-cache-boundary.test.tsx`؛ يمنع إعادة تطبيقه.
- عند نقل المصادقة إلى Bolt، حافظ على ضمانات generation guard ومنع profile قديم من استبدال هوية أحدث بعد تبديل الحساب أو logout، والتعامل مع `INITIAL_SESSION`.

## 6) الوثائق التي جرى إكمالها داخل المستودع
- المواصفة الأصلية `docs/canonical/AGHBARI-MASTER-PROJECT-SPECIFICATION.md`: تمت إضافة §24 لنقل التشغيل إلى Bolt دون إعادة بناء المنتج.
- الملحق القائم `docs/bolt-source-reconciliation/UPDATED_SPEC_ADDENDUM.md`: تمت إضافة §7 لمصالحة أرشيف Bolt ومسار الملف وSHA وPatch القرار المعماري.
- المواصفة الاستراتيجية لمحركات التاجر `docs/canonical/AGHBARI_COMMERCE_UNIFIED_MERCHANT_INTELLIGENCE_AND_EXECUTION_MASTER_AR_2026-10-17.txt`: تمت إضافة §64، مع الاحتفاظ بالأقسام 1–63 كاملة.
- مصفوفة القبول الوحيدة `docs/bolt-source-reconciliation/REMAINING_SCREEN_ACCEPTANCE_MATRIX_2026-10-22.csv`: أضيف الصف `BOLT-RUNTIME-001`؛ لا تنشئ مصفوفة ثانية.
- أعلى `docs/bolt-source-reconciliation/CURRENT_EXECUTION_STATE.md`: يحتوي Override صريحًا لحفظ المنتج ونقل التشغيل إلى Bolt.
- `docs/bolt-source-reconciliation/EXECUTION_LOG.md`: يسجل نتائج المصالحة وتوضيح المالك.
- هذه الوثيقة: مرجع الاستئناف لك في ChatGPT.

## 7) محركات الذكاء والميزات المتقدمة — لا تنسَ شيئًا منها
كل ما في المواصفة الأصلية وأقسامها 1–24، والملحق 23 للذكاء المجاني وFree-Quota Router والخصوصية وCash/Liquidity Command Center وAction Cards وEvidence Passport وWhat-if Lab وAI Ops/Fallback وSystem Health/Error Center وRBAC Matrix، وكل ما في وثيقة التاجر الذكي §§1–64 يظل جزءًا من النطاق.
تشمل المحركات المحاسبة المزدوجة، الخزينة والسيولة، الذمم والائتمان، المشتريات والموردين، WMS والمخزون، تكلفة المنتج والربحية، التجارة B2B، CRM والاحتفاظ، Workflow والموافقات، BI، AI Gateway والذكاء المجاني، Decision/Action/Outcome، Task Intelligence، Growth Radar، Business Health/Working Capital/Dead Stock، Decision Memory/Learning Loop، Shift/Day Close، Bottleneck/Cycle Time، Policy/What-if، Data Reliability/Evidence Passport، Natural Language Assistant، System Health/Error Center، RBAC Capability Matrix، Integration/Reconciliation، PWA/Offline، Backup/Recovery.
لا تضف محركًا موازيًا؛ طوّر المحرك الموجود. لا تعد الميزة مكتملة لمجرد وجود عنوان أو شاشة.

## 8) BOLT-RUNTIME-001 — العمل الحالي المحدد
المطلوب ليس فحصًا مطولًا أو تجربة مهاجرات من ChatGPT؛ المطلوب تحضير المنتج والوثائق كي ينفذ Bolt الربط في بيئته.
على Bolt عند استيراد أحدث NASR1:
1. يحافظ على كل محتويات main ولا يستورد ZIP القديم فوقها.
2. يستبدل `@lovable.dev/vite-tanstack-config` في `vite.config.ts` بإعداد مدعوم في Bolt، مع المحافظة على TanStack routes/loaders/server behavior.
3. يستبدل Lovable error telemetry بآلية أخطاء محايدة/متاحة في Bolt ويحافظ على التشخيص الآمن.
4. يستبدل Lovable preview/session storage bridge في ملفات Supabase integration بآلية Bolt auth/session الرسمية.
5. يزيل رسائل `Connect Supabase in Lovable Cloud` ومتغيرات البيئة المرتبطة بإعداد Lovable، ويجعل الاتصال يستخدم موارد Bolt المتاحة فعليًا. لا يستخدم مفاتيح وهمية.
6. يربط قاعدة Bolt والمصادقة والتخزين ووظائف الخادم المتاحة بواجهات التطبيق الحالية.
7. يحافظ على عقود قاعدة البيانات وRPC والمعاملات وRLS-equivalent tenant isolation وRBAC وخصوصية الأسعار وaudit وidempotency وسلامة المحاسبة والمخزون.
8. لا يحول العمليات الحساسة إلى browser CRUD ولا يحذف migrations أو business logic.
9. يقوم Bolt نفسه بتشغيل Preview وربط DB وتنفيذ اختبارات البيئة والواجهات على SHA واحد. لا تطلب من ChatGPT تكرار نفس الفحوص خارج Bolt.
10. لا يدّعي نقل بيانات العملاء/الطلبات/الأرصدة/المستخدمين القديمة إلا إذا توفرت نسخة بيانات وتمت استعادتها ومطابقتها.
11. لا يفعّل تكلفة أو خطة مدفوعة أو auto-billing دون موافقة صريحة.
12. بعد ثبوت تشغيل التطبيق ببيئة Bolt، يواصل أول متطلب مفتوح فعلًا في checkpoint والمصفوفة، ولا يعود لبداية DLV/REF.

## 9) دور ChatGPT في كل جلسة لاحقة
- تحقق من live main SHA واقرأ هذا المرجع وCURRENT_EXECUTION_STATE؛ لا تطلب من المستخدم شرح التاريخ مرة أخرى.
- نفّذ كل ما تستطيع من توثيق أو مصالحة مصدرية أو تعديل ملفات المصدر عبر الأدوات المتاحة، مع تغييرات فعلية مفيدة في كل انطلاقة.
- لا تقضِ الجلسة في اختبارات بناء/Preview/قاعدة بيانات لا تملك بيئة Bolt لها؛ Bolt مسؤول عن ذلك. سجّل أن الاختبار ينتظر Bolt ولا تدّع PASS.
- لا تكرر مراجعة الأرشيف أو Patch المصادقة أو ملفات Excel المتطابقة.
- لا تنفذ نقل قاعدة البيانات من خارج مساحة Bolt ولا تخترع مورد اتصال. جهّز المطابقة والعقود والتوجيه، واترك الربط الفعلي وبيانات البيئة لـ Bolt.
- لا تحذف عملًا سابقًا. إذا ظهر تعارض، حافظ على النسختين حتى توثيق القرار، ولا تعمل overwrite.
- أي تعديل يجب تسجيله في checkpoint والمصفوفة الوحيدة وسجل التنفيذ ببصمات SHA وأسماء الملفات.

## 10) رسالة الإغلاق عند أي انقطاع
اكتب داخل checkpoint: live main SHA، آخر code SHA، الملفات المتغيرة، ما اكتمل بدليل، ما ينتظر Bolt، العوائق الحقيقية، وNEXT_ACTION_ID واحد محدد. لا تكتب PASS أو Complete بلا دليل.

## الحالة عند إعداد هذا المرجع
- تمت إضافة المواصفات والملحقات والصف المركزي BOLT-RUNTIME-001 إلى NASR1.
- تمت مصالحة الأرشيف وإثبات أن أهم إضافة Bolt المحددة موجودة بالفعل في main.
- تم التحقق من أن auth-session-refresh-race.patch موجود بالفعل في main.
- لم يتم تغيير source code للتطبيق في دفعة التوثيق هذه، ولم ينفذ ChatGPT اختبار Bolt أو Preview أو DB. التنفيذ البيئي الفعلي على Bolt ما زال مطلوبًا.
- NEXT_ACTION_ID: `BOLT-RUNTIME-001`.