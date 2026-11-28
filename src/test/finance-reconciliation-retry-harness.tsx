import { useState } from "react";
import { createRoot } from "react-dom/client";
import {
  getOrCreatePersistentBankStatementLineRetry,
  getOrCreatePersistentOpeningBalanceRetry,
  type PersistentBankStatementLineRetry,
  type PersistentFinanceRetry,
} from "@/lib/finance-cash-reconciliation-idempotency";

const bankPayload = {
  actorUserId: "a1000000-0000-4000-8000-000000000101",
  statementId: "a1000000-0000-4000-8000-000000000201",
  transactionDate: "2026-11-20",
  externalReference: "CI-BANK-RETRY-001",
  description: "حركة قبول إعادة محاولة كشف البنك",
  signedAmount: "-1250.00",
};

const openingFingerprint = JSON.stringify({
  actorUserId: "a1000000-0000-4000-8000-000000000101",
  mappingId: "a1000000-0000-4000-8000-000000000301",
  evidenceId: "a1000000-0000-4000-8000-000000000401",
  asOfDate: "2026-11-20",
  openingBalance: "125000.00",
});

function FinanceRetryHarness() {
  const [bankRetry, setBankRetry] = useState<PersistentBankStatementLineRetry | null>(null);
  const [openingRetry, setOpeningRetry] = useState<PersistentFinanceRetry | null>(null);
  const [bankOutcome, setBankOutcome] = useState("not-started");
  const [openingOutcome, setOpeningOutcome] = useState("not-started");
  const nextLineNumber = Number(new URLSearchParams(window.location.search).get("nextLineNumber") ?? "4");

  async function submitBankLine() {
    setBankOutcome("submitting");
    try {
      const retry = await getOrCreatePersistentBankStatementLineRetry(
        window.localStorage,
        bankPayload,
        nextLineNumber,
        () => window.crypto.randomUUID(),
      );
      setBankRetry(retry);
      const response = await fetch("/__test/finance-bank-line", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          statementId: bankPayload.statementId,
          lineNumber: retry.lineNumber,
          idempotencyKey: retry.idempotencyKey,
        }),
      });
      if (!response.ok) throw new Error("retry fixture request was not confirmed");
      const result = await response.json() as { replayed?: unknown };
      setBankOutcome(result.replayed === true ? "confirmed-replay" : "created");
    } catch {
      setBankOutcome("outcome-unknown");
    }
  }

  async function submitOpeningBalance() {
    setOpeningOutcome("submitting");
    try {
      const retry = await getOrCreatePersistentOpeningBalanceRetry(
        window.localStorage,
        openingFingerprint,
        () => window.crypto.randomUUID(),
      );
      setOpeningRetry(retry);
      const response = await fetch("/__test/finance-opening-balance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idempotencyKey: retry.idempotencyKey }),
      });
      if (!response.ok) throw new Error("opening-balance fixture request was not confirmed");
      const result = await response.json() as { replayed?: unknown };
      setOpeningOutcome(result.replayed === true ? "confirmed-replay" : "created");
    } catch {
      setOpeningOutcome("outcome-unknown");
    }
  }

  return (
    <main>
      <h1 data-testid="fixture-ready">اختبار استعادة هوية التسوية المالية بعد تحديث الصفحة</h1>
      <p>بيانات اصطناعية محلية؛ لا اتصال بقاعدة مالية أو خدمة مستضافة.</p>
      <section aria-label="إعادة محاولة سطر كشف البنك">
        <button data-testid="submit-bank-line" type="button" onClick={() => void submitBankLine()}>
          حفظ حركة كشف البنك
        </button>
        <output data-testid="bank-outcome">{bankOutcome}</output>
        {bankRetry && (
          <output
            data-testid="bank-retry-result"
            data-idempotency-key={bankRetry.idempotencyKey}
            data-line-number={String(bankRetry.lineNumber)}
          >
            {bankRetry.fingerprintHash}
          </output>
        )}
      </section>
      <section aria-label="إعادة محاولة الرصيد الافتتاحي">
        <button data-testid="submit-opening-balance" type="button" onClick={() => void submitOpeningBalance()}>
          إرسال مقترح الرصيد الافتتاحي
        </button>
        <output data-testid="opening-outcome">{openingOutcome}</output>
        {openingRetry && (
          <output
            data-testid="opening-retry-result"
            data-idempotency-key={openingRetry.idempotencyKey}
          >
            {openingRetry.fingerprintHash}
          </output>
        )}
      </section>
    </main>
  );
}

createRoot(document.getElementById("root")!).render(<FinanceRetryHarness />);