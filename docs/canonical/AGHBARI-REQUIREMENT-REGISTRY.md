# Aghbari Commerce — canonical requirement registry and traceability index

**Repository:** `Report-Engainall/Nasr1` / `main`  
**Master source:** `AGHBARI-MASTER-PROJECT-SPECIFICATION.md`  
**Current status/evidence source:** `../bolt-source-reconciliation/REMAINING_SCREEN_ACCEPTANCE_MATRIX_2026-10-22.csv`  
**Current resume cursor:** `../bolt-source-reconciliation/CURRENT_EXECUTION_STATE.md`  
**API contracts:** `../bolt-source-reconciliation/API_OPS_CONTRACT_REGISTER_2026-10-24.md`

This registry defines stable identifiers and crosswalks. It is **not** a second acceptance matrix and contains no mutable PASS/FAIL statuses. Current status, named tests, exact SHA and evidence belong only in the existing acceptance CSV. Requirement definitions were selectively recovered from the read-only archive; old SHA/status/CI claims are not current evidence.

## DLV roll-up requirements

| Stable ID | Required scope |
|---|---|
| DLV-001 | Requirement → screen/component → service/RPC/Edge → authorization → named test/evidence traceability; measurable mapping with no orphan, duplicate or contradictory IDs. |
| DLV-002 | Storefront/admin identity, Arabic RTL/localization, navigation, route mounting, loading/error/empty/retry/unauthorized states, responsive and accessible interaction. |
| DLV-003 | Product/catalog lifecycle, required data, discovery, categories, details, media, server validation and public-safe projections. |
| DLV-004 | Cart, quantity policy, checkout validation, order submission, amendment/version history, cancellation, idempotency and retry recovery. |
| DLV-005 | Server-selected pricing tier, hidden-price semantics and cost/margin/other-tier isolation across API, UI, cache/PWA, PDF, XLSX and print. |
| DLV-006 | Authentication, invitations, approval, profiles, roles, tenant membership, customer lifecycle, sessions and secure first-admin provisioning. |
| DLV-007 | Inventory/warehouse, ATP, movements, reservations, transfers, stock count, replenishment, purchasing, batches/expiry and supplier receipt traceability. |
| DLV-008 | Orders, invoices, returns, credit notes, customer/supplier payments, settlement, journals, posting/reversal and audit. |
| DLV-009 | Onyx Pro profile, import/export, reconciliation, matching, idempotent replay, source lineage and external target acceptance. |
| DLV-010 | Customer 360, service cases, retention, supplier/customer evidence, cashflow, liquidity and decision/report analytics. |
| DLV-011 | Role-specific PDF/XLSX/print allowlists, exact totals, source references and safe download/print behavior. |
| DLV-012 | Intelligent/rule engines, evidence-backed recommendations, forecasts and deterministic fallback; zero paid AI spend. |
| DLV-013 | Official WhatsApp Business API, consent/templates/provider receipts, idempotent delivery and truthful status. |
| DLV-014 | PWA/read-only cache, freshness, logout/user/device switching, revocation, network recovery and no offline business mutation. |
| DLV-015 | RPC/Edge/worker inventory and semantic contracts: auth/role, tenant scope, bounds, idempotency, concurrency, audit and denied-no-side-effect. |
| DLV-016 | Logs, health probes, monitoring, backup/restore, recovery, deployment configuration, rollback and runbooks. |
| DLV-017 | RTL responsiveness, accessibility, keyboard/screen-reader states, compatibility and measured performance. |
| DLV-018 | Installation/configuration, canonical environment, external integration setup, release/rollback and operator handover. |

## Stable umbrella requirement crosswalk

| Stable requirement ID | Scope | Primary matrix mapping |
|---|---|---|
| AGH-CI-001 | Exact-SHA build/test gate | GATE-001; DLV-001 |
| AGH-EXT-SUPABASE-001 | Canonical Supabase identity/migrations | DLV-006; DLV-015; DLV-018 |
| AGH-SEC-TENANT-001 | Tenant isolation/server-derived scope | AUTHZ-*; DLV-002; DLV-006; DLV-015 |
| AGH-ORDERS-001 | Atomic order/checkout/lifecycle | ORD-001; DLV-004; DLV-008 |
| AGH-PRICE-PRIVACY-001 | Three-tier pricing and privacy | STF-010; STF-011; DLV-005; DLV-011 |
| AGH-CUSTOMER-360-001 | Customer 360, company membership and service | COMPANY-001; DLV-006; DLV-010 |
| AGH-FINANCE-DOCS-001 | Invoices/statements/financial documents | FIN-*/PRINT-*; DLV-008; DLV-011 |
| AGH-SEC-BROWSER-E2E-001 | Current deployed routes and authenticated browser | ROUTES-001; GATE-001; DLV-002; DLV-018 |
| AGH-ONYX-INTEGRATION-001 | Onyx snapshots/reconciliation/import | INV-009; DLV-009 |
| AGH-ONYX-XLSX-001 | Onyx 27-column XLSX profile/target compatibility | ONYX-XLSX-001; DLV-009; DLV-011 |
| AGH-ASYNC-OUTBOX-001 | Transactional outbox, worker lease/retry/dead-letter | API-OPS-001; DLV-015; DLV-016 |
| AGH-AI-GATEWAY-001 | AI gateway, quotas, privacy and deterministic fallback | AI-001; REF-FREE-AI-ROUTER-001; DLV-012 |
| AGH-WHATSAPP-001 | Official WhatsApp delivery | DLV-013 |
| AGH-OFFLINE-PWA-001 | Read-only offline catalog/cart/freshness | DLV-014 |
| AGH-OPS-DR-001 | Monitoring/DR/backup/restore/performance | DLV-016 |
| AGH-OPS-RESUME-001 | Durable repository session resume | GATE-001; CURRENT_EXECUTION_STATE.md |

## Procurement and settlement contracts

| Stable requirement ID | Requirement contract | Primary matrix leaf |
|---|---|---|
| AGH-INT-REPLENISHMENT-PO-DRAFT-001 | Evidence-backed recommendation creates a same-tenant PO draft only; no auto-submit/stock/journal/payment side effect. | DLV-007-INVENTORY-REPLENISHMENT-PURCHASE-DRAFT-001 |
| AGH-PROC-SUPPLIER-QUOTE-COMPARISON-001 | Same-tenant offers, explicit terms/currency, audit and one-offer award to a canonical PO draft; no automatic supplier message or posting. | DLV-007-SUPPLIER-QUOTE-COMPARISON-001 |
| AGH-PROC-SUPPLIER-RETURN-001 | Return against a physical receipt; atomically recheck returnable quantity/stock; immutable audit; no inferred FX/journal/credit memo. | DLV-007-SUPPLIER-RETURN-001 |
| AGH-PROC-SUPPLIER-INVOICE-THREE-WAY-MATCH-001 | Match supplier invoice to PO and physical receipt; exact totals and over-invoice/concurrency guards; independent variance review; no second payable journal. | DLV-007-SUPPLIER-INVOICE-THREE-WAY-MATCH-001 |
| AGH-PROC-SUPPLIER-PAYMENT-SETTLEMENT-001 | Evidence-backed same-currency payment allocation, finance segregation, exact-cent/idempotency guards and source-linked balanced journal draft. | DLV-008-SUPPLIER-PAYMENT-SETTLEMENT-001 |

## Intelligence/reference requirements

| Stable ID | Required capability |
|---|---|
| REF-GROWTH-OPPORTUNITY-RADAR-001 | Deterministic opportunities from tenant-safe quotes, unavailable demand, customer activity and product performance with complete evidence/period/sample rules. |
| REF-BUSINESS-HEALTH-MAP-001 | Compose liquidity, cashflow, dead stock, replenishment and customer concentration without double counting or unverified totals. |
| REF-DECISION-MEMORY-BOOK-001 | Versioned decision context/facts/assumptions/options/actions/review/outcome and append-only corrections. |
| REF-LIQUIDITY-001 | Evidence-backed executive liquidity by currency; unknown opening cash and future outflows remain unavailable. |
| REF-DAILY-DECISIONS-001 | Prioritized actions with verified rationale, impact, next action and evidence/as-of. |
| REF-DECISION-OUTCOME-001 | Proposal/review/approval/rejection/execution/outcome lifecycle with immutable actor/reason/evidence. |
| REF-CASHFLOW-FORECAST-001 | 7/30/90-day receivable/payable schedule; no inferred due dates, FX or missing-to-zero. |
| REF-DEAD-STOCK-001 | Stagnant inventory and tied-up cost from audited movements and valid cost evidence. |
| REF-CUSTOMER-RETENTION-001 | Concentration, repeat purchases, recency and inactivity from complete tenant-safe cohorts. |
| REF-REPLENISHMENT-001 | ATP/open-PO/reservation-aware quantities with exact UOM and evidence; draft only. |
| REF-EVIDENCE-PASSPORT-001 | KPI/decision links source, as-of, period, unit/currency, formula and completeness. |
| REF-WHATIF-LAB-001 | Constrained deterministic what-if from explicit assumptions and verified baseline. |
| REF-FREE-AI-ROUTER-001 | Authorized official free quota only, bounded retries/cooldowns/budgets; no paid fallback. |
| REF-AI-PRIVACY-001 | Server-side classification/redaction and default egress denial for PII/customer/finance/private pricing. |
| REF-AI-FALLBACK-001 | Deterministic local fallback, explicitly labelled when free quota is exhausted. |
| REF-AI-OPS-001 | Provider/quota status and observed evidence; no fabricated connection/usage. |
| REF-SYSTEM-HEALTH-001 | Real health/error probes with check time, latency, safe error ID and owner. |
| REF-RBAC-MATRIX-001 | Explainable role × resource × operation × tenant/sensitivity matrix; server remains authoritative. |
| REF-LEARNING-LOOP-001 | Expected/measured outcomes with reason/owner/period/source; no unverified learning. |
| REF-ROLE-TASK-ATTENTION-001 | Role-aware task attention/workload suggestions from authorized task evidence. |
| REF-SUPPLIER-PERFORMANCE-INTELLIGENCE-001 | Supplier lead-time/adherence from submitted PO and final physical receipts; no invented quality/finance rating. |
| REF-DATA-RELIABILITY-EVIDENCE-PASSPORT-001 | DQS preview parity and explicit evidence lineage; unknown/excluded rows never treated as valid/zero. |
| REF-NL-ADMIN-ASSISTANT-057 | Deterministic allowlisted Arabic admin reads over authorized supplier/PO RPCs; no free-form SQL or mutations. |

## Coverage integrity

- Every mandatory specification requirement maps to one or more matrix leaf IDs. A missing mapping is OPEN.
- Every matrix leaf names a requirement/workstream and concrete test or external acceptance; source presence alone is not PASS.
- Each task ID is unique and each CSV record parses to exactly eight header columns.
- DLV roll-ups close only when all mandatory child leaves and their evidence pass on one nominated SHA/environment.
- CSV parse errors, malformed quotes/columns, duplicate IDs or contradictory statuses block numeric coverage. Do not publish a completion percentage until these are resolved.
- Archive SHA/status values are provenance only; revalidate against current main, live Supabase and exact-SHA tests.
