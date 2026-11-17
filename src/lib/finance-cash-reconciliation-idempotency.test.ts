import { describe, expect, it, vi } from "vitest";
import {
  getOrCreatePendingBankStatementLine,
  normalizeFinanceAmountInput,
  type BankStatementLineRetryPayload,
  type PendingBankStatementLine,
} from "./finance-cash-reconciliation-idempotency";

const firstKey = "00000000-0000-4000-8000-000000000001";
const secondKey = "00000000-0000-4000-8000-000000000002";

const payload: BankStatementLineRetryPayload = {
  statementId: "00000000-0000-4000-8000-000000000010",
  transactionDate: "2026-11-17",
  externalReference: " BANK-77 ",
  description: "  إيداع عميل  ",
  signedAmount: "1250.00",
};

describe("finance reconciliation retry safeguards", () => {
  it("normalizes Arabic digits and decimal separators without floating-point rounding", () => {
    expect(normalizeFinanceAmountInput("١٢٥٠٫٥")).toBe("1250.50");
    expect(normalizeFinanceAmountInput("−٠٠٤٫٥٠")).toBe("-4.50");
    expect(normalizeFinanceAmountInput("-0.00")).toBe("0.00");
  });

  it("rejects amounts that numeric(18,2) cannot represent exactly", () => {
    expect(normalizeFinanceAmountInput("12.345")).toBeNull();
    expect(normalizeFinanceAmountInput("10000000000000000")).toBeNull();
    expect(normalizeFinanceAmountInput("not-a-number")).toBeNull();
  });

  it("reuses the original line number and key after an ambiguous save and refresh", () => {
    const createKey = vi.fn(() => firstKey);
    const pending = new Map<string, PendingBankStatementLine>();
    const first = getOrCreatePendingBankStatementLine(pending, payload, 4, createKey);
    pending.set(first.fingerprint, first);

    // The server may have committed although the browser lost the response.
    // A refresh can increase lineCount; the retry must still replay the first request.
    const retry = getOrCreatePendingBankStatementLine(pending, {
      ...payload,
      externalReference: "BANK-77",
      description: "إيداع عميل",
    }, 5, createKey);

    expect(retry).toEqual(first);
    expect(retry.lineNumber).toBe(4);
    expect(retry.idempotencyKey).toBe(firstKey);
    expect(createKey).toHaveBeenCalledTimes(1);
  });

  it("allocates a new key and line number when the user changes the movement", () => {
    const createKey = vi.fn().mockReturnValueOnce(firstKey).mockReturnValueOnce(secondKey);
    const pending = new Map<string, PendingBankStatementLine>();
    const first = getOrCreatePendingBankStatementLine(pending, payload, 1, createKey);
    pending.set(first.fingerprint, first);

    const changed = getOrCreatePendingBankStatementLine(pending, {
      ...payload,
      signedAmount: "1300.00",
    }, 2, createKey);

    expect(changed).toMatchObject({ lineNumber: 2, idempotencyKey: secondKey });
    expect(changed.fingerprint).not.toBe(first.fingerprint);
    expect(createKey).toHaveBeenCalledTimes(2);
  });

  it("allocates a new key after the prior submission and refresh are confirmed", () => {
    const createKey = vi.fn().mockReturnValueOnce(firstKey).mockReturnValueOnce(secondKey);
    const pending = new Map<string, PendingBankStatementLine>();
    const first = getOrCreatePendingBankStatementLine(pending, payload, 1, createKey);
    pending.set(first.fingerprint, first);
    pending.delete(first.fingerprint);

    const nextIntentionalLine = getOrCreatePendingBankStatementLine(pending, payload, 2, createKey);
    expect(nextIntentionalLine.lineNumber).toBe(2);
    expect(nextIntentionalLine.idempotencyKey).toBe(secondKey);
  });

  it("rejects invalid line numbers and generated keys", () => {
    const pending = new Map<string, PendingBankStatementLine>();
    expect(() => getOrCreatePendingBankStatementLine(pending, payload, 0, () => firstKey)).toThrow(/رقم سطر/);
    expect(() => getOrCreatePendingBankStatementLine(pending, payload, 1, () => "not-a-uuid")).toThrow(/مفتاح صالح/);
  });
});
