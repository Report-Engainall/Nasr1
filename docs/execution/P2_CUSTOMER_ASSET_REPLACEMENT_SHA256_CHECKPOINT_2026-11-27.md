# P2 Checkpoint — Customer Asset Atomic Replacement / SHA-256 Replay
Date: 2026-11-27
Repository: `Report-Engainall/Nasr1`
Role: P2 — backend, PostgreSQL, data integrity and tenant authorization
PR: #541
Branch: `integrate/customer-asset-atomic-replacement-current-main-20261117`

## Latest exact-head result — 2026-11-27
- Current code/test head: `ff68e2eb14c62e9497f1d4f7eda1446389ea9d5c`.
- The first local PG17 attempt on the earlier head failed in the **test harness** before reaching its business assertions: PostgreSQL SQLSTATE `42P18`, “could not determine data type of parameter $5”, in the duplicate-history preflight fixture's `jsonb_build_object('request_key',$5,...)`.
- P2 fixed both key references to `$5::text` in `scripts/test-customer-asset-replacement.mjs` and committed `ff68e2eb14c62e9497f1d4f7eda1446389ea9d5c`. The production migration and RPC were not changed by this correction.
- P2 [run 45928721865](https://github.com/Report-Engainall/Nasr1/actions/runs/45928721865), local PostgreSQL 17 job [140276982220](https://github.com/Report-Engainall/Nasr1/actions/runs/45928721865/job/140276982220): dedicated step 22 **SUCCESS** — atomic customer asset replacement, SHA-256 idempotency, exact concurrent replay, changed-payload conflict, cross-tenant denial and immutable-event guard all passed after repository migration replay.
- Same P2 run: public read-only Chromium smoke **SUCCESS**; authenticated infrastructure gate **SUCCESS**; hosted customer/order/tenant E2E **SKIPPED**, not PASS. The broader authenticated Chromium job remains **IN_PROGRESS** at finance/task print step 50; do not claim overall P2 acceptance yet.
- P1 [run 45928721781](https://github.com/Report-Engainall/Nasr1/actions/runs/45928721781): Vitest **FAIL** — 4 pre-existing `CustomerAssetsPanel.test.tsx` cases requiring real server pagination and the “عرض 50 من 50 أصل تم تحميلها” result label; 233 other files and 1,723 tests passed. P1/P4 strict TypeScript and production build steps succeeded. The new dedicated replacement suite `CustomerAssetsPanel.replacement.test.tsx` passed **6/6**, including stable idempotency key on ambiguous failure and confirmation only for the linked replacement.
- P1 has been notified in PR #541 comment [7208206444](https://github.com/Report-Engainall/Nasr1/pull/541#issuecomment-7208206444) to implement asset/event pagination and keep replacement out of the generic service-event options. A follow-up P2 comment [7208289626](https://github.com/Report-Engainall/Nasr1/pull/541#issuecomment-7208289626) records the fixed PG17 runner and the 6 passing replacement UI tests.
- Exact P2 test proof is **PASS on code head `ff68e2e...`**; full integration remains PENDING while Chromium finishes and P1 UI failures remain open.

## Current main and integration boundary
- Latest observed `main`: `586db787dd3b17c18ad7a2e2a1e3ea65d93a7f8e`.
- PR #541 head remains `ff68e2eb14c62e9497f1d4f7eda1446389ea9d5c`; compare is **6 ahead / 28 behind**, merge base `8144c30ae47977be053c06ea8bb512a2d0cbe9dc`, and seven unique paths remain: P2 workflow, P2 checkpoint, P2 runner, replacement component/test, migration, and P1 typecheck config.
- P1 owns synchronization with current `main`, preserving newer UI changes while implementing pagination, exact-head P1/P2 reruns and UI integration. P2 does not merge to `main`; P3 retains merge authority.
- No hosted or production database identity is confirmed. Hosted E2E remains SKIPPED; release remains NO-GO.

## Resume and synchronization
- Latest `main` synchronized: `8144c30ae47977be053c06ea8bb512a2d0cbe9dc`.
- Previous candidate: `5216d41e2d7d36575e390eb9461aaea77df414b7`.
- One intervening P3 commit updates only `docs/bolt-source-reconciliation/CURRENT_EXECUTION_STATE.md` and `REMAINING_SCREEN_ACCEPTANCE_MATRIX_2026-10-22.csv`; both retained. No source/test/workflow overlap.
- Corrected migration is `20261127100000_customer_asset_atomic_replacement_v2.sql`; obsolete unmerged `20261117201000` not reintroduced.
- Original customer asset UI and component test remain preserved. P2 scope remains migration, PG17 acceptance, P2 workflow hook and checkpoint; P1 typecheck includes existing UI files.

## Backend corrections
1. Reuse existing schema-aware `public.customer_activation_invitation_sha256(text)`; replace MD5/32-hex fingerprint with SHA-256/64 lowercase hex.
2. Read-only duplicate-history preflight before unique index creation; SQLSTATE `23505`, identifies up to five duplicate tenant/request groups, says no immutable history changed.
3. Internal preflight function not executable by PUBLIC, anon or authenticated.
4. Preserve tenant-scoped advisory lock, exact replay, changed-payload `22023`, old-asset row lock, atomic new asset + old status + immutable event + audit, and generic-event bypass denial.

## PostgreSQL 17 acceptance
- Concurrent identical requests: exactly one new replacement and one replay, same new asset ID and one event.
- Concurrent same key/different payload: one success, one `22023`, exactly one linked replacement asset/event; no orphan.
- Exercise duplicate-history preflight with temporary events within one transaction, assert `23505`, roll back and prove index restored.
- Preserve customer-only denial, cross-tenant denial, direct event bypass denial and immutable history.
- Test script refuses any non-loopback DB endpoint.

## Exact-head evidence
Latest #541 head is not yet certified. Fresh P1, P2 local Supabase, storefront PG17 and shopping-list PG17 checks must finish on the exact head; prior-head results do not carry forward. Hosted E2E job SKIPPED is not PASS.

## Ownership and safety
P2 owns backend transaction, migration, acceptance test and checkpoint. P1 owns UI behavior/review. P3 owns main integration/status. No production or hosted writes, deployment, secrets, paid APIs, Vercel, Bolt or Lovable.
