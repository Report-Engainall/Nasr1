# P1 — Durable Work Checkpoint

هذا سجل تقدم فرعي لـP1 فقط؛ ليس مؤشراً عالمياً. المؤشر الوحيد هو `docs/bolt-source-reconciliation/CURRENT_EXECUTION_STATE.md`. P2 وحده يحدّث المؤشر العالمي ومصفوفة القبول وسجل التنفيذ.

## Current checkpoint

- updated_at_utc: `2026-10-30T03:41:00.000Z`
- owner: P1
- current_main_sha: `d238805d7b7e4ba61ae0287d1a6ac773dab30d94` (P1 accessibility update merged; exact-SHA Core/P2/cleanup runs are in progress)
- verified_code_sha: `8d38d3cbf8b315484206d850423631b231df0bfd` — Core and P2 local Supabase SUCCESS / TESTED_EXACT_SHA for invitation fix. New accessibility code SHA `d238805d` is IMPLEMENTED / CI_PENDING; do not transfer previous PASS.
- task_id: `DLV-017`
- task_status: `IMPLEMENTED / CI_PENDING` on `d238805d7b7e4ba61ae0287d1a6ac773dab30d94` — customer invitation dialog keyboard accessibility. Previous invitation acceptance remains verified locally on `8d38d3c`: Core 217/217 files, 1422/1422 tests; Core/PG17/build/lint/smoke PASS; P2 local Supabase PASS. The new focus-trap/Escape/restore-focus change has not yet inherited that proof.
- reserved_paths: P1-owned route/component/UI tests only for subsequent tasks; P2 owns `scripts/**`, `src/lib/api.ts`, `src/lib/supabase.ts`, migrations, the global cursor, CSV matrix and execution log. Do not modify those paths without reassignment.
- commit_sha: accessibility fix `d238805d7b7e4ba61ae0287d1a6ac773dab30d94`; invitation stale-state fix `015fba9a08a90aa0b70fa7e724a5648faa6d09fa`; test assertion correction `8d38d3cbf8b315484206d850423631b231df0bfd`.
- exact_next_action: inspect existing exact-SHA Core `40998781849`, P2 `40998769174`, and cleanup `40998769422` on code SHA `d238805d`; no duplicate workflow. Resolve only a failure reproduced in the dialog component/test.

## Completed work — newest first

| UTC | Task ID | Status | Base SHA | Result SHA | Changed files | Exact tests/results | Evidence |
|---|---|---|---|---|---|---|---|
| 2026-10-30T03:41:00.000Z | DLV-017 | IMPLEMENTED / CI_PENDING | `5712e3d4111f448e7784affb8b459bc5103361f8` | `d238805d7b7e4ba61ae0287d1a6ac773dab30d94` | `src/components/CustomerActivationInvitationDialog.tsx`; `src/test/customer-activation-invitations-dialog.test.tsx` | Added initial focus, Tab/Shift+Tab wrap, Escape close when not busy, and focus restoration to opener; new keyboard regression test. Core `40998781849` in progress; P2 `40998769174` in progress; cleanup `40998769422` queued. | [Commit](https://github.com/Report-Engainall/Nasr1/commit/d238805d7b7e4ba61ae0287d1a6ac773dab30d94) · [Core](https://github.com/Report-Engainall/Nasr1/actions/runs/40998781849) · [P2](https://github.com/Report-Engainall/Nasr1/actions/runs/40998769174) |
| 2026-10-30T03:38:06.000Z | P1-CUSTOMER-MANAGER-INVITATION-001 | LOCAL_ACCEPTANCE_PASS / HOSTED_BLOCKED_EXTERNAL | `42bf13a52210c8dc3997d2293c3174c9d3da22df` | `8d38d3cbf8b315484206d850423631b231df0bfd` | `src/components/CustomerActivationInvitationDialog.tsx`; `src/test/customer-activation-invitations-dialog.test.tsx` | Core exact SHA: 217/217 files, 1422/1422 tests; invitation dialog 8/8 plus invitation/security suites. P2 local Supabase/Chromium customer-manager test `e2e/customer-manager-authorization.spec.ts:95` passed 1/1, proving guarded directory RPC, direct-table denial, tenant denial/no mutation, actual create/revoke UI, DB revoked status and audit. Hosted activation/email delivery remains SKIPPED / BLOCKED_EXTERNAL. | [Component fix](https://github.com/Report-Engainall/Nasr1/commit/015fba9a08a90aa0b70fa7e724a5648faa6d09fa) · [Core](https://github.com/Report-Engainall/Nasr1/actions/runs/40997956792) · [P2 local](https://github.com/Report-Engainall/Nasr1/actions/runs/40997956850) |
| 2026-10-30T03:36:00.000Z | P1-CUSTOMER-MANAGER-INVITATION-001 | CORE_PASS / P2_LOCAL_PENDING | `015fba9a08a90aa0b70fa7e724a5648faa6d09fa` | `8d38d3cbf8b315484206d850423631b231df0bfd` | Core verification of prior UI/test commits; changed files remain `src/components/CustomerActivationInvitationDialog.tsx`, `src/test/customer-activation-invitations-dialog.test.tsx` | Core `40997956792` SUCCESS: 217/217 files and 1422/1422 tests; targeted dialog test passed 8/8. Migrations/PG17, RPC inventory, backup/restore, lint, build, preview/dev smoke and Chromium price visibility all SUCCESS. P2 `40997956850` still IN_PROGRESS; public UI smoke success, local Supabase job in progress, hosted customer/tenant SKIPPED. Cleanup `40997956785` SUCCESS. | [Code fix](https://github.com/Report-Engainall/Nasr1/commit/015fba9a08a90aa0b70fa7e724a5648faa6d09fa) · [Test correction](https://github.com/Report-Engainall/Nasr1/commit/8d38d3cbf8b315484206d850423631b231df0bfd) · [Core](https://github.com/Report-Engainall/Nasr1/actions/runs/40997956792) · [P2](https://github.com/Report-Engainall/Nasr1/actions/runs/40997956850) · [Cleanup](https://github.com/Report-Engainall/Nasr1/actions/runs/40997956785) |
| 2026-10-30T03:27:30.000Z | P1-CUSTOMER-MANAGER-INVITATION-001 | IMPLEMENTED / CI_PENDING | `42bf13a52210c8dc3997d2293c3174c9d3da22df` | `015fba9a08a90aa0b70fa7e724a5648faa6d09fa` | `src/components/CustomerActivationInvitationDialog.tsx`; `src/test/customer-activation-invitations-dialog.test.tsx` | Added two regression tests (successful revoke + failed list refresh hides stale pending state; customer switch cannot display previous customer's invite). Exact-head Core `40997643056` queued; P2 `40997643088` queued. | [Commit](https://github.com/Report-Engainall/Nasr1/commit/015fba9a08a90aa0b70fa7e724a5648faa6d09fa) · [Core](https://github.com/Report-Engainall/Nasr1/actions/runs/40997643056) · [P2](https://github.com/Report-Engainall/Nasr1/actions/runs/40997643088) |
| 2026-10-30T03:32:00.000Z | P1-CUSTOMER-MANAGER-INVITATION-001 | RETRY_1 / ASSERTION_CORRECTED / CI_PENDING | `015fba9a08a90aa0b70fa7e724a5648faa6d09fa` | `8d38d3cbf8b315484206d850423631b231df0bfd` | `src/test/customer-activation-invitations-dialog.test.tsx` | Core 40997643056 on base SHA: 216/217 files, 1421/1422 tests passed; one failure was an ambiguous role query matching two intended alerts. Replaced it with exact-text lookup. New Core 40997956792 and P2 40997956850 are pending. | [Base Core failure](https://github.com/Report-Engainall/Nasr1/actions/runs/40997643056) · [New Core](https://github.com/Report-Engainall/Nasr1/actions/runs/40997956792) · [New P2](https://github.com/Report-Engainall/Nasr1/actions/runs/40997956850) |
| 2026-10-30T03:11:31.464Z | VERIFY-PWA-CACHE-AND-CART-SCOPE-EE1B843 | COMPLETE / TESTED_EXACT_SHA | `15269cbf30f281591d5e7ff2ceda866bf38d284c` | `ee1b84303e5fc18b46bed0b37a880a306e06d5d8` | `src/routes/__root.tsx`; `src/components/CustomerWorkflows.tsx`; `src/lib/offline-catalog-cache.ts`; `src/lib/offline-catalog-cache.test.ts`; `src/lib/supabase.ts`; `src/lib/supabase-tenant-scope.test.ts`; `src/test/auth-session-cache-boundary.test.tsx`; `src/test/customer-workflow-tenant.test.tsx`; `src/test/offline-workspace-route-acceptance.test.tsx` | Core `40995284940` SUCCESS; P2 local Supabase/Chromium `40995284968` SUCCESS; one-main cleanup `40995284973` SUCCESS, all on exact code SHA `ee1b843`. Unit suite: 217/217 files and 1420/1420 tests passed. Core run `40995493763` also SUCCESS on current docs-only head `3b45235`. | [Core exact code SHA](https://github.com/Report-Engainall/Nasr1/actions/runs/40995284940) · [P2 local acceptance](https://github.com/Report-Engainall/Nasr1/actions/runs/40995284968) · [Cleanup](https://github.com/Report-Engainall/Nasr1/actions/runs/40995284973) · [Core current docs head](https://github.com/Report-Engainall/Nasr1/actions/runs/40995493763) |

## What was verified

- Catalog cache keys are isolated by authenticated profile; freshness markers share the same profile namespace.
- A server-derived scope fingerprint binds the cached rows to profile, organization, warehouse and staff/customer mode. A missing or changed marker invalidates rows; old global unscoped keys are retired.
- Explicit tenant-scope revalidation bypasses the per-user memoized scope result before the cache is read or a new catalog is saved.
- Catalog sync rechecks the tenant scope after product retrieval; a scope change during sync clears the cache and prevents persistence.
- Catalog rows are hidden while a fresh online scope is being resolved after reconnect/session change.
- Catalog invalidation does not erase a profile-bound cart draft; drafts remain review-only and never create offline orders, payments or inventory writes.
- An offline account switch clears both outgoing and incoming profile catalog namespaces before the new identity paints.
- Profile switch/logout and tenant/warehouse scope-change acceptance passed.

## Proof boundary and remaining limitations

- DLV-014 remains **PARTIAL**, not closed: a remote revocation that occurs while a device is completely offline cannot be observed until a server/session event or reconnection. Identity-boundary events clear both relevant catalogs; after reconnect the UI clears displayed rows while refreshing the server scope.
- P2 local Supabase/Chromium accepted authenticated order/tenant denial, return→credit memo, audited 27-column Onyx XLSX download/parse, finance/task prints, customer-manager privacy/audit and device-session revocation.
- The hosted customer/order/tenant Playwright job was **SKIPPED**, not passed. No hosted or production authorization, Onyx target-version, WhatsApp delivery, live AI provider, production deploy/rollback or production restore proof is claimed.
- Release remains **NO-GO** for full production release.
- `src/lib/supabase.ts` was changed to support an explicit fresh-scope lookup. Under the current parallel protocol that service file is P2-owned; P1 will not edit it again without reassignment. P2 should retain the backend/service ownership for subsequent changes. `src/routes/__root.tsx` participates in the P1 auth/cache boundary and passed exact-SHA Core/P2.
- No uncommitted work remains from this task.

## In progress / uncommitted work

- Files: none; accessibility fix committed on `main` in `d238805d`.
- Current command/process: exact-SHA Core `40998781849` in progress, P2 `40998769174` in progress, cleanup `40998769422` queued. Do not launch duplicate workflows.
- Last completed proof before this commit: invitation fix on `8d38d3c` passed Core 217/217 files and 1422/1422 tests, P2 local Supabase/Chromium PASS, including a real customer-manager activation invitation create/revoke and database status/audit checks. Hosted customer/order/tenant test was SKIPPED; actual email delivery and production activation are not proven.
- New DLV-017 UI change: modal now directs initial focus to the close control, wraps Tab/Shift+Tab inside the dialog, closes on Escape only when not busy, and restores focus to the opener when unmounted. Added one end-to-end component keyboard test. CI for `d238805d` is pending; no PASS is claimed yet.
- Previous exact main PWA/route test evidence on `8d38d3c`: wishlist 2/2, compare 2/2, offline route 13/13, cache 5/5, tenant-scope 1/1, auth boundary 7/7, customer workflow 17/17. These are supporting test results, not a claim that P2-owned archival PR task IDs have been closed by P1.
- Root cause for DLV-017 sub-gap: the dialog had `aria-modal` but no focus entry, keyboard trap, Escape handler or restoration on close.
- Typecheck: `npm run typecheck` not separately run; no TypeScript PASS is claimed. CI workflow does not include that command.
- Safe resume instruction: inspect Core `40998781849`, P2 `40998769174`, cleanup `40998769422` on exact SHA `d238805d`; fix only any proven failure in the two P1-owned files.
- Do not discard: no uncommitted changes remain.

## REQUEST TO P2 — API/backend contract

- Acceptance task ID: `VERIFY-PWA-CACHE-AND-CART-SCOPE-EE1B843` (verification task complete; not a DLV-014 closure).
- UI path(s): `/offline`; account/session scope boundary in `src/routes/__root.tsx`.
- User action: refresh/read an offline catalog, switch account/session, reconnect, and restore a cart draft.
- Required API/RPC: existing `get_current_tenant_scope` through `getCurrentTenantScope({ forceRefresh: true })`; existing `fetchProducts`.
- Request payload: none added.
- Response fields: server-derived `profile_id`, `organization_id`, `warehouse_id`, `is_staff`.
- Server-derived identity/tenant/role rules: client scope marker is a consistency key only, not an authorization credential; server remains authoritative.
- Error states and SQLSTATE/HTTP status: no new backend status added; failure to resolve current scope hides and clears the cached catalog.
- Idempotency/audit/side-effect rules: cache is local read-only data; offline draft is profile-scoped; no order/stock/finance mutation is sent offline.
- Required acceptance test: forced scope refresh; same-profile organization/warehouse change; delayed sync crossing tenant boundary; account switch/logout; offline switch clears outgoing and incoming profile catalog.
- Can P1 work independently while pending? YES — continue on separate route/UI acceptance rows.

## P2 RESPONSE / CONTRACT

- Decision: existing scope RPC and product fetch reused; no new SQL/RPC or schema change.
- Contract owner: P2 for service/backend contract; P1 for presentation/cache lifecycle in the assigned task.
- P2-owned files: `src/lib/supabase.ts`, `src/lib/api.ts`, `supabase/**`, `scripts/**` and central state files.
- Request/response schema: existing tenant-scope payload listed above.
- Permission/tenant semantics: fail closed if no current server scope or a profile mismatch exists.
- Error semantics: cached catalog is not rendered when revalidation fails.
- Test proof / SHA: Core `40995284940` and P2 `40995284968` SUCCESS on `ee1b84303e5fc18b46bed0b37a880a306e06d5d8`.
- P1 may integrate at: existing `/offline` route; no further service contract change requested.
