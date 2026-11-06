# P3 → P1 — Intelligence Component Contract

**Import all reusable intelligence components:** `import { ActionCard, EvidencePassport, LiquiditySummary, CashflowForecastCard, DeadStockCard, ReplenishmentCard } from "@/components/intelligence";`

All components are presentation-only. They consume typed P3 engine outputs or the server response DTO, do not infer tenant/actor/permissions, do not create business facts, and do not write orders/accounting/inventory. Each accepts `state?: "loading" | "empty" | "error" | "unavailable" | "ready"` and `onRetry?: () => void` where applicable. Missing DTO in ready state is rendered UNAVAILABLE, never zero. All source warnings and evidence IDs remain visible.

## ActionCard
- `decision?: DecisionCandidate | null`
- `state?: loading | empty | error | unavailable | ready`
- `errorMessage?: string`, `ctaLabel?: string`
- `onRetry?: () => void`, `onContinue?: (decision) => void`, `onOpenEvidence?: (decision) => void`

Displays WHAT, WHY, SO WHAT, IMPACT, WHAT NEXT, PROOF, priority, owner, expiry and expected outcome. Amount/currency only appear where the engine returns a versioned, verified impact.

## EvidencePassport
- `passport?: EvidencePassport | null`
- `state?: loading | empty | error | unavailable | ready`
- `errorMessage?: string`, `onRetry?: () => void`

Preserves VERIFIED, NEEDS_REVIEW, UNVERIFIED and UNAVAILABLE. Null stays "غير متاح".

## LiquiditySummary
- `snapshot?: LiquiditySnapshot | null`
- `state?: loading | empty | error | unavailable | ready`
- `onRetry?: () => void`

Renders one section per currency. Available balance, expected collections, overdue receivables, due obligations and net liquidity retain their source currency and nullable value. Stagnant inventory cost is displayed separately and never subtracted from cash. Aging buckets, formula ID/version, period, as-of, evidence IDs and warnings are retained. Each input metric now carries its own metricEvidence record (metric ID/key, independent status, source currency/as-of/period, calculatedAt, formula/version, evidence IDs, resolved source kind/name/record/version/timestamp and source warnings); the component exposes this in a per-indicator «مصدر واحتساب المؤشر» disclosure. Missing inputs remain visibly UNAVAILABLE with no synthetic source. The component never combines currencies or performs FX.
- P1 mount remains in the existing IntelligenceWorkspace; do not add a parallel route or duplicate dashboard.
- CashflowForecastCard explicitly states that the current data is scheduled customer-invoice receivables, not actual cashbox/bank receipts or movements. The projected closing balance stays unavailable until a verified cash/bank opening balance and complete same-currency schedules arrive.

## CashflowForecastCard
- `forecast?: CashflowForecast | null`
- `state?: loading | empty | error | unavailable | ready`
- `onRetry?: () => void`

Renders the engine's 7/30/90-day scheduled forecasts separately per currency, including opening balance, known inflows/outflows, projected balance, status, schedule completeness, formula IDs/versions, evidence IDs and warnings. No probability or assumed collection rate is added.

## DeadStockCard
- `report?: DeadStockReport | null`
- `state?: loading | empty | error | unavailable | ready`
- `onRetry?: () => void`

Renders ACTIVE/SLOW_MOVING/STAGNANT/ZERO_MOVEMENT/UNKNOWN classification and its movement/cost evidence. Financial exposure is shown only when non-null and exposureStatus is VERIFIED; per-currency totals remain separate and are withheld when any grouped exposure is unknown.

## ReplenishmentCard
- `recommendations?: ReplenishmentRecommendation[] | null`
- `state?: loading | empty | error | unavailable | ready`
- `onRetry?: () => void`

Renders ATP, reorder point, demand, supplier lead-time demand, target and proposed quantity with status/warnings/evidence. The proposed quantity is displayed with `quantityUnit` only when every quantity source UOM is verified to match the product's canonical unit; missing UOM is NEEDS_REVIEW and mismatch is UNVERIFIED, both withholding the quantity. It is a recommendation-only display; it never creates a purchase order. `automaticPurchase` remains false.

## Integration and safety
P1 owns route mounting, tenant-safe request orchestration and interactions. Consume the P2 server DTO only; do not pass browser-supplied tenantId, actor, role or capabilities. Keep currencies separate. Scenario outputs are SIMULATED and never accounting facts. Decision lifecycle actions must call a P2-published command, not mutate local state. Null is unknown, never zero. AI must never receive raw PII or commercial source records.


## GrowthOpportunityRadar
- Import: `import { GrowthOpportunityRadar } from "@/components/intelligence";`
- Props: `result?: GrowthOpportunityRadarResult | null`, `state?: "loading" | "empty" | "error" | "unavailable" | "ready"`, `onRetry?: () => void`, `onOpenRecord?: (kind, opaqueSubjectRef) => void`.
- Displays confirmed signal, current/baseline value, sample size, source amount only as historical evidence, period, as-of, formula versions and evidence IDs. Withheld signals remain visible by reason code.
- The component never shows customer PII, estimated profit, conversion probability or unsupported revenue. Opening a record is presentation navigation only. It does not create tasks or perform business writes.
- P1 must bind `onOpenRecord` to the existing authorized source routes; missing routes stay unavailable rather than navigating to a fabricated destination.

## BusinessHealthMap
- Import: `import { BusinessHealthMap } from "@/components/intelligence";`
- Props: `result?: BusinessHealthMapResult | null`, `state?: "loading" | "empty" | "error" | "unavailable" | "ready"`, `onRetry?: () => void`.
- Composes existing liquidity, scheduled cashflow, dead-stock, replenishment and customer-retention outputs; does not rebuild source facts.
- Displays currency panels and 7/30/90-day windows separately. Expected collections and due obligations are marked as already included in net liquidity. Stock exposure is non-cash and never deducted from net liquidity. Matching liquidity/dead-stock exposure is represented once using matching value and shared evidence; conflicting sources are withheld.
- Shows replenishment quantities per product/UOM without cross-product summation. CCC/DSO/DPO/product/supplier concentration are NOT_CALCULABLE with explicit missing inputs. Capital-at-risk grand total remains withheld.
- Does not create tasks, purchases, stock, accounting, pricing or communication mutations. P1 may mount the component in the existing intelligence dashboard; no new route is needed.


## ShiftOperationsCenter
- Import: `import { ShiftOperationsCenter } from "@/components/intelligence";`
- Props: `result?: ShiftOperationsCenterResult | null`, `state?: "loading" | "empty" | "error" | "unavailable" | "ready"`, `onRetry?: () => void`, and `onOpenItem?: (sourceKey, sourceRef) => void`.
- P1 mounts it in the existing operations/shift experience; do not create another task, ledger, cashbox or inventory workflow. Use the actual P2 `fetch_operational_shift_workspace` DTO only; no client fixtures or synthetic counts.
- The component shows opening readiness, operational close completeness and financial-close eligibility separately; shows unresolved tasks/orders/invoices/receipts/payments/movements/deliveries/stock variances/reminders; and exposes the previous-shift handover evidence.
- Cash opening and closing counts are separated by currency. A financial `ELIGIBLE` state means only that source evidence is ready for a separately authorized review; the component never closes the day, posts a journal or changes stock/tasks.
- `onOpenItem` must resolve to an already-authorized source route. Keep unavailable/loading/error states and withheld counts/amounts when source coverage is incomplete.
- P2 persistence and read DTO are prerequisites for operational activation; until delivered, show the explicit unavailable state rather than mock data.

## SupplierPerformancePanel
- Import: import { SupplierPerformancePanel } from @/components/intelligence.
- P3 engine/client: fetchSupplierPerformance({ from, to, limit? }) from src/lib/intelligence/supplier-performance-client; pass its result to the panel and reflect loading/error/unavailable in state. Use the existing IntelligenceWorkspace and its date controls; do not create a second AI route/workspace.
- Props: result: SupplierPerformanceResult | null; state?: loading | error | unavailable | ready; onRetry?: () => void; onOpenPurchaseOrder?: (purchaseOrderId: string) => void.
- P1 owns the authorized existing purchase-order destination and supplies onOpenPurchaseOrder; the panel never guesses a route or bypasses route permission. Keep the existing admin/manager gate from the server read contract.
- The view shows order/completion/open counts, lead time from submission to last full receipt, median/P90, promised-date adherence only from an awarded quote, pending line counts, sample evidence and withheld reasons. It never adds line quantities across products/UOMs or exposes supplier prices/payables/payments.
- Mean/median/P90 and on-time percentage must remain hidden for fewer than 3 corresponding observations. No sample means unavailable, not zero. Partial supplier populations remain visibly partial.
- No fake data, new source workflow, order mutation, quote award, task creation or supplier communication is allowed.

## EvidencePassport — Section 56 calculation explanation

- Existing import remains EvidencePassport from @/components/intelligence; P1 already mounts it in IntelligenceWorkspace. Preserve that single mount.
- Each metric now exposes an accessible details/summary disclosure titled «كيف حُسب هذا المؤشر؟». No extra prop or page is required.
- The disclosure shows formula ID/version, calculatedAt/asOf, period, unit/currency, completeness/quality, recorded transformations and included evidence references. Evidence details include source type/name, record ID/version when available, source timestamp/asOf, period, currency, status, completeness, quality and warnings.
- Missing evidence IDs are called out. Do not state that excluded records are zero/none: the current source DTO does not expose excluded-record IDs or an independent filter field. Show this limitation explicitly.
- P3 corrected local DQS scoring/date-validation parity inside src/lib/unified-import.ts. The server remains authoritative for finalized import quality and existing publication thresholds; local preview is not a final persisted snapshot.

## NaturalLanguageAssistant — Section 57 partial P1 component contract

- Import: import { NaturalLanguageAssistant } from @/components/intelligence.
- Mount only inside the existing IntelligenceWorkspace; do not add a second assistant page, duplicate route or separate provider gateway.
- Props: onOpenSupplierInvoice?: (invoiceId: string) => void; onOpenPurchaseOrder?: (purchaseOrderId: string) => void. P1 supplies callbacks only to existing routes after the same finance/procurement authorization check used by those routes. Do not invent route paths.
- Supported intents and source RPCs: supplier invoice price variance (`fetch_purchase_supplier_invoice_workspace`, finance permission); supplier invoice variance pending review; exact price-matched supplier invoices; open purchase orders (`fetch_purchase_orders`, purchase manager/admin permission); submitted orders awaiting receipt; partially received orders.
- UI must preserve `DENIED`, `UNAVAILABLE`, `ERROR`, `CLARIFICATION`, `UNSUPPORTED`, `EMPTY`, `PARTIAL`, `READY` states. Do not downgrade a source-denied state into empty data or mock answers.
- The assistant only reports unit-price variance; it must not label tax differences or missing quantities as a price-match result. It omits money values and PO line quantity sums. It surfaces source caps (100 invoices / 500 orders) and incomplete coverage.
- Do not claim that an order is late based on age or `created_at`; current source has no committed due-date contract. No open text → SQL translation, no writes, no quote approvals, no invoice reviews, no external LLM calls.


## Section 56 — Evidence Source Comparison Panel (2026-11-06)

P3 added the reusable `EvidenceSourceComparisonPanel` and deterministic engine exports. Mount this panel once beside the existing Evidence Passport where two already-authorized source snapshots are available.

- Engine import: `@/lib/intelligence/evidence-source-comparison` — `compareEvidenceMetricSources({ comparisonKey, metricKey, left, right })`.
- UI import: `@/components/intelligence/EvidenceSourceComparisonPanel` — `EvidenceSourceComparisonPanel`.
- Props: `comparison?: EvidenceSourceComparison | null`, `state?: "loading" | "empty" | "error" | "unavailable" | "ready"`, `errorMessage?`, `onRetry?`.
- Do not create a new route/workspace. Use the existing Evidence Passport/intelligence evidence surface and the existing server-authorized source snapshots only. The comparison key must be the actual stable join key already resolved by the authorized caller; do not infer identity from coincidental values.
- Display both source values separately with source name/kind/version, source timestamp, as-of, exact period, unit/currency/UOM and formula ID/version.
- Calculate the difference only for two individually VERIFIED/COMPLETE/ACCEPTABLE values with the same metric key, unit, currency, UOM, period, as-of and formula ID/version. Otherwise preserve the two source sides when independently trusted but mark NOT_COMPARABLE; hide unverified values and mark WITHHELD. Zero baseline may show an absolute difference, but percentage remains undefined.
- Never average the sources, update either source, or persist a match/variance disposition from the component. P2 owns any future persisted reconciliation review/settlement workflow.
- UI states and no-data behavior are required; page/source scope must remain explicit.

Source-only P3 delivery at the recorded code SHA. No test/build/browser/database runtime acceptance is claimed in this handoff.
