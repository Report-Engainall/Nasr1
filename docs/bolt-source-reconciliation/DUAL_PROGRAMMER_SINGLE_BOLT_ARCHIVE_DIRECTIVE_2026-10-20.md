# Nasr1 Dual Programmer Directive — Single Authoritative Bolt Archive
**Date:** 2026-10-20  
**Status:** Active execution directive  
**Target repository:** https://github.com/Report-Engainall/Nasr1  
**Target branch:** main  
**Authoritative Bolt source (the only one allowed):**  
Repository: https://github.com/Report-Engainall/report-insight-engine/tree/main/incoming-archives/nasr1-bolt-recovery-2026-10-17  
Exact archive/file name: `project-bolt-github-7sl6ykzz (2)`

## 0. Binding decision — supersedes prior archive instructions
The user explicitly rejected using either of the two older Bolt snapshots. Do not open, compare, extract, diff, or merge from the older Bolt archives (including any files previously referred to as `Nasr1_Bolt_Restored_Current.zip` or `Nasr1_Bolt_Before_Failure.zip`). Do not use them as fallback sources or as comparison baselines. The only permitted Bolt archive is `project-bolt-github-7sl6ykzz (2)` at the location above.

This directive supersedes any earlier instruction that calls for comparing two Bolt archives. Do not infer archive contents or claim a feature exists until the authoritative archive has been opened and verified.

## 1. Shared non-negotiable rules
- Modify the target project Nasr1 only. The archive repository and all donor repositories are read-only sources.
- Preserve existing work, history, database integrity, access controls, and current application architecture. Do not replace the project wholesale with the archive.
- Do not use destructive `reset`, `clean`, or `force-push` operations.
- Work on separate branches and PRs; do not push directly to `main`.
- Never weaken RLS, authorization, accounting controls, validation, or tests to make a change pass.
- Avoid paid services and unnecessary credit usage; prefer free/open-source options where appropriate.
- Record exact branch, commit SHA, changed paths, tests, CI run and result. Mark unrun checks `NOT RUN`; no unsupported PASS claims.
- Before editing, read the current handoff, state/resume notes, coordination protocol, ownership ledger, and source integration ledger if present. If a referenced path is missing, locate the current canonical file; do not assume its contents or silently recreate it.
- Do not overwrite another programmer's owned files or shared ledgers. Coordinate shared test files and migrations before editing.
- Archive code is untrusted input: inspect for secrets, unsafe scripts, dependency risks, incompatible licenses, stale credentials, and data-destructive migrations before reuse.

## 2. Programmer 1 (P1) — donor repository feature integration
**Mission:** Integrate useful missing features from the three previously designated donor repositories into Nasr1. This is independent of Bolt archive recovery.

- Continue from P1's latest recorded task ID and integration ledger; do not restart a full audit without cause.
- Use donor repositories as read-only references. Port only features that are missing, compatible, useful, and not already implemented in Nasr1.
- Do not inspect or merge any Bolt archive; Bolt recovery is P2's responsibility.
- Own and maintain `SOURCE_INTEGRATION_LEDGER.csv` and other files explicitly assigned to P1.
- Preserve database and API compatibility, server-side authorization, tenant boundaries, and tests.
- Submit changes via a dedicated branch and PR. Do not merge until CI passes on the exact candidate SHA.
- Report each feature as implemented / tested / blocked, with evidence and exact changed paths.

## 3. Programmer 2 (P2) — one-archive Bolt recovery, then original specification
### Phase A — recover from the one authoritative archive
1. Read the canonical handoff and coordination/state files in the current Nasr1 repository.
2. Open and verify only `project-bolt-github-7sl6ykzz (2)` under `incoming-archives/nasr1-bolt-recovery-2026-10-17`.
3. Record the exact source path, file type, size, SHA-256 (when downloadable), and extraction/listing result. If the source cannot be accessed, report the precise blocker; do not substitute an older archive.
4. Inventory its files and identify completed work, useful code, migrations, tests, UI routes, and configuration changes.
5. Compare that inventory only against the current Nasr1 target state. This is a one-source-to-target reconciliation, not a comparison between Bolt snapshots.
6. Merge only genuinely missing and compatible work. Adapt it to current architecture and dependencies rather than blindly copying files. Avoid duplicate screens, routes, migrations, schemas, and business logic.
7. Review security, RLS, authentication, tenant isolation, financial calculations, migration reversibility, secrets, dependency changes, and data integrity.
8. Update P2-owned reconciliation and resume records with source path/hash, file-level decisions (reuse/adapt/reject), reasons, tests, and PR links.

### Phase B — complete the original project specification
Immediately after Phase A is reconciled, continue unfinished work from the original specification and the canonical handoff. Do not stop at an audit or plan.

Priority order:
1. Security, authorization, RLS, tenant isolation, and audit trails.
2. Data integrity, inventory, stock movements, purchasing, sales, and returns.
3. Accounting: chart of accounts, journals, balanced entries, posting/reversal controls, cash/bank, receivables/payables, expenses, settlements, period closing, and auditable financial reports.
4. Warehouse transfers, receiving, partial/full receipt, stock counts, and idempotency.
5. Onyx Pro integration, external IDs, synchronization state, and safe import/export.
6. Reporting, alerts, analysis, and AI adapters using free/OSS options where feasible.
7. Operational task center: derive actionable tasks from actual app events and assign/print by role (sales, accountant, warehouse/storekeeper, purchasing manager); include owner, source event, priority, due date/status, and completion evidence.
8. Functional UI routes, responsive RTL experience, accessibility, PWA/weak-network behavior, and final polish.

Use the original specification as the acceptance baseline. Improve implementation where a safer or more complete approach is justified, but do not silently drop useful requirements or deliver nonfunctional mock screens.

## 4. P1/P2 coordination and file ownership
- P1 owns source-donor integration and `SOURCE_INTEGRATION_LEDGER.csv`.
- P2 owns the single-archive Bolt reconciliation and P2 execution/resume reports.
- Do not modify the other programmer's owned ledgers or state files.
- If both need a shared file, agree on the exact patch and merge sequentially; never overwrite the other programmer's changes.
- Avoid concurrent migrations or edits to the same test path. Run shared tests after the sequential integration.
- Each programmer must identify the latest target SHA before starting and re-check the base SHA before creating/updating a PR.
- No PR is considered merge-ready until required CI and relevant integration/security tests pass on the exact head SHA.

## 5. Required completion report
Each work session must update a persistent report with:
- Target repository and base/head SHA.
- Single authoritative archive path and SHA-256, or the exact access blocker.
- Task IDs completed and next task ID.
- Changed files and feature-level reuse/adapt/reject decisions.
- Database migrations and security/RLS implications.
- Commands/tests executed and actual outcomes; list unrun checks as `NOT RUN`.
- CI run URL and tested SHA.
- PR URL and merge status (never imply merged unless verified).
- Remaining blockers and the next concrete action.

**Completion criterion:** Useful missing work from the single authorized archive is integrated safely into Nasr1, then unfinished original-spec functionality is implemented and tested. Older Bolt snapshots are excluded entirely.
