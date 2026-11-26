# P2 Checkpoint — Inventory Transfer Endpoint Replay Guard
Date: 2026-11-27
Repository: `Report-Engainall/Nasr1`
Role: P2 — PostgreSQL/RPC/migrations/transactions/inventory/finance
PR: #602 — https://github.com/Report-Engainall/Nasr1/pull/602
Branch: `p2/inventory-transfer-replay-endpoint-pg17-20261126`

## Current synchronization
- Current `main` before sync: `fa7118367f8f28dada88ad9d7c91c2382f07717c`.
- Preserved prior P2 candidate: `6233341ac15befa3a8afc2779df552b8c4ee73b4`.
- The new candidate is a normal two-parent merge of current main and the prior P2 branch head; no force-push.
- Only P2-owned paths are changed against current main: this checkpoint, `supabase/tests/inventory_transfer_replay_endpoint_guard.sql`, and `.github/workflows/inventory-balance-adjustment-pg17.yml`.
- Current-main P1 workflow filters are preserved. The prior branch's obsolete P1 workflow edit is intentionally excluded.

## Acceptance covered
- Applies the actual production migration `20261126110000_inventory_transfer_replay_endpoint_guard.sql` in isolated PostgreSQL 17.
- Executes both `transfer_inventory` and `transfer_inventory_batch`, proving first write and exact authorized replay.
- Deactivates or reassigns a transfer endpoint and requires SQLSTATE `42501` on stale-key replay.
- Compares before/after balances, lot quantities/lineage, transfer records/envelopes, transfer items, paired movements and audit counts to prove no side effects on denial.
- Verifies both live RPC definitions validate and lock both active same-tenant endpoints before acquiring the idempotency lock and reading replay state.
- No production migration or transaction RPC was changed by this acceptance PR.

## Historical exact-head evidence — prior P2 head only
On `6233341ac15befa3a8afc2779df552b8c4ee73b4`:
- Inventory PostgreSQL 17 run [45909752987](https://github.com/Report-Engainall/Nasr1/actions/runs/45909752987): SUCCESS; atomic adjustment, transfer scope and endpoint replay acceptance passed.
- P1 run [45909753181](https://github.com/Report-Engainall/Nasr1/actions/runs/45909753181): SUCCESS (Vitest, strict TypeScript and production build).
- P2 run [45909753027](https://github.com/Report-Engainall/Nasr1/actions/runs/45909753027): SUCCESS. Public smoke and infrastructure gate passed; isolated local Supabase/PostgreSQL 17 migrations and authenticated order/tenant browser acceptance passed. Hosted customer/order/tenant workflow remained SKIPPED, not PASS.
- These results are scoped to that prior SHA only.

## Required acceptance on this synchronized candidate
The new synchronization commit is the candidate head. Require Inventory PostgreSQL 17, P1 Admin Context Verification and P2 Playwright Critical Paths to complete on its exact SHA. Previous-head evidence is not carried forward.

## Safety and ownership
- Disposable PostgreSQL 17 and local Supabase only; no hosted database write, production mutation, deployment, secrets or paid API.
- No Vercel, Bolt or Lovable.
- P2 owns this checkpoint and test acceptance. P1 retains sole review and merge authority into `main`.
