## Latest verified source checkpoint — 2026-11-05

- Live source: `Report-Engainall/Nasr1` / `main`.
- Latest product-code SHA: `310c41e3d2e68f57b45b2cd117f489d9244d608f`.
- Completed: `BODY-COMPLETION-ON-MAIN-012` — replenishment subtracts the remaining quantity in same-tenant submitted/partially received purchase orders before recommending another purchase. Draft/cancelled/received orders are excluded; unit mismatch withholds the recommendation.
- Files: `supabase/migrations/20261105230000_intelligence_replenishment_open_purchase_orders.sql`, the inventory-intelligence client, replenishment engine, Arabic card and source fixtures/cases.
- No tests/build/CI/database/Bolt runtime checks were executed; no PASS claimed. Migration not yet applied.
- No Vercel credits were used.
- Next: `BODY-COMPLETION-ON-MAIN-013` — prefill a user-confirmed purchase-order draft from selected recommendations, requiring supplier and warehouse choice; reuse the existing idempotent purchase command and never auto-submit.
- Bolt runtime handoff remains deferred.

---

# LIVE EXECUTION CHECKPOINT — 2026-11-05 — CUSTOMER 360 INTERACTION CRM + FOLLOW-UP TASK FLOW

- Repository: `Report-Engainall/Nasr1`; branch: `main` only.
- Main at the beginning of this Customer 360 product batch: `5f9332843bc81b5bfacd1e8d973fecd317071ed5`.
- Last verified main head immediately before this checkpoint update: `b78e331134f70f44d2371e0eeae528da19f625fc`.
- The main head above includes the Customer 360 interaction implementation and acceptance-matrix updates. It also contains a subsequent main commit `feat(storefront): notify customer members about order lifecycle` (`b78e331...`); that independent commit was preserved and not overwritten.
- All work in this stream was committed directly to the official `main`; no feature branch was created.

## New product capabilities implemented

### Customer 360 — append-only interaction history
- Added `supabase/migrations/20261105130000_customer_interaction_history.sql`:
  - Tenant-scoped `customer_interactions` table with customer, server-derived recorder, contact type, subject, details, occurrence time, optional next follow-up, creation timestamp and organization-scoped idempotency key.
  - Direct client table privileges are revoked; the browser cannot insert, update or delete interaction rows.
  - `record_customer_interaction` checks an active staff profile and current organization, locks the customer row, verifies customer membership in that organization, validates the interaction payload and optional future follow-up, writes the immutable interaction and an `audit_logs` event.
  - `get_customer_interaction_history` returns latest bounded records with recorder display names, and verifies the active staff/tenant/customer scope.
  - No interaction write changes customer balances, orders, invoices, payments, stock or accounting.
- Idempotency:
  - A unique `(organization_id,idempotency_key)` index prevents duplicate saves.
  - Replaying the same key with the same customer/actor/type/subject/details/follow-up returns the original interaction ID without a second interaction, audit entry or follow-up task.
  - Reusing the same key with different input is rejected.
  - Replay is resolved before checking whether the original follow-up date is now in the past, so a delayed network retry remains safe.
  - The UI retains the key after an unsuccessful request and renews it after successful save or when the user changes input.
- Added `CustomerInteraction` and `CustomerInteractionType` models to `src/lib/types.ts`.
- Added strict response parsing plus `fetchCustomerInteractions` and `recordCustomerInteraction` RPC wrappers in `src/lib/api.ts`.
- Added the Customer 360 form and saved interaction timeline in `src/components/AdminCustomer360.tsx`, supporting call, visit, WhatsApp, email, meeting, internal note and other; each record shows timestamp, content, recorder and optional follow-up.
- Added responsive interaction form/history styles to `src/styles.css`.

### Scheduled follow-up becomes an operational sales task
- When an interaction includes a future follow-up date, the same database transaction creates one idempotent task using the existing `upsert_operational_task` contract.
- The task is in the `sales` role queue, carries the due date and concise interaction context, and links to its source interaction using a stable source event key.
- It is **not assigned to the employee who recorded the interaction**; it is made visible in the sales role queue for authorized staff. The Customer 360 UI wording reflects this.
- `src/components/TaskCenter.tsx` labels the source as `متابعة عميل 360`.
- No task is created when no follow-up date is supplied; same interaction replay does not create a second task.

### Customer 360 print/PDF and Excel outputs
- `src/lib/customer-360-print.ts` extends the explicit allowlisted print DTO with the latest interaction rows. It includes only interaction type, subject, details, occurrence date, follow-up date, record date and recorder display name; it excludes organization, customer, interaction, profile and other internal UUIDs.
- `src/components/Customer360PrintSheet.tsx` adds a dedicated interaction-history section.
- `src/lib/customer-360-xlsx.ts` adds a dedicated `سجل التواصل` worksheet.
- `src/components/AdminCustomer360.tsx` now synchronizes the fetched interaction list with print/export. Print and export remain disabled while interaction history is loading or failed, avoiding a seemingly complete file that silently omits the history.
- Interaction details are explicitly limited to the latest 50 entries in the UI and exports; older entries remain stored and are not claimed to be included.

## Files changed in this product batch

- SQL: `supabase/migrations/20261105130000_customer_interaction_history.sql`.
- Types/API: `src/lib/types.ts`, `src/lib/api.ts`.
- Customer 360 UI: `src/components/AdminCustomer360.tsx`, `src/styles.css`.
- Print/PDF projection: `src/lib/customer-360-print.ts`, `src/components/Customer360PrintSheet.tsx`.
- Excel export: `src/lib/customer-360-xlsx.ts`.
- Operational task source label: `src/components/TaskCenter.tsx`.
- Acceptance matrix: `docs/bolt-source-reconciliation/REMAINING_SCREEN_ACCEPTANCE_MATRIX_2026-10-22.csv`.
- Added matrix leaves:
  - `DLV-006-CUSTOMER-INTERACTION-HISTORY-001`
  - `DLV-006-CUSTOMER-INTERACTION-IDEMPOTENCY-001`
  - `DLV-011-CUSTOMER-INTERACTION-EXPORT-001`
  - `DLV-015-CUSTOMER-FOLLOW-UP-TASK-001`

## Evidence boundary — do not overstate

- Source and documentation updates are committed on `main`. The latest Customer 360 interaction form/idempotency UI commit is `5f5a1f239e2e2ee9825f310987d0f192373b1a7e`; the full replacement migration commit is `3adc4e033e6addc94fb41b159e7add54b9a4934c`; the matrix update commit is `c24a8744cab044e488e6ea1c5344929169a84ca6`.
- The SQL migration was **not applied** to local, hosted or production PostgreSQL. No production data, schema, tenant, credentials or storage was changed.
- No tests, build, lint, local Supabase, CI, browser E2E, Bolt Preview or runtime check was run in this product batch. The owner asked to prioritize implementation and avoid spending the session on broad test cycles. No test PASS is claimed.
- DLV rows remain `IMPLEMENTED_ON_MAIN / ACCEPTANCE_PENDING`; implementation in source is not the same as runtime acceptance.
- The Customer 360 history read/export is bounded to the latest 50 rows. It is not described as the complete history in print/XLSX.
- Interaction follow-up tasks remain in the sales role queue and are not automatically assigned to the recording employee.
- Lovable detachment remains integrated from `b0a091e0a506da43a9b0d0dd0d1e9b992498ca63` and CI alignment `45ca19c47a985b2d12d23c846ba068222a4e17ce`. No Lovable dependency was reopened.
- Bolt runtime remains deliberately deferred until practical source/product handoff readiness.

## Bolt archive disposition

- Original archive remains available from the ChatGPT Library at `/mnt/data/project-bolt-github-8ccbjvhg (2).zip`.
- Verified outer SHA-256: `db56924e7d629e480c96652ada8090f9605f466ccb773580446ce5b45cb09bc9`; the ZIP listing contains 1,211 entries.
- The P3 dossier records 69/69 staged provenance files mapped to the existing integration ledger, the inner CSV helper as an exact target match, the product-image helper as superseded, and legacy privileged migrations as excluded.
- No new byte-for-byte comparison of all 1,211 ZIP entries was performed in this batch. Do not claim full archive parity or copy the historical ZIP over the newer NASR1 tree.

## Next implementation action

- `NEXT_ACTION_ID: BODY-COMPLETION-ON-MAIN-006`.
- Extend the Customer 360 follow-up lifecycle: add a tenant-scoped command to reschedule or cancel an open customer-follow-up task from the interaction history while keeping the interaction as an immutable record and the linked `customer_follow_up:<interaction-id>` task synchronized in one transaction. Record old/new follow-up time and action in audit logs; cancellation must require a reason and must not be undone by source reconciliation. Keep the sales queue visible and preserve idempotency.
- Continue product work in multiple connected code changes per launch. Do not begin broad tests/build/lint/CI or Bolt Preview during this implementation phase.

---
# LIVE EXECUTION CHECKPOINT — 2026-11-05 — TASK LIFECYCLE, BULK OPERATIONS AND ASSIGNEE NOTIFICATIONS

- Repository: `Report-Engainall/Nasr1`; branch: `main` only.
- Initial main for this implementation stream: `294f85c2a4eae8d9a32109684f8166872eacb44d`.
- Last recorded main head before this checkpoint update: `816c6ba961098678ed1d2769eabfe1bec9535aa9`.
- No feature branch was created. Application code, SQL migrations and the acceptance matrix are on the official `main` tree.

## Product capabilities added

### Operational task lifecycle
- Reassign or unassign a single open task with same-tenant active-user and task-role validation; row lock, idempotent no-op and old/new audit evidence.
- Change task priority and due date after creation; same-tenant manager authorization, row lock, input guard and persisted `manager_overrides` so source refresh will not silently revert an intentional manager decision.
- Edit title/description only for open manual tasks. The server rejects system-generated tasks that have source entity references; old/new values are audited.
- Cancel an open task only with a mandatory reason. The reason is stored in `resolution_note`, a `manager_cancellation` payload marker and the audit log.
- Explicit manager reopen clears the cancellation marker. The source reconciliation upsert preserves the marker and cancellation until this explicit reopen, avoiding accidental reactivation.
- Require a non-empty execution outcome (up to 1,000 characters) before task completion. The result is passed to the existing status RPC, stored in `resolution_note`, shown in task details and reused by the current print projection. The UI retains the typed result if persistence fails.

### Bulk task operations
- Atomic bulk reassignment/unassignment for up to 100 selected open tasks. The RPC rejects duplicate IDs and validates every task/assignee; deterministic row locks plus one transaction mean a bad member rolls back the complete batch. Audit is written per changed task; identical assignment replay is a no-op.
- Atomic bulk priority/deadline update for up to 100 selected open tasks. The user must choose an explicit new deadline (blank cannot silently clear existing dates); the manager override is stored and audit is recorded per changed task.
- The manager toolbar filters completed/cancelled tasks out of the bulk payload and uses responsive controls.

### Task assignment notifications
- `supabase/migrations/20261105120000_operational_task_assignment_notifications.sql` creates/aligns the notification contract used by the existing `fetchNotifications` UI, enables row-level security and adds a restrictive tenant/profile guard.
- A database trigger inserts one in-app notification when a task is created already assigned, assigned/reassigned to a different profile, or an unassigned task is first claimed. An unchanged assignment produces no new notification; source reconciliation without an assignee change does not create notification spam.
- Browser privileges are restricted to reading the fields consumed by the UI and updating `is_read`; direct client insert/delete and general update are revoked. The API now requests only `id, organization_id, profile_id, title, body, type, is_read, created_at`.

## Files added/updated

- New SQL:
  - `supabase/migrations/20261105100000_operational_task_reassignment.sql`
  - `supabase/migrations/20261105103000_operational_task_details_update.sql`
  - `supabase/migrations/20261105104500_manual_operational_task_edit.sql`
  - `supabase/migrations/20261105110000_operational_task_cancel_reason.sql`
  - `supabase/migrations/20261105113000_operational_task_bulk_assignment.sql`
  - `supabase/migrations/20261105114000_operational_task_reopen_cancel.sql`
  - `supabase/migrations/20261105115000_operational_task_bulk_details_update.sql`
  - `supabase/migrations/20261105120000_operational_task_assignment_notifications.sql`
- Updated application:
  - `src/components/TaskCenter.tsx`
  - `src/lib/api.ts`
  - `src/styles.css`
- Updated acceptance matrix:
  - `docs/bolt-source-reconciliation/REMAINING_SCREEN_ACCEPTANCE_MATRIX_2026-10-22.csv`
  - Rows now cover task lifecycle editing/cancellation/reopen, bulk reassignment, bulk priority/deadline, completion outcome and assignee notifications.

## Exact implementation status

- Source and SQL migrations are committed on `main`; this is implementation evidence, not runtime acceptance.
- No tests, build, lint, local PostgreSQL, Supabase, CI, Bolt Preview or end-to-end browser check was run in this stream. The owner's instruction is to prioritize the actual product body instead of spending this session in another broad test cycle.
- These SQL migrations have not yet been applied to a local, hosted or production database. No production data, tenant records, credentials or external storage were changed.
- The task leaves remain `IMPLEMENTED_ON_MAIN / ACCEPTANCE_PENDING`; no PASS, release GO or Bolt runtime claim is made.
- Lovable build/editor-preview/telemetry detachment remains from the earlier merged commits `b0a091e0a506da43a9b0d0dd0d1e9b992498ca63` and CI alignment `45ca19c47a985b2d12d23c846ba068222a4e17ce`. No Lovable dependency was reopened here. Bolt runtime remains deferred until practical product-body readiness.

## Bolt archive disposition

- Original archive found in the ChatGPT Library and materialized at `/mnt/data/project-bolt-github-8ccbjvhg (2).zip`.
- Outer SHA-256 verified as `db56924e7d629e480c96652ada8090f9605f466ccb773580446ce5b45cb09bc9`; ZIP listing contains 1,211 entries.
- The P3 dossier records 69/69 staged provenance files mapped to the existing integration ledger, inner CSV helper exact-matched, product-image helper superseded and legacy privileged migrations excluded. Archive checkpoint `3f33dba1d1879fc1426a2428e331b496c6241dae` is recorded as an ancestor of the reviewed main line.
- This session did not perform a new byte-for-byte comparison of all 1,211 archive entries against latest main. Do not claim complete entry-by-entry parity or overlay the historical ZIP over current NASR1.

## Next implementation action

- `NEXT_ACTION_ID: BODY-COMPLETION-ON-MAIN-004`.
- Move beyond the task center to the next source-level product gap in the customer/storefront/commerce domain. Start with the existing customer 360 interaction/history flow: inspect its current read contracts and customer detail entry point, then add a real tenant-scoped interaction record/write workflow that preserves customer privacy, appends audit evidence and displays the saved history. Do not begin with broad test execution.
- Continue with multiple connected product features per launch, preserving existing screens, SQL history, role controls, price privacy and business contracts. Keep Bolt import/Preview deferred until source/product work is practically ready.

---

# LIVE EXECUTION CHECKPOINT — 2026-11-05 — OPERATIONAL TASK LIFECYCLE PRODUCT BUILD

- Repository: `Report-Engainall/Nasr1`; branch: `main` only.
- Initial main for this work: `294f85c2a4eae8d9a32109684f8166872eacb44d`.
- Latest application-code cursor: `1206932ea38f25905ec07b29bb7655260730630c`.
- Matrix/checkpoint update cursor before this document refresh: `8f3349983cbe8f25bae8754163d574a4c1b9492a`.
- No branch was created. All work was written directly to the official main line.

## Product functionality implemented in this batch

1. **Reassign or unassign one existing open task**
   - Migration: `supabase/migrations/20261105100000_operational_task_reassignment.sql`.
   - RPC: `assign_operational_task(uuid,uuid)`.
   - Manager/admin only; derives actor and organization server-side, locks the task, rejects cross-tenant/closed tasks, validates that the assignee is active in the same organization and has a compatible role, and writes old/new assignment data to `audit_logs`. Returning to the role queue is supported. Exact no-op is not audited.

2. **Change priority and deadline after creation**
   - Migration: `supabase/migrations/20261105103000_operational_task_details_update.sql`.
   - RPC: `update_operational_task_details(uuid,text,timestamptz)`.
   - Manager/admin only; same-tenant row lock, open-task restriction, bounded priority values, idempotent no-op and audit evidence. The manager override is retained in `task_payload.manager_overrides` so a later source refresh does not revert the chosen priority/deadline.

3. **Edit the title and description of a manual task**
   - Migration: `supabase/migrations/20261105104500_manual_operational_task_edit.sql`.
   - RPC: `update_manual_operational_task(uuid,text,text)`.
   - Manager/admin only; validates title/description limits, edits only `manual_operational_task` records with no source entity, and rejects completed/cancelled tasks. Old/new text is audited. System-generated order, invoice, inventory and other source tasks remain read-only through this control.

4. **Cancel an open task with a mandatory reason and explicitly reopen it**
   - Migration: `supabase/migrations/20261105110000_operational_task_cancel_reason.sql`.
   - RPC: `cancel_operational_task(uuid,text)`.
   - Cancellation reason is stored in `resolution_note`, a `manager_cancellation` payload marker and `audit_logs`. The source upsert preserves that marker and cancellation state during later source reconciliation.
   - Migration: `supabase/migrations/20261105114000_operational_task_reopen_cancel.sql`.
   - The existing status RPC is replaced so an explicit manager reopen clears the cancellation marker and records that removal in the status audit. The UI exposes Reopen for cancelled and completed tasks.

5. **Atomic bulk reassignment of selected tasks**
   - Migration: `supabase/migrations/20261105113000_operational_task_bulk_assignment.sql`.
   - RPC: `assign_operational_tasks(uuid[],uuid)`.
   - Supports up to 100 distinct open task IDs, same-tenant active compatible assignee validation, deterministic row-lock order, all-or-nothing rollback if any task is missing/closed/incompatible, a per-changed-task audit row, and no-op replay handling. The UI sends selected open tasks only and can return them to their role queues.

6. **Require an execution outcome before task completion**
   - `src/components/TaskCenter.tsx` now opens an outcome editor before allowing completion. An empty result cannot be submitted; a result of up to 1,000 characters is passed through the existing status RPC into `resolution_note`, which is displayed in task details and the established print projection.
   - The UI keeps the entered result visible when the RPC fails; the draft closes only after a successful status update and reload.

## Application files changed

- `src/components/TaskCenter.tsx`: manager edit controls, manual-text editor, reasoned cancellation/reopen, selected-task bulk reassignment, and completion outcome capture.
- `src/lib/api.ts`: validated RPC wrappers for single assignment, bulk assignment, task-detail updates, manual-task text updates and reasoned cancellation. No direct browser write to `ai_tasks` was added.
- `src/styles.css`: responsive styles for the added controls.
- `docs/bolt-source-reconciliation/REMAINING_SCREEN_ACCEPTANCE_MATRIX_2026-10-22.csv`: added/updated the task lifecycle, bulk assignment and completion-outcome acceptance leaves.

## Evidence and limits — do not overstate

- The changes above were committed directly to `main`. The last application-code commit is `1206932ea38f25905ec07b29bb7655260730630c`; the matrix update commit is `8f3349983cbe8f25bae8754163d574a4c1b9492a`.
- No tests, build, lint, local PostgreSQL, Supabase, CI, Preview or Bolt runtime check was run in this implementation batch. The user explicitly prioritized implementing product features over repeated testing. Existing focused UI specs remain in the repository but are not reported as executed or PASS.
- The new SQL migrations have not been applied to a live or local database. No production data/schema, external credentials, tenant records or storage were changed.
- DLV-015 task leaves are marked implemented in source but **acceptance pending** until the relevant bounded runtime evidence is requested. No PASS or release readiness is claimed.
- This batch did not change the Lovable detachment or activate the Bolt handoff. Lovable source/build/preview/telemetry detachment remains in the earlier merged work (`b0a091e0a506da43a9b0d0dd0d1e9b992498ca63`, with CI alignment `45ca19c47a985b2d12d23c846ba068222a4e17ce`). Bolt runtime remains intentionally deferred until practical product-body readiness.

## Bolt archive disposition

- The original ZIP was located in the ChatGPT Library and materialized at `/mnt/data/project-bolt-github-8ccbjvhg (2).zip`.
- Verified outer SHA-256: `db56924e7d629e480c96652ada8090f9605f466ccb773580446ce5b45cb09bc9`; the ZIP contains 1,211 entries.
- The P3 dossier in the repository records 69/69 staged provenance files mapped to the existing integration ledger, the inner CSV helper as an exact target match, the product-image helper as superseded, and legacy privileged migrations as excluded. The recorded archive checkpoint `3f33dba1d1879fc1426a2428e331b496c6241dae` is an ancestor of the reviewed main line.
- This session did not perform a fresh byte-for-byte comparison of all 1,211 entries against the latest main tree. Do not claim entry-by-entry archive parity and do not copy the historical archive wholesale over newer NASR1 files. No secrets, `.env` files or old generated build output were imported.

## Next action — continue product implementation, not test loops

- `NEXT_ACTION_ID: BODY-COMPLETION-ON-MAIN-003`.
- Extend the operational-task workflow with tenant-scoped in-app notifications on task creation/assignment/reassignment and explicit role-queue return. Reuse the existing notifications contract only after inspecting its current schema and read path; notify only the intended profile/role audience, avoid duplicate notifications on no-op replay, and do not create trigger-driven notification spam from source reconciliation.
- After that, continue with the next genuinely incomplete storefront/customer/commerce feature from the live acceptance matrix. Keep the current rule: implement source/product functionality in batches; do not run broad test suites or Bolt Preview during this phase.

---

# LIVE EXECUTION CHECKPOINT — 2026-11-05 — OPERATIONAL TASK REASSIGNMENT + TASK DETAIL EDITS

- Repository: `Report-Engainall/Nasr1`; branch: `main` only.
- Source code/test cursor before this documentation batch: `5c6a2a5b170afa65de1456ca7204d74540302ddf`.
- Main before this checkpoint: `926d57faa7585eef193f4e816819b47e40eda865` (the matrix now records the new leaf).
- Starting main for this implementation batch: `294f85c2a4eae8d9a32109684f8166872eacb44d`.

## Product functionality added

1. `supabase/migrations/20261105100000_operational_task_reassignment.sql`
   - Adds `assign_operational_task(uuid,uuid)`.
   - Manager/admin only; derives the active organization and actor from the authenticated server context.
   - Locks the task row, checks the task belongs to the active organization and is not completed/cancelled.
   - Validates the target profile is active, authenticated, in the same organization and compatible with the task role.
   - Supports assigning or returning the task to its role queue; identical replay is a no-op; real changes write old/new assignment, role and status into `audit_logs`.
2. `supabase/migrations/20261105103000_operational_task_details_update.sql`
   - Adds `update_operational_task_details(uuid,text,timestamptz)`.
   - Manager/admin only; row-locks a same-tenant open task; validates priority; updates priority/deadline together; identical replay is a no-op; real changes are audited.
3. `src/lib/api.ts`
   - Adds validated wrappers `assignOperationalTask` and `updateOperationalTaskDetails`; no direct browser-side write to `ai_tasks`.
4. `src/components/TaskCenter.tsx`
   - Adds manager controls to reassign/unassign open tasks, edit priority and deadline after task creation, and reload the persisted task after each saved change.
   - Assignee options reuse the existing same-tenant active-user list and role-compatibility rule. Completed/cancelled tasks do not expose edit controls.
5. `src/styles.css`
   - Adds compact responsive controls for the manager task editing actions.
6. `src/test/task-center-ui.test.tsx`
   - Adds focused UI regression specs for compatible reassignment/unassignment and priority/deadline updates.

## Evidence boundary

- Direct-to-main source commits in this batch: migration `5b0b08f99d31bf37f7832dbf551691578b50071e`; API `4f65332d570c578640dba38b58de70b903ad41ba`; TaskCenter `a05f05f835793d4acf733fcff0cfd0b31be2c88d`; styles `cf3930a1cb4e803161ed56150cf79a92ce6db709`; focused test `68535c56ea3e433020af7ca3fde447f62448676a`; details migration `2941ef90c7ac3fc48c25130043a7cccac1f9b207`; API details `7556725dfef1b15582d8a33d4bc65cde670a8367`; TaskCenter details `369494b01ff440f54d3787aba151802fcd6c33bd`; styles `37b95385ac353aaabb16ed57faf6502405091c63`; focused details test `5c6a2a5b170afa65de1456ca7204d74540302ddf`.
- Acceptance row added: `DLV-015-OPERATIONAL-TASK-MANAGEMENT-EDIT-001`, explicitly `IMPLEMENTED_ON_MAIN; ACCEPTANCE_PENDING`.
- The focused unit/UI specs were added but not run in this session. The new SQL migrations were not applied to PostgreSQL/Bolt or production; no database, tenant, storage, secrets or production records were changed. No CI PASS is claimed.
- This batch deliberately did not rerun the historical broad test suite or Bolt Preview.

## Archive and platform disposition

- The original user archive was recovered from the ChatGPT Library and materialized as `/mnt/data/project-bolt-github-8ccbjvhg (2).zip`.
- SHA-256 verified locally: `db56924e7d629e480c96652ada8090f9605f466ccb773580446ce5b45cb09bc9`; ZIP listing contained 1,211 entries.
- The in-repository P3 dossier records 69/69 staged provenance files mapped to existing ledger decisions, identifies the inner CSV helper as an exact target match, the image helper as superseded, and old privileged migrations as excluded. The archive checkpoint `3f33dba1d1879fc1426a2428e331b496c6241dae` is recorded as an ancestor of the reviewed main line.
- This session did not perform a new byte-for-byte comparison of all 1,211 ZIP entries against current main, and did not import/copy the old ZIP over the repository. Therefore full entry-by-entry archive parity is not claimed. Continue only for a concrete unmatched archive item; never copy `.env`, old lockfiles, generated artifacts or stale configuration over current files.
- Lovable build/editor/preview/telemetry detachment remains integrated from `b0a091e0a506da43a9b0d0dd0d1e9b992498ca63` and CI alignment `45ca19c47a985b2d12d23c846ba068222a4e17ce`; this batch did not reopen or alter it.
- Bolt runtime remains intentionally deferred until practical product-body handoff readiness. No Bolt project, database, authentication, storage, server functions or Preview was provisioned or tested.

## Next action

- `NEXT_ACTION_ID: BODY-COMPLETION-ON-MAIN-002`.
- Extend the existing TaskCenter with manager-only editing of title and description for open **manual** tasks, preserving source-generated task text as read-only. Use one tenant-scoped, row-locked RPC; validate length and ownership; write old/new values to `audit_logs`; expose it through `src/lib/api.ts` and the existing task card; add a focused regression spec. Continue direct-to-main and update the same four central records. Do not run broad suites or Bolt tests as a substitute for product implementation.
\n---\n\n## Verified DLV-011 acceptance already present on the tested application SHA

- Do not rebuild/retest the customer multi-invoice receipt print: DLV-011-CUSTOMER-MULTI-INVOICE-RECEIPT-PRINT-001 is accepted on exact code SHA 45ca19c47a985b2d12d23c846ba068222a4e17ce by P2 41940874520 SUCCESS. The full finance-task-print Playwright file ran in local PostgreSQL 17/Supabase + Chromium and included the 2-invoice allocation, saved receipt, identical reprints, unchanged balances/no duplicate financial movement, privacy/UUID exclusion, RTL/A4 and customer-denial checks. Detailed proof is in the acceptance matrix and execution checkpoint.
- DLV-011 remains PARTIAL with seven accepted leaves. Hosted customer/order/tenant remains SKIPPED_EXTERNAL.
- Current execution remains BODY-COMPLETION-ON-MAIN-001; Bolt import, provisioning and Preview are deferred until practical product-body readiness.

---
# OWNER CLARIFICATION — EXECUTION ORDER CORRECTION — 2026-11-05

**Highest priority: do not connect to Bolt yet.** The current phase is to continue completing the greatest practical amount of the existing Aghbari product body on NASR1/main first. The earlier text in this brief that labels BOLT-RUNTIME-001 as the immediate next action or says to stop DLV work until Bolt is verified is superseded by this owner clarification.

Current work: implement and accept all source/product-level gaps that can be completed without Bolt-provisioned resources. Preserve all screens, routes, workflows, business engines, SQL/migrations, RPC contracts, tests and documentation. Lovable source detachment is already complete; do not repeat it or reintroduce it. Do not create a Bolt project, sign in, import/sync main, provision Bolt DB, or run Bolt Preview during this phase. Continue on Report-Engainall/Nasr1 main only.

Activate BOLT-RUNTIME-001 only when the product body is at practical handoff readiness: source-level/product feature items that do not require Bolt's own provisioned resources are completed or have precise evidence-backed blockers. No arbitrary percentage or unsupported completion claim. At that later point, import the then-current main once into Bolt, use Bolt's built-in database/auth/storage/server functions, preserve every existing data/security/business contract, and let Bolt run Preview plus real E2E/security/commerce acceptance on one exact SHA. Do not use the historical ZIP as an overlay, separate external Supabase, Lovable services, paid billing, or weakened access controls.

CURRENT NEXT ACTION: BODY-COMPLETION-ON-MAIN-001.
DEFERRED ACTION: BOLT-RUNTIME-001 (only after the product-body handoff gate).

---
# SESSION RESUME — FINAL VERIFIED CURSOR — 2026-11-05

- Last verified main before this documentation correction: `Report-Engainall/Nasr1@main` SHA `9cb9d23ee1149fbe2a66988da48a6c076c8e15fe`. Fetch live `main` again before importing; this final follow-up changes documentation only.
- Application code SHA proven by CI: `45ca19c47a985b2d12d23c846ba068222a4e17ce` (the one commit from `45ca19c47a985b2d12d23c846ba068222a4e17ce` to `9cb9d23ee1149fbe2a66988da48a6c076c8e15fe` is documentation-only).
- Portability source commit: `b0a091e0a506da43a9b0d0dd0d1e9b992498ca63`; CI/test correction commit: `45ca19c47a985b2d12d23c846ba068222a4e17ce`.
- Core [41940874587 SUCCESS](https://github.com/Report-Engainall/Nasr1/actions/runs/41940874587): 272 files / 1,786 tests PASS, PG17/backup-restore/lint/build/Nitro-Vite preview/dev/price visibility PASS.
- P2 [41940874520 SUCCESS](https://github.com/Report-Engainall/Nasr1/actions/runs/41940874520): public UI 17/17; local authenticated E2E SUCCESS including orders/tenant, stock-count and purchase XLSX, checkout retry, returns, Onyx, print, customer-manager privacy/audit, and device-session revocation. Hosted customer/order/tenant remains SKIPPED_EXTERNAL.
- P1 TypeScript/static/secret scan/main cleanup all PASS on `45ca19c47a985b2d12d23c846ba068222a4e17ce`. Vercel check FAILURE; not Bolt evidence.
- Bolt runtime is still NOT VERIFIED. No Bolt project, built-in DB, auth, storage, server functions or Preview was accessed from ChatGPT.
- NEXT_ACTION_ID: `BOLT-RUNTIME-001`. Fetch and import the live latest `main` into Bolt (last verified pre-update cursor `9cb9d23ee1149fbe2a66988da48a6c076c8e15fe`); do not import the old ZIP over main; select Bolt's built-in Database, not a separate external Supabase connection; map the complete existing SQL/RPC/transaction/RLS-equivalent auth/storage/Edge contracts; preserve idempotency, audit, tenant isolation and pricing privacy; run Preview and the full acceptance suite on a single exact SHA. Do not mark done until Bolt returns evidence.
- Use `docs/bolt-source-reconciliation/BOLT_EXECUTION_PROMPT_AR_2026-11-05.md` as the single handoff instruction. Do not repeat completed archive, Core or P2 work.

---

# SESSION RESUME OVERRIDE — 2026-11-05 — CURRENT MAIN `45ca19c47a985b2d12d23c846ba068222a4e17ce`

Continue only from `Report-Engainall/Nasr1@main`; no branch or rebuild.

- Latest verified main SHA: `45ca19c47a985b2d12d23c846ba068222a4e17ce`.
- Application portability baseline: `b0a091e0a506da43a9b0d0dd0d1e9b992498ca63`.
- CI correction/test SHA: `45ca19c47a985b2d12d23c846ba068222a4e17ce`. Core PASS: 272/272 files, 1,786/1,786 tests; PostgreSQL 17, backup/restore, lint, build, Nitro/Vite preview, dev smoke and price visibility PASS. P1 TypeScript, static analysis, secret scan and branch cleanup PASS.
- P2 exact-head run `41940874520`: public UI 17/17 PASS; local Supabase authenticated E2E had passed through order/tenant, stock-count XLSX, purchase-order XLSX, checkout replay, returns/credit memo and Onyx XLSX; finance/task print was active in the last observation. Hosted customer/order/tenant test SKIPPED_EXTERNAL.
- Changed in `45ca19c`: Core and P2 preview launchers now use Vite preview for the actual Nitro output; auth test expects Bolt-native setup messaging; two new runtime-diagnostic privacy tests. No product screen, business engine or database migration was removed.
- The legacy Vercel status is FAILURE and is not a Bolt acceptance result.
- Bolt runtime remains NOT VERIFIED. ChatGPT has not connected to Bolt or changed any Bolt project resource. The immediate task remains `BOLT-RUNTIME-001`: import latest main, use Bolt's built-in Database (not an external Supabase connection), map existing database/auth/storage/server-function contracts without weakening RLS-equivalent tenant checks, atomic RPCs, audit, idempotency or pricing privacy, then run Bolt Preview and full acceptance on one exact SHA.
- Bolt single-message execution instructions: `docs/bolt-source-reconciliation/BOLT_EXECUTION_PROMPT_AR_2026-11-05.md`.
- Never repeat the archive audit or auth patch; do not redo passed Core/P2 steps. First inspect the P2 run's terminal state, record it, then proceed to Bolt integration.

---

## EXECUTION OVERRIDE — 2026-11-05 — SOURCE PORTABILITY BATCH COMPLETED; BOLT DATABASE PORT IS NEXT

- Latest application-source commit: `b0a091e0a506da43a9b0d0dd0d1e9b992498ca63` (the docs handoff commit may be newer; preserve this code SHA as the source change reference).
- Removed the Lovable Vite package/config, editor-preview auth bridge and editor telemetry; replaced with native Vite/TanStack Start/Nitro/React/Tailwind/path-alias configuration and vendor-neutral browser error diagnostics.
- Updated Bolt database bootstrap guidance and accepted the standard `SUPABASE_ANON_KEY` naming alternative without exposing server secrets.
- No Bolt database, auth, storage, server function or Preview test has been run yet. Existing Supabase/PostgreSQL contracts and migrations remain preserved for a faithful Bolt mapping.
- Use the one-shot prompt `docs/bolt-source-reconciliation/BOLT_EXECUTION_PROMPT_AR_2026-11-05.md` when importing the latest main into Bolt. Do not spend credits on another plan-only pass.
- NEXT_ACTION_ID: `BOLT-RUNTIME-BOLT-DB-PORT-001`.

---

# CHATGPT SESSION RESUME — AGHBARI COMMERCE — 2026-11-05

انسخ الرسالة كاملة عند بدء أي جلسة ChatGPT جديدة. هذه هي ذاكرة الاستئناف التنفيذية؛ لا تطلب من المستخدم إعادة شرح التاريخ.

## 1) دورك وطريقة العمل
أنت المسؤول التنفيذي عن مواصلة مشروع متجر الأغبري، لا محلل يكرر الخطط. ابدأ من المستودع والوثائق الحالية، واتخذ الخطوة العملية التالية مباشرة. المستخدم يرفض الدوران والتلخيص المتكرر والفحوصات التي لا تضيف إنجازًا جديدًا. في كل انطلاقة أنجز تغييرات حقيقية متعددة ومترابطة كلما أمكن، ولا تستهلك الجلسة في إعادة اكتشاف ما هو موثق.

## 2) المشروع ومصدر الحقيقة
- المنتج: متجر الأغبري | Aghbari Commerce.
- المستودع الوحيد: https://github.com/Report-Engainall/Nasr1
- الفرع الوحيد: `main`.
- قبل التعديل، احصل على HEAD الحالي مباشرة من GitHub؛ لا تعتمد SHA قديمًا في هذه الرسالة إذا تقدم المستودع.
- نقطة كود التطبيق التي فُحصت عند بدء مصالحة الأرشيف: `a15b4751920c0678fbe8edb7c9a6b545206cf8b2`. التزامات التوثيق اللاحقة لا تعني اختبار التطبيق على SHA أحدث.
- اقرأ أعلى `docs/bolt-source-reconciliation/CURRENT_EXECUTION_STATE.md` أولًا؛ تعليمات `EXECUTION OVERRIDE — 2026-11-05` هي أولوية الاستئناف الحالية، وتسبق مؤشرات NEXT_ACTION القديمة حتى إغلاق BOLT-RUNTIME-001.

## 3) قرار المالك النهائي — لا Lovable ولا حذف للمنجز
المستخدم لا يريد أي اعتماد تشغيلي أو برمجي على Lovable أو Lovable Cloud أو حسابه أو إعداداته أو Telemetry أو preview/session bridge الخاص به.
الهدف هو تشغيل نفس التطبيق الموجود في بيئة Bolt، مستفيدًا من قاعدة البيانات والمصادقة والتخزين ووظائف الخادم التي يتيحها Bolt في مساحة العمل. Bolt هو من يربط التطبيق بقاعدة البيانات المتاحة لديه وينفذ التشغيل وPreview والاختبارات داخل بيئته.

هذا ليس مشروعًا جديدًا ولا إعادة بناء ولا إعادة تصميم. احتفظ وطوّر كل ما سبق بناؤه:
- جميع واجهات العميل ولوحة الإدارة وجميع الشاشات والمسارات والمكونات والأنماط والهوية وRTL والترجمات.
- جميع الوظائف وسير العمل وقواعد الأعمال والطلبات والمنتجات والتسعير والمخزون والمشتريات والمحاسبة والتحصيل والمرتجعات.
- جميع محركات Onyx والاستيراد/التصدير والتقارير وCustomer 360 والذكاء الاصطناعي والمهام والقرارات والسيولة والتنبؤات والذكاء والتحليلات وPWA.
- جميع ملفات SQL/migrations وRPC وEdge Functions والاختبارات والمستندات والأصول.
- لا تحذف ميزة أو اختبارًا أو محركًا أو شاشة لمجرد تسهيل النقل. لا تختزل النطاق ولا تنشئ بدائل شكلية. غيّر محولات البيئة والاتصال فقط بقدر الحاجة، مع الحفاظ على السلوك والعقود والأمان.

## 4) الأرشيف المرسل من المستخدم — مساره واسمه الدقيق
- الاسم كما رفعه المستخدم: `project-bolt-github-8ccbjvhg (2).zip`.
- مساره المحلي في حاوية ChatGPT السابقة: `/mnt/data/project-bolt-github-8ccbjvhg (2).zip`.
- SHA-256: `db56924e7d629e480c96652ada8090f9605f466ccb773580446ce5b45cb09bc9`.
- الحجم نحو 6.5 MiB، ويحتوي 1,119 ملفًا، والجذر الداخلي `project/`، ولا يحتوي بيانات Git metadata.
- تنبيه: مسار `/mnt/data/...` خاص بحاوية ChatGPT السابقة وليس مسارًا يستطيع Bolt الوصول إليه. إذا احتاج Bolt إلى فحص الأرشيف في حسابه الجديد، يجب أن يرفعه المستخدم كمرفق إلى Bolt؛ لكن نتيجة المصالحة والأدلة المهمة محفوظة في GitHub ولا ينبغي إعادة الفحص دون سبب.
- SHA نقطة الأرشيف: `3f33dba1d1879fc1426a2428e331b496c6241dae`. مقارنة GitHub وقت الفحص مع `a15b4751920c0678fbe8edb7c9a6b545206cf8b2` أعطت 46 commits ahead و0 behind لصالح main؛ الأرشيف سلف تاريخي لـ main وليس إصدارًا أحدث.
- ميزة Excel لقائمة مراجعة المرتجعات وملفاتها الأربعة متطابقة في main، فلا تعِد دمجها. main يحتوي أعمالًا أحدث من الأرشيف، منها اختبارات E2E لشراء/جرد وWorkflow النسخ الاحتياطي والاستعادة.
- الأرشيف يحتوي `.env` بقيم حساسة؛ يمنع نسخها أو إظهارها أو رفعها إلى Git. لا تستبدل `bun.lock` بـ `package-lock.json` القديم، ولا ترفع `tsconfig.tsbuildinfo`، ولا تنسخ `supabase/config.toml` القديم فوق الحالي.
- تقرير المصالحة: `docs/bolt-source-reconciliation/BOLT_ARCHIVE_RECONCILIATION_2026-11-05.md`.

## 5) Patch المصادقة المرفوع منفصلًا
- الملف: `auth-session-refresh-race.patch`.
- SHA-256: `28ba873d4f31ca547851003434d623154ff4564f3c234eb0a22f70c0097926fd`.
- التغيير موجود بالفعل في `src/lib/auth.tsx` والاختبارات موجودة في `src/test/auth-session-cache-boundary.test.tsx`؛ يمنع إعادة تطبيقه.
- عند نقل المصادقة إلى Bolt، حافظ على ضمانات generation guard ومنع profile قديم من استبدال هوية أحدث بعد تبديل الحساب أو logout، والتعامل مع `INITIAL_SESSION`.

## 6) الوثائق التي جرى إكمالها داخل المستودع
- المواصفة الأصلية `docs/canonical/AGHBARI-MASTER-PROJECT-SPECIFICATION.md`: تمت إضافة §24 لنقل التشغيل إلى Bolt دون إعادة بناء المنتج.
- الملحق القائم `docs/bolt-source-reconciliation/UPDATED_SPEC_ADDENDUM.md`: تمت إضافة §7 لمصالحة أرشيف Bolt ومسار الملف وSHA وPatch القرار المعماري.
- المواصفة الاستراتيجية لمحركات التاجر `docs/canonical/AGHBARI_COMMERCE_UNIFIED_MERCHANT_INTELLIGENCE_AND_EXECUTION_MASTER_AR_2026-10-17.txt`: تمت إضافة §64، مع الاحتفاظ بالأقسام 1–63 كاملة.
- مصفوفة القبول الوحيدة `docs/bolt-source-reconciliation/REMAINING_SCREEN_ACCEPTANCE_MATRIX_2026-10-22.csv`: أضيف الصف `BOLT-RUNTIME-001`؛ لا تنشئ مصفوفة ثانية.
- أعلى `docs/bolt-source-reconciliation/CURRENT_EXECUTION_STATE.md`: يحتوي Override صريحًا لحفظ المنتج ونقل التشغيل إلى Bolt.
- `docs/bolt-source-reconciliation/EXECUTION_LOG.md`: يسجل نتائج المصالحة وتوضيح المالك.
- هذه الوثيقة: مرجع الاستئناف لك في ChatGPT.

## 7) محركات الذكاء والميزات المتقدمة — لا تنسَ شيئًا منها
كل ما في المواصفة الأصلية وأقسامها 1–24، والملحق 23 للذكاء المجاني وFree-Quota Router والخصوصية وCash/Liquidity Command Center وAction Cards وEvidence Passport وWhat-if Lab وAI Ops/Fallback وSystem Health/Error Center وRBAC Matrix، وكل ما في وثيقة التاجر الذكي §§1–64 يظل جزءًا من النطاق.
تشمل المحركات المحاسبة المزدوجة، الخزينة والسيولة، الذمم والائتمان، المشتريات والموردين، WMS والمخزون، تكلفة المنتج والربحية، التجارة B2B، CRM والاحتفاظ، Workflow والموافقات، BI، AI Gateway والذكاء المجاني، Decision/Action/Outcome، Task Intelligence، Growth Radar، Business Health/Working Capital/Dead Stock، Decision Memory/Learning Loop، Shift/Day Close، Bottleneck/Cycle Time، Policy/What-if، Data Reliability/Evidence Passport، Natural Language Assistant، System Health/Error Center، RBAC Capability Matrix، Integration/Reconciliation، PWA/Offline، Backup/Recovery.
لا تضف محركًا موازيًا؛ طوّر المحرك الموجود. لا تعد الميزة مكتملة لمجرد وجود عنوان أو شاشة.

## 8) BOLT-RUNTIME-001 — العمل الحالي المحدد
المطلوب ليس فحصًا مطولًا أو تجربة مهاجرات من ChatGPT؛ المطلوب تحضير المنتج والوثائق كي ينفذ Bolt الربط في بيئته.
على Bolt عند استيراد أحدث NASR1:
1. يحافظ على كل محتويات main ولا يستورد ZIP القديم فوقها.
2. يستبدل `@lovable.dev/vite-tanstack-config` في `vite.config.ts` بإعداد مدعوم في Bolt، مع المحافظة على TanStack routes/loaders/server behavior.
3. يستبدل Lovable error telemetry بآلية أخطاء محايدة/متاحة في Bolt ويحافظ على التشخيص الآمن.
4. يستبدل Lovable preview/session storage bridge في ملفات Supabase integration بآلية Bolt auth/session الرسمية.
5. يزيل رسائل `Connect Supabase in Lovable Cloud` ومتغيرات البيئة المرتبطة بإعداد Lovable، ويجعل الاتصال يستخدم موارد Bolt المتاحة فعليًا. لا يستخدم مفاتيح وهمية.
6. يربط قاعدة Bolt والمصادقة والتخزين ووظائف الخادم المتاحة بواجهات التطبيق الحالية.
7. يحافظ على عقود قاعدة البيانات وRPC والمعاملات وRLS-equivalent tenant isolation وRBAC وخصوصية الأسعار وaudit وidempotency وسلامة المحاسبة والمخزون.
8. لا يحول العمليات الحساسة إلى browser CRUD ولا يحذف migrations أو business logic.
9. يقوم Bolt نفسه بتشغيل Preview وربط DB وتنفيذ اختبارات البيئة والواجهات على SHA واحد. لا تطلب من ChatGPT تكرار نفس الفحوص خارج Bolt.
10. لا يدّعي نقل بيانات العملاء/الطلبات/الأرصدة/المستخدمين القديمة إلا إذا توفرت نسخة بيانات وتمت استعادتها ومطابقتها.
11. لا يفعّل تكلفة أو خطة مدفوعة أو auto-billing دون موافقة صريحة.
12. بعد ثبوت تشغيل التطبيق ببيئة Bolt، يواصل أول متطلب مفتوح فعلًا في checkpoint والمصفوفة، ولا يعود لبداية DLV/REF.

## 9) دور ChatGPT في كل جلسة لاحقة
- تحقق من live main SHA واقرأ هذا المرجع وCURRENT_EXECUTION_STATE؛ لا تطلب من المستخدم شرح التاريخ مرة أخرى.
- نفّذ كل ما تستطيع من توثيق أو مصالحة مصدرية أو تعديل ملفات المصدر عبر الأدوات المتاحة، مع تغييرات فعلية مفيدة في كل انطلاقة.
- لا تقضِ الجلسة في اختبارات بناء/Preview/قاعدة بيانات لا تملك بيئة Bolt لها؛ Bolt مسؤول عن ذلك. سجّل أن الاختبار ينتظر Bolt ولا تدّع PASS.
- لا تكرر مراجعة الأرشيف أو Patch المصادقة أو ملفات Excel المتطابقة.
- لا تنفذ نقل قاعدة البيانات من خارج مساحة Bolt ولا تخترع مورد اتصال. جهّز المطابقة والعقود والتوجيه، واترك الربط الفعلي وبيانات البيئة لـ Bolt.
- لا تحذف عملًا سابقًا. إذا ظهر تعارض، حافظ على النسختين حتى توثيق القرار، ولا تعمل overwrite.
- أي تعديل يجب تسجيله في checkpoint والمصفوفة الوحيدة وسجل التنفيذ ببصمات SHA وأسماء الملفات.

## 10) رسالة الإغلاق عند أي انقطاع
اكتب داخل checkpoint: live main SHA، آخر code SHA، الملفات المتغيرة، ما اكتمل بدليل، ما ينتظر Bolt، العوائق الحقيقية، وNEXT_ACTION_ID واحد محدد. لا تكتب PASS أو Complete بلا دليل.

## الحالة عند إعداد هذا المرجع
- تمت إضافة المواصفات والملحقات والصف المركزي BOLT-RUNTIME-001 إلى NASR1.
- تمت مصالحة الأرشيف وإثبات أن أهم إضافة Bolt المحددة موجودة بالفعل في main.
- تم التحقق من أن auth-session-refresh-race.patch موجود بالفعل في main.
- لم يتم تغيير source code للتطبيق في دفعة التوثيق هذه، ولم ينفذ ChatGPT اختبار Bolt أو Preview أو DB. التنفيذ البيئي الفعلي على Bolt ما زال مطلوبًا.
- NEXT_ACTION_ID: `BOLT-RUNTIME-001`.