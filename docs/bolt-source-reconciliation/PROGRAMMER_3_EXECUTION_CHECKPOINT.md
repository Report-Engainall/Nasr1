## P3 PRODUCT CHECKPOINT — 2026-11-06 — REF-NL-CUSTOMER-QUOTE-PIPELINE-001

- Repository: `Report-Engainall/Nasr1`; branch: `main`.
- Source parent before implementation: `f6643a67232e991c816a1e6cf26286053f8f5c2c`.
- Code commits:
  - `baee1a7f9417b4eb42d16c442b1e9424d4423e93` — aggregate-only SQL reader, strict DTO engine and client.
  - `4755f7dd027c6c659830142594016e7341dc5ced` — Arabic assistant planner and read orchestration.
  - `baa16ca9c4e5da78d88a8c2ca39f7be2e2c21d59` — assistant panel and source/planner tests.

### Implemented on main

- Added `public.fetch_customer_quote_pipeline(p_from,p_to)` in migration `20261106170000_customer_quote_pipeline_intelligence.sql`. It derives actor and organization from authenticated staff context; no client-supplied tenant or customer filter is accepted.
- The SQL returns aggregate counts only for the requested UTC `sales_quotes.created_at` cohort: requested for staff pricing, quoted/awaiting customer response, accepted, rejected and expired. It discloses one server `asOf`, period boundaries, complete population and `sideEffects=NONE`.
- Added a strict typed parser that rejects incomplete snapshots, non-UTC or invalid periods, negative/fractional/unsafe counts, and any count reconciliation where status counts do not sum to the total.
- Added an Arabic `CUSTOMER_QUOTE_PIPELINE_OVERVIEW` intent, default 90-day UTC rolling window, and explicit supported windows of 30/60/90/180/365 days. Relative calendar expressions such as today, yesterday, last month, or free dates are refused rather than silently mapped to a different window.
- Added the `CustomerQuotePipelineSummary` panel to the existing Arabic `NaturalLanguageAssistant`. It displays only aggregate counts and an acceptance percentage among explicit accepted/rejected customer decisions. The percentage is withheld until at least 3 explicit decisions exist.
- Critical source limitation is explicit: `sales_quotes` has no order foreign key or persisted order association. Therefore accepted quote != created/confirmed sales order. The new feature does NOT claim quote-to-order conversion and does not calculate response time because there is no independent response timestamp.
- Current status counts are cohort-by-created_at and read at server `asOf`; they are not a historical status snapshot as of the end of the cohort period.
- Added an organization/created_at index to support the date-cohort aggregate. No customer names, IDs, quote IDs, line items, prices, notes or amounts are returned.
- No quote pricing, acceptance, rejection, sales order creation, stock movement, invoice, payment, journal or other business write is performed.

### Exact changed paths

- `supabase/migrations/20261106170000_customer_quote_pipeline_intelligence.sql`
- `src/lib/intelligence/customer-quote-pipeline.ts`
- `src/lib/intelligence/customer-quote-pipeline-client.ts`
- `src/lib/intelligence/natural-language-assistant.ts`
- `src/lib/intelligence/natural-language-assistant-client.ts`
- `src/components/intelligence/CustomerQuotePipelineSummary.tsx`
- `src/components/intelligence/NaturalLanguageAssistant.tsx`
- `src/lib/intelligence/customer-quote-pipeline.test.ts`
- `src/lib/intelligence/natural-language-assistant.test.ts`
- `src/test/customer-quote-pipeline-migration.test.ts`

### Acceptance boundary

- Status: `IMPLEMENTED_ON_MAIN / ACCEPTANCE_PENDING`.
- Source tests were authored but NOT run. No test, build, typecheck, lint, CI, browser, Bolt, database migration application, Preview, Vercel or production operation was run. No PASS/runtime/production claim.
- Bolt must later prove staff authorization and non-staff/foreign-tenant denial; period inclusivity in UTC; exact status counts reconcile to the sales_quotes cohort; no customer/quote/line details in RPC result or UI; malformed payload fail-closed; unsupported date windows do not call RPC; minimum three explicit decisions for acceptance-rate display; accepted quote is never represented as order conversion; and no write side effect.
- Remaining Growth Radar gap: true quote-to-order conversion remains OPEN until the data model persists a trustworthy quote→order source reference and immutable event timing. Do not join by customer/date/product heuristic.

### Next P3 action

Continue another independent source-backed Section 50–63 feature. Treat true quote-to-order conversion, historical response-time analysis and customer-level demand attribution as blocked until authoritative source relationships/events exist.

---

## P3 PRODUCT CHECKPOINT — 2026-11-06 — REF-NL-SUPPLIER-QUOTE-COMPARISON-ASSISTANT-001

- Repository: `Report-Engainall/Nasr1`; branch: `main`.
- Code parent: `555bfe59a09d447d016df9d22c089815118f8b5d`.
- Code commit: `baad6f9f14caf792e109c86c6e99abda01634f85`.
- Feature: `SUPPLIER_QUOTE_COMPARISON_OVERVIEW` in the existing Arabic natural-language assistant.

### Implemented on main

- Added deterministic engine `buildSupplierQuoteComparisonAssistant()` and a dedicated `SupplierQuoteComparisonAssistant` presentation.
- Reused the existing `fetchSupplierQuotes()` reader and its existing `fetch_purchase_supplier_quotes` RPC. The server contract requires an authenticated admin/manager with purchasing permission, resolves the organization from the active server profile, and returns up to the latest 200 saved offers. No tenant or role is supplied by the browser.
- Comparisons include only `received` (current, unawarded) quotes. Awarded and expired quotes are counted but excluded from current-price ranking.
- A comparison basis is exact: same product ID, quoted quantity, unit of measure and currency. No quantity normalization, UOM conversion, FX conversion or cross-currency aggregation occurs.
- Only the latest saved quote per supplier is retained for a given comparison basis so one supplier cannot occupy multiple price positions through revisions.
- Missing unit, inconsistent product snapshots, invalid line-total arithmetic, or fewer than two distinct suppliers are withheld with explicit reasons. The engine does not rank an incomparable offer.
- Results report lowest and second-lowest recorded unit cost only. This is not a supplier-quality score, award recommendation, delivered-cost comparison or purchasing approval.
- The source RPC exposes no count or continuation cursor. If exactly 200 offers are returned, the result is conservatively PARTIAL because older records may exist outside the source page. More than 200 source rows is rejected as an invalid client payload.
- Presentation limits are explicit: up to 20 comparison groups and 10 supplier offers per group, with omitted counts and warnings.
- The path is read-only: no quote award, purchase-order creation, supplier message, stock movement, payment or ledger action is invoked. No new RPC, SQL, migration, provider, permission path, route, or P1 procurement workspace file was changed.

### Exact changed code paths

- `src/lib/intelligence/supplier-quote-comparison-assistant.ts` (new)
- `src/components/intelligence/SupplierQuoteComparisonAssistant.tsx` (new)
- `src/lib/intelligence/natural-language-assistant.ts`
- `src/lib/intelligence/natural-language-assistant-client.ts`
- `src/components/intelligence/NaturalLanguageAssistant.tsx`
- `src/lib/intelligence/natural-language-assistant.test.ts`
- `src/lib/intelligence/supplier-quote-comparison-assistant.test.ts` (new)

### Acceptance boundary

- Status: `IMPLEMENTED_ON_MAIN / ACCEPTANCE_PENDING`.
- Focused planner and engine tests were authored but NOT run.
- No tests, build, typecheck, lint, CI, browser, Bolt, database, migration application, Preview, Vercel or production operation was run. No PASS, runtime or production-readiness claim.
- Bolt must later prove admin/manager authorization, purchasing capability and foreign-tenant denial; source status/200-row coverage; exact product/quantity/UOM/currency match; latest offer per supplier; exclusion of awarded/expired offers; withholding of missing/mismatched basis and invalid line totals; accurate cost differences; UI partial/omitted-count warnings; no quote award, PO creation or other write side effect.

### Next P3 action

Continue only with remaining P3-owned gaps backed by existing authenticated source contracts. Growth conversion, unavailable-product search demand, operational historical baselines, finance opening balances and policy-sender persistence remain blocked on upstream source contracts or P1/P2 ownership; do not infer them from quote prices or current snapshots.

---

### Supplemental P3 increment — commercial terms and bounded supplier price history — 2026-11-06

- Code parent before extension: `9a0ab3ec8546f298433c79c43a28663839455af1`.
- Commits: `70875adbd3bab2723d2b0d98a36d13ffdbc4a04c` (delivery/payment/validity DTO), `995294b21dd3e74a03c741b9da5b7a1838d4bbbd` (commercial-terms UI), `71acfb3dbede92300858e32854e79f8de673f1b3` (terms tests), `96c037fa8632448aec13d6cb8e35e1220f1bdcde` (price-history engine), `6ee0415240d062784593b5344ef4788a85886074` (history UI), `4eb3810d6c3fab6f617f207dde6c639b6b4c567a` (chronology tests), `abce1525e2f40888dfbd921dac014f1d56f7b3f6` (Arabic planner phrases), `f9cc7a3a4f1f8ea138b55aeb2341a0d76810d002` (planner tests).

#### Added behavior

- Each offer now exposes source `delivery_days`, `payment_terms` and `valid_until`. Comparison groups show shortest/longest recorded lead time and present/missing counts. Null remains null; no default lead time or payment term is inferred.
- Price history is separate from current received-offer ranking. It includes saved quote lifecycle states, grouped only by the same supplier, product, quoted quantity, UOM and currency. The first/latest observations use source `created_at`, not `updated_at`.
- A history comparison requires at least two observations at distinct timestamps, consistent product snapshots, valid price/quantity arithmetic and timestamps no later than query time. It reports absolute price change and percentage only when the starting price is greater than zero; a zero baseline yields a null percentage.
- The source has a 200-quote cap and no total/cursor. History therefore uses only the returned page; exactly 200 remains PARTIAL. Explicit date-window requests remain UNSUPPORTED because the RPC cannot prove that window complete.
- Unit price, lead time, payment terms and historical price movement remain separate dimensions. No weighted score, landed-cost estimate, quality rating, prediction, award recommendation or automatic purchase order was added.
- Existing admin/manager purchasing authorization and server-side tenant resolution remain in force. No new RPC, SQL, migration, provider, P1 procurement file, award, stock, payment or ledger action was introduced.

#### Exact paths

- `src/lib/intelligence/supplier-quote-comparison-assistant.ts`
- `src/components/intelligence/SupplierQuoteComparisonAssistant.tsx`
- `src/lib/intelligence/supplier-quote-comparison-assistant.test.ts`
- `src/lib/intelligence/natural-language-assistant.ts`
- `src/lib/intelligence/natural-language-assistant.test.ts`

#### Acceptance boundary

- Status: `IMPLEMENTED_ON_MAIN / ACCEPTANCE_PENDING`.
- Focused tests were authored but NOT run. No build, typecheck, lint, CI, browser, Bolt, database, Preview, Vercel or production acceptance was run. No PASS/runtime claim.
- Bolt must later validate authorization/tenant denial, exact-basis history grouping, created_at order, inclusion of saved quote states, same/future timestamp refusal, zero-baseline percentage withholding, first/latest source reconciliation, 200-row PARTIAL, visible null commercial terms and absence of purchasing side effects.


### Supplemental P3 increment — actual supplier performance joined to saved offers — 2026-11-06

- Code parent: `d05f343bfb40a6501d2048d53cb661787ba45c92`.
- Commits: `e12e229662c7e1f2e734510be206581eeefeb870` — typed same-tenant performance join; `9255504d928a94e02af4e3f772893c57d08dca1b` — concurrent quote/performance reads over one captured 90-day UTC period; `eb65659a797d72ae1d1b0cde3e5d1750866034d6` — Arabic result presentation; `dcabfeafceaafb817afda64b309cd7f83aa5c805` — performance evidence tests; `f211ef873e083b0f9ff101321ffdd119371acfd7` — Arabic query synonyms and example; `8ac09e9081e1b76eafda5113ce898396ebbf7b49` — narrow absence semantics.

#### Added behavior

- The supplier quote comparison now reads the existing `fetch_supplier_performance_snapshot` client in parallel with `fetch_purchase_supplier_quotes`, using a captured 90-calendar-day UTC window. The existing server functions independently resolve the authenticated organization and require the purchasing-management capability.
- Quote supplier identity is joined to performance `supplierId` inside the engine; no supplier UUID or order identity is rendered in the panel.
- The UI separates quoted `delivery_days` (supplier promise) from actual median receipt lead time derived from purchase orders and receipts. On-time adherence is sourced from the awarded quote promise; it is never inferred from the requested quote terms alone.
- Actual median lead time is displayed only when the supplier has at least 3 completed lead-time samples. On-time percentage is displayed only with at least 3 promised-delivery samples. Sample counts remain visible when a rate is withheld.
- When a supplier is absent from a complete performance population, the result says there were no eligible purchase orders for that supplier in the measured period. When the supplier source page is partial, absence is `NOT_IN_RETURNED_PAGE` and is not interpreted as no activity.
- If the performance reader is denied, unavailable or errors, the price/quote comparison is preserved, the overall result becomes PARTIAL, and the performance component is explicitly unavailable. No zero-fill.
- No supplier score, weighted ranking, forecast, landed-cost estimate, delivery promise inferred from actual lead time, award, PO creation or business write was added.

#### Exact paths

- `src/lib/intelligence/supplier-quote-comparison-assistant.ts`
- `src/lib/intelligence/natural-language-assistant-client.ts`
- `src/components/intelligence/SupplierQuoteComparisonAssistant.tsx`
- `src/lib/intelligence/supplier-quote-comparison-assistant.test.ts`
- `src/lib/intelligence/natural-language-assistant.ts`
- `src/lib/intelligence/natural-language-assistant.test.ts`

#### Acceptance boundary

- Status: `IMPLEMENTED_ON_MAIN / ACCEPTANCE_PENDING`.
- Source tests authored but NOT run. No build/typecheck/lint/CI/browser/Bolt/database/Preview/Vercel/production action was run. No PASS/runtime claim.
- Bolt must verify both readers derive the same authenticated tenant and enforce purchasing role; complete and partial supplier-performance page semantics; identity join; 90-day UTC period disclosure; 3-sample gates; actual vs promised lead-time separation; denied/unavailable performance with quote comparison preserved; and no supplier/order UUID or business write in the rendered assistant result.


### Supplemental P3 increment — supplier receipt tail and reconciliation signals — 2026-11-06

- Code parent: `65312224cd73e4d7474acbba1b89b7c548876e1a`.
- Code commit: `511b7e3a3ffdfa81a703d92eeec3e05751b8c661`.
- Extended the existing supplier quote/performance comparison contract with source `p90LeadDays`, `inconsistentReceivedCount`, and `completedWithoutPromiseCount`.
- The source SQL defines `inconsistentReceivedCount` as purchase orders whose stored status is `received` while the receipt evidence/quantity checks do not prove completion. The UI deliberately labels these as "orders marked received without proven completion"; it does not assign blame or assert stock shortage.
- Completed orders without an awarded-quote delivery promise are shown as a separate count. This is not interpreted as late performance.
- P90 lead time is exposed only with at least 10 completed lead-time samples. Median still requires 3, and on-time rate requires 3 promised-delivery samples. The source P90 value is reused; no client percentile is recomputed.
- Tests were extended for P90 withheld at 4 samples and visible at 10 samples together with the reconciliation counters. Tests authored, NOT RUN. No new SQL/RPC, no P1 workspace, no PO, stock, finance or supplier write.
- Status remains `IMPLEMENTED_ON_MAIN / ACCEPTANCE_PENDING`.


## P3 PRODUCT CHECKPOINT — 2026-11-06 — REF-NL-SHIFT-OPERATIONS-ASSISTANT-001

- Repository: `Report-Engainall/Nasr1`; branch: `main`.
- Code parent before this increment: `b662ef538d87f1d705d4d4517994b3f78025d7f6`.
- Code commits: `3afd39faebea4f4c898e84c77fe9b2e13fe52749`, Arabic date/intent correction `5f716ea481a0d07b7dbdf720faf7891331423ebe`, and final date/applicability correction `d69c1ef4ed6ef433f16a78bea95f12d43f239870 and strict read-only guard c7a67c33c97996c0eebba5934a3afea1bcd7558d`.
- Feature: Arabic assistant intent `SHIFT_OPERATIONS_OVERVIEW` backed by the existing shift workspace contract.

### Implemented on main

- Added Arabic read intent for the shift opening/closeout center, readiness and handover questions.
- The planner requires exactly one explicit valid `YYYY-MM-DD` business date. It does not infer a date from browser-local time, UTC, or relative words such as "today"; ambiguous, missing or invalid dates return CLARIFICATION before an RPC call.
- Reused `fetchOperationalShiftWorkspace({ businessDate })`, the existing authenticated `fetch_operational_shift_workspace` RPC client, deterministic `buildShiftOperationsCenter` result, parser and the existing `ShiftOperationsCenter` presentation.
- The summary is computed only from the returned shift packet: opening readiness, operational closeout, financial closeout eligibility, action-required checks, unknown checks, and non-applicable-aware source coverage. Organization time zone and source `asOf` are displayed from the server result.
- The read path preserves existing `DENIED`, `NOT_FOUND`, `UNAVAILABLE` and malformed-source states; no fallback or zero-fill is introduced.
- No shift is opened, no cash count or handover is recorded, no financial close is posted, no stock movement or journal is executed. The natural-language query remains read-only.
- No new RPC, SQL, migration, permission path, route, provider or P1-owned workspace/shell file was added or changed.

### Exact changed code paths

- `src/lib/intelligence/natural-language-assistant.ts`
- `src/lib/intelligence/natural-language-assistant-client.ts`
- `src/components/intelligence/NaturalLanguageAssistant.tsx`
- `src/lib/intelligence/natural-language-assistant.test.ts`

### Acceptance boundary

- Status: `IMPLEMENTED_ON_MAIN / ACCEPTANCE_PENDING`.
- Source tests were authored for required explicit date, relative-date clarification, invalid calendar date, Arabic closeout phrasing, and refusal to reinterpret start-shift/handover/cash-count commands as read-only success; NOT RUN.
- No tests, build, typecheck, lint, CI, browser, Bolt, database, migration application, Preview, Vercel or production action was run. No PASS/runtime/production claim.
- Bolt must later prove: valid date resolves in the organization business time zone; missing/relative/multiple/invalid dates never call the RPC; authorized same-tenant read; denied role and foreign-tenant denial; missing shift returns NOT_FOUND; missing migration/source returns UNAVAILABLE; coverage and closeout checks reconcile to server DTO; the assistant read itself does not change shifts, cash, handover, stock or journals.

### Next P3 action

Continue the next independently executable P3-owned source-backed gap. P1 shell/workspace ownership and any separately authorized shift commands remain outside this read path.

---

## P3 PRODUCT CHECKPOINT — 2026-11-06 — REF-NL-DECISION-MEMORY-ASSISTANT-001

- Repository: `Report-Engainall/Nasr1`; branch: `main`.
- Code parent before this increment: `541b3902fe08eb65c39781b04b315027710a2478`.
- Code commits: `e654903224ca378dc7862cf5e195e9a8abc079d6` and Arabic intent correction `5f0d3b67fd94fceea766ccdad4db187b9e053c0f`.
- Feature: Arabic assistant route for the existing decision-memory and measured-learning body. Intent: `DECISION_MEMORY_OVERVIEW`.

### Implemented on main

- Added allow-listed Arabic questions for the decision memory book, learning from decision results, decision lessons and policy-review drafts. Historical date/window requests are explicitly UNSUPPORTED because this query reads a current bounded page, not a historical event feed.
- Reused the existing authenticated `fetch_decision_outcomes` reader through `fetchDecisionOutcomes(100, 0)`. The memory builder consumes only server-returned outcomes and their embedded parsed memory snapshots; it does not fabricate, backfill or independently join decision records.
- Composed the existing `buildDecisionMemoryBook` and `buildDecisionPolicyReviewSuggestions` engines, then rendered the already-existing `DecisionMemoryBook` component within the existing Arabic `NaturalLanguageAssistant`.
- Review drafts are generated only by the established engine's gates: MEASURED decision, VERIFIED complete memory, reviewed lessons, verified expected/actual metrics, matching metric key/unit/currency/UOM/period/formula/version, and source evidence that passes the evidence checks. No causal impact is inferred and no draft changes a policy, price, credit limit or inventory position.
- The assistant exposes loaded/total counts and the DecisionMemoryBook page warning. The reader loads at most the first 100 decisions. When `total > loaded`, the book is PARTIAL; absence of a precedent or draft on this page is not proof that none exists in older pages.
- Existing memory-capture and decision-lifecycle actions remain explicit user-triggered controls backed by their existing authenticated server RPCs. The natural-language query itself is read-only; this addition creates no automatic save, approval, execution or policy change.
- No new RPC, SQL, migration, route, provider, paid service, schema, permission path or P1 workspace/shell/commerce-page change was introduced.

### Exact changed code paths

- `src/lib/intelligence/natural-language-assistant.ts`
- `src/lib/intelligence/natural-language-assistant-client.ts`
- `src/components/intelligence/NaturalLanguageAssistant.tsx`
- `src/lib/intelligence/natural-language-assistant.test.ts`

### Acceptance boundary

- Status: `IMPLEMENTED_ON_MAIN / ACCEPTANCE_PENDING`.
- Arabic planner tests were authored for the decision-memory phrases and historical-window refusal; they were NOT run.
- No test, build, typecheck, lint, CI, browser, Bolt, database, migration application, Preview, Vercel or production operation was run. No PASS, runtime or production-readiness claim.
- Bolt must later import the exact code-bearing SHA (or its documentation-only descendant) and prove role authorization/denial, tenant isolation, first-page loaded/total reconciliation, PARTIAL indication, evidence and memory eligibility gates, explicit save/lifecycle RPC persistence, idempotent replay, stale-version handling, refresh after save and absence of automatic policy/business side effects.

### Next P3 action

Continue the next independent P3-owned, source-backed gap. Do not infer missing operational baselines or financial measures; preserve P1 mounts and P2 sender/persistence ownership.

---

# P3 INCREMENTAL PRODUCT BODY CHECKPOINT — CUSTOMER SERVICE INTELLIGENCE — 2026-11-06

**Repository:** `Report-Engainall/Nasr1` · **branch:** `main`  
**Verified code-bearing SHA:** `eabde4b160cab74b1856ca80a178e88968fc5dc0`  
**Verified latest main/documentation SHA at checkpoint update:** `f3760c03b35bb4d4ebcdb9f920a3b6f7ab28a046`

## Implemented in this continuation

- Added `public.get_customer_service_work_queue_summary()` in `supabase/migrations/20261106100000_customer_service_intelligence_summary.sql`. It is a SECURITY DEFINER, empty-search-path, authenticated active same-organization staff read. It uses one server timestamp and emits only an aggregate snapshot. It does not return customer/case/employee identities, descriptions, subjects, messages or financial data.
- Added a strict client DTO in `src/lib/intelligence/customer-service-intelligence-client.ts`. The parser accepts exactly four root keys and exactly six summary keys; it rejects detail-bearing payloads, partial populations, invalid timestamps, negative/fractional/unsafe counts and any counter greater than the complete active-case population.
- Added four allow-listed Arabic intents to the existing natural-language assistant: active customer-service overview, first-response SLA overdue, resolution SLA overdue and unassigned cases. The planner explicitly rejects historical/date-window requests because the source is a current snapshot only.
- Added a resolver that keeps response-overdue and resolution-overdue as distinct counts. They may overlap; no combined overdue total is calculated.
- Connected the query client to the existing `NaturalLanguageAssistant` and added a six-metric Arabic aggregate panel showing server as-of separately from client query time. The panel explicitly states that it contains aggregate counts only and exposes no case/customer/employee detail.
- Added focused source tests for parser completeness, exact aggregate key allowlist, impossible counts, detail-payload rejection, Arabic intent selection, historical-window refusal and non-additive SLA overlap.
- Added migration/runtime acceptance handoff: `docs/execution/contracts/P3_CUSTOMER_SERVICE_INTELLIGENCE_HANDOFF.md`.
- Added matrix leaf `REF-NL-CUSTOMER-SERVICE-INTELLIGENCE-001`, and refreshed the existing Section 61 rows to reflect P1's actual mounts.

## Code commits in this continuation

1. `c98b7323c6ae07d2459055616a008d0b01a2027b` — aggregate-only tenant-scoped customer service RPC.
2. `34f856e720cd4a31e69b56781b45e5e397c82096` — strict customer service intelligence DTO/client.
3. `59f4a7d9df865c57c66a6835dfa902a4ffc8510b` — Arabic intent planner and deterministic resolver.
4. `354ee175c7e142f3bd9921e37943a72997f91b2d` — assistant RPC resolver.
5. `8288385014a780169170f188dc7f18902228ec02` — Arabic aggregate metrics display.
6. `8fd781b2917e162f15a5a2edf158cc236cdde3c5` — exact payload-key and privacy fail-closed parser.
7. `d837dcc4f9aa0072dad8b398079749ac06b5a0eb` — query synonym and current-snapshot boundary refinement.
8. `9ec5a35b6db2358ed8a271d31ea6255341b2975e` — preserve wide aggregate counts (remove 32-bit narrowing).
9. `11b37346413606760f1fef1323b07f65f90f4db1` — parser contract test source.
10. `fc444315eb736a612c96630d810916216691fc75` — unassigned-case phrase recognition.
11. `ff69dfb7250cb9e1d73559cabc871d8c1c969db2` — Arabic intent test source.
12. `eabde4b160cab74b1856ca80a178e88968fc5dc0` — projection/overlap test source.

Documentation commits:
- `4b175ea851f7672c2802eae01f4f42aacf378ee7` — P3 customer-service intelligence handoff.
- `f3760c03b35bb4d4ebcdb9f920a3b6f7ab28a046` — updated acceptance matrix and P1 mount status.

## P1 integration status refresh

P1 has now mounted `TaskQualityReviewForm` in `TaskCenter.tsx` using the actual `task.id` and `task.updated_at`, the existing `canManage` gate, `key={task.id}` and `onSaved={loadTasks}` (P1 commit `4eb080d6ee44a74a36086a6cb9014e8d0fb4004b`). The existing `IntelligenceWorkspace.tsx` also mounts `NaturalLanguageAssistant` with its authorized supplier-invoice and purchase-order callbacks. These mounts are present on current main; do not redo them.

## Remaining / boundary

- Migration `20261106100000_customer_service_intelligence_summary.sql` is source-only. It depends on customer-service case/SLA/work-queue migrations `20261105190000`, `20261105200000`, and `20261105210000` being applied first in the approved non-production workflow.
- No migration, test, build, lint, typecheck, CI, browser, Bolt, Preview, Vercel or production operation was run in this continuation. The tests are committed but unexecuted. No runtime PASS is claimed.
- Existing aggregate queue source is current-snapshot only. Historical SLA trends remain unsupported until an audited time-series source exists.
- Section 52's comparable baselines for order lateness, receiving, supplier settlement and inventory variance remain withheld until exact tenant-scoped source evidence, formula and period contracts exist.
- The assistant is mounted by P1 but the new customer-service query remains acceptance-pending until the migration is applied and role/tenant/no-detail behavior is proven on the exact SHA.

**Next P3 action:** add historical SLA trend intelligence only after a tenant-scoped append-only SLA event source and full-period aggregation contract are grounded; otherwise continue the next true P3-owned matrix gap without inventing history.  
**Status:** `IMPLEMENTED_ON_MAIN / ACCEPTANCE_PENDING`; no release or production readiness is asserted.

---

# P3 INCREMENTAL PRODUCT BODY CHECKPOINT — 2026-11-06

**Repository:** `Report-Engainall/Nasr1` · **branch:** `main`  
**Verified source-code cursor:** `80f5ad7a7709b0bbeaeaef1a35fd7ea2ca92f466`  
**Current documentation cursor at checkpoint update:** `2d591801304e139840fbd5b7f1ab9e217c52327b`

## Implemented in this continuation

- Added `fetchOperationalTaskQualityMetrics()` to the existing quality client. It reads `fetch_operational_task_quality_metrics` directly, validates with `parseTaskQualityMetrics`, and preserves `RESTRICTED` / `UNAVAILABLE` instead of inventing metrics.
- Changed `fetchTaskPerformanceScorecard()` to read the base performance scorecard and quality RPC independently. A missing quality migration no longer suppresses an otherwise valid base scorecard.
- Extracted the existing quality metrics panel into reusable `TaskQualityReviewMetrics`, exported through the intelligence component barrel, and reused it in the existing scorecard without touching P1's `IntelligenceWorkspace.tsx`.
- Expanded the quality panel to report actionable-rate, recommendation approve/reject/defer counts, false-alarm rate, true-positive alerts, false-positive alerts, pending alert reviews and approved recommendation count, reason frequencies, affected-task counts and repeated causes.
- Extended `TaskQualityReviewForm` with an optional, paginated selector backed by `fetch_decision_outcomes`. It can link only an exact ID returned by the source; without a selected ID, the quality review remains unlinked. The review RPC remains the tenant/authorization boundary and does not change decision state.
- Extended the allow-listed Arabic assistant with `TASK_QUALITY_OVERVIEW`. It resolves quality/recommendation/alert-review questions through the same read-only RPC and displays the reusable panel. `queriedAt` is labelled as query time, not the last review/source update.
- Updated the P1 handoff and added matrix leaf `REF-TASK-QUALITY-METRICS-ASSISTANT-001`.

## Source commits

1. `bacd2ac862a914a19865a7e4ecc5508f90d71535` — direct quality metrics reader.
2. `d13a41f5c88586c43c3aa69b5ecac711eab400ca` — independent scorecard and quality reads.
3. `e12ada7858bbb784da02a4891cc8efd08284a8cf` — reusable quality metrics component.
4. `c990d9d7426827b0fecc2c2a9eda5a4cff8fb06f` — existing scorecard consumes the reusable component.
5. `9cb5e41c859f54db2a30fd084195d7d5bbe0f010` — decision selection in quality review form.
6. `aa29aff5174fdeee85b7cf6ee2fd9c47b20348e5` — component barrel export.
7. `8598f5c2dfbbf909bf95d696439d5b36b1420f2b` — explicit correct/pending alert counts.
8. `40104d187359b1e75ca50402a2995ca4b8723d32` — Arabic quality intent planner.
9. `8da3a4d61f64102d19518600eae0d0119bdc887a` — natural-language result contract.
10. `9d67bc2a80d48c4bce04134db22445e5788369e7` — quality RPC resolver.
11. `e75c85f07fa3633b225a4dfa85e5a6ce2cfaab40` — assistant result UI.
12. `80f5ad7a7709b0bbeaeaef1a35fd7ea2ca92f466` — explicit approved recommendation count.

Documentation commits:
- `693adc7d069218073da9cd70c81bcca73f6bf165` — P1 integration handoff updated.
- `4b17f498cfa5d12f4818dc29870f2f8ed2eb2d91` — acceptance matrix leaf recorded.

## Remaining / boundary

- P1 has mounted `TaskQualityReviewForm` in the existing `TaskCenter.tsx` card (P1 commit `4eb080d6ee44a74a36086a6cb9014e8d0fb4004b`) using actual `task.id`/`task.updated_at`, the existing `canManage` gate, `key={task.id}` and `onSaved={loadTasks}`. This mount is complete on current main; Bolt migration/runtime acceptance remains pending.
- P1's existing `NaturalLanguageAssistant` mount is present in `IntelligenceWorkspace.tsx` with the authorized existing supplier-invoice and purchase-order callbacks; P3 did not edit that workspace.
- The quality migration `20261106090000_operational_task_quality_reviews.sql` and prerequisite task scorecard/audit migrations remain source-only pending the approved Bolt non-production workflow.
- Section 52 is not fully closed: the current persisted expected-baseline selector is limited to `cashflow.expected_collections`. Comparable operational baselines/actuals for order lateness, receiving, supplier settlement and inventory variance remain unimplemented until their exact source tables, metric formulas, tenant scopes and evidence IDs are grounded. Do not estimate those values.
- No weighted denominator is defined for all remaining P3 requirements in the matrix; a truthful 95% closure percentage cannot be certified from this delivery. Do not substitute file counts or number of commits.
- No tests, build, lint, typecheck, CI, browser, database migration application, Bolt runtime, Preview, Vercel or production operation was run in this body-only continuation. No PASS or runtime proof is claimed.

**Next P3 action:** extend Section 52 only where exact tenant-scoped operational source evidence and deterministic formula contracts exist; preserve `WITHHELD` for unsupported sources. Continue P3-owned Sections 53–56 and 59–63 gaps from the live matrix without duplicating completed engines.  
**Status:** source code `IMPLEMENTED_ON_MAIN / ACCEPTANCE_PENDING`; release readiness is not asserted.

---

# P3 Execution Checkpoint — live resume record

## Current state — 2026-10-25 05:10 +03:00

- **Status:** IMPLEMENTATION MERGED; exact-head acceptance and post-merge Core CI PASS. Live external Onyx Pro round-trip remains NOT_PROVEN / BLOCKED_EXTERNAL.
- **Repository:** `Report-Engainall/Nasr1`; production reference: `main`.
- **MAIN_SHA_AT_RESUME:** `fbf7d4878b440baacdf34f12c35459b24507b04d`.
- **MAIN_SHA_AFTER_P3_MERGE:** `bb67a4ae26285ed402ee0e9b8b945a8d0abe752c`.
- **LATEST_MAIN_SHA_AT_CHECKPOINT_SYNC:** `557103c71ffa001e76ab78f75cd3f25a200c173d`, following the separately merged P1 payment-audit actor tenant guard.
- **LATEST_MAIN_CI:** Core run [40153137096](https://github.com/Report-Engainall/Nasr1/actions/runs/40153137096) completed SUCCESS on exact `557103c71ffa001e76ab78f75cd3f25a200c173d`; customer-payment audit PG17 [40153137066](https://github.com/Report-Engainall/Nasr1/actions/runs/40153137066) and import-finalizer tenant-scope PG17 [40153137080](https://github.com/Report-Engainall/Nasr1/actions/runs/40153137080) also completed SUCCESS on that SHA.
- **P3_BRANCH:** `p3/acceptance-resume-and-onyx-evidence-20261025`.
- **P3_FEATURE_HEAD:** `6fd4eaed21d1490d020b4b3b4f76db6fa59db64c`.
- **MERGED_PR:** [PR #207](https://github.com/Report-Engainall/Nasr1/pull/207), squash merge `bb67a4ae26285ed402ee0e9b8b945a8d0abe752c`.
- **EXACT_HEAD_CORE:** [run 40152320592](https://github.com/Report-Engainall/Nasr1/actions/runs/40152320592) SUCCESS on `6fd4eaed21d1490d020b4b3b4f76db6fa59db64c`.
- **EXACT_HEAD_P2:** [run 40152320526](https://github.com/Report-Engainall/Nasr1/actions/runs/40152320526) SUCCESS on the same feature SHA. Public no-write storefront smoke and local-Supabase authenticated acceptance both passed; hosted customer/tenant E2E was explicitly SKIPPED at the external-credentials gate.
- **UNIT_ACCEPTANCE:** 188/188 test files and 1,217/1,217 tests passed; the new `src/test/onyx-source-evidence-contract.test.ts` passed all 10 tests on both the PR head and post-merge SHA.
- **ISOLATED_POSTGRESQL_17:** migration/core acceptance, executive analytics, quote decision, invitation expiry/audit, stock-count audit, async export lifecycle, concurrent import request idempotency, inventory snapshot, storefront saved-products, backup/restore and Onyx workflows passed on exact PR head. Logs record:
  - `PASS Onyx inventory reconciliation` — tenant and warehouse scope, preview no-write, idempotent apply/rollback, reservations, stale preview/apply and audit movements.
  - `PASS Onyx reconciliation two-session concurrency` — one apply, one replay, one stock movement and one audit.
  - `PASS Onyx source evidence` — source hash match/mismatch, external ID bounds, no inferred sync proof, and staff/customer/inactive/foreign-tenant denial.
- **LOCAL_BROWSER_ACCEPTANCE:** P2 local-Supabase job in run 40152320526 SUCCESS. It applied repository migrations to local PostgreSQL 17 and passed endpoint guard cases, atomic price-grid rollback/audit/stale-writer race, cash-expense idempotency/concurrency, purchase receipt accounting restrictions, authenticated order persistence/cross-tenant denial, customer return/credit memo flow, audited Onyx order XLSX export, finance/task print, customer-manager privacy/authorization/audit, and central device-session revocation.
- **POST_MERGE_CORE_FOR_P3_MERGE_SHA:** [run 40152650423](https://github.com/Report-Engainall/Nasr1/actions/runs/40152650423) SUCCESS on P3 merge SHA `bb67a4ae26285ed402ee0e9b8b945a8d0abe752c`, including unit tests, isolated PostgreSQL 17 workflows, lint, build, preview/dev-server smoke and Chromium price-visibility acceptance.
- **IMPLEMENTED_CHANGE:** `src/lib/onyx-source-evidence.ts` now strictly validates UUID group structure for sync-attempt IDs and optional snapshot/order IDs. The prior broad hyphen/hex check accepted structurally invalid UUID strings. The error path now reports invalid attempt ID directly instead of a generic incomplete-field error.
- **REGRESSION_COVERAGE:** `src/test/onyx-source-evidence-contract.test.ts` covers source/import provenance, explicit hash mismatch, unsupported live-proof claims, cross-tenant evidence, missing source identity, malformed attempt/snapshot/order UUIDs, and a structurally valid pending attempt.
- **SOURCE_RECONCILIATION:** Compared `Nasr-Adnan/Nasr-Adnan` at observed main SHA `34702e670d80e80340d54683171238292099cbaa`. The implementation already existed in Nasr1; only missing contract tests were adapted. No runtime source implementation, migrations, lockfiles, archive, secrets or production data were copied.
- **FILES_CHANGED_AND_MERGED:** `src/lib/onyx-source-evidence.ts`; `src/test/onyx-source-evidence-contract.test.ts`; this execution checkpoint; `PROGRAMMER_3_ROUTE_ACCEPTANCE_REGISTER.md`. No schema or production database changes.
- **ONYX_LIVE_SYNC:** NOT_PROVEN / BLOCKED_EXTERNAL. Local database evidence and saved snapshots do not prove a real provider call. No approved non-production Onyx Pro endpoint/credential and verified API contract were available; no external request or production write was attempted.
- **LOCAL_TEST_LIMITATION:** Repository tests were executed by GitHub Actions on exact SHAs; they were not run from this session's shell because the runtime could not resolve github.com and had no cloned checkout. Claims above refer to the linked CI evidence, not a local test invocation.
- **PR #209 PRE-SYNC CI:** Core [40152959295](https://github.com/Report-Engainall/Nasr1/actions/runs/40152959295) SUCCESS and P2 [40152959290](https://github.com/Report-Engainall/Nasr1/actions/runs/40152959290) SUCCESS on PR head `b0e0491aeedb4b10531c305846e395e4334c8d35`. P2 attempt 1 hit a transient host-port collision on `55432` before app tests; attempt 2 on the same SHA passed local Supabase migrations and all browser acceptance steps. The workflow file is P2-exclusive in `WORK_COORDINATION.md`, so P3 did not edit it. These checks predate the newer `main` SHA; exact-head CI must rerun after this synchronization.
- **NEXT_ACTION:** Verify Core and P2 CI on this branch after synchronization to latest main `557103c71ffa001e76ab78f75cd3f25a200c173d`; merge the documentation PR only after both reach terminal SUCCESS, then verify the actual merge SHA. Separately obtain an approved non-production Onyx Pro endpoint, credentials and API contract, then run a real provider round-trip with request/response hashes, external IDs, tenant scope, idempotency, timeout/retry, concurrency and failure-state verification. Until an actual provider response is captured, keep external sync labelled NOT_PROVEN. Keep hosted customer/tenant E2E SKIPPED/BLOCKED_EXTERNAL unless its separate authorized credential gate is met.
- **BLOCKERS:** Missing approved Onyx Pro API contract/credentials; hosted customer/tenant E2E external credential gate. These do not invalidate successful local-Supabase acceptance.
- **UPDATED_AT:** 2026-10-25 05:10 +03:00.


## P3 incremental product-body checkpoint — decision outcome lifecycle controls — 2026-11-06

**Repository:** `Report-Engainall/Nasr1` · **branch:** `main`  
**Code commit:** `ee5bba71952b899c6bb86bad9accec70b785ff9e`  
**Parent observed before this delivery:** `bb59a109e7bc46138e07149db9d27ac106327df1`

### Delivered on main

- Added `DecisionOutcomeLifecycleControls` and mounted it inside the existing `DecisionMemoryBook` card; no P1 workspace or commerce/admin route was modified.
- Added legal state-specific commands for proposal submission, approval/rejection, assignment, execution start and execution completion, all through the existing `command_decision_outcome` RPC client.
- Added server-version display and mandatory reason capture at the UI boundary; the server remains authoritative for transition legality, tenant, permission and immutable audit.
- Carried the server-returned `ownerProfileId` into the memory read model. Assignment is withheld when the trusted owner ID is absent; it never accepts a free-text identity.
- Extended the existing command client to accept validated caller-supplied event/idempotency UUIDs. The UI retains the same IDs and frozen payload after an ambiguous unavailable response so the user can retry the exact command without issuing a second logical event.
- Kept measurement unavailable from this UI until an actual source-backed measurement proof is supplied. No manual amount, scenario output or what-if result is promoted to an operational outcome.
- The component is re-exported from the intelligence component barrel for reuse without editing `IntelligenceWorkspace.tsx`.

### Exact changed files

- `src/components/intelligence/DecisionOutcomeLifecycleControls.tsx` (new)
- `src/components/intelligence/DecisionMemoryBook.tsx`
- `src/components/intelligence/index.ts`
- `src/lib/intelligence/decision-memory.ts`
- `src/lib/intelligence/decision-outcome-client.ts`

### State and limits

- Source status: `IMPLEMENTED_ON_MAIN / ACCEPTANCE_PENDING`.
- No tests, build, lint, typecheck, CI, browser, database migration, Bolt, Preview, Vercel or production action was run for this product-build batch, per the execution constraint. No PASS or runtime proof is claimed.
- The existing decision-outcome and decision-memory RPC migrations still require the approved non-production database sync/acceptance. Server-side tenant/role denial, stale-version behavior, same-key replay/conflict, and event reload need exact-SHA database acceptance.
- The actual-measurement transition remains intentionally blocked in the component while the UI has no general verified measurement source; the current cashflow measurement proof is limited to `cashflow.expected_collections`.
- Existing growth-radar source gaps, Business Health source completeness, shift/process/policy and task-quality migration application remain unchanged and are not marked accepted by this commit.

**Next P3 action:** resume from the latest `main` SHA; close another independent source-backed Section 57/52 gap only where a current RPC and evidence contract already exist, otherwise retain the explicit withheld state for Bolt/source dependencies.


## P3 incremental product-body checkpoint — Arabic decision outcome assistant — 2026-11-06

**Repository:** `Report-Engainall/Nasr1` · **branch:** `main`  
**Code commit:** `a259462c29feb3b3407f3c159aa4ce3af3adabc4`  
**Parent:** `a259462c29feb3b3407f3c159aa4ce3af3adabc4`

### Delivered on main

- Extended the existing Arabic intent planner with three narrow read-only intents: `DECISION_OUTCOMES_OVERVIEW`, `DECISIONS_PENDING_REVIEW`, and `DECISIONS_AWAITING_EXECUTION`.
- The client calls the existing `fetch_decision_outcomes` RPC through `fetchDecisionOutcomes(100, 0)`; it does not add SQL, direct table access, or a new RPC.
- The resolver emits only current-state counts for the eight known decision states. It does not expose owner labels, proposal content, finance values, or event payloads.
- The response includes server total, inspected count, query timestamp and completeness. If total exceeds the first 100 rows, state is `PARTIAL`; filtered counts are explicitly limited to the inspected page. Historical/date-window questions are refused because the RPC is a current list, not an event time-series.
- The existing Arabic assistant UI now renders the state distribution and partial-coverage disclosure; no P1 workspace mount or route was changed.

### Exact changed files

- `src/lib/intelligence/natural-language-assistant.ts`
- `src/lib/intelligence/natural-language-assistant-client.ts`
- `src/components/intelligence/NaturalLanguageAssistant.tsx`

### State and limits

- Source status: `IMPLEMENTED_ON_MAIN / ACCEPTANCE_PENDING`.
- The RPC remains server-authorized; permission denial is preserved. No historic event interpretation or unbounded scan is claimed.
- No tests, build, lint, typecheck, CI, browser, database migration, Bolt, Preview, Vercel or production action was run for this body-only batch. No PASS or runtime proof is claimed.
- Current main includes both code commits `ee5bba71952b899c6bb86bad9accec70b785ff9e` and `a259462c29feb3b3407f3c159aa4ce3af3adabc4`; the next checkpoint is the authoritative source cursor.

**Next P3 action:** continue only with independent missing product behavior backed by existing tenant-scoped source contracts. Keep growth-radar quote conversion/product demand and Business Health completeness withheld where the source DTO/evidence pairing remains absent; do not synthesize figures to satisfy the target ratio.


## P3 incremental product-body checkpoint — source-backed decision measurement — 2026-11-06

**Repository:** `Report-Engainall/Nasr1` · **branch:** `main`  
**Code commit:** `9a5e8c67f04adcfc488e91978983a3ac3014101e`  
**Parent:** `6e26470b9fc8b9d6d3f6ed87dd12ea1c21aa26a9`

### Delivered on main

- Added an exact-period cashflow request builder that reuses the stored baseline's period and currency and passes the existing read-only `get_intelligence_aggregate` contract. The regular 7/30/90-day request path remains unchanged.
- Connected the existing `DecisionOutcomeLifecycleControls` to the existing `command_decision_outcome` MEASURE event only when the saved, verified baseline is `cashflow.expected_collections`, currency-backed, and uses `nasr1.receivables-outstanding@1`.
- The component requests a fresh source snapshot for the exact baseline period/currency, then requires complete/acceptable schedule and top-level quality, exactly one matching metric, later `asOf`, exact period/formula, non-empty unique evidence IDs and membership of every metric evidence ID in the returned source evidence records.
- Only that source-returned proof is submitted. The event and idempotency IDs and the frozen measurement payload are retained on ambiguous retry. The command's server-side function independently recomputes the full same-tenant invoice/payment evidence set and amount before it can transition to `MEASURED`.
- Measurement remains withheld for all other metric keys, currencies/formula mismatches, stale or invalid periods, incomplete source results, absent evidence, or missing expected baseline. No user-entered numeric amount is accepted.
- UI wording now distinguishes the measured value accurately: it is the remaining outstanding balance of customer invoices due in the period at the measurement timestamp, **not** total bank receipts or a bank cash movement. The command does not create a payment or ledger posting.

### Exact changed files

- `src/lib/intelligence/cashflow-schedule-client.ts`
- `src/components/intelligence/DecisionOutcomeLifecycleControls.tsx`
- `src/components/intelligence/DecisionMemoryBook.tsx`

### Acceptance boundary

- Source status: `IMPLEMENTED_ON_MAIN / ACCEPTANCE_PENDING`.
- Existing migration `20261031020000_decision_outcome_persistence.sql` already defines this constrained MEASURE contract; no new migration or schema mutation was added.
- No tests, build, lint, typecheck, CI, browser, database migration, Bolt, Preview, Vercel or production action was run for this body-only batch. No PASS or runtime proof is claimed.
- Approved non-production acceptance must prove: eligible exact-period/currency baseline loads the source proof; missing/wrong baseline and partial/unverified source do not offer measurement; exact server invoice/payment set and amount transition once; wrong amount/evidence/date/currency is rejected; same-key replay is duplicate without a second event; wrong tenant/role is denied; reload shows the source measurement and decision-memory comparison. Keep full cash-receipts and other metric measurements withheld.

**Next P3 action:** resume from live `main`; continue only independent source-backed intelligence gaps. Growth-radar quote conversion and unavailable-product demand remain withheld until same-tenant evidence DTOs exist; Business Health unsupported components remain withheld until the required P2 payloads are complete.


## P3 incremental product-body checkpoint — Arabic Growth Radar assistant read path — 2026-11-06

**Repository:** `Report-Engainall/Nasr1` · **branch:** `main`  
**Code commit:** `33212afd4b332177a64f18f0cdd2e21ce6a677e7`  
**Parent:** `affd73ff1c890ac48ce65c21e0723ff21bce48d3`

### Delivered on main

- Added the allow-listed Arabic intent `GROWTH_RADAR_OVERVIEW` to the existing natural-language assistant.
- The read path reuses the existing tenant-scoped `get_customer_retention_aggregate` client and the exact same deterministic `buildGrowthOpportunityRadar` output. No new RPC, SQL, model call, source table read or parallel radar was introduced.
- The current customer-retention client constructs only two signal kinds from its verified order evidence: `REPEAT_PURCHASE` and `CUSTOMER_ACTIVITY_DECLINE`. The assistant shows the existing `GrowthOpportunityRadar` component, including source values, periods, sample sizes, reason codes and withheld-signal reasons.
- The response exposes whether the customer population is complete (`retention.data.status === VERIFIED` with a non-null verified population total). When incomplete, it labels the view as partial and says explicitly that it covers only the individually evidenced rows returned, not all company opportunities.
- Current-source limits are stated in the UI: quote-to-order conversion and unavailable-product search demand are not supplied by this customer-orders contract; absence is not interpreted as zero demand. The view makes no profit/purchase promise and performs no business write.
- Corrected the component title from “profitable growth opportunities” to “documented growth opportunities” so it matches the deterministic engine's no-profit-forecast boundary.

### Exact changed files

- `src/lib/intelligence/natural-language-assistant.ts`
- `src/lib/intelligence/natural-language-assistant-client.ts`
- `src/components/intelligence/NaturalLanguageAssistant.tsx`
- `src/components/intelligence/GrowthOpportunityRadar.tsx`

### State and limits

- Source status: `IMPLEMENTED_ON_MAIN / ACCEPTANCE_PENDING`.
- No P1 workspace mount, business route, RPC or migration was modified.
- No tests, build, lint, typecheck, CI, browser, database, Bolt, Preview, Vercel or production operation was run in this product-body batch. No PASS or runtime proof is claimed.
- Growth source gaps remain open: the current DTO does not contain quote-to-order linkage, nor a verified unavailable-product-search aggregate; product performance-change signals also require paired full-period metrics and evidence not currently emitted by the retention source.

**Next P3 action:** continue from live `main`; do not synthesize the missing growth signals. Keep these source gaps explicitly withheld until their authenticated, complete metric/evidence DTOs exist.


## P3 incremental product-body checkpoint — Arabic role-scoped task scorecard assistant — 2026-11-06

**Repository:** `Report-Engainall/Nasr1` · **branch:** `main`  
**Code commit:** `0578c3bb84e05654412ceb03f98539e7e6e2aefa`  
**Parent:** `6fefc7daa42bb78eddf292a97f7f1db08ffd7525`

### Delivered on main

- Added explicit Arabic read intent `TASK_PERFORMANCE_OVERVIEW` for current task scorecard questions and rejects historical/free date windows.
- Reuses the existing `fetchTaskPerformanceScorecard()` client and `fetch_task_performance_scorecard` RPC. The server still resolves tenant and task-role scope from the authenticated actor; the browser sends no tenant or role override.
- Reuses the existing `TaskPerformanceScorecard` component, with `ready` state only after the validated client returns `ok: true`; denied/unavailable/error responses are preserved by the assistant.
- Displays current visible task count, authorized role count, task-type/role group count, as-of time and the full existing card. The result contains aggregate role/task-type groups only, not employee names, task titles, assignee IDs or per-employee rankings.
- Explicitly preserves unavailable indicators: full reopen rate when audit coverage is partial, employee comparison, duplicate replay rate, waiting-on-other-party, improvement outcomes and print success are not replaced by zero or inferred from elapsed durations.
- Employee comparison phrases are rejected by the earlier intent guard before the new task-performance intent is considered.

### Exact changed files

- `src/lib/intelligence/natural-language-assistant.ts`
- `src/lib/intelligence/natural-language-assistant-client.ts`
- `src/components/intelligence/NaturalLanguageAssistant.tsx`

### State and limits

- Source status: `IMPLEMENTED_ON_MAIN / ACCEPTANCE_PENDING`.
- Existing P1 workspace mount and existing scorecard component/export are unchanged; no new page, route, RPC or migration was created.
- No tests, build, lint, typecheck, CI, browser, database, Bolt, Preview, Vercel or production operation was run in this body-only batch. No PASS or runtime proof is claimed.
- Approved non-production acceptance must prove: same-tenant task-role scope; hidden roles excluded; denied user remains denied; EMPTY differs from no access; all aggregate task-role counts reconcile; audit reopen rate remains withheld when baseline incomplete; employee comparison query remains unsupported; no task IDs, task names, assignee identity or private task payloads leak into the assistant response.

**Next P3 action:** resume from live `main`; only pursue source-backed role-task attention queries if the current source exposes the authenticated visible task list without expanding role visibility. Do not create a second task query or bypass TaskCenter guards.


## P3 incremental product-body checkpoint — manager task action shortlist — 2026-11-06

**Repository:** `Report-Engainall/Nasr1` · **branch:** `main`  
**Code commit:** `e9aa25e237377e446fcf1a62bfd09f288e87ad69`  
**Parent observed for code:** `3f7c1a85e5ee8c92a62c278d7f8fda11b4a51569`

### Delivered on main

- Expanded the existing Arabic manager task-risk query synonyms to include “أهم خطوات الإدارة” and “أولويات الإدارة اليوم”; it continues to call the existing server-authorized `fetch_task_intelligence_report(MANAGER)` path. No raw `ai_tasks` browser query or new RPC was introduced.
- The assistant now presents the first five items in the server-ranked manager risk result as a shortlist, retaining the server order (priority, due date and age). Each item gets a deterministic explanation based only on source priority, `isOverdue`, `overdueMinutes`, `dueAt` and report `asOf`.
- It supplies a next step based on persisted task status and whether an assignee exists: review/claim or confirm assignment for pending tasks; review progress and record outcome for in-progress tasks. It does not assign or mutate tasks.
- Partial manager-risk coverage is disclosed separately from the full population of visible roles; the UI states that the five displayed are from the returned result and does not imply that omitted tasks are lower priority.
- Removed raw `assignedProfileId` and `sourceEntityId` UUID display from the manager shortlist. The UI shows only whether an assignee exists and, where present, the source entity type.
- The existing TaskCenter role-attention engine remains unchanged. The raw TaskCenter `fetchOperationalTasks()` API is not reused by the assistant because it selects tenant rows and relies on a client-side role filter in TaskCenter; the manager shortlist therefore stays on the existing manager-only server report contract.

### Exact changed files

- `src/lib/intelligence/natural-language-assistant.ts`
- `src/components/intelligence/NaturalLanguageAssistant.tsx`

### State and limits

- Source status: `IMPLEMENTED_ON_MAIN / ACCEPTANCE_PENDING`.
- The query is management-only as enforced by the existing RPC. Regular users do not receive manager-risk rows through this path.
- No tests, build, lint, typecheck, CI, browser, database, Bolt, Preview, Vercel or production operation was run for this body-only batch. No PASS or runtime proof is claimed.
- The shortlist is limited to up to five high/critical items returned by the authorized manager report (the source currently has a bounded result); it is not an exhaustive task list and has no automatic navigation/action callback. Use the existing TaskCenter to open and act on the original task.

**Next P3 action:** preserve the server-only manager boundary; do not broaden to ordinary roles until an authenticated role-scoped task-list RPC exists. Continue with source-backed analytics only.


## P3 incremental product-body checkpoint — Arabic commerce policy catalog read — 2026-11-06

**Repository:** `Report-Engainall/Nasr1` · **branch:** `main`  
**Code commit:** `c94d2360b8e5db31fee3efdd43d813b515edc642`  
**Parent:** `4301ea3dc2aea666b0b205ed02489ab3eac5fa5b`

### Delivered on main

- Added explicit Arabic intents `COMMERCE_POLICY_OVERVIEW` and `COMMERCE_POLICY_SOURCE_CHANGES` to the existing natural-language assistant.
- The read path calls the existing `fetchCommercePolicyCatalog()` client, which uses the existing `fetch_commerce_policy_catalog` RPC. No SQL, new RPC, alternate catalog query or provider call was added.
- Before aggregation, it validates `totalCount`, `returnedCount`, item count, nonnegative integer bounds, `completePopulation` consistency and `asOf`. Invalid counts withhold the result.
- The response exposes only counts by lifecycle (scheduled/effective/expired/superseded), the count of `sourceChanged` policies in the returned page, timestamp and returned/total coverage. It does not expose source IDs, owner IDs, business rules, rationale, source payload or test examples.
- On incomplete catalog coverage, state remains `PARTIAL`; the count of changed source fingerprints is explicitly labelled as applying to returned policies only.
- The existing RPC permission boundary is preserved. The assistant performs no registration, activation, simulation, rollback or other write operation.

### Exact changed files

- `src/lib/intelligence/natural-language-assistant.ts`
- `src/lib/intelligence/natural-language-assistant-client.ts`
- `src/components/intelligence/NaturalLanguageAssistant.tsx`

### State and limits

- Source status: `IMPLEMENTED_ON_MAIN / ACCEPTANCE_PENDING`.
- Section 55 activation, bulk activation, alert thresholds and rollback remain outside this read-only capability and remain constrained to their existing approved workflows.
- No tests, build, lint, typecheck, CI, browser, database, Bolt, Preview, Vercel or production operation was run for this body-only batch. No PASS or runtime proof is claimed.
- Approved non-production acceptance must prove manager authorization and denial for other roles, full/partial count reconciliation, lifecycle counts reconcile to returned items, changed-source count is page-scoped under partial coverage, raw owner/source/rule details are not displayed, and no policy write side effect occurs.

**Next P3 action:** resume from live `main`; keep Section 53 shift workspace on its explicit business-date input rather than deriving a timezone-sensitive date in the assistant. Continue only where the caller can provide or the server can resolve the business date safely.


## P3 incremental assistant reliability note — source-neutral read errors — 2026-11-06

**Code commit:** `95d8be1c29b96ddd65a6f67ab76dcf24bd38655a`

- Corrected the natural-language assistant's generic thrown-RPC failure mapping: authorization denial no longer incorrectly cites purchasing/finance roles for unrelated task, decision, service, growth or policy reads.
- Missing/unavailable RPC errors now explicitly say the approved read source is unavailable and that no local/fallback data was substituted.
- Source-specific clients continue to preserve their own denial/unavailable messages when they return typed failures.
- Status: `IMPLEMENTED_ON_MAIN`; no tests/build/lint/typecheck/CI/runtime action was performed.



## P3 incremental product-body checkpoint — Arabic Business Health assistant — 2026-11-06

**Repository:** `Report-Engainall/Nasr1` · **branch:** `main`  
**Code commits:** `3cde36503c7e7b8de406755de81c4cee25c7203d`, `a66abc8475f0b0faf722218a9128051081855210`  
**Parent before code batch:** `6ea507597d0da44c3ddd2a93d4c31d0b4fc439e7`

### Delivered on main

- Added the allow-listed Arabic assistant intent `BUSINESS_HEALTH_OVERVIEW` for خريطة صحة الأعمال، صحة الأعمال، رأس المال المحجوز، and the financial/operational health overview.
- Added `fetchBusinessHealthAssistantSummary()` as a read-only composition over the existing authenticated clients:
  - `get_inventory_intelligence_aggregate` for the complete 92-day stock population.
  - `get_intelligence_aggregate` for the 90-day cashflow schedule and the existing verified receivables measurement.
  - `get_customer_retention_aggregate` for the 90-day customer-retention report.
- All three requests share one client-captured `asOf`; no client tenant, organization, user or role override is sent. The implementation reuses `buildDeadStockReport`, `buildReplenishmentRecommendations`, `buildCashflowForecast`, `buildLiquiditySnapshot`, and `buildBusinessHealthMap`; it does not create a parallel health calculator, SQL query, RPC, or AI-provider call.
- The liquidity composition deliberately leaves bank/cash opening balance and due obligations null when no source supplies them. Consequently net available liquidity and projected cash balances remain withheld; collection balances are not misrepresented as bank receipts.
- Inventory denial stops the composite read. A denial from either cashflow or retention also returns DENIED; unavailable non-inventory sources produce an explicitly PARTIAL map with source-specific messages. There is no zero-fill fallback.
- The existing `BusinessHealthMap` component is reused inside the existing Arabic assistant only for a matching question. `IntelligenceWorkspace.tsx`, `AghbariApp.tsx`, routes, migrations and P1-owned files were not modified.
- Currency positions remain separate; no total capital-at-risk, DSO, DPO, CCC, product-revenue concentration or supplier-revenue concentration is inferred.

### Exact changed files

- `src/lib/intelligence/business-health-assistant-client.ts` (new)
- `src/lib/intelligence/natural-language-assistant.ts`
- `src/lib/intelligence/natural-language-assistant-client.ts`
- `src/components/intelligence/NaturalLanguageAssistant.tsx`

### Acceptance boundary and remaining dependencies

- Source status: `IMPLEMENTED_ON_MAIN / ACCEPTANCE_PENDING`.
- The implementation has not been run against the not-yet-imported Bolt workspace or its connected database. RPC availability, role-denial behavior, exact source snapshot reconciliation and visible component behavior remain for Bolt's non-production E2E acceptance after import and database connection.
- No tests, build, lint, typecheck, CI, browser, migration, Bolt, Preview, Vercel or production operation was run in this product-body batch. No PASS, runtime proof or production readiness is claimed.
- Business Health's existing evidence gaps remain intentionally open: bank opening balances, due obligations, complete cash opening position and the source inputs for DSO/DPO/CCC and product/supplier revenue concentration. The composite assistant does not close these upstream data gaps.
- Growth Radar's quote conversion/product demand evidence gaps and Section 52's non-cash comparable operational baselines remain withheld until exact tenant-scoped source DTOs and formulas exist. Section 56 still needs the P1 workspace mount of its existing comparison panel.

**Next P3 action:** continue only with the next independently executable source-backed gap. Do not synthesize financial or operational history; keep P1-owned mounts and Bolt acceptance as explicit dependencies.

## P3 checkpoint — 2026-11-06 — supplier posted-payable concentration trend

- Source commit: a632ff99e1cd3f2e478cbb81872bb8033e586e80, parent f8f4b10c66b0a86bc0b50a4f5d227af1c42d567b.
- Extended the existing Section 51 map with buildSupplierPayableConcentrationTrend(): top-five concentration of source-linked POSTED supplier receipt payable credits across adjacent equal-length UTC periods, separated by currency.
- The assistant captures one asOf, fetches the immediately preceding equal-length supplier-activity period, and passes both snapshots to the existing map. The UI discloses period and percentage-point movement; it does not imply identical suppliers, complete supplier spend, closing payable or cash settlement.
- Missing currencies, unverified currencies, incompatible source/formula/asOf, non-adjacent/unequal windows and supplier populations of five or fewer are withheld; no zero-fill. Partial coverage remains PARTIAL.
- Files: src/lib/intelligence/supplier-payable-concentration-trend.ts (new), supplier-payable-concentration-trend.test.ts (new), business-health-map.ts, business-health-assistant-client.ts, components/intelligence/BusinessHealthMap.tsx.
- Status: IMPLEMENTED_ON_MAIN / ACCEPTANCE_PENDING. Source tests authored, NOT run. The pre-existing supplier-activity SQL migration is not applied. No build/runtime/Bolt/DB/Preview/Vercel/production acceptance was run.
- Exact blobs: b50bc2b8014adb81d247c8c36aa207660a63fa22, 3a3f133221ba0c34c8e68ebca1fad07e332aed31, a7601662d91125757b881434a8b677b050cac7b9, 30271edd3eb20b5b7f195e1b29735a4758f10b2c, a2686cb1fde5a3779bf981c16647493d36c22366.
- Next: Section 52/56 learning outputs may be extended only from verified measured outcomes and evidence snapshots; no causal claim or automatic policy mutation.

## P3 checkpoint — 2026-11-06 — decision outcome calibration summary

- Code commit: cd64707787b8506a28614c215a856563e7080bf0, parent 135967930c0a521545bf7fd5950f532ef2913410.
- Enhanced buildDecisionPolicyReviewSuggestions() with calibration statistics over already VERIFIED measured decisions grouped by exact rule version and metric context.
- New summary: sample count, mean/median signed difference, mean absolute difference, mean absolute percentage deviation (nonzero expected baseline samples only), zero-baseline count, and counts above/below/equal to expected.
- Each row's arithmetic must reconcile expected and actual within 0.005. Unsafe or inconsistent rows are excluded; zero baselines never receive percentage deviation. Bounded mean/median prevent overflow.
- DecisionMemoryBook displays the descriptive sample summary and states explicitly that above/below expected is not a quality label and does not prove causation.
- Files: decision-memory.ts, DecisionMemoryBook.tsx, decision-memory-search.test.ts.
- Status: IMPLEMENTED_ON_MAIN / ACCEPTANCE_PENDING. Tests authored, NOT run. No build/runtime/Bolt/DB/Preview/Vercel/production acceptance; no business or policy mutation.
- Exact blobs: e16be29136bba9ce7a40ab304ee9dec9f34ed130, e355254b8f3b51be2b54b28f5b00bf495c8d7c3a, da72d66f89ea5dd46b0fa6b6e55eee5750b267aa.
- Next: Section 56 source trust/comparability work only when exact tenant-scoped population and comparable source periods exist.

## P3 checkpoint — 2026-11-06 — evidence source age and as-of instant comparison

- Code commit: c2e358dce286c49c91157c9d0a4d0ec2d1a06e75 (parent fde3068c0970a759cf75a81820d3482acb0120cd).
- EvidenceSourceComparison now compares parsed timestamp instants, so equivalent ISO timestamps with different UTC offsets remain comparable while genuinely different instants are withheld.
- Source summaries include sourceAgeMilliseconds (sourceTimestamp → metric asOf). Missing, invalid or future timestamps yield null. The Arabic panel shows a duration but does not call it stale without a source-specific SLA.
- No score invented for missing duplicate-key/import completeness/aggregate reconciliation/SLA inputs; no client-only persisted reconciliation disposition.
- Files: evidence-source-comparison.ts, evidence-source-comparison.test.ts, EvidenceSourceComparisonPanel.tsx.
- Status: IMPLEMENTED_ON_MAIN / ACCEPTANCE_PENDING. Tests authored, NOT run. No build/runtime/browser/Bolt/DB/production acceptance.
- Exact blobs: bb666a0438706859704a55aa9d44f439d4cdcd53; 5cffc6dc7cb5616688d558b579a9e3fda449be65; ea49c1959acedf96ff6ded44f03108314687a123.
- Next: Section 56 score only when true source contracts provide completeness, duplicate keys, aggregate consistency and freshness SLA; persisted reconciliation decisions require P2 authorized audit persistence.

## P3 checkpoint — 2026-11-06 — fail-closed process bottleneck evidence

- Code commit: 07685959ba93f96b31daeb0acb625c3b5ff7518d (parent bfe4ad9f2f9c21c73a561072c427e91819cb879c).
- Section 54 parser rejects duplicate stage/window identities, completion events outside declared UTC windows, P90 below median, future queue-open timestamps and queue ages inconsistent with the captured asOf (0.01-minute tolerance).
- Section 54 before/after comparison now publishes withholding reasons for low current/baseline samples and stages missing from either window; it never zero-fills a missing stage. Existing panel renders these reasons.
- Files: process-bottlenecks.ts; process-bottlenecks.test.ts.
- Status: IMPLEMENTED_ON_MAIN / ACCEPTANCE_PENDING. Tests authored, NOT run. No SQL/build/runtime/Bolt/DB/production acceptance.
- Exact blobs: a999aef73f201b5c242eb8fa4761143a3ebeb4a8; e7ac0eca0df3e1713922cff6cd62ecd60ade3870.
- Next: keep wait-vs-work and employee attribution unavailable until authorized source events support them.


## P3 source increment — 2026-11-06 — AI gateway operations panel (partial REF-AI-OPS-001)

- Exact code cursor: `91bee9d04cd5ea80f4d6f99228a798529fd1e769`; docs handoff/checkpoint descendants: `f6cb4537f1a9e9faed23766ecd361e9039fd896d`, `2a1881146fb9d4d348eba2f8361d23bda73ec226`.
- Added `fetchAiGatewayBudget()` and strict DTO parser using the existing `get_ai_gateway_budget()` admin/manager RPC. No organization ID, role or actor is passed by the browser; no base URL/secret is displayed.
- Added exported Arabic `AiGatewayOperationsPanel` showing server-returned enablement, primary/fallback provider/model, daily/monthly cost and token aggregates, active reservation totals and configured ceilings. It is read-only and fail-closed.
- Added an explicit cost governance warning; positive cost ceilings and recorded estimates are not silently called free. The DTO does not certify zero paid spend or free-tier status.
- P1 handoff appended to `docs/execution/contracts/P3_INTELLIGENCE_P1_COMPONENT_CONTRACT.md`; P1 must mount only in the existing admin AI view.
- Source commits: `befd0017595d987723331280b29dadad7d072f0f`, `819a8faf06b431897c9021e0a0336ad605fad269`, `50c60626332ab48c2bc6bfb0e6fb54ade4bbb1e6`, `91bee9d04cd5ea80f4d6f99228a798529fd1e769`.
- Exact new source blobs at code cursor: client `15d8db41e3fbc351821ea8450ab55370f524d165`; component `498a568c7cc3da8c6ad748d668e15039a2bfe4f6`; library barrel `b4926fae4aef7518b824b37396c22236d5b30d7c`; component barrel `b8939d2b3dd76138b635525d178a3e0e174d989e`.
- Status: `PARTIAL_P3_IMPLEMENTED_ON_MAIN / P1_MOUNT_PENDING / P2_PROVIDER_STATUS_SOURCE_OPEN / ACCEPTANCE_PENDING`.
- Remaining: source RPC lacks free-tier/zero-rate evidence, quota remaining/reset, cooldown, privacy class, last response, error counts and provider fallback counts. P2 must publish those safely; no parallel RPC was created. No test/build/typecheck/lint/CI/browser/DB/Bolt/Preview/Vercel/production operation was run. No PASS claim.


## P3 engine hardening — 2026-11-06 — Growth Radar completeness and count consistency

- Code/test cursor: `f677a0abe6c6626907affb6bcdf3cac041392e6f`.
- Fixed `buildGrowthOpportunityRadar()` so an omitted optional `sourceSnapshotVerified` can never be interpreted as complete source coverage. Only an explicit `true` yields a VERIFIED population; omitted/false coverage with signals remains NEEDS_REVIEW, and an empty unconfirmed population is UNAVAILABLE.
- Added machine-readable warnings for incomplete versus unconfirmed population coverage.
- Product-unavailable demand now rejects impossible source ratios where distinct searchers exceed total unavailable search events.
- Regression source tests added/updated for all four confidence scenarios and the impossible searcher-to-event count; tests remain NOT RUN.
- Files: `src/lib/intelligence/growth-opportunities.ts`; `src/lib/intelligence/growth-opportunities.test.ts`.
- Commits: `51cebd4a47c9cfaa23888e3d0b9799f96beab61c`, `13858915589ecbf990adf87a777f444a12bf87c8`, `d5d24e7879c1701c76310b0ec61a896bb7359a0b`, `f677a0abe6c6626907affb6bcdf3cac041392e6f`.
- Blobs: engine `740a9913715181927d9e402fd395f3e5e551cc62`; tests `ab89ce9ec5aeda4331c79af93f79eb5ec4738464`.
- Status: `IMPLEMENTED_ON_MAIN / ACCEPTANCE_PENDING`. No test/build/typecheck/lint/CI/browser/Bolt/DB/production execution was run; no PASS claim.


## P3 cross-workstream reconciliation — 2026-11-06 — six requested body areas

- Source review cursor before this documentation reconciliation: `3b985599bd4940a467f1277861f29855bad65606`. Matrix synchronization commit: `764f2cd2768206eca01855329a6532991a727996`.
- This is a source/status reconciliation only. No feature code, P1-owned route, P2 migration, or database was changed by this reconciliation. No test, build, typecheck, browser, CI, Bolt, Supabase, Preview or production operation was run.

### 1. Customer returned-order amendment — SOURCE IMPLEMENTED / MIGRATION APPLY PENDING
- P1 source includes the reasoned staff return command, customer quantity-only resubmission, admin review/approval/rejection, append-only before/after line snapshots and same-order version history.
- The current actor-history reader returns submitter, reviewer and returning staff names/timestamps plus the original return reason. Pending-before-staff-review amendments are also supported.
- Required migration sequence for non-production acceptance: `20261106230000`, `20261106250000`, `20261106260000`, `20261106270000`, `20261106280000`, `20261106290000`. Apply in timestamp order, preserving the cumulative status guard. The exact active database application state is not proven here.
- Legacy submitted proposals whose staged line values had already been cleared cannot be reconstructed; new snapshots are captured going forward.

### 2. Executive liquidity — P1 MOUNT PRESENT / P2 SOURCE PARTIAL
- `ExecutiveLiquidityCommandCenter` is mounted in the existing IntelligenceWorkspace (P1 commit `d11cbead3b363c6325065b2223dae4203fa44f4b`; mount test source commit `137d81ef7249738a1f29b3df73316860ebfefeeb`).
- The P2 migration `20261106233000_executive_liquidity_command_center.sql` and strict client return shift cash counts, registered cash/bank account identities, source-linked posted period movements, posted supplier payables, and receivable/partial-payment ageing by currency.
- The current DTO deliberately leaves account balances null and supplier due-date status unavailable. It has no reconciled opening cash/bank balance or complete future supplier/expense outflow schedule. Therefore net available liquidity and projected closing cash remain withheld. Do not reinterpret shift cash counts or period movements as an account balance.
- Existing 7/30/90 forecast is scheduled receivable collections only, not complete inflow/outflow cashflow. Dead-stock capital remains withheld without verified acquisition-cost/currency basis and suitable snapshots. Migration application/runtime acceptance remains pending.

### 3. Replenishment — UI AND DRAFT WORKFLOW PRESENT / SOURCE APPLY PENDING
- Existing IntelligenceWorkspace mounts ReplenishmentCard. The card displays ATP, reorder point, confirmed open-PO remainder, coverage after incoming, demand/lead-time, target and recommended quantity/UOM.
- Manager/admin may select only VERIFIED positive recommendations; the existing ReplenishmentPurchaseDraft requires active supplier/warehouse selection and creates an idempotent purchase-order draft. It does not auto-submit, notify suppliers, move stock or post GL.
- `20261105230000_intelligence_replenishment_open_purchase_orders.sql` is present on main but application/runtime acceptance is pending. Keep unit-mismatched or partial source evidence withheld.

### 4. Daily decisions — BOARD/LIFECYCLE PRESENT / PRIORITY-IMPACT PERSISTENCE GAP
- DailyDecisionBoard is rendered through the existing Arabic assistant in IntelligenceWorkspace and shows reason, risk text, evidence, owner, review date, lifecycle, and verified expected-versus-measured comparison; existing controls reuse the audited review/approve/reject/defer/resubmit/assign/execute/measure RPC workflow.
- Persisted DecisionMemory/DecisionOutcome does not currently retain the originating P0–P3 priority/priority score or a general verified impact snapshot. Current ordering is supported follow-up order (overdue date, lifecycle state, verified deviation), not the requested complete priority-impact ranking.
- P2 must extend the immutable same-tenant proposal/outcome snapshot and RPC read DTO with the verified candidate priority/impact/risk/expiry lineage. P1 then renders that server snapshot and completes the mobile/keyboard focus acceptance. No rank or impact is inferred in the client.

### 5. Account privacy and personalization — PROFILE MOUNT/PREFERENCE SAVE PRESENT / SENDER ENFORCEMENT OPEN
- `AccountPersonalizationSettings` is mounted in authenticated `/profile`; preferences load/save through account-scoped RPCs with optimistic concurrency. Severity/detail, timezone-aware quiet hours, reduced motion (root effect), personalization and external-processing gate are present. Consent status is read-only/masked and external channels stay disabled.
- P2 still owns the transactional sender/outbox enforcement and verified destination/explicit consent capture. Preference values alone do not prove that messages are suppressed or delivered correctly. Preference migration `20261107000000` remains source-only until database acceptance.

### 6. Task quality review — PER-TASK FORM/CENTRE MOUNTED / MIGRATION APPLY PENDING
- `TaskCenter` mounts `TaskQualityReviewCenter` for manager/admin and `TaskQualityReviewForm` on eligible per-task cards, using task ID and updated-at concurrency evidence.
- The source RPC stores append-only same-tenant events with role authorization, optional same-tenant decision link, idempotency/replay protection, optimistic task version and audit. The centre refreshes metrics after saved reviews and distinguishes restricted/unavailable/empty states.
- Apply prerequisites `20261106060000`, `20261106070000`, `20261106080000`, `20261106081000`, then `20261106090000_operational_task_quality_reviews.sql` in approved non-production and perform the full negative-role/replay/stale-version acceptance before marking operational.

### Ownership/next actions
- P1: preserve existing mounts and finish responsive/keyboard interaction acceptance for the decision/finance surfaces; do not rebuild the returned-order, replenishment, privacy or task-quality UI.
- P2: apply the above migrations in approved non-production, supply the missing liquidity opening-balance/future-outflow sources, extend immutable decision priority/impact persistence, and connect preference/consent policy to the transactional notification sender.
- P3: retain fail-closed currency/evidence semantics and deterministic engines; do not infer missing values or mark any workstream accepted from source presence alone.
- The central acceptance matrix rows for these nine affected IDs were updated in place. Status remains source-implemented/partial with runtime acceptance pending; no PASS/production claim.


## P3 PRODUCT BODY DELIVERY — TASK QUALITY INSIGHT PACK — 2026-11-06

- Repository/branch: `Report-Engainall/Nasr1` / `main`.
- Starting main SHA: `d77b4fb3bf794b535754c5c38cab16a58cc47459`.
- Code commit: `9bfb207f2e9c4cd8074866d2f320d7ce3305080e`.
- Regression test correction: `277e01f20a21b5634a36fad0bc26cdc2c4cd8405`.
- Documentation base: `1d73d601f9ec813ca1d82fb128e5ff8e69816b1d`; concurrent work was incorporated as parent, not overwritten.

### Delivered
- Added deterministic `buildTaskQualityInsights()` over the existing validated manager-scoped `TaskQualityMetrics` DTO. No new RPC, table, migration, external provider or tenant selector.
- Integrated six Arabic operational readings inside the existing `TaskQualityReviewMetrics` panel already mounted by `TaskQualityReviewCenter` in `TaskCenter`:
  1. Review coverage over visible tasks, including unreviewed count.
  2. Actionability among decisive ACTIONABLE/NOT_ACTIONABLE judgments; DEFERRED stays outside the denominator.
  3. Approval share among APPROVED/REJECTED only; deferred decisions stay outside the denominator.
  4. False-alarm rate among TRUE_POSITIVE/FALSE_POSITIVE; NEEDS_REVIEW remains outside the denominator.
  5. Deferred disposition share, reported separately rather than treating deferred as rejected.
  6. Most repeated reason across distinct task IDs, using existing repeated-cause evidence.
- Zero denominators are withheld, not rendered as 0%. Samples below five decisive judgments are explicitly marked LOW_SAMPLE. Empty, restricted and unavailable states remain explicit.
- Each insight carries evidence counts, interpretation boundaries and a safe next review action.
- No composite task-quality score, employee performance rating, causal inference, unsupported historical trend, synthetic baseline, task mutation or automatic policy change.
- Existing metrics DTO remains the only data authority; raw review event rows are not read by the browser.

### Exact files and blobs
- `src/lib/intelligence/task-quality-insights.ts` — `ecfbad3e16608f1b3e94c331dfb9850518f46b4d`
- `src/lib/intelligence/task-quality-insights.test.ts` — `1e58e6c9fb053a3f459eb5415db1738cbf50da2e`
- `src/components/intelligence/TaskQualityInsightsPanel.tsx` — `2da48b56c21bef8334eac0585f5cd8cc083ce66d`
- `src/components/intelligence/TaskQualityReviewMetrics.tsx` — `aea17e5f14f32ae2e986569b651f997d724e1e56`
- `src/lib/intelligence/index.ts` and `src/components/intelligence/index.ts` export the engine and panel.

### Acceptance boundary
- Status: `IMPLEMENTED_ON_MAIN / ACCEPTANCE_PENDING`.
- Regression tests are authored/updated but NOT RUN per current instruction. No build, typecheck, lint, CI, browser, database, Bolt, Preview, Vercel or production operation was run.
- The threshold of five is an evidence-quality label only, not a business-risk threshold. The pack does not assert trend stability or decision quality from small cohorts.
- Existing task-quality prerequisite migrations and RPC still require approved non-production application and server authorization/replay/stale-version acceptance.
- No PASS, runtime, browser or production proof is claimed.

### Next P3 action
Continue with a separate existing-source intelligent capability; do not expand this pack into a composite score or cause attribution unless source contracts add independently verified outcome and timing dimensions.


## P3 ENGINE HARDENING — COMMERCE POLICY CATALOGUE AND PROMOTION OVERLAP — 2026-11-06

- Exact parent main SHA: `c8e129025d92c362ee29302b9ce4e7f28972a336`.
- Code commit: `843fd8e952f385686fcefc45b28be69cc7ab2134`.
- Section 55 existing `CommercePolicyGovernancePanel` already consumes `buildPromotionPolicyOverlapReview()`; this increment hardens its source boundary rather than creating another panel or policy engine.

### Delivered
- Extracted `parseCommercePolicyCatalog()` as the strict testable boundary used by `fetchCommercePolicyCatalog()`.
- Catalog response is rejected unless:
  - as-of is a parseable timestamp;
  - total/returned counts are non-negative safe integers and returned does not exceed total;
  - returned count equals the actual array length;
  - `completePopulation` exactly agrees with returned count versus total count;
  - all policy entries parse and policy IDs are unique.
- This protects the overlap analyzer from treating a truncated, inconsistent or duplicated policy registry response as a complete population.
- Added engine regression cases for matching explicit product scopes and intersecting effective windows; different products; disjoint windows; changed source fingerprint; unavailable activation status; missing source date; malformed IDs; product/category cross-scope non-comparability; incomplete catalog; no self-pairing; invalid as-of; and candidate display cap preserving the full pair count.
- Added client parser regression cases for complete/partial populations, inconsistent count/flag metadata, duplicate IDs and invalid as-of.
- Existing overlap engine remains deliberately conservative: candidate means "potential overlap requiring review", never proof of forbidden discount stacking. No commercial rules, discounts, inventory, GL or policy precedence are modified.

### Exact files/blobs
- `src/lib/intelligence/commerce-policy-governance-client.ts` — `7d9c9b808fe14ac7c264568d450236f8f1b7c83a`
- `src/lib/intelligence/commerce-policy-governance-client.test.ts` — `34fcc2f4f6cc697d262544dd7a036a64c005cb40`
- `src/lib/intelligence/commerce-policy-overlap-review.test.ts` — `1447689e542bf5b8655eba7cb903274c1a328feb`

### Acceptance boundary
- Status: `IMPLEMENTED_ON_MAIN / ACCEPTANCE_PENDING`.
- The new tests are source-only and NOT RUN. No build, typecheck, lint, CI, browser, DB, Supabase migration, Bolt, Preview, Vercel or production operation was run.
- The catalogue migration `20261106030000_intelligence_commerce_policy_governance.sql` remains subject to the existing non-production migration and authorization acceptance process.
- No test PASS or runtime/production claim is made.

### Next P3 action
Continue only from source-backed intelligence gaps in Sections 45–64; do not add a second policy engine or infer discount-stacking semantics.


## P3 ENGINE HARDENING — TYPED POLICY SIMULATION AND HISTORY EVIDENCE — 2026-11-06

- Exact parent main SHA: `10f674255e15ab5b0e7cb4d8433405ad566f7366`.
- Code commit: `e2bb8d269b4e379b7f1bf6d6e45c05966277ca8c`.
- This increment extends the existing Section 55 simulation client; it does not create another simulator or change SQL/business policy semantics.

### Delivered
- Added pure strict parser `parseCommercePolicySimulation()` and routed `simulateCommercePolicy()` through it.
- The parser now requires:
  - run UUID and exact requested allow-listed simulation type;
  - valid as-of instant;
  - 32-character lowercase hexadecimal input and source fingerprints;
  - object outcome carrying the same simulation type;
  - explicit `noWrite:true` on both outer result and nested outcome.
- Added strict `parseCommercePolicySimulationHistory()` and routed the history RPC reader through it.
- History validates source as-of, returned count versus actual items and requested cap, each item UUID/type, source reference UUID array (unique and bounded), fingerprints, nested no-write outcome, valid creation instant not later than the response as-of, and unique history IDs.
- Tightened `CommercePolicySimulationHistoryItem.sourceRefs` to `string[]` after validating UUID references.
- Invalid or contradictory simulation evidence is withheld as an error; it is not displayed as a successful preview. NoWrite is a contract boundary, not proof of live runtime acceptance.

### Exact files/blobs
- `src/lib/intelligence/commerce-policy-governance-client.ts` — `07b540fdaeb0a4cab6f116a465176d7931de8960`
- `src/lib/intelligence/commerce-policy-simulation-evidence.test.ts` — `c825e0d7a8f77fbe6a2cec43193b0b7c93b2bfe7`

### Acceptance boundary
- Status: `IMPLEMENTED_ON_MAIN / ACCEPTANCE_PENDING`.
- Regression tests are authored but NOT RUN. No build, typecheck, lint, CI, browser, Supabase migration, database, Bolt, Preview, Vercel or production operation was run.
- Existing manager/pricing authorization and finance-only restriction for customer credit simulation history remain server enforced by the existing RPC. This client validation does not replace the server check.
- The simulation migration `20261106030000_intelligence_commerce_policy_governance.sql` remains subject to approved non-production application and authorization/no-write acceptance.
- No PASS or runtime/production proof is claimed.

### Next P3 action
Continue with another source-backed Section 45–64 gap; keep the simulator read-only and do not turn simulation outcomes into live policy writes.


## P3 ENGINE FIX — PROCESS BOTTLENECK COMPARISON CAVEAT LIFECYCLE — 2026-11-06

- Parent/current main code line: `6424bb824220642598b911e73d29f9f7ad4b0a1e` plus subsequent concurrent P1 acceptance commits; exact final P3 code/test SHA: `52898135ec0aabdc8d34fdbb5a1dde6c8438d9f6`.
- Source fix commit: `c5cea02ce9dc2b7f7258de874659c38cd221f247`.
- Regression coverage commit: `52898135ec0aabdc8d34fdbb5a1dde6c8438d9f6`.

### Delivered
- Fixed a use-before-initialization defect in `buildProcessBottlenecks()`: the comparison loop appended to `withheld` before the variable existed, while the declaration was below the loop. The function now initializes the caveat accumulator before any comparisons, seeded with unavailable-source messages.
- The change preserves and returns source-unavailable caveats, small-current-sample caveats, small-baseline-sample caveats, and missing-stage caveats in the same result.
- Added an explicit regression case covering a current-period sample below three and a baseline-period sample below three; both comparisons must be withheld, not converted to zero or emitted as a numeric comparison.
- The existing period equality, non-overlap, stage identity, quantile order, queue-age and complete-source checks remain unchanged.
- No new RPC, table, migration, route or UI was added; existing bottleneck panel and its authorized snapshot source remain the single path.

### Exact files/blobs
- `src/lib/intelligence/process-bottlenecks.ts` — `bef9bb9954f47ffb47e5b5b087c27db4a2b1d2da`
- `src/lib/intelligence/process-bottlenecks.test.ts` — `a1eb251756a1ba28f2e13889a2859e1bf5076fd7`

### Acceptance boundary
- Status: `IMPLEMENTED_ON_MAIN / ACCEPTANCE_PENDING`.
- Test source added but NOT RUN. No build, typecheck, lint, CI, browser, DB, Supabase, Bolt, Preview, Vercel or production operation was run.
- No runtime PASS is claimed; the exact-head regression remains for the later Bolt/CI acceptance pass.


## P3 ENGINE HARDENING — TASK INTELLIGENCE REPORT SOURCE RECONCILIATION — 2026-11-06

- Final code/test main SHA: `e4f8912995480d3cd933beae22a2427bf7eb7f38`.
- Parser change commit: `5d45c3f742d6c17838cbad9cfeda80ecbcf772d2`.
- Regression source creation: `dbd4e3ba7c693540f4ff8551454c5ff54c0d82f7`.
- Regression fixture typing correction: `e4f8912995480d3cd933beae22a2427bf7eb7f38`.

### Delivered
- Aligned the client parser with the existing Section 58 SQL contract in `20261106050000_intelligence_task_reports.sql`.
- Manager risk population now must reconcile exactly: returned rows = returned count = min(total count, 25); completePopulation must equal total <=25. Non-manager scope must return null totals/counts, false completeness and no manager risk rows.
- Removed the incorrect client assumption that a non-MANAGER report cannot contain manager risk rows. A manager-authorized DAILY/WEEKLY/MONTHLY report may contain the same server-authorized high/critical risk summary; the MANAGER report still requires manager authorization.
- Manager risk rows now validate task/profile/source UUIDs, non-future creation time, ageMinutes recomputation from asOf, isOverdue and overdueMinutes recomputation from dueAt/asOf. Contradictory rows are rejected.
- Role summaries validate open-risk subsets, reopened event/task ordering, resolved/completed parity and nullability of reopen/average metrics when there are no resolved tasks. Source and weekly summaries validate reopened event count >= distinct reopened task count.
- Duplicate visible roles, duplicate source-group identities, duplicate weekly points and non-Monday/out-of-window week starts are rejected.
- Added parser regressions for normal and manager-authorized daily reports, exact 25-row cap behavior, risk population contradictions, forged/future task ages, overdue mismatches, duplicate dimensions and subset-count violations.
- No SQL, migration, route, backend function or data was changed; the source-of-truth remains the existing tenant-scoped report RPC.

### Exact files/blobs
- `src/lib/intelligence/task-intelligence-reports.ts` — `d4cf6fa16ff2f38ed40a4d9a3ef3f3768dd7db23`
- `src/lib/intelligence/task-intelligence-reports.test.ts` — `6a51d26b11c81df69991217dfae9be13226ff1d8`

### Acceptance boundary
- Status: `IMPLEMENTED_ON_MAIN / ACCEPTANCE_PENDING`.
- Regression tests are authored/typed but NOT RUN. No build, typecheck, lint, CI, browser, DB, Supabase migration, Bolt, Preview, Vercel or production operation was run.
- No test PASS or authenticated manager/non-manager runtime proof is claimed.


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



## P3 FINANCIAL HARDENING — SECTION 53 SHIFT CASH CENT PRECISION — 2026-11-06

- Repository/branch: `Report-Engainall/Nasr1` / `main`.
- Starting source head for this increment: `9591f074d6266a3f2fca626d419bcf99ca9346b5`; the cash-cent implementation was extended on top of the intervening documentation-only main head `c647c6c608d2bfdb0e2595c2cb12a345aa22ff3b`.
- Source commits:
  - `2b12c1337f1ae9020dc186896d14611cb32ccc23` — safe two-decimal cent parsing and pre-RPC client validation.
  - `f2ae87962989fee6fcc9a904234220a6746ac083` — safe integer count parsing and helper/client regression source.
  - `990476392b22f97e68397ce969c2d71dddf0a0f7` — exact cash-variance classification; a one-cent difference is no longer silently called matched.
- Hardened the existing Section 53 source in `src/lib/intelligence/shift-operations.ts`:
  - `isSafeShiftCashAmount()` accepts only finite, non-negative amounts represented at two decimal places whose minor-unit count is a safe integer.
  - `calculateShiftCashVariance()` computes the difference in integer cents and withholds unsafe/non-cent values.
  - `classifyShiftCashVariance()` returns MATCHED only for an exact zero-cent difference; +0.01/-0.01 remain VARIANCE, and null/non-finite values are UNKNOWN.
  - Snapshot count fields use `Number.isSafeInteger` rather than accepting every JavaScript integer representation.
- Hardened `src/lib/intelligence/shift-operations-client.ts`: `recordOperationalShiftCashCount()` now rejects unsafe/sub-cent input before calling the existing authenticated RPC. Valid exact-cent input is sent unchanged. Server-derived organization/actor authorization, idempotency and append-only cash count contract remain unchanged.
- Regression source:
  - `src/lib/intelligence/shift-operations-cash-precision.test.ts` — accepted cent values, negative/non-finite/sub-cent/unsafe values, integer-cent arithmetic, and exact-zero/one-cent classification.
  - `src/lib/intelligence/shift-operations-client.test.ts` — pre-RPC rejection and unchanged exact-cent RPC payload.
- Exact final blobs:
  - `src/lib/intelligence/shift-operations.ts` — `fa1a39894e30a023b9ef03c35acdb00c286aec51`.
  - `src/lib/intelligence/shift-operations-client.ts` — `f52e925a488b2d2c0471b1bdae55296450aadd4c`.
  - `src/lib/intelligence/shift-operations-cash-precision.test.ts` — `c4d61543ea2aaa3636fe27dae2ba893074eb7afd`.
  - `src/lib/intelligence/shift-operations-client.test.ts` — `b02b02d3b1b4a7f9915aeea8cfc8112eff443a7c`.
- Acceptance boundary: source implementation and regression tests only. Tests NOT RUN. No build, typecheck, CI, browser, database migration apply, Bolt, Preview, Vercel, production database write or live shift/cash operation was run. No PASS/runtime acceptance is claimed.
- Existing migration `supabase/migrations/20261106010000_intelligence_shift_operations.sql` and the separate incoming-owner lookup migration remain source-only until approved Bolt non-production acceptance. No new SQL migration was added by this increment.
- NEXT_ACTION_ID: `INT-SHIFT-001` — Bolt non-production: apply existing shift migrations; verify role/tenant scope, same-key replay/conflict, immutable source evidence, per-currency opening/closing counts, exact cent comparison including one-cent variance, append-only corrections, and incoming-owner-only handover acceptance.



## P3 PROCUREMENT INTELLIGENCE HARDENING — SUPPLIER QUOTE SOURCE ROUNDING — 2026-11-06

- Repository/branch: `Report-Engainall/Nasr1` / `main`.
- Starting source head for the engine change: `578e77ab4e27d4b4c0d8144eb49fddf992bd39d2`.
- Main commits for this increment:
  - `2144913e8bb22a5db38aed4eabf9335730cef321` — align quote line-total comparison to the SQL numeric rounding contract and add current comparison regressions.
  - `429f6a20a7cb9ea03d783c1c561288f1519b6b6d` — correct the fixed-decimal parser expression.
  - `94a168e8e670b373548953d1829c178962bc298d` — add regression coverage for historical price movement.
- Source contract read from `supabase/migrations/20261105231000_supplier_quote_comparison.sql`: quoted quantity is `numeric(15,3)`, unit cost and line total are `numeric(15,2)`, and the server persists line total from quantity × unit cost cast to `numeric(15,2)`.
- Hardened the existing `buildSupplierQuoteComparisonAssistant()` in `src/lib/intelligence/supplier-quote-comparison-assistant.ts`:
  - Replaced the former `0.011` floating tolerance with exact decimal-scale validation and BigInt integer arithmetic.
  - Mirrors the source rounding: quantity thousandths × unit-cost cents, rounded once to cents using the non-negative SQL numeric half-up rule.
  - Requires the persisted line-total cents to equal the source-calculated cents. A one-cent discrepancy is now `LINE_TOTAL_MISMATCH`; it is withheld from both live comparison and saved price history.
  - Uses the same validator for current supplier offers and historical quote observations, so history cannot retain a price movement from a malformed line total.
- Added regression coverage for a half-cent rounding boundary that should match the SQL source, a one-cent mismatch in current offers, and a one-cent mismatch in historical price observations.
- Exact final blobs:
  - `src/lib/intelligence/supplier-quote-comparison-assistant.ts` — `e541f81d84b07d4b4352167c118218da4bccb30e`.
  - `src/lib/intelligence/supplier-quote-comparison-assistant.test.ts` — `ae4956fa9c3494ee458e101796b72ef2e14f32ed`.
- No SQL migration, supplier quote reader, award workflow, PO, stock, payment, journal or supplier-performance authorization was modified. No quote is awarded and no procurement side effect is introduced.
- Acceptance boundary: source implementation and regression source only. Tests NOT RUN. No build/typecheck/CI/browser/DB/Bolt/Preview/Vercel/production operation or PASS is claimed.
- NEXT_ACTION_ID: `REF-NL-SUPPLIER-QUOTE-COMPARISON-ASSISTANT-001` — exact-SHA Bolt non-production acceptance for SQL rounding parity, same-tenant purchasing authorization, comparison basis, history basis, performance sample gates and zero-write behavior.

