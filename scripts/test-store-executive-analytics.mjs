import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import postgres from "postgres";

const connectionString = process.env.TEST_DATABASE_URL;
if (!connectionString) throw new Error("TEST_DATABASE_URL is required for isolated PostgreSQL 17 analytics acceptance.");

const db = postgres(connectionString, { max: 1, prepare: false, idle_timeout: 5 });
let transactionOpen = false;

async function setIdentity(authUserId, email) {
  await db.unsafe("select set_config('request.jwt.claim.sub',$1,false)", [authUserId]);
  await db.unsafe("select set_config('request.jwt.claims',$1,false)", [
    JSON.stringify({
      sub: authUserId,
      email,
      email_confirmed_at: new Date().toISOString(),
      role: "authenticated",
      session_id: authUserId,
    }),
  ]);
  await db.unsafe("set role authenticated");
}

async function insertCustomer(organizationId, code, businessName, contactName) {
  const rows = await db.unsafe(
    "insert into public.customers(organization_id,customer_code,business_name,contact_name,status,tier) " +
      "values($1::uuid,$2::text,$3::text,$4::text,'approved','retail') returning id",
    [organizationId, code, businessName, contactName],
  );
  return rows[0].id;
}

async function insertProduct(organizationId, categoryId, code, name) {
  const rows = await db.unsafe(
    "insert into public.products(organization_id,category_id,name,item_code,unit,status) " +
      "values($1::uuid,$2::uuid,$3::text,$4::text,'قطعة','active') returning id",
    [organizationId, categoryId, name, code],
  );
  return rows[0].id;
}

async function insertOrder(organizationId, customerId, orderNumber, status, amount, day, totalItems = 1) {
  const rows = await db.unsafe(
    "insert into public.orders(organization_id,customer_id,order_number,status,total_amount,created_at,updated_at,total_items) " +
      "values($1::uuid,$2::uuid,$3::text,$4::text,$5::numeric,($6::date + time '12:00'),now(),$7::integer) returning id",
    [organizationId, customerId, orderNumber, status, amount, day, totalItems],
  );
  return rows[0].id;
}

async function insertItem(orderId, productId, itemCode, productName, quantity, unitPrice, lineTotal) {
  await db.unsafe(
    "insert into public.order_items(order_id,product_id,item_code,product_name_snapshot,unit_snapshot,quantity,unit_price_snapshot,line_total) " +
      "values($1::uuid,$2::uuid,$3::text,$4::text,'قطعة',$5::numeric,$6::numeric,$7::numeric)",
    [orderId, productId, itemCode, productName, quantity, unitPrice, lineTotal],
  );
}

async function main() {
  await db.unsafe("begin");
  transactionOpen = true;

  const ids = {
    organization: randomUUID(),
    foreignOrganization: randomUUID(),
    authUser: randomUUID(),
    profile: randomUUID(),
    category: randomUUID(),
  };
  const suffix = randomUUID().replaceAll("-", "").slice(0, 10);
  const email = "ci-executive-analytics-" + suffix + "@example.test";
  const customerACode = "CI-ANALYTICS-CUST-A-" + suffix;
  const customerBCode = "CI-ANALYTICS-CUST-B-" + suffix;
  const foreignCustomerCode = "CI-ANALYTICS-CUST-X-" + suffix;
  const productACode = "CI-ANALYTICS-ITEM-A-" + suffix;
  const productBCode = "CI-ANALYTICS-ITEM-B-" + suffix;
  const foreignProductCode = "CI-ANALYTICS-ITEM-X-" + suffix;
  const orderPrefix = "CI-EXEC-ANALYTICS-" + suffix + "-";
  const customerAName = "CI Analytics Customer A " + suffix;
  const customerBName = "CI Analytics Customer B " + suffix;
  const foreignCustomerName = "CI Foreign Analytics Customer " + suffix;
  const productAName = "CI Analytics Product A " + suffix;
  const productBName = "CI Analytics Product B " + suffix;
  const foreignProductName = "CI Foreign Analytics Product " + suffix;

  await db.unsafe(
    "insert into public.organizations(id,name,currency,is_active) values($1::uuid,$2::text,'YER',true)",
    [ids.organization, "CI Executive Analytics " + suffix],
  );
  await db.unsafe(
    "insert into public.organizations(id,name,currency,is_active) values($1::uuid,$2::text,'YER',true)",
    [ids.foreignOrganization, "CI Executive Analytics Foreign " + suffix],
  );
  await db.unsafe(
    "insert into auth.users(id,email,email_confirmed_at) values($1::uuid,$2::text,now())",
    [ids.authUser, email],
  );
  await db.unsafe(
    "insert into public.profiles(id,auth_user_id,organization_id,full_name,email,is_active) " +
      "values($1::uuid,$2::uuid,$3::uuid,$4::text,$5::text,true)",
    [ids.profile, ids.authUser, ids.organization, "CI Executive Analytics Staff", email],
  );
  await db.unsafe(
    "insert into public.user_roles(profile_id,role) values($1::uuid,'admin')",
    [ids.profile],
  );
  await db.unsafe(
    "insert into public.categories(id,organization_id,name,code,is_active) " +
      "values($1::uuid,$2::uuid,$3::text,$4::text,true)",
    [ids.category, ids.organization, "CI Executive Analytics", "CI-EXEC-ANALYTICS-" + suffix],
  );

  const customerA = await insertCustomer(ids.organization, customerACode, customerAName, "Contact A");
  const customerB = await insertCustomer(ids.organization, customerBCode, customerBName, "Contact B");
  const foreignCustomer = await insertCustomer(ids.foreignOrganization, foreignCustomerCode, foreignCustomerName, "Foreign Contact");
  const productA = await insertProduct(ids.organization, ids.category, productACode, productAName);
  const productB = await insertProduct(ids.organization, ids.category, productBCode, productBName);
  const foreignCategory = (await db.unsafe(
    "insert into public.categories(organization_id,name,code,is_active) values($1::uuid,$2::text,$3::text,true) returning id",
    [ids.foreignOrganization, "CI Foreign Analytics", "CI-EXEC-FOREIGN-" + suffix],
  ))[0].id;
  const foreignProduct = await insertProduct(ids.foreignOrganization, foreignCategory, foreignProductCode, foreignProductName);

  const dates = (await db.unsafe(
    "select current_date::text as today, (current_date - 29)::text as first_in_window, " +
      "(current_date - 30)::text as outside_window, (current_date - 2)::text as recent_day, " +
      "(current_date - 1)::text as cancelled_day",
  ))[0];

  // Inclusive 30-calendar-day window: the day at current_date - 29 is included, -30 is not.
  const firstWindowOrder = await insertOrder(ids.organization, customerA, orderPrefix + "WINDOW", "delivered", 100, dates.first_in_window);
  await insertItem(firstWindowOrder, productA, productACode, productAName, 2, 50, 100);

  const recentOrder = await insertOrder(ids.organization, customerB, orderPrefix + "RECENT", "pending", 50, dates.recent_day);
  await insertItem(recentOrder, productB, productBCode, productBName, 5, 10, 50);

  // Cancelled revenue and item lines must never enter eligible-sales, trend, top-product, or top-customer totals.
  const cancelledOrder = await insertOrder(ids.organization, customerA, orderPrefix + "CANCELLED", "cancelled", 999, dates.cancelled_day);
  await insertItem(cancelledOrder, productA, productACode, productAName, 99, 10, 999);

  const outsideOrder = await insertOrder(ids.organization, customerA, orderPrefix + "OUTSIDE", "delivered", 25, dates.outside_window);
  await insertItem(outsideOrder, productA, productACode, productAName, 1, 25, 25);

  const foreignOrder = await insertOrder(ids.foreignOrganization, foreignCustomer, orderPrefix + "FOREIGN", "delivered", 888, dates.today);
  await insertItem(foreignOrder, foreignProduct, foreignProductCode, foreignProductName, 8, 111, 888);

  const privilege = (await db.unsafe(
    "select has_function_privilege('anon','public.get_store_executive_analytics()','EXECUTE') as anon_can_execute, " +
      "has_function_privilege('authenticated','public.get_store_executive_analytics()','EXECUTE') as authenticated_can_execute",
  ))[0];
  assert.equal(privilege.anon_can_execute, false, "anonymous callers must not execute store executive analytics");
  assert.equal(privilege.authenticated_can_execute, true, "authenticated callers may execute the guarded RPC");

  await setIdentity(ids.authUser, email);
  const rpcRows = await db.unsafe("select public.get_store_executive_analytics() as result");
  assert.equal(rpcRows.length, 1);
  const result = rpcRows[0].result;
  assert.ok(result && typeof result === "object", "executive analytics returns JSON");
  assert.ok(Number.isFinite(Date.parse(result.generated_at)), "generated_at must be a parseable timestamp");

  assert.equal(result.kpis.total_orders, 4, "total orders include all local statuses, but never foreign-tenant orders");
  assert.equal(result.kpis.eligible_sales, 175, "eligible sales include historical valid orders and exclude cancelled orders");
  assert.equal(result.kpis.pending_orders, 1, "pending count follows the current workflow status set");
  assert.equal(result.kpis.orders_last_30_days, 2, "recent orders obey the inclusive 30-day date window and exclude cancelled orders");
  assert.equal(result.kpis.sales_last_30_days, 150, "recent sales exclude cancelled and out-of-window orders");
  assert.equal(result.kpis.customers_last_30_days, 2, "recent-customer count is distinct and tenant-scoped");
  assert.equal(result.kpis.active_products, 2, "active product count is tenant-scoped");

  assert.equal(result.sales_trend.length, 30, "trend must contain each of the 30 calendar days");
  const trendDays = result.sales_trend.map((row) => row.day);
  assert.deepEqual(trendDays, [...trendDays].sort(), "trend dates must be chronological and stable");
  const firstDay = result.sales_trend.find((row) => row.day === dates.first_in_window);
  const recentDay = result.sales_trend.find((row) => row.day === dates.recent_day);
  const cancelledDay = result.sales_trend.find((row) => row.day === dates.cancelled_day);
  const outsideDay = result.sales_trend.find((row) => row.day === dates.outside_window);
  assert.deepEqual({ orders: firstDay.orders, sales: firstDay.sales }, { orders: 1, sales: 100 });
  assert.deepEqual({ orders: recentDay.orders, sales: recentDay.sales }, { orders: 1, sales: 50 });
  assert.deepEqual({ orders: cancelledDay.orders, sales: cancelledDay.sales }, { orders: 0, sales: 0 });
  assert.deepEqual({ orders: outsideDay.orders, sales: outsideDay.sales }, { orders: 0, sales: 0 });
  assert.equal(result.sales_trend.reduce((sum, row) => sum + row.sales, 0), 150,
    "trend total must reconcile to 30-day eligible sales");
  assert.equal(result.sales_trend.reduce((sum, row) => sum + row.orders, 0), 2,
    "trend order count must reconcile to 30-day eligible order count");

  const rankedProductA = result.top_products.find((row) => row.item_code === productACode);
  const rankedProductB = result.top_products.find((row) => row.item_code === productBCode);
  assert.ok(rankedProductA, "tenant top products include the product with highest eligible sales");
  assert.equal(rankedProductA.product_name, productAName, "product names come from saved order snapshots");
  assert.equal(rankedProductA.quantity, 3, "cancelled order quantities do not inflate product rankings");
  assert.equal(rankedProductA.sales, 125, "top-product sales reconcile all-time eligible order lines");
  assert.ok(rankedProductB, "second tenant product is represented");
  assert.equal(rankedProductB.quantity, 5);
  assert.equal(rankedProductB.sales, 50);
  assert.ok(!result.top_products.some((row) => row.item_code === foreignProductCode),
    "foreign-tenant products must not appear in the analytics payload");

  const rankedCustomerA = result.top_customers.find((row) => row.customer_id === customerA);
  const rankedCustomerB = result.top_customers.find((row) => row.customer_id === customerB);
  assert.ok(rankedCustomerA, "top customers must use existing customer-table columns and local orders");
  assert.equal(rankedCustomerA.customer_name, customerAName, "customer label uses business_name from the current schema");
  assert.equal(rankedCustomerA.order_count, 2);
  assert.equal(rankedCustomerA.sales, 125);
  assert.ok(rankedCustomerB, "second local customer appears in top customers");
  assert.equal(rankedCustomerB.customer_name, customerBName);
  assert.equal(rankedCustomerB.order_count, 1);
  assert.equal(rankedCustomerB.sales, 50);
  assert.ok(!result.top_customers.some((row) => row.customer_id === foreignCustomer),
    "foreign-tenant customer IDs must never appear in the analytics payload");

  await db.unsafe("reset role");
  await db.unsafe("delete from public.user_roles where profile_id=$1::uuid", [ids.profile]);
  await db.unsafe("insert into public.user_roles(profile_id,role) values($1::uuid,'customer')", [ids.profile]);
  await setIdentity(ids.authUser, email);
  let customerDenied = false;
  await db.unsafe("savepoint before_customer_denial");
  try {
    await db.unsafe("select public.get_store_executive_analytics()");
  } catch (error) {
    customerDenied = error?.code === "42501";
    if (!customerDenied) throw error;
    // A PostgreSQL statement error aborts the transaction until it is rolled back to a savepoint.
    await db.unsafe("rollback to savepoint before_customer_denial");
  } finally {
    await db.unsafe("release savepoint before_customer_denial");
  }
  assert.equal(customerDenied, true, "customer-role callers must be denied the executive analytics RPC");
  await db.unsafe("reset role");

  console.log("PASS tenant-scoped executive analytics; exact 30-day boundaries; cancellation exclusions; order/item/customer aggregates; role denial");
}

try {
  await main();
} finally {
  if (transactionOpen) await db.unsafe("rollback").catch(() => {});
  await db.end({ timeout: 5 });
}
