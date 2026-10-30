# P1 — Durable Work Checkpoint

هذا سجل تقدم فرعي لـP1 فقط؛ ليس مؤشراً عالمياً. المؤشر الوحيد هو `docs/bolt-source-reconciliation/CURRENT_EXECUTION_STATE.md`. P2 وحده يحدّث المؤشر العالمي ومصفوفة القبول وسجل التنفيذ.

## Current checkpoint

- updated_at_utc: `2026-10-30T03:19:30.000Z`
- owner: P1
- current_main_sha: `cbbe9d02750f38e8006f501bd17adc884b70c603` (latest main; since verified SHA `7fe83d3`, only P2-owned `scripts/test-database-migrations.mjs` changed; exact-head CI for `cbbe9d0` is running)
- verified_code_sha: `7fe83d3c35a2b8c5b28012c0207c3eb8e3468159` (three P1 route/offline acceptance rows below)
- task_id: `GITHUB-PR-130` (paired P1 UI evidence: `GITHUB-PR-122`, `GITHUB-PR-125`)
- task_status: `COMPLETE / TESTED_EXACT_SHA` on `7fe83d3` for three detailed UI acceptance rows. The current main `cbbe9d0` contains a later P2 script-only change and its CI is pending; this evidence is not transferred to that SHA. DLV-014, ROUTES-001 and DLV-002 roll-ups remain open.
- reserved_paths: P1-owned route/component/UI tests only for subsequent tasks; P2 owns `scripts/**`, `src/lib/api.ts`, `src/lib/supabase.ts`, migrations, the global cursor, CSV matrix and execution log. Do not modify those paths without reassignment.
- commit_sha: verified candidate `7fe83d3c35a2b8c5b28012c0207c3eb8e3468159`; no P1 application-source commit was required. Current main head is `cbbe9d02750f38e8006f501bd17adc884b70c603` and its Core/PG17/P2/cleanup runs are in progress.
- exact_next_action: after CI on `cbbe9d0` reaches terminal status, continue `P1-CUSTOMER-MANAGER-INVITATION-001` with only a demonstrated current-main UI acceptance gap; preserve token-hash/single-use/tenant rules and do not claim hosted email delivery.

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


## 2026-10-30 — current-main exact-SHA P1 UI verification

- Verification base/result SHA: `7fe83d3c35a2b8c5b28012c0207c3eb8e3468159` (verification-only P1 batch; no P1 application-source changes).
- Main moved afterward to `cbbe9d02750f38e8006f501bd17adc884b70c603`; compare from `7fe83d3c35a2b8c5b28012c0207c3eb8e3468159` shows only `scripts/test-database-migrations.mjs` changed, owned by P2. Core `40996667761`, PostgreSQL 17 `40996667757`, P2 `40996667698` and cleanup `40996667712` were already running on `cbbe9d02750f38e8006f501bd17adc884b70c603` when this checkpoint was refreshed. The `7fe83d3` success is not claimed for `cbbe9d02750f38e8006f501bd17adc884b70c603`.
- Detailed CSV Task IDs with current-main UI evidence on `7fe83d3c35a2b8c5b28012c0207c3eb8e3468159`:
  - `GITHUB-PR-122` — wishlist route persistence/recovery: `src/test/storefront-wishlist-route-acceptance.test.tsx` passed 2/2. The real `/wishlist` route restores a guest's local favourites, removes a chosen item locally without server sync, and shows a catalogue error then recovers through visible retry.
  - `GITHUB-PR-125` — compare route persistence/recovery: `src/test/storefront-compare-route-acceptance.test.tsx` passed 2/2. The real `/compare` route restores local selections, removes a chosen item, and recovers from catalogue-read failure through visible retry.
  - `GITHUB-PR-130` — offline workspace privacy/recovery: `src/test/offline-workspace-route-acceptance.test.tsx` passed 13/13; `src/lib/offline-catalog-cache.test.ts` 5/5; `src/lib/supabase-tenant-scope.test.ts` 1/1; `src/test/auth-session-cache-boundary.test.tsx` 7/7; `src/test/customer-workflow-tenant.test.tsx` 17/17. Assertions cover profile/tenant/warehouse scope, price/cost/internal-ID sanitization, account switch/logout cache invalidation, stale/missing cache markers, preserving independent cart drafts, and blocking server mutations while offline.
- Full exact-SHA unit run: Core `npm test` passed 217/217 files and 1420/1420 tests in 110.61s. This full suite includes the five PWA-focused test files requested in the P1 mandate; the dedicated focused CLI command was not separately invoked.
- Exact-SHA Core run: [40996058928 — SUCCESS](https://github.com/Report-Engainall/Nasr1/actions/runs/40996058928). The same job also passed isolated PostgreSQL 17 migrations/core, RPC inventory generation/upload, lint, `npm run build`, production-preview smoke, dev smoke and Chromium price-visibility acceptance.
- Exact-SHA PostgreSQL 17 run: [40996058730 — SUCCESS](https://github.com/Report-Engainall/Nasr1/actions/runs/40996058730).
- Exact-SHA P2 run: [40996059052 — SUCCESS](https://github.com/Report-Engainall/Nasr1/actions/runs/40996059052); public UI smoke and local Supabase browser acceptance passed. Hosted customer/order/tenant Playwright sub-job 123869369007 was `SKIPPED`, not passed.
- One-main cleanup: [40996059066 — SUCCESS](https://github.com/Report-Engainall/Nasr1/actions/runs/40996059066).
- `npm run typecheck`: NOT RUN / NOT VERIFIED. The current Core workflow explicitly excludes full-tree tsc because legacy recovery files under src have unresolved React Router/Zustand dependencies; no typecheck PASS is claimed.
- Files changed by P1 in this verification batch: none. No proven UI regression was found; no source change was justified. No uncommitted files were created.
- Root cause/failure: none in assigned P1 paths. Hosted customer/tenant E2E remains an external proof boundary, not a passing result.
- Matrix ownership: P1 records evidence here only. P2 owns the central CSV, global cursor and execution log; those files were not changed by P1.
- Exact next action: after the `cbbe9d0` workflow set reaches terminal state, continue `P1-CUSTOMER-MANAGER-INVITATION-001` only for a demonstrated UI acceptance gap. Keep hosted email/provider delivery `BLOCKED_EXTERNAL`.


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
