import { supabase } from "@/lib/supabase";
import {
  validateOrdersExportFilters,
  type OrdersExportFilters,
} from "@/lib/async-export-csv";

export type AsyncExportJobState = {
  job_id: string;
  export_type: "orders_csv";
  status: "queued" | "processing" | "retry" | "ready" | "failed" | "cancelled" | "expired";
  row_count: number | null;
  file_name: string | null;
  byte_size: number | null;
  error_code: string | null;
  error_message: string | null;
  created_at: string;
  completed_at: string | null;
  expires_at: string | null;
};

function uuid(value: unknown): value is string {
  return typeof value === "string"
    && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

export async function requestAsyncOrdersCsvExport(
  filtersInput: unknown,
  idempotencyKey: string,
): Promise<{ jobId: string; status: string; alreadyRequested: boolean; workerAccepted: boolean }> {
  const filters: OrdersExportFilters = validateOrdersExportFilters(filtersInput);
  if (!/^[A-Za-z0-9:_-]{8,120}$/.test(idempotencyKey)) {
    throw new Error("مفتاح طلب التصدير غير صالح.");
  }
  const { data, error } = await supabase.rpc("request_async_export_job", {
    p_export_type: "orders_csv",
    p_filters: filters,
    p_idempotency_key: idempotencyKey,
  });
  if (error || !data || typeof data !== "object" || !uuid((data as Record<string, unknown>).job_id)) {
    throw new Error("تعذر إنشاء طلب التصدير. تحقق من صلاحيات المستخدم وفترة الطلب.");
  }
  const result = data as Record<string, unknown>;
  let workerAccepted = false;
  const kicked = await supabase.functions.invoke("async-export-worker", {
    body: { job_id: result.job_id },
  });
  // The queued job is durable even if the worker endpoint is not yet deployed.
  // Do not throw away its ID; the user can safely retry the same idempotency key.
  workerAccepted = !kicked.error && Boolean(kicked.data && typeof kicked.data === "object"
    && (kicked.data as Record<string, unknown>).accepted === true);
  return {
    jobId: result.job_id as string,
    status: typeof result.status === "string" ? result.status : "queued",
    alreadyRequested: result.already_requested === true,
    workerAccepted,
  };
}

export async function listMyAsyncExportJobs(limit = 20): Promise<AsyncExportJobState[]> {
  if (!Number.isInteger(limit) || limit < 1 || limit > 50) {
    throw new Error("حجم سجل التصدير يجب أن يكون بين 1 و50.");
  }
  const { data, error } = await supabase.rpc("list_my_async_export_jobs", { p_limit: limit });
  if (error || !Array.isArray(data)) throw new Error("تعذر قراءة سجل طلبات التصدير.");
  return data.filter((value): value is AsyncExportJobState => {
    if (!value || typeof value !== "object") return false;
    const row = value as Record<string, unknown>;
    return uuid(row.job_id) && row.export_type === "orders_csv"
      && typeof row.status === "string" && typeof row.created_at === "string";
  });
}

export async function cancelMyAsyncExportJob(jobId: string): Promise<{ status: string; cancelled: boolean }> {
  if (!uuid(jobId)) throw new Error("معرّف طلب التصدير غير صالح.");
  const { data, error } = await supabase.rpc("cancel_my_async_export_job", { p_job_id: jobId });
  if (error || !data || typeof data !== "object") throw new Error("تعذر إلغاء طلب التصدير.");
  const result = data as Record<string, unknown>;
  return {
    status: typeof result.status === "string" ? result.status : "unknown",
    cancelled: result.cancelled === true,
  };
}

export async function getMyAsyncExportDownload(jobId: string): Promise<{
  url: string;
  expiresAt: string;
  fileName: string;
}> {
  if (!uuid(jobId)) throw new Error("معرّف طلب التصدير غير صالح.");
  const { data, error } = await supabase.functions.invoke("async-export-download", {
    body: { job_id: jobId },
  });
  if (error || !data || typeof data !== "object") {
    throw new Error("رابط التنزيل غير متاح؛ يجب أن يكون التصدير جاهزًا وغير منتهي الصلاحية.");
  }
  const result = data as Record<string, unknown>;
  if (typeof result.download_url !== "string" || typeof result.expires_at !== "string"
      || typeof result.file_name !== "string") {
    throw new Error("استجابة رابط التنزيل غير صالحة.");
  }
  return { url: result.download_url, expiresAt: result.expires_at, fileName: result.file_name };
}
