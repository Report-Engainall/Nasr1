# P2 scoped lock — DQS preview/server/persistence parity

- Date: 2026-10-23.
- Repository: `Report-Engainall/Nasr1`.
- Requirement: `DQS-001`.
- Owner: P2.
- Branch: `fix/p2-dqs-server-client-parity-mainline-20261023`.
- Exact base SHA: `c451261681a56078118776649e031801752eade6`.
- Supersedes stale-base PR #59. Only the scoring parity rules, focused unit regressions, and database acceptance assertions are ported. The PostgreSQL calculation remains authoritative.

## Defects and contract
- Client consistency must score only `quantity`, `revenue`, and `price`; JSON null/empty values are unscored, numeric scalar values are stringified consistently, and `cost` is not a scored field.
- Empty `required_columns` means unconstrained completeness (100 when there are rows).
- Temporal/referential quality mirrors the server date-format check and does not require the matching key.
- Missing date is only null/empty; whitespace-only values are malformed. Accepted date formats are exactly the server pattern, not space-separated dates.

## Owned files
- `src/lib/unified-import.ts`: only `DataQualityAccumulator` scoring behavior.
- `src/test/unified-import-safety.test.ts`: edge-case parity tests.
- `scripts/test-import-inventory-snapshot-contract.mjs`: verify calculated score/components match finalize response, persisted import job, and ready Onyx snapshot.
- This lock only.

## Acceptance
- Unit tests and PostgreSQL 17 acceptance on the resulting exact SHA.
- Exact-head Core CI and P2 local Supabase/Chromium must pass before merge.
- Hosted external-account checks are not production proof and remain blocked/skipped without dedicated non-production credentials.
- Preserve unknown/unavailable values; no silent coercion, schema redesign, new service, or production data writes.

## Exclusions
- Do not edit the dynamic current-execution state, acceptance matrix, `WORK_COORDINATION.md`, P1 ledgers, workflow definitions, package manifests, schema migrations, parser/snapshot identity behavior or import RPC logic beyond the described acceptance assertions.
- No donor SQL, duplicated import pipeline, direct `main` write, reset, clean, or force-push.
