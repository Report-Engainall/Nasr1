# P1 — Durable Work Checkpoint

هذا سجل تقدم فرعي لـP1 فقط؛ ليس مؤشراً عالمياً. المؤشر الوحيد هو docs/bolt-source-reconciliation/CURRENT_EXECUTION_STATE.md. حدّثه بعد كل مهمة/commit/failure وبحد أقصى كل 10 دقائق.

## Current checkpoint

- updated_at_utc: NOT SET
- owner: P1
- current_main_sha: NOT SET — fetch live main
- base_sha: NOT SET
- task_id: NOT SET — use existing acceptance CSV ID
- task_status: NOT STARTED
- reserved_paths: NOT SET
- commit_sha: NOT SET
- exact_next_action: اقرأ المؤشر العالمي ثم نفّذ الأمر المسجل؛ لا تعِد الاستكشاف.

## Completed work — newest first

| UTC | Task ID | Status | Base SHA | Result SHA | Changed files | Exact tests/results | Evidence |
|---|---|---|---|---|---|---|---|
| — | — | — | — | — | — | — | — |

## In progress / uncommitted work

- Files:
- Current command/process:
- Last output/failure:
- Root cause:
- Safe resume instruction:
- Do not discard:

## REQUEST TO P2 — API/backend contract

- Acceptance task ID:
- UI path(s):
- User action:
- Required API/RPC:
- Request payload:
- Response fields:
- Server-derived identity/tenant/role rules:
- Error states and SQLSTATE/HTTP status:
- Idempotency/audit/side-effect rules:
- Required acceptance test:
- Can P1 work independently while pending? YES by default.

## P2 RESPONSE / CONTRACT

- Decision: PENDING
- Existing contract reused or new:
- Contract owner:
- P2-owned files:
- Request/response schema:
- Permission/tenant semantics:
- Error semantics:
- Test proof / SHA:
- P1 may integrate at:
