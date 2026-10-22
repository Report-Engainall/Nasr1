import { readFile } from "node:fs/promises";
import { test, expect, type Page } from "@playwright/test";

function requiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(name + " is required for the isolated local Onyx XLSX acceptance.");
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
  expect(authenticated, "A persisted local Supabase session is required before accessing the staff order queue.").toBe(true);
}

/** This workbook writer uses ZIP stored entries (method 0); reject an unreadable or compressed target. */
function readStoredZipEntry(input: Uint8Array, targetPath: string): string {
  const view = new DataView(input.buffer, input.byteOffset, input.byteLength);
  const decoder = new TextDecoder();
  let offset = 0;
  while (offset + 30 <= input.byteLength) {
    if (view.getUint32(offset, true) !== 0x04034b50) break;
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

test("manager order detail downloads the persisted-audit 27-column Onyx XLSX", async ({ page }) => {
  const managerEmail = requiredEnv("E2E_MANAGER_EMAIL");
  const managerPassword = requiredEnv("E2E_MANAGER_PASSWORD");
  const orderId = requiredEnv("E2E_RETURN_ORDER_ID");
  const orderNumber = requiredEnv("E2E_RETURN_ORDER_NUMBER");
  const browserErrors: string[] = [];
  const exportRpcFailures: string[] = [];

  page.on("pageerror", (error) => browserErrors.push(error.message));
  page.on("response", (response) => {
    let pathname = "";
    try { pathname = new URL(response.url()).pathname; } catch { return; }
    if (pathname === "/rest/v1/rpc/record_onyx_order_export" && response.status() >= 400) {
      exportRpcFailures.push(response.status() + " " + response.request().method() + " " + pathname);
    }
  });

  await signIn(page, managerEmail, managerPassword);
  await page.goto("/admin/orders");
  await expect(page.getByRole("heading", { name: "الطلبات" })).toBeVisible();
  await expect(page.getByRole("button", { name: "إدارة المرتجعات", exact: true })).toBeVisible();

  const orderRow = page.getByRole("row").filter({ hasText: orderNumber });
  await expect(orderRow, "The pre-seeded, delivered local order must be visible in the manager's tenant-scoped queue.").toBeVisible();
  await orderRow.getByRole("button", { name: "تفاصيل", exact: true }).click();
  await expect(page.getByRole("heading", { name: "الطلب #" + orderNumber })).toBeVisible();

  const exportButton = page.getByRole("button", { name: /تنزيل XLSX للأونكس/ });
  await expect(exportButton, "Only an approved persisted order with loaded lines and snapshot state may be exported.").toBeEnabled({ timeout: 30_000 });
  const downloadPromise = page.waitForEvent("download");
  await exportButton.click();
  const download = await downloadPromise;
  expect(await download.failure()).toBeNull();
  expect(download.suggestedFilename()).toMatch(/^Aghbari-Onyx-[A-Za-z0-9_-]+\.xlsx$/);

  const path = await download.path();
  expect(path, "Browser must produce a completed local download artifact.").not.toBeNull();
  const artifact = new Uint8Array(await readFile(path!));
  expect([...artifact.slice(0, 4)]).toEqual([0x50, 0x4b, 0x03, 0x04]);

  const detailXml = readStoredZipEntry(artifact, "xl/worksheets/sheet1.xml");
  const headerXml = readStoredZipEntry(artifact, "xl/worksheets/sheet2.xml");
  const firstRow = detailXml.match(/<row r="1"[^>]*>([\s\S]*?)<\/row>/);
  const itemRow = detailXml.match(/<row r="2"[^>]*>([\s\S]*?)<\/row>/);
  expect(firstRow, "The detail worksheet must include its reference header row.").not.toBeNull();
  expect(itemRow, "The detail worksheet must contain the persisted order item.").not.toBeNull();
  expect([...firstRow![1].matchAll(/<c\b/g)]).toHaveLength(27);
  // Blank XLSX cells are intentionally omitted; assert the 27-column schema and the actual populated column refs.
  expect([...firstRow![1].matchAll(/<c\b/g)]).toHaveLength(27);
  expect([...itemRow![1].matchAll(/<c\b/g)]).toHaveLength(6);
  for (const ref of ["A2", "B2", "C2", "E2", "G2", "W2"]) expect(itemRow![1]).toContain(`r="${ref}"`);
  expect(detailXml).toContain('<autoFilter ref="A1:AA2"/>');
  expect(detailXml).toContain("P2-RET-001");
  expect(headerXml).toContain(orderNumber);
  expect(headerXml).toContain("معرف سجل التدقيق المركزي");
  expect(headerXml).toContain(orderId);
  expect(headerXml).toContain("حالة توافق أونكس");
  expect(headerXml).toContain("غير مثبت");
  expect(headerXml).toContain("لم يتم ربط لقطة مصدر");
  expect(headerXml).toContain("معرف لقطة مصدر أونكس المختارة");
  const auditCell = headerXml.match(/<c r="B5"[^>]*>[\s\S]*?<t>([\s\S]*?)<\/t>[\s\S]*?<\/c>/);
  expect(auditCell?.[1], "The downloaded artifact must bind the server-returned audit ID.").toMatch(
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
  );
  expect(exportRpcFailures, "An export may not complete if the server audit RPC failed.").toEqual([]);
  expect(browserErrors, "The actual order-to-export UI path must not throw uncaught errors.").toEqual([]);

  await test.info().attach("onyx-order-export-browser-proof.json", {
    body: JSON.stringify({
      result: "BROWSER_PROVEN",
      sourceSha: process.env.E2E_SOURCE_SHA ?? "not-provided",
      orderId,
      orderNumber,
      downloadedFile: download.suggestedFilename(),
      worksheetColumnCount: 27,
      persistedAuditIdEmbedded: auditCell?.[1],
      sourceSnapshotSelected: false,
      targetOnyxCompatibility: "NOT_PROVEN / BLOCKED_EXTERNAL",
      productionWrites: false,
    }),
    contentType: "application/json",
  });
});
