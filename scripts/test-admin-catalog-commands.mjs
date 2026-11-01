import { logError, logInfo } from "./diagnostic-logger.mjs";
import assert from "node:assert/strict";
import postgres from "postgres";
import { runOrderInputHardeningAcceptance } from "./test-order-input-hardening.mjs";
import { runCriticalCleanup } from "./critical-cleanup.mjs";

const url = process.env.TEST_DATABASE_URL;
if (!url) throw new Error("TEST_DATABASE_URL required");

const org = "a0000000-0000-0000-0000-000000000001";
const otherOrg = "e9999999-eeee-4eee-8eee-eeeeeeeeee99";
const adminAuth = "33333333-3333-4333-8333-333333333333";
const customerAuth = "11111111-1111-4111-8111-111111111111";
const code = "CI-P1-CAT-001";
const paginationCodes = ["CI-P1-PAGE-001", "CI-P1-PAGE-002", "CI-P1-PAGE-003"];
const name = "CI P1 Category";
const renamedName = "CI P1 Category Renamed";
const collisionName = "CI P1 Category Collision";
const foreignCode = "CI-P1-CAT-FOREIGN-001";
const foreignName = "CI P1 Foreign Category";
const metricsOrderNumbers = ["CI-P1-METRICS-PENDING","CI-P1-METRICS-CONFIRMED","CI-P1-METRICS-PROCESSING","CI-P1-METRICS-SHIPPED","CI-P1-METRICS-DELIVERED","CI-P1-METRICS-CANCELLED"];
const metricsInvoiceNumbers = ["CI-P1-METRICS-INVOICE-YER", "CI-P1-METRICS-INVOICE-USD"];
const metricsUnknownStockCode = "CI-P1-METRICS-UNKNOWN-STOCK";
const metricsForeignOrderNumber = "CI-P1-METRICS-FOREIGN";
const concurrentOrderKey = "ci-p1-staff-race-idempotency-0001";
const root = postgres(url, { max: 1, prepare: false });
const admin = postgres(url, { max: 1, prepare: false });
const customer = postgres(url, { max: 1, prepare: false });
const raceConnections = Array.from({ length: 4 }, () => postgres(url, { max: 1, prepare: false }));

async function ident(connection, id, email) {
  // This helper is called between role-scoped commands. Seed the test session only
  // while using the privileged fixture role; application roles never write auth.sessions.
  await connection.unsafe("reset role").catch((cleanupError) => { process.stderr.write("[admin-catalog-commands] fixture cleanup failed: " + String(cleanupError) + "\n"); });
  await connection.unsafe(
    "insert into auth.sessions(id,user_id,created_at,updated_at,refreshed_at,not_after,user_agent,ip) values($1,$1,now(),now(),now(),null,'CI admin catalog session','127.0.0.1'::inet) on conflict(id) do update set user_id=excluded.user_id,updated_at=now(),refreshed_at=now(),not_after=null",
    [id],
  );
  await connection.unsafe("select set_config('request.jwt.claim.sub',$1,false)", [id]);
  await connection.unsafe(
    "select set_config('request.jwt.claims',$1,false)",
    [JSON.stringify({ sub: id, email, email_confirmed_at: new Date().toISOString(), role: "authenticated", session_id: id })],
  );
  await connection.unsafe("set role authenticated");
}
async function rpc(connection, query, args) {
  return (await connection.unsafe(query, args))[0]?.result;
}
async function cleanup() {
  await root.unsafe(
    "delete from public.audit_logs where organization_id=$1 and entity_id in " +
      "(select id from public.orders where organization_id=$1 and idempotency_key=$2)",
    [org, concurrentOrderKey],
  ).catch((cleanupError) => { process.stderr.write("[admin-catalog-commands] fixture cleanup failed: " + String(cleanupError) + "\n"); });
  await root.unsafe(
    "delete from public.outbox_events where aggregate_id in " +
      "(select id from public.orders where organization_id=$1 and idempotency_key=$2)",
    [org, concurrentOrderKey],
  ).catch((cleanupError) => { process.stderr.write("[admin-catalog-commands] fixture cleanup failed: " + String(cleanupError) + "\n"); });
  await root.unsafe(
    "delete from public.order_status_history where order_id in " +
      "(select id from public.orders where organization_id=$1 and idempotency_key=$2)",
    [org, concurrentOrderKey],
  ).catch((cleanupError) => { process.stderr.write("[admin-catalog-commands] fixture cleanup failed: " + String(cleanupError) + "\n"); });
  await root.unsafe(
    "delete from public.order_items where order_id in " +
      "(select id from public.orders where organization_id=$1 and idempotency_key=$2)",
    [org, concurrentOrderKey],
  ).catch((cleanupError) => { process.stderr.write("[admin-catalog-commands] fixture cleanup failed: " + String(cleanupError) + "\n"); });
  await root.unsafe("delete from public.orders where organization_id=$1 and idempotency_key=$2", [org, concurrentOrderKey]).catch((cleanupError) => { process.stderr.write("[admin-catalog-commands] fixture cleanup failed: " + String(cleanupError) + "\n"); });
  await root.unsafe("delete from public.customer_invoices where organization_id=$1 and invoice_number=any($2::text[])", [org, metricsInvoiceNumbers]).catch((cleanupError) => { process.stderr.write("[admin-catalog-commands] fixture cleanup failed: " + String(cleanupError) + "\n"); });
  await root.unsafe("delete from public.products where organization_id=$1 and item_code=$2", [org, metricsUnknownStockCode]).catch((cleanupError) => { process.stderr.write("[admin-catalog-commands] fixture cleanup failed: " + String(cleanupError) + "\n"); });
  await root.unsafe(
    "delete from public.orders where (organization_id=$1 and order_number=any($2::text[])) " +
      "or (organization_id=$3 and order_number=any($4::text[]))",
    [org, metricsOrderNumbers, otherOrg, [metricsForeignOrderNumber]],
  ).catch((cleanupError) => { process.stderr.write("[admin-catalog-commands] fixture cleanup failed: " + String(cleanupError) + "\n"); });
  await root.unsafe(
    "delete from public.audit_logs where organization_id=$1 and entity_id in " +
      "(select id from public.products where organization_id=$1 and item_code = any($2::text[]))",
    [org, paginationCodes],
  ).catch((cleanupError) => { process.stderr.write("[admin-catalog-commands] fixture cleanup failed: " + String(cleanupError) + "\n"); });
  await root.unsafe(
    "delete from public.products where organization_id=$1 and item_code = any($2::text[])",
    [org, paginationCodes],
  ).catch((cleanupError) => { process.stderr.write("[admin-catalog-commands] fixture cleanup failed: " + String(cleanupError) + "\n"); });

  await root.unsafe(
    "delete from public.audit_logs where organization_id=$1 and entity_id in " +
      "(select id from public.products where organization_id=$1 and item_code=$2 " +
      "union all select id from public.categories where organization_id=$1 and name=any($3::text[]))",
    [org, code, [name, renamedName, collisionName]],
  ).catch((cleanupError) => { process.stderr.write("[admin-catalog-commands] fixture cleanup failed: " + String(cleanupError) + "\n"); });
  await root.unsafe(
    "delete from public.audit_logs where organization_id=$1 and entity_id in " +
      "(select id from public.products where organization_id=$1 and item_code=$2 " +
      "union all select id from public.categories where organization_id=$1 and name=$3)",
    [otherOrg, foreignCode, foreignName],
  ).catch((cleanupError) => { process.stderr.write("[admin-catalog-commands] fixture cleanup failed: " + String(cleanupError) + "\n"); });
  await root.unsafe(
    "delete from public.products where (organization_id=$1 and item_code=$2) " +
      "or (organization_id=$3 and item_code=$4)",
    [org, code, otherOrg, foreignCode],
  ).catch((cleanupError) => { process.stderr.write("[admin-catalog-commands] fixture cleanup failed: " + String(cleanupError) + "\n"); });
  await root.unsafe(
    "delete from public.categories where (organization_id=$1 and name=any($2::text[])) " +
      "or (organization_id=$3 and name=$4)",
    [org, [name, renamedName, collisionName], otherOrg, foreignName],
  ).catch((cleanupError) => { process.stderr.write("[admin-catalog-commands] fixture cleanup failed: " + String(cleanupError) + "\n"); });
  await root.unsafe(
    "delete from public.audit_logs where organization_id=$1 and action in ('customer.tier_changed','customer.status_changed') and entity_id in " +
      "(select id from public.customers where organization_id=$1 and customer_code='CI-P1-CATALOG-LOCAL-CUSTOMER')",
    [org],
  ).catch((cleanupError) => { process.stderr.write("[admin-catalog-commands] fixture cleanup failed: " + String(cleanupError) + "\n"); });
  await root.unsafe(
    "delete from public.customers where organization_id=$1 and customer_code='CI-P1-CATALOG-LOCAL-CUSTOMER'",
    [org],
  ).catch((cleanupError) => { process.stderr.write("[admin-catalog-commands] fixture cleanup failed: " + String(cleanupError) + "\n"); });
  await root.unsafe(
    "delete from public.warehouses where organization_id=$1 and name='CI P1 Catalog Local Tenant Warehouse'",
    [org],
  ).catch((cleanupError) => { process.stderr.write("[admin-catalog-commands] fixture cleanup failed: " + String(cleanupError) + "\n"); });
  await root.unsafe(
    "delete from public.profiles where email='ci-p1-foreign-profile@example.test'",
    [],
  ).catch((cleanupError) => { process.stderr.write("[admin-catalog-commands] fixture cleanup failed: " + String(cleanupError) + "\n"); });
  await root.unsafe(
    "delete from public.warehouses where organization_id=$1 and name='CI P1 Cross Tenant Warehouse'",
    [otherOrg],
  ).catch((cleanupError) => { process.stderr.write("[admin-catalog-commands] fixture cleanup failed: " + String(cleanupError) + "\n"); });
  await root.unsafe(
    "delete from public.organizations where id=$1 and name='CI P1 Catalog Foreign Tenant'",
    [otherOrg],
  ).catch((cleanupError) => { process.stderr.write("[admin-catalog-commands] fixture cleanup failed: " + String(cleanupError) + "\n"); });
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
  await root.unsafe(
    "insert into public.inventory_balances(product_id,warehouse_id,quantity_on_hand,quantity_reserved) " +
      "values($1,$2,700,0) on conflict(product_id,warehouse_id) do update " +
      "set quantity_on_hand=excluded.quantity_on_hand,quantity_reserved=excluded.quantity_reserved",
    [foreignProduct, foreignWarehouse],
  );

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

  const tierChange = await rpc(admin,
    "select public.set_admin_customer_tier($1::uuid,$2::text,$3::text,$4::text) result",
    [localCustomer, "retail", "wholesale", "CI test: customer moved to wholesale tier"]);
  assert.deepEqual(
    { customer_id:tierChange.customer_id, previous_tier:tierChange.previous_tier, tier:tierChange.tier, changed:tierChange.changed },
    { customer_id:localCustomer, previous_tier:"retail", tier:"wholesale", changed:true });
  const tierAuditRows=await root.unsafe(
    "select organization_id,actor_id,action,entity_type,entity_id,old_value,new_value from public.audit_logs " +
    "where organization_id=$1 and action='customer.tier_changed' and entity_id=$2",
    [org,localCustomer]);
  assert.equal(tierAuditRows.length,1);
  assert.equal(tierAuditRows[0].organization_id,org);
  assert.equal(tierAuditRows[0].action,"customer.tier_changed");
  assert.equal(tierAuditRows[0].entity_type,"customer");
  assert.equal(tierAuditRows[0].old_value.tier,"retail");
  assert.equal(tierAuditRows[0].new_value.tier,"wholesale");
  assert.equal(tierAuditRows[0].new_value.reason,"CI test: customer moved to wholesale tier");
  assert.ok(tierAuditRows[0].actor_id);

  const tierNoOp=await rpc(admin,
    "select public.set_admin_customer_tier($1::uuid,$2::text,$3::text,$4::text) result",
    [localCustomer,"wholesale","wholesale","CI no-op"]);
  assert.equal(tierNoOp.changed,false);
  const tierAuditCount=await root.unsafe(
    "select count(*)::integer as count from public.audit_logs where action='customer.tier_changed' and entity_id=$1",
    [localCustomer]);
  assert.equal(tierAuditCount[0].count,1);
  await assert.rejects(()=>rpc(admin,
    "select public.set_admin_customer_tier($1::uuid,$2::text,$3::text,$4::text) result",
    [localCustomer,"wholesale","secret","CI invalid tier"]),/tier must be one of/i);
  await assert.rejects(()=>rpc(admin,
    "select public.set_admin_customer_tier($1::uuid,$2::text,$3::text,$4::text) result",
    [localCustomer,"wholesale","vip"," "]),/reason must contain/i);
  await assert.rejects(()=>rpc(admin,
    "select public.set_admin_customer_tier($1::uuid,$2::text,$3::text,$4::text) result",
    [localCustomer,"retail","vip","CI stale expected value"]),/tier changed|stale/i);
  await assert.rejects(()=>rpc(admin,
    "select public.set_admin_customer_tier($1::uuid,$2::text,$3::text,$4::text) result",
    [foreignCustomer,"retail","vip","CI cross tenant"]),/not found in current organization/i);
  await assert.rejects(()=>rpc(customer,
    "select public.set_admin_customer_tier($1::uuid,$2::text,$3::text,$4::text) result",
    [localCustomer,"wholesale","vip","CI customer forbidden"]),/active customer-management permission required/i);
  const customerPrivileges=await root.unsafe(
    "select has_table_privilege('authenticated','public.customers','UPDATE') as table_update, " +
    "has_column_privilege('authenticated','public.customers','tier','UPDATE') as tier_update, " +
    "has_column_privilege('authenticated','public.customers','status','UPDATE') as status_update");
  assert.equal(customerPrivileges[0].table_update,false);
  assert.equal(customerPrivileges[0].tier_update,false);
  assert.equal(customerPrivileges[0].status_update,false, "customer lifecycle status is only writable through the audited RPC");
  await assert.rejects(()=>admin.unsafe("update public.customers set tier='vip' where id=$1",[localCustomer]),/permission denied/i);
  await assert.rejects(()=>admin.unsafe("update public.customers set status='blocked' where id=$1",[localCustomer]),/permission denied/i);

  // PostgreSQL acceptance for customer lifecycle: scoped command, optimistic concurrency,
  // finite transitions, restoration, manager authorization and before/after audit evidence.
  const lifecycleFreeze = await rpc(admin,
    "select public.set_admin_customer_status($1::uuid,$2::text,$3::text,$4::text) result",
    [localCustomer,"approved","frozen","CI lifecycle: temporary account freeze"]);
  assert.deepEqual(
    {customer_id:lifecycleFreeze.customer_id,previous_status:lifecycleFreeze.previous_status,status:lifecycleFreeze.status,changed:lifecycleFreeze.changed},
    {customer_id:localCustomer,previous_status:"approved",status:"frozen",changed:true},
  );

  await assert.rejects(()=>rpc(admin,
    "select public.set_admin_customer_status($1::uuid,$2::text,$3::text,$4::text) result",
    [localCustomer,"frozen","rejected","CI invalid transition"]),
    /invalid customer status transition/i);
  await assert.rejects(()=>rpc(admin,
    "select public.set_admin_customer_status($1::uuid,$2::text,$3::text,$4::text) result",
    [localCustomer,"approved","archived","CI stale expected state"]),
    /customer status changed since directory loaded/i);
  await assert.rejects(()=>rpc(admin,
    "select public.set_admin_customer_status($1::uuid,$2::text,$3::text,$4::text) result",
    [foreignCustomer,"approved","frozen","CI lifecycle cross tenant"]),
    /customer not found in current organization/i);
  await assert.rejects(()=>rpc(customer,
    "select public.set_admin_customer_status($1::uuid,$2::text,$3::text,$4::text) result",
    [localCustomer,"frozen","approved","CI customer cannot administer lifecycle"]),
    /active customer-management permission required to change customer status/i);
  await assert.rejects(()=>rpc(admin,
    "select public.set_admin_customer_status($1::uuid,$2::text,$3::text,$4::text) result",
    [localCustomer,"frozen","approved"," "]),
    /reason must contain between 3 and 500 characters/i);

  const lifecycleArchive = await rpc(admin,
    "select public.set_admin_customer_status($1::uuid,$2::text,$3::text,$4::text) result",
    [localCustomer,"frozen","archived","CI lifecycle: archive after review"]);
  assert.equal(lifecycleArchive.status,"archived");
  const lifecycleRestore = await rpc(admin,
    "select public.set_admin_customer_status($1::uuid,$2::text,$3::text,$4::text) result",
    [localCustomer,"archived","restore","CI lifecycle: restore archived account"]);
  assert.equal(lifecycleRestore.previous_status,"archived");
  assert.equal(lifecycleRestore.status,"frozen",
    "restore returns to the last known non-archived state rather than inventing a default");

  const lifecycleApproval = await rpc(admin,
    "select public.set_admin_customer_status($1::uuid,$2::text,$3::text,$4::text) result",
    [localCustomer,"frozen","approved","CI lifecycle: restore active service"]);
  assert.equal(lifecycleApproval.status,"approved");
  const lifecycleAudit = await root.unsafe(
    "select organization_id,actor_id,action,entity_type,entity_id,old_value,new_value " +
    "from public.audit_logs where organization_id=$1 and action='customer.status_changed' and entity_id=$2 order by created_at,id",
    [org,localCustomer]);
  assert.equal(lifecycleAudit.length,4,"each successful lifecycle transition is audited exactly once");
  assert.ok(lifecycleAudit.every(row => row.organization_id===org && row.action==="customer.status_changed" && row.entity_type==="customer"));
  assert.equal(lifecycleAudit[0].old_value.status,"approved");
  assert.equal(lifecycleAudit[0].new_value.status,"frozen");
  assert.equal(lifecycleAudit[0].new_value.reason,"CI lifecycle: temporary account freeze");
  assert.equal(lifecycleAudit[1].old_value.status,"frozen");
  assert.equal(lifecycleAudit[1].new_value.status,"archived");
  assert.equal(lifecycleAudit[2].old_value.status,"archived");
  assert.equal(lifecycleAudit[2].new_value.status,"frozen");
  assert.equal(lifecycleAudit[2].new_value.restored_from_archive,true);
  assert.equal(lifecycleAudit[3].old_value.status,"frozen");
  assert.equal(lifecycleAudit[3].new_value.status,"approved");
  const foreignLifecycleAudit = await root.unsafe(
    "select id from public.audit_logs where action='customer.status_changed' and entity_id=$1",
    [foreignCustomer]);
  assert.equal(foreignLifecycleAudit.length,0,"a cross-tenant lifecycle command cannot mutate or audit the foreign customer");
  process.stdout.write("PASS customer lifecycle RPC: legal transitions, archive restore, reason/audit, tenant scope, stale state, denied role and no direct status DML\\n");


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

  const renamedCategory = await rpc(
    admin,
    "select public.rename_admin_catalog_category($1::uuid,$2) result",
    [category.id, renamedName],
  );
  assert.equal(renamedCategory.id, category.id);
  assert.equal(renamedCategory.name, renamedName);
  assert.equal(renamedCategory.renamed, true, "a real category rename reports a change");

  const renameNoOp = await rpc(
    admin,
    "select public.rename_admin_catalog_category($1::uuid,$2) result",
    [category.id, "  " + renamedName + "  "],
  );
  assert.equal(renameNoOp.name, renamedName, "server trims category names");
  assert.equal(renameNoOp.renamed, false, "replaying the same rename is an audited no-op without duplicate events");

  const restoredCategory = await rpc(
    admin,
    "select public.rename_admin_catalog_category($1::uuid,$2) result",
    [category.id, name],
  );
  assert.equal(restoredCategory.name, name, "category can be renamed back without changing its stable ID");
  assert.equal(restoredCategory.renamed, true);

  const collisionCategory = await rpc(
    admin,
    "select public.create_admin_catalog_category($1,null,$2) result",
    [collisionName, "CI-COLLISION"],
  );
  assert.ok(collisionCategory.id && collisionCategory.created, "duplicate-name fixture exists");
  await assert.rejects(
    () => rpc(admin, "select public.rename_admin_catalog_category($1::uuid,$2) result", [category.id, collisionName]),
    /same name/i,
    "renaming to an existing active sibling category is rejected",
  );

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

  // The database guard must normalize valid values as well as rejecting blank ones.
  await root.unsafe(
    "update public.products set name=$1,item_code=$2 where id=$3 and organization_id=$4",
    ["  CI product normalized  ", "  " + code + "  ", created.id, org],
  );
  const normalizedRequiredFields = await root.unsafe(
    "select name,item_code from public.products where id=$1 and organization_id=$2",
    [created.id, org],
  );
  assert.deepEqual(
    { name: normalizedRequiredFields[0]?.name, item_code: normalizedRequiredFields[0]?.item_code },
    { name: "CI product normalized", item_code: code },
    "the database guard trims accepted identifiers before persistence",
  );
  await root.unsafe(
    "update public.products set name=$1,item_code=$2 where id=$3 and organization_id=$4",
    ["CI product", code, created.id, org],
  );

  // Required-field invariants must survive requests that bypass the React form.
  await assert.rejects(
    () => root.unsafe("update public.products set name=$1 where id=$2", ["   ", created.id]),
    /product name is required/i,
    "PostgreSQL rejects whitespace-only product names",
  );
  await assert.rejects(
    () => root.unsafe("update public.products set item_code=$1 where id=$2", [" \t ", created.id]),
    /product code is required/i,
    "PostgreSQL rejects whitespace-only item codes",
  );
  const unchangedRequiredFields = await root.unsafe(
    "select name,item_code from public.products where id=$1 and organization_id=$2",
    [created.id, org],
  );
  assert.deepEqual(
    { name: unchangedRequiredFields[0]?.name, item_code: unchangedRequiredFields[0]?.item_code },
    { name: "CI product", item_code: code },
    "rejected writes do not change the previously valid product",
  );
  await assert.rejects(
    () => root.unsafe(
      "insert into public.products(organization_id,name,item_code,unit,status) values($1,$2,$3,'قطعة','active')",
      [org, "  ", "CI-P1-CAT-INVALID-NAME"],
    ),
    /product name is required/i,
    "PostgreSQL rejects direct inserts with a blank product name",
  );
  await assert.rejects(
    () => root.unsafe(
      "insert into public.products(organization_id,name,item_code,unit,status) values($1,$2,$3,'قطعة','active')",
      [org, "CI invalid code product", "  "],
    ),
    /product code is required/i,
    "PostgreSQL rejects direct inserts with a blank product code",
  );
  const invalidProducts = await root.unsafe(
    "select id from public.products where organization_id=$1 and item_code='CI-P1-CAT-INVALID-NAME'",
    [org],
  );
  assert.equal(invalidProducts.length, 0, "a rejected product insert leaves no row");



  const metadataPayload = {
    ...payload,
    expected_base_price: payload.base_price,
    expected_price_wholesale_of_wholesale: payload.price_wholesale_of_wholesale,
    expected_price_wholesale: payload.price_wholesale,
    expected_price_retail: payload.price_retail,
    name_en: "CI product English",
    sku: "CI-P1-SKU-001",
    is_featured: true,
    sort_order: 7,
    min_order_quantity: 2,
    order_quantity_multiple: 2,
  };
  const metadataSave = await rpc(
    admin,
    "select public.save_admin_product_with_metadata($1::uuid,$2::jsonb) result",
    [created.id, admin.json(metadataPayload)],
  );
  assert.equal(metadataSave.id, created.id, "metadata save returns the requested product");
  assert.equal(metadataSave.created, false, "metadata save remains an edit");
  assert.equal(metadataSave.metadata_updated, true, "changed metadata is reported");

  const savedMetadata = await root.unsafe(
    "select name_en,sku,is_featured,sort_order,min_order_quantity,order_quantity_multiple " +
      "from public.products where id=$1 and organization_id=$2",
    [created.id, org],
  );
  assert.deepEqual(savedMetadata[0], {
    name_en: "CI product English",
    sku: "CI-P1-SKU-001",
    is_featured: true,
    sort_order: 7,
    min_order_quantity: 2,
    order_quantity_multiple: 2,
  }, "all supported editable product metadata persists");

  const metadataAudit = await root.unsafe(
    "select organization_id,actor_id,action,entity_type,entity_id,old_value,new_value " +
      "from public.audit_logs where organization_id=$1 and entity_id=$2 " +
      "and action='catalog.product_metadata_updated'",
    [org, created.id],
  );
  assert.equal(metadataAudit.length, 1, "metadata change writes one audit event");
  assert.ok(metadataAudit[0].actor_id, "metadata audit records the authenticated actor");
  assert.equal(metadataAudit[0].action, "catalog.product_metadata_updated");
  assert.equal(metadataAudit[0].old_value.sku, null);
  assert.equal(metadataAudit[0].old_value.is_featured, false);
  assert.equal(metadataAudit[0].new_value.name_en, "CI product English");
  assert.equal(metadataAudit[0].new_value.sku, "CI-P1-SKU-001");
  assert.equal(metadataAudit[0].new_value.min_order_quantity, 2);

  await assert.rejects(
    () => rpc(admin,
      "select public.save_admin_product_with_metadata($1::uuid,$2::jsonb) result",
      [created.id, admin.json({ ...metadataPayload, is_featured: "true" })]),
    /product metadata fields are invalid/i,
    "metadata type failures are rejected before core or metadata mutations",
  );
  const afterRejectedMetadata = await root.unsafe(
    "select name_en,sku,is_featured,sort_order,min_order_quantity,order_quantity_multiple " +
      "from public.products where id=$1 and organization_id=$2",
    [created.id, org],
  );
  assert.deepEqual(afterRejectedMetadata[0], savedMetadata[0],
    "invalid metadata leaves the previously saved row unchanged");

  await assert.rejects(
    () => rpc(admin,
      "select public.save_admin_product_with_metadata($1::uuid,$2::jsonb) result",
      [foreignProduct, admin.json(metadataPayload)]),
    /product not found in organization/i,
    "metadata save cannot address another tenant's product",
  );

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
  const trigramExtensions = await root.unsafe(
    "select n.nspname as schema_name from pg_extension e join pg_namespace n on n.oid=e.extnamespace where e.extname='pg_trgm'",
  );
  const trigramSchema = trigramExtensions[0]?.schema_name;
  assert.ok(["public", "extensions"].includes(trigramSchema),
    "pg_trgm is installed into the actual available extension schema");
  for (const index of searchIndexes) {
    assert.match(index.indexdef, /USING gin/i, "trigram search uses a GIN index");
    assert.match(index.indexdef, /gin_trgm_ops/i, "the index binds the installed pg_trgm operator class");
    assert.match(index.indexdef, /WHERE \(status = 'active'::text\)/i, "the index excludes archived/inactive products");
  }
  const searchableProduct = (await root.unsafe(
    "select name,item_code from public.products where id=$1 and organization_id=$2 and status='active'",
    [created.id, org],
  ))[0];
  assert.ok(searchableProduct?.name && searchableProduct?.item_code,
    "the product has target-native search fields");
  const nameMatch = await root.unsafe(
    `select id from public.products where id=$1 and organization_id=$2 and status='active' and name OPERATOR(${trigramSchema}.%) $3`,
    [created.id, org, searchableProduct.name],
  );
  assert.equal(nameMatch[0]?.id, created.id, "the name trigram operator returns the tenant's active product");
  const itemCodeMatch = await root.unsafe(
    `select id from public.products where id=$1 and organization_id=$2 and status='active' and item_code OPERATOR(${trigramSchema}.%) $3`,
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

  // Four independent authenticated PostgreSQL sessions race the same staff-order idempotency key.
  // Exactly one must create a row; all other callers must replay that same committed order.
  await Promise.all(raceConnections.map((connection) => ident(connection, adminAuth, "admin@aghbari.ye")));
  const raceItems = [{ product_id: created.id, quantity: 2 }];
  const racePayload = (connection) => [
    localCustomer,
    connection.json(raceItems),
    "CI concurrent staff-order idempotency",
    concurrentOrderKey,
    "cash_on_delivery",
  ];
  const raceReplies = await Promise.all(raceConnections.map((connection) => rpc(
    connection,
    "select public.create_staff_order($1::uuid,$2::jsonb,$3,$4,$5) result",
    racePayload(connection),
  )));
  assert.equal(raceReplies.length, 4);
  assert.ok(raceReplies.every((reply) => reply.id === raceReplies[0].id),
    "all four concurrent callers must return the same order UUID");
  assert.equal(raceReplies.filter((reply) => reply.idempotent_replay === false).length, 1,
    "exactly one concurrent caller creates the order");
  assert.equal(raceReplies.filter((reply) => reply.idempotent_replay === true).length, 3,
    "the other three concurrent callers replay the committed order");
  const racedOrderCount = await root.unsafe(
    "select count(*)::int as count from public.orders where organization_id=$1 and created_by=$2 and idempotency_key=$3",
    [org, adminProfileId, concurrentOrderKey],
  );
  assert.equal(racedOrderCount[0].count, 1,
    "concurrent same-key RPC calls persist exactly one order in the organization");
  const racedItems = await root.unsafe(
    "select count(*)::int as count,coalesce(sum(oi.quantity),0)::numeric as quantity " +
      "from public.order_items oi where oi.order_id=$1",
    [raceReplies[0].id],
  );
  assert.equal(racedItems[0].count, 1, "concurrent replay must not duplicate order items");
  assert.equal(Number(racedItems[0].quantity), 2, "the persisted single order retains a valid MOQ quantity");
  await assert.rejects(
    () => rpc(
      raceConnections[0],
      "select public.create_staff_order($1::uuid,$2::jsonb,$3,$4,$5) result",
      [localCustomer, raceConnections[0].json([{ product_id: created.id, quantity: 4 }]),
        "CI concurrent staff-order idempotency", concurrentOrderKey, "cash_on_delivery"],
    ),
    /idempotency key was already used for a different order payload/i,
    "same-key different payload must be rejected after the race",
  );
  process.stdout.write("PASS PostgreSQL order concurrency: four independent sessions, one order, three idempotent replays, one item set, conflicting payload rejected\\n");

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
    () => rpc(admin, "select public.rename_admin_catalog_category($1::uuid,$2) result", [foreignCategory, "Tenant theft"]),
    /category not found in organization/i,
    "a category in a different tenant cannot be renamed",
  );

  await assert.rejects(
    () => rpc(customer, "select public.create_admin_catalog_category($1,null,null) result", ["no access"]),
    /active admin or manager profile required/i,
    "customer cannot run staff category commands",
  );
  await assert.rejects(
    () => rpc(customer, "select public.rename_admin_catalog_category($1::uuid,$2) result", [category.id, "no access"]),
    /active admin or manager profile required/i,
    "customer cannot rename categories",
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
    () => admin.unsafe("update public.categories set name='direct rename forbidden' where id=$1", [category.id]),
    /permission denied/i,
    "direct category rename is denied; use the audited category RPC",
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
  await assert.rejects(
    () => rpc(admin, "select public.rename_admin_catalog_category($1::uuid,$2) result", [category.id, "Archived name"]),
    /archived category cannot be renamed/i,
    "archived categories cannot be renamed",
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
    "catalog.category_renamed",
    "catalog.category_archived",
  ]) {
    assert.ok(actions.has(action), "missing audit action: " + action);
  }
  assert.ok(auditRows.length >= 6, "expected a full product/category audit trail");
  assert.ok(actor && auditRows.every((row) => row.actor_id === actor), "audit rows retain the authenticated profile identity");


  // Target-native finance parity: metrics aggregate only the authenticated profile's organization.
  // A live product without a balance row must keep the aggregate stock unknown.
  await root.unsafe("insert into public.products(organization_id,name,item_code,unit,status) values($1,'CI P1 Metrics Unknown Stock',$2,'bundle','active')", [org, metricsUnknownStockCode]);

  const metricsBeforeRows = await admin.unsafe("select * from public.get_staff_dashboard_metrics()");
  assert.equal(metricsBeforeRows.length, 1, "dashboard metrics return exactly one tenant-scoped row");
  await root.unsafe(
    "insert into public.orders(organization_id,customer_id,order_number,status,total_amount) " +
      "select $1,$2,fixture.order_number,fixture.status,fixture.total_amount " +
      "from unnest($3::text[],$4::text[],$5::numeric[]) as fixture(order_number,status,total_amount)",
    [org, localCustomer, metricsOrderNumbers,
      ["pending","confirmed","processing","shipped","delivered","cancelled"], [1,2,3,4,6,7]],
  );
  await root.unsafe("insert into public.customer_invoices(organization_id,customer_id,order_id,invoice_number,status,currency,subtotal,tax_amount,total_amount) " + "values($1,$2,(select id from public.orders where organization_id=$1 and order_number=$3),$4,'issued',$5,$6,0,$6)",
    [org, localCustomer, metricsOrderNumbers[0], metricsInvoiceNumbers[0], "YER", 100]);
  await root.unsafe("insert into public.customer_invoices(organization_id,customer_id,order_id,invoice_number,status,currency,subtotal,tax_amount,total_amount) " + "values($1,$2,(select id from public.orders where organization_id=$1 and order_number=$3),$4,'issued',$5,$6,0,$6)",
    [org, localCustomer, metricsOrderNumbers[1], metricsInvoiceNumbers[1], "USD", 200]);
  await root.unsafe(
    "insert into public.orders(organization_id,customer_id,order_number,status,total_amount) " +
      "values($1,$2,$3,'delivered',800)",
    [otherOrg, foreignCustomer, metricsForeignOrderNumber],
  );
  const metricsAfterRows = await admin.unsafe("select * from public.get_staff_dashboard_metrics()");
  assert.equal(metricsAfterRows.length, 1, "dashboard metrics remain available after seeded movements");
  const metricsBefore = metricsBeforeRows[0];
  const metricsAfter = metricsAfterRows[0];
  assert.equal(Number(metricsAfter.orders_total)-Number(metricsBefore.orders_total), 6,
    "orders_total changes only for the six rows created inside this organization");
  for (const [key, label] of [
    ["orders_pending","pending orders"],
    ["orders_confirmed","confirmed orders"],
    ["orders_preparing","processing/preparing orders"],
    ["orders_ready","shipped/ready orders"],
    ["orders_completed","delivered/completed orders"],
    ["orders_cancelled","cancelled orders"],
  ]) {
    assert.equal(Number(metricsAfter[key])-Number(metricsBefore[key]), 1,
      label + " metric maps the target state machine to the legacy dashboard contract");
  }
  assert.equal(Number(metricsAfter.completed_sales)-Number(metricsBefore.completed_sales), 6,
    "completed sales include the local delivered order but exclude the foreign tenant's 800-unit order");

  const expectedMetricsRows = await root.unsafe(
    `WITH stock_rows AS (
       SELECT p.unit,ib.id AS balance_id,ib.quantity_available
       FROM public.products p
       JOIN public.warehouses w ON w.organization_id=p.organization_id AND w.is_active=true
       LEFT JOIN public.inventory_balances ib ON ib.product_id=p.id AND ib.warehouse_id=w.id
       WHERE p.organization_id=$1 AND p.status='active'
     ),
     stock_rollup AS (
       SELECT CASE
         WHEN NOT EXISTS(SELECT 1 FROM public.products p WHERE p.organization_id=$1 AND p.status='active') THEN 0::numeric
         WHEN NOT EXISTS(SELECT 1 FROM public.warehouses w WHERE w.organization_id=$1 AND w.is_active=true) THEN NULL::numeric
         WHEN count(*) FILTER(WHERE sr.balance_id IS NULL)>0 THEN NULL::numeric
         WHEN count(DISTINCT sr.unit)>1 THEN NULL::numeric
         ELSE coalesce(sum(sr.quantity_available),0)::numeric
       END AS available_stock FROM stock_rows sr
     ),
     invoice_balances AS (
       SELECT i.id,i.currency,greatest(i.total_amount-coalesce(sum(cp.amount),0),0)::numeric AS outstanding
       FROM public.customer_invoices i
       LEFT JOIN public.customer_payments cp ON cp.invoice_id=i.id AND cp.organization_id=i.organization_id
       WHERE i.organization_id=$1 AND i.status<>'void'
       GROUP BY i.id,i.currency,i.total_amount
     ),
     receivables_rollup AS (
       SELECT CASE WHEN count(DISTINCT ib.currency) FILTER(WHERE ib.outstanding>0)>1
         THEN NULL::numeric ELSE coalesce(sum(ib.outstanding),0)::numeric END AS receivables_issued
       FROM invoice_balances ib
     )
     SELECT
       (SELECT count(*)::bigint FROM public.customers c WHERE c.organization_id=$1 AND c.status='approved') AS active_customers,
       (SELECT count(*)::bigint FROM public.products p WHERE p.organization_id=$1 AND p.status='active') AS active_products,
       (SELECT coalesce(sum(o.total_amount),0)::numeric FROM public.orders o WHERE o.organization_id=$1 AND o.status IN ('delivered','completed')) AS completed_sales,
       (SELECT available_stock FROM stock_rollup) AS available_stock,
       (SELECT receivables_issued FROM receivables_rollup) AS receivables_issued`,
    [org],
  );
  assert.equal(Number(metricsAfter.active_customers), Number(expectedMetricsRows[0].active_customers),
    "active customers count only approved customers in the current organization");
  assert.equal(Number(metricsAfter.active_products), Number(expectedMetricsRows[0].active_products),
    "active products count only current-organization active catalog rows");
  assert.equal(Number(metricsAfter.completed_sales), Number(expectedMetricsRows[0].completed_sales),
    "completed sales match organization-scoped delivered/completed order source amounts");
  assert.equal(metricsAfter.available_stock === null ? null : Number(metricsAfter.available_stock),
    expectedMetricsRows[0].available_stock === null ? null : Number(expectedMetricsRows[0].available_stock),
    "stock summary follows current organization coverage and avoids adding unlike units or treating missing balances as zero");
  assert.equal(metricsAfter.receivables_issued === null ? null : Number(metricsAfter.receivables_issued),
    expectedMetricsRows[0].receivables_issued === null ? null : Number(expectedMetricsRows[0].receivables_issued),
    "receivables are computed from invoice minus recorded payments and never add unlike currencies");
  assert.equal(metricsAfter.available_stock, null, "missing warehouse balance is unknown, never zero");
  assert.equal(metricsAfter.receivables_issued, null, "positive YER and USD invoice balances are not combined");
  await assert.rejects(
    () => customer.unsafe("select * from public.get_staff_dashboard_metrics()"),
    /active same-organization staff or finance permission required/i,
    "a customer without the staff/finance boundary cannot read organization dashboard metrics",
  );

  await runOrderInputHardeningAcceptance({
    root, admin, customer, org, adminAuth, customerAuth, foreignProduct,
  });

  // The nested acceptance helper resets SET ROLE on shared connections. Re-establish the
  // authenticated JWT/session before any following RLS assertions; never probe with postgres.
  await ident(admin, adminAuth, "admin@aghbari.ye");
  await ident(customer, customerAuth, "customer@example.test");

  // Prove the dedicated customer_manager role gets a server-scoped, non-financial directory,
  // can run only the audited customer commands, and cannot read the base table or manage staff roles.
  const managerProfileId = (await root.unsafe(
    "select id from public.profiles where auth_user_id=$1 and organization_id=$2 and is_active=true",
    [adminAuth, org],
  ))[0]?.id;
  assert.ok(managerProfileId, "CI customer-manager fixture profile must exist in the active organization");
  const originalManagerRoles = await root.unsafe(
    "select role from public.user_roles where profile_id=$1 order by role",
    [managerProfileId],
  );
  assert.ok(originalManagerRoles.some((entry) => entry.role === "admin"),
    "the fixture account must begin with its administrator role");
  try {
    await root.unsafe("delete from public.user_roles where profile_id=$1", [managerProfileId]);
    await root.unsafe(
      "insert into public.user_roles(profile_id,role) values($1,'customer_manager')",
      [managerProfileId],
    );
    await root.unsafe(
      "update public.customers set current_balance=1234.56,credit_limit=7890.12 where id=$1 and organization_id=$2",
      [localCustomer, org],
    );

    const managerDirectory = await rpc(
      admin,
      "select public.fetch_customer_manager_directory($1::text,$2::integer,$3::integer) result",
      ["", 1, 25],
    );
    assert.equal(managerDirectory.page, 1);
    assert.equal(managerDirectory.page_size, 25);
    assert.ok(managerDirectory.total_count >= 1);
    const localManagerRow = managerDirectory.rows.find((row) => row.id === localCustomer);
    assert.ok(localManagerRow, "customer_manager can read an in-tenant customer");
    assert.deepEqual(
      Object.keys(localManagerRow).sort(),
      ["id","business_name","contact_name","phone","email","customer_code","tier","status","created_at"].sort(),
      "customer-manager RPC contract must return only approved non-financial fields",
    );
    assert.equal(managerDirectory.rows.some((row) => row.id === foreignCustomer), false,
      "customer-manager directory must not expose another organization's customer");
    // Re-establish authenticated role after the directory RPC before probing row visibility;
    // the nested acceptance helper may reset session role on the shared client.
    await ident(admin, adminAuth, "admin@aghbari.ye");
    // Pin the exact role and RLS evaluation context so a privileged connection cannot
    // accidentally make this an ineffective authorization test.
    const managerSecurityContext = (await admin.unsafe(
      "select auth.uid()::text as auth_user_id, public.current_profile_id()::text as profile_id, " +
      "public.is_staff() as is_staff, public.current_customer_id()::text as current_customer_id, " +
      "current_user as database_role, current_setting('row_security') as row_security",
    ))[0];
    assert.equal(managerSecurityContext.auth_user_id, adminAuth,
      "security probe must execute as the intended customer-manager identity");
    assert.equal(managerSecurityContext.profile_id, managerProfileId,
      "security probe must resolve the expected customer-manager profile");
    assert.equal(managerSecurityContext.database_role, "authenticated",
      "security probe must not run as postgres/service_role or bypass RLS");
    assert.equal(managerSecurityContext.is_staff, false,
      "customer_manager must not inherit the broad staff permission");
    assert.notEqual(managerSecurityContext.current_customer_id, localCustomer,
      "unlinked CI customer must not be the manager's own customer record");

    // Table-level SELECT grants are evaluated together with RLS; test actual row visibility
    // instead of assuming has_table_privilege=false. Explicit privilege denial or zero visible
    // rows is acceptable, but returning even one finance-bearing row is a hard failure.
    async function assertNoFinancialRows(connection, label) {
      let rows;
      try {
        rows = await connection.unsafe(
          "select current_balance,credit_limit from public.customers where id=$1",
          [localCustomer],
        );
      } catch (error) {
        assert.match(
          String(error),
          /permission denied|insufficient privilege|42501/i,
          label + " may only reject the query for an authorization reason",
        );
        return;
      }
      assert.equal(rows.length, 0, label + " must not expose financial columns for an unlinked customer");
    }
    await assertNoFinancialRows(admin, "customer_manager direct financial read");
    await assertNoFinancialRows(customer, "ordinary customer direct financial read");
    await assert.rejects(
      () => rpc(customer,
        "select public.fetch_customer_manager_directory($1::text,$2::integer,$3::integer) result",
        ["", 1, 25]),
      /active customer-management permission required/i,
      "ordinary customer cannot invoke the manager-only directory RPC",
    );

    const managerTierChange = await rpc(
      admin,
      "select public.set_admin_customer_tier($1::uuid,$2::text,$3::text,$4::text) result",
      [localCustomer, "wholesale", "vip", "CI customer-manager authorized tier change"],
    );
    assert.equal(managerTierChange.changed, true,
      "customer_manager may change tier only through the audited command RPC");
    assert.equal(managerTierChange.tier, "vip");
    await assert.rejects(
      () => rpc(admin,
        "select public.set_admin_customer_tier($1::uuid,$2::text,$3::text,$4::text) result",
        [foreignCustomer, "retail", "vip", "CI customer-manager cross tenant denial"]),
      /not found in current organization/i,
      "customer_manager cannot mutate a customer from another organization",
    );
    await assert.rejects(
      () => rpc(admin,
        "select public.set_organization_user_roles($1::uuid,$2::text[]) result",
        [managerProfileId, ["admin"]]),
      /admin role required/i,
      "customer_manager cannot grant administrator or staff roles",
    );
    const managerAudit = await root.unsafe(
      "select actor_id,organization_id,old_value,new_value from public.audit_logs " +
      "where action='customer.tier_changed' and entity_id=$1 and organization_id=$2 " +
      "and new_value->>'reason'='CI customer-manager authorized tier change'",
      [localCustomer, org],
    );
    assert.equal(managerAudit.length, 1,
      "customer-manager tier changes are tenant-scoped and audited exactly once");
    assert.equal(managerAudit[0].actor_id, managerProfileId);
    assert.equal(managerAudit[0].old_value.tier, "wholesale");
    assert.equal(managerAudit[0].new_value.tier, "vip");
    logInfo("PASS customer_manager security: non-financial RPC allowlist, tenant isolation, direct financial-read denial, audited authorized command, ordinary-user denial, and role-administration denial");
  } finally {
    await root.unsafe("delete from public.user_roles where profile_id=$1", [managerProfileId]);
    for (const entry of originalManagerRoles) {
      await root.unsafe(
        "insert into public.user_roles(profile_id,role) values($1,$2) on conflict(profile_id,role) do nothing",
        [managerProfileId, entry.role],
      );
    }
  }

  await admin.unsafe("reset role");
  await customer.unsafe("reset role");
  await cleanup();
  logInfo(
    "PASS admin catalog + finance dashboard: category create/rename/no-op/duplicate/archive, strict price writes, audit/RBAC/tenant/DML boundaries, dashboard KPI mapping, finance aggregates and unknown-stock/multi-currency safety",
  );
}

try {
  await main();
} catch (error) {
  logError("ADMIN_CATALOG_COMMANDS_FAILED", error);
  process.exitCode = 1;
} finally {
  for (const connection of [admin, customer, ...raceConnections]) {
    try {
      await runCriticalCleanup("admin-catalog-commands", [
        { name: "RESET ROLE", run: () => connection.unsafe("RESET ROLE") },
      ], (message, error) => logError(message, error));
    } catch {
      process.exitCode = 1;
    } finally {
      try { await connection.end({ timeout: 5 }); }
      catch (closeError) {
        logError("[admin-catalog-commands] connection close failed", closeError);
        process.exitCode = 1;
      }
    }
  }
  try { await cleanup(); } catch (error) {
    logError("catalog cleanup failed", error);
    process.exitCode = 1;
  }
  await root.end();
}
