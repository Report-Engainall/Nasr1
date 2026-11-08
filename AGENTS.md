# Nasr1 — Bolt import workspace

This branch is a temporary, reduced import projection derived from canonical `main` at commit b1c433dba9fa8edbb28639976aadc40106d7688b.
The full product source of truth remains `main`. Do not treat files excluded from this import projection as deleted product work.

## Product and database
- Product: Aghbari Commerce (متجر الأغبري).
- Existing Supabase project: `aghbari-commerce-nasr1`.
- Project ref: `tfdwtuwkdddnzgyhcoyy`.
- URL: `https://tfdwtuwkdddnzgyhcoyy.supabase.co`.
- Use the existing Supabase project only. Do not use Bolt Database or Lovable Cloud.
- Do not reset, recreate, drop, truncate, or seed the database. Do not re-run existing migrations.
- Frontend environment: `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY`.
- Never put service-role keys or server secrets in client variables or source files.
- Existing Edge Function sources remain in `supabase/functions`; their presence does not mean they are deployed.

## Import projection boundaries
Only non-runtime materials were omitted from this temporary import branch: historical/reference documentation, recovery archives, test-only files and harnesses, CI workflows, database migration source files already applied to the existing Supabase project, and local verification scripts.
All omitted files remain available unchanged on canonical `main`.
Do not attempt to regenerate missing tests, docs, migration history, or legacy snapshots inside this branch. For any schema change, stop and compare against the canonical `main` migration history and live Supabase project first.

## Development
- Preserve the existing React/Vite/TanStack Start application and its component/service structure.
- Make targeted repairs in place; do not rebuild the app or replace working screens.
- Use `bun install --frozen-lockfile`, `bun run dev`, and `bun run build`.
- This import branch intentionally omits the full test suite, so a successful preview/build is not a full acceptance result.
- Do not claim database, Edge Function, authentication, or production acceptance without actually testing the corresponding environment.
