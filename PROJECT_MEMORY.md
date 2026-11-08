# PROJECT MEMORY — متجر الأغبري | Aghbari Commerce (Nasr1)

## Canonical source
- Repository: https://github.com/Report-Engainall/Nasr1
- Active branch: `main`
- Product: Aghbari Commerce / متجر الأغبري.
- The active `main` tree is size-optimized for native Bolt import and synchronization.
- Full pre-optimization snapshot, historical docs, tests, CI workflows, scripts, old source snapshots, and all 271 SQL migrations are preserved in branch `nasr1-reference-archive-2026-11-08` at original commit `b1c433dba9fa8edbb28639976aadc40106d7688b`.
- Archive index: `ARCHIVE_INDEX.md`. Do not merge the full archive into `main`; retrieve only a needed reference or test.

## Existing backend
- Supabase project: `aghbari-commerce-nasr1`
- Project ref: `tfdwtuwkdddnzgyhcoyy`
- URL: `https://tfdwtuwkdddnzgyhcoyy.supabase.co`
- Use this existing project only. Do not create/reset/reseed a database or replay historical migrations.
- The applied SQL migration source is preserved in the archive branch. Before schema changes, review that history and compare against the live migration state.

## Product and security invariants
- B2B commerce; Arabic RTL default with English localization.
- Server-authoritative customer tier pricing, order validation, stock, credit, and financial mutations.
- Never leak cost, margin, another customer's tier price, internal identifiers, or protected financial data through API/RPC, DOM, PWA cache, PDF, XLSX, or exports.
- Enforce tenant isolation and role permissions at server/RLS/RPC boundaries.
- Offline/PWA cache is read-only for financial and inventory operations.
- Preserve immutable audit/history for orders, returns, payments, and accounting.
- Never fabricate invoices, payments, balances, supplier obligations, or business results.

## Working rules
- Continue the existing React/Vite/TanStack application in place; do not rebuild from scratch.
- Keep `main` as the active application and Bolt sync branch. Confirm Bolt's GitHub panel shows `Report-Engainall/Nasr1` and `main` before claiming sync is active.
- No force-push, reset, clean, or overwrite of unsaved work.
- Use `bun install --frozen-lockfile`, `bun run dev`, and `bun run build`.
- This import-sized tree excludes tests and local harnesses. Retrieve them from the archive branch when needed; never report tests as passed unless run.
- Keep paid AI spend at zero; deterministic/local logic first. Do not introduce paid APIs or billing.
- Do not add reference archives, duplicate source snapshots, bulk reports, or test fixtures back into `main` unless essential to runtime and the size impact has been checked.

## Ownership
- P1: product UI and customer/admin workflows.
- P2: database, RPC, RLS, finance, inventory, and integrations.
- P3: intelligence and decision engines.
- Changes to the database require explicit schema review; existing production data must not be reset or reinitialized.
