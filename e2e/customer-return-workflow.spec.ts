import { readFile } from "node:fs/promises";
import { test, expect, type Page } from "@playwright/test";

test.describe.configure({ retries: 0 });

function requiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(name + " is required for the isolated customer-return browser acceptance.");
  return value;
}

async function signIn(page: Page, email: string, password: string) {
  await page.goto("/login");
  await expect(page.getByRole("heading", { name: "تسجيل الدخول" })).toBeVisible();
  await page.getByLabel("البريد الإلكتروني").fill(email);
  await page.locator('input[autocomplete="current-password"]').fill(password);
  await page.getByRole("button", { name: "دخول", exact: true }).click();
  await expect(page).toHaveURL((url) => new URL(url).pathname === "/", { timeout: 20_000 });

  const hasSupabaseSession = await page.evaluate(() =>
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
  expect(hasSupabaseSession, "Sign-in must persist a real local Supabase session before the return workflow starts.").toBe(true);
}


/** Read one stored OOXML ZIP member so the browser artifact is tested, not only the workbook builder. */
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

test("customer return request -> manager approval -> warehouse receipt -> post and reverse source-linked credit memo", async ({ browser }) => {
  const customerEmail = requiredEnv("E2E_EMAIL");
  const customerPassword = requiredEnv("E2E_PASSWORD");
  const managerEmail = requiredEnv("E2E_MANAGER_EMAIL");
  const managerPassword = requiredEnv("E2E_MANAGER_PASSWORD");
  const accountantEmail = requiredEnv("E2E_ACCOUNTANT_EMAIL");
  const accountantPassword = requiredEnv("E2E_ACCOUNTANT_PASSWORD");
  const administratorEmail = requiredEnv("E2E_DEVICE_ADMIN_EMAIL");
  const administratorPassword = requiredEnv("E2E_DEVICE_ADMIN_PASSWORD");
  const orderId = requiredEnv("E2E_RETURN_ORDER_ID");
  const orderNumber = requiredEnv("E2E_RETURN_ORDER_NUMBER");
  const itemName = requiredEnv("E2E_RETURN_ITEM_NAME");
  const receivableAccountId = requiredEnv("E2E_RETURN_RECEIVABLE_ACCOUNT_ID");
  const revenueAccountId = requiredEnv("E2E_RETURN_REVENUE_ACCOUNT_ID");

  const customerContext = await browser.newContext();
  const staffContext = await browser.newContext();
  // Keep task-page authentication isolated: re-authenticating in another tab
  // must not change the finance dialog's per-tab session while it is open.
  const tasksContext = await browser.newContext();
  const reversalContext = await browser.newContext();
  const customer = await customerContext.newPage();
  const staff = await staffContext.newPage();
  const completedStages: string[] = [];

  try {
    await test.step("customer submits a return request against a delivered order", async () => {
      await signIn(customer, customerEmail, customerPassword);
      await customer.goto("/orders/" + orderId);
      await expect(customer.getByRole("heading", { name: "طلب إرجاع / مرتجع" })).toBeVisible();
      const quantity = customer.getByLabel("كمية الإرجاع: " + itemName);
      await expect(quantity).toBeVisible();
      await quantity.fill("1");
      await customer.locator("form select").selectOption("damaged");
      await customer.getByRole("button", { name: "إرسال طلب الإرجاع", exact: true }).click();
      await expect(customer.getByText(/تم تسجيل طلب الإرجاع:/)).toBeVisible();
      await expect(customer.getByText("مرسل للمراجعة", { exact: true })).toBeVisible();
      completedStages.push("customer_return_request_submitted");
    });

    await test.step("ordinary customer cannot see staff return operations", async () => {
      await customer.goto("/admin/orders");
      await expect(customer.getByRole("button", { name: "إدارة المرتجعات" })).toHaveCount(0);
      completedStages.push("customer_staff_controls_hidden");
    });

    await test.step("manager reviews and approves the source request", async () => {
      await signIn(staff, managerEmail, managerPassword);
      await staff.goto("/admin/orders");
      const openOperations = staff.getByRole("button", { name: "إدارة المرتجعات", exact: true });
      await expect(openOperations).toBeVisible();
      await openOperations.click();
      const dialog = staff.getByRole("dialog", { name: "مساحة مراجعة واستلام المرتجعات" });
      await expect(dialog.getByRole("heading", { name: "مراجعة طلبات المرتجعات" })).toBeVisible();
      const reviewSection = dialog.locator('section[aria-labelledby="return-review-heading"]');
      const row = reviewSection.locator("article").filter({ hasText: orderNumber });
      await expect(row).toBeVisible();

      await test.step("manager downloads and verifies the real current-queue XLSX", async () => {
        const exportButton = reviewSection.getByRole("button", { name: "تصدير كل النتائج المطابقة", exact: true });
        await expect(exportButton).toBeEnabled();
        const downloadPromise = staff.waitForEvent("download");
        await exportButton.click();
        const download = await downloadPromise;
        expect(await download.failure()).toBeNull();
        expect(download.suggestedFilename()).toMatch(/^aghbari-customer-return-review-\d{4}-\d{2}-\d{2}\.xlsx$/);
        const downloadPath = await download.path();
        expect(downloadPath).not.toBeNull();
        const workbookBytes = new Uint8Array(await readFile(downloadPath!));
        expect([...workbookBytes.slice(0, 4)]).toEqual([0x50, 0x4b, 0x03, 0x04]);

        const workbookXml = readStoredZipEntry(workbookBytes, "xl/workbook.xml");
        const summaryXml = readStoredZipEntry(workbookBytes, "xl/worksheets/sheet1.xml");
        const detailsXml = readStoredZipEntry(workbookBytes, "xl/worksheets/sheet2.xml");
        expect(workbookXml).toContain("طلبات المراجعة");
        expect(workbookXml).toContain("أصناف المرتجعات");
        expect(summaryXml).toContain(orderNumber);
        expect(summaryXml).toContain("جميع طلبات المراجعة المفتوحة المطابقة للمرشحات وقت القراءة");
        expect(summaryXml).toContain("الحد الآمن 1000 طلب و25000 سطر صنف");
        expect(summaryXml).toContain("يتوقف التصدير دون ملف جزئي عند تجاوز الحد أو تغيّر مصدر القراءة");
        expect(summaryXml).toContain("ملاحظات العميل والمعرفات التقنية غير مضمنة");
        expect(detailsXml).toContain(itemName);
        const exportedXml = summaryXml + "\n" + detailsXml;
        expect(exportedXml).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i);
        expect(exportedXml).not.toMatch(/<f(?:\s|>)/i);
        expect(exportedXml).not.toContain(orderId);
        expect(exportedXml).not.toContain("order_id");
        expect(exportedXml).not.toContain("organization_id");
        completedStages.push("manager_return_review_xlsx_downloaded_and_parsed");

        await test.info().attach("customer-return-review-xlsx-proof.json", {
          body: JSON.stringify({
            result: "BROWSER_PROVEN",
            sourceSha: process.env.E2E_SOURCE_SHA ?? "not-provided",
            filename: download.suggestedFilename(),
            workbookSheets: ["طلبات المراجعة", "أصناف المرتجعات"],
            orderNumber,
            itemName,
            maxReturnedRequests: 1000,
            maxItemRows: 25000,
            scope: "current open manager queue only",
            internalUuidOrTenantIdPresent: false,
            formulaCellsPresent: false
          }, null, 2),
          contentType: "application/json"
        });
      });

      await row.locator('textarea[aria-label^="مبرر قرار "]').fill("Playwright evidence: inspect and approve the return.");
      await row.getByRole("button", { name: "قبول وتحويل للفحص" }).click();
      await expect(dialog.getByText(/تمت الموافقة على/)).toBeVisible();
      completedStages.push("manager_review_approved");
    });

    await test.step("warehouse staff records inspected quantity and only restockable quantity", async () => {
      const dialog = staff.getByRole("dialog", { name: "مساحة مراجعة واستلام المرتجعات" });
      await dialog.getByRole("tab", { name: "الاستلام والفحص" }).click();
      const receiptSection = dialog.locator('section[aria-labelledby="return-receipt-heading"]');
      await expect(receiptSection.getByRole("heading", { name: "استلام المرتجعات وفحصها" })).toBeVisible();
      const row = receiptSection.locator("article").filter({ hasText: orderNumber });
      await expect(row).toBeVisible();
      await row.getByLabel("الكمية المستلمة").fill("1");
      await row.getByLabel("الصالح للمخزون").fill("0.75");
      await row.getByRole("button", { name: "تسجيل الاستلام والفحص" }).click();
      await expect(dialog.getByText(/تم حفظ .*الصالح للمخزون/)).toBeVisible();
      await expect(receiptSection.getByText("لا توجد مرتجعات معتمدة بانتظار الاستلام الفعلي.", { exact: true })).toBeVisible();
      completedStages.push("warehouse_receipt_saved");
    });

    await test.step("finance prepares a draft credit memo from the original invoice values", async () => {
      await staff.goto("/admin/finance");
      const openFinance = staff.getByRole("button", { name: "إشعارات المرتجعات الدائنة", exact: true });
      await expect(openFinance).toBeVisible();
      await openFinance.click();
      const dialog = staff.getByRole("dialog", { name: "مساحة إشعارات المرتجعات الدائنة" });
      const creditSection = dialog.locator('section[aria-labelledby="return-credit-heading"]');
      await expect(creditSection.getByRole("heading", { name: "الإشعارات الدائنة للمرتجعات" })).toBeVisible();
      const row = creditSection.locator("article").filter({ hasText: orderNumber });
      await expect(row).toBeVisible();
      await creditSection.getByLabel("حساب ذمم العملاء (أصل)").selectOption(receivableAccountId);
      await creditSection.getByLabel("حساب تخفيض الإيراد / مرتجعات المبيعات").selectOption(revenueAccountId);
      await row.getByRole("button", { name: "إعداد الإشعار ومسودة القيد" }).click();
      await expect(dialog.getByText(/أُعد مسودّة الإشعار/)).toBeVisible();
      await expect(row.getByText("مسودة محاسبية", { exact: true })).toBeVisible();
      await expect(row.getByRole("button", { name: "ترحيل القيد", exact: true })).toBeVisible();
      const amount100 = await staff.evaluate(() =>
        new Intl.NumberFormat("ar-YE", { style: "currency", currency: "YER", maximumFractionDigits: 2 }).format(100),
      );
      const amountZero = await staff.evaluate(() =>
        new Intl.NumberFormat("ar-YE", { style: "currency", currency: "YER", maximumFractionDigits: 2 }).format(0),
      );
      await expect(row).toContainText(amount100);
      await expect(row).toContainText(amountZero);
      await expect(row).toContainText("(draft)");
      const memoNumber = (await row.innerText()).match(/CRM-\d{8}-[A-F0-9]{8}/i)?.[0];
      expect(memoNumber, "draft credit memo exposes its source document number").toBeTruthy();
      const taskTitle = "مراجعة وترحيل قيد الإشعار الدائن " + memoNumber;
      const tasksPage = await tasksContext.newPage();
      // The memo was prepared by the manager (maker). Use the separately seeded
      // accountant identity as checker; the journal-post capability rejects self-approval.
      await signIn(tasksPage, accountantEmail, accountantPassword);
      await tasksPage.goto("/admin/tasks");
      const openCreditTask = tasksPage.locator(".task-card").filter({ hasText: taskTitle });
      await expect(openCreditTask).toBeVisible();
      await expect(openCreditTask.locator(".task-role-badge")).toHaveText("المحاسبة والتحصيل");
      await expect(openCreditTask.getByText("بانتظار التنفيذ", { exact: true })).toBeVisible();
      completedStages.push("accountant_task_visible_while_credit_memo_journal_is_draft");

      const accountantFinancePage = await tasksContext.newPage();
      await accountantFinancePage.goto("/admin/finance");
      const openAccountantFinance = accountantFinancePage.getByRole("button", { name: "إشعارات المرتجعات الدائنة", exact: true });
      await expect(openAccountantFinance).toBeVisible();
      await openAccountantFinance.click();
      const accountantFinanceDialog = accountantFinancePage.getByRole("dialog", { name: "مساحة إشعارات المرتجعات الدائنة" });
      const accountantCreditSection = accountantFinanceDialog.locator('section[aria-labelledby="return-credit-heading"]');
      const postedRow = accountantCreditSection.locator("article").filter({ hasText: orderNumber });
      await expect(postedRow).toBeVisible();
      await expect(postedRow.getByText("مسودة محاسبية", { exact: true })).toBeVisible();
      await expect(postedRow.getByRole("button", { name: "ترحيل القيد", exact: true })).toBeVisible();

      await postedRow.getByRole("button", { name: "ترحيل القيد", exact: true }).click();
      await expect(postedRow.getByText("مرحل", { exact: true })).toBeVisible();
      await expect(postedRow.getByRole("button", { name: "ترحيل القيد", exact: true })).toHaveCount(0);
      await expect(postedRow.getByRole("button", { name: "عكس الإشعار والقيد", exact: true })).toBeVisible();

      await tasksPage.goto("/admin/tasks");
      await tasksPage.getByLabel("الحالة").selectOption("completed");
      const completedCreditTask = tasksPage.locator(".task-card").filter({ hasText: taskTitle });
      await expect(completedCreditTask).toBeVisible();
      await expect(completedCreditTask.getByText("مكتملة", { exact: true })).toBeVisible();
      await expect(completedCreditTask.getByText(/أُغلقت بعد ترحيل القيد/)).toBeVisible();
      await accountantFinancePage.close();
      await tasksPage.close();
      completedStages.push("accountant_task_closed_after_credit_journal_posting");
      completedStages.push("credit_memo_journal_posted_by_independent_checker");

      const reversalReason = "Playwright UI reversal acceptance after posted credit.";
      const administratorPage = await reversalContext.newPage();
      await signIn(administratorPage, administratorEmail, administratorPassword);
      await administratorPage.goto("/admin/finance");
      const openAdministratorFinance = administratorPage.getByRole("button", { name: "إشعارات المرتجعات الدائنة", exact: true });
      await expect(openAdministratorFinance).toBeVisible();
      await openAdministratorFinance.click();
      const administratorDialog = administratorPage.getByRole("dialog", { name: "مساحة إشعارات المرتجعات الدائنة" });
      const administratorSection = administratorDialog.locator('section[aria-labelledby="return-credit-heading"]');
      const administratorRow = administratorSection.locator("article").filter({ hasText: orderNumber });
      await expect(administratorRow).toBeVisible();
      await administratorRow.getByLabel(/^سبب عكس الإشعار/).fill(reversalReason);
      await administratorRow.getByRole("button", { name: "إعداد مسودة قيد العكس", exact: true }).click();
      await expect(administratorRow.getByText("مسودة قيد العكس بانتظار مُرحِّل مستقل.")).toBeVisible();
      await expect(administratorRow.getByRole("button", { name: "ترحيل قيد العكس", exact: true })).toBeEnabled();
      completedStages.push("administrator_prepared_source_linked_reversal_draft");

      await administratorRow.getByRole("button", { name: "ترحيل قيد العكس", exact: true }).click();
      await expect(administratorSection.getByRole("alert")).toContainText("checker different from the reversal maker");
      await expect(administratorRow.getByText("مسودة قيد العكس بانتظار مُرحِّل مستقل.")).toBeVisible();
      completedStages.push("reversal_maker_self_post_denied_without_state_change");
      await administratorPage.close();

      const accountantReversalPage = await tasksContext.newPage();
      // The accountant session remains scoped to tasksContext after its first page closes.
      await accountantReversalPage.goto("/admin/finance");
      const openAccountantReversalFinance = accountantReversalPage.getByRole("button", { name: "إشعارات المرتجعات الدائنة", exact: true });
      await expect(openAccountantReversalFinance).toBeVisible();
      await openAccountantReversalFinance.click();
      const accountantReversalDialog = accountantReversalPage.getByRole("dialog", { name: "مساحة إشعارات المرتجعات الدائنة" });
      const accountantReversalSection = accountantReversalDialog.locator('section[aria-labelledby="return-credit-heading"]');
      const postedRow = accountantReversalSection.locator("article").filter({ hasText: orderNumber });
      await expect(postedRow.getByText("مسودة قيد العكس بانتظار مُرحِّل مستقل.")).toBeVisible();
      await postedRow.getByRole("button", { name: "ترحيل قيد العكس", exact: true }).click();
      await expect(postedRow.getByText("معكوس ماليًا", { exact: true })).toBeVisible();
      await expect(postedRow).toContainText("رقم قيد العكس:");
      await expect(postedRow).toContainText(reversalReason);
      await expect(postedRow).toContainText("لم يُنشأ استرداد نقدي أو حركة مخزون.");
      await expect(postedRow.getByRole("button", { name: "ترحيل قيد العكس", exact: true })).toHaveCount(0);
      completedStages.push("credit_memo_reversal_posted_by_independent_checker_and_visible_from_ui");
      await accountantReversalPage.close();
    });

    await test.info().attach("customer-return-workflow-proof.json", {
      body: JSON.stringify({
        status: "BROWSER_PROVEN",
        sourceSha: process.env.E2E_SOURCE_SHA ?? "not-provided",
        isolatedLocalOnly: true,
        orderNumber,
        stages: completedStages,
        expectedCreditMemoSubtotalYER: 100,
        expectedSourceInvoiceTaxYER: 0,
        creditMemoState: "reversed_after_posted_original_journal",
        reversalJournalState: "posted",
        noCashRefund: true,
        noStockMovement: true,
      }, null, 2),
      contentType: "application/json",
    });
  } finally {
    await reversalContext.close();
    await tasksContext.close();
    await staffContext.close();
    await customerContext.close();
  }
});
