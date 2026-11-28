import { expect, test } from "@playwright/test";

type BankLineRequest = {
  statementId: string;
  lineNumber: number;
  idempotencyKey: string;
};
type OpeningBalanceRequest = { idempotencyKey: string };

function fixtureUrl(): string {
  const base = process.env.E2E_PRICE_FIXTURE_BASE_URL ?? "http://127.0.0.1:5174";
  const url = new URL("/e2e/fixtures/finance-reconciliation-retry.html", base);
  url.searchParams.set("nextLineNumber", "4");
  return url.toString();
}

test("bank-line and opening-balance idempotency survive a real browser reload after a committed-but-lost response", async ({ page }) => {
  test.skip(!process.env.E2E_PRICE_FIXTURE_BASE_URL, "This localStorage reload acceptance runs in the dedicated Vite public UI harness.");
  const committedLines = new Map<string, { lineId: string; statementId: string; lineNumber: number }>();
  const committedOpeningBalances = new Map<string, { proposalId: string }>();
  const bankAttempts: BankLineRequest[] = [];
  const openingAttempts: OpeningBalanceRequest[] = [];
  let loseFirstBankResponse = true;
  let loseFirstOpeningResponse = true;

  // This test server commits the first request, then drops its response to model
  // the exact ambiguous network outcome that the client must replay safely.
  await page.route("**/__test/finance-bank-line", async (route) => {
    const request = route.request().postDataJSON() as BankLineRequest;
    bankAttempts.push(request);
    const existing = committedLines.get(request.idempotencyKey);
    if (existing) {
      expect(existing.statementId).toBe(request.statementId);
      expect(existing.lineNumber).toBe(request.lineNumber);
    } else {
      committedLines.set(request.idempotencyKey, {
        lineId: "a1000000-0000-4000-8000-000000000501",
        statementId: request.statementId,
        lineNumber: request.lineNumber,
      });
    }

    if (loseFirstBankResponse) {
      loseFirstBankResponse = false;
      await route.abort("connectionreset");
      return;
    }
    const saved = committedLines.get(request.idempotencyKey)!;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        line_id: saved.lineId,
        line_number: saved.lineNumber,
        replayed: true,
      }),
    });
  });

  await page.route("**/__test/finance-opening-balance", async (route) => {
    const request = route.request().postDataJSON() as OpeningBalanceRequest;
    openingAttempts.push(request);
    const existing = committedOpeningBalances.get(request.idempotencyKey);
    if (!existing) {
      committedOpeningBalances.set(request.idempotencyKey, {
        proposalId: "a1000000-0000-4000-8000-000000000601",
      });
    }
    if (loseFirstOpeningResponse) {
      loseFirstOpeningResponse = false;
      await route.abort("connectionreset");
      return;
    }
    const saved = committedOpeningBalances.get(request.idempotencyKey)!;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ proposal_id: saved.proposalId, replayed: true }),
    });
  });

  await page.goto(fixtureUrl());
  await expect(page.getByTestId("fixture-ready")).toBeVisible();

  await page.getByTestId("submit-bank-line").click();
  await expect(page.getByTestId("bank-outcome")).toHaveText("outcome-unknown");
  const firstBankKey = await page.getByTestId("bank-retry-result").getAttribute("data-idempotency-key");
  const firstLineNumber = await page.getByTestId("bank-retry-result").getAttribute("data-line-number");
  expect(firstBankKey).toMatch(/^[0-9a-f-]{36}$/i);
  expect(firstLineNumber).toBe("4");
  expect(committedLines.size).toBe(1);

  await page.getByTestId("submit-opening-balance").click();
  await expect(page.getByTestId("opening-outcome")).toHaveText("outcome-unknown");
  const firstOpeningKey = await page.getByTestId("opening-retry-result").getAttribute("data-idempotency-key");
  expect(firstOpeningKey).toMatch(/^[0-9a-f-]{36}$/i);
  expect(committedOpeningBalances.size).toBe(1);

  const persistedBeforeReload = await page.evaluate(() =>
    Object.keys(window.localStorage)
      .filter((key) => key.startsWith("aghbari.finance.retry.v1."))
      .sort()
      .map((key) => [key, window.localStorage.getItem(key)]),
  );
  expect(persistedBeforeReload).toHaveLength(2);
  const serializedRetryState = JSON.stringify(persistedBeforeReload);
  expect(serializedRetryState).not.toContain("1250.00");
  expect(serializedRetryState).not.toContain("125000.00");
  expect(serializedRetryState).not.toContain("CI-BANK-RETRY-001");
  expect(serializedRetryState).not.toContain("حركة قبول إعادة محاولة");

  // The server-side fixture state survives; the browser page and all React refs do not.
  await page.evaluate(() => {
    const next = new URL(window.location.href);
    next.searchParams.set("nextLineNumber", "5");
    window.history.replaceState(null, "", next);
  });
  await page.reload();
  await expect(page.getByTestId("fixture-ready")).toBeVisible();

  await page.getByTestId("submit-bank-line").click();
  await expect(page.getByTestId("bank-outcome")).toHaveText("confirmed-replay");
  await expect(page.getByTestId("bank-retry-result")).toHaveAttribute("data-idempotency-key", firstBankKey!);
  await expect(page.getByTestId("bank-retry-result")).toHaveAttribute("data-line-number", firstLineNumber!);

  await page.getByTestId("submit-opening-balance").click();
  await expect(page.getByTestId("opening-outcome")).toHaveText("confirmed-replay");
  await expect(page.getByTestId("opening-retry-result")).toHaveAttribute("data-idempotency-key", firstOpeningKey!);

  expect(bankAttempts).toHaveLength(2);
  expect(bankAttempts[1]).toEqual(bankAttempts[0]);
  expect(bankAttempts[1].lineNumber).toBe(4);
  expect(openingAttempts).toHaveLength(2);
  expect(openingAttempts[1]).toEqual(openingAttempts[0]);
  expect(committedLines.size).toBe(1);
  expect(committedOpeningBalances.size).toBe(1);
});