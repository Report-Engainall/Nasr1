# EVIDENCE — CodeInspector remediation / current checkpoint

## Recovered scan source
- Library attachment: `scan-5a0dd3e4-941c-45bc-98df-05e0e9aa19f4.pdf` (21 pages; Files ref `turn43file0`).
- Report timestamp: `2026-10-31T22:02:18.5552070Z`.
- Totals: 703 files, 127,555 LOC, 239 findings.
- Original scan input SHA: `UNKNOWN`; scanner version: not stated in the PDF.
- Complete finding inventory: `BASELINE.json` (239 records, stable IDs, ownership and path-resolution states).

## Verified baseline distribution
- Rule IDs: TS0003=170; TS0002=3; TS0010=1; TS0004=9; TS0009=9; JS0001=12; JS0007=26; JS0005=2; PY0002=3; PY0003=2; PY0005=2.
- Severity: Critical=18; High=15; Medium=177; Low=29.
- Ownership: P1=25; P2=116; P3=98.
- P2 TS0003: 114 total; 104 current active-tree paths, 10 archived reference snapshots. Do not edit archived code as live application code.
- Duplicate disposition: no duplicates confirmed; repeated same-rule/basename/line records remain candidates until source path identity is proven.
- False-positive disposition: none closed. P1's 18 paired TS0004/TS0009 fixture findings are triaged as fixture-only but stay open pending analyzer verification. TS0010 is not reproduced on inspected main, but remains open because the scan SHA is unknown.

## P2 Outbox — exact code/test evidence
- Code/test SHA: `767744ef57e6f24e7b3f707d8b9cd0ae1e257762`.
- Core / Aghbari Commerce run [41255608732](https://github.com/Report-Engainall/Nasr1/actions/runs/41255608732): SUCCESS. Includes unit tests, focused strict TypeScript check, isolated PostgreSQL 17 acceptance, lint/build and browser price visibility.
- P2 Playwright run [41255608752](https://github.com/Report-Engainall/Nasr1/actions/runs/41255608752): local Supabase authenticated E2E job SUCCESS; public UI smoke SUCCESS. Hosted customer-order/tenant isolation job SKIPPED because dedicated hosted test tenants/write access were not available. SKIPPED is not PASS.
- The 4096-byte boundary and `content-length` handoff are pinned by `src/test/outbox-worker-source.test.ts`; the bounded reader also enforces streamed byte count in `supabase/functions/_shared/bounded-body.ts`.
- No database/RLS/migration changes in the Outbox refactor.

## P1 evidence — exact-head status
- PR #339 latest head at checkpoint: `da9b1ad36a287ee9107e69a28bffc2cd2b6ced7d`.
- Gitleaks full-history scan [41256370447](https://github.com/Report-Engainall/Nasr1/actions/runs/41256370447): SUCCESS on that head.
- Core [41256370438](https://github.com/Report-Engainall/Nasr1/actions/runs/41256370438): IN_PROGRESS at last poll.
- P2 Playwright [41256370536](https://github.com/Report-Engainall/Nasr1/actions/runs/41256370536): local Supabase job IN_PROGRESS at last poll; hosted test SKIPPED.
- Previous results on SHA `1e51d` are not transferred to `da9b1ad`.

## P3 evidence — exact-head status
- PR #340 latest head at checkpoint: `fba12d40e428974b2640ce358c498f1c04155154`; Draft/open.
- Core [41256077892](https://github.com/Report-Engainall/Nasr1/actions/runs/41256077892): SUCCESS.
- Tooling [41256077934](https://github.com/Report-Engainall/Nasr1/actions/runs/41256077934): SUCCESS (Python 3.12 compile/self-tests; Node 22 syntax, Service Worker and logger redaction checks).
- PostgreSQL 17 async export [41256077957](https://github.com/Report-Engainall/Nasr1/actions/runs/41256077957): SUCCESS.
- PostgreSQL 17 import finalizer [41256078039](https://github.com/Report-Engainall/Nasr1/actions/runs/41256078039): SUCCESS.
- P2 Playwright [41256077918](https://github.com/Report-Engainall/Nasr1/actions/runs/41256077918): IN_PROGRESS at last poll; do not promote Draft until terminal and reviewed.

## Integration state
- Latest observed `main` SHA: `46f2fce34c09f64284fdbbe4182bd0f2b7ab36dc`; no merge yet.
- P2 documentation-inclusive head at last poll: `9ae3101d91bbedb63cfb24e7cdd3425b1f3f6593`; Core run 41256411384 IN_PROGRESS; Playwright run 41256411365 PENDING.
- Formal independent approval was not recorded. Branch-protection GET returned 403 to this integration, so the exact required-review setting could not be read; no protection is bypassed.
- Every PASS above is attached to the SHA shown; no PASS is transferred to later heads.
- Fresh CodeInspector scan has not been run; do not label findings fixed from refactor count alone.


---

## Historical log preserved — superseded by the live snapshot above

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