# P3 CHECKPOINT — Arabic natural-language query-window guardrails — 2026-11-16

- Repository: `Report-Engainall/Nasr1`; canonical branch: `main`.
- Base HEAD before this increment: `0b3f610f5bd45f23fc597fc808850e8b59d498d8`.
- Code/test SHA: `61ab1b8bd5c5fc3c8b08635af8172f5199563877`.
- Source commit: `4f8eda48e1c3587e9680044ba98022931a0e5de4`.
- Regression-test commit: `61ab1b8bd5c5fc3c8b08635af8172f5199563877`.

## Defects found and corrected

1. `src/lib/intelligence/natural-language-assistant.ts` — Growth Radar duration matcher used a double-escaped whitespace token in a regular-expression literal. Arabic requests such as `رادار النمو آخر 30 يوماً` did not capture the requested duration and silently fell back to the 90-day default. The matcher now captures the explicitly requested 30/60/90/180/365-day window and existing month/year aliases.
2. The task-quality historical-window guard used the same double-escaped whitespace mistake. A request such as `جودة المهام آخر 30 يوماً` could pass as a current-snapshot question even though the source does not support historical filtering. The guard now recognizes numeric and named relative windows and returns `UNSUPPORTED` before any data read.

## Regression coverage added

- `src/lib/intelligence/natural-language-assistant-client.test.ts` adds cases for all supported Growth Radar windows (30/60/90/180/365 days), 3/6 months and one year; the 90-day default only when no duration is requested; unsupported 10-day and calendar-quarter requests; historical task-quality 30-day and weekly requests; no RPC/provider call for a historical task-quality query; and continued support for the current task-quality snapshot.
- Existing purchase-order local execution and authorization-denial tests remain intact.
- P1 workflow path filters already include `src/lib/intelligence/natural-language-assistant-client.test.ts`; no workflow file was changed.

## Changed paths only

- `src/lib/intelligence/natural-language-assistant.ts` — blob `afd2a020b4580b9175066138b7662c8465ef2bd1`.
- `src/lib/intelligence/natural-language-assistant-client.test.ts` — blob `90e8bd1746fe27fe30e26f270fc28fca75326710`.

No change to the UI, existing RPC contracts, SQL/migrations, RLS/grants, tenant/role authorization, financial/inventory calculations, provider credentials, Edge deployment, or external integrations. No database query or write, production mutation, deployment, paid provider, or Vercel operation was performed.

## Exact-SHA evidence boundary

- **IMPLEMENTED_ON_MAIN:** yes, source and regression tests are committed at `61ab1b8bd5c5fc3c8b08635af8172f5199563877`.
- **TESTS_AUTHORED:** yes; 15 new parameterized/standalone cases plus the two pre-existing client tests (17 cases in total).
- **P1 Vitest / strict TypeScript / production build on this SHA:** **NOT VERIFIED at checkpoint creation**. GitHub's combined status wrapper returned no status entries and the available workflow-run wrapper did not expose push-triggered runs. Do not treat an empty status response as PASS.
- **P2/runtime/DB/browser acceptance:** not required for these pure parser corrections and not run. Existing Growth Radar and task-quality data/RPC acceptance remains separately open.
- No earlier SHA result is transferred to this change. The project release remains **NO-GO**.

## Next action

Read the exact-SHA P1 push workflow result for `61ab1b8bd5c5fc3c8b08635af8172f5199563877`. If Vitest, strict TypeScript, or build fails, fix only the failure introduced by these paths and rerun on the resulting SHA. Keep the Growth Radar and task-quality acceptance rows open until their existing source/DB authorization acceptance is independently completed.
