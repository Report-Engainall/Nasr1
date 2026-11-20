import { useEffect, useMemo, useRef, useState } from 'react';
import { adjustInventoryBalance, fetchInventoryAdjustmentBalances } from '@/lib/api';
import type { InventoryAdjustmentBalance } from '@/lib/api';
import { parseLocalizedQuantityInput } from '@/lib/localized-number-input';

const formatQuantity = (value: number) =>
  new Intl.NumberFormat('ar-YE', { maximumFractionDigits: 3 }).format(value);

function normalizeSearch(value: string): string {
  return value.normalize('NFKD')
    .replace(/[\u064B-\u065F\u0670\u0640]/g, '')
    .toLocaleLowerCase('ar-YE')
    .trim();
}

function filterInventoryItems(items: InventoryAdjustmentBalance[], search: string): InventoryAdjustmentBalance[] {
  const query = normalizeSearch(search);
  if (!query) return items;
  return items.filter((item) =>
    [item.item_code, item.product_name, item.unit ?? '']
      .some((value) => normalizeSearch(value).includes(query)),
  );
}

export function InventoryBalanceAdjustmentPanel({ warehouseId, warehouseName }: {
  warehouseId: string;
  warehouseName: string;
}) {
  const [items, setItems] = useState<InventoryAdjustmentBalance[]>([]);
  const [selectedProductId, setSelectedProductId] = useState('');
  const [search, setSearch] = useState('');
  const [newQuantity, setNewQuantity] = useState('');
  const [reason, setReason] = useState('');
  const [reference, setReference] = useState('');
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const pendingKey = useRef<{ signature: string; key: string } | null>(null);
  const reloadSequence = useRef(0);
  const activeWarehouseId = useRef(warehouseId);
  activeWarehouseId.current = warehouseId;
  const mounted = useRef(false);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  async function reload() {
    const requestId = ++reloadSequence.current;
    if (!warehouseId) {
      if (requestId !== reloadSequence.current) return;
      setItems([]);
      setSelectedProductId('');
      setLoading(false);
      return;
    }
    setLoading(true);
    setError('');
    try {
      const loaded = await fetchInventoryAdjustmentBalances(warehouseId);
      // A warehouse switch or a newer manual refresh supersedes this response.
      if (requestId !== reloadSequence.current) return;
      setItems(loaded);
      setSelectedProductId((current) =>
        current && loaded.some((item) => item.product_id === current)
          ? current
          : loaded[0]?.product_id ?? '',
      );
      setNewQuantity((current) => current.trim() !== '' ? current : String(loaded[0]?.quantity_on_hand ?? ''));
    } catch (cause) {
      if (requestId !== reloadSequence.current) return;
      setError(cause instanceof Error ? cause.message : 'تعذر تحميل أرصدة التسوية.');
    } finally {
      if (requestId === reloadSequence.current) setLoading(false);
    }
  }

  useEffect(() => {
    setItems([]);
    setSelectedProductId('');
    setSearch('');
    setNewQuantity('');
    setReason('');
    setReference('');
    setNotes('');
    setNotice('');
    pendingKey.current = null;
    void reload();
    return () => {
      // Invalidate an in-flight projection when the warehouse changes or the panel unmounts.
      reloadSequence.current += 1;
    };
    // Warehouse changes are the only external input that reloads this projection.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [warehouseId]);

  const selected = items.find((item) => item.product_id === selectedProductId) ?? null;
  const filteredItems = useMemo(() => filterInventoryItems(items, search), [items, search]);

  const parsedNewQuantity = parseLocalizedQuantityInput(newQuantity);
  const validNewQuantity = parsedNewQuantity !== null;
  const delta = selected && parsedNewQuantity !== null ? parsedNewQuantity - selected.quantity_on_hand : null;
  const belowReserved = Boolean(selected && parsedNewQuantity !== null && parsedNewQuantity < selected.quantity_reserved);

  function selectProduct(productId: string) {
    setSelectedProductId(productId);
    const item = items.find((entry) => entry.product_id === productId);
    setNewQuantity(item ? String(item.quantity_on_hand) : '');
    setError('');
    setNotice('');
    pendingKey.current = null;
  }

  async function submit() {
    if (!selected || !validNewQuantity || parsedNewQuantity === null || busy) return;
    if (!reason.trim()) {
      setError('سبب التسوية مطلوب قبل الحفظ.');
      return;
    }
    if (belowReserved) {
      setError('لا يمكن أن يصبح الرصيد الجديد أقل من الكمية المحجوزة.');
      return;
    }
    if (delta === 0) {
      setError('الرصيد الجديد مطابق للحالي؛ لا توجد تسوية لتنفيذها.');
      return;
    }
    const submittedWarehouseId = warehouseId;
    const payload = {
      productId: selected.product_id,
      warehouseId: submittedWarehouseId,
      expectedQuantity: selected.quantity_on_hand,
      newQuantity: parsedNewQuantity,
      reason: reason.trim(),
      reference: reference.trim(),
      notes: notes.trim(),
    };
    const signature = JSON.stringify(payload);
    if (!pendingKey.current || pendingKey.current.signature !== signature) {
      pendingKey.current = {
        signature,
        key: 'inventory-adjustment-' + crypto.randomUUID().replace(/-/g, ''),
      };
    }
    const key = pendingKey.current.key;
    const confirmed = window.confirm(
      'تأكيد تسوية الصنف ' + selected.product_name + ' في ' + warehouseName +
      '؟\nالرصيد السابق: ' + formatQuantity(selected.quantity_on_hand) +
      '\nالرصيد الجديد: ' + formatQuantity(parsedNewQuantity) +
      '\nالفرق: ' + (delta! > 0 ? '+' : '') + formatQuantity(delta!) +
      '\nالمحجوز: ' + formatQuantity(selected.quantity_reserved) +
      '\nسيُحفظ السبب والحركة وسجل التدقيق باسم المستخدم الحالي.',
    );
    if (!confirmed) return;

    setBusy(true);
    setError('');
    setNotice('');
    try {
      const result = await adjustInventoryBalance({ ...payload, idempotencyKey: key });
      // A completed adjustment for a no-longer-visible warehouse must not replace the new view.
      if (!mounted.current || activeWarehouseId.current !== submittedWarehouseId) return;
      setNotice(
        (result.idempotent_replay ? 'تم استرجاع نتيجة التسوية السابقة دون تكرارها. ' : 'تم تنفيذ التسوية وحفظ حركتها وتدقيقها. ') +
        'الرصيد: ' + formatQuantity(result.previous_quantity_on_hand) + ' ← ' +
        formatQuantity(result.new_quantity_on_hand) + ' (' +
        (result.quantity_delta > 0 ? '+' : '') + formatQuantity(result.quantity_delta) + ').',
      );
      pendingKey.current = null;
      setNewQuantity(String(result.new_quantity_on_hand));
      await reload();
    } catch (cause) {
      if (mounted.current && activeWarehouseId.current === submittedWarehouseId) {
        setError(cause instanceof Error ? cause.message : 'تعذر تنفيذ تسوية الرصيد.');
      }
    } finally {
      if (mounted.current) setBusy(false);
    }
  }

  return (
    <section className="panel" aria-label="تسوية رصيد صنف مستقل">
      <div className="panel-head" style={{ alignItems: 'start', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <h2>تسوية رصيد صنف</h2>
          <p className="text-muted">تعديل مستقل لصنف واحد في المستودع المحدد، دون فتح جلسة جرد. ينفذ الخادم الحركة والتدقيق معاً.</p>
        </div>
        <button type="button" className="btn outline" onClick={() => void reload()} disabled={loading || busy}>
          تحديث أرصدة التسوية
        </button>
      </div>
      {error && <div className="form-error" role="alert">{error}</div>}
      {notice && <div className="data-status success" role="status">{notice}</div>}
      <p className="text-muted">المستودع: <strong>{warehouseName}</strong></p>
      {loading ? <p role="status">جار تحميل الأرصدة المسموح بتسويتها…</p> : !items.length ? (
        <p className="text-muted">لا توجد أرصدة أصناف نشطة لهذا المستودع. لا تُنشأ أرصدة صفرية تلقائياً.</p>
      ) : (
        <>
          <div className="form-grid">
            <label>
              البحث عن الصنف
              <input
                aria-label="البحث عن صنف للتسوية"
                value={search}
                onChange={(event) => {
                  const value = event.target.value;
                  const matches = filterInventoryItems(items, value);
                  setSearch(value);
                  if (!matches.some((item) => item.product_id === selectedProductId)) {
                    const next = matches[0] ?? null;
                    setSelectedProductId(next?.product_id ?? '');
                    setNewQuantity(next ? String(next.quantity_on_hand) : '');
                    setError('');
                    setNotice('');
                    pendingKey.current = null;
                  }
                }}
                placeholder="رمز الصنف أو الاسم أو الوحدة"
                disabled={busy}
              />
            </label>
            <label>
              الصنف
              <select aria-label="الصنف المراد تسويته" value={selectedProductId} onChange={(event) => selectProduct(event.target.value)} disabled={busy}>
                {filteredItems.map((item) => (
                  <option key={item.product_id} value={item.product_id}>
                    {item.item_code} — {item.product_name}
                  </option>
                ))}
              </select>
            </label>
          </div>
          {!filteredItems.length && <p className="text-muted">لا توجد أصناف تطابق عبارة البحث.</p>}
          {selected && filteredItems.some((item) => item.product_id === selected.product_id) && (
            <>
              <div className="report-grid" aria-label="أرصدة الصنف الحالية">
                <article className="report-metric"><span>الرصيد الحالي</span><strong>{formatQuantity(selected.quantity_on_hand)}</strong></article>
                <article className="report-metric"><span>المحجوز</span><strong>{formatQuantity(selected.quantity_reserved)}</strong></article>
                <article className="report-metric"><span>المتاح</span><strong>{formatQuantity(selected.quantity_available)}</strong></article>
                <article className="report-metric"><span>الوحدة</span><strong>{selected.unit ?? '—'}</strong></article>
              </div>
              <div className="form-grid" style={{ marginTop: 12 }}>
                <label>
                  الرصيد الجديد
                  <input type="text" inputMode="decimal" dir="ltr" autoComplete="off"
                    aria-label={'الرصيد الجديد للصنف ' + selected.product_name}
                    aria-describedby="inventory-adjustment-quantity-hint"
                    value={newQuantity}
                    onChange={(event) => { setNewQuantity(event.target.value); setNotice(''); }}
                    disabled={busy} />
                  <span id="inventory-adjustment-quantity-hint" className="text-muted">
                    اكتب بالأرقام العربية أو الإنجليزية، ويمكن استخدام الفاصلة العشرية ٫ أو النقطة، حتى ثلاث منازل.
                  </span>
                </label>
                <label>
                  سبب التسوية
                  <input aria-label="سبب التسوية" value={reason} onChange={(event) => setReason(event.target.value)} maxLength={1000} placeholder="سبب الزيادة أو النقص" disabled={busy} />
                </label>
                <label>
                  المرجع
                  <input aria-label="مرجع التسوية" value={reference} onChange={(event) => setReference(event.target.value)} maxLength={200} placeholder="رقم محضر أو مستند (اختياري)" disabled={busy} />
                </label>
                <label>
                  ملاحظات
                  <input aria-label="ملاحظات التسوية" value={notes} onChange={(event) => setNotes(event.target.value)} maxLength={1000} placeholder="تفاصيل إضافية (اختياري)" disabled={busy} />
                </label>
              </div>
              <div className="privacy-note" style={{ marginTop: 12 }} aria-live="polite">
                <strong>معاينة قبل التأكيد</strong>
                <p>
                  السابق: {formatQuantity(selected.quantity_on_hand)} · الجديد: {validNewQuantity ? formatQuantity(parsedNewQuantity!) : '—'} ·
                  الفرق: {delta === null ? '—' : (delta > 0 ? '+' : '') + formatQuantity(delta)} ·
                  الحالة: {belowReserved ? 'أقل من المحجوز — مرفوض' : delta === null ? 'أدخل رصيداً صالحاً' : delta > 0 ? 'زيادة' : delta < 0 ? 'نقص' : 'لا تغيير'}
                </p>
              </div>
              {belowReserved && <p className="form-error" role="alert">الرصيد الجديد أقل من المحجوز؛ خفّض الحجوزات عبر مسارها المعتمد أولاً.</p>}
              <div className="toolbar-actions" style={{ marginTop: 12 }}>
                <button type="button" className="btn primary" onClick={() => void submit()}
                  disabled={busy || loading || !validNewQuantity || !reason.trim() || belowReserved || delta === 0}>
                  {busy ? 'جار تنفيذ التسوية…' : delta !== null && delta > 0 ? 'اعتماد زيادة الرصيد' : 'اعتماد نقص الرصيد'}
                </button>
              </div>
              <p className="text-muted">يرفض الخادم الرصيد القديم إذا تغيّر منذ تحميله، ويمنع تكرار الطلب عند إعادة المحاولة. لا يمكن تحرير الحركات أو محو سجل التسوية.</p>
            </>
          )}
        </>
      )}
    </section>
  );
}
