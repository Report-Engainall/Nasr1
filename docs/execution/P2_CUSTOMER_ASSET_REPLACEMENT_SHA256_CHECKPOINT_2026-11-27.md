# P2 Checkpoint — Customer Asset Atomic Replacement / SHA-256 Replay
Date: 2026-11-27
Repository: `Report-Engainall/Nasr1`
Role: P2 — backend, PostgreSQL, data integrity and tenant authorization
PR: #541
Branch: `integrate/customer-asset-atomic-replacement-current-main-20261117`

## Resume and synchronization
- Latest `main` synchronized: `8144c30ae47977be053c06ea8bb512a2d0cbe9dc`.
- Previous candidate: `5216d41e2d7d36575e390eb9461aaea77df414b7`.
- One intervening P3 commit updates only `docs/bolt-source-reconciliation/CURRENT_EXECUTION_STATE.md` and `REMAINING_SCREEN_ACCEPTANCE_MATRIX_2026-10-22.csv`; both retained. No source/test/workflow overlap.
- Corrected migration is `20261127100000_customer_asset_atomic_replacement_v2.sql`; obsolete unmerged `20261117201000` not reintroduced.
- Original customer asset UI and component test remain preserved. P2 scope remains migration, PG17 acceptance, P2 workflow hook and checkpoint; P1 typecheck includes existing UI files.

## Backend corrections
1. Reuse existing schema-aware `public.customer_activation_invitation_sha256(text)`; replace MD5/32-hex fingerprint with SHA-256/64 lowercase hex.
2. Read-only duplicate-history preflight before unique index creation; SQLSTATE `23505`, identifies up to five duplicate tenant/request groups, says no immutable history changed.
3. Internal preflight function not executable by PUBLIC, anon or authenticated.
4. Preserve tenant-scoped advisory lock, exact replay, changed-payload `22023`, old-asset row lock, atomic new asset + old status + immutable event + audit, and generic-event bypass denial.

## PostgreSQL 17 acceptance
- Concurrent identical requests: exactly one new replacement and one replay, same new asset ID and one event.
- Concurrent same key/different payload: one success, one `22023`, exactly one linked replacement asset/event; no orphan.
- Exercise duplicate-history preflight with temporary events within one transaction, assert `23505`, roll back and prove index restored.
- Preserve customer-only denial, cross-tenant denial, direct event bypass denial and immutable history.
- Test script refuses any non-loopback DB endpoint.

## Exact-head evidence
Latest #541 head is not yet certified. Fresh P1, P2 local Supabase, storefront PG17 and shopping-list PG17 checks must finish on the exact head; prior-head results do not carry forward. Hosted E2E job SKIPPED is not PASS.

## Ownership and safety
P2 owns backend transaction, migration, acceptance test and checkpoint. P1 owns UI behavior/review. P3 owns main integration/status. No production or hosted writes, deployment, secrets, paid APIs, Vercel, Bolt or Lovable.
