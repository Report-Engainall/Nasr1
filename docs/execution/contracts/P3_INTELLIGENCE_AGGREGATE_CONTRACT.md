# P3 → P2 — Tenant-safe Intelligence Aggregate and Governance Contract

TypeScript contract: src/lib/intelligence/aggregate-contract.ts. P3 consumes DTOs; P2 implements tenant enforcement, persistence, aggregation and provider egress controls.

## Request and common response
Browser requests may contain requestId, metricKeys, period, asOf and optional currency only. They must not select tenantId, actor, role, capabilities, tables, formula versions or source SQL. P2 resolves tenant, actor, effective role and canonical capabilities from authenticated server identity and existing DB policy. Return full tenant-scoped aggregates, safe source references, source timestamps, asOf, period, currency, formula ID/version, calculation time, evidence IDs, completeness, quality, warnings, safe SQLSTATE/error codes and sideEffects. Null is unknown, never zero. All outputs must be tenant-safe and free of raw PII.

## Finance and inventory inputs
Liquidity DTO: available cash, expected and overdue collections, receivable ageing buckets, due obligations and optional stagnant-stock cost; each monetary value has a currency. No FX conversion. Dead-stock cost is supplemental exposure, never subtracted from liquid cash.
Cashflow DTO: full scheduled receipts/payments through the 90-day horizon, direction, due date and evidence-backed amount MetricSnapshot. Partial coverage, unknown amounts or invalid dates suppress projections; no assumed collection ratios or sales extrapolation.
Stock DTO: full movement lookback, product reference, nullable lastMovementAt only when complete coverage proves no movement, ATP, reorder point, sold quantity/window, average inventory, lead time, MOQ/order multiple, and unit cost with CURRENCY_PER_UNIT, currency and UOM. Every QUANTITY MetricSnapshot used by replenishment (ATP, reorder point, sold quantity, MOQ and order multiple) must carry source-provided `unitOfMeasure`; it must exactly match the product's canonical `quantityUnit`. A missing or non-string/blank product UOM is NEEDS_REVIEW; missing source UOM is NEEDS_REVIEW; mismatch is UNVERIFIED and suppresses the recommendation. The engine must treat untrusted runtime DTO values defensively and never throw or emit a quantity on missing UOM. Sold quantity must have the exact requested period; missing period is not complete coverage. No automatic purchase order. Dead-stock movement coverage must end exactly on the as-of day, begin no later than the required lookback start, and each evidence record must match the declared coverage period/as-of with a source timestamp not later than as-of; future movement timestamps are invalid. Available quantity, sold/average quantity and CURRENCY_PER_UNIT source cost must each carry the product's exact canonical unitOfMeasure before turnover or exposure is calculated; missing UOM is NEEDS_REVIEW and mismatch is UNVERIFIED. Cost exposure is withheld rather than approximated.
Retention DTO: complete unpaginated customer population with expected/returned counts and truncation flag; customer order metrics are one row per unique non-empty customer reference and sales are separate rows per customer/currency. Every sales row's customer reference must belong to the returned verified customer population; blank/foreign refs, duplicate customer/currency rows, duplicate/missing coverage evidence IDs, stale/future evidence timestamps or count mismatch invalidate coverage. A null lastOrderAt is NO_ORDER_DATE only when both current and previous verified order counts are zero; positive orders with no date are NEEDS_REVIEW/UNKNOWN. If any coverage mismatch, suppress aggregate retention/frequency/concentration KPIs. Never include name, phone or email, and never infer churn causes.

## Decision outcome persistence
P2 implements atomic proposal/review/approve/reject/assign/start/complete/measure events. Each command requires server-derived actor/tenant/capability, idempotency key, optimistic version, allowed transition, required reason and immutable evidence references. A MEASURE command must carry a non-null numeric value, metricKey, unit, optional currency, status=VERIFIED, completeness=COMPLETE, quality=ACCEPTABLE, period, asOf, formulaId, formulaVersion, measuredAt and non-empty unique evidenceIds. P2 must resolve every evidence ID against authenticated same-tenant source records, verify the source status/quality/completeness, metric key, unit/currency, as-of and period scope and the recorded formula/version before accepting the MEASURE transition. Unknown or unverified input remains unmeasured; never substitute zero. Reject future asOf values, reversed periods, missing formula metadata and cross-currency/per-unit mismatches. Store outcome, event, idempotency key and audit event atomically. Same key + same complete payload returns original result; same key + different payload conflicts. Denied calls must leave domain/outcome/idempotency/audit snapshots unchanged; return safe 42501/403 denial with no secret or SQL text.

## Free-only AI, privacy and fallback
Enforce paidSpendLimit=0 in the existing gateway, including a provider/model allowlist, free-tier and zero-rate proof, privacy approval, atomic quota reservation, 429 Retry-After/cooldown and safe provider fallback. Duplicate quota rows for the same provider/model or duplicate quota evidence IDs are ambiguous and must fail closed; do not select whichever duplicate appears first. Unknown rate/quota/privacy blocks remote models. ChatGPT Free is not an API and must not be automated. If all official free quotas are unavailable, use deterministic local RULE_BASED engines or return MODEL_UNAVAILABLE.
Provider requests contain only sanitized question text; do not send raw orders, customer identity/contact, private prices, cost/margin, stock-sensitive records, invoices, payments, reports or credentials. Ops telemetry excludes prompts, keys and PII and includes only model/provider, reason, quota/cooldown state, safe error code, timestamp and elapsed time.

## System health and canonical RBAC
P2 supplies fresh DB/storage/Edge/jobs/backup and configured integration probes with checkedAt, latency, source evidence, safe error and owner. Missing, stale, duplicate or unverified evidence, a sourceTimestamp later than checkedAt, or an invalid probe status is UNKNOWN, not healthy. A source evidence ID must resolve to exactly one VERIFIED/COMPLETE/ACCEPTABLE same-scope record. Return the current canonical role/capability catalog and actor capabilities from existing auth/RPC/RLS. Do not create another role matrix or accept client role claims.
The response must include the server-derived catalog dimensions consumed by `buildCanonicalCapabilityMatrix`: roles[{roleId,label,capabilityIds,sourceVersion}], capabilities[{capabilityId,resource,operation,tenantScope,sensitivity,policyRef,policyVersion}], actorRole, actorCapabilities, asOf, source=`SERVER_CANONICAL_PERMISSION_CATALOG`, status and evidenceIds. `tenantScope` is NONE/SELF/ASSIGNED/TENANT/GLOBAL; `sensitivity` is PUBLIC/TENANT_DATA/PERSONAL_DATA/FINANCIAL/SECRET. P3 only renders a role-to-capability mapping for explanation; P2's existing authenticated DB policy remains the sole effective authorization decision.

## Test and delivery proof
Provide PostgreSQL 17 tests for complete aggregate coverage, partial/missing/stale data, mixed currency/UOM, due dates, empty state, RLS same-tenant role matrix, opaque foreign tenant denial, idempotent replay/conflict, zero side effects on denial, SQLSTATE/redaction, AI quota exhausted/not configured/disabled/429/cooldown, no paid route and no PII/secret egress. P2 records exact code SHA, RPC/service, source tables, request/response sample IDs, role/capability results, no-side-effect evidence, CI URL and exact next command in P2_CHECKPOINT.md. P2 does not push main; P3 integrates.


## Growth opportunity radar — section 50 of the unified merchant intelligence specification

P3 consumes only these evidence-backed signal metrics; P2 must derive them from authenticated same-tenant sources and return server-authoritative metric IDs, formula versions, periods, completeness and evidence IDs:

- QUOTE_UNCONVERTED: count of actual open/unconverted quote records and total quote sample for the same period; never infer a lost sale or forecast conversion.
- PRODUCT_UNAVAILABLE_DEMAND: count of recorded searches for an unavailable product plus distinct searching customer count; missing search telemetry means UNAVAILABLE, not zero.
- CUSTOMER_ACTIVITY_DECLINE: current and previous order counts for the same opaque customer reference, using adjacent equal-length periods; a comparison is valid only with at least three prior orders. Do not expose customer name, phone or email to the engine.
- REPEAT_PURCHASE: verified current-period order count for one opaque customer reference; at least two orders. No next-order date is inferred.
- PRODUCT_PERFORMANCE_CHANGE: current and previous period sales amount or quantity for the same product reference, same currency/UOM and equal-length adjacent periods, with at least five transactions in each period. A zero baseline with positive current activity is NEW_ACTIVITY, not an invented percentage.
- All source metrics must have status VERIFIED, completeness COMPLETE, quality ACCEPTABLE, source timestamps no later than asOf, unique evidence IDs, formula ID/version and exact period. Null, ambiguous or incomplete inputs are withheld.
- Optional source amounts are displayed only as historical source values. They are not expected profit, conversion probability, lost revenue or cash impact. No implicit margin, FX, conversion rate or causal explanation is permitted.
- P3 owns the deterministic policy in `src/lib/intelligence/growth-opportunities.ts`; the versioned policy thresholds are: 3 total quotes, 5 unavailable searches across at least 3 distinct searchers, 3 prior orders and 30% decline, 2 repeat orders, and 5 transactions per product period with a 20% trend threshold.
- The engine creates suggestions only. P1 may mount `GrowthOpportunityRadar` and open the same source record. P2 remains the sole authority for tenant scoping and any persisted follow-up task. No customer communication, price change, purchase, stock adjustment or finance mutation is executed by this engine.

## Business Health Map — canonical merchant-intelligence specification section 51

### Independent source-period preservation

A composed business-health view may receive source periods with different business meanings, such as a forward cashflow horizon and a historical inventory movement lookback. Preserve and display each source's own period and as-of date. Do not reject a valid source merely because it differs from the top-level view period. Do not compare or deduplicate financial exposures across unequal source periods/as-of values. A combined inventory exposure is permitted only when amount, source scope, currency and shared evidence IDs agree; otherwise withhold the combined value rather than adding or choosing silently.



P3 composes existing verified engines; it does not re-query operational tables or recalculate source metrics:
- Liquidity by currency: preserve source status on net liquidity, expected collections, overdue receivables and due obligations. Collections are already included in the liquidity net formula; due obligations are already deducted. Display explanatory components only; never sum them again.
- Stagnant inventory exposure: reconcile `LiquidityPosition.stagnantStockExposure` with `DeadStockReport.totalsByCurrency` for the same currency, exact as-of and period. Matching values require both equal amount and shared evidence IDs; represent them once. Conflicts or unproven overlap are withheld. Stagnant stock is non-cash and never deducted from net liquidity.
- Cashflow: show 7/30/90-day windows separately per currency. These horizons overlap and are not separate capital buckets. Only complete, verified schedule points can show a projected balance.
- Replenishment: show verified positive quantity recommendations by product and original UOM; do not sum quantities across SKUs or convert them to money. No purchase action is performed.
- Customer concentration: show top-five sales concentration only where the full-population customer-retention aggregate is VERIFIED. Product/supplier concentration is NOT_CALCULABLE until complete same-currency source populations exist.
- Cash conversion cycle, DSO and DPO are NOT_CALCULABLE unless aligned average-balance and period-flow denominators are present. Do not infer from overdue receivables or due obligations alone.
- The capital-at-risk grand total remains withheld because inventory, receivables, expected collections, scheduled flows and payable obligations may overlap.
- P3 implementation: `src/lib/intelligence/business-health-map.ts`; reusable presentation component: `src/components/intelligence/BusinessHealthMap.tsx`. The component is presentation-only; P1 owns route mounting, and P2 remains the tenant/data authority.

## Decision Memory Book — canonical merchant-intelligence specification section 52

P3 owns the section 52 deterministic memory engine, capture/read component, tenant-scoped persistence migration and authenticated DTO binding for this two-programmer execution. P1 preserves the existing intelligence workspace/mount; its route/screen work remains outside these P3 paths. Reuse the existing `decision_outcomes` lifecycle. Do not create a parallel approval/execution lifecycle or allow the browser to write memory tables directly.

### Required immutable snapshot contract

Extend the existing `fetch_decision_outcomes(p_limit,p_offset)` response with a nullable `memorySnapshot` for each decision `id`, and retain its current camelCase lifecycle fields. The latest snapshot must include:

- `id`, `decision_id`, `version`, server-assigned `captured_at`, source `as_of`, and exact `period`.
- `problem`; `facts_reviewed`; typed `facts`, `opinions`, and `hypotheses` entries with stable ID, text, actor role, record time and source evidence IDs. A FACT is returned only when every source evidence reference resolves uniquely inside the caller's tenant and is VERIFIED / COMPLETE / ACCEPTABLE; opinions and hypotheses remain explicitly labelled and never become facts.
- `alternatives[]`, `chosen_option_id`, `assumptions_reviewed`, `assumptions[]`, `action_taken`, `review_disposition` (SCHEDULED / NOT_SCHEDULED / NOT_REQUIRED), and `review_at` only when scheduled.
- `expected_metric` and `actual_metric` as full MetricSnapshot objects with metric key, value, unit, currency/UOM, period, as-of, status, completeness, quality, formula ID/version and unique evidence IDs. Do not reduce a measurement to value/currency/as-of.
- `lessons_reviewed`, `lessons[]`, and the append-only `corrections[]` event history with from/to version, actor role, timestamp, original/corrected text, reason and optional source evidence IDs.
- `evidence_records[]` needed to verify every metric and FACT. Each record must be tenant scoped with source, source timestamp, as-of, period, currency, status, completeness and quality.

### Persistence and commands

- Persist immutable decision-memory snapshots versioned by `(organization_id, decision_outcome_id, version)`; each new revision inserts a complete new version and never updates or deletes the prior row. An append-only correction event must reference the prior and new version.
- Add idempotent server commands for initial capture and correction/revision. Commands require expected version, payload-bound idempotency key and a reason for every correction. Derive organization, actor and role from the active authenticated profile; never accept these as trusted client fields.
- Validate the decision belongs to the actor's current organization and an existing decision lifecycle row. Only the existing server-authorized decision management roles may capture/correct memory. Direct INSERT/UPDATE/DELETE from anon/authenticated browser roles is revoked; reads use same-tenant finance/manager authorization.
- Resolve all evidence IDs server-side against the current tenant; reject ambiguous, missing, stale or cross-tenant sources without inserting snapshot, event or audit side effects. Store actor/time and exact payload fingerprint for every idempotent command.
- The actual metric must agree with the existing `decision_outcomes.measured_outcome` lifecycle payload. If formula/version/evidence is absent or contradictory, return it as withheld; never convert the legacy numeric summary into verified evidence.
- Corrections are additive: preserve the original text and all prior snapshots; do not rewrite decision history, silently edit the approved decision, change its rule version or update any rule automatically.

### P3 implementation status — section 52

- Delivered in `supabase/migrations/20261105270000_intelligence_decision_memory.sql`, `src/lib/intelligence/decision-memory-client.ts` and the existing decision-memory engine/UI/client files. The save RPC is `save_decision_memory_snapshot(uuid,integer,jsonb,text,text)`; the UI reports a saved version only after strict parsing of the returned snapshot.
- Current FACT evidence adapters intentionally accept existing `customer_invoices` and `customer_payments` references only. Optional expected baseline accepts only `cashflow.expected_collections` plus currency; the server calculates amount and complete source set for the selected due-date period (up to 90 days) as of the original decision timestamp. No browser monetary value or evidence set is accepted as a metric result.
- `fetch_decision_outcomes` attaches the latest DTO as `memorySnapshot`. The P3 engine consumes it when the workspace's legacy `snapshots` argument is empty; no P1 workspace edit is required. Actual measurement is projected only from the full lifecycle proof after every evidence reference resolves to the same tenant.
- Migration source is committed but not applied by this delivery. Until Bolt/Supabase applies it, runtime memory remains PARTIAL/UNVERIFIED. Do not infer runtime availability from a Git commit.

### P3 interpretation policy

- P3 engine: `src/lib/intelligence/decision-memory.ts`; component: `src/components/intelligence/DecisionMemoryBook.tsx`; it is mounted in the existing `IntelligenceWorkspace`.
- Facts require verified evidence; opinions and hypotheses have distinct labels; assumptions are recorded explicitly and are not facts.
- Expected/actual comparisons are allowed only for the same metric key, unit, currency/UOM, exact period and formula ID/version, with a later actual as-of and complete verified evidence for both. A zero expected value has no percentage variance.
- Same-rule precedents are comparisons within the currently loaded page unless the server explicitly supplies complete history. They must not imply equivalent context or prescribe an automatic rule change.
- P3 does not create reminders, tasks, customer communications or accounting/inventory writes. No snapshot returned by P2 means a visible PARTIAL memory with missing fields, not a fabricated snapshot.
- Delivery ownership for this execution: P3 owns the migration/RPC, read DTO and binding because the active team has only P1 and P3. Section 52 remains ACCEPTANCE_PENDING until the migration is applied in Bolt and connected authorization/version/idempotency/source-evidence cases are accepted on the same SHA.


## Shift Operations Center — canonical merchant-intelligence specification section 53

P3 supplies a deterministic reader/renderer for the start-of-shift, end-of-day and handover packet. P2 remains the only authority for source reads, tenant scope, saved shift records, cash counts, handover acceptance and audit history.

### Required read contract

Add `fetch_operational_shift_workspace(p_business_date, p_shift_id)` as a finance/operations-authorized, same-tenant read RPC returning one immutable snapshot compatible with `ShiftOperationsSnapshot` in `src/lib/intelligence/shift-operations.ts`:

- Snapshot identity, server-generated/as-of times, business date, organization time zone, current shift and owner profile reference, previous shift reference, source coverage, queue items, cash controls, latest handover and the evidence records referenced by each row.
- Source coverage for connectivity/sync, urgent tasks, orders, invoices, physical receipts, supplier/customer payments where applicable, cash, unsent stock movements, deliveries, inventory variances, reminders and handover. Each source includes status, completeness, quality, as-of, period, freshness limit, expected/returned counts, complete-population flag, explicit not-applicable flag, close-critical flag and evidence IDs.
- When `completePopulation=true`, the returned count must cover the complete source population and match the DTO rows. If pagination or row caps apply, report `completePopulation=false`; P3 will withhold count/zero assertions.
- Queue rows must point to canonical existing task/order/invoice/receipt/payment/movement/delivery/inventory/reminder source IDs. No manually typed counter presented as a source-backed record. Items include kind/state/severity, updated time, owner profile reference, due date, optional amount/currency and evidence IDs.
- Currency control rows carry separate opening expected/count values and separate closing expected/count values. Cash is never aggregated across currencies. A missing closing count remains NOT_RECORDED; zero is not substituted.
- Handover references both the previous and current shift, actual outgoing and incoming profile IDs, record/accept times, unresolved source IDs, note and evidence IDs. An absent handover for an existing previous shift is UNKNOWN, not accepted.

### Persistence and mutation boundaries

- Add a tenant-scoped `operational_shifts` source record only if no canonical shift/session record already exists. Do not create a parallel task/order/ledger/movement repository.
- Persist immutable/versioned opening and closeout snapshots plus append-only `operational_shift_handover_events`. A correction appends a new version/event; it never rewrites the source evidence or deletes prior handovers.
- `record_operational_shift_handover` must be payload-bound/idempotent, version-checked and role-authorized. Outgoing and incoming owners are derived from active same-tenant profiles; incoming owner acceptance is a separate recorded action. Handover does not silently reassign tasks or orders.
- `record_shift_cash_count` records actual counted cash by one currency and shift, with counter, time, note and evidence. A variance review must be a different authorized finance actor with a reason. Never infer cash from orders, invoices or payment allocations.
- Financial close eligibility from P3 is advisory/read-only. Actual financial closing requires a separately authorized source-specific workflow that verifies all required source queues, currency counts and variance approvals; it must not auto-post a journal, auto-adjust stock or mutate an order.
- Direct INSERT/UPDATE/DELETE on shift snapshot, handover and cash-control tables is revoked from browser roles. Reads and commands must derive organization and actor from the authenticated active profile, apply same-tenant RLS and audit every mutation. Cross-tenant/missing-source requests fail without partial writes.
- Keep idempotency keys and payload fingerprints, reject replay with a different payload, and preserve append-only event history.

### P3/P1 component contract

- P3 engine: `src/lib/intelligence/shift-operations.ts`; component: `src/components/intelligence/ShiftOperationsCenter.tsx`.
- P1 mounts `ShiftOperationsCenter` into the existing operations/shift area and supplies the real P2 snapshot; it may not build a fake local snapshot. `onOpenItem(sourceKey, sourceRef)` must navigate only to the existing authorized source record.
- Only complete, fresh and evidenced populations can show zero/complete. Unverified/stale/partial data becomes UNKNOWN; source counts and monetary values are withheld. Cash values stay per currency.
- Opening readiness, operational close completeness and financial-close eligibility are separate states. `ELIGIBLE` only means source evidence is ready for a separate authorized review; it does not mean the day or journal has been closed.
- P3 performs no task assignment, cash count, variance approval, journal posting, stock movement, customer contact or closeout mutation.
- State stays `IMPLEMENTED_ON_MAIN / ACCEPTANCE_PENDING` until P2 source persistence/read DTO and P1 authorized route mount are delivered.

## REF-SUPPLIER-PERFORMANCE-INTELLIGENCE-001 — Supplier operations intelligence

- P3 owns the deterministic engine, DTO parser, tenant-scoped read RPC and source migration. RPC: public.fetch_supplier_performance_snapshot(p_from date,p_to date,p_limit integer DEFAULT 100).
- Authenticated active-organization context is derived server-side. The existing purchase_orders_can_manage() policy gate is required (admin/manager); client input cannot select tenant, actor or role. Direct browser table grants are unchanged. Result window is limited to 730 days between dates and page size 1–200 suppliers.
- Only submitted, partially received and received purchase orders in the requested UTC submission-date window are eligible. Drafts and cancellations are excluded. Source lineage is purchase_orders, purchase_order_items, purchase_receipts and the awarded purchase_supplier_quotes delivery term linked to the PO.
- A lead-time sample exists only if PO status is received, every purchase-order line is fully received, a final physical receipt exists and its timestamp is not earlier than PO submission. Lead days are submission to last receipt, not submission to first receipt.
- Promised-date adherence exists only when the PO has an awarded quote with non-null delivery_days; otherwise the observation is withheld. UI hides averages/percentiles and adherence percentages below 3 samples. This is operational delivery analysis, not a supplier quality/defect score or causal ranking.
- Open workload is reported as open order count and pending source-line count. Do not sum quantities across products or UOMs. Financial prices, liabilities, payments and balances are excluded. RPC is read-only and has no mutations or external provider.
- Response is a limited supplier list with explicit total/returned count and complete-population flag; each supplier carries five most recent PO summaries for traceability. Incomplete populations remain explicitly PARTIAL.
- Migration status: source-only; Bolt/Supabase application and exact-SHA runtime acceptance remain pending.

## REF-DATA-RELIABILITY-EVIDENCE-PASSPORT-001 — Section 56 source and metric explanations

- Existing EvidencePassport is already mounted by P1 in IntelligenceWorkspace. This delivery extends that component in place; no second route or dashboard is required.
- For each metric, the Details/How calculated disclosure shows its formula ID/version, calculation time, metric as-of, period, unit/currency, completeness, quality, recorded transformations and included evidence references. Each linked evidence row shows source kind/name/record ID/version, source timestamp, as-of, period/currency, completeness, quality and warnings.
- Missing linked evidence IDs are surfaced. The current DTO does not provide excluded-record IDs; the UI explicitly withholds an exclusion list rather than implying that no records were excluded. Filters are disclosed only where supplied as recorded transformations; the DTO does not carry an independent filter object.
- Local import DQS preview in src/lib/unified-import.ts now matches server validity status (only valid earns validity points) and exact server date rules (calendar-valid ISO/day-first forms, leap-year handling and whitespace-as-missing). Server DQS remains public.calculate_import_job_quality(uuid), with its established five equal quality components and publication labels/thresholds.
- No server migrations, new data access or external model were added in this Section 56 delivery. Source-only; no runtime acceptance is claimed.

## REF-NL-ADMIN-ASSISTANT-057 — Safe deterministic administrative query planner (partial)

- The planner at src/lib/intelligence/natural-language-assistant.ts normalizes Arabic text and maps only fixed intents. Unsupported/ambiguous queries are rejected or clarified. No generated SQL, dynamic identifiers, client-selected tenant, provider call or write action.
- Supplier invoice source: public.fetch_purchase_supplier_invoice_workspace(uuid,integer,integer), finance role gate can_manage_finance(), tenant is server-derived. Supported price-status filters are match_status != matched, variance_pending, and matched. The word «mismatch» is deliberately scoped to unit-price comparison against PO and physical receipt cost; this does not assert tax mismatch or quantity shortage.
- PO source: public.fetch_purchase_orders(), purchase_orders_can_manage() admin/manager gate and server-derived active organization. Supported statuses: submitted + partially_received; submitted only; partially_received only. Draft/received/cancelled source records are parsed and safely excluded from these intents.
- Invoice sample is latest 100; response exposes overall invoice_count and as-of date and is PARTIAL when has_more. PO sample is latest 500; if exactly 500 records are returned the response is conservatively PARTIAL because this RPC does not expose a total count.
- Results deliberately omit monetary amounts and aggregate quantities. PO workload uses item-line counts, never sums of heterogeneous products/UOMs. Read-only callbacks only open existing authorized routes.
- Unsupported: late PO/time-window queries until an authoritative promised due-date/date filter exists in a source RPC. P1 mounts the exported component into the existing IntelligenceWorkspace.
