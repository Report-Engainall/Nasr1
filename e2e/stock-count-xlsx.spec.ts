import { readFile } from "node:fs/promises";
import { test, expect, type Page } from "@playwright/test";

test.describe.configure({ retries: 0 });

function requiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(name + " is required for the isolated warehouse stock-count XLSX acceptance.");
  return value;
}

async function signIn(page: Page, email: string, password: string) {
  await page.goto("/login");
  await expect(page.getByRole("heading", { name: "تسجيل الدخول" })).toBeVisible();
  await page.getByLabel("البريد الإلكتروني").fill(email);
  await page.locator('input[autocomplete="current-password"]').fill(password);
  await page.getByRole("button", { name: "دخول", exact: true }).click();
  await expect(page).toHaveURL((url) => new URL(url).pathname === "/", { timeout: 20_000 });
  const authenticated = await page.evaluate(() =>
    Object.entries(window.localStorage).some(([key, value]) => {
      if (!key.endsWith("-auth-token")) return false;
      try {
        const stored = JSON.parse(value) as { access_token?: unknown };
        return typeof stored.access_token === "string" && stored.access_token.length > 20;
      } catch {
        return false;
      }
    }),
  );
  expect(authenticated, "A persisted Supabase session is required before opening the warehouse workspace.").toBe(true);
}

/** Read one stored OOXML ZIP member so the downloaded browser artifact is tested. */
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

test("warehouse manager downloads the saved stock-count snapshot XLSX with no internal metadata", async ({ browser }) => {
  const managerEmail = requiredEnv("E2E_MANAGER_EMAIL");
  const managerPassword = requiredEnv("E2E_MANAGER_PASSWORD");
  const customerEmail = requiredEnv("E2E_EMAIL");
  const customerPassword = requiredEnv("E2E_PASSWORD");
  const runLabel = process.env.GITHUB_RUN_ID?.trim() || "local";
  const sessionNote = "P2 stock-count XLSX acceptance " + runLabel;
  const managerContext = await browser.newContext();
  const manager = await managerContext.newPage();
  const browserErrors: string[] = [];
  manager.on("pageerror", (error) => browserErrors.push(error.message));

  try {
    await test.step("manager starts a source-backed count and saves one real line", async () => {
      await signIn(manager, managerEmail, managerPassword);
      await manager.goto("/admin/stock-count");
      await expect(manager.getByRole("heading", { name: "الجرد الفعلي" })).toBeVisible();
      await expect(manager.getByRole("heading", { name: "لا توجد جلسة جرد مفتوحة" })).toBeVisible();
      await manager.getByPlaceholder("سبب الجرد أو رقم محضر العد").fill(sessionNote);
      await manager.getByRole("button", { name: "بدء جلسة جرد فعلية", exact: true }).click();
      await expect(manager.getByRole("heading", { name: "جلسة الجرد المفتوحة" })).toBeVisible({ timeout: 30_000 });

      const rows = manager.locator("table tbody tr");
      await expect(rows).not.toHaveCount(0);
      const firstRow = rows.first();
      const itemCode = (await firstRow.locator("td").nth(0).innerText()).trim();
      const itemName = (await firstRow.locator("td").nth(1).innerText()).trim();
      expect(itemCode).not.toBe("");
      expect(itemName).not.toBe("");
      await firstRow.locator('input[type="number"]').fill("99");
      await firstRow.getByRole("button", { name: "حفظ العد", exact: true }).click();
      await expect(manager.getByRole("status")).toContainText("تم حفظ عدّ " + itemName, { timeout: 20_000 });
    });

    await test.step("manager downloads and parses the actual XLSX", async () => {
      const exportButton = manager.getByRole("button", { name: "تصدير الجرد إلى Excel", exact: true });
      await expect(exportButton).toBeEnabled();
      const downloadPromise = manager.waitForEvent("download");
      await exportButton.click();
      const download = await downloadPromise;
      expect(await download.failure()).toBeNull();
      expect(download.suggestedFilename()).toMatch(/^aghbari-stock-count-\d{4}-\d{2}-\d{2}\.xlsx$/);

      const downloadPath = await download.path();
      expect(downloadPath).not.toBeNull();
      const workbookBytes = new Uint8Array(await readFile(downloadPath!));
      expect([...workbookBytes.slice(0, 4)]).toEqual([0x50, 0x4b, 0x03, 0x04]);

      const workbookXml = readStoredZipEntry(workbookBytes, "xl/workbook.xml");
      const summaryXml = readStoredZipEntry(workbookBytes, "xl/worksheets/sheet1.xml");
      const detailsXml = readStoredZipEntry(workbookBytes, "xl/worksheets/sheet2.xml");
      expect(workbookXml).toContain("ملخص الجرد");
      expect(workbookXml).toContain("تفاصيل الجرد");
      expect(summaryXml).toContain(sessionNote);
      expect(summaryXml).toContain("العدود المحفوظة");
      expect(summaryXml).toContain("مصدر الكميات");
      expect(summaryXml).toContain("لا يتضمن الملف معرفات المؤسسة");
      const firstRow = manager.locator("table tbody tr").first();
      const itemCode = (await firstRow.locator("td").nth(0).innerText()).trim();
      const itemName = (await firstRow.locator("td").nth(1).innerText()).trim();
      expect(detailsXml).toContain(itemCode);
      expect(detailsXml).toContain(itemName);
      expect(detailsXml).toContain('<c r="F2" t="n"><v>99</v></c>');
      const exportedXml = workbookXml + "\n" + summaryXml + "\n" + detailsXml;
      expect(exportedXml).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i);
      expect(exportedXml).not.toMatch(/<f(?:\s|>)/i);
      expect(exportedXml).not.toMatch(/(?:organization_id|warehouse_id|session_id|product_id|started_by|counted_by|idempotency_key|cost_price|purchase_price|unit_cost|profit_margin|gross_profit)/i);
      expect(browserErrors, "The inventory stock-count and export path must not throw uncaught browser errors.").toEqual([]);

      await test.info().attach("stock-count-xlsx-browser-proof.json", {
        body: JSON.stringify({
          result: "BROWSER_PROVEN",
          sourceSha: process.env.E2E_SOURCE_SHA ?? "not-provided",
          downloadedFile: download.suggestedFilename(),
          workbookSheets: ["ملخص الجرد", "تفاصيل الجرد"],
          itemCode,
          itemName,
          savedCount: 99,
          source: "persisted local Supabase stock-count snapshot",
          sessionNoteIncluded: true,
          internalIdentifiersOrFinancialCostsPresent: false,
          formulaCellsPresent: false,
          productionWrites: false
        }, null, 2),
        contentType: "application/json"
      });
    });

    await test.step("manager cancels the test snapshot without applying inventory movements", async () => {
      await manager.getByLabel("سبب إلغاء الجلسة").fill("إلغاء جلسة اختبار تصدير الجرد؛ لم يتم اعتماد أي فرق.");
      const dialogPromise = manager.waitForEvent("dialog").then(async (dialog) => {
        expect(dialog.type()).toBe("confirm");
        expect(dialog.message()).toContain("إلغاء الجلسة دون تطبيق أي فرق");
        const message = dialog.message();
        // Accept while the click is waiting for the native confirmation dialog to close.
        await dialog.accept();
        return message;
      });
      await manager.getByRole("button", { name: "إلغاء الجلسة دون تعديل الرصيد", exact: true }).click();
      await dialogPromise;
      await expect(manager.getByRole("status")).toContainText("أُلغيت الجلسة وسُجل السبب في التدقيق.", { timeout: 20_000 });
      await expect(manager.getByRole("heading", { name: "لا توجد جلسة جرد مفتوحة" })).toBeVisible();
    });
  } finally {
    await managerContext.close();
  }

  const customerContext = await browser.newContext();
  const customer = await customerContext.newPage();
  try {
    await test.step("ordinary customer cannot open the stock-count workspace or its export", async () => {
      await signIn(customer, customerEmail, customerPassword);
      await customer.goto("/admin/stock-count");
      await expect(customer.getByRole("heading", { name: "لا تملك صلاحية الإدارة" })).toBeVisible();
      await expect(customer.getByRole("button", { name: "تصدير الجرد إلى Excel" })).toHaveCount(0);
    });
  } finally {
    await customerContext.close();
  }
});
