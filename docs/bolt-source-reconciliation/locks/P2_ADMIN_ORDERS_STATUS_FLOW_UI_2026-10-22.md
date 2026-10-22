# P2 path ownership lock — admin order transition UI

- Date: 2026-10-22
- Repository: `Report-Engainall/Nasr1`
- Task: `ORD-001`
- Branch: `fix/p2-admin-orders-transition-options-20261022`
- Base SHA: `bf06c73226033da8e4f81e24981eb64e6e7fca99`
- Owner: P2
- Status: active — align `/admin/orders` options with the authoritative database state machine and stop false-success refreshes.

## Confirmed root cause

- The routed `src/pages/admin/AdminOrders.tsx` advertises legacy statuses (`new`, `received`, `reviewing`, `approved`, `preparing`, `prepared`, `dispatched`, `rejected`, `invoiced`, `returned`) that the order transition trigger does not accept as transition targets.
- The backend in `supabase/migrations/20261009050000_order_transition_integrity.sql` accepts only `draft`, `pending`, `confirmed`, `processing`, `shipped`, `delivered`, and `cancelled`, with state-specific legal transitions.
- The current handler discards the Supabase update error and affected-row result, then reloads; a rejected or zero-row update is indistinguishable from success.

## Owned paths

- `src/pages/admin/AdminOrders.tsx`: per-current-state legal status options, saving/error state, affected-row result verification; preserve current tenant/RLS enforcement in Supabase.
- `src/test/admin-orders-status-transition-ui.test.tsx`: component-level regression tests for transition options and server update denial/zero-row behavior.
- This scoped lock only.

## Exclusions

- Do not edit `src/lib/api.ts` or `src/test/order-status-write-result.test.ts` (owned by separate open order status PRs #46/#56).
- Do not edit `src/components/AdminPages.tsx`, shared execution state/matrix/work coordination, package manifests, workflow files, or P1-owned ledgers.
- No direct main writes and no database/schema changes in this UI-scoped correction.

## Acceptance

- Only database-supported next states are offered for a known state; terminal states cannot transition; legacy unknown states do not offer unsupported transitions.
- Failed update errors and zero affected rows are surfaced as an accessible alert, never success.
- The same exact-SHA Core CI and unit tests must pass; authenticated-browser claims remain separate.
