# P2 path ownership lock — admin order transition UI (fresh mainline)

- Date: 2026-10-23.
- Repository: `Report-Engainall/Nasr1`.
- Task: `ORD-001`.
- Branch: `fix/p2-admin-orders-transition-options-mainline-20261023`.
- Exact base SHA: `c11ea018b81c6e47a9bbbc36d4d7b8f432892f8d`.
- Owner: P2.
- Scope: `src/pages/admin/AdminOrders.tsx`, `src/test/admin-orders-status-transition-ui.test.tsx`, and this scoped lock.
- Root cause: the admin order screen offered legacy states not accepted by the PostgreSQL transition trigger and ignored DB errors/zero-row writes before refreshing.
- Contract: offer only next states allowed for each known current state; terminal/unknown legacy states cannot be mutated through unsupported options; await a tenant/RLS-scoped `.select('id, status').maybeSingle()` result and require the returned `id` to equal the requested order; fail closed for DB denial, zero rows, or mismatched row; update rendered state only after exact-row acknowledgement.
- Separation: PR #67 owns `src/lib/api.ts` and `src/test/order-status-write-result.test.ts`. This PR does not change those paths, shared workflows, package manifests, migrations, P1-owned files, shared matrix, or state cursor. Merge requests must be sequenced; no overlapping merge before each branch's exact-head checks complete.
- Test status at commit creation: implementation and focused tests are present; exact-head CI/P2 checks pending. No browser or production behavior is claimed from component tests.
- No direct `main` writes, production writes, reset/clean/force-push, or test/demo production data.
