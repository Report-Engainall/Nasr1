import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, LogOut, MonitorSmartphone, RefreshCw, ShieldCheck } from 'lucide-react';
import { supabase } from '@/lib/supabase';

type SessionSummary = { sessionId: string | null; expiresAt: number | null; email: string; deviceLabel: string };

function deviceLabel(userAgent: string): string {
  const platform = /Android/i.test(userAgent) ? 'Android'
    : /iPhone|iPad|iPod/i.test(userAgent) ? 'iOS'
    : /Windows/i.test(userAgent) ? 'Windows'
    : /Macintosh|Mac OS/i.test(userAgent) ? 'macOS'
    : /Linux/i.test(userAgent) ? 'Linux' : 'جهاز غير محدد';
  const browser = /Edg\//i.test(userAgent) ? 'Microsoft Edge'
    : /Firefox\//i.test(userAgent) ? 'Firefox'
    : /Chrome\//i.test(userAgent) ? 'Chrome'
    : /Safari\//i.test(userAgent) ? 'Safari' : 'متصفح غير محدد';
  return platform + ' · ' + browser;
}

function sessionClaims(token: string): { sessionId: string | null; expiresAt: number | null } {
  try {
    const payload = token.split('.')[1];
    if (!payload) return { sessionId: null, expiresAt: null };
    const normalized = payload.replace(/-/g, '+').replace(/_/g, '/');
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
    const claims = JSON.parse(window.atob(padded)) as { session_id?: unknown; exp?: unknown };
    return {
      sessionId: typeof claims.session_id === 'string' ? claims.session_id : null,
      expiresAt: typeof claims.exp === 'number' && Number.isFinite(claims.exp) ? claims.exp : null,
    };
  } catch { return { sessionId: null, expiresAt: null }; }
}

export function DeviceManagement({ onNotice }: { onNotice: (message: string) => void }) {
  const [session, setSession] = useState<SessionSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [action, setAction] = useState<'others' | 'current' | null>(null);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const { data, error: sessionError } = await supabase.auth.getSession();
      if (sessionError) throw sessionError;
      if (!data.session) {
        setSession(null);
        setError('لا توجد جلسة دخول نشطة لهذا المتصفح. سجّل الدخول من جديد.');
        return;
      }
      const claims = sessionClaims(data.session.access_token);
      setSession({
        sessionId: claims.sessionId,
        expiresAt: data.session.expires_at ?? claims.expiresAt,
        email: data.session.user.email ?? '',
        deviceLabel: deviceLabel(typeof navigator === 'undefined' ? '' : navigator.userAgent),
      });
    } catch {
      setError('تعذر قراءة جلسة المصادقة الحالية. أعد المحاولة قبل تنفيذ أي إجراء.');
    } finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  async function signOutOthers() {
    setAction('others'); setError('');
    try {
      const { error: revokeError } = await supabase.auth.signOut({ scope: 'others' });
      if (revokeError) throw revokeError;
      onNotice('أكدت خدمة المصادقة إبطال جلسات التجديد الأخرى لهذا الحساب.');
      await load();
    } catch {
      setError('تعذر إبطال جلسات الأجهزة الأخرى. لم يتم تأكيد العملية؛ أعد المحاولة.');
    } finally { setAction(null); }
  }
  async function signOutCurrent() {
    setAction('current'); setError('');
    try {
      const { error: signOutError } = await supabase.auth.signOut({ scope: 'local' });
      if (signOutError) throw signOutError;
      onNotice('تم تسجيل الخروج من هذا الجهاز.');
    } catch { setError('تعذر تسجيل الخروج من هذا الجهاز.'); }
    finally { setAction(null); }
  }

  return <section className="panel" dir="rtl" aria-labelledby="device-management-title" style={{ padding: 22 }}>
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <MonitorSmartphone size={24} aria-hidden="true" />
      <div><h1 id="device-management-title" style={{ margin: 0 }}>الأجهزة والجلسات</h1>
        <p style={{ margin: '5px 0 0', lineHeight: 1.7 }}>معلومات الجلسة الحالية وإجراءات الخروج المؤكدة من خدمة المصادقة.</p></div>
    </div>
    <div className="privacy-note" style={{ marginTop: 16, lineHeight: 1.8 }}>
      تعرض هذه الصفحة المتصفح الحالي فقط ولا تدّعي وجود قائمة بأجهزة المؤسسة. إبطال الجلسات الأخرى يخص الحساب الحالي ولا يخص مستخدمين آخرين.
    </div>
    {error && <div role="alert" className="error-box" style={{ display: 'block', marginTop: 14 }}>{error}</div>}
    {loading ? <p role="status" style={{ marginTop: 18 }}>جار قراءة جلسة الدخول…</p> : session ? (
      <article style={{ border: '1px solid #dcebed', borderRadius: 14, padding: 16, marginTop: 18 }}>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <ShieldCheck size={21} aria-hidden="true" />
          <div><strong>الجلسة الحالية</strong><div style={{ fontSize: 13, color: '#71868a', marginTop: 3 }}>{session.deviceLabel}</div></div>
          <span className="badge success" style={{ marginInlineStart: 'auto' }}>نشطة محليًا</span>
        </div>
        <dl style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(190px,1fr))', gap: 12, marginTop: 18 }}>
          <div><dt style={{ color: '#71868a', fontSize: 12 }}>الحساب</dt><dd style={{ margin: '4px 0', overflowWrap: 'anywhere' }}>{session.email || 'بريد غير متاح'}</dd></div>
          <div><dt style={{ color: '#71868a', fontSize: 12 }}>معرّف الجلسة</dt><dd style={{ margin: '4px 0', fontFamily: 'monospace' }}>{session.sessionId ? session.sessionId.slice(0, 8) + '…' : 'غير متاح'}</dd></div>
          <div><dt style={{ color: '#71868a', fontSize: 12 }}>انتهاء رمز الوصول</dt><dd style={{ margin: '4px 0' }}>{session.expiresAt ? new Date(session.expiresAt * 1000).toLocaleString('ar') : 'غير متاح'}</dd></div>
        </dl>
      </article>
    ) : null}
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginTop: 18 }}>
      <button type="button" className="btn btn-outline" onClick={() => void load()} disabled={loading || action !== null}>
        <RefreshCw size={16} /> تحديث الجلسة
      </button>
      <button type="button" className="btn primary" aria-label="تسجيل الخروج من الأجهزة الأخرى"
        onClick={() => void signOutOthers()} disabled={!session || loading || action !== null}>
        {action === 'others' ? <RefreshCw size={16} className="spin" /> : <ShieldCheck size={16} />}
        {action === 'others' ? 'جار إبطال الجلسات…' : 'تسجيل الخروج من الأجهزة الأخرى'}
      </button>
      <button type="button" className="btn btn-outline" aria-label="تسجيل الخروج من هذا الجهاز"
        onClick={() => void signOutCurrent()} disabled={!session || loading || action !== null}>
        <LogOut size={16} /> {action === 'current' ? 'جار تسجيل الخروج…' : 'تسجيل الخروج من هذا الجهاز'}
      </button>
    </div>
    <p style={{ fontSize: 12, color: '#71868a', lineHeight: 1.8, marginTop: 14 }}>
      قد تبقى رموز الوصول الصادرة سابقًا صالحة حتى انتهاء مدتها بعد إبطال جلسات التجديد.
    </p>
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 8, fontSize: 12, color: '#71868a' }}>
      <AlertTriangle size={14} aria-hidden="true" /> لا تُخزن رموز الوصول أو التجديد في سجل الأجهزة.
    </div>
  </section>;
}
