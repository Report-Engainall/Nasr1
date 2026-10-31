import { test, expect, type Locator, type Page } from "@playwright/test";

function requiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(name + " is required for isolated local finance/task print acceptance.");
  return value;
}

async function signIn(page: Page, email: string, password: string) {
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

async function printPopup(page: Page, printButton: Locator, expectedText: string[]) {
  const popupPromise = page.waitForEvent("popup");
  await printButton.click();
  const popup = await popupPromise;
  await expect(popup.locator("html")).toHaveAttribute("dir", "rtl");
  for (const text of expectedText) await expect(popup.locator("body")).toContainText(text);
  await popup.waitForFunction(
    () => document.documentElement.dataset.e2ePrintInvoked === "true",
    undefined,
    { timeout: 10_000 },
  );
  const pdf = await popup.pdf();
  expect(new TextDecoder().decode(pdf.subarray(0, 5))).toBe("%PDF-");
  expect(pdf.byteLength).toBeGreaterThan(500);
  await popup.close();
}

async function assertAdminMobileNavigation(page: Page): Promise<void> {
  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto("/admin");
  const trigger = page.locator(".mobile-menu");
  const sidebar = page.locator("#admin-sidebar");
  await expect(trigger, "The authenticated admin shell must expose a mobile navigation control.").toBeVisible();
  await expect(trigger).toHaveAttribute("aria-expanded", "false");
  await expect(sidebar).toHaveAttribute("aria-label", "القائمة الإدارية");
  await expect(sidebar).toHaveCSS("visibility", "hidden");

  const mobileFit = await page.evaluate(() => ({
    lang: document.documentElement.lang.toLowerCase(),
    direction: getComputedStyle(document.documentElement).direction,
    viewportWidth: window.innerWidth,
    documentWidth: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth),
  }));
  expect(mobileFit.lang).toMatch(/^ar(?:-|$)/);
  expect(mobileFit.direction).toBe("rtl");
  expect(mobileFit.documentWidth, "The admin dashboard must not overflow at 360px.").toBeLessThanOrEqual(mobileFit.viewportWidth + 1);

  await trigger.click();
  const navigation = page.getByRole("navigation", { name: "التنقل الإداري" });
  const firstItem = navigation.locator("button").first();
  await expect(trigger).toHaveAttribute("aria-expanded", "true");
  await expect(sidebar).toHaveCSS("visibility", "visible");
  await expect(firstItem).toBeFocused();

  await page.keyboard.press("Escape");
  await expect(trigger).toHaveAttribute("aria-expanded", "false");
  await expect(trigger).toBeFocused();
  await expect(sidebar).toHaveCSS("visibility", "hidden");

  await trigger.click();
  const productsItem = navigation.getByRole("button", { name: "إدارة المنتجات" });
  await expect(productsItem).toBeVisible();
  await productsItem.click();
  await expect(page).toHaveURL(/\/admin\/products\/?$/);
  await expect(trigger).toHaveAttribute("aria-expanded", "false");
  await expect(trigger).toBeFocused();

  await page.setViewportSize({ width: 1280, height: 800 });
  await expect(sidebar).toHaveCSS("visibility", "visible");
  await expect(trigger).toBeHidden();
  const desktopFit = await page.evaluate(() => ({
    viewportWidth: window.innerWidth,
    documentWidth: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth),
  }));
  expect(desktopFit.documentWidth, "The admin product route must not overflow at 1280px.").toBeLessThanOrEqual(desktopFit.viewportWidth + 1);
}


const ADMIN_SCREEN_PATHS = ["/admin","/admin/products","/admin/customers","/admin/orders","/admin/pricing","/admin/stock-count","/admin/inventory-transfers","/admin/offers","/admin/suppliers","/admin/purchase-orders","/admin/devices","/admin/reports","/admin/intelligence","/admin/ai","/admin/notifications","/admin/data","/admin/operations","/admin/settings","/admin/quotes","/admin/finance","/admin/tasks","/admin/audit"] as const;

async function assertRouteViewport(page: Page, route: string, width: number) {
  await page.setViewportSize({ width, height: 800 });
  await page.goto(route, { waitUntil: "domcontentloaded" });

  if (route === "/admin/exports") {
    await expect(page.getByRole("heading", { name: "تصدير الطلبات غير المتزامن" })).toBeVisible({ timeout: 20_000 });
  } else {
    await expect(page.locator("#admin-sidebar")).toBeAttached({ timeout: 20_000 });
    await expect(page.locator("h1").first()).toBeVisible({ timeout: 20_000 });
    const menu = page.locator(".mobile-menu");
    if (width < 1024) await expect(menu).toBeVisible();
    else await expect(menu).toBeHidden();
  }

  const measured = await page.evaluate(() => ({
    lang: document.documentElement.lang.toLowerCase(),
    direction: getComputedStyle(document.documentElement).direction,
    viewportWidth: window.innerWidth,
    documentWidth: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth),
  }));
  expect(measured.lang, route + " must declare Arabic document language").toMatch(/^ar(?:-|$)/);
  expect(measured.direction, route + " must render RTL").toBe("rtl");
  expect(
    measured.documentWidth,
    route + " must not cause document-level horizontal overflow at " + width + "px",
  ).toBeLessThanOrEqual(measured.viewportWidth + 1);
  return { route, width, ...measured, overflow: false };
}

async function assertAdminRouteViewportMatrix(page: Page) {
  const results: Array<{
    route: string;
    width: number;
    lang: string;
    direction: string;
    viewportWidth: number;
    documentWidth: number;
    overflow: boolean;
  }> = [];
  for (const width of [360, 1280]) {
    for (const route of [...ADMIN_SCREEN_PATHS, "/admin/exports"]) {
      results.push(await assertRouteViewport(page, route, width));
    }
  }
  await test.info().attach("admin-route-responsive-rtl-matrix.json", {
    body: JSON.stringify({
      result: "BROWSER_PROVEN",
      sourceSha: process.env.E2E_SOURCE_SHA ?? "not-provided",
      viewportWidths: [360, 1280],
      routeCount: results.length / 2,
      checkedRoutes: results,
      documentOverflow: false,
    }, null, 2),
    contentType: "application/json",
  });
  return results;
}

test("authorized finance documents and operational-task print remain tenant-scoped in the real UI", async ({ browser }) => {
  test.setTimeout(8 * 60 * 1000);
  const managerEmail = requiredEnv("E2E_MANAGER_EMAIL");
  const managerPassword = requiredEnv("E2E_MANAGER_PASSWORD");
  const accountantEmail = requiredEnv("E2E_ACCOUNTANT_EMAIL");
  const accountantPassword = requiredEnv("E2E_ACCOUNTANT_PASSWORD");
  const customerEmail = requiredEnv("E2E_EMAIL");
  const customerPassword = requiredEnv("E2E_PASSWORD");
  const orderNumber = requiredEnv("E2E_RETURN_ORDER_NUMBER");
  const itemName = requiredEnv("E2E_RETURN_ITEM_NAME");
  const invoiceNumber = "INV-" + orderNumber;

  const managerContext = await browser.newContext();
  const manager = await managerContext.newPage();
  // Keep Chromium headless and deterministic while proving the application invoked its print action.
  await managerContext.addInitScript(() => {
    window.print = () => { document.documentElement.dataset.e2ePrintInvoked = "true"; };
    // The product may close a print popup after invoking window.print().
    // Keep it alive in this deterministic harness so Chromium can inspect its rendered PDF.
    window.close = () => {};
  });

  try {
    await signIn(manager, managerEmail, managerPassword);
    await assertAdminMobileNavigation(manager);
    await assertAdminRouteViewportMatrix(manager);
    await manager.goto("/admin/finance");
    await expect(manager.getByRole("heading", { name: "الفواتير والتحصيل" })).toBeVisible();
    await expect(manager.getByRole("heading", { name: "طباعة المستندات المالية حسب الصلاحية" }).first()).toBeVisible();

    // The general-ledger panel exposes its own selectors with the same accessible names.
    // Scope this acceptance to the dedicated finance-document print panel's first controls.
    const kind = manager.getByLabel("نوع المستند المالي").first();
    const source = manager.getByLabel("مصدر المستند المالي").first();
    const printButton = manager.getByRole("button", { name: "فتح نافذة الطباعة / حفظ PDF", exact: true }).first();

    await expect(source).toBeEnabled();
    await kind.selectOption("invoice");
    const invoiceOption = source.locator("option").filter({ hasText: invoiceNumber }).first();
    await expect(invoiceOption).toBeAttached();
    const invoiceId = await invoiceOption.getAttribute("value");
    expect(invoiceId).toBeTruthy();
    await source.selectOption(invoiceId!);
    await expect(printButton).toBeEnabled();
    await printPopup(manager, printButton, [invoiceNumber, "P2-RET-001", itemName]);

    await kind.selectOption("statement");
    await expect(source.locator("option").filter({ hasText: "P2 Local E2E Customer A" }).first()).toBeAttached();
    const statementOptions = await source.locator("option").allTextContents();
    expect(statementOptions.some((value) => value.includes("P2 Local E2E Customer B"))).toBe(false);
    const customerOption = source.locator("option").filter({ hasText: "P2 Local E2E Customer A" }).first();
    const customerId = await customerOption.getAttribute("value");
    expect(customerId).toBeTruthy();
    await source.selectOption(customerId!);
    await printPopup(manager, printButton, ["P2 Local E2E Customer A", invoiceNumber]);
    
    await kind.selectOption("credit_memo");
    const memoOption = source.locator("option").filter({ hasText: invoiceNumber }).first();
    await expect(memoOption).toBeAttached({ timeout: 15_000 });
    const memoId = await memoOption.getAttribute("value");
    expect(memoId).toBeTruthy();
    await source.selectOption(memoId!);
    await printPopup(manager, printButton, [
      invoiceNumber,
      "P2 Local E2E Customer A",
      "معكوس ماليًا",
      "رقم قيد العكس",
      "Playwright UI reversal acceptance after posted credit.",
      "لا يمثل رصيدًا دائنًا قائمًا",
    ]);
    await expect(manager.getByRole("heading", { name: "طباعة المستندات المالية حسب الصلاحية" }).first()).toBeVisible();

    await manager.goto("/admin/tasks");
    await expect(manager.getByRole("heading", { name: "مركز المهام التشغيلية" })).toBeVisible();
    await manager.getByLabel("الحالة").selectOption("all");
    await manager.getByLabel("نطاق الطباعة").selectOption("all");
    const printTasksButton = manager.getByRole("button", { name: "طباعة كل المهام المسموحة", exact: true });
    await expect(printTasksButton).toBeEnabled({ timeout: 15_000 });
    await expect(manager.locator(".operational-task-print")).toContainText("مراجعة وترحيل قيد الإشعار الدائن");
    // Prove the task-center action itself invoked printing, not a previous finance-popup print.
    await manager.evaluate(() => { delete document.documentElement.dataset.e2ePrintInvoked; });
    await printTasksButton.click();
    await expect.poll(() => manager.evaluate(() => document.documentElement.dataset.e2ePrintInvoked)).toBe("true");

    await test.info().attach("finance-task-print-browser-proof.json", {
      body: JSON.stringify({
        result: "BROWSER_PROVEN",
        sourceSha: process.env.E2E_SOURCE_SHA ?? "not-provided",
        isolatedLocalOnly: true,
        adminMobileNavigation: "BROWSER_PROVEN",
        adminDrawerFocusAndEscape: true,
        adminNavigationClosesDrawer: true,
        adminMobileViewportWidth: 360,
        adminDesktopViewportWidth: 1280,
        adminViewportOverflow: false,
        invoicePrinted: true,
        fullStatementPrinted: true,
        postedOrReversedCreditMemoPrintAttempted: true,
        foreignTenantCustomerAbsentFromStatementOptions: true,
        operationalTaskPrintInvoked: true,
        noProductionWrites: true,
      }, null, 2),
      contentType: "application/json",
    });
  } finally {
    await managerContext.close();
  }


  const accountantContext = await browser.newContext();
  const accountant = await accountantContext.newPage();
  await accountantContext.addInitScript(() => {
    window.print = () => { document.documentElement.dataset.e2ePrintInvoked = "true"; };
    window.close = () => {};
  });

  try {
    await signIn(accountant, accountantEmail, accountantPassword);
    await accountant.goto("/admin/finance");
    await expect(accountant.getByRole("heading", { name: "الفواتير والتحصيل" })).toBeVisible();
    await expect(accountant.getByRole("heading", { name: "طباعة المستندات المالية حسب الصلاحية" }).first()).toBeVisible();

    const accountantKind = accountant.getByLabel("نوع المستند المالي").first();
    const accountantSource = accountant.getByLabel("مصدر المستند المالي").first();
    const accountantPrintButton = accountant.getByRole("button", { name: "فتح نافذة الطباعة / حفظ PDF", exact: true }).first();
    await expect(accountantSource).toBeEnabled();

    await accountantKind.selectOption("invoice");
    const accountantInvoiceOption = accountantSource.locator("option").filter({ hasText: invoiceNumber }).first();
    await expect(accountantInvoiceOption).toBeAttached();
    const accountantInvoiceId = await accountantInvoiceOption.getAttribute("value");
    expect(accountantInvoiceId).toBeTruthy();
    await accountantSource.selectOption(accountantInvoiceId!);
    await expect(accountantPrintButton).toBeEnabled();
    await printPopup(accountant, accountantPrintButton, [invoiceNumber, "P2-RET-001", itemName]);

    await accountantKind.selectOption("statement");
    await expect(accountantSource.locator("option").filter({ hasText: "P2 Local E2E Customer A" }).first()).toBeAttached();
    const accountantStatementOptions = await accountantSource.locator("option").allTextContents();
    expect(accountantStatementOptions.some((value) => value.includes("P2 Local E2E Customer B"))).toBe(false);
    const accountantCustomerOption = accountantSource.locator("option").filter({ hasText: "P2 Local E2E Customer A" }).first();
    const accountantCustomerId = await accountantCustomerOption.getAttribute("value");
    expect(accountantCustomerId).toBeTruthy();
    await accountantSource.selectOption(accountantCustomerId!);
    await printPopup(accountant, accountantPrintButton, ["P2 Local E2E Customer A", invoiceNumber]);

    await accountantKind.selectOption("credit_memo");
    const accountantMemoOption = accountantSource.locator("option").filter({ hasText: invoiceNumber }).first();
    await expect(accountantMemoOption).toBeAttached({ timeout: 15_000 });
    const accountantMemoId = await accountantMemoOption.getAttribute("value");
    expect(accountantMemoId).toBeTruthy();
    await accountantSource.selectOption(accountantMemoId!);
    await printPopup(accountant, accountantPrintButton, [
      invoiceNumber,
      "P2 Local E2E Customer A",
      "معكوس ماليًا",
      "رقم قيد العكس",
      "Playwright UI reversal acceptance after posted credit.",
      "لا يمثل رصيدًا دائنًا قائمًا",
    ]);

    await test.info().attach("finance-accountant-print-browser-proof.json", {
      body: JSON.stringify({
        result: "BROWSER_PROVEN",
        sourceSha: process.env.E2E_SOURCE_SHA ?? "not-provided",
        role: "accountant",
        isolatedLocalOnly: true,
        invoicePdf: true,
        fullStatementPdf: true,
        reversedCreditMemoPdf: true,
        foreignTenantCustomerAbsentFromStatementOptions: true,
        noProductionWrites: true,
      }, null, 2),
      contentType: "application/json",
    });
  } finally {
    await accountantContext.close();
  }

    const customerContext = await browser.newContext();
  const customer = await customerContext.newPage();
  try {
    await signIn(customer, customerEmail, customerPassword);
    await customer.goto("/admin/finance");
    await expect(customer.getByRole("button", { name: "فتح نافذة الطباعة / حفظ PDF", exact: true })).toHaveCount(0);
    await expect(customer.getByRole("heading", { name: "طباعة المستندات المالية حسب الصلاحية" })).toHaveCount(0);
  } finally {
    await customerContext.close();
  }
});
