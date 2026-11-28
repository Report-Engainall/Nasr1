import { randomUUID } from "node:crypto";
import { writeFile } from "node:fs/promises";
import postgres from "postgres";
import { expect, test, type BrowserContext, type Page } from "@playwright/test";

test.describe.configure({ retries: 0 });

function requiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(name + " is required for local category-tree browser acceptance.");
  return value;
}

function normalizeQuantityDigits(value: string): string {
  const normalized = value
    .replace(/[٠-٩۰-۹]/g, (digit) => {
      const code = digit.charCodeAt(0);
      return String(code >= 0x06f0 ? code - 0x06f0 : code - 0x0660);
    })
    .replace(/[٬,]/g, "")
    .trim();
  if (!/^-?\d+(?:\.\d+)?$/.test(normalized)) return normalized;
  const [whole, fraction = ""] = normalized.split(".");
  const significantFraction = fraction.replace(/0+$/, "");
  return significantFraction ? whole + "." + significantFraction : whole;
}

async function localAuthenticatedRpc(page: Page, rpcName: string, body: Record<string, unknown>): Promise<{ status: number; payload: unknown }> {
  const apiUrl = new URL(requiredEnv('SUPABASE_URL'));
  if (apiUrl.protocol !== 'http:' || !['localhost', '127.0.0.1', '::1'].includes(apiUrl.hostname) || apiUrl.port !== '54321') {
    throw new Error('Sensitive product projection acceptance is restricted to disposable local Supabase.');
  }
  const accessToken = await page.evaluate(() => {
    for (const [key, value] of Object.entries(window.localStorage)) {
      if (!key.endsWith('-auth-token')) continue;
      try {
        const token = (JSON.parse(value) as { access_token?: unknown }).access_token;
        if (typeof token === 'string' && token.length > 20) return token;
      } catch {
        // Ignore unrelated local-storage keys and continue to the verified session key.
      }
    }
    return null;
  });
  if (!accessToken) throw new Error('An authenticated local browser session is required for RPC projection proof.');
  const response = await fetch(new URL('/rest/v1/rpc/' + rpcName, apiUrl), {
    method: 'POST',
    headers: {
      apikey: requiredEnv('SUPABASE_PUBLISHABLE_KEY'),
      authorization: 'Bearer ' + accessToken,
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  const raw = await response.text();
  let payload: unknown = raw;
  try { payload = raw ? JSON.parse(raw) : null; } catch { /* retain raw body for diagnostics */ }
  return { status: response.status, payload };
}

async function signIn(page: Page, email: string, password: string): Promise<void> {
  await page.goto("/login");
  await expect(page.getByRole("heading", { name: "تسجيل الدخول" })).toBeVisible();
  await page.getByLabel("البريد الإلكتروني").fill(email);
  await page.locator('input[autocomplete="current-password"]').fill(password);
  await page.getByRole("button", { name: "دخول", exact: true }).click();
  await expect(page).toHaveURL((url) => new URL(url).pathname === "/", { timeout: 20_000 });
  await expect.poll(() => page.evaluate(() => Object.entries(window.localStorage).some(([key, value]) => {
    if (!key.endsWith("-auth-token")) return false;
    try {
      const token = (JSON.parse(value) as { access_token?: unknown }).access_token;
      return typeof token === "string" && token.length > 20;
    } catch {
      return false;
    }
  }))).toBe(true);
}

test("mounted category tree creates a parent and child, persists parent_id, and restores deep links", async ({ browser }) => {
  test.setTimeout(210_000);
  const sourceSha = requiredEnv("E2E_SOURCE_SHA");
  const localSupabase = new URL(requiredEnv("SUPABASE_URL"));
  if (
    localSupabase.protocol !== "http:" ||
    !["localhost", "127.0.0.1", "::1"].includes(localSupabase.hostname) ||
    localSupabase.port !== "54321"
  ) {
    throw new Error("Category-tree browser acceptance is restricted to the disposable local Supabase API.");
  }

  const databaseUrl = new URL(requiredEnv("TEST_DATABASE_URL"));
  if (
    !["localhost", "127.0.0.1", "::1"].includes(databaseUrl.hostname) ||
    !databaseUrl.port ||
    ["5432", "6543"].includes(databaseUrl.port)
  ) {
    throw new Error("Category product-projection fixtures are restricted to the disposable loopback PostgreSQL port.");
  }
  const sql = postgres(databaseUrl.toString(), { max: 1, prepare: false, idle_timeout: 2 });
  const fixtureProductId = requiredEnv("E2E_PRODUCT_ID");
  const fixtureOrganizationId = "a0000000-0000-0000-0000-000000000001";
  let originalProductCategoryId: string | null = null;
  let fixtureProductCategoryChanged = false;
  let staffContext: BrowserContext | null = null;
  let customerContext: BrowserContext | null = null;

  const managerContext = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const manager = await managerContext.newPage();
  const browserErrors: string[] = [];
  manager.on("pageerror", (error) => browserErrors.push(error.message));
  const suffix = randomUUID().replace(/-/g, "").slice(-10).toUpperCase();
  const rootName = "P2 UI ROOT " + suffix;
  const childName = "P2 UI CHILD " + suffix;
  let rootId = "";
  let childId = "";
  const viewportChecks: Array<{ width: number; documentScrollWidth: number; viewportWidth: number }> = [];

  try {
    await signIn(manager, requiredEnv("E2E_MANAGER_EMAIL"), requiredEnv("E2E_MANAGER_PASSWORD"));
    await manager.goto("/admin/categories");
    await expect(manager.getByRole("heading", { name: "التصنيفات الرئيسية والفرعية", exact: true })).toBeVisible({ timeout: 30_000 });
    const categoryTree = manager.locator(".admin-category-tree");

    await manager.getByRole("button", { name: "تصنيف رئيسي", exact: true }).click();
    let nameInput = manager.getByLabel("اسم التصنيف");
    await nameInput.fill(rootName);
    await nameInput.locator("xpath=ancestor::form").getByRole("button", { name: "حفظ", exact: true }).click();
    await expect(manager.getByRole("heading", { name: rootName, exact: true })).toBeVisible({ timeout: 30_000 });

    let selectedId = new URL(manager.url()).searchParams.get("category");
    expect(selectedId, "Creating a root category must select its persisted server ID in the deep link.").toMatch(/^[0-9a-f-]{36}$/i);
    rootId = selectedId!;

    await manager.getByRole("button", { name: /إضافة فرع تحت هذا الأب/ }).click();
    nameInput = manager.getByLabel("اسم التصنيف");
    await expect(manager.getByText("سيُحفظ الفرع تحت: " + rootName)).toBeVisible();
    await nameInput.fill(childName);
    await nameInput.locator("xpath=ancestor::form").getByRole("button", { name: "حفظ", exact: true }).click();
    await expect(manager.getByRole("heading", { name: childName, exact: true })).toBeVisible({ timeout: 30_000 });

    selectedId = new URL(manager.url()).searchParams.get("category");
    expect(selectedId, "Creating a child must select its persisted server ID.").toMatch(/^[0-9a-f-]{36}$/i);
    childId = selectedId!;
    expect(childId).not.toBe(rootId);

    // Attach the disposable seeded product to the UI-created child for role projection checks.
    const originalProductRows = await sql.unsafe(
      "select category_id from public.products where id=$1::uuid and organization_id=$2::uuid and status='active'",
      [fixtureProductId, fixtureOrganizationId],
    );
    expect(originalProductRows, "The isolated product fixture must belong to the P2 organization.").toHaveLength(1);
    originalProductCategoryId = originalProductRows[0].category_id as string | null;
    const assignedProductRows = await sql.unsafe(
      "update public.products set category_id=$1::uuid where id=$2::uuid and organization_id=$3::uuid returning id",
      [childId, fixtureProductId, fixtureOrganizationId],
    );
    expect(assignedProductRows, "The local fixture product must be attached to the UI-created child.").toHaveLength(1);
    fixtureProductCategoryChanged = true;

    await expect(manager.getByRole("navigation", { name: "مسار التصنيف" })).toHaveText(new RegExp(rootName + "\\s*/\\s*" + childName));
    await expect(manager.locator(".admin-category-meta > div").nth(1).locator("strong")).toHaveText(rootName);

    // A full reload forces the category tree to rebuild from fetchCategories(), not React state.
    await manager.reload();
    await expect(manager.getByRole("heading", { name: childName, exact: true })).toBeVisible({ timeout: 30_000 });
    await expect(manager.getByRole("navigation", { name: "مسار التصنيف" })).toHaveText(new RegExp(rootName + "\\s*/\\s*" + childName));
    await expect(manager.locator(".admin-category-meta > div").nth(1).locator("strong")).toHaveText(rootName);
    await expect(categoryTree.getByRole("button", { name: childName, exact: true })).toBeVisible();
    expect(new URL(manager.url()).searchParams.get("category")).toBe(childId);

    // Prove the parent controls only presentation and the child remains nested under it.
    const collapse = manager.getByRole("button", { name: "طي الفروع", exact: true });
    await expect(collapse).toBeVisible();
    await collapse.click();
    await expect(categoryTree.getByRole("button", { name: childName, exact: true })).toHaveCount(0);
    await manager.getByRole("listitem").filter({ hasText: rootName }).getByRole("button", { name: "فتح الفروع", exact: true }).click();
    await expect(categoryTree.getByRole("button", { name: childName, exact: true })).toBeVisible();

    await manager.getByRole("button", { name: rootName, exact: true }).click();
    await expect(manager.getByRole("heading", { name: rootName, exact: true })).toBeVisible();
    await manager.getByRole("tab", { name: "التصنيفات الفرعية", exact: true }).click();
    const childrenPanel = manager.locator(".admin-category-child-list");
    await expect(childrenPanel.getByRole("button", { name: childName, exact: true })).toBeVisible();

    // Search preserves the parent context when only a nested child matches.
    const categorySearch = manager.getByRole("textbox", { name: "البحث في التصنيفات" });
    await categorySearch.fill(childName);
    await expect(manager.getByRole("button", { name: rootName, exact: true })).toBeVisible();
    await expect(categoryTree.getByRole("button", { name: childName, exact: true })).toBeVisible();
    await manager.getByRole("button", { name: "مسح البحث", exact: true }).click();

    // Browser history restores the selection from the previous deep-link entry.
    await categoryTree.getByRole("button", { name: childName, exact: true }).click();
    await expect.poll(() => new URL(manager.url()).searchParams.get("category")).toBe(childId);
    await manager.getByRole("button", { name: rootName, exact: true }).click();
    await expect.poll(() => new URL(manager.url()).searchParams.get("category")).toBe(rootId);
    await manager.goBack();
    await expect.poll(() => new URL(manager.url()).searchParams.get("category")).toBe(childId);
    await expect(manager.getByRole("heading", { name: childName, exact: true })).toBeVisible();

    // Manager retains its existing privileged product projection.
    const managerProductProjection = await localAuthenticatedRpc(manager, 'fetch_staff_products', { p_product_id: fixtureProductId });
    expect(managerProductProjection.status, 'Manager must retain privileged product access.').toBe(200);
    expect(Array.isArray(managerProductProjection.payload)).toBe(true);
    const managerProductProjectionRow = (managerProductProjection.payload as Array<Record<string, unknown>>)
      .find((row) => row.id === fixtureProductId);
    expect(managerProductProjectionRow, 'Manager projection must contain the disposable product.').toBeDefined();
    expect(managerProductProjectionRow).toHaveProperty('base_price');
    expect(managerProductProjectionRow).toHaveProperty('cost_price');

    const managerCatalogPageResponse = await localAuthenticatedRpc(manager, 'get_storefront_catalog_page', {
      p_search: 'P2 Local E2E Product',
      p_category_id: null,
      p_page: 1,
      p_page_size: 50,
      p_available_only: false,
    });
    expect(managerCatalogPageResponse.status, 'Manager must retain the full-price catalog page.').toBe(200);
    const managerCatalogPage = managerCatalogPageResponse.payload as Record<string, unknown>;
    const managerCatalogPageRows = managerCatalogPage.items as Array<Record<string, unknown>>;
    const managerCatalogPageProduct = managerCatalogPageRows.find((row) => row.id === fixtureProductId);
    expect(managerCatalogPageProduct).toBeDefined();
    expect(typeof managerCatalogPageProduct?.display_price).toBe('number');
    expect(typeof managerCatalogPageProduct?.base_price).toBe('number');

    // Manager sees the real base-price and stock projection for the seeded local product.
    await manager.getByRole("tab", { name: "الأسعار والمخزون", exact: true }).click();
    const managerCatalog = manager.getByRole("table", { name: "أسعار ومخزون المنتجات المرتبطة مباشرة بالتصنيف" });
    await expect(managerCatalog).toBeVisible({ timeout: 30_000 });
    const managerCatalogProductRow = managerCatalog.getByRole("row", { name: /P2 Local E2E Product/ });
    await expect(managerCatalogProductRow).toBeVisible();
    await expect(managerCatalog.getByRole("columnheader", { name: "السعر الأساسي", exact: true })).toBeVisible();
    const managerProductCells = await managerCatalogProductRow.locator("td").allInnerTexts();
    expect(managerProductCells).toHaveLength(7);
    const managerPriceText = managerProductCells[2].trim();
    expect(managerPriceText).not.toBe("");
    expect(managerPriceText).not.toBe("غير متاح");

    // Archive/restore an independent empty root; the active parent-child product tree remains intact.
    const archiveRootName = "P2 UI ARCHIVE " + suffix;
    await manager.getByRole("button", { name: "تصنيف رئيسي", exact: true }).click();
    const archiveNameInput = manager.getByLabel("اسم التصنيف");
    await archiveNameInput.fill(archiveRootName);
    await archiveNameInput.locator("xpath=ancestor::form").getByRole("button", { name: "حفظ", exact: true }).click();
    await expect(manager.getByRole("heading", { name: archiveRootName, exact: true })).toBeVisible({ timeout: 30_000 });
    await manager.getByRole("tab", { name: "نظرة عامة", exact: true }).click();
    manager.once("dialog", (dialog) => { void dialog.accept(); });
    await manager.getByRole("button", { name: "أرشفة التصنيف", exact: true }).click();
    await expect(manager.locator(".admin-category-status")).toHaveText("مؤرشف", { timeout: 30_000 });
    await expect(manager.getByRole("button", { name: "استعادة التصنيف", exact: true })).toBeVisible();
    await manager.getByRole("button", { name: "استعادة التصنيف", exact: true }).click();
    await expect(manager.locator(".admin-category-status")).toHaveText("نشط", { timeout: 30_000 });

    // Staff may read the tree and stock projection but cannot edit categories or see prices.
    staffContext = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const staff = await staffContext.newPage();
    const staffErrors: string[] = [];
    staff.on("pageerror", (error) => staffErrors.push(error.message));
    await signIn(staff, requiredEnv("E2E_STAFF_EMAIL"), requiredEnv("E2E_STAFF_PASSWORD"));
    await staff.goto("/admin/categories?category=" + encodeURIComponent(childId));
    await expect(staff.getByRole("heading", { name: "التصنيفات الرئيسية والفرعية", exact: true })).toBeVisible({ timeout: 30_000 });
    await expect(staff.getByRole("heading", { name: childName, exact: true })).toBeVisible();
    await expect(staff.getByRole("button", { name: "تصنيف رئيسي", exact: true })).toHaveCount(0);
    await expect(staff.getByRole("button", { name: /إضافة فرع تحت هذا الأب/ })).toHaveCount(0);
    await expect(staff.getByRole("button", { name: "حفظ الاسم", exact: true })).toHaveCount(0);
    await expect(staff.getByRole("button", { name: "أرشفة التصنيف", exact: true })).toHaveCount(0);
    // Staff receives an allowlisted row from PostgreSQL, not a full row hidden only in the UI.
    const staffSafeProjection = await localAuthenticatedRpc(staff, 'fetch_staff_catalog_products', { p_product_id: fixtureProductId });
    expect(staffSafeProjection.status, 'Staff-safe product projection must be available.').toBe(200);
    expect(Array.isArray(staffSafeProjection.payload)).toBe(true);
    const staffSafeRows = staffSafeProjection.payload as Array<Record<string, unknown>>;
    expect(staffSafeRows).toHaveLength(1);
    const staffSafeRow = staffSafeRows[0];
    expect(staffSafeRow.id).toBe(fixtureProductId);
    for (const forbiddenField of [
      'base_price', 'cost_price', 'retail_price', 'wholesale_price',
      'price_retail', 'price_wholesale', 'price_wholesale_of_wholesale',
      'max_stock', 'margin', 'margin_amount',
    ]) {
      expect(Object.prototype.hasOwnProperty.call(staffSafeRow, forbiddenField), 'Staff RPC must omit ' + forbiddenField + '.').toBe(false);
    }
    const staffPrivilegedProjection = await localAuthenticatedRpc(staff, 'fetch_staff_products', { p_product_id: fixtureProductId });
    expect(staffPrivilegedProjection.status).toBe(403);
    expect((staffPrivilegedProjection.payload as Record<string, unknown>)?.code).toBe('42501');
    const staffBasePriceResolver = await localAuthenticatedRpc(staff, 'get_storefront_product_prices', {
      p_product_ids: [fixtureProductId], p_quantity: 1,
    });
    expect(staffBasePriceResolver.status).toBe(403);
    expect((staffBasePriceResolver.payload as Record<string, unknown>)?.code).toBe('42501');

    const staffCatalogPageResponse = await localAuthenticatedRpc(staff, 'get_storefront_catalog_page', {
      p_search: 'P2 Local E2E Product',
      p_category_id: null,
      p_page: 1,
      p_page_size: 50,
      p_available_only: false,
    });
    expect(staffCatalogPageResponse.status, 'Staff must retain catalog access without privileged price resolution.').toBe(200);
    const staffCatalogPage = staffCatalogPageResponse.payload as Record<string, unknown>;
    const staffCatalogPageRows = staffCatalogPage.items as Array<Record<string, unknown>>;
    const staffCatalogPageProduct = staffCatalogPageRows.find((row) => row.id === fixtureProductId);
    expect(staffCatalogPageProduct).toBeDefined();
    expect(staffCatalogPageProduct?.display_price).toBeNull();
    for (const forbiddenField of [
      'base_price', 'cost_price', 'retail_price', 'wholesale_price',
      'price_retail', 'price_wholesale', 'price_wholesale_of_wholesale',
      'margin', 'margin_amount',
    ]) {
      expect(
        Object.prototype.hasOwnProperty.call(staffCatalogPageProduct, forbiddenField),
        'Staff catalog-page JSON must omit ' + forbiddenField + '.',
      ).toBe(false);
    }

    await staff.getByRole("tab", { name: "الأسعار والمخزون", exact: true }).click();
    const staffCatalog = staff.getByRole("table", { name: "أسعار ومخزون المنتجات المرتبطة مباشرة بالتصنيف" });
    await expect(staffCatalog).toBeVisible({ timeout: 30_000 });
    await expect(staffCatalog.getByRole("columnheader", { name: "السعر الأساسي", exact: true })).toHaveCount(0);
    await expect(staff.getByText("السعر الأساسي غير معروض وفق صلاحية الدور.", { exact: false })).toBeVisible();
    await expect(staffCatalog.getByRole("columnheader", { name: "على اليد", exact: true })).toBeVisible();
    const staffProductRow = staffCatalog.getByRole("row", { name: /P2 Local E2E Product/ });
    await expect(staffProductRow).toBeVisible();
    await expect(staffProductRow).not.toContainText(managerPriceText);
    const staffCatalogHeaders = await staffCatalog.locator("thead th").allInnerTexts();
    const onHandColumnIndex = staffCatalogHeaders.findIndex((header) => header.trim() === "على اليد");
    expect(onHandColumnIndex, "The staff projection must expose a distinct on-hand stock column.").toBeGreaterThanOrEqual(0);
    const onHandCell = staffProductRow.locator("td").nth(onHandColumnIndex);
    await expect(onHandCell).toBeVisible();
    // Read the exact on-hand baseline after preceding disposable stock workflows.
    const expectedStockRows = await sql.unsafe(
      "select b.quantity_on_hand::text as quantity_on_hand " +
      "from public.inventory_balances b " +
      "join public.warehouses w on w.id=b.warehouse_id " +
      "where b.product_id=$1::uuid and b.warehouse_id=public.public_storefront_warehouse_id() " +
      "and w.organization_id=$2::uuid and w.is_active=true",
      [fixtureProductId, fixtureOrganizationId],
    );
    expect(expectedStockRows, "Compare against one tenant-owned active warehouse balance.").toHaveLength(1);
    const expectedOnHand = normalizeQuantityDigits(String(expectedStockRows[0].quantity_on_hand));
    expect(expectedOnHand).toMatch(/^\d+(?:\.\d+)?$/);
    expect(
      normalizeQuantityDigits(await onHandCell.innerText()),
      "The on-hand cell must equal the actual isolated database balance after digit normalization.",
    ).toBe(expectedOnHand);

    // Customer direct navigation is blocked before the administrative category screen renders.
    customerContext = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const customer = await customerContext.newPage();
    const customerErrors: string[] = [];
    customer.on("pageerror", (error) => customerErrors.push(error.message));
    await signIn(customer, requiredEnv("E2E_EMAIL"), requiredEnv("E2E_PASSWORD"));
    await customer.goto("/admin/categories");
    await expect(customer.getByRole("heading", { name: "لا تملك صلاحية الإدارة", exact: true })).toBeVisible();
    await expect(customer.getByRole("heading", { name: "التصنيفات الرئيسية والفرعية", exact: true })).toHaveCount(0);

    // Restore and read back the original product/category relationship before evidence is written.
    const restoredProductRows = await sql.unsafe(
      "update public.products set category_id=$1::uuid where id=$2::uuid and organization_id=$3::uuid returning id",
      [originalProductCategoryId, fixtureProductId, fixtureOrganizationId],
    );
    expect(restoredProductRows, "The disposable product fixture must be restored before proof generation.").toHaveLength(1);
    const restoredProductState = await sql.unsafe(
      "select category_id from public.products where id=$1::uuid and organization_id=$2::uuid",
      [fixtureProductId, fixtureOrganizationId],
    );
    expect(restoredProductState).toHaveLength(1);
    expect((restoredProductState[0].category_id ?? null) as string | null).toBe(originalProductCategoryId);
    fixtureProductCategoryChanged = false;

    for (const width of [360, 1280]) {
      await manager.setViewportSize({ width, height: 900 });
      const dimensions = await manager.evaluate(() => ({
        documentScrollWidth: document.documentElement.scrollWidth,
        viewportWidth: window.innerWidth,
      }));
      expect(
        dimensions.documentScrollWidth,
        "The mounted category workspace must not create page-level horizontal overflow at " + width + "px.",
      ).toBeLessThanOrEqual(dimensions.viewportWidth);
      viewportChecks.push({ width, ...dimensions });
    }

    expect(browserErrors, "The mounted category workspace must not throw browser runtime errors.").toEqual([]);
    expect(staffErrors, "The staff category projection must not throw browser runtime errors.").toEqual([]);
    expect(customerErrors, "The customer denial route must not throw browser runtime errors.").toEqual([]);
    const proof = {
      result: "PASS",
      browserResult: "BROWSER_PROVEN",
      sourceSha,
      environment: "disposable-local-supabase-postgresql-17-only",
      route: "/admin/categories",
      role: "manager",
      roleChecks: {
        staffCanOpenCategories: true,
        staffCannotCreateOrRenameOrArchive: true,
        staffBasePriceHidden: true,
        staffInventoryVisible: true,
        customerDirectRouteDenied: true,
      },
      categoryNavigation: {
        searchPreservesParentContext: true,
        browserBackRestoresSelection: true,
        archiveRestoreRoundTrip: true,
      },
      priceInventoryProjection: {
        managerBasePriceVisible: true,
        staffBasePriceHidden: true,
        staffQuantityOnHandVisible: true,
        fixtureProductRestored: true,
      },
      rootCategory: { name: rootName, id: rootId, persistedAndReloaded: true },
      childCategory: { name: childName, id: childId, persistedParentId: rootId, parentContextCreation: true },
      serverBackedParentAndPathAfterReload: true,
      deepLinkRestoredAfterReload: true,
      expandCollapseWithoutChangingRelationship: true,
      directChildrenTabVerified: true,
      viewportChecks,
      browserRuntimeErrors: browserErrors,
      noProductionWrites: true,
    };
    await writeFile(requiredEnv("E2E_PROOF_PATH"), JSON.stringify(proof, null, 2) + "\n", "utf8");
    await test.info().attach("admin-category-tree-browser-proof.json", {
      body: JSON.stringify(proof, null, 2),
      contentType: "application/json",
    });
  } finally {
    if (fixtureProductCategoryChanged && originalProductCategoryId !== null) {
      await sql.unsafe(
        "update public.products set category_id=$1::uuid where id=$2::uuid and organization_id=$3::uuid",
        [originalProductCategoryId, fixtureProductId, fixtureOrganizationId],
      ).catch(() => undefined);
    } else if (fixtureProductCategoryChanged) {
      await sql.unsafe(
        "update public.products set category_id=null where id=$1::uuid and organization_id=$2::uuid",
        [fixtureProductId, fixtureOrganizationId],
      ).catch(() => undefined);
    }
    await sql.end({ timeout: 2 }).catch(() => undefined);
    await managerContext.close().catch(() => undefined);
    await staffContext?.close().catch(() => undefined);
    await customerContext?.close().catch(() => undefined);
  }
});
