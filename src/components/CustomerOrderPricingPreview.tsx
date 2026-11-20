import { useEffect, useState } from "react";
import { resolveCustomerOrderPricingPresentation, type CustomerOrderPricingPresentation as CustomerOrderPricingPresentationData } from "@/lib/storefront-price-visibility";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
import { CustomerOrderPricingPresentation } from "@/components/CustomerOrderPricingPresentation";
import { retryRead } from "@/lib/retry";
import { isCheckoutAuthorizationDenied } from "@/lib/checkout-errors";

export type CustomerOrderPricingPreviewItem = {
  product_id: string;
  quantity: number;
};
export type CustomerOrderPricingSurface = "cart" | "orders";
export type CustomerOrderPricingPreviewStatus =
  | "loading"
  | "ready"
  | "hidden"
  | "error"
  | "auth-required"
  | "permission-denied";

type PreviewAttempt =
  | { signature: string; status: "loading" }
  | { signature: string; status: "ready"; payload: unknown }
  | { signature: string; status: "hidden" }
  | { signature: string; status: "error" }
  | { signature: string; status: "auth-required" }
  | { signature: string; status: "permission-denied" };

type PreviewResult =
  | { status: "ready"; payload: unknown }
  | { status: "hidden" }
  | { status: "error" }
  | { status: "permission-denied" };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isValidPreviewItem(value: unknown): value is CustomerOrderPricingPreviewItem {
  if (!isRecord(value)) return false;
  if (typeof value.product_id !== "string" || !value.product_id.trim()) return false;
  return typeof value.quantity === "number" &&
    Number.isSafeInteger(value.quantity) &&
    value.quantity > 0;
}

function parsePreviewItems(signature: string): CustomerOrderPricingPreviewItem[] | null {
  try {
    const value: unknown = JSON.parse(signature);
    if (!Array.isArray(value) || value.length === 0 || value.length > 100) return null;
    if (!value.every(isValidPreviewItem)) return null;
    return value;
  } catch {
    return null;
  }
}

async function fetchPreviewResult(
  items: CustomerOrderPricingPreviewItem[],
  surface: CustomerOrderPricingSurface,
  isActive: () => boolean,
): Promise<PreviewResult> {
  try {
    const data = await retryRead(async () => {
      if (!isActive()) throw new Error("pricing preview request cancelled");
      const { data, error } = await supabase.rpc("preview_customer_order_pricing", {
        p_items: items,
        p_surface: surface,
      });
      if (error) throw error;
      return data;
    });

    const presentation = resolveCustomerOrderPricingPresentation(true, data, surface);
    if (presentation.visible) return { status: "ready", payload: data };

    if (isRecord(data) && data.visible === false && data.surface === surface) {
      return { status: "hidden" };
    }
    return { status: "error" };
  } catch (cause) {
    return isCheckoutAuthorizationDenied(cause)
      ? { status: "permission-denied" }
      : { status: "error" };
  }
}

function PreviewStatusMessage({
  status,
  onRetry,
}: {
  status: CustomerOrderPricingPreviewStatus;
  onRetry: () => void;
}) {
  if (status === "loading") {
    return <p role="status">جار جلب مراجعة الأسعار من الخادم؛ لن تُعرض أي مبالغ قبل اكتمال التحقق.</p>;
  }
  if (status === "auth-required") {
    return <p role="status">سجّل الدخول أولًا؛ لن تُعرض الأسعار دون معاينة خادمية مرتبطة بحسابك.</p>;
  }
  if (status === "hidden") {
    return <p role="status">لم يسمح إعداد الخادم بعرض الأسعار في هذه الشاشة. لم تُعرض أي مبالغ، وسيظل اعتماد السعر النهائي من الخادم.</p>;
  }
  if (status === "permission-denied") {
    return (
      <div className="sf-order-pricing-denied" role="alert">
        <strong>حسابك لا يملك صلاحية إنشاء طلب عميل حاليًا.</strong>
        <p>لم تُعرض الأسعار ولم يُرسل الطلب. اطلب من مسؤول المنشأة مراجعة اعتماد حساب العميل أو دور العضو المشتري، ثم أعد فتح صفحة إتمام الطلب.</p>
      </div>
    );
  }

  return (
    <div className="sf-order-pricing-error" role="alert">
      <strong>تعذّر الاتصال بمعاينة الأسعار.</strong>
      <p>تم إخفاء المبالغ؛ لم نستخدم أسعارًا محلية أو تقديرية. أعد التحقق قبل إرسال الطلب.</p>
      <button type="button" className="sf-btn-secondary" onClick={onRetry}>
        إعادة المحاولة
      </button>
    </div>
  );
}

function PreviewAttemptView({
  attempt,
  signature,
  policyValue,
  surface,
  title,
  onRetry,
}: {
  attempt: PreviewAttempt | null;
  signature: string;
  policyValue: unknown;
  surface: CustomerOrderPricingSurface;
  title: string;
  onRetry: () => void;
}) {
  const current = attempt?.signature === signature ? attempt : null;

  if (!current || current.status !== "ready") {
    const status = current?.status ?? "loading";
    return (
      <div className="sf-order-pricing-state">
        <PreviewStatusMessage status={status} onRetry={onRetry} />
      </div>
    );
  }

  return (
    <div className="sf-order-pricing-ready">
      <CustomerOrderPricingPresentation
        policyValue={policyValue}
        serverPayload={current.payload}
        expectedSurface={surface}
        title={title}
      />
    </div>
  );
}

/**
 * Loads an exact tenant/tier/promotion price preview from the server.
 * Monetary values are never calculated or recovered from catalogue data in the browser.
 * Explicit authorization denials are surfaced separately from transient transport errors.
 */
export function CustomerOrderPricingPreview({
  items,
  policyValue,
  surface,
  title,
  onStatusChange,
  onPresentationChange,
}: {
  items: readonly CustomerOrderPricingPreviewItem[];
  policyValue: unknown;
  surface: CustomerOrderPricingSurface;
  title: string;
  onStatusChange?: (status: CustomerOrderPricingPreviewStatus) => void;
  onPresentationChange?: (presentation: CustomerOrderPricingPresentationData | null) => void;
}) {
  const { user } = useAuth();
  const [retry, setRetry] = useState(0);
  const [attempt, setAttempt] = useState<PreviewAttempt | null>(null);
  const signature = JSON.stringify(items.map((item) => ({
    product_id: item.product_id,
    quantity: item.quantity,
  })));
  const identitySignature = JSON.stringify({
    userId: user?.id ?? null,
    profileId: user?.profileId ?? null,
    roles: [...(user?.roles ?? [])].sort(),
    isStaff: user?.isStaff === true,
  });
  const requestSignature = surface + ":" + signature + ":" + identitySignature;
  const currentAttempt = attempt?.signature === requestSignature ? attempt : null;
  const reportedStatus: CustomerOrderPricingPreviewStatus =
    policyValue !== true || items.length === 0
      ? "hidden"
      : currentAttempt?.status ?? "loading";

  const currentPayload = currentAttempt?.status === "ready" ? currentAttempt.payload : null;

  useEffect(() => {
    if (!onPresentationChange) return;
    const presentation = policyValue !== true || currentPayload === null
      ? null
      : resolveCustomerOrderPricingPresentation(true, currentPayload, surface);
    onPresentationChange(presentation?.visible ? presentation : null);
  }, [currentPayload, onPresentationChange, policyValue, requestSignature, surface]);

  useEffect(() => {
    onStatusChange?.(reportedStatus);
  }, [reportedStatus, onStatusChange]);

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

    const parsedItems = parsePreviewItems(signature);
    if (!parsedItems) {
      setAttempt({ signature: requestSignature, status: "error" });
      return () => { active = false; };
    }

    setAttempt({ signature: requestSignature, status: "loading" });
    void fetchPreviewResult(parsedItems, surface, () => active)
      .then((result) => {
        if (active) setAttempt({ signature: requestSignature, ...result });
      })
      .catch(() => {
        if (active) setAttempt({ signature: requestSignature, status: "error" });
      });

    return () => { active = false; };
  }, [requestSignature, signature, items.length, policyValue, surface, identitySignature, retry, user?.profileId]);

  if (policyValue !== true || items.length === 0) return null;

  return (
    <PreviewAttemptView
      attempt={attempt}
      signature={requestSignature}
      policyValue={policyValue}
      surface={surface}
      title={title}
      onRetry={() => setRetry((value) => value + 1)}
    />
  );
}
