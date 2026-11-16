import { useCallback, useEffect, useMemo, useState } from 'react';
import { Check, RefreshCw, ShieldCheck, UserCog } from 'lucide-react';
import { supabase } from '@/lib/supabase';

type Profile = {
  profile_id: string;
  full_name: string;
  email: string | null;
  is_active: boolean;
  roles: string[];
};

const ROLE_LABELS: Record<string, string> = {
  admin: 'مدير النظام',
  manager: 'مدير',
  staff: 'موظف تشغيل',
  accountant: 'محاسب',
  customer: 'عميل',
  customer_manager: 'مسؤول العملاء',
};
const FALLBACK_ROLES = [
  { value: 'staff', label: 'موظف تشغيل — صلاحيات تشغيلية' },
  { value: 'accountant', label: 'محاسب — صلاحيات مالية' },
] as const;
const sorted = (roles: string[]) => Array.from(new Set(roles)).sort();

function normalizeOrganizationProfiles(data: unknown): Profile[] {
  if (!Array.isArray(data)) return [];
  return (data as Profile[])
    .filter((profile) =>
      typeof profile.profile_id === 'string' &&
      typeof profile.full_name === 'string' &&
      Array.isArray(profile.roles) &&
      profile.is_active === true,
    )
    .map((profile) => ({ ...profile, roles: sorted(profile.roles) }));
}

function isRoleRevisionConflict(cause: unknown): boolean {
  if (!cause || typeof cause !== 'object') return false;
  const error = cause as { code?: unknown; message?: unknown };
  const detail = cause instanceof Error ? cause.message : typeof error.message === 'string' ? error.message : '';
  return error.code === '40001' || detail.includes('role assignment changed since it was loaded');
}

function roleUpdateErrorMessage(cause: unknown): string {
  const error = cause && typeof cause === 'object' ? cause as { code?: unknown; message?: unknown } : null;
  const detail = cause instanceof Error ? cause.message : typeof error?.message === 'string' ? error.message : '';
  if (isRoleRevisionConflict(cause)) {
    return 'تغيرت أدوار هذا الحساب بعد تحميل القائمة. حدّثت البيانات الحالية؛ راجع الأدوار ثم أعد المحاولة.';
  }
  if (detail.includes('outside the current organization')) {
    return 'رفض الخادم التعديل لأن الحساب خارج المؤسسة الحالية أو غير نشط.';
  }
  if (detail.includes('cannot change their own roles')) {
    return 'لا يمكنك تعديل أدوار حسابك الحالي.';
  }
  return 'رفض الخادم تغيير الأدوار أو تعذر تأكيده. لم تُعرض رسالة نجاح.';
}

function CustomerManagerRoleHeading() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <ShieldCheck size={22} aria-hidden="true" />
      <div>
        <h2 id="customer-manager-role-title" style={{ margin: 0 }}>إدارة مسؤول العملاء ونطاقات المستودعات</h2>
        <p style={{ margin: '5px 0 0', lineHeight: 1.7 }}>
          يُسند دور مسؤول العملاء ونطاقات المستودعات عبر أوامر خادمية مقيدة بالمؤسسة، مع سبب وإصدار وتدقيق لكل تغيير. لا يمكن تعديل حسابك الحالي.
        </p>
      </div>
    </div>
  );
}

function CustomerManagerRoleSearch({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label style={{ display: 'block', margin: '14px 0' }}>
      <span style={{ display: 'block', marginBottom: 6, fontWeight: 700 }}>بحث بالاسم أو البريد</span>
      <input
        aria-label="البحث عن مستخدم لإسناد دور مسؤول العملاء"
        type="search"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        maxLength={254}
        placeholder="اسم المستخدم أو البريد الإلكتروني"
        style={{ width: '100%', maxWidth: 460, padding: '10px 12px', border: '1px solid #d5e7e9', borderRadius: 9 }}
      />
    </label>
  );
}

function CustomerManagerRoleFeedback({
  error,
  loading,
  onRetry,
}: {
  error: string;
  loading: boolean;
  onRetry: () => void;
}) {
  if (!error) return null;
  return (
    <div role="alert" className="error-box" style={{ display: 'block', marginBottom: 12 }}>
      {error}
      <button type="button" className="btn btn-outline" onClick={onRetry} disabled={loading}>
        <RefreshCw size={14} /> إعادة المحاولة
      </button>
    </div>
  );
}

function ProfileRoleBadges({ roles }: { roles: string[] }) {
  if (roles.length === 0) return <span className="badge warning">دون دور مسند</span>;
  return (
    <>
      {roles.map((role) => (
        <span className="badge info" key={role}>{ROLE_LABELS[role] ?? role}</span>
      ))}
    </>
  );
}

function ProfileFallbackRoleSelect({
  profile,
  value,
  disabled,
  onChange,
}: {
  profile: Profile;
  value: string;
  disabled: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <label style={{ display: 'block', marginTop: 10 }}>
      <span style={{ display: 'block', marginBottom: 5 }}>الدور البديل بعد الإزالة</span>
      <select
        aria-label={'الدور البديل بعد إزالة مسؤول العملاء من ' + profile.full_name}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        disabled={disabled}
        style={{ width: '100%', maxWidth: 360, padding: 8 }}
      >
        <option value="">اختر دورًا بديلًا — مطلوب</option>
        {FALLBACK_ROLES.map((option) => (
          <option key={option.value} value={option.value}>{option.label}</option>
        ))}
      </select>
    </label>
  );
}

function ProfileRoleActionButton({
  profile,
  assigned,
  self,
  customer,
  busy,
  saving,
  needsAlternative,
  hasFallback,
  onUpdate,
}: {
  profile: Profile;
  assigned: boolean;
  self: boolean;
  customer: boolean;
  busy: boolean;
  saving: boolean;
  needsAlternative: boolean;
  hasFallback: boolean;
  onUpdate: (profile: Profile, enable: boolean) => void;
}) {
  if (!assigned) {
    return (
      <button
        type="button"
        className="btn primary"
        aria-label={'إسناد مسؤول العملاء إلى ' + profile.full_name}
        disabled={self || customer || busy || saving}
        onClick={() => onUpdate(profile, true)}
      >
        <UserCog size={16} /> {busy ? 'جار الحفظ…' : 'إسناد مسؤول العملاء'}
      </button>
    );
  }

  return (
    <button
      type="button"
      className="btn btn-outline"
      aria-label={'إزالة دور مسؤول العملاء من ' + profile.full_name}
      disabled={self || busy || saving || (needsAlternative && !hasFallback)}
      onClick={() => onUpdate(profile, false)}
    >
      <Check size={16} /> {busy ? 'جار الحفظ…' : 'إزالة دور مسؤول العملاء'}
    </button>
  );
}

function ProfileRoleNotes({
  assigned,
  self,
  customer,
  needsAlternative,
}: {
  assigned: boolean;
  self: boolean;
  customer: boolean;
  needsAlternative: boolean;
}) {
  if (self) return <span role="note">لا يمكن تعديل أدوار حسابك الحالي.</span>;
  if (!assigned && customer) return <span role="note">حساب العميل لا يمكن دمجه مع دور داخلي.</span>;
  if (needsAlternative) return <span role="note">اختر البديل؛ لا تُرفع الصلاحيات تلقائيًا.</span>;
  return null;
}



type ProfileScope = {
  scope_id: string;
  scope_kind: 'warehouse' | 'assigned_customer';
  scope_resource_id: string;
  warehouse_id: string | null;
  customer_id: string | null;
  reason: string;
  is_active: boolean;
  revision: number;
  valid_from: string;
  expires_at: string | null;
};

function normalizeProfileScopes(value: unknown): ProfileScope[] {
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is ProfileScope => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return false;
    const scope = entry as Record<string, unknown>;
    return typeof scope.scope_id === 'string' &&
      (scope.scope_kind === 'warehouse' || scope.scope_kind === 'assigned_customer') &&
      typeof scope.scope_resource_id === 'string' &&
      typeof scope.reason === 'string' &&
      typeof scope.is_active === 'boolean' &&
      Number.isSafeInteger(scope.revision) && Number(scope.revision) >= 1;
  });
}

type ScopeResource = {
  id: string;
  name: string;
  code: string | null;
};

type ScopeResourceCatalog = {
  warehouses: ScopeResource[];
  customers: ScopeResource[];
};

function normalizeScopeResourceCatalog(value: unknown): ScopeResourceCatalog {
  const decoded = typeof value === 'string' ? (() => {
    try { return JSON.parse(value) as unknown; } catch { return null; }
  })() : value;
  if (!decoded || typeof decoded !== 'object' || Array.isArray(decoded)) {
    throw new Error('أعاد الخادم فهرس نطاقات غير صالح.');
  }
  const source = decoded as Record<string, unknown>;
  function readRows(rows: unknown, label: string): ScopeResource[] {
    if (!Array.isArray(rows)) throw new Error('قائمة ' + label + ' غير صالحة.');
    return rows.filter((entry): entry is ScopeResource => {
      if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return false;
      const resource = entry as Record<string, unknown>;
      return typeof resource.id === 'string' &&
        typeof resource.name === 'string' &&
        (resource.code === null || typeof resource.code === 'string');
    });
  }
  return {
    warehouses: readRows(source.warehouses, 'المستودعات'),
    customers: readRows(source.customers, 'العملاء'),
  };
}

function ResourceScopePanel({
  profile,
  currentProfileId,
}: {
  profile: Profile;
  currentProfileId: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [savingResourceId, setSavingResourceId] = useState<string | null>(null);
  const [resources, setResources] = useState<ScopeResourceCatalog>({ warehouses: [], customers: [] });
  const [scopes, setScopes] = useState<ProfileScope[]>([]);
  const [scopeKind, setScopeKind] = useState<'warehouse' | 'assigned_customer'>('warehouse');
  const [selectedResourceId, setSelectedResourceId] = useState('');
  const [reason, setReason] = useState('');
  const [expiresAt, setExpiresAt] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const self = profile.profile_id === currentProfileId;
  const customerProfile = profile.roles.includes('customer');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [resourceResponse, scopeResponse] = await Promise.all([
        supabase.rpc('list_authorization_scope_resources'),
        supabase.rpc('list_authorization_profile_scopes', {
          p_target_profile_id: profile.profile_id,
        }),
      ]);
      if (resourceResponse.error) throw resourceResponse.error;
      if (scopeResponse.error) throw scopeResponse.error;
      const nextResources = normalizeScopeResourceCatalog(resourceResponse.data);
      const nextScopes = normalizeProfileScopes(scopeResponse.data);
      setResources(nextResources);
      setScopes(nextScopes);
      const currentRows = scopeKind === 'warehouse' ? nextResources.warehouses : nextResources.customers;
      setSelectedResourceId((current) =>
        current && currentRows.some((resource) => resource.id === current)
          ? current
          : currentRows[0]?.id ?? '',
      );
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'تعذر تحميل الموارد ونطاقات الوصول من الخادم.');
    } finally {
      setLoading(false);
    }
  }, [profile.profile_id, scopeKind]);

  useEffect(() => {
    if (expanded && !self && !customerProfile) void load();
  }, [expanded, self, customerProfile, load]);

  const currentResources = scopeKind === 'warehouse' ? resources.warehouses : resources.customers;
  const currentScopes = useMemo(
    () => scopes.filter((scope) => scope.scope_kind === scopeKind),
    [scopes, scopeKind],
  );
  const effectiveResourceIds = useMemo(
    () => new Set(currentScopes
      .filter((scope) => scope.is_active &&
        (!scope.expires_at || Date.parse(scope.expires_at) > Date.now()) &&
        Date.parse(scope.valid_from) <= Date.now())
      .map((scope) => scope.scope_resource_id)),
    [currentScopes],
  );
  const selectedScope = currentScopes.find((scope) => scope.scope_resource_id === selectedResourceId) ?? null;
  const reasonReady = reason.trim().length >= 5 && reason.trim().length <= 500;
  const expiryReady = !expiresAt || (
    Number.isFinite(Date.parse(expiresAt)) &&
    Date.parse(expiresAt) > Date.now()
  );
  const resourceLabel = scopeKind === 'warehouse' ? 'المستودع' : 'العميل';
  const resourcePlural = scopeKind === 'warehouse' ? 'المستودعات' : 'العملاء';

  async function saveScope(resourceId: string, existing: ProfileScope | null, active: boolean) {
    if (self || customerProfile || savingResourceId !== null) return;
    if (!reasonReady) {
      setError('أدخل سبباً واضحاً من 5 إلى 500 حرف قبل تغيير نطاق الوصول.');
      return;
    }
    if (active && !expiryReady) {
      setError('تاريخ انتهاء الإسناد يجب أن يكون في المستقبل.');
      return;
    }
    setSavingResourceId(resourceId);
    setError('');
    setNotice('');
    try {
      const { data, error: rpcError } = await supabase.rpc('set_authorization_profile_scope', {
        p_target_profile_id: profile.profile_id,
        p_scope_kind: scopeKind,
        p_scope_id: resourceId,
        p_reason: reason.trim(),
        p_expires_at: active && expiresAt ? new Date(expiresAt).toISOString() : null,
        p_is_active: active,
        p_expected_revision: existing?.revision ?? 0,
      });
      if (rpcError) throw rpcError;
      const result = data as {
        changed?: unknown;
        scope_id?: unknown;
        scope_kind?: unknown;
        scope_resource_id?: unknown;
        revision?: unknown;
        is_active?: unknown;
      } | null;
      const confirmedIdempotentReplay = Boolean(
        result && result.changed === false && existing &&
        result.scope_id === existing.scope_id &&
        result.revision === existing.revision
      );
      if (
        !result ||
        typeof result.changed !== 'boolean' ||
        (result.scope_resource_id !== resourceId && !confirmedIdempotentReplay) ||
        (result.scope_kind !== scopeKind && !confirmedIdempotentReplay) ||
        !Number.isSafeInteger(result.revision) ||
        result.is_active !== active
      ) {
        throw new Error('لم يؤكد الخادم تغيير نطاق المورد بالإصدار المتوقع.');
      }
      setNotice(result.changed
        ? (active ? 'تم إسناد ' + resourceLabel + ' بعد تأكيد الخادم.' : 'تم سحب إسناد ' + resourceLabel + ' بعد تأكيد الخادم.')
        : 'النطاق مطابق للحالة الحالية؛ لم يُكرر سجل التدقيق.');
      setReason('');
      setExpiresAt('');
      await load();
    } catch (cause) {
      const detail = cause instanceof Error ? cause.message : '';
      const message = detail.includes('scope revision changed')
        ? 'تغير النطاق بواسطة مسؤول آخر. أُعيد تحميل الإصدار الحالي؛ راجع الحالة قبل المحاولة.'
        : detail || 'رفض الخادم تغيير نطاق المورد أو تعذر تأكيده.';
      await load();
      setError(message);
    } finally {
      setSavingResourceId(null);
    }
  }

  function findResource(scope: ProfileScope): ScopeResource | undefined {
    const rows = scope.scope_kind === 'warehouse' ? resources.warehouses : resources.customers;
    return rows.find((resource) => resource.id === scope.scope_resource_id);
  }

  return (
    <section style={{ marginTop: 14, paddingTop: 12, borderTop: '1px solid #e5eeee' }}>
      <button
        type="button"
        className="btn btn-outline"
        aria-expanded={expanded}
        aria-controls={'member-resource-scope-' + profile.profile_id}
        onClick={() => setExpanded((value) => !value)}
        disabled={self || customerProfile}
      >
        {expanded ? 'إخفاء نطاقات الوصول' : 'إدارة نطاقات الوصول'}
      </button>
      {self ? <p role="note">لا يمكن إسناد نطاقات إلى حساب المسؤول نفسه من هذه الشاشة.</p> : null}
      {customerProfile ? <p role="note">حساب العميل منفصل عن عضوية الموظف ولا يقبل نطاقات الموارد الداخلية.</p> : null}
      {expanded && !self && !customerProfile ? (
        <div id={'member-resource-scope-' + profile.profile_id} style={{ marginTop: 12, display: 'grid', gap: 10 }}>
          <p style={{ margin: 0, color: '#62777b', lineHeight: 1.7 }}>
            الإسناد يحدد العلاقة بالمورد ولا ينشئ منحة صلاحية. لا يحصل الموظف إلا على الموارد التي تسند إليه، وتبقى القدرات غير الممنوحة مرفوضة افتراضياً.
          </p>
          {loading ? <p role="status">جار تحميل موارد المؤسسة والنطاقات...</p> : null}
          {error ? (
            <div role="alert" className="error-box">
              {error}
              <button type="button" className="btn btn-outline" onClick={() => void load()} disabled={loading || savingResourceId !== null}>إعادة المحاولة</button>
            </div>
          ) : null}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))', gap: 8, alignItems: 'end' }}>
            <label style={{ display: 'grid', gap: 5 }}>
              <span>نوع النطاق</span>
              <select
                aria-label={'نوع نطاق الوصول لـ ' + profile.full_name}
                value={scopeKind}
                onChange={(event) => {
                  const next = event.target.value === 'assigned_customer' ? 'assigned_customer' : 'warehouse';
                  setScopeKind(next);
                  const nextRows = next === 'warehouse' ? resources.warehouses : resources.customers;
                  setSelectedResourceId(nextRows[0]?.id ?? '');
                  setReason('');
                  setExpiresAt('');
                  setError('');
                  setNotice('');
                }}
                disabled={loading || savingResourceId !== null}
                style={{ width: '100%', padding: 9, border: '1px solid #d5e7e9', borderRadius: 8 }}
              >
                <option value="warehouse">مستودع</option>
                <option value="assigned_customer">عميل مسند</option>
              </select>
            </label>
            <label style={{ display: 'grid', gap: 5 }}>
              <span>{resourceLabel}</span>
              <select
                aria-label={resourceLabel + ' لإسناده إلى ' + profile.full_name}
                value={selectedResourceId}
                onChange={(event) => setSelectedResourceId(event.target.value)}
                disabled={loading || savingResourceId !== null || currentResources.length === 0}
                style={{ width: '100%', padding: 9, border: '1px solid #d5e7e9', borderRadius: 8 }}
              >
                {currentResources.map((resource) => (
                  <option key={resource.id} value={resource.id}>
                    {resource.name}{resource.code ? ' — ' + resource.code : ''}
                  </option>
                ))}
              </select>
            </label>
            <label style={{ display: 'grid', gap: 5 }}>
              <span>سبب التغيير (مطلوب)</span>
              <input
                aria-label={'سبب تغيير نطاق ' + resourceLabel + ' لـ ' + profile.full_name}
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                maxLength={500}
                placeholder="اكتب سبب التكليف أو سحب الصلاحية"
                disabled={savingResourceId !== null}
                style={{ width: '100%', padding: 9, border: '1px solid #d5e7e9', borderRadius: 8 }}
              />
            </label>
            <label style={{ display: 'grid', gap: 5 }}>
              <span>انتهاء الإسناد (اختياري)</span>
              <input
                type="datetime-local"
                aria-label={'تاريخ انتهاء نطاق ' + resourceLabel + ' لـ ' + profile.full_name}
                value={expiresAt}
                onChange={(event) => setExpiresAt(event.target.value)}
                disabled={savingResourceId !== null}
                aria-invalid={!expiryReady}
                style={{ width: '100%', padding: 9, border: '1px solid #d5e7e9', borderRadius: 8 }}
              />
            </label>
            <button
              type="button"
              className="btn primary"
              onClick={() => void saveScope(selectedResourceId, selectedScope, true)}
              disabled={loading || savingResourceId !== null || !selectedResourceId || !reasonReady || !expiryReady}
            >
              {savingResourceId === selectedResourceId ? 'جار الحفظ...' : selectedScope?.is_active ? 'تحديث الإسناد' : 'إسناد المورد'}
            </button>
          </div>
          {!loading && currentResources.length === 0 ? (
            <p role="status">لا توجد {resourcePlural} متاحة في المؤسسة الحالية.</p>
          ) : null}
          {notice ? <p role="status" style={{ margin: 0 }}>{notice}</p> : null}
          {currentScopes.length > 0 ? (
            <div style={{ display: 'grid', gap: 8 }}>
              <strong>نطاقات {resourcePlural} المسجلة</strong>
              {currentScopes.map((scope) => {
                const resource = findResource(scope);
                const effective = scope.is_active &&
                  (!scope.expires_at || Date.parse(scope.expires_at) > Date.now()) &&
                  Date.parse(scope.valid_from) <= Date.now();
                return (
                  <div key={scope.scope_id} style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', alignItems: 'center', border: '1px solid #e5eeee', borderRadius: 9, padding: 10 }}>
                    <div>
                      <strong>{resource?.name ?? 'مورد غير متاح'}</strong>
                      <div style={{ fontSize: 12, color: '#71868a', lineHeight: 1.6 }}>
                        {scope.reason} · الإصدار {scope.revision}
                        {scope.expires_at ? ' · ينتهي ' + new Date(scope.expires_at).toLocaleString('ar') : ''}
                      </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      <span className={effective ? 'badge success' : 'badge warning'}>
                        {effective ? 'مفعّل' : scope.is_active ? 'منتهي / غير نافذ' : 'مسحوب'}
                      </span>
                      {scope.is_active ? (
                        <button
                          type="button"
                          className="btn btn-outline"
                          onClick={() => void saveScope(scope.scope_resource_id, scope, false)}
                          disabled={savingResourceId !== null || !reasonReady}
                        >
                          {savingResourceId === scope.scope_resource_id ? 'جار السحب...' : 'سحب الإسناد'}
                        </button>
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}


type CapabilityOption = {
  capability_key: string;
  domain: string;
  scope_kind: string;
  sensitivity: string;
  is_active: boolean;
};

type ProfileDenial = {
  denial_id: string;
  capability_key: string;
  reason: string;
  is_active: boolean;
  expires_at: string | null;
  created_at: string;
  updated_at: string;
};

function normalizeCapabilityOptions(value: unknown): CapabilityOption[] {
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is CapabilityOption => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return false;
    const capability = entry as Record<string, unknown>;
    return typeof capability.capability_key === 'string' &&
      typeof capability.domain === 'string' &&
      typeof capability.scope_kind === 'string' &&
      typeof capability.sensitivity === 'string' &&
      capability.is_active === true;
  }).sort((left, right) => left.capability_key.localeCompare(right.capability_key));
}

function normalizeProfileDenials(value: unknown): ProfileDenial[] {
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is ProfileDenial => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return false;
    const denial = entry as Record<string, unknown>;
    return typeof denial.denial_id === 'string' &&
      typeof denial.capability_key === 'string' &&
      typeof denial.reason === 'string' &&
      typeof denial.is_active === 'boolean' &&
      (denial.expires_at === null || typeof denial.expires_at === 'string') &&
      typeof denial.created_at === 'string' &&
      typeof denial.updated_at === 'string';
  });
}

function CapabilityDenialPanel({
  profile,
  currentProfileId,
}: {
  profile: Profile;
  currentProfileId: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [capabilities, setCapabilities] = useState<CapabilityOption[]>([]);
  const [denials, setDenials] = useState<ProfileDenial[]>([]);
  const [selectedCapabilityKey, setSelectedCapabilityKey] = useState('');
  const [reason, setReason] = useState('');
  const [expiresAt, setExpiresAt] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const self = profile.profile_id === currentProfileId;
  const customer = profile.roles.includes('customer');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [capabilityResponse, denialResponse] = await Promise.all([
        supabase.rpc('list_authorization_capability_registry'),
        supabase.rpc('list_authorization_profile_denials', {
          p_target_profile_id: profile.profile_id,
        }),
      ]);
      if (capabilityResponse.error) throw capabilityResponse.error;
      if (denialResponse.error) throw denialResponse.error;
      const nextCapabilities = normalizeCapabilityOptions(capabilityResponse.data);
      setCapabilities(nextCapabilities);
      setDenials(normalizeProfileDenials(denialResponse.data));
      setSelectedCapabilityKey((current) =>
        current && nextCapabilities.some((capability) => capability.capability_key === current)
          ? current
          : nextCapabilities[0]?.capability_key ?? '',
      );
    } catch (cause) {
      setError(cause instanceof Error
        ? cause.message
        : 'تعذر تحميل قاموس القدرات والمنع الصريح من الخادم.');
    } finally {
      setLoading(false);
    }
  }, [profile.profile_id]);

  useEffect(() => {
    if (expanded && !self && !customer) void load();
  }, [expanded, self, customer, load]);

  const selectedDenial = denials.find((denial) =>
    denial.capability_key === selectedCapabilityKey,
  ) ?? null;
  const reasonReady = reason.trim().length >= 5 && reason.trim().length <= 500;
  const expiryReady = !expiresAt || (
    Number.isFinite(Date.parse(expiresAt)) &&
    Date.parse(expiresAt) > Date.now()
  );

  async function setExplicitDenial(active: boolean, denial: ProfileDenial | null = null) {
    if (self || customer || saving) return;
    if (active && !reasonReady) {
      setError('سبب المنع الصريح مطلوب، ويجب أن يكون بين 5 و500 حرف.');
      return;
    }
    if (active && !expiryReady) {
      setError('تاريخ انتهاء المنع يجب أن يكون في المستقبل.');
      return;
    }
    const capabilityKey = denial?.capability_key ?? selectedCapabilityKey;
    if (!capabilityKey) {
      setError('اختر قدرة من قاموس القدرات أولاً.');
      return;
    }
    setSaving(true);
    setError('');
    setNotice('');
    try {
      const { data, error: rpcError } = await supabase.rpc('set_authorization_profile_denial', {
        p_target_profile_id: profile.profile_id,
        p_capability_key: capabilityKey,
        p_reason: active ? reason.trim() : null,
        p_expires_at: active && expiresAt ? new Date(expiresAt).toISOString() : null,
        p_is_active: active,
      });
      if (rpcError) throw rpcError;
      const result = data as {
        changed?: unknown;
        denial_id?: unknown;
        is_active?: unknown;
      } | null;
      if (
        !result ||
        typeof result.changed !== 'boolean' ||
        result.is_active !== active ||
        (active && typeof result.denial_id !== 'string')
      ) {
        throw new Error('لم يؤكد الخادم تغيير حالة المنع الصريح.');
      }
      setNotice(result.changed
        ? (active ? 'تم تفعيل المنع الصريح بعد تأكيد الخادم.' : 'تم إلغاء المنع الصريح بعد تأكيد الخادم.')
        : 'حالة المنع مطابقة لما هو مسجل؛ لم يُكرر سجل التدقيق.');
      setReason('');
      setExpiresAt('');
      await load();
    } catch (cause) {
      const detail = cause instanceof Error ? cause.message : '';
      const message = detail.includes('last active organization administrator')
        ? 'رُفض المنع لحماية آخر مسؤول نشط من فقد صلاحيات إدارة المؤسسة.'
        : detail || 'رفض الخادم تغيير المنع الصريح أو تعذر تأكيده.';
      await load();
      setError(message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <section style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid #e5eeee' }}>
      <button
        type="button"
        className="btn btn-outline"
        aria-expanded={expanded}
        aria-controls={'capability-denials-' + profile.profile_id}
        onClick={() => setExpanded((value) => !value)}
        disabled={self || customer}
      >
        {expanded ? 'إخفاء المنع الصريح' : 'إدارة المنع الصريح للقدرات'}
      </button>
      {self ? <p role="note">لا يمكن لهذه الشاشة تعديل منع صلاحيات حساب المسؤول نفسه.</p> : null}
      {customer ? <p role="note">حساب العميل منفصل عن إدارة صلاحيات الموظفين.</p> : null}
      {expanded && !self && !customer ? (
        <div id={'capability-denials-' + profile.profile_id} style={{ marginTop: 12, display: 'grid', gap: 10 }}>
          <p style={{ margin: 0, color: '#62777b', lineHeight: 1.7 }}>
            المنع الصريح يتغلب على منح الدور. اختر قدرة محددة، وسجل السبب ومدة المنع عند الحاجة. إلغاء المنع لا ينشئ منحة جديدة؛ يعيد تقييم منح الدور والنطاق الأصليين فقط.
          </p>
          {loading ? <p role="status">جار تحميل قاموس القدرات وسجل المنع...</p> : null}
          {error ? (
            <div role="alert" className="error-box">
              {error}
              <button type="button" className="btn btn-outline" onClick={() => void load()} disabled={loading || saving}>إعادة المحاولة</button>
            </div>
          ) : null}
          {capabilities.length > 0 ? (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))', gap: 8, alignItems: 'end' }}>
              <label style={{ display: 'grid', gap: 5 }}>
                <span>القدرة المستهدفة</span>
                <select
                  aria-label={'القدرة المطلوب منعها عن ' + profile.full_name}
                  value={selectedCapabilityKey}
                  onChange={(event) => setSelectedCapabilityKey(event.target.value)}
                  disabled={loading || saving}
                  style={{ width: '100%', padding: 9, border: '1px solid #d5e7e9', borderRadius: 8 }}
                >
                  {capabilities.map((capability) => (
                    <option key={capability.capability_key} value={capability.capability_key}>
                      {capability.capability_key} — {capability.domain}
                    </option>
                  ))}
                </select>
              </label>
              <label style={{ display: 'grid', gap: 5 }}>
                <span>سبب المنع (مطلوب)</span>
                <input
                  aria-label={'سبب المنع الصريح لـ ' + profile.full_name}
                  value={reason}
                  onChange={(event) => setReason(event.target.value)}
                  maxLength={500}
                  placeholder="اكتب سبباً محدداً للمنع"
                  disabled={saving}
                  style={{ width: '100%', padding: 9, border: '1px solid #d5e7e9', borderRadius: 8 }}
                />
              </label>
              <label style={{ display: 'grid', gap: 5 }}>
                <span>انتهاء المنع (اختياري)</span>
                <input
                  type="datetime-local"
                  aria-label={'تاريخ انتهاء المنع الصريح لـ ' + profile.full_name}
                  value={expiresAt}
                  onChange={(event) => setExpiresAt(event.target.value)}
                  disabled={saving}
                  aria-invalid={!expiryReady}
                  style={{ width: '100%', padding: 9, border: '1px solid #d5e7e9', borderRadius: 8 }}
                />
              </label>
              <button
                type="button"
                className="btn primary"
                onClick={() => void setExplicitDenial(true)}
                disabled={loading || saving || !selectedCapabilityKey || !reasonReady || !expiryReady}
              >
                {saving ? 'جار الحفظ...' : selectedDenial?.is_active ? 'تحديث المنع الصريح' : 'تفعيل المنع الصريح'}
              </button>
            </div>
          ) : !loading ? (
            <p role="status">لم يُرجع الخادم قدرات نشطة متاحة للإدارة.</p>
          ) : null}
          {notice ? <p role="status" style={{ margin: 0 }}>{notice}</p> : null}
          {denials.length > 0 ? (
            <div style={{ display: 'grid', gap: 8 }}>
              <strong>سجل المنع الصريح</strong>
              {denials.map((denial) => {
                const effective = denial.is_active &&
                  (!denial.expires_at || Date.parse(denial.expires_at) > Date.now());
                return (
                  <div key={denial.denial_id} style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', alignItems: 'center', border: '1px solid #e5eeee', borderRadius: 9, padding: 10 }}>
                    <div>
                      <strong>{denial.capability_key}</strong>
                      <div style={{ fontSize: 12, color: '#71868a', lineHeight: 1.6 }}>
                        {denial.reason}
                        {denial.expires_at ? ' · ينتهي ' + new Date(denial.expires_at).toLocaleString('ar') : ''}
                      </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      <span className={effective ? 'badge warning' : 'badge info'}>
                        {effective ? 'منع نافذ' : denial.is_active ? 'منع منتهي' : 'ملغى'}
                      </span>
                      {denial.is_active ? (
                        <button
                          type="button"
                          className="btn btn-outline"
                          onClick={() => void setExplicitDenial(false, denial)}
                          disabled={saving || loading}
                        >
                          {saving ? 'جار الإلغاء...' : 'إلغاء المنع'}
                        </button>
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

function CustomerManagerProfileCard({
  profile,
  currentProfileId,
  savingId,
  fallback,
  onFallbackChange,
  onUpdate,
}: {
  profile: Profile;
  currentProfileId: string;
  savingId: string | null;
  fallback: Record<string, string>;
  onFallbackChange: (profileId: string, role: string) => void;
  onUpdate: (profile: Profile, enable: boolean) => void;
}) {
  const assigned = profile.roles.includes('customer_manager');
  const self = profile.profile_id === currentProfileId;
  const customer = profile.roles.includes('customer');
  const otherRoles = profile.roles.filter((role) => role !== 'customer_manager');
  const needsAlternative = assigned && otherRoles.length === 0;
  const busy = savingId === profile.profile_id;
  const fallbackRole = fallback[profile.profile_id] ?? '';

  return (
    <article style={{ border: '1px solid #dcebed', borderRadius: 12, padding: 13, background: '#fff' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <strong>{profile.full_name}</strong>
          <div style={{ color: '#71868a', fontSize: 12 }}>{profile.email ?? 'بريد غير مسجل'}</div>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
          <ProfileRoleBadges roles={profile.roles} />
        </div>
      </div>
      {needsAlternative && !self ? (
        <ProfileFallbackRoleSelect
          profile={profile}
          value={fallbackRole}
          disabled={busy}
          onChange={(value) => onFallbackChange(profile.profile_id, value)}
        />
      ) : null}
      <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
        <ProfileRoleActionButton
          profile={profile}
          assigned={assigned}
          self={self}
          customer={customer}
          busy={busy}
          saving={savingId !== null}
          needsAlternative={needsAlternative}
          hasFallback={Boolean(fallbackRole)}
          onUpdate={onUpdate}
        />
        <ProfileRoleNotes
          assigned={assigned}
          self={self}
          customer={customer}
          needsAlternative={needsAlternative}
        />
      </div>
      <ResourceScopePanel profile={profile} currentProfileId={currentProfileId} />
      <CapabilityDenialPanel profile={profile} currentProfileId={currentProfileId} />
    </article>
  );
}

function CustomerManagerProfileList({
  profiles,
  loading,
  currentProfileId,
  savingId,
  fallback,
  onFallbackChange,
  onUpdate,
}: {
  profiles: Profile[];
  loading: boolean;
  currentProfileId: string;
  savingId: string | null;
  fallback: Record<string, string>;
  onFallbackChange: (profileId: string, role: string) => void;
  onUpdate: (profile: Profile, enable: boolean) => void;
}) {
  if (loading) return <p role="status">جار تحميل مستخدمي المؤسسة…</p>;
  if (profiles.length === 0) return <p role="status">لا توجد حسابات نشطة مطابقة في المؤسسة الحالية.</p>;

  return (
    <div style={{ display: 'grid', gap: 10 }}>
      {profiles.map((profile) => (
        <CustomerManagerProfileCard
          key={profile.profile_id}
          profile={profile}
          currentProfileId={currentProfileId}
          savingId={savingId}
          fallback={fallback}
          onFallbackChange={onFallbackChange}
          onUpdate={onUpdate}
        />
      ))}
    </div>
  );
}

type SimulatedAuthorizationDecision = {
  decision: 'PERMIT' | 'DENY' | 'REQUIRES_APPROVAL';
  capability_key: string;
  target_profile_id: string;
  scope_kind?: string;
  scope_resource_id?: string | null;
  scope_assignment_id?: string | null;
  reason: string;
  source?: string;
  grant_source?: string;
  approval_mode?: string;
  separation_of_duties?: boolean;
  sensitivity?: string;
};

function AuthorizationDecisionSimulator({ profile }: { profile: Profile }) {
  const [expanded, setExpanded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [evaluating, setEvaluating] = useState(false);
  const [capabilities, setCapabilities] = useState<CapabilityOption[]>([]);
  const [resources, setResources] = useState<ScopeResourceCatalog>({ warehouses: [], customers: [] });
  const [selectedCapabilityKey, setSelectedCapabilityKey] = useState('');
  const [selectedResourceId, setSelectedResourceId] = useState('');
  const [decision, setDecision] = useState<SimulatedAuthorizationDecision | null>(null);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [capabilityResponse, resourceResponse] = await Promise.all([
        supabase.rpc('list_authorization_capability_registry'),
        supabase.rpc('list_authorization_scope_resources'),
      ]);
      if (capabilityResponse.error) throw capabilityResponse.error;
      if (resourceResponse.error) throw resourceResponse.error;
      const nextCapabilities = normalizeCapabilityOptions(capabilityResponse.data);
      const nextResources = normalizeScopeResourceCatalog(resourceResponse.data);
      setCapabilities(nextCapabilities);
      setResources(nextResources);
      setSelectedCapabilityKey((current) =>
        current && nextCapabilities.some((capability) => capability.capability_key === current)
          ? current
          : nextCapabilities[0]?.capability_key ?? '',
      );
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'تعذر تحميل القدرات والموارد للمحاكاة.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (expanded) void load();
  }, [expanded, load]);

  const selectedCapability = capabilities.find(
    (capability) => capability.capability_key === selectedCapabilityKey,
  ) ?? null;
  const scopeKind = selectedCapability?.scope_kind;
  const resourceRequired = scopeKind === 'warehouse' || scopeKind === 'assigned_customer';
  const resourceOptions = scopeKind === 'warehouse'
    ? resources.warehouses
    : scopeKind === 'assigned_customer'
      ? resources.customers
      : [];
  const resourceReady = !resourceRequired || (
    Boolean(selectedResourceId) &&
    resourceOptions.some((resource) => resource.id === selectedResourceId)
  );

  useEffect(() => {
    setSelectedResourceId((current) =>
      current && resourceOptions.some((resource) => resource.id === current)
        ? current
        : resourceOptions[0]?.id ?? '',
    );
    setDecision(null);
  }, [selectedCapabilityKey, resources]);

  async function evaluate() {
    if (!selectedCapability || !resourceReady || evaluating) return;
    setEvaluating(true);
    setError('');
    setDecision(null);
    try {
      const { data, error: rpcError } = await supabase.rpc('evaluate_authorization_profile_decision_v2', {
        p_target_profile_id: profile.profile_id,
        p_capability_key: selectedCapability.capability_key,
        p_resource_id: resourceRequired ? selectedResourceId : null,
      });
      if (rpcError) throw rpcError;
      const decoded = typeof data === 'string' ? JSON.parse(data) as unknown : data;
      if (!decoded || typeof decoded !== 'object' || Array.isArray(decoded)) {
        throw new Error('أعاد الخادم نتيجة محاكاة غير صالحة.');
      }
      const result = decoded as Record<string, unknown>;
      if (
        !['PERMIT', 'DENY', 'REQUIRES_APPROVAL'].includes(String(result.decision)) ||
        result.capability_key !== selectedCapability.capability_key ||
        result.target_profile_id !== profile.profile_id ||
        typeof result.reason !== 'string'
      ) {
        throw new Error('لم يؤكد الخادم قرار المحاكاة للموظف والقدرة المحددين.');
      }
      setDecision(result as unknown as SimulatedAuthorizationDecision);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'تعذر تقييم قرار الصلاحية.');
    } finally {
      setEvaluating(false);
    }
  }

  const decisionLabel = decision?.decision === 'PERMIT'
    ? 'مسموح'
    : decision?.decision === 'REQUIRES_APPROVAL'
      ? 'يتطلب موافقة'
      : decision?.decision === 'DENY'
        ? 'مرفوض'
        : '';

  return (
    <section style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid #e5eeee' }}>
      <button
        type="button"
        className="btn btn-outline"
        aria-expanded={expanded}
        aria-controls={'authorization-simulator-' + profile.profile_id}
        onClick={() => setExpanded((value) => !value)}
      >
        {expanded ? 'إخفاء محاكي الصلاحيات' : 'محاكاة قرار الصلاحية'}
      </button>
      {expanded ? (
        <div id={'authorization-simulator-' + profile.profile_id} style={{ marginTop: 12, display: 'grid', gap: 10 }}>
          <p style={{ margin: 0, color: '#62777b', lineHeight: 1.7 }}>
            تقييم قراءة فقط للعضو المحدد. لا ينفذ العملية ولا يغير المنح أو النطاقات.
          </p>
          {loading ? <p role="status">جار تحميل سجل القدرات والموارد...</p> : null}
          {error ? <p role="alert" className="error-box">{error}</p> : null}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))', gap: 8, alignItems: 'end' }}>
            <label style={{ display: 'grid', gap: 5 }}>
              <span>القدرة</span>
              <select
                aria-label={'قدرة لمحاكاتها لـ ' + profile.full_name}
                value={selectedCapabilityKey}
                onChange={(event) => {
                  setSelectedCapabilityKey(event.target.value);
                  setDecision(null);
                }}
                disabled={loading || evaluating || capabilities.length === 0}
                style={{ width: '100%', padding: 9, border: '1px solid #d5e7e9', borderRadius: 8 }}
              >
                {capabilities.map((capability) => (
                  <option key={capability.capability_key} value={capability.capability_key}>
                    {capability.capability_key} — {capability.domain}
                  </option>
                ))}
              </select>
            </label>
            {resourceRequired ? (
              <label style={{ display: 'grid', gap: 5 }}>
                <span>{scopeKind === 'warehouse' ? 'المستودع' : 'العميل المسند'}</span>
                <select
                  aria-label={'المورد لمحاكاة ' + selectedCapabilityKey}
                  value={selectedResourceId}
                  onChange={(event) => {
                    setSelectedResourceId(event.target.value);
                    setDecision(null);
                  }}
                  disabled={loading || evaluating || resourceOptions.length === 0}
                  style={{ width: '100%', padding: 9, border: '1px solid #d5e7e9', borderRadius: 8 }}
                >
                  {resourceOptions.map((resource) => (
                    <option key={resource.id} value={resource.id}>
                      {resource.name}{resource.code ? ' — ' + resource.code : ''}
                    </option>
                  ))}
                </select>
              </label>
            ) : (
              <p role="note" style={{ margin: 0, alignSelf: 'center' }}>
                {scopeKind === 'organization'
                  ? 'نطاق المؤسسة — لا يحتاج إلى مورد محدد.'
                  : 'هذا النطاق غير مدعوم حالياً؛ سيعيد الخادم المنع الافتراضي.'}
              </p>
            )}
            <button
              type="button"
              className="btn primary"
              onClick={() => void evaluate()}
              disabled={loading || evaluating || !selectedCapabilityKey || !resourceReady}
            >
              {evaluating ? 'جار تقييم السياسة...' : 'تقييم القرار'}
            </button>
          </div>
          {resourceRequired && resourceOptions.length === 0 && !loading ? (
            <p role="status">لا توجد موارد مناسبة لهذا النوع من النطاق داخل المؤسسة.</p>
          ) : null}
          {decision ? (
            <div role="status" aria-live="polite" style={{ border: '1px solid #d9e7e8', borderRadius: 10, padding: 12, display: 'grid', gap: 7 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <strong>{decisionLabel}</strong>
                <code>{decision.decision}</code>
              </div>
              <div>{decision.reason}</div>
              <div style={{ color: '#71868a', fontSize: 12, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                {decision.source ? <span>مصدر القرار: {decision.source}</span> : null}
                {decision.grant_source ? <span>مصدر المنحة: {decision.grant_source}</span> : null}
                {decision.scope_kind ? <span>النطاق: {decision.scope_kind}</span> : null}
                {decision.approval_mode ? <span>مسار الموافقة: {decision.approval_mode}</span> : null}
                {decision.separation_of_duties ? <span>فصل الواجبات: مطلوب</span> : null}
                {decision.sensitivity ? <span>الحساسية: {decision.sensitivity}</span> : null}
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

export type AuthorizationMemberProfile = Profile;

export function MemberAuthorizationAccessControls({
  profile,
  currentProfileId,
}: {
  profile: AuthorizationMemberProfile;
  currentProfileId: string;
}) {
  return (
    <>
      <ResourceScopePanel profile={profile} currentProfileId={currentProfileId} />
      <CapabilityDenialPanel profile={profile} currentProfileId={currentProfileId} />
      <AuthorizationDecisionSimulator profile={profile} />
    </>
  );
}

export function CustomerManagerRoleAssignment({
  currentProfileId,
  onNotice,
}: {
  currentProfileId: string;
  onNotice: (message: string) => void;
}) {
  const [rows, setRows] = useState<Profile[]>([]);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [fallback, setFallback] = useState<Record<string, string>>({});
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const { data, error: rpcError } = await supabase.rpc('list_organization_user_roles');
      if (rpcError) throw rpcError;
      setRows(normalizeOrganizationProfiles(data));
    } catch {
      setError('تعذر تحميل حسابات المؤسسة. تحقق من صلاحيات المدير واتصال الخادم.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const visible = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase();
    return rows.filter((profile) =>
      !needle ||
      (profile.full_name + ' ' + (profile.email ?? '')).toLocaleLowerCase().includes(needle),
    );
  }, [rows, query]);

  async function updateRole(profile: Profile, enable: boolean) {
    if (savingId !== null || profile.profile_id === currentProfileId) return;

    const currentRoles = sorted(profile.roles);
    if (enable && currentRoles.includes('customer')) {
      setError('لا يمكن دمج حساب العميل مع دور داخلي؛ لم يُجر أي تغيير.');
      return;
    }

    const nextRoles = enable
      ? sorted([...currentRoles, 'customer_manager'])
      : currentRoles.filter((role) => role !== 'customer_manager');

    if (!enable && nextRoles.length === 0) {
      const alternative = fallback[profile.profile_id];
      if (!FALLBACK_ROLES.some((option) => option.value === alternative)) {
        setError('اختر دورًا بديلًا صراحة قبل إزالة الدور الوحيد؛ لن تُمنح صلاحيات أوسع تلقائيًا.');
        return;
      }
      nextRoles.push(alternative);
    }

    setSavingId(profile.profile_id);
    setError('');

    try {
      const { data, error: rpcError } = await supabase.rpc('set_organization_user_roles_v2', {
        p_profile_id: profile.profile_id,
        p_expected_roles: currentRoles,
        p_roles: nextRoles,
      });
      if (rpcError) throw rpcError;

      const result = data as { profile_id?: string; roles?: unknown; previous_roles?: unknown; changed?: unknown } | null;
      const responseRoles = Array.isArray(result?.roles)
        ? sorted(result.roles.filter((role): role is string => typeof role === 'string'))
        : null;
      const previousRoles = Array.isArray(result?.previous_roles)
        ? sorted(result.previous_roles.filter((role): role is string => typeof role === 'string'))
        : null;
      if (
        !result ||
        result.profile_id !== profile.profile_id ||
        !responseRoles ||
        JSON.stringify(responseRoles) !== JSON.stringify(nextRoles) ||
        !previousRoles ||
        JSON.stringify(previousRoles) !== JSON.stringify(currentRoles) ||
        typeof result.changed !== 'boolean'
      ) {
        throw new Error('unconfirmed server result');
      }

      onNotice(
        result.changed
          ? (enable ? 'تم إسناد دور مسؤول العملاء إلى ' : 'تم تحديث أدوار ') + profile.full_name + ' بعد تأكيد الخادم.'
          : 'الأدوار مطابقة بالفعل لما هو محفوظ على الخادم.',
      );
      await load();
    } catch (cause) {
      if (isRoleRevisionConflict(cause)) await load();
      setError(roleUpdateErrorMessage(cause));
    } finally {
      setSavingId(null);
    }
  }

  const updateFallback = (profileId: string, role: string) => {
    setFallback((current) => ({ ...current, [profileId]: role }));
  };

  return (
    <section className="panel" dir="rtl" aria-labelledby="customer-manager-role-title" style={{ marginTop: 18, padding: 20 }}>
      <CustomerManagerRoleHeading />
      <CustomerManagerRoleSearch value={query} onChange={setQuery} />
      <CustomerManagerRoleFeedback error={error} loading={loading} onRetry={() => void load()} />
      <CustomerManagerProfileList
        profiles={visible}
        loading={loading}
        currentProfileId={currentProfileId}
        savingId={savingId}
        fallback={fallback}
        onFallbackChange={updateFallback}
        onUpdate={(profile, enable) => void updateRole(profile, enable)}
      />
    </section>
  );
}
