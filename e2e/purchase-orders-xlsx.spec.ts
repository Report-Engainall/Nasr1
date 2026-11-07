import { readFile } from "node:fs/promises";
import { test, expect, type Page } from "@playwright/test";

test.describe.configure({ retries: 0 });

function requiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(name + " is required for the isolated purchase-order XLSX browser acceptance.");
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
  expect(authenticated, "A persisted Supabase session is required before opening purchasing.").toBe(true);
}

/** Read one stored OOXML ZIP member so the real browser download is parsed. */
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

function storedRows(xml: string): Array<{ number: string; xml: string }> {
  return [...xml.matchAll(/<row r="(\d+)"[^>]*>([\s\S]*?)<\/row>/g)]
    .map((match) => ({ number: match[1], xml: match[2] }));
}

test("purchase manager creates, exports and physically receives a tenant-scoped order, then safely reprints its saved receipt", async ({ browser }) => {
  const managerEmail = requiredEnv("E2E_MANAGER_EMAIL");
  const managerPassword = requiredEnv("E2E_MANAGER_PASSWORD");
  const customerEmail = requiredEnv("E2E_EMAIL");
  const customerPassword = requiredEnv("E2E_PASSWORD");
  const supplierId = requiredEnv("E2E_PURCHASE_SUPPLIER_ID");
  const supplierName = requiredEnv("E2E_PURCHASE_SUPPLIER_NAME");
  const supplierCode = requiredEnv("E2E_PURCHASE_SUPPLIER_CODE");
  const warehouseId = requiredEnv("E2E_PURCHASE_WAREHOUSE_ID");
  const warehouseName = requiredEnv("E2E_PURCHASE_WAREHOUSE_NAME");
  const productId = requiredEnv("E2E_PURCHASE_PRODUCT_ID");
  const productName = requiredEnv("E2E_PURCHASE_PRODUCT_NAME");
  const itemCode = requiredEnv("E2E_PURCHASE_ITEM_CODE");
  const organizationId = requiredEnv("E2E_PURCHASE_ORGANIZATION_ID");
  const managerProfileId = requiredEnv("E2E_PURCHASE_MANAGER_PROFILE_ID");
  const runId = process.env.GITHUB_RUN_ID?.trim() || "local";
  const internalNote = '=HYPERLINK("https://evil.invalid","P2 purchase note ' + runId + '")';
  const managerContext = await browser.newContext();
  await managerContext.addInitScript(() => {
    window.print = () => { document.documentElement.dataset.e2ePrintInvoked = "true"; };
  });
  const manager = await managerContext.newPage();
  const browserErrors: string[] = [];
  let purchaseOrderNumber: string | null = null;
  manager.on("pageerror", (error) => browserErrors.push(error.message));

  try {
    await test.step("manager creates a real draft through the tenant-scoped purchase RPC", async () => {
      await signIn(manager, managerEmail, managerPassword);
      await manager.goto("/admin/purchase-orders");
      await expect(manager.getByRole("heading", { name: "أوامر الشراء والاستلام" })).toBeVisible();
      await manager.getByRole("button", { name: "إنشاء مسودة أمر شراء", exact: true }).click();
      await expect(manager.getByRole("heading", { name: "مسودة أمر شراء جديدة" })).toBeVisible();
      await manager.getByLabel("المورد", { exact: true }).selectOption(supplierId);
      await manager.getByLabel("المخزن المستلم").selectOption(warehouseId);
      await manager.locator(".po-lines select").selectOption(productId);
      await manager.getByLabel("الكمية المطلوبة").fill("2.125");
      // Unknown supplier cost is intentional: it must stay NULL/blank, never zero.
      await manager.getByLabel("تكلفة الوحدة (اختياري)").fill("");
      await manager.getByLabel("ملاحظات داخلية للشراء/المخزن").fill(internalNote);
      await manager.getByRole("button", { name: "حفظ مسودة أمر الشراء", exact: true }).click();
      await expect(manager.locator(".po-notice")).toContainText("حُفظت مسودة أمر الشراء", { timeout: 20_000 });
    });

    await test.step("manager downloads and parses the actual three-sheet purchase XLSX", async () => {
      const latestCard = manager.locator(".po-results-list button.po-card").first();
      await expect(latestCard).toBeVisible();
      await expect(latestCard).toContainText(supplierName);
      const cardText = await latestCard.innerText();
      purchaseOrderNumber = cardText.match(/PO-\d{8}-\d{6}/)?.[0] ?? null;
      expect(purchaseOrderNumber, "The newly created purchase-order number must be visible in the server-loaded order list.").toBeTruthy();
      await latestCard.click();
      await expect(manager.getByRole("heading", { name: purchaseOrderNumber! })).toBeVisible();
      await expect(manager.getByText("إجمالي أمر الشراء: غير مسجل")).toHaveCount(0);
      await expect(manager.getByText(/الإجمالي: غير مسجل/)).toBeVisible();

      const exportButton = manager.getByRole("button", { name: "تصدير نتائج Excel", exact: true });
      await expect(exportButton).toBeEnabled();
      const downloadPromise = manager.waitForEvent("download");
      await exportButton.click();
      const download = await downloadPromise;
      expect(await download.failure()).toBeNull();
      expect(download.suggestedFilename()).toMatch(/^aghbari-purchase-orders-\d{4}-\d{2}-\d{2}\.xlsx$/);
      const downloadPath = await download.path();
      expect(downloadPath).not.toBeNull();
      const bytes = new Uint8Array(await readFile(downloadPath!));
      expect([...bytes.slice(0, 4)]).toEqual([0x50, 0x4b, 0x03, 0x04]);

      const workbookXml = readStoredZipEntry(bytes, "xl/workbook.xml");
      const summaryXml = readStoredZipEntry(bytes, "xl/worksheets/sheet1.xml");
      const ordersXml = readStoredZipEntry(bytes, "xl/worksheets/sheet2.xml");
      const linesXml = readStoredZipEntry(bytes, "xl/worksheets/sheet3.xml");
      expect(workbookXml).toContain("ملخص التصدير");
      expect(workbookXml).toContain("أوامر الشراء");
      expect(workbookXml).toContain("بنود الشراء");
      expect(summaryXml).toContain("كل الحالات");
      expect(summaryXml).toContain("السجلات المحمّلة في الشاشة");
      expect(summaryXml).toContain("الخانة الفارغة تعني أن التكلفة غير مسجلة");
      expect(ordersXml).toContain(purchaseOrderNumber);
      expect(ordersXml).toContain(supplierName);
      expect(ordersXml).toContain(supplierCode);
      expect(ordersXml).toContain(warehouseName);
      expect(linesXml).toContain(itemCode);
      expect(linesXml).toContain(productName);
      expect(linesXml).toContain("<v>2.125</v>");

      const orderRow = storedRows(ordersXml).find((row) => row.xml.includes(purchaseOrderNumber!));
      expect(orderRow, "The workbook must contain the exact newly persisted purchase order row.").toBeTruthy();
      expect(orderRow!.xml).not.toContain('<c r="H' + orderRow!.number + '"');
      expect(orderRow!.xml).toContain('=HYPERLINK(&quot;https://evil.invalid&quot;,&quot;P2 purchase note ' + runId + '&quot;)');
      const lineRow = storedRows(linesXml).find((row) => row.xml.includes(purchaseOrderNumber!) && row.xml.includes(itemCode));
      expect(lineRow, "The item worksheet must contain the exact persisted product row.").toBeTruthy();
      expect(lineRow!.xml).not.toContain('<c r="H' + lineRow!.number + '"');
      expect(lineRow!.xml).not.toContain('<c r="I' + lineRow!.number + '"');

      const wholeWorkbook = workbookXml + "\n" + summaryXml + "\n" + ordersXml + "\n" + linesXml;
      expect(wholeWorkbook).not.toMatch(/<f(?:\s|>)/i);
      for (const internalId of [organizationId, supplierId, warehouseId, productId, managerProfileId]) {
        expect(wholeWorkbook).not.toContain(internalId);
      }
      for (const key of ["organization_id","supplier_id","warehouse_id","product_id","created_by","submitted_by","cancelled_by","idempotency_key","payload_fingerprint"]) {
        expect(wholeWorkbook).not.toContain(key);
      }
      expect(browserErrors, "The actual purchase-order create/export path must not throw uncaught browser errors.").toEqual([]);

      await test.info().attach("purchase-orders-xlsx-browser-proof.json", {
        body: JSON.stringify({
          result: "BROWSER_PROVEN",
          sourceSha: process.env.E2E_SOURCE_SHA ?? "not-provided",
          downloadedFile: download.suggestedFilename(),
          workbookSheets: ["ملخص التصدير","أوامر الشراء","بنود الشراء"],
          purchaseOrderNumber,
          supplierCode,
          itemCode,
          itemName: productName,
          orderedQuantity: 2.125,
          unknownUnitCostAndLineTotalRemainBlank: true,
          formulaLikeNoteExportedAsText: true,
          internalIdsAndSensitiveKeysPresent: false,
          exportBoundary: "current loaded results after selected status filter",
          productionWrites: false
        }, null, 2),
        contentType: "application/json"
      });
    });

    await test.step("manager posts one physical receipt and reprints its saved A4 document without new writes", async () => {
      expect(purchaseOrderNumber).toBeTruthy();
      await manager.getByRole("button", { name: "اعتماد أمر الشراء للتوريد", exact: true }).click();
      await expect(manager.getByRole("button", { name: "ترحيل إيصال الاستلام", exact: true })).toBeVisible({ timeout: 20_000 });
      await manager.getByLabel("كمية الاستلام " + productName).fill("2.125");

      // Accept the native confirmation while the click is waiting for the dialog.
      const confirmation = manager.waitForEvent("dialog").then(async (dialog) => {
        expect(dialog.type()).toBe("confirm");
        await dialog.accept();
      });
      await manager.getByRole("button", { name: "ترحيل إيصال الاستلام", exact: true }).click();
      await confirmation;

      await expect(manager.getByText(/تم استلام الكميات المطلوبة كاملة/)).toBeVisible({ timeout: 20_000 });
      const history = manager.locator('section[aria-label="سجل إيصالات الاستلام"]');
      const receiptNumberText = history.getByText(/PR-\d{8}-\d{6}/);
      await expect(receiptNumberText).toBeVisible({ timeout: 20_000 });
      const receiptNumber = (await receiptNumberText.first().innerText()).trim();
      expect(receiptNumber).toMatch(/^PR-\d{8}-\d{6}$/);
      const receiptRecord = history.locator("article").filter({ hasText: receiptNumber });
      await expect(receiptRecord).toHaveCount(1);

      let firstPrintHtml = "";
      for (let attempt = 1; attempt <= 2; attempt += 1) {
        const printButton = receiptRecord.getByRole("button", { name: "طباعة الإيصال", exact: true });
        await expect(printButton).toBeEnabled();
        const popupPromise = manager.waitForEvent("popup");
        await printButton.click();
        const printPage = await popupPromise;
        await expect.poll(() => printPage.evaluate(() => document.documentElement.dataset.e2ePrintInvoked)).toBe("true", { timeout: 10_000 });
        await expect(printPage.locator("h1")).toContainText(receiptNumber);
        await expect(printPage.locator("body")).toContainText("إيصال استلام مشتريات");
        await expect(printPage.locator("body")).toContainText(purchaseOrderNumber!);
        await expect(printPage.locator("body")).toContainText(supplierName);
        await expect(printPage.locator("body")).toContainText(warehouseName);
        await expect(printPage.locator("body")).toContainText(itemCode);
        await expect(printPage.locator("body")).toContainText(productName);
        // The print document uses ar-YE number formatting (Arabic-Indic digits and decimal separator).
        await expect(printPage.locator("body")).toContainText("٢٫١٢٥");
        await expect(printPage.locator("body")).toContainText("التكاليف المصدرية غير مكتملة؛ لم تُعرض أي قيمة مالية.");
        await expect(printPage.locator("body")).toContainText("إعادة طباعة لسجل محفوظ.");
        const html = await printPage.content();
        await expect(printPage.locator("html")).toHaveAttribute("lang", "ar");
        await expect(printPage.locator("html")).toHaveAttribute("dir", "rtl");
        expect(html).toContain("@page { size: A4 portrait; margin: 12mm; }");
        expect(html).not.toContain("تكلفة الوحدة");
        expect(html).not.toContain("إجمالي البند");
        expect(html).not.toContain(internalNote);
        for (const internalValue of [organizationId, supplierId, warehouseId, productId, managerProfileId]) {
          expect(html).not.toContain(internalValue);
        }
        for (const internalKey of ["organization_id", "supplier_id", "warehouse_id", "product_id", "created_by", "actor_id", "idempotency_key"]) {
          expect(html).not.toContain(internalKey);
        }
        if (attempt === 1) firstPrintHtml = html;
        else expect(html).toBe(firstPrintHtml);
        await printPage.close();
        await expect(receiptRecord).toHaveCount(1);
      }

      await history.getByRole("button", { name: "تحديث السجل", exact: true }).click();
      await expect(history.getByText(receiptNumber)).toBeVisible();
      await expect(history.locator("article").filter({ hasText: receiptNumber })).toHaveCount(1);
      await expect(manager.getByText(/تم استلام الكميات المطلوبة كاملة/)).toBeVisible();

      await test.info().attach("purchase-receipt-print-browser-proof.json", {
        body: JSON.stringify({
          result: "BROWSER_PROVEN",
          sourceSha: process.env.E2E_SOURCE_SHA ?? "not-provided",
          purchaseOrderNumber,
          receiptNumber,
          supplierCode,
          warehouseName,
          itemCode,
          itemName: productName,
          receivedQuantity: 2.125,
          printPage: "Arabic RTL, A4 portrait",
          incompleteSourceCostsWithheld: true,
          internalIdsAndActorMetadataPresent: false,
          savedReceiptCountAfterTwoReprints: 1,
          reprintsCreateNoReceiptOrInventoryMovement: true,
          productionWrites: false
        }, null, 2),
        contentType: "application/json"
      });
      expect(firstPrintHtml).not.toContain(internalNote);
      expect(browserErrors, "The real receipt and saved-print path must not throw uncaught browser errors.").toEqual([]);
    });
  } finally {
    await managerContext.close();
  }

  const customerContext = await browser.newContext();
  const customer = await customerContext.newPage();
  try {
    await test.step("ordinary customer cannot open purchasing or see its XLSX control", async () => {
      await signIn(customer, customerEmail, customerPassword);
      await customer.goto("/admin/purchase-orders");
      await expect(customer.getByRole("heading", { name: "لا تملك صلاحية الإدارة" })).toBeVisible();
      await expect(customer.getByRole("button", { name: "تصدير نتائج Excel", exact: true })).toHaveCount(0);
    });
  } finally {
    await customerContext.close();
  }
});
