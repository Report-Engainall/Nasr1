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

Renders one section per currency. Available balance, expected collections, overdue receivables, due obligations and net liquidity retain their source currency and nullable value. Stagnant inventory cost is displayed separately and never subtracted from cash. Aging buckets, formula ID/version, period, as-of, evidence IDs and warnings are retained. The component never combines currencies or performs FX.

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
