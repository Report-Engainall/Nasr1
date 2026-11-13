# Customer Recently Viewed Products — P1 implementation record

- Repository: Report-Engainall/Nasr1
- Base main SHA: 184da04ef620f8df9f5e07283c536e80a33a76db
- Work branch: feat/customer-recently-viewed-main-20261113
- Scope: existing My Aghbari account workspace and shared Storefront product-detail flow.
- Status at authoring: implementation and target-owned tests added; PR-specific CI has not yet run. No PASS is claimed for this feature until exact-head checks complete.

## Delivered in code

1. Added src/lib/recently-viewed-products.ts:
   - Separate localStorage key for each verified customer profile.
   - Bounded to the latest 12 distinct products; opening a product moves it to the front rather than creating duplicates.
   - Validates product ID/name/timestamp and sanitizes image URLs. Rejects non-http(s), protocol-relative, credential-bearing and known signed/tokenized image URLs; checks both absolute and relative URL query parameters.
   - Stores only public product ID, display name, item code, safe image URL and view timestamp.
   - Provides read, record, remove and clear operations. Storage failures fail closed and do not block storefront use.
2. Connected the existing Storefront product-detail state to record a view only after the current identity-bound product resolves. Recording requires auth readiness, a non-empty profile ID, customer role and a non-staff session. When the route is /product/$id, the selected product must match the current route ID.
3. Added the “شوهدت مؤخراً” section to the existing My Aghbari profile page. It links to the current /product/$id route, supports removing a single item and clearing the current profile history, and renders only for the existing customer profile access mode.
4. Reopening an entry uses the live existing product route and catalogue. Browser history does not retain or supply price, cost, margin, stock or availability.
5. The feature is browser-local to the current profile and device. It is not server history, cross-device synchronization or personalized server analytics.

## Tests added

- src/lib/recently-viewed-products.test.ts: profile separation, public-field minimization, de-duplication/order, 12-item bound, invalid/corrupt input, signed image URL rejection, customer eligibility, remove and clear isolation.
- src/routes/profile.navigation.test.tsx: customer panel visibility, product deep link, staff/restricted hiding, single-item removal and account-scoped clearing.
- Existing Storefront and account modules remain the owners of routing and customer session state.

## Reference and license decision

- Shopify Hydrogen account route: templates/react-router/app/routes/account.tsx, main commit 043094b0ab0b5b01299e75da33d3f4e2914fda6a, source blob ec660e4a801d81dcf26e3413a5d1cb89a8a16963.
- Its template license was read as MIT at blob bf165a7b356128f2dee05ee629364263f98c4d2e.
- The account-workspace pattern is used as a design reference only. The local history utility, lifecycle wiring, UI and tests are independently authored. No Hydrogen source, package, asset or auth/session implementation was copied.

## Explicit non-effects

- No new route, SQL migration, table, RPC, RLS policy, Auth change, dependency, paid service, Supabase hosted write, Vercel deployment or production setting.
- No changes to predictive search, wishlist, compare, cart, checkout, pricing or inventory source contracts.
- LocalStorage is a convenience layer and is not an authorization boundary; the account panel is hidden by the existing verified profile-access mode.

## Exact acceptance evidence

- PR: [#432 — merged](https://github.com/Report-Engainall/Nasr1/pull/432).
- Accepted PR head SHA: `dc307541e99e151ef6580c519243eb646da77f13`.
- Merged main SHA: `6a7290eb219d906fec7596d125569c5036e0ba9f`.
- P1 run [#43358781222](https://github.com/Report-Engainall/Nasr1/actions/runs/43358781222): **SUCCESS** on the exact PR head. Vitest reported 81 test files / 597 tests passed; strict TypeScript and production build passed.
- P2 run [#43358781112](https://github.com/Report-Engainall/Nasr1/actions/runs/43358781112): **SUCCESS** on the exact PR head.
  - Authenticated E2E infrastructure gate: **SUCCESS**.
  - Public read-only Storefront Playwright smoke: **SUCCESS**.
  - Dedicated isolated local Supabase/PostgreSQL 17 job: **SUCCESS**. Migrations applied locally; tenant fixtures created; RPC guards, atomic pricing rollback/audit/race, cash expense posting/idempotency/concurrency, purchase receipt accounting, authenticated order persistence, cross-tenant denial, stock/purchase XLSX, checkout replay, customer returns/credit memo, Onyx export, finance/task print, customer-manager authorization/privacy/audit, and immediate device-session revocation all passed.
  - Generic external customer/order/tenant E2E job: **SKIPPED** because hosted credentials are not configured. The local dedicated Supabase job did execute the authenticated and cross-tenant assertions. Do not call the hosted test passed.
- No production deployment, hosted Supabase mutation, SQL migration to production, Vercel use or paid service was involved.
- The accepted code was merged to `main` without changing its feature code. The merge commit also contains the independent P3 observability commits that reached `main` during acceptance. A separate post-merge combined-tree workflow run is not recorded here; the P1/P2 evidence above is tied to the exact tested PR source SHA.

## Final status

**IMPLEMENTED AND MERGED.** The account-scoped browser history and its customer-only My Aghbari UI are accepted on the exact PR head. External hosted customer/tenant E2E remains an explicit pending gate; no cross-device synchronization or server-side viewing analytics is claimed.
