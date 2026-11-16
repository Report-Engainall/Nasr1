import { useCallback, useEffect, useState } from "react";
import { Clock3, RefreshCw, Save, ShieldCheck } from "lucide-react";
import {
  fetchCustomerServiceSlaPolicies,
  setCustomerServiceSlaPolicy,
  type CustomerServiceCasePriority,
  type CustomerServiceSlaPolicy,
} from "@/lib/customer-service-cases";

const PRIORITIES: Array<{ value: CustomerServiceCasePriority; label: string }> = [
  { value: "urgent", label: "عاجلة" },
  { value: "high", label: "عالية" },
  { value: "medium", label: "متوسطة" },
  { value: "low", label: "منخفضة" },
];

type PolicyDraft = { firstResponse: string; resolution: string };
type Drafts = Record<CustomerServiceCasePriority, PolicyDraft>;

function policyDrafts(rows: CustomerServiceSlaPolicy[]): Drafts {
  return Object.fromEntries(rows.map((row) => [row.priority, {
    firstResponse: String(row.first_response_minutes),
    resolution: String(row.resolution_minutes),
  }])) as Drafts;
}

function validatePolicySet(rows: CustomerServiceSlaPolicy[]): CustomerServiceSlaPolicy[] {
  const byPriority = new Map(rows.map((row) => [row.priority, row]));
  if (rows.length !== PRIORITIES.length || byPriority.size !== PRIORITIES.length ||
      PRIORITIES.some(({ value }) => !byPriority.has(value))) {
    throw new Error("لم يُرجع الخادم سياسة SLA كاملة لكل مستويات الأولوية الأربعة؛ لم تُعرض إعدادات ناقصة.");
  }
  return PRIORITIES.map(({ value }) => byPriority.get(value)!);
}

function validMinutes(value: string): number | null {
  if (!/^\d+$/.test(value.trim())) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 5 && parsed <= 43200 ? parsed : null;
}

function policyError(error: unknown): string {
  return error instanceof Error && error.message
    ? error.message
    : "تعذر الوصول إلى خدمة إعدادات SLA.";
}

export function CustomerServiceSlaPolicyPanel({ canManage }: { canManage: boolean }) {
  const [policies, setPolicies] = useState<CustomerServiceSlaPolicy[]>([]);
  const [drafts, setDrafts] = useState<Drafts | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [savingPriority, setSavingPriority] = useState<CustomerServiceCasePriority | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const load = useCallback(async (quiet = false) => {
    if (!canManage) return;
    if (quiet) setRefreshing(true);
    else setLoading(true);
    setError("");
    try {
      const rows = validatePolicySet(await fetchCustomerServiceSlaPolicies());
      setPolicies(rows);
      setDrafts(policyDrafts(rows));
    } catch (cause) {
      setError(policyError(cause));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [canManage]);

  useEffect(() => {
    if (canManage) void load();
  }, [canManage, load]);

  function updateDraft(priority: CustomerServiceCasePriority, field: keyof PolicyDraft, value: string) {
    setDrafts((current) => current
      ? { ...current, [priority]: { ...current[priority], [field]: value } }
      : current);
    setNotice("");
  }

  async function savePolicy(policy: CustomerServiceSlaPolicy) {
    if (!drafts || savingPriority) return;
    const draft = drafts[policy.priority];
    const firstResponse = validMinutes(draft.firstResponse);
    const resolution = validMinutes(draft.resolution);
    if (firstResponse === null || resolution === null) {
      setError("أدخل زمناً صحيحاً بين 5 و43,200 دقيقة لكل حقل.");
      return;
    }
    if (resolution < firstResponse) {
      setError("يجب ألا تقل مهلة الحل عن مهلة الاستجابة الأولى.");
      return;
    }

    setSavingPriority(policy.priority);
    setError("");
    setNotice("");
    try {
      const saved = await setCustomerServiceSlaPolicy({
        priority: policy.priority,
        firstResponseMinutes: firstResponse,
        resolutionMinutes: resolution,
      });
      if (saved.priority !== policy.priority ||
          saved.first_response_minutes !== firstResponse ||
          saved.resolution_minutes !== resolution ||
          saved.configured !== true) {
        throw new Error("لم يطابق رد الحفظ القيم المطلوبة؛ لم تُعرض السياسة كأنها حُفظت.");
      }

      setPolicies((current) => current.map((item) => item.priority === policy.priority ? saved : item));
      setDrafts((current) => current
        ? { ...current, [policy.priority]: { firstResponse: String(saved.first_response_minutes), resolution: String(saved.resolution_minutes) } }
        : current);
      setNotice("أكد الخادم حفظ سياسة الأولوية " + PRIORITIES.find((item) => item.value === policy.priority)!.label + ".");

      try {
        const latest = validatePolicySet(await fetchCustomerServiceSlaPolicies());
        const confirmed = latest.find((item) => item.priority === policy.priority);
        if (!confirmed || confirmed.first_response_minutes !== firstResponse ||
            confirmed.resolution_minutes !== resolution || !confirmed.configured) {
          throw new Error("لم تتطابق القراءة اللاحقة مع القيم التي أكدها أمر الحفظ.");
        }
        setPolicies(latest);
        setDrafts(policyDrafts(latest));
      } catch {
        setNotice("أكد الخادم تنفيذ الحفظ، لكن تعذرت مطابقة القراءة اللاحقة. حدّث السياسات للتأكد من أحدث قيمة.");
      }
    } catch (cause) {
      setError(policyError(cause));
    } finally {
      setSavingPriority(null);
    }
  }

  if (!canManage) return null;

  return (
    <details className="customer-service-sla-panel rounded-xl border bg-card" data-testid="customer-service-sla-panel">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3">
        <span className="flex min-w-0 items-center gap-2 font-semibold">
          <Clock3 size={18} aria-hidden="true" />
          إعداد سياسات زمن الاستجابة والحل (SLA)
        </span>
        <span className="text-xs text-muted-foreground">٤ مستويات أولوية</span>
      </summary>
      <div className="space-y-4 border-t p-4">
        <header className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="font-semibold">مواعيد خدمة العملاء حسب الأولوية</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              أدخل المدد بالدقائق. الحد المسموح من 5 إلى 43,200 دقيقة، ويجب أن تكون مهلة الحل مساوية لمهلة الاستجابة أو أطول منها.
            </p>
          </div>
          <button type="button" className="inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm"
            disabled={loading || refreshing || savingPriority !== null} onClick={() => void load(true)}>
            <RefreshCw size={15} aria-hidden="true" />
            تحديث السياسات
          </button>
        </header>

        {error ? <p role="alert" className="rounded-lg border border-destructive/40 p-3 text-sm">{error}</p> : null}
        {notice ? <p role="status" className="rounded-lg border p-3 text-sm"><ShieldCheck size={15} className="me-1 inline" />{notice}</p> : null}
        {loading ? <p role="status" aria-busy="true" className="rounded-lg border p-4 text-sm text-muted-foreground">جار تحميل سياسات SLA من الخادم…</p> : null}
        {!loading && !error && policies.length === 0 ? (
          <p role="status" className="rounded-lg border p-4 text-sm text-muted-foreground">لا توجد سياسات متاحة للعرض.</p>
        ) : null}

        {!loading && policies.length > 0 && drafts ? (
          <div className="grid gap-3 xl:grid-cols-2">
            {policies.map((policy) => {
              const draft = drafts[policy.priority];
              const firstResponse = validMinutes(draft.firstResponse);
              const resolution = validMinutes(draft.resolution);
              const valid = firstResponse !== null && resolution !== null && resolution >= firstResponse;
              const dirty = !policy.configured ||
                firstResponse !== policy.first_response_minutes ||
                resolution !== policy.resolution_minutes;
              const label = PRIORITIES.find((item) => item.value === policy.priority)!.label;
              const saving = savingPriority === policy.priority;
              return (
                <article key={policy.priority} className="min-w-0 space-y-3 rounded-xl border p-3" data-testid={"sla-policy-" + policy.priority}>
                  <header className="flex flex-wrap items-center justify-between gap-2">
                    <h3 className="font-semibold">الأولوية {label}</h3>
                    <span className="rounded-full border px-2 py-1 text-xs">
                      {policy.configured ? "إعداد مخصص" : "قيمة السياسة الحالية"}
                    </span>
                  </header>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className="grid min-w-0 gap-1 text-sm">
                      زمن الاستجابة الأولى — {label} (دقيقة)
                      <input type="number" min={5} max={43200} step={1} inputMode="numeric"
                        aria-label={"زمن الاستجابة الأولى — " + label + " (دقيقة)"}
                        value={draft.firstResponse} disabled={savingPriority !== null}
                        onChange={(event) => updateDraft(policy.priority, "firstResponse", event.target.value)}
                        className="min-w-0 rounded-lg border bg-background px-3 py-2" />
                    </label>
                    <label className="grid min-w-0 gap-1 text-sm">
                      زمن الحل — {label} (دقيقة)
                      <input type="number" min={5} max={43200} step={1} inputMode="numeric"
                        aria-label={"زمن الحل — " + label + " (دقيقة)"}
                        value={draft.resolution} disabled={savingPriority !== null}
                        onChange={(event) => updateDraft(policy.priority, "resolution", event.target.value)}
                        className="min-w-0 rounded-lg border bg-background px-3 py-2" />
                    </label>
                  </div>
                  {!valid && (draft.firstResponse !== "" || draft.resolution !== "") ? (
                    <p role="alert" className="text-xs text-destructive">
                      {firstResponse === null || resolution === null
                        ? "كل مدة يجب أن تكون عدداً صحيحاً بين 5 و43,200 دقيقة."
                        : "مهلة الحل لا يمكن أن تسبق مهلة الاستجابة الأولى."}
                    </p>
                  ) : null}
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-xs text-muted-foreground">القيم الحالية: {policy.first_response_minutes} / {policy.resolution_minutes} دقيقة</p>
                    <button type="button" className="inline-flex items-center gap-2 rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50"
                      disabled={!valid || !dirty || savingPriority !== null} onClick={() => void savePolicy(policy)}>
                      <Save size={15} aria-hidden="true" />
                      {saving ? "جار الحفظ…" : "حفظ سياسة " + label}
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        ) : null}
        <p className="text-xs text-muted-foreground">
          هذه الشاشة تحفظ سياسة المهلة فقط؛ لا تغيّر حالة الشكوى أو تسند الموظفين ولا تدّعي إرسال رسالة للعميل. يظل الخادم هو مرجع التفويض والتحقق النهائي.
        </p>
      </div>
    </details>
  );
}
