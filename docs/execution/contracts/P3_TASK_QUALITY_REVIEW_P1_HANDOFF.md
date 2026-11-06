# P1 implementation handoff — Task Quality Review Form

**Feature:** `REF-TASK-QUALITY-REVIEWS-001`  
**P3 source SHA:** `1f09197ec8aa412428ae759353b32ede3b033e45`  
**Repository:** `Report-Engainall/Nasr1` — `main` only

## Required P1 action

Mount the exported `TaskQualityReviewForm` inside the existing task card in `src/components/TaskCenter.tsx`; do not add a route, modal workspace or second Task Center.

The current canonical UI source already supplies the required values:
- `OperationalTask` in `src/lib/types.ts` extends `AiTask` with `updated_at: string`.
- `fetchOperationalTasks()` in `src/lib/api.ts` selects `*` from `ai_tasks`, so it already returns persisted `updated_at`.
- The current `TaskCenter.tsx` task card already renders metadata and role-gated `canManage` actions.

Use the actual task row/version:
```tsx
<TaskQualityReviewForm
  key={task.id}
  taskId={task.id}
  taskUpdatedAt={task.updated_at}
  onSaved={refreshExistingTaskCenterData}
/>
```
Replace `refreshExistingTaskCenterData` with the existing TaskCenter reload callback; do not create a new fetch source. Add the form behind the existing manager/admin presentation gate. The server remains the authorization boundary.

Do not pass `decisionOutcomeId` unless an existing server-owned relationship supplies the exact same-tenant outcome for this task. Never infer or fabricate an outcome ID. Keep the form available on closed tasks too, since actionability and false-positive alerts may be reviewed after resolution.

## Existing scorecard integration

P1 already mounted `TaskPerformanceScorecard` in `IntelligenceWorkspace.tsx` at commit `82424db8079c512f84e87b69715453fe24b6330b`. P3 updated the existing `fetchTaskPerformanceScorecard()` client to request `fetch_task_performance_scorecard_with_quality()` and fall back to the legacy RPC only while the quality migration is absent. Do not add another scorecard mount or duplicate read path.

Quality panel states:
- `READY`: shows persisted manager-readable aggregates and reason groups.
- `RESTRICTED`: shows no counts or reasons.
- `EMPTY`: says no quality reviews have been recorded; it does not infer that tasks are actionable or alerts true.
- `UNAVAILABLE`: migration/source not ready; no synthetic zero metrics.

## Form behavior

`TaskQualityReviewForm` is exported from `@/components/intelligence`; the write client is exported from `@/lib/intelligence`.

It supports:
- Actionability: ACTIONABLE / NOT_ACTIONABLE / DEFERRED.
- Recommendation disposition: APPROVED / REJECTED / DEFERRED.
- Alert validation: TRUE_POSITIVE / FALSE_POSITIVE / NEEDS_REVIEW.
- Required standardized reason for negative/deferred/false-positive classifications. OTHER requires a short note (max 500 characters).

The form never updates task status, executes a recommendation or changes decision-outcome state. It writes only through `record_operational_task_quality_review()`. A success message appears only after a validated server response. The in-memory event/idempotency keys remain stable on an uncertain network retry and reset if task ID/version or review inputs change, or after stale/conflict results.

On STALE, refresh the authoritative task row and show its new version before allowing the reviewer to submit again. Do not resubmit against old `updated_at`. Denied, conflict and unavailable states must not display success.

## P1 acceptance

Add focused UI tests in the existing TaskCenter test file:
1. Form appears only to existing manager/admin users; no new client permission path.
2. It receives the real task UUID and persisted `updated_at`.
3. Confirmed save refreshes existing task data; no task status is silently changed.
4. Closed tasks remain reviewable for actionability/false-alarm checks.
5. Stale, denied, conflict and unavailable responses do not show success.
6. Switching task cards cannot reuse another task's idempotency state (`key={task.id}`).

Record exact SHA and evidence in P1 checkpoint. This handoff does not authorize applying migrations, production operations, paid services or CI runs.

## Migration/runtime boundary

P3 source migration: `supabase/migrations/20261106090000_operational_task_quality_reviews.sql`; it is source-only and has not been applied to Bolt/Supabase. Apply in the approved non-production workflow after the task scorecard/audit migrations:
- `20261106060000_intelligence_task_performance_scorecard.sql`
- `20261106070000_operational_task_status_audit_parity.sql`
- `20261106080000_intelligence_task_reopen_audit_window.sql`
- `20261106081000_operational_task_audit_payload_and_boundary.sql`
- `20261106090000_operational_task_quality_reviews.sql`

Bolt/DB acceptance is separate from P1 mounting. No production operation or paid service is authorized.
