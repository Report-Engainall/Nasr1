import { useCallback, useEffect, useMemo, useState } from 'react';
import { Check, RefreshCw, ShieldCheck, UserCog } from 'lucide-react';
import { fetchActiveInventoryWarehouses } from '@/lib/api';
import type { ActiveInventoryWarehouse } from '@/lib/api';
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

function roleUpdateErrorMessage(cause: unknown): string {
  const detail = cause instanceof Error ? cause.message : '';
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

function WarehouseScopePanel({
  profile,
  currentProfileId,
}: {
  profile: Profile;
  currentProfileId: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [savingResourceId, setSavingResourceId] = useState<string | null>(null);
  const [warehouses, setWarehouses] = useState<ActiveInventoryWarehouse[]>([]);
  const [scopes, setScopes] = useState<ProfileScope[]>([]);
  const [selectedWarehouseId, setSelectedWarehouseId] = useState('');
  const [reason, setReason] = useState('');
  const [expiresAt, setExpiresAt] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [warehouseRows, scopeResponse] = await Promise.all([
        fetchActiveInventoryWarehouses(),
        supabase.rpc('list_authorization_profile_scopes', {
          p_target_profile_id: profile.profile_id,
        }),
      ]);
      if (scopeResponse.error) throw scopeResponse.error;
      setWarehouses(warehouseRows);
      setScopes(normalizeProfileScopes(scopeResponse.data));
      setSelectedWarehouseId((current) =>
        current && warehouseRows.some((warehouse) => warehouse.id === current)
          ? current
          : warehouseRows[0]?.id ?? '',
      );
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'تعذر تحميل نطاقات المستودعات من الخادم.');
    } finally {
      setLoading(false);
    }
  }, [profile.profile_id]);

  useEffect(() => {
    if (expanded) void load();
  }, [expanded, load]);

  const warehouseScopes = useMemo(
    () => scopes.filter((scope) => scope.scope_kind === 'warehouse' && scope.warehouse_id),
    [scopes],
  );
  const activeWarehouseIds = useMemo(
    () => new Set(warehouseScopes
      .filter((scope) => scope.is_active &&
        (!scope.expires_at || Date.parse(scope.expires_at) > Date.now()) &&
        Date.parse(scope.valid_from) <= Date.now())
      .map((scope) => scope.warehouse_id as string)),
    [warehouseScopes],
  );
  const self = profile.profile_id === currentProfileId;
  const customer = profile.roles.includes('customer');
  const selectedScope = warehouseScopes.find((scope) => scope.warehouse_id === selectedWarehouseId) ?? null;
  const reasonReady = reason.trim().length >= 5 && reason.trim().length <= 500;
  const expiryReady = !expiresAt || (
    Number.isFinite(Date.parse(expiresAt)) &&
    Date.parse(expiresAt) > Date.now()
  );

  async function saveWarehouseScope(warehouseId: string, existing: ProfileScope | null, active: boolean) {
    if (self || customer || savingResourceId !== null) return;
    if (!reasonReady) {
      setError('أدخل سبباً واضحاً من 5 إلى 500 حرف قبل تغيير نطاق الوصول.');
      return;
    }
    setSavingResourceId(warehouseId);
    setError('');
    setNotice('');
    try {
      const { data, error: rpcError } = await supabase.rpc('set_authorization_profile_scope', {
        p_target_profile_id: profile.profile_id,
        p_scope_kind: 'warehouse',
        p_scope_id: warehouseId,
        p_reason: reason.trim(),
        p_expires_at: active && expiresAt ? new Date(expiresAt).toISOString() : null,
        p_is_active: active,
        p_expected_revision: existing?.revision ?? 0,
      });
      if (rpcError) throw rpcError;
      const result = data as {
        changed?: unknown;
        scope_id?: unknown;
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
        (result.scope_resource_id !== warehouseId && !confirmedIdempotentReplay) ||
        !Number.isSafeInteger(result.revision) ||
        result.is_active !== active
      ) {
        throw new Error('لم يؤكد الخادم إسناد نطاق المستودع بالإصدار المتوقع.');
      }
      setNotice(result.changed
        ? (active ? 'تم إسناد المستودع بعد تأكيد الخادم.' : 'تم سحب إسناد المستودع بعد تأكيد الخادم.')
        : 'النطاق مطابق للحالة الحالية؛ لم يُنشأ سجل تدقيق مكرر.');
      setReason('');
      setExpiresAt('');
      await load();
    } catch (cause) {
      const detail = cause instanceof Error ? cause.message : '';
      const message = detail.includes('scope revision changed')
        ? 'تغير النطاق بواسطة مسؤول آخر. أُعيد تحميل الإصدار الحالي؛ راجع الحالة قبل المحاولة.'
        : detail || 'رفض الخادم تغيير نطاق المستودع أو تعذر تأكيده.';
      await load();
      setError(message);
    } finally {
      setSavingResourceId(null);
    }
  }

  return (
    <section style={{ marginTop: 14, paddingTop: 12, borderTop: '1px solid #e5eeee' }}>
      <button
        type="button"
        className="btn btn-outline"
        aria-expanded={expanded}
        aria-controls={'warehouse-scope-' + profile.profile_id}
        onClick={() => setExpanded((value) => !value)}
        disabled={self || customer}
      >
        {expanded ? 'إخفاء نطاقات المستودعات' : 'إدارة نطاقات المستودعات'}
      </button>
      {self ? <p role="note">لا يمكن إسناد نطاقات إلى حساب المسؤول نفسه من هذه الشاشة.</p> : null}
      {customer ? <p role="note">حساب العميل منفصل عن عضوية الموظف ولا يقبل نطاق مستودع داخلي.</p> : null}
      {expanded && !self && !customer ? (
        <div id={'warehouse-scope-' + profile.profile_id} style={{ marginTop: 12, display: 'grid', gap: 10 }}>
          <p style={{ margin: 0, color: '#62777b', lineHeight: 1.7 }}>
            لا تمنح الأدوار وصولاً عاماً للمستودعات. يُسمح للموظف بالمستودعات النشطة المسندة إليه فقط، ويُسحب الوصول فور تعطيل الإسناد أو انتهاء مدته.
          </p>
          {loading ? <p role="status">جار تحميل المستودعات والنطاقات...</p> : null}
          {error ? (
            <div role="alert" className="error-box">
              {error}
              <button type="button" className="btn btn-outline" onClick={() => void load()} disabled={loading}>إعادة المحاولة</button>
            </div>
          ) : null}
          {!loading && warehouses.length === 0 ? (
            <p role="status">لا توجد مستودعات نشطة متاحة في المؤسسة الحالية.</p>
          ) : null}
          {warehouses.length > 0 ? (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))', gap: 8, alignItems: 'end' }}>
              <label style={{ display: 'grid', gap: 5 }}>
                <span>المستودع</span>
                <select
                  aria-label={'مستودع لإسناده إلى ' + profile.full_name}
                  value={selectedWarehouseId}
                  onChange={(event) => setSelectedWarehouseId(event.target.value)}
                  disabled={loading || savingResourceId !== null}
                  style={{ width: '100%', padding: 9, border: '1px solid #d5e7e9', borderRadius: 8 }}
                >
                  {warehouses.map((warehouse) => (
                    <option key={warehouse.id} value={warehouse.id}>
                      {warehouse.name}{warehouse.code ? ' — ' + warehouse.code : ''}
                    </option>
                  ))}
                </select>
              </label>
              <label style={{ display: 'grid', gap: 5 }}>
                <span>سبب التغيير (مطلوب)</span>
                <input
                  aria-label={'سبب تغيير نطاق المستودع لـ ' + profile.full_name}
                  value={reason}
                  onChange={(event) => setReason(event.target.value)}
                  maxLength={500}
                  placeholder="مثال: تكليف الموظف بمستودع صنعاء"
                  disabled={savingResourceId !== null}
                  style={{ width: '100%', padding: 9, border: '1px solid #d5e7e9', borderRadius: 8 }}
                />
              </label>
              <label style={{ display: 'grid', gap: 5 }}>
                <span>انتهاء الإسناد (اختياري)</span>
                <input
                  type="datetime-local"
                  aria-label={'تاريخ انتهاء نطاق المستودع لـ ' + profile.full_name}
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
                onClick={() => void saveWarehouseScope(selectedWarehouseId, selectedScope, true)}
                disabled={loading || savingResourceId !== null || !selectedWarehouseId || activeWarehouseIds.has(selectedWarehouseId) || !reasonReady || !expiryReady}
              >
                {savingResourceId === selectedWarehouseId ? 'جار الحفظ...' : selectedScope ? 'تفعيل / تجديد الإسناد' : 'إسناد المستودع'}
              </button>
            </div>
          ) : null}
          {notice ? <p role="status" style={{ margin: 0 }}>{notice}</p> : null}
          {warehouseScopes.length > 0 ? (
            <div style={{ display: 'grid', gap: 8 }}>
              <strong>النطاقات المسجلة</strong>
              {warehouseScopes.map((scope) => {
                const warehouse = warehouses.find((entry) => entry.id === scope.warehouse_id);
                const effective = activeWarehouseIds.has(scope.warehouse_id as string);
                return (
                  <div key={scope.scope_id} style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', alignItems: 'center', border: '1px solid #e5eeee', borderRadius: 9, padding: 10 }}>
                    <div>
                      <strong>{warehouse?.name ?? 'مستودع غير نشط أو غير متاح'}</strong>
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
                          onClick={() => void saveWarehouseScope(scope.warehouse_id as string, scope, false)}
                          disabled={savingResourceId !== null || !reasonReady}
                        >
                          {savingResourceId === scope.warehouse_id ? 'جار السحب...' : 'سحب الإسناد'}
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
      <WarehouseScopePanel profile={profile} currentProfileId={currentProfileId} />
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
      const { data, error: rpcError } = await supabase.rpc('set_organization_user_roles', {
        p_profile_id: profile.profile_id,
        p_roles: nextRoles,
      });
      if (rpcError) throw rpcError;

      const result = data as { profile_id?: string; roles?: unknown } | null;
      const responseRoles = Array.isArray(result?.roles)
        ? sorted(result.roles.filter((role): role is string => typeof role === 'string'))
        : null;
      if (
        !result ||
        result.profile_id !== profile.profile_id ||
        !responseRoles ||
        JSON.stringify(responseRoles) !== JSON.stringify(nextRoles)
      ) {
        throw new Error('unconfirmed server result');
      }

      onNotice(
        (enable ? 'تم إسناد دور مسؤول العملاء إلى ' : 'تم تحديث أدوار ') +
        profile.full_name + ' بعد تأكيد الخادم.',
      );
      await load();
    } catch (cause) {
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
