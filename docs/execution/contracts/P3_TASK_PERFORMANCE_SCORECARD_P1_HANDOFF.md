# P1 handoff — Task Performance Scorecard

**Feature:** `REF-SECTION-61-TASK-PERFORMANCE-SCORECARD-001`  
**Code SHA:** `149156c9f957e24be2448ebc91887c9b1af2ea99`  
**Repository:** `Report-Engainall/Nasr1` — `main` only

## Integration contract

Mount `TaskPerformanceScorecard` once inside the existing `IntelligenceWorkspace`. Do not create a second intelligence route, duplicate task center, or local/mock scorecard source.

Imports are already exported:
- `TaskPerformanceScorecard` from `@/components/intelligence`
- `fetchTaskPerformanceScorecard` from `@/lib/intelligence`
- Types `TaskPerformanceScorecard` and `TaskPerformanceScorecardFetchResult` from `@/lib/intelligence`

The client calls only `fetch_task_performance_scorecard()`. The RPC resolves the active actor and organization from the authenticated server session and returns aggregate-only rows for the current caller's authorized task roles. Do not supply a tenant ID, query `ai_tasks` or `audit_logs` directly from this component, or expose task IDs, task titles, assignee IDs or payloads.

## Required UI behavior

1. Use the component's `loading`, `unavailable`, `error` and `ready` states. A denied RPC must be shown as an error/permission state, not as an empty queue.
2. Load the scorecard via `fetchTaskPerformanceScorecard()`; on `ok: true`, pass `scorecard` and `state="ready"`. On failure, map `UNAVAILABLE` to `state="unavailable"`, and `DENIED/ERROR` to `state="error"`, passing the returned message and a real retry callback.
3. Use no fixtures, hard-coded counts, fake empty results or optimistic success. If the migration is not applied, show the unavailable state.
4. Keep the workspace role/navigation model intact. The RPC is authoritative for tenant and task-role scope; component labels are not a permission boundary.
5. Do not add employee rankings, a complete reopen percentage, duplicate-replay rate, actionability/false-alarm rates or improvement claims from the current data.

## Metric semantics and limits

- Traceability denominator: tasks with a source entity marker (source entity type or entity ID). Full traceability requires source event key + entity type + entity ID. Manual/unlinked tasks are outside this source-linked denominator.
- Idempotency-key coverage is not a duplicate replay rate. The unique source-key index prevents duplicate task rows for keyed source events, but rejected/replayed attempt counts are not stored.
- Median/P90 uses current completed tasks where `created_at` and `completed_at` are valid and ordered. Missing/invalid timestamps are separately counted. It is not first-completion history and is not employee-attributed.
- Reopen event counts are an audit-observed lower bound. Source-triggered task upserts can reopen a completed task without a status audit event. Therefore reopen completeness is PARTIAL and `reopenRatePercent` is intentionally NULL.
- `completePopulation=true` means the full task population visible to the returned `visibleRoles`, not tasks in roles the caller cannot view.

## Acceptance boundary

The migration is source-only until synced/applied to the approved non-production database. Source-level tests are committed but have not been run. P1 mount evidence must record the exact main SHA and real UI state; database role/tenant proof and runtime acceptance remain separate. No production operation or paid service is authorized by this handoff.
