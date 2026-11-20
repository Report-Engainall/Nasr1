# P3 Checkpoint — Aghbari Initial Catalog, Market Pricing and Opening Stock

**Date:** 2026-11-14 (Asia/Aden)  
**Repository:** `Report-Engainall/Nasr1`  
**Main HEAD before this documentation update:** `ba36f18d2ce80fc969ee43f6f8c7a6cda60da05c`  
**Latest code-bearing SHA already accepted by P1/P2:** `0f883a80c1d5e566133938c11e1beabcb2e76828`  
**Supabase project:** `aghbari-commerce-nasr1` (`tfdwtuwkdddnzgyhcoyy`, PostgreSQL 17.11, ACTIVE_HEALTHY)  
**Organization:** `a0000000-0000-0000-0000-000000000001` (متجر الأغبري)  
**Owner-authorized setup audit batch:** `98dbfb5e-cc46-457e-b532-7efde84a914a`

## Implemented in the active Aghbari database

The owner explicitly authorized ChatGPT to populate the initial commerce catalog, market-based selling tiers, and editable opening inventory so the owner can correct quantities later. A single transactional data setup created:

- 114 active products: six catalog entries in each of the 19 existing active categories.
- 342 active price rows: one each for `vip`, `wholesale`, and `retail` per product.
- 114 warehouse balances and 114 corresponding `inventory_movements` entries with movement type `opening_balance`.
- One main branch and one main warehouse; the public storefront publication configuration now points to that warehouse and is enabled.
- Total opening quantity: **3,235 sales units** across the product selling units (cases, sacks, and other pack units).

Branch ID: `c50e6cd6-5b46-4968-8685-e9f110ab5f29`  
Warehouse ID: `9643f4a2-8fbc-418a-9ab5-4be197a1cb20`

All setup actions are recorded in `public.audit_logs`. The setup was executed by the privileged database management connection; the actor columns remain NULL. No existing administrator identity was impersonated.

## Price evidence and calculation boundary

Market references recorded with the batch:

- Yemen Ministry of Economy local price list, published **2026-09-17**: https://www.moit.gov.ye/complaints/prices
- Sanaa wholesale market channel: https://t.me/s/opensoooq/9283 and https://t.me/s/opensoooq?before=12177 (the indexed posts do not expose an authoritative publication date).
- WFP/HDX Yemen market-price reference, latest month reported **2026-10**: https://nocton.armsma.org/en/country/YEM (national medians used only as a cross-check, not directly substituted for Sanaa quotations).

For directly quoted pack formats, the base benchmark uses the quoted Sanaa or Ministry pack reference. For unquoted pack formats, the base is a package-size conversion from the closest reference and is therefore an estimate, not a direct supplier quote. The initial commercial tiers use the documented calculation: VIP = 97% of base, wholesale = 105% of base, and retail = 115% of base, rounded to the nearest 10 YER.

No supplier invoice, landed cost, or acquisition cost was fabricated; `products.cost_price` remains at its database default. These are market-reference selling prices and must be reconciled against actual supplier quotations/invoices before margin reporting is treated as accounting truth.

## Inventory truth boundary

The opening quantities were inserted only because the owner explicitly authorized an editable first setup and said they would adjust the inventory later. Each movement and the batch audit explicitly state:

**OWNER_AUTHORIZED_OPENING_ESTIMATE_PENDING_PHYSICAL_COUNT**

These are not claimed as a witnessed physical count, stocktake, purchase receipt, or supplier delivery. The opening balances are editable through the existing inventory workflows and must be reconciled by a physical stock count before production inventory accuracy is asserted.

No sales invoice, purchase invoice, customer, supplier, order, receipt, payment, or accounting journal was created.

## Exact database/API verification

Post-write reads on the same active Supabase project confirmed:

| Check | Result |
|---|---:|
| Active categories | 19 |
| Active products | 114 |
| Active price rows | 342 |
| VIP / wholesale / retail rows | 114 / 114 / 114 |
| Active warehouses | 1 |
| Opening inventory balances | 114 |
| Opening movement records | 114 |
| Opening sales units | 3,235 |
| Products with retail price | 114 |
| Products with warehouse balance | 114 |
| Storefront publication | Enabled; main warehouse linked |
| Product primary images / gallery images | **0 / 0** |

Public storefront RPC verification (read-only):
- `get_public_storefront_categories()` returned all 19 categories.
- `get_storefront_catalog_page(NULL,NULL,1,100,false)` returned page 1 with 100 products and positive display prices/available quantities.
- `get_storefront_catalog_page(NULL,NULL,2,100,false)` returned page 2 with 14 products, each priced and available.
- Total public RPC catalog count: **114**.

This is database/RPC evidence, not an authenticated visual browser screenshot. Do not label this as `BROWSER_PROVEN`.

## Explicit blockers before saying “record the first invoice now”

1. **Product photos:** 0/114 image URLs and 0 gallery rows are linked. The existing image lifecycle requires same-tenant WebP objects in the `product-images` Storage bucket and the authenticated `product-image-upload` Edge Function / staff image RPCs. No browser profile was signed in to the Aghbari application in this execution context. External hotlinks or forged URLs were intentionally not inserted. Complete photo upload through the existing authorized uploader; do not weaken the same-tenant storage guard.
2. **Real trading counterparty:** `customers` = 0 and `suppliers` = 0. A customer invoice requires a real customer and order. A supplier invoice requires a real supplier plus purchase order and receipt. Do not invent a walk-in customer, supplier, receipt, or invoice to bypass those source requirements.
3. **Physical inventory:** the current 3,235-unit opening balance is owner-authorized and editable, but physical stocktake remains pending.
4. **Browser acceptance:** no authenticated admin/customer browser session or screenshot was available. RPC success alone is not a browser test.

## Security and deployment boundary

- No migration was applied; the live database remains on its recorded migration history.
- No RLS/role policy was changed.
- No Edge Function was deployed or replaced.
- No production app deployment, Vercel action, paid service, live provider, payment, or billing setup was performed.
- Post-write Supabase advisors still report existing project-wide findings (including public/authenticated SECURITY DEFINER warnings, multiple permissive policies, unindexed foreign keys, and leaked-password protection disabled). These were not remediated by this catalog task and must not be described as a clean security review.

## Next actions

1. Complete all 114 image links using the existing authenticated same-tenant WebP image uploader.
2. Register the actual first customer or supplier and follow the corresponding order/receipt workflow.
3. Capture authenticated desktop/mobile storefront and admin invoice evidence.
4. Run a physical stock count and reconcile the opening quantities; then revalidate price and inventory before issuing the first financial document.

**Current status:** Catalog and market-referenced price tiers are implemented; owner-authorized provisional stock and movements are implemented; public catalog RPC returns all 114 cards with price and availability. Photos, real counterparty, physical count, and authenticated invoice/browser acceptance remain open. **Do not claim invoice readiness yet.**
