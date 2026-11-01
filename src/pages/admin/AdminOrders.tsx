import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import type { Order, OrderItem } from '../../lib/types'
import { ORDER_STATUS_LABELS } from '../../lib/types'
import { formatPrice } from '../../lib/pricing'

type CustomerSummary = { id: string; full_name: string }
type WorkflowOrderStatus = 'draft' | 'pending' | 'confirmed' | 'processing' | 'shipped' | 'delivered' | 'cancelled'

const STATUS_LABELS: Record<WorkflowOrderStatus, string> = {
  draft: 'مسودة',
  pending: 'بانتظار التأكيد',
  confirmed: 'معتمد',
  processing: 'قيد التجهيز',
  shipped: 'تم الشحن',
  delivered: 'تم التسليم',
  cancelled: 'ملغي',
}
const STATUS_OPTIONS: WorkflowOrderStatus[] = [
  'draft', 'pending', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled',
]
const NEXT_STATUSES: Record<WorkflowOrderStatus, WorkflowOrderStatus[]> = {
  draft: ['pending', 'cancelled'],
  pending: ['confirmed', 'cancelled'],
  confirmed: ['processing', 'shipped', 'delivered', 'cancelled'],
  processing: ['shipped', 'delivered', 'cancelled'],
  shipped: ['delivered'],
  delivered: [],
  cancelled: [],
}
const isWorkflowStatus = (status: string): status is WorkflowOrderStatus =>
  Object.prototype.hasOwnProperty.call(NEXT_STATUSES, status)
const getStatusLabel = (status: string) =>
  isWorkflowStatus(status) ? STATUS_LABELS[status] : ORDER_STATUS_LABELS[status] ?? status


type AdminOrderRecord = Order & { customer_name?: string };

function AdminOrderStatusControl({ order, saving, onChange }: {
  order: AdminOrderRecord; saving: boolean; onChange: (orderId: string, status: string) => void;
}) {
  if (!isWorkflowStatus(order.status)) {
    return <span className="text-muted" aria-label={"حالة قديمة للطلب " + order.order_code}>حالة قديمة: {getStatusLabel(order.status)}</span>;
  }
  return (
    <select aria-label={"حالة الطلب " + order.order_code} className="input" style={{ width: "auto", padding: "6px 10px", fontSize: "13px" }} value={order.status}
      disabled={saving || NEXT_STATUSES[order.status].length === 0} onChange={(event) => onChange(order.id, event.target.value)}>
      <option value={order.status}>{STATUS_LABELS[order.status]}</option>
      {NEXT_STATUSES[order.status].map((status) => <option key={status} value={status}>{STATUS_LABELS[status]}</option>)}
    </select>
  );
}

function AdminOrderItemsTable({ items }: { items: OrderItem[] }) {
  return (
    <div style={{ marginTop: "16px", borderTop: "1px solid var(--color-border)", paddingTop: "12px", overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead><tr style={{ borderBottom: "1px solid var(--color-border)" }}>
          <th style={{ textAlign: "right", padding: "8px", fontSize: "12px", color: "var(--color-text-muted)" }}>الصنف</th>
          <th style={{ textAlign: "center", padding: "8px", fontSize: "12px", color: "var(--color-text-muted)" }}>الكمية</th>
          <th style={{ textAlign: "center", padding: "8px", fontSize: "12px", color: "var(--color-text-muted)" }}>السعر</th>
          <th style={{ textAlign: "center", padding: "8px", fontSize: "12px", color: "var(--color-text-muted)" }}>الإجمالي</th>
        </tr></thead>
        <tbody>{items.map((item) => (
          <tr key={item.id} style={{ borderBottom: "1px solid var(--color-border)" }}>
            <td style={{ padding: "8px", fontSize: "13px", fontWeight: 600 }}>{item.product_name}</td>
            <td style={{ padding: "8px", fontSize: "13px", textAlign: "center" }}>{item.quantity}</td>
            <td style={{ padding: "8px", fontSize: "13px", textAlign: "center" }}>{formatPrice(item.unit_price)}</td>
            <td style={{ padding: "8px", fontSize: "13px", textAlign: "center", fontWeight: 700 }}>{formatPrice(item.line_total)}</td>
          </tr>
        ))}</tbody>
      </table>
    </div>
  );
}

function AdminOrderCard({ order, selected, items, saving, onViewDetails, onStatusChange }: {
  order: AdminOrderRecord; selected: boolean; items: OrderItem[]; saving: boolean;
  onViewDetails: (orderId: string) => void; onStatusChange: (orderId: string, status: string) => void;
}) {
  return (
    <article className="card" style={{ padding: "16px" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "12px" }}>
        <div>
          <div style={{ fontWeight: 700, fontSize: "15px" }}>{order.order_code}</div>
          <div className="text-muted" style={{ fontSize: "13px" }}>{order.customer_name} — {new Date(order.created_at).toLocaleDateString("ar", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}</div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "12px", flexWrap: "wrap" }}>
          <span className="text-muted" style={{ fontSize: "14px" }}>{order.total_items} صنف</span>
          <span className="font-bold" style={{ color: "var(--color-primary)" }}>{formatPrice(order.total_amount)}</span>
          <AdminOrderStatusControl order={order} saving={saving} onChange={onStatusChange} />
          <button type="button" className="btn btn-secondary btn-sm" aria-expanded={selected} onClick={() => onViewDetails(order.id)}>تفاصيل</button>
        </div>
      </div>
      {selected && items.length > 0 && <AdminOrderItemsTable items={items} />}
    </article>
  );
}

function AdminOrdersList({ loading, orders, filtered, selectedOrder, orderItems, savingOrderId, onViewDetails, onStatusChange }: {
  loading: boolean; orders: AdminOrderRecord[]; filtered: AdminOrderRecord[]; selectedOrder: string | null;
  orderItems: OrderItem[]; savingOrderId: string | null;
  onViewDetails: (orderId: string) => void; onStatusChange: (orderId: string, status: string) => void;
}) {
  if (loading) return <div className="text-muted text-center">جارٍ التحميل...</div>;
  if (orders.length === 0) return <div className="card text-center" style={{ padding: "40px" }}><p className="text-muted">لا توجد طلبات</p></div>;
  if (filtered.length === 0) return <div className="card text-center" style={{ padding: "40px" }}><p className="text-muted">لا توجد طلبات تطابق الحالة المحددة.</p></div>;
  return (
    <section style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
      {filtered.map((order) => <AdminOrderCard key={order.id} order={order} selected={selectedOrder === order.id} items={selectedOrder === order.id ? orderItems : []} saving={savingOrderId === order.id} onViewDetails={onViewDetails} onStatusChange={onStatusChange} />)}
    </section>
  );
}

function AdminOrderStatusFilters({ selected, onSelect }: { selected: string; onSelect: (value: string) => void }) {
  return (
    <nav aria-label="تصفية الطلبات حسب الحالة" style={{ display: "flex", gap: "8px", marginBottom: "16px", flexWrap: "wrap" }}>
      <button type="button" className={"btn btn-sm " + (!selected ? "btn-primary" : "btn-secondary")} aria-pressed={!selected} onClick={() => onSelect("")}>الكل</button>
      {STATUS_OPTIONS.map((status) => <button type="button" key={status} aria-pressed={selected === status} className={"btn btn-sm " + (selected === status ? "btn-primary" : "btn-secondary")} onClick={() => onSelect(status)}>{STATUS_LABELS[status]}</button>)}
    </nav>
  );
}

export default function AdminOrders() {
  const [orders, setOrders] = useState<AdminOrderRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [filterStatus, setFilterStatus] = useState('')
  const [selectedOrder, setSelectedOrder] = useState<string | null>(null)
  const [orderItems, setOrderItems] = useState<OrderItem[]>([])
  const [savingOrderId, setSavingOrderId] = useState<string | null>(null)
  const [transitionError, setTransitionError] = useState<string | null>(null)

  useEffect(() => { loadOrders() }, [])

  const loadOrders = async () => {
    setLoading(true)
    setTransitionError(null)
    try {
      const [ordersResult, customersResult] = await Promise.all([
        supabase.from('orders').select('*').order('created_at', { ascending: false }),
        supabase.from('customers').select('id, full_name'),
      ])
      if (ordersResult.error) throw ordersResult.error
      if (customersResult.error) throw customersResult.error
      const customerNames = new Map(((customersResult.data ?? []) as CustomerSummary[]).map((customer) => [customer.id, customer.full_name]))
      const mapped = ((ordersResult.data ?? []) as Order[]).map((order) => ({
        ...order,
        customer_name: customerNames.get(order.customer_id) ?? '—',
      }))
      setOrders(mapped)
    } catch (cause) {
      const detail = cause instanceof Error ? cause.message : 'تعذر تحميل الطلبات.'
      setTransitionError(detail)
      setOrders([])
    } finally {
      setLoading(false)
    }
  }

  const filtered = filterStatus ? orders.filter(o => o.status === filterStatus) : orders

  const handleStatusChange = async (orderId: string, status: string) => {
    const current = orders.find((order) => order.id === orderId)
    if (!current || !isWorkflowStatus(current.status) || !NEXT_STATUSES[current.status].includes(status as WorkflowOrderStatus)) return
    if (status === current.status) return

    setTransitionError(null)
    setSavingOrderId(orderId)
    try {
      const { data, error } = await supabase
        .from('orders')
        .update({ status, updated_at: new Date().toISOString() })
        .eq('id', orderId)
        .select('id, status')
        .maybeSingle()

      if (error) {
        setTransitionError('تعذر تغيير حالة الطلب ' + current.order_code + ': ' + error.message)
        return
      }
      if (!data || data.id !== orderId) {
        const reason = !data
          ? 'لم يُرجع الخادم سجلًا محدّثًا.'
          : 'أعاد الخادم صفًا لا يطابق الطلب المطلوب.'
        setTransitionError('لم تتغير حالة الطلب ' + current.order_code + '؛ ' + reason + ' أعد تحميل القائمة وتحقق من صلاحياتك.')
        return
      }

      setOrders((previous) => previous.map((order) =>
        order.id === orderId ? { ...order, status: data.status } : order,
      ))
    } catch (error) {
      const detail = error instanceof Error ? error.message : 'خطأ غير معروف'
      setTransitionError('تعذر تغيير حالة الطلب ' + current.order_code + ': ' + detail)
    } finally {
      setSavingOrderId(null)
    }
  }

  const viewDetails = async (orderId: string) => {
    if (selectedOrder === orderId) { setSelectedOrder(null); return }
    setSelectedOrder(orderId)
    const { data } = await supabase.from('order_items').select('*').eq('order_id', orderId)
    if (data) setOrderItems(data as OrderItem[])
  }

  return (
    <main className="animate-fadeIn">
      <h1 style={{ fontSize: "22px", marginBottom: "20px" }}>الطلبات</h1>
      <AdminOrderStatusFilters selected={filterStatus} onSelect={setFilterStatus} />
      {transitionError && <div role="alert" className="card" style={{ padding: "12px", marginBottom: "16px", color: "var(--color-danger, #b42318)" }}>{transitionError}</div>}
      <AdminOrdersList
        loading={loading}
        orders={orders}
        filtered={filtered}
        selectedOrder={selectedOrder}
        orderItems={orderItems}
        savingOrderId={savingOrderId}
        onViewDetails={(orderId) => void viewDetails(orderId)}
        onStatusChange={(orderId, status) => void handleStatusChange(orderId, status)}
      />
    </main>
  )
}
