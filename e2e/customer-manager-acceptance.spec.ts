import { expect, test, type Page } from "@playwright/test";

function env(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(name + " is required after the dedicated non-production customer-manager fixture gate passes.");
  return value;
}

const managerFixtureReady = [
  "E2E_CUSTOMER_MANAGER_EMAIL",
  "E2E_CUSTOMER_MANAGER_PASSWORD",
  "E2E_CUSTOMER_MANAGER_CUSTOMER_ID",
  "E2E_CUSTOMER_MANAGER_CUSTOMER_NAME",
  "E2E_CUSTOMER_MANAGER_ORIGINAL_TIER",
  "E2E_CUSTOMER_MANAGER_NEXT_TIER",
  "E2E_FOREIGN_CUSTOMER_ID",
  "E2E_FOREIGN_CUSTOMER_TIER",
  "E2E_MANAGER_EMAIL",
  "E2E_MANAGER_PASSWORD",
].every((key) => Boolean(process.env[key]?.trim()));

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

test("customer-manager customer lifecycle is tenant-scoped and non-financial in the authenticated browser", async ({ browser }) => {
  test.skip(
    !managerFixtureReady,
    "BLOCKED_EXTERNAL: needs a dedicated non-production customer_manager login, approved/unlinked synthetic customer, foreign-tenant customer fixture, and manager audit account. This skip is not acceptance.",
  );

  const managerEmail = env("E2E_CUSTOMER_MANAGER_EMAIL");
  const managerPassword = env("E2E_CUSTOMER_MANAGER_PASSWORD");
  const customerId = env("E2E_CUSTOMER_MANAGER_CUSTOMER_ID");
  const customerName = env("E2E_CUSTOMER_MANAGER_CUSTOMER_NAME");
  const originalTier = env("E2E_CUSTOMER_MANAGER_ORIGINAL_TIER");
  const nextTier = env("E2E_CUSTOMER_MANAGER_NEXT_TIER");
  const foreignCustomerId = env("E2E_FOREIGN_CUSTOMER_ID");
  const foreignCustomerTier = env("E2E_FOREIGN_CUSTOMER_TIER");
  const auditorEmail = env("E2E_MANAGER_EMAIL");
  const auditorPassword = env("E2E_MANAGER_PASSWORD");

  expect(["retail", "wholesale", "vip"]).toContain(originalTier);
  expect(["retail", "wholesale", "vip"]).toContain(nextTier);
  expect(nextTier).not.toBe(originalTier);
  expect(customerId).toMatch(/^[0-9a-f-]{36}$/i);
  expect(foreignCustomerId).toMatch(/^[0-9a-f-]{36}$/i);
  expect(foreignCustomerId).not.toBe(customerId);
  expect(foreignCustomerTier).toBe(originalTier);

  const managerContext = await browser.newContext();
  const manager = await managerContext.newPage();
  const directoryResponses: string[] = [];
  let supabaseOrigin = "";
  let publishableKey = "";
  manager.on("request", (request) => {
    try {
      const url = new URL(request.url());
      if (url.pathname.startsWith("/rest/v1/rpc/")) {
        supabaseOrigin = url.origin;
        publishableKey = request.headers()["apikey"] ?? publishableKey;
      }
    } catch {
      // Ignore non-URL requests; browser diagnostics below remain authoritative.
    }
  });
  manager.on("response", async (response) => {
    try {
      const url = new URL(response.url());
      if (url.pathname.endsWith("/rest/v1/rpc/fetch_customer_manager_directory")) {
        directoryResponses.push(await response.text());
      }
    } catch {
      // Non-text resources are irrelevant to the directory projection contract.
    }
  });

  try {
    await signIn(manager, managerEmail, managerPassword);
    await manager.goto("/admin/customers");
    await expect(manager.getByRole("heading", { name: "إدارة العملاء" })).toBeVisible();

    const search = manager.getByLabel("البحث في دليل العملاء");
    await search.fill(customerName);
    await manager.getByRole("button", { name: "بحث", exact: true }).click();

    const customerRow = manager.getByRole("row").filter({ hasText: customerName }).first();
    await expect(customerRow).toBeVisible({ timeout: 20_000 });
    await expect(customerRow).toContainText(customerName);
    await expect(manager.getByRole("columnheader", { name: "الرصيد", exact: true })).toHaveCount(0);
    await expect(manager.getByRole("columnheader", { name: "الحد الائتماني", exact: true })).toHaveCount(0);
    await expect(manager.getByText("ملف 360", { exact: true })).toHaveCount(0);
    await expect.poll(() => directoryResponses.length).toBeGreaterThan(0);
    for (const responseBody of directoryResponses) {
      expect(responseBody).not.toMatch(/"current_balance"\s*:/i);
      expect(responseBody).not.toMatch(/"credit_limit"\s*:/i);
      expect(responseBody).not.toMatch(/"cost_price"\s*:/i);
    }

    // Attempt a non-mutating cross-tenant command against a foreign synthetic customer.
    // The requested tier equals the fixture's current tier, so a broken tenant predicate
    // could only return "unchanged"; the expected response is a server-side denial.
    const accessToken = await manager.evaluate(() => {
      const entry = Object.entries(window.localStorage).find(([key]) => key.endsWith("-auth-token"));
      if (!entry) return "";
      try {
        const value = JSON.parse(entry[1]) as { access_token?: unknown };
        return typeof value.access_token === "string" ? value.access_token : "";
      } catch {
        return "";
      }
    });
    expect(accessToken.length).toBeGreaterThan(20);
    expect(supabaseOrigin).toContain("://");
    expect(publishableKey.length).toBeGreaterThan(10);
    const crossTenant = await manager.request.post(
      supabaseOrigin + "/rest/v1/rpc/set_admin_customer_tier",
      {
        headers: { apikey: publishableKey, Authorization: "Bearer " + accessToken },
        data: {
          p_customer_id: foreignCustomerId,
          p_expected_tier: foreignCustomerTier,
          p_tier: foreignCustomerTier,
          p_reason: "E2E cross-tenant denial check",
        },
      },
    );
    expect(crossTenant.ok(), "foreign-tenant customer updates must be denied by the server").toBe(false);
    expect(await crossTenant.text()).toMatch(/customer not found|current organization|42501|P0002/i);

    // Activation invitation is a server-backed, one-time link, not a fake auto-send.
    await customerRow.getByRole("button", { name: "دعوة تفعيل", exact: true }).click();
    await expect(manager.getByRole("heading", { name: "دعوة العميل للدخول" })).toBeVisible();
    await manager.getByRole("button", { name: "إنشاء رابط تفعيل صالح 72 ساعة", exact: true }).click();
    await expect(manager.getByRole("status").filter({ hasText: "أنشأ الخادم رابط تفعيل" })).toBeVisible({ timeout: 20_000 });
    await expect(manager.getByLabel("رابط التفعيل — انسخه وشاركه يدويًا")).toHaveValue(/customer\/activate\//i);

    manager.on("dialog", async (dialog) => { await dialog.accept(); });
    await manager.getByRole("button", { name: "إلغاء الدعوة", exact: true }).first().click();
    await expect(manager.getByRole("status").filter({ hasText: "أُلغي رابط التفعيل في الخادم" })).toBeVisible({ timeout: 20_000 });

    // Change the price tier, then restore the original tier after the lifecycle proof.
    await customerRow.getByRole("button", { name: "تغيير الشريحة", exact: true }).click();
    await manager.getByLabel("شريحة العميل الجديدة").selectOption(nextTier);
    await manager.getByLabel("سبب تغيير الشريحة").fill("Playwright قبول شريحة مسؤول العملاء");
    await manager.getByRole("button", { name: "حفظ تغيير الشريحة", exact: true }).click();
    await expect(manager.getByRole("status").filter({ hasText: "تم تحديث شريحة العميل وتسجيل السبب في سجل التدقيق" })).toBeVisible({ timeout: 20_000 });

    // Prove the lifecycle command is accepted and then return the synthetic fixture to approved.
    await customerRow.getByRole("button", { name: "إدارة دورة الحياة", exact: true }).click();
    await manager.getByLabel("حالة العميل الجديدة").selectOption("frozen");
    await manager.getByLabel("سبب تغيير الحالة").fill("Playwright تجميد مؤقت لاختبار الصلاحيات");
    await manager.getByRole("button", { name: "حفظ تغيير الحالة", exact: true }).click();
    await expect(manager.getByRole("status").filter({ hasText: "تم تغيير حالة العميل إلى" })).toBeVisible({ timeout: 20_000 });

    await customerRow.getByRole("button", { name: "إدارة دورة الحياة", exact: true }).click();
    await manager.getByLabel("حالة العميل الجديدة").selectOption("approved");
    await manager.getByLabel("سبب تغيير الحالة").fill("Playwright إعادة العميل للحالة المعتمدة");
    await manager.getByRole("button", { name: "حفظ تغيير الحالة", exact: true }).click();
    await expect(manager.getByRole("status").filter({ hasText: "تم تغيير حالة العميل إلى" })).toBeVisible({ timeout: 20_000 });

    await customerRow.getByRole("button", { name: "تغيير الشريحة", exact: true }).click();
    await manager.getByLabel("شريحة العميل الجديدة").selectOption(originalTier);
    await manager.getByLabel("سبب تغيير الشريحة").fill("Playwright إعادة الشريحة الأصلية للاختبار");
    await manager.getByRole("button", { name: "حفظ تغيير الشريحة", exact: true }).click();
    await expect(manager.getByRole("status").filter({ hasText: "تم تحديث شريحة العميل وتسجيل السبب في سجل التدقيق" })).toBeVisible({ timeout: 20_000 });

    // Customer managers must not gain finance/admin access by navigating directly.
    await manager.goto("/admin/finance");
    await expect(manager.getByText(/هذا الدور مخصص لدليل العملاء/)).toBeVisible();
    await expect(manager.getByRole("heading", { name: "الفواتير والتحصيل" })).toHaveCount(0);
    await manager.goto("/admin/audit");
    await expect(manager.getByText(/هذا الدور مخصص لدليل العملاء/)).toBeVisible();
    await expect(manager.getByRole("heading", { name: "سجل التدقيق" })).toHaveCount(0);
  } finally {
    await managerContext.close();
  }

  // Audit details are read through an authorized manager account, not by elevating customer_manager.
  const auditorContext = await browser.newContext();
  const auditor = await auditorContext.newPage();
  try {
    await signIn(auditor, auditorEmail, auditorPassword);
    await auditor.goto("/admin/audit");
    await expect(auditor.getByRole("heading", { name: "سجل التدقيق" })).toBeVisible();
    const auditSearch = auditor.getByLabel("بحث في الإجراء أو الكيان أو المعرّف");
    await auditSearch.fill(customerId.slice(0, 8));
    const auditRows = auditor.locator("tbody");
    await expect(auditRows).toContainText("customer.tier_changed");
    await expect(auditRows).toContainText("customer.status_changed");
    await test.info().attach("customer-manager-browser-acceptance.json", {
      body: JSON.stringify({
        result: "BROWSER_PROVEN",
        sourceSha: process.env.E2E_SOURCE_SHA ?? "not-provided",
        isolatedNonProductionOnly: true,
        customerId,
        financialColumnsAndResponseFieldsAbsent: true,
        foreignTenantCommandDenied: true,
        activationInviteCreatedAndRevoked: true,
        customerTierChangedAndRestored: true,
        lifecycleChangedAndRestored: true,
        auditRowsConfirmed: ["customer.tier_changed", "customer.status_changed"],
        directFinanceAndAuditRoutesDenied: true,
      }, null, 2),
      contentType: "application/json",
    });
  } finally {
    await auditorContext.close();
  }
});
