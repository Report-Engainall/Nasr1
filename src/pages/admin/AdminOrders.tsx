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

export default function AdminOrders() {
  const [orders, setOrders] = useState<(Order & { customer_name?: string })[]>([])
  const [loading, setLoading] = useState(true)
  const [filterStatus, setFilterStatus] = useState('')
  const [selectedOrder, setSelectedOrder] = useState<string | null>(null)
  const [orderItems, setOrderItems] = useState<OrderItem[]>([])
  const [savingOrderId, setSavingOrderId] = useState<string | null>(null)
  const [transitionError, setTransitionError] = useState<string | null>(null)

  useEffect(() => { loadOrders() }, [])

  const loadOrders = () => {
    setLoading(true)
    supabase.from('orders').select('*').order('created_at', { ascending: false }).then(({ data }) => {
      if (data) {
        const ordersData = data as Order[]
        supabase.from('customers').select('id, full_name').then(({ data: custData }) => {
          const custMap: Record<string, string> = {}
          ;((custData || []) as CustomerSummary[]).forEach((customer) => { custMap[customer.id] = customer.full_name })
          setOrders(ordersData.map(o => ({ ...o, customer_name: custMap[o.customer_id] || '—' })))
          setLoading(false)
        })
      } else { setLoading(false) }
    })
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
      if (!data) {
        setTransitionError('لم تتغير حالة الطلب ' + current.order_code + '؛ لم يُرجع الخادم سجلًا محدّثًا. أعد تحميل القائمة وتحقق من صلاحياتك.')
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
    <div className="animate-fadeIn">
      <h1 style={{ fontSize: '22px', marginBottom: '20px' }}>الطلبات</h1>
      <div style={{ display: 'flex', gap: '8px', marginBottom: '16px', flexWrap: 'wrap' }}>
        <button className={`btn btn-sm ${!filterStatus ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setFilterStatus('')}>الكل</button>
        {STATUS_OPTIONS.map(s => (
          <button key={s} className={`btn btn-sm ${filterStatus === s ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setFilterStatus(s)}>{STATUS_LABELS[s]}</button>
        ))}
      </div>
      {transitionError && <div role="alert" className="card" style={{ padding: '12px', marginBottom: '16px', color: 'var(--color-danger, #b42318)' }}>{transitionError}</div>}
      {loading ? <div className="text-muted text-center">جارٍ التحميل...</div> : orders.length === 0 ? (
        <div className="card text-center" style={{ padding: '40px' }}><p className="text-muted">لا توجد طلبات</p></div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {filtered.map((order) => (
            <div key={order.id} className="card" style={{ padding: '16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
                <div>
                  <div style={{ fontWeight: 700, fontSize: '15px' }}>{order.order_code}</div>
                  <div className="text-muted" style={{ fontSize: '13px' }}>{order.customer_name} — {new Date(order.created_at).toLocaleDateString('ar', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <span className="text-muted" style={{ fontSize: '14px' }}>{order.total_items} صنف</span>
                  <span className="font-bold" style={{ color: 'var(--color-primary)' }}>{formatPrice(order.total_amount)}</span>
                  {isWorkflowStatus(order.status) ? (
                    <select
                      aria-label={'حالة الطلب ' + order.order_code}
                      className="input"
                      style={{ width: 'auto', padding: '6px 10px', fontSize: '13px' }}
                      value={order.status}
                      disabled={savingOrderId === order.id || NEXT_STATUSES[order.status].length === 0}
                      onChange={(e) => handleStatusChange(order.id, e.target.value)}
                    >
                      <option value={order.status}>{STATUS_LABELS[order.status]}</option>
                      {NEXT_STATUSES[order.status].map((status) => (
                        <option key={status} value={status}>{STATUS_LABELS[status]}</option>
                      ))}
                    </select>
                  ) : (
                    <span className="text-muted" aria-label={'حالة قديمة للطلب ' + order.order_code}>
                      حالة قديمة: {getStatusLabel(order.status)}
                    </span>
                  )}
                  <button className="btn btn-secondary btn-sm" onClick={() => viewDetails(order.id)}>تفاصيل</button>
                </div>
              </div>
              {selectedOrder === order.id && orderItems.length > 0 && (
                <div style={{ marginTop: '16px', borderTop: '1px solid var(--color-border)', paddingTop: '12px' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead><tr style={{ borderBottom: '1px solid var(--color-border)' }}>
                      <th style={{ textAlign: 'right', padding: '8px', fontSize: '12px', color: 'var(--color-text-muted)' }}>الصنف</th>
                      <th style={{ textAlign: 'center', padding: '8px', fontSize: '12px', color: 'var(--color-text-muted)' }}>الكمية</th>
                      <th style={{ textAlign: 'center', padding: '8px', fontSize: '12px', color: 'var(--color-text-muted)' }}>السعر</th>
                      <th style={{ textAlign: 'center', padding: '8px', fontSize: '12px', color: 'var(--color-text-muted)' }}>الإجمالي</th>
                    </tr></thead>
                    <tbody>
                      {orderItems.map((item) => (
                        <tr key={item.id} style={{ borderBottom: '1px solid var(--color-border)' }}>
                          <td style={{ padding: '8px', fontSize: '13px', fontWeight: 600 }}>{item.product_name}</td>
                          <td style={{ padding: '8px', fontSize: '13px', textAlign: 'center' }}>{item.quantity}</td>
                          <td style={{ padding: '8px', fontSize: '13px', textAlign: 'center' }}>{formatPrice(item.unit_price)}</td>
                          <td style={{ padding: '8px', fontSize: '13px', textAlign: 'center', fontWeight: 700 }}>{formatPrice(item.line_total)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
