# P2 LIVE CHECKPOINT OVERRIDE — 2026-11-05 — BODY-COMPLETION-ON-MAIN-018

- Current main code SHA: da9d6495ef36a4f37ca91ce21153e0b6c7b9bcf5; BODY018 base: 6ca6f9700b797eb120dec6bfe6f8fc278d010858.
- Completed BODY-COMPLETION-ON-MAIN-018 — source-backed supplier invoice and three-way matching.
- Status: IMPLEMENTED_ON_MAIN / ACCEPTANCE_PENDING.
- Paths delivered:
  - supabase/migrations/20261105240000_supplier_invoice_three_way_matching.sql
  - src/lib/supplier-invoices.ts
- Prior BODY017 supplier payments remain delivered and unchanged:
  - supabase/migrations/20261105235000_supplier_payment_settlement.sql
  - src/lib/supplier-payments.ts
  - src/lib/supplier-account-activity.ts
- SQL contracts: tenant-scoped invoice source + receipt-line allocations, unique supplier invoice number, exact source costs / quantity matching, idempotent capture, PO-serialized invoice quantity reservations, different-finance-actor variance approval/rejection, append-only invoice lines/history, bounded workspace read.
- Accounting boundary: invoice source is not a second payable; existing purchase-receipt journal is the liability source. Explicit tax is retained as evidence and left pending when non-zero. No inferred tax, FX, auto-post or duplicate journal.
- Main code commits: BODY017 final parent 6ca6f9700b797eb120dec6bfe6f8fc278d010858; BODY018 da9d6495ef36a4f37ca91ce21153e0b6c7b9bcf5.
- Migration blob b5c78a5b8c5fe77ec9115641146be87a8fffb773; typed client blob 0cfe8b0b87774697755421f7695b8a5d6ae44529.
- P1 UI handoff consolidates invoice + payment workspaces at top of docs/execution/P1_CHECKPOINT.md. P1 owns UI; P2 retains migration and typed service files. No P1 component paths changed.
- No tests/build/lint/typecheck/CI/browser/E2E/database migration apply/Bolt Preview/hosted/production verification run. Status is source-only acceptance pending; no PASS.
- No Vercel action/credit, paid services, production writes or live integrations.

## Exact next work

1. P1 mounts the two typed contracts in the existing supplier/procurement/General Ledger surfaces; keep changes in P1-owned components and avoid other in-flight files.
2. After the UI handoff is underway, P2 can add source document attachment and controlled tax/variance accounting only after verifying the existing same-tenant Storage and chart-of-accounts contracts. Until explicit mapping exists, tax stays pending and the invoice must not create another payable.
3. Do not perform broad scans or repeated test cycles during product-body work. Runtime acceptance remains a later explicit gate.

---

# P2 LIVE CHECKPOINT OVERRIDE — 2026-11-05 — BODY-COMPLETION-ON-MAIN-017

- Current main code SHA: 3e195869f22626af7419a4d479a94503d4159d16; base: 16fdfc348f37d4b9db844339048bf308642d0d61.
- Task: BODY-COMPLETION-ON-MAIN-017 — source-backed supplier payment and settlement.
- Status: IMPLEMENTED_ON_MAIN / ACCEPTANCE_PENDING.
- Owned paths delivered: supabase/migrations/20261105235000_supplier_payment_settlement.sql, src/lib/supplier-payments.ts, src/lib/supplier-account-activity.ts.
- Main code commits: 10e88e7ae54054fe8a77fd1696a35deeed474dde (migration initial); 722ff732895f460073d8dd4f357ee19addd5de3e (typed service + statement parser); 3e195869f22626af7419a4d479a94503d4159d16 (maker-checker ordering correction and final migration hardening).
- Server workflow: cash/bank asset-account mapping; immutable tenant-scoped payment source; exact same-currency posted-receipt allocation; idempotency and audit; different-finance-actor matching evidence before a balanced draft journal handoff; cancellation gate; posted/non-reversed journal-only paid balance; statement extension with completeness boundary.
- Financial safety: source capture reserves, not pays. Reconciliation same-key replay remains idempotent after handoff; new evidence events are blocked once the handoff occurs. Reconciliation must precede GL draft. No draft is counted as paid. No FX, no auto-post, no provider/bank integration, no inference outside receipt source population.
- P1 handoff written at top of docs/execution/P1_CHECKPOINT.md. P1 owns the payment workspace UI; P2 owns the three source/library paths. Do not overlap.
- Exact tests/build/lint/typecheck/CI/browser/database/hosted/production acceptance: NOT RUN by the user's explicit product-body priority. Migration NOT APPLIED. No PASS claimed. No Vercel operation/credit or paid dependency.
- exact_next_command: resume from current main; check only whether P1 has mounted the service using the P1 checkpoint, then proceed to BODY-COMPLETION-ON-MAIN-018 supplier invoice capture/three-way match in unowned P2 paths. Keep source-only and finance controls; do not start test loops.

---

# LIVE RESUME OVERRIDE — 2026-10-30 — SUPERSEDES ALL OLDER P2 NEXT ACTIONS
- Resume base: main `353588f5df5f36cfb6b7caaef5d067bd28371251`. Core run `41007651137` is IN_PROGRESS on this SHA; poll it. Cleanup `41007651120` is SUCCESS on this SHA.
- Do NOT execute `AUTHZ-GL-DRAFT-STAFF-DENIAL-001`: this ID is absent from the current acceptance CSV. Existing GL post/void/reversal staff-denial rows already have exact-SHA evidence on `5e53622b66de3947758b14026432953560b267bb`.
- First task: repair the P2-owned DLV-017 acceptance failure in [P2 run 41006679265](https://github.com/Report-Engainall/Nasr1/actions/runs/41006679265), parent SHA `63918d1af702f938353892f9fc9efd9709b9bf57`. In `e2e/finance-task-print.spec.ts`, getByRole cannot find the intentionally hidden mobile sidebar. Use stable `page.locator('#admin-sidebar')`; assert its Arabic aria-label, hidden/visible CSS states, focus, Escape and focus restoration. Do not weaken checks or modify P1 production UI without separate evidence.
- In that run the infrastructure gate/public smoke passed; local Supabase/Chromium failed on this locator; hosted customer/tenant E2E was SKIPPED (not PASS). This is currently a test-locator failure, not a proven DB authorization failure.
- After correction run focused Playwright then the full P2 workflow on the resulting exact SHA. Poll recorded runs before starting duplicates. Then answer P3's tenant-safe aggregate contract request and continue highest-risk open P2 acceptance rows.
- P2 owns e2e/**, supabase/**, scripts/**, service/API/auth files and non-P3 src/lib. Do not touch P1 routes/components/styles or P3 intelligence modules/central ledger.
- This live block supersedes the invalid historical P2 pointer below. Read global CURRENT_EXECUTION_STATE first.

---

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
