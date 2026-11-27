# P1 Delivery Checkpoint — Customer Finance, Admin 360 and ERP Read UI
Date: 2026-11-28
Repository: `Report-Engainall/Nasr1`
Owner: P1 — customer workflows, finance presentation, admin UI and integration.
Main baseline: `12b0db37a97128a19073f907ba12fb700251802b`
Branch: `p1/customer-financial-source-ui-guard-20261127-r2`
Current branch parent before this gate/checkpoint refresh: `5b8449bd20d21333462bbd35b6908735a4526eef`
Last code-bearing P1 commit: `d11624083b1935576cf76f852f2338afc077f2c3`
PR: [#699](https://github.com/Report-Engainall/Nasr1/pull/699) — Draft; do not merge.

## Delivered
- Customer statement/invoice/payment UI consumes the server-selected source contract. APP_ONLY data is not blended with ONYX/MUTAKAMEL; unknown, stale, suspended and resolver-error states fail closed.
- Customer saved-receipt list/reprint calls customer-only `get_my_customer_payment_receipt_print_options` and `get_my_customer_payment_receipt_print_data`; it does not call staff-only RPCs or create/post a payment.
- The account statement offers balance-review and inclusive date-ranged statement requests. Both create an audited, idempotent, customer-scoped service case, with no ledger/payment/balance mutation.
- Finance/Collections resolves the selected invoice customer's source before local payment/receipt creation and rechecks the source/customer identity on submit.
- Existing Onyx exchange workspace mounts the bounded ERP read-sync panel; requests go only to the server Edge Function. It shows actual counts/checkpoint watermarks and safe provider-not-configured/not-enabled results.
- Admin Customer 360 resolves the selected customer's source before `get_staff_customer_360`. Active/fresh APP_ONLY is required before the SECURITY DEFINER finance projection. ONYX/MUTAKAMEL/stale/suspended and resolver-error states suppress the APP_ONLY summary.
- Focused tests cover customer requests, customer receipt reprint, ERP panel/parser, source notices and Customer 360 source gating. Strict TypeScript and P1 path filters include all new tests.

## Cross-owner dependencies
- **P2 #697 current head observed:** `efecdf744a1b5aaa0e8ac99677eba91f76b92a7f`. The current branch includes customer-only receipt list/print RPCs separate from staff functions and adds the P2 ERP durable-checkpoint/staging store consumed by P4. The customer receipt SQL derives identity from auth context, locks the binding FOR SHARE, requires active APP_ONLY and validates allocation count, customer/tenant/currency, positive amounts and exact totals. P2 local PostgreSQL 17 acceptance includes the source-cutover script. Its exact-head P2 / P1 / PostgreSQL 17 runs are queued, not PASS.
- **P4 #686 current head observed:** `c0a6330aa7b55100165d4fc677e47a5ee2192d2f`. The branch carries the `erp-read-sync` Edge Function, connector and encrypted checkpoint store, not in main. Provider use still requires official contract, confirmed license/endpoint, sandbox, server-side credentials and cursor key, tenant binding and allow-listed company/branch/warehouse/currency. No live connector readiness is asserted.
- P3 #700/#680/#698 remain P3-owned; no duplicate analytics engine was created.

## Exact-SHA acceptance
- The previous P1 run for code-bearing SHA `d11624083b1935576cf76f852f2338afc077f2c3` (`46077686288`) was **CANCELLED** by subsequent branch updates. It is not a test result.
- This commit changes the P1 path filter and checkpoint only, adding this checkpoint path so the new branch SHA triggers the P1 gate. The new exact-head Vitest/strict-TypeScript, P2 critical-path and relevant PostgreSQL 17 checks must complete successfully; no prior result transfers.
- P2 #697 exact-head workflow runs observed: `46077869427` critical paths, `46077869434` strict P1 checks, `46077869484` PostgreSQL 17 — all QUEUED.
- P4 #686 exact-head workflow runs observed: `46077727955` P1 verification, `46077727960` PostgreSQL 17, `46077728027` critical paths and `46077728009` shopping-list PostgreSQL 17 — all QUEUED.
- Acceptance remains **IN_PROGRESS**. No queued, pending, skipped, cancelled or older-SHA run is PASS.

## Safety
- `main` unchanged. No production database writes/migrations, ERP calls, financial mutations, secrets, deployment, paid services or Vercel/Bolt/Lovable use.
- Release remains NO-GO until exact-head P1/P2/P4 security, PostgreSQL 17 and integration checks pass.
