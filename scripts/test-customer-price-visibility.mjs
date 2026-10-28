import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import postgres from "postgres";

const connectionString = process.env.TEST_DATABASE_URL;
if (!connectionString) throw new Error("TEST_DATABASE_URL is required for customer price-visibility acceptance.");

const db = postgres(connectionString, { max: 1, prepare: false, idle_timeout: 5 });
const ORG_ID = "a0000000-0000-0000-0000-000000000001";
const CUSTOMER_PROFILE_ID = "f1111111-1111-4111-8111-111111111111";
const CUSTOMER_AUTH_ID = "11111111-1111-4111-8111-111111111111";
const MEMBER_PROFILE_ID = "f1111111-1111-4111-8111-111111111112";
const ADMIN_PROFILE_ID = "f0000000-0000-0000-0000-000000000001";
const ADMIN_AUTH_ID = "33333333-3333-4333-8333-333333333333";
const ACCOUNTANT_PRODUCT_ID = "e5555555-e555-4555-8555-e55555555555";
const CATALOG_PRODUCT_ID = "a1000000-0000-0000-0000-000000000001";

async function assumeUser(authUserId, email) {
  await db.unsafe("reset role").catch(() => {});
  await db.unsafe(
    "insert into auth.sessions(id,user_id,created_at,updated_at,refreshed_at,not_after,user_agent,ip) values($1,$1,now(),now(),now(),null,'CI customer price session','127.0.0.1'::inet) on conflict(id) do update set user_id=excluded.user_id,updated_at=now(),refreshed_at=now(),not_after=null",
    [authUserId],
  );
  await db.unsafe("select set_config('request.jwt.claim.sub', $1, true)", [authUserId]);
  await db.unsafe("select set_config('request.jwt.claims', $1, true)", [
    JSON.stringify({ sub: authUserId, email, email_confirmed_at: new Date().toISOString(), role: "authenticated", session_id: authUserId }),
  ]);
  await db.unsafe("set local role authenticated");
}

async function assertDatabaseRejects(query, params, expected, message) {
  await db.unsafe("savepoint expected_database_rejection");
  try {
    await assert.rejects(db.unsafe(query, params), expected, message);
  } finally {
    // PostgreSQL aborts the current transaction after a failing statement. Restore the
    // enclosing acceptance transaction so the next independent denial can be asserted.
    await db.unsafe("rollback to savepoint expected_database_rejection");
    await db.unsafe("release savepoint expected_database_rejection");
  }
}

async function setVisibility(values) {
  const keys = [
    ["show_price_on_cards", values.cards],
    ["show_price_in_cart", values.cart],
    ["show_price_in_orders", values.orders],
    ["show_price_in_invoice", values.invoice],
    ["show_customer_tier_in_customer_views", values.tier],
  ];
  for (const [key, visible] of keys) {
    const value = db.json(visible);
    await db.unsafe(
      "insert into public.admin_settings(organization_id,key,value,category,updated_at) values($1,$2,$3::jsonb,'storefront',statement_timestamp()) on conflict(organization_id,key) do update set value=excluded.value,updated_at=statement_timestamp()",
      [ORG_ID, key, value],
    );
  }
}

async function main() {
  await db.unsafe("begin");
  try {
    const admin = await db.unsafe(
      "select p.auth_user_id from public.profiles p where p.id=$1 and p.organization_id=$2 and p.is_active and p.auth_user_id=$3 and exists (select 1 from public.user_roles r where r.profile_id=p.id and r.role in ('admin','manager'))",
      [ADMIN_PROFILE_ID, ORG_ID, ADMIN_AUTH_ID],
    );
    assert.equal(admin.length, 1, "isolated acceptance fixture must contain an active same-tenant admin/manager");

    const customer = await db.unsafe(
      "select p.auth_user_id from public.profiles p where p.id=$1 and p.organization_id=$2 and p.is_active and p.auth_user_id=$3 and exists (select 1 from public.customers c where c.profile_id=p.id and c.organization_id=p.organization_id)",
      [CUSTOMER_PROFILE_ID, ORG_ID, CUSTOMER_AUTH_ID],
    );
    assert.equal(customer.length, 1, "isolated acceptance fixture must contain the active customer profile");

    const accountant = await db.unsafe(
      "select p.id, p.auth_user_id from public.profiles p where p.organization_id=$1 and p.is_active and exists (select 1 from public.user_roles r where r.profile_id=p.id and r.role='accountant') and not exists (select 1 from public.user_roles r where r.profile_id=p.id and r.role in ('admin','manager','staff')) order by p.id limit 1",
      [ORG_ID],
    );
    assert.equal(accountant.length, 1, "isolated acceptance fixture must contain a finance-only accountant");

    const retailPrice = await db.unsafe(
      "select price from public.product_prices where product_id=$1 and tier='retail' and min_quantity <= 1 and is_active order by min_quantity desc limit 1",
      [ACCOUNTANT_PRODUCT_ID],
    );
    assert.equal(retailPrice.length, 1, "accountant boundary product must have an active retail price");
    assert.equal(Number(retailPrice[0].price), 1234, "accountant boundary fixture keeps tier price distinct from base price");
    const basePrice = await db.unsafe(
      "select base_price from public.products where id=$1 and organization_id=$2 and status='active'",
      [ACCOUNTANT_PRODUCT_ID, ORG_ID],
    );
    assert.equal(Number(basePrice[0]?.base_price), 99000, "accountant boundary fixture must preserve the different source base price");

    const invoices = await db.unsafe(
      "select i.id from public.customer_invoices i join public.customers c on c.id=i.customer_id where i.organization_id=$1 and c.profile_id=$2 and i.status <> 'void' and exists (select 1 from public.customer_invoice_items li where li.invoice_id=i.id) order by i.issued_at desc, i.id limit 1",
      [ORG_ID, CUSTOMER_PROFILE_ID],
    );
    assert.ok(invoices.length, "isolated acceptance fixture must contain an invoice owned by the test customer");
    const invoiceId = invoices[0].id;

    // Every write is rolled back at the end; the suite runs only against CI's isolated PostgreSQL database.
    await assumeUser(ADMIN_AUTH_ID, "ci-audit-admin@example.test");
    await setVisibility({ cards: false, cart: false, orders: false, invoice: false, tier: false });

    await db.unsafe("reset role");
    await assumeUser(CUSTOMER_AUTH_ID, "ci-customer-one@example.test");
    // Search acceptance exercises the actual tenant-scoped RPC against a real isolated fixture row.
    // The outer transaction is always rolled back; no catalog fixture changes persist.
    await db.unsafe("reset role");
    const searchSuffix = randomUUID().replaceAll("-", "").slice(-12);
    const searchValues = {
      sku: "SKUQ" + searchSuffix,
      itemCode: "ITEMQ" + searchSuffix,
      barcode: "BARQ" + searchSuffix,
      englishName: "ENQ" + searchSuffix,
      arabicName: "اسمبحث" + searchSuffix,
      description: "DESCQ" + searchSuffix,
    };
    const updatedSearchProduct = await db.unsafe(
      "update public.products set sku=$3,name_en=$4,item_code=$5,barcode=$6,name=$7,description=$8 " +
      "where id=$1::uuid and organization_id=$2::uuid and status='active' returning id::text",
      [CATALOG_PRODUCT_ID, ORG_ID, searchValues.sku, searchValues.englishName, searchValues.itemCode,
       searchValues.barcode, searchValues.arabicName, searchValues.description],
    );
    assert.equal(updatedSearchProduct.length, 1, "search acceptance must update the canonical active fixture product");
    await assumeUser(CUSTOMER_AUTH_ID, "ci-customer-one@example.test");

    for (const [field, query] of [
      ["item_code", searchValues.itemCode],
      ["sku", searchValues.sku],
      ["barcode", searchValues.barcode],
      ["Arabic name", searchValues.arabicName],
      ["English name", searchValues.englishName],
      ["description", searchValues.description],
    ]) {
      const searchResult = await db.unsafe(
        "select public.get_storefront_catalog_page($1::text,null::uuid,1,24,false) as result",
        [query],
      );
      const result = searchResult[0]?.result;
      const matchedProduct = result?.items?.find((item) => item.id === CATALOG_PRODUCT_ID);
      assert.ok(matchedProduct, "catalog RPC must find the fixture by " + field);
      assert.equal(matchedProduct.sku, searchValues.sku, "catalog response returns the stored SKU");
      assert.equal(matchedProduct.name_en, searchValues.englishName, "catalog response returns the stored English name");
      assert.equal(matchedProduct.display_price, null, "search results preserve hidden-price policy");
      assert.equal(Object.hasOwn(matchedProduct, "base_price"), false, "search results omit raw base_price for a customer");
    }

    const items = JSON.stringify([{ product_id: CATALOG_PRODUCT_ID, quantity: 2 }]);
    const hiddenCardPrice = await db.unsafe(
      "select product_id,unit_price from public.get_storefront_product_prices($1::uuid[],1)",
      [[CATALOG_PRODUCT_ID]],
    );
    assert.equal(hiddenCardPrice.length, 1, "hidden-price catalog still returns non-financial product identity");
    assert.equal(hiddenCardPrice[0].unit_price, null, "disabled catalog prices return NULL rather than a misleading numeric zero");

    const hiddenCatalogPageResult = await db.unsafe(
      "select public.get_storefront_catalog_page(null::text,null::uuid,1,24,false) as result",
    );
    const hiddenCatalogProduct = hiddenCatalogPageResult[0]?.result?.items?.find((item) => item.id === CATALOG_PRODUCT_ID);
    assert.ok(hiddenCatalogProduct, "hidden-price catalog page retains the product metadata");
    assert.equal(hiddenCatalogProduct.display_price, null, "hidden catalog page expresses price absence as NULL");
    assert.equal(Object.hasOwn(hiddenCatalogProduct, "base_price"), false, "public catalog page never emits the base_price key");

    for (const surface of ["cart", "orders"]) {
      const result = await db.unsafe(
        "select public.preview_customer_order_pricing($1::jsonb,$2::text) as result",
        [items, surface],
      );
      const payload = result[0]?.result;
      assert.equal(payload?.visible, false, surface + " preview must honor server-side hidden-price setting");
      assert.equal(Object.hasOwn(payload ?? {}, "items"), false, surface + " preview must omit line prices rather than mask them in UI");
      assert.equal(Object.hasOwn(payload ?? {}, "total_amount"), false, surface + " preview must omit the monetary total");
      assert.equal(payload?.customer_tier_visible, false, surface + " preview must suppress customer tier by default");
    }

    const hiddenInvoiceResult = await db.unsafe(
      "select public.get_customer_invoice_pdf($1::uuid) as result",
      [invoiceId],
    );
    const hiddenInvoice = hiddenInvoiceResult[0]?.result;
    assert.equal(hiddenInvoice?.financial_details_visible, false, "invoice PDF RPC must report disabled financial visibility");
    assert.equal(hiddenInvoice?.customer_tier_visible, false, "invoice PDF RPC must hide customer tier by default");
    assert.equal(hiddenInvoice?.customer?.tier_label, undefined, "hidden invoice RPC must omit the customer tier label itself");
    assert.equal(hiddenInvoice?.invoice?.total_amount, undefined, "hidden invoice RPC response must omit invoice total");
    assert.equal(hiddenInvoice?.invoice?.subtotal, undefined, "hidden invoice RPC response must omit subtotal");
    assert.ok(Array.isArray(hiddenInvoice?.lines), "invoice non-financial line details remain available");
    for (const line of hiddenInvoice.lines) {
      assert.equal(line.unit_price, undefined, "hidden invoice response must omit unit price");
      assert.equal(line.line_total, undefined, "hidden invoice response must omit line total");
    }

    // A finance-only accountant cannot mutate tenant visibility settings, even via direct table writes.
    await db.unsafe("reset role");
    await assumeUser(accountant[0].auth_user_id, "ci-accountant@example.test");
    let writeRows = [];
    try {
      writeRows = await db.unsafe(
        "update public.admin_settings set value='true'::jsonb,updated_at=statement_timestamp() where organization_id=$1 and key='show_price_on_cards' returning value",
        [ORG_ID],
      );
    } catch (error) {
      if (!/administrator or manager permission required|row-level security|permission denied/i.test(String(error))) throw error;
    }
    assert.equal(writeRows.length, 0, "accountant must not change price-visibility settings");

    await db.unsafe("reset role");
    await assumeUser(ADMIN_AUTH_ID, "ci-audit-admin@example.test");
    const settingReadback = await db.unsafe(
      "select value from public.admin_settings where organization_id=$1 and key='show_price_on_cards'",
      [ORG_ID],
    );
    assert.equal(settingReadback[0]?.value, false, "unauthorized accountant write must leave visibility disabled");

    // Enabling the surfaces must change RPC payloads without client-side prices or stale settings.
    await setVisibility({ cards: true, cart: true, orders: true, invoice: true, tier: true });
    await db.unsafe("reset role");
    await assumeUser(CUSTOMER_AUTH_ID, "ci-customer-one@example.test");
    const visibleCardPrice = await db.unsafe(
      "select product_id,unit_price from public.get_storefront_product_prices($1::uuid[],1)",
      [[CATALOG_PRODUCT_ID]],
    );
    assert.equal(visibleCardPrice.length, 1);
    assert.ok(Number(visibleCardPrice[0].unit_price) > 0, "enabled catalog price returns an active customer-tier price");
    const visibleCatalogPageResult = await db.unsafe(
      "select public.get_storefront_catalog_page(null::text,null::uuid,1,24,false) as result",
    );
    const visibleCatalogProduct = visibleCatalogPageResult[0]?.result?.items?.find((item) => item.id === CATALOG_PRODUCT_ID);
    assert.ok(visibleCatalogProduct, "visible catalog page retains the product metadata");
    assert.ok(Number(visibleCatalogProduct.display_price) > 0, "enabled catalog page emits a server-resolved display price");
    assert.equal(Object.hasOwn(visibleCatalogProduct, "base_price"), false, "public catalog page never emits the raw base_price key");
    let directCustomerTierUnitPrice;
    for (const surface of ["cart", "orders"]) {
      const result = await db.unsafe(
        "select public.preview_customer_order_pricing($1::jsonb,$2::text) as result",
        [items, surface],
      );
      const payload = result[0]?.result;
      assert.equal(payload?.visible, true, surface + " pricing becomes visible after authorized server setting change");
      assert.ok(Array.isArray(payload?.items) && payload.items.length === 1, surface + " should return server-priced lines");
      assert.ok(Number(payload.items[0].unit_price) > 0);
      if (surface === "cart") directCustomerTierUnitPrice = Number(payload.items[0].unit_price);
      assert.ok(Number(payload.total_amount) > 0);
      assert.equal(payload.customer_tier_visible, true);
      assert.equal(payload.customer_tier_label, "الجملة");
    }
    const visibleInvoiceResult = await db.unsafe(
      "select public.get_customer_invoice_pdf($1::uuid) as result",
      [invoiceId],
    );
    const visibleInvoice = visibleInvoiceResult[0]?.result;
    assert.equal(visibleInvoice?.financial_details_visible, true);
    assert.equal(visibleInvoice?.customer_tier_visible, true, "authorized invoice payload should honor the separate tier-label policy");
    assert.equal(visibleInvoice?.customer?.tier_label, "الجملة", "authorized invoice payload should include only the server-approved tier label");
    assert.ok(Number(visibleInvoice?.invoice?.total_amount) > 0, "authorized invoice payload includes amounts after setting change");

    // An accountant must never acquire staff base-price access from an overlapping manager role.
    // This fixture has no approved customer identity, so customer-price resolution must fail closed.
    await db.unsafe("reset role");
    await db.unsafe(
      "insert into public.user_roles(profile_id,role) values($1,'manager') on conflict(profile_id,role) do nothing",
      [accountant[0].id],
    );
    await assumeUser(accountant[0].auth_user_id, "ci-accountant@example.test");
    await assertDatabaseRejects(
      "select unit_price from public.get_storefront_product_prices($1::uuid[],1)",
      [[ACCOUNTANT_PRODUCT_ID]],
      /customer membership lacks permission to resolve catalog prices/i,
      "accountant with an overlapping manager role and no approved customer context cannot read prices",
    );

    // Reuse the existing Auth identity for the membership tests. The local fixture has
    // no extra auth.users records, and auth.sessions correctly enforces its user_id FK.
    await db.unsafe("reset role");
    const originalCustomerProfile = await db.unsafe(
      "select email, auth_user_id from public.profiles where id=$1 and auth_user_id=$2",
      [CUSTOMER_PROFILE_ID, CUSTOMER_AUTH_ID],
    );
    assert.equal(originalCustomerProfile.length, 1, "original customer profile must exist before membership transfer");
    const originalCustomerEmail = originalCustomerProfile[0].email ?? "ci-customer-one@example.test";

    // Move the existing auth identity temporarily to a company-member profile inside this
    // enclosing transaction; all changes roll back in finally.
    await db.unsafe(
      "update public.profiles set auth_user_id=null,email=null where id=$1 and auth_user_id=$2",
      [CUSTOMER_PROFILE_ID, CUSTOMER_AUTH_ID],
    );
    await db.unsafe(
      "insert into public.profiles(id,auth_user_id,organization_id,full_name,email,is_active) values($1,$2,$3,'CI company member',$4,true)",
      [MEMBER_PROFILE_ID, CUSTOMER_AUTH_ID, ORG_ID, originalCustomerEmail],
    );
    await db.unsafe(
      "insert into public.user_roles(profile_id,role) values($1,'customer') on conflict(profile_id,role) do nothing",
      [MEMBER_PROFILE_ID],
    );
    await db.unsafe(
      "insert into public.customer_company_memberships(organization_id,customer_id,profile_id,member_role,status,invited_by) values($1,(select c.id from public.customers c where c.profile_id=$2 and c.organization_id=$1),$3,'buyer','active',$2)",
      [ORG_ID, CUSTOMER_PROFILE_ID, MEMBER_PROFILE_ID],
    );
    await assumeUser(CUSTOMER_AUTH_ID, originalCustomerEmail);
    const memberPreviewResult = await db.unsafe(
      "select public.preview_customer_order_pricing($1::jsonb,'cart') as result",
      [items],
    );
    const memberPreview = memberPreviewResult[0]?.result;
    assert.equal(memberPreview?.visible, true, "active buyer membership may preview cart prices");
    assert.equal(memberPreview?.customer_tier_label, "الجملة", "company buyer resolves the owner's approved price tier");
    assert.equal(
      Number(memberPreview?.items?.[0]?.unit_price),
      directCustomerTierUnitPrice,
      "company buyer receives the same server-derived tier price as the owning customer",
    );
    const memberCardPrice = await db.unsafe(
      "select product_id,unit_price from public.get_storefront_product_prices($1::uuid[],1)",
      [[CATALOG_PRODUCT_ID]],
    );
    assert.equal(memberCardPrice.length, 1, "active buyer membership may resolve product-card pricing");
    assert.equal(
      Number(memberCardPrice[0].unit_price),
      directCustomerTierUnitPrice,
      "company buyer receives only the owning customer's server-derived tier price",
    );

    // Finance members lack catalog.read and orders.create. Each expected SQL error is
    // isolated with a savepoint so the second denial still runs in the same transaction.
    await db.unsafe("reset role");
    await db.unsafe(
      "update public.customer_company_memberships set member_role='finance',updated_at=now() where profile_id=$1 and organization_id=$2 and status='active'",
      [MEMBER_PROFILE_ID, ORG_ID],
    );
    await assumeUser(CUSTOMER_AUTH_ID, originalCustomerEmail);
    await assertDatabaseRejects(
      "select product_id,unit_price from public.get_storefront_product_prices($1::uuid[],1)",
      [[CATALOG_PRODUCT_ID]],
      /customer membership lacks permission to resolve catalog prices/i,
      "finance member cannot resolve product-card prices",
    );
    await assertDatabaseRejects(
      "select public.preview_customer_order_pricing($1::jsonb,'cart') as result",
      [items],
      /customer membership lacks permission for requested price preview/i,
      "finance member cannot resolve catalog prices",
    );
    await assertDatabaseRejects(
      "select public.preview_customer_order_pricing($1::jsonb,'orders') as result",
      [items],
      /customer membership lacks permission for requested price preview/i,
      "finance member cannot resolve order-review prices",
    );

    // Restore the original customer identity, then delete its live Auth session while
    // retaining the unexpired JWT claims to exercise immediate server-side revocation.
    await db.unsafe("reset role");
    await db.unsafe(
      "delete from public.customer_company_memberships where profile_id=$1 and organization_id=$2",
      [MEMBER_PROFILE_ID, ORG_ID],
    );
    await db.unsafe("delete from public.profiles where id=$1", [MEMBER_PROFILE_ID]);
    await db.unsafe(
      "update public.profiles set auth_user_id=$2,email=$3 where id=$1",
      [CUSTOMER_PROFILE_ID, CUSTOMER_AUTH_ID, originalCustomerEmail],
    );
    await assumeUser(CUSTOMER_AUTH_ID, originalCustomerEmail);
    await db.unsafe("reset role");
    const originalCustomerState = await db.unsafe(
      "select id,status from public.customers where profile_id=$1 and organization_id=$2",
      [CUSTOMER_PROFILE_ID, ORG_ID],
    );
    assert.equal(originalCustomerState.length, 1, "direct customer status fixture must exist");
    assert.equal(originalCustomerState[0].status, "approved", "direct customer starts approved");
    await db.unsafe(
      "update public.customers set status='pending',updated_at=now() where id=$1",
      [originalCustomerState[0].id],
    );
    await assumeUser(CUSTOMER_AUTH_ID, originalCustomerEmail);
    await assertDatabaseRejects(
      "select product_id,unit_price from public.get_storefront_product_prices($1::uuid[],1)",
      [[CATALOG_PRODUCT_ID]],
      /approved customer required to resolve catalog prices/i,
      "unapproved direct customer cannot resolve protected product-card prices",
    );
    await db.unsafe("reset role");
    await db.unsafe(
      "update public.customers set status=$2,updated_at=now() where id=$1",
      [originalCustomerState[0].id, originalCustomerState[0].status],
    );
    await assumeUser(CUSTOMER_AUTH_ID, originalCustomerEmail);
    await db.unsafe("reset role");
    await db.unsafe("delete from auth.sessions where id=$1 and user_id=$1", [CUSTOMER_AUTH_ID]);
    await db.unsafe("set local role authenticated");
    await assertDatabaseRejects(
      "select product_id,unit_price from public.get_storefront_product_prices($1::uuid[],1)",
      [[CATALOG_PRODUCT_ID]],
      /active profile and organization required to resolve catalog prices/i,
      "revoked session cannot call catalog price resolver with a stale authenticated JWT",
    );
    await assertDatabaseRejects(
      "select public.preview_customer_order_pricing($1::jsonb,'cart') as result",
      [items],
      /active profile and organization required/i,
      "revoked session cannot call customer pricing preview with a stale authenticated JWT",
    );

    process.stdout.write("PASS customer catalog search: item code, SKU, barcode, Arabic/English names and description; price privacy and authorization boundaries.\n");
    process.stdout.write("PASS customer price privacy: hidden payloads, live-session revocation, tenant-bound membership tier, capability-scoped previews, authorized settings and base-price boundaries.\n");
  } finally {
    await db.unsafe("reset role").catch(() => {});
    await db.unsafe("rollback").catch(() => {});
    await db.end({ timeout: 5 });
  }
}

main().catch((error) => {
  process.stderr.write("CUSTOMER_PRICE_VISIBILITY_ACCEPTANCE_FAILED " + String(error?.stack || error) + "\n");
  process.exitCode = 1;
});
