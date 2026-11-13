# P3 — Decision Memory Engine Regression Coverage

**Date:** 13 November 2026  
**Repository:** `Report-Engainall/Nasr1`  
**Base application SHA:** `5f23cd42e727c631604caacc7cfbca35dba5372d`  
**Owner:** P3 — intelligence engine  
**Status at commit:** IMPLEMENTED; exact-SHA CI PENDING

## Scope delivered

Added `src/lib/intelligence/decision-memory.test.ts` as a dedicated regression suite for the existing deterministic Decision Memory engine. No second engine, database contract, sample records, RPC, migration, or UI flow was created.

The suite asserts:

1. A genuinely empty, fully covered source is `EMPTY`, while a positive count with no rows is `UNAVAILABLE`.
2. Missing immutable snapshots are not presented as verified memory.
3. A paginated subset remains `PARTIAL` and retains its total-count warning.
4. Duplicate outcome identities fail closed; duplicate snapshots are ambiguous and their content is withheld.
5. A fact whose source evidence is not VERIFIED is excluded and counted as withheld.
6. A complete measured decision produces a comparison and a human-review draft only when the evidence, currency, formula, period and measured summary reconcile.
7. Cross-currency or unverified-source measurements do not produce a policy-review suggestion.
8. Similar-decision search returns only earlier decisions and rejects excessive limits/query lengths.

## CI wiring

The new test path was added to both push and pull-request filters in `.github/workflows/p1-admin-context-verification.yml`. This routes the change through the existing full Vitest, strict TypeScript and production-build workflow. No Vercel build/deployment is involved.

## Explicit blockers retained

- `IntelligenceWorkspace` still calls `buildDecisionMemoryBook` with `snapshots: []` because the current source does not expose an immutable, tenant-safe snapshot read DTO. This batch does not claim that saved snapshots are loaded in the UI.
- PostgreSQL 17 proof for the read contract, finance-role authorization, per-page foreign-tenant denial, stable pagination/fingerprint and authenticated browser proof remain OPEN.
- P1 CI had not yet reached a terminal result when this report was authored. No PASS is inferred.

## Files

- `src/lib/intelligence/decision-memory.test.ts`
- `.github/workflows/p1-admin-context-verification.yml`
- `docs/bolt-source-reconciliation/REMAINING_SCREEN_ACCEPTANCE_MATRIX_2026-10-22.csv`
- `docs/bolt-source-reconciliation/CURRENT_EXECUTION_STATE.md`
- This report

## Safety boundary

No SQL, migration application, RLS/Auth change, Supabase production operation, external provider, secret, paid service, Vercel action or deployment was used.

## Correction and follow-on integration — 13 November 2026

The prior note claiming the immutable read DTO did not exist was incorrect. Source inspection confirmed that migration `20261105270000_intelligence_decision_memory.sql` already returns the latest same-organization `memorySnapshot` in the existing authenticated `fetch_decision_outcomes` RPC. The client parser validates that DTO, and `fetchDecisionOutcomeCollection()` already implements bounded pagination, stable total checks, duplicate detection and a first-page fingerprint re-read.

The real gap was UI wiring: `IntelligenceWorkspace` used only the 50-row operational page while the memory book and precedent search should use the bounded full collection. This delivery integrates the existing collection into the workspace, keeping the operational register paginated at 50 while the memory book reads the stabilized historical collection (maximum 5,100). Partial history remains PARTIAL with an explicit source-coverage warning; it is never labeled complete.

Added regression coverage:
- Client: verified two-page collection and fingerprint, changed total during collection, duplicate identity across pages.
- Workspace: verifies decision-memory search includes an older record outside the first operational page, and changing operational pages does not refetch the full archive.

The parent source SHA `68da65ecc348d2fcba2f6850fd0b13b525184708` passed P1 Vitest, strict TypeScript and production build in GitHub Actions run `43364543729`. This follow-on source commit still requires its own exact-SHA P1 result. PostgreSQL 17 foreign-tenant runtime proof and authenticated browser order/tenant proof remain separate and OPEN/SKIPPED. No new migration or production DB write was made.

## P1 failure and targeted repair — 13 November 2026

The follow-on integration commit `be795e52c1a68281708eb63d6f565ec94129d94d` did **not** pass P1. Its production build succeeded, but Vitest recorded 634 passed / 4 failed and strict TypeScript reported three `snapshotAt` references as undefined.

The errors were localized:
- The timestamp ref also serves three existing point-in-time intelligence requests. It is restored along with its refresh effect.
- The archive UI intentionally displays 25 records per visual page. The integration test now navigates to the last page before asserting access to record 51; the archive collection itself remains fully loaded and independent of the 50-row operational register.

The repair commit is subject to a fresh exact-SHA P1 run. No prior PASS is carried forward.

## Exact-SHA repair acceptance — 13 November 2026

**Verified source SHA:** `880788208fabeb840a6639b38dc133a75f85603d`

**P1 GitHub Actions run:** `43365691627` — terminal SUCCESS.

- Vitest regression suite: SUCCESS.
- Strict TypeScript: SUCCESS.
- Production application build: SUCCESS.

This result is tied to the exact SHA above; no results from its parent or earlier commits were transferred.

**P2 GitHub Actions run:** `43365691641`. The authenticated E2E infrastructure gate completed SUCCESS but is only an availability gate. Public read-only Storefront Playwright smoke was still running when this checkpoint was written. The customer order and tenant-isolation job was SKIPPED; therefore it is not an acceptance pass. PostgreSQL 17/authenticated cross-tenant read and write denial remain OPEN.

The P1 failures on the intermediate candidate were corrected and rerun: the shared snapshot clock was restored, and the UI test now navigates the memory book's independent 25-record display pages before checking older history. No production DB writes, migrations, RLS/Auth changes, Vercel builds or deployments were performed.
