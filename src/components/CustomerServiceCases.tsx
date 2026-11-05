import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Button, Empty, ErrorBox, Loading } from "@/components/AdminPages";
import {
  createCustomerServiceCase,
  fetchCustomerServiceCases,
  randomCaseRequestKey,
  updateCustomerServiceCase,
  type CustomerServiceCase,
  type CustomerServiceCaseStatus,
  type CustomerServiceCaseType,
  type CustomerServiceCasePriority,
} from "@/lib/customer-service-cases";
import { formatDateShort } from "@/lib/format";

const typeLabels: Record<CustomerServiceCaseType,string> = {
  complaint: "شكوى",
  inquiry: "استفسار",
  service_request: "طلب خدمة",
  delivery_issue: "مشكلة تسليم",
  other: "أخرى",
};
const priorityLabels: Record<CustomerServiceCasePriority,string> = {
  low: "منخفضة",
  medium: "متوسطة",
  high: "عالية",
  urgent: "عاجلة",
};
const statusLabels: Record<CustomerServiceCaseStatus,string> = {
  open: "مفتوحة",
  in_progress: "قيد المعالجة",
  waiting_customer: "بانتظار العميل",
  resolved: "تم الحل",
  closed: "مغلقة",
};
const eventLabels: Record<string,string> = {
  opened: "فتح الحالة",
  status_changed: "تغيير الحالة",
  priority_changed: "تغيير الأولوية",
  note_added: "إضافة ملاحظة",
  resolved: "حل الحالة",
  closed: "إغلاق الحالة",
  reopened: "إعادة فتح الحالة",
};

function CustomerServiceCaseCard({
  item,
  onRefresh,
}: {
  item: CustomerServiceCase;
  onRefresh: () => Promise<void>;
}) {
  const [status, setStatus] = useState<CustomerServiceCaseStatus>(item.status);
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    setStatus(item.status);
    setNote("");
  }, [item.id, item.status]);

  async function saveUpdate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (status === item.status && !note.trim()) return;
    if ((status === "resolved" || status === "closed") && status !== item.status && !note.trim()) {
      setError("اكتب ملخص الحل قبل إنهاء الحالة.");
      return;
    }
    setSaving(true);
    setError("");
    setNotice("");
    try {
      await updateCustomerServiceCase({ caseId: item.id, status, note: note.trim() || null });
      setNote("");
      setNotice("حُفظ تحديث الحالة وسجل الحدث.");
      await onRefresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "تعذر تحديث حالة خدمة العميل.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <article className="customer-service-case">
      <div className="customer-service-case-heading">
        <div>
          <strong>{item.subject}</strong>
          <div className="customer-service-case-meta">
            <span>{item.case_code}</span>
            <span>{typeLabels[item.case_type]}</span>
            <span>الأولوية: {priorityLabels[item.priority]}</span>
          </div>
        </div>
        <span className={"customer-service-case-status status-" + item.status}>{statusLabels[item.status]}</span>
      </div>
      <p className="customer-service-case-description">{item.description}</p>
      <div className="customer-service-case-meta">
        <span>فتحها: {item.created_by_name}</span>
        <span>تاريخ الفتح: {formatDateShort(item.created_at)}</span>
        <span>مسندة إلى: {item.assigned_to_name}</span>
        {item.resolved_at && <span>حُلّت: {formatDateShort(item.resolved_at)}</span>}
        {item.closed_at && <span>أُغلقت: {formatDateShort(item.closed_at)}</span>}
      </div>
      {item.resolution_note && <p className="customer-service-case-resolution">ملخص الحل: {item.resolution_note}</p>}

      <form className="customer-service-case-update" onSubmit={event => { void saveUpdate(event); }}>
        <label>
          <span>تحديث سير الحالة</span>
          <select value={status} disabled={saving} onChange={event => setStatus(event.target.value as CustomerServiceCaseStatus)}>
            {Object.entries(statusLabels).map(([value,label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </label>
        <label className="customer-service-case-note">
          <span>ملاحظة أو ملخص الحل</span>
          <input
            value={note}
            maxLength={1000}
            disabled={saving}
            onChange={event => setNote(event.target.value)}
            placeholder="سبب التحديث أو نتيجة المعالجة؛ إلزامي عند الحل والإغلاق"
          />
        </label>
        <Button disabled={saving || (status === item.status && !note.trim())}>
          {saving ? "جارٍ الحفظ…" : "حفظ التحديث"}
        </Button>
      </form>
      {notice && <p className="customer-service-case-notice" role="status">{notice}</p>}
      {error && <ErrorBox message={error} />}

      {item.events.length > 0 && (
        <details className="customer-service-case-history">
          <summary>سجل الأحداث ({item.events.length})</summary>
          <ol>
            {item.events.map(event => (
              <li key={event.id}>
                <strong>{eventLabels[event.event_type] || event.event_type}</strong>
                <span>{event.actor_name} · {formatDateShort(event.created_at)}</span>
                {event.note && <p>{event.note}</p>}
              </li>
            ))}
          </ol>
          <small>يعرض آخر 10 أحداث لهذه الحالة.</small>
        </details>
      )}
    </article>
  );
}

export function CustomerServiceCases({ customerId }: { customerId: string }) {
  const [items, setItems] = useState<CustomerServiceCase[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [caseType, setCaseType] = useState<CustomerServiceCaseType>("inquiry");
  const [priority, setPriority] = useState<CustomerServiceCasePriority>("medium");
  const [subject, setSubject] = useState("");
  const [description, setDescription] = useState("");
  const [idempotencyKey, setIdempotencyKey] = useState(() => randomCaseRequestKey());

  const reload = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setItems(await fetchCustomerServiceCases(customerId, 50));
    } catch (cause) {
      setItems([]);
      setError(cause instanceof Error ? cause.message : "تعذر تحميل حالات خدمة العميل.");
    } finally {
      setLoading(false);
    }
  }, [customerId]);

  useEffect(() => { void reload(); }, [reload]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!subject.trim() || !description.trim()) return;
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const created = await createCustomerServiceCase({
        customerId,
        idempotencyKey,
        caseType,
        priority,
        subject,
        description,
      });
      setSubject("");
      setDescription("");
      setIdempotencyKey(randomCaseRequestKey());
      setNotice("فُتحت الحالة " + created.caseCode + " وأُنشئت لها مهمة في طابور المبيعات.");
      await reload();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "تعذر فتح حالة خدمة العميل.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="panel customer-service-cases">
      <div className="customer-service-cases-heading">
        <div>
          <h3>شكاوى واستفسارات وطلبات العملاء</h3>
          <p className="report-note">كل حالة لها رقم مستقل ومسار معالجة وسجل أحداث. تُنشأ مهمة تشغيلية مرتبطة بالحالة، وتُغلق المهمة عند حل الحالة أو إغلاقها.</p>
        </div>
        <Button variant="secondary" disabled={loading || saving} onClick={() => { void reload(); }}>تحديث الحالات</Button>
      </div>

      <form className="customer-service-case-form" onSubmit={event => { void submit(event); }}>
        <label>
          <span>نوع الحالة</span>
          <select value={caseType} disabled={saving} onChange={event => { setCaseType(event.target.value as CustomerServiceCaseType); setIdempotencyKey(randomCaseRequestKey()); }}>
            {Object.entries(typeLabels).map(([value,label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </label>
        <label>
          <span>الأولوية</span>
          <select value={priority} disabled={saving} onChange={event => { setPriority(event.target.value as CustomerServiceCasePriority); setIdempotencyKey(randomCaseRequestKey()); }}>
            {Object.entries(priorityLabels).map(([value,label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </label>
        <label className="customer-service-case-form-subject">
          <span>موضوع الحالة</span>
          <input value={subject} maxLength={200} required disabled={saving} onChange={event => { setSubject(event.target.value); setIdempotencyKey(randomCaseRequestKey()); }} placeholder="مثال: تأخر تسليم طلب أو استفسار عن منتج" />
        </label>
        <label className="customer-service-case-form-description">
          <span>تفاصيل الحالة</span>
          <textarea value={description} maxLength={4000} required rows={3} disabled={saving} onChange={event => { setDescription(event.target.value); setIdempotencyKey(randomCaseRequestKey()); }} placeholder="سجّل تفاصيل العميل وما يحتاجه فريق المعالجة" />
        </label>
        <div className="customer-service-case-form-submit">
          <Button disabled={saving || !subject.trim() || !description.trim()}>
            {saving ? "جارٍ فتح الحالة…" : "فتح حالة جديدة"}
          </Button>
        </div>
      </form>
      {notice && <p className="customer-service-case-notice" role="status">{notice}</p>}
      {error && <ErrorBox message={error} />}

      {loading ? <Loading /> : items.length === 0 ? (
        <Empty text="لا توجد حالات خدمة مسجلة لهذا العميل." />
      ) : (
        <div className="customer-service-case-list">
          {items.map(item => <CustomerServiceCaseCard key={item.id} item={item} onRefresh={reload} />)}
        </div>
      )}
      <p className="report-note">يعرض أحدث {items.length} حالة من حد 50 حالة لهذا العميل؛ يحتفظ سجل الأحداث بأحدث 10 أحداث لكل حالة في هذه الشاشة.</p>
    </section>
  );
}
