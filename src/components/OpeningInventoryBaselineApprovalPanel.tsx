import { useEffect, useMemo, useState } from 'react';
import {
  approveOpeningInventoryBaseline,
  fetchOpeningInventoryBaselinePreview,
} from '@/lib/api';
import type {
  OpeningInventoryBaselineItem,
  OpeningInventoryBaselinePreview,
} from '@/lib/api';

const formatQuantity = (value: number | null) =>
  value === null
    ? '—'
    : new Intl.NumberFormat('ar-YE', { maximumFractionDigits: 3 }).format(value);

function openingBaselineErrorMessage(cause: unknown, fallback: string): string {
  const raw = cause instanceof Error
    ? cause.message
    : cause && typeof cause === 'object' && 'message' in cause && typeof cause.message === 'string'
      ? cause.message
      : '';
  if (/verified organization owner identity and approval capability are required/i.test(raw)) {
    return 'لا يمكن عرض أو اعتماد خط الأساس: لم تُسجّل هوية مالك المؤسسة بشكل موثوق بعد. يجب ربط ملف المالك الصحيح عبر قناة التهيئة الخادمية الموثوقة؛ لا تُمنح هذه الصلاحية تلقائياً لأي مدير.';
  }
  return raw || fallback;
}

function formatDate(value: string | null): string {
  if (!value) return '—';
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? '—' : parsed.toLocaleString('ar-YE');
}

export function OpeningInventoryBaselineApprovalPanel({
  warehouseId,
  warehouseName,
}: {
  warehouseId: string;
  warehouseName: string;
}) {
  const [preview, setPreview] = useState<OpeningInventoryBaselinePreview | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [query, setQuery] = useState('');

  async function reload() {
    if (!warehouseId) {
      setPreview(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError('');
    try {
      const result = await fetchOpeningInventoryBaselinePreview(warehouseId);
      setPreview(result);
    } catch (cause) {
      setPreview(null);
      setError(openingBaselineErrorMessage(cause, 'تعذر تحميل معاينة الرصيد الافتتاحي.'));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    setPreview(null);
    setQuery('');
    setNotice('');
    void reload();
    // This server projection is scoped to the selected warehouse.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [warehouseId]);

  const filteredItems = useMemo(() => {
    const normalized = query.normalize('NFKD')
      .replace(/[\u064B-\u065F\u0670\u0640]/g, '')
      .toLocaleLowerCase('ar-YE').trim();
    if (!normalized) return preview?.items ?? [];
    return (preview?.items ?? []).filter((item) =>
      [item.item_code,item.product_name,item.unit ?? ''].some((value) =>
        value.normalize('NFKD').replace(/[\u064B-\u065F\u0670\u0640]/g, '')
          .toLocaleLowerCase('ar-YE').includes(normalized),
      ),
    );
  }, [preview, query]);

  async function approve() {
    if (!preview?.ready_to_approve || preview.approval_id || busy) return;
    const confirmed = window.confirm(
      'اعتماد خط الأساس الافتتاحي للمستودع ' + warehouseName + '؟' +
      '\nعدد الأصناف: 114' +
      '\nمجموع وحدات البيع حسب وحدات الأصناف: 3,235' +
      '\nسيُحفظ اسم المعتمد ووقت الاعتماد ولقطة كل صنف.' +
      '\nلن تتغير الأرصدة الحالية ولن تُنشأ أي حركة مخزون.' +
      '\nالحالة ستبقى: معتمد من المالك — بانتظار الجرد الميداني.',
    );
    if (!confirmed) return;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const result = await approveOpeningInventoryBaseline(warehouseId);
      setNotice(
        result.idempotent_replay
          ? 'هذا الخط الأساس معتمد مسبقاً؛ أُعيدت نتيجة الاعتماد السابقة دون إنشاء لقطة مكررة.'
          : 'تم اعتماد خط الأساس وحفظ لقطة 114 صنفاً ومجموع 3,235 وحدة بيع. لم تتغير الأرصدة ولم تُنشأ حركات جديدة.',
      );
      await reload();
    } catch (cause) {
      setError(openingBaselineErrorMessage(cause, 'تعذر اعتماد خط الأساس الافتتاحي.'));
    } finally {
      setBusy(false);
    }
  }

  function rowStatus(item: OpeningInventoryBaselineItem): string {
    if (!item.source_marker_present) return 'حركة افتتاحية موثقة مفقودة';
    if (item.source_movement_count !== 1) return 'حركة افتتاحية مكررة';
    if (item.quantity_on_hand === null) return 'رصيد المستودع مفقود';
    return 'مرتبط بالمصدر';
  }

  const alreadyApproved = Boolean(preview?.approval_id);
  const counters = preview ? [
    ['الأصناف النشطة', preview.active_product_count],
    ['حركات الافتتاح المطابقة', preview.opening_movement_count],
    ['الأرصدة المرتبطة', preview.matching_balance_count],
    ['مجموع وحدات البيع', formatQuantity(preview.opening_total_quantity)],
  ] as const : [];

  return (
    <section className="panel" aria-label="اعتماد خط الأساس الافتتاحي">
      <div className="panel-head" style={{ alignItems: 'start', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <h2>اعتماد الرصيد الافتتاحي</h2>
          <p className="text-muted">
            لقطة اعتماد مستقلة عن الجرد الفعلي. تثبت المصدر الحالي ولا تعدّل رصيداً أو تنشئ حركة مخزون.
          </p>
        </div>
        <button type="button" className="btn outline" onClick={() => void reload()} disabled={loading || busy}>
          تحديث المعاينة
        </button>
      </div>
      {error && <div className="form-error" role="alert">{error}</div>}
      {notice && <div className="data-status success" role="status">{notice}</div>}
      <p className="text-muted">المستودع: <strong>{warehouseName}</strong></p>
      {loading ? <p role="status">جار مطابقة حركات الافتتاح والأرصدة الحالية…</p> : preview ? (
        <>
          <div className="report-grid">
            {counters.map(([label,value]) => (
              <article className="report-metric" key={label}>
                <span>{label}</span><strong>{value}</strong>
              </article>
            ))}
          </div>
          {alreadyApproved ? (
            <div className="data-status success" role="status" style={{ marginTop: 12 }}>
              <strong>رصيد افتتاحي معتمد من المالك — بانتظار الجرد الميداني</strong>
              <p>وقت الاعتماد: {formatDate(preview.approved_at)}</p>
              <p>معرّف الاعتماد: {preview.approval_id}</p>
              <p>حالة اللقطة: {preview.approval_status}</p>
            </div>
          ) : (
            <div className="privacy-note" style={{ marginTop: 12 }}>
              <strong>{preview.ready_to_approve ? 'المصدر مكتمل وجاهز للاعتماد' : 'الاعتماد محجوب حتى تطابق المصدر بالكامل'}</strong>
              <p>
                المطلوب 114 صنفاً و114 حركة افتتاحية و114 رصيداً مرتبطاً ومجموع 3,235.
                المفقود من المصدر: {preview.missing_opening_product_count} · الحركات المكررة: {preview.duplicate_opening_product_count} ·
                الأرصدة المفقودة: {preview.missing_balance_count} · الكميات غير الصالحة: {preview.invalid_quantity_count}.
              </p>
            </div>
          )}
          <div className="form-grid" style={{ marginTop: 12 }}>
            <label>
              البحث في أصناف خط الأساس
              <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="رمز الصنف أو الاسم أو الوحدة" />
            </label>
          </div>
          <div className="table-wrap" style={{ overflowX: 'auto', maxHeight: 420, overflowY: 'auto', marginTop: 12 }}>
            <table>
              <thead>
                <tr>
                  <th>رمز الصنف</th><th>الصنف</th><th>الوحدة</th><th>كمية الافتتاح</th>
                  <th>الرصيد عند المعاينة</th><th>المحجوز</th><th>المتاح</th><th>التحقق</th>
                </tr>
              </thead>
              <tbody>
                {filteredItems.map((item) => (
                  <tr key={item.product_id}>
                    <td>{item.item_code}</td>
                    <td>{item.product_name}</td>
                    <td>{item.unit ?? '—'}</td>
                    <td>{formatQuantity(item.opening_quantity)}</td>
                    <td>{formatQuantity(item.quantity_on_hand)}</td>
                    <td>{formatQuantity(item.quantity_reserved)}</td>
                    <td>{formatQuantity(item.quantity_available)}</td>
                    <td>{rowStatus(item)}</td>
                  </tr>
                ))}
                {!filteredItems.length && <tr><td colSpan={8}>لا توجد أصناف تطابق البحث.</td></tr>}
              </tbody>
            </table>
          </div>
          {!alreadyApproved && (
            <div className="toolbar-actions" style={{ marginTop: 12 }}>
              <button type="button" className="btn primary" onClick={() => void approve()}
                disabled={busy || !preview.ready_to_approve}>
                {busy ? 'جار حفظ لقطة الاعتماد…' : 'اعتماد خط الأساس الافتتاحي'}
              </button>
            </div>
          )}
          <p className="text-muted" style={{ marginTop: 10 }}>
            الاعتماد لا يثبت العدّ الميداني. يبقى الجرد الفعلي مطلوباً لاحقاً، وتُحفظ هذه اللقطة التاريخية دون تعديل.
          </p>
        </>
      ) : !error ? <p className="text-muted">لا توجد معاينة متاحة لهذا المستودع.</p> : null}
    </section>
  );
}
