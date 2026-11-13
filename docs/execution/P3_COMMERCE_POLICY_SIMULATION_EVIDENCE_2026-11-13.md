# P3 — Commerce Policy Simulation Evidence Parser Hardening

**Date:** 13 November 2026  
**Repository:** `Report-Engainall/Nasr1`  
**Base main SHA:** `253dfbe832e433ec1d2f1a9346fe56f4d926f4c3`  
**Matrix:** `REF-POLICY-SIMULATION-EVIDENCE-001`  
**Status:** staged, not pushed; waiting for active P2 workflow to finish

## Source contract

Inspected existing migration `supabase/migrations/20261106030000_intelligence_commerce_policy_governance.sql`. All five supported simulation branches produce an outcome with `noWrite=true` and one or more source references. The persisted history RPC enforces limit 1..100, manager scope, tenant scope, and finance-only access to customer-credit history.

## Gaps and staged fixes

- Exported history parser did not independently validate its `limit` (the fetch wrapper did).
- History parser accepted an empty `sourceRefs` array although every SQL simulation branch returns at least one source.
- Duplicate UUID comparison for history IDs was case-sensitive.
- Simulation parser relied on TypeScript's union for `expectedType` without validating an untrusted runtime value.

The staged change adds fail-closed checks and a dedicated Vitest suite for all five simulation types, outer/nested no-write, expected/outcome type parity, malformed fingerprints/UUID/time, history counts and limits, source refs, duplicate identities and no-RPC invalid-limit behavior.

## Workflow and safety

P1 filters are staged to include the source and test on push and pull request. No SQL/RPC/RLS/role changes, no business mutation, no hosted DB access, and no deployment.

This package is deliberately not pushed yet: P2 run `43370121093` is still executing local PostgreSQL 17 acceptance for the multi-source Growth Opportunity Radar. Pushing while the workflow's `cancel-in-progress` group is active would interrupt acceptance.

## Exact-SHA P1/P2 acceptance — 13 November 2026

**Source SHA:** `712ade47af5a6a5185800452eb8627a4e946cfd3`

**P1 run 43371555651 — SUCCESS**
- Vitest: 691/691 across 95 files.
- Commerce-policy simulation evidence suite: 22/22.
- Strict TypeScript: SUCCESS.
- Production Build: SUCCESS.

**P2 run 43371555744 — SUCCESS**
- Public Storefront Playwright: 19/19.
- Local Supabase/PostgreSQL 17 migrations and isolated tenant fixtures: SUCCESS.
- Endpoint guard allow/deny; atomic price rollback/audit/stale-writer race; cash expense posting/idempotency/concurrency; purchase receipt source links and restrictions: SUCCESS.
- Authenticated Chromium: order persistence and cross-tenant denial (403 / 42501; foreign-customer tier unchanged), warehouse and purchase-order XLSX, checkout lost-response replay, return/credit memo, audited Onyx export, finance/task print, customer-manager financial privacy/audit, and device-session authorization/immediate revocation: SUCCESS.
- Proof boundary, local service cleanup and artifact upload: SUCCESS.

The external secret-gated hosted E2E job remains SKIPPED and is not a pass. Local PostgreSQL 17 and authenticated Playwright proof did run and passed. The local authenticated artifact is [14012982176](https://github.com/Report-Engainall/Nasr1/actions/runs/43371555744/artifacts/14012982176); public UI artifact is [14012344204](https://github.com/Report-Engainall/Nasr1/actions/runs/43371555744/artifacts/14012344204).

No hosted database, production data, migration change, RLS/Auth change, paid service, Vercel build or deployment was used.
