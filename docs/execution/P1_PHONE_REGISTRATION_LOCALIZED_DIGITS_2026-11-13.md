# P1 — Localized numeral support in customer phone registration

- Repository: `Report-Engainall/Nasr1`
- Base SHA: `66a5bf1587d97220a744e8082fc2235abb1e08cb`
- Branch: `fix/customer-phone-arabic-digits-20261113`
- Scope: customer phone registration input normalization only.

## Root cause
The phone identifier normalizer relied on JavaScript's ASCII-only digit class. The SMS verification field also stripped every character outside ASCII digits before the verification helper received the token. Yemeni customers entering Arabic-Indic digits (`٠١٢٣٤٥٦٧٨٩`) or Eastern Arabic-Indic/Persian digits (`۰۱۲۳۴۵۶۷۸۹`) therefore received a false invalid-number error or an empty OTP.

## Implemented change
- Added one shared, deterministic conversion from Arabic-Indic and Eastern Arabic-Indic numerals to ASCII digits.
- Applied it before E.164 phone validation and before SMS token validation.
- Applied the same conversion in the OTP input so localized digits are retained and normalized as the customer types.
- Kept the existing Yemen local-number rules, E.164 handling, SMS signup, OTP verification, resend path, email alternative, customer-only provisioning, and pending approval gate unchanged.
- Added regression coverage for localized phone numbers, localized OTP values, direct Auth signup normalization, and the interactive registration verification state.

## Security and runtime boundary
No migrations, SQL, RLS policies, role assignment, tenant resolution, provider settings, SMS credentials, or production customer data were changed. The existing server-side verified-phone requirement and pending-customer order gate remain authoritative. This source/test change does not prove that the hosted SMS provider is enabled or that an SMS was delivered; live Auth/SMS acceptance remains external to this commit.

## Verification and exact-SHA acceptance after merge

- PR: [#424](https://github.com/Report-Engainall/Nasr1/pull/424) — MERGED as `9cfafa028872ce7abe4a476aca3cca118b0e4f66`.
- Tested source/test SHA: `510f58a840c71c4749b59fb3596ce1848e6860d9`.
- P1 Actions [#43342717323](https://github.com/Report-Engainall/Nasr1/actions/runs/43342717323): PASS — 73/73 files, 552/552 tests, strict TypeScript and production build.
- P2 Actions [#43342717284](https://github.com/Report-Engainall/Nasr1/actions/runs/43342717284): public read-only Storefront smoke PASS. Local PostgreSQL 17 migrations/fixtures, endpoint authorization, price-grid concurrency/rollback/audit, cash-expense idempotency/concurrency and purchase-receipt accounting PASS.
- Local browser authenticated order/tenant path FAILED at login because the loopback Supabase URL was blocked by the canonical project guard before any DB request. Workflow inspection shows the test-only `VITE_LOCAL_SUPABASE_E2E=1` is exported for build but not the preview process; this is a P2 CI runtime handoff and must be fixed without loosening the production URL guard.
- Downstream browser acceptance suites and external authenticated E2E: SKIPPED, not PASS. SMS provider delivery and hosted phone Auth settings remain NOT VERIFIED.
