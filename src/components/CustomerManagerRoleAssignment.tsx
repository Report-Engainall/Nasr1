import { useCallback, useEffect, useMemo, useState } from 'react';
import { Check, RefreshCw, ShieldCheck, UserCog } from 'lucide-react';
import { supabase } from '@/lib/supabase';

type Profile = { profile_id: string; full_name: string; email: string | null; is_active: boolean; roles: string[] };
const ROLE_LABELS: Record<string, string> = {
  admin: 'مدير النظام', manager: 'مدير', staff: 'موظف تشغيل',
  accountant: 'محاسب', customer: 'عميل', customer_manager: 'مسؤول العملاء',
};
const FALLBACK_ROLES = [
  { value: 'staff', label: 'موظف تشغيل — صلاحيات تشغيلية' },
  { value: 'accountant', label: 'محاسب — صلاحيات مالية' },
] as const;
const sorted = (roles: string[]) => Array.from(new Set(roles)).sort();

export function CustomerManagerRoleAssignment({ currentProfileId, onNotice }: {
  currentProfileId: string; onNotice: (message: string) => void;
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
      const profiles = Array.isArray(data) ? data as Profile[] : [];
      setRows(profiles.filter((p) => typeof p.profile_id === 'string' &&
        typeof p.full_name === 'string' && Array.isArray(p.roles) && p.is_active === true)
        .map((p) => ({ ...p, roles: sorted(p.roles) })));
    } catch {
      setError('تعذر تحميل حسابات المؤسسة. تحقق من صلاحيات المدير واتصال الخادم.');
    } finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const visible = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase();
    return rows.filter((p) => !needle ||
      (p.full_name + ' ' + (p.email ?? '')).toLocaleLowerCase().includes(needle));
  }, [rows, query]);

  async function updateRole(profile: Profile, enable: boolean) {
    if (savingId !== null || profile.profile_id === currentProfileId) return;
    const current = sorted(profile.roles);
    let next: string[];
    if (enable) {
      if (current.includes('customer')) {
        setError('لا يمكن دمج حساب العميل مع دور داخلي؛ لم يُجر أي تغيير.');
        return;
      }
      next = sorted([...current, 'customer_manager']);
    } else {
      next = current.filter((role) => role !== 'customer_manager');
      if (!next.length) {
        const alternative = fallback[profile.profile_id];
        if (!FALLBACK_ROLES.some((option) => option.value === alternative)) {
          setError('اختر دورًا بديلًا صراحة قبل إزالة الدور الوحيد؛ لن تُمنح صلاحيات أوسع تلقائيًا.');
          return;
        }
        next = [alternative];
      }
    }

    setSavingId(profile.profile_id);
    setError('');
    try {
      const { data, error: rpcError } = await supabase.rpc('set_organization_user_roles', {
        p_profile_id: profile.profile_id, p_roles: next,
      });
      if (rpcError) throw rpcError;
      const result = data as { profile_id?: string; roles?: unknown } | null;
      const responseRoles = Array.isArray(result?.roles)
        ? sorted(result.roles.filter((role): role is string => typeof role === 'string'))
        : null;
      if (!result || result.profile_id !== profile.profile_id || !responseRoles ||
          JSON.stringify(responseRoles) !== JSON.stringify(next)) throw new Error('unconfirmed server result');
      onNotice((enable ? 'تم إسناد دور مسؤول العملاء إلى ' : 'تم تحديث أدوار ') +
        profile.full_name + ' بعد تأكيد الخادم.');
      await load();
    } catch (cause) {
      const detail = cause instanceof Error ? cause.message : '';
      setError(detail.includes('outside the current organization')
        ? 'رفض الخادم التعديل لأن الحساب خارج المؤسسة الحالية أو غير نشط.'
        : detail.includes('cannot change their own roles')
          ? 'لا يمكنك تعديل أدوار حسابك الحالي.'
          : 'رفض الخادم تغيير الأدوار أو تعذر تأكيده. لم تُعرض رسالة نجاح.');
    } finally { setSavingId(null); }
  }

  return <section className="panel" dir="rtl" aria-labelledby="customer-manager-role-title" style={{ marginTop: 18, padding: 20 }}>
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <ShieldCheck size={22} aria-hidden="true" />
      <div>
        <h2 id="customer-manager-role-title" style={{ margin: 0 }}>إسناد وإدارة دور مسؤول العملاء</h2>
        <p style={{ margin: '5px 0 0', lineHeight: 1.7 }}>تعمل هذه الواجهة عبر RPC مقيد بالمؤسسة ويسجل تغييرات الأدوار. لا يمكن تعديل دور حسابك الحالي.</p>
      </div>
    </div>
    <label style={{ display: 'block', margin: '14px 0' }}>
      <span style={{ display: 'block', marginBottom: 6, fontWeight: 700 }}>بحث بالاسم أو البريد</span>
      <input aria-label="البحث عن مستخدم لإسناد دور مسؤول العملاء" type="search" value={query}
        onChange={(event) => setQuery(event.target.value)} maxLength={254}
        placeholder="اسم المستخدم أو البريد الإلكتروني" style={{ width: '100%', maxWidth: 460, padding: '10px 12px', border: '1px solid #d5e7e9', borderRadius: 9 }} />
    </label>
    {error && <div role="alert" className="error-box" style={{ display: 'block', marginBottom: 12 }}>
      {error} <button type="button" className="btn btn-outline" onClick={() => void load()} disabled={loading}>
        <RefreshCw size={14} /> إعادة المحاولة
      </button>
    </div>}
    {loading ? <p role="status">جار تحميل مستخدمي المؤسسة…</p> : !visible.length
      ? <p role="status">لا توجد حسابات نشطة مطابقة في المؤسسة الحالية.</p>
      : <div style={{ display: 'grid', gap: 10 }}>
        {visible.map((profile) => {
          const assigned = profile.roles.includes('customer_manager');
          const self = profile.profile_id === currentProfileId;
          const customer = profile.roles.includes('customer');
          const otherRoles = profile.roles.filter((role) => role !== 'customer_manager');
          const needsAlternative = assigned && otherRoles.length === 0;
          const busy = savingId === profile.profile_id;
          return <article key={profile.profile_id} style={{ border: '1px solid #dcebed', borderRadius: 12, padding: 13, background: '#fff' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
              <div><strong>{profile.full_name}</strong><div style={{ color: '#71868a', fontSize: 12 }}>{profile.email ?? 'بريد غير مسجل'}</div></div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                {profile.roles.map((role) => <span className="badge info" key={role}>{ROLE_LABELS[role] ?? role}</span>)}
                {!profile.roles.length && <span className="badge warning">دون دور مسند</span>}
              </div>
            </div>
            {needsAlternative && !self && <label style={{ display: 'block', marginTop: 10 }}>
              <span style={{ display: 'block', marginBottom: 5 }}>الدور البديل بعد الإزالة</span>
              <select aria-label={'الدور البديل بعد إزالة مسؤول العملاء من ' + profile.full_name}
                value={fallback[profile.profile_id] ?? ''}
                onChange={(event) => setFallback((old) => ({ ...old, [profile.profile_id]: event.target.value }))}
                disabled={busy} style={{ width: '100%', maxWidth: 360, padding: 8 }}>
                <option value="">اختر دورًا بديلًا — مطلوب</option>
                {FALLBACK_ROLES.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
            </label>}
            <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
              {!assigned
                ? <button type="button" className="btn primary" aria-label={'إسناد مسؤول العملاء إلى ' + profile.full_name}
                    disabled={self || customer || busy || savingId !== null}
                    onClick={() => void updateRole(profile, true)}>
                    <UserCog size={16} /> {busy ? 'جار الحفظ…' : 'إسناد مسؤول العملاء'}
                  </button>
                : <button type="button" className="btn btn-outline" aria-label={'إزالة دور مسؤول العملاء من ' + profile.full_name}
                    disabled={self || busy || savingId !== null || (needsAlternative && !fallback[profile.profile_id])}
                    onClick={() => void updateRole(profile, false)}>
                    <Check size={16} /> {busy ? 'جار الحفظ…' : 'إزالة دور مسؤول العملاء'}
                  </button>}
              {self && <span role="note">لا يمكن تعديل أدوار حسابك الحالي.</span>}
              {!assigned && customer && <span role="note">حساب العميل لا يمكن دمجه مع دور داخلي.</span>}
              {needsAlternative && !self && <span role="note">اختر البديل؛ لا تُرفع الصلاحيات تلقائيًا.</span>}
            </div>
          </article>;
        })}
      </div>}
  </section>;
}
