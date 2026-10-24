# NASR1 Continuous Execution Report

**Checkpoint:** 2026-10-24 — live GitHub recheck after adding PRs #147–#151  
**Repository:** `Report-Engainall/Nasr1`  
**Production reference:** `main` only  
**Main SHA:** `16a3d23e558696700bccbb3dbf9ea75b0fccf745`  
**Resume branch:** `p2/reconcile-18-prs-live-main-20261024`, PR [#133](https://github.com/Report-Engainall/Nasr1/pull/133)

## 1. Confirmed repository state

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

---

# Import pipeline acceptance checkpoint — 24 October 2026

**Canonical task:** IMPORT-001 / DQS-001 follow-up  
**Repository:** Report-Engainall/Nasr1  
**Production reference:** main — base SHA at PR creation 0bbaa6db9332fd0f812e00bd2b8fcda275fc5f3a  
**Execution branch:** fix/import-finalize-manifest-and-row-errors-20261024  
**PR:** [#179 — import identity, resume, failure recovery and rollback](https://github.com/Report-Engainall/Nasr1/pull/179)  
**Initial code head before checkpoint/documentation commits:** 75db49baa22ae6056c022d87d462599ab2c7b9e6  
**Live-head rule:** read PR #179 for the latest SHA. This report/matrix/state refresh itself advances the branch, so only CI on the final live PR head may be used for acceptance.

## Confirmed code changes on the branch

1. **Source and batch identity.** Added external_source_reference to import jobs and upload sessions. The reference is part of the server-side idempotency payload, job row, session row, processing fingerprint, resume check, and finalization gate. Changing the external source reference under the same request key is rejected.
2. **Request idempotency and duplicate identity.** The source-aware overload atomically claims (organization, actor, request_key) and replays the same job only for an identical payload. Reusing a key for a different file or external batch is rejected. The legacy nine-argument RPC execute grant is revoked for authenticated to prevent bypassing the new source identity contract. Existing file-hash duplicate preflight and intent-specific finalize actions remain in the canonical pipeline.
3. **Verified resume/finalization.** The server finalizer now checks active staff/tenant scope, allowed job state, exact job/session/profile/version/period/source/file identity, exact chunk count, contiguous offsets, sizes, SHA-256-shaped chunk hashes, total bytes, and the persisted processing-configuration fingerprint. Incomplete or cancelled jobs cannot publish a ready snapshot. The client also compares the chosen file's SHA-256 and the saved configuration before resuming.
4. **Required fields, format and row validation.** The parser checks required headers before processing and validates configured required values per row. The exact configured matching key is mandatory even if another standard key happens to be populated. Identifiers remain text where sourced as text, including leading zeros. XLSX numeric cells with a pure zero-padding number format preserve the formatted leading zeros. CSV and XLSX member decoding reject malformed UTF-8. Existing limits remain in place: 100 MiB source file, 100,000 data rows, 100 columns, 4,000 characters per cell, bounded XLSX expansion and 4 MiB upload chunks.
5. **Row-error visibility.** Rejected rows are read through the existing tenant/RLS-scoped import_job_rows policy and displayed with row number and persisted rejection reasons. The UI pages through errors 100 at a time. Updating an import-job status now verifies a row was actually returned rather than treating a silent zero-row RLS update as success.
6. **Interrupted process safety.** CSV cancellation no longer certifies a partially processed chunk. Existing verified rows are upserted by batch and row number on retry. The new fail_import_job_safely RPC reconciles counts from persisted rows; if a finalization/cancellation already committed but its network response was lost, it returns the terminal state unchanged rather than downgrading the job to failed or creating a duplicate snapshot.
7. **Rollback and partial files.** Added a role- and tenant-guarded rollback command for the newest ready snapshot associated with a completed import. It archives the snapshot and marks the job rolled_back, keeps all import/snapshot rows, writes an audit record with the reason and actor, serializes against same-period finalization, and replays without a duplicate audit event. A non-full/partial source in merge mode is tested to retain prior canonical keys absent from the incoming file; absence from a partial file is not interpreted as a deletion command.
8. **Tests updated.** scripts/test-database-migrations.mjs covers source-aware replay, changed-file/source-key conflict, upload-session source mismatch, incomplete/cancelled finalization, persisted rejected-row reasons, failure recovery after lost finalize response, partial-merge preservation, rollback authorization/audit/history retention and replay. Unit/static tests cover required row values, exact matching key, padded XLSX identifiers, invalid UTF-8, resume manifest contracts, and paged rejection details.

## Acceptance status

- **Implementation:** code changes and tests are committed on the PR branch; independent execution evidence is still required.
- **Core:** UNVERIFIED until terminal success is confirmed on PR #179's final live head.
- **P2 Playwright critical paths:** UNVERIFIED until terminal success is confirmed on the same final live head.
- **PostgreSQL 17 migration/database acceptance:** required through the Core workflow; not marked PASS before the exact-head job result and logs are checked.
- **Independent review:** reviewer adnanabderab2016-sys requested on PR #179; request does not count as approval.
- **Production data:** not modified by this work.
- **Onyx Pro/ERP live import, production sync, and hosted credentials:** BLOCKED_EXTERNAL unless an authorized sandbox/receipt is available. No live integration is claimed.
- **Merge:** not yet performed. Merge only after required gates pass on the final head and independent review/policy requirements are satisfied.

## Exact acceptance mapping

| Requirement | Evidence in branch | State until final CI/review |
|---|---|---|
| File/batch/external source identity | DB columns, request payload, job/session consistency checks, UI source reference | UNVERIFIED |
| Request/file idempotency | Same-key replay and changed-payload/source reference PostgreSQL tests; existing file-hash duplicate flow | UNVERIFIED |
| External IDs and leading zeros | CSV row tests; XLSX number-format helper regression | UNVERIFIED |
| Required columns/types/row values | Missing-header rejection, exact matching-key rule, per-row required values and numeric validation | UNVERIFIED |
| Persisted row reasons | Paged service query and UI, rejected-row fixture in PG17 script | UNVERIFIED |
| Resume hash/manifest | Exact source hash/config fingerprint and complete contiguous manifest at finalizer | UNVERIFIED |
| Interrupted processing | Cancellation checkpoint guard and terminal-safe failure reconciliation tests | UNVERIFIED |
| Rollback without misleading partial state | Archive-only rollback, latest-snapshot lock, audit, retained rows, replay tests | UNVERIFIED |
| Partial input does not delete absent data | Merge regression asserts old canonical keys remain | UNVERIFIED |
| Large files, invalid data and permissions | File/row/cell/column/ZIP limits; malformed UTF-8; tenant checks; admin/manager rollback permission test | UNVERIFIED |

## NEXT ACTION — FIRST STEP ON RESUME

Fetch PR #179 and read its latest head SHA, then inspect the newest Core and P2 workflow runs for that exact SHA. For any failure, inspect the failing job log, fix the specific root cause on this same branch, and let CI rerun. Do not mark any matrix row PASS, merge, or claim production acceptance until exact-head evidence and independent approval are recorded.
