# P4 — ERP read-only Edge Sync configuration

**Implementation branch:** \`p4/erp-read-only-incremental-core-20261127\`  
**Endpoint:** \`POST /functions/v1/erp-read-sync\`  
**Runtime:** Supabase Edge Functions / PostgreSQL 17  
**Default state:** disabled until the provider-specific license, documented endpoint, sandbox, tenant binding, scopes and server secrets are explicitly configured.

## Security boundary

- Supabase JWT verification is enabled for this function. The handler independently verifies the bearer token with Supabase Auth.
- The tenant is resolved from the active \`profiles\` row belonging to the verified Auth user. A request-supplied \`organization_id\` or any unknown property is rejected.
- Only \`admin\` and \`manager\` membership roles may trigger a sync. The organization is bound to the provider configuration using the server-only \`*_ORGANIZATION_ID\` setting.
- Company, branch, warehouse and currency selections must match the provider's server-owned \`*_ALLOWED_SCOPES_JSON\` allowlist.
- Provider URL, allowed hosts, access token and read contract are loaded from Edge Function secrets/environment only. The browser never receives credentials or a provider cursor.
- Cursor checkpoints are AES-256-GCM encrypted before database persistence. The encryption key is a separate server-only 32-byte hex secret.
- Checkpoint writes, canonical staging records, page receipts and watermark advancement occur in one PostgreSQL transaction. Page replay is checked before optimistic-version validation.
- The connector is read-only. It stages approved catalog/customer/warehouse/quantity/unit/price projections only; it does not post inventory, invoices, receipts or ledger entries.
- External API access remains disabled unless the exact provider license, endpoint and sandbox flags are all explicitly true. A missing flag is not treated as proof of availability.

## Edge Function settings

Set these values in the Supabase Edge Function environment for the target project. Do not commit secrets to Git.

Shared:
- \`SUPABASE_URL\`
- \`SUPABASE_ANON_KEY\` or \`SUPABASE_PUBLISHABLE_KEY\`
- \`SUPABASE_SERVICE_ROLE_KEY\`
- \`ERP_CURSOR_ENCRYPTION_KEY\` — 64 hex characters (32 random bytes)
- \`ERP_SYNC_ALLOWED_ORIGINS\` — comma-separated exact HTTPS origins allowed to call the function from a browser

For each provider use the matching prefix: \`ONYX_PRO\` or \`AL_MUTAKAMEL\`.

Required provider settings:
- \`<PREFIX>_ORGANIZATION_ID\` — exact organization UUID this provider credential belongs to.
- \`<PREFIX>_API_BASE_URL\` — vendor-confirmed HTTPS API root.
- \`<PREFIX>_API_ALLOWED_HOSTS\` — comma-separated exact allowed API hostnames; no wildcards.
- \`<PREFIX>_API_TOKEN\` — provider credential held only by the Edge Function.
- \`<PREFIX>_API_TOKEN_HEADER\` — optional; defaults to \`Authorization\`.
- \`<PREFIX>_API_TOKEN_PREFIX\` — optional; defaults to \`Bearer \`.
- \`<PREFIX>_READ_CONTRACTS_JSON\` — object keyed by supported object type. Each value must include the exact provider, object type, vendor-confirmed API version, official documentation URL, relative path, item/id/timestamp paths and allowlisted canonical field paths required by \`ErpReadContract\`.
- \`<PREFIX>_ALLOWED_SCOPES_JSON\` — server-owned list of company/branch/warehouse/currency scopes.
- \`<PREFIX>_LICENSE_CONFIRMED=true\` — only after the installed edition and license are verified.
- \`<PREFIX>_ENDPOINT_CONFIRMED=true\` — only after the exact vendor endpoint/API contract is verified.
- \`<PREFIX>_SANDBOX_AVAILABLE=true\` — only when an authorized sandbox/test company is actually accessible.

Example scope configuration (replace every example identifier with verified values):
\`\`\`json
[
  {
    "company_external_id": "COMPANY-01",
    "branch_external_ids": ["BRANCH-01"],
    "warehouse_external_ids": ["WAREHOUSE-01"],
    "currency_codes": ["YER", "USD"]
  }
]
\`\`\`

Example read contract shape (not a vendor API specification; do not enable it until every path and version is confirmed against the installed ERP):
\`\`\`json
{
  "products": {
    "provider": "onyx_pro",
    "apiVersion": "VENDOR-CONFIRMED-VERSION",
    "officialDocumentationUrl": "https://vendor.example.invalid/official-api-reference",
    "objectType": "products",
    "path": "items",
    "itemsPath": ["data", "items"],
    "nextCursorPath": ["meta", "next_cursor"],
    "cursorParameter": "cursor",
    "modifiedSinceParameter": "modified_since",
    "pageSizeParameter": "limit",
    "pageSize": 100,
    "externalIdPath": ["id"],
    "sourceUpdatedAtPath": ["updated_at"],
    "fieldPaths": {
      "item_code": ["code"],
      "name": ["name"],
      "barcode": ["barcode"],
      "is_active": ["active"]
    },
    "requestIdHeader": "x-request-id"
  }
}
\`\`\`

The example URL and field paths are placeholders, not proof that Onyx Pro or Al-Mutakamel exposes these endpoints.

## Request contract

The authenticated manager/admin sends only the selection and bounded execution limits:

\`\`\`json
{
  "provider": "onyx_pro",
  "object_type": "products",
  "company_external_id": "COMPANY-01",
  "branch_external_id": "BRANCH-01",
  "warehouse_external_id": null,
  "currency_code": "YER",
  "max_pages": 2,
  "max_records": 500
}
\`\`\`

Limits are capped at 5 pages and 1,000 records per invocation. The response contains status, page/record counts, safe change counters and checkpoint watermarks. Plain cursors, ciphertext, credentials, raw provider payloads and financial balances are never returned.

## Local acceptance

The P2 Critical Paths workflow runs \`scripts/test-erp-sync-checkpoint-store.mjs\` after starting the isolated local Supabase/PostgreSQL 17 stack. The P1 strict TypeScript configuration includes the Edge handler, adapter and tests.

The migration and function are not deployed to a hosted project by this work. CI must report a completed PostgreSQL 17 result against the exact PR head before the acceptance status can be changed to PASS.

## Operational hand-off to P1

The existing Integration/Onyx workspace can invoke \`erp-read-sync\` with the request contract above. It should display \`complete\` versus \`continuation_required\`, counts, timestamps and a safe configuration error code. It must never display a cursor or imply a live connection while provider settings are absent.
