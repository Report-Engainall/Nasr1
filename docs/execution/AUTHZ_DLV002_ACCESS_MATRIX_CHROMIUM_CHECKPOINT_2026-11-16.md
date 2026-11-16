# AUTHORIZATION V2 — DLV-002 ACCESS MATRIX BROWSER CHECKPOINT

**Date:** 2026-11-16  
**Repository:** `Report-Engainall/Nasr1`  
**Branch:** `main`  
**Task:** `DLV-002-ADMIN-ROLE-ACCESS-COMPARISON-001`  
**Architecture follow-on:** `AUTHZ-CAPABILITY-CATALOG-AND-LEGACY-PARITY-001`

## Exact source state

- Main base observed before this change: `65f0b0aaed40d2d5c50e42ed1cb21752cfb9b479`.
- Exact commit adding the Chromium acceptance spec: `7ab02fca23a1c1b5261ac4c074f8ad90b68b4fc3`.
- Changed file: `e2e/public-storefront-smoke.spec.ts` only.
- The existing public fixture remains `public/e2e/fixtures/admin-access-matrix.html` and mounts the real `AdminAccessMatrix` component through `src/test/admin-access-matrix-harness.tsx`.
- Existing P1 source/test acceptance for the matrix remains the separate result on `80a55e576f46d658853da9c5d6e9a8207483718f` (127/127 files, 908/908 tests, strict TypeScript and production build SUCCESS).

## Implemented browser coverage

The isolated Chromium case now covers both 360px and 1280px:

- All six current role columns remain visible for the page and operation tables.
- Staff finance and price-rule denials retain their explanations.
- Both tables have bounded horizontal scrolling on mobile without document-level overflow.
- Keyboard-entered Arabic search with diacritics filters page and operation entries.
- All-role scope filtering narrows the same search without changing policy.
- No-result feedback and clear-search behavior preserve the selected scope.
- Single-role mode proves staff denied/allowed filtering and the finance denial reason.
- Keyboard traversal covers the two mode buttons, search, scope filter, page table and operations table; search/filter/table focus indicators are asserted.
- Browser page errors remain a hard failure.

## Status — do not overstate

- `IMPLEMENTED`: yes, the browser spec is committed on main.
- `INTEGRATED`: yes, the spec uses the existing public Chromium smoke and static component fixture.
- `TESTED_EXACT_SHA`: **NOT RUN / NOT VERIFIED** for `7ab02fca23a1c1b5261ac4c074f8ad90b68b4fc3`.
- `BROWSER_PROVEN`: **NOT RUN** for this exact SHA.
- Prior P2 run `43776555758` on `80a55e576f46d658853da9c5d6e9a8207483718f` remains a historical failure (19 passed, 1 stale Tab-order assertion failed); it is not transferred to this new spec SHA.
- No current push-triggered Actions result was available through the connected run/status readers, and no local repository checkout was available for Playwright execution. This is an evidence gap, not a PASS and not proof that GitHub Actions did not run.
- Authenticated admin-session acceptance, server RPC/RLS checks and hosted tenant acceptance remain separate and open.

## Safety boundary

No authorization source, role IDs, role assignments, RPC, migration, RLS policy, grants, Auth configuration, tenant data, finance, inventory, hosted database, production setting, deployment, Vercel resource, paid service or secret was changed.

## Next action

1. Execute the public Chromium case on exact SHA `7ab02fca23a1c1b5261ac4c074f8ad90b68b4fc3`; inspect terminal job status and report/artifact, including both viewport iterations.
2. In isolated local Supabase/PostgreSQL 17, prove the mounted Settings matrix under an authorized admin and a denied role; this is not covered by the static fixture.
3. Only after the active DLV-002 security acceptance is resolved, proceed to `AUTHZ-CAPABILITY-CATALOG-AND-LEGACY-PARITY-001`; do not grant new roles or change policy in advance.
