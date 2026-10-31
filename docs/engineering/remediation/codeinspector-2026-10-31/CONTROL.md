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