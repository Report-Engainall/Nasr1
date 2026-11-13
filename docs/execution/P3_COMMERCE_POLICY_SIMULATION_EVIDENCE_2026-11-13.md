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
