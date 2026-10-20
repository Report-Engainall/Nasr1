export interface ReturnCreditAccount {
  id: string;
  code: string;
  name: string;
  account_type: "asset" | "revenue" | "liability";
}

export interface ReturnCreditLine {
  request_item_id: string;
  order_item_id: string;
  product_id: string | null;
  item_code: string | null;
  product_name: string;
  unit: string | null;
  requested_quantity: number;
  received_quantity: number;
  invoice_item_id: string | null;
  invoice_item_quantity: number;
  invoice_item_line_total: number;
  already_credited_quantity: number;
  remaining_invoice_quantity: number;
}

export interface ReturnCreditMemoSummary {
  id: string;
  memo_number: string;
  status: "draft" | "posted" | "void";
  currency: string;
  subtotal_amount: number;
  tax_amount: number;
  total_amount: number;
  journal_entry_id: string;
  journal_entry_number: string;
  journal_status: "draft" | "posted" | "void";
  receivable_account_id: string;
  revenue_account_id: string;
  tax_account_id: string | null;
  created_at: string;
  posted_at: string | null;
}

export interface ReturnCreditRequest {
  request_id: string;
  request_number: string;
  order_id: string;
  order_number: string;
  customer_id: string;
  customer_name: string;
  created_at: string;
  invoice_id: string | null;
  invoice_number: string | null;
  currency: string | null;
  invoice_subtotal: number | null;
  invoice_tax_amount: number | null;
  invoice_total_amount: number | null;
  invoice_status: string | null;
  invoice_totals_reconcile: boolean;
  mapping_ready: boolean;
  items: ReturnCreditLine[];
  credit_memo: ReturnCreditMemoSummary | null;
}

export interface ReturnCreditQueue {
  accounts: ReturnCreditAccount[];
  requests: ReturnCreditRequest[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requiredText(value: unknown, name: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error("بيانات الإشعار الدائن غير مكتملة: " + name);
  }
  return value;
}

function nullableText(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

function finiteAmount(value: unknown, name: string): number {
  const amount = typeof value === "number" ? value :
    typeof value === "string" && value.trim() ? Number(value) : Number.NaN;
  if (!Number.isFinite(amount) || Math.abs(amount) >= 1e16) {
    throw new Error("قيمة مالية غير صالحة: " + name);
  }
  return amount;
}

function nullableAmount(value: unknown, name: string): number | null {
  return value === null || value === undefined ? null : finiteAmount(value, name);
}

export function readReturnCreditMemoQueue(value: unknown): ReturnCreditQueue {
  if (!isRecord(value) || !Array.isArray(value.accounts) || !Array.isArray(value.requests)) {
    throw new Error("أعاد الخادم قائمة إشعارات دائنة غير صالحة.");
  }
  const accounts = value.accounts.map((raw): ReturnCreditAccount => {
    if (!isRecord(raw)) throw new Error("بيانات الحساب المحاسبي غير صالحة.");
    const type = requiredText(raw.account_type, "account_type");
    if (type !== "asset" && type !== "revenue" && type !== "liability") {
      throw new Error("نوع الحساب غير مسموح به لإشعار دائن.");
    }
    return {
      id: requiredText(raw.id, "account.id"),
      code: requiredText(raw.code, "account.code"),
      name: requiredText(raw.name, "account.name"),
      account_type: type,
    };
  });
  const requests = value.requests.map((raw): ReturnCreditRequest => {
    if (!isRecord(raw) || !Array.isArray(raw.items)) {
      throw new Error("سجل المرتجع المؤهل للإشعار الدائن غير صالح.");
    }
    const invoiceId = nullableText(raw.invoice_id);
    const memoRaw = raw.credit_memo;
    let creditMemo: ReturnCreditMemoSummary | null = null;
    if (memoRaw !== null && memoRaw !== undefined) {
      if (!isRecord(memoRaw)) throw new Error("ملخص الإشعار الدائن غير صالح.");
      const status = requiredText(memoRaw.status, "credit_memo.status");
      const journalStatus = requiredText(memoRaw.journal_status, "credit_memo.journal_status");
      if (!["draft", "posted", "void"].includes(status) || !["draft", "posted", "void"].includes(journalStatus)) {
        throw new Error("حالة الإشعار الدائن أو القيد غير معروفة.");
      }
      creditMemo = {
        id: requiredText(memoRaw.id, "credit_memo.id"),
        memo_number: requiredText(memoRaw.memo_number, "credit_memo.memo_number"),
        status: status as ReturnCreditMemoSummary["status"],
        currency: requiredText(memoRaw.currency, "credit_memo.currency"),
        subtotal_amount: finiteAmount(memoRaw.subtotal_amount, "credit_memo.subtotal_amount"),
        tax_amount: finiteAmount(memoRaw.tax_amount, "credit_memo.tax_amount"),
        total_amount: finiteAmount(memoRaw.total_amount, "credit_memo.total_amount"),
        journal_entry_id: requiredText(memoRaw.journal_entry_id, "credit_memo.journal_entry_id"),
        journal_entry_number: requiredText(memoRaw.journal_entry_number, "credit_memo.journal_entry_number"),
        journal_status: journalStatus as ReturnCreditMemoSummary["journal_status"],
        receivable_account_id: requiredText(memoRaw.receivable_account_id, "credit_memo.receivable_account_id"),
        revenue_account_id: requiredText(memoRaw.revenue_account_id, "credit_memo.revenue_account_id"),
        tax_account_id: nullableText(memoRaw.tax_account_id),
        created_at: requiredText(memoRaw.created_at, "credit_memo.created_at"),
        posted_at: nullableText(memoRaw.posted_at),
      };
    }
    const items = raw.items.map((line): ReturnCreditLine => {
      if (!isRecord(line)) throw new Error("سطر مصدر الإشعار الدائن غير صالح.");
      return {
        request_item_id: requiredText(line.request_item_id, "item.request_item_id"),
        order_item_id: requiredText(line.order_item_id, "item.order_item_id"),
        product_id: nullableText(line.product_id),
        item_code: nullableText(line.item_code),
        product_name: requiredText(line.product_name, "item.product_name"),
        unit: nullableText(line.unit),
        requested_quantity: finiteAmount(line.requested_quantity, "item.requested_quantity"),
        received_quantity: finiteAmount(line.received_quantity, "item.received_quantity"),
        invoice_item_id: nullableText(line.invoice_item_id),
        invoice_item_quantity: finiteAmount(line.invoice_item_quantity ?? 0, "item.invoice_item_quantity"),
        invoice_item_line_total: finiteAmount(line.invoice_item_line_total ?? 0, "item.invoice_item_line_total"),
        already_credited_quantity: finiteAmount(line.already_credited_quantity ?? 0, "item.already_credited_quantity"),
        remaining_invoice_quantity: finiteAmount(line.remaining_invoice_quantity ?? 0, "item.remaining_invoice_quantity"),
      };
    });
    const currency = nullableText(raw.currency);
    return {
      request_id: requiredText(raw.request_id, "request_id"),
      request_number: requiredText(raw.request_number, "request_number"),
      order_id: requiredText(raw.order_id, "order_id"),
      order_number: requiredText(raw.order_number, "order_number"),
      customer_id: requiredText(raw.customer_id, "customer_id"),
      customer_name: requiredText(raw.customer_name, "customer_name"),
      created_at: requiredText(raw.created_at, "created_at"),
      invoice_id: invoiceId,
      invoice_number: nullableText(raw.invoice_number),
      currency,
      invoice_subtotal: nullableAmount(raw.invoice_subtotal, "invoice_subtotal"),
      invoice_tax_amount: nullableAmount(raw.invoice_tax_amount, "invoice_tax_amount"),
      invoice_total_amount: nullableAmount(raw.invoice_total_amount, "invoice_total_amount"),
      invoice_status: nullableText(raw.invoice_status),
      invoice_totals_reconcile: raw.invoice_totals_reconcile === true,
      mapping_ready: raw.mapping_ready === true,
      items,
      credit_memo: creditMemo,
    };
  });
  return { accounts, requests };
}

export function createCreditMemoIdempotencyKey(): string {
  if (typeof globalThis.crypto?.randomUUID === "function") return globalThis.crypto.randomUUID();
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (token) => {
    const random = Math.floor(Math.random() * 16);
    return (token === "x" ? random : (random & 0x3) | 0x8).toString(16);
  });
}

export interface ReturnCreditMemoMutation {
  credit_memo_id: string;
  memo_number: string;
  status: "draft" | "posted" | "void";
  journal_entry_id: string;
  journal_entry_number: string;
  journal_status: "draft" | "posted" | "void";
  subtotal_amount: number;
  tax_amount: number;
  total_amount: number;
  currency: string;
  replayed: boolean;
}

export function readReturnCreditMemoMutation(value: unknown): ReturnCreditMemoMutation {
  if (!isRecord(value)) throw new Error("لم يرجع الخادم نتيجة صالحة للإشعار الدائن.");
  const status = requiredText(value.status, "status");
  const journalStatus = requiredText(value.journal_status, "journal_status");
  if (!["draft", "posted", "void"].includes(status) || !["draft", "posted", "void"].includes(journalStatus)) {
    throw new Error("حالة الإشعار الدائن أو قيده غير صالحة.");
  }
  if (typeof value.replayed !== "boolean") throw new Error("علامة إعادة المحاولة غير موجودة في استجابة الخادم.");
  return {
    credit_memo_id: requiredText(value.credit_memo_id, "credit_memo_id"),
    memo_number: requiredText(value.memo_number, "memo_number"),
    status: status as ReturnCreditMemoMutation["status"],
    journal_entry_id: requiredText(value.journal_entry_id, "journal_entry_id"),
    journal_entry_number: requiredText(value.journal_entry_number, "journal_entry_number"),
    journal_status: journalStatus as ReturnCreditMemoMutation["journal_status"],
    subtotal_amount: finiteAmount(value.subtotal_amount, "subtotal_amount"),
    tax_amount: finiteAmount(value.tax_amount, "tax_amount"),
    total_amount: finiteAmount(value.total_amount, "total_amount"),
    currency: requiredText(value.currency, "currency"),
    replayed: value.replayed,
  };
}
