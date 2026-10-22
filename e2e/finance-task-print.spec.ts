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

test("authorized finance documents and operational-task print remain tenant-scoped in the real UI", async ({ browser }) => {
  const managerEmail = requiredEnv("E2E_MANAGER_EMAIL");
  const managerPassword = requiredEnv("E2E_MANAGER_PASSWORD");
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
    await printPopup(manager, printButton, [invoiceNumber, "P2 Local E2E Customer A"]);
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
