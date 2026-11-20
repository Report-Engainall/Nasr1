# P3 — Task Quality Insight Pack — Confidence Semantics and Regression Coverage

**Date:** 13 November 2026  
**Repository:** `Report-Engainall/Nasr1`  
**Base main SHA:** `8ecf74f61157ddbbf4d3f2f927081fd6e24ee5cc`  
**Owner:** P3 deterministic interpretation engine  
**Scope:** `REF-TASK-QUALITY-INSIGHT-PACK-001`

## Defect fixed

The repeated-cause leader previously received state `READY` for any qualifying repeated cause, even when only two distinct tasks supported it. That contradicted the engine's five-observation low-sample threshold and overstated confidence in a manager-facing pattern.

The card now derives confidence from `affectedTaskCount`, not from its review count. Two to four distinct tasks are `LOW_SAMPLE`; five or more are `READY`. Review repetitions on the same task cannot inflate confidence.

## Source-state language corrected

The shared state footnote now has explicit `EMPTY`, `RESTRICTED` and `UNAVAILABLE` semantics. An empty source no longer says it is permission-blocked or unavailable; it explicitly states that no saved reviews exist and that absence is not proof of good performance. Restricted data is not read, and unavailable data is not replaced with zeros.

## Regression coverage added

A new suite at `src/lib/intelligence/task-quality-insights.test.ts` covers:
- restricted, unavailable and empty source states;
- six stable insight identities and absence of a synthetic composite score;
- repeated-cause confidence at 2, 5 and deterministic tie-breaks;
- actionability, approval, deferred and false-alarm denominator semantics;
- withholding zero-denominator rates and zero-visible-task coverage;
- review-coverage confidence threshold;
- source object immutability.

No task, decision, workflow, policy, alert, inventory, credit or financial mutation is performed by this deterministic read-only engine.

## Acceptance

This source commit must pass the P1 Vitest suite, strict TypeScript and production build on its exact SHA. P2 local PostgreSQL and authenticated browser tests are required only if the change touches an authorization contract or persistence; this batch does not. No hosted database, production data, provider, deployment or Vercel change is involved.

## Locale-sensitive assertion correction — 13 November 2026

The first exact-SHA P1 run `43369570643` on `2ca3cf701486a2e64fdd9db3595cdf91dfbb7b5b` reported 652 passed / 5 failed. All five failures were string assertions expecting Latin digits inside Arabic `ar-YE` formatted evidence. Node's ICU rendered those counts with Arabic-Indic digits (for example `١٢`). The other eight Task Quality Insight tests passed.

The test suite now normalizes Arabic-Indic and Persian digits before numeric text comparisons. Product-facing Arabic formatting is deliberately unchanged. The repaired commit needs a fresh exact-SHA P1 run; no PASS is carried forward.

## Terminal P1 acceptance — exact feature SHA

GitHub Actions run `43369818794` completed **SUCCESS** on exact test/feature SHA `bcf0de77a0794e073e562e23ea83ae68746c117e`:
- Vitest: 657/657 tests across 92 files.
- New Task Quality Insight suite: 13/13 tests.
- Strict TypeScript: SUCCESS.
- Production Build: SUCCESS.

The current main descendant `1917eece605c1469134eadfefcc4feb30851e65b` adds an independent multi-source Growth Opportunity Radar. It does not alter the task-quality engine; separate P1/P2 checks for that delivery are tracked independently.

The existing quality-review source migration/RPC authorization and tenant data acceptance remain a distinct runtime requirement.
