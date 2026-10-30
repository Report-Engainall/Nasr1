# P1 LIVE SESSION COMMAND — 2026-10-30
Current main base: `643d2821ab0483acc12ef21abc453a0c745f2865`. Exact Core [41014174530 SUCCESS](https://github.com/Report-Engainall/Nasr1/actions/runs/41014174530) and cleanup [41014174522 SUCCESS](https://github.com/Report-Engainall/Nasr1/actions/runs/41014174522) are on this exact SHA. P2 [41014174609 IN_PROGRESS](https://github.com/Report-Engainall/Nasr1/actions/runs/41014174609) is on this exact SHA; do not duplicate it. Hosted customer/order/tenant is SKIPPED and must not be represented as PASS.

## التنفيذ المطلوب الآن — REF UI integration
1. Read only the first 80 lines of `docs/bolt-source-reconciliation/CURRENT_EXECUTION_STATE.md`, this command, and `docs/execution/P1_CHECKPOINT.md`; verify main and inspect only changed P1 paths.
2. Use existing P3 components:
   `import { ActionCard, EvidencePassport } from "@/components/intelligence";`
   and the public types:
   `ActionCardProps, EvidencePassportProps`.
3. Build/mount the P1-owned intelligence workspace/route composition against the P2 response contract `src/lib/intelligence/aggregate-contract.ts` and `docs/execution/contracts/P3_INTELLIGENCE_AGGREGATE_CONTRACT.md`. It must preserve loading, empty, error+retry, unavailable and ready states. Do not fabricate an RPC name or send tenantId/role/capability from browser.
4. Render only server-returned verified/partial evidence and actual decision candidates. Keep amounts/currency optional, display each currency separately, null as “غير متاح”, What-if as SIMULATED with assumptions/constraints/baseline, and do not locally mutate decision lifecycle or grant RBAC. CTAs call only the P2-published command.
5. Add direct route/component regression tests for state transitions, missing DTO, null impact/currency, evidence states and no client-side fabricated values. Run targeted tests; record exact code SHA and screenshots/runtime proof. Do not rerun Customer 360 work or scan the reference gallery.
6. If P2 aggregate service is not yet merged, finish the reusable UI composition with an explicit UNAVAILABLE state and strict typed props; do not connect legacy dashboard aggregates that lack full source/formula lineage as if they were verified intelligence.

P1 ownership: `src/components/**`, `src/routes/**`, `src/styles.css`, `AghbariApp.tsx`, UI tests under `src/test/**`, except P3-reserved intelligence components and P2-owned service/e2e paths. Do not push main. Commit locally and report Task ID, base/result SHA, changed paths, targeted test results, blocker, and exact next command to P3.

**Exact next command:** implement the P1-owned intelligence workspace component using ActionCard/EvidencePassport imports and the typed `IntelligenceAggregateResponse`; create the first route mount only when the server DTO is available, otherwise preserve UNAVAILABLE and add the focused no-mock state test.

---

# CURRENT P1 SESSION ENTRY — LIVE OVERRIDE 2026-10-30
Read the first 80 lines of `docs/bolt-source-reconciliation/CURRENT_EXECUTION_STATE.md` and `docs/execution/P1_CHECKPOINT.md`; the live allocation there overrides the historical handoff below. Resume from code SHA `a23c0b5cea98730f59093aa2f3e8f658509eddb4`; P3 Core run `41010611128` is IN_PROGRESS on that SHA, poll it; do not duplicate. P1's old Customer 360 CI run `41004028451` already completed SUCCESS and its UI slice is integrated; do not repeat it. Continue the first uncovered UI acceptance leaf under DLV-002/003 from the existing CSV, implement the real UI state + focused regression test. P1 owns routes/components/styles and src/test UI tests except P3-reserved intelligence paths. P2 owns e2e/**/backend, P3 owns intelligence and global governance. P3's components are now available via `import { ActionCard, EvidencePassport } from '@/components/intelligence'`; read `docs/execution/contracts/P3_INTELLIGENCE_P1_COMPONENT_CONTRACT.md`. Mount only P2-backed aggregate data; no local mock metrics or synthetic decisions. Preserve worktrees/dirty files, inspect changed paths only, checkpoint every 10 minutes. Do not execute any stale NEXT ACTION lower in this file.

---

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

 
## P3 intelligence integration addendum — current contracts
Import ActionCard and EvidencePassport from @/components/intelligence. P3 pure modules are exported from @/lib/intelligence. P1 owns routes, navigation, state orchestration and event callbacks. Do not change AghbariApp.tsx from P3.
Mount the P2 tenant-safe DTO only. Display separate currency cards; show no total across currencies. Preserve all evidence states and null values. Scenario outputs must be visibly labeled SIMULATED and must not look like ledger values. Decision lifecycle events call P2 persistence, never local state mutation. Learning compares only verified same-unit/currency/period values. AI UI shows provider availability/fallback reason but no keys, prompts, or raw commercial data. Health cards show per-probe evidence/freshness. RBAC views are explanatory and use the server canonical permission catalog only.


## P3 handoff — pending consumer integration
Mount the committed ActionCard and EvidencePassport components using the contracts in docs/execution/contracts/P3_INTELLIGENCE_P1_COMPONENT_CONTRACT.md. P3 engines/types are exported from @/lib/intelligence. Consume tenant-scoped DTOs only. Do not use demo data, do not flatten currencies, preserve UNAVAILABLE/null states, label scenario results SIMULATED, and route lifecycle actions through P2 persistence. Update P1_CHECKPOINT with exact SHA, screenshots/UI tests and exact next command; do not rescan the 84 reference images.
