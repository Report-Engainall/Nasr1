# P2 Checkpoint — Customer Financial Source Routing
Date: 2026-11-28
Repository: `Report-Engainall/Nasr1`
Owner: P2 — PostgreSQL 17, RLS/RBAC, customer financial identity, audit and transaction safety
Branch: `p2/customer-financial-source-routing-pg17-20261127`

## Current source pointers
- Latest observed main HEAD: `12b0db37a97128a19073f907ba12fb700251802b` (documentation-only execution directive refresh).
- Latest code-bearing main SHA recorded in the shared execution state: `9c51f65f16aad1be300444cc37f5a0457b3dccb1`.
- Latest P2 code/test head before this checkpoint refresh: `24a253e5bea64487ec7d2a127043333161c5a959`. It includes safe source-history DTO allowlist assertions including the capability-aware `can_review` flag, valid compound history-index checks, and direct cursor traversal without duplicate rows. Source-posting + RLS guard commits remain `484327faf7ab20af9ee2b1771a7563b652f05596` and `6be9a1e39ed8a2dff3f028229197ab3bf8e8dc30`; no CI PASS is carried forward from earlier SHAs.
- PR: [#697](https://github.com/Report-Engainall/Nasr1/pull/697), still Draft. Do not mark ready or merge until exact-head PostgreSQL 17 and P2 gates are terminal SUCCESS.
- No production database identity was used, no remote migration/data write/deployment occurred, and no ERP credentials or live ERP calls were used.


## Return-credit journal source boundary extension — 2026-11-28

- Current PR head when this checkpoint refresh began: `07be63007c0f5bce231e0bb8c7a909e5b73f8029`; base `main`: `12b0db37a97128a19073f907ba12fb700251802b`. PR #697 remains Draft and mergeable; P2 has not merged it.
- Added `assert_customer_app_only_credit_memo_journal_source(uuid,text,text)` and BEFORE INSERT/UPDATE/DELETE triggers on `accounting_journal_entries` and `accounting_journal_lines`. The helper resolves original `customer_return_credit_memo` references and the reversal `adjustment` reference prefix to the owning credit memo, then uses the existing APP_ONLY source-binding lock. It returns false only for unrelated journal source types.
- Journal header source identity is immutable once source-linked; a caller cannot detach a credit-memo journal by rewriting `source_type`/`source_reference`. Journal lines cannot move away from their source-bound parent. All source-linked header and line writes, including deletes and attempts to post by updating status, fail closed unless the customer's server-selected binding is active APP_ONLY.
- Journal-line parent lookups now use `FOR SHARE` before source resolution. This serializes line insertion/update/delete with concurrent header changes; the helper then locks the parent memo and financial-source binding for the remainder of the transaction.
- Added real local acceptance fixtures: a return request, draft return-credit memo, journal header and journal line using the receipt/return seeder's explicit `E2E_RETURN_RECEIVABLE_ACCOUNT_ID` (not an arbitrary account lookup). Assertions verify ONYX and MUTAKAMEL deny header/line writes with SQLSTATE `55000`, the persisted source/header/line projections remain unchanged, and the source binding cannot be upgraded to `FOR UPDATE NOWAIT` while an APP_ONLY journal-line write is in flight.
- Added a second local journal fixture for the reversal branch: `source_type='adjustment'` and `source_reference='customer-return-credit-memo-reversal:'||credit_memo_id`. The ONYX/MUTAKAMEL assertions now prove the reversal header and line are also unchanged after denied edits; APP_ONLY restoration and immutable-reference detachment are proved independently for that reversal entry.
- After maker/checker restores APP_ONLY, acceptance verifies legitimate header/line updates work again and a source-linked journal cannot be detached from its immutable source identity. The identity-detachment assertion runs under APP_ONLY so it proves the immutability guard itself rather than merely the external-source guard.
- The existing `p2-playwright-critical-paths.yml` local PostgreSQL 17 job already invokes `scripts/test-customer-financial-source-routing.mjs` exactly once after `seed-p2-local-playwright.mjs`; the acceptance script reads the seeder's run-scoped receivables account ID from `GITHUB_ENV`. No duplicate step remains.
- Relevant source/test commits: migration + journal guards `3bff3b2a44143ee81098c128c2ea5539ca765c2e`, concurrency-lock follow-up `c386d9cac92f4b80f881743cbdee803a2caf6b73`; source-test/fixture commits `896b216b98c19611f16aab04a2278e9d64c34f06`, `f5268ee9f0ccf83d5245048059d267b8ce671a90`, `cb0c21defb647595ff9b1519dfb4d7a879d210bc`, CRUD coverage `194e42e8ee89670c4ef89ccf844e1a4c96d0f7cc`, and direct original/reversal journal coverage `bf86305d8ba570b4c7f68ac7b8e86993e25eff6f`. API/OPS contract was updated in commit `07be63007c0f5bce231e0bb8c7a909e5b73f8029`.
- Static JavaScript parsing of the expanded P2 acceptance script succeeded (1807 lines, blob `da117bc7aaf2c01aa2560924b50dfd30d5b2818f`) after stripping its ESM imports/top-level invocation. This is only a syntax check, not a PostgreSQL run. The local execution container has no `psql` or Docker daemon and cannot resolve raw GitHub, so it did not run the migration or test.
- Exact-head CI status: older workflow run `46086630986` checked out SHA `896b216b98c19611f16aab04a2278e9d64c34f06` and ended `CANCELLED`. Later run `46086964550` checked out SHA `7572d1e378ee775100d6049d672d953d61cce0bc` and also ended `CANCELLED` after additional source-test commits superseded it. The current PR head before this checkpoint correction was `7d11f29184e79037c081db36bff1219f674e1a2f`; GitHub returned no Actions run and no combined commit statuses for that exact SHA. PostgreSQL 17, P2 and browser acceptance therefore remain NOT PROVEN; no PASS is claimed.


## Invoice/payment journals and accounting source-posting evidence — 2026-11-28

- Extended `assert_customer_app_only_customer_journal_source(uuid,text,text)` to resolve four database-owned source forms: customer invoice journal (`invoice`), customer payment journal (`payment`), original return-credit journal (`customer_return_credit_memo`), and return-credit reversal journal (`adjustment` + `customer-return-credit-memo-reversal:<memo-id>`). Invoice/payment source ownership is read from the real invoice/payment rows in the same organization; payment resolution joins through its invoice and locks both rows `FOR SHARE`.
- The generic `accounting_journal_entries` and `accounting_journal_lines` triggers now guard every source-linked customer journal header/line insert, update and delete. Source references cannot be detached; journal lines cannot be re-parented. The row/source locks serialize journal edits with Maker/Checker source cutover.
- Added a dedicated trigger on `accounting_customer_source_postings`. Its `customer_invoice`/`customer_payment` source IDs resolve to the same customer source binding; inserts require active APP_ONLY. Posting-evidence updates/deletes are rejected as append-only, including under APP_ONLY, so journal-to-source accounting evidence cannot be rewritten or removed.
- Acceptance adds actual seeded invoice/payment documents, corresponding journal header/line fixtures, and `accounting_customer_source_postings` rows. ONYX and MUTAKAMEL attempts to mutate, insert or delete invoice/payment journal rows and their posting evidence must fail SQLSTATE `55000`; before/after snapshots must remain identical. Binding-lock assertions cover invoice and payment journal-line mutations. After approved APP_ONLY return, journal header/line mutation becomes available again, but posting-evidence rows remain append-only.
- The same PostgreSQL 17 test continues to cover credit memo originals and reversal adjustments, the receipt/allocation ledger, invoice/RLS reads, Customer 360, statement fallback denial, company/branch evidence and source-sync monotonicity. The P2 workflow invokes the script once after the run-scoped fixture seeder.
- Migration source update: `98188dfeb2c0e457235d08430e15d9100ae518d4` (invoice/payment generic journals); append-only source-posting guard: `a460aedce461b4e790074430ffa19d427d229917`; exact test/fixture update: `d75e342bb31ecc4029f9bfcf2fcf3f3606e5f769`.
- Static JavaScript syntax check passed on the 1,995-line acceptance script; this is not a PostgreSQL execution. Exact-head P2 run `46087745271` and P1 run `46087745283` are QUEUED on `d75e342...`; neither is PASS. Previous run `46087648186` on `4429f...` was CANCELLED after new source/test commits superseded it. Do not transfer any prior result.


## Restrictive staff read isolation for customer-source finance records — 2026-11-28

- Added SECURITY DEFINER, boolean-only `staff_customer_app_only_customer_journal_read_allowed(uuid,text,text)`. It scopes to the current active staff organization, resolves the persisted customer from invoice/payment/credit-memo sources (including the adjustment reversal prefix), and checks/locks the exact binding `FOR SHARE`. Unlinked/missing customer documents fail closed; unrelated manual/non-customer journals retain their existing role/tenant policies.
- Added `staff_customer_app_only_journal_line_read_allowed(uuid,uuid)`, which resolves and locks the parent journal header before delegating to the customer-source guard.
- Added seven `AS RESTRICTIVE` SELECT policies to journal headers, journal lines, customer source-posting links, return-credit memo headers/items, and return-credit posting/reversal links. Existing permissive finance role and tenant policies remain in place; the restrictive source predicates can only narrow access, never widen it.
- Acceptance now proves manager visibility of four persisted source-linked journal headers (invoice, payment, original credit memo, credit memo reversal), their lines, two invoice/payment source-posting evidence rows and the return-credit memo while APP_ONLY. It asserts all seven policy catalog rows exist and are restrictive. After ONYX and MUTAKAMEL cutovers, those same finance-staff queries return zero rows; after Maker/Checker approves APP_ONLY return, the rows are visible again. Write-side guards and append-only posting evidence tests remain in the same test.
- Static JS parse passed on the 2,219-line test script; it is not PostgreSQL execution. Exact-head P2 run `46088046943` and P1 run `46088046901` were pending/queued on the code/test head `96d9cda3...` when queried. They will be superseded by the final documentation commit SHA below; no queued or prior-SHA result is PASS.

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
Fetch the exact-head workflow runs for the final PR #697 head after this checkpoint commit; require the isolated local PostgreSQL 17 financial-source script, P2 local Supabase acceptance and applicable browser gates to finish terminal SUCCESS on that same SHA. The current status is unproven; do not transfer `CANCELLED`, `QUEUED`, `SKIPPED` or prior-SHA results. P1 owns final integration and merge; P2 must not merge or deploy.

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
- Both RPCs derive profile, organization and customer from the authenticated session, require an active approved customer with `statement.read` or `invoices.read`, and fail closed for missing, suspended, ONYX or MUTAKAMEL source bindings. Customer membership is resolved by `current_customer_id()` and the active profile/organization context; no direct `customers.profile_id = current_profile_id()` predicate is imposed, because approved company members may be linked through customer membership contracts. The allocation integrity predicate treats NULL amounts as invalid in addition to zero/negative values. The source binding is locked `FOR SHARE` during both page and print reads.
- The customer selector is limited to 100 rows and returns only the current customer's receipt headers. Print data is constrained by receipt ID + derived tenant/customer and validates 2..50 distinct invoice allocations, positive amounts, customer/tenant/currency consistency, exact allocation count and exact total before rendering.
- The customer DTO excludes profile IDs, tenant IDs, internal payment IDs, notes and idempotency data. No customer-facing payment creation or mutation is exposed.
- The existing PG17 source-routing acceptance now covers customer receipt list/print success, account-code scoping, cross-tenant denial, authenticated-only SECURITY DEFINER grants, ONYX and MUTAKAMEL no-fallback, suspended-source denial, row-lock serialization, out-of-range pagination and a missing-allocation corruption fixture that is rolled back before exit.
- This work extends the RPC contract used by P1's existing customer receipt component; it adds no route, parallel screen, staff privilege or new migration file. The existing P2 workflow already executes this acceptance script after isolated local seeding.
- Exact-head acceptance for this update is pending. Previous runs and results are not transferable to the new commit. No production/hosted database mutation, remote migration, ERP request, deployment, secret, paid service or external write was performed.
- Next code action: address only a concrete failure reproduced by the exact-head P2/PostgreSQL 17 run; otherwise hand the two customer RPC contracts to P1 for exact-head UI verification and merge coordination.


## 2026-11-28 follow-up — immutable customer receipt print snapshot

- Closed a READ COMMITTED snapshot gap in `get_my_customer_payment_receipt_print_data(uuid)`: allocation total/count validation and printable allocation JSON previously came from separate SQL statements. A concurrent allocation change could make the printed detail differ from the set that passed reconciliation.
- The RPC now takes `FOR SHARE` on the saved receipt header and all existing allocation rows, then computes allocation count, distinct-invoice count, validity, amount total, and the final printable allocation DTO from one `MATERIALIZED` SQL snapshot.
- Exact acceptance additions: printed allocation details must sum to the receipt header; attempts to acquire `FOR UPDATE NOWAIT` on the receipt and allocation rows while the customer print transaction is open must fail with `55P03`.
- This is read-only hardening. It creates no receipt, payment, allocation, balance or journal write and does not change APP_ONLY/source-cutover ownership.
- Required re-run: existing financial-source PostgreSQL 17 acceptance on the new exact branch head. No PASS is claimed until the resulting workflow is terminal-success on that SHA.

- Phantom-allocation hardening: the print RPC now locks the receipt header with `FOR UPDATE`, not only `FOR SHARE`. PostgreSQL foreign-key validation uses a KEY SHARE lock on the referenced receipt; the stronger header lock makes a concurrent allocation insert/re-reference wait or fail under NOWAIT. PG17 acceptance now asserts a `FOR KEY SHARE NOWAIT` attempt is rejected while printing holds the receipt lock.


## 2026-11-28 follow-up — staff receipt print snapshot parity

- Hardened `get_staff_customer_payment_receipt_print_data(uuid)` to use the same lock order as the customer printer: APP_ONLY source binding `FOR SHARE`, receipt header `FOR UPDATE`, then existing allocation rows `FOR SHARE`. The staff RPC re-reads and locks the receipt only after obtaining the source binding lock, avoiding reverse-order source/receipt locking.
- Staff receipt allocation count, distinct-invoice count, customer/tenant/currency checks, total reconciliation, and printable DTO now come from one `MATERIALIZED` SQL snapshot. Rows outside the active tenant/customer are counted as invalid rather than silently filtered away.
- PG17 acceptance now checks staff DTO allocation totals and proves a concurrent receipt FK `FOR KEY SHARE NOWAIT` reference plus allocation mutation are rejected while the staff print transaction holds locks.
- No payment/receipt/allocation/balance/journal writes were added. Staff and customer printing remain APP_ONLY-only and no fallback to ONYX/MUTAKAMEL was introduced.

- Staff receipt-history pagination now derives the total count, ordered page and `has_more` from one pair of materialized CTEs in a single SQL statement, eliminating the previous separate-count/page snapshot race. PG17 acceptance inspects the installed function definition for both scoped and page materialization.

## 2026-11-28 — PostgreSQL 17 receipt fixture correction

- Exact P2 workflow run `46079322825` checked out head `aa9a5b0631ea47d4bd9da77a6a9615e2aaa86745`. The complete local migration reset succeeded on PostgreSQL 17, confirming the earlier parser failure was no longer present.
- The next source-routing acceptance step failed at the fixture call to `record_customer_payment_allocation` with `22023: a payment receipt requires between 2 and 50 invoice allocations`. The test passed a JSON string as a `$1::jsonb` parameter even though the payment RPC contract requires a JSON array.
- Corrected the disposable test fixture to construct exactly two allocation objects with PostgreSQL `jsonb_build_array/jsonb_build_object`, while keeping invoice UUIDs parameterized. No business rule, production RPC or monetary validation was weakened.
- Public read-only Storefront Chromium smoke passed on the same SHA. Authenticated local E2E stopped at the failed finance test; remaining dependent steps were skipped. Exact-head P1 admin verification was queued when inspected.
- No production/hosted database, remote migration, ERP call, deployment, paid service or secret was used.
- Required next gate: rerun the isolated PostgreSQL 17 migration + source-routing test and all relevant P2/P1 exact-head checks on the new commit. Do not transfer the old run's partial results to it.

## 2026-11-28 — New customer source binding trigger acceptance

- Added a disposable customer-create regression inside the existing financial-source PostgreSQL 17 acceptance. A newly inserted approved customer with no linked profile must receive exactly one `APP_ONLY` / `active` / revision `1` binding from the existing `AFTER INSERT` trigger.
- The test also proves no ERP external reference, source watermark, sync timestamp, evidence hash, verification timestamp, invoice or payment receipt is synthesized for the new customer.
- The new-customer and source-binding rows are created inside a transaction intentionally rolled back after assertions; the test verifies neither row remains afterward.
- No migration, production RPC, customer business data, account balance or ledger write was changed. Exact-head PostgreSQL 17 acceptance remains required.

## 2026-11-28 — External source sync watermark is now a database invariant

- Tightened `customer_financial_source_external_evidence_ck`: ONYX/MUTAKAMEL bindings must now carry `last_synced_at` in addition to exact evidence SHA-256, `source_as_of` and `verified_at`. APP_ONLY bindings remain valid with all provider sync/evidence fields null.
- Both legitimate server paths already satisfy the invariant: Maker/Checker cutover records `last_synced_at` from matched reconciliation evidence, and later provider sync advances it in the same transaction as evidence insertion.
- Expanded the PostgreSQL 17 acceptance to attempt a cutover-shaped update with valid external account reference, source watermark, evidence hash and verification time but a null `last_synced_at`. It must fail with `23514`; the test then re-reads and proves the APP_ONLY binding, revision and every source field remained unchanged.
- This is a database-level safety invariant, not a UI guard. The exact updated migration/test SHA must pass local PostgreSQL 17 before acceptance. No live ERP, production data or account balances were changed.

## 2026-11-28 — Future ERP sync watermark rejection proof

- Extended the existing provider sync acceptance after a successful first write/replay: a service-role sync carrying `source_as_of = statement_timestamp() + 1 minute` must fail with SQLSTATE `22023` before writing any evidence.
- The test snapshots the current binding watermark/sync time/evidence hash and the sync-evidence row count before the rejected request, then asserts every binding field is unchanged and no evidence row was appended.
- This proves the server-side future-date guard is operational and not merely present in SQL source. Historical watermark monotonicity, exact replay and wrong external-account denial remain in the same flow.

## 2026-11-28 — Direct invoice RLS reads serialize with financial-source cutover

- Replaced both definitions of `customer_app_only_invoice_read_allowed(uuid,uuid)` and both definitions of `staff_customer_app_only_financial_rows_read_allowed(uuid,uuid)` in the migration. These restrictive-RLS predicates are now `VOLATILE` SECURITY DEFINER PL/pgSQL functions that acquire `FOR SHARE` on the exact `(organization_id,customer_id)` source binding before returning the APP_ONLY boolean.
- The source change review RPC already locks the same binding `FOR UPDATE` before approving and increments its revision/source in one transaction. Direct customer and finance-staff invoice and invoice-line RLS reads now hold their shared binding lock until the caller's transaction ends, so an approved cutover must wait for any in-flight APP_ONLY query to finish; a read arriving after cutover sees the external source and is denied.
- Added real PostgreSQL acceptance for both customer and finance-staff direct invoice + invoice-line RLS paths. While each read transaction is open, a separate service-role connection's `FOR UPDATE NOWAIT` against the same binding must fail with `55P03`. Existing external-source RLS denial and no-fallback tests remain.
- This closes the server-side race, not only the P1 client revalidation race. The exact updated migration + acceptance must pass isolated PostgreSQL 17 before this change is accepted.

## 2026-11-28 — Finance receipt RLS source lock

- Replaced both migration definitions of `customer_app_only_receipt_read_allowed(uuid,uuid)` with a `VOLATILE` SECURITY DEFINER predicate that validates the active finance organization/capability, locks the exact source binding `FOR SHARE`, and returns true only for an active APP_ONLY source.
- Direct reads of `customer_payment_receipts` therefore use the same source-binding lock as invoice RLS, customer/staff receipt print, statement and Customer 360. The Maker/Checker cutover's `FOR UPDATE` cannot pass an in-flight direct receipt-history read.
- Added a PostgreSQL 17 race assertion: an accountant directly selects the real APP_ONLY receipt row inside an open transaction; a second service-role connection attempting `FOR UPDATE NOWAIT` on the source binding must fail with `55P03`.
- Existing authenticated-customer direct receipt access remains denied by the existing policy/grants; customer self-service uses the customer-scoped list/print RPCs which already lock the source binding.

## 2026-11-28 — Repair of duplicated and truncated customer finance migration

- Reconstructed the migration around its first transaction boundary. Removed the appended duplicate migration body that caused an unterminated evidence-hash CHECK and a second COMMIT.
- Preserved the new external-source invariant requiring evidence SHA-256, source watermark, last sync time and verification time. The resulting file contains one transaction, one bindings table, one sync-evidence table and one provider sync writer.
- This is a source repair. PostgreSQL 17 reset and exact-head customer financial source acceptance are still required; no production migration was run.


## 2026-11-28 — ERP customer identity constrained by company and branch

- Customer financial source bindings persist the ERP customer account, company and branch as one identity tuple. APP_ONLY requires all external identifiers to be NULL; ONYX/MUTAKAMEL requires all three safe references.
- Source-change requests validate, fingerprint and audit company/branch with the account reference. Reconciliation evidence stores the exact request scope; Maker/Checker approval verifies the evidence scope before activating the new source.
- A tenant/provider/company/branch/account unique index prevents one ERP customer identity from being assigned to multiple customers within the same ERP scope.
- The service-role sync writer requires company and branch, verifies all identifiers against the active binding and records them in sync evidence. Replay comparisons include exact scope; the prior unscoped sync writer signature is removed.
- Only the finance-capability-gated staff resolver returns company/branch. Customer source resolution continues to omit every ERP identifier.
- PG17 acceptance includes APP_ONLY null fields, reconciliation/sync identity persistence, wrong company/branch rejection, identity unique index, and customer/staff separation. Exact-head CI is mandatory; no PASS is claimed in this commit.
- No production DB write, live ERP request, accounting posting, inventory write, deployment or secret update was performed.

## 2026-11-28 — Internal payment ledger writes now fail closed outside APP_ONLY

- Added one server-side source assertion that locks the exact `(organization_id,customer_id)` binding `FOR SHARE` and permits internal payment-ledger mutation only while its source is `APP_ONLY` and `active`.
- Installed `BEFORE INSERT OR UPDATE OR DELETE` triggers on both `customer_payments` and `customer_payment_receipts`, so legacy/new RPCs and direct table DML cannot write, alter or remove APP_ONLY ledger records after an ONYX/MUTAKAMEL cutover. The trigger lock is held until transaction end and serializes against the source review RPC's `FOR UPDATE` lock.
- Wrapped the existing idempotent single-payment and multi-invoice receipt functions without rebuilding their balance checks, audit, invoice settlement locks or allocation logic. The wrappers check/lock the server-selected source before calling the original implementation; this also prevents an old APP_ONLY idempotency key from replaying a receipt/payment result once the customer is external.
- Added exact acceptance cases for ONYX: new single payment, prior single-payment replay, prior multi-invoice receipt replay, and direct owner INSERTs to both payment/receipt tables must all fail with `55000`; before/after row counts and amounts must be identical. MUTAKAMEL independently rejects internal payment writes.
- After Maker/Checker returns the account to APP_ONLY, the test proves old idempotent replays work again and new single-payment plus two-invoice receipt writes persist, with one receipt header and two actual allocation rows. Existing app-ledger equality is asserted before these post-return fixtures are added.
- No payment, receipt, balance or journal was written to production. All writes in acceptance are disposable local PostgreSQL 17 fixtures.

## 2026-11-28 — Staff receipt-page RPC now source-locks its complete result scope

- Changed `get_customer_payment_receipt_print_options(integer,integer)` from `STABLE` to `VOLATILE` because it now acquires transaction-held row locks. Before its materialized count/page query, it takes `FOR SHARE OF b` on every active APP_ONLY customer binding in the organization that has at least one saved receipt, in deterministic customer-ID order.
- The reader is `SECURITY DEFINER` and bypasses receipt RLS. This lock therefore belongs inside the RPC, not only in table policies. It serializes the entire cross-customer receipt page against Maker/Checker `FOR UPDATE` source cutovers; a page that arrives after cutover sees the current external source and excludes that customer's APP_ONLY receipts.
- Added PostgreSQL acceptance that fetches the actual accountant receipt page inside an open transaction, confirms the APP_ONLY fixture receipt is present, then proves an independent service-role `FOR UPDATE NOWAIT` on its source binding fails with `55P03` until the page transaction ends.
- Customer self-service receipt listing already locks its single authenticated customer binding; staff/customer receipt print DTOs and invoice/statement readers retain their own source locks.

## 2026-11-28 — Internal invoice and return-credit documents follow the customer source

- Added database triggers for `customer_invoices`, `customer_invoice_items`, `customer_return_credit_memos`, `customer_return_credit_memo_items`, `accounting_return_credit_memo_postings` and `accounting_return_credit_memo_reversals`. Every insert/update/delete resolves the owning customer and takes the same APP_ONLY source-binding `FOR SHARE` lock used by payments.
- Order creation and order preparation remain separate commerce operations. The guard acts at invoice issuance: `issue_invoice_for_confirmed_order()` cannot create an internal APP_ONLY invoice for an ONYX/MUTAKAMEL customer; its order-status transaction fails closed rather than silently posting into the wrong ledger.
- Return credit-memo preparation, posting, voiding and reversal all touch the guarded credit memo/document tables; if the source is external, the transaction cannot commit an internal credit document or its linked posting/reversal rows.
- PostgreSQL acceptance attempts direct internal invoice insert/update and credit-memo creation after ONYX cutover and requires `55000`. After approved APP_ONLY return, a real internal invoice header insert is allowed inside a rollback-only order transaction; neither fixture remains afterward.
- The existing payment-ledger guards continue to protect single/multi receipts, idempotent replay and direct DML. The exact updated migration and full local PostgreSQL 17 sequence must pass before this batch is accepted.

- Added an additional external-source invoice-line mutation regression: an attempted `UPDATE` against the existing APP_ONLY invoice item must fail with `55000`, and a before/after projection of its description, quantity, price and line total must remain identical.

## 2026-11-28 — Bounded finance source-change history reader

- Added `get_customer_financial_source_change_history(uuid,integer)` as the only read path for source-change requests. It requires either `finance.customer_source.request` or `finance.customer_source.approve`, resolves the actor's active organization, verifies the requested customer is approved in that organization, and bounds the page size to 1–20.
- The DTO returns request ID, current/target source modes, status, reason, reviewer reason, binding revision, request/review timestamps, reconciliation result/date/currency codes and record counts. It intentionally omits raw ERP account/company/branch references, evidence hashes and currency balances.
- Direct table SELECT remains revoked. Cross-tenant customers and ordinary customers cannot read internal change-request history.
- PostgreSQL 17 acceptance verifies maker visibility immediately after request creation, tenant/customer denial, bounded limits, and approver visibility of the final approved + matched audit state. No production operation or deployment was performed.
- Exact-head migration/test execution remains pending in the isolated PostgreSQL 17 workflow; no runtime PASS is claimed.


## 2026-11-28 — Source-history response contract acceptance strengthened

- The bounded finance history RPC was added in migration `20261128030000_customer_financial_source_change_history.sql` (blob `9762f1e15291705e7edfed9968223a3a40ab0f66`). API/OPS contract row was added in commit `0cf7e08bc9af29d891c6ddf8206f90009fa8b473`.
- Existing acceptance already proves the request maker can read a pending request, customer and cross-tenant reads are denied, limits above 20 fail, and the distinct approver can read the approved record with matched reconciliation metadata.
- Additional acceptance commit `31071b0dfb955dcdc58b4aaf77bccc4e920c1fd4` constrains the returned record keys to the explicit staff-safe DTO allowlist, forbids raw ERP account/company/branch references, evidence hashes and per-currency balance values, verifies one-row pagination preserves the total, and asserts authenticated-only SECURITY DEFINER execute grants.
- This is read-only audit visibility; it creates no financial or inventory mutation and does not expose raw provider identity or reconciliation balances. The migration and all assertions still require exact-head PostgreSQL 17 execution; no PASS is carried from earlier SHAs.
- Last observed PR head before this checkpoint write: `31071b0dfb955dcdc58b4aaf77bccc4e920c1fd4`. This checkpoint commit will supersede it and becomes the new exact acceptance target. Keep PR #697 Draft until PostgreSQL 17, P2 and P1 workflows finish successfully on the final SHA.


## 2026-11-28 — Financial source history query index

- Added `customer_financial_source_change_history_page_idx` to the existing customer financial source-routing migration, ordered by `(organization_id, customer_id, requested_at DESC, id DESC)`. The partial unique pending-request index remains dedicated to enforcing the one-pending-change invariant and is not reused for full history retrieval.
- The PostgreSQL acceptance now checks through `pg_catalog.pg_index` that the history index exists, is valid, and exposes the exact tenant/customer newest-first ordering required by the reader.
- Migration commit: `e0142a005d77dd79cf047947a7056c18375ca674`; test commit: `5de82604c9f94329600fcc23b7897b9dfac63c3e`. This is a read-path performance index only; no source binding, reconciliation, payment, receipt, invoice, journal or inventory row is modified.
- The previous exact-head P1/P2 jobs were attached to SHA `9ed8e66509fb41c677b95ff443c0cfb4c7dd6583`; their results do not transfer to this updated SHA. Require new exact-head PG17/P2 and P1 terminal-success evidence before acceptance. No PG17 PASS is claimed.


## 2026-11-28 — Keyset-paginated finance source history

- Extended the source-history migration with `get_customer_financial_source_change_history_page(uuid,integer,timestamptz,uuid)`. It retains the existing finance capability, active-profile and approved same-tenant customer checks, plus strict pairing of cursor timestamp/request ID.
- The page reader fetches at most `p_limit + 1` rows using the indexed tuple predicate `(requested_at,id) < (cursor_requested_at,cursor_request_id)`, ordered newest first. It returns the documented safe DTO, total count, `has_more`, and the last visible row's composite cursor. No OFFSET scan and no repeated timestamp ambiguity.
- Preserved `get_customer_financial_source_change_history(uuid,integer)` as the existing first-page compatibility wrapper. Authenticated-only grants remain; anonymous execute is revoked on both functions.
- Test commit `fdac0dd430cf0d0db9c616b0f7fc0272a0f40616` now proves first/second-page continuity, no duplicate request IDs, missing-cursor-pair rejection, old-wrapper compatibility, tenant/customer denial, and both functions' grants/SECURITY DEFINER flags. The composite history index is checked valid in `pg_catalog.pg_index`.
- API/OPS contract updated in commit `671f1c6e8c28882a954da1d34c9b9d7e78e10725`. Exact-head PostgreSQL 17 and P1/P2 workflows are required on the next SHA; no runtime PASS is claimed.


## 2026-11-28 — Capability-aware maker/checker review controls

- The paged source-change history now returns a per-row `can_review` decision only when the current authenticated actor has `finance.customer_source.approve`, the request is still pending, and the actor is not the original requester.
- The source-change history test proves a maker cannot review their own request, an independent accountant can review a request only after matched evidence moves it to `pending_approval`, and an already approved request is no longer reviewable.
- This boolean is an affordance for the UI only. `review_customer_financial_source_change` continues to re-check capability, maker/checker separation, request state, binding revision and fresh matched evidence transactionally before approval or rejection.


## 2026-11-28 — Capability-aware DTO test and contract synchronization

- Follow-up commit `06f59e60695c1ba3f255e1f50152663c7cb70025` added a read-only `can_review` boolean to each source-history row. It is true only for an authenticated approval-capable actor when the request remains pending and was created by a different maker; the transactional review RPC remains the only authority for approval/rejection.
- Updated the strict history DTO allowlist and Boolean-type assertion in test commit `24a253e5bea64487ec7d2a127043333161c5a959`, so the privacy test recognizes the new affordance while continuing to reject raw ERP identifiers, hashes and balance values.
- API/OPS wording was synchronized in commit `c39cc7d15a06c6365b244d4ace9c747a4909b4a0`; the affordance is explicitly documented as UI guidance, not authorization.
- Exact-head P1/P2 runs created before this follow-up do not prove the current source/test state. Require terminal-success results tied to the final branch SHA. No migration was applied to production, no ERP provider was called, and no financial or inventory business row was changed by this read-only work.


## 2026-11-28 — PostgreSQL append-only protection for source evidence

- Closed a database-level evidence-integrity gap: both `customer_financial_source_reconciliation_evidence` and `customer_financial_source_sync_evidence` now have `BEFORE UPDATE OR DELETE` triggers. Reconciliation and provider-sync facts may only be added through their existing narrow RPCs; a correction must be represented by a new evidence row, never by rewriting/deleting the accepted row.
- The shared trigger raises SQLSTATE `55000` with an explicit append-only message. Direct table DML remains revoked from `PUBLIC`, `anon`, `authenticated` and `service_role`; the trigger additionally protects against accidental owner-level UPDATE/DELETE.
- Extended the PostgreSQL acceptance test to attempt UPDATE and DELETE against both evidence tables, then compare the complete selected evidence projection before/after to prove a rejected mutation left the source evidence unchanged.
- Synchronized the API/OPS contract. Exact-head PostgreSQL 17/P2/P1 execution is still required for the new SHA; no runtime PASS is claimed. No production database, live ERP endpoint, customer balance, payment, inventory or journal was modified.


## 2026-11-28 — Immutable source-change request identity and intent

- Added a PostgreSQL trigger on `customer_financial_source_change_requests`: after creation, the request ID, tenant/customer, current and target source modes, external target identity, expected binding revision, idempotency key/fingerprint, reason, maker and request timestamp cannot be rewritten.
- The same guard rejects request deletion with SQLSTATE `55000`. Workflow result fields (status, latest evidence, reviewer and review timestamps) remain mutable for the existing reconciliation/review RPCs; no new direct DML grant was added.
- Acceptance attempts a target-mode/reason rewrite and a DELETE against the real isolated request, expects both to fail, then compares the complete request identity and current workflow projection before/after.
- API/OPS contract synchronized. Exact-head PG17/P2/P1 runs must execute on the new SHA; no runtime PASS is claimed. No hosted database, live ERP, payment, balance, inventory or journal write occurred.


## 2026-11-28 — Customer ERP statement routing over completed P4 scopes

- Added `customer_financial_source_statement_scopes`, keyed by organization/customer/currency and bound to the exact approved source identity, P2 binding revision, and server-generated P4 `scope_key`.
- Scope registration is automatic from two order-independent server events: P2 provider-sync evidence and P4 completion of a `customer_statement_entries` checkpoint. It registers a currency only when the provider, company, branch, currency, full-completion watermark and binding identity match. The table has RLS enabled/forced and no direct grants.
- `get_customer_account_statement()` now returns the original internal ledger shape plus `source_mode=APP_ONLY` for internal accounts. For ONYX/MUTAKAMEL it returns an independent `external_statement.currencies[]` ledger from latest accepted P4 outcomes; it does not convert ERP entries into internal invoices/payments or post any accounting/stock records.
- External reads require a current binding, recent source evidence, one complete scope per evidenced currency, an exact matching P4 checkpoint, a final completed page receipt, no active cursor/pending watermark, and no rejected/conflicted/invalid customer rows. Each currency is totaled independently; the full-ledger running balance is computed before limiting display detail to 500 rows per currency.
- No customer, company, branch or raw ERP identifiers are exposed in the customer DTO. The adapter fails closed if P4 staging is absent, stale, partial, conflicted or not yet mapped; it never falls back to APP_ONLY.
- Deployment order is safe either way: the P2 migration can install without the P4 schema, and its conditional trigger is attached when the P4 checkpoint table exists. Exact-head PostgreSQL 17 runtime acceptance is still pending; no production migration or data write was performed.


### External statement precondition regression test

- After a fresh ONYX sync watermark is recorded, isolated PostgreSQL 17 acceptance calls the customer statement RPC again. It must report the missing P4 staging prerequisite when those tables are absent, or reject an unmapped currency scope when staging exists but has not completed. Both paths are SQLSTATE 55000 and prohibit APP_ONLY fallback.
- After an approved return cutover, the final customer statement response must explicitly identify `source_mode=APP_ONLY` while preserving the pre-cutover ledger summary.
- Removed a redundant assignment to an untyped PL/pgSQL `record` target; an empty dynamic SELECT INTO naturally nulls the record and yields row count zero.


## 2026-11-28 — MUTAKAMEL customer statement source-isolation assertion

- Extended the existing end-to-end APP_ONLY → ONYX → MUTAKAMEL → APP_ONLY maker/checker acceptance path.
- Immediately after the authorized MUTAKAMEL cutover, the customer resolver must report `source_mode=MUTAKAMEL` and `can_read_app_ledger=false`.
- The customer statement RPC must reject with SQLSTATE `55000` and the explicit `app ledger fallback is prohibited` guard when MUTAKAMEL's own source-sync evidence or the P4 statement staging prerequisite is absent. This proves the resolver cannot alias an external customer statement to APP_ONLY merely because no external ledger has been staged.
- This is an isolated PostgreSQL acceptance assertion; it does not create synthetic ERP rows or mutate production, customer balances, payments, invoices, journals or inventory.
- New exact-head P1/P2 and PostgreSQL 17 acceptance is still required. Previous workflow results do not transfer to the updated SHA.


## 2026-11-28 — Exact checkpoint/scope version binding for external statements

- Tightened `get_customer_account_statement()`: every registered customer/currency scope must match the current P4 checkpoint version **exactly**, and its captured `completed_watermark` must match the current checkpoint watermark exactly. A checkpoint newer than its customer-scope registration is no longer accepted based on `version >= scope_version`.
- This prevents a lagging or stale currency-scope registration from being used against a newer P4 page receipt or staged ledger. The scope refresh trigger must first record the exact completed checkpoint; otherwise the customer statement fails closed with SQLSTATE `55000`.
- Added PostgreSQL acceptance introspection on the installed statement reader definition for both exact comparisons. Existing runtime checks still prove missing/unmapped P4 staging rejects rather than falling back to APP_ONLY. A full positive P4→P2→customer statement acceptance still requires both migrations and source rows in the same isolated PG17 environment.
- Changed paths: `supabase/migrations/20261128043000_customer_erp_statement_staging_reader.sql`, `scripts/test-customer-financial-source-routing.mjs`, this checkpoint. No APP_ONLY invoices/payments, customer balances, journals, inventory rows, production database or live ERP were touched.
- New exact-head PG17/P1/P2 checks are required; prior SHA results are not transferred.


### Currency-isolated ERP statement acceptance

- The P2 reader now independently verifies that every accepted customer statement row's canonical `currency_code` equals the authenticated customer's exact checkpoint currency scope before any totals or balances are computed. A mismatch blocks the statement with the existing fail-closed SQLSTATE 55000 path.
- P2 PostgreSQL 17 acceptance inspects the installed statement function definition and asserts the database-side currency equality guard is present; P4 additionally rejects a financial record before staging when its currency differs from the requested sync scope.


### Unattributable rejected statement rows

- The P2 customer statement reader now treats a rejected/conflicted row with a missing, blank, or malformed external customer identity as a scope-level integrity failure. It refuses to publish any customer's balance from that currency scope until the provider data is corrected and a complete clean snapshot is committed.
- This prevents a malformed provider row from being silently excluded from one customer's statement when the row cannot be reliably attributed to any customer.


## 2026-11-28 — Positive PostgreSQL 17 customer ERP statement acceptance

- The isolated P2 PostgreSQL acceptance now creates a real two-currency P4 staging fixture and executes the authenticated customer statement RPC. YER invoice 100.00 less payment 20.00 yields 80.00; USD opening balance remains 5.50 in a separate currency ledger.
- The test proves the external DTO contains no internal invoice/payment rows, raw ERP customer/company/branch references, or P4 scope keys.
- It then injects a USD row into the YER scope and confirms SQLSTATE 55000, writes a newer corrected YER version of that same provider record, and confirms the recovered YER closing balance is 81.00. A final rejected row with no customer identity blocks publication of the statement instead of silently omitting an unassignable transaction.
- If the P4 migration is not part of the P2 PR branch, the test creates minimal temporary staging tables inside its isolated PG17 database and drops them after the test. If full P4 tables exist, the same records run against the real schema without replacing it.
- No production database, live provider credentials, payment, invoice, inventory, or journal was touched.

- The end-to-end PG17 fixture now writes page receipt disposition counters that match the exact `created`, `updated`, `unchanged`, `rejected` and `conflicted` outcomes instead of folding updates into the created count.
