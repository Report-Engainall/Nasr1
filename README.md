# متجر الأغبري | Aghbari Commerce — Nasr1

This is the canonical, size-optimized application branch for the existing Nasr1 project. The active branch is `main`, intended to be imported and natively connected to Bolt through the existing GitHub repository.

## Current structure
- Retains the active React/Vite/TanStack application source, runtime assets, package manifests, Supabase client/types/configuration, and Edge Function source.
- Excludes historical reference copies, duplicate source snapshots, test-only files, E2E fixtures, CI workflows, local verification scripts, operational reports, and already-applied SQL migration history from the active import tree.
- The complete original repository snapshot, including all excluded files and migration history, is preserved without deletion in `nasr1-reference-archive-2026-11-08`.

## Full historical archive
- Archive branch: [nasr1-reference-archive-2026-11-08](https://github.com/Report-Engainall/Nasr1/tree/nasr1-reference-archive-2026-11-08)
- Original preserved commit: `b1c433dba9fa8edbb28639976aadc40106d7688b`
- Original snapshot: 1,399 files, 23,059,921 bytes.
- The archive includes the full `docs/`, `scripts/`, `e2e/`, `.github/`, `ops/`, test-only `src/` files, and all `supabase/migrations/`.
- Use the archive as a read-only source for historical specifications, migration review, and retrieving tests. Do not merge the entire archive into `main`.

## Existing Supabase backend
- Project: `aghbari-commerce-nasr1`
- Ref: `tfdwtuwkdddnzgyhcoyy`
- URL: `https://tfdwtuwkdddnzgyhcoyy.supabase.co`
- Configure `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` in the Bolt environment.
- Do not create, reset, recreate, seed, or migrate a new database. Do not replay historical migrations.

## Local development
```sh
bun install --frozen-lockfile
bun run dev
```

Build:
```sh
bun run build
```

The active branch is deliberately kept small for the Bolt repository import ceiling. Do not add reference archives, duplicate code trees, reports, or test-only fixtures to `main` unless they are essential to the running application and the resulting import size is verified.
