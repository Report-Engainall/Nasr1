# Nasr1 — permanent repository instructions

Canonical product: متجر الأغبري | Aghbari Commerce.  
Repository: `Report-Engainall/Nasr1`.  
Only development/synchronization branch: `main`.  
Only current execution pointer: `docs/bolt-source-reconciliation/CURRENT_EXECUTION_STATE.md`.  
Only acceptance matrix: `docs/bolt-source-reconciliation/REMAINING_SCREEN_ACCEPTANCE_MATRIX_2026-10-22.csv`.

## Start-of-session protocol — one pass, then execution

1. Read the first 100 lines of `docs/bolt-source-reconciliation/CURRENT_EXECUTION_STATE.md` and execute the newest owner-specific action. Older content is historical evidence, not a checklist to repeat.
2. Fetch the live `main` head once. Record it; do not repeat repository discovery in the same launch unless the ref changes or a concrete conflict requires it.
3. Read only the files, callers and contracts owned by the selected task. Do not reread the full specification, requirement registry, API-OPS register or repository when they are not affected.
4. Inspect the target flow and begin editing immediately. Preserve accepted work; extend the existing implementation rather than replacing it.
5. Update only the directly affected acceptance row and the top execution checkpoint when an outcome, blocker or next action actually changes. Never create parallel plans, status ledgers or resume files.

**Hard limit:** repository orientation is an entry step, not a work product. Once the task and owned paths are known, stop inspecting and implement.

## Source-control and preservation

- `main` is the source of truth. Archive branch `nasr1-reference-archive-2026-11-08` is read-only recovery/reference material. Never merge it wholesale or develop on it.
- Use normal expected-SHA updates. Never force-push, reset, clean, rewrite history, delete unmerged user work or change the backup repository.
- Keep commits narrowly scoped. Verify the exact changed-file list and final `main` SHA.
- Historical requirements, test suites, SQL, CI and source snapshots may be restored selectively only when a current verified gap requires them. Their presence in the archive is not evidence that they should be re-added.
- Do not rely on stale SHA/status claims in recovered documents. Live `main` and the live Supabase ledger are current truth.

## Database and security invariants

- **Supabase target identity is currently disputed and must not be inferred from this file, project name, account membership, or ACTIVE_HEALTHY status.** Do not run remote SQL, inspect/apply migrations, deploy functions, or mutate any Supabase project until the exact project ref used by the running Aghbari Commerce application is independently confirmed from its effective runtime configuration or explicitly confirmed by the owner.
- A project listed in Supabase or named `aghbari-commerce-nasr1` is not proof that the storefront/admin screens use it. Record the verified ref and URL in this file only after matching the application runtime target; never copy credentials or publish keys into documentation.
- Never create a new Supabase project, Bolt Database or Lovable Cloud. Keep database work local/isolated until the correct remote target is established.
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

## Four-programmer execution model — mandatory

The user explicitly requires four coordinated programmers. These are four non-overlapping workstream owners, not permission to create competing implementations. **P1 is ChatGPT and remains the single accountable product lead, final UI integrator and only merger to `main`; P4 is a distinct ERP connector/synchronization owner.**

### Ownership boundaries

- **P1 — Product, UX and integration lead (ChatGPT).** Owns storefront and admin experience, routes/navigation, screen composition, customer-facing workflows, visual consistency, cross-workstream contracts, end-to-end product completion, exact-SHA acceptance coordination, open-PR deduplication and every merge to `main`. P1 is accountable for connecting P2/P3 capabilities to usable screens and resolving cross-domain integration.
- **P2 — Commerce transactions, database and security.** Owns PostgreSQL schema/migrations, RPC/Edge transaction contracts, RLS and server authorization, tenant/resource isolation, idempotency, order/checkout persistence, inventory, procurement, suppliers, finance/accounting/payment posting, bank reconciliation, canonical ERP data contracts, mapping validation and database-side import/apply/reconciliation controls. P2 supplies typed contracts and isolated PostgreSQL 17 acceptance; P2 does not own the ERP transport/scheduler implementation or create parallel product screens.
- **P3 — Intelligence, analytics and decision systems.** Owns deterministic intelligence engines, AI privacy/provider governance, source-backed BI, forecasting, decision snapshots/lifecycle, customer/retention analytics, process bottleneck analysis, intelligent reports and their focused tests. Paid AI is prohibited. P3 does not create duplicate financial, inventory, commerce transaction or ERP connector engines and does not bypass P2's source/authorization contracts.
- **P4 — ERP connectors and automated synchronization.** Owns discovery and implementation of supported Onyx Pro and Al-Mutakamel ERP modules/connectors, including customer self-service/e-commerce, customer orders, product/pricing/stock, sales/returns, warehouse picking/receiving/counts, collections, supplier/purchasing, distribution/route tracking, financial read reports and optional BI/MIS modules where licensed; server-side connection/transport, scheduled or event-driven incremental sync, sync orchestration/checkpoints/retries/dead-letter, source-to-canonical mapping, connector health/receipts and reconciliation tooling. P4 must first reconcile existing Onyx import/export and inventory work (including open PRs such as #538 and #605) and reuse the existing Integration Hub, import engine, DLV-009 27-column profile and Onyx screens. P4 does not own database authorization, accounting posting rules or final UI navigation; those remain P2/P1 responsibilities. No direct database access or vendor capability is assumed without verified support.
- **UI integration rule.** P1 owns final UI composition/navigation for P2/P3/P4 features. P2/P3/P4 may supply focused components only when agreed in advance; P1 mounts them into existing screens. No role may independently create a second screen, service, engine, schema or route for an already-owned capability.
- **One owner per work item and one owner per shared file.** Before parallel work begins, P1 assigns an exact outcome, owned paths, excluded paths, dependency contract and acceptance command. If two tasks need the same files, sequence them; never let agents overwrite one another.

### Mandatory large-batch delivery per launch — outcome enforced

- Every launch assigns one substantial, bounded, executable outcome to each unblocked owner P1/P2/P3/P4. A plan, report, checklist, code review, test run or branch alone is not a completed launch.
- Each owner changes working product code in its own domain unless the only remaining action is a verified external prerequisite. Even then, complete the local adapter, contract, queue, persistence, reconciliation and UI portions that do not require that prerequisite.
- Bundle related work end-to-end: data/contract → authorization → service/connector behavior → existing user/admin workflow or usable integration receipt → focused acceptance. No disconnected visual shell, production stub, fake button or unmounted service.
- Select the largest safe coherent slice, not an arbitrary file count. Prefer one substantial PR per owner/outcome over a chain of tiny PRs. Do not split one feature into sequential UI-only, API-only and test-only PRs when it can be delivered together.
- Do not create test-only, documentation-only, audit-only or refactor-only PRs as a substitute for product delivery. Exception: a narrowly scoped security/data-integrity guard required to protect an irreversible transaction and tied to a concrete missing/failing invariant.
- Tests are mandatory acceptance evidence, but they are not the deliverable. Implement first; then run only changed-flow tests and mandatory high-risk invariants. A failure requires root-cause repair in the same workstream, not repeated runs on unchanged code, timeout inflation or unrelated full-suite campaigns.
- Do not re-run successful suites when their relevant source, fixture, contract and runtime are unchanged. Never transfer PASS between SHAs. Do not block independent workstreams on repository-wide checks.
- Work in parallel on disjoint paths. A blocked owner completes all local work and states the one exact external dependency; other owners continue.
- Merge each independently complete, conflict-free slice immediately after its required exact-SHA checks pass. Do not accumulate finished PRs or wait for unrelated owners.
- End a launch with only: shipped business outcome, PR/commit/SHA, focused acceptance actually run, and the next code change. A blocked owner states the exact blocker and completed local work. No activity diary.

### Continuous integration and immediate merge

1. Read this file and the newest checkpoint at the top of `CURRENT_EXECUTION_STATE.md`; fetch the live `main` head once. Continue from the exact recorded next action, not from memory or an old report.
2. Reconcile the existing open PR queue before creating any branch. Compare overlapping PRs by changed files, commits and exact-SHA checks. Select one best current-main implementation; transplant only unique required work; never merge two implementations of the same feature.
3. P1/P2/P3/P4 feature work uses short-lived branches from current `main` with prefixes `p1/`, `p2/`, `p3/`, and `p4/`. Every PR targets `main`. Do not develop features directly on `main`.
4. Build a complete vertical slice, not a visual stub: UI/contract/service/authorization/data behavior and the smallest applicable regression acceptance. Do not open a PR for notes, screenshots or a report alone.
5. P1 performs a **scoped merge decision**: inspect only the PR diff and its callers, confirm ownership/no duplicate, confirm the exact head SHA, check required workflow results and resolve blocking comments. Do not trigger a repository-wide re-review.
6. **Merge immediately after the exact PR head passes its required checks and is conflict-free.** Use squash by default unless ordered migrations or dependent commits require a merge commit. Do not wait for unrelated work or batch completed PRs.
7. After each merge, verify the resulting `main` SHA and the required post-merge checks for high-risk changes. Update only the affected row(s) in the one canonical acceptance matrix and the top checkpoint in the one execution pointer.
8. Close duplicate PRs only after confirming all unique code/tests have been preserved in the selected implementation. Delete a branch only after its work is merged or explicitly confirmed redundant; never discard unmerged work. No force-push, history rewrite or conflict bypass.
9. If one workstream is blocked, the other workstreams continue on disjoint files. P1 records the exact blocking dependency and resumes it when available; do not stop the whole product for one external integration.
10. Keep progress operational: one-line owner/branch/PR/next-action handoffs are enough. No parallel plans, duplicate matrices, status essays, repeated repository scans or documentation-only PRs. Update the canonical cursor only when the real next action changes or work merges.

### Work selection and finish criteria

- Priority order: (1) security/data/privacy and corrupting transaction defects plus currently active exact-SHA blockers; (2) ERP automation for Onyx Pro/Al-Mutakamel: prove the real connector route, then automate source-authoritative catalogue/customer/price/stock reads and approved sales-document handoff without manual re-entry; (3) broken customer purchase/order lifecycle; (4) inventory/procurement/finance; (5) remaining admin/customer workflows; (6) analytics/AI and visual polish. P1 may reorder only for a reproducible customer-blocking or financial/inventory integrity defect.
- Finish the already-started PRs and existing product capabilities before adding new product surface area. Preserve completed return/amendment/version history, ExecutiveLiquidityCommandCenter, ReplenishmentCard/PO draft, AccountPersonalizationSettings, TaskQualityReviewCenter and other accepted work; inspect before extending.
- A task is done only when its real user flow works and the exact relevant checks pass. A file, route, component, test authored but not run, old SHA pass, or GitHub mergeability flag is not acceptance.
- GitHub Actions and isolated local PostgreSQL 17/Playwright are the default free verification route. Use the narrow existing workflows; do not create overlapping CI workflows or rerun successful jobs unnecessarily.
- No external database writes, deployments, hosted migrations or secret changes until the actual running app's Supabase project ref is proven from effective runtime configuration. Broad user permission does not make an unidentified production target safe.
- Never consume Vercel build/deployment/preview credits for coding or routine checks. Preserve those credits for the explicitly authorized final hosting/E2E phase only.
- The first five-hour work window is a **focused integration sprint**, not a promise that the entire B2B ERP, external providers, populated-data acceptance and production release can be completed in five hours. Do not fake completion or change NO-GO to GO to satisfy a time target. The overall product plan is a 90-day rolling delivery with small merges throughout, not a three-month documentation phase.

## Tooling and quota-protection policy — mandatory for every programmer/agent

- **Bolt New is permanently prohibited.** Do not open it, sync to it, connect it, use its database/auth/storage/functions, or plan a later migration/rebuild there. Do not use Lovable or Lovable Cloud as a substitute.
- **GitHub is the default and required engineering workspace** for this project: inspect and edit source, commit changes, review diffs, track issues, and use GitHub Actions for source-level CI where appropriate.
- **Do not use Vercel as a coding, editing, build, test, review, or agent-execution workspace.** Do not invoke Vercel CLI, Vercel build/deploy/preview operations, remote sandboxes, or deployment agents for routine implementation or verification.
- **Do not spend Vercel build/deployment quota or credits** for source checks, linting, tests, typechecking, builds, or code review. Prefer GitHub repository operations and the repository's GitHub Actions workflows; use local/free checks when available.
- Vercel remains a hosting target only. Deploy, promote, roll back, or change Vercel project settings **only when the owner explicitly authorizes that specific hosting operation**. A GitHub commit or successful CI run is not deployment approval.
- Accessing an already-published URL for read-only diagnosis does not authorize a Vercel deployment or project mutation.
- This rule applies to ChatGPT, other AI coding agents, human programmers, and future sessions. Do not ask the owner to repeat it. If a requested operation genuinely requires Vercel resources, stop before consuming quota and obtain explicit owner approval.
- GitHub Actions usage must still respect the available GitHub quota. Do not trigger redundant or broad workflows; choose the smallest relevant workflow and report what actually ran.

## No-loop enforcement — overrides report-heavy habits

- No full-repository scan, repeated architecture inventory, broad review or reopening accepted work without a specific changed path, failure or acceptance gap.
- A screen without a live service/data path, an API without a consumer, a connector without durable checkpoint/replay handling, or a test without implemented business behavior is not a deliverable.
- Finish, correct, safely consolidate or explicitly retire an existing PR that already covers an outcome before opening another PR for that outcome.
- PRs must deliver a coherent user/business result. Do not create parallel implementations of the same screen, route, service, schema, engine or connector.
- The execution cursor is a command list, not a diary. Keep its active section short; preserve old evidence as history and do not make the next launch reread it.
- Escalate only a concrete decision that cannot be resolved from code/contracts. Do not ask the owner to repeat information already recorded in canonical files.

## Cost, testing and reporting

- Keep paid AI spend at zero. Use deterministic/local processing or authorized free quotas only; never add paid fallback or auto-recharge.
- A test passes only when the exact relevant suite was actually executed on the exact SHA. Distinguish authored tests, source review, isolated PostgreSQL acceptance, live production checks, browser E2E and hosted integration evidence.
- Before completion, verify final SHA, changed files, database effects and which tests actually ran. Record unapplied migrations and external prerequisites.
- Do not declare release readiness from source presence, schema-cache load, generic Vercel status or historical CI. Full release requires the canonical release gate and owner sign-off.
