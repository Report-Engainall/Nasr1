# CURRENT P3 SESSION ENTRY — LIVE OVERRIDE 2026-10-30

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
