# P2 path ownership lock — import DQS server/client parity

- Date: 2026-10-22
- Repository: `Report-Engainall/Nasr1`
- Task: `DQS-001`
- Branch: `fix/p2-dqs-server-client-parity-20261022`
- Base SHA: `c11ea018b81c6e47a9bbbc36d4d7b8f432892f8d`
- Owner: P2
- Status: active on refreshed current-main tree — align client preview scoring with authoritative PostgreSQL `calculate_import_job_quality(uuid)` and prove preview/unit plus persisted PostgreSQL parity on the resulting exact SHA.

## Owned paths

- `src/lib/unified-import.ts`: only `DataQualityAccumulator` parity corrections; do not change parser, row transformations, upload/session behavior or import RPCs.
- `src/test/unified-import-safety.test.ts`: regression tests for the mismatched quality scenarios.
- `scripts/test-import-inventory-snapshot-contract.mjs`: assert PostgreSQL-calculated DQS components, finalization response, persisted job score/breakdown and immutable snapshot score/breakdown for two edge-case import datasets.
- This lock only. Do not edit the dynamic resume index, acceptance matrix, `WORK_COORDINATION.md`, source ledger, or P1-owned reports.

## Defects confirmed against main

- Client consistency includes `cost`; PostgreSQL scores only `quantity`, `revenue`, and `price`.
- Client treats an empty configured required-column list as a fallback matching-key completeness requirement, while PostgreSQL awards 100 completeness when the profile has an empty required-column list.
- Client temporal/referential score requires the matching key even when the date is valid or missing; PostgreSQL evaluates only date shape for this component.
- Client accepts a space as a date separator; PostgreSQL accepts only `/`, `.`, or `-` in the alternate date shape.

## 23 October refresh and current-main evidence

- Refreshed base SHA: `c11ea018b81c6e47a9bbbc36d4d7b8f432892f8d`; sequential #54/#57/#52 merges are present, and #52 post-merge Core CI passed in [39911284166](https://github.com/Report-Engainall/Nasr1/actions/runs/39911284166).
- Earlier PR #59 head `b26011d6f6b209bd9e8e8d2a457ce5bf6f77bd49` Core CI passed in [39853954026](https://github.com/Report-Engainall/Nasr1/actions/runs/39853954026), including persisted PostgreSQL DQS acceptance. Its P2 run [39853953933](https://github.com/Report-Engainall/Nasr1/actions/runs/39853953933) failed during GHCR image pull before authenticated local database/browser assertions; it is not browser proof for the old head or refreshed head.
- The four owned paths do not overlap any changed paths on main since the previous base. PR #66 owns customer routes/UI and does not overlap this DQS task.
- Merge release gate: terminal Core CI and P2 local Supabase/Chromium must both pass on the same updated PR head. Hosted credentials remain `BLOCKED_EXTERNAL` if skipped by the credential gate.

## Guardrails

- Preserve the server calculation as the source of truth unless tests prove the SQL contract itself is wrong; this task aligns the preview only.
- Keep unknown/unavailable values distinct from zero; do not change parsing to coerce invalid input silently.
- Prove score components and total through specific unit assertions and PostgreSQL 17 acceptance, including the exact persisted job/snapshot values.
- Run exact-SHA Core CI after all code and lock changes; record the terminal run SHA rather than transferring prior-run results.
- Do not claim persisted/displayed runtime parity solely because pure unit tests pass; distinguish unit, PostgreSQL, browser, and production evidence.
