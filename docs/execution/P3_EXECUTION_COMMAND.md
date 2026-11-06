# CURRENT P3 SESSION ENTRY — TWO-IMPLEMENTER LIVE OVERRIDE — 2026-11-06

**Repository:** `Report-Engainall/Nasr1`  
**Branch:** `main` only  
**Current documentation/source head at this override:** `9b70d56c1502e679698e65e576289dd5b1e9a3a8`  
**Latest P3 code-bearing commit:** `82899058fac253bdaafe5de4ad754b60e7c637ec`  
**Latest P3 detailed checkpoint:** `docs/bolt-source-reconciliation/PROGRAMMER_3_EXECUTION_CHECKPOINT.md`  
**Canonical P3 checkpoint:** `docs/execution/P3_CHECKPOINT.md`

## Binding role split — exactly two implementers

- **P1:** body completion from the original product specification and executive implementation appendix; owns commerce surfaces, app shell, routes, navigation and the mounts explicitly assigned to P1.
- **P3:** body completion from the canonical Intelligent Engines Reference; owns deterministic intelligence engines, decision/learning logic, evidence contracts, intelligence clients and standalone intelligence components, plus tightly scoped source migrations where the existing authenticated tenant/security contract is already established.
- There is no assigned third/P2 programmer. Do not wait for or invent one. A missing cross-cutting tenant/authentication/security foundation is a real dependency: do not bypass it or fake it; continue independent P3 work and record the exact blocked source contract.
- P3 does not edit P1-owned `AghbariApp.tsx`, routes, commerce pages, global navigation or `IntelligenceWorkspace.tsx`. Reuse existing components and deliver exported, composable intelligence features for P1 to mount when a P1-owned mount is required.
- Do not create duplicate engines, pages, CRUD, routes or mock data. Keep server-derived tenant, actor and role boundaries. Never infer financial, stock, employee or customer facts without source evidence.

## Resume from live work — no repeated discovery

The Section 61 task-quality system, persisted decision lifecycle, constrained cashflow measurement, Arabic decision assistant, Growth Radar reader, task performance/manager shortlist, policy catalog reader, notification delivery policy audit, evidence source comparison, process equal-window comparison and current Business Health assistant composition already exist in the live source tree. Read their current checkpoints/matrix rows before changing them; do not recreate them.

Latest P3 delivery in this session:
- `3cde36503c7e7b8de406755de81c4cee25c7203d` — Arabic Business Health assistant integration.
- `a66abc8475f0b0faf722218a9128051081855210` — explicit cashflow snapshot contract correction.
- Documentation checkpoint: `e8b9241be11bf84f8d385ecda7c74fae5180bdcb`.

Files of that delivery:
- `src/lib/intelligence/business-health-assistant-client.ts` (new)
- `src/lib/intelligence/natural-language-assistant.ts`
- `src/lib/intelligence/natural-language-assistant-client.ts`
- `src/components/intelligence/NaturalLanguageAssistant.tsx`

The new Arabic Business Health intent reuses authenticated inventory, cashflow and customer-retention clients and existing deterministic health engines. It deliberately withholds unsupported opening cash, due obligations, net liquidity, projected bank balances, DSO/DPO/CCC and revenue concentration. It does not call an external AI provider or perform a business write.

## Immediate P3 execution order

1. Continue from the latest live acceptance matrix and P3 checkpoint. Select the next independently implementable OPEN/PARTIAL P3 requirement from Sections 52–63 by functional weight and evidence readiness.
2. Prefer real decision/outcome/learning completion from existing tenant-scoped source data; do not infer operational baselines or historical results.
3. Continue Section 53–56 and 59–63 gaps without rebuilding completed engines. For Evidence Source Comparison, the engine/panel exist; its caller must supply two authorized, same-tenant snapshots and a stable authorized join key. Do not invent a source adapter.
4. Close Growth Radar gaps only when quote-to-order, unavailable-product demand or product-performance evidence is supplied by a complete, authenticated source contract.
5. Keep all unavailable or incomplete metrics explicit. A feature is not complete merely because a type, panel, planner intent or unmounted component exists.

## Execution and evidence rules

- Body completion is the immediate priority; do not spend the product-build session repeating repository scans or running tests/build/lint/typecheck/CI/E2E. Do not delete, weaken or disable tests/guards.
- Read live `main` before each write. Commit to `main` only with fast-forward expected-SHA compare-and-swap. Never force-push, reset, clean or overwrite another writer.
- Do not consume Vercel deployments/Preview credits, paid AI, subscriptions or external provider quotas. No production database writes or live channel sends without explicit authorization.
- Source-only migrations remain unapplied until the later approved Bolt non-production database workflow. Mark runtime/database acceptance pending; never claim PASS without exact-SHA evidence.
- After each meaningful body increment, update `docs/execution/P3_CHECKPOINT.md`, `docs/bolt-source-reconciliation/PROGRAMMER_3_EXECUTION_CHECKPOINT.md`, the central acceptance matrix and global execution state/log as applicable.
- Use GitHub commits and repository notifications as the durable handoff. Never claim that a notification reached a person unless GitHub confirms it.
- Do not claim the target 95% until all remaining P3 requirements have a defined functional weighting denominator and the completed numerator is evidenced. Report the actual open requirements and ownership dependencies.

The historical instructions below are retained for traceability; this live two-implementer override supersedes their stale dates, SHA pointers and old P2 allocation.

---

# CURRENT P3 SESSION ENTRY — LIVE OVERRIDE 2026-10-30

## P3 LIVE OVERRIDE — 2026-10-30 — CURRENT CODE SHA `da7f7af886ab6c6b0ec42c10c0778c215da7fb4e`
- Exact Core [41021594088 SUCCESS](https://github.com/Report-Engainall/Nasr1/actions/runs/41021594088) on this SHA. Unit, PG17 acceptance/migrations, backup/restore, lint, build, preview/dev smoke and price-visibility all PASS.
- P3 commits:
  - `5c1c3e63`: empty unsourced dead-stock population produces UNAVAILABLE with explicit warning.
  - `3451e9be`: CURRENCY_PER_UNIT currency isolation, metric period compatibility, invalid cashflow due-date -> NEEDS_REVIEW, dead-stock severity rollup.
  - `193c8141` + `9f76ead3`: evidence passport source/metric as-of, source timestamp/period checks; missing schedule currency withholds forecast; test assertion fixed.
  - `da7f7af8`: liquidity arithmetic overflow -> NEEDS_REVIEW, preserve UNVERIFIED on duplicate currency position, require currency for CURRENCY_PER_UNIT measured decision outcomes.
- Exact P2 [41021594114 FAILURE](https://github.com/Report-Engainall/Nasr1/actions/runs/41021594114) on da7f: authentication/public smoke, local migrations, order persistence/cross-tenant, returns/receipt/credit memo and Onyx XLSX PASS; mobile finance/task print fails twice at focus assertion; hosted tenant and optional customer-manager/device-session paths SKIPPED.
- P1 focus fix and P2 aggregate/outcome/AI/health/RBAC remain unintegrated. No P1/P2 owner commit exists to merge. All REF code is present; DLV rollups stay open.
- Matrix: 143 unique populated IDs, 16 REF, 18 DLV groups, no duplicates. Release NO-GO pending hosted proof and operations.
- exact_next_command: poll Core on this next documentation cursor; then accept only a bounded P1/P2 patch with its base/result SHA and proof, integrate by expected-SHA CAS.


## P3 LIVE RESULT UPDATE — 2026-10-30 — P2 FINALIZED ON CODE SHA 9f76ead3
- Exact main code SHA: `9f76ead379fe52711bc8b9ed58a66605317bb68f`; global docs cursor at time of update: `16511cd55776237df47871341e5337d4634c6460`.
- Core [41020479004 SUCCESS](https://github.com/Report-Engainall/Nasr1/actions/runs/41020479004) on 9f76ead3: unit, PostgreSQL 17 acceptance/migrations, exact RPC inventory, backup/restore, lint, build, production/dev smoke and price-visibility Chromium all PASS.
- P2 [41020479040 FAILURE](https://github.com/Report-Engainall/Nasr1/actions/runs/41020479040) on the same code SHA: auth and public smoke PASS; local Supabase migrations PASS; authenticated order persistence/cross-tenant denial PASS; return/review/receipt/credit memo PASS; audited Onyx XLSX PASS; finance/task print FAIL twice at mobile first-item focus (20s timeout, e2e/finance-task-print.spec.ts:69); print assertions not reached; hosted tenant and optional customer-manager/device-session browser paths SKIPPED.
- P1 mobile focus fix is still unintegrated; P2 server aggregate/outcome/AI/health/RBAC dependencies still unintegrated. No P1/P2 owner commits were available to merge.
- The code SHA remains tested; the docs-only cursor Core [41021159462](https://github.com/Report-Engainall/Nasr1/actions/runs/41021159462) is IN_PROGRESS at last observation and must be polled without rerun. Cleanup 41021159709 SUCCESS.
- Acceptance matrix integrity: 143 unique task IDs, 16 REF rows, 18 DLV groups, no duplicate IDs. All REF stay P1/P2 pending; no DLV roll-up closed; release NO-GO.
- exact_next_command: poll `41021159462`; P1 fix focus; P2 deliver tenant aggregate and DecisionOutcome persistence after; integrate bounded patches using expected-main-SHA CAS.


## P3 LIVE OVERRIDE — 2026-10-30 — CURRENT EXACT CORE PASS
- Current main/code SHA at resume: `9f76ead379fe52711bc8b9ed58a66605317bb68f`; only branch main; no open PRs.
- Exact Core [41020479004 SUCCESS](https://github.com/Report-Engainall/Nasr1/actions/runs/41020479004) on this SHA. Unit, PG17 full migrations/workflows, exact RPC inventory, backup/restore, lint, build, production/dev smoke and price-visibility Chromium all passed. Cleanup 41020478974 also SUCCESS.
- P3 commits: `5c1c3e63` empty dead-stock evidence fix; `3451e9be` per-unit currency and period-safe decision impacts, cashflow invalid-date review state, dead-stock severity rollup; `193c8141` evidence passport as-of/source period/timestamp scope and unknown-currency cashflow withholding; `9f76ead3` correction to the cashflow test assertion. Intermediate 193c Core failed its test due the test assertion itself; 9f76 fixes it and has full Core PASS.
- P2 run [41020479040](https://github.com/Report-Engainall/Nasr1/actions/runs/41020479040) on current SHA is IN_PROGRESS at last poll: auth gate/public UI smoke SUCCESS; hosted customer/order/tenant SKIPPED; local Supabase authenticated order/cross-tenant Chromium flow active. Poll, do not duplicate.
- P1 blocker remains mobile first-item focus; P2 run [41020194728 FAILURE](https://github.com/Report-Engainall/Nasr1/actions/runs/41020194728) on 3451 proves 20s focus timeout on first attempt/retry at finance-task-print.spec.ts:69. No P1 production patch has been delivered.
- PG17 receipt race observation failed on 5c1 (41019708261), then passed unchanged on 3451 (41020194758) and current 9f76 (41020479004). Track as intermittent historical harness race; no false claim of a repair.
- 143 populated unique task IDs, 16 REF rows, 18 DLV groups, no duplicate IDs. REF engines exist and pass Core, but P1 component integration and P2 aggregates/persistence/AI/health/RBAC dependencies remain open. No DLV rollup closed; release NO-GO.
- exact_next_command: poll P2 run 41020479040 on `9f76ead379fe52711bc8b9ed58a66605317bb68f`; then inspect only new P1/P2-owned bounded patches and integrate via expected-SHA CAS.


## P3 CURSOR REFRESH — 2026-10-30 — CURRENT REMOTE MAIN
- observed_main_before_pointer_update: `3f54e9917779ebb35407882afa1c0f5ba88408d8` (documentation-only); code-bearing SHA remains `b52271629f054f5d9750e2d4dbf247e22c90f8c7`.
- Exact Core `41018827283 SUCCESS` on `6d25c8c1ff3010996c1fcfce52a1fe0f580d65be`, including unit tests, PostgreSQL 17 acceptance, RPC inventory, backup/restore, lint/build and smoke.
- Current Core `41019366359 IN_PROGRESS` on exact `3f54e9917779ebb35407882afa1c0f5ba88408d8`; cleanup `41019366286 SUCCESS` on exact same SHA. Poll run 41019366359 only; do not rerun.
- No P1/P2 code patch or PR was visible at this cursor. P2 browser blocker remains 41017608501: mobile first-nav focus fails; print assertions not reached; hosted tenant test SKIPPED. P1 owns the production focus fix. P2 server aggregate/outcome/AI/privacy/health/RBAC work remains outstanding.
- Matrix integrity verified after prior commit: 143 populated IDs, 143 unique IDs, 16 REF rows, no duplicate IDs. All 16 REF have P1/P2 dependency status; no DLV roll-up closes. Release remains NO-GO.
- exact_next_command: poll `41019366359` on `3f54e9917779ebb35407882afa1c0f5ba88408d8`; then take only a delivered P1/P2 bounded patch and integrate using expected-SHA CAS.


## P3 LIVE RESUME OVERRIDE — 2026-10-30
- expected_main_sha_at_resume: `6d25c8c1ff3010996c1fcfce52a1fe0f580d65be`; code-bearing SHA: `b52271629f054f5d9750e2d4dbf247e22c90f8c7`.
- P3 engines/contracts/components are already integrated. Do not reimplement REF-DAILY-DECISIONS-001 or REF-EVIDENCE-PASSPORT-001; do not re-extract images/archives or repeat RPC inventories.
- Exact Core: `41018520349 SUCCESS` on docs-only SHA `31d1bef20a2dfe909e92078c94de8c07545d4348`; PG17 step and unit tests passed. Run `41018275584 SUCCESS` on docs-only SHA `47865baa7e62aa6a0c0c07d345a6e39639346cee` also passed. The earlier `41017608436 FAILURE` on code SHA b522716 is historical; later two tests used the same code tree and did not reproduce it. No source-code repair was introduced between those runs. Current exact main Core `41018827283` remains IN_PROGRESS on `6d25c8c1ff3010996c1fcfce52a1fe0f580d65be`; poll it, never infer its result.
- Current P2 Playwright blocker remains `41017608501 FAILURE`: first mobile nav item did not receive focus; print assertions were not reached; hosted customer/order/tenant was SKIPPED. P1 owns production focus fix. No newer P2 browser run or P1 integration commit is present.
- P2 dependencies: authenticated full-history aggregate/RPC, atomic outcome event persistence/idempotency/audit, free-only quota/privacy enforcement, live health probes, canonical server RBAC. Contract remains `docs/execution/contracts/P3_INTELLIGENCE_AGGREGATE_CONTRACT.md`.
- P1 dependencies: mount ActionCard/EvidencePassport/LiquiditySummary/CashflowForecastCard/DeadStockCard/ReplenishmentCard against real P2 DTOs, with loading/empty/error/retry/unavailable states. Contract remains `docs/execution/contracts/P3_INTELLIGENCE_P1_COMPONENT_CONTRACT.md`.
- All 16 REF rows remain P3_IMPLEMENTED with P1/P2 dependencies; no DLV roll-up is closed. Release NO-GO.
- exact_next_command: poll `41018827283`; after it completes, take only the next P1/P2 owner commit/patch, inspect changed owned paths, and integrate with expected-main-SHA CAS.

Read first 80 lines of `docs/bolt-source-reconciliation/CURRENT_EXECUTION_STATE.md` and `docs/execution/P3_CHECKPOINT.md`; this live allocation supersedes all historic pointers below. Resume from main SHA `353588f5df5f36cfb6b7caaef5d067bd28371251`; poll Core run `41007651137`. Implement REF-DAILY-DECISIONS-001 and REF-EVIDENCE-PASSPORT-001 as typed deterministic engine + tests; request secure aggregates from P2 and send ActionCard props contract to P1. Then progress remaining REF requirements. P3 alone owns central cursor/matrix/log and merges one P1/P2 local commit at a time after ownership checks; only P3 pushes main, sequentially, with expected-SHA CAS. Never create branches/PRs, never force-push, never overwrite dirty work. Verify exact-SHA checks after every integrated increment. Do not execute stale NEXT ACTIONs below.

---

# التكليف التنفيذي الدائم — P3 — ذكاء الأعمال وقائد التكامل والحوكمة — Nasr1

أنت المبرمج الثالث وقائد التكامل. أنت تنفذ محرك ذكاء الأعمال والقرارات، لا تكتفي بتقارير؛ وتنسق P1/P2 وتحافظ على نقطة استئناف واحدة.

## استئناف خلال دقيقة
1. اقرأ أول 80 سطراً فقط من `docs/bolt-source-reconciliation/CURRENT_EXECUTION_STATE.md`.
2. اقرأ protocol section 11 وهذا التكليف و`docs/execution/P3_CHECKPOINT.md`.
3. افتح `docs/reference-app/README.md` ومعرض الصور. لا تعِد فك الأرشيف.
4. تحقق من main SHA/Actions مرة واحدة، استعلم عن run IDs نفسها، وقارن changed paths فقط عند تغير SHA.
5. ابدأ من `p3_task_id` و`exact_next_command` المسجلين. لا repository-wide discovery ولا إعادة كتابة الوثيقة أو inventory.

## المسؤوليات والملكية
- ذكاء الأعمال/القرار/السيولة/التنبؤ/السيناريوهات/source lineage/Evidence Passport/outcome learning.
- المالك الوحيد للـ`CURRENT_EXECUTION_STATE.md` والمصفوفة CSV والregistry و`EXECUTION_LOG.md` وAGENTS والمواصفة والبروتوكول وأوامر المبرمجين ومعرض المرجع.
- Integration Captain الوحيد: إدارة integration queue، مراجعة local commits والownership/diffs، الدمج المتسلسل، test on merged SHA، push إلى main فقط عبر fast-forward/CAS وexpected SHA.
- ملفات الكود المملوكة: `src/components/intelligence/**`, `src/lib/intelligence/**`, `src/components/ExecutiveStoreAnalytics.tsx`, `src/components/StaffDashboardMetrics.tsx`, `src/components/AdminCustomer360.tsx`, `src/components/TaskCenter.tsx`, `src/lib/business-intelligence.ts`, `src/lib/sales-forecast.ts`, `src/lib/executive-analytics.ts`, `src/lib/customer-360-summary.ts` والاختبارات المباشرة.
- ممنوع: routes وstyles و`AghbariApp.tsx` (P1 يركّب)، `supabase/**` و`scripts/**` و`src/lib/api.ts` و`src/lib/supabase.ts` (P2 يملك). اطلب عقود P2 وأرسل Component props contract إلى P1.

## أول تسليم برمجي
ابدأ ب`REF-DAILY-DECISIONS-001` و`REF-EVIDENCE-PASSPORT-001`:
- أنشئ types/interfaces وpure deterministic decision/evidence engine في `src/lib/intelligence/**` مع اختبارات unit.
- استخدم فقط الإشارات/المقاييس الموثوقة الحالية؛ لا تنشئ قيمة نقدية/ربح/مخزون/عميل من لا شيء.
- اطلب من P2 aggregate DTO/RPC contract إذا احتجت حقائق خادمية إضافية، مع tenant/role/error/lineage.
- ابنِ Action Card component منفصل في `src/components/intelligence/**` وسلم P1 props/import contract حتى يركبه في routes/admin.
- استمر بREF-LIQUIDITY وcashflow/dead-stock/retention/replenishment/what-if/learning حسب المراجع الموجودة فقط.

## توزيع المسارات العشرة
P1 يملك UI؛ P2 backend/data/security؛ P3 intelligence/evidence/release. W01 governance, W02 identity/routes, W03 catalog, W04 checkout, W05 membership, W06 finance/inventory, W07 import/Onyx, W08 analytics, W09 AI/communications, W10 ops/security/release؛ كلهم متوازون ما لم توجد dependency أو path collision.

## حفظ الاستئناف والتكامل
- حدّث `docs/execution/P3_CHECKPOINT.md` وglobal cursor كل 10 دقائق أو بعد commit/failure/interruption.
- سجل لكل P1/P2/P3: task/status/base SHA/paths/dirty/local commit/tests/CI IDs/root cause/retry/blocker/next exact command.
- P1/P2 يحدثان checkpoints فقط؛ أنت تجمع الأدلة في global state/CSV/log. المصفوفة القائمة فقط.
- commits محلية detached worktrees؛ لا تدفع remote main من P1/P2. تدمج commit واحداً تلو الآخر بعد فحص diff وعدم التكرار، ثم تشغل Core/P2/PG17 المطلوب على SHA النهائي نفسه. لا تنقل pass من test worktree أو SHA قديم إلى merged SHA.
- عند غياب worktrees استخدم lease مكتوباً وصاحباً واحداً لكل path، مع commit/push متسلسل؛ لا تزامن git index.
- إذا main تحرك، fetch واحد/compare paths المتغيرة، resolve conflict بالمالك، CAS fast-forward فقط. لا force/reset/clean ولا حذف dirty work.
- كل عائق خارجي يعزل على الصف المتعلق، ويوثق BLOCKED_EXTERNAL، بينما يستمر المسار المحلي الآمن وبقية المسارات.

## معايير منع الدوران
لا re-scan للمستودع، لا إعادة استخراج 84 صورة، لا جرد 330 RPC، لا إعادة اختبارات مقبولة دون regression/dependency change. محاولتان لنفس السبب فقط ثم حل/بديل آمن وانتقال. لا تنتظر مزوداً مدفوعاً أو اعتماداً خارجياً؛ deterministic fallback يحفظ الوظائف.


## P3 ENGINE HARDENING — DECISION OUTCOME SNAPSHOT INTEGRITY — 2026-11-06

- Repository/branch: `Report-Engainall/Nasr1` / `main`.
- Starting main SHA for code work: `2199ebf05bbd824ccebed057852dab7c324160e8`.
- Exact code/test commit on main: `9b70d56c1502e679698e65e576289dd5b1e9a3a8`.
- This P3 increment is limited to the existing authenticated DecisionOutcome read client and its regression source. No P1-owned route, page, App shell, workspace mount or P2-owned server migration was changed.
- Hardened `src/lib/intelligence/decision-outcome-client.ts`:
  - `eventCount` must equal the full returned history length and the persisted outcome version.
  - History must begin with `CREATE`/version 1, use contiguous increasing versions, contain unique event IDs, and end in the event type corresponding to the current lifecycle state.
  - Event actors require valid profile UUIDs and roles; event timestamps must be monotonic and within the outcome creation/update window.
  - Approval actor/time fields are validated as a pair.
  - A `MEASURED` outcome now requires complete, VERIFIED, ACCEPTABLE measurement evidence, a three-letter currency, a valid period, formula identifiers, ordered measurement timestamps and unique bounded evidence IDs. A malformed non-null measurement is rejected rather than projected as null.
  - ASSIGNED/EXECUTING/EXECUTED/MEASURED states require their already-reached lifecycle timestamps.
- The only data authority remains the existing authenticated `fetch_decision_outcomes` RPC. Server-derived tenant/actor scope and manager authorization are unchanged. No SQL/RPC, RLS, ledger, payment, inventory or pricing mutation changed.
- Regression source in `src/lib/intelligence/decision-outcome-client.test.ts` now covers event-count mismatch, version gaps, duplicate event IDs, terminal-state mismatch, missing/malformed/unverified measurement evidence, and a coherent seven-event measured lifecycle.
- Exact blobs:
  - `src/lib/intelligence/decision-outcome-client.ts`: `1c0bb3e7ab0b9645f29e46d5d4d840107bb15ea2`.
  - `src/lib/intelligence/decision-outcome-client.test.ts`: `3cb696236e8b77c588d4106e13952cc157e37f63`.
- Acceptance boundary: implementation and regression source only. Tests were NOT RUN. No build, typecheck, CI, browser, database migration apply, Bolt, Preview, Vercel or production operation was performed. No PASS/runtime acceptance is claimed.
- Dependencies still open: apply and accept the existing decision outcome/deferral/resubmission/decision-memory migrations in approved Bolt non-production; verify role/tenant denials, idempotency and stale versions, append-only event/audit, history-count parity, exact measured evidence, and no financial/stock side effects. The persisted P0–P3 candidate priority/impact/risk/expiry snapshot is still absent and must not be inferred by P3 or P1.
- NEXT_ACTION_ID: `REF-DECISION-OUTCOME-001` — Bolt source/database acceptance on the exact code SHA; then continue to another independently source-backed P3 capability.



## P3 LEARNING LOOP HARDENING — EXPECTED/ACTUAL FORMULA COMPATIBILITY — 2026-11-06

- Repository/branch: `Report-Engainall/Nasr1` / `main`.
- Starting main SHA: `c4898abc6091697b3a2eff8247467afe7eacfa1b`.
- Exact engine/test commit: `82899058fac253bdaafe5de4ad754b60e7c637ec`.
- Hardened the existing `evaluateDecisionLearning()` contract in `src/lib/intelligence/learning-loop.ts`: matching metric key/unit/currency/period is no longer sufficient to subtract expected and actual values when evidence-passport formula IDs or formula versions differ.
- A formula ID or version mismatch now emits `FORMULA_MISMATCH`, makes the evaluation `NEEDS_REVIEW`, and withholds expected value, actual value and variance. Existing source timestamp, evidence, currency, period, arithmetic-overflow and rule-version behavior remains unchanged.
- Added regression source for formula-ID mismatch and formula-version mismatch in `src/lib/intelligence/learning-loop.test.ts`.
- Exact blobs:
  - `src/lib/intelligence/learning-loop.ts`: `6fae5052f11ef58711fe6ae1ed69f154b1c10857`.
  - `src/lib/intelligence/learning-loop.test.ts`: `dc681cb4a1fe3f30817510f028ce8f65ad96021f`.
- Acceptance boundary: source and tests only. Tests NOT RUN. No build/typecheck/CI/DB/Bolt/browser/Preview/production operation or test PASS is claimed.
- No AI model training, automatic policy change, pricing change, credit change, stock movement or financial posting was added.
- NEXT_ACTION_ID: `REF-NL-DECISION-MEMORY-ASSISTANT-001` — exact-SHA acceptance of comparable/non-comparable expected-versus-actual evidence, then continue only with the next source-backed P3 gap.

