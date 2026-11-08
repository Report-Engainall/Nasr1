# Bolt import scope (2026-11-08)

This branch is a size-limited import projection of canonical `main` at `b1c433dba9fa8edbb28639976aadc40106d7688b`.

Retained: active application source, PWA assets, runtime configuration, dependency manifests, Supabase client/types/config, and Edge Function source.

Excluded from this branch only: reference/archive documentation, old duplicate source snapshots, test-only source files, local scripts and E2E fixtures, CI workflows, operational status logs, legacy Drizzle artifacts, and the SQL migration history already applied to the existing Supabase database.

Nothing was deleted from canonical `main`. Full migration history, tests, workflows, scripts, docs, archives, and all prior work remain there. Do not interpret their absence here as a request to rebuild or delete those capabilities.

Database target: `aghbari-commerce-nasr1` / `tfdwtuwkdddnzgyhcoyy`.
Do not create/reset/reseed the database or rerun historical migrations.
