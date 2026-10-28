# Aghbari Commerce — Continuous Execution Record

> **Single source of truth.** Update this file at every meaningful checkpoint: before starting a new task, after implementation, after tests, after merge, and when blocked. Do not restart discovery or repeat completed audits. Read only this file's newest **LIVE CHECKPOINT / NEXT ACTION** section first, verify the current main SHA and exact-SHA CI, then continue from the next incomplete acceptance item. Keep older entries as history; never let a historical SHA or status override live repository evidence.

## LIVE CHECKPOINT — 2026-10-28

- **Repository:** [Report-Engainall/Nasr1](https://github.com/Report-Engainall/Nasr1)
- **Product:** متجر الأغبري | Aghbari Commerce
- **Execution branch:** `main` only. Do not create extra working branches or duplicate repositories. Do not force-push, reset, clean, or bypass branch protection. Use the repository's allowed merge path; merge ready work promptly after required checks/reviews.
- **Latest known main SHA from live check:** `ef97370268cae66b123cf2509d567da58772f12d` (re-verify before acting; do not assume it remains current).
- **Latest known CI:** Aghbari Commerce run [40741309082](https://github.com/Report-Engainall/Nasr1/actions/runs/40741309082) was still running when last checked. Do not label it passed until refreshed. One-main-branch cleanup run [40741309176](https://github.com/Report-Engainall/Nasr1/actions/runs/40741309176) succeeded.
- **Recent actual changes on main:** privacy/auth/cache safeguards; public catalog redaction of tenant/internal stock IDs; invoice settlement concurrency test stabilization; public catalog privacy assertions. These are real changes, but do not prove storefront/product acceptance is complete.
- **Current execution mode:** stop broad repeated reviews and status-only reporting. Reuse findings already recorded in this file and the acceptance matrix. Only reopen a completed area when a current exact-SHA failure, new diff, or concrete evidence justifies it.

## UNIFIED EXECUTION MANDATE — DO NOT RESET THE WORK

1. **Resume protocol:** read this LIVE CHECKPOINT, the existing `NEXT ACTION`, and the current acceptance matrix. Confirm current `main` SHA and latest CI only; do not re-fetch or re-audit the entire repository. Start immediately at the first incomplete acceptance item.
2. **Implement, don't narrate:** each work cycle must produce a concrete code/test/doc delta tied to an acceptance ID. Build the real user path end-to-end: Arabic RTL UI → service/API → database/RPC → tenant/role authorization → audit/validation → tests. No placeholder/demo-only completion claims.
3. **Small verified increments:** implement one bounded, valuable change; run the narrow test, relevant security/privacy tests, and required CI on the exact candidate SHA; inspect failures and fix only evidenced defects; use the repository-approved merge path as soon as gates pass; verify CI on the actual merge SHA; then update this record and continue immediately.
4. **No duplicate work:** do not recreate merged PRs, completed fixes, inventories, reports, or tests. Preserve existing findings and link to them. A closed PR is not automatically merged; verify its merge SHA or equivalent change on `main`.
5. **Acceptance-driven priority:** prioritize unfinished release-blocking product flows and visible screens/services over additional inventory/report polishing, while immediately fixing proven security, tenant-isolation, price-privacy, finance, stock, or import/export defects. Use the original master specification and screen acceptance matrix as the requirement authority.
6. **Required product constraints:** B2B customer-specific price tiers are server-selected; hidden prices must never leak through DOM/API/cache/PDF/XLSX or use zero as a sentinel. Preserve Onyx Pro's 27-column order, external IDs including leading zeros, idempotent imports, and truthful sync metadata. Protect ledger/reversal, Customer 360, admin AI, role-specific print routes, official WhatsApp Business API, free/local AI adapters without surprise paid billing, and read-only weak-network PWA cache (no offline order/stock/finance mutations).
7. **Truthful external gates:** mark hosted tenant/customer E2E, live Onyx, official WhatsApp receipts, live AI provider, production deploy/migration/rollback, restore, and owner sign-off as BLOCKED_EXTERNAL/UNVERIFIED until actual authorized evidence is recorded. Do not fabricate credentials or results.
8. **Progress log format:** every update records UTC timestamp, main/candidate SHA, acceptance ID/requirement, files changed, implementation result, exact test commands/results and CI run URLs, merge SHA, remaining blocker, and the single next action. If nothing changed, report the specific blocker and the next executable step—not a list of browsing/review activities.
9. **Time transparency:** record actual timestamps at each milestone. Do not claim second-by-second live refresh unless an actual automated updater is configured; the repository file updates when a checkpoint is committed. The user should be able to open this single record directly without asking for a fresh recap.
10. **Completion definition:** a requirement closes only with implementation evidence + passing relevant tests on the exact SHA + acceptance-matrix update. Overall release closes only when all applicable acceptance groups and external gates have evidence, with owner sign-off recorded.

## NEXT ACTION — RESUME HERE

1. Refresh current `main` SHA and the status of [Aghbari Commerce run 40741309082](https://github.com/Report-Engainall/Nasr1/actions/runs/40741309082). This is a short freshness check, not a repository-wide audit.
2. If CI fails, inspect its failed step/log and fix only the proven defect; rerun on the new exact SHA. If it passes, record that exact result.
3. Continue the first still-open item in the existing screen acceptance matrix and execution report. Prefer a real incomplete customer-facing/business flow; do not spend another cycle generating inventories unless they identify a specific actionable gap.
4. After every implementation/test/merge milestone, update this same file and the acceptance matrix; continue to the next incomplete item without waiting for another user prompt.

---

### Current main and verified merges
- Current remote `main`: `653f4d764041a8751c41e75a492fed0cc6edea63`. PR #189 merged as `0d7f153cf6a7c8ac70b439f2ad15e479e3d80d47`; PR #186 merged as `653f4d764041a8751c41e75a492fed0cc6edea63`.
- Exact PR-head checks passed before merge: #189 Core [40126581054](https://github.com/Report-Engainall/Nasr1/actions/runs/40126581054), P2 [40126581094](https://github.com/Report-Engainall/Nasr1/actions/runs/40126581094); #186 Core [40126529526](https://github.com/Report-Engainall/Nasr1/actions/runs/40126529526) and [40126529676](https://github.com/Report-Engainall/Nasr1/actions/runs/40126529676), P2 [40126529735](https://github.com/Report-Engainall/Nasr1/actions/runs/40126529735). These are PR-head checks, not post-merge SHA checks.
- The connected current-main commit-status and PR-run lookup returned no exact-SHA post-merge result for `653f4d764041a8751c41e75a492fed0cc6edea63`; consequently the post-merge main CI gate is **UNVERIFIED** and must not be described as pass.
- #134 is closed unmerged as a duplicate of #189. Its same-key race block is present on current main, and the original single-vs-batch race block remains in the same file.

### Remaining active fronts
- **#142 API-OPS:** historical exact-head Core/P2 passed at `21083e8e26e219f0c3fbe05885b23f77f29a151d`, but its branch is 41 ahead / 22 behind main over 13 paths. Port only still-needed body-limit/runtime and contract-register edits to a fresh current-main branch; rerun Core/P2. API-OPS remains PARTIAL: 304/304 exposed runtime objects are source-mapped, 179 callable RPC candidates still need semantic review.
- **#152 docs:** stale branch is 83 ahead / 22 behind current main across five central docs. Do not merge as-is.
- **#191 docs refresh:** stale base `73547627697fecb8882c594880645200505d095d` and now reports #186/#189 as pending; a replacement PR is being built from current main instead.
- **Import/DQS:** rerun existing import profile, tenant scope, resumability, hash reconciliation, rollback and DQS PostgreSQL 17 acceptance on current main because newer import/finalizer/quality changes landed after the old `16a3` baseline. Add code only for a reproduced failure.
- **Storefront/routes/exports:** #186 merged route recovery, customer-order keyboard access, checkout price privacy and export hydration. Verify the merge SHA; do not duplicate the feature batch.
- **External proof:** authenticated customer-manager journeys require isolated non-production credentials; live Onyx target import/sync, official WhatsApp delivery, hosted restore and production database writes remain unproven without authorized results.

### Next execution sequence
1. Obtain actual Core/P2 results for the exact current main SHA `653f4d764041a8751c41e75a492fed0cc6edea63`, and repair only an evidenced failure.
2. Port the remaining #142 diff from a new main descendant, rerun Core/P2, then continue semantic review of callable RPCs in bounded batches.
3. Run existing current-main import/DQS acceptance; retain the existing implementation if it passes.
4. Confirm route/export/checkout acceptance on the merge SHA and record any failing test by exact file and line.
5. Close obsolete branches only when merged functionality or duplicate content is verified; do not inherit old SHA results.

---

## Historical checkpoint (superseded by live reconciliation above)

### Earlier confirmed repository state

- Main has not been modified directly. Main Core [40035355209 SUCCESS](https://github.com/Report-Engainall/Nasr1/actions/runs/40035355209) is on SHA `16a3d23e558696700bccbb3dbf9ea75b0fccf745`.
- PR #127 is already merged; PR #129 is closed unmerged. Neither is being recreated.
- The current state checkpoint and acceptance matrix were refreshed on the #133 branch to record PRs #147–#151, the unique migration ordering, exact-head test evidence and external-test limitations. These commits advance the #133 head; verify Core/P2 on the final updated head before claiming the refreshed docs branch passes.
- `docs/bolt-source-reconciliation/API_OPS_CONTRACT_REGISTER_2026-10-24.md` was updated on [PR #142](https://github.com/Report-Engainall/Nasr1/pull/142) with five specific semantic findings and current evidence. The latest register head is `0b8eab56970f1485f86535edf7b66d1c1bddae90`; Core [40107811311](https://github.com/Report-Engainall/Nasr1/actions/runs/40107811311) and P2 [40107811295](https://github.com/Report-Engainall/Nasr1/actions/runs/40107811295) were running at this checkpoint.
- The API-OPS inventory maps 304/304 public runtime objects to sources, but the 179 callable RPC candidates still require semantic review. Do not mark the overall API-OPS workstream complete based on a small subset of fixed NULL-state cases.

## 2. Implemented defects and exact-head evidence

### PR #147 — customer quote decision

- Head: `5b351a544f412a48c0d5466b91b000c51100c889`.
- Added `20261024133000_customer_quote_response_explicit_decision.sql` after detecting that #146 already uses migration version 13:00. This eliminates a duplicate migration version.
- Core [40106804073 SUCCESS](https://github.com/Report-Engainall/Nasr1/actions/runs/40106804073), P2 [40106804081 SUCCESS](https://github.com/Report-Engainall/Nasr1/actions/runs/40106804081); direct PostgreSQL 17 runtime passed.
- Evidence: NULL quote ID/decision returns SQLSTATE `22023` without mutation; explicit `false` and `true` persist the expected rejected/accepted transitions.
- Status remains PARTIAL for release: open/unmerged, no independent submitted review; hosted customer E2E remains skipped.

### PR #148 — operational task status

- Head: `fbc34727822416c6521cd9bae841c8d0df0261c6`.
- Added `20261024140000_operational_task_status_reject_null.sql` plus source-contract and PostgreSQL 17 runtime tests.
- Core [40106736245 SUCCESS](https://github.com/Report-Engainall/Nasr1/actions/runs/40106736245), P2 [40106736237 SUCCESS](https://github.com/Report-Engainall/Nasr1/actions/runs/40106736237), PG17 [40106736232 SUCCESS](https://github.com/Report-Engainall/Nasr1/actions/runs/40106736232).
- Evidence: NULL/unsupported statuses are rejected before mutation; a valid transition updates the task and writes exactly one status-change audit row.
- Status: open/unmerged; no independent review.

### PR #149 — promotion activation

- Head: `21fabc9ecaf11fb3f22737e11070d23e83cb1872`.
- Added `20261024143000_promotion_null_active_decision.sql`.
- Core [40107006299 SUCCESS](https://github.com/Report-Engainall/Nasr1/actions/runs/40107006299), P2 [40107006338 SUCCESS](https://github.com/Report-Engainall/Nasr1/actions/runs/40107006338), PG17 [40107006365 SUCCESS](https://github.com/Report-Engainall/Nasr1/actions/runs/40107006365).
- Evidence: NULL is rejected before create/toggle; no promotion mutation/deactivation audit is created; explicit true/false remains effective.
- Status: open/unmerged; no independent review.

### PR #150 — storefront announcement activation

- Head: `1b22b83b3297c87c57b20c62336f16b772b613e4`.
- Added `20261024144500_announcement_null_active_decision.sql`.
- Core [40107350234 SUCCESS](https://github.com/Report-Engainall/Nasr1/actions/runs/40107350234), P2 [40107350238 SUCCESS](https://github.com/Report-Engainall/Nasr1/actions/runs/40107350238), PG17 [40107350314 SUCCESS](https://github.com/Report-Engainall/Nasr1/actions/runs/40107350314).
- Evidence: NULL create/update is rejected with SQLSTATE `22023`, with no state change or audit event; explicit false deactivates once.
- Status: open/unmerged; no independent review.

### PR #151 — AI fallback telemetry

- Latest head: `70c96242e28375bacde73d5a2b85ec538b982d5d`.
- Added `20261024145000_ai_fallback_decision_reject_null.sql`, source-contract tests and an isolated PostgreSQL 17 runtime workflow. Both v1/v2 AI usage completion require an explicit fallback flag before reservation lookup/mutation; v1 also explicitly rejects NULL provider/result status.
- A previous head `c2b64beedd0cd3d473506fe55044388624196409` had a Core failure only because a new source-contract test expected a literal `p_usage_measurement_status='unknown'`, while the implementation uses an ELSE branch for unknown usage. The test was corrected to verify the actual measured/partial branches and the “unknown usage cannot claim measured tokens” rejection.
- On the latest head `70c96242...`, PostgreSQL 17 [40107756187 SUCCESS](https://github.com/Report-Engainall/Nasr1/actions/runs/40107756187). Core [40107756122](https://github.com/Report-Engainall/Nasr1/actions/runs/40107756122) and P2 [40107756096](https://github.com/Report-Engainall/Nasr1/actions/runs/40107756096) were still running at checkpoint. Do not transfer results from the previous SHA to this head.
- Status: PARTIAL until Core and P2 both pass on the latest head, followed by independent review and merge.

## 3. Required sequence and unresolved release gates

Keep migration versions unique and preserve dependency order:

`#144 (11:00) → #145 (12:00) → #146 (13:00) → #147 (13:30) → #148 (14:00) → #149 (14:30) → #150 (14:45) → #151 (14:50)`.

- #144 head `2bf9cfedbc6d840a0da3fdffe7ddb106b9929a71`: Core [40105249828 SUCCESS](https://github.com/Report-Engainall/Nasr1/actions/runs/40105249828), P2 [40105249827 SUCCESS](https://github.com/Report-Engainall/Nasr1/actions/runs/40105249827); still open awaiting independent review.
- #145 head `7c82b051ed0bda11c944e4fe08ecf4a117060ed5`: historical Core [40100874921](https://github.com/Report-Engainall/Nasr1/actions/runs/40100874921) and P2 [40100874931](https://github.com/Report-Engainall/Nasr1/actions/runs/40100874931) succeeded on that historical SHA only. It must be refreshed after #144.
- #146 head `3150691725f97d7f892fcb2aed0edae898c839be`: historical Core [40101794869](https://github.com/Report-Engainall/Nasr1/actions/runs/40101794869) and P2 [40101794970](https://github.com/Report-Engainall/Nasr1/actions/runs/40101794970) succeeded on that SHA only. Resolve shared `scripts/test-database-migrations.mjs` changes from #134/#144/#146 while preserving all tests.
- PRs #133, #142, #144–#151 remain open/unmerged here. A reviewer request is not an approval; there are no independent submitted reviews confirming closure. Do not merge, bypass protection, or modify `main` directly.
- Hosted customer/tenant E2E remains `SKIPPED/BLOCKED_EXTERNAL` where authorized test credentials are unavailable. CI does not prove production writes, live Onyx import, WhatsApp delivery, live AI-provider secrets, deployment or production restore.
- Exact-head CI for #133 must be rerun after the latest checkpoint/matrix/report commits; previous head results do not transfer.

## 4. NEXT ACTION — FIRST STEP ON RESUME

1. Poll #151 Core `40107756122` and P2 `40107756096` on SHA `70c96242e28375bacde73d5a2b85ec538b982d5d`; inspect job logs and fix only proven failures.
2. Poll #142 Core/P2 `40107811311`/`40107811295` on its current register head. Any additional register correction requires another exact-head run.
3. Verify Core/P2 on the final head of PR #133 after its updated state, matrix and report commits.
4. Continue semantic review of remaining callable RPCs and close outstanding acceptance items from the original mandate; do not stop after these NULL-decision fixes.
5. After independent submitted reviews and successful final-head gates, follow required merge order and verify CI on each actual merge SHA.

