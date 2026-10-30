# P3 → P1 — Intelligence Component Contract

**Import:** `import { ActionCard, EvidencePassport } from "@/components/intelligence";`  
**Types:** ActionCardProps and EvidencePassportProps from the same barrel.

## ActionCard props
- decision?: DecisionCandidate | null
- state?: loading | empty | error | unavailable | ready
- errorMessage?: string (localized/redacted)
- ctaLabel?: string
- onRetry?: () => void
- onContinue?: (decision) => void
- onOpenEvidence?: (decision) => void

Displays WHAT, WHY, SO WHAT, IMPACT, WHAT NEXT, PROOF, priority, owner, expiry and expected outcome. Money/currency are optional and rendered only when the engine calculates impact from verified sources and a versioned formula. This component never mutates accounting, inventory, payments or orders.

## EvidencePassport props
- passport?: EvidencePassport | null
- state?: loading | empty | error | unavailable | ready
- errorMessage?: string (localized/redacted)
- onRetry?: () => void

Preserves VERIFIED, NEEDS_REVIEW, UNVERIFIED and UNAVAILABLE exactly. Renders metric value/unit/currency, evidence IDs/source, source timestamp, as-of, formula ID/version, completeness and warnings. Null stays “غير متاح”.

P1 owns route mounting and interactions. Build both components from the P2 tenant-safe DTO. Do not use synthetic fixture values, placeholder lineage or client-side permissions in production routes.

 
## P3 intelligence integration addendum — current contracts
Import ActionCard and EvidencePassport from @/components/intelligence. P3 pure modules are exported from @/lib/intelligence. P1 owns routes, navigation, state orchestration and event callbacks. Do not change AghbariApp.tsx from P3.
Mount the P2 tenant-safe DTO only. Display separate currency cards; show no total across currencies. Preserve all evidence states and null values. Scenario outputs must be visibly labeled SIMULATED and must not look like ledger values. Decision lifecycle events call P2 persistence, never local state mutation. Learning compares only verified same-unit/currency/period values. AI UI shows provider availability/fallback reason but no keys, prompts, or raw commercial data. Health cards show per-probe evidence/freshness. RBAC views are explanatory and use the server canonical permission catalog only.
