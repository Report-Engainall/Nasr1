import { useState, useEffect } from 'react'
import { useParams, Link } from 'react-router-dom'
import { ArrowRight } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useSettings } from '../../lib/useSettings'
import type { Order, OrderItem } from '../../lib/types'
import { ORDER_STATUS_LABELS } from '../../lib/types'
import { formatPrice } from '../../lib/pricing'

const STATUS_STEPS = ['new', 'received', 'reviewing', 'approved', 'preparing', 'prepared', 'dispatched', 'delivered']


function OrderStatusBadge({ order }: { order: Order }) {
  const isSuccess = order.status === 'delivered' || order.status === 'invoiced';
  const isError = order.status === 'cancelled' || order.status === 'rejected';
  const tone = isSuccess ? 'badge-success' : isError ? 'badge-error' : order.status === 'returned' ? 'badge-warning' : 'badge-info';
  return <span className={'badge ' + tone} style={{ fontSize: '14px', padding: '6px 16px' }}>{ORDER_STATUS_LABELS[order.status] || order.status}</span>;
}

function OrderDetailHeader({ order }: { order: Order }) {
  return (
    <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px' }}>
      <div>
        <h1 style={{ fontSize: '22px' }}>{order.order_code}</h1>
        <p className="text-muted" style={{ fontSize: '14px' }}>{new Date(order.created_at).toLocaleDateString('ar', { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</p>
      </div>
      <OrderStatusBadge order={order} />
    </header>
  );
}

function OrderTimelineStep({ step, index, currentStep, isReturned }: {
  step: string; index: number; currentStep: number; isReturned: boolean;
}) {
  const isDone = index <= currentStep && !isReturned;
  const isCurrent = index === currentStep && !isReturned;
  const circleTone = isDone ? 'var(--color-primary)' : isCurrent ? 'var(--color-accent)' : 'var(--color-bg-alt)';
  const textTone = isDone ? 'var(--color-primary)' : 'var(--color-text-muted)';
  return (
    <div style={{ display: 'flex', alignItems: 'center', flexShrink: 0 }}>
      <div style={{ width: '28px', height: '28px', borderRadius: '50%', background: circleTone, color: isDone || isCurrent ? '#fff' : 'var(--color-text-muted)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px', fontWeight: 700, flexShrink: 0 }}>{index + 1}</div>
      <span style={{ fontSize: '11px', margin: '0 8px', color: textTone, fontWeight: isCurrent ? 700 : 400, whiteSpace: 'nowrap' }}>{ORDER_STATUS_LABELS[step as keyof typeof ORDER_STATUS_LABELS] || step}</span>
      {index < STATUS_STEPS.length - 1 && <span aria-hidden="true" style={{ width: '24px', height: '2px', background: isDone ? 'var(--color-primary)' : 'var(--color-border)' }} />}
    </div>
  );
}

function OrderStatusTimeline({ currentStep, isReturned }: { currentStep: number; isReturned: boolean }) {
  return (
    <section className="card mb-6" aria-label="مراحل الطلب" style={{ padding: '20px' }}>
      {isReturned && <p className="badge badge-warning mb-4" style={{ padding: '10px' }}>تم إرجاع الطلب للتعديل. يرجى مراجعة ملاحظات الإدارة.</p>}
      <div style={{ display: 'flex', gap: '4px', overflowX: 'auto', paddingBottom: '8px' }}>
        {STATUS_STEPS.map((step, index) => <OrderTimelineStep key={step} step={step} index={index} currentStep={currentStep} isReturned={isReturned} />)}
      </div>
    </section>
  );
}

function OrderAdminNotes({ notes }: { notes: string }) {
  return (
    <section className="card mb-4" style={{ padding: '16px', background: 'var(--color-warning-bg)', borderColor: 'var(--color-warning)' }}>
      <h3 style={{ fontSize: '14px', marginBottom: '8px' }}>ملاحظات الإدارة:</h3>
      <p style={{ fontSize: '14px' }}>{notes}</p>
    </section>
  );
}

function OrderItemRow({ item, showPrices, currency }: { item: OrderItem; showPrices: boolean; currency: string }) {
  return (
    <tr style={{ borderBottom: '1px solid var(--color-border)' }}>
      <td style={{ padding: '12px 10px', fontSize: '14px', fontWeight: 600 }}>{item.product_name}</td>
      <td className="text-muted" style={{ padding: '12px 10px', fontSize: '13px', textAlign: 'center' }}>{item.product_code}</td>
      <td style={{ padding: '12px 10px', fontSize: '13px', textAlign: 'center' }}>{item.unit}</td>
      <td style={{ padding: '12px 10px', fontSize: '14px', textAlign: 'center', fontWeight: 600 }}>{item.quantity}</td>
      {showPrices && <td style={{ padding: '12px 10px', fontSize: '14px', textAlign: 'center' }}>{formatPrice(item.unit_price, currency)}</td>}
      {showPrices && <td style={{ padding: '12px 10px', fontSize: '14px', textAlign: 'center', fontWeight: 700 }}>{formatPrice(item.line_total, currency)}</td>}
    </tr>
  );
}

function OrderItemsTable({ order, items, showPrices, currency }: {
  order: Order; items: OrderItem[]; showPrices: boolean; currency: string;
}) {
  return (
    <section className="card" style={{ padding: '20px' }}>
      <h2 style={{ fontSize: '16px', marginBottom: '16px' }}>أصناف الطلب</h2>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead><tr style={{ borderBottom: '2px solid var(--color-border)' }}>
            <th style={{ textAlign: 'right', padding: '10px', fontSize: '13px', color: 'var(--color-text-muted)' }}>الصنف</th>
            <th style={{ textAlign: 'center', padding: '10px', fontSize: '13px', color: 'var(--color-text-muted)' }}>الكود</th>
            <th style={{ textAlign: 'center', padding: '10px', fontSize: '13px', color: 'var(--color-text-muted)' }}>الوحدة</th>
            <th style={{ textAlign: 'center', padding: '10px', fontSize: '13px', color: 'var(--color-text-muted)' }}>الكمية</th>
            {showPrices && <th style={{ textAlign: 'center', padding: '10px', fontSize: '13px', color: 'var(--color-text-muted)' }}>السعر</th>}
            {showPrices && <th style={{ textAlign: 'center', padding: '10px', fontSize: '13px', color: 'var(--color-text-muted)' }}>الإجمالي</th>}
          </tr></thead>
          <tbody>{items.map((item) => <OrderItemRow key={item.id} item={item} showPrices={showPrices} currency={currency} />)}</tbody>
        </table>
      </div>
      {showPrices && <OrderTotal total={order.total_amount} currency={currency} />}
    </section>
  );
}

function OrderTotal({ total, currency }: { total: number; currency: string }) {
  return <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '16px', paddingTop: '16px', borderTop: '2px solid var(--color-border)' }}><span style={{ fontWeight: 600, fontSize: '16px' }}>الإجمالي</span><span style={{ fontWeight: 700, fontSize: '20px', color: 'var(--color-primary)' }}>{formatPrice(total, currency)}</span></div>;
}

function OrderCustomerNotes({ notes }: { notes: string }) {
  return <section className="card mt-4" style={{ padding: '16px' }}><h3 style={{ fontSize: '14px', marginBottom: '8px' }} className="text-muted">ملاحظاتك:</h3><p style={{ fontSize: '14px' }}>{notes}</p></section>;
}

export default function OrderDetailPage() {
  const { id } = useParams()
  const { settings } = useSettings()
  const [order, setOrder] = useState<Order | null>(null)
  const [items, setItems] = useState<OrderItem[]>([])
  const [loading, setLoading] = useState(true)
  const showPrices = settings['show_price_in_orders'] !== 'false'
  const currency = settings['currency_symbol'] || 'ر.ي'

  useEffect(() => {
    Promise.all([
      supabase.from('orders').select('*').eq('id', id).maybeSingle(),
      supabase.from('order_items').select('*').eq('order_id', id),
    ]).then(([orderRes, itemsRes]) => {
      if (orderRes.data) setOrder(orderRes.data as Order)
      if (itemsRes.data) setItems(itemsRes.data as OrderItem[])
      setLoading(false)
    })
  }, [id])

  if (loading) return <div className="text-center mt-20 text-muted">جارٍ التحميل...</div>
  if (!order) return <div className="text-center mt-20">الطلب غير موجود</div>
  const currentStep = STATUS_STEPS.indexOf(order.status)
  const isReturned = order.status === 'returned'
  const isCancelled = order.status === 'cancelled' || order.status === 'rejected'

  return (
    <main className="animate-fadeIn" style={{ padding: '24px 0' }}>
      <Link to="/orders" className="text-muted" style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', marginBottom: '16px', fontSize: '14px' }}><ArrowRight size={16} /> العودة للطلبات</Link>
      <OrderDetailHeader order={order} />
      {!isCancelled && <OrderStatusTimeline currentStep={currentStep} isReturned={isReturned} />}
      {isReturned && order.admin_notes && <OrderAdminNotes notes={order.admin_notes} />}
      <OrderItemsTable order={order} items={items} showPrices={showPrices} currency={currency} />
      {order.notes && <OrderCustomerNotes notes={order.notes} />}
    </main>
  )
}