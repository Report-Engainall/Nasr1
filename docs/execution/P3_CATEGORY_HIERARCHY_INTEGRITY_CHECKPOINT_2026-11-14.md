# P3 CHECKPOINT — CATEGORY HIERARCHY SERVER INTEGRITY — 2026-11-14

- Repository: `Report-Engainall/Nasr1`; integration target: `main`.
- Base `main` SHA when this work was isolated: `43c01bd3408ffbb6579e4d6bdd3ca9a80101b877`.
- P3 branch: `p3/catalog-category-server-integrity-20261114`.
- P3 PR: #474 — draft was marked ready for review; it remains unmerged.
- Latest code-bearing SHA before this checkpoint document: `c2784884d97fe77822f70e2348332dd2ac0cf7eb`.
- Exact-SHA P1/P2 for the latest code-bearing SHA: **PENDING**. CI had started on the prior head `267fc4405111449e88a391ca55cfd38015948020`; those results must not be copied to the newer SHA. This documentation commit is intended to trigger a fresh exact-head run.

## Implementation

- Added `supabase/migrations/20261114140000_admin_catalog_category_hierarchy_integrity.sql`.
  - Replaces the existing `create_admin_catalog_category`, `save_admin_catalog_product`, and `archive_admin_catalog_category` functions only; no new RPC, table, role, grant, policy, or schema object is introduced.
  - Child creation locks the active tenant-local parent row with `FOR SHARE`.
  - Product creation/category reassignment locks the active tenant-local category row with `FOR SHARE`.
  - Both locks conflict with the archive command's `FOR UPDATE` lock; `FOR KEY SHARE` was explicitly rejected because it is compatible with non-key updates to `is_active`.
  - Category archival traverses all descendants tenant-locally using a recursive `UNION` (cycle-safe deduplication). It blocks on any active descendant category or active product assigned to the root or any descendant, including an already archived descendant.
  - Successful archive changes only category `is_active` and retains the existing audit event. Product rows are never deleted, reassigned, or modified.
- Added `scripts/test-admin-catalog-category-hierarchy.mjs`.
  - Refuses any non-loopback Supabase/PostgreSQL endpoint.
  - Uses the ephemeral authenticated manager and customer sessions seeded by the existing P2 local runner.
  - Covers direct child, grandchild below an archived child, active product on archived descendant, successful archive with inactive product row preservation, cross-tenant denial, customer role denial, cyclic parent rows, create-vs-archive race, and product-save-vs-archive race.
  - Race tests now inspect `pg_stat_activity.wait_event_type='Lock'` and require the independent writer to be blocked before archive commits; a timed delay alone is not accepted as proof.
- Updated `.github/workflows/p2-playwright-critical-paths.yml` to invoke this acceptance script immediately after ephemeral local fixtures are created and before other independent SQL/browser suites.

## Safety and proof boundary

- No hosted Supabase migration, production data write, live Edge function, paid provider, payment/billing action, Vercel build, or deployment was used.
- No table or product/category data was changed in a hosted environment.
- P2 category UI PR #470 remains separate and unmerged; it contains only the category component and its component test.
- Existing P2 UI SHA `283ab7359dbe1533975a175104b4197e9f1a5e2f` passed its P1 workflow (117 files / 825 tests, strict TypeScript, production build) and its public read-only browser smoke (19/19). Its full P2 workflow ended **FAILURE** at the unrelated AI prompt-governance acceptance step 38 (`scripts/test-ai-prompt-governance.mjs`: legacy scalar `provider_attempts` fixture assertion). This failure is not category acceptance and must not be reported as a category failure or silently promoted to PASS.
- This P3 category server migration remains **IN_PROGRESS / NOT ACCEPTED** until its own newest SHA has exact P1 and P2 results, including the new local PostgreSQL 17 category acceptance step. A successful earlier SHA is not evidence for this head.
- Product-wide production readiness remains **NO-GO**.

## Next actions

1. Verify GitHub Actions has checked out the exact SHA produced with this checkpoint.
2. Inspect the P1 Vitest, strict TypeScript, and production-build result.
3. Inspect the P2 local PostgreSQL 17 job log for the explicit `PASS category hierarchy PostgreSQL 17 acceptance` line; record each assertion's result, then inspect any unrelated later workflow failures separately.
4. Fix any confirmed defects on the current branch and rerun exact-SHA P1/P2. Do not merge #474 or #470 until P3's integration decision is made.
