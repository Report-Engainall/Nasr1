import assert from "node:assert/strict";
import postgres from "postgres";
import { runOrderInputHardeningAcceptance } from "./test-order-input-hardening.mjs";

const url = process.env.TEST_DATABASE_URL;
if (!url) throw new Error("TEST_DATABASE_URL required");

const org = "a0000000-0000-0000-0000-000000000001";
const otherOrg = "e9999999-eeee-4eee-8eee-eeeeeeeeee99";
const adminAuth = "33333333-3333-4333-8333-333333333333";
const customerAuth = "11111111-1111-4111-8111-111111111111";
const code = "CI-P1-CAT-001";
const paginationCodes = ["CI-P1-PAGE-001", "CI-P1-PAGE-002", "CI-P1-PAGE-003"];
const name = "CI P1 Category";
const foreignCode = "CI-P1-CAT-FOREIGN-001";
const foreignName = "CI P1 Foreign Category";
const root = postgres(url, { max: 1, prepare: false });
const admin = postgres(url, { max: 1, prepare: false });
const customer = postgres(url, { max: 1, prepare: false });

async function ident(connection, id, email) {
  await connection.unsafe("select set_config('request.jwt.claim.sub',$1,false)", [id]);
  await connection.unsafe(
    "select set_config('request.jwt.claims',$1,false)",
    [JSON.stringify({ sub: id, email, email_confirmed_at: new Date().toISOString(), role: "authenticated" })],
  );
  await connection.unsafe("set role authenticated");
}
async function rpc(connection, query, args) {
  return (await connection.unsafe(query, args))[0]?.result;
}
async function cleanup() {
  await root.unsafe(
    "delete from public.audit_logs where organization_id=$1 and entity_id in " +
      "(select id from public.products where organization_id=$1 and item_code = any($2::text[]))",
    [org, paginationCodes],
  ).catch(() => {});
  await root.unsafe(
    "delete from public.products where organization_id=$1 and item_code = any($2::text[])",
    [org, paginationCodes],
  ).catch(() => {});

  await root.unsafe(
    "delete from public.audit_logs where organization_id=$1 and entity_id in " +
      "(select id from public.products where organization_id=$1 and item_code=$2 " +
      "union all select id from public.categories where organization_id=$1 and name=$3)",
    [org, code, name],
  ).catch(() => {});
  await root.unsafe(
    "delete from public.audit_logs where organization_id=$1 and entity_id in " +
      "(select id from public.products where organization_id=$1 and item_code=$2 " +
      "union all select id from public.categories where organization_id=$1 and name=$3)",
    [otherOrg, foreignCode, foreignName],
  ).catch(() => {});
  await root.unsafe(
    "delete from public.products where (organization_id=$1 and item_code=$2) " +
      "or (organization_id=$3 and item_code=$4)",
    [org, code, otherOrg, foreignCode],
  ).catch(() => {});
  await root.unsafe(
    "delete from public.categories where (organization_id=$1 and name=$2) " +
      "or (organization_id=$3 and name=$4)",
    [org, name, otherOrg, foreignName],
  ).catch(() => {});
  await root.unsafe(
    "delete from public.customers where organization_id=$1 and customer_code='CI-P1-CATALOG-LOCAL-CUSTOMER'",
    [org],
  ).catch(() => {});
  await root.unsafe(
    "delete from public.warehouses where organization_id=$1 and name='CI P1 Catalog Local Tenant Warehouse'",
    [org],
  ).catch(() => {});
  await root.unsafe(
    "delete from public.profiles where email='ci-p1-foreign-profile@example.test'",
    [],
  ).catch(() => {});
  await root.unsafe(
    "delete from public.warehouses where organization_id=$1 and name='CI P1 Cross Tenant Warehouse'",
    [otherOrg],
  ).catch(() => {});
  await root.unsafe(
    "delete from public.organizations where id=$1 and name='CI P1 Catalog Foreign Tenant'",
    [otherOrg],
  ).catch(() => {});
}

async function main() {
  await cleanup();
  await root.unsafe(
    "insert into public.organizations(id,name) values($1,'CI P1 Catalog Foreign Tenant') " +
      "on conflict(id) do update set name=excluded.name",
    [otherOrg],
  );
  const foreignCategory = (await root.unsafe(
    "insert into public.categories(organization_id,name,code,is_active) " +
      "values($1,$2,'CI-FOREIGN',true) returning id",
    [otherOrg, foreignName],
  ))[0].id;
  const foreignProduct = (await root.unsafe(
    "insert into public.products(organization_id,category_id,name,item_code,unit,status) " +
      "values($1,$2,'CI foreign product',$3,'قطعة','active') returning id",
    [otherOrg, foreignCategory, foreignCode],
  ))[0].id;
  const foreignWarehouse = (await root.unsafe(
    "insert into public.warehouses(organization_id,name,code,is_active) " +
      "values($1,'CI P1 Cross Tenant Warehouse','CI-P1-XTENANT',true) returning id",
    [otherOrg],
  ))[0].id;

  const localWarehouse = (await root.unsafe(
    "insert into public.warehouses(organization_id,name,code,is_active) " +
      "values($1,'CI P1 Catalog Local Tenant Warehouse','CI-P1-LOCAL-TENANT',true) returning id",
    [org],
  ))[0].id;
  const foreignCustomer = (await root.unsafe(
    "insert into public.customers(organization_id,customer_code,business_name,status) " +
      "values($1,'CI-P1-FOREIGN-CUSTOMER','CI P1 foreign customer','approved') returning id",
    [otherOrg],
  ))[0].id;
  const localCustomer = (await root.unsafe(
    "insert into public.customers(organization_id,customer_code,business_name,status) " +
      "values($1,'CI-P1-CATALOG-LOCAL-CUSTOMER','CI P1 local customer','approved') returning id",
    [org],
  ))[0].id;
  const foreignProfile = (await root.unsafe(
    "insert into public.profiles(organization_id,full_name,email,is_active) " +
      "values($1,'CI P1 foreign profile','ci-p1-foreign-profile@example.test',true) returning id",
    [otherOrg],
  ))[0].id;


  await ident(admin, adminAuth, "admin@aghbari.ye");
  await ident(customer, customerAuth, "customer@example.test");

  const category = await rpc(
    admin,
    "select public.create_admin_catalog_category($1,null,$2) result",
    [name, "CI-P1"],
  );
  assert.ok(category.id && category.created, "category create returns a new ID");
  const categoryAgain = await rpc(
    admin,
    "select public.create_admin_catalog_category($1,null,$2) result",
    [name, "CI-P1"],
  );
  assert.equal(categoryAgain.id, category.id, "duplicate category create is idempotent");
  assert.equal(categoryAgain.created, false);

  const payload = {
    name: "CI product",
    item_code: code,
    barcode: null,
    unit: "قطعة",
    description: "test fixture",
    category_id: category.id,
    base_price: 12,
    price_wholesale_of_wholesale: 10,
    price_wholesale: 11,
    price_retail: 13,
    status: "active",
  };
  const created = await rpc(
    admin,
    "select public.save_admin_catalog_product(null,$1::jsonb) result",
    [admin.json(payload)],
  );
  assert.ok(created.id && created.created, "product create returns a new ID");

  const expectedSearchIndexes = [
    "products_org_item_code_trgm_idx",
    "products_org_name_trgm_idx",
  ];
  const searchIndexes = await root.unsafe(
    "select indexname,indexdef from pg_indexes where schemaname='public' and indexname=any($1::text[]) order by indexname",
    [expectedSearchIndexes],
  );
  assert.deepEqual(searchIndexes.map((row) => row.indexname), expectedSearchIndexes,
    "the active tenant catalog exposes both trigram search indexes");
  for (const index of searchIndexes) {
    assert.match(index.indexdef, /USING gin/i, "trigram search uses a GIN index");
    assert.match(index.indexdef, /extensions\.gin_trgm_ops/i, "the index binds the installed pg_trgm operator class");
    assert.match(index.indexdef, /WHERE \(status = 'active'::text\)/i, "the index excludes archived/inactive products");
  }
  const searchableProduct = (await root.unsafe(
    "select name,item_code from public.products where id=$1 and organization_id=$2 and status='active'",
    [created.id, org],
  ))[0];
  assert.ok(searchableProduct?.name && searchableProduct?.item_code,
    "the product has target-native search fields");
  const nameMatch = await root.unsafe(
    "select id from public.products where id=$1 and organization_id=$2 and status='active' and name OPERATOR(extensions.%) $3",
    [created.id, org, searchableProduct.name],
  );
  assert.equal(nameMatch[0]?.id, created.id, "the name trigram operator returns the tenant's active product");
  const itemCodeMatch = await root.unsafe(
    "select id from public.products where id=$1 and organization_id=$2 and status='active' and item_code OPERATOR(extensions.%) $3",
    [created.id, org, searchableProduct.item_code],
  );
  assert.equal(itemCodeMatch[0]?.id, created.id, "the item-code trigram operator returns the tenant's active product");

  // Root-level writes bypass RLS; database integrity must still reject cross-tenant links.
  await assert.rejects(
    () => root.unsafe("update public.products set category_id=$1 where id=$2", [foreignCategory, created.id]),
    /foreign key constraint|tenant_integrity_products_category_org_fk/i,
    "privileged direct DML cannot bind a product to another organization's category",
  );
  await assert.rejects(
    () => root.unsafe(
      "insert into public.inventory_balances(product_id,warehouse_id,quantity_on_hand,quantity_reserved) values($1,$2,0,0)",
      [created.id, foreignWarehouse],
    ),
    /inventory product and warehouse must belong to the same organization/i,
    "privileged direct DML cannot create stock for a product in another organization's warehouse",
  );
  // Later target-native tables must preserve both the row tenant and every tenant-bearing foreign key.
  const adminProfileId = (await root.unsafe(
    "select id from public.profiles where auth_user_id=$1 and organization_id=$2",
    [adminAuth, org],
  ))[0]?.id;
  assert.ok(adminProfileId, "CI admin profile must exist in the target organization");

  await assert.rejects(
    () => root.unsafe(
      "insert into public.customer_addresses(organization_id,customer_id,label,recipient_name,phone,address_line1,city,country) " +
        "values($1,$2,'foreign address','Foreign Customer','7771112222','Cross tenant street','Sanaa','YE')",
      [org, foreignCustomer],
    ),
    /tenant_integrity_customer_addresses_customer_org_fk/i,
    "cross-tenant customer address writes must be rejected",
  );
  await assert.rejects(
    () => root.unsafe(
      "insert into public.customer_company_invitations(organization_id,customer_id,invited_email,member_role,token_hash,expires_at) " +
        "values($1,$2,'foreign@example.test','buyer',$3,now()+interval '1 day')",
      [org, foreignCustomer, "a".repeat(32)],
    ),
    /tenant_integrity_company_invitations_customer_org_fk/i,
    "cross-tenant company invitation writes must be rejected",
  );
  await assert.rejects(
    () => root.unsafe(
      "insert into public.customer_activation_invitations(organization_id,customer_id,invited_email,token_hash,expires_at) " +
        "values($1,$2,'foreign@example.test',$3,now()+interval '1 day')",
      [org, foreignCustomer, "b".repeat(64)],
    ),
    /tenant_integrity_activation_invitations_customer_org_fk/i,
    "cross-tenant activation invitation writes must be rejected",
  );
  await assert.rejects(
    () => root.unsafe(
      "insert into public.customer_company_memberships(organization_id,customer_id,profile_id,member_role) values($1,$2,$3,'buyer')",
      [org, localCustomer, foreignProfile],
    ),
    /tenant_integrity_company_memberships_profile_org_fk/i,
    "a company membership cannot bind a profile from another organization",
  );
  await assert.rejects(
    () => root.unsafe(
      "insert into public.storefront_saved_products(organization_id,profile_id,product_id) values($1,$2,$3)",
      [org, adminProfileId, foreignProduct],
    ),
    /tenant_integrity_saved_products_product_org_fk/i,
    "a saved product cannot point at a product from another organization",
  );
  await assert.rejects(
    () => root.unsafe(
      "insert into public.inventory_transfers(organization_id,product_id,source_warehouse_id,destination_warehouse_id,quantity,reason,idempotency_key,created_by) " +
        "values($1,$2,$3,$4,1,'cross-tenant integrity fixture','CI-P1-CROSS-TENANT-TRANSFER-0001',$5)",
      [org, created.id, localWarehouse, foreignWarehouse, adminProfileId],
    ),
    /tenant_integrity_transfer_dest_warehouse_org_fk/i,
    "a stock transfer cannot target another organization's warehouse",
  );

  const pageProducts = [];
  const pageFixtures = [
    { name: "P1 Pagination Fixture Alpha", item_code: paginationCodes[0] },
    { name: "P1 Pagination Fixture Bravo", item_code: paginationCodes[1] },
    { name: "P1 Pagination Fixture Charlie", item_code: paginationCodes[2] },
  ];
  for (const fixture of pageFixtures) {
    const result = await rpc(
      admin,
      "select public.save_admin_catalog_product(null,$1::jsonb) result",
      [admin.json({
        ...payload,
        name: fixture.name,
        item_code: fixture.item_code,
        base_price: 5,
        price_wholesale_of_wholesale: 4,
        price_wholesale: 4.5,
        price_retail: 6,
      })],
    );
    assert.ok(result.id && result.created, "pagination fixture product is created through the audited command");
    pageProducts.push(result.id);
  }

  const firstPage = await rpc(
    admin,
    "select public.get_storefront_catalog_page($1,$2::uuid,$3,$4,$5) result",
    ["P1 Pagination Fixture", category.id, 1, 2, false],
  );
  const secondPage = await rpc(
    admin,
    "select public.get_storefront_catalog_page($1,$2::uuid,$3,$4,$5) result",
    ["P1 Pagination Fixture", category.id, 2, 2, false],
  );
  assert.equal(firstPage.total_count, 3, "server count applies search and category before pagination");
  assert.equal(firstPage.total_pages, 2, "server computes page count");
  assert.equal(firstPage.items.length, 2, "first page contains only the requested page size");
  assert.equal(secondPage.items.length, 1, "second page contains the remaining matching row");
  assert.deepEqual(
    [...firstPage.items, ...secondPage.items].map((item) => item.item_code),
    paginationCodes,
    "ordered pages cover the set without duplicates or omissions",
  );
  assert.ok(firstPage.items.every((item) => typeof item.display_price === "number" && item.display_price === item.base_price),
    "staff sees only the authorized base/display price resolved through the canonical pricing RPC");
  assert.equal(Object.hasOwn(firstPage.items[0], "price_wholesale"), false,
    "raw alternate tier price keys are absent from the customer catalog projection");

  const noAvailability = await rpc(
    admin,
    "select public.get_storefront_catalog_page($1,$2::uuid,$3,$4,$5) result",
    ["P1 Pagination Fixture", category.id, 1, 10, true],
  );
  assert.equal(noAvailability.total_count, 0, "availability filter excludes products without an inventory balance");
  for (const id of pageProducts) {
    await rpc(admin, "select public.archive_admin_catalog_product($1::uuid) result", [id]);
  }


  await assert.rejects(
    () => rpc(admin, "select public.save_admin_catalog_product(null,$1::jsonb) result", [
      admin.json({ ...payload, shadow_tier_price: 999 }),
    ]),
    (error) =>
      /catalog payload contains unsupported fields/i.test(error.message) &&
      /shadow_tier_price/i.test(String(error.detail || "")),
    "unexpected catalog field is rejected with the offending key",
  );

  const update = {
    ...payload,
    name: "CI product changed",
    base_price: 14,
    expected_base_price: 12,
    expected_price_wholesale_of_wholesale: 10,
    expected_price_wholesale: 11,
    expected_price_retail: 13,
  };
  const updated = await rpc(
    admin,
    "select public.save_admin_catalog_product($1::uuid,$2::jsonb) result",
    [created.id, admin.json(update)],
  );
  assert.equal(updated.id, created.id);
  assert.equal(updated.created, false);

  await assert.rejects(
    () => rpc(admin, "select public.save_admin_catalog_product($1::uuid,$2::jsonb) result", [
      created.id,
      admin.json({ ...update, expected_base_price: 12, name: "stale form" }),
    ]),
    /product prices changed after the form opened/i,
    "stale price snapshot is rejected by the canonical price-grid command",
  );

  await assert.rejects(
    () => rpc(admin, "select public.save_admin_catalog_product($1::uuid,$2::jsonb) result", [
      foreignProduct,
      admin.json({ ...update, category_id: category.id }),
    ]),
    /product not found in organization/i,
    "a product in a different tenant cannot be edited",
  );
  await assert.rejects(
    () => rpc(admin, "select public.archive_admin_catalog_product($1::uuid) result", [foreignProduct]),
    /product not found in organization/i,
    "a product in a different tenant cannot be archived",
  );
  await assert.rejects(
    () => rpc(admin, "select public.create_admin_catalog_category($1,$2,$3) result", [
      "CI foreign child attempt",
      foreignCategory,
      "CI-CHILD",
    ]),
    /active parent category not found in organization/i,
    "foreign-tenant parent category cannot be used",
  );
  await assert.rejects(
    () => rpc(admin, "select public.archive_admin_catalog_category($1::uuid) result", [foreignCategory]),
    /category not found in organization/i,
    "a category in a different tenant cannot be archived",
  );

  await assert.rejects(
    () => rpc(customer, "select public.create_admin_catalog_category($1,null,null) result", ["no access"]),
    /active admin or manager profile required/i,
    "customer cannot run staff category commands",
  );
  await assert.rejects(
    () => rpc(customer, "select public.save_admin_catalog_product(null,$1::jsonb) result", [
      customer.json(payload),
    ]),
    /active admin or manager profile required/i,
    "customer cannot run staff product commands",
  );
  await assert.rejects(
    () => admin.unsafe(
      "insert into public.categories(organization_id,name,code) values($1,'direct write forbidden','DIRECT')",
      [org],
    ),
    /permission denied/i,
    "direct category writes are denied",
  );
  await assert.rejects(
    () => admin.unsafe(
      "update public.products set name='direct write forbidden' where id=$1",
      [created.id],
    ),
    /permission denied/i,
    "direct product updates are denied; use the catalog RPC",
  );
  await assert.rejects(
    () => admin.unsafe(
      "insert into public.product_prices(product_id,tier,price,min_quantity,is_active) values($1,'retail',1,1,true)",
      [created.id],
    ),
    /permission denied/i,
    "direct price-table writes are denied; use the price-grid command",
  );
  await assert.rejects(
    () => admin.unsafe(
      "insert into public.audit_logs(organization_id,action,entity_type) values($1,'forged','product')",
      [org],
    ),
    /permission denied/i,
    "direct audit writes are denied",
  );

  const foreignAuditId = (await root.unsafe(
    "insert into public.audit_logs(organization_id,action,entity_type,entity_id) " +
      "values($1,'catalog.test.foreign','product',$2) returning id",
    [otherOrg, foreignProduct],
  ))[0].id;
  const foreignAuditVisible = await admin.unsafe(
    "select id from public.audit_logs where id=$1",
    [foreignAuditId],
  );
  assert.equal(foreignAuditVisible.length, 0, "audit reads remain tenant scoped");

  const archiveProduct = await rpc(
    admin,
    "select public.archive_admin_catalog_product($1::uuid) result",
    [created.id],
  );
  assert.equal(archiveProduct.status, "inactive");
  assert.equal(
    (await root.unsafe("select count(*)::int n from public.products where id=$1", [created.id]))[0].n,
    1,
    "product archive is soft and preserves the row",
  );

  const archiveCategory = await rpc(
    admin,
    "select public.archive_admin_catalog_category($1::uuid) result",
    [category.id],
  );
  assert.equal(archiveCategory.is_active, false);
  assert.equal(
    (await root.unsafe("select is_active from public.categories where id=$1", [category.id]))[0].is_active,
    false,
    "category archive is soft and preserves the row",
  );

  const actor = (await root.unsafe(
    "select id from public.profiles where auth_user_id=$1",
    [adminAuth],
  ))[0]?.id;
  const auditRows = await root.unsafe(
    "select action,actor_id from public.audit_logs " +
      "where organization_id=$1 and entity_id=any($2::uuid[])",
    [org, [category.id, created.id]],
  );
  const actions = new Set(auditRows.map((row) => row.action));
  for (const action of [
    "catalog.category_created",
    "catalog.product_created",
    "catalog.product_updated",
    "product.price_grid_updated",
    "catalog.product_archived",
    "catalog.category_archived",
  ]) {
    assert.ok(actions.has(action), "missing audit action: " + action);
  }
  assert.ok(auditRows.length >= 6, "expected a full product/category audit trail");
  assert.ok(actor && auditRows.every((row) => row.actor_id === actor), "audit rows retain the authenticated profile identity");

  await runOrderInputHardeningAcceptance({
    root, admin, customer, org, adminAuth, customerAuth, foreignProduct,
  });

  await admin.unsafe("reset role");
  await customer.unsafe("reset role");
  await cleanup();
  console.log(
    "PASS admin catalog commands: create/update/archive product and category, explicit key rejection, canonical price RPC/stale-write rejection, tenant isolation, audit identity, and direct-DML denial",
  );
}

try {
  await main();
} catch (error) {
  console.error("ADMIN_CATALOG_COMMANDS_FAILED", error);
  process.exitCode = 1;
} finally {
  for (const connection of [admin, customer]) {
    try { await connection.unsafe("reset role"); } catch {}
    await connection.end();
  }
  try { await cleanup(); } catch (error) {
    console.error("catalog cleanup failed", error);
    process.exitCode = 1;
  }
  await root.end();
}
