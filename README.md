# متجر الأغبري | Aghbari Commerce

This is the **Bolt import workspace** for the existing Nasr1 application. The full repository, historical references, tests, and complete Supabase migration history remain unchanged on the canonical `main` branch.

## Existing backend
- Supabase project: `aghbari-commerce-nasr1`
- Project ref: `tfdwtuwkdddnzgyhcoyy`
- URL: `https://tfdwtuwkdddnzgyhcoyy.supabase.co`

Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` in the Bolt environment. Use only the existing Supabase project. Do not create a Bolt/Lovable database, reset the database, or replay migrations.

## Run
```sh
bun install --frozen-lockfile
bun run dev
```

Build with `bun run build`.

This branch retains the application source, assets, Supabase client/configuration, and Edge Function source. It omits historical documentation, test-only files, CI/local test scripts, and already-applied migration SQL **only for the initial Bolt import size limit**. Those files have not been deleted from canonical `main`.

After import, keep `main` as the source of truth. Treat this branch as an import workspace; reconcile code changes back to `main` without deleting its migration history or canonical references.
