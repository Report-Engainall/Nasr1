# P3 CHECKPOINT — Immutable Decision Snapshot Required — 2026-11-17

- Repository: `Report-Engainall/Nasr1`; target branch: `main`.
- Tested implementation SHA: `b5b9a313eb020d65e867acd4f70b0a7f035bfe47`.
- Implementation commit: `0038476178ea15274f0b7cfce73cd177f5fad313`.
- Follow-up test-fixture correction: `b5b9a313eb020d65e867acd4f70b0a7f035bfe47`.
- At checkpoint update, current main is a descendant of the tested SHA; four intervening commits affect inventory/barcode files only (GitHub compare: ahead by 4; no decision snapshot files changed). Exact-SHA evidence is not transferred to the newer main head.

## Implemented source changes

1. `createDecisionOutcomeProposal` requires a complete `DecisionCandidateSnapshot` at runtime and in its TypeScript contract. Missing/malformed snapshots fail before RPC.
2. All new proposals use `create_decision_outcome_proposal_with_snapshot`; the client no longer falls back to the legacy no-snapshot proposal RPC.
3. `IntelligenceWorkspace` manual collection-follow-up path now persists the exact source evidence IDs, metric key, formula/version, period timestamp, owner and P3 priority. Numeric impact is explicitly `WITHHELD`; the text states that an outstanding-receivable metric does not establish the cause of late collection.
4. New migration `20261117140000_decision_outcome_snapshot_required.sql` revokes direct `PUBLIC/anon/authenticated/service_role` execute on the legacy no-snapshot RPC and grants authenticated execution only on the snapshot-bearing wrapper. The existing wrapper remains atomic with the legacy SECURITY DEFINER helper. Existing immutable snapshot trigger and append-only event/audit contract are preserved.
5. Added client and component regression tests for mandatory snapshot routing and persisted evidence fields.
6. Added `scripts/test-decision-outcome-snapshot-required.mjs`, wired into the local PostgreSQL 17 job. It uses a real local Supabase Auth manager session and an isolated transaction that is rolled back after checking: one snapshot-backed CREATE; one append-only event and audit; exact idempotent replay; changed-snapshot conflict; direct legacy RPC denial; immutable snapshot update denial; and ACL parity.

## Exact-SHA acceptance status

- P1 run: [43983285125](https://github.com/Report-Engainall/Nasr1/actions/runs/43983285125) — `QUEUED` at last retrieval on exact SHA `b5b9a313...`; no PASS claimed.
- P2 run: [43983285142](https://github.com/Report-Engainall/Nasr1/actions/runs/43983285142) — `QUEUED` at last retrieval on exact SHA `b5b9a313...`; public UI smoke and dependent local PostgreSQL 17 job not yet accepted.
- Storefront feedback PostgreSQL run 43983217676 targets parent implementation SHA and is not decision snapshot evidence.
- No local DB runtime acceptance, Hosted DB write, production migration, Edge deployment, Vercel build/deploy or live provider call was performed by this checkpoint. The newly added PG17 script runs only within the ephemeral local P2 stack and rolls back its transaction.

## Preserved safety / known gaps

- Existing historical `decision_outcomes` rows with `candidate_snapshot IS NULL` remain unchanged and are not assigned invented P0–P3 priority or financial impact.
- New snapshots record source-evidenced priority and context; unsupported numeric impact remains WITHHELD.
- Snapshot enforcement does not claim the whole decision lifecycle is accepted. Manager/admin and denied-role parity, tenant isolation, valid state transitions, mandatory reasons, optimistic versions, append-only history, measurement source verification and no GL/payment/inventory side effects still require exact-PG17 acceptance.
- The 7/30/90 cash forecast currently includes verified receivable inflows and supplier payable outflows; it still lacks a separate approved future operating-expense commitment schedule. Historical posted/void `cash_expenses` must not be re-labelled as future obligations or double-counted as outflows.
- Opening inventory 3,235 remains an owner-authorized estimate pending physical stock count; it must not be treated as field-confirmed ATP.
- Product images remain 0/114 until original supplier/package images and approved SKU mapping are available.

## Next action

Resolve P1/P2 runs 43983285125 and 43983285142 on the exact implementation SHA; repair only failures on that same code path. Then continue the financial schedule gap with a source-backed, maker-checker approved operating-expense commitment lifecycle; do not reuse actual posted cash expenses as forecast commitments.
