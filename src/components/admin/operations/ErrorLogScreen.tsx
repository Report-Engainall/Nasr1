import { AlertTriangle, Clock3, FileWarning, ShieldCheck } from "lucide-react";
import { REFERENCE_SOURCE_READINESS } from "@/lib/reference-model/observability/source-readiness";

export function ErrorLogScreen() {
  const source = REFERENCE_SOURCE_READINESS.find((item) => item.id === "error_log");

  return (
    <section dir="rtl" aria-label="سجل الأخطاء" className="space-y-4">
      <header className="flex items-start gap-3">
        <AlertTriangle size={22} className="mt-1 text-muted-foreground" aria-hidden="true" />
        <div>
          <h2 className="text-lg font-semibold">سجل الأخطاء</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            حالة مصادر التقاط الأخطاء وحدود إمكان عرض السجل، من دون كشف تفاصيل خام.
          </p>
        </div>
      </header>

      <article className="rounded-xl border p-4">
        <div className="flex flex-wrap items-center gap-2">
          <FileWarning size={18} aria-hidden="true" />
          <strong>لا يوجد سجل أخطاء دائم قابل للقراءة</strong>
          <span className="rounded-md border px-2 py-1 text-xs">{source?.status ?? "BLOCKED_NO_PERSISTENT_SOURCE"}</span>
        </div>
        <p className="mt-3 text-sm leading-6 text-muted-foreground">
          تحتفظ <code dir="ltr">src/lib/error-capture.ts</code> بآخر خطأ واحد في الذاكرة لمدة تصل إلى 5 ثوانٍ ثم يُستهلك أو تنتهي صلاحيته. لا يقدم المصدر قائمة سجلات أو معرف خطأ ثابتاً أو تصنيفاً أو حالة إقرار.
        </p>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          ترسل <code dir="ltr">src/lib/runtime-error-reporting.ts</code> ملخصاً منقحاً إلى <code dir="ltr">console.error</code> فقط، ولا تحفظ تاريخاً دائماً أو توفر API للقراءة.
        </p>
      </article>

      <div className="grid gap-3 sm:grid-cols-2">
        <article className="rounded-lg border p-3">
          <div className="flex items-center gap-2 font-semibold"><Clock3 size={17} aria-hidden="true" /> الالتقاط المؤقت</div>
          <p className="mt-2 text-sm text-muted-foreground">عنصر واحد في الذاكرة · TTL خمسة ثوانٍ · قراءة استهلاكية خام غير مناسبة لواجهة السجل.</p>
          <p className="mt-2 text-xs text-muted-foreground">المصدر: error-capture.ts</p>
        </article>
        <article className="rounded-lg border p-3">
          <div className="flex items-center gap-2 font-semibold"><ShieldCheck size={17} aria-hidden="true" /> التقرير المنقح</div>
          <p className="mt-2 text-sm text-muted-foreground">اسم النوع وحالة HTTP والحدّث عند وجودها؛ لا رسالة خام ولا stack trace ولا URL أو token أو بيانات عميل.</p>
          <p className="mt-2 text-xs text-muted-foreground">المصدر: runtime-error-reporting.ts</p>
        </article>
      </div>

      <div className="rounded-lg border border-dashed p-4 text-sm" role="status">
        لا توجد سجلات يمكن عرضها حالياً. لن نُنشئ معرفات أو أوقاتاً أو تصنيفات أو حالات معالجة افتراضية، ولن نستدعي <code dir="ltr">consumeLastCapturedError()</code> من واجهة المستخدم لأنه يعيد خطأً خاماً واحداً ويستهلكه.
      </div>
      <p className="text-xs leading-6 text-muted-foreground">
        إغلاق هذه الفجوة يحتاج لاحقاً إلى مصدر دائم خادمي، مقيد بالمؤسسة والدور، مع مخطط بيانات منقح ومعرفات ثابتة وسياسة احتفاظ وإقرار حقيقية. هذا التنفيذ لا يضيف تخزيناً أو ترحيلاً.
      </p>
    </section>
  );
}
