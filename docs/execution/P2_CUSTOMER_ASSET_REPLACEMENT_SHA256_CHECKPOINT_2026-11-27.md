# P2 Checkpoint — Customer Asset Atomic Replacement / SHA-256 Replay
Date: 2026-11-27
Repository: `Report-Engainall/Nasr1`
Role: P2 — backend, PostgreSQL, data integrity and tenant authorization
PR: #541
Branch: `integrate/customer-asset-atomic-replacement-current-main-20261117`

## Latest exact-head acceptance — 2026-11-27

- **Exact tested source head:** `ff68e2eb14c62e9497f1d4f7eda1446389ea9d5c`.
- **P2 workflow [45928721865](https://github.com/Report-Engainall/Nasr1/actions/runs/45928721865): SUCCESS** on the exact tested source head.
- **Local isolated Supabase/PostgreSQL 17 and authenticated Chromium job [140276982220](https://github.com/Report-Engainall/Nasr1/actions/runs/45928721865/job/140276982220): SUCCESS**, 66 successful steps, zero failures. Two skips were non-acceptance steps only: Chromium install skipped because the pinned browser was already cached, and diagnostic capture skipped because the job had no failures.
- Dedicated step 22 **PASS**: migration replay, atomic customer asset replacement, SHA-256 request fingerprint, exact concurrent replay, conflicting-payload concurrency, tenant isolation and immutable event guard. The earlier `42P18` test-harness failure is fixed by typing both duplicate-history request-key arguments as `$5::text`.
- The same local job also passed the end-to-end order/tenant denial, stock-count and purchase-order Excel, checkout replay, customer return/credit memo, Onyx export, finance/task print, customer-manager financial privacy/audit, device-session revocation, all four price edit/reload, admin access matrix, category/price/stock privacy/search/history/archive, AI Maker/Checker/tenant/append-only acceptance, and final Chromium/Storage proof verification.
- P2 public UI smoke [job 140276123206]: **SUCCESS** (20 successful steps; Chromium install skipped because cached). Authenticated infrastructure gate [job 140276122993]: **SUCCESS**.
- Hosted customer/order/tenant E2E [job 140276168667]: **SKIPPED**, not PASS. No hosted/production database identity or live data acceptance is inferred.
- **P1 run [45928721781](https://github.com/Report-Engainall/Nasr1/actions/runs/45928721781): FAIL** — 4 cases in existing `src/components/CustomerAssetsPanel.test.tsx` require server-side pagination and the “عرض 50 من 50 أصل تم تحميلها” progress label; 233 other test files and 1,723 tests passed. P1/P4 strict TypeScript and production build succeeded. The new replacement-specific suite `CustomerAssetsPanel.replacement.test.tsx` passed **6/6**, including same-key retry on ambiguous failure and success confirmation only for the linked replacement.
- P1 UI ownership was notified in PR #541 comments [7208206444](https://github.com/Report-Engainall/Nasr1/pull/541#issuecomment-7208206444) and [7208289626](https://github.com/Report-Engainall/Nasr1/pull/541#issuecomment-7208289626). P1 must implement real asset/event pagination and keep replacement out of generic service events; do not delete or weaken the four tests.
- **P2 backend/migration/PG17/integrated local P2 acceptance: PASS on `ff68e2e...`. Overall product integration remains BLOCKED by the four P1 UI failures and required synchronization with latest `main`.**

## Current main and integration boundary
- Latest observed `main`: `586db787dd3b17c18ad7a2e2a1e3ea65d93a7f8e`.
- Current PR head: `72488cb74b61b972a1000bb2a5391eea01eadb63`; it is a checkpoint-only documentation update after tested source head `ff68e2e...`. No application, migration, transaction RPC, runner or workflow code changed after the tested source.
- Latest compare is **7 commits ahead / 28 behind**, merge base `8144c30ae47977be053c06ea8bb512a2d0cbe9dc`, with exactly seven scoped paths: P2 workflow, checkpoint, runner, replacement component/test, migration, and P1 typecheck config.
- P1 owns synchronization with current `main`, preserving newer UI work, implementing the pagination contract, then rerunning P1/P2 on the exact synchronized head. P2 does not merge to `main`; P3 retains sole merge authority.
- Keep hosted E2E as SKIPPED and release NO-GO until the real application Supabase project ref is proven and approved hosted acceptance is authorized.

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
