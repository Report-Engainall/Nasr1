# متجر الأغبري | Aghbari Commerce — Nasr1

This is the canonical application and execution branch for the existing Nasr1 project. The active branch is `main`. GitHub is the engineering source of truth; Bolt New and Lovable are not part of the workflow.

## Canonical source and execution documents
- Master specification: `docs/canonical/AGHBARI-MASTER-PROJECT-SPECIFICATION.md`.
- Sole execution pointer: `docs/bolt-source-reconciliation/CURRENT_EXECUTION_STATE.md`.
- Sole acceptance matrix: `docs/bolt-source-reconciliation/REMAINING_SCREEN_ACCEPTANCE_MATRIX_2026-10-22.csv`.
- Do not create parallel requirement matrices or rebuild the application from scratch.

## Active application tree
- Retains the React/Vite/TanStack application, runtime assets, package manifests, Supabase client/types/configuration, and Edge Function source.
- The canonical execution documents above are retained on `main` so P1/P2/P3 and every coding agent share one acceptance contract.
- Historical tests, E2E fixtures, CI workflows, local scripts, prior source snapshots, and all 271 SQL migration source files remain preserved in `nasr1-reference-archive-2026-11-08`. Retrieve only the necessary tests or migration references; do not merge the archive wholesale.

## Historical archive
- Archive branch: https://github.com/Report-Engainall/Nasr1/tree/nasr1-reference-archive-2026-11-08
- Preserved original commit: `b1c433dba9fa8edbb28639976aadc40106d7688b`.
- Original snapshot: 1,399 files / 23,059,921 bytes.

## Existing Supabase backend — do not recreate
- The production/runtime Supabase project ref and URL are **not yet verified** against the effective configuration of the running application.
- Do not assume a Supabase project by its name, prior documentation, or account visibility. Confirm the effective runtime `VITE_SUPABASE_URL` first; compare its project ref with Supabase metadata.
- Until that identity is confirmed, use isolated local PostgreSQL 17/Supabase for database acceptance only. No remote SQL, migration, Edge deployment, production write or reset.
- Keep `VITE_SUPABASE_PUBLISHABLE_KEY` public only as intended; all service-role and provider secrets remain server-side.

## Local development
```sh
bun install --frozen-lockfile
bun run dev
```

Build:
```sh
bun run build
```

Keep `main` within the verified Bolt import ceiling. Do not add bulk archives, duplicate source trees, or unrelated reports. Restore only high-value execution context and focused tests, checking the size impact before each addition.