import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
import { CustomerOrderPricingPresentation } from "@/components/CustomerOrderPricingPresentation";
import { resolveCustomerOrderPricingPresentation } from "@/lib/storefront-price-visibility";
import { retryRead } from "@/lib/retry";

export type CustomerOrderPricingPreviewItem = {
  product_id: string;
  quantity: number;
};
export type CustomerOrderPricingSurface = "cart" | "orders";

type PreviewAttempt =
  | { signature: string; status: "loading" }
  | { signature: string; status: "ready"; payload: unknown }
  | { signature: string; status: "hidden" }
  | { signature: string; status: "error" }
  | { signature: string; status: "auth-required" };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Fetches a tenant/tier-aware price preview from the server for one customer surface.
 * No price is derived from catalog data in the browser. False/malformed policy values,
 * stale payloads, denied RPCs and malformed server responses all fail closed.
 */
export function CustomerOrderPricingPreview({
  items,
  policyValue,
  surface,
  title,
}: {
  items: readonly CustomerOrderPricingPreviewItem[];
  policyValue: unknown;
  surface: CustomerOrderPricingSurface;
  title: string;
}) {
  const { user } = useAuth();
  const [retry, setRetry] = useState(0);
  const [attempt, setAttempt] = useState<PreviewAttempt | null>(null);
  const signature = JSON.stringify(items.map((item) => ({
    product_id: item.product_id,
    quantity: item.quantity,
  })));
  // Bind the ready payload to the current account during render, before effects flush.
  const requestSignature = surface + ":" + signature + ":" + (user?.profileId ?? "anonymous");

  useEffect(() => {
    let active = true;
    if (policyValue !== true || items.length === 0) {
      setAttempt(null);
      return () => { active = false; };
    }

    if (!user?.profileId) {
      setAttempt({ signature: requestSignature, status: "auth-required" });
      return () => { active = false; };
    }

    let parsedItems: CustomerOrderPricingPreviewItem[];
    try {
      const value: unknown = JSON.parse(signature);
      if (!Array.isArray(value) || value.length === 0 || value.length > 100 ||
          !value.every((line) => isRecord(line) && typeof line.product_id === "string" &&
            line.product_id.trim().length > 0 && Number.isSafeInteger(line.quantity) &&
            typeof line.quantity === "number" && line.quantity > 0)) {
        throw new Error("invalid price preview items");
      }
      parsedItems = value as CustomerOrderPricingPreviewItem[];
    } catch {
      setAttempt({ signature: requestSignature, status: "error" });
      return () => { active = false; };
    }

    setAttempt({ signature: requestSignature, status: "loading" });
    void (async () => {
      try {
        const data = await retryRead(async () => {
          // A component that has unmounted or changed policy must not schedule another read.
          if (!active) throw new Error("pricing preview request cancelled");
          const { data, error } = await supabase.rpc("preview_customer_order_pricing", {
            p_items: parsedItems,
            p_surface: surface,
          });
          // Preserve status/code metadata so only recognized transient read failures retry.
          if (error) throw error;
          return data;
        });
        if (!active) return;

        const presentation = resolveCustomerOrderPricingPresentation(true, data, surface);
        if (presentation.visible) {
          setAttempt({ signature: requestSignature, status: "ready", payload: data });
          return;
        }

        if (isRecord(data) && data.visible === false && data.surface === surface) {
          setAttempt({ signature: requestSignature, status: "hidden" });
          return;
        }
        setAttempt({ signature: requestSignature, status: "error" });
      } catch {
        if (active) setAttempt({ signature: requestSignature, status: "error" });
      }
    })();

    return () => { active = false; };
  }, [requestSignature, signature, items.length, policyValue, surface, user?.profileId, retry]);

  if (policyValue !== true || items.length === 0) return null;

  const current = attempt?.signature === requestSignature ? attempt : null;
  const wrapperStyle = {
    marginTop: 12,
    padding: 12,
    border: "1px solid #d8e6e8",
    borderRadius: 10,
    background: "#f8fbfc",
    color: "#344b52",
  } as const;

  if (!current || current.status === "loading") {
    return <p style={wrapperStyle} role="status">جار جلب مراجعة الأسعار من الخادم؛ لم تُعرض أي مبالغ محلية.</p>;
  }
  if (current.status === "auth-required") {
    return <p style={wrapperStyle} role="status">سجّل الدخول أولًا؛ لن تُعرض الأسعار دون معاينة خادمية مرتبطة بحسابك.</p>;
  }
  if (current.status === "hidden") {
    return <p style={wrapperStyle} role="status">لم يسمح إعداد الخادم بعرض الأسعار على هذه الشاشة؛ لم تُعرض أي مبالغ.</p>;
  }
  if (current.status === "error") {
    return (
      <div style={wrapperStyle} role="alert">
        تعذر التحقق من أسعار هذه الشاشة من الخادم؛ تم إخفاء المبالغ. أعد المحاولة.
        <button type="button" className="sf-btn-secondary" style={{ marginInlineStart: 10 }} onClick={() => setRetry((value) => value + 1)}>
          إعادة المحاولة
        </button>
      </div>
    );
  }

  return (
    <div style={wrapperStyle}>
      <CustomerOrderPricingPresentation
        policyValue={policyValue}
        serverPayload={current.payload}
        expectedSurface={surface}
        title={title}
      />
    </div>
  );
}
