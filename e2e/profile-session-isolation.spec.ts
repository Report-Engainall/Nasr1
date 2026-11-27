import { expect, test, type Page } from "@playwright/test";

function requiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(name + " is required for local profile session isolation acceptance.");
  return value;
}

async function signInCurrentProfile(page: Page, email: string, password: string) {
  await expect(page.getByRole("heading", { name: "تسجيل الدخول" })).toBeVisible();
  await page.getByLabel("البريد الإلكتروني").fill(email);
  await page.locator('input[autocomplete="current-password"]').fill(password);
  await page.getByRole("button", { name: "دخول", exact: true }).click();
  await expect(page.getByRole("heading", { name: "ملفي الشخصي" })).toBeVisible();
  await expect(page.getByLabel("اسم الشركة")).toBeVisible();
}

async function readCurrentCustomerProfile(page: Page) {
  const apiUrl = requiredEnv("E2E_SUPABASE_URL");
  const publishableKey = requiredEnv("E2E_SUPABASE_PUBLISHABLE_KEY");
  return page.evaluate(async ({ apiUrl, publishableKey }) => {
    const entry = Object.entries(window.localStorage).find(([key]) => key.endsWith("-auth-token"));
    if (!entry) throw new Error("No browser Supabase auth session is stored after sign-in.");
    const stored = JSON.parse(entry[1]) as { access_token?: unknown };
    if (typeof stored.access_token !== "string") throw new Error("Stored Supabase session has no access token.");
    const parts = stored.access_token.split(".");
    if (!parts[1]) throw new Error("Supabase access token has no JWT payload.");
    const normalized = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const claims = JSON.parse(window.atob(normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "="))) as {
      sub?: unknown;
      session_id?: unknown;
    };
    const response = await fetch(apiUrl.replace(/\/$/, "") + "/rest/v1/rpc/get_my_customer_account_profile", {
      method: "POST",
      headers: {
        apikey: publishableKey,
        Authorization: "Bearer " + stored.access_token,
        "Content-Type": "application/json",
      },
      body: "{}",
    });
    const profile = await response.json().catch(() => null) as {
      customer_code?: unknown;
      business_name?: unknown;
      status?: unknown;
    } | null;
    return {
      httpStatus: response.status,
      subject: typeof claims.sub === "string" ? claims.sub : "",
      sessionId: typeof claims.session_id === "string" ? claims.session_id : "",
      customerCode: typeof profile?.customer_code === "string" ? profile.customer_code : "",
      businessName: typeof profile?.business_name === "string" ? profile.business_name : "",
      status: typeof profile?.status === "string" ? profile.status : "",
    };
  }, { apiUrl, publishableKey });
}

async function signOutCurrentProfile(page: Page) {
  await page.getByRole("button", { name: "تسجيل الخروج من هذا الجهاز", exact: true }).click();
  await expect(page.getByRole("heading", { name: "تسجيل الدخول" })).toBeVisible();
  await expect(page.getByLabel("اسم الشركة")).toHaveCount(0);
  const remainingTokens = await page.evaluate(() =>
    Object.entries(window.localStorage).filter(([key, value]) => {
      if (!key.endsWith("-auth-token")) return false;
      try {
        const record = JSON.parse(value) as { access_token?: unknown };
        return typeof record.access_token === "string" && record.access_token.length > 20;
      } catch {
        return false;
      }
    }).length,
  );
  expect(remainingTokens, "Signing out must remove the previous browser session before the next account signs in.").toBe(0);
}

test.describe("profile Auth session isolation — disposable local Supabase only", () => {
  test("switching customer A to customer B replaces unsaved editor state and reads B's own tenant record", async ({ page }) => {
    const emailA = requiredEnv("E2E_EMAIL");
    const passwordA = requiredEnv("E2E_PASSWORD");
    const emailB = requiredEnv("E2E_EMAIL_B");
    const passwordB = requiredEnv("E2E_PASSWORD_B");
    const unsavedDraft = "P2 Local Unsaved Customer A Draft";

    await page.goto("/profile");
    await signInCurrentProfile(page, emailA, passwordA);

    const profileA = await readCurrentCustomerProfile(page);
    expect(profileA.httpStatus).toBe(200);
    expect(profileA.subject).toMatch(/^[0-9a-f-]{36}$/i);
    expect(profileA.sessionId).toMatch(/^[0-9a-f-]{36}$/i);
    expect(profileA.customerCode).toMatch(/^P2E2EA/);
    expect(profileA.businessName).toBe("P2 Local E2E Customer A");
    expect(profileA.status).toBe("approved");
    await expect(page.getByLabel("البريد الإلكتروني").last()).toHaveValue(emailA);
    await expect(page.getByLabel("اسم الشركة")).toHaveValue("P2 Local E2E Customer A");
    await expect(page.getByText(/رقم العميل: P2E2EA/)).toBeVisible();

    await page.getByLabel("اسم الشركة").fill(unsavedDraft);
    await expect(page.getByLabel("اسم الشركة")).toHaveValue(unsavedDraft);

    await signOutCurrentProfile(page);
    await signInCurrentProfile(page, emailB, passwordB);

    const profileB = await readCurrentCustomerProfile(page);
    expect(profileB.httpStatus).toBe(200);
    expect(profileB.subject).toMatch(/^[0-9a-f-]{36}$/i);
    expect(profileB.sessionId).toMatch(/^[0-9a-f-]{36}$/i);
    expect(profileB.subject).not.toBe(profileA.subject);
    expect(profileB.sessionId).not.toBe(profileA.sessionId);
    expect(profileB.customerCode).toMatch(/^P2E2EB/);
    expect(profileB.businessName).toBe("P2 Local E2E Customer B");
    expect(profileB.status).toBe("approved");
    expect(profileB.businessName).not.toContain(unsavedDraft);

    await expect(page.getByLabel("البريد الإلكتروني").last()).toHaveValue(emailB);
    await expect(page.getByLabel("اسم الشركة")).toHaveValue("P2 Local E2E Customer B");
    await expect(page.getByText(/رقم العميل: P2E2EB/)).toBeVisible();
    await expect(page.getByText(/رقم العميل: P2E2EA/)).toHaveCount(0);

    await page.reload();
    await expect(page.getByRole("heading", { name: "ملفي الشخصي" })).toBeVisible();
    await expect(page.getByLabel("البريد الإلكتروني").last()).toHaveValue(emailB);
    await expect(page.getByLabel("اسم الشركة")).toHaveValue("P2 Local E2E Customer B");
    const reloadedProfileB = await readCurrentCustomerProfile(page);
    expect(reloadedProfileB.subject).toBe(profileB.subject);
    expect(reloadedProfileB.customerCode).toBe(profileB.customerCode);
    expect(reloadedProfileB.businessName).toBe(profileB.businessName);

    await signOutCurrentProfile(page);
    await signInCurrentProfile(page, emailA, passwordA);
    const reloadedProfileA = await readCurrentCustomerProfile(page);
    expect(reloadedProfileA.subject).toBe(profileA.subject);
    expect(reloadedProfileA.customerCode).toBe(profileA.customerCode);
    expect(reloadedProfileA.businessName).toBe("P2 Local E2E Customer A");
    await expect(page.getByLabel("اسم الشركة")).toHaveValue("P2 Local E2E Customer A");
    await expect(page.getByText(/رقم العميل: P2E2EA/)).toBeVisible();
    await expect(page.getByText(/رقم العميل: P2E2EB/)).toHaveCount(0);
  });
});
