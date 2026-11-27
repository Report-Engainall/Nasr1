# P1 Customer Finance Delivery Checkpoint — 2026-11-28

- **Owner:** P1 — customer finance UI and final integration.
- **Main baseline:** `12b0db37a97128a19073f907ba12fb700251802b`.
- **Working branch:** `p1/customer-financial-source-ui-guard-20261127-r2`.
- **Latest code SHA:** `8a3f53ce878226ceeb501dc7aee85b2e444ec3d4`.
- **Delivered in this batch:** customer balance-review case creation; date-ranged account-statement request with Gregorian date and range validation; direct entry points from the existing account-statement screen; existing server-derived customer identity, service-case permissions, audit trail, idempotency and case conversation are reused.
- **Financial safety:** requests are service cases only. No ledger writes, payment RPCs, balance mutation, cross-source aggregation, migration, remote database write, ERP connection, deployment or secret were introduced.
- **Acceptance state:** `IN_PROGRESS`. Exact-SHA P1 Vitest/strict-TypeScript, P2 authenticated critical-path and public UI workflows are queued for `8a3f53ce878226ceeb501dc7aee85b2e444ec3d4`; no pass is claimed before completion.
- **Blocking dependency:** #699 source-gated invoice/statement/payment UI and saved receipt self-service remain dependent on P2 #697 server resolvers and customer receipt-print RPCs. Preserve fail-closed behaviour; do not bypass the guard.
- **Next code action:** consume exact-SHA CI results, fix any regression on this branch, then integrate only after #697's PostgreSQL 17 and server-side isolation gates pass.
