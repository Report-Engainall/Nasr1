import { useCallback, useEffect, useState } from "react";
import { ClipboardCheck, PackageCheck, RefreshCw, Warehouse } from "lucide-react";
import { supabase } from "@/lib/supabase";
import {
  buildCustomerReturnReceiptLines,
  createReturnReceiptIdempotencyKey,
  readCustomerReturnReceiptQueue,
  readReturnReceiptMutationResult,
  type CustomerReturnReceiptDraft,
  type CustomerReturnReceiptQueue,
  type CustomerReturnReceiptRequest,
} from "@/lib/customer-return-receipts";

const panel: React.CSSProperties = {
  marginTop: 22, border: "1px solid #dce7e8", borderRadius: 14, padding: 16,
  background: "var(--card, #fff)", display: "grid", gap: 13,
};
const field: React.CSSProperties = {
  width: "100%", boxSizing: "border-box", padding: "9px 11px",
  border: "1px solid #ccdadd", borderRadius: 8, color: "#21383d",
  background: "#fff", font: "inherit",
};
const button: React.CSSProperties = {
  border: "1px solid #ccdadd", borderRadius: 8, padding: "8px 11px",
  display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 7,
  background: "#fff", color: "#24464a", font: "inherit", fontWeight: 750, cursor: "pointer",
};
const primary: React.CSSProperties = { ...button, color: "#fff", background: "#176b55", borderColor: "#176b55" };
const muted: React.CSSProperties = { margin: 0, color: "#64787c", fontSize: 13, lineHeight: 1.7 };

export function CustomerReturnReceiptQueue({ onNotice }: { onNotice: (message: string) => void }) {
  const [queue, setQueue] = useState<CustomerReturnReceiptQueue>({ warehouses: [], requests: [] });
  const [warehouseId, setWarehouseId] = useState("");
  const [drafts, setDrafts] = useState<Record<string, Record<string, CustomerReturnReceiptDraft>>>({});
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [retryKeys, setRetryKeys] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const { data, error: rpcError } = await supabase.rpc("list_customer_return_receipt_queue", { p_limit: 50 });
      if (rpcError) throw new Error(rpcError.message || "تعذر تحميل قائمة الاستلام والفحص.");
      const result = readCustomerReturnReceiptQueue(data);
      setQueue(result);
      setWarehouseId((current) => current && result.warehouses.some((warehouse) => warehouse.id === current)
        ? current : (result.warehouses[0]?.id ?? ""));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "تعذر تحميل قائمة الاستلام والفحص.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  function updateDraft(requestId: string, itemId: string, fieldName: keyof CustomerReturnReceiptDraft, value: string) {
    setDrafts((current) => ({
      ...current,
      [requestId]: {
        ...(current[requestId] ?? {}),
        [itemId]: {
          received_quantity: current[requestId]?.[itemId]?.received_quantity ?? "",
          restockable_quantity: current[requestId]?.[itemId]?.restockable_quantity ?? "",
          [fieldName]: value,
        },
      },
    }));
  }

  async function receive(request: CustomerReturnReceiptRequest) {
    setError("");
    if (!warehouseId) {
      setError("لا يوجد مخزن نشط متاح في المؤسسة لاستلام المرتجع.");
      return;
    }
    let lines;
    try {
      lines = buildCustomerReturnReceiptLines(drafts[request.id] ?? {}, request.items);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "راجع كميات الاستلام والفحص.");
      return;
    }
    const key = retryKeys[request.id] ?? createReturnReceiptIdempotencyKey();
    setRetryKeys((current) => ({ ...current, [request.id]: key }));
    setBusyId(request.id);
    try {
      const { data, error: rpcError } = await supabase.rpc("receive_customer_return", {
        p_return_request_id: request.id,
        p_warehouse_id: warehouseId,
        p_lines: lines,
        p_notes: (notes[request.id] ?? "").trim() || null,
        p_idempotency_key: key,
      });
      if (rpcError) throw new Error(rpcError.message || "تعذر حفظ الاستلام الفعلي.");
      const result = readReturnReceiptMutationResult(data);
      onNotice(
        "تم حفظ " + result.receipt_number + " — المستلم " +
        result.received_quantity.toLocaleString("ar-YE") + "، الصالح للمخزون " +
        result.restockable_quantity.toLocaleString("ar-YE") + "، والتالف " +
        result.defective_quantity.toLocaleString("ar-YE") + ". " +
        (result.idempotent_replay ? "أعيدت نتيجة العملية السابقة دون تكرار حركة المخزون." : "حُفظ سجل الاستلام وحركة المخزون الصالحة فقط."),
      );
      setDrafts((current) => { const next = { ...current }; delete next[request.id]; return next; });
      setNotes((current) => { const next = { ...current }; delete next[request.id]; return next; });
      setRetryKeys((current) => { const next = { ...current }; delete next[request.id]; return next; });
      await load();
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "تعذر حفظ الاستلام الفعلي.";
      setError(message);
      onNotice(message);
    } finally {
      setBusyId(null);
    }
  }

  return (
    <section style={panel} dir="rtl" aria-labelledby="return-receipt-heading">
      <header style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div>
          <h2 id="return-receipt-heading" style={{ margin: 0, fontSize: 19, display: "flex", alignItems: "center", gap: 8 }}>
            <PackageCheck size={19} /> استلام المرتجعات وفحصها
          </h2>
          <p style={{ ...muted, marginTop: 5 }}>
            يسجّل الموظف الكمية المستلمة ويحدد الصالح لإعادة المخزون. الباقي يسجّل تالفًا ولا يدخل الرصيد المتاح. لا يصدر إشعار دائن أو قيد محاسبي تلقائيًا.
          </p>
        </div>
        <button type="button" style={button} onClick={() => void load()} disabled={loading || busyId !== null}>
          <RefreshCw size={15} /> تحديث
        </button>
      </header>

      <label style={{ display: "grid", gap: 6, maxWidth: 540, fontSize: 13, fontWeight: 750 }}>
        <span style={{ display: "flex", alignItems: "center", gap: 7 }}><Warehouse size={15} /> مخزن الاستلام النشط</span>
        <select value={warehouseId} onChange={(event) => setWarehouseId(event.target.value)} style={field} disabled={loading || busyId !== null || queue.warehouses.length === 0}>
          {queue.warehouses.map((warehouse) => <option key={warehouse.id} value={warehouse.id}>{warehouse.name}{warehouse.code ? " · " + warehouse.code : ""}</option>)}
        </select>
      </label>

      {loading && <p role="status" style={muted}>جارٍ تحميل طلبات المرتجعات المعتمدة...</p>}
      {error && <p role="alert" style={{ ...muted, color: "#a32929", padding: 10, borderRadius: 8, background: "#fff1f1" }}>{error}</p>}
      {!loading && !error && queue.warehouses.length === 0 && <p style={muted}>لا يوجد مخزن نشط متاح في المؤسسة؛ لم يُنشأ أي استلام.</p>}
      {!loading && !error && queue.requests.length === 0 && <p style={muted}>لا توجد مرتجعات معتمدة بانتظار الاستلام الفعلي.</p>}

      {queue.requests.map((request) => (
        <article key={request.id} style={{ display: "grid", gap: 12, padding: 14, border: "1px solid #e1e9ea", borderRadius: 11 }}>
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
            <div>
              <h3 style={{ margin: 0, fontSize: 16 }}>{request.request_number}</h3>
              <p style={muted}>الطلب {request.order_number} · العميل {request.customer_name} · {new Date(request.created_at).toLocaleString("ar-YE")}</p>
            </div>
            <span style={{ background: "#fff4df", color: "#805413", borderRadius: 20, padding: "4px 9px", fontSize: 12, fontWeight: 800 }}>بانتظار الاستلام</span>
          </div>

          {request.items.map((item) => {
            const draft = drafts[request.id]?.[item.request_item_id] ?? { received_quantity: "", restockable_quantity: "" };
            return (
              <div key={item.request_item_id} style={{ display: "grid", gridTemplateColumns: "minmax(180px, 2fr) repeat(2, minmax(110px, 1fr))", gap: 9, alignItems: "end" }}>
                <div>
                  <strong style={{ fontSize: 13 }}>{item.product_name}</strong>
                  <p style={muted}>الرمز {item.item_code ?? "غير مسجل"} · المتبقي {item.remaining_quantity.toLocaleString("ar-YE")} {item.unit ?? ""}</p>
                  {!item.product_id && <p style={{ ...muted, color: "#805413" }}>لا يوجد ربط بمنتج؛ لا يمكن إضافة هذا الصنف إلى المخزون.</p>}
                </div>
                <label style={{ display: "grid", gap: 5, fontSize: 12, fontWeight: 750 }}>
                  الكمية المستلمة
                  <input type="number" min="0.001" max={item.remaining_quantity} step="0.001" inputMode="decimal"
                    value={draft.received_quantity} onChange={(event) => updateDraft(request.id,item.request_item_id,"received_quantity",event.target.value)}
                    style={field} disabled={busyId === request.id} />
                </label>
                <label style={{ display: "grid", gap: 5, fontSize: 12, fontWeight: 750 }}>
                  الصالح للمخزون
                  <input type="number" min="0" max={draft.received_quantity || item.remaining_quantity} step="0.001" inputMode="decimal"
                    value={draft.restockable_quantity} onChange={(event) => updateDraft(request.id,item.request_item_id,"restockable_quantity",event.target.value)}
                    style={field} disabled={busyId === request.id} />
                </label>
                {draft.received_quantity.trim() && draft.restockable_quantity.trim() && (
                  <p style={{ ...muted, gridColumn: "1 / -1" }}>
                    الكمية التالفة المحسوبة: {Math.max(0,Number(draft.received_quantity)-Number(draft.restockable_quantity)).toLocaleString("ar-YE")} {item.unit ?? ""}
                  </p>
                )}
              </div>
            );
          })}

          <label style={{ display: "grid", gap: 6, fontSize: 13, fontWeight: 750 }}>
            ملاحظة الاستلام (اختياري)
            <textarea rows={2} maxLength={2000} value={notes[request.id] ?? ""}
              onChange={(event) => setNotes((current) => ({ ...current, [request.id]: event.target.value }))}
              style={{ ...field, resize: "vertical" }} disabled={busyId === request.id} />
          </label>
          <footer style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            <button type="button" style={primary} disabled={busyId !== null || loading || queue.warehouses.length === 0} onClick={() => void receive(request)}>
              <ClipboardCheck size={16} /> تسجيل الاستلام والفحص
            </button>
          </footer>
        </article>
      ))}
    </section>
  );
}
