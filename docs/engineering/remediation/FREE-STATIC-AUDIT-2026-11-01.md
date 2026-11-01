# Free Static Audit and Remediation Record — 2026-11-01

## Executive scope

This record establishes a no-payment verification path for `Report-Engainall/Nasr1`. It deliberately keeps independent scanner evidence separate from CodeInspector dispositions.

The user-provided CodeInspector summary for `main` reports:

- Scan time: `2026-11-01T17:38:11.0353760Z`
- Files: 718
- LOC: 139,571
- Total findings: 118
- JavaScript: 3 findings
- Python: 0 findings
- TypeScript: 115 findings

The full row-level export for these 118 findings and the exact scanned source SHA were not present in the repository or the supplied summary. Therefore **none of the 118 findings is marked closed or mapped by this record**. A line-level CodeInspector export and its scanned SHA remain necessary for exact reconciliation.

## Free scanning path now available

Merged PR [#404](https://github.com/Report-Engainall/Nasr1/pull/404) adds `.github/workflows/free-static-analysis.yml` with:

1. GitHub CodeQL for JavaScript/TypeScript and Python.
2. Semgrep Community Edition CLI, without a paid CodeInspector account.
3. A repository TypeScript AST structural proxy that emits JSON and Markdown artifacts.

These are independent checks; none is presented as a CodeInspector-compatible finding count or a substitute for its report.

## Structural proxy evidence

The proxy measures nested control-flow depth in tracked TypeScript files under `src/`, `supabase/`, `e2e/`, and `scripts/`; it excludes generated and archived recovery snapshots. It counts if/switch/loops/try/catch/conditional expressions and measures nested functions independently.

On the PR #405 validation ref `b434865c43c0039d2a0e85ff02ba8d59fc5fa552`, the uploaded artifact reported:

- Tracked TypeScript files: 595
- Parsed files: 595
- Functions measured: 9,571
- Depth violations above 5: 0
- Parse errors: 0

The preceding proxy run reported 9 violations; an intermediate refactor run reduced this to 2; the subsequent report reached 0. This is a measured improvement in the proxy's own metric, not evidence that CodeInspector's 118 findings are closed. Final application build and test gates for PR #405 remain authoritative before merge.

## Semgrep baseline and hardening scope

The pre-hardening Semgrep artifact on PR #405 reported 59 matches and 5 scan errors:

- 53 mutable GitHub Actions tag references.
- 1 token-shaped logger-test fixture.
- 1 Bun minimum-release-age warning.
- 1 Git SHA-1 compatibility warning.
- 2 dynamic `urllib` URL warnings.
- 1 dynamic RegExp compilation warning.
- Scan errors included one timeout in a migration test script and partial parsing of shell snippets containing GitHub Actions expressions in the Playwright workflow.

The results show why scanner findings need context: the SHA-1 call computes a Git blob object identifier for Git compatibility, not a cryptographic signature. It is marked `usedforsecurity=False`; it must not be reused for security-sensitive integrity or signature purposes.

PR [#406](https://github.com/Report-Engainall/Nasr1/pull/406) applies the supply-chain and Python hardening:

- Pins the previously mutable action references in 14 workflows to verified immutable commits.
- Constructs the JWT-shaped logger-redaction fixture at runtime rather than storing a token-shaped literal.
- Raises Bun's `minimumReleaseAge` to 604,800 seconds (7 days).
- Restricts the archive downloader to the repository's fixed HTTPS raw GitHub URL prefix.
- Restricts source-snapshot downloads to HTTPS GitHub hosts and rejects embedded URL credentials.
- Documents the Git blob SHA-1 compatibility use and marks it as non-security use.

PR #405 separately bounds configurable import-regex length, rejects common catastrophic-backtracking constructs, caches compiled patterns with a bounded cache, caps tested field values at 2,048 characters, and removes dynamic regular expressions from fixed XLSX XML tag/attribute parsing. A unit test covers the input-length bound.

## CI evidence boundaries

A successful job means only that the named job passed on its exact SHA. The hosted customer/tenant Playwright workflow is skipped when its external tenant environment is unavailable; local Supabase persistence and tenant-isolation tests are the available local evidence and are not described as hosted end-to-end coverage.

No scanner suppression alone is treated as a vulnerability fix. Every suppression in the Python downloader and bounded regex paths must remain adjacent to its guarded call and include a rationale.

## Outstanding reconciliation

- Import the complete CodeInspector 118-row export and record its exact source SHA.
- Map each CodeInspector row to current source, an exact test, a merged PR, or a documented non-reproduction.
- Re-run CodeInspector, if its report becomes accessible, and reconcile only against that fresh report.
- Do not convert independent CodeQL/Semgrep/AST successes into CodeInspector closed statuses.
