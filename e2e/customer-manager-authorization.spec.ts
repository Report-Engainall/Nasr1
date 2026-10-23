import { expect, test, type Page } from "@playwright/test";
import postgres from "postgres";

const CUSTOMER_MANAGER_EMAIL = requiredEnv("E2E_CUSTOMER_MANAGER_EMAIL");
const CUSTOMER_MANAGER_PASSWORD = requiredEnv("E2E_CUSTOMER_MANAGER_PASSWORD");
const CUSTOMER_EMAIL = requiredEnv("E2E_EMAIL");
const CUSTOMER_PASSWORD = requiredEnv("E2E_PASSWORD");
const AUDITOR_EMAIL = requiredEnv("E2E_MANAGER_EMAIL");
const AUDITOR_PASSWORD = requiredEnv("E2E_MANAGER_PASSWORD");
const CUSTOMER_MANAGER_PROFILE_ID = requiredEnv("E2E_CUSTOMER_MANAGER_PROFILE_ID");
const TARGET_NAME = requiredEnv("E2E_CUSTOMER_MANAGER_TARGET_NAME");
const TARGET_EMAIL = requiredEnv("E2E_CUSTOMER_MANAGER_TARGET_EMAIL");
const ORGANIZATION_ID = requiredEnv("E2E_CUSTOMER_MANAGER_ORGANIZATION_ID");
const SUPABASE_URL = requiredEnv("E2E_SUPABASE_URL");
const PUBLISHABLE_KEY = requiredEnv("E2E_SUPABASE_PUBLISHABLE_KEY");
const DATABASE_URL = requiredEnv("TEST_DATABASE_URL");

function requiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(name + " is required; authenticated customer-manager acceptance must not silently skip.");
  return value;
}

function assertLoopbackOnly(): void {
  const api = new URL(SUPABASE_URL);
  const database = new URL(DATABASE_URL);
  if (api.protocol !== "http:" || !["127.0.0.1", "localhost"].includes(api.hostname) || api.port !== "54321") {
    throw new Error("Customer-manager E2E may use only the isolated local Supabase API on loopback:54321.");
  }
  if (
    !["127.0.0.1", "localhost"].includes(database.hostname) ||
    !["54322", "55432"].includes(database.port)
  ) {
    throw new Error("Customer-manager E2E database assertions may use only isolated local PostgreSQL on loopback ports 54322 or 55432.");
  }
}

type SessionResult = { accessToken: string };

async function signIn(page: Page, email: string, password: string): Promise<SessionResult> {
  await page.goto("/login");
  await expect(page.getByRole("heading", { name: "تسجيل الدخول" })).toBeVisible();
  await page.getByLabel("البريد الإلكتروني").fill(email);
  await page.locator('input[autocomplete="current-password"]').fill(password);
  await page.getByRole("button", { name: "دخول", exact: true }).click();
  await expect(page).toHaveURL((url) => new URL(url).pathname === "/", { timeout: 20_000 });
  const accessToken = await page.evaluate(() => {
    for (const [key, value] of Object.entries(window.localStorage)) {
      if (!key.endsWith("-auth-token")) continue;
      try {
        const parsed = JSON.parse(value) as { access_token?: unknown };
        if (typeof parsed.access_token === "string" && parsed.access_token.length > 20) return parsed.access_token;
      } catch {
        // Ignore unrelated local-storage entries; never expose tokens in test output.
      }
    }
    return null;
  });
  expect(accessToken, "Sign-in must persist a real local Supabase session.").toBeTruthy();
  return { accessToken: accessToken! };
}

async function postgrestRequest(
  token: string,
  endpoint: string,
  method: "GET" | "POST",
  body?: Record<string, unknown>,
): Promise<Response> {
  return fetch(new URL(endpoint, SUPABASE_URL), {
    method,
    headers: {
      apikey: PUBLISHABLE_KEY,
      Authorization: "Bearer " + token,
      Accept: "application/json",
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
}

function collectForbiddenKeys(value: unknown, path = "$", found: string[] = []): string[] {
  const denied = new Set(["current_balance", "credit_limit", "credit_used", "available_credit", "outstanding_balance"]);
  if (Array.isArray(value)) {
    value.forEach((item, index) => collectForbiddenKeys(item, path + "[" + index + "]", found));
  } else if (value && typeof value === "object") {
    for (const [key, child] of Object.entries(value)) {
      if (denied.has(key.toLowerCase())) found.push(path + "." + key);
      collectForbiddenKeys(child, path + "." + key, found);
    }
  }
  return found;
}

test("customer manager: directory privacy, audited customer commands, activation invitation and route/RPC denial", async ({ browser }) => {
  test.setTimeout(180_000);
  assertLoopbackOnly();
  const db = postgres(DATABASE_URL, { max: 1, prepare: false, idle_timeout: 5 });
  const managerContext = await browser.newContext();
  const managerPage = await managerContext.newPage();
  const browserErrors: string[] = [];
  const directCustomerTableRequests: string[] = [];
  managerPage.on("pageerror", (error) => browserErrors.push(error.message));
  managerPage.on("request", (request) => {
    let pathname = "";
    try {
      pathname = new URL(request.url()).pathname;
    } catch {
      return;
    }
    if (pathname === "/rest/v1/customers" || pathname.startsWith("/rest/v1/customers/")) {
      directCustomerTableRequests.push(request.method() + " " + pathname);
    }
  });

  try {
    // Retries reuse this job's local database; normalize only the synthetic fixtures before each attempt.
    // assertLoopbackOnly() above forbids these direct setup writes against a hosted or production database.
    const resetCustomerA = await db`
      update public.customers
      set tier = 'wholesale', status = 'approved',
          approved_at = coalesce(approved_at, now()), updated_at = now()
      where organization_id = ${ORGANIZATION_ID}::uuid
        and business_name = 'P2 Local E2E Customer A'
      returning id
    `;
    expect(resetCustomerA).toHaveLength(1);
    const resetForeignCustomer = await db`
      update public.customers
      set tier = 'retail', status = 'approved',
          approved_at = coalesce(approved_at, now()), updated_at = now()
      where organization_id <> ${ORGANIZATION_ID}::uuid
        and business_name = 'P2 Local E2E Customer B'
      returning id
    `;
    expect(resetForeignCustomer).toHaveLength(1);
    await db`
      update public.customer_activation_invitations
      set status = 'revoked', revoked_at = coalesce(revoked_at, now()), updated_at = now()
      where organization_id = ${ORGANIZATION_ID}::uuid
        and status = 'pending'
        and customer_id in (
          select id from public.customers
          where organization_id = ${ORGANIZATION_ID}::uuid and business_name = ${TARGET_NAME}
        )
    `;
    const managerSession = await signIn(managerPage, CUSTOMER_MANAGER_EMAIL, CUSTOMER_MANAGER_PASSWORD);
    const directoryResponsePromise = managerPage.waitForResponse((response) => {
      try {
        return new URL(response.url()).pathname.endsWith("/rest/v1/rpc/fetch_customer_manager_directory") &&
          response.request().method() === "POST";
      } catch {
        return false;
      }
    }, { timeout: 30_000 });

    await managerPage.goto("/admin/customers");
    await expect(managerPage.getByRole("heading", { name: "دليل العملاء" })).toBeVisible({ timeout: 30_000 });
    const directoryResponse = await directoryResponsePromise;
    expect(directoryResponse.status(), "Customer managers must use the guarded directory RPC.").toBe(200);
    const payload = await directoryResponse.json() as { rows?: unknown[]; total_count?: number; page?: number; page_size?: number };
    expect(Array.isArray(payload.rows)).toBe(true);
    expect(payload.page_size).toBe(25);
    expect(collectForbiddenKeys(payload)).toEqual([]);

    const rowA = managerPage.getByRole("row").filter({ hasText: "P2 Local E2E Customer A" });
    await expect(rowA).toBeVisible();
    await expect(managerPage.getByText("P2 Local E2E Customer B", { exact: true })).toHaveCount(0);
    await expect(managerPage.getByRole("columnheader", { name: "الرصيد", exact: true })).toHaveCount(0);
    await expect(managerPage.getByRole("columnheader", { name: "الحد الائتماني", exact: true })).toHaveCount(0);
    const initialBodyText = await managerPage.locator("body").innerText();
    expect(initialBodyText).not.toMatch(/current_balance|credit_limit|الرصيد|الحد الائتماني/);
    expect(directCustomerTableRequests, "The customer-manager screen must not read the base customers table directly.").toEqual([]);

    const directRead = await postgrestRequest(
      managerSession.accessToken,
      "/rest/v1/customers?select=id,current_balance,credit_limit&limit=5",
      "GET",
    );
    if (directRead.ok) {
      const directRows = await directRead.json() as unknown;
      expect(directRows, "A customer_manager must receive zero rows from direct customer-table reads.").toEqual([]);
    } else {
      expect([401, 403]).toContain(directRead.status);
      await directRead.text().catch(() => "");
    }

    const initialCustomerA = await db`
      select id, tier, status, organization_id, profile_id
      from public.customers
      where organization_id = ${ORGANIZATION_ID}::uuid and business_name = 'P2 Local E2E Customer A'
    `;
    expect(initialCustomerA).toHaveLength(1);
    expect(initialCustomerA[0].tier).toBe("wholesale");
    expect(initialCustomerA[0].status).toBe("approved");

    const foreignCustomer = await db`
      select id, tier, organization_id
      from public.customers
      where organization_id <> ${ORGANIZATION_ID}::uuid and business_name = 'P2 Local E2E Customer B'
    `;
    expect(foreignCustomer).toHaveLength(1);
    const foreignCustomerId = String(foreignCustomer[0].id);
    const foreignCustomerTier = String(foreignCustomer[0].tier);
    expect(foreignCustomerTier).toBe("retail");
    const foreignTierProbe = await postgrestRequest(
      managerSession.accessToken,
      "/rest/v1/rpc/set_admin_customer_tier",
      "POST",
      {
        p_customer_id: foreignCustomerId,
        p_expected_tier: foreignCustomerTier,
        p_tier: foreignCustomerTier,
        p_reason: "P2 E2E cross-tenant non-mutating denial probe",
      },
    );
    const foreignTierProbeBody = await foreignTierProbe.text().catch(() => "");
    // A non-2xx alone is insufficient: require the server's tenant-scope denial and verify that the foreign row stays unchanged.
    // Record the actual status in the artifact so a PostgREST/SQLSTATE 500 mapping defect cannot be hidden.
    const tenantDenialMessageMatched = /customer not found in current organization|customer not found|current organization|42501|P0002/i.test(foreignTierProbeBody);
    expect(
      tenantDenialMessageMatched,
      `Expected an opaque tenant-scope denial; received HTTP ${foreignTierProbe.status}: ${foreignTierProbeBody}`,
    ).toBe(true);
    const foreignCustomerAfterProbe = await db`
      select tier from public.customers where id = ${foreignCustomerId}::uuid
    `;
    expect(foreignCustomerAfterProbe).toHaveLength(1);
    expect(foreignCustomerAfterProbe[0].tier).toBe(foreignCustomerTier);
    // Preserve the observed HTTP contract in failed-run logs; HTTP 5xx is not an acceptable authorization response.
    console.info("[P1 tenant-boundary proof]", JSON.stringify({
      sourceSha: process.env.E2E_SOURCE_SHA ?? "not-provided",
      httpStatus: foreignTierProbe.status,
      tenantDenialMessageMatched,
      foreignCustomerTierUnchanged: true,
    }));
    expect([400, 403, 404]).toContain(foreignTierProbe.status);

    await rowA.getByRole("button", { name: "تغيير الشريحة" }).click();
    await managerPage.getByLabel("شريحة العميل الجديدة").selectOption("vip");
    await managerPage.getByLabel("سبب تغيير الشريحة").fill("P2 E2E acceptance: verify audited customer-manager tier change");
    await managerPage.getByRole("button", { name: "حفظ تغيير الشريحة" }).click();
    await expect(rowA.getByText("جملة الجملة", { exact: true })).toBeVisible({ timeout: 20_000 });

    await rowA.getByRole("button", { name: "إدارة دورة الحياة" }).click();
    await managerPage.getByLabel("حالة العميل الجديدة").selectOption("frozen");
    await managerPage.getByLabel("سبب تغيير الحالة").fill("P2 E2E acceptance: verify audited customer-manager lifecycle change");
    await managerPage.getByRole("button", { name: "حفظ تغيير الحالة" }).click();

    const inviteRow = managerPage.getByRole("row").filter({ hasText: TARGET_NAME });
    await managerPage.getByLabel("البحث في دليل العملاء").fill(TARGET_NAME);
    await managerPage.getByRole("button", { name: "بحث", exact: true }).click();
    await expect(inviteRow).toBeVisible({ timeout: 20_000 });
    await inviteRow.getByRole("button", { name: "دعوة تفعيل" }).click();
    const invitationDialog = managerPage.getByRole("dialog", { name: "دعوة العميل للدخول" });
    await expect(invitationDialog).toBeVisible();
    await expect(invitationDialog.getByLabel("البريد الإلكتروني للعميل")).toHaveValue(TARGET_EMAIL);
    await invitationDialog.getByRole("button", { name: "إنشاء رابط تفعيل صالح 72 ساعة" }).click();
    await expect(invitationDialog.getByRole("status").filter({ hasText: "أنشأ الخادم رابط تفعيل" })).toBeVisible({ timeout: 20_000 });
    const inviteUrl = await invitationDialog.locator('input[readonly]').last().inputValue();
    expect(inviteUrl.length).toBeGreaterThan(20);
    expect(new URL(inviteUrl).origin).toBe(new URL(process.env.E2E_BASE_URL ?? "http://127.0.0.1:4173").origin);

    managerPage.on("dialog", async (dialog) => { await dialog.accept(); });
    const revokeInvitationButton = invitationDialog.getByRole("button", { name: "إلغاء الدعوة", exact: true });
    await expect(revokeInvitationButton).toBeVisible();
    await revokeInvitationButton.click();
    await expect(invitationDialog.getByRole("status").filter({ hasText: "أُلغي رابط التفعيل في الخادم" })).toBeVisible({ timeout: 20_000 });

    const customerA = await db`
      select id, tier, status, organization_id, profile_id
      from public.customers
      where organization_id = ${ORGANIZATION_ID}::uuid and business_name = 'P2 Local E2E Customer A'
    `;
    expect(customerA).toHaveLength(1);
    expect(customerA[0].tier).toBe("vip");
    expect(customerA[0].status).toBe("frozen");
    const inviteTarget = await db`
      select id, email, status, profile_id
      from public.customers
      where organization_id = ${ORGANIZATION_ID}::uuid and business_name = ${TARGET_NAME}
    `;
    expect(inviteTarget).toHaveLength(1);
    expect(inviteTarget[0].email).toBe(TARGET_EMAIL);
    expect(inviteTarget[0].status).toBe("approved");
    expect(inviteTarget[0].profile_id).toBeNull();

    const invitationRows = await db`
      select id, status, expires_at
      from public.customer_activation_invitations
      where organization_id = ${ORGANIZATION_ID}::uuid and customer_id = ${inviteTarget[0].id}::uuid
      order by created_at desc limit 1
    `;
    expect(invitationRows).toHaveLength(1);
    expect(invitationRows[0].status).toBe("revoked");
    expect(new Date(invitationRows[0].expires_at as string).getTime()).toBeGreaterThan(Date.now());

    const auditRows = await db`
      select action, entity_id::text as entity_id, new_value
      from public.audit_logs
      where organization_id = ${ORGANIZATION_ID}::uuid
        and actor_id = ${CUSTOMER_MANAGER_PROFILE_ID}::uuid
        and (
          (action = 'customer.tier_changed' and entity_id = ${customerA[0].id}::uuid)
          or (action = 'customer.status_changed' and entity_id = ${customerA[0].id}::uuid)
          or (action = 'customer_activation_invitation.created' and new_value->>'customer_id' = ${inviteTarget[0].id}::text)
        )
    `;
    const auditActions = new Set(auditRows.map((entry) => entry.action));
    expect(auditActions.has("customer.tier_changed")).toBe(true);
    expect(auditActions.has("customer.status_changed")).toBe(true);
    expect(auditActions.has("customer_activation_invitation.created")).toBe(true);

    // Restore the shared synthetic customer fixture through the same authorized UI commands.
    await managerPage.goto("/admin/customers");
    await expect(managerPage.getByRole("heading", { name: "دليل العملاء" })).toBeVisible({ timeout: 20_000 });
    const restoreRow = managerPage.getByRole("row").filter({ hasText: "P2 Local E2E Customer A" });
    await expect(restoreRow).toBeVisible({ timeout: 20_000 });
    await restoreRow.getByRole("button", { name: "إدارة دورة الحياة" }).click();
    await managerPage.getByLabel("حالة العميل الجديدة").selectOption(String(initialCustomerA[0].status));
    await managerPage.getByLabel("سبب تغيير الحالة").fill("P2 E2E acceptance: restore seeded lifecycle status");
    await managerPage.getByRole("button", { name: "حفظ تغيير الحالة" }).click();
    await expect.poll(async () => {
      const restored = await db`
        select status from public.customers
        where id = ${customerA[0].id}::uuid
      `;
      return restored[0]?.status;
    }, { timeout: 20_000, intervals: [100, 250, 500, 1_000] }).toBe(initialCustomerA[0].status);

    await restoreRow.getByRole("button", { name: "تغيير الشريحة" }).click();
    await managerPage.getByLabel("شريحة العميل الجديدة").selectOption(String(initialCustomerA[0].tier));
    await managerPage.getByLabel("سبب تغيير الشريحة").fill("P2 E2E acceptance: restore seeded pricing tier");
    await managerPage.getByRole("button", { name: "حفظ تغيير الشريحة" }).click();
    await expect.poll(async () => {
      const restored = await db`
        select tier from public.customers
        where id = ${customerA[0].id}::uuid
      `;
      return restored[0]?.tier;
    }, { timeout: 20_000, intervals: [100, 250, 500, 1_000] }).toBe(initialCustomerA[0].tier);

    for (const route of ["/admin/finance", "/admin/orders", "/admin/devices", "/admin/audit", "/admin/settings"]) {
      await managerPage.goto(route);
      await expect(managerPage.getByRole("heading", { name: "مساحة مسؤول العملاء" })).toBeVisible({ timeout: 20_000 });
      const restrictedText = await managerPage.locator("body").innerText();
      expect(restrictedText).not.toMatch(/الأجهزة والجلسات|سجل التدقيق|الفواتير والتحصيل|إشعارات المرتجعات الدائنة/);
    }

    const ordinaryContext = await browser.newContext();
    try {
      const ordinaryPage = await ordinaryContext.newPage();
      const ordinarySession = await signIn(ordinaryPage, CUSTOMER_EMAIL, CUSTOMER_PASSWORD);
      await ordinaryPage.goto("/admin/customers");
      await expect(ordinaryPage.getByRole("heading", { name: "لا تملك صلاحية الإدارة" })).toBeVisible({ timeout: 20_000 });

      const deniedDirectory = await postgrestRequest(
        ordinarySession.accessToken,
        "/rest/v1/rpc/fetch_customer_manager_directory",
        "POST",
        { p_search: "", p_page: 1, p_page_size: 25 },
      );
      expect([400, 401, 403]).toContain(deniedDirectory.status);
      await deniedDirectory.text().catch(() => "");

      const deniedTierMutation = await postgrestRequest(
        ordinarySession.accessToken,
        "/rest/v1/rpc/set_admin_customer_tier",
        "POST",
        {
          p_customer_id: customerA[0].id,
          p_expected_tier: "vip",
          p_tier: "retail",
          p_reason: "Unauthorized customer E2E probe",
        },
      );
      expect([400, 401, 403]).toContain(deniedTierMutation.status);
      await deniedTierMutation.text().catch(() => "");
    } finally {
      await ordinaryContext.close();
    }

    const finalCustomerA = await db`
      select tier, status
      from public.customers
      where id = ${customerA[0].id}::uuid
    `;
    expect(finalCustomerA).toHaveLength(1);
    expect(finalCustomerA[0].tier).toBe(initialCustomerA[0].tier);
    expect(finalCustomerA[0].status).toBe(initialCustomerA[0].status);

    const auditorContext = await browser.newContext();
    try {
      const auditor = await auditorContext.newPage();
      await signIn(auditor, AUDITOR_EMAIL, AUDITOR_PASSWORD);
      await auditor.goto("/admin/audit");
      await expect(auditor.getByRole("heading", { name: "سجل التدقيق" })).toBeVisible({ timeout: 20_000 });
      const auditSearch = auditor.getByLabel("بحث في الإجراء أو الكيان أو المعرّف");
      await auditSearch.fill(String(customerA[0].id).slice(0, 8));
      const auditTableRows = auditor.locator("tbody");
      await expect(auditTableRows).toContainText("customer.tier_changed", { timeout: 20_000 });
      await expect(auditTableRows).toContainText("customer.status_changed", { timeout: 20_000 });
    } finally {
      await auditorContext.close();
    }
    expect(browserErrors).toEqual([]);

    await test.info().attach("customer-manager-authorization-proof.json", {
      body: JSON.stringify({
        result: "LOCAL_BROWSER_AND_DATABASE_PROVEN",
        sourceSha: process.env.E2E_SOURCE_SHA ?? "not-provided",
        directory: "tenant-scoped RPC only; financial columns absent in payload and DOM",
        commands: ["tier change", "lifecycle change", "activation invitation created and revoked", "restore synthetic fixture"],
        auditActions: [...auditActions],
        crossTenantMutationDenied: true,
        crossTenantHttpStatus: foreignTierProbe.status,
        foreignCustomerTierUnchanged: true,
        activationInviteCreatedAndRevoked: true,
        customerTierAndStatusRestoredToSeed: true,
        managerAuditReadbackConfirmed: true,
        negativeCases: ["direct customer table read denied/empty", "customer_manager cross-tenant tier RPC denied without mutation", "ordinary customer route denied", "ordinary customer directory RPC denied", "ordinary customer tier mutation denied", "foreign organization row absent"],
        restrictedRoutes: ["/admin/finance", "/admin/orders", "/admin/devices", "/admin/audit", "/admin/settings"],
      }, null, 2),
      contentType: "application/json",
    });
  } finally {
    // Keep shared synthetic fixtures clean even if a UI assertion fails; never runs off loopback.
    await db`
      update public.customers
      set tier = 'wholesale', status = 'approved',
          approved_at = coalesce(approved_at, now()), updated_at = now()
      where organization_id = ${ORGANIZATION_ID}::uuid
        and business_name = 'P2 Local E2E Customer A'
    `.catch(() => []);
    await db`
      update public.customers
      set tier = 'retail', status = 'approved',
          approved_at = coalesce(approved_at, now()), updated_at = now()
      where organization_id <> ${ORGANIZATION_ID}::uuid
        and business_name = 'P2 Local E2E Customer B'
    `.catch(() => []);
    await db`
      update public.customer_activation_invitations
      set status = 'revoked', revoked_at = coalesce(revoked_at, now()), updated_at = now()
      where organization_id = ${ORGANIZATION_ID}::uuid
        and status = 'pending'
        and customer_id in (
          select id from public.customers
          where organization_id = ${ORGANIZATION_ID}::uuid and business_name = ${TARGET_NAME}
        )
    `.catch(() => []);
    await managerContext.close();
    await db.end({ timeout: 5 }).catch(() => {});
  }
});
