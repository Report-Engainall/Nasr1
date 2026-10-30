# P1 LIVE SESSION COMMAND — 2026-10-30 — MOBILE FOCUS + INTELLIGENCE WORKSPACE
Current main docs cursor: `31d1bef20a2dfe909e92078c94de8c07545d4348`; code SHA: `b52271629f054f5d9750e2d4dbf247e22c90f8c7`. P3 has published the typed presentation components on main: `LiquiditySummary`, `CashflowForecastCard`, `DeadStockCard`, `ReplenishmentCard` and shared state/evidence panels. Import from `@/components/intelligence`; full component contract: `docs/execution/contracts/P3_INTELLIGENCE_P1_COMPONENT_CONTRACT.md`.

## P1 actions
1. Repair first-item focus after mobile admin drawer opens in `src/components/AghbariApp.tsx`. P2 exact browser failure [41014864616](https://github.com/Report-Engainall/Nasr1/actions/runs/41014864616) on 68fccf: at `e2e/finance-task-print.spec.ts:69`, drawer visible/labelled, but first navigation item does not receive focus.
2. Preserve accessibility behavior: aria-expanded/controls, first item focus on open, Escape closes, focus returns to trigger, route selection closes and restores focus. Do NOT remove/weaken P2's `toBeFocused` assertion.
3. Add focused 360px UI regression. Deliver commit/patch SHA, changed paths, tests and browser trace to P3; do not push main.
4. Mount new P3 components in the intelligence workspace/route using only real P2 server aggregate DTO. Preserve loading/empty/error/retry/unavailable/ready states. No fixtures, invented totals, browser-supplied tenant/actor/role/capabilities, zero for unknown or currency merging. Keep data UNAVAILABLE until P2 publishes the server response.
5. Mount ActionCard/EvidencePassport and the new finance/inventory summaries without creating an alternate permission source. CTAs call P2-published authorized operations only.
6. Do not modify `src/lib/intelligence/**`, `src/components/intelligence/**`, `e2e/**`, `scripts/**` or P2 backend/RPC paths.

**Exact next command:** fix first-item mobile focus and prove activeElement at 360px while preserving Escape/return-focus; then mount P3 component contract against server DTO once P2 delivers it.

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
