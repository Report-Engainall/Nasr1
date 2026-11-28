# P3 — Customer retention action queue checkpoint (2026-11-28)

- Repository: `Report-Engainall/Nasr1`.
- Branch: `p3/growth-opportunity-decision-actions-20261128`.
- Base SHA at checkpoint creation: `a310d0c852fe5769eeacb0098520eca38b9bda67`.
- Implementation commit: `e75e4ca6e5739aed603a039b82fff2a071dd06cb` (present in the current branch ancestry).
- Privacy-hardening commit: `958bda6a1d693b24b73da85ce7e2d446570a8113`.
- Follow-up short-reference CSV regression commit: `507c7326d474bc067ba157e3315882e7a48bdaa7`.
- Parallel demand/stock scenario extension: `8729b124bb7e5e9e4fda28e6780c375e86aa8178`.
- Exact changed scope: `CustomerRetentionActionQueuePanel.tsx`, its component tests, `customer-retention.ts`, and its unit tests.

## Delivered

- Customer-retention search normalization translates Arabic-Indic digits (`٠١٢٣٤٥٦٧٨٩`) and Persian digits (`۰۱۲۳۴۵۶۷۸۹`) to ASCII digits before matching.
- Existing Arabic diacritic removal, alef variants, ya/ى, ta marbuta and whitespace normalization remain unchanged.
- Unit regressions prove both `١١٢` and `۱۱۲` match the Western-digit `112` search and resolve the same customer action.
- Arabic/Persian numeral normalization changes search matching only. Privacy hardening changes customer-facing labels and decision display text, while preserving the original `customerRef`, source metrics/evidence, established decision identity key and database values.
- Customer references are no longer rendered as raw or partially masked strings in the retention panel, CSV identity column, or decision display text; the UI and export use ordinal labels while source matching and evidence lineage remain unchanged.
- Regression coverage includes a short phone-like reference in CSV and decision output, plus a long reference in the UI and decision output; none is copied into customer-facing labels or decision display text.
- Residual privacy boundary: the established decision ID still uses an unkeyed deterministic 64-bit customer-reference fingerprint for same-day idempotency. It is pseudonymous, not encryption or an authorization token; source metric/evidence identifiers also remain intact for traceability. Do not claim cryptographic anonymization until a server-managed opaque/keyed identity contract and coordinated idempotency migration are delivered.
- Demand what-if projections cover 7/30/90-day scenarios against matched verified ATP and forecast evidence; incoming purchase quantities are excluded without receipt-date proof, and no purchase/inventory side effect is created.

## Acceptance

- Tests are authored. Exact-head P1 Vitest/strict TypeScript and required P2 browser acceptance remain pending.
- No PASS is claimed from queued or earlier-head workflows.
- No schema/RPC, financial or inventory operation, production database write, live ERP call, secret, deployment or paid service was introduced.
