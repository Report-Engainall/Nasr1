# P2 scoped lock — price-grid CSV RFC 4180 quote-boundary integrity

- Date: 2026-10-23.
- Repository: `Report-Engainall/Nasr1`.
- Requirement: `EXPORT-001` (price-grid CSV import/export safety).
- Owner: P2.
- Branch: `fix/p2-price-grid-csv-rfc4180-mainline-20261023`.
- Exact base SHA: `c451261681a56078118776649e031801752eade6`.
- Supersedes stale-base PR #60; only the targeted parser state machine and its regressions are ported. No stale branch history is carried forward.

## Root cause
The existing parser accepted an opening quote after unquoted text and silently swallowed arbitrary text after a closing quote. Malformed rows could therefore be normalized instead of rejected, undermining strict CSV field boundaries.

## Owned paths
- `src/lib/price-grid-csv.ts`: `parseCsvRecords` only; preserve existing 2 MB input bound, required headers, exact item-code mapping, numeric price validation, formula-safe export, negative numeric stock values, and draft-only behavior.
- `src/test/price-grid-csv.test.ts`: add escaped quote/embedded newline round-trip plus malformed-boundary tests.
- This scoped lock only.

## Acceptance
- Reject a quote in the middle of an unquoted field.
- Reject any non-delimiter text after a closing quote.
- Continue to accept escaped double quotes, commas and embedded newlines in properly quoted fields.
- Reject an unclosed quoted field and produce no partial drafts.
- Exact-head Core CI and P2 workflow must be reviewed independently; no browser/production claim is implied by unit coverage.

## Exclusions
- Do not edit shared execution state, acceptance matrix, `WORK_COORDINATION.md`, P1 ledgers, package manifests, workflows, XLSX/Onyx exporters, order import RPCs or production data.
- No second parser, database schema change, dependency, provider, or direct `main` write.
