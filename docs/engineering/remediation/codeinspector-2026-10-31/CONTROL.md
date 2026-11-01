# CONTROL — CodeInspector remediation / live control snapshot

## Source of truth
- Repository: `Report-Engainall/Nasr1`
- Product: متجر الأغبري | Aghbari Commerce
- Integration target: `main`
- Last verified `main` SHA: `46f2fce34c09f64284fdbbe4182bd0f2b7ab36dc`
- No PR from this remediation stream has been merged as of this checkpoint.
- Original report: `scan-5a0dd3e4-941c-45bc-98df-05e0e9aa19f4.pdf`, recovered from Library ref `turn43file0`; report time `2026-10-31T22:02:18.5552070Z`.
- `ORIGINAL_SCAN_SHA=UNKNOWN`; scanner version not stated in the PDF.

## Baseline / ownership
- 239 findings across 703 files and 127,555 LOC.
- Rule totals: TS0003=170, TS0002=3, TS0010=1, TS0004=9, TS0009=9, JS0001=12, JS0007=26, JS0005=2, PY0002=3, PY0003=2, PY0005=2.
- Severity: Critical=18, High=15, Medium=177, Low=29.
- Ownership: P1=25; P2=116 (114 TS0003 + 1 TS0002 + 1 TS0010); P3=98.
- P2 TS0003 split: 104 current-tree active paths + 10 READY_TO_REUSE archived reference paths. The archived ten are not active runtime edit targets.
- All 239 records are present in `BASELINE.json`; path resolution records 229 exact current-tree paths and 10 archive-only paths.
- Confirmed duplicate findings: 0. Confirmed false positives: 0. The 18 TS0004/TS0009 rows are P1 fixture-only triage candidates pending fresh analyzer verification; do not count as closed.

## Live PR / branch / CI status at checkpoint
| Role | PR | Branch SHA at last check | PR state | Exact-head evidence |
|---|---:|---|---|---|
| P1 | #339 | `da9b1ad36a287ee9107e69a28bffc2cd2b6ced7d` | Ready / open | Gitleaks run 41256370447 PASS; Core 41256370438 and Playwright 41256370536 IN_PROGRESS |
| P2 | #338 | `9ae3101d91bbedb63cfb24e7cdd3425b1f3f6593` | Ready / open | Core 41256411384 IN_PROGRESS; Playwright 41256411365 PENDING |
| P3 | #340 | `fba12d40e428974b2640ce358c498f1c04155154` | Draft / open | Core 41256077892 PASS; tooling 41256077934 PASS; PG17 export 41256077957 PASS; PG17 import 41256078039 PASS; Playwright 41256077918 IN_PROGRESS |

Historical PASS results are SHA-bound and are not substituted for later PR heads. P2 Core and local Playwright both passed on code/test SHA `767744ef57e6f24e7b3f707d8b9cd0ae1e257762`; those results do not replace the runs required for the documentation-inclusive P2 head. On that earlier P2 run the hosted customer-order / tenant E2E job was SKIPPED because the hosted non-production tenant environment and write approval were unavailable; local isolated Supabase tenant-denial and order-persistence acceptance passed.

## P2 technical status
- TS0002 `supabase/functions/outbox-worker/index.ts:31`: refactored into typed `handler.ts`; preserves POST/auth validation, 4096-byte bounded body with content-length hint, batch default 20/range 1–50, 300-second lease, RPC names/parameters, sequential processing, and sanitized failure persistence.
- Exact source boundary assertion verifies the 4096 cap and `content-length` forwarding. Focused TypeScript and Core CI passed on code/test SHA `767744e`; P2 local authenticated Playwright passed on that SHA.
- No DB migration, RLS, accounting, inventory, or production integration changes in the Outbox refactor.
- TS0010 page currently has zero `any` tokens and uses `InventoryTransferHistoryRow`; leave `NOT_REPRODUCED / NOT_CLOSED` until the original input SHA is identified.
- The 114 operational TS0003 records are now enumerated. They are OPEN; 10 correspond to archived reference snapshots, not active runtime paths. Do not mass-refactor files without per-path ownership and behavioral evidence.

## Integration hazards / controls
- P2 initially included placeholder `P1.md` and `P3.md` files, while PR #339 and #340 own those same paths. This checkpoint removes those two files from P2 so their owner PRs add the canonical logs without Add/Add conflicts. P2 retains `CONTROL.md`, `BASELINE.json`, `P2.md`, and `EVIDENCE.md`.
- Formal independent human approvals are not recorded at this checkpoint. A self-review by the PR author is not an independent approval.
- Branch-protection endpoint returned HTTP 403 to the connected integration; required-review rules could not be inspected. Do not bypass protections or merge around a required review.
- No force push, ruleset weakening, workflow skipping, or DB/RLS workaround.

## Resume cursor
1. Re-read live branch refs and PR heads; this document records a checkpoint, not a substitute for GitHub's live SHA.
2. Finish Core and P2 Playwright for the current P2 PR head; require both terminal SUCCESS on the same SHA.
3. Resolve the independent review / repository protection gate, then merge #338 using expected-head SHA and verify the merge commit on `main`.
4. P1 #339 must finish Core and local P2 Playwright on its latest head; integrate after #338 with fresh exact-head checks.
5. P3 #340 must finish Core and Playwright on its latest head; move Draft to Ready only after review and exact-head gates.
6. Run a fresh CodeInspector scan when an authorized scanner workspace is available. Keep the original scan SHA UNKNOWN until supported by evidence; do not claim the 114 TS0003 issues closed from a manifest alone.
7. After every merge, update `main` SHA, rebase/retarget remaining work without force-push, and rerun the affected CI.


---

## Historical log preserved — superseded by the live snapshot above

# CONTROL — CodeInspector remediation 2026-10-31

## Live snapshot — 2026-11-01

Repository: Report-Engainall/Nasr1; target main; current main SHA 46f2fce34c09f64284fdbbe4182bd0f2b7ab36dc. No merge has occurred.
Recovered report: scan-5a0dd3e4-941c-45bc-98df-05e0e9aa19f4.pdf; original scan input SHA UNKNOWN; report time 2026-10-31T22:02:18.5552070Z.
Baseline: 239 findings / 703 files / 127,555 LOC.
Rule totals: TS0004=9, TS0009=9, TS0002=3, JS0001=12, JS0007=26, PY0005=2, TS0010=1, TS0003=170, JS0005=2, PY0002=3, PY0003=2.
Ownership: P1=25; P2=116 (114 TS0003 + 1 TS0002 + 1 TS0010); P3=98.
P2 TS0003: 104 active current-tree rows, 10 archived READY_TO_REUSE rows. Archive rows remain tracked but are not live application edit targets.
Path resolution: 229 exact active tree paths + 10 archive-only paths. No unresolved file names after OCR normalization and contextual resolution.
TS0004/TS0009: 18 paired detector rows at 9 fixture locations; P1 triaged them as test-only values, pending fresh scanner verification.

## Current branches / pull requests

| Role | Branch SHA | PR | State | Exact-head checks |
|---|---|---:|---|---|
| P1 | 1e51d807f48da02be4e21375769f26bb793d8efd | #339 | Ready/open | Core PASS; Gitleaks PASS; local Supabase Playwright PASS; hosted tenant E2E SKIPPED |
| P2 | 0bb0f017cbfe283d2cd1d93e651a855fe4ba76d6 | #338 | Ready/open | Previous code head Core PASS; current docs-only head CI running |
| P3 | c8aa51c7d1f5bcd71e0b77d69bf763b34a5fa688 | #340 | Draft/open | Core PASS; tooling PASS; PG17 import/export PASS; Playwright CANCELLED |

No PR in this remediation stream has been merged. Formal independent approval is not recorded. P2's review suggestion to pin the 4096-byte Outbox body cap and content-length handoff is implemented in the source test.

## Evidence links

- P2 Core on code/test head 767744ef: run 41255608732 SUCCESS. Docs/manifest commit 0bb0f017 triggers new Core 41256346720 (IN_PROGRESS) and Playwright 41256346732 (IN_PROGRESS).
- P2 Playwright 41255608752 remains IN_PROGRESS on code/test head 767744ef; public smoke and infrastructure gate pass, hosted tenant test skipped, local Supabase job was still running at last poll.
- P1 Core 41255917802 SUCCESS; Gitleaks 41255917793 SUCCESS; Playwright 41255917900 SUCCESS on exact head 1e51d807. Its local Supabase order persistence/tenant isolation passed, but hosted customer-order/tenant test was SKIPPED.
- P3 Core 41255986179 SUCCESS; tooling 41255986180 SUCCESS; PG17 import 41255986181 SUCCESS; PG17 export 41255986177 SUCCESS on exact head c8aa51c7. Playwright 41255986229 CANCELLED.

## Implementation notes

P2 Outbox extraction preserves POST/auth checks, 4096-byte bounded request body, default batch 20, bounds 1–50, lease 300 seconds, RPC names and parameter keys, sequential processing and sanitized failure persistence. No DB/RLS/migration/accounting/inventory modification.
P2 TS0010 current source uses InventoryTransferHistoryRow and contains no any token. Keep NOT_REPRODUCED / NOT_CLOSED because original scan SHA is unknown.
P1 changes are limited to security/test helper refactoring and Gitleaks gate in the reviewed PR diff; no production auth/RLS/migration change was found.
P3 touches Service Worker MIME cache behavior, diagnostic logger, JS/Python tools and tests. Earlier test double omitted FetchEvent.waitUntil; fixture now captures/awaits lifecycle promises. Production service worker was not weakened.
No force-push, bypass, branch-protection weakening, or database/RLS workaround used.

## Resume cursor

1. Finish current P2 docs-head Core and Playwright 41256346720/41256346732. Do not merge #338 until exact current head and review acceptance are satisfied.
2. P1 checks pass on 1e51d807; review and rebase after P2 merge, then rerun after any new SHA.
3. P3 checks pass except Playwright is CANCELLED; rerun it on current head before making #340 ready.
4. Run fresh CodeInspector with scanner version. Keep ORIGINAL_SCAN_SHA=UNKNOWN until a real source SHA is proven.

---

## Historical initialization notes (superseded by the live state above)

# CONTROL — CodeInspector remediation 2026-10-31

## Source of truth
- Product: Aghbari Commerce
- Repository: \`Report-Engainall/Nasr1\`
- Integration target: \`main\`
- Main SHA at start: \`46f2fce34c09f64284fdbbe4182bd0f2b7ab36dc\`
- P2 branch: \`fix/codeinspector-p2-typescript\`
- P2 code/test SHA: \`df638a3aeec409cfcd7cd84a86d31b8e476acb46\`
- CodeInspector report date: 2026-10-31 22:02 UTC
- The current branch head may include documentation-only commits after the code/test SHA. Always read the live branch ref on resume.

## Scan baseline
- 703 files; 127,555 LOC; 239 findings.
- Current checkpoint confirms: TS0003=170, TS0002=3, PY0002=3, PY0003=2, and 18 duplicate TS0004/TS0009 fixture heuristics.
- Task-specific expected P2 subset: 114 operational TS0003 rows.
- Original report export and scanner input SHA are absent from the checked-in repository and searched Library. Exact TS0003 inventory is BLOCKED, not inferred.
- See \`BASELINE.json\` for counts, evidence status and confirmed candidate rows.

## Role ownership
| Role | Work | Branch |
|---|---|---|
| P1 | Security / credential paths and its five excluded TS0003 files | \`fix/codeinspector-p1-security\` |
| P2 | Operational TypeScript, Edge/API/backend/scripts, P2-owned tests, this register | \`fix/codeinspector-p2-typescript\` |
| P3 | JS/Python tooling and P3-owned tests/specs | \`fix/codeinspector-p3-tooling\` |

P2 will not overwrite P1 security paths or P3-owned tooling/intelligence/spec work. Initial branch search found P1 and P3 branches absent; only P2 branch was created.

## Task status
- TS0002 at \`supabase/functions/outbox-worker/index.ts:31\`: IMPLEMENTED on P2 branch; request processing extracted to typed \`handler.ts\`. Focused tests added. Exact SHA CI pending.
- TS0010 at \`src/components/InventoryTransferHistoryPage.tsx\`: page currently has no \`any\` token and uses \`InventoryTransferHistoryRow\`; record as FALSE_POSITIVE_CANDIDATE pending original analyzer record.
- TS0003 114 operational findings: OPEN / BLOCKED_EXTERNAL_REPORT_REQUIRED; no fabricated inventory.
- P1/P3 integration: no commits received; no merge.
- P2 merge: not merged.
- Main remains unchanged by this workstream.

## Files changed by P2 code
- \`supabase/functions/outbox-worker/handler.ts\` — new typed handler and split request/event/batch functions.
- \`supabase/functions/outbox-worker/index.ts\` — reduced to Deno/Supabase adapter wiring.
- \`src/test/outbox-worker-handler.test.ts\` — new P2 behavior tests.
- \`src/test/outbox-worker-source.test.ts\` — source boundary assertions updated.

## Preserved behavior
- Existing RPCs and arguments retained: \`claim_outbox_events\`, \`process_outbox_event\`, \`fail_outbox_event\`.
- Batch default 20, range 1–50, body bound 4096 bytes, 300-second claim lease.
- Sequential event processing and failure sanitization retained.
- No migration, RLS, financial, inventory, or production integration changed.

## Verification
- Focused Vitest, TypeScript, lint and build have NOT RUN in this connector environment.
- No Core/P2 workflow runs were listed for the P2 code SHA before PR creation.
- Previous \`db88ff6\` Source-release snapshot, PostgreSQL 17 import-finalizer and cleanup checks passed on their own recorded SHA; Core/P2 were IN_PROGRESS and hosted tenant E2E SKIPPED. Do not transfer those results.
- Production release remains NO-GO while hosted tenant and external integration evidence is unproven.

## External blockers
1. Original CodeInspector export / 114-row inventory and input SHA unavailable.
2. GitHub Actions PR gates have not run for P2 code SHA.
3. P1/P3 branches and delivered commits were not present at initial search.

## Exact next action
Read live P2 branch head; open PR to \`main\`; poll Core and P2 for that exact PR head; fix only evidenced failures and rerun on the new exact SHA. Continue TS0003 after importing the original 114 records.