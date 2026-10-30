# P2 — Durable Backend Checkpoint

ملف خاص بـP2، وليس مؤشراً عالمياً. المؤشر الوحيد: `docs/bolt-source-reconciliation/CURRENT_EXECUTION_STATE.md`. سجل القبول الوحيد هو CSV الحالي.

## نقطة التسليم الثلاثي — 2026-10-30
- owner: P2 — database/backend/security/integrations.
- base_main_sha_at_handoff: `32e732c77305598463f776c206a3868e3ee12146` (تحقق من main قبل العمل).
- active_task_id: `AUTHZ-GL-DRAFT-STAFF-DENIAL-001`.
- exact_next_command: تحقق أن المهمة ما زالت OPEN في المصفوفة؛ إذا نعم نفذ اختبار رفض إنشاء قيد اليومية لموظف عادي من task command. إذا أُغلقت، خذ أول task أمني/مالي مفتوح من المصفوفة وسجل لماذا استبدلتها.
- reserved_paths: supabase/**, scripts/**, src/lib/api.ts, src/lib/supabase.ts, src/lib/auth.tsx وsrc/lib/** باستثناء ملفات P3 intelligence.
- workflow: detached local worktree + local commits؛ لا push إلى main؛ P3 يدمج عبر integration queue.
- retry_count: 0 للمهمة الجديدة عند التسليم.
- status: RESUME_REQUIRED، لا يوجد PASS جديد في هذا الملف.

## سجل تحديثات P2 (الأحدث أولاً)
أضف كل تحديث: UTC، task_id، status، base/result SHA، paths، migration/RPC/Edge contract، commands/results، Core/P2/PG17 run IDs exact SHA، root cause، retry count، blocker، local commit، integration status، request/response من P1/P3، وexact_next_command. لا تكرر مصفوفة القبول أو سجل الأدلة المركزي.
