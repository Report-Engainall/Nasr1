import { useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { ChevronRight, Download, Eye, RotateCcw, Save, X } from 'lucide-react';
import { downloadPriceGridCsv } from '@/lib/price-grid-csv';
import { fetchAdminProductPriceGrid, saveProductPriceGrid, type ProductPriceGridChange, type ProductPriceGridRow } from '@/lib/api';
import { useFetch } from '@/lib/useFetch';

type PriceKey = 'base_price' | 'price_wholesale_of_wholesale' | 'price_wholesale' | 'price_retail';
type DraftKey = 'basePrice' | 'wholesaleOfWholesale' | 'wholesale' | 'retail';
type PriceDraft = Partial<Record<DraftKey, string>>;
type PriceValues = Record<PriceKey, number>;
type ReviewRow = { id: string; name: string; itemCode: string; before: PriceValues; after: PriceValues; command: ProductPriceGridChange };
const PRICE_FIELDS: { source: PriceKey; draft: DraftKey; label: string }[] = [
  { source: 'base_price', draft: 'basePrice', label: 'السعر الأساسي' },
  { source: 'price_wholesale_of_wholesale', draft: 'wholesaleOfWholesale', label: 'جملة الجملة' },
  { source: 'price_wholesale', draft: 'wholesale', label: 'الجملة' },
  { source: 'price_retail', draft: 'retail', label: 'التجزئة' },
];
function formatPrice(value: number): string {
  return value.toLocaleString('ar-YE', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

export function PricingGrid({ onNotice }: { onNotice: (message: string) => void }) {
  const { data: products, loading, error, refetch } = useFetch(fetchAdminProductPriceGrid);
  const [drafts, setDrafts] = useState<Record<string, PriceDraft>>({});
  const [preview, setPreview] = useState<ReviewRow[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState('');
  const cells = useRef<Map<string, HTMLInputElement>>(new Map());
  const rows: ProductPriceGridRow[] = products ?? [];

  const changedCount = useMemo(() => rows.filter((row) => PRICE_FIELDS.some((field) => {
    const raw = drafts[row.id]?.[field.draft];
    return raw !== undefined && (raw.trim() === '' || !Number.isFinite(Number(raw)) || Number(raw) !== Number(row[field.source]));
  })).length, [rows, drafts]);

  function rawValue(row: ProductPriceGridRow, field: { source: PriceKey; draft: DraftKey }): string {
    return drafts[row.id]?.[field.draft] ?? String(Number(row[field.source] ?? 0));
  }
  function updateCell(productId: string, field: DraftKey, value: string) {
    setDrafts((old) => ({ ...old, [productId]: { ...old[productId], [field]: value } }));
    setFormError('');
  }
  function onCellKeyDown(event: KeyboardEvent<HTMLInputElement>, productIndex: number, fieldIndex: number) {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    const nextField = fieldIndex + 1;
    const nextProduct = productIndex + (nextField >= PRICE_FIELDS.length ? 1 : 0);
    const nextColumn = nextField % PRICE_FIELDS.length;
    const product = rows[nextProduct];
    if (product) cells.current.get(product.id + ':' + PRICE_FIELDS[nextColumn].draft)?.focus();
  }

  function buildPreview(): ReviewRow[] | null {
    const result: ReviewRow[] = [];
    for (const row of rows) {
      const before = {} as PriceValues;
      const after = {} as PriceValues;
      let rowChanged = false;
      for (const field of PRICE_FIELDS) {
        const oldValue = Number(row[field.source] ?? 0);
        const raw = rawValue(row, field);
        const userEdited = drafts[row.id]?.[field.draft] !== undefined;
        const newValue = Number(raw);
        before[field.source] = oldValue;
        if (userEdited && (raw.trim() === '' || !Number.isFinite(newValue) || newValue < 0 || newValue > 999999999999 || Math.round(newValue * 100) !== newValue * 100)) {
          setFormError('الأسعار يجب أن تكون أرقامًا غير سالبة وبحد أقصى منزلتين عشريتين، من دون ترك خلايا فارغة.');
          return null;
        }
        after[field.source] = newValue;
        if (newValue !== oldValue) rowChanged = true;
      }
      if (!rowChanged) continue;
      result.push({
        id: row.id, name: row.name, itemCode: row.item_code, before, after,
        command: {
          id: row.id,
          expectedBasePrice: before.base_price,
          expectedPriceWholesaleOfWholesale: before.price_wholesale_of_wholesale,
          expectedPriceWholesale: before.price_wholesale,
          expectedPriceRetail: before.price_retail,
          basePrice: after.base_price,
          priceWholesaleOfWholesale: after.price_wholesale_of_wholesale,
          priceWholesale: after.price_wholesale,
          priceRetail: after.price_retail,
        },
      });
    }
    if (!result.length) { setFormError('لا توجد تغييرات سعرية جديدة لمعاينتها.'); return null; }
    if (result.length > 200) { setFormError('الدفعة الواحدة محدودة بـ 200 صنف. قلّص التغييرات ثم عاينها واحفظها.'); return null; }
    setFormError('');
    return result;
  }

  async function commitPreview() {
    if (!preview || !preview.length || busy) return;
    setBusy(true); setFormError('');
    try {
      const count = await saveProductPriceGrid(preview.map((item) => item.command));
      setPreview(null); setDrafts({});
      try {
        await refetch();
        onNotice('تم اعتماد وحفظ أسعار ' + count + ' صنفًا في معاملة واحدة، وسُجلت التغييرات في سجل التدقيق.');
      } catch {
        onNotice('تم حفظ الأسعار ذريًا، لكن تعذر تحديث القائمة تلقائيًا. حدّث الشاشة قبل أي تعديل جديد.');
      }
    } catch (cause) {
      setFormError(cause instanceof Error ? cause.message : 'تعذر حفظ شبكة الأسعار. لم يتم اعتماد التغييرات.');
    } finally { setBusy(false); }
  }
  const editable = preview === null && !busy;

  return <section className="panel price-grid-panel" aria-labelledby="price-grid-heading">
    <div className="panel-head price-grid-head">
      <div><h2 id="price-grid-heading">شبكة الأسعار — تحرير مجمّع</h2>
        <p>السعر الأساسي والجملة الجملة والجملة والتجزئة. لا تحفظ التعديلات قبل المعاينة؛ تعتمد الدفعة ذريًا مع فحص تعارض الأسعار وسجل التدقيق.</p></div>
      <div className="price-grid-actions">
        <button type="button" className="btn outline" onClick={() => downloadPriceGridCsv(rows)} disabled={loading || Boolean(error) || !rows.length || busy} title="تصدير آخر أسعار محفوظة من الخادم، لا التعديلات غير المعتمدة">
          <Download size={15} /> تصدير الأسعار المحفوظة CSV
        </button>
        <button type="button" className="btn outline" onClick={() => { setDrafts({}); setPreview(null); setFormError(''); }} disabled={busy || (!Object.keys(drafts).length && !preview)}>
          <RotateCcw size={15} /> إلغاء التعديلات
        </button>
        {!preview ? <button type="button" className="btn primary" onClick={() => { const next = buildPreview(); if (next) setPreview(next); }} disabled={loading || Boolean(error) || !changedCount || busy}>
          <Eye size={15} /> معاينة التغييرات {changedCount ? '(' + changedCount + ')' : ''}
        </button> : <>
          <button type="button" className="btn outline" onClick={() => setPreview(null)} disabled={busy}><X size={15} /> العودة للتعديل</button>
          <button type="button" className="btn primary" onClick={() => void commitPreview()} disabled={busy}><Save size={15} /> {busy ? 'جارٍ الحفظ...' : 'اعتماد وحفظ الدفعة'}</button>
        </>}
      </div>
    </div>
    {formError && <p className="price-grid-error" role="alert">{formError}</p>}
    {preview && <div className="price-grid-preview" aria-label="معاينة التغييرات قبل الحفظ">
      <div className="price-grid-preview-title"><Eye size={17} /><strong>معاينة قبل الاعتماد</strong><span>{preview.length} صنفًا — لن يُكتب شيء قبل الضغط على «اعتماد وحفظ الدفعة»</span></div>
      <div className="price-grid-table-scroll"><table className="price-grid-table price-grid-review">
        <thead><tr><th>الصنف</th>{PRICE_FIELDS.map((field) => <th key={field.source}>{field.label}: قبل ← بعد</th>)}</tr></thead>
        <tbody>{preview.map((item) => <tr key={item.id}>
          <th scope="row">{item.name}<small>{item.itemCode}</small></th>
          {PRICE_FIELDS.map((field) => <td key={field.source}>
            {item.before[field.source] === item.after[field.source] ? <span className="price-grid-unchanged">{formatPrice(item.before[field.source])}</span> :
              <strong><span className="price-grid-old">{formatPrice(item.before[field.source])}</span> <ChevronRight size={13} /> <span className="price-grid-new">{formatPrice(item.after[field.source])}</span></strong>}
          </td>)}
        </tr>)}</tbody>
      </table></div>
    </div>}
    {loading ? <p className="price-grid-muted">جارٍ تحميل أسعار المنتجات بصلاحية الموظف المخوّل...</p> : error ? <p className="price-grid-error" role="alert">{error}</p> : !rows.length ? <p className="price-grid-muted">لا توجد أصناف لعرضها.</p> : <>
      <div className="price-grid-table-scroll"><table className="price-grid-table">
        <thead><tr><th>الصنف</th><th>الوحدة</th>{PRICE_FIELDS.map((field) => <th key={field.source}>{field.label}</th>)}<th>الحالة</th></tr></thead>
        <tbody>{rows.map((row, productIndex) => <tr key={row.id}>
          <th scope="row">{row.name}<small>{row.item_code}</small></th>
          <td>{row.unit}</td>
          {PRICE_FIELDS.map((field, fieldIndex) => <td key={field.source}>
            <input type="number" min="0" step="0.01" inputMode="decimal" value={rawValue(row, field)}
              aria-label={row.name + ' — ' + field.label}
              ref={(element) => { const key = row.id + ':' + field.draft; if (element) cells.current.set(key, element); else cells.current.delete(key); }}
              disabled={!editable}
              onChange={(event) => updateCell(row.id, field.draft, event.target.value)}
              onKeyDown={(event) => onCellKeyDown(event, productIndex, fieldIndex)}
              className={drafts[row.id]?.[field.draft] !== undefined && Number(drafts[row.id]?.[field.draft]) !== Number(row[field.source]) ? 'price-grid-input is-dirty' : 'price-grid-input'}
            />
          </td>)}
          <td><span className={row.is_active ? 'price-grid-status active' : 'price-grid-status inactive'}>{row.is_active ? 'نشط' : 'موقوف'}</span></td>
        </tr>)}</tbody>
      </table></div>
      <p className="price-grid-muted">Enter ينقل إلى الخلية التالية ثم السطر التالي. الحد الأقصى 200 صنف؛ يتحقق الخادم من القيم الأصلية لمنع الكتابة فوق تغيير متزامن. تصدير CSV يعكس الأسعار المحفوظة فقط؛ عند فتحه في Excel استورد عمود الكود بنوع «نص» للمحافظة على الأصفار البادئة.</p>
    </>}
  </section>;
}
