import { fetchImportJobsPage, fetchOnyxSnapshots, fetchPricingRules } from "@/lib/api";
import { listMyAsyncExportJobs } from "@/lib/async-export-jobs";
import { fetchAiGatewayBudget } from "@/lib/intelligence/ai-gateway-operations-client";

export type EngineSourceStatus = "READABLE" | "READABLE_EMPTY" | "DENIED" | "UNAVAILABLE" | "INVALID";

export interface AdminEngineObservation {
  id: "import" | "pricing" | "ai" | "onyx" | "export";
  title: string;
  source: string;
  sourceStatus: EngineSourceStatus;
  runtimeStatus: "UNKNOWN";
  checkedAt: string;
  latencyMs: number | null;
  recordCount: number | null;
  latestRecordAt: string | null;
  summary: string;
  boundary: string;
}

export interface AdminEngineObservationSnapshot {
  checkedAt: string;
  items: AdminEngineObservation[];
}

type ReadSummary = {
  recordCount: number | null;
  latestRecordAt?: string | null;
  summary: string;
};

class ProbeReadError extends Error {
  constructor(readonly status: "DENIED" | "INVALID" | "UNAVAILABLE") {
    super(status);
  }
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function failureStatus(error: unknown): "DENIED" | "INVALID" | "UNAVAILABLE" {
  if (error instanceof ProbeReadError) return error.status;
  const code = asRecord(error)?.code;
  if (code === "42501" || code === "PGRST301") return "DENIED";
  if (code === "PGRST202" || code === "42883") return "UNAVAILABLE";
  return "UNAVAILABLE";
}

function latestTimestamp(rows: readonly unknown[]): string | null {
  const timestamps = rows.flatMap((value) => {
    const row = asRecord(value);
    const candidate = row?.updated_at ?? row?.created_at;
    return typeof candidate === "string" && Number.isFinite(Date.parse(candidate)) ? [candidate] : [];
  });
  return timestamps.sort((left, right) => Date.parse(right) - Date.parse(left))[0] ?? null;
}

function statusCounts(rows: readonly unknown[]): string {
  const counts = new Map<string, number>();
  for (const value of rows) {
    const status = asRecord(value)?.status;
    if (typeof status !== "string" || !/^[a-z_]{2,40}$/.test(status)) continue;
    counts.set(status, (counts.get(status) ?? 0) + 1);
  }
  if (counts.size === 0) return "لا توجد حالات دفعات في الصفحة المقروءة.";
  return [...counts.entries()].sort(([a], [b]) => a.localeCompare(b))
    .map(([status, count]) => status + ": " + String(count)).join(" · ");
}

async function readSource(
  definition: Pick<AdminEngineObservation, "id" | "title" | "source" | "boundary">,
  read: () => Promise<ReadSummary>,
): Promise<AdminEngineObservation> {
  const startedAt = Date.now();
  try {
    const result = await read();
    const checkedAt = new Date().toISOString();
    return {
      ...definition,
      sourceStatus: result.recordCount === 0 ? "READABLE_EMPTY" : "READABLE",
      runtimeStatus: "UNKNOWN",
      checkedAt,
      latencyMs: Math.max(0, Date.now() - startedAt),
      recordCount: result.recordCount,
      latestRecordAt: result.latestRecordAt ?? null,
      summary: result.summary,
    };
  } catch (error) {
    const checkedAt = new Date().toISOString();
    const status = failureStatus(error);
    return {
      ...definition,
      sourceStatus: status,
      runtimeStatus: "UNKNOWN",
      checkedAt,
      latencyMs: Math.max(0, Date.now() - startedAt),
      recordCount: null,
      latestRecordAt: null,
      summary: status === "DENIED"
        ? "رفض المصدر القراءة وفق صلاحية الجلسة الحالية."
        : status === "INVALID"
          ? "استجابة المصدر لا تطابق عقد القراءة المتوقع؛ لم تُقبل كدليل."
          : "تعذرت قراءة المصدر الحالي؛ لم تُستخدم بيانات بديلة أو مخزنة.",
    };
  }
}

/**
 * Read-only evidence from existing tenant-scoped sources. A successful read proves
 * only that source was readable; it never proves that an engine executed successfully.
 */
export async function readAdminEngineObservations(): Promise<AdminEngineObservationSnapshot> {
  const definitions = {
    import: {
      id: "import",
      title: "محرك الاستيراد",
      source: "public.import_jobs · fetchImportJobsPage",
      boundary: "حالة الدفعات المحفوظة فقط؛ لا ينفذ هذا الفحص عملية استيراد جديدة.",
    },
    pricing: {
      id: "pricing",
      title: "محرك التسعير",
      source: "public.pricing_rules · fetchPricingRules",
      boundary: "قراءة قواعد المؤسسة فقط؛ لا ينفذ هذا الفحص احتساب سعر أو اعتماد قاعدة.",
    },
    ai: {
      id: "ai",
      title: "بوابة الذكاء الاصطناعي",
      source: "public.get_ai_gateway_budget",
      boundary: "قراءة ملخص الميزانية فقط؛ لا يتصل بمزود خارجي ولا يثبت نجاح طلب نموذج.",
    },
    onyx: {
      id: "onyx",
      title: "مصدر لقطات Onyx",
      source: "public.onyx_snapshots · fetchOnyxSnapshots",
      boundary: "قراءة اللقطات المخزنة الجاهزة فقط؛ لا يوجد اتصال حي بنظام Onyx.",
    },
    export: {
      id: "export",
      title: "محرك التصدير",
      source: "public.list_my_async_export_jobs",
      boundary: "حالات طلبات التصدير المرئية للحساب الحالي فقط؛ لا يستدعي العامل ولا يثبت توافره.",
    },
  } as const;

  const [importResult, pricingResult, aiResult, onyxResult, exportResult] = await Promise.all([
    readSource(definitions.import, async () => {
      const page = await fetchImportJobsPage(1, 10);
      return {
        recordCount: page.totalCount,
        latestRecordAt: latestTimestamp(page.rows),
        summary: "إجمالي دفعات المؤسسة المسموح بقراءتها: " + String(page.totalCount) +
          ". الحالات في أحدث صفحة: " + statusCounts(page.rows),
      };
    }),
    readSource(definitions.pricing, async () => {
      const rows = await fetchPricingRules();
      return {
        recordCount: rows.length,
        latestRecordAt: latestTimestamp(rows),
        summary: rows.length
          ? "قواعد التسعير المقروءة من المؤسسة الحالية: " + String(rows.length) + "."
          : "مصدر قواعد التسعير قابل للقراءة، ولا توجد قواعد محفوظة.",
      };
    }),
    readSource(definitions.ai, async () => {
      const result = await fetchAiGatewayBudget();
      if (!result.ok) {
        throw new ProbeReadError(
          result.status === "DENIED" ? "DENIED" :
          result.status === "ERROR" ? "INVALID" : "UNAVAILABLE",
        );
      }
      return {
        recordCount: null,
        latestRecordAt: result.readAt,
        summary: "تمت قراءة ملخص ميزانية بوابة الذكاء من RPC الإداري.",
      };
    }),
    readSource(definitions.onyx, async () => {
      const rows = await fetchOnyxSnapshots();
      return {
        recordCount: rows.length,
        latestRecordAt: latestTimestamp(rows),
        summary: rows.length
          ? "اللقطات الجاهزة المخزنة ضمن أحدث 50 لقطة مقروءة: " + String(rows.length) + "."
          : "مصدر اللقطات المخزنة قابل للقراءة، ولا توجد لقطات جاهزة ضمن آخر 50 سجلاً.",
      };
    }),
    readSource(definitions.export, async () => {
      const rows = await listMyAsyncExportJobs(20);
      return {
        recordCount: rows.length,
        latestRecordAt: latestTimestamp(rows),
        summary: "طلبات التصدير المقروءة للحساب الحالي ضمن أحدث 20 طلباً: " + String(rows.length) +
          ". الحالات: " + statusCounts(rows),
      };
    }),
  ]);

  return {
    checkedAt: new Date().toISOString(),
    items: [importResult, pricingResult, aiResult, onyxResult, exportResult],
  };
}
