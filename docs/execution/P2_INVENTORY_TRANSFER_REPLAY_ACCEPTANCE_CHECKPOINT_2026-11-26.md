# P2 Checkpoint — Inventory Transfer Endpoint Replay Guard
Date: 2026-11-27
Repository: `Report-Engainall/Nasr1`
Role: P2 — inventory transaction integrity, PostgreSQL 17 acceptance, idempotency and tenant isolation
PR: #602 — https://github.com/Report-Engainall/Nasr1/pull/602
Branch: `p2/inventory-transfer-replay-endpoint-pg17-20261126`

## Latest synchronization to moving main — 2026-11-27
- `main` advanced to `f0c911923b785cdaaf6e823b271f538c56fd7cd3` through merge #683, which includes the accepted P1 PostgREST offset/limit fixture. The P1 helper blob on main is `b8505a706773062c49ce0cceef76d76e19166117`.
- P2 branch synchronized by non-force, two-parent merge commit `f785ec6a1792c5d25ce7111e1fb17b9809a72729`, with expected ref protection. Current compare: **30 ahead / 0 behind**, exactly three P2-owned paths: this checkpoint, `.github/workflows/inventory-balance-adjustment-pg17.yml`, and `supabase/tests/inventory_transfer_replay_endpoint_guard.sql`. The shared P1 fixture is now inherited from main, not duplicated in this PR.
- Exact-current-head Inventory PG17 [run 46065151032](https://github.com/Report-Engainall/Nasr1/actions/runs/46065151032) and P2 critical-path [run 46065150925](https://github.com/Report-Engainall/Nasr1/actions/runs/46065150925) were **QUEUED** after synchronization. Previous PG17 PASS on `433a...` is not transferred to `f785...`.
- At synchronization PR #602 was **mergeable=true**, **draft=false**. P1 owns final review and merge; P2 does not merge.
- Next: verify the dedicated transfer endpoint replay/FEFO PostgreSQL 17 test on the exact new head, then the local P2 browser path. No production migration, live inventory write, hosted Supabase or external ERP action was performed.

## Historical head after the P1 PostgREST fixture repair
- P1 fixture repair commit `c73c9f7983234d877d1cf96544f4b61c16e36676` is included in this branch's P1-owned `e2e/helpers/customer-orders-keyboard-test.ts`; the fixture now validates actual `offset`/`limit` query parameters.
- Current PR #602 code-bearing head at this check: `f926cdf5dd5e785940dc50297a01cb805edaaa96`; compare with `main` `348da8e756201fc103089cf4a5a690a4132528b7`: **28 ahead / 0 behind**, four paths (three P2 paths plus the P1 fixture helper). GitHub reported mergeable true at the last PR check.
- Dedicated Inventory PG17 workflow [run 46064134872](https://github.com/Report-Engainall/Nasr1/actions/runs/46064134872): **SUCCESS** on exact head `f926...`; actual endpoint-replay SQL acceptance passed.
- P1 workflow [run 46064134934](https://github.com/Report-Engainall/Nasr1/actions/runs/46064134934): **SUCCESS** on that same head (Vitest + strict TypeScript).
- P2 critical-path [run 46064134964](https://github.com/Report-Engainall/Nasr1/actions/runs/46064134964): public Chromium smoke **SUCCESS**. Local Supabase/PostgreSQL 17 authenticated job [140726621642](https://github.com/Report-Engainall/Nasr1/actions/runs/46064134964/job/140726621642) was still **IN_PROGRESS** during local container startup; wrapper customer/order/tenant job remained **SKIPPED**, not PASS.
- No production migration/RPC, hosted Supabase, ERP, production inventory, or financial record was changed. P1 owns merge and full integration acceptance.

## Latest synchronization and exact-head PostgreSQL 17 result — 2026-11-27
- Synchronized non-force onto current `main` `348da8e756201fc103089cf4a5a690a4132528b7`; current code head: `7b875f32e2b21d4bf16a935163862c095c3fa6a0`.
- Compare is **25 commits ahead / 0 behind** with exactly three changed paths: this P2 checkpoint, `.github/workflows/inventory-balance-adjustment-pg17.yml`, and `supabase/tests/inventory_transfer_replay_endpoint_guard.sql`. The production endpoint guard migration is unchanged and byte-identical to `main` (blob `b857ea233e3fe8fe955a9f66b92b96b8694f4a01`).
- Dedicated Inventory PostgreSQL 17 workflow [run 46063531483](https://github.com/Report-Engainall/Nasr1/actions/runs/46063531483): **SUCCESS** on exact head `7b875f32e2b21d4bf16a935163862c095c3fa6a0`; job [140723252341](https://github.com/Report-Engainall/Nasr1/actions/runs/46063531483/job/140723252341) completed successfully and emitted `inventory transfer endpoint replay guard PostgreSQL 17 acceptance: PASS`.
- The acceptance applies the existing migration in disposable PG17 and proves single/batch idempotent replay, revalidation of both active same-tenant warehouse endpoints before replay, denial after deactivation/cross-tenant reassignment, unchanged before/after inventory/batch/transfer/movement/audit snapshots, FEFO batch lineage, and reserved-stock preservation.
- P1 [run 46063531491](https://github.com/Report-Engainall/Nasr1/actions/runs/46063531491) remained **IN_PROGRESS** at last poll.
- P2 critical-path [run 46063676628](https://github.com/Report-Engainall/Nasr1/actions/runs/46063676628): **FAILURE** solely at the P1-owned public Chromium pagination assertion in `e2e/helpers/customer-orders-keyboard-test.ts:272`; the fixture expected PostgREST range `0-24` but observed `null`, and the failure reproduced on retry (27 other public Chromium checks passed). The dependent authenticated local Supabase/browser job was **SKIPPED** because it still requires the public smoke. This is not a transfer RPC, PG17, or inventory transaction failure. P1 owns the pagination repair and retry.
- Dedicated Inventory PostgreSQL 17 [run 46063676538](https://github.com/Report-Engainall/Nasr1/actions/runs/46063676538) passed again on the docs-only descendant `56e3fed6dde12ca1280c008b03f8c9231d658db5`; the tested RPC/migration/acceptance code remains unchanged from code-bearing SHA `7b875f32e2b21d4bf16a935163862c095c3fa6a0`.
- Hosted customer/order/tenant E2E remains **SKIPPED**, not PASS. This work did not modify production migrations/RPCs, hosted Supabase, external ERP, secrets or live inventory.
- P1 owns browser repair, exact-head broad rerun and merge. P2 owns the dedicated PG17 test and this checkpoint; P2 does not merge to `main`.


## Existing production contract under test
- Migration: `supabase/migrations/20261126110000_inventory_transfer_replay_endpoint_guard.sql` (already present on `main`; this PR does not modify the migration).
- Both `transfer_inventory` and `transfer_inventory_batch` lock and validate exactly two active warehouses in the actor's organization before acquiring the idempotency lock and looking up a previous result.
- `FOR SHARE` locks keep both active endpoints stable until the transfer/replay transaction ends.
- This PR adds exact runtime acceptance only: no production migration, RPC implementation, RLS, grants, business rows or inventory balances are changed.

## Exact-head acceptance — 2026-11-27
- Tested PR head: `7dba1abd7b2ed2a4ee136e570c6c350b2fe09ac5`.
- P1 [run 45925626875](https://github.com/Report-Engainall/Nasr1/actions/runs/45925626875): **SUCCESS** — Vitest and strict TypeScript.
- Dedicated Inventory PostgreSQL 17 [run 45925626762](https://github.com/Report-Engainall/Nasr1/actions/runs/45925626762): **SUCCESS**; job [140266153289](https://github.com/Report-Engainall/Nasr1/actions/runs/45925626762/job/140266153289) completed all 10 steps.
  - Existing inventory-balance adjustment acceptance: PASS.
  - Existing transfer scope-before-replay acceptance: PASS.
  - New endpoint replay/single+batch/FEFO lineage acceptance: PASS. The exact log prints `inventory transfer endpoint replay guard PostgreSQL 17 acceptance: PASS`.
- P2 [run 45925626852](https://github.com/Report-Engainall/Nasr1/actions/runs/45925626852): **SUCCESS**.
- Local authenticated Supabase/PostgreSQL 17 job [140267186123](https://github.com/Report-Engainall/Nasr1/actions/runs/45925626852/job/140267186123): **SUCCESS**, 65 successful completed steps, zero failures; full migration replay and connected commerce/finance/inventory/FEFO/Onyx/browser acceptance completed.
- Public Chromium read-only smoke: **SUCCESS**. Hosted customer/order/tenant E2E: **SKIPPED**, not PASS.

## Verified behaviors
- The actual production migration is applied to disposable PostgreSQL 17.
- Source-order assertions verify scope, active same-tenant warehouse lookup, both endpoint locks, endpoint count, replay lock, then replay lookup for both RPCs.
- Single transfer and batch transfer create one transfer on first execution and return exact replay while both endpoints remain valid.
- Retry is denied after destination deactivation and after source reassignment to another tenant.
- Before/after snapshots prove denials do not change balances, lots, transfer rows, batch items, movements or audit count.
- FEFO lineage, expiry/receipt/cost metadata, destination-child lot ancestry, paired movements and reserved-stock preservation are asserted.

## Current integration boundary
- Latest observed `main`: `586db787dd3b17c18ad7a2e2a1e3ea65d93a7f8e`; merge base is `e2486a04d1ce4094f94fce8b5a8a19e1c35bf361`.
- PR #602 remains open. The latest compare is **20 commits ahead / 4 behind**, with exactly three changed paths relative to current `main`: the existing inventory PG17 workflow, this checkpoint, and the endpoint-replay SQL test. GitHub currently reports `mergeable=false`; P1 must synchronize before exact-head reruns.
- P1 owns synchronization with latest `main`, scoped diff review, exact-head reruns on the synchronized head, and the merge. P2 does not merge to `main`.
- Do not carry the above test results to a post-sync SHA without rerunning the dedicated Inventory PG17 workflow on that exact SHA.

## Safety and open-source reference
- All test writes run in disposable PostgreSQL 17 CI only.
- No hosted/production Supabase access, production data writes, deployment, secrets, external APIs, paid services or new dependencies.
- Existing shared open-source catalog/licence decisions were read; no external code, package, asset or parallel inventory service was added.
- Next session should read this checkpoint first and not repeat the broad OSS candidate search unless a concrete unmet gap is found.


## 2026-11-28 — Batch destination deactivation replay assertion and main synchronization

- Added an explicit negative acceptance case for `transfer_inventory_batch`: after a successful transfer and authorized idempotent retry, the test deactivates the destination warehouse, retries with the same key and payload, requires SQLSTATE `42501`, and compares the complete before/after inventory snapshot. Balances, batches, transfer rows, movement ledger and audit must remain byte-for-byte equivalent. The destination is reactivated before the existing cross-tenant reassignment assertion.
- The production RPC migration is unchanged. Source inspection confirms both single and batch procedures lock and validate exactly two active warehouses in the actor's organization with `FOR SHARE` before taking the idempotency advisory lock and looking up any prior result.
- Test-only source commit: `0e193e6a5ed47b595d703f7038880db3eb6b7a25`; test path: `supabase/tests/inventory_transfer_replay_endpoint_guard.sql`. Earlier PostgreSQL 17 success on `3af4b250295a87b302fcf7bda839df0d7573f998` does not include this new negative case and is not carried forward.
- Exact-head P1 run `46090658291` and P2 run `46090658263` were QUEUED on `0e193e6a5ed47b595d703f7038880db3eb6b7a25`; neither is PASS. The newly added destination-deactivation assertion still requires terminal PostgreSQL 17 acceptance.
- Synchronized this branch to current `main` `12b0db37a97128a19073f907ba12fb700251802b` using a non-force two-parent merge commit. The 15 main commits since merge base `8605561aaba9fb501f264677abcbf0ccc2b085ad` touch no P2-owned paths in this PR; the resulting tree preserves current main plus this PR's three unique paths (workflow, checkpoint and SQL test). No code from main was discarded.
- The resulting synchronized branch head is the new exact-SHA acceptance target. Run the dedicated inventory PostgreSQL 17 test, P1 strict typecheck and P2 critical-path suite on that SHA. P1 retains final review and merge ownership; hosted customer/order/tenant E2E remains separate and must not be called PASS when skipped.
- No hosted database, production inventory, customer balance, financial journal, external ERP, secret or deployment was touched.
