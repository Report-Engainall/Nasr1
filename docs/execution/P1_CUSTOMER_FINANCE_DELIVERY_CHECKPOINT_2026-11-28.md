# P1 Delivery Checkpoint — Customer Finance and ERP Read UI
Date: 2026-11-28
Repository: `Report-Engainall/Nasr1`
Owner: P1 — customer workflows, finance presentation, admin UI and integration.
Main baseline: `12b0db37a97128a19073f907ba12fb700251802b`
Branch: `p1/customer-financial-source-ui-guard-20261127-r2`
Exact branch SHA under verification: `944394f863b001c9e071decbd164663ac66521fe`
PR: [#699](https://github.com/Report-Engainall/Nasr1/pull/699) — Draft; do not merge.

## Delivered in the current P1 branch
- Existing customer financial screens are guarded by the server-selected source. APP_ONLY data stays separate from ONYX/MUTAKAMEL; missing, stale, suspended or unresolved states fail closed.
- The existing account statement now links to customer **balance review** and **date-ranged statement** requests. The service portal validates real Gregorian dates and inclusive ordered period, then records the request through the existing customer-scoped `create_my_customer_service_case` RPC. Identity, tenant scope, permission, idempotency, audit and case thread stay server-owned. No ledger/payment mutation is performed.
- Existing customer saved-receipt list/reprint UI remains source gated and calls customer-specific RPC names only; it does not create or post a payment.
- P1 branch includes the ERP read-sync panel in the existing Onyx exchange screen. Its request client and result contract use the Edge Function boundary; inputs contain no ERP secret. Manager gating, configured provider readiness, approved scope, bounded page/record limits, progress counts and checkpoint watermark are surfaced.
- Added focused tests for customer financial requests, source notices, saved receipt self-service, ERP panel behaviour and ERP client response parsing.
- Strict TypeScript now includes `ErpReadSyncPanel`, its test, `erp-read-sync.ts` and its parser test. P1 workflow path filters include all four paths in each of the three relevant path groups.

## Cross-owner dependencies — do not bypass
- **P2 #697** current head: `5d335c06542e7c9f8488f7478700ef47855bb2f3`. Its migration still exposes staff-only receipt print functions and does not yet expose `get_my_customer_payment_receipt_print_options` / `get_my_customer_payment_receipt_print_data` for customer self-service. P1 recorded this as a hard blocker in #697 comment `7229356312`. Preserve fail-closed UI until customer-scoped PG17 contract and acceptance exist.
- **P4 #686** current head: `a0c05afae5cc8cb35a2d8c5d69e8bb64ae9c5ec1`. The `erp-read-sync` Edge Function exists on the P4 branch, not on main. It requires server-side provider contract, license/endpoint confirmation, sandbox availability, encrypted checkpoint key, tenant binding and allow-listed scope. No provider credentials/configuration, license, sandbox or live connector have been proven here. Keep the UI inactive with explicit safe errors until P4 backend is integrated and independently accepted.
- P3 #700, and companion #680/#698, remain separate P3-owned changes. P1 does not duplicate or edit their analytics engines.

## Exact-SHA acceptance
- P1 Admin Context Verification for `944394f863b001c9e071decbd164663ac66521fe`: run `46077175001`, **QUEUED** at checkpoint creation.
- P2 critical paths and PostgreSQL 17, plus public Chromium / authenticated infrastructure checks: no terminal success is currently recorded for this exact P1 head.
- #697 and #686 latest checks were also queued at last observation. Earlier failures and older SHA results are not transferred.
- Acceptance state: **IN_PROGRESS**. No test is described as PASS until a completed exact-SHA run reports SUCCESS and required test logs are inspected.

## Safety and next action
- `main` unchanged. No production Supabase writes/migrations, live ERP requests, external financial writes, secrets, deployments, paid services, Vercel, Bolt or Lovable use.
- Next: consume exact-head P1 checks, then resolve P2's missing customer receipt RPCs and P4's integration dependency; merge only after all relevant code + PG17/security gates are accepted.
- Release remains NO-GO; this checkpoint does not declare overall product or production readiness.
