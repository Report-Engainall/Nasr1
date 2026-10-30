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
