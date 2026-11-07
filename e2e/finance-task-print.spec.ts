import { readFile } from "node:fs/promises";
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

/** Read one stored OOXML ZIP member from the actual browser download. */
function readStoredZipEntry(input: Uint8Array, targetPath: string): string {
  const view = new DataView(input.buffer, input.byteOffset, input.byteLength);
  const decoder = new TextDecoder();
  let offset = 0;
  while (offset + 30 <= input.byteLength && view.getUint32(offset, true) === 0x04034b50) {
    const method = view.getUint16(offset + 8, true);
    const size = view.getUint32(offset + 18, true);
    const nameLength = view.getUint16(offset + 26, true);
    const extraLength = view.getUint16(offset + 28, true);
    const nameStart = offset + 30;
    const contentStart = nameStart + nameLength + extraLength;
    const name = decoder.decode(input.subarray(nameStart, nameStart + nameLength));
    if (contentStart + size > input.byteLength) throw new Error("Truncated XLSX entry: " + name);
    if (name === targetPath) {
      if (method !== 0) throw new Error("Unexpected compression method for XLSX entry " + name + ": " + method);
      return decoder.decode(input.subarray(contentStart, contentStart + size));
    }
    offset = contentStart + size;
  }
  throw new Error("Missing or unreadable XLSX ZIP entry: " + targetPath);
}

async function assertTrialBalanceDownload(page: Page, role: "manager" | "accountant"): Promise<void> {
  const exportButton = page.getByRole("button", { name: "تصدير ميزان المراجعة Excel", exact: true });
  const panel = exportButton.locator("xpath=ancestor::section[1]");
  await expect(exportButton).toBeEnabled({ timeout: 30_000 });
  const rows = panel.locator("table tbody tr");
  await expect(rows.first()).toBeVisible({ timeout: 30_000 });
  const visibleAccounts = await rows.evaluateAll((elements) => elements.map((row) => {
    const cells = Array.from(row.querySelectorAll("td"));
    return [cells[0]?.textContent?.trim() ?? "", cells[1]?.textContent?.trim() ?? ""];
  }));
  expect(visibleAccounts.length, "The authorized ledger view must contain the tenant's account set.").toBeGreaterThan(0);
  expect(visibleAccounts.every(([code, name]) => code.length > 0 && name.length > 0)).toBe(true);

  const downloadPromise = page.waitForEvent("download");
  await exportButton.click();
  const download = await downloadPromise;
  expect(await download.failure()).toBeNull();
  expect(download.suggestedFilename()).toBe("aghbari-trial-balance-all-all.xlsx");
  const downloadPath = await download.path();
  expect(downloadPath).not.toBeNull();
  const bytes = new Uint8Array(await readFile(downloadPath!));
  expect(Array.from(bytes.slice(0, 4))).toEqual([0x50, 0x4b, 0x03, 0x04]);

  const workbookXml = readStoredZipEntry(bytes, "xl/workbook.xml");
  const summaryXml = readStoredZipEntry(bytes, "xl/worksheets/sheet1.xml");
  const detailsXml = readStoredZipEntry(bytes, "xl/worksheets/sheet2.xml");
  const methodXml = readStoredZipEntry(bytes, "xl/worksheets/sheet3.xml");
  expect(workbookXml).toContain('sheet name="الملخص"');
  expect(workbookXml).toContain('sheet name="ميزان المراجعة"');
  expect(workbookXml).toContain('sheet name="المنهجية والحدود"');
  expect(summaryXml).toContain("كل الفترات حتى تاريخ اليوم حسب المصدر");
  expect(summaryXml).toContain("غير محدد");
  for (const label of ["الحسابات المصدرة", "القيود المرحلة الداخلة في الميزان", "إجمالي المدين", "إجمالي الدائن", "حالة الميزان"]) {
    expect(summaryXml).toContain(label);
  }
  for (const [code, name] of visibleAccounts) {
    expect(detailsXml).toContain(code);
    expect(detailsXml).toContain(name);
  }
  expect((detailsXml.match(/<row\b/g) ?? []).length).toBe(visibleAccounts.length + 2);
  expect(methodXml).toContain("لا يعتمد على ترقيم صفحة القيود");
  expect(methodXml).toContain("صف واحد لكل حساب");
  const allXml = [workbookXml, summaryXml, detailsXml, methodXml].join("\n");
  expect(allXml).not.toMatch(/<f(?:\s|>)/i);
  expect(allXml).not.toMatch(/(?:organization_id|tenant_id|account_id|user_id|created_by|source_reference|journal_entry_id|cost_price|profit_margin)/i);
  expect(allXml).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i);

  await test.info().attach("trial-balance-xlsx-" + role + "-browser-proof.json", {
    body: JSON.stringify({
      result: "BROWSER_PROVEN",
      sourceSha: process.env.E2E_SOURCE_SHA ?? "not-provided",
      role,
      downloadedFile: download.suggestedFilename(),
      worksheets: ["الملخص", "ميزان المراجعة", "المنهجية والحدود"],
      visibleAccountCount: visibleAccounts.length,
      allVisibleAccountsIncluded: true,
      accountRowCountMatchesLivePanel: true,
      sourceWindow: "all periods from the tenant-scoped posted-ledger aggregate",
      independentOfJournalPagination: true,
      noInternalIdsCostsOrFormulaCells: true,
      noProductionWrites: true
    }, null, 2),
    contentType: "application/json"
  });
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

  if (route === "/admin/finance" && width <= 360) {
    const menuButton = page.getByRole("button", { name: "فتح القائمة الإدارية" });
    const sidebar = page.locator("#admin-sidebar");
    const hiddenBounds = await sidebar.evaluate((element) => {
      const rect = element.getBoundingClientRect();
      return { left: rect.left, right: rect.right, width: rect.width, viewport: window.innerWidth };
    });
    expect(hiddenBounds.right).toBeLessThanOrEqual(hiddenBounds.viewport + 1);
    await menuButton.click();
    await expect(page.getByRole("button", { name: "إغلاق القائمة الإدارية" })).toBeVisible();
    await expect(sidebar).toBeVisible();
    const openMetrics = await page.evaluate(() => ({
      documentWidth: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth),
      viewportWidth: window.innerWidth,
      offenders: Array.from(document.body.querySelectorAll("*")).map((element) => {
        const rect = element.getBoundingClientRect();
        const style = getComputedStyle(element);
        return {
          tag: element.tagName.toLowerCase(),
          id: element.id || null,
          className: typeof element.className === "string" ? element.className : null,
          right: Math.round(rect.right),
          width: Math.round(rect.width),
          position: style.position,
          overflowX: style.overflowX,
        };
      }).filter((element) => element.width > window.innerWidth + 1 || element.left < -1 || (element.right > window.innerWidth + 1 && element.position !== "fixed"))
        .sort((a, b) => Math.max(Math.abs(b.left), Math.abs(b.right - window.innerWidth)) - Math.max(Math.abs(a.left), Math.abs(a.right - window.innerWidth))).slice(0, 12),
    }));
    expect(openMetrics.documentWidth, "opened admin drawer viewport offenders: " + JSON.stringify(openMetrics.offenders))
      .toBeLessThanOrEqual(openMetrics.viewportWidth + 1);
    await page.getByRole("button", { name: "إغلاق القائمة الإدارية" }).click();
    await expect(sidebar).toBeHidden();

    const journalLineScroller = page.getByRole("region", { name: "حقول سطر قيد اليومية 1" });
    await expect(journalLineScroller).toBeVisible();
    const scrollMetrics = await journalLineScroller.evaluate((element) => ({
      viewportWidth: window.innerWidth,
      clientWidth: element.clientWidth,
      scrollWidth: element.scrollWidth,
      right: element.getBoundingClientRect().right,
      left: element.getBoundingClientRect().left,
    }));
    expect(scrollMetrics.clientWidth).toBeLessThanOrEqual(scrollMetrics.viewportWidth);
    expect(scrollMetrics.right).toBeLessThanOrEqual(scrollMetrics.viewportWidth + 1);
    expect(scrollMetrics.left).toBeGreaterThanOrEqual(-1);
    expect(scrollMetrics.scrollWidth).toBeGreaterThan(scrollMetrics.clientWidth);
  }

  const measured = await page.evaluate(() => {
    const viewportWidth = window.innerWidth;
    const candidates = [document.documentElement, document.body, ...Array.from(document.body.querySelectorAll("*"))];
    const overflowingElements = candidates
      .map((element) => {
        const rect = element.getBoundingClientRect();
        const style = getComputedStyle(element);
        return {
          tag: element.tagName.toLowerCase(),
          id: element.id || null,
          className: typeof element.className === "string" ? element.className : null,
          role: element.getAttribute("role"),
          ariaLabel: element.getAttribute("aria-label"),
          left: Math.round(rect.left),
          right: Math.round(rect.right),
          width: Math.round(rect.width),
          scrollWidth: element.scrollWidth,
          clientWidth: element.clientWidth,
          scrollDelta: element.scrollWidth - element.clientWidth,
          display: style.display,
          position: style.position,
          overflowX: style.overflowX,
        };
      })
      .filter((element) =>
        element.width > viewportWidth + 1 ||
        element.left < -1 ||
        (element.right > viewportWidth + 1 && element.position !== "fixed") ||
        element.scrollDelta > 1
      )
      .sort((a, b) => b.scrollDelta - a.scrollDelta || b.right - a.right || b.width - a.width)
      .slice(0, 20);
    return {
      lang: document.documentElement.lang.toLowerCase(),
      direction: getComputedStyle(document.documentElement).direction,
      viewportWidth,
      documentElementScrollWidth: document.documentElement.scrollWidth,
      bodyScrollWidth: document.body.scrollWidth,
      bodyClientWidth: document.body.clientWidth,
      documentWidth: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth),
      overflowingElements,
    };
  });
  expect(measured.lang, route + " must declare Arabic document language").toMatch(/^ar(?:-|$)/);
  expect(measured.direction, route + " must render RTL").toBe("rtl");
  expect(
    measured.documentWidth,
    route + " must not cause document-level horizontal overflow at " + width + "px; offenders: " + JSON.stringify(measured.overflowingElements),
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
    // Admin sales-order print must show only persisted order values, never editable draft values.
    await manager.goto("/admin/orders");
    await expect(manager.getByRole("heading", { name: "الطلبات", exact: true })).toBeVisible({ timeout: 30_000 });
    const salesOrderRow = manager.getByRole("row").filter({ hasText: orderNumber }).first();
    await expect(salesOrderRow).toBeVisible({ timeout: 30_000 });
    await salesOrderRow.getByRole("button", { name: "تفاصيل", exact: true }).click();
    await expect(manager.getByRole("heading", { name: "الطلب #" + orderNumber, exact: true })).toBeVisible({ timeout: 30_000 });
    const salesOrderPrintButton = manager.getByRole("button", { name: "طباعة أمر البيع", exact: true });
    await expect(salesOrderPrintButton).toBeEnabled();
    await manager.evaluate(() => { delete document.documentElement.dataset.e2ePrintInvoked; });
    await salesOrderPrintButton.click();
    await expect.poll(() => manager.evaluate(() => document.documentElement.dataset.e2ePrintInvoked)).toBe("true");
    const salesOrderPrint = manager.locator(".admin-sales-order-print-document");
    await expect(salesOrderPrint).toContainText(orderNumber);
    const salesOrderPrintHtml = await salesOrderPrint.evaluate((element) => element.innerHTML);
    expect(salesOrderPrintHtml).not.toMatch(/organization_id|customer_id|product_id|order_id|item_id|created_by|admin_notes|cost_price|proposed_quantity|proposed_unit_price/i);

    await assertAdminMobileNavigation(manager);
    await assertAdminRouteViewportMatrix(manager);
    await manager.goto("/admin/finance");
    await expect(manager.getByRole("heading", { name: "الفواتير والتحصيل" })).toBeVisible();
    await expect(manager.getByRole("heading", { name: "طباعة المستندات المالية حسب الصلاحية" }).first()).toBeVisible();
    await expect(manager.getByRole("heading", { name: "ميزان المراجعة للفترة المحددة" })).toBeVisible({ timeout: 30_000 });
    await assertTrialBalanceDownload(manager, "manager");

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
    const agingPrintButton = manager.getByRole("button", {
      name: "طباعة كشف أعمار الذمم (الملخص والصفحة المعروضة)",
      exact: true,
    });
    await expect(agingPrintButton).toBeEnabled({ timeout: 15_000 });
    await agingPrintButton.click();
    await expect(manager.locator("html")).toHaveClass(/print-receivables-aging/);
    await manager.emulateMedia({ media: "print" });
    const agingPrintMetrics = await manager.evaluate(() => {
      const report = document.querySelector(".receivables-aging-report");
      const controls = document.querySelector(".receivables-aging-print-controls");
      const sidebar = document.querySelector("#admin-sidebar");
      if (!report || !controls || !sidebar) throw new Error("Finance aging print scope is missing a required page element.");
      return {
        reportVisibility: getComputedStyle(report).visibility,
        controlsDisplay: getComputedStyle(controls).display,
        unrelatedSidebarVisibility: getComputedStyle(sidebar).visibility,
      };
    });
    expect(agingPrintMetrics.reportVisibility).toBe("visible");
    expect(agingPrintMetrics.controlsDisplay).toBe("none");
    expect(agingPrintMetrics.unrelatedSidebarVisibility).toBe("hidden");
    await manager.evaluate(() => window.dispatchEvent(new Event("afterprint")));
    await expect.poll(() => manager.locator("html").evaluate((element) => element.classList.contains("print-receivables-aging"))).toBe(false);
    await manager.emulateMedia({ media: "screen" });
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

    // The purchasing page must print from the role-safe projection, not the internal order model.
    await manager.goto("/admin/purchase-orders");
    await expect(manager.getByRole("heading", { name: "أوامر الشراء والاستلام" })).toBeVisible({ timeout: 20_000 });
    await manager.getByRole("button", { name: "إنشاء مسودة أمر شراء" }).click();

    const supplierSelect = manager.getByLabel("المورد");
    const warehouseSelect = manager.getByLabel("المخزن المستلم");
    const productSelect = manager.getByLabel("الصنف").first();
    await expect(supplierSelect).toBeEnabled({ timeout: 20_000 });
    await expect(warehouseSelect).toBeEnabled({ timeout: 20_000 });
    await expect(productSelect).toBeEnabled({ timeout: 20_000 });
    const supplierId = await supplierSelect.locator("option").evaluateAll((options) =>
      options.find((option) => (option as HTMLOptionElement).value)?.getAttribute("value") ?? "",
    );
    const warehouseId = await warehouseSelect.locator("option").evaluateAll((options) =>
      options.find((option) => (option as HTMLOptionElement).value)?.getAttribute("value") ?? "",
    );
    const productId = await productSelect.locator("option").evaluateAll((options) =>
      options.find((option) => (option as HTMLOptionElement).value)?.getAttribute("value") ?? "",
    );
    expect(supplierId).toBeTruthy();
    expect(warehouseId).toBeTruthy();
    expect(productId).toBeTruthy();
    await supplierSelect.selectOption(supplierId);
    await warehouseSelect.selectOption(warehouseId);
    await productSelect.selectOption(productId);
    await manager.getByLabel("الكمية المطلوبة").first().fill("2");
    await manager.getByLabel("تكلفة الوحدة (اختياري)").first().fill("");
    const privatePurchaseNote = "E2E_PRIVATE_PO_NOTE_" + Date.now();
    await manager.getByLabel("ملاحظات داخلية للشراء/المخزن").fill(privatePurchaseNote);
    await manager.getByRole("button", { name: "حفظ مسودة أمر الشراء" }).click();
    await expect(manager.getByText(/حُفظت مسودة أمر الشراء من البيانات الحالية/)).toBeVisible({ timeout: 20_000 });

    const purchaseOrderPrintButton = manager.getByRole("button", { name: "طباعة الأمر", exact: true });
    await expect(purchaseOrderPrintButton).toBeEnabled({ timeout: 20_000 });
    await manager.evaluate(() => { delete document.documentElement.dataset.e2ePrintInvoked; });
    await purchaseOrderPrintButton.click();
    await expect.poll(() => manager.evaluate(() => document.documentElement.dataset.e2ePrintInvoked)).toBe("true");
    const orderPrintText = await manager.locator(".po-print-only").textContent() ?? "";
    expect(orderPrintText).toContain("أمر شراء");
    expect(orderPrintText).toContain("غير مسجل");
    expect(orderPrintText).not.toContain(privatePurchaseNote);

    const purchaseResultsPrintButton = manager.getByRole("button", { name: "طباعة النتائج", exact: true });
    await expect(purchaseResultsPrintButton).toBeEnabled();
    await manager.evaluate(() => { delete document.documentElement.dataset.e2ePrintInvoked; });
    await purchaseResultsPrintButton.click();
    await expect.poll(() => manager.evaluate(() => document.documentElement.dataset.e2ePrintInvoked)).toBe("true");
    const resultsPrintText = await manager.locator(".po-print-only").textContent() ?? "";
    expect(resultsPrintText).toContain("سجل أوامر الشراء");
    expect(resultsPrintText).not.toContain(privatePurchaseNote);

    // Stock-count printing must use a print-only allowlist and omit session notes.
    await manager.goto("/admin/stock-count");
    await expect(manager.getByRole("heading", { name: "الجرد الفعلي" })).toBeVisible();
    const stockCountStart = manager.getByRole("button", { name: "بدء جلسة جرد فعلية", exact: true });
    await expect(stockCountStart).toBeEnabled({ timeout: 20_000 });
    const stockCountPrivateNote = "E2E_PRIVATE_STOCK_COUNT_NOTE_" + Date.now();
    await manager.getByLabel("ملاحظات بداية الجرد (اختياري)").fill(stockCountPrivateNote);
    await stockCountStart.click();
    await expect(manager.getByRole("heading", { name: "جلسة الجرد المفتوحة" })).toBeVisible({ timeout: 20_000 });
    const stockCountPrintButton = manager.getByRole("button", { name: "طباعة ورقة الجرد", exact: true });
    await expect(stockCountPrintButton).toBeEnabled();
    await manager.evaluate(() => { delete document.documentElement.dataset.e2ePrintInvoked; });
    await stockCountPrintButton.click();
    await expect.poll(() => manager.evaluate(() => document.documentElement.dataset.e2ePrintInvoked)).toBe("true");
    const stockCountPrintText = await manager.locator(".stock-count-print-document").textContent() ?? "";
    expect(stockCountPrintText).toContain("ورقة الجرد الفعلي");
    expect(stockCountPrintText).not.toContain(stockCountPrivateNote);
    expect(stockCountPrintText).not.toContain("PRIVATE-");

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
        receivablesAgingPrintIsolatedToVisibleReport: true,
        receivablesAgingPrintRestoresScreenAfterAfterPrint: true,
        foreignTenantCustomerAbsentFromStatementOptions: true,
        operationalTaskPrintInvoked: true,
        purchaseOrderPrintInvoked: true,
        purchaseOrderResultPrintInvoked: true,
        purchaseOrderPrintExcludedInternalNote: true,
        purchaseOrderUnknownCostsRemainUnrecorded: true,
        customerPurchaseOrderRouteDeniedBeforePrintMount: true,
        stockCountPrintInvoked: true,
        stockCountPrintExcludedSessionNote: true,
        stockCountPrintUsesPersistedCountsOnly: true,
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
    await expect(accountant.getByRole("heading", { name: "ميزان المراجعة للفترة المحددة" })).toBeVisible({ timeout: 30_000 });
    await assertTrialBalanceDownload(accountant, "accountant");

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
    await customer.goto("/admin/purchase-orders");
    // The app-level RBAC gate rejects customer accounts before the purchasing page mounts.
    await expect(customer.getByRole("heading", { name: "لا تملك صلاحية الإدارة" })).toBeVisible();
    await expect(customer.getByText(/حساب عميل/)).toBeVisible();
    await expect(customer.getByRole("button", { name: /طباعة/ })).toHaveCount(0);
    await expect(customer.locator(".po-print-only")).toHaveCount(0);
  } finally {
    await customerContext.close();
  }
});

test("general journal voucher and full financial statements print in authorized manager and accountant UI", async ({ browser }) => {
  // Both authorized roles sign in separately and each renders two print documents against local Supabase.
  test.setTimeout(10 * 60 * 1000);
  const managerContext = await browser.newContext();
  const manager = await managerContext.newPage();
  const printSetup = () => {
    window.print = () => { document.documentElement.dataset.e2ePrintInvoked = "true"; };
  };
  await managerContext.addInitScript(printSetup);

  async function ensureJournalRow(page: Page): Promise<void> {
    const printButton = page.getByRole("button", { name: "طباعة القيد", exact: true }).first();
    if (await printButton.count() > 0) {
      await expect(printButton).toBeEnabled({ timeout: 30_000 });
      return;
    }

    // The P2 environment is isolated local Supabase. Create a balanced draft only when
    // the preceding return/credit-memo journey did not already create a printable entry.
    const firstRegion = page.getByRole("region", { name: "حقول سطر قيد اليومية 1" });
    const secondRegion = page.getByRole("region", { name: "حقول سطر قيد اليومية 2" });
    await expect(firstRegion).toBeVisible({ timeout: 30_000 });
    await expect(secondRegion).toBeVisible({ timeout: 30_000 });
    const firstAccount = firstRegion.getByLabel("الحساب");
    const options = await firstAccount.locator("option").evaluateAll((items) =>
      items
        .map((item) => (item as HTMLOptionElement).value)
        .filter((value) => value.length > 0),
    );
    expect(options.length, "The isolated tenant must expose at least two active ledger accounts.").toBeGreaterThan(1);

    await firstAccount.selectOption(options[0]);
    await secondRegion.getByLabel("الحساب").selectOption(options[1]);
    await firstRegion.getByLabel("مدين").fill("7.25");
    await secondRegion.getByLabel("دائن").fill("7.25");
    await page.getByLabel("وصف القيد").fill("P2 browser journal print acceptance");
    await page.getByRole("button", { name: "حفظ مسودة القيد", exact: true }).click();
    await expect(page.getByText("تم حفظ مسودة القيد. لن تؤثر في ميزان المراجعة قبل الترحيل.", { exact: true })).toBeVisible({ timeout: 30_000 });
    await expect(printButton).toBeEnabled({ timeout: 30_000 });
  }

  async function assertPrintDocument(page: Page, buttonName: string, heading: string, requiredText: string[]): Promise<void> {
    // Click while screen media is active: shared print isolation hides the application controls
    // after print mode is enabled, so switching media must happen only after the portal opens.
    const printButton = page.getByRole("button", { name: buttonName, exact: true }).first();
    await expect(printButton).toBeEnabled({ timeout: 15_000 });
    await page.evaluate(() => { delete document.documentElement.dataset.e2ePrintInvoked; });
    await printButton.click();
    const sheet = page.getByTestId("general-ledger-print-document");
    await expect(sheet).toBeAttached({ timeout: 15_000 });
    await page.emulateMedia({ media: "print" });
    await expect(sheet).toBeVisible({ timeout: 15_000 });
    await expect(sheet).toHaveAttribute("dir", "rtl");
    await expect(sheet).toHaveAttribute("lang", "ar");
    await expect(sheet.locator("h2")).toHaveText(heading);
    for (const value of requiredText) await expect(sheet).toContainText(value);
    await expect.poll(() => page.evaluate(() => document.documentElement.dataset.e2ePrintInvoked)).toBe("true");
    const html = await sheet.evaluate((element) => element.innerHTML);
    expect(html).not.toMatch(/tenant_id|organization_id|account_id|source_reference|created_by|journal_entry_id/i);
    expect(html).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
    await page.evaluate(() => window.dispatchEvent(new Event("afterprint")));
    await expect(sheet).toHaveCount(0);
    await expect(page.locator("body")).not.toHaveAttribute("data-print-mode", "general-ledger");
    await page.emulateMedia({ media: "screen" });
  }

  try {
    await signIn(manager, requiredEnv("E2E_MANAGER_EMAIL"), requiredEnv("E2E_MANAGER_PASSWORD"));
    await manager.goto("/admin/finance");
    const ledgerWorkspace = manager.getByRole("region", { name: "دفتر الأستاذ العام", exact: true });
    await expect(ledgerWorkspace).toHaveCount(1);
    await expect(ledgerWorkspace.getByRole("heading", { name: "دفتر الأستاذ العام وقيود اليومية", exact: true })).toBeVisible({ timeout: 30_000 });
    await expect(manager.getByRole("button", { name: "طباعة القوائم المالية", exact: true })).toBeEnabled({ timeout: 30_000 });
    await ensureJournalRow(manager);
    await assertPrintDocument(manager, "طباعة القيد", "مستند قيد اليومية", ["تفاصيل القيد المزدوج", "الإجمالي المتوازن", "مدين", "دائن"]);
    await assertPrintDocument(manager, "طباعة القوائم المالية", "القوائم المالية — قائمة الدخل والمركز المالي", ["ملخص قائمة الدخل", "ملخص المركز المالي", "فرق معادلة الميزانية"]);
    await test.info().attach("general-journal-print-manager-proof.json", {
      body: JSON.stringify({
        result: "BROWSER_PROVEN",
        role: "manager",
        isolatedLocalOnly: true,
        journalVoucherPrint: true,
        fullFinancialStatementsPrint: true,
        rtl: true,
        internalIdentifiersAbsent: true,
        printModeRestoredAfterEachDocument: true,
        noProductionWrites: true,
      }, null, 2),
      contentType: "application/json",
    });
  } finally {
    await managerContext.close();
  }

  const accountantContext = await browser.newContext();
  const accountant = await accountantContext.newPage();
  await accountantContext.addInitScript(printSetup);
  try {
    await signIn(accountant, requiredEnv("E2E_ACCOUNTANT_EMAIL"), requiredEnv("E2E_ACCOUNTANT_PASSWORD"));
    await accountant.goto("/admin/finance");
    await expect(accountant.getByRole("heading", { name: "دفتر الأستاذ العام وقيود اليومية" })).toBeVisible({ timeout: 30_000 });
    await expect(accountant.getByRole("button", { name: "طباعة القوائم المالية", exact: true })).toBeEnabled({ timeout: 30_000 });
    await expect(accountant.getByRole("button", { name: "طباعة القيد", exact: true }).first()).toBeEnabled({ timeout: 30_000 });
    await assertPrintDocument(accountant, "طباعة القيد", "مستند قيد اليومية", ["تفاصيل القيد المزدوج", "الإجمالي المتوازن", "مدين", "دائن"]);
    await assertPrintDocument(accountant, "طباعة القوائم المالية", "القوائم المالية — قائمة الدخل والمركز المالي", ["ملخص قائمة الدخل", "ملخص المركز المالي", "فرق معادلة الميزانية"]);
    await test.info().attach("general-journal-print-accountant-proof.json", {
      body: JSON.stringify({
        result: "BROWSER_PROVEN",
        role: "accountant",
        isolatedLocalOnly: true,
        journalVoucherPrint: true,
        fullFinancialStatementsPrint: true,
        rtl: true,
        internalIdentifiersAbsent: true,
        printModeRestoredAfterEachDocument: true,
        noProductionWrites: true,
      }, null, 2),
      contentType: "application/json",
    });
  } finally {
    await accountantContext.close();
  }
});

test("ordinary customer cannot access the tenant trial balance XLSX export", async ({ browser }) => {
  const customerContext = await browser.newContext();
  const customer = await customerContext.newPage();
  try {
    await signIn(customer, requiredEnv("E2E_EMAIL"), requiredEnv("E2E_PASSWORD"));
    await customer.goto("/admin/finance");
    await expect(customer.getByRole("heading", { name: "لا تملك صلاحية الإدارة" })).toBeVisible({ timeout: 20_000 });
    await expect(customer.getByRole("button", { name: "تصدير ميزان المراجعة Excel", exact: true })).toHaveCount(0);
  } finally {
    await customerContext.close();
  }
});
function parseDisplayedMoney(value: string): number {
  const arabicDigits = "٠١٢٣٤٥٦٧٨٩";
  const normalized = value
    .replace(/[٠-٩]/g, (digit) => String(arabicDigits.indexOf(digit)))
    .replace(/[٬,]/g, "")
    .replace(/٫/g, ".")
    .replace(/[^0-9.]/g, "");
  const match = normalized.match(/[0-9]+(?:\.[0-9]+)?/);
  return match ? Number(match[0]) : Number.NaN;
}

async function expectInvoicePaidAndOutstanding(page: Page, invoiceNumber: string, paid: number, outstanding: number): Promise<void> {
  const agingSection = page.locator("section.receivables-aging-report");
  await expect(agingSection).toBeVisible({ timeout: 30_000 });
  const row = agingSection.locator("table tbody tr").filter({ hasText: invoiceNumber });
  await expect(row).toHaveCount(1, { timeout: 30_000 });
  const table = row.locator("xpath=ancestor::table[1]");
  const headers = await table.locator("thead th").allTextContents();
  const paidIndex = headers.findIndex((header) => /مدفوع|المسدد|المسددة/.test(header));
  const outstandingIndex = headers.findIndex((header) => /المتبقي|رصيد متبق/.test(header));
  expect(paidIndex, "The invoice table must expose the paid amount column.").toBeGreaterThan(-1);
  expect(outstandingIndex, "The invoice table must expose the outstanding amount column.").toBeGreaterThan(-1);
  await expect.poll(async () => {
    const cells = await row.locator("td").allTextContents();
    return [parseDisplayedMoney(cells[paidIndex] ?? ""), parseDisplayedMoney(cells[outstandingIndex] ?? "")];
  }).toEqual([paid, outstanding]);
}


test("manager records one receipt across two same-currency customer invoices and safely reprints the saved allocation", async ({ browser }) => {
  test.setTimeout(6 * 60 * 1000);
  const invoiceANumber = requiredEnv("E2E_MULTI_RECEIPT_INVOICE_A_NUMBER");
  const invoiceBNumber = requiredEnv("E2E_MULTI_RECEIPT_INVOICE_B_NUMBER");
  const customerName = requiredEnv("E2E_MULTI_RECEIPT_CUSTOMER_NAME");
  const managerContext = await browser.newContext();
  await managerContext.addInitScript(() => {
    window.print = () => { document.documentElement.dataset.e2ePrintInvoked = "true"; };
    window.close = () => {};
  });
  const manager = await managerContext.newPage();
  let receiptNumber = "";
  try {
    await signIn(manager, requiredEnv("E2E_MANAGER_EMAIL"), requiredEnv("E2E_MANAGER_PASSWORD"));
    await manager.goto("/admin/finance");
    await expect(manager.getByRole("heading", { name: "الفواتير والتحصيل" })).toBeVisible({ timeout: 30_000 });

    // Anchor to the split-receipt toggle: its accessible name remains stable
    // while the submit button changes when split-receipt mode is enabled.
    const splitReceiptToggle = manager.getByLabel(
      "توزيع سند قبض واحد على عدة فواتير للعميل نفسه وبالعملة نفسها",
      { exact: true },
    );
    await expect(splitReceiptToggle).toBeVisible();
    const paymentForm = splitReceiptToggle.locator("xpath=ancestor::form[1]");
    await expect(paymentForm).toHaveCount(1);
    const paymentSelects = paymentForm.locator("select");
    await expect(paymentSelects).toHaveCount(2);
    const primaryInvoice = paymentSelects.first();
    await expect(primaryInvoice).toHaveAttribute("required", "");
    const invoiceAOption = primaryInvoice.locator("option").filter({ hasText: invoiceANumber });
    const invoiceBOption = primaryInvoice.locator("option").filter({ hasText: invoiceBNumber });
    await expect(invoiceAOption).toHaveCount(1, { timeout: 30_000 });
    await expect(invoiceBOption).toHaveCount(1, { timeout: 30_000 });
    const invoiceAId = await invoiceAOption.getAttribute("value");
    const invoiceBId = await invoiceBOption.getAttribute("value");
    expect(invoiceAId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
    expect(invoiceBId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
    expect(invoiceAId).not.toBe(invoiceBId);

    await primaryInvoice.selectOption(invoiceAId!);
    await paymentForm.getByLabel("المبلغ", { exact: true }).fill("25.00");
    await paymentForm.getByLabel("توزيع سند قبض واحد على عدة فواتير للعميل نفسه وبالعملة نفسها", { exact: true }).check();
    const invoiceBAllocation = paymentForm.getByRole("checkbox", { name: "تخصيص على الفاتورة " + invoiceBNumber, exact: true });
    await expect(invoiceBAllocation).toBeVisible();
    await invoiceBAllocation.check();
    await paymentForm.getByLabel("مبلغ التخصيص على الفاتورة " + invoiceBNumber, { exact: true }).fill("35.00");
    const privateNote = "PRIVATE-P2-MULTI-RECEIPT-" + Date.now().toString(36).toUpperCase();
    await paymentForm.locator("textarea").first().fill(privateNote);
    await paymentForm.getByRole("button", { name: "تسجيل سند القبض وتوزيعه", exact: true }).click();
    await expect(manager.getByText("تم تسجيل سند القبض وتوزيعه على 2 فواتير مع تحديث أرصدتها.", { exact: true })).toBeVisible({ timeout: 30_000 });
    await expectInvoicePaidAndOutstanding(manager, invoiceANumber, 25, 75);
    await expectInvoicePaidAndOutstanding(manager, invoiceBNumber, 35, 165);

    const receiptSection = manager.locator('section[aria-labelledby="customer-payment-receipt-print-heading"]');
    await expect(receiptSection.getByRole("heading", { name: "سجل سندات القبض متعددة الفواتير" })).toBeVisible();
    const receiptSelect = receiptSection.getByLabel("سند القبض متعدد الفواتير", { exact: true });
    const savedReceiptOptions = receiptSelect.locator("option").filter({ hasText: /SND-\d{6}/ });
    await expect(savedReceiptOptions).toHaveCount(1, { timeout: 30_000 });
    const receiptLabel = await savedReceiptOptions.first().innerText();
    const receiptNumberMatch = receiptLabel.match(/SND-\d{6}/);
    expect(receiptNumberMatch).not.toBeNull();
    receiptNumber = receiptNumberMatch![0];
    const receiptId = await receiptSelect.inputValue();
    expect(receiptId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);

    async function printSavedReceipt(): Promise<string> {
      const popupPromise = manager.waitForEvent("popup");
      await receiptSection.getByRole("button", { name: "طباعة سند القبض / حفظ PDF", exact: true }).click();
      const printPage = await popupPromise;
      await expect(printPage.locator("html")).toHaveAttribute("lang", "ar");
      await expect(printPage.locator("html")).toHaveAttribute("dir", "rtl");
      await expect(printPage.locator("h1")).toContainText(receiptNumber);
      await expect(printPage.locator("body")).toContainText(customerName);
      await expect(printPage.locator("body")).toContainText(invoiceANumber);
      await expect(printPage.locator("body")).toContainText(invoiceBNumber);
      await expect(printPage.locator("body")).toContainText("YER");
      await expect(printPage.locator("body")).toContainText("عدد الفواتير");
      await expect(printPage.locator("body")).toContainText("إجمالي سند القبض");
      await expect(printPage.locator("body")).toContainText("٢");
      await expect(printPage.locator("body")).toContainText(new Intl.NumberFormat("ar-YE", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(25) + " YER");
      await expect(printPage.locator("body")).toContainText(new Intl.NumberFormat("ar-YE", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(35) + " YER");
      await expect(printPage.locator("body")).toContainText(new Intl.NumberFormat("ar-YE", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(60) + " YER");
      await expect(printPage.locator("body")).toContainText("لا تنشئ الطباعة أي حركة مالية جديدة أو تغيّر الأرصدة");
      await expect.poll(() => printPage.evaluate(() => document.documentElement.dataset.e2ePrintInvoked)).toBe("true", { timeout: 10_000 });
      const styles = await printPage.locator("style").allTextContents();
      expect(styles.join(" ")).toContain("A4");
      const html = await printPage.locator("html").evaluate((element) => element.outerHTML);
      expect(html).not.toContain(privateNote);
      for (const internalKey of ["organization_id", "receipt_id", "customer_id", "invoice_id", "created_by", "actor_id", "idempotency_key", "private_note", "payment_id"]) {
        expect(html).not.toContain(internalKey);
      }
      for (const internalId of [receiptId, invoiceAId!, invoiceBId!]) {
        expect(html).not.toContain(internalId);
      }
      expect(html).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i);
      const pdf = await printPage.pdf({ format: "A4", printBackground: true });
      expect(pdf.byteLength).toBeGreaterThan(1_000);
      expect(new TextDecoder().decode(pdf.slice(0, 8))).toContain("%PDF-");
      await printPage.close();
      return html;
    }

    const firstPrint = await printSavedReceipt();
    const secondPrint = await printSavedReceipt();
    expect(secondPrint).toBe(firstPrint);
    await receiptSection.getByRole("button", { name: "تحديث السجل", exact: true }).click();
    await expect(savedReceiptOptions).toHaveCount(1, { timeout: 30_000 });
    await expect(receiptSelect).toHaveValue(receiptId);
    await expectInvoicePaidAndOutstanding(manager, invoiceANumber, 25, 75);
    await expectInvoicePaidAndOutstanding(manager, invoiceBNumber, 35, 165);
    await manager.reload();
    await expect(manager.getByRole("heading", { name: "الفواتير والتحصيل" })).toBeVisible({ timeout: 30_000 });
    await expect(manager.locator('section[aria-labelledby="customer-payment-receipt-print-heading"]').getByLabel("سند القبض متعدد الفواتير")).toBeVisible();
    await expect(manager.locator('section[aria-labelledby="customer-payment-receipt-print-heading"]').locator("option").filter({ hasText: /SND-\d{6}/ })).toHaveCount(1);
    await expectInvoicePaidAndOutstanding(manager, invoiceANumber, 25, 75);
    await expectInvoicePaidAndOutstanding(manager, invoiceBNumber, 35, 165);
    await test.info().attach("customer-multi-invoice-receipt-browser-proof.json", {
      body: JSON.stringify({
        result: "BROWSER_PROVEN",
        sourceSha: process.env.E2E_SOURCE_SHA ?? "not-provided",
        role: "manager",
        isolatedLocalOnly: true,
        customer: customerName,
        invoices: [
          { number: invoiceANumber, currency: "YER", paid: "25.00", outstanding: "75.00" },
          { number: invoiceBNumber, currency: "YER", paid: "35.00", outstanding: "165.00" }
        ],
        receiptNumber,
        allocationCount: 2,
        receiptTotal: "60.00 YER",
        savedReceiptCountAfterTwoReprintsAndReload: 1,
        invoiceBalancesUnchangedAfterReprints: true,
        repeatedPrintOutputIdentical: true,
        printInvoked: true,
        arabicRtlA4: true,
        privateNotesAndInternalIdsExcluded: true,
        printingCreatesNoFinancialMovement: true,
        noProductionWrites: true
      }, null, 2),
      contentType: "application/json",
    });
  } finally {
    await managerContext.close();
  }

  const customerContext = await browser.newContext();
  const customer = await customerContext.newPage();
  try {
    await signIn(customer, requiredEnv("E2E_EMAIL"), requiredEnv("E2E_PASSWORD"));
    await customer.goto("/admin/finance");
    await expect(customer.getByRole("heading", { name: "لا تملك صلاحية الإدارة" })).toBeVisible({ timeout: 20_000 });
    await expect(customer.getByRole("button", { name: "طباعة سند القبض / حفظ PDF", exact: true })).toHaveCount(0);
    await test.info().attach("customer-multi-invoice-receipt-customer-denial.json", {
      body: JSON.stringify({
        result: "BROWSER_PROVEN",
        sourceSha: process.env.E2E_SOURCE_SHA ?? "not-provided",
        role: "ordinary-customer",
        financeRouteDenied: true,
        receiptPrintControlAbsent: true,
        isolatedLocalOnly: true,
        noProductionWrites: true
      }, null, 2),
      contentType: "application/json",
    });
  } finally {
    await customerContext.close();
  }
});

test("manager opens and prints tenant-scoped Customer 360 as an Arabic A4 PDF", async ({ browser }) => {
  test.setTimeout(90_000);
  const managerContext = await browser.newContext();
  await managerContext.addInitScript(() => {
    window.print = () => {
      document.documentElement.dataset.e2ePrintInvoked = "true";
    };
  });
  const manager = await managerContext.newPage();

  try {
    await signIn(manager, requiredEnv("E2E_MANAGER_EMAIL"), requiredEnv("E2E_MANAGER_PASSWORD"));
    await manager.goto("/admin/customers");
    await expect(manager.getByRole("heading", { name: "إدارة العملاء", exact: true })).toBeVisible({ timeout: 30_000 });

    const customerRow = manager.getByRole("row").filter({ hasText: "P2 Local E2E Customer A" }).first();
    await expect(customerRow).toBeVisible({ timeout: 30_000 });
    const openCustomer360 = customerRow.getByRole("button", { name: "ملف 360", exact: true });
    await expect(openCustomer360).toBeEnabled();
    await openCustomer360.click();

    const dialog = manager.getByRole("dialog").filter({ hasText: "ملف العميل 360" });
    await expect(dialog).toBeVisible();
    const printSheet = manager.getByTestId("customer-360-print-document");
    await expect(printSheet).toContainText("متجر الأغبري | Aghbari Commerce");
    await expect(printSheet).toContainText("P2 Local E2E Customer A");
    await expect(printSheet).toContainText("الدفتر المالي الكامل حسب العملة");
    await expect(printSheet).toHaveAttribute("dir", "rtl");
    await expect(printSheet).toHaveAttribute("lang", "ar");
    expect(await printSheet.evaluate((element) => element.parentElement === document.body)).toBe(true);

    const printHtml = await printSheet.evaluate((element) => element.outerHTML);
    expect(printHtml).not.toContain("P2 Local E2E Customer B");
    for (const internalKey of [
      "organization_id",
      "customer_id",
      "invoice_id",
      "payment_id",
      "created_by",
      "actor_id",
      "cost_price",
      "profit_margin",
      "idempotency_key",
    ]) {
      expect(printHtml).not.toContain(internalKey);
    }
    expect(printHtml).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i);
    expect(printHtml).not.toContain("PRIVATE-");

    await manager.evaluate(() => {
      delete document.documentElement.dataset.e2ePrintInvoked;
    });
    await dialog.getByRole("button", { name: "طباعة / PDF", exact: true }).click();
    await expect.poll(() => manager.evaluate(() => document.documentElement.dataset.e2ePrintInvoked)).toBe("true");

    await manager.emulateMedia({ media: "print" });
    const printMetrics = await printSheet.evaluate((element) => ({
      display: getComputedStyle(element).display,
      visibility: getComputedStyle(element).visibility,
      direction: getComputedStyle(element).direction,
    }));
    expect(printMetrics).toEqual({ display: "block", visibility: "visible", direction: "rtl" });

    const pdf = await manager.pdf({ format: "A4", printBackground: true, preferCSSPageSize: true });
    expect(new TextDecoder().decode(pdf.subarray(0, 5))).toBe("%PDF-");
    expect(pdf.byteLength).toBeGreaterThan(1_000);

    await test.info().attach("customer-360-print-browser-proof.json", {
      body: JSON.stringify({
        result: "BROWSER_PROVEN",
        sourceSha: process.env.E2E_SOURCE_SHA ?? "not-provided",
        role: "manager",
        route: "/admin/customers",
        customer: "P2 Local E2E Customer A",
        otherTenantCustomerExcluded: true,
        printInvoked: true,
        downloadedPdf: true,
        paper: "A4",
        direction: "rtl",
        language: "ar",
        bodyPortalOnlyPrintProjection: true,
        internalIdsTenantActorCostsAndMarginsExcluded: true,
        noProductionWrites: true,
      }, null, 2),
      contentType: "application/json",
    });
  } finally {
    await managerContext.close();
  }
});
