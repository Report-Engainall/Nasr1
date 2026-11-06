# P3 — Customer Service Intelligence Read Contract

**Repository:** `Report-Engainall/Nasr1`  
**Branch:** `main`  
**Status:** `IMPLEMENTED_ON_MAIN / ACCEPTANCE_PENDING`

## Delivered product capability

The Arabic natural-language assistant now recognizes current customer-service questions and reads a dedicated aggregate-only RPC:

- Customer service current open-case overview.
- Cases past first-response SLA.
- Cases past resolution SLA.
- Active cases without an assigned operational task owner.

The query is a current snapshot. Historical periods, date ranges and period comparisons are explicitly unsupported; the assistant must not disguise a current queue as historical evidence.

The summary uses one database-generated `as_of` timestamp for all SLA comparisons. Response-overdue and resolution-overdue counts are separate and may overlap; never add them together as if they were distinct cases.

## Source contract

Migration: `supabase/migrations/20261106100000_customer_service_intelligence_summary.sql`  
RPC: `public.get_customer_service_work_queue_summary()`  
DTO/client: `src/lib/intelligence/customer-service-intelligence-client.ts`  
Planner/resolver: `src/lib/intelligence/natural-language-assistant.ts`  
Execution client: `src/lib/intelligence/natural-language-assistant-client.ts`  
Arabic UI: `src/components/intelligence/NaturalLanguageAssistant.tsx`

The RPC returns exactly four top-level keys:

- `as_of`
- `scope` = `ALL_ACTIVE_CASES_IN_CURRENT_ORGANIZATION`
- `complete_population` = true
- `summary`, containing exactly `open_count`, `response_overdue_count`, `resolution_overdue_count`, `unassigned_count`, `urgent_count` and `high_count`

It does not return customer IDs, customer names, case IDs/codes, subjects, descriptions, messages, employee names, employee IDs, prices, balances or other financial details. The client parser rejects additional root or summary keys, incomplete population, non-integer/negative/unsafe counts, invalid timestamps and any count exceeding the active-case population.

Server authorization requires an authenticated active staff profile whose organization matches `current_organization_id()`; the RPC is SECURITY DEFINER with an empty search path and EXECUTE revoked from PUBLIC/anon. No client-side organization ID or authorization assertion is accepted.

## Non-production migration order

Apply only in the approved isolated/non-production Bolt workflow, in this order:

1. `20261105190000_customer_service_cases.sql`
2. `20261105200000_customer_service_case_sla.sql`
3. `20261105210000_customer_service_desk.sql`
4. `20261106100000_customer_service_intelligence_summary.sql`

Do not apply to production without separate authorization.

## Required acceptance evidence

1. Authenticated active same-tenant staff can read the aggregate; anonymous, customer-only, inactive and cross-tenant identities receive SQLSTATE `42501`.
2. Denied calls create no case, task, notification, event or audit mutation. This is a read-only aggregate.
3. Inspect raw RPC JSON: only the four allowed top-level keys and six summary keys are present. No detail rows, customer identifiers, names, subject or descriptions are present.
4. At one controlled database timestamp, reconcile `open_count`, response-overdue, resolution-overdue, unassigned, urgent and high counts against the existing `get_customer_service_work_queue` summary for the same organization. Confirm that response-overdue and resolution-overdue may overlap.
5. Verify the single returned `as_of` is used consistently for both SLA comparisons and the UI labels query time separately.
6. Verify the natural-language planner selects the correct intent for open cases, response overdue, resolution overdue and unassigned; a historical date/range is UNSUPPORTED, not silently translated to current.
7. Verify source-missing migration and permission denial appear as unavailable/denied states, never as fabricated zero counts.

## Evidence boundary

The migration and source changes are committed on `main`; they are not evidence of migration application or runtime acceptance. Unit tests were added but not executed in this continuation. Do not claim a Bolt/PG17/CI/browser/production PASS until it is run on the exact accepted SHA and its artifacts are recorded.
