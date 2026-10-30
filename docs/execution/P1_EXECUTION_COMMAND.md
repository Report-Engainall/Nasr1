# التكليف التنفيذي الدائم — P1 — واجهة وتجربة متجر الأغبري Nasr1

أنت P1 في فريق التنفيذ الثلاثي P1/P2/P3. المطلوب كود واختبارات وتدفقات حقيقية، لا تقرير ولا إعادة بناء.

## استئناف إلزامي — لا تعِد البحث
1. اقرأ أول 80 سطراً فقط من `docs/bolt-source-reconciliation/CURRENT_EXECUTION_STATE.md`.
2. اقرأ `docs/execution/CONTINUOUS_PARALLEL_EXECUTION_PROTOCOL.md` وملفك هذا.
3. اقرأ `docs/execution/P1_CHECKPOINT.md` لاستعادة الموضع الدقيق.
4. تحقق من SHA الرئيسي وActions مرة واحدة. طابق SHA المحفوظ؛ إذا تحرك، قارن paths التي تغيرت فقط.
5. نفّذ `exact_next_command` المحفوظ. لا تبدأ architecture audit ولا repository-wide scan.
6. معرض الصور الثابت: `docs/reference-app/README.md`. راجع صور المجال المرتبط بالمهمة فقط؛ لا تطلب الأرشيف مجدداً ولا تعِد فكّه.

## أول مهمة استئناف محفوظة
استأنف DLV-010 من P1_CHECKPOINT:
- افحص Core run `41004028451` على SHA `9f5d3af8e4f57bd758f3eb779cb6971be0a7d829`، واستعلم عن نفس run إن لم ينته؛ لا تكرره.
- P2 run `41004028314` كان ملغى بسبب تعارض concurrency ولم يصل إلى الوظائف؛ لا تعتبره PASS ولا تنقل نتيجة P2 من `d3159bc` إلى `9f5d3af`.
- قارن ملفات P1 المتغيرة على main فقط ثم أكمل أول بند DLV-010 مفتوح ومملوك لـP1.

## الملكية
- تملك `src/routes/**`, `src/styles.css`, `src/components/**` افتراضياً، واختبارات الواجهة في `src/test/**`.
- يستثنى من ملكيتك مسارات P3: `src/components/intelligence/**`, `src/lib/intelligence/**`, `src/components/ExecutiveStoreAnalytics.tsx`, `src/components/StaffDashboardMetrics.tsx`, `src/components/AdminCustomer360.tsx`, `src/components/TaskCenter.tsx`, `src/lib/business-intelligence.ts`, `src/lib/sales-forecast.ts`, `src/lib/executive-analytics.ts`, `src/lib/customer-360-summary.ts` واختباراتها المباشرة.
- تملك `AghbariApp.tsx` وroutes لتركيب وحدات P3. لا تعدل ملفات P3؛ اطلب Component API/props واضحاً في P3_CHECKPOINT.
- ممنوع تعديل `supabase/**`, `scripts/**`, `src/lib/api.ts`, `src/lib/supabase.ts`, `src/lib/auth.tsx`, مكتبات P3، المؤشر العالمي، CSV، registry أو EXECUTION_LOG.
- عند احتياج API اكتب REQUEST TO P2 داخل P1_CHECKPOINT: task ID، route/action، payload/response، tenant/role، error/SQLSTATE، idempotency/audit/side effects، acceptance test. لا تنشئ mock كبديل عن عقد خادمي.

## مهمات UI في المسارات العشرة
اعمل على صفوف UI المفتوحة في المصفوفة المركزية فقط:
- W02–W05: routes/identity/catalog/cart/checkout/membership/offline.
- W06–W07: المخزون والمالية والمشتريات والاستيراد/Onyx UI.
- W08–W09: Customer/Executive dashboards وتقارير/AI/WhatsApp UX؛ استورد وحدات P3 بعد استلام props contract.
- W10: route states/accessibility/responsive/performance/health/handover UI.
اجعل RTL عربياً صحيحاً، واهتم بالهواتف والشاشات الكبيرة وkeyboard/screen readers. لكل شاشة loading/empty/error/retry/unauthorized/success/offline حيث يلزم. لا تعرض success قبل server readback.

## العمل المرجعي المضاف
راجع معرض `docs/reference-app/README.md` عند الحاجة. المطلوب ليس نسخ تصميم مرجعي أو ألوانه حرفياً؛ بل استلهام وضوح مركز القيادة، Action Cards، التقارير، الإعدادات، المهام، والصحة مع هوية الأغبري. لا تنسخ أرقام الصور أو بياناتها أو أخطاءها.

## حفظ العمل والتنسيق
- حدّث `docs/execution/P1_CHECKPOINT.md` كل 10 دقائق أو بعد كل task/commit/failure أو قبل انقطاع متوقع.
- سجل UTC، task ID، base/result SHA، paths المحجوزة، ملفات dirty، local commit، أمر الاختبار والنتيجة، CI run IDs/links، root cause/retry count، contract request، blocker، exact_next_command.
- استخدم detached local worktree عند توافره. أنشئ commits صغيرة محلية ولا تدفع main؛ P3 هو الوحيد الذي يدمج ويدفع إلى main. لا تستخدم git index مشتركة بالتزامن.
- عند نفاد الرصيد أو انقطاع الإنترنت احتفظ بالعمل كما هو وحدث checkpoint؛ لا reset/clean/stash/delete. لا تقل إن التقدم محفوظ في GitHub إذا لم يصل فعلاً.

## منع الدوران والإغلاق
لا تعِد inventory أو full scan أو tests مقبولة بلا regression/dependency change. محاولتان لنفس السبب ثم حل آمن/بديل وانتقل.
سلّم P3: acceptance IDs، paths، local commit SHA، tests، browser/runtime proof status، طلب P2، blocker، وNEXT EXACT COMMAND. لا تستخدم COMPLETE بلا دليل exact SHA.
