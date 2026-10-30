# THREE-AGENT OVERRIDE — 2026-10-30

This newest instruction supersedes all older P1/P2-only ownership statements below. Nasr1 uses exactly three parallel programmers: P1 (UI/product journeys), P2 (backend/database/security/data integrations), P3 (business intelligence/decision engine/integration captain). Remote GitHub branch remains main-only: no permanent feature branches, no PRs, no force-push, no reset/clean and no deletion of uncommitted work.

P3 alone owns `docs/bolt-source-reconciliation/CURRENT_EXECUTION_STATE.md`, the existing acceptance CSV, requirement registry, EXECUTION_LOG, master specification, protocol and integration queue. P1 updates only `docs/execution/P1_CHECKPOINT.md`; P2 updates only `docs/execution/P2_CHECKPOINT.md`; P3 updates `docs/execution/P3_CHECKPOINT.md` and consolidates the global state. File ownership is defined in protocol section 11.

Every session reads only the first 80 global-state lines, its own command and checkpoint, then starts at the saved exact_next_command. No repository-wide rediscovery, no repeat 330-RPC inventory, no re-extracting the reference RAR. Checkpoints every 10 minutes and after commit/failure/interruption. Two attempts maximum for same root cause, then safe fallback and continue. P3 is the only remote-main integration/push owner and uses expected-SHA CAS; verify exact-SHA Actions after integration.

AI policy: zero paid spend, no paid provider/model/fallback, no auto-recharge or billing method. Deterministic/local logic first, authorized official free API quotas only after checking current account/model limits and data terms. No account rotation or quota evasion. ChatGPT Free consumer UI is not an API. Never send raw PII, private pricing, cost/margins, payments or customer finance data to external free models. When all free quotas are exhausted, continue with deterministic code and explicitly label RULE_BASED/MODEL_UNAVAILABLE.

Reference gallery: `docs/reference-app/README.md`, images under `docs/reference-app/images/`. It is design/feature reference only, not evidence of correctness. Do not copy identity, screenshot figures, customer data or errors into Nasr1.

---

# EXECUTION OVERRIDE — 2026-10-28: STRICT MAIN-ONLY PRODUCT DELIVERY

For the only product repository Report-Engainall/Nasr1, main is the sole permitted GitHub branch. Do not create GitHub branches, pull requests, or additional repositories. Make bounded, conflict-free changes directly on main after relevant checks when the authorized write path permits it. Never force-push, rewrite published history, disable protection, or simulate progress by moving refs.

If direct writes are denied by repository protection, use only an already-authorized merge path that does not create a durable branch. If no such path is available, preserve main, record the exact blocker, and continue independent work without claiming a commit or merge.

Before executing any saved NEXT_ACTION, read the product delivery closure protocol and canonical execution state. Newer current blocks supersede historical pointers. Do not resume from old SHAs or repeat completed audits without a changed dependency, relevant code change, regression, or failed check.

Current objective: close the existing acceptance matrix through connected customer/admin journeys, real persistence/readback, tenant authorization, privacy-safe outputs, and reproducible tests. The immediate workstream is DLV-005 cross-channel pricing privacy after the account-switch stale-preview fix; then take the next open high-priority matrix item. Do not recreate merged cart/checkout, catalog identifiers/search, or image lifecycle work.

Keep only the canonical CURRENT_EXECUTION_STATE.md resume cursor, requirement registry, acceptance matrix, and execution log. Never create parallel ledgers or matrices. Update the canonical state from the exact live main SHA at each delivery and verify Actions on every new commit.
---

<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

## Aghbari Commerce
- Legacy Bolt UI lives in src/components (AghbariApp, Storefront, AdminPages, OperationsCenter) and src/lib (api, types); extend it, do not rewrite — the spec mandates incremental build.
- src/lib/supabase.ts re-exports the Cloud client loosely typed so api.ts keeps its hand-written contracts in types.ts.
- Admin access = user_roles role in admin/manager/staff checked by public.is_staff(); customers order only via the place_order RPC so prices are computed server-side.
- Profiles are created by the ensure_profile RPC after sign-in (no triggers on auth schema); first signed-up user becomes admin.


## Permanent session-resume protocol (mandatory for repository-aware agents)

This project must resume from repository evidence; the owner must not be asked to resend information already saved here.

1. At session start, run `git fetch origin`, `git status --short --branch`, `git branch --show-current`, `git rev-parse HEAD`, `git rev-parse origin/main`, and `git log -1 --oneline`. Inspect GitHub Actions for the exact current `main` SHA. Protect any dirty/uncommitted work; never reset or overwrite it to make the tree look clean.
2. Read `PROJECT_MEMORY.md`, `ops/AGHBARI-SESSION-RESUME.md`, `ops/AGHBARI-LATEST-EXECUTION-STATE.md`, `docs/canonical/AGHBARI-REQUIREMENT-REGISTRY.md`, `docs/canonical/AGHBARI-EXECUTION-MANDATE.md`, and consult `docs/canonical/AGHBARI-MASTER-PROJECT-SPECIFICATION.md` only for the specific acceptance criteria needed. Treat remote `main` and exact-SHA evidence as truth; saved SHAs are checkpoints, not assumed HEAD.
3. Take `next_task_id` from the latest execution-state checkpoint and match it to the single requirement registry. Do not repeat repository-wide discovery, restate the same specification, or reopen `DONE_VERIFIED` work unless its SHA/dependency/input changed, a regression or security issue appeared, or its evidence became invalid. When the first open item is externally blocked, record the concrete blocker and continue the next safe, executable task without inventing success.
4. Implement the smallest coherent end-to-end change, run relevant real tests, fix failures, and record task ID, changed paths, commands, results, exact tested SHA, next task ID, and evidence-backed blockers. Update the existing canonical memory/resume/state/registry records in the same related batch; never create duplicate progress ledgers.
5. Commit and push safely to `origin/main` only after validation; never force-push published history. Then verify remote HEAD and Actions for that exact SHA. A push, green parent-SHA CI, Git integration, or repository text is not proof that the new SHA passed or that Lovable actually synchronized.
6. `AGENTS.md` is the shared agent-instruction source; `.github/copilot-instructions.md` provides GitHub Copilot's repository-wide entry point. Lovable's official Knowledge documentation explicitly says a root-level `AGENTS.md` is always read by its agent regardless of session length: https://docs.lovable.dev/features/knowledge. This root file is therefore the free persistent-instruction fallback; do not duplicate the full specification in Project Knowledge merely to persist resume rules. Still distinguish that documented loader behavior from proof that a particular new Git SHA has synchronized into the live Lovable project/editor. Never claim the latter without direct evidence.

Execution order: `INSPECT CURRENT STATE → RESUME NEXT OPEN TASK → IMPLEMENT → TEST → FIX → VERIFY → COMMIT → PUSH MAIN → SYNC LOVABLE`.


## Mandatory every-session delivery rule — no zero-progress launches

Every new execution/session MUST deliver a real, repository-backed increment before stopping. This is an execution requirement, not a request to produce another plan or status-only report.

1. Resume from `docs/bolt-source-reconciliation/CURRENT_EXECUTION_STATE.md`; verify live `main` HEAD and exact-SHA CI once, then perform the recorded next task.
2. In each session, implement at least one small but meaningful end-to-end code/test improvement in Nasr1, attempt the relevant real checks, fix any discovered regression, and commit the code plus evidence/state updates. Do not count reading files, writing a plan, changing status text alone, or creating an unconnected UI as the required implementation increment.
3. If the recorded task is blocked by a concrete external dependency, record the blocker with evidence and immediately implement/test the highest-priority independent task that is not blocked. Never invent a passing test or claim execution that did not occur.
4. Before finishing, update the single canonical `CURRENT_EXECUTION_STATE.md` with the real code commit, actual check status (PASS/FAIL/PENDING/BLOCKED), exact tested SHA, and one next task ID. Append details to `EXECUTION_LOG.md`. Keep `AGENTS.md` as this permanent rule source; do not create competing resume cursors.
5. The completion response must lead with the code change and links/evidence, then clearly distinguish IMPLEMENTED, TESTED, BROWSER-PROVEN, and PRODUCTION-PROVEN. If no code change could be safely completed, explain the evidence-backed blocker and the independent work performed; never present documentation-only work as a code-delivery session.


---

# CURRENT TARGET OVERRIDE — 18 OCTOBER 2026

For the active task, the only code target is Report-Engainall/Nasr1 on main. Disregard older instructions in this file that point to Aghbari-Technologies/aghbari-commerce-evolved or old AGH-* checkpoints. Active entry point: docs/bolt-source-reconciliation/BOLT_SINGLE_ENTRYPOINT_MASTER_HANDOFF_REPLACEMENT_2026-10-18.md. Sole task cursor: docs/bolt-source-reconciliation/CURRENT_EXECUTION_STATE.md. report-insight-engine is a read-only source/archive repository.

Inspect every READY_TO_REUSE file and the two Bolt recovery ZIPs by actual download, SHA-256, integrity test, safe extraction and file-by-file comparison with Nasr1. Metadata is not extraction; reference copies are not integration. Preserve unsaved work; no force-push, paid services or fictional financial data. Update state/log/ledger and verify exact-SHA CI for each new commit.
