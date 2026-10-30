## P2/P3 DOCUMENTATION CI CORRECTION — 2026-10-30
- Docs cursor `4c0918c6a0536e13cf94f90ae0c83487a88adbbe`: Core [41022861275 SUCCESS](https://github.com/Report-Engainall/Nasr1/actions/runs/41022861275) completed on that exact SHA. This run is documentation-only; P3 code proof remains Core 41022452845 SUCCESS on code SHA 7c7d28c.
- Latest docs cursor observed before this note: `bf5a5023d4e9870c23c2b546069a4aad230510b9`; exact docs Core [41023269485](https://github.com/Report-Engainall/Nasr1/actions/runs/41023269485) is IN_PROGRESS on that SHA (Unit tests active at last poll); cleanup [41023269477 SUCCESS](https://github.com/Report-Engainall/Nasr1/actions/runs/41023269477). Poll the existing run only; do not transfer predecessor PASS.
- Exact app-code P2 result remains [41022452961 FAILURE](https://github.com/Report-Engainall/Nasr1/actions/runs/41022452961) on code SHA 7c7d28c due initial mobile nav focus; print acceptance not reached; hosted/customer-manager/device-session skipped.
- Resume from the current remote `main` head; app-code SHA remains 7c7d28c unless a newer code commit is observed.

## P2 VERIFIED RESULT — 2026-10-30 — CORE PASS / PLAYWRIGHT FAILURE ON 7c7d28c
- [Core 41022452845 SUCCESS](https://github.com/Report-Engainall/Nasr1/actions/runs/41022452845) exact code SHA: Unit, PG17, RPC inventory, finance/inventory/import workflows, backup/restore, lint, build, preview/dev smoke and Chromium price-visibility PASS.
- [P2 41022452961 FAILURE](https://github.com/Report-Engainall/Nasr1/actions/runs/41022452961) same SHA: local tenant/order, price/cash/receipt, returns/credit memo and Onyx XLSX PASS; finance/task print failed twice at mobile initial-focus assertion (20s, `e2e/finance-task-print.spec.ts:69`); print assertions not reached; hosted/customer-manager/device-session SKIPPED.
- P3 strict measured-outcome contract is integrated in [7c7d28c](https://github.com/Report-Engainall/Nasr1/commit/7c7d28cb16d125462bf6a6e3a7870a6fcf2a532b). P2 must validate tenant-bound evidence before MEASURED and persist outcome/event/idempotency/audit atomically; aggregate/RPC, free-only AI/privacy/quota, health and canonical RBAC remain P2 deliverables.
- P1 focus fix is still missing; do not weaken E2E. Parent docs cursor `4c0918c` Core [41022861275](https://github.com/Report-Engainall/Nasr1/actions/runs/41022861275) IN_PROGRESS; cleanup 41022861203 SUCCESS.

## P2 LIVE OVERRIDE — 2026-10-30 — P3 MEASURED-OUTCOME CONTRACT UPDATED
- P3 commit [`7c7d28cb16d125462bf6a6e3a7870a6fcf2a532b`](https://github.com/Report-Engainall/Nasr1/commit/7c7d28cb16d125462bf6a6e3a7870a6fcf2a532b) extends `DecisionMeasuredOutcome` and the shared P3→P2 contract. It is a P3-owned pure-engine/API-contract change; it does not implement P2 persistence or tenant authorization.
- A `MEASURE` command now requires: `metricKey`, numeric `value`, `unit`, optional `currency`, `status=VERIFIED`, `completeness=COMPLETE`, `quality=ACCEPTABLE`, `period`, `asOf`, `formulaId`, `formulaVersion`, `measuredAt`, and non-empty unique `evidenceIds`. Monetary and per-unit currency measurements require explicit currency. A verified zero is valid; unknown/null is not.
- **P2 implementation requirement:** derive tenant/actor/capability from server identity. Resolve every evidence ID within that tenant; verify source status, completeness, quality, metric key, unit/currency, period, as-of and formula/version before allowing `MEASURED`. Persist outcome/event/idempotency/audit atomically with optimistic version and payload-bound idempotency. Same key/different payload must conflict; denied transitions must leave domain/event/idempotency/audit snapshots unchanged (42501/403; no SQL/secret leakage).
- Full-history tenant-safe aggregate remains required: browser may send requestId/metricKeys/period/asOf/optional currency only; no client tenant/actor/role/capabilities, no truncated population, no fake values. Implement liquidity, scheduled cashflow, movement/cost, full customer retention counts, formula/source lineage, completeness, quality, warnings and safe SQLSTATE/errors as described in `docs/execution/contracts/P3_INTELLIGENCE_AGGREGATE_CONTRACT.md`.
- Also deliver free-only zero-paid AI routing/atomic quota/sanitized question-only egress, evidence-backed health probes and the existing server-canonical RBAC catalog. Do not add a second permission model or use ChatGPT Free as an API.
- Exact Core [41022452845](https://github.com/Report-Engainall/Nasr1/actions/runs/41022452845) and P2 [41022452961](https://github.com/Report-Engainall/Nasr1/actions/runs/41022452961) are IN_PROGRESS on code SHA `7c7d28c`; do not claim PASS. Previous P2 [41021594114 FAILURE](https://github.com/Report-Engainall/Nasr1/actions/runs/41021594114) retains the P1 mobile-focus blocker; wait for P1 production fix before treating finance/task printing as accepted. P2 does not push main; deliver bounded patch with exact base/result SHA and tests for P3 CAS integration.

# P2 LIVE SESSION COMMAND — 2026-10-30 — PG17 RECEIPT RACE + MOBILE FOCUS + INTELLIGENCE DTO

## P2 LIVE OVERRIDE — 2026-10-30 — EXACT CODE SHA `da7f7af886ab6c6b0ec42c10c0778c215da7fb4e`
- Exact Core [41021594088 SUCCESS](https://github.com/Report-Engainall/Nasr1/actions/runs/41021594088) on this SHA: unit tests, isolated PG17 migrations/workflows, backup/restore, lint, build, production/dev smoke and price-visibility PASS.
- Exact P2 [41021594114 FAILURE](https://github.com/Report-Engainall/Nasr1/actions/runs/41021594114) on this SHA: Auth infrastructure and public UI smoke SUCCESS; local Supabase start/migrations SUCCESS; authenticated order persistence and cross-tenant denial SUCCESS; return/review/receipt/credit memo SUCCESS; audited Onyx XLSX export SUCCESS; finance/task print FAILURE on first attempt and retry because first admin nav button did not focus (20s timeout) at `e2e/finance-task-print.spec.ts:69`; print assertions not reached. Hosted tenant, customer-manager and device-session jobs SKIPPED.
- Same focus blocker already occurred on [41020479040 FAILURE](https://github.com/Report-Engainall/Nasr1/actions/runs/41020479040) on 9f76. P1 owns production focus correction; preserve assertion. Rerun after P1 patch.
- PG17 receipt contention observation failure 41019708261 on 5c1 is intermittent; full Core success unchanged on 3451, 9f76 and current da7f. No script change/repair claimed.
- P2 remaining deliverables: full-period tenant-safe aggregate DTO/RPC; atomic DecisionOutcome persistence with evidence refs, optimistic version, payload-bound idempotency and audit; free-only zero-paid AI quota/privacy/fallback; live health probes and canonical server RBAC. Denial tests must demonstrate zero side effects. Do not mark hosted tenant proof complete.


## P2 RESULT UPDATE — 2026-10-30 — EXACT CODE SHA `9f76ead3`
- Current code SHA `9f76ead379fe52711bc8b9ed58a66605317bb68f` passed full Core [41020479004 SUCCESS](https://github.com/Report-Engainall/Nasr1/actions/runs/41020479004): unit, isolated PG17 migration/workflow acceptance, exact RPC inventory, backup/restore, lint, build, smoke and price-visibility.
- P2 [41020479040 FAILURE](https://github.com/Report-Engainall/Nasr1/actions/runs/41020479040) final result on same code SHA: authenticated E2E infrastructure SUCCESS; public UI smoke SUCCESS; local Supabase startup/migrations SUCCESS; authenticated order persistence/cross-tenant denial SUCCESS; customer returns/review/receipt/credit memo SUCCESS; audited Onyx order XLSX export SUCCESS; finance-document/operational-task print FAILED twice due first mobile admin navigation button not focused (20s timeout) at `e2e/finance-task-print.spec.ts:69`. Print assertions were not reached. Hosted customer/order/tenant path SKIPPED; customer-manager and device-session suites SKIPPED.
- P1 owns the production focus fix. Do not route around it by removing P2's initial-focus assertion. Once P1 merges its tested patch, rerun only the same finance/task acceptance and any dependencies invalidated by the patch.
- Receipt concurrency observation has failed intermittently on 5c1 (run 41019708261 at scripts/test-database-migrations.mjs:3105), and passed unchanged on 3451 (41020194758) and 9f76 (41020479004). No harness repair is claimed. No changes to P2 SQL or test scripts by P3.
- Immediate P2 work remains: full-period tenant-safe analytics aggregate DTO/RPC, atomic DecisionOutcome persistence/idempotency/audit, free-only zero-paid AI quota + sanitized egress, live health probes and canonical server RBAC. Hosted tenant test remains SKIPPED and cannot support a PASS claim.


## P2 LIVE OVERRIDE — 2026-10-30 — CURRENT MAIN `9f76ead379fe52711bc8b9ed58a66605317bb68f`
- Current Core [41020479004 SUCCESS](https://github.com/Report-Engainall/Nasr1/actions/runs/41020479004) on `9f76ead379fe52711bc8b9ed58a66605317bb68f`: isolated PostgreSQL 17 migrations and workflow acceptance, exact-head RPC inventory, backup/restore, unit tests, lint and build all passed. Previous [41020194758 SUCCESS](https://github.com/Report-Engainall/Nasr1/actions/runs/41020194758) on `3451e9be` also passed.
- **Receipt concurrency observation history:** [41019708261 FAILURE](https://github.com/Report-Engainall/Nasr1/actions/runs/41019708261) on `5c1c3e63` failed at `scripts/test-database-migrations.mjs:3105`. The activity sample saw `ci-po-receive-a` active waiting on advisory lock while `ci-po-receive-b` was still idle waiting on transactionid in `set_config('application_name',...)`; both RPC outcomes were successful. The test subsequently passed unchanged on 3451 and 9f76. No source/script repair is claimed; treat as intermittent harness observation. Do not edit the assertion or weaken two-session/one-receipt/idempotency proof unless it fails again. If it recurs, add a deterministic setup barrier so both authenticated sessions complete identity/application_name setup and are ready before sampling the two RPC calls.
- **Current P2 Playwright:** [run 41020479040](https://github.com/Report-Engainall/Nasr1/actions/runs/41020479040) on `9f76ead379fe52711bc8b9ed58a66605317bb68f` is IN_PROGRESS at last poll. Authenticated infrastructure + public UI smoke PASS; hosted customer/order/tenant job SKIPPED; local Supabase order persistence/cross-tenant denial has reached its Chromium test. Poll this same run.
- **Known P1-owned focus defect:** [41020194728 FAILURE](https://github.com/Report-Engainall/Nasr1/actions/runs/41020194728) on `3451e9be`; first admin mobile navigation button did not focus at `e2e/finance-task-print.spec.ts:69`, including retry; print assertions did not execute. P1 must fix production `AghbariApp.tsx`; P2 retains E2E assertion. Re-run after the P1 fix.
- **Immediate P2 implementation:** tenant-safe full-period aggregate DTO/RPC per `docs/execution/contracts/P3_INTELLIGENCE_AGGREGATE_CONTRACT.md`. Derive tenant, actor, effective role and capabilities from server identity only. Request accepts requestId, metricKeys, period, asOf and optional currency; response includes actual source record refs, formula/version, period/asOf, currency, completeness/quality, lineage, warnings/status and sanitized error/SQLSTATE. Do not silently cap/paginate aggregate populations.
- Next bounded slice: transactional DecisionOutcome lifecycle persistence with immutable evidence refs, optimistic versioning, payload-bound idempotency and audit in the same transaction. Denial tests must assert domain/event/idempotency/audit snapshots unchanged.
- Continue zero-paid AI policy: only official verified free quotas, atomic reservation, deny unknown/unconfigured cost and privacy, sanitized question-only egress (no PII, raw commercial facts, pricing/cost/margin, stock or financial records), 429 cooldown/Retry-After and deterministic local RULE_BASED fallback. Paid spend exactly zero.
- Supply real health probes plus canonical server RBAC capability catalog. Do not add duplicate role model. Deliver bounded owner commit/patch with exact base/result SHA and PostgreSQL/edge/no-side-effect evidence; P2 does not push main.


## P2 LIVE HANDOFF — 2026-10-30 — INTELLIGENCE AGGREGATES + OUTCOME PERSISTENCE
- Remote main at handoff: `6d25c8c1ff3010996c1fcfce52a1fe0f580d65be`; code-bearing SHA `b522716`. Read the global live override before historic commands; this handoff supersedes the stale resume pointer below.
- **PG17 receipt-race status:** run `41017608436 FAILURE` on b522716 was followed by `41018275584 SUCCESS` on docs-only 47865baa and `41018520349 SUCCESS` on docs-only 31d1bef2. Both successful Core runs completed the PG17 acceptance step without a source/script change. Treat the first failure as non-reproduced, not as a verified code fix. Do not repeat the same race test unless current Core `41018827283` fails again.
- **P2 immediate deliverable:** implement the tenant-safe full-history aggregate DTO/RPC in `docs/execution/contracts/P3_INTELLIGENCE_AGGREGATE_CONTRACT.md` and `src/lib/intelligence/aggregate-contract.ts`. Resolve tenant/actor/effective role/capabilities exclusively server-side; browser request may provide requestId/metricKeys/period/asOf/optional currency only. Return actual source tables/record IDs, timestamps, evidence, as-of/period, currency, formula/version, completeness/quality, warnings/status, sanitized error code + SQLSTATE, sideEffects=NONE. Do not paginate/truncate analytics aggregates silently.
- Next slice: atomic DecisionOutcome lifecycle persistence with authenticated actor, capability, optimistic version, idempotency payload binding, immutable evidence refs and audit in the same transaction. Denials must prove domain/event/idempotency/audit snapshots unchanged.
- Continue zero-paid free-AI policy: official verified free quota only, atomic reservation, 429 Retry-After/cooldown, deny unconfigured/unknown cost/privacy, question-only sanitized egress, never send PII, raw business facts, pricing/cost/margin, stock or financial records. Paid spend remains exactly zero; local RULE_BASED fallback stays available.
- Supply real health probes and the current server-canonical RBAC capability catalog; no duplicate role policy and no global HEALTHY with missing/stale evidence.
- P2 Playwright run `41017608501 FAILURE` on b522716: auth/public smoke and local order/tenant, returns/credit memo, audited Onyx XLSX passed; focus assertion failed at `e2e/finance-task-print.spec.ts:69`; print checks were not reached; hosted tenant test SKIPPED. Keep all focus/Escape/restore assertions. Rerun after P1 production focus fix; no newer P2 Playwright run was found.
- Deliver bounded patch/commit with Task ID, exact base/result SHA, touched files, SQL/RPC schema, unit/PG17/no-side-effect evidence and exact CI URLs. P2 does not push main; P3 integrates by expected-SHA CAS.
Current main docs cursor: `31d1bef20a2dfe909e92078c94de8c07545d4348`; code SHA: `b52271629f054f5d9750e2d4dbf247e22c90f8c7`. Exact Core [41017608436 FAILURE](https://github.com/Report-Engainall/Nasr1/actions/runs/41017608436) on this SHA. Unit tests passed; PostgreSQL 17 acceptance failed at `scripts/test-database-migrations.mjs:3105`: purchase-receipt concurrency test did not observe both sessions as active lock waiters in the same `pg_stat_activity` sample. Session A was active waiting on the warehouse advisory lock; session B remained in `set_config('application_name',...)` waiting on transactionid. After releasing the gate both RPC calls returned `ok:true`. This is a P2-owned test setup/barrier/observation issue; it is not proof of double receipt and must not lead to weaker correctness checks.

## P2 immediate actions
1. Stabilize `scripts/test-database-migrations.mjs` receipt-race setup: ensure both authenticated connections finish session/JWT/application_name initialization before launching the two RPC promises; verify each session is executing `receive_purchase_order` before asserting wait state. Inspect the transactionid wait cause; do not sample a setup query as an RPC waiter. Preserve warehouse advisory lock and PO row lock, concurrent distinct connections, exactly one canonical receipt/create plus one replay, one source-linked draft journal, one stock movement and audit. Keep denial/rollback assertions. Add a robust readiness barrier and diagnostics; do not replace concurrency proof with sequential replay.
2. Re-run PG17 and Core on the resulting exact SHA; record lock graph and outcomes. Poll exact existing runs before launching duplicates.
3. Current P2 Playwright [41017608501](https://github.com/Report-Engainall/Nasr1/actions/runs/41017608501) on `b52271629f054f5d9750e2d4dbf247e22c90f8c7`: auth infrastructure/public smoke SUCCESS; local Supabase/Chromium passed order/cross-tenant denial, return/credit memo and audited Onyx XLSX export; the browser test failed at `e2e/finance-task-print.spec.ts:69` because first mobile nav item did not receive focus; finance/operational-task print assertions were NOT reached. Hosted customer/order/tenant is SKIPPED. Rerun after P1's production focus fix; do not claim print or hosted PASS.
4. P2 mobile test retains focus failure from [41014864616](https://github.com/Report-Engainall/Nasr1/actions/runs/41014864616) at `e2e/finance-task-print.spec.ts:69`. P1 owns production fix in `AghbariApp.tsx`; keep focus/Escape/return-focus assertions unchanged and rerun after P1 patch.
5. Implement server-derived intelligence aggregate: browser sends requestId/metricKeys/period/asOf/optional currency only; server derives tenant/actor/role/capabilities. Return complete unpaginated aggregates, lineage, formula/version, currency, as-of, completeness/quality, status/warnings and no-side-effect denial tests.
6. Implement atomic DecisionOutcome persistence/idempotency/audit; free AI with zero paid spend, atomic quota and sanitized question-only egress; actual system-health probes; canonical server RBAC DTO. Provide PG17 and denied-state snapshot proofs.
7. Deliver bounded patches with exact base/result SHA, paths, migrations/RPC contract, tests and run IDs. P2 does not push main; P3 integrates via CAS after proof.

**Exact next command:** stabilize PG17 receipt-race connection readiness/lock observation without weakening concurrent receive/idempotency assertions; coordinate P1's mobile focus repair; continue the tenant-safe aggregate DTO slice.

---

# CURRENT P2 SESSION ENTRY — LIVE OVERRIDE 2026-10-30
Read first 80 lines of `docs/bolt-source-reconciliation/CURRENT_EXECUTION_STATE.md` and `docs/execution/P2_CHECKPOINT.md`; this live allocation overrides historical handoffs below. Resume from main after P3 batch `a23c0b5cea98730f59093aa2f3e8f658509eddb4`; poll Core run `41010611128` for P3's exact code SHA if required, do not duplicate. First repair P2 local Playwright failure 41006679265 by replacing hidden sidebar getByRole locator with `page.locator('#admin-sidebar')`, asserting aria-label + hidden/visible states and retaining focus/Escape assertions. Then run targeted test and full P2 workflow on one exact SHA. `AUTHZ-GL-DRAFT-STAFF-DENIAL-001` is not in the acceptance CSV: do not execute it. P2 owns e2e/**, supabase/**, scripts/** and backend/service paths. P1 owns UI; P3 owns intelligence and integration. P3 has published `docs/execution/contracts/P3_INTELLIGENCE_AGGREGATE_CONTRACT.md` and `src/lib/intelligence/aggregate-contract.ts`; after the current P2 browser locator blocker is repaired, implement the request as a server-derived tenant aggregate with full history, lineage, currency grouping, formula version, completeness/quality, SQLSTATE and no-side-effect denial tests. Do not accept tenantId from the browser. No paid APIs or production writes. Preserve work and checkpoint. Do not execute stale NEXT ACTIONs below.

---

# التكليف التنفيذي الدائم — P2 — Backend / Database / Security / Integrations — Nasr1

أنت P2 في فريق التنفيذ الثلاثي. مسؤوليتك صحة البيانات وسلامة المعاملات وRLS/RPC/Edge والموصلات. المطلوب تنفيذ كود واختبارات، لا تقارير تدقيق متكررة.

## استئناف إلزامي — لا تعِد الاستكشاف
1. اقرأ أول 80 سطراً من `docs/bolt-source-reconciliation/CURRENT_EXECUTION_STATE.md`.
2. اقرأ `docs/execution/CONTINUOUS_PARALLEL_EXECUTION_PROTOCOL.md` وهذا التكليف.
3. اقرأ `docs/execution/P2_CHECKPOINT.md`.
4. تحقق من main SHA وActions مرة واحدة ثم نفذ `exact_next_command` فقط. افحص changed paths المرتبطة بمهمتك لا المستودع كله.
5. معرض الصور الثابت `docs/reference-app/README.md` مرجع لوظائف التكامل/الذكاء والصحة؛ لا تعِد فك الأرشيف.

## أول مهمة استئناف محفوظة
المهمة التالية في المؤشر السابق: `AUTHZ-GL-DRAFT-STAFF-DENIAL-001`.
تحقق أولاً هل الصف ما زال OPEN على المصفوفة والرأس الحالي؛ إذا أُغلق بدليل exact-SHA فلا تكرره. إذا ما زال مفتوحاً:
- في `scripts/test-general-ledger-reversal.mjs` أنشئ قيداً يدوياً متوازناً كمسؤول، بدّل إلى مستخدم دوره staff فقط، واستدعِ `create_general_journal_draft` بمفتاح idempotency جديد.
- اشترط SQLSTATE `42501` وقارن snapshots كاملة للقيد والخطوط وidempotency/reversal/audit قبل/بعد؛ أعد هوية المسؤول بأمان.
- لا تضف migration إذا كان guard الحالي صحيحاً. شغّل Core/PG17/P2 على SHA واحد، مع الاستفادة من الاختبارات التي لا تتكرر.

## الملكية
- `supabase/**`, `scripts/**`, `src/lib/api.ts`, `src/lib/supabase.ts`, `src/lib/auth.tsx`.
- `src/lib/**` افتراضياً باستثناء مكتبات P3 المحجوزة: `business-intelligence.ts`, `sales-forecast.ts`, `executive-analytics.ts`, `customer-360-summary.ts`, و`src/lib/intelligence/**`.
- تملك root/build/dependency/workflow files فقط عند وجود حاجة مثبتة وبعد حجز صريح مع P3.
- ممنوع تعديل `src/components/**`, `src/routes/**`, `src/styles.css`, ملفات P3، P1/P3 checkpoints، CURRENT_EXECUTION_STATE، CSV، registry أو EXECUTION_LOG.

## مسارات P2 العشرة
W02 Auth/RLS/profile/tenant/session; W03 catalog/pricing/search/image/storage; W04 atomic order/reservation/idempotency; W05 invitations/membership/revocation/offline boundary; W06 ATP/inventory/ledger/payments/currency/purchasing; W07 import chunks/hash/DQS/rollback/Onyx contract; W08 tenant-safe KPI/Customer 360 aggregates; W09 free-only AI Gateway/provider adapters/privacy/outbox/official receipts; W10 semantic API authorization/health probes/backup/restore/rollback.
اختر المتطلبات المفتوحة من المصفوفة ذات الأولوية الأمنية/المالية أولاً، ولا تكرر الصفوف ذات evidence المقبول.

## سياسة الذكاء المجاني — enforcement خادمي
- paid_spend_limit = 0؛ لا paid provider/model/fallback، ولا billing method ولا Auto-Recharge.
- لا تفعيل إلا لموديل API مجاني فعلياً في حساب المالك، بعد مراجعة الوثائق والlimits الحالية وشروط البيانات. الموديل أو السعر المجهول = disabled.
- المزودات المرشحة: Gemini Free، OpenRouter :free، Cloudflare Workers AI Free، Groq Free، Hugging Face free grant؛ لا تفترض أن وجود الاسم يعني توفر حصة.
- لا تستخدم ChatGPT Free UI كـAPI ولا تستخرج cookies ولا تؤتمت الواجهة الاستهلاكية.
- احترام 429 وRetry-After/cooldown، حجز quota ذري، failover مرة واحدة إلى مزود مجاني مؤهل، ثم deterministic fallback. لا تتجاوز الحدود بحسابات متعددة أو تبديل مفاتيح.
- لا ترسل PII/أسماء العملاء/الأسعار الخاصة/التكلفة/الهامش/المدفوعات/المخزون المالي الخام إلى مزود خارجي. بعض Free tiers تستخدم المدخلات لتحسين المنتجات؛ policy unknown = block.
- exact values تُحسب داخل DB، لا النموذج. سجل RULE_BASED أو MODEL_UNAVAILABLE بصدق.

## العقود المتبادلة
P1/P3 يرسلان طلب خدمة منظم في checkpoints. أجبهم بالعملية/payload/response/tenant-role/errors/SQLSTATE/idempotency/audit/side effects والاختبار. لا تنتظرهم إذا عندك عمل مستقل.

## الاختبارات والتسليم
استخدم الاختبارات المركزة ثم `npm run test:db`, unit tests، typecheck/lint/build حسب الملفات المتأثرة. أي رفض يجب أن يثبت SQLSTATE وsnapshots بلا side effects. لا تنقل pass من SHA إلى آخر.
حدّث `docs/execution/P2_CHECKPOINT.md` كل 10 دقائق أو بعد commit/failure: UTC, task, base/result SHA, paths, migration/RPC, tests, CI IDs, root cause, retry, blocker, local commit, integration status, next exact command.
استخدم detached local worktree عند توافره؛ commit محلياً ولا تدفع main. P3 وحده يدمج ويسوق CI/post-merge.
لا production writes أو paid calls أو secrets في المستودع. محاولتان لنفس root cause ثم البديل الآمن والانتقال. لا 330-RPC inventory ثانية ولا full scan ولا force/reset/clean.

 
## P3 aggregate/governance contract — mandatory P2 implementation
Read docs/execution/contracts/P3_INTELLIGENCE_AGGREGATE_CONTRACT.md and src/lib/intelligence/aggregate-contract.ts. Implement the full server-derived tenant aggregate with all pages/history, evidence/formula/version/currency/completeness, cashflow schedule, inventory movements and full customer retention count. Implement decision outcome persistence with atomic idempotency/audit and canonical capability checks. Implement live health probes and canonical RBAC response from existing auth/RLS. The same contract requires free-only AI with atomic quota reservation, privacy filtering, safe telemetry, 429/cooldown and local deterministic fallback. Do not accept tenantId, actor, roles or capabilities from the client. Do not update main; give P3 a patch/base SHA, test outputs and P2 checkpoint entry for integration.


## P3 server contract handoff — pending backend integration
The aggregate/governance contract in docs/execution/contracts/P3_INTELLIGENCE_AGGREGATE_CONTRACT.md is authoritative for the DTO shape. Implement the full tenant aggregate from authenticated server identity, not client tenantId. Complete liquidity/cashflow/stock/retention sources, transactional decision outcome/idempotency/audit, free-only AI reservation/privacy/429 fallback, real health probes and canonical RBAC. Return exact commit/patch base SHA, PostgreSQL 17 and edge test runs, SQLSTATE/no-side-effect evidence and exact next command. Hosted customer isolation stays SKIPPED until credentials and approval allow real execution; never relabel it PASS.
