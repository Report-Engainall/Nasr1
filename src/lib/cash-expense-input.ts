export type CashExpensePaymentMethod = "cash" | "transfer" | "card" | "other";

export type CashExpenseDraft = {
  category: string;
  description: string;
  amount: string;
  currency: string;
  payment_method: string;
  reference: string;
  expense_date: string;
};

export type ValidatedCashExpenseInput = {
  category: string;
  description: string;
  amount: string;
  currency: string;
  payment_method: CashExpensePaymentMethod;
  reference: string | null;
  expense_date: string;
};

function normalizeAmount(value: string): string {
  const text = value.trim();
  const match = /^(0|[1-9]\d*)(?:\.(\d{1,2}))?$/.exec(text);
  if (!match) throw new Error("أدخل مبلغاً موجباً بمنزلتين عشريتين كحد أقصى.");
  const whole = BigInt(match[1]);
  const fraction = (match[2] ?? "").padEnd(2, "0");
  const minor = whole * 100n + BigInt(fraction || "0");
  if (minor <= 0n) throw new Error("يجب أن يكون مبلغ المصروف أكبر من صفر.");
  if (minor >= 1000000000000000000n) throw new Error("المبلغ يتجاوز دقة السجل المالي المسموحة.");
  return whole.toString() + "." + fraction;
}

function isDateOnly(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const year = Number(match[1]), month = Number(match[2]), day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

export function validateCashExpenseInput(input: CashExpenseDraft): ValidatedCashExpenseInput {
  const category = input.category.trim();
  const description = input.description.trim();
  const currency = input.currency.trim().toUpperCase();
  const reference = input.reference.trim();
  const method = input.payment_method.trim() as CashExpensePaymentMethod;

  if (category.length < 2 || category.length > 80) throw new Error("التصنيف مطلوب (من حرفين إلى 80 حرفاً).");
  if (description.length < 2 || description.length > 600) throw new Error("الوصف مطلوب (من حرفين إلى 600 حرف).");
  if (!/^[A-Z]{3}$/.test(currency)) throw new Error("رمز العملة يجب أن يتكون من ثلاثة أحرف مثل YER أو USD.");
  if (!["cash", "transfer", "card", "other"].includes(method)) throw new Error("طريقة دفع المصروف غير مدعومة.");
  if (reference.length > 200) throw new Error("مرجع المصروف لا يجوز أن يتجاوز 200 حرف.");
  if (!isDateOnly(input.expense_date)) throw new Error("اختر تاريخ مصروف صحيحاً.");
  return {
    category,
    description,
    amount: normalizeAmount(input.amount),
    currency,
    payment_method: method,
    reference: reference || null,
    expense_date: input.expense_date,
  };
}
