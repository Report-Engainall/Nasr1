# P2 Checkpoint — Inventory Transfer Replay Guard Acceptance
Date: 2026-11-26
Repository: `Report-Engainall/Nasr1`
Role: P2 — PostgreSQL/RPC/migrations/transactions/inventory/finance
Base/main observed: `69390c34f821ed137bd4426ddf097ef13d3fb14e`
P2 branch: `p2/inventory-transfer-replay-endpoint-pg17-20261126`
Initially accepted code SHA: `db4508d2993422d5037fb8dcc60a6d5c39c9cdbe` (dedicated transfer PG17, full P2 and P1 all passed on this SHA). A checkpoint-only descendant was then added; exact-head rerun is required and its final evidence is tracked in PR #602.
PR: [#602](https://github.com/Report-Engainall/Nasr1/pull/602)

## Scope delivered
- Added isolated PostgreSQL 17 execution acceptance for the actual migration `supabase/migrations/20261126110000_inventory_transfer_replay_endpoint_guard.sql`.
- The regression invokes both `public.transfer_inventory` and `public.transfer_inventory_batch`.
- Proves first application and exact idempotent replay while both same-tenant warehouses are active.
- Deactivates an endpoint and reassigns endpoints to a foreign organization; exact replay must fail with SQLSTATE `42501`.
- Compares pre/post snapshots for aggregate balances, batch rows/lineage, single transfers, batch envelopes, transfer-batch items, movements and audit count, proving denied replays do not alter persisted inventory or audit state.
- Verifies the installed RPC source checks both active same-tenant endpoints under `FOR SHARE` before the advisory replay lock and replay lookup.
- Wired migration/test paths into push and pull_request triggers of the existing inventory PG17 workflow. No production function or migration was modified by this PR.

## Exact-SHA evidence
- Inventory PG17 run [45742889862](https://github.com/Report-Engainall/Nasr1/actions/runs/45742889862): SUCCESS on `db4508d2993422d5037fb8dcc60a6d5c39c9cdbe`. Logs explicitly show inventory balance adjustment PASS, prior transfer replay scope PASS, and new endpoint replay acceptance PASS.
- P2 run [45742889995](https://github.com/Report-Engainall/Nasr1/actions/runs/45742889995): SUCCESS on the exact same SHA.
  - Public Storefront Chromium: 26 passed.
  - Local Supabase/PG17 authenticated integration job `139652723513`: every executed step SUCCESS, including complete migration replay, AuthV2 six-role parity, inventory and stock-count authorization, decision snapshot/outcome Maker-Checker, actual local Storage API, finance/receivable/cash expense/commitment workflows, supplier receipt accounting, FEFO receiving/reservation/sale/cancellation release, customer order persistence and cross-tenant denial, checkout lost-response replay, returns/credit memo, Onyx export, finance printing, customer-manager authorization/privacy/audit, device-session revocation, four-tier price editor, category tree and AI prompt governance; exact-SHA storage/price/category proof verifier passed. Cleanup and artifacts succeeded.
- P1 Admin Context Verification [45742890136](https://github.com/Report-Engainall/Nasr1/actions/runs/45742890136): SUCCESS on the same SHA, including Vitest and strict TypeScript.
- External hosted customer/order/tenant E2E remains SKIPPED due unavailable dedicated external fixture/explicit write authorization. Do not call it PASS.
- Supabase Edge Runtime was not deployed/invoked. Storage was exercised against disposable local Supabase only.

## Safety boundary
- No production or hosted Supabase writes, no deployment, no live Onyx/WhatsApp calls, no paid services, no Vercel/Bolt/Lovable actions, no provider activation or AI billing.
- P2 acceptance is local-source/runtime proof on the exact SHA; it is not production readiness evidence.

## Handoff
- PR #602 remains open and targets `main`. Its current head is authoritative; consult the PR and exact-head Actions results before integration. Do not transfer the initial `db4508d` PASS to any later head without rerunning.
- P2 owns this checkpoint and acceptance evidence. P1 retains sole merge authority; do not merge or update the shared global execution pointer/matrix from P2.
- CI trigger maintenance: the exact P2 checkpoint path is explicitly included in both the P1 verification and inventory PG17 workflow path filters so a checkpoint-only descendant reruns their exact-head gates. P2 Playwright runs on the PR head.
- Next P2 action after the exact-head retest: audit remaining open P2 finance/security work against current main and existing PR ownership; do not duplicate #602's replay guard.


## Current-main synchronization — 2026-11-27

- The acceptance branch was synchronized with current `main` `2981c0d1facab554fac56293a19798eca642ff79` using a normal two-parent merge commit `ab3ccd798bf0923b2ef553892c0149380dfceb97`; the prior branch head is preserved as its second parent.
- Transplanted only the P2 inventory test, dedicated inventory PostgreSQL 17 workflow and this P2 checkpoint. The branch's legacy edit to `.github/workflows/p1-admin-context-verification.yml` was intentionally not carried forward because it removed existing customer-payment-history test paths; current `main` P1 filters remain intact.
- The earlier `db4508d` P1/P2/PG17 evidence remains historical. The synchronized candidate requires exact-head PostgreSQL 17, P1 and P2 checks before any integration decision.
