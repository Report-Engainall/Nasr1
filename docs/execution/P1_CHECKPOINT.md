# P1 — Durable Work Checkpoint

هذا سجل تقدم فرعي لـP1 فقط؛ ليس مؤشراً عالمياً. المؤشر الوحيد هو `docs/bolt-source-reconciliation/CURRENT_EXECUTION_STATE.md`. P2 وحده يحدّث المؤشر العالمي ومصفوفة القبول وسجل التنفيذ.

## Current checkpoint

- updated_at_utc: `2026-10-30T03:11:31.464Z`
- owner: P1
- current_main_sha: `3b452355400a07f861a0c936d4d931056ea24c73` (control/protocol documentation head; no application source changes after code-bearing SHA `ee1b84303e5fc18b46bed0b37a880a306e06d5d8`)
- verified_code_sha: `ee1b84303e5fc18b46bed0b37a880a306e06d5d8`
- task_id: `VERIFY-PWA-CACHE-AND-CART-SCOPE-EE1B843`
- task_status: `COMPLETE / TESTED_EXACT_SHA` for the assigned PWA cache/cart verification task. This does **not** close the broader DLV-014 roll-up.
- reserved_paths: P1-owned route/component/UI tests only for subsequent tasks; P2 owns `scripts/**`, `src/lib/api.ts`, `src/lib/supabase.ts`, migrations, the global cursor, CSV matrix and execution log. Do not modify those paths without reassignment.
- commit_sha: latest P1 code change `ee1b84303e5fc18b46bed0b37a880a306e06d5d8`; current main documentation checkpoint `3b452355400a07f861a0c936d4d931056ea24c73`.
- exact_next_action: select the first still-open, P1-owned detailed route/UI acceptance row under DLV-002/ROUTES-001 from the current CSV; implement only a bounded, evidenced route UX gap in P1-owned files, then add its focused current-main browser/unit acceptance. Do not rerun the completed PWA suite absent regression.

## Completed work — newest first

| UTC | Task ID | Status | Base SHA | Result SHA | Changed files | Exact tests/results | Evidence |
|---|---|---|---|---|---|---|---|
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

- Files: none.
- Current command/process: none; CI for `ee1b843` is complete.
- Last output/failure: none on the final exact-SHA run.
- Root cause: initial integration run `81716e9` exposed four stale test assumptions (global cache key, profile mock mismatch, legacy error text and synthetic empty-array cache entry). Corrected in `15269cb`; subsequent unit suite passed 1420/1420 on `ee1b843`.
- Safe resume instruction: read first 60 lines of the global cursor, then P1 command and this checkpoint; fetch live main once, compare only changed paths, and take the next open detailed P1 route/UI acceptance row.
- Do not discard: no uncommitted changes exist.

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
