# P2 Checkpoint — Customer Asset Atomic Replacement / SHA-256 Replay
Date: 2026-11-27
Repository: `Report-Engainall/Nasr1`
Role: P2 — backend, PostgreSQL, data integrity and tenant authorization
PR: #541
Branch: `integrate/customer-asset-atomic-replacement-current-main-20261117`

## Resume and synchronization
- Latest main synchronized: `90597e5ba0071bc82cdde14174035b49f3399b51`.
- Previous candidate before this sync: `5d5aae1bd9dbe1bf84ca91412640f9c760810c2d`; it already contained the corrected v2 migration, concurrent PG17 tests and prior main synchronization.
- The eight intervening main commits touch P1 supplier-performance/task-review panels and P1 workflow only; no overlap with this PR's backend migration, P2 workflow hook or component files. They are preserved as the new first parent.
- Corrected migration remains `20261127100000_customer_asset_atomic_replacement_v2.sql`, after main's latest migration `20261126150000_supplier_invoice_register_server_filters.sql`. The obsolete unmerged `20261117201000` migration is not reintroduced.
- Existing customer asset registry/history migrations remain unchanged. Existing UI component and component test remain preserved. P2 scope is the new backend migration, PG17 test, P2 workflow hook and checkpoint; strict typecheck includes the P1 panel files.

## Backend corrections
1. SHA-256 via existing schema-aware `public.customer_activation_invitation_sha256(text)`; MD5/32-hex request fingerprint is removed and the event guard requires 64 lowercase hex characters.
2. Before unique index creation, a read-only historical duplicate-key preflight raises SQLSTATE `23505`, reports up to five duplicate groups and explicitly confirms no history is rewritten.
3. Internal preflight helper is not executable by PUBLIC, anon or authenticated.
4. Existing tenant-scoped advisory lock, exact replay, changed-payload `22023`, old-asset row lock, atomic new asset + status + immutable event + audit, and generic-event denial are preserved.

## PG17 tests added
- Two parallel identical requests: exactly one new commit and one replay, same asset ID and one event.
- Two parallel changed-payload requests with same request key: one success, one `22023`, exactly one replacement asset/event and no orphan.
- Exercise the migration duplicate-history preflight in a local transaction with temporary trigger-disabled fixtures; expect `23505`, roll back, and prove the unique index is restored.
- Retain customer-role denial, cross-tenant denial, direct-event bypass denial, atomic pair consistency and immutable history.
- Script refuses any database endpoint that is not loopback local.

## Exact-head acceptance
Fresh P1, P2 local Supabase and PostgreSQL 17 runs must finish on the final synchronized head SHA. Results from prior heads are historical, not inherited. No hosted database or production writes.

## Ownership
P2 owns the transaction contract, migration, test and checkpoint. P1 owns component behavior/review. P3 owns merge to main.
