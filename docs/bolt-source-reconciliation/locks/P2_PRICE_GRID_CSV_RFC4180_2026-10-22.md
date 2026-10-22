# P2 path ownership lock — price-grid CSV parser integrity

- Date: 2026-10-22
- Repository: `Report-Engainall/Nasr1`
- Task: `EXPORT-001`
- Branch: `fix/p2-price-grid-csv-rfc4180-20261022`
- Base SHA: `bf06c73226033da8e4f81e24981eb64e6e7fca99`
- Owner: P2
- Status: active — enforce strict quoted-field boundaries and prove CSV export/import round-trip on adversarial quoting/newlines.

## Owned paths

- `src/lib/price-grid-csv.ts`: only `parseCsvRecords` state machine, preserving current size bound, header/price validation and draft-only behavior.
- `src/test/price-grid-csv.test.ts`: malformed-quote rejection and quoted comma/quote/embedded-newline round-trip regressions.
- This lock only.

## Acceptance

- Reject a quote in the middle of an unquoted cell.
- Reject any non-delimiter text after a closing quote.
- Continue to support escaped double quotes and commas/newlines inside a well-formed quoted cell.
- Continue to reject unclosed quoted fields and avoid partial price drafts.
- Exact-SHA unit tests and Core CI required; browser/production are separate claims.

## Collision exclusions

- Do not modify the shared resume index, acceptance matrix, work coordination, P1-owned ledgers, package manifests, workflow definitions, XLSX exporter, order exporter, or order-import RPCs.
- This is parser hardening only; no database/data writes and no price API behavior changes.
