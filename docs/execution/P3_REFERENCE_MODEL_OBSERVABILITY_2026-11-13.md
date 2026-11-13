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
