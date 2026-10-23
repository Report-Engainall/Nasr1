# P2 single approved Bolt archive reconciliation — 2026-10-20

## Executive status

- Target repository (the only write target): [Report-Engainall/Nasr1](https://github.com/Report-Engainall/Nasr1).
- Source repository (read-only): [report-insight-engine / approved recovery directory](https://github.com/Report-Engainall/report-insight-engine/tree/main/incoming-archives/nasr1-bolt-recovery-2026-10-17).
- Exact permitted archive: [project-bolt-github-7sl6ykzz (2).zip](https://github.com/Report-Engainall/report-insight-engine/blob/main/incoming-archives/nasr1-bolt-recovery-2026-10-17/project-bolt-github-7sl6ykzz%20%282%29.zip).
- No alternate Bolt archive was downloaded, opened, hashed, or used for this reconciliation. Historical notes that may exist elsewhere are not sources for this run.
- Target baseline SHA for file-by-file content comparison: `e815d1e01e5190220083e0593b8b9d152fc3783a`.
- Approved archive exact bytes: 1,009,556. Git Blob SHA-1: `4835a0565f799a272dfca0ff49fbc3ce0d760474`. Locally/independently computed SHA-256: `1a692b013da35b4cb034f5b18f8160ec66bca778bc4649bd5128abc7fccb9be1`.
- ZIP validation: 421 entries, 359 files, 3,322,389 bytes uncompressed, CRC test PASS, no duplicate ZIP member paths, no absolute/traversal/symlink paths identified. The source object's Git Blob SHA-1 matched the downloaded bytes. Archive code was not executed.
- Target snapshot archive: 1,688,658 bytes, 505 files, CRC PASS.
- Normalized content comparison of the approved archive only to that exact Nasr1 snapshot: 270 identical paths, 67 changed-content paths, 22 archive-only paths, 168 target-only paths.
- Full 22-path archive-only decision matrix: `P2_SINGLE_ARCHIVE_DECISION_MATRIX_2026-10-20.csv`. Exact archive integrity/comparison summary: `P2_SINGLE_ARCHIVE_MANIFEST_2026-10-20.csv`.

## Decisions and implementation

The archive is a legacy React Router/Vite-shaped source snapshot. Nasr1 is already a TanStack Start/React/TypeScript application with current server RPCs and RLS contracts. Copying legacy pages wholesale would create duplicate/unrouted pages and risk bypassing the active tenant, pricing, and audit boundaries.

| Archive feature family | Nasr1 current target finding | Decision |
|---|---|---|
| AI workspace, executive reports, Customer 360 | Current AI/Admin pages, target-native analytics RPCs and Customer 360 implementation already exist | Reuse current target implementation; do not duplicate old page or SQL |
| Audit and notifications | Active audit and notification routes and restricted server boundaries exist | Reuse target implementation |
| Suppliers and pricing | Active supplier/pricing routes and target pricing contracts exist | Reuse target implementation; do not use stale direct-write pricing contracts |
| Inventory | Stock counts, transfer history/commands, inventory summary and reorder controls exist | Reuse target implementation |
| Storefront assistant | Active `/assistant` route uses account-scoped order/invoice/catalog queries and guarded `ai-gateway` for general guidance | Reuse target implementation |
| Wishlist and compare | Active `/wishlist` and `/compare` routes; bounded, sanitized storefront state already exists | Reuse target implementation |
| Banners | Existing manager/slider for scheduled, audience-scoped storefront announcements, safe links, color and priority | No duplicate `banners` table; richer image-asset support is a separate unresolved UX/storage gap |
| Admin categories | Current storefront category routes are present, but a dedicated admin-category route and verified server-side write contract were not proven in this audit | Do not transplant the archive's legacy helper; keep as an explicit gap and next native task |
| Archive environment file, privileged-role SQL, password SQL | Secrets/credential mutation/privilege escalation | Excluded; never copied, logged, or executed |
| Old HTML/package lock/cache and broad CSS | Incompatible entrypoint/lockfile, build artifact, or style overwrite risk | Excluded |

The archive SQL files ending in `.sql.sql` were not applied. The admin-role grant and admin-password mutation were explicitly rejected on security grounds. The archive's analytics/customer-360 SQL would duplicate target-native behavior; the old storefront pricing RPC is not substituted for the current server-price authority.

## Original-spec continuation delivered in this branch

A target-native return/RMA intake and decision loop was added because it is a real operational gap and could be implemented without copying incompatible archive code or changing protected P1 files:

- `supabase/migrations/20261020050000_customer_return_requests.sql`: tenant-scoped return requests and lines; RLS; direct client writes revoked; authenticated customer-owned RPCs; delivered-order and order-item ownership checks; requested-vs-approved quantities; maximum three decimal places; remaining-quantity enforcement; idempotency/replay conflict handling; audit events; manager/admin-only review queue and decision; operational task creation.
- `src/lib/customer-returns.ts`: strict typed parsing, quantity checks and idempotency key support.
- `src/components/CustomerReturnRequest.tsx`: customer-facing RTL form and request history inside the existing order-details page.
- `src/components/CustomerReturnReviewQueue.tsx`: manager/admin RTL review queue inside the existing task center.
- `src/components/CustomerOrders.tsx` and `src/components/TaskCenter.tsx`: integration into active screens without changing the shared app shell or generated route tree.
- `src/test/customer-returns.test.ts` and `scripts/test-customer-returns.mjs`: unit/isolated PostgreSQL acceptance added; `npm run test:db` invokes the new acceptance after the pre-existing database suite.
- Approved/rejected request decisions do **not** post an inventory movement, credit memo, invoice mutation, or refund. Approval creates a warehouse receipt/inspection task. Inventory and accounting must be handled after physical receipt, with their own authorized transactions.

## Evidence status

- Archive SHA-256/ZIP CRC/content comparison: PASS for the exact approved archive and target SHA stated above.
- The current branch's code and database behavior are not marked complete until the exact branch-head GitHub Actions workflow passes. See the linked P2 report and exact-head CI/PR evidence there.
- Production database migration, live-tenant mutation, authenticated browser E2E and deployment proof: NOT RUN.
- Next task after return-intake acceptance: `NASR1-ORIGINAL-SPEC-RETURNS-RECEIPT-POSTING-002` (physical receipt, inventory movement, credit memo/ledger link, role boundaries and idempotent regression tests). The category-administration gap should then be scheduled as its own routed, tenant-secured task; it must not be implemented by copying the legacy page.
