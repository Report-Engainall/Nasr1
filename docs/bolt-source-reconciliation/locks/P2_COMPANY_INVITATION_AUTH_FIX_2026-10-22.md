# P2 path ownership lock — company invitation Auth fixtures

- Date: 2026-10-22
- Repository: `Report-Engainall/Nasr1`
- Task: `COMPANY-INVITE-AUTH-CONTRACT-P2`
- Branch: `fix/p2-company-invitation-expiry-audit-20261022`
- Base reference at lock creation: `main` / `bf06c73226033da8e4f81e24981eb64e6e7fca99`
- Owner: P2
- Status: active; release only after exact-SHA Core CI completes.

## Owned scope

- `supabase/migrations/20261022220000_company_invitation_expiry_persists_audit.sql`: persistent expiration audit, SHA-256 and legacy MD5 compatibility, authoritative Auth email confirmation.
- `scripts/test-company-invitation-expiry.mjs`: PostgreSQL acceptance for expiry persistence, exactly-once audit, SHA-256/MD5 acceptance, replay denial, and rejection of a forged JWT confirmation.
- `scripts/test-database-migrations.mjs`: only the fixture setup for `AGH-CUSTOMER-360-MEMBERS-001` around the fixed invited/finance user IDs; seed the corresponding `auth.users` rows with explicit confirmed email before the authorized acceptance case.

## Explicit exclusions

- Do not edit P1-owned ledgers/reports or the shared dynamic index/matrix/coordinator while PR #54 owns them.
- Do not change PR #54's `supabase/migrations/20261022130000_customer_company_invitation_sha256_auth_confirmation.sql` or its Onyx/print files.
- When the branches integrate, preserve PR #54's separate fixture coverage for confirmed, unconfirmed, and legacy company members. This lock covers only the existing fixture IDs and does not replace those cases.

## Release checks

- Apply every migration on isolated PostgreSQL 17.
- Run the general database acceptance and the dedicated invitation-expiry acceptance on the exact head.
- Keep authenticated local Supabase/Playwright marked `BLOCKED_EXTERNAL` if GHCR pull throttling prevents services from starting; a public read-only UI smoke is not proof of authenticated invitation behavior.
