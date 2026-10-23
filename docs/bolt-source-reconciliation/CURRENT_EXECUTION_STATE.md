# الحالة التنفيذية الحالية الوحيدة — Nasr1 / P2
LAST_RECONCILED_AT=2026-10-24T02:26:50+03:00

## حقيقة Git الحية
REPOSITORY=Report-Engainall/Nasr1
MAIN_SHA=16a3d23e558696700bccbb3dbf9ea75b0fccf745
MAIN_TREE=7dc8d72c0ece57777cc5e3337d1f8b416870697a
MAIN_CORE_CI=SUCCESS — run 40035355209 on exact main SHA 16a3d23e558696700bccbb3dbf9ea75b0fccf745.
LAST_CENTRAL_RECONCILIATION_PR=#126 historical merge at 6815b00781412bd98cbdd9fb660e475e4540b543; live main later advanced to 16a3d23e558696700bccbb3dbf9ea75b0fccf745.
PR126_HOSTED_CUSTOMER_E2E=SKIPPED / BLOCKED_EXTERNAL; not PASS.
CURRENT_BRANCH=p2/reconcile-18-prs-live-main-20261024
BASE_SHA=16a3d23e558696700bccbb3dbf9ea75b0fccf745
CURRENT_PR=https://github.com/Report-Engainall/Nasr1/pull/133
CURRENT_PR_HEAD=Re-read live PR #133 after this documentation commit; earlier-head CI does not prove the descendant.
No direct main writes, force-push, destructive reset or production DB writes.

## AUTHORITATIVE LIVE RECONCILIATION — 2026-10-24T02:26:50+03:00

This live block supersedes older snapshot metadata below; historical entries are retained and must not be read as current Git state.

- Repository: `Report-Engainall/Nasr1`
- Live `main` SHA: `16a3d23e558696700bccbb3dbf9ea75b0fccf745`; tree: `7dc8d72c0ece57777cc5e3337d1f8b416870697a`.
- Live main Core workflow: [run 40035355209](https://github.com/Report-Engainall/Nasr1/actions/runs/40035355209) — terminal SUCCESS on the exact main SHA above.
- Assignment set: 18 designated PRs tracked; #131 merged, leaving 17 open/unmerged. PR #119 head `a1a17bcf9ae320ea39680421a83e4b32deef3c67` has Core and P2 terminal SUCCESS on the same SHA (40036273431 / 40036273465). Hosted customer/tenant E2E remains SKIPPED/BLOCKED_EXTERNAL.
- PR #131 is merged at current main SHA `16a3d23e558696700bccbb3dbf9ea75b0fccf745`; main Core 40035355209 SUCCESS on exact SHA. PR #119 tenant-denial acceptance passes on exact head `a1a17bcf9ae320ea39680421a83e4b32deef3c67`: Core 40036273431 and P2 40036273465 both SUCCESS.
- Formal review status: no APPROVED independent maintainer review is recorded for this set. #89/#97 have automated COMMENTED review only; #102 has COMMENTED reviews only, including a repository-owner comment. The remaining PR review APIs are empty. CodeRabbit success/comments are not human approval.
- Credential-gated hosted tenant/customer E2E jobs explicitly recorded as SKIPPED remain `BLOCKED_EXTERNAL`, not PASS. Production proof is not claimed.
- Out-of-set P2 history verified live: #127 merged at `d7a49d8ca7d968e2fc04307fb26313e54168410a` and is included in current main ancestry; #129 and duplicate export #132 are CLOSED / NOT MERGED. Do not recreate the #127 address-validation fix or merge duplicate #132.
- Merge sequence after reviews: #131 is already merged and #119's current exact-head Core/P2 tests pass. Resolve shared `e2e/public-storefront-smoke.spec.ts` overlap among #89/#102/#124 during sequential refreshes; obtain required independent reviews before merge. Re-read main and Core on the final main SHA.
- Central checkpoint branch: `p2/reconcile-18-prs-live-main-20261024`; central reconciliation PR: https://github.com/Report-Engainall/Nasr1/pull/133. Latest docs commit is being tested at exact head `a68a1a61fe9db4ff497898bd2f844162dd60e993`; do not transfer earlier-head CI.
- Active P2 task: `API-OPS-001` — complete a source-backed inventory of callable Edge Functions/RPC contracts, with auth, tenant/role, inputs, idempotency, bounds, errors/retries and audit semantics. #134, #135 and #138 are implemented and exact-head-tested but still open pending authorized independent review; do not recreate them.

| PR | owner | exact tested head SHA | Core | P2 / PostgreSQL 17 / Playwright | live disposition |
|---|---|---|---|---|---|
| [#89](https://github.com/Report-Engainall/Nasr1/pull/89) | P3 | `a36cc74085935a4e48965d19c3defb282dbb6a10` | [40026027445](https://github.com/Report-Engainall/Nasr1/actions/runs/40026027445) **SUCCESS** | [40026027463](https://github.com/Report-Engainall/Nasr1/actions/runs/40026027463) **SUCCESS** | OPEN / UNMERGED; Review pending; wide 35-file diff overlaps public-storefront-smoke with #102 and #124. |
| [#97](https://github.com/Report-Engainall/Nasr1/pull/97) | P1 | `443c8e2e3402e0a88a09341e8b5f27be67febc29` | [40027013914](https://github.com/Report-Engainall/Nasr1/actions/runs/40027013914) **SUCCESS** | [40027013912](https://github.com/Report-Engainall/Nasr1/actions/runs/40027013912) **SUCCESS** | OPEN / UNMERGED; No independent approving review recorded. |
| [#102](https://github.com/Report-Engainall/Nasr1/pull/102) | P1 | `5050e004f4f25c8dd1ff2790118600be15b01c6e` | [40028691397](https://github.com/Report-Engainall/Nasr1/actions/runs/40028691397) **SUCCESS** | [40028691395](https://github.com/Report-Engainall/Nasr1/actions/runs/40028691395) **SUCCESS** | OPEN / UNMERGED; No independent approval; shares e2e/public-storefront-smoke.spec.ts with #89 and #124. |
| [#107](https://github.com/Report-Engainall/Nasr1/pull/107) | P1 | `3e549c0ddc48f26970ed74b537ef1da197b116b7` | [40029845516](https://github.com/Report-Engainall/Nasr1/actions/runs/40029845516) **SUCCESS** | [40029845504](https://github.com/Report-Engainall/Nasr1/actions/runs/40029845504) **SUCCESS** | OPEN / UNMERGED; No independent approving review recorded. |
| [#119](https://github.com/Report-Engainall/Nasr1/pull/119) | P1 | `a1a17bcf9ae320ea39680421a83e4b32deef3c67` | [40036273431](https://github.com/Report-Engainall/Nasr1/actions/runs/40036273431) **SUCCESS** | [40036273465](https://github.com/Report-Engainall/Nasr1/actions/runs/40036273465) **SUCCESS** | OPEN / DRAFT; Core and P2 passed on same exact head; hosted customer/tenant E2E remains SKIPPED/BLOCKED_EXTERNAL; independent review is separate. |
| [#124](https://github.com/Report-Engainall/Nasr1/pull/124) | P1 | `01a9bc0e2554f5100545a42a276fcfa96ebb9dd5` | [40030587409](https://github.com/Report-Engainall/Nasr1/actions/runs/40030587409) **SUCCESS** | [40030587399](https://github.com/Report-Engainall/Nasr1/actions/runs/40030587399) **SUCCESS** | OPEN / UNMERGED; No independent approval; shares e2e/public-storefront-smoke.spec.ts with #89 and #102. |
| [#131](https://github.com/Report-Engainall/Nasr1/pull/131) | P2 | `f88d72e497eed851c425dfaa7b9eeca1291ee411` | [40024841272](https://github.com/Report-Engainall/Nasr1/actions/runs/40024841272) **SUCCESS** | [40024841182](https://github.com/Report-Engainall/Nasr1/actions/runs/40024841182) **SUCCESS** | MERGED at `16a3d23e558696700bccbb3dbf9ea75b0fccf745`; current main Core 40035355209 SUCCESS; do not recreate. Hosted tenant E2E remains skipped. |
| [#118](https://github.com/Report-Engainall/Nasr1/pull/118) | P2 | `bf23b0d04d49cdd1218e75e72d22c97a0e8c3673` | [40035579224](https://github.com/Report-Engainall/Nasr1/actions/runs/40035579224) **SUCCESS** | [40035578462](https://github.com/Report-Engainall/Nasr1/actions/runs/40035578462) **SUCCESS** | OPEN / UNMERGED; direct compare is 5 ahead / 0 behind; only three intended CSV/XLSX/test files differ; formal review API empty. |
| [#134](https://github.com/Report-Engainall/Nasr1/pull/134) | P2 follow-up | `387db64bfa6686ab08d4707d88b7aea3f9c6ff41` | [40037207461](https://github.com/Report-Engainall/Nasr1/actions/runs/40037207461) **SUCCESS** | [40037207264](https://github.com/Report-Engainall/Nasr1/actions/runs/40037207264) **SUCCESS** | IMPLEMENTED / TESTED_EXACT_SHA; same-key concurrent batch idempotency proven; OPEN / UNMERGED pending formal review. |
| [#135](https://github.com/Report-Engainall/Nasr1/pull/135) | P2 follow-up | `982768af887384217353151134e23c18f6bcb030` | [40038517615](https://github.com/Report-Engainall/Nasr1/actions/runs/40038517615) **SUCCESS** | [40038517499](https://github.com/Report-Engainall/Nasr1/actions/runs/40038517499) **SUCCESS** | REPORT-001 executive analytics schema correction + PostgreSQL 17 acceptance; OPEN pending review; hosted customer E2E skipped. |
| [#138](https://github.com/Report-Engainall/Nasr1/pull/138) | P2 follow-up | `3015b4f35857c756e9fde05e47fef6ed1c513510` | [40038957424](https://github.com/Report-Engainall/Nasr1/actions/runs/40038957424) **SUCCESS** | [40038957490](https://github.com/Report-Engainall/Nasr1/actions/runs/40038957490) **SUCCESS** | HANDOVER-001 README/environment guide; OPEN pending review; production deployment not proven. |
| [#105](https://github.com/Report-Engainall/Nasr1/pull/105) | P3 | `599dbbe8fa1b7a799909d22ae6cff33ebb51cc9d` | [40025650590](https://github.com/Report-Engainall/Nasr1/actions/runs/40025650590) **SUCCESS** | [40025650684](https://github.com/Report-Engainall/Nasr1/actions/runs/40025650684) **SUCCESS** | OPEN / UNMERGED; No independent review; hosted credential-gated E2E SKIPPED/BLOCKED_EXTERNAL. |
| [#114](https://github.com/Report-Engainall/Nasr1/pull/114) | P3 | `167e8f22a74eb4cc6350896affd20db28b57052c` | [40025727440](https://github.com/Report-Engainall/Nasr1/actions/runs/40025727440) **SUCCESS** | [40025727413](https://github.com/Report-Engainall/Nasr1/actions/runs/40025727413) **SUCCESS** | OPEN / UNMERGED; No independent review; hosted credential-gated E2E SKIPPED/BLOCKED_EXTERNAL. |
| [#115](https://github.com/Report-Engainall/Nasr1/pull/115) | P3 | `855cd203145dcf3020e0bbac57b5188dfcedbb13` | [40025580420](https://github.com/Report-Engainall/Nasr1/actions/runs/40025580420) **SUCCESS** | [40025580423](https://github.com/Report-Engainall/Nasr1/actions/runs/40025580423) **SUCCESS** | OPEN / UNMERGED; No independent review; hosted credential-gated E2E SKIPPED/BLOCKED_EXTERNAL. |
| [#116](https://github.com/Report-Engainall/Nasr1/pull/116) | P3 | `e553157246b91199e3a8c83c88585654b1d194c6` | [40025757483](https://github.com/Report-Engainall/Nasr1/actions/runs/40025757483) **SUCCESS** | [40025757514](https://github.com/Report-Engainall/Nasr1/actions/runs/40025757514) **SUCCESS** | OPEN / UNMERGED; No independent review; hosted authenticated E2E not proven. |
| [#117](https://github.com/Report-Engainall/Nasr1/pull/117) | P3 | `cb0a4b9509001d1db4d6560849ae1f051a0d7a0b` | [40025787855](https://github.com/Report-Engainall/Nasr1/actions/runs/40025787855) **SUCCESS** | [40025787857](https://github.com/Report-Engainall/Nasr1/actions/runs/40025787857) **SUCCESS** | OPEN / UNMERGED; No independent review; hosted credential-gated E2E SKIPPED/BLOCKED_EXTERNAL. |
| [#120](https://github.com/Report-Engainall/Nasr1/pull/120) | P3 | `f58b3830b443477e940d21b3a4ed166ef38404e3` | [40025816601](https://github.com/Report-Engainall/Nasr1/actions/runs/40025816601) **SUCCESS** | [40025816610](https://github.com/Report-Engainall/Nasr1/actions/runs/40025816610) **SUCCESS** | OPEN / UNMERGED; No independent review; hosted credential-gated E2E SKIPPED/BLOCKED_EXTERNAL. |
| [#121](https://github.com/Report-Engainall/Nasr1/pull/121) | P3 | `031feda6916f3769cee28ea8143b4e412bb7f3da` | [40025849978](https://github.com/Report-Engainall/Nasr1/actions/runs/40025849978) **SUCCESS** | [40025849838](https://github.com/Report-Engainall/Nasr1/actions/runs/40025849838) **SUCCESS** | OPEN / UNMERGED; No independent review; this doc row does not itself close full route acceptance. |
| [#122](https://github.com/Report-Engainall/Nasr1/pull/122) | P3 | `9f64a1342dcf97248e4570f447f358a08711819b` | [40025883623](https://github.com/Report-Engainall/Nasr1/actions/runs/40025883623) **SUCCESS** | [40025883529](https://github.com/Report-Engainall/Nasr1/actions/runs/40025883529) **SUCCESS** | OPEN / UNMERGED; No independent review; hosted credential-gated E2E SKIPPED/BLOCKED_EXTERNAL. |
| [#125](https://github.com/Report-Engainall/Nasr1/pull/125) | P3 | `04a0403a49ef6a10d110299ed95a8e44c6bc4dd8` | [40025913367](https://github.com/Report-Engainall/Nasr1/actions/runs/40025913367) **SUCCESS** | [40025913384](https://github.com/Report-Engainall/Nasr1/actions/runs/40025913384) **SUCCESS** | OPEN / UNMERGED; No independent review; hosted credential-gated E2E SKIPPED/BLOCKED_EXTERNAL. |
| [#130](https://github.com/Report-Engainall/Nasr1/pull/130) | P3 | `dd5158414f61cd88a687c24346215c421b9ee62c` | [40025941925](https://github.com/Report-Engainall/Nasr1/actions/runs/40025941925) **SUCCESS** | [40025941941](https://github.com/Report-Engainall/Nasr1/actions/runs/40025941941) **SUCCESS** | OPEN / UNMERGED; No independent review; exact-head Core/P2 verified PASS although older PR text said pending. |

## P2 follow-up evidence — 2026-10-24T02:26:50+03:00

- PR #134 [concurrent batch idempotency](https://github.com/Report-Engainall/Nasr1/pull/134): exact head `387db64bfa6686ab08d4707d88b7aea3f9c6ff41`; Core 40037207461 SUCCESS and P2 40037207264 SUCCESS. PG17 proves one create + one replay and no duplicate stock movement. Review list empty; not merged.
- PR #135 [executive analytics schema correction](https://github.com/Report-Engainall/Nasr1/pull/135): exact head `982768af887384217353151134e23c18f6bcb030`; Core 40038517615 SUCCESS and P2 40038517499 SUCCESS. PG17 validates current customer schema, tenant/role denial, cancellation exclusions, exact 30-day boundaries and totals. Review list empty; not merged.
- PR #138 [runtime handover](https://github.com/Report-Engainall/Nasr1/pull/138): exact head `3015b4f35857c756e9fde05e47fef6ed1c513510`; Core 40038957424 SUCCESS and P2 40038957490 SUCCESS. README, no-secret `.env.example`, Bun bootstrap and environment/deployment guide. Review list empty; not merged.
- Review and production boundaries: do not merge these PRs without authorized independent approvals. Hosted customer/tenant E2E remains SKIPPED/BLOCKED_EXTERNAL. Live Onyx target import, WhatsApp delivery, and production restore/deployment proof remain unproven.

## Closed work — do not recreate
- PR #123 payment retry-key fix merged at 271de9ac23d6fd092db5a77c15bcf191249fd40d; exact PR head f7f0071a4a5437877e7da13dd1e83471ded3a610 passed Core 40017279766 and P2 40017279809; main Core passed on that exact merge SHA.
- PR #126 central-state reconciliation merged at 6815b00781412bd98cbdd9fb660e475e4540b543; its exact PR head 2d1fddde5c8c9b3185dc19880ef5426129d28005 passed Core 40018779157 and P2 40018779193; main Core 40019333142 passed on 6815b00781412bd98cbdd9fb660e475e4540b543.
- PR #100, #101, #103, #104, #110, #111, #112, #123 and #126 merged; #52/#54/#83/#84/#88/#90/#99 also merged. Do not recreate absent a verified regression.
- PR #127 is the single authoritative Company/address P2 PR. PR #129 was opened on the same two service/test paths; its independent code is being transferred here and #129 will be closed without merge.

## Historical task snapshot — COMPANY-001-CUSTOMER-ADDRESS-VALIDATION (2026-10-23; superseded by authoritative live reconciliation above)
TASK_ID=COMPANY-001-CUSTOMER-ADDRESS-VALIDATION
TASK_STATUS=IMPLEMENTED; REGRESSION_TESTS_ADDED; FINAL-HEAD CORE/P2 CI PENDING
CURRENT_PR=https://github.com/Report-Engainall/Nasr1/pull/127
CURRENT_BRANCH=feat/p2-company-workspace-acceptance-20261023
BASE_SHA=6815b00781412bd98cbdd9fb660e475e4540b543
CODE_AND_TEST_PARENT_HEAD=61b21688e2ae0ef65e72d718340699e6a85cc574
FILES_CHANGED=src/lib/customer-addresses.ts; src/test/customer-addresses.test.ts; docs/bolt-source-reconciliation/CURRENT_EXECUTION_STATE.md; docs/bolt-source-reconciliation/REMAINING_SCREEN_ACCEPTANCE_MATRIX_2026-10-22.csv; docs/bolt-source-reconciliation/PROGRAMMER_2_CURRENT_REPORT.md; docs/bolt-source-reconciliation/WORK_COORDINATION.md; docs/bolt-source-reconciliation/EXECUTION_LOG.md
CHANGE_SUMMARY=PR #127 already parsed fetched address records for schema/UUID/country/timestamp validity. This patch retains that behavior and requires UUID save acknowledgements and UUID edit/delete IDs before RPC. No UI/migration/RLS/grant changes.
TESTS_RUN_WITH_RESULTS=No final-head PASS claimed; PR #127 HEAD changes via the atomic code+central checkpoint commit. Main Core 40019333142 passed exact main SHA 6815b00781412bd98cbdd9fb660e475e4540b543; current PR #127 Core/P2 must be re-read at latest SHA.
FAILED_OR_SKIPPED=No Company fix test failure reported yet. Hosted customer/tenant E2E remains BLOCKED_EXTERNAL without dedicated non-production credentials.
MERGE_STATUS=PR #127 OPEN; not merged.
BLOCKED_EXTERNAL=Hosted cross-tenant customer E2E needs dedicated non-production Supabase and authorized synthetic accounts; no production writes.
LOCKED_PATHS=Exclusive P2 path lock via PR #127: src/lib/customer-addresses.ts; src/test/customer-addresses.test.ts. Central P2 files updated atomically on this branch. P1/P3 route/UI ownership remains reserved.
NEXT_TASK_ID=COMPANY-001-CUSTOMER-ADDRESS-VALIDATION
NEXT_ACTION=Close duplicate PR #129 without merge after confirming transfer into #127; read current PR #127 HEAD; inspect all required Core/P2 jobs to terminal; verify address regression ran on that SHA; fix evidenced failure only; merge #127 by PR only after all required gates pass; verify post-merge main SHA and Core.
UPDATED_AT=2026-10-23T23:41:00+03:00

## Evidence rules
Allowed statuses: IMPLEMENTED, INTEGRATED, TESTED_EXACT_SHA, BROWSER_PROVEN, PRODUCTION_PROVEN, CLOSED_WITH_EVIDENCE, BLOCKED_EXTERNAL, NOT RUN. Skipped is not PASS; never transfer statuses between SHAs.
