# P2 ownership lock — ORD-001 order-status write-result confirmation

- Owner: P2.
- Branch: `fix/p2-order-status-write-result-mainline-20261022`.
- Exact base at lock time: `bf06c73226033da8e4f81e24981eb64e6e7fca99`.
- Scope: `src/lib/api.ts` `updateOrderStatus` write-result confirmation and its focused unit test `src/test/order-status-write-result.test.ts`.
- Safety contract: allow only the defined order status values; require PostgREST to return the exact updated order ID through the RLS-granted `id` projection; treat no row, wrong row, unknown status, RLS failure, and illegal DB transition as a failed operation.
- Supersession: PR #46 on `fix/p2-order-status-write-result-20261022` is read-only reference. Do not merge or continue it directly: its base `7ed0f17e4422ab76e0162f730f70fe4c2564c336` is stale relative to current main. Port only the scoped function and test after review.
- Parallel ownership: PR #54 explicitly excludes this order-status path. PR #52 owns `package.json` and `scripts/test-onyx-reconciliation-concurrency.mjs`; do not modify them here. Preserve all unrelated current-main changes in `src/lib/api.ts`.
- Acceptance: exact-head Core CI plus Playwright local order/tenant path when available. Any local Supabase registry throttle is recorded as infrastructure-not-proven, not a product regression.
- No direct writes to main, no force-push/reset/clean, no production writes.
