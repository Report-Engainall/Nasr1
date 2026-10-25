# P3 Execution Checkpoint — live resume record

## Current state — 2026-10-25 05:00 +03:00

- **Status:** IMPLEMENTATION MERGED; exact-head acceptance and post-merge Core CI PASS. Live external Onyx Pro round-trip remains NOT_PROVEN / BLOCKED_EXTERNAL.
- **Repository:** `Report-Engainall/Nasr1`; production reference: `main`.
- **MAIN_SHA_AT_RESUME:** `fbf7d4878b440baacdf34f12c35459b24507b04d`.
- **MAIN_SHA_AFTER_P3_MERGE:** `bb67a4ae26285ed402ee0e9b8b945a8d0abe752c`.
- **P3_BRANCH:** `p3/acceptance-resume-and-onyx-evidence-20261025`.
- **P3_FEATURE_HEAD:** `6fd4eaed21d1490d020b4b3b4f76db6fa59db64c`.
- **MERGED_PR:** [PR #207](https://github.com/Report-Engainall/Nasr1/pull/207), squash merge `bb67a4ae26285ed402ee0e9b8b945a8d0abe752c).
- **EXACT_HEAD_CORE:** [run 40152320592](https://github.com/Report-Engainall/Nasr1/actions/runs/40152320592) SUCCESS on `6fd4eaed21d1490d020b4b3b4f76db6fa59db64c`.
- **EXACT_HEAD_P2:** [run 40152320526](https://github.com/Report-Engainall/Nasr1/actions/runs/40152320526) SUCCESS on the same feature SHA. Public no-write storefront smoke and local-Supabase authenticated acceptance both passed; hosted customer/tenant E2E was explicitly SKIPPED at the external-credentials gate.
- **UNIT_ACCEPTANCE:** 188/188 test files and 1,217/1,217 tests passed; the new `src/test/onyx-source-evidence-contract.test.ts` passed all 10 tests on both the PR head and post-merge SHA.
- **ISOLATED_POSTGRESQL_17:** migration/core acceptance, executive analytics, quote decision, invitation expiry/audit, stock-count audit, async export lifecycle, concurrent import request idempotency, inventory snapshot, storefront saved-products, backup/restore and Onyx workflows passed on exact PR head. Logs record:
  - `PASS Onyx inventory reconciliation` — tenant and warehouse scope, preview no-write, idempotent apply/rollback, reservations, stale preview/apply and audit movements.
  - `PASS Onyx reconciliation two-session concurrency` — one apply, one replay, one stock movement and one audit.
  - `PASS Onyx source evidence` — source hash match/mismatch, external ID bounds, no inferred sync proof, and staff/customer/inactive/foreign-tenant denial.
- **LOCAL_BROWSER_ACCEPTANCE:** P2 local-Supabase job in run 40152320526 SUCCESS. It applied repository migrations to local PostgreSQL 17 and passed endpoint guard cases, atomic price-grid rollback/audit/stale-writer race, cash-expense idempotency/concurrency, purchase receipt accounting restrictions, authenticated order persistence/cross-tenant denial, customer return/credit memo flow, audited Onyx order XLSX export, finance/task print, customer-manager privacy/authorization/audit, and central device-session revocation.
- **POST_MERGE_CORE:** [run 40152650423](https://github.com/Report-Engainall/Nasr1/actions/runs/40152650423) SUCCESS on exact current main `bb67a4ae26285ed402ee0e9b8b945a8d0abe752c`, including unit tests, isolated PostgreSQL 17 workflows, lint, build, preview/dev-server smoke and Chromium price-visibility acceptance.
- **IMPLEMENTED_CHANGE:** `src/lib/onyx-source-evidence.ts` now strictly validates UUID group structure for sync-attempt IDs and optional snapshot/order IDs. The prior broad hyphen/hex check accepted structurally invalid UUID strings. The error path now reports invalid attempt ID directly instead of a generic incomplete-field error.
- **REGRESSION_COVERAGE:** `src/test/onyx-source-evidence-contract.test.ts` covers source/import provenance, explicit hash mismatch, unsupported live-proof claims, cross-tenant evidence, missing source identity, malformed attempt/snapshot/order UUIDs, and a structurally valid pending attempt.
- **SOURCE_RECONCILIATION:** Compared `Nasr-Adnan/Nasr-Adnan` at observed main SHA `34702e670d80e80340d54683171238292099cbaa`. The implementation already existed in Nasr1; only missing contract tests were adapted. No runtime source implementation, migrations, lockfiles, archive, secrets or production data were copied.
- **FILES_CHANGED_AND_MERGED:** `src/lib/onyx-source-evidence.ts`; `src/test/onyx-source-evidence-contract.test.ts`; this execution checkpoint; `PROGRAMMER_3_ROUTE_ACCEPTANCE_REGISTER.md`. No schema or production database changes.
- **ONYX_LIVE_SYNC:** NOT_PROVEN / BLOCKED_EXTERNAL. Local database evidence and saved snapshots do not prove a real provider call. No approved non-production Onyx Pro endpoint/credential and verified API contract were available; no external request or production write was attempted.
- **LOCAL_TEST_LIMITATION:** Repository tests were executed by GitHub Actions on exact SHAs; they were not run from this session's shell because the runtime could not resolve github.com and had no cloned checkout. Claims above refer to the linked CI evidence, not a local test invocation.
- **NEXT_ACTION:** Obtain an approved non-production Onyx Pro endpoint, credentials and API contract. Then implement/run a real provider round-trip with request/response hashes, external IDs, tenant scope, idempotency, timeout/retry, concurrency and failure-state verification. Until an actual provider response is captured, keep external sync labelled NOT_PROVEN. Keep hosted customer/tenant E2E SKIPPED/BLOCKED_EXTERNAL unless its separate authorized credential gate is met.
- **BLOCKERS:** Missing approved Onyx Pro API contract/credentials; hosted customer/tenant E2E external credential gate. These do not invalidate successful local-Supabase acceptance.
- **UPDATED_AT:** 2026-10-25 05:00 +03:00.
