# P2 path ownership lock — central server-side Auth session management

Date: 2026-10-23
Repository: Report-Engainall/Nasr1
Task: AUTH-CENTRAL-SESSION-MANAGEMENT-P2
Branch: feat/p2-central-session-backend-20261023
Base SHA: 3cff12ffbe123f5fcc64fa81260125b6ad141c7e
Owner: P2
State: backend change set created; awaiting exact-head CI, P2 Playwright, and independent review.

## Implementation paths

- supabase/migrations/20261023150000_central_session_management.sql
- scripts/test-session-management.mjs
- scripts/test-database-migrations.mjs (Auth session fixture, session-aware identity claims, and acceptance hook)
- Session-aware identity fixtures across scripts/test-admin-catalog-commands.mjs, scripts/test-ai-gateway-telemetry.mjs, scripts/test-async-export-jobs.mjs, scripts/test-cash-expense-journal-posting.mjs, scripts/test-company-invitation-expiry.mjs, scripts/test-customer-cart-persistence.mjs, scripts/test-customer-price-visibility.mjs, scripts/test-customer-returns.mjs, scripts/test-import-inventory-snapshot-contract.mjs, scripts/test-import-job-idempotency.mjs, scripts/test-onyx-reconciliation-concurrency.mjs, scripts/test-onyx-reconciliation.mjs, scripts/test-onyx-source-evidence.mjs, scripts/test-order-input-hardening.mjs, scripts/test-price-grid-atomicity.mjs, scripts/test-purchase-receipt-accounting.mjs, scripts/test-stock-count-start-audit.mjs, and scripts/test-storefront-saved-products.mjs
- src/integrations/supabase/types.ts: publish the RPC signatures for the P1 screen integration.
- This lock document.

## RPC/API contract for P1 UI integration

- public.list_organization_sessions(p_limit integer DEFAULT 100) returns an array of current active-session summaries. Limit must be 1..200. Fields: session_id, profile_id, display_name, email, created_at, last_activity_at, expires_at, user_agent, ip_address, is_current_session.
- public.revoke_organization_session(p_session_id uuid) returns session_id, revoked, revoked_at only after a single matching server-side Auth session row is deleted. It rejects the current session and every sibling session belonging to auth.uid(); account owners use the separate self-scoped bulk RPC.
- public.revoke_other_auth_sessions() revokes all other sessions belonging only to auth.uid(), retains the caller's live session_id, returns the exact deleted session IDs/count, and emits one auth.sessions.revoked_others audit event. This is not an organization-wide bulk logout.
- Both RPCs are SECURITY DEFINER, executable only by authenticated callers and require an active administrator of the caller's organization. No direct grant exposes auth.sessions.
- Existing public.current_profile_id(), public.current_organization_id(), and public.get_current_tenant_context() are changed to require the JWT session_id claim to map to a live auth.sessions row whose user_id matches auth.uid() and whose not_after has not elapsed.
- Response/audit data excludes access tokens, refresh tokens, passwords, and other authentication secrets.
- Viewing the list writes auth.sessions.viewed with a count/limit summary. Revocation writes auth.session.revoked with the target profile/session metadata and timestamp.
- The organization-level revoke endpoint rejects the caller's current session and any other session owned by auth.uid(). This prevents self-revocation through an organization-admin action; a separate self-scoped RPC explicitly supports logging out the caller's other devices.

## Acceptance boundary

The PostgreSQL acceptance module checks valid live-session acceptance, session metadata and expiry filtering, no cross-tenant disclosure, admin-only list/revoke, rejection of current and sibling self-sessions from the organization endpoint, exact single-row deletion, audit events, and immediate denial through the canonical profile/tenant-context helpers for the same still-unexpired JWT after deletion.

Do not claim universal revocation across every security-definer function that tests raw auth.uid() without the canonical helpers until a dedicated bypass audit proves that boundary. Browser proof and production proof are separate from PostgreSQL acceptance. Exact-head Core CI and P2 Playwright remain pending until GitHub Actions finish on the final branch SHA.

## Ownership boundary

P1 owns src/components/DeviceManagement.tsx, app shells, route tree, and P1 evidence ledgers/reports. P2 will not edit those paths here. P1 should integrate the RPC contract into the existing devices screen after reviewing the backend changes; until that UI work is merged and browser-tested, the central inventory is backend-only and the end-to-end feature remains partial.

No direct main writes, force-push, destructive reset, or merge before independent review and passing exact-head checks.
