# P1 Delivery Checkpoint — Customer Finance, Admin 360 and ERP Read UI
Date: 2026-11-28
Repository: `Report-Engainall/Nasr1`
Owner: P1 — customer workflows, finance presentation, admin UI and integration.
Main baseline: `12b0db37a97128a19073f907ba12fb700251802b`
Branch: `p1/customer-financial-source-ui-guard-20261127-r2`
Parent before this checkpoint correction: `fd03646fd7d88e1c56a394ca4d9fed3f83435a83`
Code-bearing P1 change: `d11624083b1935576cf76f852f2338afc077f2c3`
PR: [#699](https://github.com/Report-Engainall/Nasr1/pull/699) — Draft; do not merge.

## Delivered
- Customer statement/invoice/payment UI consumes the server-selected source contract. APP_ONLY is never blended with ONYX/MUTAKAMEL; missing, stale, suspended or unresolved states fail closed.
- Customer saved-receipt list and reprint call the customer-only `get_my_customer_payment_receipt_print_options` and `get_my_customer_payment_receipt_print_data`; staff-only receipt functions remain separate. Printing does not create or post a payment.
- The existing statement screen offers balance-review and inclusive date-ranged statement requests. They create audited, idempotent customer-scoped service cases; no ledger, payment or balance mutation is performed.
- Finance/Collections resolves the selected customer's source before local payment/receipt creation and rechecks source/customer identity on submit.
- The existing Onyx exchange workspace mounts the bounded server-side ERP read-sync panel. It shows actual returned counts/checkpoint watermarks and safe provider readiness failures without claiming a live ERP connection.
- Admin Customer 360 resolves the selected customer's source before `get_staff_customer_360`. The finance projection is called only for active/fresh APP_ONLY. ONYX/MUTAKAMEL/stale/suspended and source-resolver-error states suppress the APP_ONLY summary.
- New component tests cover customer requests, saved receipt retrieval/reprint, ERP panel/parser and Customer 360 source gating. Strict TypeScript and P1 path filters include the added tests.

## Cross-owner dependencies
- **P2 #697 current head:** `efecdf744a1b5aaa0e8ac99677eba91f76b92a7f`. It now contains customer-only receipt list/print RPCs separate from staff functions. The SQL derives identity from auth context, requires active APP_ONLY, locks the source binding FOR SHARE, and validates allocation integrity. Its source-routing acceptance includes own-account, cross-tenant, ONYX/MUTAKAMEL/suspended, pagination, corruption and cutover-lock cases. Exact-head P2 / P1 / PostgreSQL 17 runs are queued.
- **P2 durable ERP staging store is not in #697.** The migration `20261128010000_erp_sync_durable_checkpoint_staging.sql` currently resides in the #686 branch. At #686 head `d95dcad0de4ee8fb91e0547109b08ee2523c6a10`, line 7 has a truncated `scope_key` regex/SQL CHECK, which blocks PostgreSQL parsing. P1 reported this in #686 comment `7229516752`. The correction must be followed by exact-head PostgreSQL 17 reset and checkpoint-store replay/concurrency/scope-isolation/rollback/ACL tests.
- **P4 #686 current observed head:** `d95dcad0de4ee8fb91e0547109b08ee2523c6a10`. The branch includes the `erp-read-sync` Edge Function, connector and encrypted checkpoint store, not in main. Provider use also requires official contract, confirmed license/endpoint, sandbox, server credentials/cursor key, tenant binding and allow-listed scope. No live provider readiness is asserted.
- P3 #700/#680/#698 remain P3-owned; no duplicate analytics engine was created.

## Exact-SHA acceptance
- Code-bearing P1 commit `d11624083b1935576cf76f852f2338afc077f2c3` run `46077686288` was CANCELLED by subsequent branch updates; it is not PASS.
- P1 gate run `46077946410` on the pre-correction head `fd03646fd7d88e1c56a394ca4d9fed3f83435a83` had job `140769995323` QUEUED. This checkpoint change is included in P1 path filters, so the resulting exact head must trigger a fresh P1 Admin Context Verification run.
- P2 #697 runs on `efecdf744a1b5aaa0e8ac99677eba91f76b92a7f`: `46077869427` critical paths, `46077869434` P1 strict checks, `46077869484` PostgreSQL 17 — QUEUED.
- P4 #686 runs on `d95dcad0de4ee8fb91e0547109b08ee2523c6a10`: `46077727955` P1 verification, `46077727960` PostgreSQL 17, `46077728027` critical paths and `46077728009` shopping-list PostgreSQL 17 — QUEUED at last observation.
- Old-SHA results are not transferred. Queued, pending, skipped or cancelled jobs are not PASS. Acceptance remains **IN_PROGRESS**.

## Safety
- `main` unchanged. No production Supabase writes/migrations, ERP calls, financial mutations, secrets, deployment, paid services or Vercel/Bolt/Lovable use.
- Release remains NO-GO until exact-head P1/P2/P4 security, PostgreSQL 17 and integration checks pass.
