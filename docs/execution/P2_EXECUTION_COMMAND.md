# P2 LIVE SESSION COMMAND — 2026-10-30 — REFRESHED
Current main SHA: `68fccfaff3192f934661a2bdc8d48aed155b0457`. Core [41014174530 SUCCESS](https://github.com/Report-Engainall/Nasr1/actions/runs/41014174530) is proven only on ancestor SHA `643d2821ab0483acc12ef21abc453a0c745f2865`. P2 run [41014174609 FAILURE](https://github.com/Report-Engainall/Nasr1/actions/runs/41014174609) on that same ancestor: auth infrastructure/public UI smoke and earlier local Supabase stages passed; the browser test failed in mobile navigation because a CSS-hidden sidebar was queried by role before finance/print assertions executed. Fix is already on main in [68fccf](https://github.com/Report-Engainall/Nasr1/commit/68fccfaff3192f934661a2bdc8d48aed155b0457): stable `#admin-sidebar` locator plus aria-label assertion. No exact-head CI rerun is evidenced. Hosted customer/order/tenant remains SKIPPED.

## تنفيذ P2 المطلوب الآن — exact-head browser then backend contract
1. On current main `68fccfaff3192f934661a2bdc8d48aed155b0457`, run the focused `e2e/finance-task-print.spec.ts` and the P2 local Supabase/Chromium workflow. Preserve closed/open CSS visibility, accessible label, first-item focus, Escape and focus restoration. Record exact SHA and results. Do not reuse the failed 643d282 run as evidence for 68fccf.
2. Implement `docs/execution/contracts/P3_INTELLIGENCE_AGGREGATE_CONTRACT.md`: server-derived tenant/actor/role/capability; request may contain only requestId/metricKeys/period/asOf/optional currency; full unpaginated aggregates and source lineage; currency-separated values; unknown null; completeness/quality/warnings/safe SQLSTATE; sideEffects NONE.
3. Implement atomic DecisionOutcome persistence with version, idempotency key, immutable evidence refs and audit in one transaction; replay same payload returns existing event; conflicting payload conflicts; denied paths leave domain/outcome/idempotency/audit unchanged.
4. Extend the existing AI gateway only: paidSpendLimit=0, official free provider/quota evidence, atomic reservation, 429/cooldown, sanitized question-only egress, no PII/secrets/private commercial data, deterministic fallback.
5. Supply actual fresh health probes and the server canonical RBAC catalogue. Do not accept client-supplied tenant, actor, role or capabilities; DB/RLS remains authoritative.
6. Deliver one bounded P2 owner patch at a time with exact base SHA, changed files, PG17 focused tests, no-side-effect snapshots, CI URLs and exact next command. P2 does not push main; P3 integrates via fast-forward/CAS only after evidence.

**Exact next command:** run the focused browser test on current main `68fccfaff3192f934661a2bdc8d48aed155b0457`; after it passes, deliver the first small aggregate service/RPC + PostgreSQL 17 proof patch.

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
