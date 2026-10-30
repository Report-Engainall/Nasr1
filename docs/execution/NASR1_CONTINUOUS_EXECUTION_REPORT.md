# NASR1 — execution history and verified delivery details

> This is the detailed chronological execution record, not the live resume cursor. The only current task pointer is [docs/bolt-source-reconciliation/CURRENT_EXECUTION_STATE.md](../bolt-source-reconciliation/CURRENT_EXECUTION_STATE.md). Historical `NEXT ACTION` entries below must not be used to resume.

## VERIFIED CODE CHECKPOINT — 2026-10-30 — exact main code SHA 5d3ed3c

- Repository: `Report-Engainall/Nasr1`; code SHA: `5d3ed3c032d957e8880c600506d9949234145236`; branch: `main` only.
- Implemented journal posting state guard in `supabase/migrations/20261030010000_general_journal_post_draft_only.sql`; acceptance in `scripts/test-database-migrations.mjs`. Customer-post denial/no-side-effect proof was added in `9061d6d`, corrected in `b96b7cd`, and rerun on the current code.
- Exact-head Core [40981597874 SUCCESS](https://github.com/Report-Engainall/Nasr1/actions/runs/40981597874); isolated PostgreSQL 17 [40981597786 SUCCESS](https://github.com/Report-Engainall/Nasr1/actions/runs/40981597786); local Supabase/Chromium P2 [40981598078 SUCCESS](https://github.com/Report-Engainall/Nasr1/actions/runs/40981598078); one-main cleanup [40981597789 SUCCESS](https://github.com/Report-Engainall/Nasr1/actions/runs/40981597789).
- Inventory artifact [12945281688](https://api.github.com/repos/Report-Engainall/Nasr1/actions/artifacts/12945281688/zip): 330 runtime functions, 330 matched, 0 unmatched, 174 migration files. The source map is not a semantic security pass for all functions.
- P2 proves local order/tenant, customer-return/credit-memo, print, Onyx XLSX, customer-manager privacy and device-session flows on exact code SHA. The separate hosted order/tenant job was `SKIPPED`; no hosted or production proof is claimed.
- Current acceptance remains partial for DLV-004, DLV-007, DLV-008, DLV-011 and DLV-015; the matrix contains 123 unique IDs and 18 DLV roll-ups, 0/18 fully release-closed. Global percentage is not computable.
- Production release: **NO-GO** while hosted E2E, live external integrations, production operations and owner approval remain unproven.

---

## HISTORICAL CHECKPOINT — 2026-10-30 — import rollback authorization test passed its focused step; latest-main verification pending

- **Focused proof:** test step 23, “Verify inventory import snapshot contract without implicit stock mutation,” completed SUCCESS in Core run 40974837711 on exact code SHA e68db07266c74c30cae36c9088c3ef993b4c9ac1: https://github.com/Report-Engainall/Nasr1/actions/runs/40974837711. That run's aggregate Core status was still IN_PROGRESS, and P2 run 40974837758 was CANCELLED when main advanced.
- **Latest main:** 2670bf7e69db2efe419cd386478b33e0b0656053 (includes the code SHA plus a separate PWA test commit). Current Core 40975098596 IN_PROGRESS with step 23 pending, P2 40975098653 PENDING, cleanup 40975098593 SUCCESS. Links: https://github.com/Report-Engainall/Nasr1/actions/runs/40975098596, https://github.com/Report-Engainall/Nasr1/actions/runs/40975098653, https://github.com/Report-Engainall/Nasr1/actions/runs/40975098593.
- **Test contract:** ordinary staff receives 42501; foreign-tenant manager receives opaque P0002 from public.rollback_import_snapshot; both denials preserve job status/error_summary/created_at, ready snapshot metadata, stored snapshot-row count and rollback audit count.
- **Development corrections:** the first candidate queried a nonexistent import_jobs.updated_at; the second correction exposed that expectFailure did not return the caught error. Both test-only causes were corrected; focused test step subsequently passed on e68.
- **Inventory:** retained artifact 12940762864, 330/330 runtime functions source-mapped across 173 migrations. No inventory regeneration.
- **Historical next action (superseded):** verify the rollback test on the latest main SHA and terminal Core/P2 checks; fix any concrete failure, then choose the next uncovered destructive RPC.
- **Release decision:** NO-GO until the overall required acceptance groups and external/production gates are evidenced.

---
## HISTORICAL CHECKPOINT — 2026-10-30 — import rollback authorization regression corrected; CI pending

- **Current code SHA:** e68db07266c74c30cae36c9088c3ef993b4c9ac1 — https://github.com/Report-Engainall/Nasr1/commit/e68db07266c74c30cae36c9088c3ef993b4c9ac1
- **Observed failure 1:** Core 40974044403 on 7bef9e1229e1c5ea814a5f1fdcc1448642fe0cce reported nonexistent import_jobs.updated_at; fixed to created_at in 7a28f88c73ec229be1d0455e6b4d3b48ab20110d.
- **Observed failure 2:** Core 40974514133 on 7a28f88c73ec229be1d0455e6b4d3b48ab20110d reached the intended staff denial but failed while reading error.code because the helper did not return the caught error; fixed in e68db07266c74c30cae36c9088c3ef993b4c9ac1.
- **Current candidate CI:** Core 40974837711 IN_PROGRESS (https://github.com/Report-Engainall/Nasr1/actions/runs/40974837711), P2 40974837758 PENDING (https://github.com/Report-Engainall/Nasr1/actions/runs/40974837758), cleanup 40974837686 SUCCESS (https://github.com/Report-Engainall/Nasr1/actions/runs/40974837686). Do not promote to TESTED_EXACT_SHA until terminal success.
- **Test:** ordinary staff must receive 42501; foreign-tenant manager opaque P0002; both denials preserve job status/metadata/created_at, ready snapshot metadata, stored row count and rollback audit count. Isolated PostgreSQL 17 only.
- **Inventory:** artifact 12940762864 retained; 330/330 runtime functions map to source across 173 migration files. No inventory regeneration.
- **Historical next action (superseded):** verify exact-SHA Core/P2 for e68db07266c74c30cae36c9088c3ef993b4c9ac1, fix any real failure, then choose next uncovered high-risk destructive RPC.
- **Release:** full production release remains NO-GO while hosted E2E, live integrations, production deploy/restore and owner sign-off are unproven.

---
## HISTORICAL CHECKPOINT — 2026-10-30 — rollback denial test corrected; exact-SHA CI pending

- **Corrected code SHA:** 7a28f88c73ec229be1d0455e6b4d3b48ab20110d — https://github.com/Report-Engainall/Nasr1/commit/7a28f88c73ec229be1d0455e6b4d3b48ab20110d
- **Failure and root cause:** code SHA 7bef9e1229e1c5ea814a5f1fdcc1448642fe0cce failed Core 40974044403 at the import-inventory snapshot acceptance because test helper snapshotImportRollbackBoundary queried import_jobs.updated_at, a column not present in that table. The test-only query is fixed to use created_at. No production schema or data was changed by this failure or fix.
- **Regression still being verified:** public.rollback_import_snapshot role/tenant denial (ordinary staff 42501; foreign-tenant manager opaque P0002) plus pre/post state comparison for job metadata/creation time, ready snapshot metadata, persisted rows and rollback audit.
- **Corrected candidate checks:** Core 40974514133 IN_PROGRESS, P2 40974514139 PENDING, cleanup 40974514142 SUCCESS on exact code SHA 7a28f88c73ec229be1d0455e6b4d3b48ab20110d. URLs: https://github.com/Report-Engainall/Nasr1/actions/runs/40974514133, https://github.com/Report-Engainall/Nasr1/actions/runs/40974514139, https://github.com/Report-Engainall/Nasr1/actions/runs/40974514142.
- **Inventory:** retained artifact 12940762864 remains the source list; 330/330 functions source-mapped across 173 migration files. No inventory regeneration was performed.
- **Historical next action (superseded):** check corrected exact-SHA Core/P2 terminal states, repair the first concrete failure, then select the next uncovered high-risk destructive RPC.
- **Release decision:** full production release remains NO-GO while hosted customer/order/tenant E2E, live external integrations, production deploy/restore and owner sign-off are unproven.

---
## HISTORICAL CHECKPOINT — 2026-10-30 — purchase-order cancellation verified; cash-expense void authorization pending

- **Base SHA:** 14e9cb703846708419c47ade22aa54ac3c7cdffd.
- **Purchase-order cancellation proof:** Core 40972096292 SUCCESS on d8735de8f2cbb58df2d8e68c5452f972ae0df091, 35/35 steps including PostgreSQL 17: https://github.com/Report-Engainall/Nasr1/actions/runs/40972096292. Ordinary staff receives SQLSTATE 42501; foreign-tenant manager gets opaque 42501; order/cancellation fields, audit, receipts, movements and on-hand quantity remain unchanged.
- **Previous-head checks:** on 863ccb5ab2362e65429c1ee5419e9be67416adbb, Core 40972415594 SUCCESS 35/35, P2 40972415377 SUCCESS (public UI smoke and local Supabase persistence/tenant checks), cleanup 40972415421 SUCCESS. Hosted customer/order/tenant E2E remained SKIPPED.
- **New code commit:** 14e9cb703846708419c47ade22aa54ac3c7cdffd adds AGH-CASH-EXPENSE-VOID-SECURITY-001 in scripts/test-cash-expense-journal-posting.mjs. A same-tenant customer must be rejected with SQLSTATE 42501; a manager in another tenant must receive opaque P0002. Each rejection is followed by comparison of source status, void actor/time/reason/update time, cash_expense.voided audit count and accounting source-posting count to the pre-attempt state. Existing successful post/void concurrency and compensating reversal checks remain.
- **Current candidate CI:** Core 40973093903 IN_PROGRESS; P2 40973094057 IN_PROGRESS; cleanup 40973093914 SUCCESS. Results are not yet final on this SHA.
- **Earlier server proofs:** cancel_stock_count TESTED_EXACT_SHA on c5 via Core 40971449141 SUCCESS; cancel_purchase_order TESTED_EXACT_SHA on d873 via Core 40972096292 SUCCESS. DLV-007 and DLV-008 remain PARTIAL.
- **Print/export:** unnamed customer selector/PDF fallback and targeted authorization/tenant checks passed on c9838d8; full role/template PDF/XLSX/print matrix remains OPEN.
- **RPC inventory:** retain artifact 12940762864: https://github.com/Report-Engainall/Nasr1/actions/artifacts/12940762864. Source mapping is not semantic security proof.
- **Historical next action (superseded):** publish this checkpoint only if main remains at the base; verify Core/P2 on the exact resulting SHA for cash-expense denials. Hosted E2E, live integrations, production operations and owner sign-off are unproven; release remains NO-GO.

---

## HISTORICAL CHECKPOINT — 2026-10-30 — stock-count boundary verified; purchase-order cancellation next

- **Latest verified Core SHA:** `c5e35963dcb8afa1d04eb692a89ef6bc25e25d84`; Core [40971449141 SUCCESS](https://github.com/Report-Engainall/Nasr1/actions/runs/40971449141), 35/35 steps. The run includes the isolated PostgreSQL 17 stock-count start/cancel audit test (step 20 SUCCESS), lint, build, production preview smoke, dev server smoke and browser price acceptance. It proves the tested cancellation-denial scenarios only; it does not close the whole inventory lifecycle.
- **P2 on c5:** [40971449064](https://github.com/Report-Engainall/Nasr1/actions/runs/40971449064) public smoke SUCCESS, authenticated infrastructure gate SUCCESS, hosted customer/order/tenant E2E SKIPPED, local Supabase authenticated test still IN_PROGRESS when last observed (credit memo/return scenario). Cleanup [40971449096](https://github.com/Report-Engainall/Nasr1/actions/runs/40971449096) SUCCESS.
- **Current main at next change base:** `e4d2209bf67952aecf8b6e24d9cb12b0f5a1fb5e`; a separate P1 commit added a real keyboard-only login/focus/password-visibility E2E and visible focus styling. Core [40971739122](https://github.com/Report-Engainall/Nasr1/actions/runs/40971739122) was IN_PROGRESS and cleanup [40971739048](https://github.com/Report-Engainall/Nasr1/actions/runs/40971739048) SUCCESS at checkpoint time. Keep that UI code untouched in P2's DB test change.
- **New server-side test:** `scripts/test-database-migrations.mjs` now tests `cancel_purchase_order` for same-tenant ordinary staff (expect SQLSTATE `42501`) and a valid manager from another tenant (expect opaque SQLSTATE `42501`, “purchase order is not available in this organization”). A rejected cancellation must leave the draft status, cancelled actor/time/reason unchanged; create no cancellation audit, receipt or purchase-order movement; and leave on-hand quantity unchanged. An authorized admin cancellation follows the denials to retain positive-path coverage. This is IMPLEMENTED, not TESTED_EXACT_SHA until its new Core test run finishes.
- **Earlier security proof:** `cancel_stock_count` denial/no-side-effect regression is TESTED_EXACT_SHA on c5 using Core's isolated PostgreSQL 17 step 20. DLV-007 remains PARTIAL.
- **Finance/print reconciliation:** unnamed-customer selector/PDF fallback, admin/manager/accountant permissions, ordinary-staff/customer denial, and foreign-tenant isolation already existed and passed Core on c9838d8 (run [40945751611](https://github.com/Report-Engainall/Nasr1/actions/runs/40945751611)). DLV-011 remains OPEN for the full role/template PDF/XLSX/print output matrix and hosted journey proof.
- **Existing inventory:** RPC source artifact [12929127056](https://api.github.com/repos/Report-Engainall/Nasr1/actions/artifacts/12929127056/zip) maps 330/330 functions across 173 migrations; this does not establish semantic authorization proof.
- **Acceptance now:** DLV-007 PARTIAL; DLV-008 PARTIAL; DLV-011 OPEN; DLV-015 PARTIAL. Hosted E2E, Onyx, WhatsApp, live AI, production operations and owner release approval remain unproven. Release NO-GO.
- **Historical next action (superseded):** run Core on the exact new candidate and verify the purchase-order cancellation denials; get P2 and cleanup terminal results on the exact SHA. Then pick one next untested destructive RPC from the existing inventory.

---

## HISTORICAL CHECKPOINT — 2026-10-30 — stock-count cancellation security boundary (candidate verification pending)

- **Repository/branch:** `Report-Engainall/Nasr1` / `main` only.
- **Base SHA observed before the corrective batch:** `97213c3e0a9348d40ee30906eda75bfe020baec4`; no results transfer to the candidate commit.
- **Checks on the base SHA at capture:** Aghbari Core [40970923425](https://github.com/Report-Engainall/Nasr1/actions/runs/40970923425) was IN_PROGRESS, having reached browser price-visibility smoke; P2 [40970923415](https://github.com/Report-Engainall/Nasr1/actions/runs/40970923415) was IN_PROGRESS in local Supabase acceptance; cleanup [40970923398](https://github.com/Report-Engainall/Nasr1/actions/runs/40970923398) was SUCCESS. A previous base, 73089ef, failed one new offline partial-persistence unit test; commit 97213 updates that test to use `Storage.prototype`, a stale timestamp fixture and an assertion that the freshness-marker write occurs. The 97213 run has not yet been treated as terminal at this checkpoint.
- **New server-security acceptance:** candidate `97d78a52019212455a621b1a8121bb143128bb96` extends `scripts/test-stock-count-start-audit.mjs`. It tests that same-tenant ordinary staff receives SQLSTATE `42501`, and a foreign-tenant manager receives opaque SQLSTATE `22023`, when cancelling another tenant’s open stock count. Both rejected requests must leave session status/cancellation fields, cancellation-audit rows and inventory-movement rows unchanged. The original authorized cancellation remains tested and the whole test transaction rolls back. Status: IMPLEMENTED, exact-SHA verification pending.
- **Reconciliation correction:** the runtime tests for unnamed finance selector/PDF fallback (`عميل غير مسمى`), admin/manager/accountant access, ordinary-staff/customer denial and foreign-tenant isolation already exist in `scripts/test-database-migrations.mjs` and ran on c9838d8’s full Core SUCCESS. The stale DLV-011 next action has been removed; do not repeat those tests without a regression.
- **Last fully verified code SHA:** `c9838d8ced1869b2fdbeee735160197edc81a16b`; Core [40945751611 SUCCESS](https://github.com/Report-Engainall/Nasr1/actions/runs/40945751611), import-finalizer [40945751576 SUCCESS](https://github.com/Report-Engainall/Nasr1/actions/runs/40945751576), cleanup [40945751427 SUCCESS](https://github.com/Report-Engainall/Nasr1/actions/runs/40945751427). RPC inventory [artifact 12929127056](https://api.github.com/repos/Report-Engainall/Nasr1/actions/artifacts/12929127056/zip) contains 330/330 source matches across 173 migrations; it is not a semantic-security pass.
- **Acceptance:** DLV-007 PARTIAL; DLV-008 PARTIAL; DLV-011 OPEN (targeted runtime selector authorization tests already present; full output/template matrix remains open); DLV-015 PARTIAL (cancellation-denial acceptance awaits exact candidate CI). Hosted authenticated E2E, real Onyx/WhatsApp/AI, production operations and owner approval remain unproven. Release stays NO-GO.
- **Historical next action (superseded):** verify current base workflow terminal results; publish the prepared candidate only if main still matches its expected parent; then use exact candidate Actions to prove the new DB regression before changing status to TESTED_EXACT_SHA.

---

## HISTORICAL CHECKPOINT — 2026-10-29 (purchase receipt concurrency diagnostics repaired; exact-head CI green)

**Repository:** `Report-Engainall/Nasr1`  
**Integration branch:** `main` only  
**Code/test SHA:** `c9838d8ced1869b2fdbeee735160197edc81a16b`  
**Code/test commit:** [c9838d8](https://github.com/Report-Engainall/Nasr1/commit/c9838d8ced1869b2fdbeee735160197edc81a16b)  
**Aghbari Commerce checks:** [run 40945751611](https://github.com/Report-Engainall/Nasr1/actions/runs/40945751611) — `SUCCESS`, **35/35 steps**, exact SHA c9838d8.  
**Independent PostgreSQL 17 import-finalizer tenant-scope check:** [run 40945751576](https://github.com/Report-Engainall/Nasr1/actions/runs/40945751576) — `SUCCESS`, 14/14 steps, exact SHA c9838d8.  
**One-main-branch cleanup:** [run 40945751427](https://github.com/Report-Engainall/Nasr1/actions/runs/40945751427) — `SUCCESS`, 6/6 steps, exact SHA c9838d8.  
**Latest test output:** 214/214 unit-test files passed; PostgreSQL 17 migration/core acceptance, inventory-transfer race, stock-count balance-set guard, inventory write boundary, purchase-receipt accounting, backup/restore, lint/build, and smoke/browser steps finished successfully.  
**Exact-SHA RPC inventory:** [artifact 12929127056](https://api.github.com/repos/Report-Engainall/Nasr1/actions/artifacts/12929127056/zip) — 330 functions, 330 source-matched, 0 unmatched across 173 migrations. Matching source definitions is not a substitute for semantic authorization proof.

### New work completed and verified

1. **Fixed a real CI diagnostic defect in the purchase-receipt concurrency test** (`scripts/test-database-migrations.mjs`). Earlier run [40945078735](https://github.com/Report-Engainall/Nasr1/actions/runs/40945078735) failed only after the receipt-race monitor missed both lock waits within three seconds; its error branch passed the aggregate `Promise.all(...)` Promise to `Promise.allSettled`, hiding the actual contention state behind `TypeError: object is not iterable`. Commit c9838d8 retains each of the two RPC promises, expands the bounded observation window to ten seconds, and settles each promise independently during diagnostics/cleanup. The exact-head PostgreSQL workflow now completes `SUCCESS`; the concurrency assertion is still enforced, not skipped.
2. **Added the purchase receipt accounting acceptance to CI** in [commit 94791b2](https://github.com/Report-Engainall/Nasr1/commit/94791b2c0dfd96c3e0d636afac7618100a4ed2a9). The previously existing `scripts/test-purchase-receipt-accounting.mjs` was not run by `test:db` or the workflow. It now runs as a separate PostgreSQL 17 step and passed on SHA c9838d8: source-backed cost only, YER policy, balanced inventory/AP draft, durable source link, idempotent replay, customer denial, direct-write denial and unknown-cost rejection.
3. **Stock transfer and stock-count concurrency evidence is green on c9838d8.** PostgreSQL acceptance reports that exactly one competing single/batch transfer wins, reservations are conserved, failed paths leave no partial rows/movements and exactly one audit event persists. The balance-set guard rejects a newly created post-snapshot balance without movement/completion audit; physical stock count idempotency, audited variance and stale-balance rejection also pass.
4. **Previously fixed finance-document issues remain covered:** statement payloads fail closed when invoice/payment arrays are missing; invoice/credit-memo selector labels and credit-memo output do not fall back to internal customer UUIDs. Their code/test implementation remains in [66ed055](https://github.com/Report-Engainall/Nasr1/commit/66ed055031f8fa9f6d1da0ab2ebe0a996f849221) and [cc02dbf](https://github.com/Report-Engainall/Nasr1/commit/cc02dbf47e518e38f04516857a05274f2d460af6), and passed within the full c9838d8 run.

### Acceptance / release state — do not overstate

- The existing central matrix still has **122 populated task IDs, 18 DLV roll-up groups, and 0/18 fully release-closed groups**. An overall completion percentage is not computable from available evidence.
- `DLV-005`: tested server-side price privacy and membership-revocation race remain green; hosted authenticated tier/session journeys are still open.
- `DLV-007`: stock-count balance-set and single/batch transfer races, inventory write boundaries, and purchase receipt accounting passed. Full stock reservation/movement lifecycle and Onyx target integration are not closed.
- `DLV-008`: focused statement payload and finance-print privacy fixes passed; full ledger/payment/credit reconciliation and role-specific outputs remain partial.
- `DLV-009`: local import/export contract checks pass; a real Onyx Pro target round-trip is still `BLOCKED_EXTERNAL` until the target version, credentials and authorized test tenant are available.
- `DLV-011`: specific PDF payload and UUID-label defects are fixed and tested; complete role-by-template PDF/XLSX/print acceptance and hosted authenticated output journeys remain open.
- `DLV-015`: 330/330 runtime RPC functions match migration source on c9838d8; semantic role/tenant/no-side-effect/idempotency evidence is not complete for every callable function.
- Official WhatsApp delivery receipts, live AI provider operation, hosted production journeys, production deployment/rollback/restore and owner approval are not proven by this code CI. Release stays NO-GO until those real gates are closed or explicitly excluded under the approved pilot policy.

### HISTORICAL NEXT ACTION — superseded by CURRENT_EXECUTION_STATE.md
1. This checkpoint update is documentation-only and will create a new `main` SHA. Verify the Aghbari workflow triggered by that exact checkpoint SHA; do not transfer c9838d8 results to another SHA without checking its own run.
2. Then close a specific remaining `DLV-011` runtime gap: extend PostgreSQL acceptance for `get_finance_document_print_options` to prove the invoice/credit-memo selector uses `عميل غير مسمى` for a customer lacking printable business/contact names, and proves an ordinary customer or foreign-tenant request cannot obtain those staff selector values. Keep `DLV-011` open until every applicable role/template path has evidence.
3. Do not repeat the already-passing purchase receipt accounting, transfer-race, stock-count balance-set, membership-revocation, statement missing-array, or credit-memo UUID-renderer tests unless a future code change affects them.

---

## HISTORICAL CHECKPOINT — 2026-10-29 (exact-head price-race, returns, RPC inventory and finance-print privacy passed)

**Repository:** `Report-Engainall/Nasr1`  
**Integration branch:** `main` only  
**Current documentation HEAD before this checkpoint:** `7445f9ddfd070001927fea8409cfb97d0920b99e`  
**Last full tested code SHA:** `cc02dbf47e518e38f04516857a05274f2d460af6` — [code commit](https://github.com/Report-Engainall/Nasr1/commit/cc02dbf47e518e38f04516857a05274f2d460af6)  
**Exact-head Aghbari checks on code SHA cc02dbf:** [run 40944042923](https://github.com/Report-Engainall/Nasr1/actions/runs/40944042923) `SUCCESS`.  
**PostgreSQL 17 import-finalizer tenant-scope check:** [run 40944042900](https://github.com/Report-Engainall/Nasr1/actions/runs/40944042900) `SUCCESS` on the same code SHA.  
**One-main-branch cleanup:** [run 40944042710](https://github.com/Report-Engainall/Nasr1/actions/runs/40944042710) `SUCCESS` on the same code SHA.  
**Aghbari checks for documentation-only HEAD 7445f9d:** [run 40944598797](https://github.com/Report-Engainall/Nasr1/actions/runs/40944598797) was `COMPLETED / SUCCESS` at checkpoint capture; do not assume a terminal result until it is observed.

### Exact-head evidence captured from run 40944042923

- Unit tests: **214/214 test files passed; 1,395/1,395 tests passed**.
- PostgreSQL 17 migrations/core acceptance completed successfully. The price visibility script recorded:
  - `PASS storefront price/revocation race`: a price request blocked on the customer row lock was denied after the owner committed membership revocation; no price rows were returned.
  - `PASS customer price privacy`: hidden payloads, live-session revocation, tenant-bound membership tier, capability-scoped previews, authorized settings and base-price boundaries passed.
  - `PASS customer returns`: tenant ownership, idempotent replay/conflict, direct-write denial, customer privacy, manager decisions/audit, customer-freeze race denial, finance-member statement scope, invoice PDF/cart-pricing post-revocation denial, warehouse task and no automatic stock movement passed.
- The exact-SHA runtime RPC inventory reported **330 functions, 330 source-matched, 0 unmatched across 173 migration files**. Artifact: [public-rpc-function-inventory-cc02dbf](https://api.github.com/repos/Report-Engainall/Nasr1/actions/artifacts/12927523765/zip). Inventory matching is not semantic authorization proof.
- Lint, build, production-preview and dev-server smoke tests, plus browser price-visibility acceptance, passed on code SHA cc02dbf.
- These are candidate-specific local/CI results, not hosted production UAT. Never transfer these results to a different SHA as if it had its own terminal green run.

### Implementation now evidenced

1. Statement PDF payload validation (commit [66ed055](https://github.com/Report-Engainall/Nasr1/commit/66ed055031f8fa9f6d1da0ab2ebe0a996f849221)) now rejects missing/non-array `invoices` and `payments` rather than generating a misleading blank statement. The exact code SHA run 40943206938 and subsequent code-bearing SHA cc02dbf both passed; legitimate empty arrays remain allowed.
2. Finance invoice/credit-memo selectors and credit-memo PDFs now use `عميل غير مسمى` instead of internal customer UUIDs when printable business/contact names are absent. This is implemented in forward migration `20261029270000_staff_finance_print_customer_uuid_label_guard.sql` and renderer guard/tests in commit [cc02dbf](https://github.com/Report-Engainall/Nasr1/commit/cc02dbf47e518e38f04516857a05274f2d460af6). Historical migrations were left unchanged.
3. Warehouse return receipt print snapshots are now tested through the whole migration/script suite on code SHA cc02dbf. The focused acceptance in `scripts/test-customer-returns.mjs` checks the persisted snapshot allowlist, denies foreign-tenant/ordinary-customer access, excludes internal IDs, and retains print-history paging and bounds.

### Release / acceptance state

- The central matrix currently has 122 populated task IDs, 18 DLV roll-up groups, and 0/18 fully release-closed groups. Overall completion percentage remains not computable from the available evidence.
- `DLV-005`: the two-connection membership-revocation race and hidden-price/live-session boundaries are now `CI_SUCCESS_EXACT_SHA` on cc02dbf. Complete hosted authenticated user/tier/session journeys remain open.
- `DLV-007`: return-receipt snapshot and assigned-warehouse/privacy checks have exact-SHA database/component evidence; stock reservation/movement/transfer lifecycle is still partial.
- `DLV-008`: incomplete statement payload rejection and finance document privacy fixes passed, but the complete ledger/payment/credit reconciliation and role coverage remain partial.
- `DLV-011`: these two concrete document defects are fixed and tested; the complete role-by-template PDF/XLSX/print matrix and hosted authenticated output journeys remain OPEN.
- `DLV-015`: callable RPC inventory is fully source-matched for this candidate; semantic auth/tenant/idempotency review is still PARTIAL.
- Actual Onyx Pro target round-trip, official WhatsApp receipt, live AI-provider operation, hosted authenticated production journeys, deployment/rollback/restore evidence, and owner approval remain external release gates. No live-provider success is claimed.

### HISTORICAL NEXT ACTION — superseded by CURRENT_EXECUTION_STATE.md
1. Resolve current-main Aghbari run [40944598797](https://github.com/Report-Engainall/Nasr1/actions/runs/40944598797) for exact docs HEAD 7445f9ddfd070001927fea8409cfb97d0920b99e; record its terminal outcome without transferring cc02dbf's result.
2. After current-head validation, continue the next *unproven* callable authorization boundary from `DLV-015` or the remaining stock movement/reservation lifecycle in `DLV-007`, not another generic review. Do not repeat the already-passing price race, return receipt snapshot, finance-PDF payload, or UUID-label fixes.

---

## HISTORICAL CHECKPOINT — 2026-10-29 (statement payload fail-closed + finance-print UUID privacy)

**Repository:** `Report-Engainall/Nasr1`  
**Integration branch:** `main` only  
**Code candidate SHA:** `cc02dbf47e518e38f04516857a05274f2d460af6`  
**Code commit:** [cc02dbf](https://github.com/Report-Engainall/Nasr1/commit/cc02dbf47e518e38f04516857a05274f2d460af6)  
**Previous focused PDF fix:** [66ed055](https://github.com/Report-Engainall/Nasr1/commit/66ed055031f8fa9f6d1da0ab2ebe0a996f849221)  
**Exact-head Aghbari checks for code SHA cc02dbf:** [run 40944042923](https://github.com/Report-Engainall/Nasr1/actions/runs/40944042923) was `IN_PROGRESS` at checkpoint capture; no pass is claimed.  
**Independent PostgreSQL 17 import-finalizer test:** [run 40944042900](https://github.com/Report-Engainall/Nasr1/actions/runs/40944042900) `SUCCESS` on exact SHA `cc02dbf47e518e38f04516857a05274f2d460af6`.  
**One-main-branch cleanup:** [run 40944042710](https://github.com/Report-Engainall/Nasr1/actions/runs/40944042710) `SUCCESS` on the same exact SHA.

### Code changes now on main

1. `src/lib/finance-document-pdf.ts` now fails closed when a statement RPC payload omits/non-array `invoices` or `payments`; genuinely empty arrays remain valid. Regression coverage is in `src/lib/finance-document-pdf.test.ts`. Exact-head Aghbari run `40943206938` for code SHA `66ed055031f8fa9f6d1da0ab2ebe0a996f849221` is `SUCCESS`; the subsequent docs-only candidate `88b7b082730dc26bd1464d283d861343cb681f60` also passed [run 40943394868](https://github.com/Report-Engainall/Nasr1/actions/runs/40943394868).
2. New forward migration `supabase/migrations/20261029270000_staff_finance_print_customer_uuid_label_guard.sql` replaces three internal-UUID display fallbacks in finance invoice/memo selectors and credit-memo PDFs with `عميل غير مسمى`, preserving role/tenant checks, row reconciliation, reversal evidence, and authenticated execute grants. Historical migrations are unchanged.
3. `src/lib/finance-document-print.ts` adds a renderer-level guard so stale/legacy credit-memo payloads cannot print a UUID as the customer name. `src/test/finance-document-print.test.ts` and new `src/test/finance-document-print-migration.test.ts` cover the behavior and migration security contract.
4. The exact-head workflow on SHA cc02dbf is running unit tests and has not yet produced a terminal Aghbari result. Do not transfer success from SHA 66ed055 or 88b7b08 to cc02dbf.

### Acceptance state

- Central matrix refreshed from the existing 122 populated task IDs, 18 delivery groups, and 0/18 fully release-closed groups. An overall completion percentage remains not computable from current evidence.
- `DLV-008` remains PARTIAL: statement output now rejects incomplete arrays, but complete ledger/payment/credit reconciliation and role coverage remain open.
- `DLV-011` remains OPEN: two specific UUID/payload defects are addressed; full role-by-template PDF/XLSX/print acceptance and hosted authenticated output journeys remain incomplete.
- `DLV-005` remains PARTIAL and `DLV-015` remains PARTIAL: server-selected tier/hidden-price membership revocation and callable-RPC semantic coverage still need exact-candidate evidence. The current Aghbari workflow must finish before its result is used.
- Return receipt reprint code and assigned-warehouse authorization assertions passed on exact SHA `0ead2b082439944403616793c611a4f8859ca5fd` in [run 40942315137](https://github.com/Report-Engainall/Nasr1/actions/runs/40942315137); the latest overall CI for cc02dbf is still pending, so this checkpoint does not close the entire return/print roll-up.
- Full release remains NO-GO while live Onyx Pro round-trip, official WhatsApp delivery receipts, production AI provider operation, hosted authenticated E2E, deployment/rollback/restore proof and owner approval remain unevidenced.

### HISTORICAL NEXT ACTION — superseded by CURRENT_EXECUTION_STATE.md
1. Resolve [Aghbari run 40944042923](https://github.com/Report-Engainall/Nasr1/actions/runs/40944042923) for exact SHA `cc02dbf47e518e38f04516857a05274f2d460af6`; inspect and repair only a concrete failed step if one appears.
2. When the test result is available, record the actual terminal result against that SHA, then continue the next uncovered direct RPC authorization boundary in `DLV-005`/`DLV-015` or remaining role-template gap in `DLV-011`. Do not rebuild reports, receipt printing, or already-implemented finance PDF engines.

---

## HISTORICAL CHECKPOINT — 2026-10-29 (statement PDF rejects incomplete RPC payloads)

**Repository:** `Report-Engainall/Nasr1`  
**Integration branch:** `main` only  
**Previous main SHA:** `0ead2b082439944403616793c611a4f8859ca5fd`  
**Current code/test candidate SHA:** `66ed055031f8fa9f6d1da0ab2ebe0a996f849221`  
**Implementation commit:** [66ed055](https://github.com/Report-Engainall/Nasr1/commit/66ed055031f8fa9f6d1da0ab2ebe0a996f849221)  
**Exact-head Aghbari Commerce checks:** [run 40943206938](https://github.com/Report-Engainall/Nasr1/actions/runs/40943206938) was `IN_PROGRESS` when this checkpoint was prepared. No terminal result is asserted.  
**One-main-branch cleanup:** [run 40943206818](https://github.com/Report-Engainall/Nasr1/actions/runs/40943206818) `SUCCESS` on the exact candidate SHA.

### Implementation delta

- `src/lib/finance-document-pdf.ts`: `buildCustomerStatementPdf` now rejects a missing/non-array `invoices` or `payments` field instead of silently substituting an empty list and potentially generating a misleading blank account-statement PDF. Explicit empty arrays remain valid for a genuinely empty account. The legacy optional `credits` field remains backward-compatible.
- `src/lib/finance-document-pdf.test.ts`: added regression assertions for both missing required arrays.
- The change is directly tied to `DLV-011` (document field/payload acceptance) and `DLV-008` (source-authoritative financial statement output). It does not close either roll-up.

### Evidence and acceptance state

- The preceding exact-main candidate `0ead2b082439944403616793c611a4f8859ca5fd` completed [Aghbari run 40942315137](https://github.com/Report-Engainall/Nasr1/actions/runs/40942315137) with `SUCCESS`; this includes the corrected assigned-warehouse return-receipt authorization assertions.
- The new PDF fix and test are committed on `66ed055031f8fa9f6d1da0ab2ebe0a996f849221`; its own Aghbari run is pending/in progress. No test outcome is transferred from another SHA.
- The central acceptance matrix currently contains 122 unique populated task IDs, 18 delivery groups, and 0/18 fully release-closed groups. An overall completion percentage remains not computable until all required specification leaves are mapped to candidate-specific evidence.
- `RET-PRINT-001` and `DLV-011` remain open pending the current exact-head result and the remaining role/template coverage. Full production release remains NO-GO: live Onyx Pro round-trip, official WhatsApp receipts, live AI operation, production deployment/rollback/restore, hosted authenticated customer/tenant journeys, and owner approval are not evidenced by this commit.

### HISTORICAL NEXT ACTION — superseded by CURRENT_EXECUTION_STATE.md
1. Read the terminal result for [Aghbari run 40943206938](https://github.com/Report-Engainall/Nasr1/actions/runs/40943206938), which targets exactly `66ed055031f8fa9f6d1da0ab2ebe0a996f849221`. If it fails, inspect the failed job and fix only the demonstrated cause; otherwise record this focused PDF contract fix as tested without closing the full document/security roll-up.
2. Then continue on `main` to the next uncovered role/template output or server-side authorization boundary in `DLV-011`/`DLV-015`. Do not rebuild previously implemented finance PDFs, export engines, receipt printing, or executive XLSX reports.

---

## HISTORICAL CHECKPOINT — 2026-10-29 (warehouse return receipt reprints read persisted evidence)

**Repository:** `Report-Engainall/Nasr1`  
**Execution branch:** `main` only  
**Code/test candidate before this documentation commit:** `22516e095f9788360f0b2f27c96b38c7d69ea862`  
**CI status:** Aghbari Commerce checks for that candidate were queued when this checkpoint was prepared. No terminal test result is claimed for the new receipt-print path.

### Implementation completed

- Added migration `supabase/migrations/20261029190000_customer_return_receipt_print_snapshot.sql`, defining `public.get_customer_return_receipt_print_data(uuid)`. It derives the tenant and actor from the live server identity, requires the operational manager/admin capability, and returns a fixed allowlist built from the persisted receipt header and receipt-item snapshots. It omits receipt, tenant, warehouse, product and line UUIDs and has no cost/margin output fields.
- Updated `src/components/CustomerReturnReceiptQueue.tsx`: after `receive_customer_return` confirms persistence, the component fetches the canonical print snapshot by the receipt ID, validates its line/summary totals against the mutation acknowledgement, and prints only the loaded snapshot. If snapshot loading fails after the mutation has committed, the UI explicitly says that the receipt **was saved** but its printable copy could not be loaded; it preserves the same idempotency key/draft for a safe retry instead of claiming the write failed or creating a new key.
- Updated `src/lib/customer-return-receipts.ts` with a strict allowlist parser for the persisted snapshot. It checks line count, per-line restockable/defective partition, aggregate totals and date validity before enabling print.
- Added focused unit coverage in `src/test/customer-return-receipts.test.ts`, component coverage in `src/test/customer-return-receipt-queue.test.tsx`, and PostgreSQL authorization/privacy assertions in `scripts/test-customer-returns.mjs`. The database acceptance checks snapshot fields and quantities, asserts private IDs and finance fields are absent, rejects mismatched/nonexistent records, and confirms ordinary customers cannot call the staff receipt-print RPC.
- Kept the previously applied financial print fix: when customer display names and business code are absent, invoice/account-statement print uses `عميل غير مسمى`, not the internal UUID. Its regression covers both artifacts.

### Acceptance state

- New matrix row: `RET-PRINT-001` — implementation and test coverage added; exact-candidate CI is pending. Do not mark it closed until its run is terminal SUCCESS.
- `DLV-007` remains **PARTIAL**: receipt reprint evidence is now server-persisted, but inventory/reservation/transfer lifecycle and actual Onyx Pro target round-trip remain open.
- `DLV-011` remains **OPEN**: the receipt snapshot path and UUID fallback gap are addressed, but the complete role-by-template PDF/XLSX/print allowlist and hosted authenticated journeys remain incomplete.
- `DLV-005` remains **PARTIAL**. Delivery groups remain **0/18 fully release-closed**. The matrix now has **122 populated unique IDs**, and a global completion percentage remains uncomputed.
- Full production release remains **NO-GO** pending hosted authenticated E2E, actual Onyx Pro round-trip, official WhatsApp delivery receipts, live AI-provider operation, production deploy/rollback/restore evidence and owner approval.

### HISTORICAL NEXT ACTION — superseded by CURRENT_EXECUTION_STATE.md
Use the terminal result for the exact new main candidate; fix any reported regression before progressing. Then continue directly to the next uncovered role/template or server authorization gap. Do not rebuild completed exports or print routes, and do not turn missing hosted/external evidence into PASS.

---

## HISTORICAL CHECKPOINT — 2026-10-29 (financial print UUID fallback removed)

**Repository:** `Report-Engainall/Nasr1`  
**Execution branch:** `main` only  
**Application change:** `8cbc23d515526bf9eba9de2c4b631a9075ab3727`  
**Regression-test commit:** `fbf4b25f36a9c32906ffef4da71891dc47eb19f5`  
**Acceptance-record update:** `0d4ee47eb81800886af22b77caf1f6daee77432b`  
**CI status:** Not asserted for the new application/test candidate. No previous test result is carried forward to this SHA.

### Implementation completed

- Updated `src/lib/finance-document-print.ts`: invoice/account-statement print labeling no longer falls back to a customer's internal UUID when business name, contact name, and customer code are unavailable; the document now uses the Arabic fallback `عميل غير مسمى`.
- Updated `src/test/finance-document-print.test.ts`: added a regression for both invoice and account-statement printable documents. It checks the safe customer label and confirms internal customer, invoice, item, credit, and payment UUIDs do not appear in the generated document HTML/title.
- Updated the existing acceptance matrix rows `GATE-001`, `DLV-011`, and `DLV-ROLLUP-001`. No parallel tracker was created.

### Acceptance state

- `DLV-011` remains **OPEN**. One reproducible document privacy gap has been fixed and regression coverage added; this does not close the full role-by-template PDF/XLSX/print allowlist or hosted authenticated journeys.
- `DLV-005` remains **PARTIAL** until the full server authorization/session/tier matrix is evidenced.
- Delivery groups remain **0/18 fully release-closed**. A global completion percentage is not asserted.
- Production release remains **NO-GO** while hosted authenticated E2E, actual Onyx Pro round-trip, official WhatsApp delivery receipts, live AI-provider operation, production deployment/rollback/restore evidence and owner approval remain unproven.

### HISTORICAL NEXT ACTION — superseded by CURRENT_EXECUTION_STATE.md
Continue directly on `main` with the next uncovered role/template output or server-side authorization boundary. Do not reimplement the completed export/print routes. Keep CI and hosted evidence tied to the exact candidate SHA; do not claim this candidate passed tests until its checks report terminal success.

---

## HISTORICAL CHECKPOINT — 2026-10-29 (warehouse return receipt and reversal evidence printing added)

**Repository:** `Report-Engainall/Nasr1`  
**Execution branch:** `main` only  
**Current code SHA:** `7ddfbd8f66c7e2e7e4123bd694a89abfe34152de`  
**CI status of this exact SHA:** Not asserted; latest code commits were not polled or represented as passing.

### Implementation newly completed

- `e23533871bf6d9d39a86ed1ce976db1d6b92e216` — warehouse staff can print the last successfully saved customer-return receipt after the `receive_customer_return` RPC returns the persisted receipt number and authoritative totals. The printable document includes request/order numbers, customer, receiving warehouse, sent line quantities, restockable/defective split and notes; it omits internal UUIDs and hides the live queue during print.
- `7ddfbd8f66c7e2e7e4123bd694a89abfe34152de` — reversed credit memos can be reprinted using the existing financial RPC/parser and a label that makes reversal evidence explicit. No client-created journal entry is used.
- Previous code in this checkpoint remains present: executive analytics XLSX (`c1930e9dbed8954878a760a4e33be037c56c5a5e`), filtered inventory-transfer XLSX (`80bc97ab4dadddaa5b223b29ae5960489588e9e3`), product-activity detail/summary reconciliation (`015b4f01c4acdad8bc64ed7a405c4d4b1b612a0f`), source UUID removal from task printing (`44043840525a181567640330a7f47f3d7787eac3)), and customer-order PDF scoping (`360d6c90a907b21f07b7cccf8d20166cf5854107`, `10d80137c464431f98d93779b32d731f2f5eea99`).

### Acceptance state

- `DLV-005`: **PARTIAL** — the real two-session price/revocation test exists, but its execution result and complete hosted authenticated role/tier/session matrix are not claimed.
- `DLV-007`: **PARTIAL** — stock-count XLSX and filtered inventory-transfer XLSX exist; the full inventory movement/reservation/transfer lifecycle and actual target-native Onyx Pro round-trip remain open.
- `DLV-010`: **PARTIAL** — customer 360, product activity and five-sheet executive analytics exports exist; business UAT and hosted evidence remain open.
- `DLV-011`: **OPEN** — finance, purchase, customer-order, task, stock-count, transfer-history and warehouse return-receipt print/export paths have implementation, including reversal evidence print. Full role-by-template payload allowlists and hosted authenticated journeys remain incomplete.
- The acceptance CSV retains **121 unique populated IDs, 0 duplicates, 18 delivery groups, and 0/18 fully release-closed groups**. A global completion percentage is still not computable until all mandatory canonical specification leaves are mapped to evidence.
- Production release remains **NO-GO** pending hosted E2E, target-native Onyx, official WhatsApp receipts, live AI-provider operation, production deployment/rollback/restore evidence and owner approval.

### HISTORICAL NEXT ACTION — superseded by CURRENT_EXECUTION_STATE.md
Continue direct implementation on `main` from `7ddfbd8f66c7e2e7e4123bd694a89abfe34152de`; prioritize uncovered role/template outputs or direct server authorization boundaries. Do not repeat completed print/export paths, and do not claim a CI result for this current SHA.

---

## HISTORICAL CHECKPOINT — 2026-10-29 (executive and transfer XLSX paths added; superseded by the newer receipt/finance-print checkpoint)

**Repository:** `Report-Engainall/Nasr1`  
**Execution branch:** `main` only  
**Current code SHA:** `80bc97ab4dadddaa5b223b29ae5960489588e9e3`  
**Current code SHA acceptance:** Not asserted here. The most recent exact-head CI success known at this checkpoint is for the earlier SHA `44043840525a181567640330a7f47f3d7787eac3` (211/211 test files, 1,381/1,381 tests). Later commits below have been pushed to main, and their CI was deliberately not polled.

### Implementation added after the previous accepted SHA

1. **`3a189d0fc9aaf8afbb420be54a8ea7a9408bab81`** — added a two-session PostgreSQL price/revocation race acceptance to `scripts/test-customer-price-visibility.mjs`. It blocks a member's price RPC behind the owner-held customer-row lock, invokes the actual membership-revocation RPC, commits the revocation, and requires the waiting price read to reject. This test is added but its result is not claimed here.
2. **`360d6c90a907b21f07b7cccf8d20166cf5854107` and `10d80137c464431f98d93779b32d731f2f5eea99`** — customer order print/PDF now hides the application shell and limits paper output to the saved order document; the reorder feedback and customer return-request workflow are excluded from the printable document.
3. **`8bdd5863365a419d373703e9cd36080deb05eef2`** — executive product-activity reporting exposes the unknown-stock count and no longer claims that Excel covers the full organization when the report is truncated above 5,000 rows.
4. **`c1930e9dbed8954878a760a4e33be037c56c5a5e`** — added a five-sheet executive analytics Excel export: KPI summary, daily sales, top products, top customers, and the seven-day forecast or the reason the forecast is unavailable. The export omits internal customer IDs, cost and margin fields.
5. **`80bc97ab4dadddaa5b223b29ae5960489588e9e3`** — added a two-sheet Excel export for the filtered inventory-transfer history. It preserves item-code strings/leading zeros, records filter metadata and the 500-row source-window limit, and omits raw transfer, batch, warehouse and actor identifiers.
6. Earlier in this execution, `44043840525a181567640330a7f47f3d7787eac3` removed raw source UUIDs from operational-task print output; `015b4f01c4acdad8bc64ed7a405c4d4b1b612a0f` added complete product-activity detail/summary reconciliation; `4afe6e8171c4574403f0e03c855ff57a20a4be4a` scoped purchase-order print output so an individual order does not print unrelated orders.

### Release state — continue implementation, do not infer completion

- `DLV-005`: **PARTIAL**. Existing hidden-price NULL/no-zero behavior, role/tier boundaries and session checks remain covered by code-level tests. The new concurrent member-revocation case is present, but its result and full hosted authenticated role/tier/session matrix are not claimed.
- `DLV-007`: **PARTIAL**. Stock-count XLSX and its saved-count consistency guard are implemented; filtered inventory-transfer history XLSX is now present. Full movement/reservation/transfer lifecycle acceptance, production stock evidence and a real Onyx Pro round-trip remain open.
- `DLV-010`: **PARTIAL**. Customer 360 and product-activity exports already exist; executive analytics XLSX now covers summary, sales trend, top products/customers and forecast state. Business UAT and hosted evidence remain open.
- `DLV-011`: **OPEN**. Role-sensitive finance PDFs, task print, purchase-order print, customer-order print, stock-count print and transfer-history print/export have implementation changes, but the complete role-by-template payload allowlist and hosted authenticated output journeys are not closed.
- The acceptance matrix currently has **121 populated task IDs, 121 unique, 0 duplicates, 18 delivery roll-up groups, and 0/18 groups fully release-closed**. A global completion percentage is **not computable** until every mandatory canonical specification leaf is mapped to candidate-specific evidence.
- Production release remains **NO-GO** until hosted authenticated E2E, target-native Onyx acceptance, official WhatsApp delivery receipts, live AI-provider operation, production deploy/rollback/restore evidence and owner sign-off are supplied.

### HISTORICAL NEXT ACTION — superseded by CURRENT_EXECUTION_STATE.md
Continue code changes on `main` from `80bc97ab4dadddaa5b223b29ae5960489588e9e3`. Do not repeat already implemented stock-count XLSX, product-activity XLSX, customer 360 XLSX, executive analytics XLSX or inventory-transfer XLSX. Next prioritize uncovered `DLV-005` direct API/RPC authorization/session/revocation boundaries or missing `DLV-011` role/template outputs. Do not wait on, repeatedly poll or overstate GitHub Actions status.

---

# Aghbari Commerce — Continuous Execution Record

> **Single source of truth.** Update this file at every meaningful checkpoint: before starting a new task, after implementation, after tests, after merge, and when blocked. Do not restart discovery or repeat completed audits. Read only this file's newest **LIVE CHECKPOINT / NEXT ACTION** section first, verify the current main SHA and exact-SHA CI, then continue from the next incomplete acceptance item. Keep older entries as history; never let a historical SHA or status override live repository evidence.

## HISTORICAL CHECKPOINT — 2026-10-29 (stock-count XLSX integrity verified; superseded by the newer implementation checkpoint)

**Verified at:** `2026-10-29T17:52:05Z`  
**Repository / execution branch:** `Report-Engainall/Nasr1` / `main` only  
**Exact tested application/code SHA:** `dba1d8eb062814f0e2c1d0dba3aff067cc75cc08`  
**Aghbari Commerce CI:** [run 40924950053 — terminal SUCCESS](https://github.com/Report-Engainall/Nasr1/actions/runs/40924950053)  
**One-main cleanup:** [run 40924949954 — terminal SUCCESS on the same SHA](https://github.com/Report-Engainall/Nasr1/actions/runs/40924949954)

### Completed and verified in this checkpoint

1. **Recovered the exact-head CI failure without changing application behavior.** Run [40923245752](https://github.com/Report-Engainall/Nasr1/actions/runs/40923245752) failed in `scripts/test-customer-returns.mjs` because the settlement-lock test depended on the momentary `pg_stat_activity.state/query` snapshot. The two settlement RPCs both succeeded after releasing the test gate; the assertion incorrectly missed the second waiter. Commit [`3ae9829705f8f25017f5792e221289362fba57fd`](https://github.com/Report-Engainall/Nasr1/commit/3ae9829705f8f25017f5792e221289362fba57fd) now verifies the two dedicated backend PIDs waiting on the exact ungranted advisory lock held by the gate, using `pg_locks`. Exact-head run [40924155975](https://github.com/Report-Engainall/Nasr1/actions/runs/40924155975) passed.

2. **Implemented warehouse stock-count Excel export.** `src/components/InventoryStockCountPage.tsx` exposes the saved stock-count snapshot export through `src/lib/stock-count-xlsx.ts`, with Arabic summary/detail worksheets. It retains leading-zero product codes; uses saved counts only; preserves unknown amounts as blank; escapes formula-like text; and omits private tenant, user, session, row and product identifiers from the workbook.

3. **Added a source-consistency guard to that export.** Commit [`dba1d8eb062814f0e2c1d0dba3aff067cc75cc08`](https://github.com/Report-Engainall/Nasr1/commit/dba1d8eb062814f0e2c1d0dba3aff067cc75cc08) rejects export when the session's saved `counted_lines` differs from the number of detail rows with a saved actual count. The regression test in `src/lib/stock-count-xlsx.test.ts` covers the mismatch and prevents generating a contradictory summary.

4. **Exact-SHA test evidence:** [run 40924950053](https://github.com/Report-Engainall/Nasr1/actions/runs/40924950053) passed **211/211 test files and 1,378/1,378 unit tests**. PostgreSQL 17 migration/workflow acceptance, RPC inventory generation/upload, finance/idempotency/concurrency, import/export, inventory stock-count and backup/restore checks, lint, build, preview/dev smoke and Chromium price-visibility acceptance completed successfully. The cleanup workflow also succeeded on the same code SHA.

### Acceptance state — do not overstate completion

- `DLV-007` remains **PARTIAL**: the stock-count export is implemented and accepted by exact-head CI, but full stock-movement/reservation/transfer lifecycle and real Onyx Pro round-trip remain unproven.
- `DLV-005` remains **PARTIAL**: artifact-level price privacy and current code-level tests pass, but the full role/tier/session/API matrix and hosted authenticated authorization remain open.
- `DLV-011` remains **OPEN**: the stock-count workbook adds warehouse-role output evidence, but all applicable role-by-template field allowlists and hosted authenticated output acceptance are not complete.
- The central acceptance CSV currently contains **121 populated unique task IDs and 0 duplicates**. The 18 delivery groups have **0/18 fully release-closed**; an overall completion percentage remains **not computable** until mandatory specification leaves are mapped to candidate-specific evidence.
- Full production release remains **NO-GO**. Hosted authenticated customer/tenant E2E, target-native Onyx acceptance, official WhatsApp delivery receipts, live AI-provider operation, production migration/deploy/rollback and restore evidence, and owner sign-off remain blocked or unverified.

### HISTORICAL NEXT ACTION — superseded by CURRENT_EXECUTION_STATE.md
Continue at the first uncovered `DLV-005` direct API/RPC role/tenant/tier/session boundary or `DLV-011` role/template output without equivalent artifact-level proof. Do not repeat the already accepted stock-count XLSX, purchase-order XLSX, Customer 360 XLSX, or previous statement/credit-memo PDF/print cases. Record new evidence here and in the existing matrix; do not create a parallel tracker.


## HISTORICAL CHECKPOINT — 2026-10-29 (Customer 360 Excel export accepted; superseded by the newer code-tested checkpoint)

- **Checkpoint timestamp (UTC):** 2026-10-29T17:19:58Z.
- **Repository / only integration branch:** `Report-Engainall/Nasr1`, `main`. Exact tested code SHA: `088e42450dc2fe7dc72cc8f4a1b3ff3cd79af46b` ([commit](https://github.com/Report-Engainall/Nasr1/commit/088e42450dc2fe7dc72cc8f4a1b3ff3cd79af46b)).
- **Exact-SHA CI:** [Aghbari Commerce run 40919660544 — terminal SUCCESS](https://github.com/Report-Engainall/Nasr1/actions/runs/40919660544) on `088e42450dc2fe7dc72cc8f4a1b3ff3cd79af46b`: **209/209 test files and 1370/1370 tests passed**. PostgreSQL 17 migration/core and tenant-authorization workflows, exact-head RPC/function inventory generation/upload, finance/idempotency/concurrency checks, asynchronous export/import contracts, inventory import non-mutation, isolated PostgreSQL 17 backup/restore, lint, production build, production-preview smoke (4173), development smoke (5173), and Chromium price-visibility acceptance all passed. There were no failed steps. [One-main-branch cleanup 40919660696 — SUCCESS](https://github.com/Report-Engainall/Nasr1/actions/runs/40919660696) on the same SHA.
- **New working feature:** `src/components/AdminCustomer360.tsx` now has a working `تصدير Excel` action backed by `src/lib/customer-360-xlsx.ts` and its tests `src/lib/customer-360-xlsx.test.ts`. The generated XLSX has eight worksheets: customer overview; full per-currency ledger aggregates; latest orders; latest invoices; latest payments; top products; follow-up signals; and order-status distribution.
- **Data correctness and privacy acceptance:** full server-computed ledger aggregates remain separate by currency; latest order/invoice/payment details remain explicitly bounded to the latest 20; unavailable monetary/due-date values remain blank rather than becoming zero; the workbook preserves leading-zero business identifiers as strings; XML/formula injection is tested; cost/margin fields are excluded; over-20 detail responses are rejected rather than silently presented as complete. The export uses the already-authorized customer 360 summary RPC and does not create alternate client-side totals.
- **Failure transparency:** the earlier run [40919501907](https://github.com/Report-Engainall/Nasr1/actions/runs/40919501907) failed on SHA `c10c0f4` because an exact Arabic wording assertion did not match the workbook label. That label and the reload error reset were corrected on `088e42450dc2fe7dc72cc8f4a1b3ff3cd79af46b`; the exact-SHA run above passed every test and workflow gate.
- **Acceptance status:** `DLV-010` remains **PARTIAL**; customer 360 Excel delivery is implemented and locally accepted, but complete analytics/Customer 360 business acceptance and hosted UAT are not closed. `DLV-011` remains **OPEN** because the complete role-by-template PDF/XLSX/print matrix and hosted authenticated output acceptance remain unproven. `DLV-005` remains **PARTIAL**; `DLV-003` remains **PARTIALLY VERIFIED**; `DLV-007` remains **PARTIAL**.
- **External/release gates:** hosted authenticated customer/tenant end-to-end tests; actual Onyx Pro target-version import/export round-trip; official WhatsApp delivery receipts; live AI-provider behavior; production deploy/migration/rollback and production restore evidence; and owner sign-off remain `BLOCKED_EXTERNAL` or `UNVERIFIED`. Full production release remains **NO-GO**.
- **Single live ledger / sole matrix:** this file is the only live execution ledger. `docs/bolt-source-reconciliation/CURRENT_EXECUTION_STATE.md` is a compatibility redirect, not another task queue. The only acceptance matrix is `docs/bolt-source-reconciliation/REMAINING_SCREEN_ACCEPTANCE_MATRIX_2026-10-22.csv`.
- **Roll-up:** 118 populated unique acceptance IDs, 0 duplicate IDs, 18 delivery groups, and 0/18 fully release-closed. Overall completion percentage is **NOT COMPUTABLE** until all required leaf evidence and group roll-ups reconcile on a single release candidate.
- **NEXT ACTION:** use the matrix to select the first remaining uncovered DLV-005/DLV-011 direct API/RPC permission, tenant/tier/session/cache boundary or role-specific generated artifact. Add one focused regression and parsed-artifact evidence at a time. Do not repeat the accepted Customer 360 XLSX, product-movement XLSX, customer statement PDF, or staff statement/credit-memo print tests. Do not claim external/production acceptance based on CI.

## Historical checkpoint — 2026-10-29 (checkpoint superseded)

- **Checkpoint timestamp (UTC):** 2026-10-29T15:47:42.177Z.
- **Repository / execution target:** `Report-Engainall/Nasr1`, `main` only. Parent main SHA before this checkpoint: `1f149dbeea5c08a6336ebabf4a736233dfb5ce9b`. This checkpoint commit adds a documented invariant to the required-field migration to ensure the PostgreSQL 17 migration/acceptance workflow runs against the current candidate; actual checkpoint SHA is the commit created for this entry and is verified from GitHub below.
- **Acceptance in progress:** `DLV-003` / database-boundary required-field validation. Migration `supabase/migrations/20261029152500_product_required_fields_guard.sql` rejects whitespace-only `products.name` and `products.item_code` and normalizes accepted values before persistence. The regression cases already exist in `scripts/test-admin-catalog-commands.mjs` (direct UPDATE/INSERT, rejection messages, and proof that the original row stays unchanged).
- **Proven CI failure and cause:** [PostgreSQL 17 run 40904234961](https://github.com/Report-Engainall/Nasr1/actions/runs/40904234961), job 123554490122, failed in `npm run test:db` at `ADMIN_CATALOG_COMMANDS_FAILED`. The logged SQLSTATE `22023` was expected from the MOQ enforcement because the shared fixture set `min_order_quantity=2` and `order_quantity_multiple=2`, then attempted a staff order with quantity 1. The production quantity guard is correct; the fixture was inconsistent.
- **Concrete correction:** commit [1f149db](https://github.com/Report-Engainall/Nasr1/commit/1f149dbeea5c08a6336ebabf4a736233dfb5ce9b) changes `scripts/test-admin-catalog-commands.mjs` so the concurrent idempotency test orders quantity 2, asserts persisted quantity 2, and uses quantity 4 for the conflicting-but-valid replay payload. This preserves both MOQ enforcement and the idempotency-conflict assertion.
- **Exact-SHA status before this checkpoint:** [test-and-build run 40904867445](https://github.com/Report-Engainall/Nasr1/actions/runs/40904867445) was `IN_PROGRESS` on `1f149dbeea5c08a6336ebabf4a736233dfb5ce9b`; [one-main cleanup run 40904867357](https://github.com/Report-Engainall/Nasr1/actions/runs/40904867357) was `SUCCESS` on that same SHA. PostgreSQL 17 did not trigger for that commit because its path filters do not include `scripts/test-admin-catalog-commands.mjs`; this checkpoint touches the migration path so PostgreSQL 17 can re-run against the new exact SHA.
- **Acceptance result:** `DLV-003` remains **PARTIALLY VERIFIED**, not closed. Required-field source tests exist; the current candidate remains unaccepted until PostgreSQL 17 finishes successfully on the exact checkpoint SHA. Remaining catalog acceptance includes server-backed filters/pagination and route/UAT coverage.
- **PR / merge:** no PR created and no branch created. This repository's `main` was reported `protected=false`; all writes here are forward-only commits to `main`, without force-push/reset/clean.
- **Release gates:** hosted authenticated tenant/customer E2E, real Onyx target round-trip, official WhatsApp delivery receipts, live AI provider, production deploy/migration/rollback/restore and owner sign-off remain `BLOCKED_EXTERNAL` or `UNVERIFIED`.
- **NEXT ACTION:** inspect CI on the exact SHA of this checkpoint commit. If PostgreSQL 17 fails, fix the specific failing assertion only; if it passes, continue directly to the next incomplete `DLV-003` server-backed filter/pagination item and preserve the exact-SHA evidence.

## Historical checkpoint — 2026-10-28 (superseded by the 2026-10-29 checkpoint)

- **Checkpoint timestamp (UTC):** 2026-10-28T19:06:15.931Z.
- **Repository / integration target:** `Report-Engainall/Nasr1`, branch `main` only. Current code-tested main SHA: `c97a70bcbc8c2bd1d1535e2bf00af829423288c9`. GitHub reports `main` is not branch-protected; no force push/reset/branch creation was used.
- **Exact-SHA CI — storefront subcategory acceptance:** [Aghbari Commerce run #2797 / 40750424902](https://github.com/Report-Engainall/Nasr1/actions/runs/40750424902) completed **SUCCESS** on `c97a70bcbc8c2bd1d1535e2bf00af829423288c9` at 2026-10-28T19:04:37Z. Job completed 34 steps with 0 failed steps; logs confirm **205/205 test files and 1345/1345 tests passed**. PostgreSQL 17 full migrations/core workflows, RPC/function inventory generation/upload, finance, journal reversal, invitations, addresses, tenant analytics, async exports, import idempotency, inventory snapshot, saved products, PostgreSQL 17 backup/restore, lint, production build, preview/dev smoke, and Chromium price-visibility acceptance passed.
- **One-main cleanup:** [run #63 / 40750424941](https://github.com/Report-Engainall/Nasr1/actions/runs/40750424941) completed **SUCCESS** on the same code SHA. No branch inventory/audit is being repeated.
- **Accepted requirement `STF-FEATURED-METADATA-001`:** the corrected forward-only migration `supabase/migrations/20261028183000_storefront_featured_projection.sql` projects only the supported persisted fields `is_featured` and `sort_order`; it does not reference unsupported `brand_id`. Exact-SHA [run #2796 / 40749568186](https://github.com/Report-Engainall/Nasr1/actions/runs/40749568186) completed **SUCCESS** on `2127fa551a81c9c84694bb6bbcfd0c331a74a79e`; the PostgreSQL runtime test verifies persisted featured/sort values, featured-first ordering, server-side price privacy and no tenant/warehouse/internal-stock leak.
- **Implemented requirement `DISCOVERY-005` / partial `DLV-003`:** commit [c97a70b](https://github.com/Report-Engainall/Nasr1/commit/c97a70bcbc8c2bd1d1535e2bf00af829423288c9) fixes advanced search so active child categories are selectable and visibly indented; inactive categories remain excluded. Added acceptance test in `src/test/storefront-discovery.test.tsx`; the exact-SHA run above is green. This is a bounded fix, **not** completion of the full product discovery/admin catalog workstream.
- **Current code delta:** `src/components/AdvancedStorefrontSearchPage.tsx`, `src/test/storefront-discovery.test.tsx`. No PR or merge SHA applies to this direct commit on the repository's unprotected `main`; code commit SHA is `c97a70bcbc8c2bd1d1535e2bf00af829423288c9`.
- **Release decision:** **NO-GO for full production release**. Hosted authenticated customer/tenant E2E, live Onyx target sync/import, official WhatsApp delivery receipts, live AI-provider behavior, production deploy/migration/rollback, production restore, and owner sign-off remain unproven and are not reported as PASS.

## UNIFIED EXECUTION MANDATE — DO NOT RESET THE WORK

1. **Resume protocol:** read this LIVE CHECKPOINT, the existing `NEXT ACTION`, and the current acceptance matrix. Confirm current `main` SHA and latest CI only; do not re-fetch or re-audit the entire repository. Start immediately at the first incomplete acceptance item.
2. **Implement, don't narrate:** each work cycle must produce a concrete code/test/doc delta tied to an acceptance ID. Build the real user path end-to-end: Arabic RTL UI → service/API → database/RPC → tenant/role authorization → audit/validation → tests. No placeholder/demo-only completion claims.
3. **Small verified increments:** implement one bounded, valuable change; run the narrow test, relevant security/privacy tests, and required CI on the exact candidate SHA; inspect failures and fix only evidenced defects; use the repository-approved merge path as soon as gates pass; verify CI on the actual merge SHA; then update this record and continue immediately.
4. **No duplicate work:** do not recreate merged PRs, completed fixes, inventories, reports, or tests. Preserve existing findings and link to them. A closed PR is not automatically merged; verify its merge SHA or equivalent change on `main`.
5. **Acceptance-driven priority:** prioritize unfinished release-blocking product flows and visible screens/services over additional inventory/report polishing, while immediately fixing proven security, tenant-isolation, price-privacy, finance, stock, or import/export defects. Use the original master specification and screen acceptance matrix as the requirement authority.
6. **Required product constraints:** B2B customer-specific price tiers are server-selected; hidden prices must never leak through DOM/API/cache/PDF/XLSX or use zero as a sentinel. Preserve Onyx Pro's 27-column order, external IDs including leading zeros, idempotent imports, and truthful sync metadata. Protect ledger/reversal, Customer 360, admin AI, role-specific print routes, official WhatsApp Business API, free/local AI adapters without surprise paid billing, and read-only weak-network PWA cache (no offline order/stock/finance mutations).
7. **Truthful external gates:** mark hosted tenant/customer E2E, live Onyx, official WhatsApp receipts, live AI provider, production deploy/migration/rollback, restore, and owner sign-off as BLOCKED_EXTERNAL/UNVERIFIED until actual authorized evidence is recorded. Do not fabricate credentials or results.
8. **Progress log format:** every update records UTC timestamp, main/candidate SHA, acceptance ID/requirement, files changed, implementation result, exact test commands/results and CI run URLs, merge SHA, remaining blocker, and the single next action. If nothing changed, report the specific blocker and the next executable step—not a list of browsing/review activities.
9. **Time transparency:** record actual timestamps at each milestone. Do not claim second-by-second live refresh unless an actual automated updater is configured; the repository file updates when a checkpoint is committed. The user should be able to open this single record directly without asking for a fresh recap.
10. **Completion definition:** a requirement closes only with implementation evidence + passing relevant tests on the exact SHA + acceptance-matrix update. Overall release closes only when all applicable acceptance groups and external gates have evidence, with owner sign-off recorded.

## Historical NEXT ACTION — superseded by the newest live checkpoint

1. Continue `DLV-003` from the first still-open catalog acceptance row: implement one missing server-backed filter / required-field validation / pagination behavior with its focused regression test. Do not redo featured metadata or active-subcategory search.
2. On every new code commit, verify terminal CI on its exact SHA, update the requirement and interface matrices, then refresh this central record. Keep all external/production gates `BLOCKED_EXTERNAL` or `UNVERIFIED` until actual evidence exists.

## Historical checkpoint (superseded by live reconciliation above)

### Earlier confirmed repository state

- Main has not been modified directly. Main Core [40035355209 SUCCESS](https://github.com/Report-Engainall/Nasr1/actions/runs/40035355209) is on SHA `16a3d23e558696700bccbb3dbf9ea75b0fccf745`.
- PR #127 is already merged; PR #129 is closed unmerged. Neither is being recreated.
- The current state checkpoint and acceptance matrix were refreshed on the #133 branch to record PRs #147–#151, the unique migration ordering, exact-head test evidence and external-test limitations. These commits advance the #133 head; verify Core/P2 on the final updated head before claiming the refreshed docs branch passes.
- `docs/bolt-source-reconciliation/API_OPS_CONTRACT_REGISTER_2026-10-24.md` was updated on [PR #142](https://github.com/Report-Engainall/Nasr1/pull/142) with five specific semantic findings and current evidence. The latest register head is `0b8eab56970f1485f86535edf7b66d1c1bddae90`; Core [40107811311](https://github.com/Report-Engainall/Nasr1/actions/runs/40107811311) and P2 [40107811295](https://github.com/Report-Engainall/Nasr1/actions/runs/40107811295) were running at this checkpoint.
- The API-OPS inventory maps 304/304 public runtime objects to sources, but the 179 callable RPC candidates still require semantic review. Do not mark the overall API-OPS workstream complete based on a small subset of fixed NULL-state cases.

## 2. Implemented defects and exact-head evidence

### PR #147 — customer quote decision

- Head: `5b351a544f412a48c0d5466b91b000c51100c889`.
- Added `20261024133000_customer_quote_response_explicit_decision.sql` after detecting that #146 already uses migration version 13:00. This eliminates a duplicate migration version.
- Core [40106804073 SUCCESS](https://github.com/Report-Engainall/Nasr1/actions/runs/40106804073), P2 [40106804081 SUCCESS](https://github.com/Report-Engainall/Nasr1/actions/runs/40106804081); direct PostgreSQL 17 runtime passed.
- Evidence: NULL quote ID/decision returns SQLSTATE `22023` without mutation; explicit `false` and `true` persist the expected rejected/accepted transitions.
- Status remains PARTIAL for release: open/unmerged, no independent submitted review; hosted customer E2E remains skipped.

### PR #148 — operational task status

- Head: `fbc34727822416c6521cd9bae841c8d0df0261c6`.
- Added `20261024140000_operational_task_status_reject_null.sql` plus source-contract and PostgreSQL 17 runtime tests.
- Core [40106736245 SUCCESS](https://github.com/Report-Engainall/Nasr1/actions/runs/40106736245), P2 [40106736237 SUCCESS](https://github.com/Report-Engainall/Nasr1/actions/runs/40106736237), PG17 [40106736232 SUCCESS](https://github.com/Report-Engainall/Nasr1/actions/runs/40106736232).
- Evidence: NULL/unsupported statuses are rejected before mutation; a valid transition updates the task and writes exactly one status-change audit row.
- Status: open/unmerged; no independent review.

### PR #149 — promotion activation

- Head: `21fabc9ecaf11fb3f22737e11070d23e83cb1872`.
- Added `20261024143000_promotion_null_active_decision.sql`.
- Core [40107006299 SUCCESS](https://github.com/Report-Engainall/Nasr1/actions/runs/40107006299), P2 [40107006338 SUCCESS](https://github.com/Report-Engainall/Nasr1/actions/runs/40107006338), PG17 [40107006365 SUCCESS](https://github.com/Report-Engainall/Nasr1/actions/runs/40107006365).
- Evidence: NULL is rejected before create/toggle; no promotion mutation/deactivation audit is created; explicit true/false remains effective.
- Status: open/unmerged; no independent review.

### PR #150 — storefront announcement activation

- Head: `1b22b83b3297c87c57b20c62336f16b772b613e4`.
- Added `20261024144500_announcement_null_active_decision.sql`.
- Core [40107350234 SUCCESS](https://github.com/Report-Engainall/Nasr1/actions/runs/40107350234), P2 [40107350238 SUCCESS](https://github.com/Report-Engainall/Nasr1/actions/runs/40107350238), PG17 [40107350314 SUCCESS](https://github.com/Report-Engainall/Nasr1/actions/runs/40107350314).
- Evidence: NULL create/update is rejected with SQLSTATE `22023`, with no state change or audit event; explicit false deactivates once.
- Status: open/unmerged; no independent review.

### PR #151 — AI fallback telemetry

- Latest head: `70c96242e28375bacde73d5a2b85ec538b982d5d`.
- Added `20261024145000_ai_fallback_decision_reject_null.sql`, source-contract tests and an isolated PostgreSQL 17 runtime workflow. Both v1/v2 AI usage completion require an explicit fallback flag before reservation lookup/mutation; v1 also explicitly rejects NULL provider/result status.
- A previous head `c2b64beedd0cd3d473506fe55044388624196409` had a Core failure only because a new source-contract test expected a literal `p_usage_measurement_status='unknown'`, while the implementation uses an ELSE branch for unknown usage. The test was corrected to verify the actual measured/partial branches and the “unknown usage cannot claim measured tokens” rejection.
- On the latest head `70c96242...`, PostgreSQL 17 [40107756187 SUCCESS](https://github.com/Report-Engainall/Nasr1/actions/runs/40107756187). Core [40107756122](https://github.com/Report-Engainall/Nasr1/actions/runs/40107756122) and P2 [40107756096](https://github.com/Report-Engainall/Nasr1/actions/runs/40107756096) were still running at checkpoint. Do not transfer results from the previous SHA to this head.
- Status: PARTIAL until Core and P2 both pass on the latest head, followed by independent review and merge.

## 3. Required sequence and unresolved release gates

Keep migration versions unique and preserve dependency order:

`#144 (11:00) → #145 (12:00) → #146 (13:00) → #147 (13:30) → #148 (14:00) → #149 (14:30) → #150 (14:45) → #151 (14:50)`.

- #144 head `2bf9cfedbc6d840a0da3fdffe7ddb106b9929a71`: Core [40105249828 SUCCESS](https://github.com/Report-Engainall/Nasr1/actions/runs/40105249828), P2 [40105249827 SUCCESS](https://github.com/Report-Engainall/Nasr1/actions/runs/40105249827); still open awaiting independent review.
- #145 head `7c82b051ed0bda11c944e4fe08ecf4a117060ed5`: historical Core [40100874921](https://github.com/Report-Engainall/Nasr1/actions/runs/40100874921) and P2 [40100874931](https://github.com/Report-Engainall/Nasr1/actions/runs/40100874931) succeeded on that historical SHA only. It must be refreshed after #144.
- #146 head `3150691725f97d7f892fcb2aed0edae898c839be`: historical Core [40101794869](https://github.com/Report-Engainall/Nasr1/actions/runs/40101794869) and P2 [40101794970](https://github.com/Report-Engainall/Nasr1/actions/runs/40101794970) succeeded on that SHA only. Resolve shared `scripts/test-database-migrations.mjs` changes from #134/#144/#146 while preserving all tests.
- PRs #133, #142, #144–#151 remain open/unmerged here. A reviewer request is not an approval; there are no independent submitted reviews confirming closure. Do not merge, bypass protection, or modify `main` directly.
- Hosted customer/tenant E2E remains `SKIPPED/BLOCKED_EXTERNAL` where authorized test credentials are unavailable. CI does not prove production writes, live Onyx import, WhatsApp delivery, live AI-provider secrets, deployment or production restore.
- Exact-head CI for #133 must be rerun after the latest checkpoint/matrix/report commits; previous head results do not transfer.

## 4. NEXT ACTION — FIRST STEP ON RESUME

1. Poll #151 Core `40107756122` and P2 `40107756096` on SHA `70c96242e28375bacde73d5a2b85ec538b982d5d`; inspect job logs and fix only proven failures.
2. Poll #142 Core/P2 `40107811311`/`40107811295` on its current register head. Any additional register correction requires another exact-head run.
3. Verify Core/P2 on the final head of PR #133 after its updated state, matrix and report commits.
4. Continue semantic review of remaining callable RPCs and close outstanding acceptance items from the original mandate; do not stop after these NULL-decision fixes.
5. After independent submitted reviews and successful final-head gates, follow required merge order and verify CI on each actual merge SHA.



## Archived checkpoint — previously live section (superseded; retained for history)

## HISTORICAL CHECKPOINT — 2026-10-28

- **Exclusive target:** `Report-Engainall/Nasr1` / `main` only. No side branches or duplicate repositories.
- **Latest fully verified baseline SHA:** `c412d2df9e58a670461168252d271629be6bcbb4`. [Aghbari Commerce checks #2784 / run 40743164520](https://github.com/Report-Engainall/Nasr1/actions/runs/40743164520) completed **SUCCESS** on this exact SHA.
- **Exact-SHA evidence:** 205/205 test files and 1340/1340 unit tests passed, including `src/test/dashboard-load-error.test.tsx` (1/1). Isolated PostgreSQL 17 migrations/core acceptance, targeted finance/import/export/inventory workflows, PostgreSQL 17 backup/restore, lint, production build, preview/dev smoke tests, and Chromium price-visibility acceptance all passed. [One-main cleanup #50](https://github.com/Report-Engainall/Nasr1/actions/runs/40743164599) also succeeded.
- **Closed bounded screen defect:** `ROUTES-DASHBOARD-ERROR-RECOVERY-001`. Commit [c412d2d](https://github.com/Report-Engainall/Nasr1/commit/c412d2df9e58a670461168252d271629be6bcbb4) adds a visible retry path when dashboard metrics fail; retry reissues metrics, alerts and product fetches. The dedicated Vitest assertion passed. This does not close the overall `ROUTES-001` screen acceptance group.
- **Corrective action for `STF-FEATURED-METADATA-001`:** candidate [ba4022f](https://github.com/Report-Engainall/Nasr1/commit/ba4022fa0b527eb0c86390569a0d12aa0320165b) failed PostgreSQL migration validation because `products.brand_id` does not exist. The next fix removes that unsupported column from the forward migration and its test; the accepted contract is limited to persisted `is_featured` and `sort_order`. The corrected main SHA remains pending exact-SHA CI; do not mark the acceptance row accepted before terminal SUCCESS.
- **Release decision:** **NO-GO for full production release** remains unchanged. Hosted authenticated customer/tenant E2E, live Onyx sync, official WhatsApp delivery receipts, live AI-provider operation, production deploy/migration/rollback, production restore and owner sign-off remain unproven.

## 2026-10-30 — Follow-on exact-head security proof and checkpoint

- Main advanced to code SHA `539630b1315394cb507a803a3f8db7829976f240`. Added semantic denial/no-side-effect PostgreSQL 17 tests for customer payment recording: same-tenant customer denial `42501`; foreign-tenant manager denial `P0002`; invoice, customer balance, payment ledger and audit snapshots remain unchanged.
- Exact-head Core [40988280123 SUCCESS](https://github.com/Report-Engainall/Nasr1/actions/runs/40988280123), Import finalizer PG17 [40988280280 SUCCESS](https://github.com/Report-Engainall/Nasr1/actions/runs/40988280280), P2 local Supabase/Chromium [40988280282 SUCCESS](https://github.com/Report-Engainall/Nasr1/actions/runs/40988280282), one-main cleanup [40988280165 SUCCESS](https://github.com/Report-Engainall/Nasr1/actions/runs/40988280165). Inventory artifact [12947808539](https://api.github.com/repos/Report-Engainall/Nasr1/actions/artifacts/12947808539/zip) is 330/330 mapped across 174 migrations.
- External hosted customer/order/tenant test remains `SKIPPED`; local browser tests are not hosted or production proof. DLV-008/015 remain PARTIAL; release remains NO-GO.
- Sole next task: `DLV-015-CUSTOMER-QUOTE-REVOKE-RACE-001` — add deterministic PostgreSQL 17 evidence that customer quote response cannot commit after membership revocation while blocked on the quote-row lock. Canonical resume instructions are in `docs/bolt-source-reconciliation/CURRENT_EXECUTION_STATE.md`.

## 2026-10-30 — DLV-015 customer quote membership-revocation race

- Exact code SHA `7fb457e832bfcf96072aa596ce437874bfc0447f`; Core [40989774771 SUCCESS](https://github.com/Report-Engainall/Nasr1/actions/runs/40989774771), P2 local Supabase/Chromium [40989774803 SUCCESS](https://github.com/Report-Engainall/Nasr1/actions/runs/40989774803), one-main cleanup [40989774726 SUCCESS](https://github.com/Report-Engainall/Nasr1/actions/runs/40989774726).
- Added deterministic PostgreSQL 17 race: buyer RPC waits on `sales_quotes FOR UPDATE`; separate transaction commits membership revocation; response rejects `42501`; quote status/responded_by/updated_at/audit unchanged. Core logs contain explicit PASS marker. No migration changed.
- P2 order/tenant, returns/credit memo, real Onyx XLSX, finance/task printing, customer-manager privacy/audit and device-session revocation all passed. Hosted customer/order/tenant E2E remains `SKIPPED`.
- Exact-head RPC inventory [12949205362](https://api.github.com/repos/Report-Engainall/Nasr1/actions/artifacts/12949205362/zip): 330/330 source-matched, 174 migrations. DLV-015 remains PARTIAL; no production DB touched.
- Sole next task: `DLV-011-FINANCE-PRINT-RPC-ALLOWLIST-001` — exact server JSON key allowlists for finance print payload RPCs across admin/manager/accountant, in `scripts/test-database-migrations.mjs` only.
