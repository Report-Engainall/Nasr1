# P2 Playwright E2E gate — Nasr1

This workflow builds the exact source SHA from the P2 branch, launches that build locally in GitHub Actions, and sends browser writes only to a dedicated non-production Supabase project. It does not certify a separately deployed production URL.

## Required GitHub Actions secrets

Configure these repository Actions secrets:

- `E2E_SUPABASE_URL`: URL of a dedicated non-production Supabase project only.
- `E2E_SUPABASE_PUBLISHABLE_KEY`: publishable/anon key for that same test project; never use a service-role key.
- `E2E_EMAIL` and `E2E_PASSWORD`: pre-provisioned customer A login.
- `E2E_EMAIL_B` and `E2E_PASSWORD_B`: pre-provisioned customer B login from a different organization.
- `E2E_PHONE`: valid contact number for the isolated test customer.
- `E2E_ALLOW_TEST_WRITES`: must equal `YES_I_CONFIRM_NON_PRODUCTION`, and must be set only after verifying the Supabase project is not production.

The workflow never provisions users, products, or seed data. Before enabling the test, ensure both users belong to distinct organizations and organization A already has an active, in-stock catalog product with valid server-side customer pricing. Keep this database isolated from production.

## Evidence semantics

- Missing any required secret or the non-production confirmation: the workflow summary explicitly records `NOT RUN / BLOCKED_EXTERNAL`. It does not call that a pass, seed data, or create customer orders.
- When all required settings are present: the workflow checks out and builds one exact source SHA, then runs Chromium against that build and the isolated E2E backend.
- The browser flow exercises catalog → profile-scoped cart → server-validated order creation → order detail after refresh, then proves customer B cannot open customer A's order through a separate browser session.
- This does not claim `PRODUCTION_PROVEN`. A deployed/production verification requires a separate authorized test window and distinct evidence.
