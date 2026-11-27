# P2 Checkpoint — Customer Financial Source Routing
Date: 2026-11-28
Repository: `Report-Engainall/Nasr1`
Owner: P2 — PostgreSQL 17, RLS/RBAC, customer financial identity, audit and transaction safety
Branch: `p2/customer-financial-source-routing-pg17-20261127`

## Current source pointers
- Latest observed main HEAD: `12b0db37a97128a19073f907ba12fb700251802b` (documentation-only execution directive refresh).
- Latest code-bearing main SHA recorded in the shared execution state: `9c51f65f16aad1be300444cc37f5a0457b3dccb1`.
- Latest P2 code/test head before this checkpoint update: `181acdf7410f4b57557b2f2b7a2afa5b3d2b1458`. Do not describe CI as accepted until the exact-head jobs below become terminal SUCCESS.
- PR: [#697](https://github.com/Report-Engainall/Nasr1/pull/697), still Draft. Do not mark ready or merge until exact-head PostgreSQL 17 and P2 gates are terminal SUCCESS.
- No production database identity was used, no remote migration/data write/deployment occurred, and no ERP credentials or live ERP calls were used.

## Implemented P2 contract
- One source binding per organization/customer: `APP_ONLY`, `ONYX`, or `MUTAKAMEL`. Existing/new customers are assigned APP_ONLY without inventing opening balances.
- Server-selected source and scope; customers cannot choose or change their financial source. Customer resolver never exposes the ERP external account reference; finance-staff resolver is capability-scoped.
- Source changes follow idempotent request → service-role evidence → different finance maker/checker → binding revision increment and audit.
- Reconciliation evidence now includes a `balances_by_currency` object with exactly two canonical decimal strings per declared currency: `current_source_balance` and `target_source_balance`. All and only declared currencies must be present.
- The database compares each currency pair as PostgreSQL `numeric`. `matched` is rejected if any pair differs; malformed/missing amounts and unlisted/missing currencies are rejected. The evidence hash replay comparison includes the full per-currency balance object, so changed balance metadata under the same hash conflicts.
- PostgreSQL 17 JSON key counts use `jsonb_object_keys` with scalar count subqueries; the migration does not call `jsonb_object_length`.
- APP_ONLY statements continue through the existing internal ledger. ONYX/MUTAKAMEL statements fail closed until P4 supplies an authorized provider reader; there is no APP_ONLY fallback, source blending, or fabricated current ERP balance.
- The APP_ONLY invoice PDF source lock remains in place. Source resolver access is permitted to the customer with `statement.read` or `invoices.read`, without widening invoice data access itself.

## Files owned by this P2 slice
- `supabase/migrations/20261127230000_customer_financial_source_routing.sql`
- `scripts/test-customer-financial-source-routing.mjs`
- `.github/workflows/p2-playwright-critical-paths.yml`
- This checkpoint
- `docs/canonical/AGHBARI-REQUIREMENT-REGISTRY.md` — stable requirement `AGH-CUSTOMER-FINANCIAL-SOURCE-001`
- `docs/bolt-source-reconciliation/API_OPS_CONTRACT_REGISTER_2026-10-24.md` — exact RPC caller/input/evidence contract

## Focused acceptance assertions added
- Every APP_ONLY/ONYX/MUTAKAMEL cutover fixture supplies YER and USD per-currency evidence.
- Reject matched evidence with no balance object, with an amount mismatch in any currency, or with incomplete currency coverage.
- Reject reuse of an evidence SHA with changed but internally equal per-currency balances (exercises the hash-replay guard, not the earlier equality guard).
- Retain source-mode scope, customer/tenant isolation, maker-checker, idempotency, source reference, external statement fail-closed behavior, invoice-source isolation, service-role-only evidence writing, and monotonic sync watermark checks.
- The dedicated P2 workflow invokes `node scripts/test-customer-financial-source-routing.mjs` after isolated local seeding.

## Exact-SHA status
- Exact code/test head after the staff invoice source-boundary update: `541bb5fa4f68460e26f424f328b78f8e712f59a2`.
- The former compound reconciliation-validation expression has been replaced in the current branch history by ordered envelope checks, currency-key coverage checks, a bounded per-currency loop, decimal validation before numeric casts, and exact numeric equality for matched results. Evidence hash replay still compares the full balance payload and metadata.
- The existing invoice security is retained: boolean-only customer_app_only_invoice_read_allowed, restrictive RLS on invoice headers/items, and a source-binding FOR SHARE lock in get_customer_invoice_pdf; no duplicate invoice service was introduced.
- This execution additionally source-binds the existing customer receipt paths: receipt list count/page only include active APP_ONLY bindings; a boolean-only customer_app_only_receipt_read_allowed protects direct table RLS; the existing print-data RPC is VOLATILE and takes FOR SHARE on the source binding before returning the saved receipt/allocation snapshot.
- Staff invoice exceptions are no longer broad tenant-only exceptions. Both restrictive invoice header and invoice-item RLS policies now require the same boolean `staff_customer_app_only_financial_rows_read_allowed` helper, which preserves the `is_staff` and active-organization checks and additionally requires that row's customer to have an active APP_ONLY binding. The item policy resolves the parent invoice's customer under the same tenant scope.
- Direct invoice list access is covered by the invoice-header restrictive RLS policy; invoice detail and `/api/invoice-pdf/$invoiceId` both call the same customer-bound `get_customer_invoice_pdf` RPC, which checks APP_ONLY and locks the binding. The route does not use a service-role bypass.
- Direct `customer_payments` table SELECT is already revoked by the established financial-column privacy migration. This update explicitly enables RLS and adds a restrictive staff/source policy as defense-in-depth, preserving the existing `is_staff` + active-organization boundary. The P2 test checks the policy catalog and the boolean helper; it no longer assumes a SELECT grant that the product intentionally does not provide.
- `get_staff_customer_360` was a separate privileged bypass: its SECURITY DEFINER body aggregated `customer_payments`, `customer_invoices`, and current customer balances, so table RLS could not protect it. The current P2 migration reasserts the existing finance-role-guarded function with a binding `FOR SHARE` lock and fails closed unless the selected binding is active APP_ONLY. This prevents stale APP_ONLY invoice/payment aggregates from appearing in staff Customer 360 during ONYX/MUTAKAMEL mode.
- The P2 acceptance script now creates a real two-invoice receipt through record_customer_payment_allocation, proves it appears and prints under APP_ONLY, is hidden/denied after ONYX and MUTAKAMEL cutovers, and becomes printable again only after the approved APP_ONLY return. Statement-summary comparison is taken after the fixture receipt is posted.
- The same test now proves that manager access to the actual fixture invoice header and invoice-item rows is allowed under APP_ONLY, denied after ONYX and MUTAKAMEL, and restored only after the approved APP_ONLY return. The policy-catalog assertion requires both restrictive invoice policies to call the source-aware staff helper.
- The same acceptance verifies the direct staff payment RLS is enabled and RESTRICTIVE; `staff_customer_app_only_payment_read_allowed` returns true for manager + APP_ONLY and false after ONYX/MUTAKAMEL, then true only after the approved return cutover. Direct table SELECT is not granted, so the test does not simulate a nonexistent permission.
- Earlier exact-head workflows for `181acdf7410f4b57557b2f2b7a2afa5b3d2b1458`, `1be809556e1e4a50b48f6869236a6783935c1ebd`, and `968c16ad32c4cba61f63488e3bfa1e73cbfd4fcb` are superseded by later migration/test edits. No PASS is transferred. Current exact-head workflows for `5a6a4e6075366ca1ed0e6c929a5e344ab6d24601`: P2 `46075887577` QUEUED; P1 `46075887593` QUEUED; PG17 `46075887695` QUEUED. No PASS is claimed.
- Earlier failed PG17 run 46072628890 on superseded head e378f4d3e3a08db8d57669f029a037040c5a1494 is retained as the original syntax-failure evidence only; do not reuse its result for the repaired head.
- Hosted customer/order/tenant E2E remains outside this local P2 proof; if SKIPPED it is not PASS.

## Superseded/failed intermediate attempts — do not reuse
- The original evidence-only design stored currency codes and record counts but could claim `matched` without proving actual balance equality; that gap is superseded by the current balance-bearing payload.
- Intermediate file-edit commits `895956b95226510d925821efd485c01107ff6015` and `d87fa005b230547907ce8e0971f6b365274443db` contained malformed/duplicated SQL and are not acceptable or test evidence.
- Commit `dc57258d0b2b1605ec3784e4ff9c808eaaf14513` used `jsonb_object_keys` but had a temporary `THEN false` placeholder in place of the numeric equality guard; this was corrected before the synchronized head `fe894f5`.
- The current branch was restored from the known-good migration version at commit `0a7e5da113c477ffe009e2c909a0e8f2cf5f11db`, preserving the concurrent invoice-only resolver permission fix, then the source-balance contract and tests were reapplied and reviewed.

## Safety and ownership boundary
- P2 owns this checkpoint, migration, RPC and local database acceptance. P4 owns ERP transport/readers and must supply real provider/source receipts; P1 owns UI integration. P1/global execution owner updates the shared state and acceptance matrix.
- No remote Supabase migration, production data write, Edge deploy, secrets change, ERP mutation, paid service, Vercel quota, Bolt or Lovable action.
- Do not expose external account references or other customers' statements. Do not present stale provider snapshots as current.
- Release remains NO-GO until the complete business path, authorized external transport, required security/finance/inventory gates, post-merge checks and runtime verification are proven.

## Immediate next action
Fetch the exact-head workflow runs for `541bb5fa4f68460e26f424f328b78f8e712f59a2`; treat every queued, running or skipped job as non-success. Require isolated PostgreSQL 17 migration plus Customer financial source routing PostgreSQL 17 acceptance PASS, P2 critical paths, P1/admin verification, public Chromium and infrastructure checks. Fix only failures reproduced on the current head; after any migration/test change, rerun acceptance on the resulting exact SHA. P1 owns final integration and merge; P2 must not merge or deploy.

## Latest result-first execution — 2026-11-28

- Implemented on existing PR #697; no parallel PR or duplicate screen/service was created.
- Receipt read boundary is now part of the same financial-source contract. Direct receipt reads, paged selector totals/results, and printable receipt snapshots all follow the server-owned APP_ONLY/ONYX/MUTAKAMEL binding. The printer holds a shared binding lock for the read, so a concurrent source cutover cannot race the snapshot.
- Receipt test uses a persisted two-invoice receipt and the existing allocation RPC. It verifies the saved receipt identity and allocation count; it does not fabricate balances or mutate a live environment.
- Commits in this execution: migration/source reader 654452cc60bda041f678c1f034bd98385ffd60b9; matching exact-source acceptance 181acdf7410f4b57557b2f2b7a2afa5b3d2b1458.
- All test claims remain pending until the three exact-head workflow runs above finish. No production Supabase write, remote migration, live ERP request, deployment, or paid service was used.

## Direct payment ledger source guard — 2026-11-28

- Migration commit `6fb60dbfd1af0bee98aa4ca03fd1d4aaeea6ff2e`: explicitly enables RLS on `public.customer_payments`, adds the boolean-only `staff_customer_app_only_payment_read_allowed(customer_id, organization_id)` helper, and adds the RESTRICTIVE SELECT policy without widening existing grants or roles.
- Acceptance commit `968c16ad32c4cba61f63488e3bfa1e73cbfd4fcb`: verifies the policy is installed and restrictive, table RLS is enabled, helper returns true only for the manager in the active organization while APP_ONLY, returns false after ONYX and MUTAKAMEL, and returns true after the approved APP_ONLY return.
- Direct payment SELECT remains intentionally ungranted; the test no longer tries to read the table directly. This protects the explicit RPC-only financial data boundary.
- The last observed workflow batch was triggered on the prior head `1be809556e1e4a50b48f6869236a6783935c1ebd`: PG17 `46075568672`, P2 `46075568878`, P1 `46075568686`; all were queued at last read and are not evidence for the newer SHA. Exact-head run listing for `968c16a` was empty at checkpoint time.
- No production write, remote migration, ERP call, deployment, or paid service was used.

## Staff Customer 360 source boundary — 2026-11-28

- Migration override commit `08734de78f875cf3a80ac324bd0d457931950ba4`: reasserts the authoritative `get_staff_customer_360(uuid)` finance-role-guarded function from the latest main migration, adding a shared lock on the customer source binding and SQLSTATE 55000 fail-closed behavior unless the source is active APP_ONLY. The lock remains held through the snapshot transaction, serializing it with maker/checker source cutover.
- Exact acceptance commit `5a6a4e6075366ca1ed0e6c929a5e344ab6d24601`: proves Customer 360 returns the actual customer + currency finance projection under APP_ONLY, fails closed after ONYX and MUTAKAMEL, and returns only after APP_ONLY is re-approved.
- This avoids relying on RLS for a SECURITY DEFINER aggregate that bypasses table policies. No app ledger values or current-balance fields are returned for an external binding.
- P1 handoff: the existing Customer 360 screen will receive a controlled RPC error for external sources until it reads `get_customer_financial_source_for_staff` and presents the selected-source/unavailable state; no UI-only security assumption is made.
- Exact-head workflows at the time of checkpoint: PG17 `46075887695` QUEUED, P2 `46075887577` QUEUED, P1 `46075887593` QUEUED. These results are tied to the current exact SHA only after each job checks it out; all are pending now.

## Staff invoice RLS source narrowing — 2026-11-28

- Migration commit `5510218446a19fbaae5a0231106d9931e38c6c8b`: introduces one SECURITY DEFINER boolean helper for staff reads of APP_ONLY financial rows and uses it for both invoice header and parent-joined invoice-item restrictive policies. The customer-side capability/source helper remains in place; the old broad staff-only tenant exception is removed.
- Acceptance commit `541bb5fa4f68460e26f424f328b78f8e712f59a2`: manager can read the actual seeded invoice header and item in APP_ONLY; both return zero rows under ONYX and MUTAKAMEL; both become readable again only after maker/checker approves the APP_ONLY return. Policy-catalog assertions verify the helper is in both restrictive policies.
- This extends the already implemented PDF RPC binding lock and source-isolated receipt, direct payment, and Customer 360 contracts. It does not grant new direct table privileges; it narrows RLS behavior only.
- Exact test head `541bb5fa4f68460e26f424f328b78f8e712f59a2` remains pending CI; older run results are not accepted for it.

 
## Customer self-service receipt retrieval — 2026-11-28

- Extended the existing #697 migration with customer-only `get_my_customer_payment_receipt_print_options(integer,integer)` and `get_my_customer_payment_receipt_print_data(uuid)`; the staff-only receipt functions remain unchanged.
- Both RPCs derive profile, organization and customer from the authenticated session, require an active approved customer with `statement.read` or `invoices.read`, and fail closed for missing, suspended, ONYX or MUTAKAMEL source bindings. Customer membership is resolved by `current_customer_id()` and the active profile/organization context; do not add a direct `customers.profile_id = current_profile_id()` restriction because approved company members may be linked through customer membership contracts. The source binding is locked `FOR SHARE` during both page and print reads.
- The customer selector is limited to 100 rows and returns only the current customer's receipt headers. Print data is constrained by receipt ID + derived tenant/customer and validates 2..50 distinct invoice allocations, positive amounts, customer/tenant/currency consistency, exact allocation count and exact total before rendering.
- The customer DTO excludes profile IDs, tenant IDs, internal payment IDs, notes and idempotency data. No customer-facing payment creation or mutation is exposed.
- The existing PG17 source-routing acceptance now covers customer receipt list/print success, account-code scoping, cross-tenant denial, authenticated-only SECURITY DEFINER grants, ONYX and MUTAKAMEL no-fallback, suspended-source denial, row-lock serialization, out-of-range pagination and a missing-allocation corruption fixture that is rolled back before exit.
- This work extends the RPC contract used by P1's existing customer receipt component; it adds no route, parallel screen, staff privilege or new migration file. The existing P2 workflow already executes this acceptance script after isolated local seeding.
- Exact-head acceptance for this update is pending. Previous runs and results are not transferable to the new commit. No production/hosted database mutation, remote migration, ERP request, deployment, secret, paid service or external write was performed.
- Next code action: address only a concrete failure reproduced by the exact-head P2/PostgreSQL 17 run; otherwise hand the two customer RPC contracts to P1 for exact-head UI verification and merge coordination.
