import { randomUUID } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { expect, test, type Page } from "@playwright/test";

test.describe.configure({ retries: 0 });

function requiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(name + " is required for local category-tree browser acceptance.");
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

test("mounted category tree creates a parent and child, persists parent_id, and restores deep links", async ({ browser }) => {
  test.setTimeout(150_000);
  const sourceSha = requiredEnv("E2E_SOURCE_SHA");
  const localSupabase = new URL(requiredEnv("SUPABASE_URL"));
  if (
    localSupabase.protocol !== "http:" ||
    !["localhost", "127.0.0.1", "::1"].includes(localSupabase.hostname) ||
    localSupabase.port !== "54321"
  ) {
    throw new Error("Category-tree browser acceptance is restricted to the disposable local Supabase API.");
  }

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

    await expect(manager.locator(".admin-category-details__header p")).toHaveText(rootName + " / " + childName);
    await expect(manager.locator(".admin-category-meta > div").nth(1).locator("strong")).toHaveText(rootName);

    // A full reload forces the category tree to rebuild from fetchCategories(), not React state.
    await manager.reload();
    await expect(manager.getByRole("heading", { name: childName, exact: true })).toBeVisible({ timeout: 30_000 });
    await expect(manager.locator(".admin-category-details__header p")).toHaveText(rootName + " / " + childName);
    await expect(manager.locator(".admin-category-meta > div").nth(1).locator("strong")).toHaveText(rootName);
    await expect(manager.getByRole("button", { name: childName, exact: true })).toBeVisible();
    expect(new URL(manager.url()).searchParams.get("category")).toBe(childId);

    // Prove the parent controls only presentation and the child remains nested under it.
    const collapse = manager.getByRole("button", { name: "طي الفروع", exact: true });
    await expect(collapse).toBeVisible();
    await collapse.click();
    await expect(manager.getByRole("button", { name: childName, exact: true })).toHaveCount(0);
    await manager.getByRole("listitem").filter({ hasText: rootName }).getByRole("button", { name: "فتح الفروع", exact: true }).click();
    await expect(manager.getByRole("button", { name: childName, exact: true })).toBeVisible();

    await manager.getByRole("button", { name: rootName, exact: true }).click();
    await expect(manager.getByRole("heading", { name: rootName, exact: true })).toBeVisible();
    await manager.getByRole("tab", { name: "التصنيفات الفرعية", exact: true }).click();
    const childrenPanel = manager.locator(".admin-category-child-list");
    await expect(childrenPanel.getByRole("button", { name: childName, exact: true })).toBeVisible();

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
    const proof = {
      result: "PASS",
      browserResult: "BROWSER_PROVEN",
      sourceSha,
      environment: "disposable-local-supabase-postgresql-17-only",
      route: "/admin/categories",
      role: "manager",
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
    await managerContext.close().catch(() => undefined);
  }
});
