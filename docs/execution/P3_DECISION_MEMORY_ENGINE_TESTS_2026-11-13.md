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
