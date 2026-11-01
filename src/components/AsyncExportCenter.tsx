import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { Download, FileSpreadsheet, RefreshCw, XCircle } from "lucide-react";
import {
  cancelMyAsyncExportJob, getMyAsyncExportDownload, listMyAsyncExportJobs,
  requestAsyncOrdersCsvExport, triggerAsyncExportWorker, type AsyncExportJobState,
} from "@/lib/async-export-jobs";
import { exportJobIdempotencyKey } from "@/lib/async-export-csv";

const labels: Record<AsyncExportJobState["status"], string> = {
  queued: "في قائمة الانتظار", processing: "جارٍ التجهيز", retry: "إعادة المحاولة",
  ready: "جاهز للتنزيل", failed: "فشل نهائي", cancelled: "ملغى", expired: "انتهت الصلاحية",
};
const styles: Record<AsyncExportJobState["status"], string> = {
  queued: "bg-sky-50 text-sky-800", processing: "bg-amber-50 text-amber-800",
  retry: "bg-amber-50 text-amber-800", ready: "bg-emerald-50 text-emerald-800",
  failed: "bg-rose-50 text-rose-800", cancelled: "bg-muted text-muted-foreground", expired: "bg-rose-50 text-rose-800",
};
type Notice = { kind: "success" | "error" | "info"; text: string };
const time = (value: string | null) => {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleString("ar-YE", { dateStyle: "medium", timeStyle: "short" });
};
const size = (bytes: number | null) => bytes === null ? "—" : bytes < 1024 ? bytes + " بايت" : bytes < 1048576 ? (bytes / 1024).toFixed(1) + " كيلوبايت" : (bytes / 1048576).toFixed(2) + " ميجابايت";

type AsyncExportJobRowProps = {
  job: AsyncExportJobState;
  busy: string | null;
  onDownload: (job: AsyncExportJobState) => void;
  onRetry: (job: AsyncExportJobState) => void;
  onCancel: (job: AsyncExportJobState) => void;
};

function AsyncExportJobActions({ job, busy, onDownload, onRetry, onCancel }: AsyncExportJobRowProps) {
  const isBusy = busy === job.job_id;
  return (
    <div className="flex flex-wrap gap-2">
      {job.status === "ready" && <button type="button" onClick={() => onDownload(job)} disabled={isBusy} className="inline-flex items-center gap-1 rounded-md bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground disabled:opacity-60"><Download size={14}/> تنزيل</button>}
      {["queued", "retry"].includes(job.status) && <button type="button" onClick={() => onRetry(job)} disabled={isBusy} className="inline-flex items-center gap-1 rounded-md border border-border px-3 py-2 text-xs font-semibold disabled:opacity-60"><RefreshCw size={14}/> تنبيه العامل</button>}
      {["queued", "retry"].includes(job.status) && <button type="button" onClick={() => onCancel(job)} disabled={isBusy} className="inline-flex items-center gap-1 rounded-md border border-rose-200 px-3 py-2 text-xs text-rose-700 disabled:opacity-60"><XCircle size={14}/> إلغاء</button>}
    </div>
  );
}

function AsyncExportJobRow({ job, busy, onDownload, onRetry, onCancel }: AsyncExportJobRowProps) {
  return (
    <tr>
      <td className="px-4 py-3">
        <span className={"inline-flex whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold " + styles[job.status]}>{labels[job.status]}</span>
        {job.error_message && <p className="mt-1 max-w-64 text-xs text-rose-700">{job.error_message}</p>}
      </td>
      <td className="px-4 py-3 tabular-nums">{job.row_count ?? "—"}</td>
      <td className="px-4 py-3 tabular-nums">{size(job.byte_size)}</td>
      <td className="px-4 py-3 whitespace-nowrap text-muted-foreground">{time(job.created_at)}</td>
      <td className="px-4 py-3 whitespace-nowrap text-muted-foreground">{time(job.expires_at)}</td>
      <td className="px-4 py-3">
        <AsyncExportJobActions job={job} busy={busy} onDownload={onDownload} onRetry={onRetry} onCancel={onCancel} />
      </td>
    </tr>
  );
}


function AsyncExportRequestForm({ from, to, submitting, onFromChange, onToChange, onSubmit }: {
  from: string; to: string; submitting: boolean;
  onFromChange: (value: string) => void; onToChange: (value: string) => void; onSubmit: () => void;
}) {
  return (
    <AsyncExportRequestForm
      from={from}
      to={to}
      submitting={submitting}
      onFromChange={(value) => { setFrom(value); keyRef.current = null; }}
      onToChange={(value) => { setTo(value); keyRef.current = null; }}
      onSubmit={() => void createRequest()}
    />
    <AsyncExportJobsTable jobs={jobs} busy={busy} loading={loading} loadError={loadError} onDownload={download} onRetry={retry} onCancel={cancel} />

      <div className="flex items-center justify-between gap-3"><div><h2 className="text-lg font-bold">سجل طلباتي</h2><p className="text-xs text-muted-foreground">تحديث تلقائي كل 5 ثوانٍ أثناء المعالجة.</p></div><span className="rounded-full bg-muted px-3 py-1 text-sm tabular-nums">{jobs.length} طلب</span></div>
      <div className="overflow-x-auto rounded-xl border border-border bg-card"><table className="min-w-[760px] w-full text-right text-sm">
        <thead className="bg-muted/60 text-xs text-muted-foreground"><tr><th scope="col" className="px-4 py-3">الحالة</th><th scope="col" className="px-4 py-3">عدد البنود</th><th scope="col" className="px-4 py-3">الحجم</th><th scope="col" className="px-4 py-3">تاريخ الطلب</th><th scope="col" className="px-4 py-3">الصلاحية</th><th scope="col" className="px-4 py-3">الإجراء</th></tr></thead>
        <tbody className="divide-y divide-border">
          {jobs.map((job) => (
            <AsyncExportJobRow
              key={job.job_id}
              job={job}
              busy={busy}
              onDownload={download}
              onRetry={retry}
              onCancel={cancel}
            />
          ))}
          {jobs.length === 0 && (
            <tr>
              <td colSpan={6} className="px-4 py-12 text-center" role={loadError ? "alert" : "status"}>
                {loading ? "جارٍ تحميل السجل…" : loadError ? "تعذر تأكيد حالة سجل التصدير. اضغط «تحديث السجل» لإعادة المحاولة؛ لم تُعرض بيانات قديمة." : "لا توجد طلبات تصدير حتى الآن"}
              </td>
            </tr>
          )}
        </tbody>
      </table></div>
      <p className="text-xs leading-5 text-muted-foreground">تُنظَّف الملفات بعد انتهاء صلاحيتها. رابط التنزيل موقّع لمدة 60 ثانية فقط ولا يفتح الوصول العام.</p>
    </section>
  </main>;
}
