# P3 Reference Model Observability — Exact-SHA Acceptance — 13 November 2026

Repository: `Report-Engainall/Nasr1`  
Branch: `main`  
P3 implementation SHA: `ad97e2a8136edc618c109a130d156edc9b5db598`  
Exact current application source tested: `6a7290eb219d906fec7596d125569c5036e0ba9f`  
Current main documentation head before this update: `2f61d185c4bb4e2180836497953658abe8deee31` (docs-only child of the tested source SHA).  
Issue: #422 — Path B isolated modules

## Implementation

The isolated observability workstream has a source-backed system health probe and explicit source-readiness panel. The only live-shaped probe uses the existing admin-only `public.get_ai_gateway_budget` contract through the existing typed client. It distinguishes READABLE, DENIED, UNAVAILABLE and INVALID. A budget aggregate read does not prove provider connectivity or global application health, so both remain UNKNOWN.

The source readiness panel marks the remaining reference-model surfaces accurately: `ai_usage_ledger` exists but no tenant-safe per-attempt read RPC is present in current repository source; prompt lifecycle logic exists without a verified persistent prompt-version/audit contract; error reporting remains in-memory/console-only; and the app has no trusted server-side GitHub repository-read contract. Those areas are displayed as BLOCKED, not simulated.

## Exact-SHA acceptance

- P1 run [#43360203647](https://github.com/Report-Engainall/Nasr1/actions/runs/43360203647): **SUCCESS on exact code SHA 6a7290eb219d906fec7596d125569c5036e0ba9f** — 85/85 test files, 608/608 tests, strict TypeScript and production build.
- P2 run [#43360203606](https://github.com/Report-Engainall/Nasr1/actions/runs/43360203606): **SUCCESS on the exact same code SHA 6a7290eb219d906fec7596d125569c5036e0ba9f**.
- P2 public no-write Storefront Playwright smoke: SUCCESS.
- P2 local Supabase/PostgreSQL 17 and authenticated Chromium acceptance: SUCCESS. Applied repository migrations to isolated local PostgreSQL 17; created temporary users and two tenant fixtures; passed endpoint guard allow/deny, price-grid atomicity/rollback/audit/race, cash expense source posting/idempotency/concurrency, and purchase receipt source-linked accounting constraints. Built/launched exact source against local Supabase. Chromium passed authenticated order persistence and cross-tenant denial, stock-count XLSX, purchase-order XLSX, checkout lost-response replay with one durable order, returns/receipt/credit memo, Onyx XLSX export, finance/task print, customer-manager authorization/privacy/audit, and central device-session revocation/immediate protected-request denial.
- Local cleanup and evidence artifact upload: SUCCESS.
- Separate hosted external customer/order/tenant E2E job: **SKIPPED** because external hosted test accounts/infrastructure were not configured. No hosted production or cross-device behavior is claimed.

## Remaining integration and server contracts

- The two P3 panels are still isolated components and are not mounted in shared Settings/Admin navigation. Path A owns that shared route/navigation integration and authenticated browser UAT.
- The budget RPC proves only an aggregate read. Global health and external provider connectivity remain UNKNOWN without unique/fresh server-issued EvidenceRecord probes.
- A per-attempt AI audit viewer remains BLOCKED until a tenant-derived, role-checked, bounded read RPC exists. Do not expose `ai_usage_ledger` directly to browser roles.
- Prompt version persistence and permanent error logs remain BLOCKED until append-only server contracts, RLS, idempotency, four-eyes enforcement and PostgreSQL 17 tests exist.
- Developer AI/Patches/Audit/Settings remain BLOCKED until trusted server-side GitHub repository access, allowlisted repository/branch scope, human approval and audit contracts exist.

## Security and release boundaries

No SQL, migration, RPC, RLS/Auth, hosted database data, secrets, Vercel operation, deployment, paid model or external AI request was used for the P3 changes. The local P2 database was an isolated disposable CI environment.

P1/P2 critical source and local tenant/data acceptance are now PASS on the exact current code SHA, but product-wide coverage of all 41 reference screens, P3 panel mounting/browser UAT, hosted external E2E and production acceptance remain open. Overall product release remains **NO-GO**.


---

## Follow-up — measured probe timing and exact-SHA validation — 13 November 2026

### P3 implementation
The existing `SystemHealthPanel` now records request start, response completion, and elapsed browser round-trip duration using monotonic `performance.now()`; duration is bounded to 0–600,000 ms and rounded to whole milliseconds. Invalid/out-of-order completion timestamps fall back to request start; invalid/out-of-range durations become `null`. The UI explicitly says this is a browser round trip, not database execution latency. Denied/unavailable/invalid source outcomes preserve timing fields. The only live-shaped probe remains the existing admin-only budget-summary RPC. Global health and AI-provider connectivity remain **UNKNOWN**.

P3 change chain: `7506b65f987483858a3295f8834563a6fbe978d6`, `2c697ce44a6849b8dcd148efd3ae29bb6cf18fbb`, `3da17f102b4316892812bdb6caae3980d094e463`, `cc41742ff3152a581ad524c8ff93e360bbfc3003`, and tested source `745989a0e4fe1bc5cc3724a62aa3f0384abfce0d`.

### Exact validation
- P1 [#43385044639](https://github.com/Report-Engainall/Nasr1/actions/runs/43385044639): **SUCCESS** on exact SHA `745989a0e4fe1bc5cc3724a62aa3f0384abfce0d` — 102 test files / 737 tests, strict TypeScript, production Vite/Nitro build.
- P2 [#43385044627](https://github.com/Report-Engainall/Nasr1/actions/runs/43385044627) on that SHA: **CANCELLED**, not PASS; external E2E: **SKIPPED**.
- Current-main P2 [#43385210670](https://github.com/Report-Engainall/Nasr1/actions/runs/43385210670) on `930b098ccbd072fc9b87d1952a6da7c6aa3e4586`: **IN_PROGRESS** at last read. Public read-only Playwright completed local build/server startup; browser assertions pending. External customer/order/tenant E2E is **SKIPPED**. No authenticated panel UAT, hosted DB or production acceptance is claimed.

### Integration and blockers
- `SystemHealthPanel` and `SourceBoundaryStatusPanel` remain **not mounted** in shared Settings/Admin navigation; P1 owns mounting and authenticated desktop/mobile browser UAT through existing manager/admin authorization.
- `ArchitectureRegistryPanel` is already mounted in existing protected Settings; no duplicate.
- Per-attempt AI audit, persistent prompt history, permanent error storage and Developer AI/Patches remain **BLOCKED** pending tenant-derived bounded read contracts, append-only write/audit, RLS, idempotency/four-eyes and trusted server-side repository access.
- The 41 reference-model pages have not all passed end-to-end acceptance. Overall product release remains **OPEN / NO-GO**.

### Scope correction
A short-lived edit to finance source and P1 workflow filters crossed the P3 boundary. Exact original contents were restored in normal corrective commit `3baadc625ea67fb2690612f0e2cd7c6213ee8b17`; no force-push/reset was used and no out-of-scope finance/workflow change remains. This was reported in Issue #422.

No SQL/RPC/migration/RLS/Auth changes, hosted DB writes, secrets, Vercel activity, deployment, paid service or external AI call was performed.


## Status refresh — current-main revalidation — 13 November 2026

- Documentation checkpoint HEAD: `b90e2d1881861f7f4253ac1cfdc0361ebf377726`; application source for the current P2 run: `f6c3ea016113e05b18cbc629afc483f8b56de59c` (documentation-only descendant).
- Latest P1 [#43385519690](https://github.com/Report-Engainall/Nasr1/actions/runs/43385519690): **IN_PROGRESS** on exact main SHA `b90e2d1881861f7f4253ac1cfdc0361ebf377726`. Previous P1 [#43385044639](https://github.com/Report-Engainall/Nasr1/actions/runs/43385044639): **SUCCESS only** on exact `745989a...` (102 files / 737 tests / strict TypeScript / production build).
- P2 [#43385446766](https://github.com/Report-Engainall/Nasr1/actions/runs/43385446766): **IN_PROGRESS** on source `f6c3ea016113e05b18cbc629afc483f8b56de59c`; local source build/server startup succeeded, public browser assertions pending; external customer/order/tenant E2E **SKIPPED**.
- Previous P2 attempts on `745989a...` and `930b098...` were **CANCELLED**, not PASS.
- P1 integration remains open: `AdminPages.tsx` references `ArchitectureRegistryPanel` only, not the two P3 panels. No authenticated desktop/mobile route acceptance has been proven.
- Overall 41-screen reference acceptance and product release remain **OPEN / NO-GO**.

## Status refresh — exact main and P1 handoff — 14 November 2026

### P3 source on main
- Main application/source baseline at the start of this checkpoint: `62923d5215e268beeb5945d393b80cbbd85887a9`.
- P3 observability panels and their supporting modules remain source-backed and isolated. The current source continues to use the existing manager/admin budget RPC only; global system health and external AI provider connectivity remain `UNKNOWN`.
- Existing P3 acceptance on exact main SHA `62923d5`: P1 run [#43388092831](https://github.com/Report-Engainall/Nasr1/actions/runs/43388092831) **SUCCESS**, 104 test files / 752 tests, including SystemHealthPanel (4) and SourceBoundaryStatusPanel (1), strict TypeScript and production build. P2 run [#43388092978](https://github.com/Report-Engainall/Nasr1/actions/runs/43388092978) **SUCCESS** on the same SHA, including public read-only Storefront smoke and isolated local PostgreSQL 17 / Chromium acceptance. The separate hosted external customer/order/tenant job was **SKIPPED**; no hosted/production acceptance is claimed.

### P1 observability mount — PR #442 (not merged)
- PR [#442](https://github.com/Report-Engainall/Nasr1/pull/442) is based on main `62923d5`; latest reviewed PR head is `9e4a225754776559749ce3ddbec5366b16538388`.
- P1 initially failed on head `96cd0876` because the architecture region accessible name changed; this was correctly restored to `aria-label="معمارية النظام"` in `9e4a2257`.
- P1 run [#43518625135](https://github.com/Report-Engainall/Nasr1/actions/runs/43518625135): **SUCCESS on exact PR head 9e4a2257** — 105/105 test files, 755/755 tests, strict TypeScript passed, production Vite/Nitro build passed.
- P2 run [#43518628811](https://github.com/Report-Engainall/Nasr1/actions/runs/43518628811): **IN_PROGRESS at checkpoint time** on the same PR head. The public Storefront smoke was running; the authenticated external customer/order/tenant job was **SKIPPED**. Do not convert this to an overall P2 PASS until its workflow reaches a terminal state.
- P1 mount logic reuses the existing `canManageStorefrontContent` gate (admin/manager) and lazy-loads the existing architecture, health, and source-boundary panels. It adds no new role or backend contract.
- The new `AdminPages.observability.test.tsx` is a jsdom integration test with mocked panels. It does not prove real authenticated browser rendering on desktop/mobile, session-change clearing, or retry behavior. Review [#5898879606](https://github.com/Report-Engainall/Nasr1/pull/442) therefore requests changes until a local isolated Playwright admin-settings test covers admin/manager allowed and accountant/unauthorized denied at mobile and desktop widths, and verifies that changing session clears the prior probe and retry uses only the existing budget source.
- PR #442 remains open and unmerged. The panel mount is therefore **not yet part of main**. P3 must re-review the new exact head and exact-SHA P1/P2 plus browser evidence before merge.

### Remaining server contracts / release boundary
- AI per-attempt audit read, durable prompt-version / maker-checker persistence, permanent error event storage, and trusted server-side Developer AI / repository access remain **BLOCKED** pending approved tenant-derived bounded contracts and tests. No sample records or client-side shortcuts are allowed.
- The 41 reference-model pages still lack comprehensive end-to-end acceptance; P1 administrative browser acceptance remains open; hosted external E2E remains unproven.
- Overall product release remains **NO-GO**.

No SQL/RPC/RLS/Auth changes, hosted database writes, production data changes, Vercel use, deployment, paid service, secret or external AI invocation was performed in this status refresh.

---

## P2 RUN UPDATE — PR #442 PUBLIC SMOKE AND LOCAL ACCEPTANCE — 14 NOVEMBER 2026

- Exact PR head: `9e4a225754776559749ce3ddbec5366b16538388`.
- P1 #43518625135: **SUCCESS** on this exact SHA (105/105 test files; 755/755 tests; strict TypeScript and production Vite/Nitro build).
- P2 #43518628811: public read-only Storefront Playwright job **SUCCESS**; authenticated infrastructure gate **SUCCESS**; external customer/order/tenant job **SKIPPED**; dedicated local Supabase/PostgreSQL 17 + Chromium acceptance job **IN_PROGRESS** (job #132208434512). At last check it was still installing pinned dependencies; migrations, ephemeral tenants, transaction tests and authenticated browser assertions had not run yet. Do not claim full P2 acceptance.
- The local P2 acceptance job is isolated CI infrastructure, not the hosted/production database. It does not replace the missing authenticated admin observability Playwright coverage (desktop/mobile, manager/admin allow, accountant deny, session-change clearing and re-probe).
- PR #442 remains open/unmerged. The P1 mount is not on main. Main contains three documentation-only checkpoint commits after the PR base; re-sync the PR branch and rerun both workflows on the resulting exact SHA before integration.
- Release remains **NO-GO** pending admin panel browser acceptance, all 41 reference page decisions, and remaining blocked server contracts.


---

## P3 CHECKPOINT — AI AUDIT QUALITY ENGINE + LEGACY READ SAFETY — 14 NOVEMBER 2026

- Repository: `Report-Engainall/Nasr1`; canonical branch: `main`.
- Base SHA: `3e45227d13d1c25fd1e1ded4aa0e48d21964302f`.
- P3 implementation SHA: `3e45227d13d1c25fd1e1ded4aa0e48d21964302f`.
- Implementation commit: `feat(ai-governance): add usage quality insights and repair legacy audit safety`.

### Delivered source changes

- Repaired `supabase/migrations/20261114110000_ai_gateway_audit_tenant_read_contract.sql`. The preceding main revision had a 49,625-byte SQL file with 32 repeated COMMIT statements and truncated expressions; this checkpoint replaces it with one 199-line function definition and one COMMIT.
- The tenant-derived admin/manager RPC now validates JSONB `provider_attempts` before extracting provider metadata. Scalar/object payloads, overlong arrays, count mismatches, invalid entries and unsafe numeric values are marked `provider_attempts_integrity=false`; the RPC withholds the entire attempt-detail array and preserves the original source count. It does not reinterpret malformed telemetry as a successful provider call.
- Extended the bounded audit DTO with `providerAttemptTelemetryAvailable`; the client rejects missing/invalid integrity flags and requires a malformed payload to contain no returned provider details.
- Added deterministic, read-only quality insights on the existing AI audit screen: provider-attempt failure rate, fallback reliance, nearest-rank P95 request latency, and missing usage-measurement rate.
- The quality view is explicitly scoped to the currently visible page (maximum 25 rows), uses a minimum sample of five before a rate/latency can be labeled, displays denominators, and suppresses summary metrics when a status filter biases the sample. Thresholds are explicitly labeled as operational heuristics, not contractual SLA or proof of provider connectivity.
- Added eight deterministic unit cases for empty/insufficient samples, provider failure denominator, fallback denominator, P95, measurement gaps, malformed legacy telemetry and source immutability.
- Added an isolated P2 PostgreSQL 17 regression fixture containing a JSONB scalar in `provider_attempts`; it asserts the RPC returns no attempt details, integrity=false and preserves the source attempt count.
- Added the new engine/test directory to the P1 workflow push and pull_request path filters.

### Exact-SHA validation status at checkpoint

- P1 run [#43525085475](https://github.com/Report-Engainall/Nasr1/actions/runs/43525085475): **IN_PROGRESS** on exact SHA `3e45227d13d1c25fd1e1ded4aa0e48d21964302f`. No pass is claimed.
- P2 run [#43525085539](https://github.com/Report-Engainall/Nasr1/actions/runs/43525085539): **IN_PROGRESS** on the same exact SHA. PostgreSQL 17 scalar-payload regression and remaining local Chromium acceptance are not yet certified.
- P1 source tests, strict TypeScript and production build are pending terminal run results. P2 local migration/auth/tenant/browser checks are pending terminal results.
- Prior exact-head P1/P2 failures on SHA `777f7b3...` are historical failures and are not transferred to this implementation SHA.

### Security and release boundary

- No hosted or production database was queried or mutated; migration is source-controlled only and must be proven in isolated CI before any future application.
- No production deployment, Vercel operation, external AI provider request, paid service, live integration, secret, finance write, inventory write or customer-data mutation was performed.
- Provider/model zero-cost evidence, privacy verification and deployed Edge Function remain unproven; external provider egress and dynamic model use remain disabled.
- Durable runtime-error events and trusted server-side Developer AI repository access remain BLOCKED; no fake error data or client-side GitHub token path was introduced.
- Overall product release remains **OPEN / NO-GO**. The 41 reference screens are not certified complete by this P3 slice.

### Next P3 action

Read the terminal P1/P2 result for this exact SHA. Fix any test or migration regression found, re-run on the new exact SHA, then append the terminal evidence here and update the canonical execution state/matrix. Do not merge or label PASS from a prior SHA.


---

## P3 CHECKPOINT ADDENDUM — EXACT-HEAD ACCEPTANCE RETRY — 14 NOVEMBER 2026

- Integrated P3 feature commit: `3e45227d13d1c25fd1e1ded4aa0e48d21964302f`.
- P3 rollback-only test harness correction: `2bfcd37a1eb35bc6d95666fdfc4f73e02348d42b`.
- Another programmer then integrated the separate storefront product-comparison slice as commit `a09eb5def9f87a90f5edaf37b17b30d7c08403ff`; it did not overlap the AI governance files. Current source HEAD at this checkpoint is that SHA.
- The prior P2 retry on `2bfcd37...` was cancelled when the storefront commit moved main. Do not count it as a test pass/failure.
- P1 [run #43526165500](https://github.com/Report-Engainall/Nasr1/actions/runs/43526165500) completed **SUCCESS** on exact SHA `a09eb5def9f87a90f5edaf37b17b30d7c08403ff`: Vitest, strict TypeScript and production build all succeeded.
- P2 [run #43526165559](https://github.com/Report-Engainall/Nasr1/actions/runs/43526165559) is **IN_PROGRESS** on the same exact source SHA. The authenticated infrastructure gate passed. The public Storefront Playwright smoke is active; the local PostgreSQL 17 job is conditional on its completion. The external hosted customer-order/tenant job is **SKIPPED**, not passed.
- The preceding completed P2 run on `3e45227...` applied repository migrations successfully to isolated PostgreSQL 17 but its AI fixture failed before the audit RPC because the harness inserted a scalar while the production JSONB array CHECK constraints were correctly enabled.
- The test harness now inserts the legacy scalar only in a disposable transaction, drops the two array CHECK constraints inside that transaction, calls the RPC with real local admin JWT/session claims, asserts integrity=false / empty details / original count, forces rollback, then asserts both constraints are restored and the scalar fixture row is absent. No production migration or constraint was weakened.
- P2 acceptance of that rollback-only case is **NOT YET PROVEN**. Keep the release boundary NO-GO until the current P2 run reaches its local DB job and completes.


---

## P3 CHECKPOINT — EXPLICIT JSONB BINDING FOR AI GOVERNANCE PG17 ACCEPTANCE — 14 NOVEMBER 2026

- Repository: `Report-Engainall/Nasr1`; branch: `main`.
- Code/test commit: `e020947f76b2353615d44590fd268882ad734bb9`.
- Changed path: `scripts/test-ai-prompt-governance.mjs`; resulting blob: `a94fa0165ac829f61bb4f3b33cfd0bb73d668061`.
- Issue tracked: [#455](https://github.com/Report-Engainall/Nasr1/issues/455).

### Failure analysis and correction

- The prior local PostgreSQL 17 run failed during the phase `insert source-backed local AI audit fixture` with SQLSTATE `22023` / `cannot get array length of a scalar`.
- The repository locks `postgres@3.4.9`. Its source shows JSONB OID 3802 is associated with a JSON serializer that calls `JSON.stringify(value)`. For an explicitly cast/inferred JSONB parameter, passing a string that already contains `JSON.stringify(array)` can be serialized again as a JSON string scalar.
- The acceptance harness now uses the explicit `db.json(value)` and `tx.json(value)` wrappers. These set the JSONB parameter type deliberately and let the driver serialize the original JavaScript array/string exactly once.
- Before the normal ledger insert, the test now asserts `jsonb_typeof($1::jsonb) = 'array'` and `jsonb_array_length($1::jsonb) = 1`. The historical scalar fixture asserts type `string`; it remains inside a rollback-only transaction that temporarily drops only the two array-shape constraints, then verifies both constraints return and the fixture row is absent.
- Production CHECK constraints, migration files, RPCs, table data, tenant/RLS policy and application runtime were not modified by this test-harness correction.

### Exact-SHA acceptance state

- Latest code SHA: `e020947f76b2353615d44590fd268882ad734bb9`.
- P2 run [#43533714657](https://github.com/Report-Engainall/Nasr1/actions/runs/43533714657): **QUEUED** on this exact SHA at checkpoint time. No database acceptance is claimed.
- Previous runs [#43533130281](https://github.com/Report-Engainall/Nasr1/actions/runs/43533130281) and [#43533589204](https://github.com/Report-Engainall/Nasr1/actions/runs/43533589204) target earlier SHAs and do not validate the final `db.json/tx.json` implementation.
- P1 was not triggered by the P2-only test-script path. No P1 evidence is transferred to this SHA.
- External customer/order/tenant E2E is separately gated and may be SKIPPED; it is not a PASS and cannot substitute for local PG17 acceptance.

### Safety and next step

- No production/hosted database, migration, live Edge Function, provider call, payment/billing setup, secret, Vercel build/deployment or paid service was used.
- Keep the AI prompt persistence acceptance and overall release **OPEN / NO-GO** until P2 reaches a terminal result on the exact SHA and proves normal JSONB array insertion, four-eyes lifecycle, tenant isolation, append-only audit, malformed legacy read, rollback and constraint restoration.
- Next action: inspect terminal P2 job logs for run `43533714657`; only fix source-backed failures and re-run every affected gate on the resulting exact SHA.


### P1 exact-main verification addendum — 14 November 2026

- Documentation descendant main SHA: `1fdd2edaa09c223dde7ff95cd59919e04f32c315`; code under test is unchanged from code-bearing SHA `e020947f76b2353615d44590fd268882ad734bb9`.
- P1 [#43533795662](https://github.com/Report-Engainall/Nasr1/actions/runs/43533795662): **SUCCESS** on exact head `1fdd2edaa09c223dde7ff95cd59919e04f32c315`; 116 test files / 818 tests passed, strict TypeScript passed, production Vite/Nitro build passed.
- P2 [#43533714657](https://github.com/Report-Engainall/Nasr1/actions/runs/43533714657): **IN_PROGRESS** on exact code SHA `e020947f76b2353615d44590fd268882ad734bb9`. Infrastructure gate and public read-only Storefront smoke are SUCCESS. Local isolated Supabase/PostgreSQL job #132258262810 is starting local Supabase services; repository migrations and authenticated DB acceptance are still pending. External customer/order/tenant E2E is SKIPPED.
- The P1 result proves the repository test/type/build gates for the current source, but it does not test the `scripts/test-ai-prompt-governance.mjs` PostgreSQL JSONB parameter path. Only the dependent P2 local job can prove that path.

### P2 local PG17 mid-run proof — 14 November 2026

- Exact code SHA under test: `e020947f76b2353615d44590fd268882ad734bb9`; workflow [#43533714657](https://github.com/Report-Engainall/Nasr1/actions/runs/43533714657).
- Repository migrations applied successfully to an isolated local PostgreSQL 17 instance.
- Local database tests for endpoint guards, atomic pricing, cash-expense journal posting/idempotency, purchase receipt restrictions, storefront reviews/questions, and tenant isolation are **SUCCESS**.
- Exact-source build and local Supabase launch are **SUCCESS**.
- Chromium steps for order persistence/cross-tenant denial, both XLSX exports, checkout replay, end-to-end customer return/credit memo, and audited Onyx export are **SUCCESS**.
- Current active step: finance/task print acceptance (step 34). No failure is reported.
- Customer-manager finance privacy, device-session immediate revocation, and the AI prompt governance step (step 38) remain pending. In particular, the `db.json/tx.json` fix has not yet been exercised by the live PG17 prompt-governance test.
- Public Storefront smoke and infrastructure gate are SUCCESS; external customer/order/tenant E2E is SKIPPED. P2 overall stays **IN_PROGRESS**.
- Release remains **NO-GO** until the local run terminates successfully and proves the AI usage/prompt JSONB path, including rollback restoration.


### P2 AI audit RPC visibility retest — 14 November 2026

- P2 run [#43533714657](https://github.com/Report-Engainall/Nasr1/actions/runs/43533714657) on code SHA `e020947...` completed **FAILURE** at AI audit acceptance step 38 after 37 earlier successful steps. It inserted both the valid array fixture and rollback-only scalar fixture using explicit JSONB wrappers; the audit RPC did not throw SQLSTATE 22023, but the scalar fixture was absent from the first 50 result items. The run does not prove scalar sanitization or Maker/Checker completion.
- Corrective harness-only commit `126727f4aaf8d487ded39bc9991b01ecdd2d28fc` changes `scripts/test-ai-prompt-governance.mjs` only: database `clock_timestamp()` for source-backed and rollback-only fixture ordering, a direct source-presence assertion, audit RPC limit 100 (the supported maximum), and total/request-id diagnostics on failure.
- No production RPC or permission was widened; no migration or constraint changed. Scalar fixture remains rollback-only, with both production array constraints and absence of a persisted legacy row checked after rollback.
- Retest [#43534854634](https://github.com/Report-Engainall/Nasr1/actions/runs/43534854634) is **IN_PROGRESS** on exact code SHA `126727f4aaf8d487ded39bc9991b01ecdd2d28fc`; infrastructure gate is SUCCESS and the public read-only Storefront browser assertion is IN_PROGRESS. The local PG17 job has not started yet. The prior 37 successes are not proof for this new revision. Wait for exact-SHA rerun and specifically prove malformed scalar details are withheld, attempt count is retained, then finish Maker/Checker, tenant isolation, append-only audit and rollback.
- External customer/order/tenant acceptance remains SKIPPED, not PASS. Release remains NO-GO.
