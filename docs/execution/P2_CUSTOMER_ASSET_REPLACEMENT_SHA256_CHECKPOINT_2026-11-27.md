# P2 Checkpoint — Customer Asset Atomic Replacement / SHA-256 Replay
Date: 2026-11-27
Repository: `Report-Engainall/Nasr1`
Role: P2 — backend, PostgreSQL, data integrity and tenant authorization
PR: #541 — https://github.com/Report-Engainall/Nasr1/pull/541
Branch: `integrate/customer-asset-atomic-replacement-current-main`

## Resume and synchronization
- Current `main` base: `68148f4ded83ed16bdf7a42dda5fad619c7e76b5`.
- Preserved candidate before sync: `36599856d4083027abf58cb0de95d47e72e5696f`.
- Candidate is a normal two-parent synchronization of current main and the existing branch; no force-push or history rewrite.
- The old unmerged migration timestamp `20261117201000` is not carried forward. The corrected migration is `20261127100000_customer_asset_atomic_replacement_v2.sql`, after current main's latest migration `20261126150000_supplier_invoice_register_server_filters.sql`.
- Existing customer asset registry/history migrations remain unchanged. Existing UI work in `CustomerAssetsPanel.tsx` and its component test is preserved, not rewritten by P2.
- P2 adds the backend migration, local PostgreSQL 17 acceptance, P2 workflow hook and this checkpoint; P1 typecheck includes the retained panel/component test.

## Backend security corrections
1. Reuse existing schema-aware `public.customer_activation_invitation_sha256(text)` backed by pgcrypto; replace weak 32-character MD5 request fingerprint with lowercase 64-character SHA-256.
2. Replacement event trigger now accepts only 64-character lowercase hex fingerprints.
3. Preserve tenant-scoped transaction advisory lock, exact replay, changed-payload SQLSTATE `22023`, old-asset row lock, single transaction for new asset + old status + immutable event + audit, and generic replacement-event guard.
4. Before creating the unique organization/request-key index, run a read-only duplicate-history preflight. If any historical key is duplicated, fail with SQLSTATE `23505`, identify up to five duplicate groups, and state that no history was changed. No delete, merge or event rewrite is attempted.
5. Internal preflight function has no execution grant to PUBLIC, anon or authenticated.

## Exact PostgreSQL 17 acceptance added
- Two simultaneous identical submissions: exactly one `replayed=false`, one `replayed=true`, same `new_asset_id`, one immutable event.
- Two simultaneous submissions with the same key but different serial/payload: exactly one winner and one SQLSTATE `22023`; exactly one linked replacement asset and event, no orphan/duplicate.
- Exercise duplicate-history preflight with temporary duplicate events after dropping the index and disabling user triggers only inside one transaction; assert SQLSTATE `23505`, then rollback the entire transaction and assert the index is restored.
- Retain exact replay, changed-payload rejection, customer-only denial, cross-tenant denial, generic-event bypass denial, asset-pair consistency and immutable-event singularity.
- Test script refuses any Supabase or PostgreSQL endpoint outside loopback local.

## Exact-head evidence required
- Fresh P1 typecheck, local PostgreSQL 17 P2 suite and component tests must complete on the final synchronized head SHA.
- Prior branch runs are historical only; they are not carried forward.
- No hosted/production Supabase writes, deployment or live external system activity.

## Safety and ownership
- No production database writes or deployment.
- No secrets, paid APIs, Vercel, Bolt or Lovable.
- P2 owns the migration, transaction contract, PostgreSQL acceptance and this checkpoint. P1 retains UI behavior and approval; P3 retains integration authority for `main`.
