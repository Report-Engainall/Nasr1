# Nasr1 — permanent repository instructions

Canonical product: متجر الأغبري | Aghbari Commerce.  
Repository: `Report-Engainall/Nasr1`.  
Only development/synchronization branch: `main`.  
Only current execution pointer: `docs/bolt-source-reconciliation/CURRENT_EXECUTION_STATE.md`.  
Only acceptance matrix: `docs/bolt-source-reconciliation/REMAINING_SCREEN_ACCEPTANCE_MATRIX_2026-10-22.csv`.

## Start-of-session protocol

1. Read the first 80 lines of `CURRENT_EXECUTION_STATE.md` and follow its newest reconciled `NEXT_ACTION`. Historical sections below the active checkpoint are evidence history, not current instructions.
2. Fetch the live `main` head once and compare it to the SHA in the active checkpoint. Do not assume an old SHA or previous session is still current.
3. Read the canonical master specification, requirement registry, API-OPS contract register and this file before changing those domains.
4. Inspect actual files and callers before editing. Continue the existing module; do not replace, stub, delete or re-create working screens or business flows.
5. Update the one acceptance matrix and the one execution pointer. Never create parallel checklists, scorecards, status ledgers or resume cursors.

## Source-control and preservation

- `main` is the source of truth. Archive branch `nasr1-reference-archive-2026-11-08` is read-only recovery/reference material. Never merge it wholesale or develop on it.
- Use normal expected-SHA updates. Never force-push, reset, clean, rewrite history, delete unmerged user work or change the backup repository.
- Keep commits narrowly scoped. Verify the exact changed-file list and final `main` SHA.
- Historical requirements, test suites, SQL, CI and source snapshots may be restored selectively only when a current verified gap requires them. Their presence in the archive is not evidence that they should be re-added.
- Do not rely on stale SHA/status claims in recovered documents. Live `main` and the live Supabase ledger are current truth.

## Database and security invariants

- Only Supabase project `aghbari-commerce-nasr1`, ref `tfdwtuwkdddnzgyhcoyy`, URL `https://tfdwtuwkdddnzgyhcoyy.supabase.co` is approved.
- The retired `aghbari-commerce` project, ref `mrcyqezbhpncuvaehwgf`, must never be used. Never create a new Supabase project, Bolt Database or Lovable Cloud.
- Never reset, drop, truncate, seed or broadly reinitialize production. Never replay a migration already present in `supabase_migrations.schema_migrations`.
- Before DDL, compare the live migration ledger and exact archive source; test additive SQL on isolated PostgreSQL 17 first. Preserve RLS, least privilege, tenant scope, immutable audit, idempotency and failure atomicity.
- First-admin provisioning requires owner-approved email/name and a trusted server-only path. Never invent credentials, allow client self-promotion, or place a service-role key in browser variables or Git.
- Client environment variables: `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` (legacy `VITE_SUPABASE_ANON_KEY` only for compatibility). Secrets remain server-only.

## Product invariants

- B2B commerce; Arabic RTL is the default and English localization is supported.
- Prices and customer tiers are server-authoritative. Never expose costs, margins, another tier's price, tenant/warehouse IDs or protected financial data through RPC, API, DOM, PWA cache, exports or documents.
- Authentication, active profile, organization, role and warehouse are server-derived. UI hiding is not an authorization boundary.
- Financial, order and inventory mutations require successful online server confirmation; offline state is a read-only cache or draft.
- Preserve audit/history and existing customer order amendment/return/cancellation, supplier finance, liquidity/reconciliation, replenishment, task/service, Customer 360, Onyx, analytics and export modules. Verify before extending; never rebuild them.
- No fabricated balances, invoices, payments, tax, FX, stock or delivery status.

## Sole execution owner and unified responsibility

- **One programmer only: ChatGPT — P1.** The user has explicitly consolidated all former P1, P2 and P3 responsibilities under ChatGPT. These labels describe technical domains only; they are not separate owners, workers, agents or handoffs.
- ChatGPT owns the complete product lifecycle: customer/admin UI, routes, workflows, client data handling, database schema and migrations, RPC, RLS, tenant authorization, finance, inventory, server integrations, intelligent engines, formulas, evidence-backed decisions, tests, security review, integration, PR reconciliation and safe merge.
- Do not wait for, delegate to, or create parallel assignments for P2/P3/other programmers or external builders. Sequence work by dependency, but retain one accountable implementation path.
- Preserve existing contracts and working modules. Reuse existing engines; never create duplicate engines or rebuild completed features.
- Database, security and finance changes still require exact schema/ledger inspection, additive migrations, isolated PostgreSQL 17 acceptance and tenant/RLS proof. Consolidating ownership does not weaken these technical gates.
- main remains the only source of truth. Preserve existing branches and unmerged work; reconcile overlap before merging. Never delete branches, discard user work, force-push or rewrite history.
- No task is complete because a file or screen exists. Complete a vertical slice from route/UI through service, data contract, authorization and appropriate tests; repair failures before advancing.
- A blocker on one integration must not stop independent implementation. Record the exact blocker in the single execution pointer, continue other eligible work, then return to it.
- Reports are delivery evidence, not the work itself. Do not repeat repository-wide discovery or produce status-only updates when an actionable change is available.


## Tooling and quota-protection policy — mandatory for every programmer/agent

- **Bolt New is permanently prohibited.** Do not open it, sync to it, connect it, use its database/auth/storage/functions, or plan a later migration/rebuild there. Do not use Lovable or Lovable Cloud as a substitute.
- **GitHub is the default and required engineering workspace** for this project: inspect and edit source, commit changes, review diffs, track issues, and use GitHub Actions for source-level CI where appropriate.
- **Do not use Vercel as a coding, editing, build, test, review, or agent-execution workspace.** Do not invoke Vercel CLI, Vercel build/deploy/preview operations, remote sandboxes, or deployment agents for routine implementation or verification.
- **Do not spend Vercel build/deployment quota or credits** for source checks, linting, tests, typechecking, builds, or code review. Prefer GitHub repository operations and the repository's GitHub Actions workflows; use local/free checks when available.
- Vercel remains a hosting target only. Deploy, promote, roll back, or change Vercel project settings **only when the owner explicitly authorizes that specific hosting operation**. A GitHub commit or successful CI run is not deployment approval.
- Accessing an already-published URL for read-only diagnosis does not authorize a Vercel deployment or project mutation.
- This rule applies to ChatGPT, other AI coding agents, human programmers, and future sessions. Do not ask the owner to repeat it. If a requested operation genuinely requires Vercel resources, stop before consuming quota and obtain explicit owner approval.
- GitHub Actions usage must still respect the available GitHub quota. Do not trigger redundant or broad workflows; choose the smallest relevant workflow and report what actually ran.

## Cost, testing and reporting

- Keep paid AI spend at zero. Use deterministic/local processing or authorized free quotas only; never add paid fallback or auto-recharge.
- A test passes only when the exact relevant suite was actually executed on the exact SHA. Distinguish authored tests, source review, isolated PostgreSQL acceptance, live production checks, browser E2E and hosted integration evidence.
- Before completion, verify final SHA, changed files, database effects and which tests actually ran. Record unapplied migrations and external prerequisites.
- Do not declare release readiness from source presence, schema-cache load, generic Vercel status or historical CI. Full release requires the canonical release gate and owner sign-off.
