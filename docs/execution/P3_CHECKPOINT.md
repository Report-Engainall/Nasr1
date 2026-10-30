# LIVE RESUME OVERRIDE — 2026-10-30 — SUPERSEDES ALL OLDER P3 NEXT ACTIONS
- Resume base: code-bearing main `a23c0b5cea98730f59093aa2f3e8f658509eddb4`. Core run `41010611128` is IN_PROGRESS on this exact SHA; poll it. The earlier `41007817600` and cleanup `41007817667` passed only on ancestor `af0d73aa50a73ebc6c86fb02977296f3e106d2e0`; do not transfer those results.
- P3 is sole Integration Captain and sole owner of CURRENT_EXECUTION_STATE, the existing acceptance CSV/registry/EXECUTION_LOG/master spec/protocol, integration queue and P3 checkpoint. Do not create a parallel ledger.
- First implement `REF-DAILY-DECISIONS-001` + `REF-EVIDENCE-PASSPORT-001` in P3-owned intelligence paths: typed source/evidence/metric/decision contracts, deterministic ranking/impact rules and focused tests. Use existing verified facts only; unknown remains unknown.
- Send P2 a structured tenant-safe aggregate DTO/RPC request (tenant/role, sources, period/as-of, currency, formulas/version, completeness/quality, SQLSTATE/error, audit and no-side-effect denial evidence). Send P1 a stable ActionCard props/import contract and states (verified/review/unavailable, priority, value optionality, owner, expiry, CTA, loading/empty/error).
- Continue REF-LIQUIDITY/CASHFLOW/DEAD-STOCK/RETENTION/REPLENISHMENT/WHATIF/DECISION-OUTCOME/LEARNING and REF-AI/HEALTH/RBAC in dependency order. Coordinate; do not edit P1 routes or P2 SQL/API paths.
- Integrate one owner commit at a time after path and duplicate-work review. P1/P2 never push remote main. Verify Core/P2/PG17 or targeted checks on the exact merged SHA. No branch/PR creation.
- This live block supersedes the historical P3 handoff below. Read global CURRENT_EXECUTION_STATE first.

---

# P3 — Durable Intelligence & Integration Checkpoint

هذا checkpoint خاص بـP3؛ المؤشر العالمي الوحيد هو `docs/bolt-source-reconciliation/CURRENT_EXECUTION_STATE.md`، والمصفوفة الوحيدة هي CSV الحالية.

## نقطة التسليم الثلاثي — 2026-10-30
- owner: P3 — intelligence/product decisions/integration/governance.
- base_main_sha_at_handoff: `32e732c77305598463f776c206a3868e3ee12146` (تحقق من الرأس قبل الدمج).
- active_task_id: `REF-DAILY-DECISIONS-001` + `REF-EVIDENCE-PASSPORT-001`.
- exact_next_command: أنشئ pure typed decision/evidence contracts واختبارات في src/lib/intelligence/**؛ استخدم الإشارات الموجودة فقط، ولا تخترع قيماً. أرسل P2 طلب بيانات aggregate/RPC منظم، وأنشئ Action Card component مع props contract لـP1.
- reserved_paths: docs/** المركزية، AGENTS.md، src/components/intelligence/**، src/lib/intelligence/**، ExecutiveStoreAnalytics.tsx، StaffDashboardMetrics.tsx، AdminCustomer360.tsx، TaskCenter.tsx، business-intelligence.ts، sales-forecast.ts، executive-analytics.ts، customer-360-summary.ts والاختبارات المقابلة.
- integration_queue: EMPTY at handoff؛ P3 هو الوحيد المخول بدمج remote main.
- retry_count: 0.
- status: RESUME_REQUIRED؛ لم ينفذ محرك القرار/اختبار قبول جديد حتى الآن.

## سجل تحديثات P3 (الأحدث أولاً)
سجل UTC، task/status/base/result SHA، paths، صيغ/مصادر الحساب، tests exact SHA، P1/P2 contracts، local commit، integration queue/merge status، CI run IDs، root cause/retry، blocker، no-repeat changes، exact_next_command لكل مبرمج. لا تكرر المصفوفة ولا EXECUTION_LOG هنا.


## P3 integration event — 2026-10-30 — REF-DAILY-DECISIONS-001 / REF-EVIDENCE-PASSPORT-001
- Base SHA: `397400c6df81d1edeb920c195399ec6be24703cc`.
- Code commit / current tested candidate: `a23c0b5cea98730f59093aa2f3e8f658509eddb4`, fast-forward CAS, force=false; GitHub main re-read confirmed the result.
- Paths: `src/lib/intelligence/{types,evidence-passport,daily-decisions,aggregate-contract,index}.ts`, two Vitest files; `src/components/intelligence/{ActionCard,EvidencePassport,index}.tsx`; P1 and P2 contract documents.
- Evidence gate: VERIFIED metrics require complete/acceptable source evidence, valid timestamps, formula ID/version and lineage. No upgrade from weaker statuses; unknown remains null. Daily rules use explicit operator/threshold/priority, deterministic sorting and explicit formula versions. Cross-currency SUM is withheld. Engine label is RULE_BASED.
- Tests: committed focused cases for provenance, no-source, status preservation, null handling, partial data, currency omission, duplicate/conflicting metric snapshots, deterministic priority, mixed currencies, approved formula impacts, no-match and invalid timestamps. Local execution was not available through the connector; exact-SHA Core run `41010611128` is IN_PROGRESS. Do not claim PASS before completion.
- P2 contract: `docs/execution/contracts/P3_INTELLIGENCE_AGGREGATE_CONTRACT.md`; P2 must return server-resolved tenant scope, canonical role/capabilities, full-period aggregation, source lineage, currency, completeness/quality, SQLSTATE and no-side-effect denial evidence.
- P1 contract: `docs/execution/contracts/P3_INTELLIGENCE_P1_COMPONENT_CONTRACT.md`; import `ActionCard` and `EvidencePassport` from `@/components/intelligence`; do not mount fixture data.
- Integration status: merged/pushed to main and remotely verified; acceptance stays IMPLEMENTED / CI_PENDING pending exact Core and dependent P2/P1 evidence.
- Blockers: P2's existing hidden-sidebar Playwright locator failure and hosted credential/approval gap remain separate; neither invalidates the P3 engine unit contracts, nor can either be called PASS.
- exact_next_command: poll run `41010611128` on SHA `a23c0b5cea98730f59093aa2f3e8f658509eddb4`; inspect only intelligence TypeScript/test diagnostics if it fails, otherwise record exact-SHA Core result and continue to the P2 aggregate implementation.
