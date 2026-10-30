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
