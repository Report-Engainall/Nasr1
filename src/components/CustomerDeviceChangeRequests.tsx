import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/lib/supabase";

type RequestStatus = "pending_approval" | "approved" | "rejected" | "expired";
type CustomerRequest = {
  id: string;
  status: RequestStatus;
  reason: string;
  review_reason: string | null;
  created_at: string;
  reviewed_at: string | null;
  requested_device: string | null;
};
type AdminRequest = CustomerRequest & {
  customer_name: string;
  customer_email: string | null;
  unlinked_session_count: number;
};
type RpcResult = { data: unknown; error: { message?: string } | null };
type RpcClient = (name: string, args?: Record<string, unknown>) => PromiseLike<RpcResult>;

async function callDeviceRequestRpc(name: string, args?: Record<string, unknown>): Promise<RpcResult> {
  return await (supabase.rpc as unknown as RpcClient)(name, args);
}
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function validDate(value: unknown): value is string {
  return typeof value === "string" && Number.isFinite(Date.parse(value));
}
function statusLabel(status: RequestStatus): string {
  return status === "pending_approval" ? "بانتظار موافقة الإدارة"
    : status === "approved" ? "تمت الموافقة وتفعيل الجهاز الجديد"
    : status === "rejected" ? "رُفض الطلب وفُصل الجهاز الذي قدّم الطلب"
    : "انتهت الجلسة قبل اتخاذ القرار";
}
function dateLabel(value: string | null): string {
  if (!value) return "غير مسجل";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "تاريخ غير صالح" : date.toLocaleString("ar-YE", { dateStyle: "medium", timeStyle: "short" });
}
function parseCustomerRequests(value: unknown): CustomerRequest[] {
  if (!isRecord(value) || !Array.isArray(value.items)) throw new Error("استجابة سجل طلبات تغيير الجهاز غير صالحة.");
  const seen = new Set<string>();
  return value.items.map((raw): CustomerRequest => {
    if (!isRecord(raw) || typeof raw.id !== "string" ||
      !["pending_approval", "approved", "rejected", "expired"].includes(String(raw.status)) ||
      typeof raw.reason !== "string" || !(raw.review_reason === null || typeof raw.review_reason === "string") ||
      !validDate(raw.created_at) || !(raw.reviewed_at === null || validDate(raw.reviewed_at)) ||
      !(raw.requested_device === null || typeof raw.requested_device === "string")) {
      throw new Error("تعذر التحقق من سجل أحد طلبات تغيير الجهاز.");
    }
    if (seen.has(raw.id)) throw new Error("أعاد الخادم طلب تغيير جهاز مكرراً.");
    seen.add(raw.id);
    return {
      id: raw.id, status: raw.status as RequestStatus, reason: raw.reason,
      review_reason: raw.review_reason as string | null, created_at: raw.created_at,
      reviewed_at: raw.reviewed_at as string | null, requested_device: raw.requested_device as string | null,
    };
  });
}
function parseAdminRequests(value: unknown): AdminRequest[] {
  if (!isRecord(value) || !Array.isArray(value.items)) throw new Error("استجابة صندوق مراجعة أجهزة العملاء غير صالحة.");
  const seen = new Set<string>();
  return value.items.map((raw): AdminRequest => {
    if (!isRecord(raw) || typeof raw.id !== "string" ||
      !["pending_approval", "approved", "rejected", "expired"].includes(String(raw.status)) ||
      typeof raw.reason !== "string" || !(raw.review_reason === null || typeof raw.review_reason === "string") ||
      !validDate(raw.created_at) || !(raw.reviewed_at === null || validDate(raw.reviewed_at)) ||
      !(raw.requested_device === null || typeof raw.requested_device === "string") ||
      typeof raw.customer_name !== "string" ||
      !(raw.customer_email === null || typeof raw.customer_email === "string") ||
      typeof raw.unlinked_session_count !== "number" || !Number.isSafeInteger(raw.unlinked_session_count) ||
      raw.unlinked_session_count < 0) {
      throw new Error("تعذر التحقق من طلب جهاز أو هوية العميل المرتبطة به.");
    }
    if (seen.has(raw.id)) throw new Error("أعاد الخادم طلب جهاز مكرراً.");
    seen.add(raw.id);
    return {
      id: raw.id, status: raw.status as RequestStatus, reason: raw.reason,
      review_reason: raw.review_reason as string | null, created_at: raw.created_at,
      reviewed_at: raw.reviewed_at as string | null, requested_device: raw.requested_device as string | null,
      customer_name: raw.customer_name, customer_email: raw.customer_email as string | null,
      unlinked_session_count: raw.unlinked_session_count,
    };
  });
}
function uuid(): string {
  if (!globalThis.crypto?.randomUUID) throw new Error("المتصفح لا يدعم إنشاء مفتاح عملية آمن.");
  return globalThis.crypto.randomUUID();
}

const statusStyles: Record<RequestStatus, string> = {
  pending_approval: "border-amber-300 bg-amber-50 text-amber-900",
  approved: "border-emerald-300 bg-emerald-50 text-emerald-900",
  rejected: "border-rose-300 bg-rose-50 text-rose-900",
  expired: "border-slate-300 bg-slate-100 text-slate-700",
};

export function CustomerDeviceChangeRequestsPanel() {
  const { user, ready, sessionRevision } = useAuth();
  const canUse = Boolean(user && !user.isStaff && user.roles.includes("customer"));
  const [items, setItems] = useState<CustomerRequest[]>([]);
  const [reason, setReason] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const requestKey = useRef<{ fingerprint: string; key: string } | null>(null);
  const generation = useRef(0);

  const load = useCallback(async () => {
    const current = ++generation.current;
    if (!ready || !canUse) {
      setItems([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError("");
    try {
      const result = await callDeviceRequestRpc("fetch_my_customer_device_change_requests", { p_limit: 25 });
      if (result.error) throw new Error(result.error.message || "تعذر تحميل طلبات تغيير الجهاز.");
      const rows = parseCustomerRequests(result.data);
      if (current === generation.current) setItems(rows);
    } catch (cause) {
      if (current === generation.current) {
        setItems([]);
        setError(cause instanceof Error ? cause.message : "تعذر تحميل طلبات تغيير الجهاز من الخادم.");
      }
    } finally {
      if (current === generation.current) setLoading(false);
    }
  }, [ready, canUse, user?.id, user?.profileId, sessionRevision]);

  useEffect(() => {
    void load();
    return () => { generation.current += 1; };
  }, [load]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canUse || saving) return;
    const cleaned = reason.trim();
    if (cleaned.length < 10 || cleaned.length > 500) {
      setError("اكتب سبباً واضحاً من 10 إلى 500 حرف.");
      return;
    }
    const fingerprint = JSON.stringify({ reason: cleaned });
    if (!requestKey.current || requestKey.current.fingerprint !== fingerprint) {
      requestKey.current = { fingerprint, key: uuid() };
    }
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const result = await callDeviceRequestRpc("request_customer_device_change", {
        p_idempotency_key: requestKey.current.key,
        p_reason: cleaned,
      });
      if (result.error) throw new Error(result.error.message || "رفض الخادم إنشاء طلب تغيير الجهاز.");
      if (!isRecord(result.data) || typeof result.data.id !== "string" ||
        result.data.status !== "pending_approval" ||
        typeof result.data.replayed !== "boolean" ||
        !validDate(result.data.created_at) ||
        !(result.data.requested_device === null || typeof result.data.requested_device === "string")) {
        throw new Error("لم يرجع الخادم تأكيداً صالحاً لطلب تغيير الجهاز.");
      }
      const savedRequest: CustomerRequest = {
        id: result.data.id,
        status: "pending_approval",
        reason: cleaned,
        review_reason: null,
        created_at: result.data.created_at,
        reviewed_at: null,
        requested_device: result.data.requested_device,
      };
      requestKey.current = null;
      setItems((current) => [
        savedRequest,
        ...current.filter((item) => item.id !== savedRequest.id),
      ]);
      setReason("");
      setNotice(result.data.replayed
        ? "هذا الطلب سبق تسجيله؛ لم يُنشأ طلب مكرر."
        : "سُجل الطلب من جلسة هذا الجهاز. لم يُفصل أي جهاز بعد؛ تنتظر العملية موافقة الإدارة.");
    } catch (cause) {
      await load();
      setError(cause instanceof Error ? cause.message : "تعذر إرسال طلب تغيير الجهاز.");
    } finally {
      setSaving(false);
    }
  }

  if (!canUse) return null;
  const hasPending = items.some((item) => item.status === "pending_approval");

  return (
    <section dir="rtl" aria-labelledby="customer-device-change-title" className="mb-6 rounded-2xl border border-primary/25 bg-card p-4 sm:p-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id="customer-device-change-title" className="text-lg font-bold">طلب تغيير جهاز تسجيل الدخول</h2>
          <p className="mt-1 max-w-3xl text-sm leading-6 text-muted-foreground">
            هذا المسار مخصص لجهاز دخول العميل الجديد، ومنفصل عن أصول المنتجات وجلسات موظفي المؤسسة.
            أنشئ الطلب من الجهاز الذي تريد اعتماده؛ لن تُفصل جلساتك الحالية عند الإرسال.
          </p>
        </div>
        <button type="button" className="btn btn-outline" onClick={() => void load()} disabled={loading || saving}>
          {loading ? "جار التحديث…" : "تحديث الطلبات"}
        </button>
      </header>

      {error ? <p role="alert" className="mt-3 rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">{error}</p> : null}
      {notice ? <p role="status" className="mt-3 rounded-lg border border-primary/25 bg-primary/5 p-3 text-sm">{notice}</p> : null}

      {hasPending ? (
        <p role="status" className="mt-4 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950">
          لديك طلب قيد المراجعة. لن يُقبل طلب آخر حتى صدور قرار في الطلب الحالي.
        </p>
      ) : (
        <form onSubmit={submit} className="mt-4 grid gap-3">
          <label className="grid gap-1 text-sm font-medium">
            سبب تغيير الجهاز
            <textarea
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              rows={3}
              maxLength={500}
              minLength={10}
              required
              placeholder="مثال: انتقلت إلى هاتف جديد وفقدت إمكانية استخدام الجهاز السابق."
              className="w-full rounded-lg border bg-background p-3 text-sm font-normal"
            />
          </label>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="max-w-2xl text-xs leading-5 text-muted-foreground">
              عند الموافقة، يحتفظ النظام بهذه الجلسة ويحذف سجلات جلسات Auth السابقة للحساب. عند الرفض، يُحذف سجل جلسة الجهاز الذي قدّم الطلب فقط وتبقى جلساتك السابقة. قد تظل رموز الوصول الصادرة قبل الحذف صالحة حتى انتهاء مدتها؛ وتمنعها وظائف التطبيق التي تتحقق من سجل الجلسة الحية.
            </p>
            <button type="submit" className="btn primary" disabled={saving || reason.trim().length < 10}>
              {saving ? "جار إرسال الطلب…" : "إرسال طلب اعتماد الجهاز"}
            </button>
          </div>
        </form>
      )}

      <div className="mt-5 grid gap-3">
        <h3 className="text-sm font-bold">سجل طلباتي</h3>
        {loading && items.length === 0 ? <p role="status" className="text-sm text-muted-foreground">جار تحميل السجل…</p> : null}
        {!loading && !error && items.length === 0 ? <p className="rounded-lg border p-4 text-sm text-muted-foreground">لا توجد طلبات تغيير جهاز مسجلة لهذا الحساب.</p> : null}
        {items.map((item) => (
          <article key={item.id} className="rounded-xl border p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <strong className="text-sm">طلب {item.id.slice(0, 8)}</strong>
              <span className={"rounded-full border px-2.5 py-1 text-xs font-semibold " + statusStyles[item.status]}>{statusLabel(item.status)}</span>
            </div>
            <p className="mt-2 whitespace-pre-wrap text-sm leading-6">{item.reason}</p>
            {item.requested_device ? <p className="mt-2 break-words text-xs text-muted-foreground" dir="auto">الجهاز: {item.requested_device}</p> : null}
            <p className="mt-2 text-xs text-muted-foreground">تاريخ الطلب: {dateLabel(item.created_at)}{item.reviewed_at ? " · تاريخ القرار: " + dateLabel(item.reviewed_at) : ""}</p>
            {item.review_reason ? <p className="mt-2 rounded-lg bg-muted/50 p-2 text-sm">ملاحظة الإدارة: {item.review_reason}</p> : null}
          </article>
        ))}
      </div>
    </section>
  );
}

export function AdminCustomerDeviceChangeRequests({ onNotice }: { onNotice: (message: string) => void }) {
  const { user, sessionRevision } = useAuth();
  const canReview = Boolean(user?.roles.includes("admin"));
  const [items, setItems] = useState<AdminRequest[]>([]);
  const [filter, setFilter] = useState<"pending_approval" | "all">("pending_approval");
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
  const reviewKeys = useRef(new Map<string, { fingerprint: string; key: string }>());
  const generation = useRef(0);

  const load = useCallback(async () => {
    const current = ++generation.current;
    if (!canReview) {
      setItems([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError("");
    try {
      const result = await callDeviceRequestRpc("fetch_customer_device_change_requests", {
        p_status: filter,
        p_limit: 100,
      });
      if (result.error) throw new Error(result.error.message || "تعذر تحميل طلبات أجهزة العملاء.");
      const rows = parseAdminRequests(result.data);
      if (current === generation.current) setItems(rows);
    } catch (cause) {
      if (current === generation.current) {
        setItems([]);
        setError(cause instanceof Error ? cause.message : "تعذر تحميل صندوق مراجعة الأجهزة.");
      }
    } finally {
      if (current === generation.current) setLoading(false);
    }
  }, [canReview, filter, user?.id, user?.profileId, sessionRevision]);

  useEffect(() => {
    void load();
    return () => { generation.current += 1; };
  }, [load]);

  async function decide(item: AdminRequest, decision: "approve" | "reject") {
    if (!canReview || busy) return;
    const prompt = decision === "approve"
      ? "سبب الموافقة (5 أحرف على الأقل):"
      : "سبب رفض طلب الجهاز (5 أحرف على الأقل):";
    const reason = window.prompt(prompt, "");
    if (reason === null) return;
    const cleaned = reason.trim();
    if (cleaned.length < 5 || cleaned.length > 500) {
      setError("سبب القرار يجب أن يكون من 5 إلى 500 حرف.");
      return;
    }
    const fingerprint = JSON.stringify({ decision, reason: cleaned });
    const mapKey = item.id + ":" + decision;
    const previous = reviewKeys.current.get(mapKey);
    const idem = previous?.fingerprint === fingerprint ? previous.key : uuid();
    reviewKeys.current.set(mapKey, { fingerprint, key: idem });
    setBusy(item.id);
    setError("");
    try {
      const result = await callDeviceRequestRpc("review_customer_device_change_request", {
        p_request_id: item.id,
        p_decision: decision,
        p_reason: cleaned,
        p_idempotency_key: idem,
      });
      if (result.error) throw new Error(result.error.message || "رفض الخادم قرار تغيير الجهاز.");
      if (!isRecord(result.data) || result.data.id !== item.id ||
        !["approved", "rejected", "expired"].includes(String(result.data.status)) ||
        typeof result.data.unlinked_session_count !== "number" ||
        !Number.isSafeInteger(result.data.unlinked_session_count) ||
        typeof result.data.replayed !== "boolean") {
        throw new Error("لم يرجع الخادم إقراراً صالحاً لقرار الجهاز.");
      }
      const status = result.data.status as RequestStatus;
      onNotice(status === "approved"
        ? "تم اعتماد الجهاز الجديد، وأكد الخادم حذف " + result.data.unlinked_session_count + " جلسة سابقة."
        : status === "rejected"
          ? "تم رفض الطلب، وأكد الخادم حذف سجل جلسة Auth للجهاز الذي قدّم الطلب فقط."
          : "انتهت جلسة الجهاز قبل الموافقة؛ أبقى الخادم سجلات الجلسات السابقة كما هي.");
      reviewKeys.current.delete(mapKey);
      await load();
    } catch (cause) {
      await load();
      setError(cause instanceof Error ? cause.message : "تعذر اتخاذ قرار تغيير الجهاز.");
    } finally {
      setBusy(null);
    }
  }

  if (!canReview) return null;

  return (
    <section dir="rtl" aria-labelledby="admin-customer-device-requests-title" className="mt-6 rounded-2xl border border-amber-300/60 bg-card p-4 sm:p-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id="admin-customer-device-requests-title" className="text-lg font-bold">طلبات تغيير أجهزة العملاء</h2>
          <p className="mt-1 max-w-3xl text-sm leading-6 text-muted-foreground">
            دورة اعتماد مستقلة عن قائمة جلسات الموظفين. لا تُعرض هنا إلا الطلبات التي تخص المؤسسة الحالية، ويُسجل كل قرار في سجل التدقيق.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select aria-label="تصفية طلبات أجهزة العملاء" className="rounded-lg border bg-background px-3 py-2 text-sm"
            value={filter} onChange={(event) => setFilter(event.target.value as "pending_approval" | "all")} disabled={busy !== null}>
            <option value="pending_approval">بانتظار الموافقة</option>
            <option value="all">كل الطلبات</option>
          </select>
          <button type="button" className="btn btn-outline" onClick={() => void load()} disabled={loading || busy !== null}>
            {loading ? "جار التحديث…" : "تحديث"}
          </button>
        </div>
      </header>
      {error ? <p role="alert" className="mt-3 rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">{error}</p> : null}
      {loading && items.length === 0 ? <p role="status" className="mt-4 text-sm text-muted-foreground">جار تحميل طلبات العملاء…</p> : null}
      {!loading && !error && items.length === 0 ? <p role="status" className="mt-4 rounded-lg border p-4 text-sm text-muted-foreground">لا توجد طلبات ضمن هذا الفلتر.</p> : null}
      <div className="mt-4 grid gap-3">
        {items.map((item) => (
          <article key={item.id} className="rounded-xl border p-3 sm:p-4">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <strong className="text-sm">{item.customer_name}</strong>
                {item.customer_email ? <p className="mt-1 break-all text-xs text-muted-foreground" dir="ltr">{item.customer_email}</p> : null}
              </div>
              <span className={"rounded-full border px-2.5 py-1 text-xs font-semibold " + statusStyles[item.status]}>{statusLabel(item.status)}</span>
            </div>
            <p className="mt-3 whitespace-pre-wrap text-sm leading-6">{item.reason}</p>
            {item.requested_device ? <p className="mt-2 break-words text-xs text-muted-foreground" dir="auto">الجهاز المطلوب اعتماده: {item.requested_device}</p> : null}
            <p className="mt-2 text-xs text-muted-foreground">رقم الطلب: {item.id} · تاريخ الإرسال: {dateLabel(item.created_at)}</p>
            {item.review_reason ? <p className="mt-2 rounded-lg bg-muted/50 p-2 text-sm">سبب القرار السابق: {item.review_reason} · الجلسات المفصولة: {item.unlinked_session_count}</p> : null}
            {item.status === "pending_approval" ? (
              <div className="mt-3 flex flex-wrap gap-2">
                <button type="button" className="btn primary" disabled={busy !== null || loading}
                  onClick={() => void decide(item, "approve")}>{busy === item.id ? "جار التنفيذ…" : "الموافقة واعتماد الجهاز"}</button>
                <button type="button" className="btn btn-outline" disabled={busy !== null || loading}
                  onClick={() => void decide(item, "reject")}>رفض وفصل الجهاز الطالب</button>
              </div>
            ) : null}
          </article>
        ))}
      </div>
    </section>
  );
}
