import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Plus, ShoppingCart, Trash2 } from 'lucide-react';
import { createOrder, fetchAdminProductOptions } from '@/lib/api';
import type { AdminProductOption } from '@/lib/api';
import { fetchStaffOrderCustomerOptions } from '@/lib/customer-directory';
import { useFetch } from '@/lib/useFetch';
import { Button, ErrorBox, Field, Modal } from '@/components/AdminPages';

type DraftOrderLine = {
  product: AdminProductOption;
  quantity: string;
};

type AdminOrderCreationDialogProps = {
  onClose: () => void;
  onCreated: () => Promise<void> | void;
  onNotice: (message: string) => void;
};

const CUSTOMER_TIER_LABELS: Record<string, string> = {
  vip: 'جملة الجملة',
  wholesale: 'الجملة',
  retail: 'التجزئة',
};

export function AdminOrderCreationDialog({
  onClose,
  onCreated,
  onNotice,
}: AdminOrderCreationDialogProps) {
  const [customerSearch, setCustomerSearch] = useState('');
  const [appliedCustomerSearch, setAppliedCustomerSearch] = useState('');
  const [productSearch, setProductSearch] = useState('');
  const [appliedProductSearch, setAppliedProductSearch] = useState('');
  const [customerId, setCustomerId] = useState('');
  const [productId, setProductId] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [lines, setLines] = useState<DraftOrderLine[]>([]);
  const [notes, setNotes] = useState('');
  const [paymentTerms, setPaymentTerms] = useState<'cash_on_delivery' | 'credit'>('cash_on_delivery');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const idempotencyKey = useRef<string | null>(null);

  const {
    data: customers,
    loading: customersLoading,
    error: customersError,
  } = useFetch(
    () => fetchStaffOrderCustomerOptions({ search: appliedCustomerSearch, pageSize: 25 }),
    [appliedCustomerSearch],
  );
  const {
    data: products,
    loading: productsLoading,
    error: productsError,
  } = useFetch(
    () => fetchAdminProductOptions({ page: 1, pageSize: 40, search: appliedProductSearch, activeOnly: true }),
    [appliedProductSearch],
  );

  useEffect(() => {
    const timer = window.setTimeout(() => setAppliedCustomerSearch(customerSearch.trim()), 180);
    return () => window.clearTimeout(timer);
  }, [customerSearch]);

  useEffect(() => {
    const timer = window.setTimeout(() => setAppliedProductSearch(productSearch.trim()), 180);
    return () => window.clearTimeout(timer);
  }, [productSearch]);

  const customerRows = customers?.rows ?? [];
  const productRows = products?.rows ?? [];
  const selectedCustomer = customerRows.find((customer) => customer.id === customerId) ?? null;
  const selectedProduct = productRows.find((product) => product.id === productId) ?? null;

  function startNewIntent() {
    idempotencyKey.current = null;
  }

  function addLine() {
    const nextQuantity = Number(quantity);
    if (!selectedProduct) {
      setError('اختر صنفًا نشطًا من نتائج البحث أولًا.');
      return;
    }
    if (!Number.isFinite(nextQuantity) || nextQuantity <= 0 || nextQuantity > 10000 || !Number.isInteger(nextQuantity)) {
      setError('الكمية يجب أن تكون عدداً صحيحاً بين 1 و10000.');
      return;
    }
    if (!lines.some((line) => line.product.id === selectedProduct.id) && lines.length >= 100) {
      setError('الطلب الواحد يقبل 100 صنف مختلف كحد أقصى.');
      return;
    }

    setLines((current) => {
      const existing = current.find((line) => line.product.id === selectedProduct.id);
      if (!existing) return [...current, { product: selectedProduct, quantity: String(nextQuantity) }];
      return current.map((line) => line.product.id === selectedProduct.id
        ? { ...line, quantity: String(Number(line.quantity) + nextQuantity) }
        : line);
    });
    startNewIntent();
    setQuantity('1');
    setError('');
  }

  function updateLineQuantity(productIdToUpdate: string, value: string) {
    setLines((current) => current.map((line) => line.product.id === productIdToUpdate
      ? { ...line, quantity: value }
      : line));
    startNewIntent();
  }

  function removeLine(productIdToRemove: string) {
    setLines((current) => current.filter((line) => line.product.id !== productIdToRemove));
    startNewIntent();
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;
    const validatedLines = lines.map((line) => ({
      product_id: line.product.id,
      quantity: Number(line.quantity),
    }));
    if (!customerId || !selectedCustomer) {
      setError('اختر عميلًا معتمدًا من دليل العملاء.');
      return;
    }
    if (!validatedLines.length || validatedLines.some((line) =>
      !Number.isInteger(line.quantity) || line.quantity < 1 || line.quantity > 10000)) {
      setError('أضف صنفًا واحدًا على الأقل وتحقق من كميات جميع الأصناف.');
      return;
    }
    if (notes.trim().length > 1000) {
      setError('ملاحظات الطلب لا تتجاوز 1000 حرف.');
      return;
    }

    setSaving(true);
    setError('');
    try {
      // The key survives ambiguous network failures; edits to the draft reset it.
      const key = idempotencyKey.current ?? window.crypto.randomUUID().replace(/-/g, '');
      idempotencyKey.current = key;
      await createOrder({
        customer_id: customerId,
        items: validatedLines,
        notes: notes.trim(),
        idempotency_key: key,
        payment_terms: paymentTerms,
      });
      await onCreated();
      onNotice('تم إنشاء الطلب وإرساله إلى دورة مراجعة الطلبات. الأسعار تُحسب وتُثبت من الخادم.');
      onClose();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'تعذر إنشاء الطلب. أعد المحاولة دون تغيير المسودة لتجنب تكرار الطلب.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title="إنشاء طلب يدوي" onClose={() => { if (!saving) onClose(); }}>
      <form onSubmit={submit} className="form-grid" style={{ gap: 14 }}>
        <section className="panel" style={{ padding: 12, gridColumn: '1 / -1' }}>
          <strong>1. العميل المعتمد</strong>
          <p className="text-muted" style={{ margin: '5px 0 10px', fontSize: 12 }}>
            تظهر الحسابات المعتمدة فقط. شريحة العميل تُقرأ من سجل المؤسسة ويعتمدها الخادم عند التسعير.
          </p>
          <Field label="البحث عن العميل">
            <input
              value={customerSearch}
              onChange={(event) => {
                setCustomerSearch(event.target.value);
                setCustomerId('');
                startNewIntent();
              }}
              placeholder="اسم المنشأة أو الهاتف أو رمز العميل..."
              maxLength={254}
              disabled={saving}
            />
          </Field>
          <Field label="اختر العميل">
            <select
              value={customerId}
              onChange={(event) => {
                setCustomerId(event.target.value);
                startNewIntent();
                setError('');
              }}
              required
              disabled={saving || customersLoading || Boolean(customersError)}
            >
              <option value="">{customersLoading ? 'جارٍ تحميل العملاء المعتمدين…' : 'اختر العميل'}</option>
              {customerRows.map((customer) => (
                <option key={customer.id} value={customer.id}>
                  {customer.business_name} · {customer.customer_code ?? 'بلا رمز'} · {CUSTOMER_TIER_LABELS[customer.tier]}
                </option>
              ))}
            </select>
          </Field>
          {customers?.hasNextPage && <small className="text-muted">توجد نتائج أخرى؛ أدخل جزءًا أدق من الاسم أو الهاتف.</small>}
          {customersError && <ErrorBox message={customersError} />}
          {selectedCustomer && (
            <p role="status" style={{ margin: '8px 0 0', fontWeight: 700 }}>
              الشريحة المعتمدة: {CUSTOMER_TIER_LABELS[selectedCustomer.tier]}
            </p>
          )}
        </section>

        <section className="panel" style={{ padding: 12, gridColumn: '1 / -1' }}>
          <strong>2. الأصناف والكميات</strong>
          <p className="text-muted" style={{ margin: '5px 0 10px', fontSize: 12 }}>
            لا تُدخل الأسعار هنا. يحدد محرك التسعير الخادمي السعر الفعلي حسب شريحة العميل والقواعد المعتمدة.
          </p>
          <Field label="البحث عن الصنف">
            <input
              value={productSearch}
              onChange={(event) => {
                setProductSearch(event.target.value);
                setProductId('');
              }}
              placeholder="اسم الصنف أو الرمز..."
              maxLength={100}
              disabled={saving}
            />
          </Field>
          <div className="form-grid" style={{ alignItems: 'end' }}>
            <Field label="الصنف النشط">
              <select
                value={productId}
                onChange={(event) => setProductId(event.target.value)}
                disabled={saving || productsLoading || Boolean(productsError)}
              >
                <option value="">{productsLoading ? 'جارٍ البحث…' : 'اختر الصنف'}</option>
                {productRows.map((product) => (
                  <option key={product.id} value={product.id}>{product.name} · {product.item_code}</option>
                ))}
              </select>
            </Field>
            <Field label="الكمية">
              <input
                type="number"
                min="1"
                max="10000"
                step="1"
                inputMode="decimal"
                value={quantity}
                onChange={(event) => setQuantity(event.target.value)}
                disabled={saving}
              />
            </Field>
            <div><Button type="button" variant="secondary" onClick={addLine} disabled={saving || productsLoading || !selectedProduct}>
              <Plus size={16} /> إضافة الصنف
            </Button></div>
          </div>
          {products?.hasNextPage && <small className="text-muted">توجد أصناف أخرى؛ اكتب اسمًا أو رمزًا أدق لتضييق النتائج.</small>}
          {productsError && <ErrorBox message={productsError} />}
          {lines.length > 0 ? (
            <div className="table-wrap" style={{ marginTop: 12 }}>
              <table>
                <thead><tr><th>الصنف</th><th>الكمية</th><th /></tr></thead>
                <tbody>
                  {lines.map((line) => (
                    <tr key={line.product.id}>
                      <td><strong>{line.product.name}</strong><small>{line.product.item_code}</small></td>
                      <td>
                        <input
                          type="number"
                          min="1"
                          max="10000"
                          step="1"
                          value={line.quantity}
                          onChange={(event) => updateLineQuantity(line.product.id, event.target.value)}
                          aria-label={'كمية ' + line.product.name}
                          disabled={saving}
                          style={{ width: 110 }}
                        />
                      </td>
                      <td><Button type="button" variant="danger" onClick={() => removeLine(line.product.id)} disabled={saving}>
                        <Trash2 size={15} /> حذف
                      </Button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : <p className="text-muted" style={{ margin: '10px 0 0' }}>لم تتم إضافة أصناف إلى الطلب بعد.</p>}
        </section>

        <Field label="طريقة السداد">
          <select value={paymentTerms} onChange={(event) => {
            setPaymentTerms(event.target.value as 'cash_on_delivery' | 'credit');
            startNewIntent();
          }} disabled={saving}>
            <option value="cash_on_delivery">نقدًا عند التسليم</option>
            <option value="credit">آجل — يخضع لتحقق الخادم</option>
          </select>
        </Field>
        <Field label="ملاحظات الطلب">
          <textarea
            value={notes}
            onChange={(event) => {
              setNotes(event.target.value);
              startNewIntent();
            }}
            rows={3}
            maxLength={1000}
            placeholder="ملاحظات التسليم أو تعليمات العميل..."
            disabled={saving}
          />
        </Field>
        <div style={{ gridColumn: '1 / -1', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
          <span className="text-muted">{lines.length} صنفًا مختلفًا — لا يُعرض أي سعر أو تكلفة داخل هذا النموذج.</span>
          <div className="modal-actions">
            <Button type="button" variant="outline" onClick={onClose} disabled={saving}>إلغاء</Button>
            <Button type="submit" disabled={saving || customersLoading || productsLoading || Boolean(customersError) || Boolean(productsError) || !customerId || !lines.length}>
              <ShoppingCart size={16} /> {saving ? 'جارٍ إنشاء الطلب…' : 'إنشاء الطلب'}
            </Button>
          </div>
        </div>
        {error && <div className="form-error" role="alert" style={{ gridColumn: '1 / -1' }}>{error}</div>}
      </form>
    </Modal>
  );
}
