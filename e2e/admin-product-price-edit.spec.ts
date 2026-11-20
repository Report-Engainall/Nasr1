import { writeFile } from "node:fs/promises";
import { test, expect, type Page, type Locator } from "@playwright/test";

test.describe.configure({ retries: 0 });

function requiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(name + " is required for isolated product-price editor acceptance.");
  return value;
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

type Prices = {
  base: string;
  vip: string;
  wholesale: string;
  retail: string;
};

const ORIGINAL: Prices = { base: "38500", vip: "35500", wholesale: "37000", retail: "38500" };
const EDITED: Prices = { base: "39000", vip: "36000", wholesale: "37500", retail: "39500" };
const PRODUCT_NAME = "P2 Local E2E Product";

async function openProductEditor(page: Page): Promise<Locator> {
  const row = page.getByRole("row").filter({ hasText: PRODUCT_NAME }).first();
  await expect(row, "The isolated product fixture must be present in the tenant's admin catalog.").toBeVisible({ timeout: 30_000 });
  await row.getByRole("button", { name: "تعديل " + PRODUCT_NAME, exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "تعديل المنتج", exact: true });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByLabel("السعر الأساسي")).toBeEnabled({ timeout: 30_000 });
  await expect(dialog.getByLabel("سعر جملة الجملة")).toBeEnabled({ timeout: 30_000 });
  await expect(dialog.getByLabel("سعر الجملة")).toBeEnabled({ timeout: 30_000 });
  await expect(dialog.getByLabel("سعر التجزئة")).toBeEnabled({ timeout: 30_000 });
  return dialog;
}

async function expectPrices(dialog: Locator, prices: Prices): Promise<void> {
  await expect(dialog.getByLabel("السعر الأساسي")).toHaveValue(prices.base);
  await expect(dialog.getByLabel("سعر جملة الجملة")).toHaveValue(prices.vip);
  await expect(dialog.getByLabel("سعر الجملة")).toHaveValue(prices.wholesale);
  await expect(dialog.getByLabel("سعر التجزئة")).toHaveValue(prices.retail);
}

async function fillPrices(dialog: Locator, prices: Prices): Promise<void> {
  await dialog.getByLabel("السعر الأساسي").fill(prices.base);
  await dialog.getByLabel("سعر جملة الجملة").fill(prices.vip);
  await dialog.getByLabel("سعر الجملة").fill(prices.wholesale);
  await dialog.getByLabel("سعر التجزئة").fill(prices.retail);
}

async function savePrices(dialog: Locator): Promise<void> {
  const scrollBody = dialog.locator(".modal-body");
  await expect(scrollBody).toBeVisible();
  await scrollBody.evaluate((element) => {
    element.scrollTop = element.scrollHeight;
  });
  const saveButton = dialog.getByRole("button", { name: "حفظ المنتج", exact: true });
  await expect(saveButton).toBeInViewport();
  await saveButton.click();
  await expect(dialog).toBeHidden({ timeout: 30_000 });
}

test("manager reads, edits, reloads and restores all four product prices through the product editor", async ({ browser }) => {
  test.setTimeout(180_000);
  const managerContext = await browser.newContext();
  const manager = await managerContext.newPage();
  const browserErrors: string[] = [];
  manager.on("pageerror", (error) => browserErrors.push(error.message));
  let editedPricesCommitted = false;
  let originalPricesRestored = false;

  try {
    await signIn(manager, requiredEnv("E2E_MANAGER_EMAIL"), requiredEnv("E2E_MANAGER_PASSWORD"));
    await manager.goto("/admin/products");
    await expect(manager.getByRole("heading", { name: "إدارة المنتجات", exact: true })).toBeVisible({ timeout: 30_000 });
    const search = manager.getByPlaceholder("ابحث بالاسم أو الرمز أو SKU أو الباركود...");
    await search.fill("P2-LOCAL-E2E-001");

    const initialEditor = await openProductEditor(manager);
    await expectPrices(initialEditor, ORIGINAL);
    await fillPrices(initialEditor, EDITED);
    await savePrices(initialEditor);
    editedPricesCommitted = true;

    // Reopen the modal: values must be reread from the tenant/role-protected server RPC,
    // not retained in the previous React form state.
    const reloadedEditor = await openProductEditor(manager);
    await expectPrices(reloadedEditor, EDITED);

    // Restore the isolated fixture so later browser tests continue using their original baseline.
    await fillPrices(reloadedEditor, ORIGINAL);
    await savePrices(reloadedEditor);
    originalPricesRestored = true;

    const restoredEditor = await openProductEditor(manager);
    await expectPrices(restoredEditor, ORIGINAL);
    await restoredEditor.getByRole("button", { name: "إلغاء", exact: true }).click();
    await expect(restoredEditor).toBeHidden();

    expect(browserErrors, "The product editor must not throw browser runtime errors.").toEqual([]);
    const proof = {
      result: "PASS",
      browserResult: "BROWSER_PROVEN",
      sourceSha: requiredEnv("E2E_SOURCE_SHA"),
      environment: "isolated-local-supabase-postgresql-17",
      role: "manager",
      productFixture: PRODUCT_NAME,
      tiers: ["base", "vip", "wholesale", "retail"],
      readInitialSnapshot: ORIGINAL,
      editAllFourPrices: EDITED,
      reopenedFromServerAndConfirmed: true,
      restoredFixturePrices: originalPricesRestored,
      fixtureRestoredAndReopened: true,
      browserRuntimeErrors: browserErrors,
      noProductionWrites: true,
    };
    await writeFile(requiredEnv("E2E_PROOF_PATH"), JSON.stringify(proof, null, 2) + "\n", "utf8");
    await test.info().attach("admin-product-tier-price-editor-browser-proof.json", {
      body: JSON.stringify(proof, null, 2),
      contentType: "application/json",
    });
  } finally {
    // If an assertion failed after the first successful write, best-effort restore the local
    // fixture. The entire database is ephemeral, but restore protects the remaining CI steps.
    if (editedPricesCommitted && !originalPricesRestored) {
      try {
        const dialog = manager.getByRole("dialog", { name: "تعديل المنتج", exact: true });
        if (!(await dialog.isVisible().catch(() => false))) {
          await searchAgain(manager);
        }
        const activeDialog = manager.getByRole("dialog", { name: "تعديل المنتج", exact: true });
        await expect(activeDialog).toBeVisible({ timeout: 10_000 });
        await fillPrices(activeDialog, ORIGINAL);
        await savePrices(activeDialog);
      } catch {
        // The primary assertion remains the test result; the database is destroyed by P2 cleanup.
      }
    }
    await managerContext.close().catch(() => undefined);
  }
});

async function searchAgain(page: Page): Promise<void> {
  const search = page.getByPlaceholder("ابحث بالاسم أو الرمز أو SKU أو الباركود...");
  await search.fill("P2-LOCAL-E2E-001");
  const row = page.getByRole("row").filter({ hasText: PRODUCT_NAME }).first();
  await expect(row).toBeVisible({ timeout: 15_000 });
  await row.getByRole("button", { name: "تعديل " + PRODUCT_NAME, exact: true }).click();
}
