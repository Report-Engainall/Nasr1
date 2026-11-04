# ChatGPT Session Resume Brief — Aghbari Commerce — 2026-11-05

Paste this message into a new ChatGPT session to resume without repeating the history.

## Role and operating rules

Act as the implementation lead for **متجر الأغبري | Aghbari Commerce**. Continue execution, not generic analysis. Do not ask the user to restate known facts. Before any work, fetch the live `main` SHA and inspect the single current execution checkpoint. Use only the canonical repository and `main`; do not create feature branches or alternate repositories. Do not claim PASS without exact-SHA evidence. Record every verified batch in the existing checkpoint, canonical acceptance matrix and execution log.

## Canonical project

- Repository: `https://github.com/Report-Engainall/Nasr1`
- Branch: `main` only.
- Last verified main SHA before the two documentation-only handoff records: `a15b4751920c0678fbe8edb7c9a6b545206cf8b2`.
- Bolt archive supplied by the user: `project-bolt-github-8ccbjvhg (2).zip`, captured 2026-11-04; 1,119 files; no `.git` metadata.
- Archive checkpoint tested code SHA: `3f33dba1d1879fc1426a2428e331b496c6241dae`.
- GitHub comparison from archive checkpoint to then-current main returned `ahead_by=46`, `behind_by=0`; archive checkpoint is an ancestor of main.

## Completed archive reconciliation — do not repeat

Read this repository record first:
`docs/bolt-source-reconciliation/BOLT_ARCHIVE_RECONCILIATION_2026-11-05.md`

The important Bolt-created customer return-review Excel feature is already present in current `main` byte-for-byte. Exact matching file blobs:

- `src/lib/customer-return-review-xlsx.ts` — `aff96f9c1b4c503d42af0c7d0922a18f7e412e7d`
- `src/lib/customer-return-review-xlsx.test.ts` — `1d21f7d4466fb0d3106d8bc9fd5908ccc6c5fb52`
- `src/components/CustomerReturnReviewQueue.tsx` — `d6e0a82d9de87aa36fc0afd41ae6f87a9ba42815`
- `src/test/customer-return-review-queue.test.tsx` — `3c8e57a31781900f68ba9b4e7ffd7e4f1ecb2218`

Do not re-add or recreate these files. Current `main` also includes later acceptance work absent from the old archive, including the production backup/restore workflow and purchase-order/stock-count XLSX E2E tests. Never overwrite newer `main` files with the old archive versions.

The archive-only `.env` contains environment values and must never be committed or printed. `index.html`, `package-lock.json`, `tsconfig.tsbuildinfo` and the older `supabase/config.toml` are not safe to copy blindly. Canonical repository uses `bun.lock`.

## User's non-negotiable architecture decision

The user does not want **anything operationally dependent on Lovable**. Do not ask for Lovable account access, Lovable Cloud setup, Lovable credentials, Lovable preview storage, or Lovable integrations.

Target: use **Bolt Cloud's built-in database and its native authentication, storage and server functions** within the existing imported project. Bolt's official docs say every project can have a built-in database with authentication, file storage, server functions, logs and security audit. Verify actual capabilities in the project's Bolt workspace before writing adapters.

This is a backend migration only, not a new app build. Preserve completely:

- Customer storefront and every existing screen.
- Admin dashboard and every existing screen.
- Route tree, components, UI, CSS, design and RTL behavior.
- Business rules, tests, all original SQL migrations and acceptance evidence.
- Product pricing privacy, tenant isolation, role/permission boundaries, inventory and accounting invariants, idempotency and audit history.

Replace only Lovable-specific runtime/build/backend integration and the database/service adapter as required. Do not rewrite the UI or recreate the product. Do not drop SQL/RPC/Edge behavior just because Bolt uses a different integration surface.

## Lovable dependencies identified in canonical source — remove safely, not blindly

- `vite.config.ts` imports `@lovable.dev/vite-tanstack-config`.
- `package.json` includes `@lovable.dev/vite-tanstack-config`.
- `src/lib/lovable-error-reporting.ts` forwards errors to Lovable editor telemetry; `src/routes/__root.tsx` imports it.
- `src/integrations/supabase/client.ts`, `client.server.ts`, `auth-middleware.ts`, `previewAuthStorage.ts` have Lovable-specific bootstrapping/preview auth behavior.
- `src/lib/auth.tsx` and `src/test/auth-bootstrap.test.tsx` show the obsolete “Connect Supabase in Lovable Cloud” message.

Replace the Vite/TanStack setup with a supported non-Lovable configuration; replace error telemetry with a neutral/Bolt-compatible implementation; remove Lovable preview session brokering; redesign auth initialization for Bolt's native auth. Update messages and affected tests. Keep `@supabase/supabase-js` only if Bolt's actual generated database integration requires it; do not assume SDK compatibility without proof.

## Safe backend migration order

1. Import/continue the latest canonical `main` in the new Bolt account; verify SHA and package manager.
2. Inspect Bolt built-in database capabilities for SQL/Postgres features, authentication, session lifecycle, storage, server functions, transactional operations, RLS/policies, logs and secrets.
3. Build a complete inventory mapping each existing table, migration, RPC, trigger, RLS policy, Edge Function, auth flow and storage bucket to its Bolt-native target.
4. Create a reversible target schema from the existing migrations in the new Bolt database; do not delete original migrations.
5. Preserve backend transaction boundaries, tenant scoping, role checks, pricing privacy, idempotency, accounting and inventory invariants.
6. Port one vertical slice at a time (auth/session, catalog/customer read, admin catalog write, cart/checkout, inventory, finance, imports/exports, async functions/storage). Keep UI untouched except for the adapter integration.
7. Test every migrated slice against real Bolt Database reads/writes and unauthorized requests before moving on.
8. Migrate old records only if a verified export/backup exists. A schema migration does not migrate customers, orders, balances, auth users or storage objects. Never claim data migration without restore verification.
9. Remove old provider code only after the Bolt-native replacement passes; verify there are no remaining Lovable runtime/build references.
10. Re-run only tests affected by changed backend paths; bind every result to the exact code SHA.

No external Supabase connection or Lovable service is permitted as a substitute. Do not use “Connect Supabase” in Bolt; the required target is its built-in database. Do not overwrite an existing database connection or create a competing project without checking the project's state and preserving data.

## Current project execution pointer

The last inspected `docs/bolt-source-reconciliation/CURRENT_EXECUTION_STATE.md` checkpoint (2026-11-03) recorded:

- Exact tested runtime code SHA: `821135ab4c59c890435b8988347b72bf76d69272`.
- Core: 271/271 test files and 1,784/1,784 unit tests passed on that SHA.
- P2 local Supabase/PostgreSQL 17 + Chromium passed the listed authenticated local acceptance scopes on that SHA.
- Hosted customer/order/tenant P2 was SKIPPED, not PASS.
- Release status: NO-GO; production database backup/restore and live/hosted gates remain unverified.
- Historical next action ID: `DLV-011-CUSTOMER-MULTI-INVOICE-RECEIPT-PRINT-001`.

This next-action pointer may have been superseded. Always fetch the latest `CURRENT_EXECUTION_STATE.md` from the live `main` first and use its current next action. Do not transfer old test passes to a newer SHA.

## Required behavior on every resume

- Start by reporting the live `main` SHA and the active `NEXT_ACTION_ID` from the checkpoint.
- Read the archive reconciliation note; do not repeat archive comparison.
- Work on one coherent implementation batch, make the actual code change, test affected paths, and verify the result.
- Update `CURRENT_EXECUTION_STATE.md`, `REMAINING_SCREEN_ACCEPTANCE_MATRIX_2026-10-22.csv` and `EXECUTION_LOG.md` only with evidence-backed status.
- Do not spend tokens on repeated summaries, plans, redundant builds, or old successful tests.
- Do not claim completion while a required gate is SKIPPED, UNKNOWN, PARTIAL or untested.
- If session time runs out, leave a precise next-action pointer with current SHA, changed files, tests run/results and blockers.