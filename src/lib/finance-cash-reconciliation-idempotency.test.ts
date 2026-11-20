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
}

class MemoryFinanceRetryStorage {
  private values = new Map<string, string>();
  getItem(key: string) { return this.values.get(key) ?? null; }
  setItem(key: string, value: string) { this.values.set(key, value); }
  removeItem(key: string) { this.values.delete(key); }
  entries() { return [...this.values.entries()]; }
}

async function testFingerprintHash(value: string): Promise<string> {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash = Math.imul(hash ^ value.charCodeAt(index), 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0").repeat(8);
}

describe("persistent finance reconciliation retry identity", () => {
  it("reuses the exact bank-line key and line number after a full component reload", async () => {
    const storage = new MemoryFinanceRetryStorage();
    const createKey = vi.fn(() => firstKey);
    const first = await getOrCreatePersistentBankStatementLineRetry(
      storage, payload, 4, createKey, testFingerprintHash,
    );

    // A page reload recreates React refs/maps; the browser's localStorage survives.
    const afterReload = await getOrCreatePersistentBankStatementLineRetry(
      storage,
      { ...payload, externalReference: "BANK-77", description: "إيداع عميل" },
      5,
      createKey,
      testFingerprintHash,
    );

    expect(afterReload.idempotencyKey).toBe(first.idempotencyKey);
    expect(afterReload.lineNumber).toBe(4);
    expect(createKey).toHaveBeenCalledTimes(1);
    const persisted = storage.entries();
    expect(persisted).toHaveLength(1);
    expect(persisted[0][0]).not.toContain(payload.statementId);
    expect(persisted[0][1]).not.toContain(payload.description.trim());
    expect(persisted[0][1]).not.toContain(payload.signedAmount);
  });

  it("keeps opening-balance keys across reloads without storing the financial payload", async () => {
    const storage = new MemoryFinanceRetryStorage();
    const createKey = vi.fn(() => firstKey);
    const fingerprint = JSON.stringify({
      actorUserId: "user-1", mappingId: "mapping-1", evidenceId: "evidence-1",
      asOfDate: "2026-11-20", openingBalance: "125000.00",
    });
    const first = await getOrCreatePersistentOpeningBalanceRetry(
      storage, fingerprint, createKey, testFingerprintHash,
    );
    const afterReload = await getOrCreatePersistentOpeningBalanceRetry(
      storage, fingerprint, createKey, testFingerprintHash,
    );
    expect(afterReload.idempotencyKey).toBe(first.idempotencyKey);
    expect(createKey).toHaveBeenCalledTimes(1);
    const serialized = storage.entries()[0][1];
    expect(serialized).not.toContain("125000.00");
    expect(serialized).not.toContain("evidence-1");
    expect(serialized).not.toContain("user-1");
  });

  it("creates a different retry identity for a changed financial payload", async () => {
    const storage = new MemoryFinanceRetryStorage();
    const createKey = vi.fn().mockReturnValueOnce(firstKey).mockReturnValueOnce(secondKey);
    const first = await getOrCreatePersistentBankStatementLineRetry(
      storage, payload, 1, createKey, testFingerprintHash,
    );
    const changed = await getOrCreatePersistentBankStatementLineRetry(
      storage, { ...payload, signedAmount: "1300.00" }, 2, createKey, testFingerprintHash,
    );
    expect(changed.lineNumber).toBe(2);
    expect(changed.idempotencyKey).toBe(secondKey);
    expect(changed.storageKey).not.toBe(first.storageKey);
  });

  it("releases the persisted key only after explicit server-and-refresh confirmation", async () => {
    const storage = new MemoryFinanceRetryStorage();
    const retry = await getOrCreatePersistentBankStatementLineRetry(
      storage, payload, 1, () => firstKey, testFingerprintHash,
    );
    expect(storage.getItem(retry.storageKey)).not.toBeNull();
    expect(clearPersistentFinanceRetry(storage, retry)).toBe(true);
    expect(storage.getItem(retry.storageKey)).toBeNull();
    const next = await getOrCreatePersistentBankStatementLineRetry(
      storage, payload, 2, () => secondKey, testFingerprintHash,
    );
    expect(next.idempotencyKey).toBe(secondKey);
    expect(next.lineNumber).toBe(2);
  });

  it("fails closed when persisted retry state is corrupt or storage is unavailable", async () => {
    const storage = new MemoryFinanceRetryStorage();
    const retry = await getOrCreatePersistentBankStatementLineRetry(
      storage, payload, 1, () => firstKey, testFingerprintHash,
    );
    storage.setItem(retry.storageKey, "{broken");
    await expect(getOrCreatePersistentBankStatementLineRetry(
      storage, payload, 2, () => secondKey, testFingerprintHash,
    )).rejects.toThrow(/تالف/);

    const unavailable = {
      getItem() { throw new Error("blocked"); },
      setItem() { throw new Error("blocked"); },
      removeItem() { throw new Error("blocked"); },
    };
    await expect(getOrCreatePersistentOpeningBalanceRetry(
      unavailable, "request", () => secondKey, testFingerprintHash,
    )).rejects.toThrow(/لم تُرسل/);
  });
});

});
