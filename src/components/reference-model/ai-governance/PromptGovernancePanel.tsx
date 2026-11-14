import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { Archive, Check, Clock3, FilePlus2, PowerOff, RefreshCw, Send, ShieldCheck, XCircle } from "lucide-react";
import { useAuth } from "@/lib/auth";
import type { AiPromptAuditEvent, AiPromptVersion, PromptLifecycleStatus } from "@/lib/intelligence/ai-prompt-governance";
import {
  activateAiPromptVersion,
  approveAiPromptVersion,
  createAiPromptDraft,
  listAiPromptVersions,
  listAiPromptAuditEvents,
  rejectAiPromptVersion,
  retireAiPromptVersion,
  disableAiPromptVersion,
  submitAiPromptVersion,
} from "@/lib/reference-model/prompt-persistence/prompt-persistence-client";

const eventLabels: Record<AiPromptAuditEvent["action"], string> = {
  CREATED: "إنشاء إصدار",
  SUBMITTED_FOR_APPROVAL: "إرسال للمراجعة",
  APPROVED: "اعتماد",
  REJECTED: "رفض",
  ACTIVATED: "تفعيل",
  DEACTIVATED: "إيقاف النسخة السابقة",
  DISABLED: "تعطيل النسخة النشطة",
  RETIRED: "أرشفة",
};

const statusLabels: Record<PromptLifecycleStatus, string> = {
  DRAFT: "مسودة",
  PENDING_APPROVAL: "بانتظار المراجعة",
  APPROVED: "معتمدة",
  ACTIVE: "نشطة",
  REJECTED: "مرفوضة",
  RETIRED: "مؤرشفة",
  DISABLED: "معطلة",
};

function dateLabel(value: string | null): string {
  if (!value) return "—";
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? new Date(timestamp).toLocaleString("ar-YE") : "تاريخ غير صالح";
}
function errorMessage(error: unknown): string {
  return error instanceof Error && error.message
    ? error.message
    : "تعذر إكمال العملية؛ لم تُعرض نتيجة نجاح غير مؤكدة.";
}
function commandId(): string {
  return crypto.randomUUID();
}

export function PromptGovernancePanel() {
  const { user, sessionRevision, loading: authLoading, ready } = useAuth();
  const isAdmin = Boolean(user?.roles.includes("admin"));
  const [versions, setVersions] = useState<AiPromptVersion[]>([]);
  const [total, setTotal] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [draftKey, setDraftKey] = useState("assistant.system");
  const [draftContent, setDraftContent] = useState("");
  const [reason, setReason] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [auditEvents, setAuditEvents] = useState<AiPromptAuditEvent[]>([]);
  const [auditLoading, setAuditLoading] = useState(false);
  const [auditRefreshKey, setAuditRefreshKey] = useState(0);

  const selected = useMemo(
    () => versions.find((version) => version.id === selectedId) ?? null,
    [versions, selectedId],
  );
  const previousVersion = useMemo(() => {
    if (!selected) return null;
    return versions
      .filter((version) => version.promptKey === selected.promptKey && version.version < selected.version)
      .sort((left, right) => right.version - left.version)[0] ?? null;
  }, [versions, selected]);

  const reload = useCallback(async (preferredId?: string | null) => {
    const page = await listAiPromptVersions();
    setVersions(page.items);
    setTotal(page.total);
    setSelectedId((current) => {
      const wanted = preferredId ?? current;
      if (wanted && page.items.some((item) => item.id === wanted)) return wanted;
      return page.items[0]?.id ?? null;
    });
  }, []);

  useEffect(() => {
    let active = true;
    setVersions([]);
    setTotal(0);
    setSelectedId(null);
    setNotice(null);
    setError(null);
    if (!ready || authLoading) {
      setLoading(true);
      return () => { active = false; };
    }
    if (!user || !isAdmin) {
      setLoading(false);
      return () => { active = false; };
    }
    setLoading(true);
    void listAiPromptVersions().then((page) => {
      if (!active) return;
      setVersions(page.items);
      setTotal(page.total);
      setSelectedId(page.items[0]?.id ?? null);
    }).catch((cause: unknown) => {
      if (active) setError(errorMessage(cause));
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, [user?.profileId, sessionRevision, refreshKey, ready, authLoading, user, isAdmin]);

  useEffect(() => {
    let active = true;
    if (!ready || authLoading || !user || !isAdmin || !selectedId) {
      setAuditEvents([]);
      setAuditLoading(false);
      return () => { active = false; };
    }
    setAuditLoading(true);
    void listAiPromptAuditEvents(selectedId).then((events) => {
      if (active) setAuditEvents(events);
    }).catch((cause: unknown) => {
      if (active) {
        setAuditEvents([]);
        setError(errorMessage(cause));
      }
    }).finally(() => {
      if (active) setAuditLoading(false);
    });
    return () => { active = false; };
  }, [selectedId, user?.profileId, sessionRevision, refreshKey, auditRefreshKey, ready, authLoading, user, isAdmin]);

  async function perform(
    action: string,
    successMessage: string,
    operation: () => Promise<{ version: AiPromptVersion; replayed: boolean }>,
  ) {
    setBusyAction(action);
    setError(null);
    setNotice(null);
    try {
      const result = await operation();
      await reload(result.version.id);
      setAuditRefreshKey((value) => value + 1);
      setNotice(result.replayed ? "تم التحقق من نتيجة العملية السابقة دون تكرارها." : successMessage);
      setReason("");
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setBusyAction(null);
    }
  }

  async function createDraft(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busyAction) return;
    setBusyAction("create");
    setError(null);
    setNotice(null);
    try {
      const result = await createAiPromptDraft({
        promptKey: draftKey.trim(),
        content: draftContent,
        commandId: commandId(),
      });
      await reload(result.version.id);
      setAuditRefreshKey((value) => value + 1);
      setDraftContent("");
      setNotice(result.replayed ? "تم استرجاع المسودة السابقة دون إنشاء نسخة مكررة." : "حُفظت المسودة بإصدار وبصمة ثابتين.");
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setBusyAction(null);
    }
  }

  if (!ready || authLoading) {
    return <section dir="rtl" role="status" aria-busy="true" className="rounded-xl border p-4 text-sm">جارٍ التحقق من جلسة الإدارة…</section>;
  }
  if (!user) {
    return <section dir="rtl" role="alert" className="rounded-xl border p-4 text-sm">يلزم تسجيل الدخول للوصول إلى مكتبة الأوامر.</section>;
  }
  if (!isAdmin) {
    return (
      <section dir="rtl" role="alert" aria-label="صلاحية مكتبة الأوامر" className="rounded-xl border p-4 text-sm">
        <h2 className="font-semibold">مكتبة أوامر الذكاء</h2>
        <p className="mt-2">هذه المساحة مخصصة لمدير النظام فقط. يفرض الخادم الصلاحية نفسها؛ إخفاء عناصر الواجهة ليس حد التفويض.</p>
      </section>
    );
  }

  const isOwnDraft = Boolean(selected && selected.createdByProfileId === user.profileId);
  const isOwnApproval = Boolean(selected && selected.approvedByProfileId === user.profileId);
  const canSubmit = selected?.status === "DRAFT" && isOwnDraft;
  const canReview = selected?.status === "PENDING_APPROVAL" && !isOwnDraft;
  const canActivate = selected?.status === "APPROVED" && !isOwnDraft && !isOwnApproval;
  const canRetire = Boolean(selected && ["DRAFT", "APPROVED", "REJECTED"].includes(selected.status));
  const canDisable = selected?.status === "ACTIVE";

  return (
    <section dir="rtl" aria-label="حوكمة مكتبة أوامر الذكاء" className="space-y-4 rounded-xl border p-4">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-lg font-semibold">مكتبة أوامر الذكاء وإصداراتها</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            نسخ غير قابلة للتحرير بعد الحفظ، مراجعة واعتماد بأربع عيون، وتدقيق خادمي مرتبط بالمؤسسة.
          </p>
        </div>
        <button
          type="button"
          className="inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
          onClick={() => setRefreshKey((value) => value + 1)}
          disabled={loading || busyAction !== null}
        >
          <RefreshCw size={15} aria-hidden="true" />
          تحديث
        </button>
      </header>

      <form onSubmit={createDraft} className="space-y-3 rounded-lg border p-3">
        <div className="flex items-center gap-2">
          <FilePlus2 size={18} aria-hidden="true" />
          <h3 className="font-semibold">إنشاء مسودة إصدار جديد</h3>
        </div>
        <label className="block space-y-1 text-sm">
          <span className="font-medium">مفتاح الأمر</span>
          <input
            className="w-full rounded-md border bg-background px-3 py-2"
            dir="ltr"
            value={draftKey}
            onChange={(event) => setDraftKey(event.target.value)}
            maxLength={80}
            pattern="[a-z][a-z0-9_.-]{1,79}"
            required
          />
        </label>
        <label className="block space-y-1 text-sm">
          <span className="font-medium">نص الأمر</span>
          <textarea
            className="min-h-32 w-full rounded-md border bg-background px-3 py-2 leading-7"
            value={draftContent}
            onChange={(event) => setDraftContent(event.target.value)}
            minLength={16}
            maxLength={8000}
            required
            placeholder="اكتب تعليمات النظام أو سياسة المساعد هنا. لا تُدرج مفاتيح أو بيانات عملاء أو قيماً شخصية."
          />
        </label>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs text-muted-foreground">سيحسب الخادم SHA-256 ويخصص رقم الإصدار؛ لا تُخزن مسودات في المتصفح.</p>
          <button type="submit" disabled={busyAction !== null || draftContent.trim().length < 16} className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50">
            {busyAction === "create" ? "جارٍ الحفظ…" : "حفظ مسودة"}
          </button>
        </div>
      </form>

      {notice ? <p role="status" className="rounded-md border p-3 text-sm">{notice}</p> : null}
      {error ? <p role="alert" className="rounded-md border border-destructive/50 p-3 text-sm">{error}</p> : null}

      <div className="grid gap-4 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
        <section className="min-w-0 space-y-2">
          <div className="flex items-center justify-between gap-2">
            <h3 className="font-semibold">الإصدارات المحفوظة</h3>
            <span className="text-xs tabular-nums text-muted-foreground">{total} إصداراً</span>
          </div>
          {loading ? (
            <p role="status" aria-busy="true" className="rounded-lg border p-4 text-sm text-muted-foreground">جارٍ تحميل الإصدارات من قاعدة البيانات…</p>
          ) : versions.length === 0 ? (
            <p className="rounded-lg border p-4 text-sm text-muted-foreground">لا توجد إصدارات محفوظة لهذا الحساب. لم تُنشأ أو تُعرض أوامر تجريبية تلقائياً.</p>
          ) : (
            <ul className="space-y-2">
              {versions.map((version) => (
                <li key={version.id}>
                  <button
                    type="button"
                    onClick={() => { setSelectedId(version.id); setError(null); setNotice(null); }}
                    aria-pressed={selectedId === version.id}
                    className="w-full rounded-lg border p-3 text-right transition-colors hover:bg-muted/40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 aria-pressed:border-primary aria-pressed:bg-primary/5"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <strong dir="ltr" className="text-sm">{version.promptKey} · v{version.version}</strong>
                      <span className="rounded-full border px-2 py-0.5 text-xs">{statusLabels[version.status]}</span>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">{dateLabel(version.createdAt)}</p>
                    <code className="mt-2 block truncate text-left text-[11px] text-muted-foreground" dir="ltr">{version.contentSha256}</code>
                  </button>
                </li>
              ))}
            </ul>
          )}
          {total > versions.length ? <p className="text-xs text-muted-foreground">تُعرض أحدث 100 نسخة فقط؛ الإصدارات الأقدم لا تُحمّل في هذه الواجهة حالياً.</p> : null}
        </section>

        <section className="min-w-0 space-y-3">
          <h3 className="font-semibold">تفاصيل الإصدار ومسار الاعتماد</h3>
          {!selected ? (
            <p className="rounded-lg border p-4 text-sm text-muted-foreground">اختر إصداراً محفوظاً لعرض بياناته وإجراءاته المسموحة.</p>
          ) : (
            <>
              <div className="grid gap-2 sm:grid-cols-2">
                <div className="rounded-lg border p-3">
                  <p className="text-xs text-muted-foreground">الحالة الحالية</p>
                  <p className="mt-1 font-semibold">{statusLabels[selected.status]}</p>
                </div>
                <div className="rounded-lg border p-3">
                  <p className="text-xs text-muted-foreground">رقم الإصدار</p>
                  <p className="mt-1 font-semibold tabular-nums">{selected.version}</p>
                </div>
              </div>
              <dl className="grid gap-2 text-xs sm:grid-cols-2">
                <div><dt className="text-muted-foreground">أنشأه</dt><dd className="mt-1">مسؤول موثق في سجل الخادم</dd></div>
                <div><dt className="text-muted-foreground">تاريخ الإنشاء</dt><dd className="mt-1">{dateLabel(selected.createdAt)}</dd></div>
                <div><dt className="text-muted-foreground">المراجع</dt><dd className="mt-1">{selected.approvedByProfileId ? "مراجع موثق في سجل الخادم" : "لم يعتمد بعد"}</dd></div>
                <div><dt className="text-muted-foreground">تاريخ الاعتماد</dt><dd className="mt-1">{dateLabel(selected.approvedAt)}</dd></div>
              </dl>
              <div className="rounded-lg border p-3">
                <p className="text-xs text-muted-foreground">بصمة المحتوى SHA-256</p>
                <code className="mt-1 block break-all text-xs" dir="ltr">{selected.contentSha256}</code>
              </div>
              <div className="space-y-1 rounded-lg border p-3">
                <p className="text-sm font-semibold">محتوى الإصدار محمي</p>
                <p className="text-xs text-muted-foreground">النص المحفوظ لا يُعرض في واجهة الحوكمة لتجنب كشف تعليمات النظام الحساسة. تُستخدم البصمة للتحقق من ثبات النسخة، ويظل قرار الاعتماد مسجلاً مستقلاً.</p>
                <p className="text-xs text-muted-foreground">حجم المحتوى: {selected.content.length.toLocaleString("ar-YE")} محرفاً.</p>
              </div>
              {selected.decisionReason ? <p className="rounded-lg border p-3 text-sm">سبب القرار: {selected.decisionReason}</p> : null}

              <section className="space-y-2 rounded-lg border p-3">
                <h4 className="font-semibold">مقارنة الإصدارات</h4>
                {previousVersion ? (
                  <div className="grid gap-3 lg:grid-cols-2">
                    <article className="min-w-0 rounded-md bg-muted/30 p-3">
                      <p className="text-xs text-muted-foreground">الإصدار السابق · v{previousVersion.version}</p>
                      <p className="mt-2 text-xs">المحتوى محفوظ ومحجوب من العرض.</p>
                      <code className="mt-2 block break-all text-[11px]" dir="ltr">{previousVersion.contentSha256}</code>
                      <p className="mt-1 text-xs text-muted-foreground">الحجم: {previousVersion.content.length.toLocaleString("ar-YE")} محرفاً</p>
                    </article>
                    <article className="min-w-0 rounded-md bg-muted/30 p-3">
                      <p className="text-xs text-muted-foreground">الإصدار المحدد · v{selected.version}</p>
                      <p className="mt-2 text-xs">المحتوى محفوظ ومحجوب من العرض.</p>
                      <code className="mt-2 block break-all text-[11px]" dir="ltr">{selected.contentSha256}</code>
                      <p className="mt-1 text-xs text-muted-foreground">الحجم: {selected.content.length.toLocaleString("ar-YE")} محرفاً</p>
                    </article>
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    {selected.version === 1 ? "هذا أول إصدار محفوظ لهذا المفتاح." : "الإصدار السابق خارج أحدث 100 نسخة محمّلة؛ لم تُفترض مقارنة غير متاحة."}
                  </p>
                )}
              </section>

              <section className="space-y-2 rounded-lg border p-3">
                <h4 className="font-semibold">سجل التدقيق append-only</h4>
                {auditLoading ? (
                  <p role="status" aria-busy="true" className="text-xs text-muted-foreground">جارٍ تحميل أحداث الإصدار من الخادم…</p>
                ) : auditEvents.length === 0 ? (
                  <p className="text-xs text-muted-foreground">لا توجد أحداث تدقيق قابلة للعرض لهذا الإصدار.</p>
                ) : (
                  <ol className="space-y-2">
                    {auditEvents.map((event) => (
                      <li key={event.id} className="rounded-md bg-muted/30 p-2">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <strong className="text-sm">{eventLabels[event.action]}</strong>
                          <time className="text-xs text-muted-foreground">{dateLabel(event.occurredAt)}</time>
                        </div>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {event.previousStatus ? statusLabels[event.previousStatus] + " ← " : ""}
                          {statusLabels[event.nextStatus]}
                        </p>
                        <p className="mt-1 text-xs text-muted-foreground">المنفذ: مسؤول موثق لدى الخادم</p>
                        {event.reason ? <p className="mt-1 text-xs">{event.reason}</p> : null}
                      </li>
                    ))}
                  </ol>
                )}
              </section>

              <label className="block space-y-1 text-sm">
                <span className="font-medium">سبب المراجعة أو التفعيل أو التعطيل أو الأرشفة</span>
                <input
                  className="w-full rounded-md border bg-background px-3 py-2"
                  value={reason}
                  onChange={(event) => setReason(event.target.value)}
                  maxLength={500}
                  placeholder="سبب واضح سيحفظ ضمن سجل التدقيق"
                />
              </label>

              <div className="flex flex-wrap gap-2">
                {canSubmit ? (
                  <button type="button" disabled={busyAction !== null} onClick={() => void perform("submit", "أُرسلت النسخة للمراجعة.", () => submitAiPromptVersion(selected.id, commandId()))} className="inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm disabled:opacity-50">
                    <Send size={15} aria-hidden="true" /> إرسال للمراجعة
                  </button>
                ) : null}
                {selected.status === "PENDING_APPROVAL" ? (
                  <>
                    <button type="button" disabled={!canReview || busyAction !== null || reason.trim().length < 3} onClick={() => void perform("approve", "اعتمد المراجع المستقل النسخة.", () => approveAiPromptVersion(selected.id, commandId(), reason))} className="inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm disabled:opacity-50">
                      <Check size={15} aria-hidden="true" /> اعتماد
                    </button>
                    <button type="button" disabled={!canReview || busyAction !== null || reason.trim().length < 3} onClick={() => void perform("reject", "رُفضت النسخة مع حفظ السبب.", () => rejectAiPromptVersion(selected.id, commandId(), reason))} className="inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm disabled:opacity-50">
                      <XCircle size={15} aria-hidden="true" /> رفض
                    </button>
                  </>
                ) : null}
                {selected.status === "APPROVED" ? (
                  <button type="button" disabled={!canActivate || busyAction !== null || reason.trim().length < 3} onClick={() => void perform("activate", "فُعّلت النسخة بعد فصل المنشئ والمراجع والمفعّل.", () => activateAiPromptVersion(selected.id, commandId(), reason))} className="inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm disabled:opacity-50">
                    <ShieldCheck size={15} aria-hidden="true" /> تفعيل النسخة
                  </button>
                ) : null}

                {canDisable ? (
                  <button type="button" disabled={busyAction !== null || reason.trim().length < 3}
                    onClick={() => void perform("disable", "عُطلت النسخة النشطة وسُجل سبب الإيقاف.", () => disableAiPromptVersion(selected.id, commandId(), reason))}
                    className="inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm disabled:opacity-50">
                    <PowerOff size={15} aria-hidden="true" /> تعطيل النسخة النشطة
                  </button>
                ) : null}
                {canRetire ? (
                  <button type="button" disabled={busyAction !== null || reason.trim().length < 3} onClick={() => void perform("retire", "أُرشفت النسخة مع حفظ سبب القرار.", () => retireAiPromptVersion(selected.id, commandId(), reason))} className="inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm disabled:opacity-50">
                    <Archive size={15} aria-hidden="true" /> أرشفة
                  </button>
                ) : null}
              </div>
              {selected.status === "PENDING_APPROVAL" && isOwnDraft ? (
                <p className="text-xs text-muted-foreground">أنت منشئ هذه النسخة؛ لا يمكنك اعتمادها أو رفضها.</p>
              ) : null}
              {selected.status === "APPROVED" && (isOwnDraft || isOwnApproval) ? (
                <p className="text-xs text-muted-foreground">يلزم مسؤول ثالث غير المنشئ والمراجع لتفعيل هذه النسخة.</p>
              ) : null}
              {selected.status === "DISABLED" ? (
                <p className="text-xs text-muted-foreground">هذه النسخة معطلة نهائياً لهذا الإصدار. لا يختارها الموجّه النشط؛ تتطلب العودة إلى الاستخدام إنشاء إصدار جديد ومراجعته واعتماده وتفعيله من جديد.</p>
              ) : null}
            </>
          )}
        </section>
      </div>

      <footer className="flex items-start gap-2 border-t pt-3 text-xs leading-6 text-muted-foreground">
        <Clock3 size={15} aria-hidden="true" className="mt-1 shrink-0" />
        <p>التغييرات تمر عبر RPC خادمية ومعاملة PostgreSQL واحدة. لا تُكتب النسخ أو أحداث التدقيق من المتصفح مباشرة، ولا تُفعّل نسخة إلا بعد اعتماد مستقل ومشغّل ثالث. لا يوجد أمر افتراضي مزروع في قاعدة البيانات؛ يستمر المساعد على التعليمات الآمنة المضمنة حتى اعتماد نسخة فعلية.</p>
      </footer>
    </section>
  );
}