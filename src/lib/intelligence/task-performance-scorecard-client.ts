import { supabase } from "@/lib/supabase";
import {
  parseTaskPerformanceScorecard,
  type TaskPerformanceScorecard,
} from "./task-performance-scorecard";

export type TaskPerformanceScorecardFetchResult =
  | { ok: true; scorecard: TaskPerformanceScorecard }
  | { ok: false; status: "DENIED" | "UNAVAILABLE" | "ERROR"; message: string };

function mapFailure(error: unknown): TaskPerformanceScorecardFetchResult {
  const failure = error as { code?: string; message?: string };
  if (failure?.code === "42501" || failure?.code === "28000" ||
      failure?.code === "PGRST301") {
    return {
      ok: false,
      status: "DENIED",
      message: "لا تملك صلاحية قراءة بطاقة أداء المهام ضمن نطاق أدوارك.",
    };
  }
  if (failure?.code === "PGRST202" || failure?.code === "42883" ||
      /function .* does not exist|could not find the function/i.test(failure?.message ?? "")) {
    return {
      ok: false,
      status: "UNAVAILABLE",
      message: "بطاقة الأداء غير متاحة قبل تطبيق ترحيل محرك أداء المهام.",
    };
  }
  return {
    ok: false,
    status: "ERROR",
    message: "تعذر تحميل بطاقة الأداء من مصدر المهام المعتمد.",
  };
}

/** The wrapper adds manager-only review evidence; legacy fallback keeps quality explicitly unavailable. */
export async function fetchTaskPerformanceScorecard(): Promise<TaskPerformanceScorecardFetchResult> {
  try {
    let response = await supabase.rpc("fetch_task_performance_scorecard_with_quality");
    if (response.error && (
      response.error.code === "PGRST202" || response.error.code === "42883" ||
      /function .* does not exist|could not find the function/i.test(response.error.message ?? "")
    )) {
      response = await supabase.rpc("fetch_task_performance_scorecard");
    }
    if (response.error) return mapFailure(response.error);
    const scorecard = parseTaskPerformanceScorecard(response.data);
    if (!scorecard) {
      return { ok: false, status: "ERROR", message: "استجابة بطاقة الأداء لا تطابق عقد المصدر أو لا تتوازن أعدادها؛ لم تُستخدم بيانات بديلة." };
    }
    return { ok: true, scorecard };
  } catch {
    return { ok: false, status: "UNAVAILABLE", message: "تعذر الاتصال بقراءة بطاقة الأداء؛ لم تُستخدم بيانات محلية بديلة." };
  }
}
