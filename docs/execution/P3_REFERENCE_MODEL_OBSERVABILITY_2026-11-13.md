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
