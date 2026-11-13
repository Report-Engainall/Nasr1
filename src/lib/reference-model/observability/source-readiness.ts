export type ReferenceSourceReadinessStatus =
  | "BLOCKED_NO_PERSISTENT_SOURCE"
  | "BLOCKED_NO_TENANT_SAFE_READ_CONTRACT"
  | "BLOCKED_NO_SAFE_REPOSITORY_READ_SOURCE"
  | "PERSISTENT_SOURCE_ADMIN_ONLY";

export interface ReferenceSourceReadiness {
  id: "ai_audit" | "prompt_persistence" | "error_log" | "developer_tools";
  title: string;
  status: ReferenceSourceReadinessStatus;
  source: string;
  detail: string;
}

/**
 * Source-contract assessment for the isolated reference-model workstream.
 * These entries are explicit blockers, not sample records or runtime events.
 */
export const REFERENCE_SOURCE_READINESS: readonly ReferenceSourceReadiness[] = [
  {
    id: "ai_audit",
    title: "تدقيق محاولات الذكاء",
    status: "BLOCKED_NO_TENANT_SAFE_READ_CONTRACT",
    source: "public.ai_usage_ledger",
    detail: "السجل الدائم موجود، لكن عقد الواجهة الحالي get_ai_gateway_budget يعرض ملخصاً مجمعاً فقط؛ لا توجد قراءة مفوضة ومحدودة لكل محاولة. يمنع الوصول المباشر إلى الجدول.",
  },
  {
    id: "prompt_persistence",
    title: "مكتبة Prompts وإصداراتها",
    status: "PERSISTENT_SOURCE_ADMIN_ONLY",
    source: "public.ai_prompt_versions · public.ai_prompt_audit_events · admin-only RPCs",
    detail: "تتوفر الآن نسخ PostgreSQL دائمة وبصمة SHA-256 ثابتة وسجل append-only. الإنشاء والمراجعة والاعتماد والتفعيل محكومة بـRPC خادمي، وفصل المنشئ عن المراجع والمفعّل. يتطلب الوصول دور admin وجلسة Auth نشطة داخل المؤسسة؛ لا توجد بيانات افتراضية مزروعة.",
  },
  {
    id: "error_log",
    title: "سجل أخطاء دائم",
    status: "BLOCKED_NO_PERSISTENT_SOURCE",
    source: "src/lib/error-capture.ts · src/lib/runtime-error-reporting.ts",
    detail: "التقاط الخطأ مؤقت في الذاكرة أو console؛ لا يوجد مصدر متعدد المستخدمين محفوظ يمكن عرضه كسجل عمليات.",
  },
  {
    id: "developer_tools",
    title: "أدوات المطور وتدقيق التغييرات",
    status: "BLOCKED_NO_SAFE_REPOSITORY_READ_SOURCE",
    source: "GitHub server-side connection",
    detail: "لا يوجد عقد تطبيق خادمي مقيد لقراءة المستودعات والفروع وSHA والاختبارات. لن تُعرض patches أو نتائج CI مخمّنة، ولن تُستخدم رموز داخل المتصفح.",
  },
] as const;
