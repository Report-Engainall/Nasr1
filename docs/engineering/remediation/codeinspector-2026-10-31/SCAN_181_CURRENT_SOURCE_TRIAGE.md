# CodeInspector 181-Finding Report — Current-Source Triage

Date: 2026-11-01  
Current source reviewed: `main` at `6cb364193285840b6d68a620d0db69eadb5d6ef1`  
Original report scan timestamp: `2026-11-01T03:01:06.5014910Z`  
Original report input SHA: **UNKNOWN** (the supplied report does not identify the scanned commit).

## 1. Report inventory

The supplied report states 715 files, 131,377 LOC and 181 findings:

| Rule group | Findings |
|---|---:|
| TS0003 nesting depth | 148 |
| TS0004 possible hardcoded credential | 10 |
| TS0009 possible hardcoded credential | 10 |
| JS0002 function length | 1 |
| JS0003 nesting depth | 1 |
| JS0005 async rejection handling | 1 |
| JS0007 console logging | 7 |
| TS0010 `any` usage | 1 |
| PY0002 function length | 2 |
| **Total** | **181** |

This 181-finding report is a separate follow-up input. It must not be merged into the recovered historical 239-row baseline or represented as a scan of the current `main`, because its input SHA is unknown.

## 2. TS0004 / TS0009 — 20 credential warnings

The 20 report records map to nine current source files. Manual review of the exact current-main blobs did not reproduce hardcoded operational credentials at the reported locations. The observed patterns are generated test tokens, malformed invitation fixtures, route/path strings, ordinary test rendering, or type declarations. All remain **NOT_REPRODUCED_CURRENT_SOURCE_NOT_CLOSED** pending a fresh authorized CodeInspector scan.

| Report path | Rules / report locations | Current-main blob | Current-source evidence |
|---|---|---|---|
| `e2e/helpers/customer-orders-keyboard-test.ts` | TS0004 + TS0009, line 46 | `5392d27f79604e92a9daeb035d9492d80021f23a` | Session fixture is assembled from generated JWT pieces; refresh token uses `randomBytes`. |
| `e2e/storefront-price-visibility.spec.ts` | TS0004 + TS0009, line 109 | `24003f099b6890f1d2cb56d1ef7ee7d3bd8d5b28` | Preview-session claims and test identity fields; not a provider credential. |
| `src/lib/customer-order-print.test.ts` | TS0004 + TS0009, line 53 | `d9933242588f41be2160b13252211085540bc453` | Basename-only report path resolved uniquely; current location contains no credential-like fixture. |
| `src/test/ai-gateway-logic.test.ts` | TS0004 + TS0009, line 62 | `ef4f4c17633c768b7eea050600dd9a1afec62d6e` | Bearer/provider-key/JWT fixtures are generated with `randomBytes`; no fixed provider credential remains in current source. |
| `src/test/company-invitation-route-acceptance.test.tsx` | TS0004 + TS0009, line 181 | `b21b29ffb50d9b9d78855638139ac1d4a1c116c5` | Malformed invitation token is generated with `randomBytes`; reported line is a test case description. |
| `src/test/customer-activation-invitations-page.test.tsx` | TS0004 + TS0009, line 39 | `57c9b1fe5816381c6435bde40966a656cb1f8357` | Malformed activation token is generated with `randomBytes`. |
| `src/test/customer-route-tree-reachability.test.tsx` | TS0004 + TS0009, lines 103–104 | `c31a4315a479fa886d852c796df5e6cf29e4134c` | Current lines describe route paths and test identifiers; invitation tokens are route parameters, not embedded credentials. |
| `src/test/outbox-worker-handler.test.ts` | TS0004 + TS0009, line 19 | `8d297b6e175fd3cb8c11e2ae6be5163ecba1042f` | Reported line is an RPC type field; worker/service-role test fixtures are generated with `randomBytes`. |
| `src/test/reset-password-route.test.tsx` | TS0004 + TS0009, line 63 | `407612b9c17ffa83e54becba34bec02780c9c60b` | Reported line renders the reset-password page; no hardcoded credential is present there. |

### Historical AI Gateway fixtures and Gitleaks

A separate full-history Gitleaks scan found two static negative-input fixtures in historical commit `ef7d290a5ae9bd53ff035513f2c7fca700bfb875` in `src/test/ai-gateway-logic.test.ts` (rules `generic-api-key` and `jwt`). Current `main` has replaced those fixed values with generated test fixtures. PR #350 adds only those two exact historical `commit:path:rule:line` fingerprints to `.gitleaksignore`; it does not suppress a rule or a path. The follow-up full-history scan on PR #350 reported no unignored findings.

## 3. Other non-TS0003 findings

These historical locations were also compared with current-main source blobs. The original source shapes are no longer present at the reported locations; statuses remain **NOT_REPRODUCED_CURRENT_SOURCE_NOT_CLOSED** until a fresh authorized CodeInspector run.

| Rule | Report location | Current-main source | Current evidence |
|---|---|---|---|
| JS0007 (7) | `public/sw.js`, lines 59, 77, 82, 107, 131, 140, 148 | blob `8f9e3066661b32975bc82f0c8a5b049c8d364ec2` | Current worker has zero `console.*` occurrences and uses `reportServiceWorkerDiagnostic` for diagnostics. |
| JS0002 / JS0003 | `public/sw.js`, historical arrow at line 87 | same blob | The historical long arrow-function block is no longer present; current behavior is decomposed into named helpers such as `installShell`, `activateShell`, `handleNavigationFetch` and `handleStaticAssetFetch`. This is a source recheck, not a new analyzer measurement. |
| JS0005 (original 181-report occurrence) | `public/sw.js`, line 67 | same blob | The original line-67 asynchronous pattern is not the same location as the later three JS0005 findings. Keep the original row separate from the later scan. |
| TS0010 | `InventoryTransferHistoryPage.tsx`, line 1 | blob `7b1225649a5a3c00b24602b17e62e82e3600e4c7` | Current file contains no `any` type occurrence. |
| PY0002 | `scripts/reconcile-bolt-recovery-archives.py`, `review_path` line 615 and `self_test` line 197 | blob `b7b29c2456a8911d5d4d39cb8d2a8d0ef74c9a7b` | Current `review_path` is 11 lines and `self_test` is 10 lines; the reported 57/54-line functions are no longer present. |

### Later CodeInspector follow-up scan — 2026-11-01 17:38:11 UTC

A separate later CodeInspector scan (its input SHA is also UNKNOWN) reported **three JS0005 findings** in `public/sw.js` at lines 170, 193 and 202. These three rows are additional follow-up evidence and are **not added to the original 181-finding totals** above.

PR [#394](https://github.com/Report-Engainall/Nasr1/pull/394), current head `175a870f44a95974c6ad7e048e7550e9dd0971a6`, is the targeted implementation:
- Handles static-asset fetch rejection with explicit `async/await` and `try/catch`.
- Handles uncached network failure with `Response.error()`.
- Handles cache-lookup rejection while keeping `event.respondWith()` synchronous in the fetch callback.
- Keeps cached-asset refresh attached to `event.waitUntil()` and redacts diagnostic output.
- Adds an acceptance test for an uncached fetch rejection, synchronous `respondWith`, `Response.error()`, and credential-free diagnostics.

**Status:** `OPEN_IMPLEMENTED_PENDING_TEST_AND_FRESH_SCAN`. At this documentation update, Core `test-and-build` and local Supabase/Playwright were still in progress on the exact PR #394 head; the service-worker/JavaScript, Python, Gitleaks and public UI checks had succeeded. Do not mark these three newer findings closed until PR #394 is integrated and an authorized fresh CodeInspector scan is tied to a named current-main SHA.

## 4. TS0003 — 148 findings

The 148 TS0003 rows in this report have **not** been individually reconciled against a known scan-input SHA. Their file names and reported line numbers are historical coordinates, and the report does not identify the source commit.

Do not use the earlier 239-row baseline reconciliation as a substitute for these 148 rows. The previous P2 ledger remains separately classified (76 implemented pending fresh scan, 26 not reproduced but not closed, and two code findings handled by PR #391). PR #391's source refactor and its exact-head CI do not constitute a fresh CodeInspector result.

## 5. Verification boundary and next action

- No row in this supplemental triage is marked `CLOSED`.
- No lint, TypeScript, AST, unit-test, Playwright, PostgreSQL, or Gitleaks result is presented as a replacement for CodeInspector.
- The original 181-finding report remains bound to `scan_input_sha=UNKNOWN`.
- Required closeout: run an authorized fresh CodeInspector scan on a named current-main SHA, then reconcile every returned rule/path/line against this supplemental triage and the historical 239-row ledger without combining their identities.
