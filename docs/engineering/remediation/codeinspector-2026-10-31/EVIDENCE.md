# EVIDENCE — CodeInspector remediation

## Baseline
- Source: \`docs/bolt-source-reconciliation/CURRENT_EXECUTION_STATE.md\`, latest checkpoint dated 2026-11-01.
- CodeInspector report date: 2026-10-31 22:02 UTC.
- 703 files / 127,555 LOC / 239 findings.
- Confirmed aggregate counts: TS0003=170, TS0002=3, PY0002=3, PY0003=2, plus 18 duplicate TS0004/TS0009 fixture heuristics.
- Raw report, scanner version and exact scan SHA were not available in the checked-in repository or searched Library. The 114 task-specified operational TS0003 rows are not yet enumerated.

## P2 implementation
- Branch: \`fix/codeinspector-p2-typescript\`
- Base: \`46f2fce34c09f64284fdbbe4182bd0f2b7ab36dc\`
- Code/test SHA: \`df638a3aeec409cfcd7cd84a86d31b8e476acb46\`
- Added typed outbox handler; shortened Edge entrypoint; added handler and source-wiring tests.
- Files: \`supabase/functions/outbox-worker/handler.ts\`, \`supabase/functions/outbox-worker/index.ts\`, \`src/test/outbox-worker-handler.test.ts\`, \`src/test/outbox-worker-source.test.ts\`.
- Database/RLS/migrations: no changes.
- Exact-SHA test state: NOT RUN; no PASS claimed.
- Merge: pending.

## TS0010 inspection
- Current source blob: \`653f28ed7dcd082ba02a8fe61efce2f0d24018b3\`.
- No \`any\` token in the page; current type is \`InventoryTransferHistoryRow\`, defined at \`src/lib/api.ts:1630-1647\`.
- Classification: FALSE_POSITIVE_CANDIDATE only; original CodeInspector row is required for final disposition.

## P1 / P3
- P1 branch not found at initialization; no commit evidence received.
- P3 branch not found at initialization; no commit evidence received.

## Acceptance still required
- Exact TypeScript typecheck, focused Vitest, lint and production build.
- Core and P2 SUCCESS on the same PR head SHA.
- Fresh CodeInspector scan with scanner version and exact input SHA.
- Complete 114-row TS0003 inventory and evidence-based classification.
- P1/P3 exact commits, path-conflict review and integration evidence.

## Current exact-SHA evidence — 2026-11-01

| Gate | SHA | Result | Run |
|---|---|---|---|
| P1 Core | 1e51d807f48da02be4e21375769f26bb793d8efd | PASS | 41255917802 |
| P1 Gitleaks | 1e51d807f48da02be4e21375769f26bb793d8efd | PASS | 41255917793 |
| P1 Playwright | 1e51d807f48da02be4e21375769f26bb793d8efd | PASS; hosted tenant subtest SKIPPED | 41255917900 |
| P2 code-head Core | 767744ef57e6f24e7b3f707d8b9cd0ae1e257762 | PASS | 41255608732 |
| P2 current docs-head Core | 0bb0f017cbfe283d2cd1d93e651a855fe4ba76d6 | IN_PROGRESS | 41256346720 |
| P2 current docs-head Playwright | 0bb0f017cbfe283d2cd1d93e651a855fe4ba76d6 | IN_PROGRESS | 41256346732 |
| P3 Core | c8aa51c7d1f5bcd71e0b77d69bf763b34a5fa688 | PASS | 41255986179 |
| P3 tooling | c8aa51c7d1f5bcd71e0b77d69bf763b34a5fa688 | PASS | 41255986180 |
| P3 PG17 import / export | c8aa51c7d1f5bcd71e0b77d69bf763b34a5fa688 | PASS / PASS | 41255986181 / 41255986177 |
| P3 Playwright | c8aa51c7d1f5bcd71e0b77d69bf763b34a5fa688 | CANCELLED | 41255986229 |

Original CodeInspector scan SHA UNKNOWN. Main SHA 46f2fce34c09f64284fdbbe4182bd0f2b7ab36dc. No merge claimed.