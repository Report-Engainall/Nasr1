# P3 — Customer retention action queue checkpoint (2026-11-28)

- Repository: `Report-Engainall/Nasr1`.
- Branch: `p3/growth-opportunity-decision-actions-20261128`.
- Base SHA at checkpoint creation: `a310d0c852fe5769eeacb0098520eca38b9bda67`.
- Implementation commit: `e75e4ca6e5739aed603a039b82fff2a071dd06cb` (present in the current branch ancestry).
- Privacy-hardening commit: `958bda6a1d693b24b73da85ce7e2d446570a8113`.
- Exact changed scope: `CustomerRetentionActionQueuePanel.tsx`, its component tests, `customer-retention.ts`, and its unit tests.

## Delivered

- Customer-retention search normalization translates Arabic-Indic digits (`٠١٢٣٤٥٦٧٨٩`) and Persian digits (`۰۱۲۳۴۵۶۷۸۹`) to ASCII digits before matching.
- Existing Arabic diacritic removal, alef variants, ya/ى, ta marbuta and whitespace normalization remain unchanged.
- Unit regressions prove both `١١٢` and `۱۱۲` match the Western-digit `112` search and resolve the same customer action.
- This changes search text only; no customer reference, stored source field, decision payload or database value is rewritten.
- Customer references are no longer rendered as raw or partially masked strings in the retention panel, CSV identity column, or decision display text; the UI and export use ordinal labels while source matching and evidence lineage remain unchanged.
- Regression coverage includes short phone-like and long references, ensuring neither is copied into decision display text or CSV customer labels.

## Acceptance

- Tests are authored. Exact-head P1 Vitest/strict TypeScript and required P2 browser acceptance remain pending.
- No PASS is claimed from queued or earlier-head workflows.
- No schema/RPC, financial or inventory operation, production database write, live ERP call, secret, deployment or paid service was introduced.
