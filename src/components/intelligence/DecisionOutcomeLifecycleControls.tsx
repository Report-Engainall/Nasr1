import { useState } from "react";
import {
  commandDecisionOutcome,
  type DecisionOutcomeEventType,
  type DecisionOutcomeState,
} from "@/lib/intelligence/decision-outcome-client";

export interface DecisionOutcomeLifecycleControlsProps {
  outcomeId: string;
  state: DecisionOutcomeState;
  version: number;
  ownerProfileId: string | null;
  onChanged?: () => void;
}

interface PendingCommand {
  eventType: DecisionOutcomeEventType;
  expectedVersion: number;
  reason: string;
  eventId: string;
  idempotencyKey: string;
}

const labels: Partial<Record<DecisionOutcomeEventType, string>> = {
  SUBMIT_FOR_REVIEW: "إرسال للمراجعة",
  APPROVE: "اعتماد القرار",
  REJECT: "رفض القرار",
  ASSIGN: "تثبيت المسؤول المعتمد",
  START_EXECUTION: "بدء التنفيذ",
  COMPLETE_EXECUTION: "تسجيل اكتمال التنفيذ",
};

function allowedEvents(state: DecisionOutcomeState, ownerProfileId: string | null): DecisionOutcomeEventType[] {
  if (state === "PROPOSED") return ["SUBMIT_FOR_REVIEW"];
  if (state === "IN_REVIEW") return ["APPROVE", "REJECT"];
  if (state === "APPROVED") return ownerProfileId ? ["ASSIGN"] : [];
  if (state === "ASSIGNED") return ["START_EXECUTION"];
  if (state === "EXECUTING") return ["COMPLETE_EXECUTION"];
  return [];
}

export function DecisionOutcomeLifecycleControls({
  outcomeId,
  state,
  version,
  ownerProfileId,
  onChanged,
}: DecisionOutcomeLifecycleControlsProps) {
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<PendingCommand | null>(null);
  const [feedback, setFeedback] = useState("");
  const [feedbackError, setFeedbackError] = useState(false);
  const events = allowedEvents(state, ownerProfileId);

  async function submit(eventType: DecisionOutcomeEventType) {
    if (busy) return;
    const normalizedReason = reason.trim();
    if (normalizedReason.length < 3) {
      setFeedback("اكتب سبباً واضحاً من ثلاثة أحرف على الأقل قبل تغيير حالة القرار.");
      setFeedbackError(true);
      return;
    }
    if (pending && (pending.eventType !== eventType ||
        pending.expectedVersion !== version || pending.reason !== normalizedReason)) {
      setFeedback("هناك أمر سابق لم تُحسم استجابته. أعد المحاولة بنفس الإجراء والسبب أولاً.");
      setFeedbackError(true);
      return;
    }

    const command = pending ?? {
      eventType,
      expectedVersion: version,
      reason: normalizedReason,
      eventId: crypto.randomUUID(),
      idempotencyKey: crypto.randomUUID(),
    };
    setPending(command);
    setBusy(true);
    setFeedback("");
    setFeedbackError(false);
    try {
      const result = await commandDecisionOutcome({
        outcomeId,
        expectedVersion: command.expectedVersion,
        eventType: command.eventType,
        reason: command.reason,
        ...(command.eventType === "ASSIGN" && ownerProfileId ? { ownerProfileId } : {}),
        eventId: command.eventId,
        idempotencyKey: command.idempotencyKey,
      });
      if (result.ok) {
        setPending(null);
        setReason("");
        setFeedback(result.duplicate
          ? "أكد الخادم أن الأمر السابق محفوظ بالفعل؛ يجري تحديث السجل."
          : "أكد الخادم حفظ انتقال القرار؛ يجري تحديث السجل.");
        setFeedbackError(false);
        onChanged?.();
      } else {
        setFeedback(result.message);
        setFeedbackError(true);
        if (result.status !== "UNAVAILABLE") setPending(null);
      }
    } catch {
      setFeedback("تعذر تأكيد استجابة الخادم. أعد الأمر نفسه دون تغيير السبب لتفادي تكرار الأثر.");
      setFeedbackError(true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section dir="rtl" className="space-y-2 rounded-lg border p-3" aria-label="دورة اعتماد القرار وتنفيذه">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h4 className="text-sm font-semibold">دورة القرار</h4>
        <span className="text-xs text-muted-foreground">إصدار الخادم: {version}</span>
      </div>
      {events.length > 0 ? <>
        <label className="block space-y-1 text-sm">
          سبب الإجراء وسجل القرار
          <textarea
            className="w-full rounded-lg border bg-background p-2"
            rows={2}
            maxLength={2000}
            value={reason}
            disabled={busy || pending !== null}
            onChange={event => setReason(event.target.value)}
            placeholder="اكتب مبرر المراجعة أو الاعتماد أو الرفض أو التنفيذ..."
          />
        </label>
        <div className="flex flex-wrap gap-2">
          {events.map(eventType => (
            <button
              key={eventType}
              type="button"
              className="rounded-lg border px-3 py-2 text-sm font-medium disabled:opacity-50"
              disabled={busy || (pending !== null && pending.eventType !== eventType)}
              onClick={() => void submit(eventType)}
            >
              {busy && pending?.eventType === eventType
                ? "جارٍ الإرسال..."
                : pending?.eventType === eventType
                  ? "إعادة المحاولة بنفس الأمر"
                  : labels[eventType]}
            </button>
          ))}
        </div>
        {pending ? <p className="text-xs text-muted-foreground">حُفظ مفتاح الأمر لهذه المحاولة؛ لا تغيّر السبب أو الإجراء حتى يؤكد الخادم النتيجة.</p> : null}
      </> : state === "APPROVED" && !ownerProfileId ? (
        <p className="text-sm text-muted-foreground">لا يمكن تثبيت الإسناد: لم يرجع المصدر معرف مسؤول موثوقاً لهذا القرار.</p>
      ) : state === "EXECUTED" ? (
        <p className="text-sm text-muted-foreground">اكتمل التنفيذ بانتظار قياس فعلي. لا يتاح تسجيل القياس من هذه الواجهة حتى يصل إثبات مصدر مكتمل ومتوافق مع الفترة والمعادلة والعملة/وحدة القياس.</p>
      ) : state === "MEASURED" ? (
        <p className="text-sm text-muted-foreground">اكتملت دورة القرار والقياس مسجل من مصدره. أي تصحيح لاحق يجب أن يبقى إلحاقياً في دفتر الذاكرة.</p>
      ) : state === "REJECTED" ? (
        <p className="text-sm text-muted-foreground">أُغلق القرار بالرفض؛ لا تتاح إعادة تشغيله أو تجاوز سجل الرفض من هذه البطاقة.</p>
      ) : (
        <p className="text-sm text-muted-foreground">لا يوجد انتقال متاح لهذا الإصدار من القرار.</p>
      )}
      {feedback ? <p role="status" aria-live="polite" className={feedbackError ? "text-sm text-destructive" : "text-sm text-green-700"}>{feedback}</p> : null}
      <p className="text-xs text-muted-foreground">هذه الأوامر تسجل دورة القرار فقط؛ لا ترحّل قيوداً ولا تصدر مدفوعات ولا تعدّل أسعاراً أو مخزوناً. صلاحية التنفيذ والتحقق النهائي يفرضان من الخادم.</p>
    </section>
  );
}
