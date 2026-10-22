# P2 path ownership lock — import DQS server/client parity

- Date: 2026-10-22
- Repository: `Report-Engainall/Nasr1`
- Task: `DQS-001`
- Branch: `fix/p2-dqs-server-client-parity-20261022`
- Base SHA: `bf06c73226033da8e4f81e24981eb64e6e7fca99`
- Owner: P2
- Status: active — align client preview scoring with the authoritative PostgreSQL `calculate_import_job_quality(uuid)` contract and add regression tests.

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

## Guardrails

- Preserve the server calculation as the source of truth unless tests prove the SQL contract itself is wrong; this task aligns the preview only.
- Keep unknown/unavailable values distinct from zero; do not change parsing to coerce invalid input silently.
- Prove score components and total through specific unit assertions and PostgreSQL 17 acceptance, including the exact persisted job/snapshot values.
- Run exact-SHA Core CI after all code and lock changes; record the terminal run SHA rather than transferring prior-run results.
- Do not claim persisted/displayed runtime parity solely because pure unit tests pass; distinguish unit, PostgreSQL, browser, and production evidence.
