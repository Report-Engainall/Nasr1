import { useEffect, useState } from "react";
import { Minus, Plus } from "lucide-react";
import { normalizeLocalizedDecimalInput } from "@/lib/localized-number-input";

export type CartQuantityControlProps = {
  productName: string;
  quantity: number;
  minimum?: number;
  multiple?: number;
  available?: number;
  onCommit: (quantity: number) => void;
};

function positiveInteger(value: number | undefined, fallback: number): number {
  return Number.isSafeInteger(value) && Number(value) >= 1 ? Number(value) : fallback;
}

export function nextCartQuantity(quantity: number, minimum: number, multiple: number): number {
  if (quantity < minimum) return minimum;
  return minimum + (Math.floor((quantity - minimum) / multiple) + 1) * multiple;
}

export function previousCartQuantity(quantity: number, minimum: number, multiple: number): number | null {
  if (quantity <= minimum) return null;
  return minimum + Math.max(0, Math.ceil((quantity - minimum) / multiple) - 1) * multiple;
}

export function validateCartQuantity(
  rawValue: string,
  minimum: number,
  multiple: number,
  maximum: number | null,
): { valid: true; quantity: number } | { valid: false; message: string } {
  const normalized = normalizeLocalizedDecimalInput(rawValue);
  if (!/^\d+$/.test(normalized)) {
    return { valid: false, message: "أدخل كمية صحيحة بالأرقام دون كسور." };
  }
  const quantity = Number(normalized);
  if (!Number.isSafeInteger(quantity) || quantity < minimum) {
    return { valid: false, message: `الحد الأدنى للطلب هو ${minimum}.` };
  }
  if ((quantity - minimum) % multiple !== 0) {
    return { valid: false, message: `يجب أن تكون الكمية بزيادة مضاعف ${multiple} بدءًا من ${minimum}.` };
  }
  if (maximum !== null && quantity > maximum) {
    return { valid: false, message: `المتاح حاليًا ${maximum} فقط.` };
  }
  return { valid: true, quantity };
}

export function CartQuantityControl({
  productName,
  quantity,
  minimum: minimumValue,
  multiple: multipleValue,
  available,
  onCommit,
}: CartQuantityControlProps) {
  const minimum = positiveInteger(minimumValue, 1);
  const multiple = positiveInteger(multipleValue, 1);
  const maximum = typeof available === "number" && Number.isFinite(available)
    ? Math.max(0, Math.floor(available))
    : null;
  const maximumAllowed = maximum !== null && maximum >= minimum
    ? minimum + Math.floor((maximum - minimum) / multiple) * multiple
    : null;
  const [draft, setDraft] = useState(String(quantity));
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setDraft(String(quantity));
    setError(null);
  }, [quantity]);

  const commitDraft = () => {
    if (draft === String(quantity)) {
      setError(maximum !== null && quantity > maximum ? `المتاح حاليًا ${maximum} فقط؛ خفّض الكمية قبل المتابعة.` : null);
      return;
    }
    const result = validateCartQuantity(draft, minimum, multiple, maximum);
    if (!result.valid) {
      setDraft(String(quantity));
      setError(result.message);
      return;
    }
    setDraft(String(result.quantity));
    setError(null);
    if (result.quantity !== quantity) onCommit(result.quantity);
  };

  const next = nextCartQuantity(quantity, minimum, multiple);
  const previous = maximumAllowed !== null && quantity > maximumAllowed
    ? maximumAllowed
    : previousCartQuantity(quantity, minimum, multiple);
  const nextDisabled = maximum !== null && next > maximum;

  const commitStep = (value: number) => {
    const result = validateCartQuantity(String(value), minimum, multiple, maximum);
    if (!result.valid) {
      setError(result.message);
      return;
    }
    setDraft(String(result.quantity));
    setError(null);
    onCommit(result.quantity);
  };

  const buttonStyle = {
    width: 34,
    minWidth: 34,
    height: 36,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    border: "1px solid var(--border, #cfdddd)",
    borderRadius: 8,
    background: "var(--muted, #f0f7f3)",
    color: "var(--primary, #1d6048)",
    cursor: "pointer",
  } as const;

  return (
    <div className="sf-cart-qty" style={{ position: "relative", display: "flex", alignItems: "center", justifyContent: "center", gap: 6, flexWrap: "nowrap" }}>
      <button
        type="button"
        aria-label={`تقليل كمية ${productName}`}
        disabled={previous === null}
        onClick={() => previous !== null && commitStep(previous)}
        style={{ ...buttonStyle, opacity: previous === null ? 0.45 : 1, cursor: previous === null ? "not-allowed" : "pointer" }}
      ><Minus size={14} /></button>
      <input
        type="text"
        inputMode="numeric"
        autoComplete="off"
        maxLength={16}
        dir="ltr"
        value={draft}
        aria-label={`كمية ${productName}`}
        aria-invalid={Boolean(error)}
        onChange={(event) => {
          const value = normalizeLocalizedDecimalInput(event.currentTarget.value);
          if (value === "" || /^\d+$/.test(value)) {
            setDraft(value);
            setError(null);
          }
        }}
        onBlur={commitDraft}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            commitDraft();
          }
        }}
        style={{ width: 76, minWidth: 58, minHeight: 36, boxSizing: "border-box", textAlign: "center", border: "1px solid var(--border, #cfdddd)", borderRadius: 8, padding: "6px 4px", background: "var(--card, #fff)", color: "var(--foreground, #18383c)" }}
      />
      <button
        type="button"
        aria-label={`زيادة كمية ${productName}`}
        disabled={nextDisabled}
        onClick={() => !nextDisabled && commitStep(next)}
        style={{ ...buttonStyle, opacity: nextDisabled ? 0.45 : 1, cursor: nextDisabled ? "not-allowed" : "pointer" }}
      ><Plus size={14} /></button>
      {error && <small role="alert" style={{ position: "absolute", top: "calc(100% + 4px)", right: 0, zIndex: 2, maxWidth: 240, padding: "4px 7px", borderRadius: 6, background: "#fff4f4", color: "#a52b2b", fontSize: 11 }}>{error}</small>}
    </div>
  );
}
