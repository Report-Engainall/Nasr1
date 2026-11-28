# P3 CHECKPOINT — PERSISTED CASH-EXPENSE EVIDENCE REVIEW — 2026-11-17

- Repository: `Report-Engainall/Nasr1`; canonical branch: `main`.
- Current main before this checkpoint: `daf5b200df4e351221500b2c028fe25d12c4bf33`.
- Functional implementation commit: `2a6d6af186735b406dd6cb65161f2f23bd0ca582`.
- Workflow integration commit: `daf5b200df4e351221500b2c028fe25d12c4bf33`.
- New migration: `supabase/migrations/20261117180000_cash_expense_commitment_persisted_evidence_review.sql`.

## Implemented

- Added tenant-scoped `cash_expense_commitment_evidence_reviews` with immutable reviewer, commitment, evidence, registered digest and timestamp.
- The authenticated client can read finance-review rows only within its active organization. Direct client insert/update/delete/truncate grants are revoked; the append-only trigger rejects mutation.
- Added `review_cash_expense_commitment_evidence`: active admin/manager only, creator cannot review own request, pending commitment only, source document must belong to the same tenant and commitment, and the submitted digest must match the registered evidence digest. Review attempts are idempotent and append an `EVIDENCE_REVIEWED` event plus audit entry.
- Approval and rejection now require the acting checker to have persisted a matching review for **every** registered source document. PostgreSQL, not the browser checkbox, is the decision boundary. Parent-row locking serializes evidence attachment, review and decision transitions.
- The workspace loads reviews back from PostgreSQL, records the review through RPC after opening the private signed document, and fails closed if review readback is unavailable. Cashflow explanatory text now names approved operating commitments as a source of future outflows.
- Extended the UI regression and PostgreSQL 17 acceptance script for direct-RPC bypass denial, maker/checker separation, two-document completeness, digest mismatch, replay, rejection and audit/event history.
- Wired the PostgreSQL 17 acceptance script into the repository's disposable local Supabase acceptance workflow. This workflow starts isolated local services and seeds ephemeral users; it does not use hosted Supabase.

## Exact-SHA acceptance

- P1 Vitest and strict TypeScript: run `44000505515`, source `2a6d6af...`, **QUEUED**.
- P2 Playwright critical paths: run `44000505860`, source `2a6d6af...`, **QUEUED**.
- Isolated PostgreSQL 17 workflow, now including the cash-expense acceptance script: run `44000682398`, source `daf5b200...`, **QUEUED**.
- No PASS recorded. Combined status checks for the code commit had no completed status entries at checkpoint time. The acceptance scripts have been authored and wired, but have not yet been shown passing on these exact SHAs.

## Integrity boundary and next action

- The registered SHA-256 is supplied by the existing upload client and stored by the evidence-registration function. This review binds the checker attestation to that registered digest; this change does **not** claim that PostgreSQL independently re-hashes the private Storage object bytes.
- No hosted migration, production database write, live integration, deployment, paid service or Vercel operation was performed.
- Next: inspect all three exact-SHA runs, fix only an evidenced failure, and do not mark the finance acceptance complete while any run is queued, skipped, blocked or failing. Release remains NO-GO pending broader acceptance.
