# Bolt Archive Reconciliation — 2026-11-05

## Canonical state checked
- Repository: `Report-Engainall/Nasr1`; branch: `main`.
- HEAD before this documentation-only record: `a15b4751920c0678fbe8edb7c9a6b545206cf8b2`.
- Supplied archive: `project-bolt-github-8ccbjvhg (2).zip`; 1,119 files; no `.git` metadata.
- Archive checkpoint tested code SHA: `3f33dba1d1879fc1426a2428e331b496c6241dae`.
- GitHub compare from archive checkpoint to checked `main`: `ahead`, 46 commits ahead, 0 behind. The checkpoint is an ancestor of current `main`.

## Proof: Bolt return-review XLSX work already exists byte-for-byte in main
| File | Exact Git blob SHA | Result |
|---|---|---|
| `src/lib/customer-return-review-xlsx.ts` | `aff96f9c1b4c503d42af0c7d0922a18f7e412e7d` | Already in main |
| `src/lib/customer-return-review-xlsx.test.ts` | `1d21f7d4466fb0d3106d8bc9fd5908ccc6c5fb52` | Already in main |
| `src/components/CustomerReturnReviewQueue.tsx` | `d6e0a82d9de87aa36fc0afd41ae6f87a9ba42815` | Already in main |
| `src/test/customer-return-review-queue.test.tsx` | `3c8e57a31781900f68ba9b4e7ffd7e4f1ecb2218` | Already in main |

Do not re-add or recreate this feature.

## Newer work already in main; do not overwrite from the older archive
- `.github/workflows/production-db-backup-restore-rehearsal.yml`.
- `e2e/purchase-orders-xlsx.spec.ts`.
- `e2e/stock-count-xlsx.spec.ts`.
- Later updates to `CURRENT_EXECUTION_STATE.md`, `EXECUTION_LOG.md`, the canonical acceptance matrix, Playwright workflow, seed script and finance acceptance tests.

## Archive-only / unsafe-to-copy items
- `.env`: contains environment variable values; never commit, print or expose it.
- `index.html`: workspace-era entry file; verify necessity before considering it.
- `package-lock.json`: archive has an npm lockfile, while canonical repo uses `bun.lock`; do not replace the canonical lockfile.
- `tsconfig.tsbuildinfo`: generated artifact; do not commit.
- `supabase/config.toml`: archive copy has an older/different project reference and settings; do not overwrite current main.

## Lovable coupling still present in canonical code (not yet removed)
- `vite.config.ts` imports `@lovable.dev/vite-tanstack-config`; `package.json` includes that package.
- `src/lib/lovable-error-reporting.ts` sends errors to Lovable editor telemetry; `src/routes/__root.tsx` imports it.
- `src/integrations/supabase/client.ts`, `client.server.ts`, `auth-middleware.ts` and `previewAuthStorage.ts` contain Lovable-specific bootstrap/preview behavior.
- `src/lib/auth.tsx` and `src/test/auth-bootstrap.test.tsx` still mention Lovable Cloud in the missing-environment-variable message.
- Do not blindly delete these. Replace build integration, error telemetry, auth bootstrap and preview storage with Bolt-native equivalents, then test affected paths.

## Backend migration decision
The target is Bolt built-in Database/auth/storage/server functions only; no operational Lovable dependency. The application uses PostgreSQL/Supabase concepts: SQL migrations, RPC, auth, storage and Edge Functions. This is a backend migration, not a UI rebuild.

Preserve all existing customer/admin screens, route tree, components, styling, business rules, tests and original SQL migrations. Inspect Bolt's actual capabilities, migrate schema in a staged/reversible manner, preserve RLS/tenant isolation, pricing privacy, idempotency, atomic accounting/inventory operations and audit trails. Do not claim old user/order data has moved unless a verified export/backup is restored. Do not remove old adapters/migrations until the Bolt-native replacement passes integration tests.

## Conclusion and next actions
1. The archive checkpoint is already an ancestor of current `main`.
2. The identified return-review XLSX feature and its tests are already in `main` byte-for-byte.
3. The archive is older than current `main`; do not import it over the repository or repeat the old sync/fix cycle.
4. No application source was changed by this audit. This record is documentation only.
5. At the next session, verify live `main` SHA, import the canonical repository into the new Bolt account, preserve its newer files, then decouple Lovable-specific build/auth/telemetry code and migrate the backend to Bolt Database without rebuilding the UI.
6. Resume from the live `CURRENT_EXECUTION_STATE.md` and canonical acceptance matrix, not the archive's stale next-action pointer.

## Audit boundary
This audit verified commit ancestry and exact blob equality for the four return-review files above, and inspected relevant archive-only files and Lovable references. It did not claim a byte-for-byte comparison of every archive entry, nor run a new build, browser preview, database migration or deployment.