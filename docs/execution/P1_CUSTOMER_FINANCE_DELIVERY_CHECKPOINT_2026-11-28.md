# P1 Delivery Checkpoint — Customer Finance, Admin 360 and ERP Read UI
Date: 2026-11-28
Repository: `Report-Engainall/Nasr1`
Owner: P1 — customer workflows, finance presentation, admin UI and integration.
Main baseline: `12b0db37a97128a19073f907ba12fb700251802b`
Branch: `p1/customer-financial-source-ui-guard-20261127-r2`
Exact branch SHA: `d11624083b1935576cf76f852f2338afc077f2c3`
PR: [#699](https://github.com/Report-Engainall/Nasr1/pull/699) — Draft; do not merge.

## Delivered
- Customer statement/invoice/payment UI consumes the server-selected source contract. APP_ONLY data is not blended with ONYX/MUTAKAMEL; unknown, stale, suspended and resolver-error states fail closed.
- Customer saved-receipt list and reprint use the customer-only RPC names `get_my_customer_payment_receipt_print_options` and `get_my_customer_payment_receipt_print_data`. The customer UI never calls the staff-only receipt RPCs and printing does not create a payment.
- The existing account statement provides direct actions to request a balance review and a statement for an inclusive validated date range. These create an audited, idempotent, customer-scoped service case; they do not write ledger, payment or balance data.
- Existing Finance/Collections workflow resolves the selected invoice customer's financial source before local payment/receipt creation and rechecks identity on submit.
- Existing Onyx exchange workspace mounts the bounded ERP read-sync panel. The client invokes only the server-side Edge Function; the panel displays actual result counts/checkpoint watermarks and handles provider-not-configured/not-enabled failure without claiming connectivity.
- **Admin Customer 360 now resolves the selected customer's source before calling `get_staff_customer_360`.** APP_ONLY active/fresh is required before loading the SECURITY DEFINER finance projection. ONYX/MUTAKAMEL/stale/suspended sources show the source notice and suppress the APP_ONLY summary. Resolver failure fails closed.
- Focused tests cover customer financial requests, customer receipt reprint, ERP panel/parser, source notices and Customer 360 source gating. Strict TypeScript and the three P1 path-filter groups include the new Customer 360 test and ERP panel/parser tests.

## Cross-owner dependencies
- **P2 #697 current head:** `1d9cbbf4aff0bec3e9275995c3c826e8ed8beb4b`. The existing migration now defines customer-only `get_my_customer_payment_receipt_print_options(integer,integer)` and `get_my_customer_payment_receipt_print_data(uuid)`; staff-only functions remain separate. Server derives customer/org from the authenticated context, checks active APP_ONLY binding, locks the binding FOR SHARE, and verifies allocation count/uniqueness/customer/tenant/currency/positive amounts/exact total. The acceptance script includes cross-tenant, ONYX/MUTAKAMEL/suspended, paging and cutover-lock cases. This closes the missing-code dependency; **exact-head PostgreSQL 17 acceptance is still QUEUED** and must pass before release.
- **P4 #686 current observed head:** `c0a6330aa7b55100165d4fc677e47a5ee2192d2f`. Its branch contains the `erp-read-sync` Edge Function and encrypted checkpoint store, not in `main`. Provider use still requires server-side official contract, confirmed license/endpoint, sandbox, server credentials, encrypted cursor key, organization binding and allow-listed company/branch/warehouse/currency. No live provider readiness or external connection is asserted.
- P3 #700 and companion #680/#698 remain P3-owned; no parallel analytics engine or duplicate recommendation system was created.

## Exact-SHA acceptance
- P1 head `d11624083b1935576cf76f852f2338afc077f2c3`: P1 Admin Context Verification run `46077686288`, job `140769153157`, **QUEUED** at last observation.
- P2 #697 head `1d9cbbf4aff0bec3e9275995c3c826e8ed8beb4b`: P2 critical-path run `46077214867`, strict P1 run `46077214882`, and PostgreSQL 17 run `46077214878` are **QUEUED**. The critical-path workflow includes the local PostgreSQL 17 financial-source script.
- P4 #686 workflows on its current branch have not reached a terminal successful exact-head acceptance; a prior critical-path run was cancelled.
- Older SHA results are not transferred. No PASS is claimed for queued, pending, skipped or cancelled jobs.
- Acceptance remains **IN_PROGRESS**. Merge requires P1 strict TypeScript/Vitest, relevant Chromium flows, P2 PostgreSQL 17 and source isolation, and P4 Edge-handler/checkpoint tests on their exact accepted heads.

## Safety
- `main` unchanged. No production Supabase writes/migrations, ERP calls, financial mutations, secrets, deployment, paid services or Vercel/Bolt/Lovable usage.
- Release remains NO-GO until exact-head checks pass and integration/runtime evidence is complete.
