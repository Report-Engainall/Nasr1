import { supabase } from "@/lib/supabase";
import type { RuntimeErrorBoundary, RuntimeErrorKind } from "@/lib/runtime-error-events";

type RuntimeErrorContext = {
  boundary?: RuntimeErrorBoundary;
};

const allowedBoundaries = new Set<RuntimeErrorBoundary>([
  "tanstack_root_error_component", "window_error", "unhandled_rejection", "unknown",
]);
const recentReports = new Map<string, number>();
const DEDUPE_WINDOW_MS = 5_000;
const MAX_LOCAL_KEYS = 32;

function classifyError(error: unknown): { kind: RuntimeErrorKind; status: number | null } {
  if (error instanceof Response) {
    return { kind: "response_error", status: Number.isInteger(error.status) && error.status >= 400 && error.status <= 599 ? error.status : null };
  }
  if (!(error instanceof Error)) return { kind: "unknown_error", status: null };
  switch (error.name) {
    case "TypeError": return { kind: "type_error", status: null };
    case "ReferenceError": return { kind: "reference_error", status: null };
    case "SyntaxError": return { kind: "syntax_error", status: null };
    case "RangeError": return { kind: "range_error", status: null };
    default: return { kind: "error", status: null };
  }
}

/**
 * Sends only allowlisted diagnostics. Messages, stack traces, URLs, request bodies,
 * headers, tokens, user identifiers and arbitrary context are intentionally discarded.
 */
export function reportRuntimeError(error: unknown, context: RuntimeErrorContext = {}): void {
  if (typeof window === "undefined") return;
  const { kind, status } = classifyError(error);
  const boundary = context.boundary && allowedBoundaries.has(context.boundary)
    ? context.boundary
    : "unknown";
  const key = [kind, status ?? "", boundary].join(":");
  const now = Date.now();
  const previous = recentReports.get(key);
  if (previous !== undefined && now - previous < DEDUPE_WINDOW_MS) return;
  recentReports.set(key, now);
  if (recentReports.size > MAX_LOCAL_KEYS) {
    const oldest = recentReports.keys().next().value;
    if (oldest) recentReports.delete(oldest);
  }
  void Promise.resolve(supabase.rpc("record_runtime_error_event", {
    p_error_kind: kind,
    p_http_status: status,
    p_boundary: boundary,
  })).catch(() => undefined);
}

if (typeof window !== "undefined") {
  window.addEventListener("error", (event) => {
    reportRuntimeError(event.error, { boundary: "window_error" });
  });
  window.addEventListener("unhandledrejection", (event) => {
    reportRuntimeError(event.reason, { boundary: "unhandled_rejection" });
  });
}
