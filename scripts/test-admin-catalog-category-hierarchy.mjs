import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import postgres from "postgres";

function requiredEnv(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(name + " is required for local category hierarchy acceptance.");
  return value.replace(/^"(.*)"$/s, "$1");
}
function asJson(value) {
  return typeof value === "string" ? JSON.parse(value) : value;
}
function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
function localOnly(apiUrl, connectionString) {
  const api = new URL(apiUrl);
  const db = new URL(connectionString);
  if (
    api.protocol !== "http:" ||
    !["127.0.0.1", "localhost"].includes(api.hostname) ||
    api.port !== "54321" ||
    !["127.0.0.1", "localhost"].includes(db.hostname) ||
    !/^\d+$/.test(db.port) ||
    Number(db.port) < 1 ||
    Number(db.port) > 65535
  ) {
    throw new Error("Category hierarchy acceptance refuses non-loopback Supabase or PostgreSQL endpoints.");
  }
}

async function loginClaims(apiUrl, publishableKey, email, password) {
  const response = await fetch(new URL("/auth/v1/token?grant_type=password", apiUrl), {
    method: "POST",
    headers: { apikey: publishableKey, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const body = await response.json().catch(() => null);
  if (!response.ok || typeof body?.access_token !== "string") {
    throw new Error("Local Supabase Auth did not issue a manager/customer session (HTTP " + response.status + ").");
  }
  const parts = body.access_token.split(".");
  if (parts.length !== 3) throw new Error("Local Supabase access token has an invalid shape.");
  const claims = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
  if (claims.role !== "authenticated" || typeof claims.sub !== "string" || !claims.session_id) {
    throw new Error("Local Supabase token is missing authenticated session claims.");
  }
  return claims;
}

async function setClaims(client, claims, assumeAuthenticated = true) {
  await client.unsafe("select set_config('request.jwt.claim.sub',$1,false)", [claims.sub]);
  await client.unsafe("select set_config('request.jwt.claims',$1,false)", [JSON.stringify(claims)]);
  if (assumeAuthenticated) await client.unsafe("set role authenticated");
}

async function createCategory(client, name, parentId = null) {
  const rows = await client.unsafe(
    "select public.create_admin_catalog_category($1::text,$2::uuid,$3::text) as result",
    [name, parentId, null],
  );
  const result = asJson(rows[0]?.result);
  assert.ok(result && typeof result.id === "string", "server category-create RPC must return a persisted category id");
  assert.equal(result.name, name);
  return result.id;
}

async function archiveCategory(client, id) {
  const rows = await client.unsafe(
    "select public.archive_admin_catalog_category($1::uuid) as result",
    [id],
  );
  return asJson(rows[0]?.result);
}

async function createProduct(client, categoryId, status, suffix) {
  const payload = {
    name: "P2 category archive fixture " + suffix,
    item_code: "P2-CATEGORY-" + suffix,
    barcode: null,
    unit: "piece",
    description: "Ephemeral local PostgreSQL 17 category hierarchy acceptance fixture",
    category_id: categoryId,
    base_price: 10,
    price_wholesale_of_wholesale: 8,
    price_wholesale: 9,
    price_retail: 12,
    status,
  };
  const rows = await client.unsafe(
    "select public.save_admin_product_with_metadata(NULL::uuid,$1::jsonb) as result",
    [client.json(payload)],
  );
  const result = asJson(rows[0]?.result);
  const id = result?.id ?? result?.product_id;
  assert.ok(typeof id === "string", "canonical product save RPC must return the persisted product id");
  return id;
}

async function expectSqlState(label, operation, expectedCode) {
  let error;
  try {
    await operation();
  } catch (caught) {
    error = caught;
  }
  assert.ok(error, label + " must be rejected by PostgreSQL");
  assert.equal(String(error.code), expectedCode, label + " must use SQLSTATE " + expectedCode);
  return error;
}

async function countAudit(db, organizationId, categoryId) {
  const rows = await db.unsafe(
    "select count(*)::integer as count from public.audit_logs " +
    "where organization_id=$1::uuid and action='catalog.category_archived' " +
    "and entity_type='category' and entity_id=$2::uuid",
    [organizationId, categoryId],
  );
  return Number(rows[0]?.count ?? 0);
}

async function main() {
  const apiUrl = requiredEnv("E2E_SUPABASE_URL");
  const publishableKey = requiredEnv("E2E_SUPABASE_PUBLISHABLE_KEY");
  const connectionString = requiredEnv("TEST_DATABASE_URL");
  const managerEmail = requiredEnv("E2E_MANAGER_EMAIL").toLowerCase();
  const managerPassword = requiredEnv("E2E_MANAGER_PASSWORD");
  const customerEmail = requiredEnv("E2E_EMAIL").toLowerCase();
  const customerPassword = requiredEnv("E2E_PASSWORD");
  localOnly(apiUrl, connectionString);

  const organizationId = requiredEnv("E2E_PURCHASE_ORGANIZATION_ID");
  const foreignOrganizationId = "a1111111-1111-4111-8111-111111111111";
  const suffix = randomUUID().replaceAll("-", "").slice(-12).toUpperCase();
  const [managerClaims, customerClaims] = await Promise.all([
    loginClaims(apiUrl, publishableKey, managerEmail, managerPassword),
    loginClaims(apiUrl, publishableKey, customerEmail, customerPassword),
  ]);

  const db = postgres(connectionString, { max: 1, prepare: false, idle_timeout: 5 });
  const managerA = postgres(connectionString, { max: 1, prepare: false, idle_timeout: 5 });
  const managerB = postgres(connectionString, { max: 1, prepare: false, idle_timeout: 5 });
  const customer = postgres(connectionString, { max: 1, prepare: false, idle_timeout: 5 });
  const lockDb = postgres(connectionString, { max: 1, prepare: false, idle_timeout: 5 });
  const createdProducts = [];

  try {
    for (const [label, claims] of [["manager", managerClaims], ["customer", customerClaims]]) {
      const rows = await db.unsafe(
        "select id::text,user_id::text from auth.sessions where id=$1::uuid and user_id=$2::uuid " +
        "and (not_after is null or not_after > pg_catalog.now())",
        [claims.session_id, claims.sub],
      );
      assert.equal(rows.length, 1, "the " + label + " JWT must map to a live local Supabase Auth session");
    }

    const tenantRows = await db.unsafe(
      "select id::text from public.organizations where id=$1::uuid and is_active=true",
      [organizationId],
    );
    assert.equal(tenantRows.length, 1, "the manager tenant must be active");
    const foreignRows = await db.unsafe(
      "select id::text from public.organizations where id=$1::uuid and is_active=true",
      [foreignOrganizationId],
    );
    assert.equal(foreignRows.length, 1, "the foreign tenant must be active");

    await Promise.all([
      setClaims(managerA, managerClaims),
      setClaims(managerB, managerClaims),
      setClaims(customer, customerClaims),
    ]);

    // AUTHZ: customer role cannot create or archive catalog categories.
    const customerCategoryId = randomUUID();
    await expectSqlState(
      "ordinary customer cannot create an admin category",
      () => customer.unsafe(
        "select public.create_admin_catalog_category($1::text,NULL::uuid,NULL::text)",
        ["customer-denied-" + suffix],
      ),
      "42501",
    );
    await expectSqlState(
      "ordinary customer cannot archive a category",
      () => customer.unsafe(
        "select public.archive_admin_catalog_category($1::uuid)",
        [customerCategoryId],
      ),
      "42501",
    );

    // Direct active child: archive must leave both category rows and audit untouched.
    const directRoot = await createCategory(managerA, "P2-DIRECT-ROOT-" + suffix);
    const directChild = await createCategory(managerA, "P2-DIRECT-CHILD-" + suffix, directRoot);
    const auditBeforeDirect = await countAudit(db, organizationId, directRoot);
    await expectSqlState(
      "parent with an active direct child cannot be archived",
      () => archiveCategory(managerA, directRoot),
      "23503",
    );
    const directRows = await db.unsafe(
      "select id::text,is_active from public.categories where organization_id=$1::uuid and id=any($2::uuid[]) order by id",
      [organizationId, [directRoot, directChild]],
    );
    assert.equal(directRows.length, 2);
    assert.ok(directRows.every((row) => row.is_active === true), "rejected archive must leave parent and child active");
    assert.equal(await countAudit(db, organizationId, directRoot), auditBeforeDirect, "rejected archive must not write an archive audit event");

    // Transitive descendant: model an old archived direct child with an active grandchild.
    const deepRoot = await createCategory(managerA, "P2-DEEP-ROOT-" + suffix);
    const archivedMiddle = await createCategory(managerA, "P2-DEEP-MIDDLE-" + suffix, deepRoot);
    const activeGrandchild = await createCategory(managerA, "P2-DEEP-LEAF-" + suffix, archivedMiddle);
    await db.unsafe(
      "update public.categories set is_active=false where id=$1::uuid and organization_id=$2::uuid",
      [archivedMiddle, organizationId],
    );
    await expectSqlState(
      "parent with an active grandchild below an archived direct child cannot be archived",
      () => archiveCategory(managerA, deepRoot),
      "23503",
    );
    const deepState = await db.unsafe(
      "select id::text,is_active from public.categories where organization_id=$1::uuid and id=any($2::uuid[]) order by id",
      [organizationId, [deepRoot, archivedMiddle, activeGrandchild]],
    );
    assert.equal(deepState.length, 3);
    assert.equal(deepState.find((row) => row.id === deepRoot)?.is_active, true);
    assert.equal(deepState.find((row) => row.id === archivedMiddle)?.is_active, false);
    assert.equal(deepState.find((row) => row.id === activeGrandchild)?.is_active, true);

    // An active product on an archived descendant is still a live dependency of its ancestors.
    const productRoot = await createCategory(managerA, "P2-PRODUCT-ROOT-" + suffix);
    const archivedProductCategory = await createCategory(managerA, "P2-PRODUCT-CHILD-" + suffix, productRoot);
    const activeProduct = await createProduct(managerA, archivedProductCategory, "active", "ACT-" + suffix);
    createdProducts.push(activeProduct);
    await db.unsafe(
      "update public.categories set is_active=false where id=$1::uuid and organization_id=$2::uuid",
      [archivedProductCategory, organizationId],
    );
    await expectSqlState(
      "ancestor cannot archive while an active product remains on any descendant category",
      () => archiveCategory(managerA, productRoot),
      "23503",
    );
    const activeProductRows = await db.unsafe(
      "select id::text,category_id::text,status from public.products where organization_id=$1::uuid and id=$2::uuid",
      [organizationId, activeProduct],
    );
    assert.equal(activeProductRows.length, 1, "blocked archive must preserve the product row");
    assert.equal(activeProductRows[0].category_id, archivedProductCategory);
    assert.equal(activeProductRows[0].status, "active");

    // Successful archive of a subtree with only an inactive product must preserve the product.
    const safeRoot = await createCategory(managerA, "P2-SAFE-ROOT-" + suffix);
    const safeChild = await createCategory(managerA, "P2-SAFE-CHILD-" + suffix, safeRoot);
    const inactiveProduct = await createProduct(managerA, safeChild, "inactive", "INACT-" + suffix);
    createdProducts.push(inactiveProduct);
    const beforeProduct = await db.unsafe(
      "select id::text,organization_id::text,category_id::text,status,item_code from public.products " +
      "where organization_id=$1::uuid and id=$2::uuid",
      [organizationId, inactiveProduct],
    );
    assert.equal(beforeProduct.length, 1);
    const childArchive = await archiveCategory(managerA, safeChild);
    assert.equal(childArchive.id, safeChild);
    assert.equal(childArchive.is_active, false);
    const rootArchive = await archiveCategory(managerA, safeRoot);
    assert.equal(rootArchive.id, safeRoot);
    assert.equal(rootArchive.is_active, false);
    const afterProduct = await db.unsafe(
      "select id::text,organization_id::text,category_id::text,status,item_code from public.products " +
      "where organization_id=$1::uuid and id=$2::uuid",
      [organizationId, inactiveProduct],
    );
    assert.deepEqual(afterProduct, beforeProduct, "category archival must not delete, reassign, or modify its product row");
    assert.equal(await countAudit(db, organizationId, safeRoot), 1, "successful parent archive must emit one audit event");
    assert.equal(await countAudit(db, organizationId, safeChild), 1, "successful child archive must emit one audit event");

    // Tenant scope: a manager cannot attach a category to or archive a category in another org.
    const foreignCategoryId = randomUUID();
    await db.unsafe(
      "insert into public.categories(id,organization_id,parent_id,name,code,description,sort_order,is_active) " +
      "values($1::uuid,$2::uuid,NULL,$3,$4,$5,0,true)",
      [foreignCategoryId, foreignOrganizationId, "P2 Foreign Category " + suffix, "P2-F-" + suffix, "Foreign tenant acceptance fixture"],
    );
    await expectSqlState(
      "manager cannot create a child under another tenant's category",
      () => createCategory(managerA, "P2-CROSS-TENANT-" + suffix, foreignCategoryId),
      "P0002",
    );
    await expectSqlState(
      "manager cannot archive another tenant's category",
      () => archiveCategory(managerA, foreignCategoryId),
      "P0002",
    );
    const foreignState = await db.unsafe(
      "select organization_id::text,is_active,parent_id::text from public.categories where id=$1::uuid",
      [foreignCategoryId],
    );
    assert.deepEqual(foreignState, [{
      organization_id: foreignOrganizationId,
      is_active: true,
      parent_id: null,
    }], "cross-tenant denial must leave the foreign category unchanged");

    // CREATE-vs-ARCHIVE race: parent FOR UPDATE must block child FOR KEY SHARE.
    const createRaceRoot = await createCategory(managerA, "P2-CREATE-RACE-" + suffix);
    let createSettled = false;
    let createRacePromise;
    await lockDb.begin(async (tx) => {
      const locked = await tx.unsafe(
        "select id::text from public.categories where organization_id=$1::uuid and id=$2::uuid for update",
        [organizationId, createRaceRoot],
      );
      assert.equal(locked.length, 1, "the race session must lock the target parent");
      createRacePromise = createCategory(managerB, "P2-CREATE-RACE-CHILD-" + suffix, createRaceRoot)
        .then((value) => ({ value }), (error) => ({ error }))
        .then((result) => {
          createSettled = true;
          return result;
        });
      await delay(200);
      assert.equal(createSettled, false, "child create must wait on the parent's row lock before checking activity");
      await setClaims(tx, managerClaims, false);
      const archived = await archiveCategory(tx, createRaceRoot);
      assert.equal(archived.is_active, false);
    });
    const createRaceResult = await createRacePromise;
    assert.ok(createRaceResult?.error, "child create must fail after the parent is archived");
    assert.equal(String(createRaceResult.error.code), "P0002");
    const racedChildren = await db.unsafe(
      "select count(*)::integer as count from public.categories where organization_id=$1::uuid and parent_id=$2::uuid",
      [organizationId, createRaceRoot],
    );
    assert.equal(racedChildren[0].count, 0, "no child may commit beneath the archived parent");

    // PRODUCT-SAVE-vs-ARCHIVE race: product assignment holds KEY SHARE on category.
    const productRaceCategory = await createCategory(managerA, "P2-PRODUCT-RACE-" + suffix);
    let productSettled = false;
    let productRacePromise;
    const productRaceCode = "P2-CATEGORY-RACE-" + suffix;
    await lockDb.begin(async (tx) => {
      const locked = await tx.unsafe(
        "select id::text from public.categories where organization_id=$1::uuid and id=$2::uuid for update",
        [organizationId, productRaceCategory],
      );
      assert.equal(locked.length, 1, "the race session must lock the product category");
      productRacePromise = createProduct(managerB, productRaceCategory, "active", "RACE-" + suffix)
        .then((value) => ({ value }), (error) => ({ error }))
        .then((result) => {
          productSettled = true;
          return result;
        });
      await delay(200);
      assert.equal(productSettled, false, "product save must wait on the category row lock before validating activity");
      await setClaims(tx, managerClaims, false);
      const archived = await archiveCategory(tx, productRaceCategory);
      assert.equal(archived.is_active, false);
    });
    const productRaceResult = await productRacePromise;
    assert.ok(productRaceResult?.error, "product save must fail after the category is archived");
    assert.equal(String(productRaceResult.error.code), "P0002");
    const racedProducts = await db.unsafe(
      "select count(*)::integer as count from public.products where organization_id=$1::uuid and item_code=$2",
      [organizationId, productRaceCode],
    );
    assert.equal(racedProducts[0].count, 0, "no active product may commit under the archived category");

    // The migration's recursive UNION must terminate on corrupt cycles and fail closed.
    const cycleA = await createCategory(managerA, "P2-CYCLE-A-" + suffix);
    const cycleB = await createCategory(managerA, "P2-CYCLE-B-" + suffix, cycleA);
    await db.unsafe(
      "update public.categories set parent_id=$1::uuid where id=$2::uuid and organization_id=$3::uuid",
      [cycleB, cycleA, organizationId],
    );
    await expectSqlState(
      "category archive must fail closed and terminate on a corrupt parent cycle",
      () => archiveCategory(managerA, cycleA),
      "23503",
    );

    process.stdout.write(
      "PASS category hierarchy PostgreSQL 17 acceptance: direct-child denial; transitive-grandchild denial; descendant active-product denial; inactive-product preservation; tenant-scoped RPC denial; create/archive lock race; product-save/archive lock race; cycle-safe recursive traversal; ordinary-customer role denial\n",
    );
  } finally {
    await lockDb.end({ timeout: 5 }).catch(() => {});
    await customer.end({ timeout: 5 }).catch(() => {});
    await managerB.end({ timeout: 5 }).catch(() => {});
    await managerA.end({ timeout: 5 }).catch(() => {});
    await db.end({ timeout: 5 }).catch(() => {});
  }
}

main().catch((error) => {
  process.stderr.write("FAIL admin category hierarchy acceptance: " + String(error?.stack ?? error) + "\n");
  process.exitCode = 1;
});
