import assert from "node:assert/strict";

const customerProfileId = "f1111111-1111-4111-8111-111111111111";
const activeProductId = "a1000000-0000-0000-0000-000000000001";
const inactiveItemCode = "CI-P1-ORDER-INACTIVE-001";

async function setIdentity(connection, authUserId, email) {
  await connection.unsafe("reset role").catch(() => {});
  await connection.unsafe("insert into auth.sessions(id,user_id,created_at,updated_at,refreshed_at,not_after,user_agent,ip) values($1,$2,now(),now(),now(),null,'CI isolated session','127.0.0.1'::inet) on conflict(id) do update set user_id=excluded.user_id,updated_at=now(),refreshed_at=now(),not_after=null", [authUserId, authUserId]);
  await connection.unsafe("select set_config('request.jwt.claim.sub',$1,false)", [authUserId]);
  await connection.unsafe("select set_config('request.jwt.claims',$1,false)", [
    JSON.stringify({ sub: authUserId, email, email_confirmed_at: new Date().toISOString(), role: "authenticated", session_id: authUserId }),
  ]);
  await connection.unsafe("set role authenticated");
}

async function expectRejected(label, operation, pattern) {
  let caught;
  try {
    await operation();
  } catch (error) {
    caught = error;
  }
  assert.ok(caught, label + " must be rejected");
  if (pattern) {
    assert.match(String(caught.message), pattern, label + " must fail at the intended validation boundary");
  }
}

export async function runOrderInputHardeningAcceptance({
  root, admin, customer, org, adminAuth, customerAuth, foreignProduct,
}) {
  const customerKeys = [];
  const staffKeys = [];
  let inactiveProductId = null;
  let addressId = null;

  const customerKey = (suffix) => {
    const value = "ci-p1-order-input-customer-" + suffix;
    customerKeys.push(value);
    return value;
  };
  const staffKey = (suffix) => {
    const value = "ci-p1-order-input-staff-" + suffix;
    staffKeys.push(value);
    return value;
  };

  const customerQuery =
    "select public.submit_customer_order($1::jsonb,$2,$3,$4,$5,$6,$7,$8::uuid) result";
  const staffQuery =
    "select public.create_staff_order($1::uuid,$2::jsonb,$3,$4,$5) result";
  const itemsFor = (productId, quantity) => [{ product_id: productId, quantity }];

  async function customerAttempt(items, key, terms = "cash_on_delivery") {
    return customer.unsafe(customerQuery, [
      customer.json(items),
      "CI order-input hardening",
      "CI Company One",
      "CI Customer One",
      "7771111111",
      terms,
      key,
      addressId,
    ]);
  }
  async function staffAttempt(customerId, items, key, terms = "cash_on_delivery") {
    return admin.unsafe(staffQuery, [
      customerId,
      admin.json(items),
      "CI order-input hardening",
      key,
      terms,
    ]);
  }

  try {
    await root.unsafe(
      "delete from public.products where organization_id=$1 and item_code=$2",
      [org, inactiveItemCode],
    );
    const inactive = await root.unsafe(
      "insert into public.products(organization_id,name,item_code,unit,base_price,status) " +
        "values($1,'CI inactive order product',$2,'قطعة',1,'inactive') returning id",
      [org, inactiveItemCode],
    );
    inactiveProductId = inactive[0].id;

    const customerRows = await root.unsafe(
      "select id from public.customers where organization_id=$1 and profile_id=$2 and status='approved' limit 1",
      [org, customerProfileId],
    );
    assert.equal(customerRows.length, 1, "order input acceptance requires the existing approved CI customer");
    const staffCustomerId = customerRows[0].id;

    const addresses = await root.unsafe(
      "select a.id from public.customer_addresses a " +
        "join public.customers c on c.id=a.customer_id " +
        "where c.organization_id=$1 and c.profile_id=$2 order by a.created_at limit 1",
      [org, customerProfileId],
    );
    assert.ok(addresses.length > 0, "order input acceptance requires the customer's existing delivery address");
    addressId = addresses[0].id;

    await customer.unsafe("reset role");
    await setIdentity(customer, customerAuth, "ci-customer-one@example.test");

    const customerCases = [
      {
        name: "non-array items",
        key: customerKey("non-array"),
        items: { product_id: activeProductId, quantity: 1 },
      },
      {
        name: "empty items",
        key: customerKey("empty"),
        items: [],
        pattern: /صنف واحد إلى 100/,
      },
      {
        name: "more than 100 item rows",
        key: customerKey("over-100"),
        items: Array.from({ length: 101 }, () => ({ product_id: activeProductId, quantity: 1 })),
        pattern: /صنف واحد إلى 100/,
      },
      {
        name: "malformed product ID",
        key: customerKey("bad-product-id"),
        items: [{ product_id: "not-a-uuid", quantity: 1 }],
        pattern: /رمز المنتج أو الكمية غير صالح/,
      },
      {
        name: "missing quantity",
        key: customerKey("missing-quantity"),
        items: [{ product_id: activeProductId }],
        pattern: /الكمية يجب أن تكون عددًا صحيحًا بين 1 و10000/,
      },
      {
        name: "fractional quantity",
        key: customerKey("fractional"),
        items: itemsFor(activeProductId, 1.5),
        pattern: /الكمية يجب أن تكون عددًا صحيحًا بين 1 و10000/,
      },
      {
        name: "zero quantity",
        key: customerKey("zero"),
        items: itemsFor(activeProductId, 0),
        pattern: /الكمية يجب أن تكون عددًا صحيحًا بين 1 و10000/,
      },
      {
        name: "quantity over 10000",
        key: customerKey("over-10000"),
        items: itemsFor(activeProductId, 10001),
        pattern: /الكمية يجب أن تكون عددًا صحيحًا بين 1 و10000/,
      },
      {
        name: "aggregate quantity over 10000",
        key: customerKey("aggregate-over-10000"),
        items: [...itemsFor(activeProductId, 6000), ...itemsFor(activeProductId, 6000)],
        pattern: /إجمالي كمية الصنف الواحد لا يمكن أن يتجاوز 10000/,
      },
      {
        name: "foreign-tenant product",
        key: customerKey("foreign-product"),
        items: itemsFor(foreignProduct, 1),
        pattern: /أحد المنتجات غير متاح في مؤسستك/,
      },
      {
        name: "inactive product",
        key: customerKey("inactive-product"),
        items: itemsFor(inactiveProductId, 1),
        pattern: /أحد المنتجات غير متاح في مؤسستك/,
      },
      {
        name: "invalid payment terms",
        key: customerKey("invalid-terms"),
        items: itemsFor(activeProductId, 1),
        terms: "forged",
        pattern: /شروط الدفع غير صالحة/,
      },
    ];

    for (const test of customerCases) {
      await expectRejected(
        "customer order: " + test.name,
        () => customerAttempt(test.items, test.key, test.terms ?? "cash_on_delivery"),
        test.pattern,
      );
    }

    await admin.unsafe("reset role");
    await setIdentity(admin, adminAuth, "admin@aghbari.ye");

    const staffCases = [
      {
        name: "non-array items",
        key: staffKey("non-array"),
        items: { product_id: activeProductId, quantity: 1 },
      },
      {
        name: "empty items",
        key: staffKey("empty"),
        items: [],
        pattern: /between 1 and 100 item rows/,
      },
      {
        name: "more than 100 item rows",
        key: staffKey("over-100"),
        items: Array.from({ length: 101 }, () => ({ product_id: activeProductId, quantity: 1 })),
        pattern: /between 1 and 100 item rows/,
      },
      {
        name: "malformed product ID",
        key: staffKey("bad-product-id"),
        items: [{ product_id: "not-a-uuid", quantity: 1 }],
        pattern: /invalid product id or quantity/,
      },
      {
        name: "missing quantity",
        key: staffKey("missing-quantity"),
        items: [{ product_id: activeProductId }],
        pattern: /quantity must be an integer between 1 and 10000/,
      },
      {
        name: "fractional quantity",
        key: staffKey("fractional"),
        items: itemsFor(activeProductId, 1.5),
        pattern: /quantity must be an integer between 1 and 10000/,
      },
      {
        name: "zero quantity",
        key: staffKey("zero"),
        items: itemsFor(activeProductId, 0),
        pattern: /quantity must be an integer between 1 and 10000/,
      },
      {
        name: "quantity over 10000",
        key: staffKey("over-10000"),
        items: itemsFor(activeProductId, 10001),
        pattern: /quantity must be an integer between 1 and 10000/,
      },
      {
        name: "aggregate quantity over 10000",
        key: staffKey("aggregate-over-10000"),
        items: [...itemsFor(activeProductId, 6000), ...itemsFor(activeProductId, 6000)],
        pattern: /combined quantity for an item exceeds 10000/,
      },
      {
        name: "foreign-tenant product",
        key: staffKey("foreign-product"),
        items: itemsFor(foreignProduct, 1),
        pattern: /product is not active in the staff organization/,
      },
      {
        name: "inactive product",
        key: staffKey("inactive-product"),
        items: itemsFor(inactiveProductId, 1),
        pattern: /product is not active in the staff organization/,
      },
      {
        name: "invalid payment terms",
        key: staffKey("invalid-terms"),
        items: itemsFor(activeProductId, 1),
        terms: "forged",
        pattern: /invalid payment terms/,
      },
    ];

    for (const test of staffCases) {
      await expectRejected(
        "staff order: " + test.name,
        () => staffAttempt(staffCustomerId, test.items, test.key, test.terms ?? "cash_on_delivery"),
        test.pattern,
      );
    }

    const allKeys = [...customerKeys, ...staffKeys];
    const persisted = await root.unsafe(
      "select count(*)::int as count from public.orders where idempotency_key=any($1::text[])",
      [allKeys],
    );
    assert.equal(persisted[0].count, 0, "invalid customer/staff order payloads must roll back orders and not persist retry keys");

    console.log(
      "PASS order input hardening: customer+staff reject 24 invalid payloads (shape, row count, IDs, missing/fractional/out-of-range quantities, aggregate cap, inactive/cross-tenant products, and payment terms) with no persisted orders",
    );
  } finally {
    await admin.unsafe("reset role").catch(() => {});
    await customer.unsafe("reset role").catch(() => {});
    const allKeys = [...customerKeys, ...staffKeys];
    const candidateOrders = await root.unsafe(
      "select id from public.orders where idempotency_key=any($1::text[])",
      [allKeys],
    ).catch(() => []);
    const orderIds = candidateOrders.map((row) => row.id);
    if (orderIds.length > 0) {
      await root.unsafe("delete from public.outbox_events where aggregate_id=any($1::uuid[])", [orderIds]).catch(() => {});
      await root.unsafe("delete from public.order_status_history where order_id=any($1::uuid[])", [orderIds]).catch(() => {});
      await root.unsafe("delete from public.order_items where order_id=any($1::uuid[])", [orderIds]).catch(() => {});
      await root.unsafe("delete from public.audit_logs where entity_id=any($1::uuid[])", [orderIds]).catch(() => {});
      await root.unsafe("delete from public.orders where id=any($1::uuid[])", [orderIds]).catch(() => {});
    }
    if (inactiveProductId) {
      await root.unsafe("delete from public.inventory_balances where product_id=$1", [inactiveProductId]).catch(() => {});
      await root.unsafe("delete from public.audit_logs where entity_id=$1", [inactiveProductId]).catch(() => {});
      await root.unsafe("delete from public.products where id=$1", [inactiveProductId]).catch(() => {});
    } else {
      await root.unsafe(
        "delete from public.products where organization_id=$1 and item_code=$2",
        [org, inactiveItemCode],
      ).catch(() => {});
    }
  }
}
