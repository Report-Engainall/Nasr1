## Final P2 test result and current Core watch — 2026-10-30
- Current main docs cursor before this update: `31d1bef20a2dfe909e92078c94de8c07545d4348`; code SHA: `b52271629f054f5d9750e2d4dbf247e22c90f8c7`.
- P2 run [41017608501 FAILURE](https://github.com/Report-Engainall/Nasr1/actions/runs/41017608501): auth gate/public smoke SUCCESS; local order persistence/cross-tenant denial, returns/credit memo, Onyx XLSX export SUCCESS. Mobile drawer focus assertion failed at `e2e/finance-task-print.spec.ts:69`; finance/task print assertions were not reached; hosted customer/order/tenant SKIPPED.
- Core [41017608436 FAILURE](https://github.com/Report-Engainall/Nasr1/actions/runs/41017608436) on code SHA b522716 failed in P2 PG17 receipt-race barrier at script line 3105 after Unit tests completed. Both RPC results were successful after gate release; P2 must fix connection readiness/sample timing without weakening concurrency/idempotency assertions.
- Core [41018275584](https://github.com/Report-Engainall/Nasr1/actions/runs/41018275584) on docs SHA 47865baa had progressed through PG17 backup/restore and other DB acceptance; at last poll Lint was in progress. Core [41018520349](https://github.com/Report-Engainall/Nasr1/actions/runs/41018520349) on docs SHA 31d1bef was in Unit tests. Both are independent SHA runs; poll each recorded run, never transfer PASS.
- P1 owns the production mobile drawer first-focus correction. P2 owns the concurrency test harness and backend DTO/persistence/AI/privacy/health/RBAC. P3 does not edit either reserved file area.
- exact_next_command: P1 repair focus and prove 360px keyboard behavior; P2 fix PG17 race barrier and deliver tenant aggregate; poll Core runs before the next integration.
 
---
 
## P2 run 41017608501 final result — 2026-10-30 — exact SHA b52271629f054f5d9750e2d4dbf247e22c90f8c7
- [P2 Playwright Critical Paths 41017608501 FAILURE](https://github.com/Report-Engainall/Nasr1/actions/runs/41017608501). Authenticated infrastructure and public UI smoke passed; local PostgreSQL/Supabase path passed order persistence and cross-tenant denial, returns/credit memo, and audited Onyx XLSX export.
- The Chromium test failed at `e2e/finance-task-print.spec.ts:69`: after the admin drawer opened and passed label/expanded/visibility checks, the first navigation button remained inactive; `toBeFocused()` timed out at 20s. The failure occurred in the helper invoked by the finance print test. The invoice/statement/task print-specific assertions were not reached and must not be marked pass or fail.
- Hosted customer/order/tenant job was SKIPPED. P1 owns the production focus fix in `src/components/AghbariApp.tsx`; P2 must retain the keyboard focus/Escape/restore assertions.
- The same source SHA's Core 41017608436 failed earlier in the P2-owned PG17 receipt-race harness at scripts/test-database-migrations.mjs:3105; Unit tests passed. Current Core on previous docs SHA 47865 was [41018275584 IN_PROGRESS](https://github.com/Report-Engainall/Nasr1/actions/runs/41018275584) at last observation.
- exact_next_command: P1 fix first nav focus and deliver patch; P2 repair race test setup/readiness without weakening lock/idempotency proof; then rerun targeted P2 and Core at exact result SHA.
 
---
 
## P3 component delivery and P2 PG17 evidence — 2026-10-30 — main b52271629f054f5d9750e2d4dbf247e22c90f8c7
- P3 UI batch integrated on main: `32c2fe451bb783af2a76388e9811ffb52ec28e7f`; accessible labels/locale-aware assertions `8ccc68aaf8ea65718b35c1fc9f5b23c54a6988ce`; cashflow horizon test `b52271629f054f5d9750e2d4dbf247e22c90f8c7`. Exports: LiquiditySummary, CashflowForecastCard, DeadStockCard, ReplenishmentCard and shared state/evidence components. Contract: docs/execution/contracts/P3_INTELLIGENCE_P1_COMPONENT_CONTRACT.md.
- Component tests reached/passed Core Unit tests on exact SHA b522716; overall Core [41017608436 FAILURE](https://github.com/Report-Engainall/Nasr1/actions/runs/41017608436) was later blocked by PG17 database acceptance at scripts/test-database-migrations.mjs:3105.
- Root cause: receipt-race harness did not observe both active lock waiters simultaneously; ci-po-receive-a waited on warehouse advisory lock; ci-po-receive-b remained in set_config/transactionid wait; after gate release both RPC outcomes were successful. P2 must ensure connections are initialized/ready before invoking RPCs and preserve real concurrent two-session lock/idempotency checks; P3 does not edit scripts/**.
- P2 [41017608501](https://github.com/Report-Engainall/Nasr1/actions/runs/41017608501) on b522716: authenticated infra/public smoke SUCCESS; local Supabase/Chromium passed order persistence/cross-tenant denial, returns/credit memo and Onyx XLSX export; finance document/task print IN_PROGRESS at last observation; hosted customer/order/tenant SKIPPED.
- Prior P2 mobile focus defect [41014864616](https://github.com/Report-Engainall/Nasr1/actions/runs/41014864616) on 68fccf remains P1 UI responsibility in AghbariApp.tsx: first mobile nav button not focused after drawer opens. P2 retains keyboard assertions.
- P1 workspace/route mounting remains pending; P2 tenant-safe aggregate, decision outcome persistence, AI quota/privacy, health probes and RBAC server DTO remain pending.
- Matrix is still the sole 143-ID / 18-DLV / 16-REF acceptance source; all 16 REF statuses remain P3_IMPLEMENTED / CI_PENDING / P1_P2_PENDING; no DLV rollup closed; release NO-GO.
- exact_next_command: P2 repairs PG17 receipt-race readiness/barrier and polls existing P2 run; P1 fixes mobile focus and mounts against actual DTO; P2 delivers aggregate backend; P3 integrates only evidence-backed owner batches.

---

## P3 evidence reconciliation — 2026-10-30 — exact-head P2 focus failure
- Main base read before this update: e99c56b6c509a8a7d2e87cd207bcc228c0d5a4c5; P2 E2E code SHA: 68fccfaff3192f934661a2bdc8d48aed155b0457.
- Exact Core PASS: [41014864610](https://github.com/Report-Engainall/Nasr1/actions/runs/41014864610) on 68fccf; docs-head Core PASS: [41016302836](https://github.com/Report-Engainall/Nasr1/actions/runs/41016302836) on e99c56b. Cleanup PASS: [41014864572](https://github.com/Report-Engainall/Nasr1/actions/runs/41014864572) on 68fccf and [41016302630](https://github.com/Report-Engainall/Nasr1/actions/runs/41016302630) on e99c56b.
- P2 [41014864616 FAILURE](https://github.com/Report-Engainall/Nasr1/actions/runs/41014864616) on 68fccf, failed job 123929100573. Failure: expect(firstItem).toBeFocused() at e2e/finance-task-print.spec.ts:69. ID locator, aria-label, expanded state and CSS visibility gates now pass; drawer is open but first nav item remains inactive. Browser stops before finance/task-print assertions. This is actual focus/accessibility failure, not proof that finance print or tenant isolation failed.
- P2 run auth gate/public smoke, local PostgreSQL 17 startup/migrations, endpoint guard, atomic price/expense/receipt, order persistence/cross-tenant denial, returns/credit memo and Onyx XLSX stages passed. Hosted tenant/customer-manager/device-session suites were skipped.
- Screenshot/error context/trace retained in artifact p2-local-authenticated-e2e-41014864616-68fccfaff3192f934661a2bdc8d48aed155b0457. AghbariApp.tsx has a useEffect focus call but actual browser does not retain focus; P1 owns production fix, P2 keeps and reruns test unchanged.
- P3 component barrel still exports only ActionCard/EvidencePassport; liquidity/forecast/dead-stock/replenishment presentation APIs and focused tests remain P3 work. P1 intelligence route and P2 aggregate/outcome/AI/health/RBAC backend remain open.
- Matrix remains 16 REF rows, all P3_IMPLEMENTED / CI_PENDING / P1_P2_PENDING; no DLV roll-up closed; release NO-GO.
- exact_next_command: P1 repairs first-item focus; P2 reruns unchanged mobile focus/finance/task-print Playwright suite; P3 implements tests for missing intelligence display components and continues to reconcile the first P2 backend patch.

---

## P3 cursor reconciliation — 2026-10-30 — P2 navigation correction observed on main
- Observed remote main: `68fccfaff3192f934661a2bdc8d48aed155b0457`; comparison from `643d2821ab0483acc12ef21abc453a0c745f2865` is exactly 2 commits ahead / 0 behind. Only application/test path changed is P2-owned `e2e/finance-task-print.spec.ts`; intervening commit `8f6e5c8` updates governance docs.
- P2 run [41014174609 FAILURE](https://github.com/Report-Engainall/Nasr1/actions/runs/41014174609) on 643d282. Failed job `123927039686` hit the hidden sidebar role locator in the mobile-nav helper before finance/task-print assertions. Auth infra, public smoke, earlier local Supabase order/tenant/returns/Onyx stages passed; hosted tenant job SKIPPED.
- P2 fix [68fccfaff3192f934661a2bdc8d48aed155b0457](https://github.com/Report-Engainall/Nasr1/commit/68fccfaff3192f934661a2bdc8d48aed155b0457) is already integrated into main. It changes only the P2 test path to `#admin-sidebar` and asserts the Arabic aria-label while keeping navigation checks. Its exact-head test remains NOT EVIDENCED.
- Last Core/cleanup PASS remain on 643d282 only: [41014174530](https://github.com/Report-Engainall/Nasr1/actions/runs/41014174530), [41014174522](https://github.com/Report-Engainall/Nasr1/actions/runs/41014174522). Do not carry PASS to 68fccf.
- P3 engines remain present; P1 UI composition and P2 tenant-safe aggregate/persistence/AI/health/RBAC integrations remain pending. P3-owned UI component gap: barrel currently exports ActionCard and EvidencePassport only; liquidity/forecast/dead-stock/replenishment views and contracts + focused tests remain to implement before claiming component contract parity.
- Matrix refreshed in the same cursor update: all 16 REF evidence cells now record run 41014174609 failure on 643d282, P2 correction on 68fccf, and current-head rerun NOT EVIDENCED; statuses remain `P3_IMPLEMENTED / CI_PENDING / P1_P2_PENDING`. No DLV roll-up closed.
- Release remains NO-GO: hosted tenant path, target Onyx, official WhatsApp, live AI, production operations and owner sign-off are unproven.
- `exact_next_command`: implement/test P3 liquidity/forecast/dead-stock/replenishment presentation components; in parallel P2 runs focused/current-head P2 checks and ships the first server aggregate slice; P1 adds the workspace unavailable state with no synthetic data.
 
---
 
## P3 integration record — 2026-10-30 — exact-head intelligence hardening and Core acceptance
- Main/base/result SHA: `643d2821ab0483acc12ef21abc453a0c745f2865` (CAS fast-forward from `bd19b04e41e1d65e0f4d7427fb086f74bf457378`; remote main re-read confirmed).
- Code deltas:
  - `bd19b04e41e1d65e0f4d7427fb086f74bf457378`: fixed `learning-loop.test.ts` ReferenceError by using defined `ev`; scenario baseline strings now require non-empty numeric syntax; outcome learning withholds overflow; free-AI route rejects invalid cooldown dates and sorts candidate provider/model deterministically.
  - `643d2821ab0483acc12ef21abc453a0c745f2865`: extended `rbac-contract.ts` with an evidence-backed canonical role × capability × resource × operation × tenant-scope × sensitivity view; added mapping-invalid/conflict coverage; updated P2 aggregate contract with the exact canonical catalog DTO. This is display/inspection only; DB/RLS/RPC remains sole authorization.
- Exact-head Core: [41014174530 SUCCESS](https://github.com/Report-Engainall/Nasr1/actions/runs/41014174530) on SHA `643d2821ab0483acc12ef21abc453a0c745f2865`. Unit tests, PostgreSQL 17, exact-head RPC inventory, finance/inventory/import/tenant analytics, backup/restore, lint, build, preview/dev smoke and Chromium price visibility all passed.
- Exact-head one-main cleanup: [41014174522 SUCCESS](https://github.com/Report-Engainall/Nasr1/actions/runs/41014174522) same SHA.
- Exact-head P2: [41014174609 IN_PROGRESS](https://github.com/Report-Engainall/Nasr1/actions/runs/41014174609) same SHA. Infrastructure and public smoke SUCCESS; local Supabase Chromium step still running; hosted tenant E2E SKIPPED. Do not report P2 overall PASS.
- Acceptance: all 16 REF rows retain `P3_IMPLEMENTED / CI_PENDING / P1_P2_PENDING` pending P1 route mounting and P2 aggregates/outcome persistence/gateway/health/RBAC. No DLV roll-up closed. Production release remains NO-GO.
- Next: poll P2 41014174609; P1 builds the typed workspace using committed `ActionCard`/`EvidencePassport`; P2 delivers server contract and P3 integrates each commit separately after checks.

---

## P2 execution record — internal order-pricing RPC browser denial — 2026-10-30

- Task: AGH-PRICE-PRIVACY-LEGACY-RPC-001.
- Live base SHA: d87ace59530e4b8511fb4c6b1bd2c82b39ea5d61. Code commit: 8e60ed6b35a56278c4fdbaeafde4bff50ad6dfe5.
- Changed path: scripts/test-database-migrations.mjs only.
- Root cause: migration supabase/migrations/20261027300000_revoke_direct_legacy_order_pricing_rpc.sql revokes browser execution of public.preview_order_pricing(jsonb), but the PostgreSQL 17 acceptance suite did not explicitly prove effective anon/authenticated/service_role grants and actual denied calls.
- Regression now asserts anon=false, authenticated=false, service_role=true for EXECUTE privilege; direct anon and customer calls must fail with permission denied. No production schema or data was changed.
- Parent exact-head Core 40975990443, P2 40975990641, cleanup 40975990427 all SUCCESS on d87ace59530e4b8511fb4c6b1bd2c82b39ea5d61. Those results do not prove the new code commit. New exact-SHA workflows must reach terminal SUCCESS before status becomes TESTED_EXACT_SHA.
- Next: VERIFY-AGH-PRICE-PRIVACY-LEGACY-RPC-001-EXACT-SHA-CI; then select the next uncovered destructive/high-risk RPC using retained inventory artifact 12940762864.
- Hosted authenticated customer/order/tenant E2E remains SKIPPED/BLOCKED_EXTERNAL; production release remains NO-GO.

---

## P2 checkpoint — import snapshot rollback authorization — 2026-10-30

- Test implementation: commit e68db07266c74c30cae36c9088c3ef993b4c9ac1. Step 23 (“Verify inventory import snapshot contract without implicit stock mutation”) passed in Core run 40974837711, exact code SHA e68db07266c74c30cae36c9088c3ef993b4c9ac1. Link: https://github.com/Report-Engainall/Nasr1/actions/runs/40974837711. The aggregate Core run had not reached a terminal outcome at the time of this checkpoint and P2 run 40974837758 was CANCELLED when a newer main SHA arrived.
- Latest main SHA: 2670bf7e69db2efe419cd386478b33e0b0656053. Fresh Core 40975098596 is IN_PROGRESS with focused step 23 still PENDING; P2 40975098653 PENDING; cleanup 40975098593 SUCCESS. Links: https://github.com/Report-Engainall/Nasr1/actions/runs/40975098596, https://github.com/Report-Engainall/Nasr1/actions/runs/40975098653, https://github.com/Report-Engainall/Nasr1/actions/runs/40975098593.
- Root-cause fixes during test development: 7bef9e1229e1c5ea814a5f1fdcc1448642fe0cce queried nonexistent import_jobs.updated_at; 7a28f88c73ec229be1d0455e6b4d3b48ab20110d corrected to created_at but expectFailure did not return the caught exception; e68db07266c74c30cae36c9088c3ef993b4c9ac1 fixed the helper. Focused test step then passed on e68.
- Test asserts ordinary staff is denied with SQLSTATE 42501 and foreign-tenant manager with opaque P0002; job status/error_summary/created_at, ready snapshot metadata, stored row count and rollback audit count remain unchanged after both denials.
- Existing RPC inventory artifact 12940762864 retained; 330/330 functions map to source across 173 migration files. No inventory regeneration.
- Previously completed prerequisite cash-expense void security tests passed Core/P2/cleanup on exact SHA 14e9cb703846708419c47ade22aa54ac3c7cdffd.
- Next task: VERIFY-AUTHZ-IMPORT-SNAPSHOT-ROLLBACK-001-LATEST-MAIN-CI. Reverify on latest main; then select the next uncovered destructive RPC after terminal Core/P2 results.
- Full production release remains NO-GO; hosted customer/order/tenant E2E, live integrations, production deployment/restore and owner sign-off remain unproven.

---
## P2 execution record — import snapshot rollback authorization — 2026-10-30

- Code SHA 7bef9e1229e1c5ea814a5f1fdcc1448642fe0cce added same-tenant staff/foreign-manager denial coverage; Core 40974044403 failed because import_jobs.updated_at does not exist. SHA 7a28f88c73ec229be1d0455e6b4d3b48ab20110d corrected the timestamp to created_at; Core 40974514133 then failed because expectFailure returned undefined. SHA e68db07266c74c30cae36c9088c3ef993b4c9ac1 now returns the verified caught error so SQLSTATE can be tested.
- Changed file: scripts/test-import-inventory-snapshot-contract.mjs. Fixes are test-only; no production schema or data changed.
- Intended acceptance: ordinary staff receives 42501 and foreign-tenant manager opaque P0002 from public.rollback_import_snapshot; after each rejection compare job status/error_summary/created_at, ready snapshot metadata, stored rows and rollback-audit count with baseline.
- Current exact SHA e68db07266c74c30cae36c9088c3ef993b4c9ac1: Core 40974837711 IN_PROGRESS (https://github.com/Report-Engainall/Nasr1/actions/runs/40974837711), P2 40974837758 PENDING (https://github.com/Report-Engainall/Nasr1/actions/runs/40974837758), cleanup 40974837686 SUCCESS (https://github.com/Report-Engainall/Nasr1/actions/runs/40974837686). Status remains IMPLEMENTED, not TESTED_EXACT_SHA.
- Retained RPC artifact 12940762864 maps 330/330 functions across 173 migrations; no regeneration: https://api.github.com/repos/Report-Engainall/Nasr1/actions/artifacts/12940762864/zip
- Cash-expense void authorization/no-side-effects is separately complete on SHA 14e9cb703846708419c47ade22aa54ac3c7cdffd: Core 40973093903, P2 40973094057, cleanup 40973093914 all SUCCESS.
- Next task: VERIFY-AUTHZ-IMPORT-SNAPSHOT-ROLLBACK-001-EXACT-SHA-CI; fix any current run failure, then select another uncovered destructive RPC.
- Full production release remains NO-GO; hosted E2E, external integrations, production deploy/restore and owner sign-off remain unproven.

---
## P2 execution record — import snapshot rollback authorization — 2026-10-30

- Repository: Report-Engainall/Nasr1, main only.
- First code commit: https://github.com/Report-Engainall/Nasr1/commit/7bef9e1229e1c5ea814a5f1fdcc1448642fe0cce. Core run 40974044403 FAILED in step 23, “Verify inventory import snapshot contract without implicit stock mutation.” The log identified SQL error: column import_jobs.updated_at does not exist.
- Root cause was a test-only schema assumption, not a production schema failure. Fixed by commit https://github.com/Report-Engainall/Nasr1/commit/7a28f88c73ec229be1d0455e6b4d3b48ab20110d: query now snapshots import_jobs.created_at along with status and error_summary.
- Test scope: same-tenant ordinary staff must receive SQLSTATE 42501 on public.rollback_import_snapshot; foreign-tenant manager must receive opaque P0002. The test compares job status/metadata/created_at, ready snapshot metadata, stored snapshot row count and rollback audit count before and after each denial.
- Corrected exact-SHA CI state at checkpoint: Core 40974514133 IN_PROGRESS (https://github.com/Report-Engainall/Nasr1/actions/runs/40974514133), P2 40974514139 PENDING (https://github.com/Report-Engainall/Nasr1/actions/runs/40974514139), cleanup 40974514142 SUCCESS (https://github.com/Report-Engainall/Nasr1/actions/runs/40974514142). New rollback test status remains IMPLEMENTED; not yet TESTED_EXACT_SHA.
- Retained RPC inventory artifact 12940762864 maps 330/330 functions across 173 migration files; it was not regenerated.
- Completed prerequisite: cash-expense void authorization/no-side-effect suite passed Core 40973093903, P2 40973094057 and cleanup 40973093914 on exact SHA 14e9cb703846708419c47ade22aa54ac3c7cdffd.
- Next task: VERIFY-AUTHZ-IMPORT-SNAPSHOT-ROLLBACK-001-EXACT-SHA-CI. Inspect corrected terminal runs; fix a concrete remaining failure, then choose another uncovered destructive RPC from the retained inventory.
- Release: full production release remains NO-GO; hosted customer/order/tenant E2E, live external integrations, production deploy/restore and owner sign-off remain unproven.

---
## P1 execution record — persistent customer-cart revocation guard — 2026-10-27

- Code PR #283: https://github.com/Report-Engainall/Nasr1/pull/283 — merged to `main` as `07fa889275526b2ba164784ba2fc6b2bbcc01e29`.
- Changed files: `supabase/migrations/20261027220000_customer_cart_member_revocation_guard.sql` and `scripts/test-customer-address-concurrency.mjs`.
- Root cause: persistent-cart RPCs checked for an active profile/customer role but did not serialize reads and writes against the same customer-row lock used by company-member revocation. A revocation could race with a cart operation.
- Fix: both cart read and sync lock the current customer row `FOR SHARE`, re-check the customer scope after lock acquisition, and reject a revoked member with SQLSTATE `42501`. Sync retains bounded input, exact-field, quantity, product/tenant and no-price-output checks.
- Concurrency acceptance: extended the existing PostgreSQL 17 revocation barrier to include an in-flight cart read and sync; confirmed both are denied after the owner revocation commits, with the cart row/items/audit snapshot unchanged. Preserved existing error-message contract; test binds an explicit JSONB empty array and keeps barrier sessions alive through setup.
- Tested source SHA: `3bb70ec9f2a752cba80463a6653ad84cac4b59b2`; tested code tree `4fa8e1627d29cad017ada7aa6ac4a306fc58ecb9`. Exact-head Core [40551865127 SUCCESS](https://github.com/Report-Engainall/Nasr1/actions/runs/40551865127), P2 [40551865116 SUCCESS](https://github.com/Report-Engainall/Nasr1/actions/runs/40551865116), and PG17 [40551865300 SUCCESS](https://github.com/Report-Engainall/Nasr1/actions/runs/40551865300).
- Post-merge SHA: `07fa889275526b2ba164784ba2fc6b2bbcc01e29`; same tree as tested head. **Post-merge CI = NOT VERIFIED** because no workflow run was returned for that merge SHA during this checkpoint.
- Hosted authenticated customer/tenant E2E = **SKIPPED**. Live Onyx/WhatsApp/AI and production deployment/backup/restore evidence remain **BLOCKED_EXTERNAL / NOT RUN**. No production migration was applied.

---

## P2 execution record — import quality tenant-scope repair — 2026-10-24

- Code PR #146: https://github.com/Report-Engainall/Nasr1/pull/146
- Tested source head: `3150691725f97d7f892fcb2aed0edae898c839be`; base main `16a3d23e558696700bccbb3dbf9ea75b0fccf745`.
- Core [40101794869 SUCCESS](https://github.com/Report-Engainall/Nasr1/actions/runs/40101794869) and P2 [40101794970 SUCCESS](https://github.com/Report-Engainall/Nasr1/actions/runs/40101794970), same exact SHA.
- Root cause: `calculate_import_job_quality(uuid)` read the job by ID before authorization. Fix authenticates/authorizes active staff before lookup and scopes both job and import-profile queries to the active organization.
- Regression test: customer foreign vs unknown job IDs both return the same 42501 denial; authorized staff foreign vs unknown job IDs both return the same tenant-scoped P0002 error. PostgreSQL 17 migration/core acceptance passed.
- Exact-head P2 also passed local Supabase migration/guards, price-grid rollback/audit/stale-writer race, cash expense and purchase receipt source-posting checks, Chromium order/tenant denial, returns/credit memo, Onyx XLSX, finance/task printing, customer-manager privacy/audit, and central session revocation.
- Hosted customer/tenant Playwright remains SKIPPED; local isolated-Supabase authenticated acceptance passed. No production data/provider activity or direct main write.

---

## P2 execution record — hidden catalog price sentinel repair — 2026-10-24

- Code repository: `Report-Engainall/Nasr1`; base `main` SHA `16a3d23e558696700bccbb3dbf9ea75b0fccf745`; code PR #145 remains OPEN/UNMERGED.
- Code head: `7c82b051ed0bda11c944e4fe08ecf4a117060ed5`.
- Exact-head Core [40100874921](https://github.com/Report-Engainall/Nasr1/actions/runs/40100874921) SUCCESS; exact-head P2 [40100874931](https://github.com/Report-Engainall/Nasr1/actions/runs/40100874931) SUCCESS.
- Root cause fixed: hidden prices used numeric zero as a sentinel; a missing price could be rendered or persisted as an amount, and a customer workflow helper could pass raw response fields back into the public object.
- Fix: price RPC returns SQL NULL; customer catalog page excludes `base_price` from client payload while keeping an authorized staff-only projection; API, typed catalog, cache, pending cart and customer quote/reorder/barcode/assistant workflows preserve explicit price absence and use public allowlists; regression tests cover the old sentinel and malformed/raw payload cases.
- Verified exact-head acceptance: unit suite; migration + PostgreSQL 17 core suite; invitation expiry/audit; stock-count exactly-once audit; asynchronous export; import concurrency/idempotency and inventory snapshot; saved products; backup/restore; Lint; Build; production/dev smoke; Chromium price visibility; local Supabase endpoint guards; atomic price grid rollback/audit/stale-writer race; cash expense/accounting restrictions; purchase receipt accounting restrictions; authenticated order persistence and tenant denial; returns/credit memo; Onyx XLSX; finance/task print; customer-manager financial privacy/audit; central device-session authorization and immediate revocation.
- Proof boundary: the credential-gated hosted customer/tenant Playwright job is SKIPPED, not PASS; the local isolated-Supabase authenticated E2E passed. No production behavior, production DB write, or live provider action is claimed.
- Merge gate: PR #144 is still OPEN and lacks recorded independent approval; PR #145 must not merge ahead of #144. No direct main write was made.

---

## P2 execution record — 2026-10-24 live Git reconciliation

- Live `main`: `16a3d23e558696700bccbb3dbf9ea75b0fccf745`; no main writes.
- Catalog inventory: source SHA `672749855d733f691ab59de878420a210108fbbe`; 120 migrations, 304/304 runtime public objects mapped, zero unmatched; Core 40042438869 and P2 40042438851 SUCCESS exact source SHA.
- Storefront pricing authorization: PR #144 head `9fc736db3fc451731a94105d6e707a5c83fbf019`; Core 40044350881 and P2 40044350890 SUCCESS exact head. Test now asserts accepted company buyer tier, finance-only denial, and live session revocation using PostgreSQL savepoints for independent rejection scenarios.
- Test-failure record: PR #144 previous SHA `48c963b6624c296f8c902cb65c12ca4e63c7b918` Core FAILURE because its test's first expected SQL error aborted the enclosing transaction; not a product regression. The failure was corrected and later exact SHA passed.
- PR #142 latest docs head `d3f0c41d8330c0ac30ff13c122e19e34d31f5825`: Core [40044835801](https://github.com/Report-Engainall/Nasr1/actions/runs/40044835801) and P2 [40044835894](https://github.com/Report-Engainall/Nasr1/actions/runs/40044835894) both terminal SUCCESS on exact SHA; PR open awaiting review.
- PR #133 central-doc head `8b1f6d75a5c25a63e9bebe6c90b3c53cae26b0a7`: Core 40045052185 and P2 40045052224 SUCCESS exact SHA; this reconciliation commit creates a new docs descendant and needs fresh checks. Hosted customer E2E remains SKIPPED/BLOCKED_EXTERNAL. No provider/production claim.

---



## P2 latest exact-head execution evidence — 2026-10-24T02:25:19+03:00

- Main `16a3d23e558696700bccbb3dbf9ea75b0fccf745`, tree `7dc8d72c0ece57777cc5e3337d1f8b416870697a`; Core [40035355209](https://github.com/Report-Engainall/Nasr1/actions/runs/40035355209) SUCCESS on exact main SHA.
- PR #119 head `a1a17bcf9ae320ea39680421a83e4b32deef3c67`: Core [40036273431](https://github.com/Report-Engainall/Nasr1/actions/runs/40036273431) and P2 [40036273465](https://github.com/Report-Engainall/Nasr1/actions/runs/40036273465) both SUCCESS exact head after #131 merge.
- PR #134 head `387db64bfa6686ab08d4707d88b7aea3f9c6ff41`: Core [40037207461](https://github.com/Report-Engainall/Nasr1/actions/runs/40037207461) and P2 [40037207264](https://github.com/Report-Engainall/Nasr1/actions/runs/40037207264) SUCCESS exact head; same-key concurrent batch requests produce one creation and one replay without double movement/audit.
- PR #135 head `982768af887384217353151134e23c18f6bcb030`: Core [40038517615](https://github.com/Report-Engainall/Nasr1/actions/runs/40038517615) and P2 [40038517499](https://github.com/Report-Engainall/Nasr1/actions/runs/40038517499) SUCCESS exact head; PostgreSQL 17 tests current customer schema, tenant/role denial, sales/trend boundaries and cancellation exclusions.
- PR #138 head `3015b4f35857c756e9fde05e47fef6ed1c513510`: Core [40038957424](https://github.com/Report-Engainall/Nasr1/actions/runs/40038957424) and P2 [40038957490](https://github.com/Report-Engainall/Nasr1/actions/runs/40038957490) SUCCESS exact head; README, no-secret env example, Bun install and deployment/environment guide.
- PR #118 remains open pending formal review despite exact head Core 40035579224/P2 40035578462 SUCCESS and only three intended CSV/XLSX/test files.
- PR #133 previous head `2728d7c6d14b7e18d60d9cf22cae6eadea70c238` had Core [40037504255](https://github.com/Report-Engainall/Nasr1/actions/runs/40037504255) / P2 [40037504475](https://github.com/Report-Engainall/Nasr1/actions/runs/40037504475) terminal SUCCESS on that exact SHA. This new documentation commit needs fresh exact-head CI.
- Formal review APIs are empty for #133/#134/#135/#138; do not merge without authorized independent approval. Hosted customer/tenant E2E, live Onyx target import/sync, WhatsApp delivery, production deployment and production restore remain SKIPPED/BLOCKED_EXTERNAL/NOT PROVEN.


## P2 live reconciliation and concurrent inventory idempotency — 2026-10-24T02:03:00+03:00

- Main remains `16a3d23e558696700bccbb3dbf9ea75b0fccf745` / tree `7dc8d72c0ece57777cc5e3337d1f8b416870697a`; Core 40035355209 is SUCCESS on exact main SHA.
- #131 is merged. P1 PR #119 Core 40036273431 and P2 40036273465 are terminal SUCCESS on the same head `a1a17bcf9ae320ea39680421a83e4b32deef3c67`; hosted customer/tenant E2E remains SKIPPED/BLOCKED_EXTERNAL.
- PR #127 address validation is merged at `d7a49d8ca7d968e2fc04307fb26313e54168410a`; do not repeat. DQS PR #70 is merged and exact-head Core/P2 runs 39914838897/39914838852 passed.
- Direct compare shows PR #118 has only three intended files changed against current main, ahead 5/behind 0; head `bf23b0d04d49cdd1218e75e72d22c97a0e8c3673` Core 40035579224 and P2 40035578462 SUCCESS; formal review missing.
- PR #134 adds isolated PostgreSQL 17 same-key concurrent batch idempotency proof. Core 40037207461 and P2 40037207264 were QUEUED on exact head `387db64bfa6686ab08d4707d88b7aea3f9c6ff41`; no PASS claimed.
- PR #133 previous docs head `ede749f27847efe5ffe3d53bad4476ed822aff99` passed Core 40036690415 and P2 40036690420. This update changes the docs head; reread live CI and review status before closure.
- Hosted E2E and live Onyx/WhatsApp integrations remain BLOCKED_EXTERNAL without authorized non-production access and actual provider responses. No production writes performed.
## P2 live reconciliation — 2026-10-24T01:48:00+03:00

- Re-read live main SHA `16a3d23e558696700bccbb3dbf9ea75b0fccf745`, tree `7dc8d72c0ece57777cc5e3337d1f8b416870697a`; Core run [40035355209](https://github.com/Report-Engainall/Nasr1/actions/runs/40035355209) is terminal SUCCESS on that exact SHA.
- PR #131 is merged into main at `16a3d23e558696700bccbb3dbf9ea75b0fccf745`; it corrects tenant-scope denial to SQLSTATE 42501/HTTP 403 without changing cross-tenant data or its audit state. Do not recreate it.
- PR #119 current head is `a1a17bcf9ae320ea39680421a83e4b32deef3c67`; Core [40036273431](https://github.com/Report-Engainall/Nasr1/actions/runs/40036273431) SUCCESS and P2 [40036273465](https://github.com/Report-Engainall/Nasr1/actions/runs/40036273465) was IN_PROGRESS at reconciliation. Treat the result as pending until terminal; if it fails, inspect the job log and repair only the evidenced root cause.
- PR #118 current head `bf23b0d04d49cdd1218e75e72d22c97a0e8c3673`: Core [40035579224](https://github.com/Report-Engainall/Nasr1/actions/runs/40035579224) and P2 [40035578462](https://github.com/Report-Engainall/Nasr1/actions/runs/40035578462) are terminal SUCCESS. It remains OPEN / UNMERGED with no formal review recorded; do not bypass review gating.
- PR #133 central docs are being refreshed against main `16a3d23e558696700bccbb3dbf9ea75b0fccf745`. The previously successful runs 40034694219/40034694221 belong to the previous documentation head and are not evidence for the new commit. Require current-head Core and P2 results and an authorized independent review before merge.
- Hosted customer/tenant E2E skipped for missing non-production credentials remains `BLOCKED_EXTERNAL`, not PASS. No production writes or live third-party integration claims.

---

## P2 current exact-head validation — 2026-10-23T19:40:00+03:00

- Main c22ba48b2f44f4b752e3f5c5df78f0cc792b0a99, tree ce3773a9c69ca2ee9acc2daa3fc759753bd4cdd9; Core 39983210712 PASS on exact main SHA.
- PR #54 merged at afa4840c137d9da853c8486b005adb1ffd5fdd0a; PR #52 merged at c11ea018b81c6e47a9bbbc36d4d7b8f432892f8d. INV-009 stays closed for local proof; live Onyx import/sync is BLOCKED_EXTERNAL.
- PR #88 merged at c22ba48b2f44f4b752e3f5c5df78f0cc792b0a99; feature-head Core 39982277415/P2 39982277637 PASS. Hosted customer E2E skipped.
- OPS-DR-001 remains isolated PostgreSQL 17 restore proof only; no production RTO/RPO assertion.
- PR #101 head 695328d97c8078c43bea5859f858b7f99ff43a5b, base c22ba48b2f44f4b752e3f5c5df78f0cc792b0a99. Core 39987599300 and P2 39987599442 both SUCCESS on exact head. Earlier failures were in test harness parameter binding and private-table inspection context; fixed on current head without widening client grants.
- CodeRabbit review triggered, still in progress as of 2026-10-23T19:40:00+03:00; do not merge until review findings are resolved and mandatory checks remain green.
- PR #100 central docs checkpoint is being refreshed to this exact head and its exact-head Core/P2 checks must finish. P1 #97 and P3 #89 own their UI paths.

---

## P2 checkpoint — PR99 merged, main reconciled; next: generic manual journal reversal — 2026-10-23T18:54:23+03:00

- Current main SHA 8e48c592d06ee8bc35b73cfe89f5f0fd51c33ec2, tree 40fcbdf56ddb5a50badc3c4d42e3164bb7ecfb3e; post-merge Core CI 39980802016 SUCCESS on the same SHA.
- PR #99 merged as 8e48c592d06ee8bc35b73cfe89f5f0fd51c33ec2. Exact tested code head 4122ed10b6827c6e0d4b4aeb64c6578ea8cd4d08 has matching tree; Core 39976687601 and P2 39976687945 PASS. Added ordered order lifecycle history, active same-tenant staff actor attribution, and no audit record for rejected cancellation. Local authenticated order/tenant Chromium job 120493443382 PASS; external hosted customer job 120493047623 SKIPPED.
- #83, #82, #71, #52, #54, #90, #84, #94, #95, #96 merged. #43/#56 closed without merge. #98 and stale docs PR #92 closed without merge after supersession comments; replacements use latest main.
- INV-009 and OPS-DR-001 retain local/isolation-only evidence; Onyx target sync/import and production DR remain unproven/blocked.
- P1 PR #88 current head 5114ea8227f570662533219af1dc3a013cd49f75 Core 39981579136/P2 39981579236 in progress; device-session UI/spec/seed remain P1-owned. P3 #89 and P1 #97 stay outside P2 file ownership.
- Next task FIN-LEDGER-001-MANUAL-JOURNAL-REVERSAL. Existing GL has draft/post/void-draft and balance/idempotency protections but no explicit generic reversal for posted manual/adjustment entries. Invoice/payment and cash-expense reversals already have source-specific implementations; do not duplicate/bypass them.
- Current code branch initialized: p2/general-ledger-reversal-20261023 from 8e48c592d06ee8bc35b73cfe89f5f0fd51c33ec2. Implementation/tests not yet committed as of this checkpoint.

---

## P2 readback — Onyx source trace and sync evidence — 22 October 2026

- **Task remains OPEN:** `NASR1-ORIGINAL-SPEC-IDENTITY-AND-ONYX-SYNC-EVIDENCE-011`; only active pointer remains in `CURRENT_EXECUTION_STATE.md`.
- **Baseline confirmed:** main SHA `0395367d869d0d63fba669940a92eeca0ae3e893`, Core CI [39789165220](https://github.com/Report-Engainall/Nasr1/actions/runs/39789165220) ended `success` on that exact SHA.
- **Implementation branch:** `feat/p2-onyx-source-trace-sync-evidence-20261022`, PR [#40](https://github.com/Report-Engainall/Nasr1/pull/40), exact head at this readback `8c414a06b584a37d56f3f4aaafcb8d3f53863e42`, still draft/unmerged. Feature CI [39799542472](https://github.com/Report-Engainall/Nasr1/actions/runs/39799542472) was queued; [39799542477](https://github.com/Report-Engainall/Nasr1/actions/runs/39799542477) had no terminal conclusion. Therefore no `TESTED_EXACT_SHA` declaration yet.
- **Changed contract:** source snapshot selector now feeds the server order-export audit; audit stores snapshot/import hashes and per-order-line unique/ambiguous/unmatched mapping status; request-key replay is idempotent. Separate sync-attempt records distinguish the latest attempt/error, latest server-recorded successful provider response, and success tied to the selected snapshot. Success evidence can only be written through a service-role RPC with request and response SHA-256 and HTTP 2xx. XLSX target detail schema remains 27 columns; its metadata sheet records selected snapshot identity.
- **Focused acceptance added:** PostgreSQL 17 fixture covers one exact match, a duplicate source key (no arbitrary external ID emitted), unmatched SKU, wrong-tenant snapshot denial, request-key replay/reuse denial, and success followed by a later failed attempt while preserving historical success evidence. Source-evidence unit/CSV tests validate foreign-tenant response rejection and formula-safe error summaries.
- **Print acceptance already exists in current-main DB acceptance:** `scripts/test-database-migrations.mjs` has allow/deny assertions for finance print options, invoice, full statement and credit memo for accountant/operations/customer/foreign-tenant users; `scripts/test-customer-returns.mjs` has additional statement/credit-memo cases. Feature-head CI still must run against the added migration.
- **Proof boundaries:** `IMPLEMENTED` on the P2 branch; exact feature-head tests pending; `BROWSER_PROVEN=NOT RUN`; `PRODUCTION_PROVEN=NOT RUN`. No provider credentials/adapter and no external target-import receipt were present; real Onyx live sync and 27-column target acceptance remain `BLOCKED_EXTERNAL`. No production writes or migrations.
- Keep P1-owned report/entrypoint/source-ledger/audit files untouched; branch locks are in `WORK_COORDINATION.md`. Do not merge PR #40 before exact-head CI and review.

## P2 readback — DQS calendar integrity and CSV/XLSX spreadsheet safety — 20 October 2026

- Tested application/test SHA: `c1e67c8fc006ad11f40af4547e5eb8afc34e12ae`. CI workflow **Aghbari Commerce checks** run [39452983497](https://github.com/Report-Engainall/Nasr1/actions/runs/39452983497) completed `success`; same-head evidence includes PostgreSQL 17 migrations/database acceptance and application build. Preserve this SHA association; it does not certify any later code SHA.
- `NASR1-ORIGINAL-SPEC-DQS-CSV-XLSX-HARDENING-008`: `IMPLEMENTED`, `INTEGRATED`, `TESTED_EXACT_SHA`. Added `supabase/migrations/20261020120000_dqs_calendar_date_validity.sql` rather than rewriting historical migrations. The persisted DQS now rejects impossible calendar dates and mixed separators, requires a nonblank matching key for temporal integrity, falls back to the matching key for empty required-field lists, and includes cost in numeric-consistency scoring to match the client accumulator. Client scoring uses actual month/day/leap-year validation.
- DQS acceptance mutates only its own CI import-job fixtures, verifies `2026-02-31` reduces temporal integrity and aggregate DQS, checks leap-day formats and blank matching-key behavior, then restores original row values before the existing finalization and saved Onyx-snapshot assertions. CSV adversarial tests cover `= + - @`, leading controls/whitespace and ordinary labels. XLSX string cells remain inline strings, not executable formula cells, where covered by the target export test suite.
- `BROWSER_PROVEN=NOT RUN / BLOCKED_EXTERNAL`; the separate Playwright gate records its missing dedicated non-production Supabase secrets and never claims a browser pass. `PRODUCTION_PROVEN=NOT RUN`.
- Archive fingerprints and integration decisions were reused. No donor archive was re-downloaded or re-extracted. The recorded source-tree/extraction-report discrepancy (2,329 tree entries vs 2,044 reported extracted files) remains unresolved and is not reclassified as reconciled.
- The finance print, Onyx reconciliation, task-center filter/print parity, and browser gate proofs remain separate; none is promoted to a higher proof state by this DQS run.
- **next_task_id الوحيد:** `NASR1-ORIGINAL-SPEC-AI-GATEWAY-USAGE-AUDIT-009` — inspect AI provider routing, permission enforcement, usage/audit persistence, quota/rate limiting, privacy/minimal payloads and fail-closed behavior, and verify tests against the actual schema without touching P1-locked API/workflow paths.

## P2 readback — Task-center print parity and browser-test gate — 20 October 2026

- Branch: `feat/p2-customer-return-intake-20261020`; PR #18: https://github.com/Report-Engainall/Nasr1/pull/18.
- Exact tested application-code SHA for this batch: `d9590e4b8aefed27682a14c1915e26661e31e575`. GitHub Actions [39452487876](https://github.com/Report-Engainall/Nasr1/actions/runs/39452487876) completed `SUCCESS`: frozen Bun lockfile, unit tests, PostgreSQL 17 migration/acceptance, Lint, production build, production-preview smoke (4173), and dev-server smoke (5173).
- `NASR1-ORIGINAL-SPEC-TASK-CENTER-PRINT-FILTER-PARITY-007`: `IMPLEMENTED`, `INTEGRATED`, `TESTED_EXACT_SHA`. Files changed: `src/components/TaskCenter.tsx`, `src/lib/task-print.ts`, `src/test/task-print.test.ts`. The print scope supports the exact currently displayed results (role + status + priority + assignee + date range + search), all rows allowed to the active account, or a selected allowed role. The print helper rechecks allowed roles; the print list shares the current non-role filters.
- Browser E2E suite/workflow: `IMPLEMENTED` but `BROWSER_PROVEN=NOT RUN / BLOCKED_EXTERNAL`. The exact-head run [39452487724](https://github.com/Report-Engainall/Nasr1/actions/runs/39452487724) explicitly gated execution because dedicated non-production Supabase URL/key, two users from different organizations, test phone, and the affirmative non-production-write confirmation are absent. Setup, Chromium, built app, and Playwright steps were skipped by this gate; the job's green status is a gate success, **not** a browser test pass. No test order was created and production was not touched. To unblock, follow `docs/bolt-source-reconciliation/P2_PLAYWRIGHT_E2E_SETUP.md`.
- Onyx reconciliation remains `TESTED_EXACT_SHA` at `acadfb1321166ef5246f83ddb7703ca8a9650cb6`, run [39450490958](https://github.com/Report-Engainall/Nasr1/actions/runs/39450490958); print-parity changes did not modify its database/RPC code. This database CI is not browser or production proof.
- Archive review reused existing manifest/fingerprint and source integration evidence. No donor ZIP was redownloaded, extracted, or rehashed. The source recursive-tree/extraction-report discrepancy remains unresolved evidence (2,329 tree entries versus 2,044 reported extracted files); it is not silently treated as reconciled.
- Status axes remain separate: `IMPLEMENTED` is not `INTEGRATED`; `TESTED_EXACT_SHA` is not `BROWSER_PROVEN`; `BROWSER_PROVEN` is not `PRODUCTION_PROVEN`.
- Historical next-task checkpoint (superseded after CI proof): `NASR1-ORIGINAL-SPEC-DQS-CSV-XLSX-HARDENING-008` — trace DQS scoring into persisted import/snapshot records and the user-facing flow; validate CSV/XLSX formula-injection handling and parser bounds with adversarial tests; remediate only demonstrable target-side gaps while preserving P1 ownership/locks.

## P2 readback — Onyx reconciliation CI result — 20 October 2026

- `NASR1-ORIGINAL-SPEC-ONYX-INVENTORY-RECONCILIATION-005`: `IMPLEMENTED`, `INTEGRATED`, `TESTED_EXACT_SHA`.
- Exact tested application-code SHA: `acadfb1321166ef5246f83ddb7703ca8a9650cb6`; GitHub Actions [39450490958](https://github.com/Report-Engainall/Nasr1/actions/runs/39450490958) completed `SUCCESS`. The workflow completed unit tests, isolated PostgreSQL 17 migration/acceptance, lint (repository-wide Prettier rule excluded by workflow), build, preview smoke (4173), and dev smoke (5173). The database acceptance includes role/tenant denial, unscoped source denial, reservation and stale-stock rejection, idempotency, successful apply and compensating rollback, and refusal to roll back over later movement history.
- Current PR #18 HEAD is a documentation-only successor to `acadfb1321166ef5246f83ddb7703ca8a9650cb6`; subsequent commits in this sequence only updated P2 documentation/state records and did not change application code. Read the live PR metadata for the current HEAD rather than relying on a SHA copied into this note. The workflow is verified for the exact application-code SHA above; **do not label the later documentation HEAD as CI-tested**, because the workflow did not trigger for documentation-only updates.
- `BROWSER_PROVEN = NOT RUN`; `PRODUCTION_PROVEN = NOT RUN`; no real external Onyx connection/sync is claimed.
- P2 records updated: `PROGRAMMER_2_CURRENT_REPORT.md`, `CURRENT_EXECUTION_STATE.md`, `EXECUTION_LOG.md`, `WORK_COORDINATION.md`, and `P2_MULTI_PROJECTS_TRANSFER_REVIEW_2026-10-20.md`. No P1-owned ledger/report/locked code paths changed; no main or donor repository writes.
- Next single task: `NASR1-ORIGINAL-SPEC-PLAYWRIGHT-CRITICAL-PATHS-006` — adapt the extracted Playwright critical-path suite to Nasr1's actual auth/routes and prove catalog → cart → order → refresh plus cross-organization isolation using dedicated CI credentials; absent credentials must be reported `NOT RUN/BLOCKED_EXTERNAL`, never silently skipped. Afterward continue the task-center print-all/filter parity and remaining original-spec gaps.

---

## P2 live update — NASR1-ORIGINAL-SPEC-ONYX-INVENTORY-RECONCILIATION-005 — 20 October 2026

- Scope: implemented target-native warehouse-scoped preview → apply → compensating rollback using `onyx_snapshots/onyx_snapshot_rows`, `inventory_balances`, `inventory_movements`, and audit records; donor SQL was not copied.
- Code paths: `supabase/migrations/20261020110000_onyx_inventory_reconciliation_apply_rollback.sql`, `src/lib/onyx-inventory-reconciliation.ts`, `src/components/OnyxInventoryReconciliationActions.tsx`, `src/components/OnyxSnapshotCenter.tsx`, `src/test/onyx-inventory-reconciliation.test.ts`, `scripts/test-onyx-reconciliation.mjs`; `package.json` test:db runs the PostgreSQL acceptance script.
- Guardrails in implementation: active staff tenant context; manager/admin for stock-changing commands; warehouse-scoped source evidence; rejects unscoped aggregate snapshots, duplicate/invalid item codes, nonnegative quantity violations, unknown/foreign products, reservations above target, and source/stock/movement drift; idempotency keys for preview/apply/rollback; two-pass validation before stock writes; append-only stock movements and audit; rollback denied when later stock changes exist. Table direct DML is revoked from authenticated and anonymous roles.
- `IMPLEMENTED` / `INTEGRATED`: present in P2 branch and wired into existing Onyx Snapshot Center; preview is explicitly non-mutating.
- `TESTED_EXACT_SHA`: **PENDING**. Current application commit `acadfb1321166ef5246f83ddb7703ca8a9650cb6`; workflow [39450490958](https://github.com/Report-Engainall/Nasr1/actions/runs/39450490958) is still in progress at last readback (unit tests running). Do not claim PASS until the workflow concludes successfully on the exact code SHA or a final SHA with this code unchanged and CI rerun.
- `BROWSER_PROVEN = NOT RUN`; `PRODUCTION_PROVEN = NOT RUN`; live Onyx connection/sync is not claimed.
- Source-review state: the previously listed controlled reconciliation gap is now implemented on this branch; remaining work includes real authenticated Playwright critical paths and tenant isolation, task-center print-all/filter parity, extraction-count discrepancy triage, identity/sync-evidence review, AI fallback/usage-ledger behavior, and remaining original-spec gaps.
- Do not advance the single live task pointer until the exact-SHA workflow is green. **next_task_id remains `NASR1-ORIGINAL-SPEC-ONYX-INVENTORY-RECONCILIATION-005` pending CI acceptance.** No P1-owned source ledgers/reports or locked code paths were edited; no main or donor repository writes.

---

# سجل التنفيذ — Nasr1

## 2026-10-18 — NASR1-BOOT-001 — مواءمة البناء مع TanStack Start
- المستودع والفرع: `Report-Engainall/Nasr1` / `main`
- SHA الأساس: `41b8757183db97990f0c1f78f8ea6e45cf7d0201`
- الدليل الأساسي: [CI 38971144752](https://github.com/Report-Engainall/Nasr1/actions/runs/38971144752) أخفق عند `bun install --frozen-lockfile --dry-run` قبل بدء الاختبارات. log يشير إلى عدم تطابق overrides في manifest وlock.
- اكتشف الفحص أن manifest وnpm lock قديمان (React Router/Vite 5)، بينما lock وroutes وtests/workflow تعتمد TanStack Start/Vite 8/Vitest.
- التغييرات: manifest من lock الحالي، scripts موجودة للـCI، Vite config wrapper مع مدخل server، تعديل اسم workspace فقط في lock، نقل root HTML وnpm lock المتعارضين إلى REFERENCE_ONLY مع الاحتفاظ بالمحتوى.
- الاعتماديات: صفر اعتماديات جديدة؛ استخدمت الموجود في Bun lock.
- الاختبار على SHA الجديد: pending GitHub Actions؛ لم يُشغّل شيء من checkout محلي.
- المانع: الأرشيفات الثنائية لم تُنزّل/تُفك في هذا batch؛ حالتها التاريخية موثقة دون ادعاء جديد.
- next_task_id: `NASR1-BOOT-001` حتى اجتياز التثبيت والبناء؛ ثم `NASR1-OPS-TASK-CENTER-001`.


## 2026-10-18 — NASR1-MISSING-MODULES-001 — استعادة وحدات من provenance
- SHA المختبر السابق: `790afce1aa2a78a4692d6f990599ed99a495515b` — [Actions run 39139420150](https://github.com/Report-Engainall/Nasr1/actions/runs/39139420150) = FAIL في unit tests بعد نجاح التثبيت.
- Vitest: 9 test files failed، 6 passed، و48 tests passed ضمن الملفات التي تم تشغيلها.
- أسباب missing imports: `customer-addresses.ts`, `customer-company-members.ts`, `finance-document-pdf.ts`, `unified-import.ts`, و`routes/api.invoice-pdf.$invoiceId.ts`. routeTree كان يشير بالفعل إلى route ملفه مفقود.
- مصدر الملفات الخمسة: `Aghbari-Technologies/aghbari-commerce-evolved@d24695209b45f2352e0ba994e1f5109d7e2afc9d`. تمت مقارنة blob SHAs مع READY_TO_REUSE/PROVENANCE_MANIFEST.csv قبل الإضافة، وتُحفظ النسخ المرجعية دون تعديل.
- اختبار ما بعد الاستعادة: PENDING على SHA التالي؛ لا ادعاء PASS قبل قراءة Actions.
- next_task_id: `NASR1-MISSING-MODULES-001` حتى اختبارات الوحدات والـPDF والمسارات تجتاز.

## 2026-10-18 — NASR1-SUPABASE-CLIENT-001 — استعادة عقد عميل Supabase الصحيح
- SHA الأساس: `2f523b729c6ed28aff06fbeddabd18cd79a25131`; CI المرتبط به: [run 39139802558](https://github.com/Report-Engainall/Nasr1/actions/runs/39139802558) = FAIL عند استيراد عميل Supabase أثناء اختبار route matching.
- الأدلة: frozen Bun lock PASS؛ التثبيت PASS؛ Vitest 14 ملفات PASS وملف واحد FAIL، 133 اختبارًا PASS. الاستثناء `supabaseUrl is required` من العميل القديم في `src/lib/supabase.ts`.
- المصدر: `Aghbari-Technologies/aghbari-commerce-evolved@d24695209b45f2352e0ba994e1f5109d7e2afc9d`, الملف `src/lib/supabase.ts`, source blob `430fd42b111f26e5bd1104c9a19b4350a39de7fb`. الكود يربط بطبقة العميل الموجودة في Nasr1 ويضيف نطاق المؤسسة الذي تتوقعه API، دون أخذ IDs من browser أو إضافة اعتماديات.
- القرار: استبدال العميل القديم الذي لا يطابق عقد التطبيق النشط؛ حفظ قرار المصدر والبصمة في ledger.
- اختبار هذه الدفعة: `PENDING_REMOTE_CI`؛ لم تُشغّل أوامر محلية لأن checkout غير متاح.
- next_task_id يبقى `NASR1-SUPABASE-CLIENT-001` حتى قراءة CI الجديد.

# سجل التنفيذ — Nasr1

## 2026-10-18 — NASR1-DB-MIGRATION-ORDER-001 — تحييد baseline قديم متضارب مع حفظه
- المستودع/الفرع: `Report-Engainall/Nasr1` / `main`
- SHA الأساس: `63ab9fc050d165c1a088112979ab7a9fefbb2767`
- دليل الفشل: [Actions 39140257185](https://github.com/Report-Engainall/Nasr1/actions/runs/39140257185) → `MIGRATION_FAILED 20261016074744_001_initial_schema.sql`; PostgreSQL 17 `42703 column "is_active" does not exist`.
- مقارنة المخطط: `20261006063522_d656e1d4-1ca3-4cd7-8542-504968bc356c.sql` يعرّف `products.status`؛ الـbaseline الأحدث اسمًا يتوقع `products.is_active` ويضيف بيانات seed. `CREATE TABLE IF NOT EXISTS` لم يحدّث الجدول القائم.
- القرار: حفظ كل SQL الأصلي بلا تعديل في `docs/bolt-source-reconciliation/REFERENCE_ONLY/migrations/20261016074744_001_initial_schema.legacy.sql`. إبقاء migration version path، وتحويل جسمه إلى guard يثبت وجود `organizations` و`products` وعقد `products.status` قبل متابعة migrations. يمنع هذا تشغيل schema مزدوج أو seed منتجات ديمو فوق المخطط canonical.
- SQL الأصلي: Git blob `baf5744a4a7cf3f2d2077460f9c5517318dad2f8`, حجم النص `13742` حرفًا.
- اختبار SHA الأساس: dependency freeze/install PASS؛ unit tests PASS؛ DB acceptance FAIL للسبب أعلاه؛ بقية lint/build/smoke SKIPPED.
- اختبار SHA الجديد: PENDING exact-SHA GitHub Actions.
- لا تغييرات بقاعدة إنتاج أو اعتماديات أو secrets.
- next_task_id: `NASR1-DB-MIGRATION-ORDER-001` حتى مرور CI.

## 2026-10-18 — NASR1-LINT-BASELINE-001 — إصلاح ESLint بعد نجاح DB acceptance
- SHA الأساس: `7df4b5a48d52b71933d2c90885b600e61f1caf81`; [Actions 39140570076](https://github.com/Report-Engainall/Nasr1/actions/runs/39140570076).
- النتائج المثبتة: Bun install PASS؛ unit tests PASS؛ isolated PostgreSQL migrations/business acceptance PASS؛ ESLint FAIL (8 errors / 9 warnings)؛ build وpreview/dev smoke لم يبدأا.
- تغييرات المصدر: تجاهل مرجع READY_TO_REUSE وREFERENCE_ONLY من lint فقط؛ إزالة explicit-any من الصفحات القديمة باستخدام أنواع ثابتة أو unknown+error narrowing؛ تثبيت timer holder دون تغيير timeout.
- لا اعتماديات جديدة ولا تعطيل لقواعد lint. الاختبار على SHA الناتج: pending exact-SHA CI.
- next_task_id: `NASR1-LINT-BASELINE-001` حتى اجتياز lint/build/routes.

## 2026-10-18 — NASR1-OPS-TASK-CENTER-001 — مركز المهام فوق ai_tasks الحالية
- SHA الأساس: `36c604e95de1e8accb3225824596c49a1ae9db17`; بوابة الأساس [39140900669](https://github.com/Report-Engainall/Nasr1/actions/runs/39140900669) = SUCCESS في التثبيت، الاختبارات، PostgreSQL acceptance، lint، build وpreview/dev smoke.
- قاعدة البيانات: role lanes/source/due/assignment/resolution/metadata، unique source-event index، triggers للطلبات والمخزون والفواتير وعروض الأسعار والاستيراد، RPC للمصالحة والإنشاء وتغيير الحالة، وسجل audit. لا direct authenticated DML على ai_tasks.
- الواجهة: route `/admin/tasks`، task center RTL، فلترة حسب الدور/الحالة/البحث، مصالحة idempotent للبيانات الموجودة، استلام وإنجاز، وطباعة A4 landscape للنتائج الظاهرة.
- اختبارات قاعدة البيانات المضافة: منع تكرار الحدث، إعادة فتح مهمة نقص المخزون فقط بعد عبور حد المخزون مرة أخرى، RPC مدقق، رفض الكتابة المباشرة، عزل مهام المحاسب عن العميل/الأدوار الأخرى.
- لا checkout محلي؛ exact-SHA GitHub Actions هو بوابة القبول التالية.
- next_task_id: `NASR1-OPS-TASK-CENTER-001` حتى قراءة CI على SHA الجديد؛ لا يُنسب PASS لهذا التغيير مقدمًا.

## 2026-10-18 — إصلاح تابع لـ NASR1-OPS-TASK-CENTER-001
- Commit الميزة: `8842478d9b70fd11437c892bbf9cdcd8d22a1410`; [CI 39142666048](https://github.com/Report-Engainall/Nasr1/actions/runs/39142666048) = FAIL عند Vitest transform: duplicate import/declaration `AiTask` في `src/lib/api.ts`. 97 اختبارات ناجحة، وأربع suites فشلت قبل التنفيذ الفعلي بسبب خطأ الترجمة نفسه.
- الإصلاح: حذف الاستيراد المكرر من القائمة المضافة مع إبقاء import الأصلي، دون تغيير سلوك التنفيذ أو الصلاحيات.
- DB, lint, build, smoke ما زالت pending على SHA الإصلاح التالي.
- next_task_id: `NASR1-OPS-TASK-CENTER-001`.

## 2026-10-18 — إثبات نجاح NASR1-OPS-TASK-CENTER-001
- Code SHA: `283d2def75e2608e0aac1d2d16aabf81e7842347`.
- [GitHub Actions 39142794601](https://github.com/Report-Engainall/Nasr1/actions/runs/39142794601) = SUCCESS.
- Unit tests: 15 test files passed; 165 tests passed.
- PostgreSQL 17: migrations and commerce acceptance PASS. Task-specific proof: `PASS operational task center: source-event idempotency, stock threshold lifecycle, audited RPC writes, accountant-only lane and customer isolation`.
- ESLint PASS; Build PASS; production preview smoke PASS; dev-server smoke PASS.
- Route test includes `/admin/tasks`; migration extends `ai_tasks` and uses audited RPC writes, tenant and role policy, and unique source-event idempotency.
- Next task: `NASR1-TASK-ASSIGNMENT-001` — secure admin-only named assignee selection and role validation in the task UI.

## 2026-10-18 — NASR1-TASK-ASSIGNMENT-001 — اختيار موظف مسند بالاسم
- الأساس: `c3bc527443cd05ab07d16e15c3ae18401e95db0c`; مركز المهام السابق اجتاز [CI 39142794601](https://github.com/Report-Engainall/Nasr1/actions/runs/39142794601).
- Migration جديد `20261018020000_task_assignee_directory.sql`: RPC `list_operational_task_assignees()` يسرد فقط الحسابات النشطة ذات الأدوار من مؤسسة المدير/المسؤول؛ لا يوسع RPC إدارة الأدوار admin-only.
- UI: اختيار الموظف، تصفية المرشحين حسب دور المهمة، وإظهار اسم المسؤول في القائمة والطباعة حين يكون مرئيًا للحساب.
- اختبارات قاعدة البيانات: عزل المؤسسة، منع المحاسب من تعداد الدليل، نجاح إسناد صحيح، ورفض إسناد مهمة مبيعات لمحاسب مالي فقط.
- exact-SHA CI الجديد pending؛ لا PASS قبل قراءته.

## 2026-10-18 — إثبات نجاح NASR1-TASK-ASSIGNMENT-001
- Code SHA: `ae13810429cd4923108da4d840d187ff5590b489`.
- [GitHub Actions 39143265290](https://github.com/Report-Engainall/Nasr1/actions/runs/39143265290) = SUCCESS في جميع المراحل: التثبيت، الوحدات، PostgreSQL 17 acceptance، lint، build، preview smoke وdev smoke.
- هجرة `20261018020000_task_assignee_directory.sql` أضافت `list_operational_task_assignees()`، صالحة للمسؤول/المدير فقط ومحدودة بالمؤسسة الحالية. قائمة الإسناد لا تغير RPC إدارة الأدوار admin-only.
- الواجهة تعرض أسماء الموظفين للمدير/المسؤول فقط وتفلتر المرشحين بتوافق الدور. الخادم يعيد التحقق عند إنشاء المهمة.
- اختبارات DB الإضافية اجتازت: لا مستخدم من مؤسسة أخرى في الدليل؛ المحاسب لا يستطيع تعداد الدليل؛ إسناد صحيح محفوظ؛ إسناد مهمة sales لمستخدم accountant-only مرفوض.
- `next_task_id = NASR1-FINANCE-COLLECTION-AGING-001`.


## 2026-10-18 — NASR1-OPS-TASK-FILTERS-001 — توسيع فلاتر مركز المهام
- الهدف: `Report-Engainall/Nasr1` / `main` فقط.
- Code commit: [6123321e99e35af85359797c9331532c0b9c5c6e](https://github.com/Report-Engainall/Nasr1/commit/6123321e99e35af85359797c9331532c0b9c5c6e).
- الملف المعدل: `src/components/TaskCenter.tsx`.
- التنفيذ: فلاتر الأولوية، الموظف المسؤول/غير المسندة، وفترة تاريخ الإنشاء؛ تُطبّق جميعها على مجموعة `filtered` نفسها التي تستخدمها القائمة والطباعة، مع طباعة وصف المرشحات وعدد النتائج.
- لا اعتماديات جديدة، ولا تغييرات قاعدة بيانات أو بيانات إنتاج.
- تحقق القراءة بعد الحفظ: الملف على `main` يحتوي مرشحات الأولوية والتاريخ والمسؤول؛ هذا يثبت حفظ الكود فقط.
- الاختبارات: **PENDING** — لا يوجد حتى الآن دليل CI مقروء لهذا SHA؛ لا يُسجل TESTED/PASS قبل نتيجة Actions المطابقة.
- next_task_id: `NASR1-OPS-TASK-FILTERS-001-VERIFY-CI`; بعد اجتياز CI انتقل إلى `NASR1-FINANCE-COLLECTION-AGING-001` وافحص عقد الفواتير/الدفعات قبل أي حساب للرصيد.

## 2026-10-18 — NASR1-FINANCE-COLLECTION-AGING-001 — تنفيذ تقرير أعمار الذمم

- الهدف الوحيد: `Report-Engainall/Nasr1` / `main`.
- التنفيذ البرمجي: `supabase/migrations/20261018030000_staff_receivables_aging.sql` يضيف `fetch_staff_receivables_aging(limit, offset)` بصلاحية مالية ومؤسسة مشتقة من الجلسة الخادمية، ويحسب الرصيد من إجمالي الفاتورة ودفعات `customer_payments` المحفوظة، مع استبعاد الفواتير الملغاة، وتجميع مستقل لكل عملة، وفئات 1–30/31–60/61–90/>90 يومًا، وبند منفصل لتاريخ الاستحقاق المفقود، وترقيم صفحات مضبوط.
- دمج الواجهة في `src/components/CustomerWorkflows.tsx`: ملخص حسب العملة وفترات العمر، وتفاصيل فواتير تتضمن الإجمالي والمدفوع والمتبقي والعميل وتاريخ الاستحقاق، مع حالات تحميل/خطأ وإعادة المحاولة.
- قبول قاعدة البيانات: أضيفت في `scripts/test-database-migrations.mjs` تأكيدات لبيانات الاختبار 370000 إجماليًا و100000 مدفوعًا و270000 متبقيًا، والفئات، وملخص العملة، وحدود الصفحة ورفض limit=0، ورفض العميل استدعاء RPC المالية.
- فشل أولي حقيقي: CI [39144533065](https://github.com/Report-Engainall/Nasr1/actions/runs/39144533065) أخفق لأن عمود العميل المفترض `company_name` غير موجود. تمت قراءة تعريف `customers` في `20261006063522_d656e1d4-1ca3-4cd7-8542-504968bc356c.sql` وتصحيح الاستعلام إلى `business_name` و`contact_name`، ولم تُضعّف الاختبارات.
- إثبات النسخة المصححة: commit [437527ff30bc44ce9a1cdf170c89edd5fc5b3104](https://github.com/Report-Engainall/Nasr1/commit/437527ff30bc44ce9a1cdf170c89edd5fc5b3104) — [Actions 39144691226](https://github.com/Report-Engainall/Nasr1/actions/runs/39144691226) **SUCCESS** لجميع المراحل: Bun lock/install، unit tests، PostgreSQL 17 migration/workflow acceptance، lint، build، preview smoke وdev smoke.
- لا اعتماديات جديدة، ولا تعديل لقاعدة الإنتاج. دليل DB في هذا المسار هو PostgreSQL 17 المعزول ضمن CI فقط.
- إضافة طباعة مجانية لكشف أعمار الذمم: [commit 393ca96b73c3b0d642bc5fc9b05681e84c6611d6](https://github.com/Report-Engainall/Nasr1/commit/393ca96b73c3b0d642bc5fc9b05681e84c6611d6) أضاف زر الطباعة، و[commit 6a6a89a0d1d8ed5f228fddcdf3b6c1f3f003a81b](https://github.com/Report-Engainall/Nasr1/commit/6a6a89a0d1d8ed5f228fddcdf3b6c1f3f003a81b) أضاف CSS للطباعة RTL/A4 بإخفاء زر الطباعة، وطباعة الملخص والصفحة التفصيلية المعروضة فقط. نتيجة CI الخاصة بدفعة الطباعة **PENDING** حتى قراءة run مطابق للـSHA الحالي؛ لا يُنقل PASS من `437527f` إليها.
- next_task_id: `NASR1-FINANCE-AGING-PRINT-001-VERIFY-CI`; بعد نجاحه انتقل إلى مراجعة اختبارات ودقة تصدير/طباعة المالية، مع إبقاء ملخص إجمالي الفواتير الكامل منفصلًا عن صفحة التفاصيل المعروضة.

## 2026-10-18 — إغلاق بوابة CI لدفعة طباعة أعمار الذمم

- طباعة الواجهة: [Actions 39144916657](https://github.com/Report-Engainall/Nasr1/actions/runs/39144916657) على commit `393ca96b73c3b0d642bc5fc9b05681e84c6611d6` = **SUCCESS**.
- CSS/RTL/A4: [Actions 39144928394](https://github.com/Report-Engainall/Nasr1/actions/runs/39144928394) على commit `6a6a89a0d1d8ed5f228fddcdf3b6c1f3f003a81b` = **SUCCESS**؛ unit tests وPostgreSQL 17 acceptance وlint وbuild وpreview smoke وdev smoke كلها SUCCESS.
- يطبع التقرير المالي الملخص حسب العملة وتفاصيل الصفحة المحمّلة فقط. زر الطباعة مخفي في نسخة الورق، وتطبق قواعد CSS إعداد الطباعة RTL/أبيض وأسود/A4 من المتصفح؛ لم تُضف مكتبة أو خدمة مدفوعة.
- حالة الإثبات: `IMPLEMENTED` و`TESTED` على SHA `6a6a89a0d1d8ed5f228fddcdf3b6c1f3f003a81b`. لا يوجد `BROWSER-PROVEN` أو `PRODUCTION-PROVEN`؛ لا تفترض تشغيل نافذة طباعة فعلية لمجرد نجاح smoke/build.
- بعد هذا الإدخال توجد تحديثات توثيقية أحدث في `main`؛ نتيجة CI الخاصة بأحدث SHA التوثيقي مطلوبة قبل إغلاق جلسة الاستئناف.
- next_task_id: `NASR1-FINANCE-AGING-PRINT-002-TESTS` — أضف اختبار واجهة مستهدفًا للطباعة ضمن بيئة الاختبار القائمة إن أمكن دون إدخال مكتبات جديدة، وأثبت حالات الملخص/الصفحة المعروضة وحدود التقرير المطبوع.

## 2026-10-18 — NASR1-FINANCE-AGING-UI-TEST-001 — اختبار واجهة الطباعة والصلاحيات

- أضيف الملف `src/components/CustomerWorkflows.finance-aging.test.tsx` لاختبار إظهار فاتورة ذات رصيد محسوب من مصدر الاختبار، والتصنيف عند غياب تاريخ الاستحقاق، واستدعاء `window.print`، وعدم تنفيذ RPC المالية لمستخدم بلا دور مالي.
- أول تشغيل على SHA `356c4fcf3ec002fccd3dea5e5c2698465d9b38e4` أخفق في assertion نصي ثابت لترقيم الصفحات؛ run [39145139101](https://github.com/Report-Engainall/Nasr1/actions/runs/39145139101): 15 ملف اختبار ناجح وملف واحد فاشل، بإجمالي 166 اختبارًا ناجحًا وواحدًا فاشلًا. السبب هو اختلاف تنسيق الأرقام بحسب locale العربية، لا فشل شاشة التقرير.
- تم إصلاح المطابقة لتستخدم regex مرنًا في commit [cf2b5893e20b5a9d500249ba215feab5c67b6c21](https://github.com/Report-Engainall/Nasr1/commit/cf2b5893e20b5a9d500249ba215feab5c67b6c21). نتيجة CI لهذا الإصلاح **PENDING** عند كتابة السجل؛ لا يجوز تسجيل نجاح الاختبار قبل قراءة run المطابق.
- لا اعتماديات جديدة. يبقى اختبار نافذة الطباعة الفعلية في متصفح حقيقي غير مثبت.
- next_task_id: `NASR1-FINANCE-AGING-UI-TEST-VERIFY-CI` — اقرأ CI على commit `cf2b5893e20b5a9d500249ba215feab5c67b6c21`؛ أصلح أي فشل فعلي ثم حدّث الحالة والـrequirement registry.

### نتيجة إصلاح اختبار أعمار الذمم — SUCCESS

- الإصلاح: `cf2b5893e20b5a9d500249ba215feab5c67b6c21`، واختبار exact-SHA: [Actions 39145164044](https://github.com/Report-Engainall/Nasr1/actions/runs/39145164044) = **SUCCESS**.
- نجحت جميع المراحل: frozen Bun lock/install، unit tests، PostgreSQL 17 acceptance، lint، build، preview smoke وdev smoke. اختبار الواجهة وتصحيح المطابقة locale-safe اجتازا ضمن هذا التشغيل.
- تبقى حدود الإثبات: نجاح اختبار UI لا يساوي اختبار متصفح تفاعلي لميزة الطباعة ولا إثبات النشر الإنتاجي.
- next_task_id: `NASR1-FINANCE-AGING-PRINT-002-TESTS` — يظل اختبار واجهة التقرير والطباعة موجودًا ومغطى؛ الخطوة التالية فحص مسار PDF المالي/التصدير الحالي وتحديد فجوة واحدة قابلة للإغلاق دون إنشاء نظام موازٍ أو إضافة اعتماديات.

## 2026-10-18 — NASR1-FINANCE-PDF-VALIDATION-001 — رفض المبالغ المالية غير الممكنة

- المراجعة وجدت أن `validatePayload()` في `src/lib/finance-document-pdf.ts` كان يقبل قيمة فاتورة سالبة أو مبلغ دفعة صفريًا/سالبًا، رغم أن عقد قاعدة البيانات يفرض `customer_invoices.total_amount >= 0` و`customer_payments.amount > 0`.
- التنفيذ: رفض إجمالي الفاتورة السالب، ورفض دفعات الحساب الصفريّة أو السالبة قبل إنشاء PDF. لم يتم تغيير احتساب الرصيد أو حدود الخصوصية.
- الاختبارات: `src/lib/finance-document-pdf.test.ts` يضيف تأكيدات رفض إجمالي فاتورة `-1.00` ودفعة `0.00` ودفعة `-0.01`.
- commit التنفيذ [c6f67a8ee45ee6da04a1760d663a32d1cf697b06](https://github.com/Report-Engainall/Nasr1/commit/c6f67a8ee45ee6da04a1760d663a32d1cf697b06); commit الاختبار [4e8e8a70f8d987585e436f1c8e6877dbb9276e58](https://github.com/Report-Engainall/Nasr1/commit/4e8e8a70f8d987585e436f1c8e6877dbb9276e58).
- حالة CI أثناء التحديث: run [39145321118](https://github.com/Report-Engainall/Nasr1/actions/runs/39145321118) للتنفيذ الأساسي، وrun [39145334417](https://github.com/Report-Engainall/Nasr1/actions/runs/39145334417) لنسخة الاختبار؛ كلاهما كان قيد التشغيل عند كتابة هذا السجل. **لا تُسجّل PASS حتى التحقق من النتيجة النهائية للمطابقة الصحيحة.**
- اختبار واجهة أعمار الذمم والطباعة اجتاز: [Actions 39145164044](https://github.com/Report-Engainall/Nasr1/actions/runs/39145164044) على `cf2b5893e20b5a9d500249ba215feab5c67b6c21` = SUCCESS لجميع الخطوات.
- next_task_id: `NASR1-FINANCE-PDF-VALIDATION-VERIFY-CI` — اقرأ نتائج التشغيلين أعلاه، أصلح أي فشل، ثم حدّث سجل المتطلبات ونقطة الاستئناف.

### إغلاق بوابة تشديد تحقق PDF المالي — SUCCESS

- النسخة التي تضم المنطق والاختبارات: [commit `4e8e8a70f8d987585e436f1c8e6877dbb9276e58`](https://github.com/Report-Engainall/Nasr1/commit/4e8e8a70f8d987585e436f1c8e6877dbb9276e58).
- [Actions 39145334417 — SUCCESS](https://github.com/Report-Engainall/Nasr1/actions/runs/39145334417): نجحت unit tests وPostgreSQL 17 acceptance وlint وbuild وpreview smoke وdev smoke.
- النتيجة: الحالات المستحيلة (إجمالي فاتورة سالب، دفعة صفرية أو سالبة) مرفوضة قبل إنشاء كشف الحساب PDF، مع اختبارات رجعية مضافة.
- الحالة: `IMPLEMENTED` + `TESTED` على SHA أعلاه. لا يُدّعى اختبار متصفح أو إنتاج مباشر.
- next_task_id: `NASR1-FINANCE-STATEMENT-OVERDUE-LABEL-001` — مراجعة عرض حالة الفاتورة في PDF مقابل due_at/الرصيد الفعلي، وإضافة اختبار حتمي إن كانت الفجوة مؤكدة.

## 2026-10-18 — NASR1-FINANCE-STATEMENT-OVERDUE-LABEL-001 — تحديث حالة الفاتورة في كشف PDF

- الفجوة المؤكدة: `statusLabel()` في كشف الحساب كان يعتمد على `status` فقط، بينما قيم المخطط الفعلي لا تشمل حالة `overdue`؛ لذلك الفاتورة غير المسددة التي تجاوزت `due_at` قد تظهر «مستحقة» بدل «متأخرة».
- أضيف `resolveCustomerStatementInvoiceStatus()` لتحديد الحالة باستخدام `due_at` مقابل وقت ثابت لتوليد المستند، ورصيد الفاتورة بعد الدفعات؛ يعرض «متأخرة» و«متأخرة جزئيًا» عند ثبوت التأخر، ويحافظ على «مدفوعة» و«ملغاة»، ويعامل التاريخ المفقود/غير الصالح كغير محدد بدل اختلاق تأخر. الكود: [3c1bee5dea79cd055b3ac8d402adfbf7cf904f15](https://github.com/Report-Engainall/Nasr1/commit/3c1bee5dea79cd055b3ac8d402adfbf7cf904f15).
- أضيفت اختبارات حتمية: فاتورة مستحقة ومتأخرة، متأخرة جزئيًا، استحقاق مستقبلي، تاريخ مفقود، مدفوعة بحسب حالة المصدر، مدفوعة بحسب الرصيد المسدد، وملغاة. [Commit الاختبار 9b10d34b4b61c92871b8cc6d3874909d34f79e0a](https://github.com/Report-Engainall/Nasr1/commit/9b10d34b4b61c92871b8cc6d3874909d34f79e0a).
- فشل CI كشف اعتماد الفاتورة PDF الفردية على دالة `statusLabel()` نفسها التي استبدلناها لكشف الحساب؛ run [39145577858](https://github.com/Report-Engainall/Nasr1/actions/runs/39145577858) فشل اختبارين من هذه العلة المحددة، وrun [39145591658](https://github.com/Report-Engainall/Nasr1/actions/runs/39145591658) يماثل SHA الاختبارات. تمت المعالجة بإعادة دالة المصدر-status المستقلة للفاتورة الفردية مع إبقاء دالة الحساب مشتقة من الدفعات/الاستحقاق: [fix commit ba9523fdbe643d7a6503dce54f6d1b740f3f06ca](https://github.com/Report-Engainall/Nasr1/commit/ba9523fdbe643d7a6503dce54f6d1b740f3f06ca).
- نتيجة CI لإصلاح `ba9523f` كانت **PENDING** عند كتابة هذا الإدخال؛ run المطابق [39145659217](https://github.com/Report-Engainall/Nasr1/actions/runs/39145659217). لا تُسجل نجاحًا قبل قراءة النتيجة النهائية.
- فشل منفصل في run [39145507514](https://github.com/Report-Engainall/Nasr1/actions/runs/39145507514) توقف عند تنزيل Bun بسبب `Unexpected HTTP response: 403`، دون تشغيل الاختبارات. كان ذلك عطل تنزيل خارجي عابرًا؛ تنزيل Bun نجح لاحقًا في [39145577858](https://github.com/Report-Engainall/Nasr1/actions/runs/39145577858)، وسبب فشله كان اختبار التطبيق المذكور أعلاه لا Bun.

## سجل الفحوص المكتملة — لا تُعد من البداية

هذه الموضوعات مكتملة في هذه الجلسة بأدلة SHA/Actions؛ لا تُكرر فحصها في الانطلاقة التالية إلا إذا تغيّر الكود المعني أو أظهر CI فشلًا جديدًا:

- مركز المهام، مولد الأحداث/منع التكرار، صلاحيات المؤسسة/الدور، ودليل الإسناد: [39143265290 SUCCESS](https://github.com/Report-Engainall/Nasr1/actions/runs/39143265290).
- فلاتر الأولوية والمسؤول والتاريخ التي تطابق القائمة والطباعة: [39144118407 SUCCESS](https://github.com/Report-Engainall/Nasr1/actions/runs/39144118407).
- تقرير أعمار الذمم من الفواتير/الدفعات، فصل العملات، الفئات والترقيم والتفويض: [39144691226 SUCCESS](https://github.com/Report-Engainall/Nasr1/actions/runs/39144691226).
- طباعة التقرير RTL/A4، ثم اختبار واجهته ومنع الدور غير المالي: [39144916657 SUCCESS](https://github.com/Report-Engainall/Nasr1/actions/runs/39144916657)، [39144928394 SUCCESS](https://github.com/Report-Engainall/Nasr1/actions/runs/39144928394)، [39145164044 SUCCESS](https://github.com/Report-Engainall/Nasr1/actions/runs/39145164044).
- رفض إجمالي فاتورة PDF السالب والدفعة الصفرية/السالبة: [39145334417 SUCCESS](https://github.com/Report-Engainall/Nasr1/actions/runs/39145334417).
- قاعدة العمل الدائمة «إنجاز برمجي/اختباري حقيقي في كل انطلاقة» في `AGENTS.md`: [39144280302 SUCCESS](https://github.com/Report-Engainall/Nasr1/actions/runs/39144280302).

- next_task_id: `NASR1-FINANCE-STATEMENT-OVERDUE-LABEL-VERIFY-CI` — اقرأ run `39145659217` فقط لهذا التغيير. إذا نجح، حدّث نقطة الاستئناف وسجل المتطلبات ثم انتقل إلى فجوة جديدة دون إعادة الفحوص المكتملة أعلاه.

### إغلاق تنفيذ وسم التأخر في كشف الحساب PDF — SUCCESS

- SHA المختبر: [commit `ba9523fdbe643d7a6503dce54f6d1b740f3f06ca`](https://github.com/Report-Engainall/Nasr1/commit/ba9523fdbe643d7a6503dce54f6d1b740f3f06ca).
- [Actions 39145659217 — SUCCESS](https://github.com/Report-Engainall/Nasr1/actions/runs/39145659217): frozen Bun lock/install، unit tests، PostgreSQL 17 acceptance، lint، build، production-preview smoke، وdev-server smoke جميعها نجحت.
- الاختبارات الجديدة لاختلاف الحالة حسب تاريخ الاستحقاق والمدفوعات اجتازت؛ كما نجحت اختبارات PDF الفاتورة الفردية بعد إعادة فصل `statusLabel()` الخاص بها عن `resolveCustomerStatementInvoiceStatus()` الخاص بكشف الحساب.
- المحاولات التي فشلت في `39145577858` و`39145591658` انتهت بمعالجة مرجعية: `statusLabel is not defined` لأن محرر كشف الحساب أزال دالة كانت تستخدمها الفاتورة الفردية. `ba9523f` يعيد تلك الدالة بشكل مستقل؛ لا حاجة لإعادة تحليل هذا السبب.
- الحالة النهائية: `IMPLEMENTED` + `TESTED` على SHA أعلاه. لا `BROWSER-PROVEN` ولا `PRODUCTION-PROVEN`.
- next_task_id: `NASR1-FINANCE-STATEMENT-DUE-DATE-DISPLAY-001` — اجعل تاريخ الاستحقاق ظاهرًا في كشف PDF بجوار تاريخ الإصدار، مع اختبار pagination وتنسيق RTL، دون تغيير مصادر الأرصدة أو صلاحياتها.

## تعليمات عدم تكرار العمل المكتمل

- نقطة التوقف لا تعني الرجوع لجرد المشروع أو مراجعة مكونات سبق اختبارها. ابدأ من `CURRENT_EXECUTION_STATE.md`، اقرأ فقط حالة SHA الحالي ونتيجة البوابة ذات الصلة بالدفعة النشطة، ثم نفّذ `NASR1-FINANCE-STATEMENT-DUE-DATE-DISPLAY-001` مباشرة.
- لا تعِد فحص مركز المهام، دليل إسناد الموظفين، فلاتر المهام، تقرير أعمار الذمم، طباعة تقرير الأعمار، أو التحقق من المبالغ السالبة في PDF؛ نتائجها وSHAs وروابط CI موثقة في هذا السجل أعلاه. أعد تلك الاختبارات فقط إذا تغير الكود المعني أو كشف CI عن regression.

## 2026-10-18 — NASR1-FINANCE-STATEMENT-DUE-DATE-DISPLAY-001 — إظهار الاستحقاق واختبار الترقيم

- تغيّر `src/lib/finance-document-pdf.ts` لإظهار تاريخ الإصدار وتاريخ الاستحقاق معًا في كشف الحساب PDF، على سطرين داخل عمود التاريخ نفسه لمنع تداخل الأعمدة بعد زيادة ارتفاع الصف. التاريخ المفقود أو غير الصالح يبقى `—` ولا يستنتج النظام تاريخًا بديلًا.
- أضيف `formatFinanceDocumentDate()` واختبار حتمي للمدخل الصحيح و`null` و`undefined` والتاريخ غير الصالح.
- أضيف اختبار قبول لتوليد كشف من 45 فاتورة بتاريخ استحقاق حقيقي أو مفقود، والتحقق من أن PDF ينشئ أكثر من صفحة ولا يرفض المستند. الاختبار: `src/lib/finance-document-pdf.test.ts`.
- الكود: [commit `a8e838fe64a0f90530d58cf165fe8b8e56e0e4e7`](https://github.com/Report-Engainall/Nasr1/commit/a8e838fe64a0f90530d58cf165fe8b8e56e0e4e7). اختبارات التنسيق والترقيم: [commit `84e0f424351bd22a9f5fc468852a8fe07b5596a2`](https://github.com/Report-Engainall/Nasr1/commit/84e0f424351bd22a9f5fc468852a8fe07b5596a2).
- [Exact-SHA Actions 39146074209 — SUCCESS](https://github.com/Report-Engainall/Nasr1/actions/runs/39146074209): Bun lock/install، unit tests، PostgreSQL 17 acceptance، lint، build، preview smoke، dev smoke، والتنظيف النهائي كلها نجحت.
- فحص الفاتورة PDF الفردية أثناء تحديد النطاق أثبت أن تاريخ الإصدار والاستحقاق موجودان أصلًا هناك (`buildCustomerInvoicePdf`) ويستعملان المنسق نفسه. هذه المراجعة اكتملت ولا تحتاج إعادة فحص ما دام ذلك المسار لم يتغير.
- الحالة: `IMPLEMENTED` + `TESTED` على SHA `84e0f424351bd22a9f5fc468852a8fe07b5596a2`. لا يوجد ادعاء باختبار متصفح فعلي أو إثبات نشر إنتاجي.
- next_task_id: `NASR1-FINANCE-STATEMENT-AGING-SUMMARY-001` — أضف ملخصًا واضحًا للمبالغ المتأخرة داخل إجمالي الذمم حسب كل عملة في كشف الحساب، محسوبًا من due_at والدفعات، واختبر الحساب مع العملات المختلطة والفواتير الملغاة وتاريخ استحقاق مفقود.

## إغلاق مراجعة تاريخ الفاتورة الفردية — لا تُكرر

- ثبت أن `buildCustomerInvoicePdf()` يعرض بالفعل تاريخ الإصدار وتاريخ الاستحقاق في رأس الفاتورة. لا تضف عمودًا مكررًا ولا تعِد هذه المراجعة في الانطلاقة التالية إلا بعد تغيير ذلك المسار. مرجع الكود الحالي: `src/lib/finance-document-pdf.ts` على SHA `cb52fa3b7c94dc88455f98aa25617844f8c76f2e` قبل دفعة الاختبار الأخيرة؛ أحدث CI ناجح `39146074209` يشمل التغييرين.

## قاعدة الاستئناف

ابدأ دائمًا من `CURRENT_EXECUTION_STATE.md`، واعمل على `next_task_id` فقط. القائمة أعلاه توثيق نهائي للفحوص المكتملة؛ لا تُعد التحليل أو الفحص أو الاختبار السابق إلا إذا تغير الكود المعني أو أظهر CI عن خطأ جديد.


## 2026-10-18 — NASR1-CURRENT-IMPLEMENTATION-SNAPSHOT-001 — نسخ أحدث كود إلى مجلد المصالحة

- الطلب: حفظ أحدث الأكواد الفعلية المختبرة في المجلد التجميعي لتسريع التنفيذ التالي، دون خلط ملفات المصدر القديمة مع كود Nasr1 أو إعادة فحص الأعمال المغلقة.
- المجلد الجديد: `docs/bolt-source-reconciliation/READY_TO_REUSE/Nasr1--verified-current-implementation/`.
- أضيفت 9 نسخ مطابقة للمسارات الحالية: `src/components/TaskCenter.tsx`، `src/components/CustomerWorkflows.tsx`، `src/components/CustomerWorkflows.finance-aging.test.tsx`، `src/lib/finance-document-pdf.ts`، `src/lib/finance-document-pdf.test.ts`، `src/styles.css`، `supabase/migrations/20261018030000_staff_receivables_aging.sql`، `scripts/test-database-migrations.mjs`، `AGENTS.md`.
- لكل ملف: المصدر المباشر على `main` قورن بالملف نفسه في commit الكود المختبر `84e0f424351bd22a9f5fc468852a8fe07b5596a2`; تطابقت بصمات Git blob، ثم أُنشئت نسخة Git blob أخرى بنفس SHA. التفاصيل في `CURRENT_NASR1_IMPLEMENTED_FILES.csv`.
- إصدار المرآة الأول اجتاز [Actions 39146625789 — SUCCESS](https://github.com/Report-Engainall/Nasr1/actions/runs/39146625789).
- المرآة الحالية تحدث إلى مصدر الكود `f830678ea99f4bb2318305a5f2e70ee761dbea1e` بعد ملخص أعمار الذمم؛ مصدر الكود اجتاز [Actions 39147039166 — SUCCESS](https://github.com/Report-Engainall/Nasr1/actions/runs/39147039166). CI للcommit التوثيقي/المرآة الحالية ما يزال PENDING عند كتابة الحالة.
- `READY_TO_REUSE/PROVENANCE_MANIFEST.csv` الأصلي لم يُعدّل، وهو لا يزال خاصًا بالمصادر المانحة. أضيف شرح منفصل إلى README لتحديد الفرق.
- تم تحديث `CURRENT_EXECUTION_STATE.md` وملف المتطلبات مع توثيق عدم تكرار العمل المكتمل.
- `next_task_id = NASR1-CURRENT-IMPLEMENTATION-SNAPSHOT-VERIFY-CI`.


## 2026-10-18 — NASR1-FINANCE-STATEMENT-AGING-SUMMARY-001 — ملخص المتأخر حسب العملة داخل PDF

- التنفيذ: `src/lib/finance-document-pdf.ts` يضيف `buildCustomerStatementCurrencySummary()` لحساب الإجمالي والمدفوع والمتبقي والمتأخر والرصيد الذي لا يملك تاريخ استحقاق صالحًا لكل عملة.
- المنطق يستخدم bigint بوحدات النقد الصغرى ووقت إصدار التقرير الثابت؛ يستبعد الفواتير الملغاة والمدفوعة بالكامل من المتأخر، ولا يصنف الاستحقاق المستقبلي على أنه متأخر.
- `src/lib/finance-document-pdf.test.ts` يختبر YER/USD/EUR والدفعات الجزئية والكاملة وفاتورة ملغاة ومدفوعاتها وموعدًا مستقبليًا وموعدًا مفقودًا. التشغيل الأول [39147011014](https://github.com/Report-Engainall/Nasr1/actions/runs/39147011014) أخفق في التوقع العددي للاختبار فقط؛ تم التصحيح وفق Vitest إلى YER مدفوع 8000 ومتَبقٍ 11000 minor units في commit [`f830678ea99f4bb2318305a5f2e70ee761dbea1e`](https://github.com/Report-Engainall/Nasr1/commit/f830678ea99f4bb2318305a5f2e70ee761dbea1e).
- [Exact-SHA CI 39147039166 — SUCCESS](https://github.com/Report-Engainall/Nasr1/actions/runs/39147039166): unit tests وPostgreSQL 17 acceptance وlint وbuild وpreview/dev smoke جميعها اجتازت.
- المرآة `docs/bolt-source-reconciliation/READY_TO_REUSE/Nasr1--verified-current-implementation/` تُحدّث في نفس دفعة التوثيق مع manifest منفصل عن provenance المشاريع المانحة.
- الحالة: `IMPLEMENTED` + `TESTED` على SHA `f830678ea99f4bb2318305a5f2e70ee761dbea1e`. لا يثبت هذا اختبار متصفح أو نشرًا إنتاجيًا.
- next_task_id: `NASR1-CURRENT-IMPLEMENTATION-SNAPSHOT-VERIFY-CI` ثم `NASR1-FINANCE-STATEMENT-AGING-SUMMARY-RECONCILE`.


### إغلاق تحديث مرآة الكود الحالية — SUCCESS

- Commit المرآة والوثائق: [`1039b9424be66ea4feabb003096c3bfd3fff5319`](https://github.com/Report-Engainall/Nasr1/commit/1039b9424be66ea4feabb003096c3bfd3fff5319).
- [Actions 39147434273 — SUCCESS](https://github.com/Report-Engainall/Nasr1/actions/runs/39147434273): Bun lock/install، unit tests، PostgreSQL 17 acceptance، lint، build، preview smoke وdev smoke كلها ناجحة.
- Readback للمجلد: manifest يحمل 9 صفوف، كل صف `git_blob_identical=YES`; `src/lib/finance-document-pdf.ts` و`.test.ts` داخل المرآة لهما بصمتا المصدر الأحدث `66ed7294...` و`07d3fc96...`. `PROVENANCE_MANIFEST.csv` الخاص بالمانحين لم يُعدّل.
- تم إغلاق `NASR1-CURRENT-IMPLEMENTATION-SNAPSHOT-VERIFY-CI`; next task هو `NASR1-FINANCE-STATEMENT-AGING-SUMMARY-RECONCILE`.


## 2026-10-18 — NASR1-CUSTOMER-STATEMENT-FULL-AGING-SUMMARY-001 — مجاميع كاملة خادمية لكشف العميل

- الفجوة: `get_customer_account_statement()` كان يعيد حتى 200 فاتورة و500 دفعة، وكان PDF يحسب أعمار الذمم من السجلات العائدة فقط؛ هذا قد يقلل المدفوع أو الرصيد المتأخر في عميل كثير الحركات.
- migration جديدة `supabase/migrations/20261018040000_customer_statement_full_aging_summary.sql` تستبدل جسم الـRPC الحالي نفسه (ليس RPC موازٍ)، وتضيف `summary_as_of_utc` و`summary` حسب العملة من كل الفواتير والمدفوعات للمؤسسة/العميل المصدق عليه. تبقى قوائم التفاصيل محدودة بـ200/500.
- تُضاف إلى كل فاتورة في التفاصيل قيم `paid_amount` و`outstanding_amount` من دفترها الكامل، لتظل صفوف الفاتورة صحيحة حتى لو كانت بعض المدفوعات أقدم من أحدث 500 دفعة المعروضة.
- `src/lib/finance-document-pdf.ts` يفضّل الملخص الخادمي إذا وُجد ويطابق cut-off الخادمي عند حساب حالة التأخر، ويتحقق من مبالغ وقيم الملخص وازدواج العملات وبقاء بنود التأخر داخل المتبقي باستخدام bigint. إذا لم يكن الملخص موجودًا في نسخة backend أقدم، يحتفظ بfallback واضح أنه للسجلات المعادة فقط.
- `src/lib/finance-document-pdf.test.ts` يختبر دقة bigint للأرقام الكبيرة، المجاميع ذات العملة المتعددة، المدخل الخادمي الموثوق والـfallback، والبيانات غير الصحيحة.
- `scripts/test-database-migrations.mjs` يتحقق من summary cutoff ومجاميع الفاتورة/الدفع/المتبقي والـbuckets وعزل ملخص العميل عن العميل الآخر، بالإضافة إلى الحقول لكل فاتورة.
- عالجنا أخطاء اختبار حقيقية خلال التنفيذ: [39148570829](https://github.com/Report-Engainall/Nasr1/actions/runs/39148570829) و[39148691924](https://github.com/Report-Engainall/Nasr1/actions/runs/39148691924) كشفتا أخطاء تثبيت assertion/توقع bigint وإعادة تطبيع الملخص. لم تُخفف الاختبارات. الإصلاح النهائي [`98a80df80b366e811923b80d53fe06a519e754d0`](https://github.com/Report-Engainall/Nasr1/commit/98a80df80b366e811923b80d53fe06a519e754d0) اجتاز [Actions 39148856503 — SUCCESS](https://github.com/Report-Engainall/Nasr1/actions/runs/39148856503) بجميع المراحل.
- الحالة: `IMPLEMENTED + TESTED` على `98a80df80b366e811923b80d53fe06a519e754d0`. لا يوجد ادعاء بتطبيق migration في قاعدة الإنتاج أو اختبار متصفح مباشر.
- المرآة `docs/bolt-source-reconciliation/READY_TO_REUSE/Nasr1--verified-current-implementation/` تُزامن إلى نفس الكود المختبر؛ donor `PROVENANCE_MANIFEST.csv` يبقى دون تغيير.
- next_task_id: `NASR1-CUSTOMER-STATEMENT-SUMMARY-SNAPSHOT-VERIFY-CI` ثم `NASR1-CUSTOMER-STATEMENT-SUMMARY-CAP-BOUNDARY-001`.


## 2026-10-18 — إغلاق مرآة الكود بعد ملخص دفتر العميل الكامل

- commit المرآة/الوثائق: [`cbbcce4b1db64530f8234e82523e2b2aebbe6f53`](https://github.com/Report-Engainall/Nasr1/commit/cbbcce4b1db64530f8234e82523e2b2aebbe6f53).
- [Actions 39149188875 — SUCCESS](https://github.com/Report-Engainall/Nasr1/actions/runs/39149188875): unit tests، PostgreSQL 17 acceptance، lint، build، preview smoke وdev smoke اجتازت.
- readback للمجلد `READY_TO_REUSE/Nasr1--verified-current-implementation`: manifest يحتوي 10 صفوف، وكلها موسومة `git_blob_identical=YES`؛ تم التحقق من مرآة `src/lib/finance-document-pdf.ts` على blob `8729c401397a4c9000ab8714bfeb0a193f1dc2ab` وmigration ملخص الدفتر الكامل على blob `2734f6d88ba85d9556d7bbee5d142dce5c7556d9`. `PROVENANCE_MANIFEST.csv` للمانحين لم يُعدّل.
- تم إغلاق `NASR1-CUSTOMER-STATEMENT-SUMMARY-SNAPSHOT-VERIFY-CI`. لا تُعد مزامنة أو تدقيق المجلد في الانطلاقة التالية ما لم يتغير أحد الملفات أو يفشل CI.
- next_task_id: `NASR1-CUSTOMER-STATEMENT-SUMMARY-CAP-BOUNDARY-001` — إثبات حدود التفاصيل 200/500 مع بقاء الملخص كاملًا.


## 2026-10-18 — NASR1-CUSTOMER-STATEMENT-VOID-EXCLUSION-001 — إغلاق اختبار الحدّ 200/500 مع فاتورة ملغاة

- تحديث اختبار القبول في `scripts/test-database-migrations.mjs`: أنشأ 205 فواتير و505 دفعات، كما أضاف فاتورة ملغاة بقيمة 900.00 ودفعة 500.00، ثم قارن ملخص العميل الكامل قبل/بعد fixture باستخدام `BigInt` في الوحدات النقدية الصغرى.
- أثبت الاختبار أن تفاصيل RPC لا تتجاوز 200 فاتورة و500 دفعة؛ الفواتير/الدفعات الخارجـة عن قوائم التفاصيل لا تضيع من الملخص الكامل؛ الفاتورة الملغاة ومدفوعاتها لا تدخل الإجمالي أو المدفوع أو المتبقي أو المتأخر؛ ورصيد الفاتورة المعروضة يحسب الدفعات الـ505 كلها.
- سبب إخفاق سابق: تعبير regex للمال كان مفرط الهروب، ثم assertions طرحت مبالغ عبر JavaScript `Number`. أصلحنا regex واستخدمنا `BigInt`; الاختبارات لم تُخفف.
- الكود [`618e3d3c019ecd7d05ca0462ca954f908178b814`](https://github.com/Report-Engainall/Nasr1/commit/618e3d3c019ecd7d05ca0462ca954f908178b814) اجتاز [Actions 39150380395 — SUCCESS](https://github.com/Report-Engainall/Nasr1/actions/runs/39150380395): unit tests، PostgreSQL 17 acceptance، lint، build، preview smoke وdev smoke.
- تحديث مرآة `READY_TO_REUSE` والـmanifest قيد الإضافة في commit منفصل؛ CI الخاص بالمرآة مطلوب قبل إغلاق مزامنتها.
- next_task_id: `NASR1-CUSTOMER-STATEMENT-SUMMARY-SNAPSHOT-VERIFY-CI`.


## إغلاق مزامنة مرآة أحدث كود — SUCCESS
- كود الاختبار [`618e3d3c019ecd7d05ca0462ca954f908178b814`](https://github.com/Report-Engainall/Nasr1/commit/618e3d3c019ecd7d05ca0462ca954f908178b814) اجتاز [Actions 39150380395 — SUCCESS](https://github.com/Report-Engainall/Nasr1/actions/runs/39150380395): اختبار 205 فواتير و505 دفعات، استبعاد الفاتورة الملغاة ومدفوعاتها، مجاميع دقيقة بـBigInt، وحدود التفاصيل، وجميع مراحل CI.
- تمت مزامنة نسخة `scripts/test-database-migrations.mjs` إلى `READY_TO_REUSE/Nasr1--verified-current-implementation/` مع manifest من 10 ملفات؛ blob المصدر والنسخة `08193e20f311e82d87a3873ef4cf40ee800dc11a` متطابق.
- تحديث المرآة والوثائق [`c1d9d04ea969ba12f8cd748a3d06d6c9f40a303a`](https://github.com/Report-Engainall/Nasr1/commit/c1d9d04ea969ba12f8cd748a3d06d6c9f40a303a) اجتاز [Actions 39150638459 — SUCCESS](https://github.com/Report-Engainall/Nasr1/actions/runs/39150638459).
- تم إغلاق `NASR1-CUSTOMER-STATEMENT-SUMMARY-SNAPSHOT-VERIFY-CI`. لا تكرر التحقق أو إعادة نسخ الملفات العشرة ما لم تتغير المصادر.
- next_task_id: `NASR1-CUSTOMER-STATEMENT-AGING-CUTOFF-ALIGNMENT-001`.

## 2026-10-18 — NASR1-BOOT-RECOVERY-SOURCE-MANDATE-001
- الهدف: Report-Engainall/Nasr1/main فقط. هذه الدفعة تحدث ملفات الإقلاع والجرد ولا تدعي دمج ميزة من ZIP.
- SHA الأساس: 154ec48397164473010d40bd3b509c24f188030e؛ [Actions 39150932901 — SUCCESS](https://github.com/Report-Engainall/Nasr1/actions/runs/39150932901). هذه النتيجة للأساس فقط ولا تنتقل إلى commit الوثائق.
- أُغلقت NASR1-CUSTOMER-STATEMENT-AGING-CUTOFF-ALIGNMENT-001 على SHA الأساس مع CI مطابق.
- READY_TO_REUSE/PROVENANCE_MANIFEST.csv فيه 69 صفًا؛ سجل الدمج السابق لا يثبت قرارًا منفصلًا لكل عنصر، لذا المصالحة مفتوحة.
- https://github.com/Report-Engainall/report-insight-engine/tree/main/incoming-archives/nasr1-bolt-recovery-2026-10-17 يعرض Nasr1_Bolt_Before_Failure.zip (1,003,172 بايت؛ Git blob SHA-1 7c35f3ecde19dc5596fd22053be61924ef3d5318) وNasr1_Bolt_Restored_Current.zip (997,589 بايت؛ Git blob SHA-1 f01684a56e093a33a173b0965d1d7239c48f0936). لم تُنزّل البايتات ولم يُحسب SHA-256 أو يُختبر ZIP ولم يحدث استخراج؛ عدد الأعضاء مجهول.
- أضيف الملفان إلى ARCHIVE_MANIFEST.csv وSOURCE_INTEGRATION_LEDGER.csv بصفة metadata متاحة وغير مستخرجة؛ لم تُختلق صفوف أعضاء في ARCHIVE_MEMBERS.csv.
- لا تغييرات runtime/DB/dependencies. الاختبارات المحلية NOT RUN إن لم تتوفر workspace؛ يلزم CI exact-SHA للـcommit الجديد.
- next_task_id: NASR1-BOLT-RECOVERY-ARCHIVE-RECONCILIATION-001.

## 2026-10-18 — NASR1-BOLT-RECOVERY-ARCHIVE-RECONCILIATION-001 — evidence persisted

- Target: Report-Engainall/Nasr1 / main; immutable source: Report-Engainall/report-insight-engine@b1ca62ec277ff9f55c8e850e0470d61d81aaa138.
- Before_Failure: 1,003,172 bytes; SHA-256 d59b3084a0b51e26646cf08ffc9239d2ee440298e9799f079827a4939d31b365; Git blob SHA-1 7c35f3ecde19dc5596fd22053be61924ef3d5318; 359 members; ZIP integrity/safe extraction PASS.
- Restored_Current: 997,589 bytes; SHA-256 9e012da1795cb9549413f78366c3bd6885c593e5a56e2fea10d4cf3fe810b214; Git blob SHA-1 f01684a56e093a33a173b0965d1d7239c48f0936; 358 members; ZIP integrity/safe extraction PASS.
- Pair diff: {"IDENTICAL_CONTENT": 340, "CHANGED_CONTENT": 18, "BEFORE_ONLY": 1}; 717 member rows. Member decisions: {"EXCLUDED_SECURITY": 8, "TARGET_PRESENT_DIFFERENT_CONTENT_REVIEW": 108, "ALREADY_PRESENT_EXACT": 562, "MISSING_TARGET_CANDIDATE": 39}.
- READY_TO_REUSE path/hash audit: {"ALREADY_PRESENT_EXACT": 4, "TARGET_PATH_DIFFERS_REVIEW_CONTENT": 2, "TARGET_PATH_MISSING_REVIEW_CONTENT": 63} across 69 rows; semantic contract/API/RLS review is NOT COMPLETE.
- Security decision: archived code not executed; sensitive/password/grant content not copied; legacy SQL with DROP FUNCTION ... CASCADE not applied.
- Archive workflow run: https://github.com/Report-Engainall/Nasr1/actions/runs/39154736119.
- Source integration: legacy React Router AdminAuditLog adapted into src/components/AdminAuditLog.tsx and src/routes/admin_.audit.tsx; RLS hardening migration and real PostgreSQL boundary assertions added. Exact code SHA bb08320b690203f7f9b1ce65287e389e847c2dea / Actions run 39154450426 SUCCESS (unit, PostgreSQL 17/RLS, lint, build, preview and dev smoke).
- Failures retained truthfully: Actions run 39154189270 found JSX parse error; run 39154309412 found invalid template-literal escapes; corrected build passed run 39154450426.
- BROWSER-PROVEN=NOT PROVEN; PRODUCTION-PROVEN=NOT PROVEN; production Supabase migration=NOT RUN; Onyx live vendor round-trip=NOT RUN.
- next_task_id = NASR1-READY-TO_REUSE-SEMANTIC-INTEGRATION-001

 
## 2026-10-18 — NASR1-BOLT-RECOVERY-CI-REVALIDATION-001
- Target: Report-Engainall/Nasr1/main only.
- Added both immutable raw Bolt ZIP URLs to `scripts/reconcile-source-release-snapshots.py`, preserving the previously recorded expected byte counts and SHA-256 values. The downloader supports explicit raw URLs as well as release assets.
- Code commit: `92a948e83ebc05278b09d50aec410da490c76f7c`.
- Full checks exact-SHA: [Actions 39157355224 — SUCCESS](https://github.com/Report-Engainall/Nasr1/actions/runs/39157355224): frozen Bun lock, unit tests, PostgreSQL 17 migrations/RLS acceptance, lint, build, preview smoke and dev smoke.
- Archive audit exact-SHA: [Actions 39157355307 — SUCCESS](https://github.com/Report-Engainall/Nasr1/actions/runs/39157355307). Both Bolt snapshots passed expected byte-count/SHA-256 checks, ZIP path/size/ratio checks, full member decompression/CRC traversal, and bounded non-sensitive source/text extraction to temporary CI storage. No archived code was executed and no SQL applied.
- Refreshed SOURCE_INTEGRATION_LEDGER.csv and ARCHIVE_MANIFEST.csv to remove stale NOT DOWNLOADED claims and record the actual validation evidence.
- Archive integrity is not semantic integration. READY_TO_REUSE/PROVENANCE_MANIFEST.csv has 69 data rows; per-file contract/import/route/RLS review and useful missing feature integration remain open.
- IMPLEMENTED: explicit raw-source support in audit tooling. INTEGRATED: CI workflow. TESTED: full checks and ZIP audit on exact code SHA above. BROWSER-PROVEN=NOT PROVEN; PRODUCTION-PROVEN=NOT PROVEN; production migrations=NOT RUN; Onyx vendor round-trip=NOT RUN.
- next_task_id = NASR1-READY-TO-REUSE-SEMANTIC-INTEGRATION-001.

 
## 2026-10-18 — NASR1-READY-FINANCE-INPUT-001
- المصدر المراجع: `Report-Engainall/aghbari-commerce@00d7446bba9652ea40178a08b00c9da9a2bba8a1/src/services/finance.ts` (blob `d9c2131b2d582b5b5baa20e3b497cd272c3b31e9`).
- لم تُنسخ الخدمة القديمة بسبب اختلاف عقد Supabase وبنية الواجهة؛ كُيّفت حدود إدخال التحصيل إلى `src/lib/finance-input.ts` ووُصلت بالنموذج الفعلي في `src/components/CustomerWorkflows.tsx`. أضيف `src/test/finance-input.test.ts`.
- التحقق: [Actions 39157780840 — SUCCESS](https://github.com/Report-Engainall/Nasr1/actions/runs/39157780840), exact code SHA `dd6bdaac8225be3bc0c0bc8d266b5e13aaab6c75`: frozen lock, unit tests, PostgreSQL 17 migrations/RLS, lint, build, preview/dev smoke PASS.
- التغيير لا يستبدل تحقق قاعدة البيانات؛ لا فاتورة تاريخية أو بيانات demo أو خدمة مدفوعة أضيفت.
- الحالة: IMPLEMENTED=YES; INTEGRATED=YES; TESTED=PASS exact SHA; BROWSER-PROVEN=NOT PROVEN; PRODUCTION-PROVEN=NOT PROVEN.
- مراجعة بقية صفوف READY_TO_REUSE مستمرة؛ next_task_id = NASR1-READY-TO-REUSE-SEMANTIC-INTEGRATION-001.


## 2026-10-18 — NASR1-INVENTORY-AVAILABLE-STOCK-METRIC-001

- Target: `Report-Engainall/Nasr1` / `main`. Donor candidate: `Report-Engainall/aghbari-commerce@00d7446bba9652ea40178a08b00c9da9a2bba8a1`, `src/services/inventory.ts` blob `3506707a656e0db491b860d5e11ad28daeded5cf`; paired donor test blob `04d706d4f2f68f30743911b2f3dd3e824a0dd18c`.
- Corrected the active dashboard low-stock calculation to use `quantity_available`, not gross `quantity_on_hand`; made the dashboard surface inventory-read failure instead of silently calculating zero alerts. Added `countLowStockBalances` and unit coverage for reservations, threshold equality, zero/null threshold policy, invalid snapshots and empty sets.
- Semantic decision on donor service: its contract calls `transfer_inventory`, `set_stock_threshold`, `get_low_stock`, `start_stock_count`, `set_stock_count_line`, `complete_stock_count` and reads `stock_count_sessions/stock_count_lines`. Those names were absent from all 42 active target migration SQL files at code SHA `6e746a7684f4cf8696c3b2c2bbfdd8f410cd364f`. The donor test imports its legacy `./inventory` module, so it is not a drop-in target test. Rejected wholesale copy; no unsupported RPC or SQL was added.
- Code files: `src/lib/inventory-metrics.ts`, `src/lib/api.ts`, `src/test/inventory-metrics.test.ts`.
- Exact-SHA CI [39158519832 — SUCCESS](https://github.com/Report-Engainall/Nasr1/actions/runs/39158519832), code SHA `6e746a7684f4cf8696c3b2c2bbfdd8f410cd364f`: frozen lock verification, unit tests, PostgreSQL 17 migrations/RLS acceptance, lint, build, preview smoke and dev smoke all successful.
- State: IMPLEMENTED=YES; INTEGRATED=YES; TESTED=PASS exact SHA; BROWSER-PROVEN=NOT PROVEN; PRODUCTION-PROVEN=NOT PROVEN; production Supabase migrations=NOT RUN. This is only a target-native low-stock-metric correction, not inventory transfer/count feature completion.
- next_task_id remains `NASR1-READY-TO-REUSE-SEMANTIC-INTEGRATION-001`.


## 2026-10-18 — NASR1-IMPORT-CHUNK-CONTIGUITY-001

- Source candidate reviewed: `Report-Engainall/aghbari-commerce@00d7446bba9652ea40178a08b00c9da9a2bba8a1`, `supabase/migrations/0021_import_server_boundary_hardening.sql` source blob `16f9091fe712f947a4f4dfc6c06b38773273967f`; older `0008_atomic_import_commit.sql` blob `74372746bbbe7f000c42f24688e74542cab91448` uses a different products/import_rows/price_lists schema and was not copied.
- In the live target, `record_import_upload_chunk` previously validated offset/size/hash and idempotent duplicate rows but accepted out-of-order new chunk numbers. Added `supabase/migrations/20261018060000_import_upload_chunk_contiguity.sql` to enforce sequential chunk-prefix writes under a row lock and preserve identical retries.
- Extended `scripts/test-database-migrations.mjs` with multi-chunk acceptance: reject chunk 1 before 0; reject chunk 2 before 1; no failed write persists; accept idempotent retry; accept full ordered sequence with a smaller final chunk.
- Exact-SHA CI [39159034597 — SUCCESS](https://github.com/Report-Engainall/Nasr1/actions/runs/39159034597), code SHA `a02ad4682ed1e18a10811040ae20134875031de7`: lockfile, unit tests, PostgreSQL 17 migrations/RLS acceptance, lint, build and preview/dev smoke all PASS.
- Status: IMPLEMENTED=YES; INTEGRATED=YES; TESTED=PASS on exact SHA; production migrations=NOT RUN; BROWSER-PROVEN=NOT PROVEN; PRODUCTION-PROVEN=NOT PROVEN. This is an import-integrity hardening, not full semantic integration of all donor candidates.
- next_task_id = `NASR1-READY-TO-REUSE-SEMANTIC-INTEGRATION-001`.

## 2026-10-18 — NASR1-INVENTORY-TRANSFER-001

- Source reviewed: `Report-Engainall/aghbari-commerce@00d7446bba9652ea40178a08b00c9da9a2bba8a1/src/services/inventory.ts`, blob `3506707a656e0db491b860d5e11ad28daeded5cf`. Old service uses distinct RPC parameters and assumptions about schema; no wholesale copy.
- Target-native integration: migration `supabase/migrations/20261018070000_inventory_transfer_command.sql`; API `fetchActiveInventoryWarehouses` + `transferInventory` in `src/lib/api.ts`; transfer modal and control in `src/components/AghbariApp.tsx`; PostgreSQL acceptance cases in `scripts/test-database-migrations.mjs`.
- Transaction invariants: active same-tenant product and warehouses; source available quantity (not gross on-hand) must cover transfer; row locking in deterministic order; source and destination balances change atomically; paired immutable movement rows and audit; exact-payload idempotent replay returns the same transfer without duplicate movement; payload mismatch rejected.
- Test correction history: first run [39159581588](https://github.com/Report-Engainall/Nasr1/actions/runs/39159581588) failed on invalid schema qualification of SQL COALESCE; corrected. [39159657535 — SUCCESS](https://github.com/Report-Engainall/Nasr1/actions/runs/39159657535) validated transfer logic and all project checks. The latest UI quantity-label correction then passed exact-SHA CI [39159745907 — SUCCESS](https://github.com/Report-Engainall/Nasr1/actions/runs/39159745907) at `89fe8089aa2fd7d4f1b5130c8af85dc1171b4185`.
- State: IMPLEMENTED=YES; INTEGRATED=YES; TESTED=PASS exact SHA; BROWSER-PROVEN=NOT PROVEN; PRODUCTION-PROVEN=NOT PROVEN; production migration=NOT RUN. Stock-count session/line feature remains open.
- next_task_id = `NASR1-INVENTORY-REORDER-POINT-COMMAND-001`.

## 2026-10-18 — NASR1-INVENTORY-WRITE-BOUNDARY-REORDER-POINT-001

- Source candidate: `Report-Engainall/aghbari-commerce@00d7446bba9652ea40178a08b00c9da9a2bba8a1/src/services/inventory.ts` blob `3506707a656e0db491b860d5e11ad28daeded5cf`. Legacy contract supports min/reorder/max quantities and calls `set_stock_threshold`; target schema has one integer `inventory_balances.reorder_point`, so only equivalent target-native behavior was adapted.
- Added `supabase/migrations/20261018080000_inventory_write_boundary_and_reorder_point.sql`, API `fetchInventoryReorderPoint` / `setInventoryReorderPoint` and admin/manager UI. Direct authenticated DML on inventory balances and movement ledger is revoked; reads remain available under existing RLS. A manager RPC writes only an existing same-tenant balance, validates threshold/reason, records audit history and lets the existing inventory trigger reconcile the purchasing task.
- Added migration acceptance for direct write denials, changing and repeating a threshold, audit old/new values, task reopen/complete lifecycle, invalid threshold, cross-tenant warehouse and accountant denial. Corrected the error-match regex in follow-up test commit `591dce4e59383e7a568c9a19c7f7e823fe5aa7f3`.
- Exact-SHA CI [39160377663 — SUCCESS](https://github.com/Report-Engainall/Nasr1/actions/runs/39160377663), code SHA `591dce4e59383e7a568c9a19c7f7e823fe5aa7f3`: frozen lock, unit tests, PostgreSQL 17 migrations/RLS acceptance, lint, build, preview/dev smoke PASS.
- Production Supabase migrations=NOT RUN; BROWSER-PROVEN=NOT PROVEN; PRODUCTION-PROVEN=NOT PROVEN. next_task_id = `NASR1-INVENTORY-STOCK-COUNT-001`.

## 2026-10-18 — NASR1-INVENTORY-STOCK-COUNT-001 — ربط واجهة الجرد الفعلي

- الأساس الحي: `4ef323db2aa7b3ea9e11e1bb362fc37e7994221a`؛ schema/RPC/API للجرد الفعلي موجودة واختباراتها اجتازت [Actions 39161411949 — SUCCESS](https://github.com/Report-Engainall/Nasr1/actions/runs/39161411949).
- أضيفت `src/components/InventoryStockCountPage.tsx` و`src/routes/admin_.stock-count.tsx` وربط التنقل في `src/components/AghbariApp.tsx`، وتحديث routeTree المولّد وقائمتي preview/dev smoke في workflow.
- الواجهة تعرض فقط بيانات المستودع الفعلية؛ بدء الجلسة idempotent، كل كمية تُحفظ عبر RPC، الاعتماد/الإلغاء إداريان، سبب الإلغاء مطلوب، والطباعة محصورة في منطقة ورقة الجرد. لا dependency أو خدمة مدفوعة أو سجل وهمي.
- backend tests المثبتة: snapshot، منع الجلسات المكررة، movement+audit، stale-snapshot denial، ورفض الأدوار غير الإدارية. Exact-SHA UI/code CI [39165071610 — SUCCESS](https://github.com/Report-Engainall/Nasr1/actions/runs/39165071610) على `94c0f92eea5fe8d2add289106c3f76d884460d4d`: frozen Bun lock، unit tests، PostgreSQL 17 migrations/RLS acceptance، lint، build، preview smoke `/admin/stock-count` وdev smoke PASS.
- الحالة الحالية: IMPLEMENTED=YES; INTEGRATED=YES; TESTED=PASS exact SHA; BROWSER-PROVEN=NOT PROVEN; PRODUCTION-PROVEN=NOT PROVEN; production migration=NOT RUN.
- next_task_id = `NASR1-READY-TO-REUSE-SEMANTIC-INTEGRATION-001`.



## 2026-10-19 — NASR1-READY-TO-REUSE-SEMANTIC-INTEGRATION-001 — تكامل محاسبي ومسارات الدخول

- العمل استهدف `Report-Engainall/Nasr1` / `main` فقط؛ لا force-push ولا حذف لعمل قائم.
- Commit `5c36f1c0baf57a9b908b7d65d2dbe4d78aef5dca` أضاف مساري التسجيل واستعادة كلمة المرور، وتوسيع اختبار المسارات. فشل الاختبار الأول لأن النص المفترض لتسجيل الدخول لم يطابق النص الفعلي؛ صُحح الاختبار في `d94d642cdeab74ed2437407049434dd59466adf4`. [Actions 39171368206 — SUCCESS](https://github.com/Report-Engainall/Nasr1/actions/runs/39171368206) اجتاز unit/build/preview/dev smoke على SHA المصحح.
- تمت قراءة المرشح `Report-Engainall/aghbari-commerce@00d7446bba9652ea40178a08b00c9da9a2bba8a1/supabase/migrations/0032_finance_invoices_cash_expenses.sql`؛ نموذج المصدر يستخدم جداول `branches/cash_accounts/operational_invoices/public.payments/public.expenses` ودورًا مختلفًا. تم تكييف وظيفة المصروفات فقط إلى مخطط Nasr1 بدلاً من تطبيق migration المصدر.
- أضيفت `supabase/migrations/20261019100000_finance_cash_expenses.sql`، و`src/components/CashExpenseLedger.tsx`، و`src/lib/cash-expense-input.ts`، واختبارات الوحدة وقبول PostgreSQL، وربطها بـ`StaffFinancePage`. ميزات الاختبار: المبلغ الدقيق، idempotency/replay/conflict، عزل المؤسسة وRLS، دور المحاسب مقابل إلغاء المدير، منع DML المباشر، الحفظ غير الهدام للسجل الأصلي وحدثا تدقيق.
- فشل DB acceptance الأول على SHA `65ad6347aaf4938b24bf66577f6d1c82e51de778` لأنه توقع خطأً أن قراءة المصروفات يجب أن تفشل للمحاسب المصرّح به. أزيل التوقع الخاطئ؛ لا تغيير على صلاحيات الخادم. [Actions 39171703391 — SUCCESS](https://github.com/Report-Engainall/Nasr1/actions/runs/39171703391) يطابق SHA `c3e4e3da71bedd9c8495fd5bd8cf901c6aee5d25` ويؤكد unit tests، PostgreSQL 17 migrations/RLS acceptance، lint، build، production-preview smoke وdev smoke PASS.
- أرشيفا Bolt: محاولتا raw download خلال هذه الجلسة انتهتا برسالة أداة GitHub الفعلية `HTTP 400: GitHub Fetch supports UTF-8 text files; this file appears to be binary or encoded differently (Response: None)`، بينما محاولة بيئة التنفيذ أعادت `URLError [Errno -3] Temporary failure in name resolution`. بصمات SHA-256 وCRC وفك المسارات مثبتة تاريخيًا في Actions 39157355307 على SHA 92a948e... فقط؛ إعادة التنزيل/إعادة التحقق الحالية `NOT RUN`.
- تم تحديث source integration ledger وaudit row لترحيل المصروفات. المراجعة الدلالية لجميع 69 مرشحًا لم تكتمل، لذلك يظل `next_task_id = NASR1-READY-TO-REUSE-SEMANTIC-INTEGRATION-001` مفتوحًا. Production migration NOT RUN; BROWSER-PROVEN NOT PROVEN; PRODUCTION-PROVEN NOT PROVEN.



## 2026-10-19 — مراجعة دلالية لكل مرشح وإغلاق NASR1-READY-TO-REUSE-SEMANTIC-INTEGRATION-001

- أعيدت مطابقة 69 صفًا من `PROVENANCE_MANIFEST.csv` و`READY_TO_REUSE_FILE_AUDIT.csv` صفًا بصف (source path + donor blob SHA)، وأُسند لكل واحد قرارًا محددًا وسببًا وعقدًا واختبار إثبات/حالة اختبار واضحة. لم يُزعم أن كود المانحين الذي رُفض/لم يُدمج قد تم اختباره؛ جميع نتائج تلك الصفوف تذكر بوضوح أن donor code NOT RUN.
- أضيفت قرارات المرشحين الفردية إلى `SOURCE_INTEGRATION_LEDGER.csv` دون حذف السجل التاريخي أو تكرار التكامل القانوني لسجل المصروفات. يحتفظ تنفيذ PDF/import/addresses/company-members/retry/current analytics بواجهاته الموجودة إذا كانت أحدث أو مدمجة بالفعل؛ ترفض شاشات وSQL القديمة عندما تختلف مخططات الجداول/الأدوار أو تتجاوز الخادم، خصوصًا التحليلات المباشرة بلا حدود، وإنشاء أرقام الطلب من العميل وكتابة السعر/الطلب مباشرة.
- `NASR1-READY-TO-REUSE-SEMANTIC-INTEGRATION-001` مغلقة؛ التالية الوحيدة `NASR1-ORIGINAL-SPEC-INTERFACE-COMPLETION-002` للبدء بمطابقة واجهات المواصفة الأصلية وإكمال أول فجوة حقيقية واختبارها.
- current-session archive re-download/extract remains NOT RUN because the two binary requests failed HTTP 400 through GitHub fetch and DNS resolution failed in runner; prior Actions SHA256/CRC/safe-path test remains historical evidence only. Browser proof and production deployment remain NOT PROVEN/NOT RUN.


## 2026-10-19 — تكامل واجهة بيانات Onyx الفعلية (pending CI)

- فجوة مؤكدة بالبحث عن مراجع المستهلك: دوال `fetchOnyxSnapshots` و`fetchOnyxSnapshotAnalytics` و`runInventoryReconciliation` كانت موجودة في API، لكن لوحة الإدارة كانت لا تعرض شاشة مرتبطة بها. أضيفت `src/components/OnyxSnapshotCenter.tsx` وربطت داخل `src/components/AghbariApp.tsx` في مركز البيانات.
- أُضيفت عقود/تحقق typed إلى دوال قراءة اللقطات وصفوفها في `src/lib/api.ts`، ومعاينة 100 صف فقط، ومؤشرات جودة وتوزيع حالات وترتيب أصناف وتحليل تنبؤي بحالة صريحة، ومطابقة مخزون خادمية غير هدّامة مع رقم تشغيل وسجل تدقيق، وطباعة خاصة بالتقرير.
- أُضيف `src/test/OnyxSnapshotCenter.test.tsx` لأربع حالات (عرض مصدر حقيقي، المطابقة، رفض غير الموظف، فشل قاعدة البيانات). أُصلحت كذلك حقول `test_command/test_result` التي كانت فارغة عن طريق نسخ إثبات كل صف من سجل الجرد إلى دفتر الدمج.
- هذه الواجهة لا تنشئ اتصال Onyx خارجيًا ولا تدعي قبول Workbook في Onyx. دوال الخادم الحاليَّة وRLS هي حد المؤسسة؛ تشغيل الإنتاج/المتصفح الخارجي لم ينفذ.


## 2026-10-19 — Onyx UI + طباعة مركز المهام — exact-SHA CI PASS

- HEAD الكود: a38e43f4da656da6cc10abdb476b0023dd029440. CI مطابق: [Actions 39173352654 — SUCCESS](https://github.com/Report-Engainall/Nasr1/actions/runs/39173352654). PASS: frozen lockfile, unit tests, PostgreSQL 17 migrations/RLS/business acceptance, lint, build, production-preview smoke 4173, dev-server smoke 5173.
- Added and mounted OnyxSnapshotCenter within the existing admin data center. It presents stored source snapshots and SHA256 evidence, quality/status metrics, top items, forecast state, the first 100 source rows, server-side inventory reconciliation results and a printable evidence report. No external Onyx connection/round-trip is claimed.
- Snapshot APIs validate required fields and selected snapshot ID; malformed data fails closed. UI tests cover snapshot loading, reconciliation, non-staff denial and service error.
- Task Center printing uses src/lib/task-print.ts to restrict print scope to the authenticated account allowedRoles. All-allowed or one allowed role may be printed while shared status/priority/assignee/date/search filters remain applied; unauthorized or empty scopes return no rows. Unit tests and current task-event/idempotency PostgreSQL acceptance passed.
- IMPLEMENTED=YES; INTEGRATED=YES; TESTED=PASS exact SHA a38e43f4da656da6cc10abdb476b0023dd029440; BROWSER-PROVEN=NOT PROVEN; PRODUCTION-PROVEN=NOT PROVEN; PRODUCTION_MIGRATION=NOT RUN. Next task: NASR1-ORIGINAL-SPEC-INTERFACE-COMPLETION-002; all original-spec interfaces are not yet complete.
- Archive fetch caveat unchanged: current-session binary GitHub fetch returned HTTP 400 (connector only supports UTF-8 text); runner fetch returned DNS error [Errno -3] Temporary failure in name resolution. The earlier SHA256/CRC/safe-extraction result is historical Actions 39157355307, not a fresh download in this session.


## 2026-10-19 — إصلاح فشل CI المرصود أثناء الدمج

- فشل تشغيل CI رقم 39174326823 على SHA f4a84e6ac6cf85966a918ca3bfa1cd0f81c28975 في Unit tests فقط؛ المرحلتان PostgreSQL/Lint/Build تم تخطيهما بسبب ذلك الفشل.
- سجل GitHub الحقيقي: الاختباران في src/test/storefront-discovery.test.tsx دخلا ErrorBoundary لأن vi.mock الخاص بـ @/lib/api لا يصدّر fetchStorefrontAnnouncements بعد أن أصبح Storefront يستدعيه.
- أضفت mock صريحًا للدالة، وأرجع useFetch قائمة فارغة للاختبارات التي لا تختبر إعلانات المتجر؛ هذا يزيل الاعتماد العرضي على mock ناقص دون تغيير سلوك الإنتاج.
- إعادة الاختبارات على الرأس النهائي لا تزال PENDING؛ فشل التشغيل السابق ليس نتيجة اختبار للترحيل أو المكوّن الجديد.


## 2026-10-19 — NASR1-ORIGINAL-SPEC-ANNOUNCEMENTS-002: exact-SHA tests passed

- Implemented the active TanStack storefront slider and admin manager; no legacy React Router component copied into the active tree.
- CI 39174470933 passed on exact code SHA 5308c3f917852cf3a2474a0ac0201bee8c8f32be. Success covers unit tests, the isolated PostgreSQL 17 migration/authorization suite, lint, build, preview smoke and dev smoke.
- Failure addressed: CI 39174326823 on f4a84e6ac6cf85966a918ca3bfa1cd0f81c28975 failed two storefront discovery tests because the API mock omitted fetchStorefrontAnnouncements. The test mock and empty-list return were corrected; exact-SHA CI passed afterwards.
- Code status: IMPLEMENTED and INTEGRATED; TESTED=PASS (exact-SHA CI). Browser screenshot/interactive verification=NOT RUN. Production deployment/migration=NOT RUN. No production data was created.
- Source intake: 69 rows appear in both READY_TO_REUSE/PROVENANCE_MANIFEST.csv and READY_TO_REUSE_FILE_AUDIT.csv; the audit records per-file decisions. Source ZIP re-download, refreshed SHA-256/CRC and extraction remain NOT RUN in this environment due raw.githubusercontent.com DNS failure; previously recorded hashes are historical only.
- Overall current task remains NASR1-ORIGINAL-SPEC-INTERFACE-COMPLETION-002. This closes only the storefront announcements gap; remaining specification gaps must not be labeled complete.

## 2026-10-19 — شبكة أسعار التحرير المجمع

- Code SHA: `7e3bdbee89def1e7c4396235a87618c357858fac`.
- Integrated the active admin price grid with explicit, authorized read RPC `get_admin_product_price_grid`, corrected write RPC `save_product_price_grid`, keyboard movement, pre-save diff preview and one-transaction batches.
- The real database model is `products.base_price/wholesale_price/retail_price` plus `product_prices` rows for `vip/wholesale/retail`; the first implementation’s nonexistent columns were corrected by `20261019130000_product_price_grid_actual_price_tables.sql`.
- PostgreSQL acceptance checks cover read model values, tier persistence, admin/manager access, accountant denial, stale-value detection, audit and rollback when a cross-tenant product appears in a batch.
- Exact-SHA CI outcome: FAIL (failure): exact-SHA GitHub Actions 39175623592 for 7e3bdbee89def1e7c4396235a87618c357858fac (https://github.com/Report-Engainall/Nasr1/actions/runs/39175623592); must fix before closure.
- IMPLEMENTED=YES; INTEGRATED=YES; BROWSER-PROVEN=NOT RUN; PRODUCTION-PROVEN=NOT RUN; production migration=NOT RUN.
- Archive pair re-download, fresh SHA256/CRC and safe extraction remain NOT PROVEN; the direct download blocker previously returned `curl: (6) Could not resolve host: raw.githubusercontent.com`.
- `NASR1-ORIGINAL-SPEC-INTERFACE-COMPLETION-002` remains open; do not infer full-spec completion from this gap alone.


## 2026-10-19 — NASR1-ORIGINAL-SPEC-PROMOTIONS-003: إدارة الحملات الآمنة

- فحص الرأس المباشر قبل التعديل: `46b957fd3e490f32071f90b0b9e2f76a7712602f`; شُغلت التعديلات على `main` بعمليات fast-forward فقط، بلا force-push.
- أصلحت regressions ظهرت من سجلات CI الفعلية: عند فصل قراءة المتجر العام عن الإدارة، فشل اختبار المتجر لأن mock لم يصدّر `fetchStorefrontPromotions`; أُضيفت الدالة إلى mock. على HEAD النهائي، لا يبقى هذا الفشل.
- أضيفت migration `20261019140000_promotion_management_commands.sql`؛ فصلت RPCs العامة والإدارية، فرضت المؤسسة الحالية والـadmin/manager النشط، سحبت direct table DML/SELECT من أدوار المتصفح، وتحققت من تواريخ الحملة ونوع/قيمة الخصم وانتماء الأصناف والتصنيفات وسجل التدقيق.
- أضيفت `PromotionManager.tsx` وربطها من لوحة الإدارة بدل الزر المعطّل. اختبارات UI: `src/test/PromotionManager.test.tsx`; اختبارات DB: `scripts/test-database-migrations.mjs`. عدد الاختبارات المرئي في سجل CI: 34/34 ملفات و279/279 اختبارًا ناجحًا.
- CI المطابق النهائي: [39185199950 SUCCESS](https://github.com/Report-Engainall/Nasr1/actions/runs/39185199950), exact code SHA `ddd99501594fca3d622555e3868159e65c987952`. Unit tests, PostgreSQL 17 migration/RLS acceptance, lint, build, preview smoke 4173 and dev smoke 5173: PASS. ثبت سجل قاعدة البيانات `PASS promotion management...`.
- تصنيف الإثبات: IMPLEMENTED=YES; INTEGRATED=YES; TESTED=PASS (exact SHA); BROWSER-PROVEN=NOT RUN; PRODUCTION-PROVEN=NOT RUN; PRODUCTION_MIGRATION=NOT RUN.
- حد موثق: سجل الحملة لا يغير إجمالي الطلب؛ ربط النسبة بمحرك التسعير/الفاتورة NOT IMPLEMENTED. إخفاء قيمة الخصم من العرض العام مؤقتًا مقصود لمنع الادعاء بخصم غير مطبق.
- ZIP attempts (fresh): `https://raw.githubusercontent.com/Report-Engainall/report-insight-engine/main/incoming-archives/nasr1-bolt-recovery-2026-10-17/Nasr1_Bolt_Before_Failure.zip` و`https://raw.githubusercontent.com/Report-Engainall/report-insight-engine/main/incoming-archives/nasr1-bolt-recovery-2026-10-17/Nasr1_Bolt_Restored_Current.zip`. GitHub Fetch أعاد HTTP 400 `GitHub Fetch supports UTF-8 text files; this file appears to be binary or encoded differently (Response: None)`; Web fetch كان DisabledError؛ تنزيل الحاوية مُنع برسالة URL not viewed in conversation; رابط GitHub raw البديل `github.com/.../raw/refs/heads/main/...` أعاد 404 `No commit found for the ref refs`. fresh download/hash/CRC/safe extraction/content comparison: NOT RUN. لا تخلط ذلك مع SHA/CRC التاريخي في Actions 39157355307.
- فرع recovery وPR #1 تم الاطلاع عليهما؛ PR #1 Draft وغير مدمج، ولا SQL من quarantined/PR تم تفعيله. الـmanifest الدلالي يبقى كما هو؛ قراراته الـ69 لا تثبت تشغيل كود المصدر.
- المهمة النشطة تبقى `NASR1-ORIGINAL-SPEC-INTERFACE-COMPLETION-002`; تغطية المواصفة الأصلية بالكامل غير مكتملة.


## 2026-10-19 — NASR1-ORIGINAL-SPEC-PRICE-GRID-CSV-001

- Implemented `src/lib/price-grid-csv.ts` and connected both import and export controls inside `src/components/PricingGrid.tsx`.
- Export writes saved server rows only, uses UTF-8 BOM, fixed Arabic headers, quoted cells/escaped quotes, two-decimal price values, and spreadsheet-formula prefixing for untrusted text. No price draft is exported as if committed.
- Import parses the fixed CSV format, resolves exact `item_code` identifiers (leading-zero bytes retained), rejects malformed headers/rows, duplicated/unknown item codes and invalid/negative/>2dp amounts, with a 2MB file cap and 200-row limit. Imported values become drafts only; preview and the existing atomic server save command are still required.
- Added helper coverage in `src/test/price-grid-csv.test.ts` and UI coverage in `src/test/pricing-grid.test.tsx`.
- Exact-SHA CI [39186174524 SUCCESS](https://github.com/Report-Engainall/Nasr1/actions/runs/39186174524), SHA `b0fedcbec9a445aa2eef96eb2686a59a9ab14768`: 35/35 test files and 285/285 tests; PostgreSQL 17 migration/RLS acceptance; lint; build; production preview smoke 4173; dev smoke 5173 all PASS.
- Corrective iterations are retained honestly in Actions: #287 and #288 caught CSV escaping expectations; #289 caught `no-control-regex` in lint. Assertions and regex were fixed (not waived); #290 on the export-only commit succeeded; #291 on the combined import/export commit succeeded.
- Status: IMPLEMENTED=YES; INTEGRATED=YES; TESTED=PASS exact-SHA CI; BROWSER-PROVEN=NOT RUN; PRODUCTION-PROVEN=NOT RUN; XLSX=NOT IMPLEMENTED; INVENTORY QUANTITY COLUMNS=NOT IMPLEMENTED.
- Active task `NASR1-ORIGINAL-SPEC-INTERFACE-COMPLETION-002` remains open; next step is continued clause-by-clause spec gap closure. Archive binary fresh download / SHA-256 / CRC / safe extraction remains NOT RUN due recorded blockers.


## 2026-10-19 — إثبات أرشيفات Bolt من GitHub Actions، لا من المحاولة المحلية

- شُغّل `scripts/reconcile-bolt-recovery-archives.py` في [Action 39294387493](https://github.com/Report-Engainall/Nasr1/actions/runs/39294387493) على SHA الهدف `d20c1aced5f6595b1b2a81bb017c153a260c5a0d`، مع source commit ثابت `b1ca62ec277ff9f55c8e850e0470d61d81aaa138`.
- `Nasr1_Bolt_Before_Failure.zip`: HTTP 200؛ 1,003,172 bytes؛ SHA-256 `d59b3084a0b51e26646cf08ffc9239d2ee440298e9799f079827a4939d31b365`؛ Git blob SHA-1 `7c35f3ecde19dc5596fd22053be61924ef3d5318`؛ 359 عضوًا؛ CRC/decompression/safe extraction PASS.
- `Nasr1_Bolt_Restored_Current.zip`: HTTP 200؛ 997,589 bytes؛ SHA-256 `9e012da1795cb9549413f78366c3bd6885c593e5a56e2fea10d4cf3fe810b214`؛ Git blob SHA-1 `f01684a56e093a33a173b0965d1d7239c48f0936`؛ 358 عضوًا؛ CRC/decompression/safe extraction PASS.
- مقارنة الملفين: 340 محتوى مطابقًا، 18 متغيرًا، عنصر واحد موجود في نسخة Before فقط؛ الإجمالي 717 عنصرًا. تدقيق `READY_TO_REUSE/PROVENANCE_MANIFEST.csv` عدد 69 صفًا: 7 مطابقات بالبصمة، 2 اختلاف مسار/محتوى، 60 مسارًا مفقودًا وقت التدقيق. ثمانية أعضاء صنفت أمنيًا للاستبعاد. لم تُشغّل الملفات المستخرجة ولم تُطبّق SQL.
- المحاولات المباشرة في هذه المحادثة بقيت فاشلة (HTTP 400 binary / DisabledError / فشل تنزيل محلي)، ولا تستبدل هذه الأدلة بنتيجة مختلفة. تم تعديل `ARCHIVE_MANIFEST.csv` لعرض النتيجة الناجحة المنفصلة في عمود `fresh_sha256_crc_safe_extraction` مع إبقاء أخطاء المحاولة المباشرة محفوظة.

## 2026-10-19 — إكمال ربط تحليل أونكس في التقارير التنفيذية

- أضيفت `src/components/UnifiedOnyxAnalysisPanel.tsx` وربطت داخل `Reports` في `src/components/AghbariApp.tsx`؛ تعتمد على `fetchOnyxSnapshots` و`fetchOnyxSnapshotAnalytics`، مع tenant/RBAC القائمين، والتحقق من مطابقة معرّف اللقطة والقيم غير السالبة وإغلاق العرض عند خطأ المصدر.
- تعرض أثر المصدر: اسم الملف، نوع التقرير، الفترة إذا كانت مسجلة، تاريخ اللقطة، عدد الصفوف، درجة الجودة، وSHA-256، ثم إحصاءات المصدر المحفوظة. تبقى مؤشرات اللقطة مفصولة عن أرقام المبيعات الحالية للمتجر، ولا تدّعي اتصالًا حيًا بنظام Onyx أو مزامنة تلقائية.
- الاختبار المطابق [Actions 39295541831 — SUCCESS](https://github.com/Report-Engainall/Nasr1/actions/runs/39295541831), SHA `58cd1f8acd627c7cb2a00e81a29b3c46581cd490`: 37/37 ملف اختبار، 300/300 اختبار؛ PostgreSQL 17/RLS، lint، build، preview وdev smoke PASS. الاختبار هنا ليس إثبات متصفح تفاعلي أو إنتاج.
- الحالة: IMPLEMENTED=YES; INTEGRATED=YES; TESTED=PASS exact SHA; BROWSER-PROVEN=NOT RUN; PRODUCTION-PROVEN=NOT RUN.

## 2026-10-19 — شبكة الأسعار: XLSX وملخصات مخزون حقيقية للقراءة فقط

- ربطت `src/components/PricingGrid.tsx` `price-grid-xlsx.ts` للاستيراد إلى مسودة قبل الاعتماد والتصدير من صفوف الخادم المحفوظة، مع أكواد أصناف نصية للحفاظ على الأصفار البادئة. لم يُضف اعتماد مدفوع.
- يعيد `get_admin_product_price_grid_with_inventory()` مجاميع الرصيد المسجل والمحجوز والمتاح ونقطة إعادة الطلب وعدد المخازن النشطة ضمن المؤسسة المخولة؛ القراءة منفصلة عن مسار كتابة الأسعار. إذا لم توجد أرصدة مسجلة، تبقى الخانات فارغة بدل تحويل UNKNOWN إلى ZERO.
- تغطية اختبارية موجودة في `src/test/price-grid-xlsx.test.ts` و`src/test/pricing-grid.test.tsx` واختبارات PostgreSQL 17 لقبول صلاحيات القراءة/الكتابة ورفض المحاسب والكتابة العابرة للمؤسسات. CI المطابق `39295541831`، 37/37 files و300/300 tests، PASS.
- الحالة: IMPLEMENTED=YES; INTEGRATED=YES; TESTED=PASS exact SHA; BROWSER-PROVEN=NOT RUN; PRODUCTION-PROVEN=NOT RUN.

## 2026-10-19 — المتجر: مسارات الكتالوج والتصنيفات والعروض

- أضيفت واجهات TanStack نشطة `/store`, `/catalog` (بحث/تصنيف)، `/collections` و`/offers`، مع عناوين عربية خاصة بكل مسار، وربط بياناتها إلى Storefront وتصنيفات المتجر والحملات المنشورة. لا تستخدم mock catalog أو بيانات demo.
- سجل CI قبل الإصلاح فشلًا بسبب محارف استمرار سطر shell مضاعفة حول عقود `/store`, `/catalog`, `/collections`, `/offers`; أصلحت الفواصل في `.github/workflows/commerce-checks.yml` دون حذف عقد المسارات. [Actions 39295541831](https://github.com/Report-Engainall/Nasr1/actions/runs/39295541831) على SHA `58cd1f8acd627c7cb2a00e81a29b3c46581cd490` اجتاز بعدها 37/37 files و300/300 tests وقبول قاعدة البيانات والـlint/build وpreview/dev smoke.
- الحالة: IMPLEMENTED=YES; INTEGRATED=YES; TESTED=PASS exact SHA; BROWSER-PROVEN=NOT RUN; PRODUCTION-PROVEN=NOT RUN.

## 2026-10-19 — تصحيح سجل خصومات الحملات

- لم يعد صحيحًا اعتبار خصم Checkout غير منفّذ على HEAD الحالي. ترحيل `20261019150000_checkout_promotion_pricing_snapshots.sql` يعرّف `resolve_active_promotion_price`؛ يحدد الحملة الفعالة ضمن المؤسسة، يحسب النسبة/المبلغ، ويحد الخصم إلى الهامش فوق تكلفة الصنف. `place_order` و`preview_order_pricing` و`get_storefront_product_prices` و`review_order_lines` تستخدم السعر الفعال وتحفظ لقطات الحملة/الخصم في بنود الطلب، ويُنسخ snapshot إلى بنود الفاتورة.
- اختبار قبول قاعدة البيانات في `scripts/test-database-migrations.mjs` يتحقق من انخفاض السعر عند حملة فعالة، ثبات السعر الخام في snapshot، مطابقة الخصم والإجمالي وحظر وصول العميل إلى جدول الحملات مباشرة. هذا متحقق ضمن CI المطابق `58cd1f8acd627c7cb2a00e81a29b3c46581cd490`; لا يثبت ترحيل/نشر الإنتاج.


## 2026-10-19 — تسجيل صفحات التصنيف والبحث المتقدم وإصلاح المطابقة

- فشل CI [39297551448](https://github.com/Report-Engainall/Nasr1/actions/runs/39297551448) بعد 36/37 suites لأن اختبارين أثبتا أن شجرة TanStack لا تصل إلى صفحة البحث المتقدم ولا إلى حالة رفض التصنيف الفرعي. لم يتم إسقاط الاختبارين أو تخفيض التوقعات.
- تم تصحيح `src/routeTree.gen.ts`: صفحات التصنيف الفرعي `/category/$slug/subcategory/$subcategorySlug` والبحث المتقدم `/search/advanced` تسجلان الآن كمسارين مباشرين جذريين؛ أُزيل الاعتماد على المطابقة المتداخلة التي كانت تعرض مكوّن المسار الأب.
- رُبط رابط «بحث متقدم» في `src/components/Storefront.tsx`; رُبط المحدد `#advanced-storefront-category` في `AdvancedStorefrontSearchPage.tsx`; أضيفت اختبارات سلوك لفتح تصنيف حقيقي، رفض child لا يتبع parent، وفتح البحث المتقدم ثم تطبيق تصنيف من بيانات الاختبار إلى `/catalog`.
- أضيفت عقود HTTP/العناوين في `.github/workflows/commerce-checks.yml` للـpreview 4173 والـdev 5173؛ تم إصلاح indentation وshell continuations بعد أن فشل تشغيل سابق قبل إنشاء أي job.
- CI النهائي المطابق [39297924768 — SUCCESS](https://github.com/Report-Engainall/Nasr1/actions/runs/39297924768), SHA `5c30bafe9bc5076a3acb6ca3335679462d290eb6`: **37/37 ملفات اختبار و302/302 اختبار**؛ PostgreSQL 17/migrations/RLS؛ lint؛ build؛ preview smoke؛ dev smoke PASS.
- الحالة: IMPLEMENTED=YES; INTEGRATED=YES; TESTED=PASS (exact SHA 5c30bafe9bc5076a3acb6ca3335679462d290eb6); BROWSER-PROVEN=NOT RUN; PRODUCTION-PROVEN=NOT RUN.
- تبقى المهمة الأشمل `NASR1-ORIGINAL-SPEC-INTERFACE-COMPLETION-002` مفتوحة. هذا السجل يغلق جزء اكتشاف الكتالوج فقط.



## 2026-10-19 — فلتر المخزون المعروف في البحث المتقدم

- أضيف إلى `src/components/Storefront.tsx` بيان مرئي عند تفعيل `available=1` وإجراء «إظهار كل الأصناف المطابقة» الذي يزيل هذا الشرط مع إبقاء نص البحث والتصنيف المحددين.
- أضيف اختبار تكاملي في `src/test/storefront-discovery.test.tsx`: يضع كمية مخزون غير صالحة/غير معروفة للصنف «Beans»، يفعّل فلتر المتوفر من صفحة البحث المتقدم، يرسل النموذج إلى الكتالوج، ويثبت أن Rice/Sugar/Oil معروضة وأن Beans محجوب؛ ثم يزيل الفلتر ويتحقق من عودة Beans.
- سجل التشغيل [39298563390](https://github.com/Report-Engainall/Nasr1/actions/runs/39298563390) كشف فشل اختبار بسبب محاكاة `change` غير كافية لمربع الاختيار؛ تم تغيير التفاعل إلى نقر checkbox الأصلي. [Actions 39298690000](https://github.com/Report-Engainall/Nasr1/actions/runs/39298690000) اختبر تعديل التسمية، ثم أثبت [Actions 39298789592 — SUCCESS](https://github.com/Report-Engainall/Nasr1/actions/runs/39298789592) الإصلاح الكامل على SHA `2a002fa9062c3f4bd28c6b5c7bfcb35ba80b7926`.
- النتيجة النهائية: 37/37 test files و303/303 tests؛ PostgreSQL 17 migrations/RLS، lint، build، preview 4173 وdev 5173 PASS.
- الحالة: IMPLEMENTED=YES; INTEGRATED=YES; TESTED=PASS exact SHA; BROWSER-PROVEN=NOT RUN; PRODUCTION-PROVEN=NOT RUN.
- حالة المهمة الأشمل: `NASR1-ORIGINAL-SPEC-INTERFACE-COMPLETION-002` OPEN.

## 2026-10-19 — NASR1-BOLT-EXEC-ANALYTICS-001 — adapted archive capability, CI PASS

- Target `Report-Engainall/Nasr1/main`; code-bearing commit [55c1d970496c69db36d01197a109a5afd7c6aa04](https://github.com/Report-Engainall/Nasr1/commit/55c1d970496c69db36d01197a109a5afd7c6aa04).
- Archive integrity evidence [Actions 39294387493](https://github.com/Report-Engainall/Nasr1/actions/runs/39294387493): Before_Failure ZIP 1,003,172 bytes, 359 members; SHA-256 `d59b3084a0b51e26646cf08ffc9239d2ee440298e9799f079827a4939d31b365`; Restored_Current ZIP 997,589 bytes, 358 members; SHA-256 `9e012da1795cb9549413f78366c3bd6885c593e5a56e2fea10d4cf3fe810b214`. Total pair inventory: 717, with 340 identical, 18 changed and 1 Before-only. CRC/decompression/path-safety/extraction PASS; archive code not executed and archived SQL not applied.
- Decision: `fetch_staff_products` and AI-budget RPCs were already present in stronger target-native migrations; Onyx snapshot analytics already existed for import snapshots. The missing legacy store-executive analytics function was adapted to current tenant/order schema as `get_store_executive_analytics()` in `supabase/migrations/20261019210000_store_executive_analytics.sql`, with strict typed parser, route-connected Reports UI and tests. The unsafe legacy migration was not copied; it used old-schema assumptions and `DROP ... CASCADE`.
- Exact code CI [39303848194 — SUCCESS](https://github.com/Report-Engainall/Nasr1/actions/runs/39303848194), SHA `55c1d970496c69db36d01197a109a5afd7c6aa04`: 38/38 test files, 307/307 tests; frozen Bun lock check, unit tests, isolated PostgreSQL 17 migrations/RLS acceptance, lint, build, production preview smoke 4173, dev smoke 5173 all PASS.
- Implemented/integrated/tested = YES. Interactive browser proof = NOT RUN. Production migration and production runtime proof = NOT RUN. No new dependency or paid provider. See `ARCHIVE_FEATURE_INTEGRATION_2026-10-19.md`, `ARCHIVE_MEMBERS.csv` and this ledger for per-member decision.


## 2026-10-19 — NASR1-ORIGINAL-SPEC-PURCHASING-RECEIVING-008 — purchase lifecycle implemented, exact-SHA CI PASS

- Target stayed on `Report-Engainall/Nasr1/main`; code-bearing commit [`2986f59c3350f313eaa53b529a7507da47192773`](https://github.com/Report-Engainall/Nasr1/commit/2986f59c3350f313eaa53b529a7507da47192773).
- Added `supabase/migrations/20261019230000_purchase_orders_and_receiving.sql`: tenant-bound purchase orders/order lines/receipts/receipt lines, RPC-only table access, active supplier/warehouse/product checks, idempotency fingerprint conflict rejection, unknown costs represented as NULL, cancellation reason + audit, atomic partial/full stock posting with inventory movements, and one idempotent warehouse task from the persisted purchase-order state transition.
- Added `src/lib/purchase-orders.ts` strict payload parser and tests; `src/lib/api.ts` create/list/submit/cancel/receive RPC wrappers; `src/components/PurchaseOrdersPage.tsx`; route `/admin/purchase-orders`; admin navigation; smoke route-title contracts; `TaskCenter.tsx` purchasing-entity label; PostgreSQL integration acceptance.
- Real-database assertions proved: repeated create with same payload returns same order; reused key with changed payload rejected; missing cost stays NULL; over-receipt rejected without stock change; partial receipt updates inventory once; replay doesn't duplicate movement/quantity; final receipt completes order and closes one warehouse task; manager access uses the authorized RPC; ordinary customer cannot call the inbox RPC or SELECT purchase tables directly. Regression assertion for later order shipment now accounts for the two physically received units in the same product/warehouse rather than hard-coding the pre-receipt balance.
- CI: [Actions 39309895500 — SUCCESS](https://github.com/Report-Engainall/Nasr1/actions/runs/39309895500), exact SHA `2986f59c3350f313eaa53b529a7507da47192773`: **41/41 test files, 317/317 tests**, frozen Bun lock verification, PostgreSQL 17 migrations/RLS/workflow acceptance, lint, build, production preview smoke on 4173, dev smoke on 5173 all PASS.
- Earlier failures were retained and fixed, not bypassed: outdated UI copy assertion; unauthorized direct-table check accidentally executed under authenticated role after customer-denial test; then stock-shipment expected quantity was updated to account for the newly committed physical receipt. Latest exact SHA is green.
- Evidence levels: IMPLEMENTED=YES; INTEGRATED=YES; TESTED=PASS exact SHA; BROWSER-PROVEN=NOT RUN (no live authenticated browser session; CI smoke only); PRODUCTION-PROVEN=NOT RUN; production migration=NOT RUN. No new dependency or paid service. Details: `ORIGINAL_SPEC_FEATURE_INTEGRATION_2026-10-19.md`.
- Parent task `NASR1-ORIGINAL-SPEC-INTERFACE-COMPLETION-002` remains OPEN; the purchase workflow is one concrete gap closed, not full project completion.

## 2026-10-19 — NASR1-ORIGINAL-SPEC-ACCOUNTING-GENERAL-LEDGER-003 — CI PASS exact SHA

- Main remained unchanged at `0c089585d27665680dcc4ad2520dd4affc875804`; isolated branch `feature/accounting-general-ledger-20261019`, PR [#4](https://github.com/Report-Engainall/Nasr1/pull/4).
- Code SHA [`190497591d6451ca69d26da41034a3e5558fd58f`](https://github.com/Report-Engainall/Nasr1/commit/190497591d6451ca69d26da41034a3e5558fd58f) passed exact-SHA CI [39314610222](https://github.com/Report-Engainall/Nasr1/actions/runs/39314610222).
- Results: 42/42 test files, 330/330 tests; PostgreSQL 17 migration and acceptance suite; lint; build; production preview smoke (4173); dev smoke (5173). The new DB acceptance printed PASS for chart idempotency, two-decimal money, balanced draft/post, replay safety, manager-only draft cancellation, audit events, trial-balance totals, tenant scoping and role/customer denials.
- Earlier CI failures were diagnosed from their actual logs and fixed: (1) summary counted journal lines, not distinct entries; changed to count distinct entry IDs. (2) missing closing `$$` in the void function, caused by a JS replacement string treating `$$` as `$`; corrected the terminator and re-ran PostgreSQL 17. (3) audit assertion ran under accountant role; test now queries audit events while the manager identity is active, keeping RLS narrow.
- Active implementation comprises `supabase/migrations/20261020010000_accounting_general_ledger.sql`, `src/lib/general-ledger.ts`, `src/components/GeneralLedgerWorkspace.tsx`, the active finance workspace integration, Vitest tests and database acceptance. The unit is target-native; no donor React Router screens or legacy SQL were copied.
- Safety: no historical balances/entries were generated. Automatic ledger posting from future invoices, payments, cash expenses, purchase receipts or Onyx data was not claimed; source-event integration/reconciliation is a follow-up.
- Status: IMPLEMENTED=YES; INTEGRATED=YES on PR branch; TESTED=PASS exact SHA; BROWSER-PROVEN=NOT RUN; PRODUCTION-PROVEN=NOT RUN; production migration=NOT RUN. Parent task `NASR1-ORIGINAL-SPEC-INTERFACE-COMPLETION-002` remains OPEN.



## 2026-10-19 — NASR1-BOLT-ARCHIVE-DELTA-001 — CLOSED

- Reused original ZIP integrity evidence in Action 39294387493; archive bytes were not downloaded, rehashed, CRC-checked, extracted, or re-enumerated again.
- Resolved the 160 pending decision rows (122 changed-content / 64 unique paths and 38 missing-candidate / 19 unique paths). All 717 rows now have target decisions: 548 ALREADY_PRESENT_EXACT, 8 EXCLUDED_SECURITY, 1 prior ADAPT_AND_INTEGRATE, 87 ALREADY_PRESENT_BETTER, 33 KEEP_AS_REFERENCE, 40 INCOMPATIBLE_WITH_EVIDENCE. Pending review count is 0. See ARCHIVE_FEATURE_INTEGRATION_2026-10-19.md and ARCHIVE_MEMBERS.csv.
- Saved the restored master Arabic requirement specification at docs/canonical/AGHBARI_COMMERCE_UNIFIED_MERCHANT_INTELLIGENCE_AND_EXECUTION_MASTER_AR_2026-10-17.txt. Legacy archive tests/execution are NOT RUN; no legacy SQL applied; browser and production proof NOT RUN.

## 2026-10-19 — NASR1-ORIGINAL-SPEC-FINANCIAL-STATEMENTS-003 — PASS exact SHA

- Initial implementation SHA 78cd809a4ce1d6486dfc2ea48219dc435bb3346d failed Action 39319700563: 3 test assertions failed (date error-message regex, duplicate correct amount, brittle access-denial assertion). This failure remains recorded.
- Intermediate commit 436806f9b221f884af859f0c37c6268494e462fe failed Action 39320053536 while those test-only assertion fixes had not yet been added.
- Test corrections landed in 869f0909bda0524275834952f64e1ce1609e79c0. Exact-SHA Action 39320266809 passed: 44/44 files, 336/336 tests; frozen Bun lock verification; PostgreSQL 17 migration/acceptance; lint; build; preview 4173 and dev 5173 smoke.
- Code: src/lib/financial-statements.ts and src/components/GeneralLedgerWorkspace.tsx. Tests: src/test/financial-statements.test.ts and src/test/general-ledger-statements-ui.test.tsx. Tests not run locally; browser/prod checks NOT RUN. main is still 0c089585d27665680dcc4ad2520dd4affc875804; PR #4 only. Next task NASR1-ORIGINAL-SPEC-ACCOUNTING-SOURCE-POSTING-004.


## 2026-10-19 — NASR1-ORIGINAL-SPEC-ACCOUNTING-SOURCE-POSTING-004 — cash expense journals integrated

- Code SHA `df43fb05e9e8a31a8b45e40d38a94f85ff12691b` passed [Actions 39321543032](https://github.com/Report-Engainall/Nasr1/actions/runs/39321543032): 45/45 Vitest files, 339/339 tests, frozen Bun lock, migration + repo-level DB acceptance on PostgreSQL 17, lint, build, production-preview smoke 4173 and dev smoke 5173.
- This current exact commit adds the target-native migration `20261020020000_accounting_source_posting.sql`, UI component `CashExpenseJournalLinker.tsx`, integration into `GeneralLedgerWorkspace.tsx`, and UI tests. Source amount/date/currency are read from a real source row under tenant/finance-role authorization. Explicit active same-org expense and asset accounts are required. New journal is draft-only until a user explicitly posts; repeats resolve to the existing equivalent source journal or reject mapping conflict. FX currencies are blocked until a documented policy exists.
- Trigger guard rejects posting if the linked source is void/changed or journal lines mismatch. Voiding source with a linked draft voids that draft; voiding source with a posted source journal writes a balanced reversal transaction, preserves history and audits the action. Concurrency patch removes source-row lock from a journal-first posting trigger; it was included in the exact SHA above.
- The first execution SHA `191290f8aaebf60715d1bb42c8b9eda394145b0a` was run as Action 39321342608 — SUCCESS. A test-selector refinement was added at `cfc374eb00c481657ab959df8a3a1097d9036caf`, Action 39321447496 — SUCCESS. The lock-order hardening was added at final tested SHA `df43fb05e9e8a31a8b45e40d38a94f85ff12691b`, Action 39321543032 — SUCCESS. No prior failure is erased; financial-statement assertion failures on earlier SHAs are separately documented above.
- Important test boundary: new UI path has Vitest coverage; migration applies and overall Postgres 17 acceptance passed. A dedicated database workflow test of the new create/post/reversal triggers has NOT RUN because `scripts/test-database-migrations.mjs` is protected and currently owned by P1's PR #3. Record a coordination request before touching it; do not imply it was covered by generic migration acceptance.
- Browser, production migration/deployment and real authenticated finance-account proof: NOT RUN. Main remains unchanged. Next ID `NASR1-ORIGINAL-SPEC-ACCOUNTING-SOURCE-POSTING-INVOICES-PAYMENTS-006`.


## 2026-10-20 — P2 task 006: invoice/payment source posting and reversal acceptance

- Exact forward-integrated code SHA `dec9026ef5c1f2c894774f8b68933df5e2dfe01b` passed [Action 39336158916](https://github.com/Report-Engainall/Nasr1/actions/runs/39336158916): unit tests, PostgreSQL 17 migrations/acceptance, lint/build, preview 4173 and dev 5173 smoke.
- Pre-forward feature SHA `f7526eeb075ba95fe8cd1455d25b48d76b3cafe7` passed Action 39335571027; that action did not include latest-main forward integration.
- Retained failure: Action 39335294442 / SHA `fc62a8bb0f38e0eb6ec97c3ae878fec69635f17b`, acceptance readback expected `posted` but got `undefined` because it assumed the source was on the first 50-row page. Fixed using bounded pagination for invoice and payment inbox readback.
- Changed code: accounting migration, new source-linker component, General Ledger registration, component tests and PostgreSQL acceptance. No donor or P1-owned ledger/report modified.
- Production migration, live tenant and browser/manual E2E: **NOT RUN**.
- Next: `NASR1-ORIGINAL-SPEC-CUSTOMER-PRICE-VISIBILITY-007`.

## 2026-10-20 — NASR1-BOLT-APPROVED-ARCHIVE-RECONCILIATION-002 — single-source verification and decisions

- Approved source only: report-insight-engine/main/incoming-archives/nasr1-bolt-recovery-2026-10-17/project-bolt-github-7sl6ykzz (2).zip.
- Exact source bytes 1,009,556; Git Blob SHA-1 4835a0565f799a272dfca0ff49fbc3ce0d760474 matched the downloaded bytes; SHA-256 1a692b013da35b4cb034f5b18f8160ec66bca778bc4649bd5128abc7fccb9be1. ZIP: 421 entries, 359 files, 3,322,389 uncompressed bytes, CRC PASS. No duplicate paths or unsafe traversal/symlink paths found. No archive code executed and no secret values were emitted.
- Compared only this archive against Nasr1 checkpoint e815d1e01e5190220083e0593b8b9d152fc3783a: 270 identical paths, 67 changed, 22 archive-only, 168 target-only. Evidence is in P2_SINGLE_ARCHIVE_MANIFEST_2026-10-20.csv, P2_SINGLE_ARCHIVE_DECISION_MATRIX_2026-10-20.csv and P2_SINGLE_ARCHIVE_RECONCILIATION_2026-10-20.md.
- Decisions: reused target-native routed storefront assistant, wishlist/compare, pricing, inventory, audit, notification, supplier, reporting, AI and Customer 360 capabilities; did not copy legacy React Router pages. Excluded .env and admin-role/password SQL. Admin category CRUD remains a documented gap pending a safe target-native RPC/router implementation.
- No target main/source writes and no changes to P1 ledgers/reports or locked shared app/router/workflow files.
 
## 2026-10-20 — NASR1-ORIGINAL-SPEC-RETURNS-INTAKE-001 — implementation (CI_PENDING)

- P2 branch: feat/p2-customer-return-intake-20261020; code checkpoint before reconciliation docs: 1ee787b27b536d3442bd49c69c5fbc6b166a95d.
- Added tenant-scoped return request/request-line migration with owner/manager read policies, no browser write grants, delivered-order/line ownership guards, maximum quantity enforcement, idempotency, audit, manager review and warehouse receipt/inspection task creation.
- Added customer RTL return form/history to existing order details and manager review queue in the existing task center. Approval/rejection changes request state only. No stock movement, credit memo, ledger posting or refund is generated before physical receipt.
- Added unit tests for request payload limits and response validation plus scripts/test-customer-returns.mjs and appended it to npm run test:db. CI result for final PR head is not yet available at this log point; implementation is not marked PASS.
- Next: NASR1-ORIGINAL-SPEC-RETURNS-RECEIPT-POSTING-002 after exact-head CI and review.


## 2026-10-20 — NASR1-ORIGINAL-SPEC-RETURNS-RECEIPT-POSTING-002 — implementation submitted for CI

- Branch: `feat/p2-customer-return-intake-20261020`; parent code checkpoint `7244ad3ab9d37bf68a3ba2acd918455520798416`, PR #18. Action 39362085506 passed on that prior return-intake SHA only; not counted as a result for this new change.
- Added migration `supabase/migrations/20261020060000_customer_return_receipts.sql`, typed validator `src/lib/customer-return-receipts.ts`, RTL operational UI `src/components/CustomerReturnReceiptQueue.tsx`, unit tests `src/test/customer-return-receipts.test.ts`; connected the new queue to the existing TaskCenter.
- Extended `scripts/test-customer-returns.mjs` rather than P1-owned `scripts/test-database-migrations.mjs`: test wrong-tenant warehouse denial; partial then full receipt; replay; stock movement count; defective quarantine; task completion and queue removal.
- No credit memo, journal posting, invoice change or refund is made in this stage. All remain a separate next task. No secrets or data from other archives were introduced.
- Local npm/lint/build/PostgreSQL commands unavailable without a checkout: NOT RUN. Browser E2E and live/production DB/deployment: NOT RUN. Exact-head CI: PENDING.
- Next task after acceptance: `NASR1-ORIGINAL-SPEC-RETURNS-CREDIT-MEMO-LEDGER-003`.

## 2026-10-20 — verified P2 return receipt + source-linked credit memo — PASS

- Exact branch head: `9758e0b2961b1383b78f2ecf94f75e53e184e17f`; [CI Run 39366508410](https://github.com/Report-Engainall/Nasr1/actions/runs/39366508410), conclusion SUCCESS.
- Verified CI steps: dependency lock verification, unit tests, all database migrations + customer-return/credit-memo acceptance in isolated PostgreSQL 17, lint, build, production preview smoke (4173), dev server smoke (5173).
- Scope passed: tenant-guarded customer return request/review; physical partial/final receipt and idempotent replay; only saleable inspected quantity moves stock; defects are excluded; stock movement and audit logging; source-line-linked credit memo and balanced journal draft; source guard at posting; posted credit reflected in customer statement and staff receivables aging.
- Failures seen and corrected before this PASS: test Arabic validation-message mismatch, foreign-tenant fixture query under the wrong DB role, protected-table inspection under authenticated role, and an acceptance assumption that a source invoice outside the newest-200 customer-statement list would appear on that page. Production's 200-row list cap was preserved; final acceptance checks the credit list/summary and the 500-row staff-aging view.
- Changed implementation paths: `supabase/migrations/20261020060000_customer_return_receipts.sql`; `supabase/migrations/20261020070000_customer_return_credit_memos.sql`; `src/components/CustomerReturnReceiptQueue.tsx`; `src/components/CustomerReturnCreditMemoQueue.tsx`; `src/lib/customer-return-receipts.ts`; `src/lib/customer-return-credit-memos.ts`; `src/test/customer-return-receipts.test.ts`; `src/test/customer-return-credit-memos.test.ts`; `src/components/TaskCenter.tsx`; `scripts/test-customer-returns.mjs`; original intake/review additions in the same PR. P2 status/coordinator/report docs updated alongside this entry.
- No direct `main` writes. P1 protected files unchanged. Local npm/git checks not run because no local checkout; browser authenticated E2E, live/production migration and deployment not run.
- Archive evidence remains the single approved `project-bolt-github-7sl6ykzz (2).zip`, recorded SHA-256 `1a692b013da35b4cb034f5b18f8160ec66bca778bc4649bd5128abc7fccb9be1`; older Bolt archives were not opened or compared.
- Next: `NASR1-ORIGINAL-SPEC-ROLE-BASED-PRINTING-004`, then verify remaining integrations, reporting, inventory, purchasing and role-based UI requirements.


## 2026-10-20 — NASR1-ORIGINAL-SPEC-ROLE-BASED-PRINTING-004 — TESTED_EXACT_SHA PASS

## أحدث حالة تنفيذ P2 — 20 أكتوبر 2026 — طباعة مالية حسب الصلاحية

- المستودع: `Report-Engainall/Nasr1`؛ الفرع `feat/p2-customer-return-intake-20261020`؛ PR [#18](https://github.com/Report-Engainall/Nasr1/pull/18) لا يزال OPEN؛ لا كتابة مباشرة إلى `main`.
- رأس الكود المثبت: `fb8390e9a4693f1d28247bab8fcb308408845284`.
- **اختبار SHA مطابق:** [GitHub Actions 39443178771](https://github.com/Report-Engainall/Nasr1/actions/runs/39443178771) — SUCCESS على SHA نفسه. نجحت خطوات frozen lockfile، Unit tests، migrations واختبارات القبول على PostgreSQL 17 المعزول، lint وفق إعداد workflow (باستثناء قاعدة Prettier الشاملة)، build، وproduction-preview smoke على 4173 وdev smoke على 5173.
- `IMPLEMENTED`: migration للطباعة المالية المحددة بالمؤسسة؛ RPCs لقوائم الفواتير/العملاء/الإشعارات الدائنة، وبيانات الفاتورة، وكشف الحساب؛ تحقق من مجاميع الفاتورة وبنودها؛ ملخص كشف الحساب محسوب من كامل دفتر العميل حسب العملة مع حدود واضحة لتفاصيل 200 فاتورة و500 دفعة و500 إشعار دائن؛ إظهار الإشعارات الدائنة المرحلة فقط في تخفيض الذمم.
- `INTEGRATED`: واجهة `FinanceDocumentPrintActions` ضمن مساحة الأستاذ العام `GeneralLedgerWorkspace`؛ أنماط RTL وطباعة المتصفح/حفظ PDF؛ تحقق payload آمن وDOM يعتمد `textContent` بدل تفسير بيانات المصدر HTML. مصدر طباعة الإشعار الدائن الموجود مسبقًا يعاد استخدامه بدل إنشاء مسار موازٍ.
- `TESTED_EXACT_SHA`: CI المذكور أعلاه غطى اختبار الوحدة والواجهة وقبول PostgreSQL للمحاسب/المدير والعميل العادي وعزل المؤسسة. RPCs الثلاثة تتحقق من الدور المالي على **الملف النشط نفسه**، وتستمد المؤسسة من ملف المستخدم الخادمي، ولا تقبل tenant ID من المتصفح. اختبار قاعدة البيانات يرفض العميل العادي والمستند الأجنبي، ويثبت أن إشعارًا دائنًا مرحّلًا يقلل إجمالي الذمم حسب العملة بالمبلغ نفسه قبل/بعد الترحيل.
- الملفات الجديدة: `supabase/migrations/20261020100000_staff_finance_document_print.sql`, `src/lib/finance-document-print.ts`, `src/components/FinanceDocumentPrintActions.tsx`, `src/test/finance-document-print.test.ts`, `src/test/finance-document-print-ui.test.tsx`. ملفات معدلة: `src/components/GeneralLedgerWorkspace.tsx`, `scripts/test-customer-returns.mjs`.
- فشل محفوظ لا يُحذف: Actions [39441610024](https://github.com/Report-Engainall/Nasr1/actions/runs/39441610024), [39442612711](https://github.com/Report-Engainall/Nasr1/actions/runs/39442612711), [39442912689](https://github.com/Report-Engainall/Nasr1/actions/runs/39442912689). الأولى كانت مقارنة صيغة مبلغ عربية محلية بنص رقمي لاتيني؛ الثانية افترضت خطأ أن كامل رصيد العميل يساوي فاتورة المصدر رغم وجود فواتير أخرى؛ الثالثة افترضت خطأ أن فاتورة المصدر تظهر ضمن أحدث 200 سجل. عولجت الاختبارات إلى فحص دلتا دفتر العميل قبل/بعد إشعار الائتمان وفحص علاقة الإشعار بالفاتورة، من دون توسيع حدود كشف التفاصيل أو تغيير الصلاحيات.
- `BROWSER_PROVEN = NOT RUN`: لم تُشغّل جلسة Playwright بمستخدم حقيقي على متصفح مستقل. `PRODUCTION_PROVEN = NOT RUN`: لم يتم ترحيل migration أو نشر/اختبار على قاعدة إنتاج. لا يُنقل PASS إلى أي رأس لاحق.
- الأرشيف المعتمد فقط هو `project-bolt-github-7sl6ykzz (2).zip` مع البصمات المحفوظة في سجل المصالحة؛ لم يُعد تنزيله أو استخراجه أو حساب بصماته. لا تعديلات على سجلات P1 أو ملفاته المقفلة أو harness الخاص به.
- **next_task_id الوحيد:** `NASR1-ORIGINAL-SPEC-ONYX-INVENTORY-RECONCILIATION-005` — تصميم وتنفيذ دورة مصالحة مخزون Onyx من معاينة محفوظة إلى تطبيق صريح قابل للتدقيق، مع منع تسوية خاطئة بين إجمالي المصدر ومخازن متعددة، ورفض التطبيق عند تغيّر المخزون بعد المعاينة، وتراجع تعويضي لا يمحو حركات أحدث. تبقى المهمة الأم للمواصفة مفتوحة؛ لا يُدّعى اكتمال المنتج كليًا.



## 2026-10-20 — NASR1-ORIGINAL-SPEC-AI-GATEWAY-USAGE-AUDIT-009 — CI pending

- On branch feat/p2-customer-return-intake-20261020 / PR #18, added migration 20261020130000_ai_gateway_usage_measurement_basis.sql, provider attempt telemetry, unit tests and independent PostgreSQL acceptance in scripts/test-ai-gateway-telemetry.mjs; registered in package.json. P1 test harness unchanged.
- Root cause: timeout/failure estimates had been presented in the usage fields as if observed, and no-provider outcomes could return without a ledger event. Now measured/partial/unknown/not_attempted are distinct while conservative estimates remain used for quotas.
- Exact-SHA CI PENDING; browser E2E and production migration/deployment NOT RUN. No archive re-download/extraction/fingerprint changes. Extraction discrepancy 2,329 vs 2,044 remains unresolved. next_task_id remains NASR1-ORIGINAL-SPEC-AI-GATEWAY-USAGE-AUDIT-009 until acceptance.


## Exact-SHA verification — AI Gateway audit — 20 October 2026

Commit 05be5beb50c56e00ec9ee733b2089a259c3d0b3e was tested by Aghbari Commerce checks run 39459540700 (https://github.com/Report-Engainall/Nasr1/actions/runs/39459540700): frozen lockfile, unit tests, PostgreSQL 17 migrations/acceptance including the standalone AI telemetry acceptance, lint, build, preview smoke (4173), and dev smoke (5173) all passed. State for this code SHA: TESTED_EXACT_SHA=PASS. Playwright workflow 39459540701 skips browser execution at the environment credential gate (BROWSER_PROVEN=NOT RUN); production deployment/migration was not run (PRODUCTION_PROVEN=NOT RUN).

Next single live task: NASR1-ORIGINAL-SPEC-CUSTOMER-PRICE-PRIVACY-RECONCILIATION-010. Existing PR #12 at 6417e723a532b4bfd2c1a81c59ff6a78722ed721 fails run 39438180471 because enforce_customer_price_visibility_setting_authority() calls auth.role(), absent in isolated PostgreSQL 17. The diff modifies P1-owned scripts/test-database-migrations.mjs; do not copy that edit. Reconcile the gate in the permitted P2 workstream and add separate acceptance instead.


## 2026-10-20 — CUSTOMER PRICE PRIVACY RECONCILIATION-010 — EXACT SHA PASS

- Worktree path is represented by target branch `feature/customer-price-visibility-20261020`, linked to open PR [#12](https://github.com/Report-Engainall/Nasr1/pull/12); no direct main write and no donor writes.
- Changes: migration `supabase/migrations/20261020040000_customer_price_visibility_controls.sql` now prevents all profiles with the accountant role from receiving `products.base_price` through storefront price RPC, including overlapping manager/accountant role rows, while preserving customer-tier and active-promotion price resolution. Existing server-side hidden-price settings continue to omit monetary values in cart/order preview and invoice-PDF RPC payloads. New P2-owned acceptance `scripts/test-customer-price-visibility.mjs` is registered in `package.json` `test:db` and rolls back its fixture mutations in its own transaction.
- Commits in this branch: `b592bf1c1b678402b5233ec12e39c07cbddeaab8` (accountant path fix); `35a584a48d4b22048be710b2ee2b5d5117262cba` (restore campaign price resolver); `88d6d7f4d35ae1be575eb799297d6987143ef4ef` (standalone acceptance); `fe6362cee94e49ca62da19e5515cb2b05ee36863` (test:db registration); `bc07b8a768ec323cbc8b90a548d22eceb3bdeee4` and `be595fc74b8bbf64b308b84210d86a9aa1d464b8` (correct PostgreSQL jsonb boolean binding).
- Tested exact SHA: `be595fc74b8bbf64b308b84210d86a9aa1d464b8`; Actions [39463202326](https://github.com/Report-Engainall/Nasr1/actions/runs/39463202326) SUCCESS. Evidence: lockfile, unit tests, isolated PostgreSQL 17 migrations/workflows, standalone customer price privacy PASS, lint, build, preview smoke 4173 and dev smoke 5173.
- Preserved failures and causes: [39461846235](https://github.com/Report-Engainall/Nasr1/actions/runs/39461846235) exposed base-price leakage; [39462182435](https://github.com/Report-Engainall/Nasr1/actions/runs/39462182435) then verified price resolver fixes; [39462590784](https://github.com/Report-Engainall/Nasr1/actions/runs/39462590784) exposed JSON/string mismatch; [39462865550](https://github.com/Report-Engainall/Nasr1/actions/runs/39462865550) exposed boolean-to-jsonb parameter mismatch, fixed with `db.json(visible)` and rerun on current SHA. No failures were deleted and no policy/permission was relaxed.
- Proof axes: `IMPLEMENTED=YES`; `INTEGRATED=YES on PR #12 branch, NOT merged to main`; `TESTED_EXACT_SHA=PASS`; `BROWSER_PROVEN=NOT RUN`; `PRODUCTION_PROVEN=NOT RUN`.
- Governance: no edits made in this batch to P1-locked `scripts/test-database-migrations.mjs`, `.github/workflows/commerce-checks.yml`, customer API/route files, or P1 manifests/reports. However, prior existing PR #12 diff contains a change to `scripts/test-database-migrations.mjs`; P1 must resolve this historical diff before merge. Do not merge PR #12 until ownership review; P2 separate DB acceptance is the permitted path.
- Source archive review remains unchanged: no ZIP re-download/re-extraction/re-hashing; 2,329 tree entries versus 2,044 reported files remains an open discrepancy, not reconciled.
- The single active next task is `NASR1-ORIGINAL-SPEC-IDENTITY-AND-ONYX-SYNC-EVIDENCE-011`, tracked in the newest P2 report/state checkpoint. Continue only on the existing PR #18 branch and avoid P1-owned files.


## 2026-10-20 20:42 +03 — P2 activation dependency checkpoint (no code pass claimed)
- Read live PR #18 metadata: open, P2 branch `feat/p2-customer-return-intake-20261020`, observed head `f11f412afd6799aa1809deedcbe434abbcc598b0`, base `c3fa1c52bd9c34d111e484b407d5eea2c2cefc07`. Read PR #26 metadata and changed filenames; it is open/draft at head `2ced1b676c34cd750910bfce503abbaa78d598a8` and does not change the three shared P2-owned paths.
- Observed exact pre-checkpoint SHA workflow records: [39463815150](https://github.com/Report-Engainall/Nasr1/actions/runs/39463815150) Aghbari Commerce checks SUCCESS; [39463815138](https://github.com/Report-Engainall/Nasr1/actions/runs/39463815138) Playwright workflow SUCCESS as a workflow result, not automatically browser proof.
- Updated `WORK_COORDINATION.md` with explicit no-parallel-edit ownership for `src/components/AghbariApp.tsx`, `src/routeTree.gen.ts`, `scripts/test-database-migrations.mjs`. Coordination commit: `6a48072e9a89dbf6591587381e90f6cbd163af94`.
- Updated `PROGRAMMER_2_CURRENT_REPORT.md` with checkpoint and single active pointer in commit `75cc082d236a9cbdd7abe15c730b5dd7d9f09725`; readback verified blob SHA `6748b511ab0d9d712538c0e80504af886f997fee` and the active task/status text.
- Root-cause item confirmed from harness read: `setIdentity()` writes `email_confirmed_at` into JWT claims. That is not acceptable proof of the authoritative `auth.users.email_confirmed_at` source. Fix fixture setup/role context; do not loosen RLS or direct table privileges.
- No code implementation, route generation, PostgreSQL feature acceptance, or new exact-head CI has been completed in this checkpoint. Do not report activation as integrated/tested. Browser and production proof remain NOT RUN until evidenced.
- next_task_id: `NASR1-P2-CUSTOMER-ACTIVATION-SHARED-PATH-INTEGRATION-012`.


## 2026-10-20 — P2 activation dependency integrated and tested — exact SHA PASS

- **Exact code/test SHA:** `316f02e7235cd1369ff9366b21c05d85d1c87e2c`; branch `feat/p2-customer-return-intake-20261020`; PR #18. [Aghbari Commerce checks 39472690016](https://github.com/Report-Engainall/Nasr1/actions/runs/39472690016) SUCCESS on that exact SHA.
- Verified steps in that run: frozen Bun lock; 66/66 unit test files; migrations + PostgreSQL 17 workflow and security acceptance; lint; Vite/Nitro build; production preview smoke on 4173; dev smoke on 5173; cleanup. Log contains `PASS customer activation invitations: auth.users confirmation/email, tenant and role guards, hash-only token, no direct table DML, one-use/replay, expiry/revoke and audit trail`.
- P2 integration: `src/components/AghbariApp.tsx` adds the existing target-native `CustomerActivationInvitationDialog` to approved customer rows and restricts its UI to admin/manager/staff; UI shows actual success/error response. New `src/routes/customer.activate.$token.tsx` and route-tree entry expose `/customer/activate/$token`. Existing service/RPC contract is reused; no legacy customer_invitations schema, direct browser table reads, or fake email delivery.
- Migration `supabase/migrations/20261020140000_customer_activation_invitations.sql` is a clean target-native copy of P1's invitation behavior adapted to P2 migration numbering. The shared `20261020110000` slot is already used by P2 `onyx_inventory_reconciliation_apply_rollback.sql`; P1's draft migration version must not be merged in collision. Authenticated RPC grants are explicit; invitation table remains RLS-enabled with direct table SELECT/INSERT/UPDATE/DELETE revoked from PUBLIC, anon and authenticated.
- Acceptance uses `auth.users.email_confirmed_at` and the authoritative Auth email row, not a fabricated JWT email-confirmed claim. It verifies authenticated and anon direct DML denial, tenant/org and staff denial, email mismatch, unconfirmed Auth row, incorrect/expired/revoked token, successful one-use and replay rejection, persisted SHA-256 digest without raw bearer token, and created/accepted/revoked audit events.
- CI failure history was preserved and corrected:
  1. [39471381202](https://github.com/Report-Engainall/Nasr1/actions/runs/39471381202): activation migration static test detected 6 audit insert strings (duplicated function blocks from a malformed JS replacement operation). Rebuilt the migration from P1's clean source, patched authoritative Auth-email handling, and re-read it; resulting migration has exactly four RPC functions and three audit insert bodies.
  2. [39472050536](https://github.com/Report-Engainall/Nasr1/actions/runs/39472050536): unit tests passed; PostgreSQL script then failed to parse because an activation result variable named `accepted` conflicted with a prior company-membership test variable. Renamed activation-local variable to `activationAccepted`.
  3. [39472344054](https://github.com/Report-Engainall/Nasr1/actions/runs/39472344054): activation checks executed but legacy customer-company membership test expected a JWT confirmation claim. Removed the claim from global `setIdentity()`, added a scoped `setCompanyInvitationConfirmedClaim()` only around legacy company-membership cases (including finance role), and kept activation tests relying on actual `auth.users`. No RLS or grants were relaxed.
  4. [39472690016](https://github.com/Report-Engainall/Nasr1/actions/runs/39472690016): final exact SHA passed unit tests, PostgreSQL 17, lint, build and both smoke tests.
- [P2 Playwright workflow 39472690030](https://github.com/Report-Engainall/Nasr1/actions/runs/39472690030) is success at workflow level, but its explicit gate skipped app build / browser test steps because isolated non-production Supabase settings and two cross-tenant test accounts were missing. Therefore `BROWSER_PROVEN=NOT RUN / BLOCKED_EXTERNAL`; this run is not browser evidence. Production migration/deployment/authenticated production proof remain `NOT RUN`.
- P1 dependency handoff posted on [PR #26](https://github.com/Report-Engainall/Nasr1/pull/26), comment ID `6297892775`, with exact SHA/CI, migration version collision warning, route/UI/DB proof and remaining browser/production limits. P1-owned report/source CSVs were not modified.
- P2 main file blob fingerprints at tested SHA: `src/components/AghbariApp.tsx` `51693ca9d00d3fcc575480cc6475ab4a7e5b335c`; `src/routeTree.gen.ts` `416c4c1146000045e7fbef34a40eae1557462863`; `scripts/test-database-migrations.mjs` `5975d49b3b7a4438c2a961d35ef2d2910d28017b`; activation migration `f62ec20998ddc4b6a00517bdab1f55c9a73d58da`. Status documentation subsequently advances the branch head, so these are app-code fingerprints, not claims that later documentation-only heads have the same SHA.
- Archive source-count discrepancy 2,329 vs 2,044 remains unresolved evidence; no archive re-download, re-extraction or fingerprint recalculation occurred.
- **next_task_id now `NASR1-ORIGINAL-SPEC-IDENTITY-AND-ONYX-SYNC-EVIDENCE-011`**. Next single active task: trace target-native identity/brand/source IDs/external sync metadata through persistence, service, current screens and acceptance; identify a bounded gap and test it. Maintain clear differences between saved Onyx snapshot, imported data, sync attempt, and genuinely proven live sync. Live connector is not claimed without credentials and an observed successful sync.

## 2026-10-20 21:30 +03 — P2 Onyx source-evidence repair and exact-SHA acceptance

- Active target remained Report-Engainall/Nasr1, branch feat/p2-customer-return-intake-20261020, PR #18, base SHA c3fa1c52bd9c34d111e484b407d5eea2c2cefc07. Customer activation was completed first; the single active pointer returned to NASR1-ORIGINAL-SPEC-IDENTITY-AND-ONYX-SYNC-EVIDENCE-011.
- Preserved root failure: [Actions 39474066438](https://github.com/Report-Engainall/Nasr1/actions/runs/39474066438) failed PostgreSQL 17 in public.get_onyx_snapshot_source_evidence(uuid) with SQLSTATE 42703: record v_job has no field updated_at. The actual import_jobs row type has no updated_at column. Activation and return acceptance had already printed PASS before the failure; this historical record stays intact.
- Fixed migration supabase/migrations/20261020150000_onyx_snapshot_source_evidence.sql: missing update time is returned as NULL, never fabricated; source_record_id is NULL when only a source_import_job_id exists, avoiding an import-job UUID being mislabeled as an external source record. Existing row-level external-ID fields/count still come from stored source rows. The panel shows DB-derived organization identity and explicitly keeps live_sync_evidence as not_proven/false.
- Acceptance additions assert persisted organization ID/name, unknown update time, distinct source record ID, tenant and warehouse scope, role boundary, preview no-write, idempotency, reservation guard, atomic stale-apply refusal, append-only movements, compensating rollback and rejection of rollback across newer movement history. The Onyx test fixture no longer fabricates email_confirmed_at inside JWT claims. Unit/UI tests now assert unavailable fields render honestly.
- Preserved intermediate failure: [Actions 39474899270](https://github.com/Report-Engainall/Nasr1/actions/runs/39474899270) failed one UI test because the query selected the strong label rather than the containing row. The assertion was corrected; no permission or database rule was weakened.
- Exact code/test SHA efcf786c9103d6ec4000773423150020d091a9aa passed [Aghbari Commerce checks 39475081683](https://github.com/Report-Engainall/Nasr1/actions/runs/39475081683): 68/68 test files, 475/475 unit tests, PostgreSQL 17 migrations/core/activation/returns/Onyx acceptance, lint, build, preview smoke 4173 and dev smoke 5173. Log readback contains explicit PASS lines for customer activation invitations, customer returns and Onyx inventory reconciliation.
- Boundaries: [Playwright workflow 39475081580](https://github.com/Report-Engainall/Nasr1/actions/runs/39475081580) succeeded at workflow level, but its external-infrastructure gate skipped Node setup, dependencies, build, app launch and browser tests. BROWSER_PROVEN=NOT RUN / BLOCKED_EXTERNAL; PRODUCTION_PROVEN=NOT RUN. Local tests outside CI were NOT RUN.
- P1 handoff refresh posted to PR #26, comment 6298231018. PR #26 is still draft and the version collision remains: P1 has 20261020110000_customer_activation_invitations.sql, while P2 has 20261020110000_onyx_inventory_reconciliation_apply_rollback.sql. Do not merge until P1 resolves the migration version/content collision. No P1 evidence files or donor repositories were edited.
- The 2,329 vs 2,044 extraction-count discrepancy remains unresolved evidence; archives were not re-downloaded, extracted or rehashed.
- The tested application code SHA is efcf786c9103d6ec4000773423150020d091a9aa. Later documentation commits can advance PR HEAD, so check final live SHA and its own CI before starting another task. Single active pointer remains NASR1-ORIGINAL-SPEC-IDENTITY-AND-ONYX-SYNC-EVIDENCE-011; next action is trace source/organization IDs through imports, inventory, reporting and financial documents. Do not imply live sync without evidence.


## P2 live checkpoint — activation acceptance and report-level Onyx provenance — 2026-10-20

- P2 branch `feat/p2-customer-return-intake-20261020`, PR #18, code/test SHA `0c817109eb630e8c3870e533fef5fcb1766881be`: [Aghbari Commerce checks 39478994572](https://github.com/Report-Engainall/Nasr1/actions/runs/39478994572) SUCCESS. Verified exact workflow: frozen lock, unit tests 68/68 files, PostgreSQL 17 migrations/workflow acceptance, lint, build, production preview smoke 4173, dev smoke 5173. Output markers: PASS customer activation invitations; PASS customer returns; PASS Onyx inventory reconciliation. The dedicated Onyx reconciliation harness also asserted source evidence uses active DB organization identity, links the same-tenant actual import job, represents absent `import_jobs.updated_at` and missing independent source-record ID as NULL, preserves external_id/onyx_code values from two persisted snapshot rows, leaves `live_connection_proven=false`, and denies another organization's snapshot.
- Applied task 011 substep by rendering `OnyxSnapshotSourceEvidencePanel` in the actual Reports path through `UnifiedOnyxAnalysisPanel`; added tests for organization identity, source external-ID sample and no-live-sync wording. Current blobs: panel `db6e44ff62d413443695e7101907c548b78a6fb5`; test `31576bbca9a27b9aecf2e519f55d67c4a563caca`. Exact source/test SHA passed Action 39478994572.
- Failure preserved: [Action 39476075331](https://github.com/Report-Engainall/Nasr1/actions/runs/39476075331), SHA `633d6d18d4d447544b4eac757f274da18d72c590`, unit failure “Found multiple elements with the text: external_id.” Root fix committed as `358a073d0e9b78ecfabd13d3b3297319862b7f5d`; exact run [39477827996](https://github.com/Report-Engainall/Nasr1/actions/runs/39477827996) passed. P1 handoff comment 6298705621 links that proof.
- Failure preserved: [Action 39478773548](https://github.com/Report-Engainall/Nasr1/actions/runs/39478773548), SHA `dadb940e1485b1dcd795e779bf22026e6e84de1a`, new report test expected exact match for text that was part of a longer sentence. Changed assertion to a substring regex; commit/SHA `0c817109eb630e8c3870e533fef5fcb1766881be` was verified green by Action 39478994572. No permission, SQL, or product behavior was relaxed.
- [Playwright 39478994561](https://github.com/Report-Engainall/Nasr1/actions/runs/39478994561) = workflow SUCCESS only; explicit gate skipped actual app build, launch, and browser tests for absent non-production E2E credentials/accounts. Browser and production proof remain NOT RUN.
- PR #26 merge blocker: `20261020110000_customer_activation_invitations.sql` collides with P2 `20261020110000_onyx_inventory_reconciliation_apply_rollback.sql`. No concurrent PR merges; no P1-owned reports/ledgers/reuse-audit or donor files were edited. Archive discrepancy 2,329 vs 2,044 is still unresolved and archives untouched.
- Single active pointer: `NASR1-ORIGINAL-SPEC-IDENTITY-AND-ONYX-SYNC-EVIDENCE-011`; next bounded substep is source identity/provenance through Onyx export and financial/customer documents, without associating data absent a persisted relationship.


## P2 live checkpoint — Onyx evidence CSV export + finance issuer identity — 2026-10-20

- P2 code/test head 3fb70618eabd9f93d67f734987a1f196ca4c9084 exact CI [39481288019](https://github.com/Report-Engainall/Nasr1/actions/runs/39481288019) SUCCESS: “Test Files 69 passed (69)”; PG17 migration/core acceptance passed, including activation and returns, Onyx reconciliation/export boundaries, lint/build and 4173/5173 smoke checks.
- Root-cause failure retained: [39481109555](https://github.com/Report-Engainall/Nasr1/actions/runs/39481109555), no-control-regex in CSV formula guard. Source-level fix uses a character-code loop; exact fix head passed. Do not delete or overwrite the historical failure record.
- Playwright [39481288053](https://github.com/Report-Engainall/Nasr1/actions/runs/39481288053) workflow SUCCESS, but external gate skipped app build/launch/actual browser tests; browser and production proof remain NOT RUN.
- P1 handoff comment 6298705621 remains available; P1/P2 migration collision remains a merge blocker; no concurrent merges. Archive count difference remains unresolved evidence. No donor or P1-owned ledger/report edited.
- Single active pointer retained: NASR1-ORIGINAL-SPEC-IDENTITY-AND-ONYX-SYNC-EVIDENCE-011. Next bounded task: outbound Onyx source/export identity trace, then server-authorized finance role/price visibility tests.


## P2 live checkpoint — Onyx source evidence CSV export and exact-SHA verification — 2026-10-20

- Target: `Report-Engainall/Nasr1`, branch `feat/p2-customer-return-intake-20261020`, PR #18. Code/test SHA: `3fb70618eabd9f93d67f734987a1f196ca4c9084`; base reference: `c3fa1c52bd9c34d111e484b407d5eea2c2cefc07`.
- Exact-SHA CI PASS: [Aghbari Commerce checks 39481288019](https://github.com/Report-Engainall/Nasr1/actions/runs/39481288019). Confirmed 69/69 unit-test files passed (including the new Onyx CSV formatter and browser download tests); isolated PostgreSQL 17 migrations/workflow acceptance passed; lint passed with 0 errors (11 warnings); build passed; production-preview smoke on 4173 and dev smoke on 5173 passed.
- Implemented/integrated `src/lib/onyx-source-evidence-export.ts` and a download control in `src/components/OnyxSnapshotSourceEvidencePanel.tsx`. CSV is rendered only from the existing tenant-scoped `get_onyx_snapshot_source_evidence` RPC response; it exports the database organization identity, snapshot/import linkage and SHA-256 hashes, bounded external-ID samples, truncation indicators and explicit unavailable values. Leading controls/whitespace are scanned by character code and spreadsheet-formula prefixes `= + - @` are neutralized; CSV quotes are escaped. Unit tests cover malicious cells, quoted commas/quotes, missing import links and the unproven live-sync boundary.
- The panel is wired in the existing Onyx Snapshot Center and report analysis paths. It does not re-query around RLS, invent an external source record ID, or label a saved snapshot/import as a live sync. `live_sync_evidence.status=not_proven`, `live_connection_proven=false`, and last live-sync time unavailable remain intentional because no live connection evidence/credential was verified.
- Activation integration revalidated on the same code/test SHA: admin customer invitation control, generated `/customer/activate/$token` route and PostgreSQL acceptance remain present. Database acceptance tests use `auth.users.email_confirmed_at` for email truth, hash-only invitation tokens, tenant/role/email/expiry/replay guards, audit assertions and direct-table-DML denial. No RLS/grants were weakened.
- Preserved failure: [run 39481109555](https://github.com/Report-Engainall/Nasr1/actions/runs/39481109555) failed lint because `no-control-regex` rejected the initial control-character regex. The guard was changed to a character-code scan in commit `3fb70618eabd9f93d67f734987a1f196ca4c9084`; no lint rule was disabled. That exact SHA passed run 39481288019.
- Browser/production proof remains separate: [Playwright workflow 39481288053](https://github.com/Report-Engainall/Nasr1/actions/runs/39481288053) exited successfully after the external-infrastructure gate skipped app launch and actual browser tests. `BROWSER_PROVEN=NOT RUN / BLOCKED_EXTERNAL`; `PRODUCTION_PROVEN=NOT RUN`; local shell tests `NOT RUN`.
- Activation evidence was handed to P1 in [PR #26 comment 6299113226](https://github.com/Report-Engainall/Nasr1/pull/26#issuecomment-6299113226). Merge remains blocked by P1 migration `20261020110000_customer_activation_invitations.sql` colliding with P2 migration `20261020110000_onyx_inventory_reconciliation_apply_rollback.sql`; P2's activation migration remains `20261020140000_customer_activation_invitations.sql`. Do not merge PR #18 and #26 concurrently. P1-owned `PROGRAMMER_1_CURRENT_REPORT.md`, `SOURCE_INTEGRATION_LEDGER.csv` and `READY_TO_REUSE_FILE_AUDIT.csv` were not edited.
- Archive discrepancy 2,329 tree entries versus 2,044 reported extracted files remains unresolved evidence; no re-download, re-extraction or fingerprint recalculation was done.
- State axes: `IMPLEMENTED=YES`, `INTEGRATED=YES`, `TESTED_EXACT_SHA=PASS`; `BROWSER_PROVEN=NOT RUN / BLOCKED_EXTERNAL`; `PRODUCTION_PROVEN=NOT RUN`.


Prior lint failure retained as history: `39481109555` rejected `no-control-regex`; corrected in `3fb70618eabd9f93d67f734987a1f196ca4c9084` and verified green in `39481288019`. Do not replace the failed-run record with a generic PASS.



## P2 FINAL BATCH CHECKPOINT — Onyx provenance + source-backed finance print — 2026-10-20

- Target only: `Report-Engainall/Nasr1`; branch `feat/p2-customer-return-intake-20261020`; PR #18. Code/test HEAD: `6360029af6f382c19d7e42b68eb4b7ad35c0bce2`; PR base SHA: `c3fa1c52bd9c34d111e484b407d5eea2c2cefc07`.
- Exact-HEAD CI PASS: [Aghbari Commerce checks #39485608035](https://github.com/Report-Engainall/Nasr1/actions/runs/39485608035). Evidence: 69/69 unit-test files pass; all migrations and core-workflow acceptance on isolated PostgreSQL 17 pass; lint pass; production build pass; preview smoke port 4173 pass; dev smoke port 5173 pass.
- Onyx inbound evidence export: `src/lib/onyx-source-evidence-export.ts` plus download action in `src/components/OnyxSnapshotSourceEvidencePanel.tsx`; UI and formatter tests pass on this HEAD. Output is built only from the existing tenant-scoped evidence RPC and includes organization identity, snapshot/import relationship, source-file SHA-256, source IDs and bounded external-ID examples, truncation flags and explicit `NOT_RECORDED/NOT_AVAILABLE` states. CSV formula-like text is neutralized after scanning leading control/whitespace characters; CSV quoting is escaped.
- Onyx outbound order export: approved-order/tenant/actor checks remain server-side in `record_onyx_order_export`; `src/lib/onyx-export.ts` now embeds the returned persisted audit event ID in the resulting XLSX. The workbook deliberately reports compatibility `غير مثبت`; central audit proves preparation, not that a browser completed download or that Onyx accepted the file.
- Live Onyx connection/sync: **NOT PROVEN**. No live connection credential/response or successful live sync evidence is asserted. The evidence export uses `live_sync_evidence.status=not_proven`, `live_connection_proven=false`, and marks live sync time unavailable rather than inventing one.
- Source-backed finance printing: `scripts/test-database-migrations.mjs` now verifies admin/manager/accountant successful invoice and statement reads and issuer identity from the current organization; staff/customer denials; and cross-tenant isolation for invoice, statement, and an actual persisted credit memo. The credit memo path uses an actual invoice line, an approved return request, a received return via RPC, and `prepare_customer_return_credit_memo`; the authorized PDF RPC returns the original return-request, invoice, journal and line identities. The resulting journal remains `draft`; no financial posting was performed by printing.
- Financial values in the CI fixture reconcile to persisted source data: invoice total 370,000; payment 100,000; outstanding 270,000. The posted general-ledger totals remain unchanged by the draft return-credit journal. The role-based staff print RPC test does **not** claim that customer-facing price/total hiding has been verified; that remains explicitly assigned to the next price-privacy task.
- The ledger test initially failed at run [39485302880](https://github.com/Report-Engainall/Nasr1/actions/runs/39485302880) because it assumed only one ledger entry after the new source-linked return fixture created a draft journal. Fixed on `6360029af6f382c19d7e42b68eb4b7ad35c0bce2`: the test now checks both source entries, asserts the return journal is still draft, and preserves the posted-entry count and debit/credit totals. Exact-HEAD run #39485608035 passes.
- Earlier failures retained in chronology: run [39481109555](https://github.com/Report-Engainall/Nasr1/actions/runs/39481109555) was the `no-control-regex` lint rejection; fixed using a character-code scan with lint policy intact. Run [39482609393](https://github.com/Report-Engainall/Nasr1/actions/runs/39482609393) exposed a finance-payment UI test selecting the wrong form and omitting mounted finance RPC mocks; fixed by scoping the form and adding specific test mocks. Run [39485302880](https://github.com/Report-Engainall/Nasr1/actions/runs/39485302880) is also retained as described above.
- Customer activation remains integrated and exact-head tested: admin invitation dialog, generated `/customer/activate/$token` route, PostgreSQL guards using `auth.users.email_confirmed_at`, hash-only invitation token, tenant/email/role/expiry/replay guard, direct invitation-table DML denial and audit. P1 handoff: [PR #26 comment 6299113226](https://github.com/Report-Engainall/Nasr1/pull/26#issuecomment-6299113226).
- Browser and production axes remain separate: [Playwright Critical Paths #39485607806](https://github.com/Report-Engainall/Nasr1/actions/runs/39485607806) completed successfully, but its app setup/actual browser checks were skipped by the external-credentials/infrastructure gate. `BROWSER_PROVEN=NOT RUN / BLOCKED_EXTERNAL`; `PRODUCTION_PROVEN=NOT RUN`; local shell tests `NOT RUN`.
- Merge blocker remains: P1 PR #26's `20261020110000_customer_activation_invitations.sql` conflicts by migration version with P2 `20261020110000_onyx_inventory_reconciliation_apply_rollback.sql`; P2's tested activation migration is at `20261020140000_customer_activation_invitations.sql`. Do not merge PR #18 and PR #26 concurrently. No P1-owned report or source ledger/audit files were modified.
- Archive discrepancy `2,329` tree entries versus `2,044` reported extracted files remains unresolved evidence, not proven loss or a closed issue. No archive re-download, extraction, or fingerprint recalculation was performed.
- Status axes: `IMPLEMENTED=YES`, `INTEGRATED=YES`, `TESTED_EXACT_SHA=PASS`; `BROWSER_PROVEN=NOT RUN / BLOCKED_EXTERNAL`; `PRODUCTION_PROVEN=NOT RUN`.

### Failure/fix sequence retained

1. `39481109555`: ESLint rejected the initial CSV control-character regex under `no-control-regex`; replaced it with a character-code scan; verified green on a subsequent exact SHA.
2. `39482609393`: a finance payment unit-test helper queried the first mounted form and lacked finance RPC mocks; scoped to the invoice selector's form and mocked only the mounted finance read RPCs.
3. `39485302880`: source-linked return acceptance correctly produced a draft journal, invalidating the old assumption that only the manually-created ledger journal existed. The fixture now asserts both entries, verifies the return journal remains draft and protects the posted-only count and totals. Verified by `39485608035` at exact HEAD `6360029af6f382c19d7e42b68eb4b7ad35c0bce2`.

### Verified result

`6360029af6f382c19d7e42b68eb4b7ad35c0bce2` — [run 39485608035](https://github.com/Report-Engainall/Nasr1/actions/runs/39485608035): 69/69 unit-test files PASS; PostgreSQL 17 migration and core workflow acceptance PASS; lint PASS; build PASS; preview smoke 4173 PASS; dev smoke 5173 PASS. Playwright workflow success did not execute real browser tests because the external gate skipped them. Production proof NOT RUN.

**Superseding single active `next_task_id`: `NASR1-ORIGINAL-SPEC-CUSTOMER-PRICE-PRIVACY-RECONCILIATION-010`.**

The saved 011 work now has exact-SHA CI evidence for source-provenance exports, Onyx order-export audit correlation, activation guards, and source-backed finance printing. Live Onyx synchronization remains unproven and must stay labeled as such; customer-facing price/total hiding policy is not yet verified by this finance-print batch.

**Next task only:** inspect PR #12 source evidence at HEAD `be595fc74b8bbf64b308b84210d86a9aa1d464b8` and CI `39463202326`, then implement/test price visibility on the P2 branch without editing any P1-locked path. PR #26 currently owns overlapping diffs in `src/components/Storefront.tsx`, `src/lib/auth.tsx`, `src/lib/auth-redirect.ts`, and `src/lib/api.ts`; do not touch these without explicit path-level coordination. Prioritize isolated backend/RPC and database acceptance work until the shared-path ownership is resolved. Do not merge PRs concurrently.



## P2 CURRENT CHECKPOINT — customer price privacy, invoice PDF masking, exact-SHA CI — 2026-10-20

- Target `Report-Engainall/Nasr1`, branch `feat/p2-customer-return-intake-20261020`, PR #18. Exact code/test HEAD: `b261d49fe65c631b989ae68af58ecf64d1e7aa98`; base SHA `c3fa1c52bd9c34d111e484b407d5eea2c2cefc07`.
- Exact-HEAD CI: [Aghbari Commerce checks #39488147019](https://github.com/Report-Engainall/Nasr1/actions/runs/39488147019) — **SUCCESS** on `b261d49fe65c631b989ae68af58ecf64d1e7aa98`. Job steps: verified Bun lockfile, dependencies installed, unit tests PASS, all migrations/core workflow acceptance on isolated PostgreSQL 17 PASS, lint PASS, build PASS, preview smoke port 4173 PASS, dev smoke port 5173 PASS.
- Price-privacy database migration `supabase/migrations/20261020040000_customer_price_visibility_controls.sql` was added. It sets conservative defaults and puts visibility decisions in tenant-scoped server RPCs: `get_public_storefront_settings()`, `get_storefront_product_prices(uuid[], numeric)`, `preview_customer_order_pricing(jsonb, text)`, `get_customer_invoice_pdf(uuid)`. Direct raw monetary columns/RLS grants were not widened.
- Settings UI is integrated into the existing Storefront tab in `src/components/AdminPages.tsx` using persisted organization settings and existing `canManageStorefrontContent` authority. It exposes five controls: product-card price, cart/review pricing, order pricing, customer invoice amounts, and customer-tier visibility. Ordinary staff do not see the controls (test `src/test/admin-price-privacy-settings.test.tsx`).
- Invoice PDF flow is linked end-to-end from server response to PDF generation: `src/routes/api.invoice-pdf.$invoiceId.ts` requires an explicit server-returned `financial_details_visible` boolean; `src/lib/finance-document-pdf.ts` hides the per-line unit-price/line-total fields and totals section if false. `src/test/finance-document-pdf-source-reconciliation.test.ts` verifies that hidden data remains absent and the PDF text does not print the financial fields.
- The first privacy CI attempt exposed a stale existing PostgreSQL assertion that expected default customer invoice amounts. The server’s defined default is `show_price_in_invoice=false` and correctly omits `subtotal`, `tax_amount`, `total_amount`, `unit_price`, and `line_total` keys from RPC JSON. The old assertion was replaced with explicit key-absence assertions; exact-head run #39488147019 then passed.
- **Remaining integration dependency:** do not edit `src/components/Storefront.tsx` while P1 PR #26 owns its current diff. Customer-facing cards/cart/order review still need P1 to consume the server visibility/pricing RPCs and suppress hidden amounts (never format a non-price sentinel as zero). P2 has posted the contract/integration handoff in [PR #26 comment #6300246106](https://github.com/Report-Engainall/Nasr1/pull/26#issuecomment-6300246106). This vertical slice is not yet claimed `BROWSER_PROVEN` or production-proven.
- `package.json` also overlaps P1. P2 currently wires the privacy acceptance script into `test:db`; PR #26 currently adds separate customer-cart persistence and admin-catalog acceptance scripts on its branch. Resolve this overlap only during the required sequential merge/rebase, retaining **all** scripts; do not call files/scripts from P1 that are not yet present in the checked-out branch.
- Playwright workflow [39488147057](https://github.com/Report-Engainall/Nasr1/actions/runs/39488147057) returned workflow SUCCESS but its app install, launch and actual critical-path browser tests were **SKIPPED** by the external-infrastructure gate. Status: `BROWSER_PROVEN=NOT RUN / BLOCKED_EXTERNAL`; `PRODUCTION_PROVEN=NOT RUN`.
- Existing release blocker remains: P1 `20261020110000_customer_activation_invitations.sql` conflicts by migration version with P2 `20261020110000_onyx_inventory_reconciliation_apply_rollback.sql`. Keep PR #18 and PR #26 sequential; never merge both concurrently.
- Onyx live connection/sync remains `NOT PROVEN`; saved snapshot and import history are not treated as live sync evidence. Archive enumeration difference (2,329 versus 2,044 reported extracted files) remains unresolved evidence, not proof of data loss.
- Status axes: `IMPLEMENTED=YES`, `INTEGRATED=SERVER+ADMIN SETTINGS+INVOICE PDF=YES`, `TESTED_EXACT_SHA=PASS`; `CUSTOMER_STOREFRONT_UI=BLOCKED_P1_SHARED_PATH`; `BROWSER_PROVEN=NOT RUN / BLOCKED_EXTERNAL`; `PRODUCTION_PROVEN=NOT RUN`.


**Single active `next_task_id`: `NASR1-ORIGINAL-SPEC-CUSTOMER-PRICE-PRIVACY-RECONCILIATION-010`.**

Next action only: after P1 confirms its Storefront path is ready for integration, wire product cards and cart/order-review surfaces to the server pricing/visibility RPCs without changing P1 work blindly. Keep the server response authoritative; do not render hidden values or a sentinel as zero. Re-run exact-HEAD CI, then browser prove the enabled and disabled state once external credentials/infrastructure are available. In parallel, resolve `package.json` test script overlap only with a coordinated sequential rebase; preserve both P1 acceptance scripts and all P2 suites. Do not advance the pointer until customer-facing product/cart/order visibility is wired and verified.


### P2 receipt concurrency acceptance checkpoint — 2026-10-20

- Code/test SHA: `40afb151019eb40306964606c3de8ee26cf6d6b0`; exact CI: [39489672958](<https://github.com/Report-Engainall/Nasr1/actions/runs/39489672958>) SUCCESS. Unit tests, PostgreSQL 17 migration/core acceptance, lint, build, preview smoke (4173), and dev smoke (5173) all passed on the same SHA.
- Added concurrent receipt idempotency acceptance through two separate database sessions; both calls must resolve to one receipt, with one create and one replay. Persisted header/audit attribution and post-close denial are also asserted. DB output contains `PASS customer returns` and `PASS customer price privacy`.
- Preserved failure [39489133012](https://github.com/Report-Engainall/Nasr1/actions/runs/39489133012): test script SyntaxError at line 437 caused by misplaced nested `expectFailure`; corrected at `cdaec83e816888d67f4f7e10245074d462cc2cdf`, exact CI [39489456696](https://github.com/Report-Engainall/Nasr1/actions/runs/39489456696) PASS. Earlier financial assertion mismatch in [39487569113](https://github.com/Report-Engainall/Nasr1/actions/runs/39487569113) was corrected to match the server privacy contract that omits hidden invoice financial fields; exact CI [39488147019](https://github.com/Report-Engainall/Nasr1/actions/runs/39488147019) passed.
- Playwright [39489673144](<https://github.com/Report-Engainall/Nasr1/actions/runs/39489673144>) reported workflow success but skipped app build/launch and actual browser tests due the external-infrastructure gate; browser and production proof remain NOT RUN.
- Keep single `next_task_id=NASR1-ORIGINAL-SPEC-CUSTOMER-PRICE-PRIVACY-RECONCILIATION-010`; Storefront UI is still unproven on P1-owned paths. Do not merge PR #18/#26 concurrently; migration timestamp collision and archive discrepancy remain open.


### P2 storefront privacy presentation helper checkpoint — 2026-10-20

- Exact code/test SHA `47ee8b8aa6e7e5c78a1047f695797b9f8d34f2c6`; [Aghbari Commerce checks #39491538001](https://github.com/Report-Engainall/Nasr1/actions/runs/39491538001) = SUCCESS. 71/71 Vitest files passed; new `storefront-price-visibility-presentation.test.ts` contributed 15 tests. PostgreSQL 17, lint, build, preview smoke 4173 and dev smoke 5173 all passed.
- Added `src/lib/storefront-price-visibility.ts` with fail-closed display guards for card price and server-computed cart/order pricing payloads; it does not compute/fallback to prices. Helper is implemented/tested but is not yet integrated into P1-owned `Storefront.tsx`.
- P1 head at checkpoint `3c215994fdf4c082dc996105447e63bd1cf9a326`: PostgreSQL acceptance passed but lint failed at `src/lib/admin-catalog-commands.ts:5:455` (`no-explicit-any`) in [run 39491518290](https://github.com/Report-Engainall/Nasr1/actions/runs/39491518290). Exact finding passed to P1 in [comment 6300705160](https://github.com/Report-Engainall/Nasr1/pull/26#issuecomment-6300705160).
- [P2 Playwright #39491537907](https://github.com/Report-Engainall/Nasr1/actions/runs/39491537907): workflow success, but external gate skipped app build/launch and actual browser tests. Browser/prod proof remain NOT RUN.
- Single active pointer remains `NASR1-ORIGINAL-SPEC-CUSTOMER-PRICE-PRIVACY-RECONCILIATION-010`; the Storefront UI integration and its enabled/disabled browser evidence are still open.


### P2 follow-up — P1 CI recovery, customer UI still pending — 2026-10-20

- P2 docs-head SHA `17650f57f35600fcae38610a1bb214dc6f044029`: [CI 39491995765](https://github.com/Report-Engainall/Nasr1/actions/runs/39491995765) SUCCESS. Parent code/test SHA `47ee8b8aa6e7e5c78a1047f695797b9f8d34f2c6` passed [CI 39491538001](https://github.com/Report-Engainall/Nasr1/actions/runs/39491538001), including 71 unit-test files and 15 new guard tests, PostgreSQL 17, lint, build, preview and dev smoke.
- P1 head advanced to `20822761dfdd5a6bd331ea1f172d8c7dcad2cad6`; [CI 39491944048](https://github.com/Report-Engainall/Nasr1/actions/runs/39491944048) is SUCCESS. The preceding lint failure on `3c215994...` remains in history.
- Storefront UI is still unintegrated: blob `f3fe744f1cef6a7a9f093f4794e01d46f7e65518` has no guard/policy integration. Do not mark privacy work done from green CI alone.
- Keep `next_task_id=NASR1-ORIGINAL-SPEC-CUSTOMER-PRICE-PRIVACY-RECONCILIATION-010`; actual Playwright/browser and production proof remain NOT RUN.


### P2 final price-sentinel hardening checkpoint — 2026-10-20

- Exact code/test SHA `b9cd77e09d650484d33540c9b99d4c943531c750`; [CI 39492486420](https://github.com/Report-Engainall/Nasr1/actions/runs/39492486420) SUCCESS. 71/71 Vitest files passed, including 16 guard tests; PostgreSQL 17 migration/core acceptance, lint, build, preview smoke 4173 and dev smoke 5173 passed.
- The card guard now suppresses a server price of zero unconditionally, including when a stale setting read says true, and has a dedicated regression test. Cart/order preview still requires policy true and server `visible=true` plus complete server-priced lines/total.
- Playwright workflow [39492486345](https://github.com/Report-Engainall/Nasr1/actions/runs/39492486345) reported workflow success but skipped app build/launch and actual browser tests due external-infrastructure gate; browser and production proof remain NOT RUN.
- Latest known P1 head `20822761dfdd5a6bd331ea1f172d8c7dcad2cad6` passed [CI 39491944048](https://github.com/Report-Engainall/Nasr1/actions/runs/39491944048), but Storefront is still not wired to the helper. Single active `next_task_id=NASR1-ORIGINAL-SPEC-CUSTOMER-PRICE-PRIVACY-RECONCILIATION-010` remains open.


## P2 exact-head closeout — customer return receipt and source-linked credit memo — verified at live PR HEAD `5ffab62b35640431d00515ede77373148b46bd7c` on 2026-10-20.

- Exact SHA CI: [Aghbari Commerce checks #39492928362](https://github.com/Report-Engainall/Nasr1/actions/runs/39492928362) SUCCESS. Unit result: 71 test files / 498 tests passed. Isolated PostgreSQL 17 migration and acceptance, ESLint, build, preview smoke (4173) and dev smoke (5173) all completed successfully. DB log emitted `PASS customer returns` and `PASS customer price privacy`.
- Returns coverage includes tenant and role restrictions, delivered-order and approved-return guards, requested/received/remaining quantity bounds, warehouse validation, receipt audit identity, direct table write denial, partial/final receipt, replay and payload-conflict behavior, two-session concurrency, source-invoice-linked credit calculation, idempotent draft memo/journal creation, guarded balanced posting, and statement/aging credit effects.
- Preserve the historical failure: [run #39487393265](https://github.com/Report-Engainall/Nasr1/actions/runs/39487393265), old SHA `2388927343da2078a0fc652877bfb1a7d134fb24`, failed unit transformation because `src/test/finance-document-pdf-source-reconciliation.test.ts:216` reached EOF before closing the outer describe. The test file changed on the current head and the full suite passed on #39492928362. Do not delete or reclassify the older failure; it is superseded by the demonstrated later fix.
- [P2 Playwright #39492928331](https://github.com/Report-Engainall/Nasr1/actions/runs/39492928331) exited successfully because its external-infrastructure gate skipped actual browser execution. Browser/prod evidence is still NOT RUN.
- The return receipt/memo task is `IMPLEMENTED=YES`, `INTEGRATED=YES`, `TESTED_EXACT_SHA=PASS`; no live production database migration, production deploy, or signed-in real-browser test is claimed.
- Active single pointer remains `NASR1-ORIGINAL-SPEC-CUSTOMER-PRICE-PRIVACY-RECONCILIATION-010`; P1 owns the overlapping customer `Storefront.tsx` path in PR #12. P2 will not overwrite it. Next action is a precise ownership handoff for Storefront guard integration, then exact-head UI acceptance.


## P2 checkpoint — customer price privacy UI matrix closed on PR #12 branch — 2026-10-20

- The preceding P2 return/credit-memo batch remains exact-head tested on PR #18: branch `feat/p2-customer-return-intake-20261020`, code head `5ffab62b35640431d00515ede77373148b46bd7c`, [CI 39492928362](https://github.com/Report-Engainall/Nasr1/actions/runs/39492928362) passed 71/71 Vitest files, 498 tests, PostgreSQL 17 migration/acceptance, lint, build, preview smoke 4173 and dev smoke 5173. The later P2 documentation head `a680b5e7b5e9010f4f175e28f271d3706b8c00d3` has its own successful commerce CI [39494087599](https://github.com/Report-Engainall/Nasr1/actions/runs/39494087599). Playwright [39494087931](https://github.com/Report-Engainall/Nasr1/actions/runs/39494087931) remains a gate success only, not browser proof.
- Closed the bounded UI acceptance gap for `NASR1-ORIGINAL-SPEC-CUSTOMER-PRICE-PRIVACY-RECONCILIATION-010` without modifying any P1-owned Storefront/API/auth/generated-route file: new `src/test/storefront-price-visibility-ui.test.tsx` on PR #12 branch `feature/customer-price-visibility-20261020`, exact commit/SHA `3596f358a7172e92082b29cde1352795905c0c29`, exact CI [39495548322](https://github.com/Report-Engainall/Nasr1/actions/runs/39495548322) = SUCCESS.
- Evidence on that exact SHA: 56/56 Vitest files and 412/412 tests; migrations and isolated PostgreSQL 17 acceptance passed, including `PASS customer price privacy`; lint, build, production-preview smoke 4173 and dev smoke 5173 passed. The new 9-test component matrix covers product cards and direct product detail when disabled/enabled; hidden cart monetary fields despite legacy local-storage amounts; visible cart amounts only from a valid server preview; hidden/malformed/errored previews fail closed; checkout/order-review disabled/enabled matrix; and continued non-financial `validate_checkout_cart`.
- Failure preserved: CI [39495218015](https://github.com/Report-Engainall/Nasr1/actions/runs/39495218015) on prior commit `f8736b1a5ca9457feb95795dc917c418b2affab6` failed only two new assertions because the tests searched accessible `aria-label` attributes through `textContent`. Fixed assertions to query the actual accessible total groups. The corrected exact-head CI above passed; the earlier failure remains history.
- Privacy behavior is validated on PR #12's branch, not merged to `main`. PR #12 remains open, and its existing P1-protected migration-test-harness diff plus the P1/P2 migration-version collision remain separate release coordination blockers. No PR merge was performed.
- `BROWSER_PROVEN=NOT RUN / BLOCKED_EXTERNAL`: Playwright workflow skips setup/build/browser steps when dedicated non-production Supabase credentials, two distinct-organization users, phone, and explicit non-production-write confirmation are missing. `PRODUCTION_PROVEN=NOT RUN`; no production migration/deployment or live authenticated-browser claim.
- **Single next task:** `NASR1-ORIGINAL-SPEC-PLAYWRIGHT-CRITICAL-PATHS-006`. The gated cross-tenant E2E spec exists, but credentials are not present; continue with a safe, separately labeled browser proof where possible and preserve the full real-auth order/tenant-isolation scenario as `NOT RUN / BLOCKED_EXTERNAL` until an isolated project and two authorized accounts are available. Do not invent credentials, write to production, or call a gate success a browser pass.

## P2 Playwright critical paths — safe Chromium smoke proven; authenticated tenant flow still blocked — 2026-10-20

- **Exact P2 branch HEAD before this record-only commit:** `8bd6068c9216ed48cd05507cb32e45cc0d394d95`, PR #18 / `feat/p2-customer-return-intake-20261020`.
- **Read-only public browser proof:** [P2 Playwright Critical Paths run 39496160387](https://github.com/Report-Engainall/Nasr1/actions/runs/39496160387) completed `SUCCESS` on exact source SHA `8bd6068c9216ed48cd05507cb32e45cc0d394d95`. Its independent `Playwright public UI smoke (no external backend writes)` job ran Chromium against that SHA's locally built app, aborted all calls to the non-routable `ci-placeholder.supabase.co` host, and passed `e2e/public-storefront-smoke.spec.ts` (1 passed): Storefront header/products heading, login route and email input, catalog route, page titles, and zero uncaught browser page errors. Build and local launch succeeded before Chromium ran.
- **Same-SHA commerce acceptance:** [Aghbari Commerce checks run 39496160409](https://github.com/Report-Engainall/Nasr1/actions/runs/39496160409) completed `SUCCESS` on `8bd6068c9216ed48cd05507cb32e45cc0d394d95`; unit/database/quality/build workflow passed. This is isolated CI/PostgreSQL acceptance, not proof of production.
- **Authenticated browser status remains explicitly separate:** the sibling `Playwright customer order and tenant isolation` job in run 39496160387 concluded `success` only because its external-infrastructure gate skipped setup, build, and the real Playwright test. The full customer A catalog→cart→server-validated order→refresh path and customer B cross-organization denial therefore remain `BROWSER_PROVEN=NOT RUN / BLOCKED_EXTERNAL`. Required repository Actions secrets are listed in `docs/bolt-source-reconciliation/P2_PLAYWRIGHT_E2E_SETUP.md`: dedicated non-production Supabase URL/publishable key, two provisioned accounts in distinct organizations, valid test phone, and explicit non-production-write confirmation. No synthetic accounts, production writes, or fake financial records were created.
- **Failure history retained:** the prior privacy UI test run [39495218015](https://github.com/Report-Engainall/Nasr1/actions/runs/39495218015) on `f8736b1a5ca9457feb95795dc917c418b2affab6` failed two assertions because accessible `aria-label` attributes were read through `textContent`. The assertions were corrected to query the accessible total elements; [exact-head CI 39495548322](https://github.com/Report-Engainall/Nasr1/actions/runs/39495548322) passed on `3596f358a7172e92082b29cde1352795905c0c29` with 56/56 Vitest files, 412/412 tests, PostgreSQL 17 acceptance, lint, build, preview smoke 4173 and dev smoke 5173.
- **Next task remains the one authoritative pointer:** `NASR1-ORIGINAL-SPEC-PLAYWRIGHT-CRITICAL-PATHS-006`. A bounded read-only Chromium proof is now real and green; do not advance this pointer until the authenticated order and cross-tenant browser path runs on a dedicated isolated E2E backend or is conclusively closed as an external blocker. Never count the gated job's green status as browser proof.
- **Release/proof limits:** PR #18 and P1 PR #12 remain open; no concurrent merge, production migration/deploy, or live production browser test was performed. Existing P1/P2 migration timestamp collision and donor archive count discrepancy remain unresolved and are not changed by this smoke.
- **Status axes:** `PUBLIC_UI_BROWSER_SMOKE=PASS (1 Chromium test, exact SHA 8bd6068c9216ed48cd05507cb32e45cc0d394d95)`; `POSTGRESQL_17_AND_COMMERCE_CI=PASS (exact SHA 8bd6068c9216ed48cd05507cb32e45cc0d394d95)`; `AUTHENTICATED_TENANT_E2E=NOT RUN / BLOCKED_EXTERNAL`; `PRODUCTION_PROVEN=NOT RUN`; `next_task_id=NASR1-ORIGINAL-SPEC-PLAYWRIGHT-CRITICAL-PATHS-006`.


## Execution log — 2026-10-21 — returns exact-head verification and Playwright gate repair


## P2 live closeout — return ledger preserved; authenticated browser gate truthfully blocked — 2026-10-21

- Target remains `Report-Engainall/Nasr1`, branch `feat/p2-customer-return-intake-20261020`, PR #18. No merge, production deployment, or production migration was performed.
- Return receipt + source-linked credit memo work remains `IMPLEMENTED=YES`, `INTEGRATED=YES`, `TESTED_EXACT_SHA=PASS` on application/test SHA `5ffab62b35640431d00515ede77373148b46bd7c`, exact [commerce CI #39492928362](https://github.com/Report-Engainall/Nasr1/actions/runs/39492928362): 71/71 Vitest files, 498 tests, PostgreSQL 17 migrations and workflow acceptance, lint, build, preview smoke 4173 and dev smoke 5173. DB output includes `PASS customer returns`. It verifies tenant/role boundaries, approved-order/return state, quantities, warehouse validation, audit attribution, duplicate and payload-conflict retries, concurrent identical receipts (one creation + one replay), invoice-source-derived credit amounts, idempotent draft memo/journal creation, and explicit balanced posting guards. No invented amount/tax/FX, automatic stock posting, or cash refund is inferred.
- P2 workflow hardening commits: `c8c98e303fb95386cb49a4fa25af6cf024a5d102` separates the E2E environment gate into its own job and makes authenticated Playwright skip explicitly when the gate is false; `6da29f819ab8982fd2abee1eeb806440ece26f22` records the exact checked-out PR head in the public smoke summary. Exact-head [commerce CI #39497951468](https://github.com/Report-Engainall/Nasr1/actions/runs/39497951468) completed SUCCESS: 71/71 files, 498/498 tests, PostgreSQL 17 acceptance, lint, build, preview smoke 4173 and dev smoke 5173.
- Exact-head [P2 Playwright run #39497951567](https://github.com/Report-Engainall/Nasr1/actions/runs/39497951567) completed at SHA `6da29f819ab8982fd2abee1eeb806440ece26f22`. Public UI job built the same SHA and ran Chromium with the non-routable placeholder backend blocked: `1 passed`. This proves only the read-only public Storefront/login/catalog smoke, not authenticated commerce or tenant isolation.
- The separate infrastructure gate log confirmed all required E2E settings were blank: `E2E_SUPABASE_URL`, `E2E_SUPABASE_PUBLISHABLE_KEY`, `E2E_EMAIL`, `E2E_PASSWORD`, `E2E_EMAIL_B`, `E2E_PASSWORD_B`, `E2E_PHONE`, and `E2E_ALLOW_TEST_WRITES`. Accordingly, the job `Playwright customer order and tenant isolation` was `SKIPPED`, not passed. `AUTHENTICATED_TENANT_E2E=NOT RUN / BLOCKED_EXTERNAL`; `PRODUCTION_PROVEN=NOT RUN`. Do not fabricate test users/data, use production credentials, or make production writes to get a green browser result.
- Historical failure is retained: [run #39487393265](https://github.com/Report-Engainall/Nasr1/actions/runs/39487393265) on old SHA `2388927343da2078a0fc652877bfb1a7d134fb24` failed unit transformation because `src/test/finance-document-pdf-source-reconciliation.test.ts:216` reached EOF with the outer `describe` missing its closing brace. The test was corrected later and exact-head acceptance passed; the old failed run must not be erased or reclassified as passing.
- The sole authoritative task pointer remains `next_task_id=NASR1-ORIGINAL-SPEC-PLAYWRIGHT-CRITICAL-PATHS-006`, now conclusively `BLOCKED_EXTERNAL` pending a dedicated non-production Supabase project, two pre-provisioned customer accounts in different organizations, a valid test phone, and explicit non-production write confirmation. Resume this path when those authorized inputs exist; no successor task ID has been fabricated from stale historical notes. P1-owned source integration files and records were not edited.


## P2 live execution log — exact-head receipt/credit acceptance and local tenant-isolation browser proof — 2026-10-21

- Read live PR #18 and verified current head `fccba49dbe5117b606e2293cc5477e4298814e5c` before updating records.
- Exact SHA test evidence: [CI #39509314230](https://github.com/Report-Engainall/Nasr1/actions/runs/39509314230) SUCCESS; 71/71 Vitest files passed; isolated PostgreSQL 17 acceptance, lint/build, preview 4173 and dev smoke 5173 passed. Explicit DB output: `PASS customer returns` and `PASS customer price privacy`. Return acceptance errors in the logs are expected negative assertions for key-payload conflicts, out-of-range quantities, wrong tenant, direct DML denial, inactive warehouse, unapproved state, manager-only receipt and finance-only credit operations—not unhandled CI failures.
- Exact SHA browser evidence: [P2 Playwright #39509314315](https://github.com/Report-Engainall/Nasr1/actions/runs/39509314315) SUCCESS; isolated local Supabase, two separately scoped organizations and Chromium test `catalog → cart → order → refresh → cross-organization read denial` passed (1 test). Public UI smoke passed as well. This is not evidence of the return UI in a browser, live external Supabase or production.
- Preserved failure: [#39487393265](https://github.com/Report-Engainall/Nasr1/actions/runs/39487393265), old SHA `2388927343da2078a0fc652877bfb1a7d134fb24`, unit transform/parser failure from missing closing brace in `src/test/finance-document-pdf-source-reconciliation.test.ts` at EOF (reported line 216). Subsequent corrected test file passes current suite; no historical record erased.
- Current next task: `NASR1-ORIGINAL-SPEC-CUSTOMER-PRICE-PRIVACY-RECONCILIATION-010`. P1 path-level handoff requested at [PR #26 comment 6318726744](https://github.com/Report-Engainall/Nasr1/pull/26#issuecomment-6318726744); no conflicting Storefront/API changes were applied by P2.
- State axes: returns `IMPLEMENTED=YES`, `INTEGRATED=YES`, `TESTED_EXACT_SHA=PASS`; authenticated order + cross-tenant browser path `BROWSER_PROVEN=PASS` on isolated local Supabase; return UI browser path `NOT RUN`; `PRODUCTION_PROVEN=NOT RUN`.

## P2 corrective audit log — return queues not mounted in admin shell; handoff required — 2026-10-21

- Exact live paths checked on branch `4fdefd7ca3a4076ea3ce77701479992475d65428`: customer request UI is mounted at `/orders/$id`; admin route files delegate to the locked `AdminApp`; `AghbariApp.tsx` does not use the review, physical receipt or credit memo queue components.
- P2 initially attempted a narrow App shell integration and route test in commits `012232f19c8acc6c4e620057a1e6e1e4a64de109` and `4c7a0011c497ff05bc9c15ab914802c39826d5e3`. A re-read of the authoritative ownership lock showed the App shell is protected; P2 reverted the App change and deleted the dependent test in `4fdefd7ca3a4076ea3ce77701479992475d65428`. Readback confirms the original App blob is restored and the temporary test path no longer exists.
- Handoff request is recorded in [PR #26 comment #6319009054](https://github.com/Report-Engainall/Nasr1/pull/26#issuecomment-6319009054). No P1 response was present at this readback. Do not modify the protected path without an explicit owner confirmation.
- Independent server-return acceptance evidence remains [CI #39509314230](https://github.com/Report-Engainall/Nasr1/actions/runs/39509314230) on `fccba49dbe5117b606e2293cc5477e4298814e5c`, plus current code suite [#39620620077](https://github.com/Report-Engainall/Nasr1/actions/runs/39620620077) SUCCESS on `4fdefd7ca3a4076ea3ce77701479992475d65428`. The latter passes unit/PG17/lint/build/smokes. Browser test [#39509314315](https://github.com/Report-Engainall/Nasr1/actions/runs/39509314315) proves order persistence and tenant denial, not customer return review/receipt/credit UI; production remains untested.
- The new strict price-preview guard rejects incomplete/stale payloads on the P2-only helper path and its acceptance suite passed current code CI. It does not claim Storefront integration. Historical failure #39487393265 and missing outer brace at EOF remain recorded as historical failure; no record was deleted or reclassified.
- Return batch is still active until the review/receipt/credit queues are actually reachable from authorized routes. Defer `NASR1-ORIGINAL-SPEC-CUSTOMER-PRICE-PRIVACY-RECONCILIATION-010` until that closure; do not invent a successor identifier.


## P2 execution log — return operations route integration, exact-SHA acceptance, and task transition — 2026-10-21

## P2 execution log — return operations route integration, exact-SHA acceptance, and task transition — 2026-10-21

1. Re-read live ownership rules and the latest P2 state. Do not touch `src/components/AghbariApp.tsx`, `src/routeTree.gen.ts`, `src/lib/api.ts`, the commerce workflow, or P1 evidence ledgers/reports.
2. Implemented `src/components/CustomerReturnOperationsDrawer.tsx`: role-gated operational entry points, review/receipt tabs on existing order route, and the credit-memo tab on the finance route. Client checks only hide controls; the existing database RPCs remain responsible for tenant authorization and operation guards.
3. Mounted the component in the non-locked `src/routes/admin_.orders.tsx` and `src/routes/admin_.finance.tsx` route wrappers. Added `src/test/customer-return-operations-drawer.test.tsx` with five tests for manager review/receipt switching, accountant-only finance access, ordinary-customer denial, generic-staff denial, and accessible mutation status. Exact commit chain ends at `9293b2008b0f42d2130bb4be5ade6a909cf30eb2`.
4. Read back file blobs after write. The two admin route wrappers both mount the appropriate workflow. The drawer exists at blob `3a0672f0576c3e87f4dfaaf106c7195ff74cc58c`; the component test exists at blob `ac6f98073c8291cd50c8c5a00660163d6884bb4a`; orders route blob `37f3ff0278981ae001c1f137220e6d6f6cf96671`; finance route blob `d32bdc4670b2b8d80620536a98a70c0f9f9cabc9`.
5. Exact-SHA [#39622591718](https://github.com/Report-Engainall/Nasr1/actions/runs/39622591718) completed SUCCESS: 72/72 Vitest files; PostgreSQL 17 migration/core acceptance (including explicit `PASS customer returns`), lint, production build, preview route smoke and dev smoke passed.
6. Exact-SHA [#39622591724](https://github.com/Report-Engainall/Nasr1/actions/runs/39622591724) completed SUCCESS: one Chromium local-Supabase order-persistence/cross-organization-denial test passed and one no-write public UI smoke test passed. The separate authenticated external-secret-dependent job was skipped; this run does not provide a returns-specific browser proof. `RETURN_UI_BROWSER_PROVEN=NOT RUN`, `PRODUCTION_PROVEN=NOT RUN`.
7. Preserved historical failed run [#39487393265](https://github.com/Report-Engainall/Nasr1/actions/runs/39487393265), which failed on its own old SHA due an unclosed outer `describe` in `src/test/finance-document-pdf-source-reconciliation.test.ts:216` (69/70 test files); the repaired suite passed later on the exact current SHA.
8. Coordination note posted to [PR #26 comment #6319370624](https://github.com/Report-Engainall/Nasr1/pull/26#issuecomment-6319370624). No merge or production change. No donor/archive code was copied or executed in this route-only batch.
9. Advance the one authoritative pointer to `NASR1-ORIGINAL-SPEC-CUSTOMER-PRICE-PRIVACY-RECONCILIATION-010`. The next task remains subject to P1's explicit ownership lock on customer-facing Storefront/API files; continue with P2-owned fail-closed helper/acceptance tests and handoff coordination rather than overlapping edits.


## P2 return closeout and successor handoff — 2026-10-21

- Repository/branch: `Report-Engainall/Nasr1` / `feat/p2-customer-return-intake-20261020`; PR #18 remains OPEN and unmerged. Live head at readback: `f05c1d0f94934b60797411401f58a03c1425d830`.
- Exact-head commerce CI [run 39624435644](https://github.com/Report-Engainall/Nasr1/actions/runs/39624435644) = SUCCESS on that SHA. Completed unit tests, isolated PostgreSQL 17 migration/core acceptance, lint, build, preview smoke (4173), and dev smoke (5173). PostgreSQL acceptance includes `PASS customer returns` and `PASS customer price privacy`.
- Exact-head P2 Playwright [run 39624435633](https://github.com/Report-Engainall/Nasr1/actions/runs/39624435633) = SUCCESS on the same SHA. The local-Supabase Chromium order persistence and cross-tenant denial path and read-only public smoke ran successfully. The separate hosted-account E2E job was SKIPPED by its missing-external-credentials gate. This does **not** prove the customer-return review/receipt/credit-memo UI in a browser.
- Return queues are reachable without editing protected `AghbariApp`/route-tree files: `src/routes/admin_.orders.tsx` mounts `CustomerReturnOperationsDrawer workflow="orders"`; `src/routes/admin_.finance.tsx` mounts `workflow="finance"`. Review/physical receipt are role-gated to admin/manager; credit-memo actions to admin/manager/accountant. Server RPC/RLS remains authoritative for tenant and role enforcement.
- Return receipt/credit ledger remains `IMPLEMENTED=YES`, `INTEGRATED=YES`, `TESTED_EXACT_SHA=PASS`. `BROWSER_PROVEN` for the return-specific UI = `NOT RUN`; `PRODUCTION_PROVEN=NOT RUN`. No production migration, production writes, fake financial values, tax/FX inference, or automated cash refund are claimed.
- Historical failure remains in the record: [run 39487393265](https://github.com/Report-Engainall/Nasr1/actions/runs/39487393265) failed on old SHA `2388927343da2078a0fc652877bfb1a7d134fb24` from the missing closing brace at EOF in `src/test/finance-document-pdf-source-reconciliation.test.ts`; later exact-head CI passed. Do not reclassify that old run.
- **Single successor task:** `next_task_id=NASR1-ORIGINAL-SPEC-CUSTOMER-PRICE-PRIVACY-RECONCILIATION-010`. P2 helper `src/lib/storefront-price-visibility.ts` and its tests exist, but live P1 Storefront at head `7b070783d25c4b0b6064a3792213ac45671c0f78` still renders numeric card/detail prices without the explicit visibility guard and zero-sentinel suppression. `src/components/Storefront.tsx` and `src/lib/api.ts` remain P1-owned; no edits made. P2 posted explicit path-level handoff request at [PR #26 comment 6319722649](https://github.com/Report-Engainall/Nasr1/pull/26#issuecomment-6319722649). Continue only in P2-owned code/tests until P1 integrates the UI or explicitly hands off the protected path. Helper tests alone do not close task 010.



## P2 latest exact-head verification and successor handoff — 21 October 2026

- Live application/test SHA: `a79460af6a7c98e9255b94464f4eaea3e5dc1035`; current P2 PR #18 remains open and unmerged.
- Exact-SHA commerce CI [#39626048543](https://github.com/Report-Engainall/Nasr1/actions/runs/39626048543) = **SUCCESS** on `a79460af6a7c98e9255b94464f4eaea3e5dc1035`: Vitest, isolated PostgreSQL 17 migration/core acceptance, lint, build, preview smoke (port 4173), and dev smoke (port 5173) all passed.
- Exact-SHA Playwright [#39626048577](https://github.com/Report-Engainall/Nasr1/actions/runs/39626048577) = **SUCCESS** on the same SHA. Actual Chromium against isolated local Supabase passed the catalog/order persistence/refresh and cross-tenant denial path; the independent public UI read-only smoke also passed. The hosted external-account E2E job was **SKIPPED** because its dedicated external credentials were unavailable. Neither that skip nor these tests proves the specific return review/receipt/credit-memo admin UI in a browser.
- Task 010 P2-owned hardening: `src/lib/storefront-price-visibility.ts` now whitelists only `product_id`, `name`, `quantity`, `unit_price`, and `line_total` from an otherwise visible server-priced preview; unapproved base-price/cost/margin/hidden-price/tenant metadata is not forwarded. `src/test/storefront-price-visibility-presentation.test.ts` includes a regression test for those fields. The exact SHA above passes the test suite and PostgreSQL 17 acceptance.
- The next task remains `NASR1-ORIGINAL-SPEC-CUSTOMER-PRICE-PRIVACY-RECONCILIATION-010`, **not closed**: P1-owned `src/components/Storefront.tsx` at PR #26 head `7b070783d25c4b0b6064a3792213ac45671c0f78` still renders numeric card/detail `display_price` without explicit policy/zero-sentinel gating. P2 posted a path-level integration/handoff request at [PR #26 comment #6319722649](https://github.com/Report-Engainall/Nasr1/pull/26#issuecomment-6319722649); P2 has not overwritten P1-owned Storefront/API files. Helper tests are not full UI integration.
- Historical failure remains preserved: [#39487393265](https://github.com/Report-Engainall/Nasr1/actions/runs/39487393265) failed Unit tests on old SHA `2388927343da2078a0fc652877bfb1a7d134fb24` because the closing brace for the outer `describe` was missing at EOF in `src/test/finance-document-pdf-source-reconciliation.test.ts:216`. The two sibling Playwright runs #39487394099 and #39487386222 showed SUCCESS only at the workflow level with their actual browser steps skipped; neither is browser proof.
- `BROWSER_PROVEN` for the return-specific UI = `NOT RUN`; `PRODUCTION_PROVEN=NOT RUN`. No production deployment/migration/write, invented amount/tax/FX or automatic cash refund is claimed.



## P2 follow-up — customer price privacy integration handoff, 21 October 2026

- Posted cross-PR integration handoff on PR #26: https://github.com/Report-Engainall/Nasr1/pull/26#issuecomment-6320698979. P1-owned Storefront/API paths remain untouched.
- Task `NASR1-ORIGINAL-SPEC-CUSTOMER-PRICE-PRIVACY-RECONCILIATION-010` remains OPEN until the explicit policy guard and zero-sentinel suppression are integrated into actual card/detail rendering and verified by UI tests.
- Updated `CURRENT_EXECUTION_STATE.md`, `PROGRAMMER_2_CURRENT_REPORT.md`, and `WORK_COORDINATION.md` to preserve the same ownership boundary and evidence status. No browser/production proof is claimed.


## P2 Onyx migration path reconciliation — 21 October 2026

- P2 reconciled the cross-PR Onyx migration path without editing P1-owned files. Canonical path is now `supabase/migrations/20261021100000_onyx_inventory_reconciliation_apply_rollback.sql`, matching P1's canonical path.
- The canonical file was read back and its content was confirmed byte-identical to the former P2 file (blob SHA `9e1e7fde3faaa7887809ebbcef214bc044197223`). The former `20261020110000_onyx_inventory_reconciliation_apply_rollback.sql` path was deleted from the P2 branch. Commits: `2802efa6049ac7b933c1b824e9712686ac24f14` (add canonical path), `3dd38b06b54c983c6db9077a412c154606e3d22d` (delete duplicate path).
- Exact application/test SHA for this SQL-path-only reconciliation: `3dd38b06b54c983c6db9077a412c154606e3d22d`. Aghbari Commerce checks [39634813324](https://github.com/Report-Engainall/Nasr1/actions/runs/39634813324) completed **SUCCESS**, including migrations/database acceptance, unit tests, lint, build and preview/dev smoke.
- P2 Playwright [39634813658](https://github.com/Report-Engainall/Nasr1/actions/runs/39634813658): public read-only storefront Chromium smoke completed **SUCCESS**. The local-Supabase order persistence/cross-tenant job was still running at this documentation readback; hosted customer-account E2E remains skipped by its missing-credentials gate. Do not claim the latter as browser proof; no production proof is claimed.
- Coordination: P2 reported the completed migration-path reconciliation and P1 test failure to [PR #26 comment 6321009536](https://github.com/Report-Engainall/Nasr1/pull/26#issuecomment-6321009536). P1 run [39630254521](https://github.com/Report-Engainall/Nasr1/actions/runs/39630254521) on SHA `6fc6b312df13885df956d9ac36f75b7ac0993b80` failed in the P1-owned importer/snapshot contract assertion because PostgreSQL returned `'5.000'` while the test expected numeric `5`; P2 did not modify that test. Verify P1's next exact-head run before treating this integration acceptance as closed.
- Customer price-privacy task `NASR1-ORIGINAL-SPEC-CUSTOMER-PRICE-PRIVACY-RECONCILIATION-010` remains **OPEN**: P1-owned Storefront card/detail render conditions still need explicit policy gating and zero-sentinel suppression. P2 continues to leave `src/components/Storefront.tsx` and `src/lib/api.ts` untouched pending explicit handoff. Return review/receipt/credit UI browser proof and production proof remain separate.


## P2 task 010 rendered price components and exact-head CI/Playwright proof — 21 October 2026

- Exact application/code SHA: `0cbedba89a3c8c75a1779202866cc4bd67a75260`. [Aghbari Commerce checks 39636226996](https://github.com/Report-Engainall/Nasr1/actions/runs/39636226996) = SUCCESS: 74/74 Vitest files and 532/532 tests; PostgreSQL 17 migration/database acceptance, lint, build, preview smoke 4173 and dev smoke 5173 passed.
- Exact-head [P2 Playwright 39636227012](https://github.com/Report-Engainall/Nasr1/actions/runs/39636227012) = SUCCESS: public read-only Chromium smoke and local-Supabase order persistence/refresh/cross-tenant denial passed. Hosted customer-account E2E was skipped by its missing external non-production credential gate; not browser proof for return-admin or customer-price screens.
- P2 added the fail-closed rendered component `src/components/StorefrontPricePresentation.tsx` and tests `src/test/storefront-price-presentation-component.test.tsx`, plus `src/components/CustomerOrderPricingPresentation.tsx` and `src/test/customer-order-pricing-presentation-component.test.tsx`. They use the existing `storefront-price-visibility` resolver, preserve server-sourced amounts, hide the zero sentinel, require explicit visibility permission, whitelist pricing payloads, enforce cart/orders surface matching, and render no markup on hidden/malformed/incomplete inputs.
- These are reusable tested UI primitives, not yet imported at the actual P1-owned product-card/detail/cart/checkout screen points. `NASR1-ORIGINAL-SPEC-CUSTOMER-PRICE-PRIVACY-RECONCILIATION-010` remains OPEN until that integration lands and relevant surface proof is obtained. P2 handoff: [PR #26 comment 6321252168](https://github.com/Report-Engainall/Nasr1/pull/26#issuecomment-6321252168).
- Onyx reconciliation migration path is canonicalized to `20261021100000_onyx_inventory_reconciliation_apply_rollback.sql`; SQL blob `9e1e7fde3faaa7887809ebbcef214bc044197223` was unchanged and the duplicate old path was deleted. P1's later exact-head importer snapshot acceptance [39634278418](https://github.com/Report-Engainall/Nasr1/actions/runs/39634278418) passed on `bf3a6ba4990f62ea9070191e57f5c4445d8aa26f`, superseding the earlier numeric-string assertion failure.
- P1 current Storefront still needs policy gating and zero-sentinel suppression; P2 has not modified P1-owned `Storefront.tsx` or `api.ts`. Return review/receipt/credit-memo UI browser proof and production proof are not claimed.
- One active next_task_id remains `NASR1-ORIGINAL-SPEC-CUSTOMER-PRICE-PRIVACY-RECONCILIATION-010`. After closure, continue through the remaining P2 supplemental A–F acceptance checks and reconcile the 33-path extraction gap (2,044 reported extracted files versus 2,011 source-tree blobs in the nine archive folders), reusing existing decisions and without re-downloading/re-extracting archives or duplicating P1-owned source review.


## P2 supplemental branding consistency — PDF/print/XLSX exact-head proof — 21 October 2026

- Exact application/code SHA: `afcdd69e75b1f1783652ce3fca2d14d7351d93a1`. [Aghbari Commerce checks 39637952396](https://github.com/Report-Engainall/Nasr1/actions/runs/39637952396) = SUCCESS: 74/74 Vitest files, isolated PostgreSQL 17 migrations/database acceptance, lint, build, preview smoke 4173, and dev smoke 5173 all passed.
- Added `src/lib/brand.ts` with canonical display/metadata identity `متجر الأغبري | Aghbari Commerce` and used it for PDF metadata and visible brand text (`src/lib/finance-document-pdf.ts`), accessible print title/brand identity (`src/lib/finance-document-print.ts`), and XLSX source label, creator/title/application metadata (`src/lib/onyx-export.ts`).
- Regressions are covered in `src/test/finance-document-pdf-source-reconciliation.test.ts`, `src/test/finance-document-print.test.ts` and `src/test/onyx-export.test.ts`. The Onyx XLSX 27-column layout, ID text representation, filename contract and source-system identity semantics remain intact. PWA/app-shell/notification branding belongs to other or shared paths and is not claimed closed by this batch.
- Playwright [39637952228](https://github.com/Report-Engainall/Nasr1/actions/runs/39637952228) had its public read-only Storefront smoke pass; local-Supabase order/tenant test was still running at documentation time, and hosted customer-account E2E remained skipped due missing dedicated external credentials.
- Task-center print/filter parity remains implemented/tested (same non-role filters, active role scope, all allowed roles, selected allowed role), with existing exact-head evidence [39452487876](https://github.com/Report-Engainall/Nasr1/actions/runs/39452487876) and current unit suite pass. Task-center browser proof not claimed.
- Single active next task remains `NASR1-ORIGINAL-SPEC-CUSTOMER-PRICE-PRIVACY-RECONCILIATION-010`. Live P1 `Storefront.tsx` still needs explicit card/detail policy gating and cart/orders server-preview integration; P2 reusable components are ready but not imported by P1. Return review/receipt/credit-memo browser proof and production proof remain NOT RUN.
- After task 010, continue full acceptance: branding audit on owner-approved PWA/notification paths, Onyx live-sync evidence distinct from snapshots, AI usage/fallback and data-quality/export safety, and the unresolved 33-path source-tree count difference (2,044 reported versus 2,011 recorded blobs); do not re-download/re-extract archives.


## 2026-10-21 — finance list paging, export safety, and exact-SHA retest

- Added `get_finance_document_print_options(integer, integer)` as a tenant-scoped overload; original one-argument callers stay compatible. The selector exposes deterministic 500-row pages for customers, invoices, and credit memos, and only permits active admin/manager/accountant profiles.
- Connected previous/next paging in `FinanceDocumentPrintActions`, preserving active-org revalidation immediately before print. Database acceptance now creates a second same-tenant invoice fixture to prove the offset returns a real record; it explicitly tests customer denial, negative-offset denial, and absence of foreign-org records.
- Added XLSX formula-injection regression coverage. OOXML text that resembles a formula must remain an inline text cell and must not serialize as an `<f>` formula. Corrected the assertion to expect XML's `&apos;` representation, not a raw apostrophe.
- Fixed the price-grid CSV numeric/text boundary: formula-shaped text is still escaped, but actual numeric values are formatted through a trusted numeric-cell path. A valid negative stock balance is no longer transformed into text by the formula-injection guard; non-finite numeric inputs are rejected.
- CI failure history is preserved: [run 39639510861](https://github.com/Report-Engainall/Nasr1/actions/runs/39639510861) identified page-zero RPC contract incompatibility; [run 39640055791](https://github.com/Report-Engainall/Nasr1/actions/runs/39640055791) identified incorrect apostrophe-escape expectations and brittle PWA `import.meta.url` handling. No failure was marked as passed. Fixes were followed by exact-head success.
- **Exact code result:** [Aghbari Commerce checks dcb770a](<https://github.com/Report-Engainall/Nasr1/actions/runs/39641647895>) — SUCCESS on `dcb770a8e24211ddeb8c438b6bbf4510852f9e0a`: 76/76 unit-test files; PostgreSQL 17.11 migrations/core acceptance including customer-return and price-privacy acceptance; lint; build; preview smoke; development-server smoke. The run covers code at `dcb770a8e24211ddeb8c438b6bbf4510852f9e0a`; a subsequent docs-only commit does not change that tested code SHA.


## P2 return UI browser proof + accounting source-posting acceptance — 2026-10-21

- On code SHA e38eb05350baef906dea51721a9026751506b420, [Aghbari Commerce checks 39650888295](https://github.com/Report-Engainall/Nasr1/actions/runs/39650888295) = SUCCESS and [P2 Playwright 39650888310](https://github.com/Report-Engainall/Nasr1/actions/runs/39650888310) = SUCCESS.
- The Playwright local job confirms steps 18–19 both completed: catalog/order tenant acceptance and the newly added authenticated return workflow in Chromium. The return-specific stages cover actual customer request submission, customer control denial, manager approval, physical receipt with 0.75 of 1.00 returned unit classified restockable, and creation of a source-invoice-linked, unposted credit memo draft. These fixtures are local-only test data; no production write is implied.
- Added scripts/test-cash-expense-journal-posting.mjs and registered it in .github/workflows/p2-playwright-critical-paths.yml. Purpose: actual PostgreSQL 17 acceptance for source idempotency; concurrent creation of one journal draft; explicit immutable accounting_source_postings link; exact balanced debit/credit lines; mapping conflict rejection; repeated post no-op; actual General Ledger RPC visibility; actor audit; customer denial; and concurrency race between journal post and cash-expense void (which must end in a void draft or one posted counter-entry, never an unbalanced duplicate).
- Test code initial revision was adjusted before final validation to consume the ephemeral local manager identity created by the fixture script rather than an external secret. Follow only the newest SHA's CI; runs on prior heads do not prove this adjustment or the new accounting script.
- The multi-front scope and shared-path protocol are recorded in P2_PARALLEL_EXECUTION_PROTOCOL_2026-10-21.md. PR #26/#27/#18 coordination comments are 6323249569, 6323250396, and 6323251176 respectively. Keep historical red runs and proof limits intact.


## Exact-main-sync checkpoint and price-grid atomicity acceptance — 2026-10-21

- `2ecc14e4235039e9378c87e9df44517f74ce82be` is a main-sync merge commit with main `ccbc82ffe36d52beb7e9fe1ab1cb17f4de358f21` as its second parent; comparison reports 35 ahead and 0 behind. The PR now points at that merge SHA. Exact-main-sync runs: [Commerce checks 39653248172](https://github.com/Report-Engainall/Nasr1/actions/runs/39653248172) and [P2 Playwright 39653248451](https://github.com/Report-Engainall/Nasr1/actions/runs/39653248451); they were active at checkpoint, so final result must be read back.
- Before this merge, `a0e77eff3fdfda4cbd0b0605717853882d0bad7f` passed [Commerce checks 39652376366](https://github.com/Report-Engainall/Nasr1/actions/runs/39652376366) and [P2 Playwright 39652376394](https://github.com/Report-Engainall/Nasr1/actions/runs/39652376394). The specific local Postgres 17 acceptance for cash-expense journal source-link/idempotency/post-void race passed, and Chromium steps proved customer return request → admin review → warehouse receipt and saleable-quantity split → unposted source-linked credit memo draft.
- This batch adds the P2-only `scripts/test-price-grid-atomicity.mjs` to the local Supabase workflow. It verifies atomic multirow results, old/new actor audit, all-or-nothing rollback when the later row is invalid, duplicate product ID rejection, concurrent stale writer rejection and customer role denial. It must be accepted on the final SHA before this task is marked tested.


## Final readback correction after main-sync CI — 2026-10-21

- Correction to the provisional checkpoint recorded earlier in this file: runs 39653248172 (Aghbari Commerce checks) and 39653248451 (P2 Playwright Critical Paths) have both completed SUCCESS on exact main-sync SHA `2ecc14e4235039e9378c87e9df44517f74ce82be`. The local PostgreSQL 17 job passed step 14 `Test cash-expense source posting, idempotency and void/post concurrency`, step 19 authenticated order/tenant isolation, and step 20 customer return/review/receipt/credit memo browser flow.
- P1's new pair on PR #26 head `6974e2c6361c67ba6632d3ace3767a87bfc9f8f6` is not green as a pair: commerce checks 39653605115 SUCCESS; Playwright 39653605064 FAILURE at local Supabase startup/migration application before any browser tests. Root cause is SQLSTATE 42601 in P1-owned migration `20261021150000_customer_cart_atomic_checkout.sql`, posted at PR #26 comment `6323610588`; do not report return or cart behavior as tested on that P1 head.
- A new P2 price-grid atomicity acceptance step is ready in `scripts/test-price-grid-atomicity.mjs` and the P2 local Supabase workflow. Its final PASS remains pending until the next branch SHA completes the new exact-head CI pair.

## P2 purchase receipt accounting follow-up — post-merge branch coordination — 2026-10-21

- Live coordination readback: PR #18 merged at `f00e609013e248de4ecb94c41e31296884f899cf` from old P2 head `9d2572b49a3aa93275bae4bb8d7d26fe219e07ce`; PR #26 merged at `6e97fb35be9ebf65c546a3d5e9615063853c8eab`. Follow-up commit `c7c8c1cb0e253801a8acda89b4e880499ae89a1c` was written to the old P2 branch after PR #18 closed and is not on main. Do not count it as merged or tested.
- New controlled follow-up branch: `feat/p2-purchase-receipt-accounting-20261021`, created from verified main SHA `1eb57a661b413c9c7d0321dccca70e5d6a0e42fe`. This isolates the new receipt-accounting feature after the parallel PRs were merged; no merge commit or main history was rewritten.
- Parallel P2 work front `NASR1-ORIGINAL-SPEC-PURCHASE-RECEIPT-ACCOUNTING-012`: adds a source-linked purchase receipt accounting migration, finance-only queue/draft RPC, UI under the selected real purchase order, Vitest contracts, and isolated PostgreSQL 17 acceptance wired to the P2 local-Supabase workflow. It accepts only persisted receipts with reconciling source costs, requires YER plus active inventory-asset/payable-liability accounts, durable one-receipt/one-journal linkage, tenant/role restrictions and audit; it creates a balanced draft only. It does not post, pay, infer tax/FX, or move stock.
- Exact-head acceptance for this new follow-up is pending. The old-branch commit did not pass CI and must not be described as tested. Re-read Commerce checks and the P2 local-Postgres workflow at the exact follow-up branch head, retain the failure cause if any, and repair it before closure. Browser and production proof for this accounting workflow remain NOT RUN.
- P1 price privacy: merged PR #26 connects fail-closed price display to cards and product details; cart/checkout/order-review still need server pricing-preview RPC integration and the `show_price_in_cart` / `show_price_in_orders` visibility matrix. Keep task `NASR1-ORIGINAL-SPEC-CUSTOMER-PRICE-PRIVACY-RECONCILIATION-010` OPEN and do not edit P1-owned Storefront/API without an explicit handoff.
- Keep task 010 as the single primary integration pointer and run front 012 as a parallel bounded task. Neither closes full-application completion. No direct main write, production migration/write, or paid service was used.


## P2 FIN-LEDGER-001 — exact-head acceptance, remediation and merge — 2026-10-23T19:55:00+03:00

- PR #101 was merged through GitHub at merge SHA 15a3c10fa5f5aa29dc59f2cf732950cddaa0efcb: https://github.com/Report-Engainall/Nasr1/pull/101.
- Final tested PR head: df18dd58a0f0f74a420f55d6e14c0e352af8f7b0. Core checks run 39990033594 SUCCESS; P2 Playwright run 39990033892 SUCCESS on that exact PR head. Main Core push run 39990714405 SUCCESS on the exact post-merge SHA 15a3c10fa5f5aa29dc59f2cf732950cddaa0efcb.
- Root-cause repairs: keep the same idempotency key when RPC succeeds but the UI refresh callback fails; reject voiding an already linked reversal draft while preserving cancellation of ordinary unlinked drafts; add regression coverage to the PostgreSQL 17 and component tests.
- A failed Core run 39989568026 on a6fb9b407d16e68a1eb7babb1ec698140740644d identified SQLSTATE 42601 due to an improperly quoted dollar-delimited function body. Corrected in df18dd58a0f0f74a420f55d6e14c0e352af8f7b0; the subsequent exact-head migration acceptance passed.
- P2 local Supabase/Chromium run 39990033892 included local PostgreSQL 17 migrations, order/tenant isolation, returns/credit memo, audited Onyx XLSX export, finance/operations printing, customer-manager authorization, financial privacy/audit, and device-session revocation. Hosted customer credential job 120539173603 was SKIPPED; no production writes or live external integration claimed.
- Boundary: P2 run passed on PR head df18dd58a0f0f74a420f55d6e14c0e352af8f7b0; that head's tree 539b6073bbefacd3d569d667b913748f2466ab67 matches main tree 539b6073bbefacd3d569d667b913748f2466ab67, but no P2 workflow ran on exact merge SHA 15a3c10fa5f5aa29dc59f2cf732950cddaa0efcb. Record exact-main P2 as NOT RUN, not PASS. CodeRabbit's linked reversal draft thread was resolved after the correction and exact-head tests.
- Next: FIN-INVOICE-001-SUMMARY-PAGINATION-NO-DOUBLE-COUNT. Add PostgreSQL 17 proof that fetch_general_ledger LIMIT/OFFSET restricts entry detail only and never truncates/double-counts summary/account aggregates; keep the implementation if the test confirms it.


## P2 finance integration after PR #104 — 2026-10-23T21:17:51+03:00

- PR #103 `FIN-INVOICE-001-SUMMARY-PAGINATION-NO-DOUBLE-COUNT` merged at `2908079abd76e1a84cc4449d65b6b01cdfc63482`. PostgreSQL 17 acceptance shows `p_limit/p_offset` bound entry details only while summary and per-account aggregates remain complete. Exact PR-head Core `39993605159` and P2 `39993605124` SUCCESS.
- PR #104 `FIN-INVOICE-001-CREDIT-ADJUSTED-PAYMENT-BALANCE` merged at `5dbb01f7cf2ac054212abc6f3ec34af1b1fe99df` from final tested head `7f1110d95d26ece5d516b7267904a4f3f397f6ef`. Core `40000512625` and P2 `40000512706` SUCCESS on that exact head; Core `40001179290` SUCCESS on exact merge SHA.
- Root fix: payment and posted return-credit journal posting share one tenant+invoice advisory lock. The server rejects over-collection after posted credits and >2-decimal input, validates memo source/currency, returns authoritative full-ledger paid/credit/outstanding values, and restricts the SECURITY DEFINER finance RPC to authorized finance roles. UI fails closed when authoritative outstanding is missing/malformed.
- PostgreSQL 17 race acceptance uses two authenticated sessions; the competing session is observed waiting on the advisory lock, then rejected after the first 0.01 payment commits. Exactly one payment remains and balances reconcile. Initial test attempt `09d38044beeaf0529413d81254bc340d5b17e7b6` failed because the second test session omitted the Auth session claim; fixture corrected at `7f1110d95d26ece5d516b7267904a4f3f397f6ef`, and exact-head Core/P2 passed.
- Credential-gated customer E2E `120575459434` was SKIPPED, not PASS. Local Chromium return/review/receipt/credit memo and finance privacy paths passed. No production money writes or live Onyx/WhatsApp calls claimed.
- Main then advanced to `d81c9b34f819a53df7610937264c6fcb923c3f95` by adding only `docs/project-bolt-github-7sl6ykzz (5).zip`. Exact-current-main Core `40001438040` was IN_PROGRESS in PostgreSQL 17 migration acceptance at time of update; no PASS transferred to this SHA. P2 on exact current main is NOT RUN.
- Released statement-credit lock: PR #62 merged at `024c279a2d1c0226c662e5d916871f45534c7242`. PR #40 is CLOSED and NOT MERGED; its old "open PR" note is historical only.
- Next task: `FIN-INVOICE-001-PAYMENT-IDEMPOTENCY-REPLAY-GUARD`. The live payment table has no persisted key and the UI sends none. Add identical-payload replay, changed-payload conflict, retry-key persistence, and concurrent replay/tenant isolation tests on PostgreSQL 17. Check all callers, overloads, grants and RLS; no parallel ledger/payment engine.

## P2 FIN-INVOICE-001 payment idempotency implementation — 2026-10-23T21:55:00+03:00

- Current main verified at `cd303b7fe0f263c9f62ed97f10202e9895465273`, tree `51aa49eb36bbf6227c42612e35b1bf03e6b3360a`. Main Core run `40006315985` was IN_PROGRESS on exact SHA at this read; exact-main P2 NOT RUN.
- PR #111 documentation-only reconciliation merged at current main SHA; its central docs now record `FIN-INVOICE-001-PAYMENT-IDEMPOTENCY-REPLAY-GUARD` as the next task. No parallel central-doc owner remains on PR #111.
- Opened fresh branch `p2/payment-idempotency-current-main-20261023b` from current main; ported only the implementation/test paths. Previous feature branch was not opened as a PR after main advanced, so it does not cause an outdated-base merge.
- Payment migration path finalized as `supabase/migrations/20261023235900_customer_payment_idempotency.sql` (valid chronological timestamp after the 23:00 AI session guard migration).
- Implementation adds tenant-scoped payment key/fingerprint, identical replay, altered-payload conflict, request-key and shared invoice-settlement locks, legacy 5-argument overload removal, and restricted execution; the UI preserves the key across ambiguous retries for the exact same payload.
- Test updates include component retry-key assertions and PostgreSQL 17 scenarios for replay/conflict/concurrency/tenant scope/legacy signature/grants, plus updates to existing database acceptance call sites.
- P2 central WorkCoordination, current-state pointer, acceptance matrix, report and log updated sequentially on this feature branch. All new branch test gates are still NOT RUN; no PASS claimed.
- NEXT_ACTION: finish diff review, open PR against main, wait for exact-head Core and P2 local PostgreSQL/Playwright terminal results, fix evidenced failures, merge only after required gates/review, then record the exact post-merge main SHA/results.

## Exact-main baseline CI terminal result — 2026-10-23T21:56:00+03:00

- Core run [40006315985](https://github.com/Report-Engainall/Nasr1/actions/runs/40006315985) completed SUCCESS on exact main merge SHA `cd303b7fe0f263c9f62ed97f10202e9895465273`, tree `51aa49eb36bbf6227c42612e35b1bf03e6b3360a).
- P2 run `40006269156` remains IN_PROGRESS on the distinct PR #111 head `64632871573b0d655051df9ac795c4cc76b68069`; no exact-main P2 run is confirmed. Do not transfer that state to the merge SHA.
- Active payment branch is still untested; the successful current-main Core result is baseline only and does not cover the unmerged payment migration or payment retry code.

## P2 FIN-INVOICE-001 payment idempotency — exact-head acceptance and checkpoint refresh — 2026-10-23T22:20:00+03:00

- PR [#112](https://github.com/Report-Engainall/Nasr1/pull/112) is open on branch `p2/payment-idempotency-current-main-20261023b`, based on `cd303b7fe0f263c9f62ed97f10202e9895465273`.
- Exact tested implementation head `1ecfd0b343419e9745e5e8631ecea738c9f13862`: Core [40009788759](https://github.com/Report-Engainall/Nasr1/actions/runs/40009788759) SUCCESS and P2 [40009788309](https://github.com/Report-Engainall/Nasr1/actions/runs/40009788309) SUCCESS. The same-SHA runs completed PostgreSQL 17 migration/financial acceptance, component/unit/lint/build checks, public UI smoke, and local-Supabase authenticated Chromium acceptance for order persistence/tenant isolation, returns and credit memos, Onyx XLSX export, finance/task printing, customer-manager authorization/privacy/audit, and device-session revocation.
- Root-cause test fixes on earlier heads: import `randomUUID` in `scripts/test-database-migrations.mjs`; use the privileged isolated-fixture role only while inspecting rows in `customer_payments`, then restore `authenticated` before client RPC/concurrency tests. Table grants were not widened. These final code/test paths passed on `1ecfd0b343419e9745e5e8631ecea738c9f13862`.
- Hosted customer order/tenant E2E job `120607612381` was SKIPPED due absent dedicated non-production credentials; it is `BLOCKED_EXTERNAL`, not PASS. Local Supabase browser acceptance is distinct and passed. No production financial/database writes or live external integration are claimed.
- CodeRabbit review was explicitly triggered for `1ecfd0b343419e9745e5e8631ecea738c9f13862`; its trigger was acknowledged, but no completed formal review was returned at the time of this log. Manual diff review performed; verify bot output before merge.
- This single checkpoint commit is documentation-only but changes the PR head. Core/P2 results above attach only to `1ecfd0b343419e9745e5e8631ecea738c9f13862`; rerun both gates to terminal on the post-checkpoint head before merge, then verify exact merge/main SHA and CI. Do not copy the prior PASS status to the new SHA.


## P2 FIN-INVOICE-001 pending payment retry-key preservation — 2026-10-23T23:07:00+03:00

- Main before this follow-up: `391e25847c7cc7fb2ba5f77164600455db04abfd`, created by merging PR #112.
- PR [#112](https://github.com/Report-Engainall/Nasr1/pull/112) merged at `391e25847c7cc7fb2ba5f77164600455db04abfd` from exact PR head `1aa7c7906851e1a5ddb088a173d868a16809f9ef`. Core [40010842943](https://github.com/Report-Engainall/Nasr1/actions/runs/40010842943) and P2 [40010842853](https://github.com/Report-Engainall/Nasr1/actions/runs/40010842853) both completed SUCCESS on that exact PR head. The merge-SHA checks were not confirmed in the live readback, and the previous PR-head pass is not relabelled as main-SHA CI.
- Hosted customer credential-gated E2E was SKIPPED due unavailable dedicated non-production credentials. It remains `BLOCKED_EXTERNAL`, not PASS.
- Review-triggered regression confirmed in the merged client: the scalar `paymentRequestRef` stored only one unresolved fingerprint/key; submitting a different payload replaced a prior ambiguous payment's idempotency key. The component also treated `data: null, error: null` as a success acknowledgement.
- PR [#123](https://github.com/Report-Engainall/Nasr1/pull/123) opened on branch `p2/payment-idempotency-pending-map-20261023`, based on main `391e25847c7cc7fb2ba5f77164600455db04abfd`. Source change replaces the scalar slot with a `Map<fingerprint,key>`, preserving pending request keys independently and deleting only a valid acknowledged request. A successful response must include a non-empty payment ID; errors, thrown transport rejection, and malformed acknowledgements retain the key and surface failure.
- Regression cases added: (1) A fails ambiguously, B succeeds, then A retries with the original key; (2) null acknowledgement retains the key and the retry reuses it. Formatting issues called out in the merged PR review are corrected.
- Implementation/test head before the central checkpoint commits: `cbcbf3db6261b1018c3e83766c575dd854314654`. All central P2 files were updated serially on the branch; the final PR head is expected to have advanced after those commits and must be re-read.
- `TESTS_RUN_WITH_RESULTS`: existing PR #112 Core/P2 results are attached only to `1aa7c7906851e1a5ddb088a173d868a16809f9ef`. New PR #123 final-head workflows are PENDING; no PASS claimed for the new fix until Core and P2 reach terminal SUCCESS on one exact final SHA.
- No production database migration/write, real payment operation, hosted customer E2E, live Onyx sync, or live WhatsApp API call was performed.



## P2 payment retry acknowledgement hardening — 2026-10-23T23:08:00+03:00

- Follow-up to PR [#123](https://github.com/Report-Engainall/Nasr1/pull/123): the payment RPC contract returns a UUID, so a non-empty arbitrary string is not a sufficient success acknowledgement.
- Source/test update at `b9915624033398ad47f7d25f72fc7b7ed9969e4a` validates the trimmed result as a canonical UUID shape. Null and malformed values retain the matching fingerprint's key and show an error; a later exact-payload retry reuses that same key.
- Regression now exercises null acknowledgement, malformed non-UUID response, and a valid UUID response in sequence, with all attempts sharing the original key. The separate A-ambiguous → B-success → A-retry regression tests independent per-payload key retention.
- The latest PR head changes after the code/test update and sequential checkpoint commits. Exact-head Core and P2 workflows must be read to terminal on the final current head; no PASS is claimed for the new code until then.
- No production database migration/write, real payment operation, hosted customer E2E, live Onyx sync, or live WhatsApp API call was performed.


## P2 payment fixture aligned to UUID RPC result — 2026-10-23T23:09:00+03:00

- Latest code/test commit before the central checkpoint refresh: `3e91a41de8022408beebe669efbc7611a3792b72`.
- The existing default payment RPC test mock returned an object even though `record_customer_payment` returns a UUID. Tightened acknowledgement handling correctly rejects that payload; the fixture now returns a valid UUID instead of the old object, so unrelated successful-payment tests exercise the real response contract.
- No additional SQL/migration/service behavior was changed. CI on the final PR #123 head remains pending; neither local PASS nor production proof is claimed.


## P2 closeout — pending customer-payment retry map — 2026-10-23T23:29:00+03:00

- Task FIN-INVOICE-001-PAYMENT-IDEMPOTENCY-PENDING-REQUEST-MAP.
- PR https://github.com/Report-Engainall/Nasr1/pull/123 merged via GitHub at 271de9ac23d6fd092db5a77c15bcf191249fd40d; tested PR head f7f0071a4a5437877e7da13dd1e83471ded3a610.
- Core PR-head run 40017279766 and P2 PR-head run 40017279809 completed SUCCESS on the same exact tested SHA. Core main push run 40017988386 completed SUCCESS on the exact merge/main SHA 271de9ac23d6fd092db5a77c15bcf191249fd40d.
- Change summary: preserve independent idempotency key per unresolved normalized payload; validate payment result as UUID; null, malformed and RPC-error responses fail closed and retain keys. Regression tests prove A ambiguous -> B success -> A retry reuses A key and null/malformed acknowledgements never report success.
- P2 local acceptance passed: isolated PostgreSQL 17 migrations/core workflow tests, local Supabase and Chromium acceptance for order persistence/tenant isolation, return/review/receipt/credit memo, Onyx XLSX export, finance/task print, customer-manager authorization/privacy/audit, and session revocation.
- External hosted authenticated customer order/tenant job was SKIPPED because dedicated non-production backend and cross-tenant users were unavailable. Mark BLOCKED_EXTERNAL; do not claim hosted/production acceptance. No production writes or live payment occurred.
- CodeRabbit was rate-limited; manual P2 review is recorded on PR #123. No unresolved review threads remained before merge. Do not claim a completed independent automated review.
- Resume pointer: COMPANY-001-CURRENT-MAIN-ACCEPTANCE. On the live main SHA at next boot, inspect current company workspace routes, membership/invitation/address services and RLS/RPC; preserve #84/#90/#83/#88 and implement only the first evidenced gap. Take a single code-path lock after identifying real files.



## P2 COMPANY-001 — consolidate address validation into existing PR #127 — 2026-10-23T23:41:00+03:00

- Main 6815b00781412bd98cbdd9fb660e475e4540b543; Core run 40019333142 SUCCESS on exact main SHA.
- Existing PR #127 already owns `src/lib/customer-addresses.ts` and `src/test/customer-addresses.test.ts` to validate fetched address-row shape/UUID/country/timestamps.
- A separate PR #129 was detected with the same exact two paths. To avoid duplicate/conflicting fixes, the UUID save-acknowledgement and edit/delete ID prevalidation work is integrated into #127; PR #129 will close without merge.
- Combined fix: UUID required as save confirmation; optional edit and delete IDs rejected before RPC; malformed-ack/ID regression added. No schema/RLS/UI changes.
- Latest #127 head changes through the atomic code+central commit; final-head Core/P2 remain pending. Do not use old head results.
- Hosted tenant E2E remains BLOCKED_EXTERNAL/SKIPPED without dedicated authorized non-production credentials; no production writes.



## P2 live GitHub reconciliation — 2026-10-24T01:30:00+03:00

- Re-read GitHub `main`: SHA `b48a4b2e8ae09e87432b49dab591a23e1be651c6`, tree `b457c13a78b91f85cf175a11adfda5095d5271db`; Core [40021821444](https://github.com/Report-Engainall/Nasr1/actions/runs/40021821444) completed SUCCESS on that exact SHA.
- Compared the full assigned set of 18 PR heads with current main: all are OPEN / UNMERGED and show `behind_by=0`. Exact tested-head SHA and Core/P2 run IDs are preserved in `PROGRAMMER_2_CURRENT_REPORT.md` and as 18 `GITHUB-PR-###` records in the acceptance matrix.
- 17 exact heads have terminal Core + P2 SUCCESS. #119: Core [40022445712](https://github.com/Report-Engainall/Nasr1/actions/runs/40022445712) SUCCESS; P2 [40022445722](https://github.com/Report-Engainall/Nasr1/actions/runs/40022445722) FAILURE on `a70e2775d1be01f89a315b241c147147fd1183fb`. The dependency is #131; do not weaken its HTTP/tenant-isolation assertion.
- #131: Core [40024841272](https://github.com/Report-Engainall/Nasr1/actions/runs/40024841272) and P2 [40024841182](https://github.com/Report-Engainall/Nasr1/actions/runs/40024841182) SUCCESS on `f88d72e497eed851c425dfaa7b9eeca1291ee411`; formal review list empty; hosted customer/tenant E2E skipped due missing dedicated non-production credentials.
- #118: Core [40026679121](https://github.com/Report-Engainall/Nasr1/actions/runs/40026679121) and P2 [40026678990](https://github.com/Report-Engainall/Nasr1/actions/runs/40026678990) SUCCESS on `1ab496e444c696b1ed491c3cf9eb01ebebf56709`; current diff is exactly the three export files; formal review list empty; hosted E2E skipped is not PASS.
- Independent approvals are missing across the assigned 18. Automated CodeRabbit `COMMENTED` events and owner comments are not approval. Merge sequence is #131 -> refresh/test #119 -> reconcile shared #89/#102/#124 file -> remaining PRs after review. #127 is already merged at `d7a49d8ca7d968e2fc04307fb26313e54168410a`; #129 and #132 are closed without merge and must not be recreated without a proven missing unique change.
- No production database was touched, no direct main write was made, and no skipped hosted check is counted as PASS. The checkpoint PR and its final-head checks remain pending.


## P2 execution record — PR #144 acceptance repair — 2026-10-24T15:01:05Z

- Existing PR #144 head `5635bfc315fbfe03f7213926e1ddf860c4d18b13`: Core [40103240144 FAILURE](https://github.com/Report-Engainall/Nasr1/actions/runs/40103240144); P2 [40103240165 SUCCESS](https://github.com/Report-Engainall/Nasr1/actions/runs/40103240165).
- Error was `customer membership lacks permission to resolve catalog prices` from the price RPC during the accountant-overlap boundary assertion. The fixture had no approved customer identity; expecting a customer tier price was invalid. The fail-closed implementation was retained.
- Updated `scripts/test-customer-price-visibility.mjs` on PR #144 branch; commit `4cd7b86c5ea7d161495c4c7a689c90477aacaf32`. Accountant-without-customer now expects denial, and buyer membership is explicitly checked through both order preview and product-card price RPC for same-tier results.
- Latest Core run [40104995234](https://github.com/Report-Engainall/Nasr1/actions/runs/40104995234) and P2 run [40104995244](https://github.com/Report-Engainall/Nasr1/actions/runs/40104995244) were IN_PROGRESS on the same SHA at this checkpoint. Status is UNVERIFIED, not PASS; no merge claimed.
- Resume by reading the terminal status/logs for both exact-head runs, repair any evidenced regression, then satisfy independent review before merging. PR #145 remains ordered after #144.


## P2 execution record — correct actual storefront-price denial assertion — 2026-10-24T15:04:00Z

- Previous exact head `4cd7b86c5ea7d161495c4c7a689c90477aacaf32`: Core run 40104995234 failed; the log identified the stale expectation in `scripts/test-database-migrations.mjs` around lines 1948–1953. The finance-only accountant did not have an approved customer identity/membership, so the storefront customer-pricing RPC correctly returned SQLSTATE 42501.
- Corrected that actual failing test at commit `2bf9cfedbc6d840a0da3fdffe7ddb106b9929a71`: accountant with no approved customer context must be denied storefront price lookup; existing finance data assertions remain in place. The preceding test commit `4cd7b86c5ea7d161495c4c7a689c90477aacaf32` adds explicit accepted-buyer product-card-price coverage and closes a stale accountant-overlap price expectation in `scripts/test-customer-price-visibility.mjs`.
- Latest Core [40105249828](https://github.com/Report-Engainall/Nasr1/actions/runs/40105249828) and P2 [40105249827](https://github.com/Report-Engainall/Nasr1/actions/runs/40105249827) are `IN_PROGRESS` on exact SHA `2bf9cfedbc6d840a0da3fdffe7ddb106b9929a71` at checkpoint. No PASS or merge claimed.
- Next: inspect both terminal results, correct any proved new failure, then satisfy independent review before merge.


## P2 execution record — pricing gates accepted; quote edge fix opened — 2026-10-24T15:09:10Z

- PR #144 exact head `2bf9cfedbc6d840a0da3fdffe7ddb106b9929a71`: Core run 40105249828 SUCCESS and P2 run 40105249827 SUCCESS. Root cause was a stale finance-only accountant expectation in `scripts/test-database-migrations.mjs`; corrected test now asserts authorization denial with no approved customer context. PR #144 remains open; no independent review submitted, so no merge.
- Shared-file sequencing recorded: PR #134 and #144 both edit `scripts/test-database-migrations.mjs`. After #144 merge, reconcile #134's idempotency/concurrency checks with the accountant boundary assertions and rerun Core/P2 on the final head.
- PR #147 opened on head `c6ec7a03ea43a935694e253a48e1e9258cd79da5`: migration `20261024130000_customer_quote_response_explicit_decision.sql` rejects NULL quote ID/decision, preserves tenant/customer/status guards, and has three source-contract regression tests. Core 40105583244/P2 40105582703 were IN_PROGRESS at checkpoint. SQL runtime test in the shared database script remains a sequenced follow-up after #134/#144 test-file overlap is resolved.
- PR #145 remains dependent on #144 and must precede #147 migration in merge order because it uses migration version `20261024120000...`.


## P2 execution record — PR #147 matcher correction — 2026-10-24T15:12:00Z

- PR #144 SHA `2bf9cfedbc6d840a0da3fdffe7ddb106b9929a71`: Core 40105249828 SUCCESS and P2 40105249827 SUCCESS on exact same SHA; open/review-pending.
- PR #147 first Core 40105583244 failed only the source-test regex because it hardcoded “is required” while SQL message used “are required”. Corrected matcher to accept either grammar and pushed `ff59c6144cec2e78864a0c35f96140d333f376ca`.
- New exact-head Core 40105725672 and P2 40105725585 were IN_PROGRESS at checkpoint on `ff59c6144cec2e78864a0c35f96140d333f376ca`; #147 remains UNVERIFIED until terminal exact-head results. Do not close out the first failed run as passing.
- Runtime PostgreSQL NULL decision test deferred until PR #134/#144 overlap in `scripts/test-database-migrations.mjs` can be reconciled. Preserve migration ordering #144 → #145 → #147 and require independent review.

## 2026-10-28 — DLV-005 account-switch price-preview isolation

- Code change: commit aa977adba2106f163acaa96023170500b6d9811a binds the preview signature to the current profileId (or anonymous state), so a ready payload for another account cannot match after identity changes. Link: https://github.com/Report-Engainall/Nasr1/commit/aa977adba2106f163acaa96023170500b6d9811a
- Regression acceptance: commit b7a958415ac95d2b9a7d7a6785ecaaf1a607abb3 adds a layout snapshot that checks the first committed DOM before passive effects and asserts the previous account's item and total are already absent. Link: https://github.com/Report-Engainall/Nasr1/commit/b7a958415ac95d2b9a7d7a6785ecaaf1a607abb3
- Exact-SHA evidence: Aghbari Commerce checks 40717388214 SUCCESS on b7a958415ac95d2b9a7d7a6785ecaaf1a607abb3; unit tests, core PostgreSQL 17 acceptance, RPC inventory generation/upload, concurrency/import/finance acceptance, lint, build, production-preview and dev smoke, and Chromium price-visibility acceptance completed successfully. Main-only cleanup 40717388196 SUCCESS completed on the same SHA.
- Branch proof: live GitHub branches API returned exactly main at the time of verification. Re-check after the next main commit.
- Scope limit: this is local regression and CI proof for the account-switch render boundary, not hosted authenticated customer/tenant E2E or production proof. DLV-005 remains OPEN/PARTIAL; full production release remains NO-GO.
- NEXT_ACTION: continue direct API/RPC, role/tier/session, DOM/cache/PWA, PDF, XLSX, and print privacy acceptance, then return to remaining route/catalog/transaction-edge requirements in central matrix priority order.


## 2026-10-28 — DLV-005 role/session and hidden-output privacy regression batch

- `9858cbfc1044e2651e08e9e1fa7dae132cbaee0e`: preview identity key now includes authenticated user ID, profile ID, normalized role set, and staff capability; `AuthProvider` refreshes effective profile after `TOKEN_REFRESHED`. Added first-committed-DOM role-switch regression and auth-role-refresh test. Exact-head Aghbari Commerce checks 40721689973 SUCCESS and one-main cleanup 40721689780 SUCCESS. See https://github.com/Report-Engainall/Nasr1/commit/9858cbfc1044e2651e08e9e1fa7dae132cbaee0e
- `0765a7a4532026e91a0c6f7c71148d05ccd0e899`: added PDF acceptance that hidden monetary/tier sentinels must not affect the generated invoice PDF, and Service Worker assertions that invoice PDF, customer pricing RPC, and async export endpoints are neither intercepted nor cached. Exact-head Aghbari Commerce run 40722351742 was IN_PROGRESS when recorded; one-main cleanup 40722352018 SUCCESS. See https://github.com/Report-Engainall/Nasr1/commit/0765a7a4532026e91a0c6f7c71148d05ccd0e899
- Live branch API at `0765a7a` returned exactly one branch, `main`; GitHub reported `protected=false`. Do not claim main protection is configured.
- Acceptance effect: DLV-005 remains OPEN/PARTIAL. Do not transfer the prior SHA's success to the newer test batch or this documentation checkpoint. Full production release stays NO-GO due unresolved hosted customer/tenant E2E and live/production integrations.
- NEXT_ACTION: verify terminal exact-head checks on the newest main SHA. Correct any reproducible failure, then continue the next DLV-005 privacy channel; do not repeat accepted account-switch code or build a second ledger.


## 2026-10-30 — P2 P0 accounting hardening, current-head verification and resume unification

- **Reconciled live head:** `5d3ed3c032d957e8880c600506d9949234145236` on the only branch `main`; branch protection is `false`. Earlier `c4ce5cb...`, `c3bb354...`, and their Actions are historical and not current-head evidence.
- **Code delivery:** `9061d6d` added `AGH-GL-POST-AUTH-ATOMIC-001`: a balanced finance draft cannot be posted by an authenticated customer; the regression compares header/post metadata, lines and audit state. The first run exposed a test-only RLS read performed as the customer role; `b96b7cd` moved baseline/after-state reads to the privileged fixture role. Core, PG17 and cleanup all succeeded on exact SHA b96.
- **Code delivery:** `5d3ed3c032d957e8880c600506d9949234145236` adds `supabase/migrations/20261030010000_general_journal_post_draft_only.sql` and the `AGH-GL-POST-STATE-001` regression. Posted entries remain idempotent replays; void/non-draft entries now reject with SQLSTATE 22023 before writes. A pre/post snapshot asserts unchanged status, actor/timestamps, cancellation metadata, lines and audit history.
- **Exact SHA evidence:** Core [40981597874 SUCCESS](https://github.com/Report-Engainall/Nasr1/actions/runs/40981597874); separate isolated PostgreSQL 17 [40981597786 SUCCESS](https://github.com/Report-Engainall/Nasr1/actions/runs/40981597786); local Supabase/Chromium P2 [40981598078 SUCCESS](https://github.com/Report-Engainall/Nasr1/actions/runs/40981598078); one-main cleanup [40981597789 SUCCESS](https://github.com/Report-Engainall/Nasr1/actions/runs/40981597789). All four are for the same exact code SHA 5d3.
- **Core acceptance:** unit tests, migrations and core PostgreSQL 17 workflows, selected finance/stock/inventory/import/concurrency/analytics/export/backup-restore acceptance, lint, build, port-4173 production preview smoke, port-5173 dev smoke and Chromium price-visibility acceptance all completed successfully. Inventory summary: 330 runtime public functions, 330 matched, 0 unmatched, 174 migration files; artifact 12945281688.
- **P2 local browser acceptance:** order persistence/tenant denial; return→manager review→warehouse receipt→posted/reversed credit memo; audited 27-column Onyx XLSX actual download/inspection; invoice/statement/reversed credit memo/operational task printing; customer-manager authorization/privacy/audit; same-tenant device-session revocation and sibling-token rejection all passed against isolated local Supabase. Public UI smoke passed.
- **Proof boundary:** the hosted customer/order/tenant E2E job was `SKIPPED`, not PASS. No live Onyx target-version round trip, official WhatsApp delivery, live AI provider, production deploy/restore, or owner release approval is claimed. Tests used isolated PostgreSQL/Supabase; no production DB was touched.
- **Acceptance deltas:** DLV-004 remains PARTIAL (network ambiguity/hosted flow open); DLV-007 PARTIAL (remaining ATP/adjustment/expiry lifecycle); DLV-008 PARTIAL (full invoice/payment allocation and settlement); DLV-011 PARTIAL (all role×template output allowlists); DLV-015 PARTIAL (full callable semantic matrix). DLV-006/009/014 retain local test evidence but external/production parts remain open.
- **Resume authority:** `CURRENT_EXECUTION_STATE.md` is the sole live cursor; the matrix is the sole acceptance status ledger; this file and `NASR1_CONTINUOUS_EXECUTION_REPORT.md` are chronological history. The current single next task is DLV-011 role×template PDF/XLSX output allowlist acceptance. No third ledger was created.

## 2026-10-30 — DLV-015 customer-payment authorization denials (exact-SHA accepted)

- **Reconciled head:** `539630b1315394cb507a803a3f8db7829976f240` on the sole branch `main`; this was the code-bearing SHA used by all verification links below. The following checkpoint commit changes only central state/evidence documents.
- **Code change:** `scripts/test-database-migrations.mjs` now tests `record_customer_payment(uuid,numeric,text,uuid,text,text)` for two denied actors: a same-tenant customer is rejected with SQLSTATE `42501`; a manager belonging to another organization is rejected with opaque `P0002` not-found. For each denied call, privileged pre/post snapshots assert unchanged invoice status and total, customer balance, payment-ledger row count and amount sum, and payment-audit count. The fixture restores the original finance actor before subsequent assertions. No migration or production data changed.
- **Exact-SHA evidence:** Core [40988280123 SUCCESS](https://github.com/Report-Engainall/Nasr1/actions/runs/40988280123); Import finalizer PostgreSQL 17 [40988280280 SUCCESS](https://github.com/Report-Engainall/Nasr1/actions/runs/40988280280); local Supabase/Chromium P2 [40988280282 SUCCESS](https://github.com/Report-Engainall/Nasr1/actions/runs/40988280282); one-main cleanup [40988280165 SUCCESS](https://github.com/Report-Engainall/Nasr1/actions/runs/40988280165). All four runs are for exact SHA `539630b1315394cb507a803a3f8db7829976f240`.
- **Core scope:** unit tests, full migration/core PostgreSQL 17 acceptance (including the new payment denial test), exact-head RPC inventory generation/upload, isolated backup/restore, lint, build, preview/dev smoke, and Chromium price visibility all succeeded.
- **P2 local browser scope:** public storefront read-only smoke; local Supabase endpoint guard and price-grid race; cash-expense posting/void concurrency; purchase receipt accounting; authenticated order persistence and tenant denial; return→review→receipt→credit memo; real audited Onyx XLSX download; finance/task printing; customer-manager financial privacy/audit; immediate device-session revocation all succeeded.
- **Current RPC inventory:** artifact [12947808539](https://api.github.com/repos/Report-Engainall/Nasr1/actions/artifacts/12947808539/zip), exact SHA `539630b1315394cb507a803a3f8db7829976f240`; 330 runtime functions, 330/330 source-matched, 0 unmatched, 174 migrations. This structural inventory is not proof of every function's semantics.
- **Proof boundary:** the hosted customer/order/tenant Playwright job remained `SKIPPED`; P2 local Supabase/Chromium success is not hosted or production proof. Release remains NO-GO for full production until external integrations, production evidence and owner approval are satisfied.
- **Acceptance:** DLV-008 and DLV-015 remain PARTIAL. Do not repeat the new payment denial regression absent code/dependency change.
- **NEXT_TASK:** `DLV-015-CUSTOMER-QUOTE-REVOKE-RACE-001` — extend `scripts/test-customer-quote-response-decision.mjs` with a deterministic PostgreSQL 17 membership-revocation/quote-row-lock race. Require `42501` and unchanged quote status/responded_by/audit; fix the DB guard only if the test demonstrates a defect.

## 2026-10-30 — DLV-015 customer quote-response membership-revocation race (exact-SHA accepted)

- **Code head:** `7fb457e832bfcf96072aa596ce437874bfc0447f` on the sole `main` branch.
- **Test:** `scripts/test-customer-quote-response-decision.mjs` creates a real buyer membership and quoted sales quote, locks `sales_quotes FOR UPDATE` in one connection, starts authenticated `customer_respond_to_quote(uuid,boolean)` in a second connection and verifies that backend is waiting on a lock, commits membership revocation in a third connection, then releases the quote lock. The response must fail with `42501`; status, responded_by, updated_at and audit count must equal the pre-race snapshot. Baseline captures the staff pricing actor actually present; it does not assume NULL.
- **Exact evidence:** Core [40989774771 SUCCESS](https://github.com/Report-Engainall/Nasr1/actions/runs/40989774771); logs explicitly print `PASS customer quote membership-revocation race`. P2 local Supabase/Chromium [40989774803 SUCCESS](https://github.com/Report-Engainall/Nasr1/actions/runs/40989774803); one-main cleanup [40989774726 SUCCESS](https://github.com/Report-Engainall/Nasr1/actions/runs/40989774726).
- **P2 scope:** order persistence/tenant denial; return→review→receipt→credit memo; real audited Onyx XLSX download; finance/task PDF prints; customer-manager privacy/audit; immediate device-session revocation all passed. Hosted customer/order/tenant test remains `SKIPPED`.
- **RPC inventory:** artifact [12949205362](https://api.github.com/repos/Report-Engainall/Nasr1/actions/artifacts/12949205362/zip), exact SHA `7fb457e832bfcf96072aa596ce437874bfc0447f`: 330 runtime functions, 330/330 source-matched, 0 unmatched, 174 migrations. Structural map only.
- **Acceptance:** DLV-015 remains PARTIAL. No migration changed because the post-revocation guard rejected the blocked RPC. Production was not used.
- **NEXT_TASK:** `DLV-011-FINANCE-PRINT-RPC-ALLOWLIST-001` — exact server JSON keys for selector, invoice PDF, account statement and credit-memo PDF response trees across admin/manager/accountant; preserve staff/customer/foreign-tenant denials. P2 owns `scripts/test-database-migrations.mjs` only.

## 2026-10-30 — DLV-011 finance print RPC exact response allowlists (exact-SHA accepted)

- **Code head:** `eb83f6cd8824449ef3a1cbf2b5b55c823fdf517d` on the sole `main` branch; Core/P2/import/cleanup all test this exact SHA.
- **Database contract test:** `scripts/test-database-migrations.mjs` asserts exact JSON keys (no extra or missing fields) for finance selector, invoice PDF, account statement and credit-memo PDF; root and nested customer/invoice/payment/credit/journal/return-request/line/currency-summary objects are checked across admin, manager and accountant sessions.
- **Non-vacuous statement credit fixture:** source-linked credit-memo draft is posted via `post_general_journal_entry` inside an explicit test transaction; every finance role must see a real posted credit row, match source credit amount and invoice credit/outstanding/currency summary. `finally` runs `ROLLBACK`, restoring the source journal to draft for subsequent tests. The exact Core log includes `PASS finance document print` and `PASS staff receivables aging`.
- **Exact-SHA evidence:** Core [40991758166 SUCCESS](https://github.com/Report-Engainall/Nasr1/actions/runs/40991758166); P2 local Supabase/Chromium [40991758229 SUCCESS](https://github.com/Report-Engainall/Nasr1/actions/runs/40991758229); Import finalizer PG17 [40991758251 SUCCESS](https://github.com/Report-Engainall/Nasr1/actions/runs/40991758251); one-main cleanup [40991758252 SUCCESS](https://github.com/Report-Engainall/Nasr1/actions/runs/40991758252).
- **P2 output proof:** real local Chromium print flows for invoice, account statement, reversed credit memo and operational tasks succeeded; Onyx XLSX was downloaded and parsed with 27 columns.
- **Concurrent repository change:** `eb83f6c` also adds role-assignment denial/no-side-effect cases (self-role, cross-tenant target, incompatible customer/accountant, unsupported and duplicate roles); before/after snapshots prove unchanged profile, role rows and role-change audit. This adjacent change was made by the repository writer, not authored in this session; Core on the combined exact head succeeded.
- **RPC inventory:** artifact [12948614805](https://api.github.com/repos/Report-Engainall/Nasr1/actions/artifacts/12948614805/zip): 330 runtime functions, 330/330 source-matched, 0 unmatched, 174 migrations; structural mapping is not semantic closure.
- **Proof boundary:** hosted customer/order/tenant Playwright was `SKIPPED`; local Supabase/Chromium is not hosted E2E or production proof. DLV-007/008/011/015 remain PARTIAL.
- **NEXT_TASK:** `DLV-007-REORDER-POINT-STAFF-DENIAL-001` — ordinary same-tenant staff attempts `set_inventory_reorder_point`; require `42501` and unchanged balance, purchasing task and audit snapshots in isolated PostgreSQL 17. P2 owns `scripts/test-database-migrations.mjs`; no migration unless a regression proves a DB defect.


## 2026-10-30 — DLV-007 ordinary-staff reorder-point denial (TESTED_EXACT_SHA)

- **Code SHA:** `7fe83d3c35a2b8c5b28012c0207c3eb8e3468159`; parent `af0c01984fd6aa7e31f4aa11827cb07859a32dc0`; only code path changed: `scripts/test-database-migrations.mjs`.
- **Acceptance:** resolved `operationsStaffProfileId` to the active same-tenant `auth_user_id` through the privileged fixture connection, invoked `set_inventory_reorder_point(...,30,'unauthorized staff policy change')` as ordinary staff, required `42501`, and restored admin identity in `finally`.
- **No-side-effect proof:** privileged JSON snapshots compare byte-for-byte for `inventory_balances` reorder point/on-hand/reserved/available/updated_at, the complete `ai_tasks` row matching `stockKey`, and every `inventory.reorder_point.updated` audit row.
- **Exact-SHA evidence:** Core [40996058928 SUCCESS](https://github.com/Report-Engainall/Nasr1/actions/runs/40996058928); job log contains `PASS DLV-007-REORDER-POINT-STAFF-DENIAL-001`. P2 local Supabase/Chromium [40996059052 SUCCESS](https://github.com/Report-Engainall/Nasr1/actions/runs/40996059052); import-finalizer PostgreSQL 17 [40996058730 SUCCESS](https://github.com/Report-Engainall/Nasr1/actions/runs/40996058730); one-main cleanup [40996059066 SUCCESS](https://github.com/Report-Engainall/Nasr1/actions/runs/40996059066). All four runs checked out the exact SHA above.
- **Proof boundary:** hosted customer/order/tenant Playwright was `SKIPPED` because dedicated non-production credentials/write approval were unavailable. This is `BLOCKED_EXTERNAL`, not PASS. No production or migration write occurred.

## 2026-10-30 — DLV-015 ordinary-staff payment denial snapshots (IMPLEMENTED / CI_PENDING)

- **Base SHA:** `7fe83d3c35a2b8c5b28012c0207c3eb8e3468159`. **Code SHA:** `cbbe9d02750f38e8006f501bd17adc884b70c603`; only code path changed: `scripts/test-database-migrations.mjs`.
- **Acceptance implementation:** ordinary same-tenant staff invokes `record_customer_payment` for a one-unit cash payment; the test now requires SQLSTATE `42501` rather than checking only the error message.
- **No-side-effect implementation:** privileged before/after snapshots serialize the complete invoice row, customer row, every payment row for that invoice, and all audit rows attached to the invoice/customer or linked by invoice ID. The denial is accepted only when every serialized snapshot is byte-for-byte identical.
- **CI status:** Core/P2/PG17/cleanup runs for `cbbe9d02750f38e8006f501bd17adc884b70c603` are triggered or pending; do not mark TESTED_EXACT_SHA until all required final evidence is recorded. No migration changed.
- **NEXT_TASK:** after the exact-SHA denial proof, select the next open detailed DLV-008 invoice/payment allocation or DLV-015 high-impact mutation boundary; preserve the accepted DLV-007 no-repeat case.


## 2026-10-30 — DLV-015 ordinary-staff payment denial (TESTED_EXACT_SHA)

- **Code SHA:** `cbbe9d02750f38e8006f501bd17adc884b70c603`; base `7fe83d3c35a2b8c5b28012c0207c3eb8e3468159`; only code path changed: `scripts/test-database-migrations.mjs`.
- **Acceptance:** ordinary same-tenant staff invoked `record_customer_payment` for a one-unit cash payment; the RPC returned SQLSTATE `42501`.
- **No-side-effect proof:** privileged snapshots serialized complete invoice/customer rows, all payment rows for the invoice and audit rows attached to the invoice/customer or linked by invoice ID; before/after structures were byte-for-byte identical.
- **Exact-SHA evidence:** Core [40996667761 SUCCESS](https://github.com/Report-Engainall/Nasr1/actions/runs/40996667761), P2 local Supabase/Chromium [40996667698 SUCCESS](https://github.com/Report-Engainall/Nasr1/actions/runs/40996667698), import-finalizer PostgreSQL 17 [40996667757 SUCCESS](https://github.com/Report-Engainall/Nasr1/actions/runs/40996667757), cleanup [40996667712 SUCCESS](https://github.com/Report-Engainall/Nasr1/actions/runs/40996667712). All checked out exact code SHA `cbbe9d0`.
- **Proof boundary:** hosted customer/order/tenant Playwright was `SKIPPED`; no hosted/production behavior is claimed.

## 2026-10-30 — DLV-008 overpayment atomic denial (IMPLEMENTED / CI_PENDING)

- **Base SHA:** `439efb73cbd24feafe5ea4f96446ea31276dfe88`. **Code SHA:** `f6a3a9355dc25b37ca14364c0f19af8587121be7`; only code path changed: `scripts/test-database-migrations.mjs`.
- **Acceptance implementation:** a `500000` payment is rejected against the `370000` invoice. A privileged snapshot serializes the full invoice and customer rows, every payment row for that invoice and all audit rows tied to the invoice/customer or linked by invoice ID; rejection is accepted only if the before/after JSON snapshot is byte-for-byte identical.
- **CI status:** Core/P2/PG17/cleanup for `f6a3a9355dc25b37ca14364c0f19af8587121be7` pending; do not claim tested until exact-SHA evidence is final. No migration or production write.
- **NEXT_TASK:** after verification, continue exact-decimal source-linked multi-currency invoice/payment allocation under DLV-008, preserving all accepted no-repeat financial tests.


## 2026-10-30 — DLV-008 source-currency settlement (IMPLEMENTED / CI_PENDING)

- **Base SHA:** `292d488692947ac2118e72b961cf54f64c05b65d`. **P2 code SHA:** `240b5ff90a44a6ceb0b2f7119b1f0ed1b3979075`; only P2-owned code path changed: `scripts/test-database-migrations.mjs`. A later main commit `5e1339b` changed only the P1-owned `src/test/admin-audit-route-acceptance.test.tsx`; comparison confirms no P2-owned path changed after `240b5ff`.
- **DLV-008 overpayment closure:** code SHA `f6a3a9355dc25b37ca14364c0f19af8587121be7` printed `PASS DLV-008-OVERPAYMENT-ATOMIC-DENIAL-001`; Core [40997134235 SUCCESS](https://github.com/Report-Engainall/Nasr1/actions/runs/40997134235), P2 [40997134220 SUCCESS](https://github.com/Report-Engainall/Nasr1/actions/runs/40997134220), PostgreSQL 17 [40997134243 SUCCESS](https://github.com/Report-Engainall/Nasr1/actions/runs/40997134243), cleanup [40997134312 SUCCESS](https://github.com/Report-Engainall/Nasr1/actions/runs/40997134312). All four exact-SHA runs checked out the same commit.
- **New acceptance:** in a rolled-back fixture transaction, USD invoice journal posting is refused without an explicit FX policy; privileged snapshots of invoice/customer/payment/audit rows remain byte-identical. A `40.25` payment is recorded against the USD source invoice; persistence, audit actor/amount/currency and finance statement preserve `USD`; the YER summary bucket is unchanged. Rollback is verified by confirming the invoice returns to YER and no payment/audit rows leak.
- **Proof boundary:** this verifies source-currency inheritance and currency-separated aggregation; it does not implement FX conversion, allocation across payment sources, or full DLV-008 closure.
- **Execution environment:** local clone/test execution unavailable because this runtime could not resolve `github.com` (DNS failure). Exact-SHA CI on P2 code SHA: Core [40999506762 IN_PROGRESS](https://github.com/Report-Engainall/Nasr1/actions/runs/40999506762), P2 [40999506713 IN_PROGRESS](https://github.com/Report-Engainall/Nasr1/actions/runs/40999506713), PostgreSQL 17 [40999506700 IN_PROGRESS](https://github.com/Report-Engainall/Nasr1/actions/runs/40999506700), cleanup [40999506679 SUCCESS](https://github.com/Report-Engainall/Nasr1/actions/runs/40999506679). The newer P1-only code head `5e1339b` has independent Core [40999638939 IN_PROGRESS](https://github.com/Report-Engainall/Nasr1/actions/runs/40999638939), P2 [40999638700 PENDING](https://github.com/Report-Engainall/Nasr1/actions/runs/40999638700), cleanup [40999638654 SUCCESS](https://github.com/Report-Engainall/Nasr1/actions/runs/40999638654); these do not replace the P2 exact-SHA run set. No local PASS is claimed.
- **NEXT_TASK:** after exact-SHA DLV-008 closure, continue `API-OPS-001` by selecting the next uncovered high-risk callable mutation boundary from the existing matrix; preserve the 330/330 source inventory and do not repeat accepted denials.


## 2026-10-30 — DLV-008 source-currency settlement: retry and exact-SHA evidence

- **Current P2 code SHA:** `f6bc9ca0ef9f47292093651b7bfcc298a5b7f518`; base `19e9a8c70655e3052fbbcd10dc85932fca0ae62b`. Only `scripts/test-database-migrations.mjs` changed; no P1 file, migration, service behavior or production data was touched.
- **Attempt 1 / `240b5ff`:** Core [40999506762 FAILURE](https://github.com/Report-Engainall/Nasr1/actions/runs/40999506762) and PG17 [40999506700 FAILURE](https://github.com/Report-Engainall/Nasr1/actions/runs/40999506700) ended in `25P02`: expected no-FX SQL rejection aborted the outer fixture transaction before the side-effect snapshot could be read. P2 [40999506713 SUCCESS](https://github.com/Report-Engainall/Nasr1/actions/runs/40999506713); cleanup [40999506679 SUCCESS](https://github.com/Report-Engainall/Nasr1/actions/runs/40999506679). Corrected with SAVEPOINT/ROLLBACK TO/RELEASE.
- **Attempt 2 / `a0f7a61`:** PG17 [40999965356 FAILURE](https://github.com/Report-Engainall/Nasr1/actions/runs/40999965356) advanced beyond the first error and exposed the 200-row detail cap in `get_staff_customer_account_statement`, while the fixture had 205 invoices. Corrected using existing `fetch_staff_finance_invoice_page` keyset pagination. Core [40999965325 FAILURE](https://github.com/Report-Engainall/Nasr1/actions/runs/40999965325) was separate P1 failure: `src/test/admin-audit-route-acceptance.test.tsx:231` expected English `audit route read unavailable`, actual RTL alert `تعذر تحميل سجل التدقيق.`; 217/218 files and 1426/1427 tests passed. P1-owned files were not changed. P2 [40999965530](https://github.com/Report-Engainall/Nasr1/actions/runs/40999965530) remained in progress at last poll; hosted customer/order/tenant path skipped. Cleanup [40999965388 SUCCESS](https://github.com/Report-Engainall/Nasr1/actions/runs/40999965388).
- **Correction / `f6bc9ca0`:** locate source invoice with existing `issued_at/id` keyset RPC, not capped 200-row statement details. Baseline statement is measured after invoice is switched to USD; invoice aggregate must remain constant, paid increases exactly `40.25`, outstanding decreases exactly `40.25`, and YER aggregate remains identical. Use integer cents.
- **Current exact-SHA runs:** Core [41000407674 IN_PROGRESS](https://github.com/Report-Engainall/Nasr1/actions/runs/41000407674), P2 [41000407635 PENDING](https://github.com/Report-Engainall/Nasr1/actions/runs/41000407635), PostgreSQL 17 [41000407668 IN_PROGRESS](https://github.com/Report-Engainall/Nasr1/actions/runs/41000407668), cleanup [41000407659 IN_PROGRESS](https://github.com/Report-Engainall/Nasr1/actions/runs/41000407659), all on exact SHA `f6bc9ca0ef9f47292093651b7bfcc298a5b7f518`. Do not mark `TESTED_EXACT_SHA` until all four end SUCCESS.
- **Local boundary:** the local runtime could not resolve `github.com` for clone; no local PostgreSQL PASS is claimed. PostgreSQL 17 CI is the active database evidence. No paid service, hosted external credentials or production data were used.
- **NEXT_TASK:** after DLV-008 exact-SHA closure, continue `API-OPS-001` with the next uncovered high-risk callable mutation boundary; preserve the 330/330 structural inventory and avoid accepted denial cases.

## 2026-10-30 — API-OPS-001 import approval, rollback and general-ledger staff denials (TESTED_EXACT_SHA)

- **Exact P2 code SHA:** `5e53622b66de3947758b14026432953560b267bb`; live main subsequently advanced only through P1 checkpoint documentation.
- **Import approval guard:** added `supabase/migrations/20261030010100_import_finalizer_manager_approval_guard.sql`. The previous `public.is_staff()` check admitted ordinary staff. The finalizer now requires an active `admin` or `manager` role. Same-tenant staff/customer receive `42501`; foreign tenant gets opaque `P0002`; admin/manager pass the role gate and reach verified-manifest validation (`22023`) with unchanged snapshots. No production DB was touched.
- **Import rollback:** no migration required. Same-tenant staff receives `42501`; foreign-tenant manager receives `P0002`. Both denials compare complete before/after snapshots: import job, staged rows, request keys, upload sessions/chunks, snapshots, snapshot rows and audit.
- **General-ledger mutations:** ordinary staff cannot post, void or reverse a journal. Each denial requires `42501` and byte-identical before/after snapshots. Admin then posts the same draft after the staff denial; existing reversal idempotency/lock-race tests remain.
- **PostgreSQL 17:** [41003314472 SUCCESS](https://github.com/Report-Engainall/Nasr1/actions/runs/41003314472) on exact SHA `5e53622b66de3947758b14026432953560b267bb`. Both `npm run test:db` baseline acceptance (step 8) and focused import-finalizer authorization (step 9) completed SUCCESS.
- **Core:** [41003314314 SUCCESS](https://github.com/Report-Engainall/Nasr1/actions/runs/41003314314) on the same SHA.
- **One-main cleanup:** [41003314373 SUCCESS](https://github.com/Report-Engainall/Nasr1/actions/runs/41003314373) on the same SHA.
- **P2 browser:** [41003314335 IN_PROGRESS](https://github.com/Report-Engainall/Nasr1/actions/runs/41003314335) at last poll. Infrastructure gate and public UI Chromium smoke SUCCESS; local Supabase/Chromium order-persistence and tenant-isolation job IN_PROGRESS; hosted customer/order/tenant job SKIPPED because dedicated hosted credentials and explicit test-write approval were unavailable. No hosted PASS is claimed.
- **Proof boundary:** no 330-RPC inventory regeneration; no SQL changes for rollback or GL post/void/reversal; no paid services, live Onyx/WhatsApp/AI, or production writes. Broad API-OPS-001 remains PARTIAL: historical 330/330 source mapping is not a complete semantic permission matrix.
- **NEXT_TASK:** `AUTHZ-GL-DRAFT-STAFF-DENIAL-001` — prove same-tenant staff cannot create a manual journal draft; require `42501` and full before/after entry/line/idempotency/reversal/audit equality. Keep existing guard; no migration unless test exposes a defect.

## 2026-10-30 — P3 live remote reconciliation at 6d25c8c1ff3010996c1fcfce52a1fe0f580d65be
- Verified GitHub main only; no open PRs. Current main SHA: 6d25c8c1ff3010996c1fcfce52a1fe0f580d65be; code-bearing tree remains b52271629f054f5d9750e2d4dbf247e22c90f8c7. Commits 47865baa and 31d1bef2 after b522716 changed documentation only.
- Core 41017608436 FAILURE on b522716: PG17 receipt-race observation assertion failed. Subsequent Core 41018275584 SUCCESS on 47865baa and 41018520349 SUCCESS on 31d1bef2; both completed Unit and isolated PostgreSQL 17 acceptance. Same application/script tree; no fix commit. Mark historical failure NOT_REPRODUCED_TWICE, not FIXED. Current Core 41018827283 remains IN_PROGRESS on exact main 6d25c8c1ff3010996c1fcfce52a1fe0f580d65be; cleanup 41018827282 SUCCESS.
- P2 browser 41017608501 FAILURE on b522716: drawer first navigation focus failure at e2e/finance-task-print.spec.ts:69; finance/task print assertions not reached; hosted tenant test SKIPPED. P1 owns production focus repair. No newer P2 browser run/owner patch visible.
- P3 confirmed all 16 REF implementations and their component modules/contracts are present. Matrix updated with exact CI boundary; all 16 remain P1/P2-pending. No DLV rollup closed. Release remains NO-GO.
- exact_next_command: poll Core 41018827283 on 6d25c8c1ff3010996c1fcfce52a1fe0f580d65be; then integrate only new P1/P2 owner commits by expected-main-SHA CAS. P2 next deliverable is tenant-safe full-history aggregate + atomic DecisionOutcome persistence; P1 next deliverable is mobile focus repair + live DTO-backed intelligence mounting.

## P3 cursor refresh — 2026-10-30 — base 3f54e9917779ebb35407882afa1c0f5ba88408d8
- Current remote main read before this doc-only cursor update: 3f54e9917779ebb35407882afa1c0f5ba88408d8. Code-bearing tree remains b52271629f054f5d9750e2d4dbf247e22c90f8c7.
- Core 41018827283 SUCCESS on exact prior cursor 6d25c8c1ff3010996c1fcfce52a1fe0f580d65be; unit, isolated PG17, RPC inventory, backup/restore, lint, build and smoke steps completed.
- Current Core 41019366359 IN_PROGRESS on exact SHA 3f54e9917779ebb35407882afa1c0f5ba88408d8; cleanup 41019366286 SUCCESS on the same SHA. Poll only the existing run.
- Acceptance matrix verified: 143 populated unique IDs, 16 REF rows, no duplicate IDs. All REF rows remain P1/P2-dependent; no DLV roll-up closed. P2 browser focus remains failed on 41017608501; print assertions not reached, hosted tenant path SKIPPED.
- exact_next_command: poll Core 41019366359 on 3f54e9917779ebb35407882afa1c0f5ba88408d8; next P1 patch is mobile drawer focus + DTO-backed intelligence mount; next P2 patch is server aggregates/outcome persistence with no-side-effect denial tests.

## P3 live implementation and exact-head acceptance — 2026-10-30 — current code SHA 9f76ead379fe52711bc8b9ed58a66605317bb68f
- Remote `main` only; no open PRs. Exact main/code SHA at verification: 9f76ead379fe52711bc8b9ed58a66605317bb68f. No P1/P2 owner patch delivered for integration.
- P3 code commits: [5c1c3e63](https://github.com/Report-Engainall/Nasr1/commit/5c1c3e6324c204d14c3c4c888a423c50efb752d0) added unsourced empty-population UNAVAILABLE guard for dead stock; [3451e9be](https://github.com/Report-Engainall/Nasr1/commit/3451e9be73512e5e3ad146f46368348892ee6671) fixed currency/per-unit currency isolation and period mismatch in decision impacts, invalid cashflow due-date status, and dead-stock status rollup; [193c8141](https://github.com/Report-Engainall/Nasr1/commit/193c8141a9d05e871675145c71315df1b92284f5) aligned metric/source as-of, source periods and timestamps in Evidence Passport and withheld cashflow when schedule currency is missing; [9f76ead3](https://github.com/Report-Engainall/Nasr1/commit/9f76ead379fe52711bc8b9ed58a66605317bb68f) corrected the added cashflow test assertion.
- Current exact Core [41020479004 SUCCESS](https://github.com/Report-Engainall/Nasr1/actions/runs/41020479004): Unit tests, all isolated PostgreSQL 17 acceptance and migrations, exact-head RPC/function inventory, backup/restore, Lint, Build, production preview smoke, dev smoke and Chromium price visibility all passed on 9f76ead379fe52711bc8b9ed58a66605317bb68f. Cleanup [41020478974 SUCCESS](https://github.com/Report-Engainall/Nasr1/actions/runs/41020478974) on the same SHA.
- Intermediate Core [41020442872 FAILURE](https://github.com/Report-Engainall/Nasr1/actions/runs/41020442872) on 193c8141: Unit tests had 237 files / 1,528 tests passing, one cashflow regression test failed because its assertion called .every on boolean. Corrected in 9f76ead3; current exact-head Core has full SUCCESS.
- Core [41019708261 FAILURE](https://github.com/Report-Engainall/Nasr1/actions/runs/41019708261) on 5c1c3e63 failed only in P2 PG17 receipt lock-contention observation at scripts/test-database-migrations.mjs:3105; sample was taken before the second connection had invoked RPC. Both RPC calls ultimately returned success. It passed unchanged in [41020194758 SUCCESS](https://github.com/Report-Engainall/Nasr1/actions/runs/41020194758) and current 41020479004 SUCCESS. Do not claim source repair; intermittent test-harness race, no P2 test weakened.
- P2 [41020194728 FAILURE](https://github.com/Report-Engainall/Nasr1/actions/runs/41020194728) on 3451e9be: auth and public smoke passed; finance/task print run failed twice on focus assertion at e2e/finance-task-print.spec.ts:69; print assertions not reached; hosted tenant path SKIPPED.
- Current P2 [41020479040](https://github.com/Report-Engainall/Nasr1/actions/runs/41020479040) on 9f76ead379fe52711bc8b9ed58a66605317bb68f IN_PROGRESS at last poll: auth gate and public smoke SUCCESS; local Supabase authenticated order/cross-tenant flow active; hosted tenant path SKIPPED.
- Matrix integrity: 143 populated IDs, 143 unique, 16 REF, 18 DLV groups; no duplicate IDs. All 16 REF rows remain P1/P2 dependent. No rollup closed; release NO-GO.
- exact_next_command: poll P2 run 41020479040 on 9f76ead379fe52711bc8b9ed58a66605317bb68f; next P1 patch is mobile initial focus + return-focus behavior; next P2 patch is server aggregate and DecisionOutcome persistence with no-side-effect denials. Integrate one bounded owner patch at a time by expected-SHA CAS.

## P2 final browser acceptance correction — 2026-10-30 — code SHA 9f76ead3
- [P2 run 41020479040 FAILURE](https://github.com/Report-Engainall/Nasr1/actions/runs/41020479040) completed on exact code SHA `9f76ead379fe52711bc8b9ed58a66605317bb68f`. Auth infrastructure/public smoke, local Supabase startup/migrations, authenticated order persistence/cross-tenant denial, customer returns/review/receipt/credit memo and audited Onyx XLSX export all SUCCESS. Finance/task print failed on first attempt and retry because first mobile admin navigation button was not focused within 20s at `e2e/finance-task-print.spec.ts:69`; print assertions were not reached. Hosted customer/order/tenant, customer-manager and device-session browser paths SKIPPED.
- [Core 41020479004 SUCCESS](https://github.com/Report-Engainall/Nasr1/actions/runs/41020479004) on same code SHA: unit, PostgreSQL 17 acceptance, exact RPC inventory, backup/restore, lint, build, smoke and price-visibility acceptance SUCCESS.
- P1 owns mobile first-item focus fix; no P1 code commit integrated. P2 aggregate DTO/outcome persistence/AI/privacy/health/RBAC dependencies remain pending. No hosted tenant or production release PASS.
- Docs cursor before correction: 16511cd55776237df47871341e5337d4634c6460; Core [41021159462](https://github.com/Report-Engainall/Nasr1/actions/runs/41021159462) IN_PROGRESS on the doc-only SHA, cleanup [41021159709 SUCCESS](https://github.com/Report-Engainall/Nasr1/actions/runs/41021159709). Poll existing run only.
- Matrix verified 143 unique task IDs / 16 REF / 18 DLV groups / no duplicates. DLV rollups remain open; release NO-GO.

## P3 code batch and P2 exact-head proof — 2026-10-30 — code SHA da7f7af886ab6c6b0ec42c10c0778c215da7fb4e
- P3 code [da7f7af886ab6c6b0ec42c10c0778c215da7fb4e](https://github.com/Report-Engainall/Nasr1/commit/da7f7af886ab6c6b0ec42c10c0778c215da7fb4e) changed only liquidity.ts/liquidity.test.ts and decision-outcome.ts/decision-outcome.test.ts. Liquidity arithmetic overflow now downgrades status to NEEDS_REVIEW/PARTIAL; duplicate currency no longer masks UNVERIFIED; a CURRENCY_PER_UNIT measured outcome requires currency.
- Core [41021594088 SUCCESS](https://github.com/Report-Engainall/Nasr1/actions/runs/41021594088) on exact da7f7af8: Unit, PostgreSQL 17, backup/restore, Lint, Build, preview/dev smoke and price visibility all PASS.
- P2 [41021594114 FAILURE](https://github.com/Report-Engainall/Nasr1/actions/runs/41021594114) on same SHA: auth/public smoke, local Supabase startup/migrations, order persistence/tenant denial, returns/review/receipt/credit memo, audited Onyx XLSX PASS; finance/task printing FAILED twice at initial focus assertion e2e/finance-task-print.spec.ts:69; print assertions not reached. Hosted tenant and optional customer-manager/device-session tests SKIPPED. P1 owns focus fix.
- Matrix remains 143 populated unique IDs / 16 REF / 18 DLV groups / no duplicate IDs. All REF remain P1/P2 dependent. No DLV roll-up closed; release NO-GO.

## 2026-10-30 — P3 measured-outcome hardening — code SHA 7c7d28cb16d125462bf6a6e3a7870a6fcf2a532b
- P3 committed [7c7d28cb](https://github.com/Report-Engainall/Nasr1/commit/7c7d28cb16d125462bf6a6e3a7870a6fcf2a532b) to main by expected-SHA CAS with force=false, base 9ba831d89f894ccda3036b8908be7e86331bbb94. Only types.ts, decision-outcome.ts, decision-outcome.test.ts and the P3→P2 aggregate contract changed.
- MEASURED now requires verified/complete/acceptable metric data, formula ID/version, metric key/unit/currency as applicable, period/asOf/measuredAt and unique evidence references. Tests reject invalid status/completeness/quality/formula/time/period/evidence and accept verified zero.
- Exact Core 41022452845 is IN_PROGRESS on the exact SHA; Unit tests had started. P2 Playwright 41022452961 IN_PROGRESS on same SHA; public smoke/auth gate PASS, local Supabase active, hosted tenant SKIPPED. No PASS transferred from predecessor.
- P2 next: server aggregate and tenant-validated atomic outcome persistence, zero-paid AI/privacy/fallback, health probes and canonical RBAC. P1 next: focus sequencing repair in AghbariApp.tsx and live DTO UI mount. Prior P2 41021594114 confirmed mobile focus failure; finance print not reached.
- REF-DECISION-OUTCOME-001 remains PARTIAL pending exact-head Core, P2 persistence and P1 mounting; no DLV closed; production NO-GO.


## 2026-10-30 — P3 exact-head Core PASS / P2 focus failure — SHA 7c7d28c
- Core 41022452845 SUCCESS on exact 7c7d28cb16d125462bf6a6e3a7870a6fcf2a532b: Unit, PG17, RPC inventory, finance/inventory/import, backup/restore, lint/build/smoke and Chromium price visibility PASS.
- P2 41022452961 FAILURE on same SHA: local order/tenant, returns/credit memo, receipt and Onyx XLSX PASS; finance/task print failed twice at e2e/finance-task-print.spec.ts:69 (20s, expected focused/received inactive); print assertions not reached; hosted/customer-manager/device-session SKIPPED.
- P1 one-shot focus source remains unpatched. P2 tenant aggregate/outcome persistence, AI/privacy/quota, health and canonical RBAC pending.
- CSV separator repaired and validated: 143 data records, 8 columns each, 143 unique IDs, 16 REF, 18 DLV plus rollup. Docs Core 41022861275 on parent 4c0918c was IN_PROGRESS; cleanup 41022861203 SUCCESS. No DLV close; release NO-GO.


## 2026-10-30 — documentation CI correction
- Docs-only SHA 4c0918c Core 41022861275 completed SUCCESS on exact SHA; current docs cursor observed bf5a5023d4e9870c23c2b546069a4aad230510b9 had Core 41023269485 IN_PROGRESS (Unit tests active) and cleanup 41023269477 SUCCESS.
- App code remains SHA 7c7d28cb16d125462bf6a6e3a7870a6fcf2a532b with Core 41022452845 SUCCESS; P2 41022452961 FAILURE on mobile initial focus. No P1/P2 code delivery; no DLV close.

## 2026-10-30 — P3 liquidity evidence granularity and replenishment UOM hardening — code SHA 1500b259
- b8ced781 added per-field liquidity evidence statuses and UI labels. Exact Core 41024068742 failed two LiquiditySummary DOM assertions (237 test files/1,534 passed); liquidity engine tests passed. Corrected nested-text matching in 43d111bd.
- 24c4ece1 enforces source UOM for ATP/reorder/sold/MOQ/order-multiple, exact match to the product UOM, exact sold-period coverage and displays only the validated unit; missing UOM => NEEDS_REVIEW, mismatch => UNVERIFIED.
- 1500b259 adds runtime handling for blank/non-string product UOM. Core 41024527658 IN_PROGRESS on exact SHA; P2 41024527683 pending. Do not transfer previous-head results.
- REF-LIQUIDITY and REF-REPLENISHMENT remain P2 aggregate/P1 mounting dependent. No DLV roll-up closed; release NO-GO.

## 2026-11-01 — CodeInspector quality hardening and archive persistence repair

- Reviewed the 239 CodeInspector records against the current `main` tree. The 18 critical TS0004/TS0009 records are duplicate heuristic detections of fabricated test-only tokens/credentials; no production secret was found in those inspected lines.
- Committed `db88ff6718094f4814d8e4282e08825d066fdb77`: visible cleanup failure reporting in AI/Onyx/catalog DB acceptance scripts; guarded Service Worker async fallback; structured Python logs for archive reconciliation exceptions.
- Exact SHA workflows: source-release snapshot audit 41247667193 SUCCESS; PostgreSQL 17 import-finalizer 41247667243 SUCCESS; one-main-branch cleanup 41247667216 SUCCESS. Core 41247667204 and P2 41247667220 were IN_PROGRESS at last observation; hosted tenant E2E is SKIPPED.
- Bolt archive run 41247667305 completed both ZIP verifications and the 717-member inventory (340 identical / 18 changed / 1 before-only), but persistence failed because `persist-bolt-reconciliation-evidence.py` required legacy headings absent from the live state schema. No archive member was executed and no SQL was applied.
- Corrected the persistence helper to append bounded evidence when legacy markers are absent, preserving the existing checkpoint; extended its self-test for this fallback. Remaining CodeInspector findings are not declared closed: 170 nesting warnings, 3 oversized JS/TS functions, 3 long Python main functions and 2 nested Python flows require controlled refactoring and an exact rescan.
- Release remains NO-GO; hosted customer/tenant proof and external production operations remain unverified.
