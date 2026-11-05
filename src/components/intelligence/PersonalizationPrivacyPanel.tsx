import { useEffect, useState, type FormEvent } from "react";
import type {
  NotificationChannel,
  NotificationLevel,
  NotificationDetailLevel,
  PersonalizationPreferences,
  PersonalizationPreferencesUpdate,
} from "@/lib/intelligence/personalization-governance";
import { resolvePersonalizationExperience } from "@/lib/intelligence/personalization-governance";

export interface PersonalizationPreferencesSaveRequest {
  expectedUpdatedAt: string;
  changes: PersonalizationPreferencesUpdate;
}

export type PersonalizationPreferencesSaveResult =
  | { ok: true; preferences: PersonalizationPreferences }
  | { ok: false; message: string };

export interface PersonalizationPrivacyPanelProps {
  authorized: boolean;
  preferences: PersonalizationPreferences | null;
  loading?: boolean;
  channelCapabilities?: Partial<Record<NotificationChannel, boolean>>;
  onSavePreferences?: (
    request: PersonalizationPreferencesSaveRequest,
  ) => Promise<PersonalizationPreferencesSaveResult>;
  onRetry?: () => void;
  onSaved?: (preferences: PersonalizationPreferences) => void;
}

const channelLabels: Record<NotificationChannel, string> = {
  IN_APP: "داخل التطبيق",
  EMAIL: "البريد الإلكتروني",
  WHATSAPP: "واتساب",
  SMS: "الرسائل النصية",
};

const channelOrder: NotificationChannel[] = ["IN_APP", "EMAIL", "WHATSAPP", "SMS"];

const levelLabels: Record<NotificationLevel, string> = {
  ALL: "جميع الإشعارات",
  IMPORTANT: "المهمة والحرجة",
  CRITICAL: "الحرجة فقط",
};

function toDraft(preferences: PersonalizationPreferences): PersonalizationPreferencesUpdate {
  return {
    notificationChannels: [...preferences.notificationChannels],
    notificationLevel: preferences.notificationLevel,
    quietHours: { ...preferences.quietHours },
    detailLevel: preferences.detailLevel,
    reducedMotion: preferences.reducedMotion,
    personalizationEnabled: preferences.personalizationEnabled,
    externalProcessingEnabled: preferences.externalProcessingEnabled,
  };
}

function Toggle({
  checked,
  label,
  description,
  disabled = false,
  onChange,
}: {
  checked: boolean;
  label: string;
  description?: string;
  disabled?: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="flex items-start gap-3 rounded-lg border p-3">
      <input
        type="checkbox"
        className="mt-1 size-4 accent-primary"
        checked={checked}
        disabled={disabled}
        onChange={event => onChange(event.target.checked)}
      />
      <span className="min-w-0">
        <span className="block text-sm font-medium">{label}</span>
        {description ? <span className="mt-1 block text-xs text-muted-foreground">{description}</span> : null}
      </span>
    </label>
  );
}

export function PersonalizationPrivacyPanel({
  authorized,
  preferences,
  loading = false,
  channelCapabilities = {},
  onSavePreferences,
  onRetry,
  onSaved,
}: PersonalizationPrivacyPanelProps) {
  const [draft, setDraft] = useState<PersonalizationPreferencesUpdate | null>(
    preferences ? toDraft(preferences) : null,
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    setDraft(preferences ? toDraft(preferences) : null);
    setError(null);
    setNotice(null);
  }, [preferences]);

  function updateDraft(changes: Partial<PersonalizationPreferencesUpdate>) {
    setDraft(current => current ? { ...current, ...changes } : current);
    setError(null);
    setNotice(null);
  }

  function toggleChannel(channel: NotificationChannel, enabled: boolean) {
    if (!draft) return;
    const channels = new Set(draft.notificationChannels);
    if (enabled) channels.add(channel);
    else channels.delete(channel);
    updateDraft({ notificationChannels: channelOrder.filter(value => channels.has(value)) });
  }

  async function savePreferences(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!preferences || !draft || !onSavePreferences || saving) return;

    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      const result = await onSavePreferences({
        expectedUpdatedAt: preferences.updatedAt,
        changes: draft,
      });
      if (!result.ok) {
        setError(result.message || "رفض الخادم حفظ إعدادات الخصوصية.");
        return;
      }
      const experience = resolvePersonalizationExperience(result.preferences, new Date().toISOString());
      if (experience.status !== "READY" ||
          result.preferences.organizationId !== preferences.organizationId ||
          result.preferences.profileId !== preferences.profileId) {
        setError("أعاد الخادم إعدادات غير صالحة أو خارج نطاق المستخدم الحالي؛ لم يُعتمد التغيير في الواجهة.");
        return;
      }
      setDraft(toDraft(result.preferences));
      onSaved?.(result.preferences);
      setNotice("أكد الخادم حفظ إعدادات الخصوصية والتخصيص.");
    } catch {
      setError("تعذر حفظ الإعدادات. لم يتم عرض نجاح محلي.");
    } finally {
      setSaving(false);
    }
  }

  if (!authorized) {
    return (
      <section dir="rtl" className="rounded-xl border p-4" aria-label="خصوصية التخصيص">
        <h2 className="font-semibold">الخصوصية والتخصيص</h2>
        <p className="mt-2 text-sm text-muted-foreground" role="status">
          لا تتوفر صلاحية عرض إعدادات هذا الملف الشخصي.
        </p>
      </section>
    );
  }

  if (loading) {
    return (
      <section dir="rtl" className="rounded-xl border p-4" aria-label="خصوصية التخصيص" aria-busy="true">
        <h2 className="font-semibold">الخصوصية والتخصيص</h2>
        <p className="mt-2 text-sm text-muted-foreground">جارٍ تحميل الإعدادات من مصدر الحساب…</p>
      </section>
    );
  }

  if (!preferences || !draft) {
    return (
      <section dir="rtl" className="rounded-xl border p-4" aria-label="خصوصية التخصيص">
        <h2 className="font-semibold">الخصوصية والتخصيص</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          إعدادات الخصوصية غير متاحة من الخادم. لم تُنشأ قيم محلية ولم يتم افتراض موافقات.
        </p>
        {onRetry ? (
          <button type="button" className="mt-3 rounded-lg border px-3 py-2 text-sm" onClick={onRetry}>
            إعادة المحاولة
          </button>
        ) : null}
      </section>
    );
  }

  const saveUnavailable = !onSavePreferences;
  const selectedChannels = new Set(draft.notificationChannels);

  return (
    <section dir="rtl" className="space-y-4 rounded-xl border p-4" aria-label="الخصوصية والتخصيص">
      <header>
        <h2 className="text-lg font-semibold">الخصوصية والتخصيص</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          تُحفظ التفضيلات عبر خدمة الحساب فقط. لا تكفي هذه الإعدادات وحدها لإرسال بيانات إلى مستلم أو مزود خارجي؛
          يلزم إذن مستقل ومحدد لكل قناة وغرض ومصدر.
        </p>
      </header>

      {saveUnavailable ? (
        <p className="rounded-lg border p-3 text-sm" role="status">
          خدمة حفظ الإعدادات غير متصلة. يمكنك مراجعة القيم الحالية، لكن لا يمكن حفظ أي تعديل الآن.
        </p>
      ) : null}
      {error ? <p className="rounded-lg border border-destructive/40 p-3 text-sm text-destructive" role="alert">{error}</p> : null}
      {notice ? <p className="rounded-lg border p-3 text-sm" role="status">{notice}</p> : null}

      <form onSubmit={event => void savePreferences(event)} className="space-y-4">
        <fieldset className="space-y-2">
          <legend className="text-sm font-semibold">قنوات الإشعار</legend>
          <div className="grid gap-2 sm:grid-cols-2">
            {channelOrder.map(channel => {
              const enabled = selectedChannels.has(channel);
              const unavailable = channel !== "IN_APP" && channelCapabilities[channel] !== true;
              return (
                <Toggle
                  key={channel}
                  checked={enabled}
                  label={channelLabels[channel]}
                  description={unavailable ? "القناة غير متصلة أو لم تُثبت جاهزيتها بعد." : undefined}
                  disabled={unavailable && !enabled}
                  onChange={value => toggleChannel(channel, value)}
                />
              );
            })}
          </div>
        </fieldset>

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="grid gap-1 text-sm">
            مستوى الإشعارات
            <select
              className="rounded-lg border bg-background p-2"
              value={draft.notificationLevel}
              onChange={event => updateDraft({ notificationLevel: event.target.value as NotificationLevel })}
            >
              {(["ALL", "IMPORTANT", "CRITICAL"] as NotificationLevel[]).map(level =>
                <option key={level} value={level}>{levelLabels[level]}</option>
              )}
            </select>
          </label>
          <label className="grid gap-1 text-sm">
            مستوى التفاصيل
            <select
              className="rounded-lg border bg-background p-2"
              value={draft.detailLevel}
              onChange={event => updateDraft({ detailLevel: event.target.value as NotificationDetailLevel })}
            >
              <option value="SUMMARY">ملخص</option>
              <option value="STANDARD">قياسي</option>
            </select>
          </label>
        </div>

        <fieldset className="space-y-3 rounded-lg border p-3">
          <legend className="px-1 text-sm font-semibold">ساعات الهدوء</legend>
          <Toggle
            checked={draft.quietHours.enabled}
            label="إيقاف الإشعارات غير الحرجة خلال ساعات محددة"
            onChange={enabled => updateDraft({
              quietHours: { ...draft.quietHours, enabled },
            })}
          />
          {draft.quietHours.enabled ? (
            <div className="grid gap-3 sm:grid-cols-3">
              <label className="grid gap-1 text-sm">
                من
                <input
                  className="rounded-lg border bg-background p-2"
                  type="time"
                  value={draft.quietHours.startLocal}
                  onChange={event => updateDraft({
                    quietHours: { ...draft.quietHours, startLocal: event.target.value },
                  })}
                  required
                />
              </label>
              <label className="grid gap-1 text-sm">
                إلى
                <input
                  className="rounded-lg border bg-background p-2"
                  type="time"
                  value={draft.quietHours.endLocal}
                  onChange={event => updateDraft({
                    quietHours: { ...draft.quietHours, endLocal: event.target.value },
                  })}
                  required
                />
              </label>
              <label className="grid gap-1 text-sm">
                المنطقة الزمنية
                <input
                  className="rounded-lg border bg-background p-2"
                  value={draft.quietHours.timeZone}
                  onChange={event => updateDraft({
                    quietHours: { ...draft.quietHours, timeZone: event.target.value },
                  })}
                  maxLength={80}
                  required
                />
              </label>
            </div>
          ) : null}
        </fieldset>

        <div className="grid gap-2 sm:grid-cols-2">
          <Toggle
            checked={draft.reducedMotion}
            label="تقليل الحركة"
            description="تفضيل عرض قليل الحركة عند توفر بديل مناسب."
            onChange={reducedMotion => updateDraft({ reducedMotion })}
          />
          <Toggle
            checked={draft.personalizationEnabled}
            label="تفعيل التخصيص المصرّح به"
            description="يقتصر على دور العمل والتفضيلات التي صرّحت بها والسياق الضروري."
            onChange={personalizationEnabled => updateDraft({ personalizationEnabled })}
          />
          <Toggle
            checked={draft.externalProcessingEnabled}
            label="السماح المبدئي بالمعالجة الخارجية"
            description="بوابة إضافية فقط؛ لا تمنح موافقة لمزود أو نموذج ولا تسمح بإرسال بيانات حساسة."
            onChange={externalProcessingEnabled => updateDraft({ externalProcessingEnabled })}
          />
        </div>

        <footer className="flex flex-wrap items-center justify-between gap-3 border-t pt-3">
          <p className="text-xs text-muted-foreground">
            الإصدار المحمّل: {preferences.updatedAt}
          </p>
          <button
            type="submit"
            className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:cursor-not-allowed disabled:opacity-50"
            disabled={saveUnavailable || saving}
          >
            {saving ? "جارٍ الحفظ…" : "حفظ إعدادات الخصوصية"}
          </button>
        </footer>
      </form>
    </section>
  );
}
