# P2 Checkpoint — Inventory Replenishment Open-PO Commitments PostgreSQL 17 Acceptance
Date: 2026-11-27
Repository: `Report-Engainall/Nasr1`
Role: P2 — inventory data lineage, purchase commitments, PostgreSQL 17, tenant authorization and read-only aggregate integrity
PR: #681 — https://github.com/Report-Engainall/Nasr1/pull/681
Branch: `p2/replenishment-open-po-pg17-20261127-v2`

## P1 pagination-fixture dependency consumed unchanged — 2026-11-27
- The P2 browser run on the earlier branch head `929e171387e5878325e9adf73c5f0a969f0ed8ac` failed its public smoke only on the P1-owned test helper expecting HTTP `Range: 0-24`, while the real page uses PostgREST `offset`/`limit`. The local P2 Supabase job independently continued and had reached 52/71 steps without failures.
- The exact P1-authored helper blob `b8505a706773062c49ce0cceef76d76e19166117`, committed by P1 as `c73c9f7983234d877d1cf96544f4b61c16e36676` and already exercised by the public-smoke **SUCCESS** in #605, was reused byte-for-byte in this P2 branch. No P1 logic was edited or rewritten.
- New current PR code head: `0f51d6a349cd25d2e8e025b294079940a8de4fee`; compare to `main` `348da8e756201fc103089cf4a5a690a4132528b7`: **13 ahead / 0 behind**, four paths (existing P2 workflow, this checkpoint, the P1 test helper blob, and P2 replenishment acceptance script). No production migration/RPC/source change.
- P2 [run 46064801689](https://github.com/Report-Engainall/Nasr1/actions/runs/46064801689) and P1 [run 46064801698](https://github.com/Report-Engainall/Nasr1/actions/runs/46064801698) were **QUEUED** at checkpoint time. The earlier P2 workflow on `929e...` remained in progress; its outcome is not carried to the new SHA.
- Next: poll the exact `0f51d6a...` P2 public smoke, local PG17 replenishment test and authenticated Chromium suite; record only exact-head completed evidence. P1 owns final merge. P2 did not touch production or main.

## Scope and canonical contract
- The production aggregate and unit-normalization migrations are already on `main`: `20261105230000_intelligence_replenishment_open_purchase_orders.sql` and `20261117150000_inventory_replenishment_open_po_unit_normalization.sql`.
- This PR adds acceptance coverage only; it does not change production schema/RPC behavior or P1/P3 UI/engine code.
- Existing RPCs create, submit, partially receive and cancel disposable purchase orders inside one PostgreSQL transaction which is rolled back.
- Assertions cover submitted remaining quantities, partial receipt netting, exclusion of draft/cancelled/fully received and post-snapshot orders, unit conversion, fail-closed unknown UOM, evidence lineage, manager allow/customer deny, invalid period denial and no writes from the read aggregate.

## Timestamp assertion repair
- Initial exact P2 job on `acc555e3bb681fc48fdec2ade3bdae7be7b3955a` failed only because PostgreSQL emitted the same instant with `+00:00` while the JS fixture used `Z`. This was a representation-only assertion defect, not a database arithmetic/authorization failure.
- Test helper `assertSameInstant` now requires explicit RFC3339 timezone syntax and compares parsed instants, rather than timestamp strings. Its regex is:
  `/^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}(?:\\.\\d{1,6})?(?:Z|[+-]\\d{2}:\\d{2})$/`.
- The earlier failure was corrected in code-bearing commit `04a8d4192112b1e0f3e08fdbf5e22d1b84083a8f`.

## Synchronization and exact-head proof boundary
- Synchronized non-force onto current `main` `348da8e756201fc103089cf4a5a690a4132528b7` by merge commit `baca0b6d1f67073af14477b3c18741ebb2ceb934`.
- Current compare at sync: **9 commits ahead / 0 behind**, exactly two code paths: `.github/workflows/p2-playwright-critical-paths.yml` and `scripts/test-inventory-intelligence-replenishment-commitments.mjs`.
- The workflow now runs local authenticated order/tenant acceptance independently of the P1 public UI smoke, so unrelated storefront pagination failure no longer suppresses P2 local acceptance.
- On pre-sync corrected SHA `04a8d4192112b1e0f3e08fdbf5e22d1b84083a8f`, the P2 local job [140722236657](https://github.com/Report-Engainall/Nasr1/actions/runs/46063220855/job/140722236657) completed the dedicated step “Test tenant-scoped open purchase-order commitments, partial receipt netting, as-of and UOM safety on PostgreSQL 17” with **SUCCESS**. That proves the timestamp fix and acceptance logic on that code SHA only.
- On current synchronized code-bearing head `baca0b6d1f67073af14477b3c18741ebb2ceb934`, P2 workflow [run 46063823171](https://github.com/Report-Engainall/Nasr1/actions/runs/46063823171), local job [140724228654](https://github.com/Report-Engainall/Nasr1/actions/runs/46063823171/job/140724228654), completed the exact step “Test tenant-scoped open purchase-order commitments, partial receipt netting, as-of and UOM safety on PostgreSQL 17” with **SUCCESS**. The acceptance is now PASS on the synchronized code SHA (not merely the pre-sync branch).
- The dedicated replenishment PG17 step above is **SUCCESS** on synchronized code SHA `baca0b6d1f67073af14477b3c18741ebb2ceb934`.
- The wider P2 local authenticated browser job [140724228654](https://github.com/Report-Engainall/Nasr1/actions/runs/46063823171/job/140724228654) remained **IN_PROGRESS** after 49 of 71 steps; it had advanced to Chromium customer return/review/receipt/credit-memo acceptance with no failed step reported. The public storefront smoke remained **IN_PROGRESS**; the separate customer/order/tenant wrapper remained **SKIPPED** because it depends on that P1-owned smoke.
- P1 workflow [run 46063823178](https://github.com/Report-Engainall/Nasr1/actions/runs/46063823178): **SUCCESS** — Vitest and strict TypeScript passed on the synchronized code SHA. The broader incomplete suites are not counted as PASS.
- The pre-sync public smoke failed on the shared P1 customer-order pagination assertion: expected request `range=0-24`, received `null`; this belongs to P1. The hosted customer/order/tenant E2E remains **SKIPPED**, not PASS.

## Safety and next action
- All data fixtures are synthetic and transaction-rolled-back in isolated local PostgreSQL 17/Supabase CI. No production database, live ERP, deployment, service credential, paid service or new dependency is used.
- Next: read this checkpoint, poll the exact current-head P2 job for the dedicated replenishment step and remaining authenticated acceptance; record the result and P1-owned browser blockers accurately. P2 does not merge to `main`.
