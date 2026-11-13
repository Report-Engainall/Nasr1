# P1 — Supplier financial workspaces mounted from the supplier directory

- Repository: `Report-Engainall/Nasr1`
- Base SHA: `b88f463b901993938111703ec861047f7ed10149`
- Branch: `feat/supplier-finance-hub-ordered-qty-20261113`
- Scope: mount existing supplier finance components in the existing supplier page and expose the source quantity that was already available from purchase-order records.

## Existing implementations preserved and reused

- `SupplierPaymentWorkspace` already implements payment reservation, separate evidence reconciliation, journal-draft handoff, reasoned voiding, re-read after commands and voucher print. The existing backend service remains the only command path.
- `SupplierInvoiceWorkspace` already implements invoice capture, receipt-item mapping, separate variance review, evidence upload/read, due-date evidence, accounting status/handoff and print/XLSX.
- `SupplierAccountActivityWorkspace` already reads posted supplier-account entries, currency totals and incomplete-balance states with XLSX/print.
- The same existing workspaces are already mounted in procurement and General Ledger surfaces. This change adds a supplier-directory entry point; it does not build duplicate copies.
- Chart-of-accounts options are read from the same tenant-scoped `fetch_general_ledger` RPC used by General Ledger. No alternate account source or client-supplied tenant scope is introduced.

## Delivered in this change

- Added `SupplierFinancialWorkspaceHub`, loaded lazily from the existing Suppliers admin page. It provides payment, invoice capture, variance review and account-activity tabs using the existing workspaces.
- The hub exposes finance tabs only to `admin`, `manager` and `accountant` roles; non-finance supplier-page users receive no financial data request or controls.
- Added strict parsing for account options. Failed or malformed account responses are surfaced as unavailable; no synthetic accounts or balances are created.
- Added `buildSupplierInvoiceOrderedQuantityIndex`, keyed exclusively by the immutable purchase-order item ID.
- Extended the existing invoice capture and review tables to show ordered quantity alongside received, previously invoiced and remaining quantities, and the already displayed ordered/received/invoiced unit prices. If the purchase-order source cannot be read, the quantity is shown as unavailable rather than zero.
- No changes to supplier payment/invoice services, SQL, migrations, RPC definitions, RLS, tenant/auth policy, or production data.

## Ownership and verification boundary

- No edits to Path B / Issue #422 observability, prompt persistence, AI governance or developer tools.
- No edits to `AghbariApp.tsx`, route generation, admin access matrix, the open pricing PR #421 files, or the other P2-owned workflow.
- Focused regression tests cover exact PO-item quantity mapping, malformed/inconsistent data rejection, finance role isolation and hub tab wiring.
- Exact-head P1 CI is required before marking this source change accepted. Hosted database, real supplier payments, and external bank evidence are not asserted by UI tests.
- No Vercel, deployment, paid service, migration or production-data write was used.
