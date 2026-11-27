# P1 Delivery Checkpoint — Customer Finance, Admin 360 and ERP Read UI
Date: 2026-11-28
Repository: `Report-Engainall/Nasr1`
Owner: P1 — customer workflows, finance presentation, admin UI and integration.
Main baseline: `12b0db37a97128a19073f907ba12fb700251802b`
Branch: `p1/customer-financial-source-ui-guard-20261127-r2`
Parent before this delivery: `a2a286cb2aee990c716667d883b074aeca212a4d`
P1 race-guard implementation commit: `c08c260b9b810b291aa137212e358378a31099cd`
P1 regression-test commit: `701c3fbe5261a8943174a4da9286cdc172a0d31b`
PR: [#699](https://github.com/Report-Engainall/Nasr1/pull/699) — Draft; do not merge.

## Delivered on this P1 branch
- Customer statement/invoice/payment UI follows the server-selected financial source. APP_ONLY is not blended with ONYX/MUTAKAMEL; missing, stale, suspended or unresolved states fail closed.
- Customer saved-receipt list and reprint use only customer-scoped read RPCs `get_my_customer_payment_receipt_print_options` and `get_my_customer_payment_receipt_print_data`. This prints a saved receipt; it does not create or post a payment.
- Statement balance-review and inclusive date-ranged statement requests create audited, idempotent customer-scoped service cases; no ledger, payment or balance mutation is performed.
- Finance/Collections resolves the selected customer's source before local payment/receipt creation and rechecks source/customer identity on submit.
- Admin Customer 360 resolves the selected customer's source before `get_staff_customer_360`; the APP_ONLY projection is requested only for active/fresh APP_ONLY.
- **New race/privacy guard:** each Customer 360 load receives a monotonically increasing request sequence. A response that completes after a newer load, customer change or component cleanup cannot update source, summary, error or loading state. The rendered summary, print document and export are identity-bound to `summary.customer.id === customer.id`; source notice/errors are tagged to their selected customer, and a late interaction-history callback from a prior customer is ignored.
- **New regression test:** the first customer's source resolver is deliberately held, the component is switched to a second customer whose selected source is ONYX, then the first APP_ONLY response is released. The second customer's ONYX source remains visible and the APP_ONLY financial summary is never called.
- The existing Onyx exchange workspace includes the bounded server-side read-sync panel. It displays server-returned counts and checkpoint watermarks, but does not claim a live provider connection.

## Cross-owner dependencies and current heads
- **P2 #697:** current observed head `66f89a5a89fe4237f249758d56e0a24465c803a8`. The migration at this exact head contains both customer-only receipt RPCs. Its own PostgreSQL 17 source-routing and authenticated workflow acceptance is still required; the current runs observed were `46078601338`, `46078601340`, and `46078601388`, all QUEUED.
- **P2 durable ERP staging store / P4 #686:** current observed head `e1ba4176c94b20688b61306bf9f73bad3643826f`. The migration blob `762bec5d7b9402dd642e86a741ca6b56d774922f` still has the truncated line-7 CHECK expression:
  ```sql
  scope_key text NOT NULL CHECK (scope_key ~ '^[0-9a-f]{64}
  ```
  PostgreSQL cannot parse this migration. The branch moved since the original P1 finding, so the blocker was revalidated on `e1ba417...`; the durable-store acceptance remains BLOCKED until P2 repairs it and proves reset + replay/concurrency/scope-isolation/rollback/ACL on the exact resulting SHA.
- Vendor API contract, licence, sandbox, tenant binding and live credentials remain UNKNOWN. Keep live ERP transport disabled.
- P3-owned intelligence and analytics changes remain with P3; no duplicate analytics implementation was introduced.

## Exact-SHA acceptance
- P1 race-guard code + regression test commit `701c3fbe5261a8943174a4da9286cdc172a0d31b` currently has:
  - P1 Admin Context Verification `46078574221` — QUEUED
  - P2 Playwright Critical Paths `46078574190` — QUEUED
  - Customer Shopping Lists PostgreSQL 17 `46078574249` — QUEUED
- Those runs belong to SHA `701c3fbe...`; they do not transfer to the checkpoint commit that updates this document. The resulting checkpoint HEAD must receive its own current-head checks.
- P2 #697 exact-head database and UI acceptance remains QUEUED as listed above. Queued, in-progress, skipped, cancelled or previous-SHA results are not PASS.

## Safety and release gate
- `main` remains `12b0db37a97128a19073f907ba12fb700251802b`; this P1 delivery is isolated on the existing PR branch.
- No production database writes/migrations, ERP calls, financial mutations, inventory postings, secrets, deployment, paid services or Vercel/Bolt/Lovable use were performed.
- Release remains **NO-GO** until P1/P2/P4 exact-head checks and the PostgreSQL 17/security gates pass.
