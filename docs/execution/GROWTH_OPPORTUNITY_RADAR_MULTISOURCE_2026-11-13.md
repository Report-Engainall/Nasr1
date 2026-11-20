# Growth Opportunity Radar — multi-source implementation

**Date:** 2026-11-13  
**Repository:** `Report-Engainall/Nasr1`  
**PR:** [#437](https://github.com/Report-Engainall/Nasr1/pull/437)  
**Branch:** `feat/growth-radar-multi-source-20261113`  
**Reviewed target SHA:** `3d6411dcd320ff03d63774d2bdb69e838bc36830`  
**Base SHA:** `8ecf74f61157ddbbf4d3f2f927081fd6e24ee5cc`

## Delivery

This pass completes the independent Growth Opportunity Radar path. It does not rebuild predictive search, recently viewed products, pricing, order lifecycle, replenishment, or the daily decision board.

The implementation reuses three existing NASR1 evidence readers:

1. Customer retention and repeat-purchase activity — `fetchCustomerRetentionAggregate`.
2. Demand observed for products when available stock was zero — `fetchUnavailableProductSearchDemand`.
3. Product order/quantity performance across comparison windows — `fetchProductPerformanceGrowthContext`.

`fetchCustomerRetentionWorkspaceAggregate` launches all three reads with the same period and `asOf` timestamp. Each source retains its own tenant permission, error, evidence population, completeness and warnings. If one source is unavailable or denied, the remaining sources are still evaluated; the radar can show supported opportunities while the overall status stays partial/needs-review.

The combined snapshot is marked VERIFIED only when all source populations are verified and evidence and metric IDs are unique. Source coverage is rendered separately with per-source status, evidence and signal counts, warnings, and the source's actual failure message. The Growth Opportunity Radar remains visible even when the customer-retention report itself fails.

The natural-language assistant's `GROWTH_RADAR_OVERVIEW` now calls the same workspace aggregator. It no longer constructs a parallel version of the radar with different completeness logic.

## Decision and evidence rules

The deterministic policy in `src/lib/intelligence/growth-opportunities.ts` retains these minimum gates:

- Unavailable-product demand requires at least 5 recorded searches and 3 distinct searchers.
- Customer decline requires a baseline population with at least 3 previous orders; the decline threshold remains 30%.
- Product performance requires equal-length current/baseline periods, comparable units, at least 5 qualifying orders in each period, and a movement of at least 20%.
- Missing lineage, incomplete populations, incompatible units/periods, insufficient samples, duplicate signal identifiers and unverified source metrics are withheld or downgraded; they are not imputed.

A quote is not treated as a converted or unconverted sales order unless a verified relation to the sales-order record exists. The current quote aggregate does not expose that relation, so quote acceptance is not counted as sales conversion. The implementation does not invent conversion rates or forecast revenue.

The only purchase follow-up action retained in this radar is the existing manager/admin-authorized, idempotent review-task action for unavailable-product demand. It does not create a purchase order or place an order automatically.

## Files changed

- `src/lib/intelligence/growth-opportunities.ts` — per-source coverage contract and warning propagation.
- `src/lib/intelligence/customer-retention-client.ts` — shared multi-source aggregator; independent source reads and combined completeness.
- `src/components/intelligence/GrowthOpportunityRadar.tsx` — source-coverage cards and explicit partial-source states.
- `src/components/intelligence/IntelligenceWorkspace.tsx` — loads the shared aggregator and displays the radar independently of retention-report success.
- `src/lib/intelligence/natural-language-assistant-client.ts` — uses the same aggregate and source-status rules.
- `src/lib/intelligence/growth-opportunities.test.ts` — policy and evidence regression tests.
- `src/components/intelligence/GrowthOpportunityRadar.test.tsx` — UI coverage/failure-state tests.
- `.github/workflows/p1-admin-context-verification.yml` — ensures radar sources and tests trigger the strict P1 gate.

## Reference implementation and licensing

Apache Superset was inspected at `master` commit `4ac8bfe29f0399752197f489979d41f6b46c2f9b`. Exact inspected source files:

- `DashboardGrid.tsx` — blob `1e7f816e6a257bad557ff18db28da8e0c03b9ee2`.
- `FiltersBadge/DetailsPanel/index.tsx` — blob `1df3cbf4bbbecaccc5bfc1bf209f9cebc0ab2b74`.
- `ChartContainer.tsx` — blob `70a7c6e7c04974425d74dc1112b2848278997e0c`.
- Root `LICENSE.txt` — blob `56313ab5a54a163e7d46224cb5470a814c3a2436`, read and confirmed Apache-2.0.

NASR1 reimplements the relevant separation of source/data handling and presentation, plus independently inspectable source status. No Superset code, asset, Redux store, chart package or transitive dependency was copied. There are no new packages, database migrations, RPCs, RLS policies, Vercel deployments or paid services in this feature.

## Test evidence

- **P1 Admin Context Verification: PASS** on exact application SHA `3d6411dcd320ff03d63774d2bdb69e838bc36830`: complete Vitest suite, strict TypeScript and production build. Run: [43368078248](https://github.com/Report-Engainall/Nasr1/actions/runs/43368078248).
- **P2 public Chromium smoke: PASS** on the same application SHA.
- **P2 isolated local Supabase/PostgreSQL 17 acceptance: PASS** on the same application SHA, run [43368078285 (attempt 2)](https://github.com/Report-Engainall/Nasr1/actions/runs/43368078285). The job applied repository migrations to its isolated PostgreSQL 17 stack, created two transient users in distinct organizations, passed endpoint guard and transactional price/cash-expense/purchase-receipt checks, built/launched the exact application, and passed all Chromium acceptance steps:
  - authenticated order persistence after refresh and cross-tenant denial;
  - warehouse stock-count XLSX download and content/privacy checks;
  - purchase-orders XLSX creation/download and content/privacy checks;
  - checkout replay after a committed response was lost, without duplicate order creation;
  - customer return request, review, receipt and credit memo;
  - audited Onyx order XLSX export;
  - finance-document and operational-task printing by role;
  - customer-manager authorization, financial privacy and audit;
  - multi-device session authorization and immediate revocation.
- The external hosted customer-order/tenant-isolation job was **SKIPPED** because the required external secrets were not supplied. This is not a hosted-environment PASS. The local PostgreSQL 17/Chromium test above is the evidence for local order persistence and tenant isolation.
- The feature merged through PR [#437](https://github.com/Report-Engainall/Nasr1/pull/437) as merge commit `1917eece605c1469134eadfefcc4feb30851e65b`, based on `bcf0de77a0794e073e562e23ea83ae68746c117e`. The post-merge `main` head at the time this evidence update was prepared is `c8fb02e9c3928524b02a9023a290da4c55fe8deb`; subsequent changes to task-quality insight docs/code are separate from the radar files.
