# P2 Checkpoint — Onyx Inventory Reconciliation Mutation Windows
Date: 2026-11-27
Repository: \`Report-Engainall/Nasr1\`
Role: P2 — PostgreSQL, inventory transactions, finance and data integrity
PR: #605 — https://github.com/Report-Engainall/Nasr1/pull/605
Branch: \`p2/onyx-reconciliation-mutation-window-pg17-20261126\`

## Current synchronization
- Current \`main\`: \`68148f4ded83ed16bdf7a42dda5fad619c7e76b5\`.
- Previous P2 candidate: \`f95d7c2b7d2e50fae6ccd74398b64367b5496a4c\`.
- This candidate is a normal two-parent synchronization of the latest main and the previous P2 work. No force-push or history rewrite.
- Only these three P2-owned paths differ from current main: this checkpoint, \`supabase/tests/onyx_inventory_reconciliation_as_of_guard.sql\`, and \`.github/workflows/onyx-inventory-asof-postgres17.yml\`.
- Current-main P1 workbook type fixes are retained; no application runtime, production migration, RPC implementation, role, RLS policy or hosted data is changed by this PR.

## Scope already implemented
1. Preserve the pre-existing immutable source-date and stale-at-preview Onyx acceptance.
2. Preview an eligible source snapshot, commit a later inventory movement, and require apply to fail with SQLSTATE \`40001\`.
3. Apply a fresh eligible snapshot, commit a later inventory movement, and require compensating rollback to fail with SQLSTATE \`40001\`.
4. For both denials, compare complete JSON snapshots of aggregate balance, movement ledger, command, reconciliation items and audit; assert command state remains \`previewed\` / \`applied\` respectively.
5. Mutation-window fixtures directly commit an explicitly tagged \`acceptance_fixture\` movement to isolate the Onyx guard boundary. They are not a separate end-to-end purchase-receipt RPC test. Receipt→FEFO lot→reservation/sale→cancellation-release is covered by the current main FEFO batch acceptance.

## Historical exact-head evidence — previous P2 head only
On \`f95d7c2b7d2e50fae6ccd74398b64367b5496a4c\`:
- Onyx PostgreSQL 17 run [45911956934](https://github.com/Report-Engainall/Nasr1/actions/runs/45911956934): SUCCESS.
- P2 run [45911956978](https://github.com/Report-Engainall/Nasr1/actions/runs/45911956978): SUCCESS for infrastructure, public smoke and local Supabase/PostgreSQL 17 + authenticated Playwright. Hosted customer/order/tenant job: SKIPPED, not PASS.
- These results are scoped only to the previous SHA and are not carried forward.

## Required acceptance on the synchronized candidate
The newly synchronized branch head is the candidate. Require fresh Onyx PostgreSQL 17 and P2 critical-path workflows to complete on the exact current PR head SHA. Check each job conclusion and the checked-out SHA. P1 exact-head verification is also required after the main type fix; never substitute an earlier result.

## Safety and ownership
- Disposable PostgreSQL 17 / local Supabase only; no hosted Supabase write, production mutation, live Onyx call, or deployment.
- No paid API, Vercel, Bolt or Lovable.
- P2 owns this focused acceptance and checkpoint. P1/P3 retain sole authority to approve and merge into \`main\`.
