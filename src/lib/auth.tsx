import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { supabase } from './supabase';
import { getAuthEmailRedirectUrl } from './auth-redirect';
import {
  normalizeAuthPhoneIdentifier,
  requestPhoneSignup,
  signInWithPhonePassword,
  resendPhoneSignupCode as resendPhoneSignupCodeRequest,
  verifyPhoneSignupCode,
} from './auth-phone';
export { normalizeAuthPhoneIdentifier } from './auth-phone';

export type AuthUser = { id: string; profileId: string; email: string; name: string; roles: string[]; isStaff: boolean };

/**
 * GoTrue can return an obfuscated user for a repeated, already-confirmed email
 * signup. An empty identities array without a session means no new account was
 * created and the submitted password was not applied.
 */
export function isObfuscatedEmailSignupResult(
  user: { identities?: readonly unknown[] | null } | null | undefined,
  hasSession: boolean,
): boolean {
  return !hasSession && user != null &&
    Array.isArray(user.identities) && user.identities.length === 0;
}

type AuthContextType = {
  user: AuthUser | null;
  sessionRevision: number;
  loading: boolean;
  ready: boolean;
  configurationError: string | null;
  signIn: (identifier: string, password: string) => Promise<void>;
  signUp: (identifier: string, password: string, fullName: string, method?: 'email' | 'phone', businessName?: string) => Promise<{ needsConfirmation: boolean; confirmationType: 'email' | 'phone'; existingAccount: boolean }>;
  verifyPhoneSignup: (phone: string, token: string) => Promise<void>;
  resendPhoneSignupCode: (phone: string) => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
  signOut: () => Promise<void>;
  signOutOtherSessions: () => Promise<void>;
  signOutEverywhere: () => Promise<void>;
};

const AuthContext = createContext<AuthContextType | null>(null);
const STAFF_ROLES = ['admin', 'manager', 'staff', 'accountant', 'customer_manager'];

function translateAuthError(message: string): string {
  const m = message.toLowerCase();
  if (m.includes('invalid login')) return 'بيانات الدخول غير صحيحة؛ تحقق من البريد أو الهاتف وكلمة المرور';
  if (m.includes('unsupported phone provider') || (m.includes('phone') && (m.includes('not enabled') || m.includes('disabled')))) return 'تسجيل الدخول برقم الهاتف غير مفعّل في إعدادات موفر المصادقة لهذا المشروع.';
  if (m.includes('phone not confirmed') || m.includes('phone is not confirmed')) return 'رقم الهاتف غير مؤكد لدى موفر المصادقة. أكمل التحقق أولاً.';
  if (m.includes('email not confirmed')) return 'يرجى تأكيد بريدك الإلكتروني أولاً من الرابط المرسل إليك';
  if (m.includes('already registered') || m.includes('already been registered')) return 'هذا البريد أو رقم الهاتف مسجل مسبقاً؛ سجّل الدخول بدلاً من إنشاء حساب جديد.';
  if (m.includes('password')) return 'كلمة المرور ضعيفة: استخدم 8 أحرف على الأقل';
  if (m.includes('rate limit')) return 'محاولات كثيرة، انتظر قليلاً ثم أعد المحاولة';
  return 'تعذر إكمال العملية، حاول مرة أخرى';
}

async function loadProfile(): Promise<AuthUser | null> {
  // A persisted session is only a local snapshot. Verify it with the active
  // Supabase Auth project before deriving a profile or tenant identity from it.
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
    if (sessionError) throw new Error('تعذر قراءة جلسة الحساب الحالية.');
    const session = sessionData.session;
    if (!session) return null;

    const { data: verifiedData, error: verifyError } = await supabase.auth.getUser();
    if (verifyError) {
      const invalidStoredSession = verifyError.status === 401 ||
        /invalid jwt|invalid token|refresh token.*(?:not found|expired)|jwt.*expired/i.test(verifyError.message);
      if (invalidStoredSession) {
        // This token does not belong to, or is no longer valid for, the active project.
        // Clear only the local session; never attempt to create or link a different user.
        await supabase.auth.signOut({ scope: 'local' }).catch(() => undefined);
        return null;
      }
      throw new Error('تعذر التحقق من هوية جلسة الحساب لدى مشروع Nasr1.');
    }

    const verifiedUser = verifiedData.user;
    if (!verifiedUser) {
      await supabase.auth.signOut({ scope: 'local' }).catch(() => undefined);
      return null;
    }

    // If the browser changed account while getUser was in flight, retry against
    // the latest session instead of pairing one user's token with another profile.
    const { data: currentSessionData, error: currentSessionError } = await supabase.auth.getSession();
    if (currentSessionError) throw new Error('تعذر إعادة التحقق من جلسة الحساب.');
    if (currentSessionData.session?.user.id !== verifiedUser.id || session.user.id !== verifiedUser.id) {
      continue;
    }

    const { data, error } = await supabase.rpc('ensure_profile', {
      _full_name: (verifiedUser.user_metadata?.['full_name'] as string | undefined) ?? '',
    });
    if (error || !data) throw new Error('تعذر تحميل ملف المستخدم من مشروع Nasr1.');

    const { data: confirmedSessionData, error: confirmedSessionError } = await supabase.auth.getSession();
    if (confirmedSessionError) throw new Error('تعذر تأكيد جلسة الحساب بعد تحميل الملف الشخصي.');
    if (confirmedSessionData.session?.user.id !== verifiedUser.id) {
      continue;
    }

    const p = data as { profile_id: string; full_name: string; email: string | null; roles: string[] };

    // Public self-service signup is completed only after Auth has verified the
    // phone or email. The RPC is idempotent and never assigns staff privileges.
    if (p.roles.includes('customer') && !p.roles.some((role) => STAFF_ROLES.includes(role))) {
      const { error: customerAccountError, data: customerAccount } = await supabase.rpc('ensure_my_customer_account');
      if (customerAccountError || !customerAccount) {
        throw new Error('تعذر إنشاء ملف العميل التجاري بعد التحقق من الحساب. تواصل مع الإدارة.');
      }
    }

    return {
      id: verifiedUser.id,
      profileId: p.profile_id,
      // Phone-authenticated users legitimately have no email address.
      email: p.email ?? verifiedUser.email ?? '',
      name: p.full_name,
      roles: p.roles,
      isStaff: p.roles.some((r) => STAFF_ROLES.includes(r)),
    };
  }

  throw new Error('تغيرت هوية جلسة الحساب أثناء تحميل الملف الشخصي؛ أعد المحاولة.');
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  // Invalidate auth-scoped client state when server membership/scope may have changed.
  const [sessionRevision, setSessionRevision] = useState(0);
  // Ignore profile reads that finish after a newer auth event changed the session scope.
  const refreshGeneration = useRef(0);
  const [loading, setLoading] = useState(false);
  const [ready, setReady] = useState(false);
  const [configurationError, setConfigurationError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const generation = ++refreshGeneration.current;
    try {
      const nextUser = await loadProfile();
      if (generation === refreshGeneration.current) setUser(nextUser);
    } catch {
      if (generation === refreshGeneration.current) setUser(null);
    } finally {
      if (generation === refreshGeneration.current) setReady(true);
    }
  }, []);

  useEffect(() => {
    let unsubscribe: (() => void) | undefined;
    try {
      const { data: sub } = supabase.auth.onAuthStateChange((event) => {
        // Identity/roles can remain unchanged while server-side company or warehouse access changes.
        if (
          event === 'INITIAL_SESSION' || event === 'SIGNED_IN' || event === 'SIGNED_OUT' ||
          event === 'TOKEN_REFRESHED' || event === 'USER_UPDATED' ||
          event === 'PASSWORD_RECOVERY' || event === 'MFA_CHALLENGE_VERIFIED'
        ) {
          // Invalidate any in-flight profile read before processing this session boundary.
          refreshGeneration.current += 1;
          setSessionRevision((revision) => revision + 1);

          // Do not let tenant/storefront reads run against the previous profile while
          // Supabase has already switched sessions. Readiness is restored only when
          // the matching ensure_profile request completes in refresh().
          if (event === 'SIGNED_OUT') {
            setUser(null);
            setReady(true);
          } else {
            setReady(false);
          }
        }
        if (
          event === 'INITIAL_SESSION' || event === 'SIGNED_IN' || event === 'USER_UPDATED' ||
          event === 'TOKEN_REFRESHED' || event === 'PASSWORD_RECOVERY' ||
          event === 'MFA_CHALLENGE_VERIFIED'
        ) {
          setTimeout(refresh, 0);
        }
      });
      unsubscribe = () => sub.subscription.unsubscribe();
      setConfigurationError(null);
      void refresh();
    } catch (cause) {
      // Do not let failed database/auth bootstrapping escape the root React tree.
      // The application remains navigable, while the root banner identifies the configuration blocker.
      const detail = cause instanceof Error ? cause.message : String(cause);
      const missingConfig = /Missing (?:database|Supabase) environment variable|SUPABASE_URL|SUPABASE_PUBLISHABLE_KEY|SUPABASE_ANON_KEY|Bolt Database/i.test(detail);
      setConfigurationError(
        missingConfig
          ? 'إعداد الاتصال بقاعدة Supabase المعتمدة غير مكتمل أو يشير إلى مشروع غير صحيح. تحقق من VITE_SUPABASE_URL وVITE_SUPABASE_PUBLISHABLE_KEY وإعدادات الخادم الخاصة بالمشروع tfdwtuwkdddnzgyhcoyy.'
          : 'تعذر تهيئة جلسة الحساب. أعد المحاولة، وإذا استمر العطل فتحقق من إعدادات اتصال قاعدة البيانات.',
      );
      setUser(null);
      setReady(true);
      console.error('[AuthProvider] Supabase initialization failed:', cause);
    }
    return () => unsubscribe?.();
  }, [refresh]);

  const signIn = useCallback(async (identifier: string, password: string) => {
    setLoading(true);
    try {
      const normalized = identifier.trim();
      const result = normalized.includes("@")
        ? await supabase.auth.signInWithPassword({ email: normalized, password })
        : await signInWithPhonePassword(supabase.auth, normalized, password);
      const { error } = result;
      if (error) throw new Error(translateAuthError(error.message));
      await refresh();
    } finally { setLoading(false); }
  }, [refresh]);

  const signUp = useCallback(async (
    identifier: string,
    password: string,
    fullName: string,
    method: 'email' | 'phone' = 'email',
    businessName = '',
  ) => {
    setLoading(true);
    try {
      const userMetadata = { data: {
        full_name: fullName.trim(),
        business_name: businessName.trim() || fullName.trim(),
      } };
      const result = method === 'phone'
        ? await requestPhoneSignup(supabase.auth, identifier, password, fullName, businessName)
        : await supabase.auth.signUp({
            email: identifier.trim(),
            password,
            options: {
              ...userMetadata,
              // Keep the verified invitation token through email confirmation; redirects are limited to this fixed in-app path.
              emailRedirectTo: getAuthEmailRedirectUrl(
                window.location.origin,
                window.location.pathname,
                window.location.search,
              ),
            },
          });
      if (result.error) throw new Error(translateAuthError(result.error.message));

      // Detect GoTrue's anti-enumeration response without exposing account existence.
      const existingEmailAccount = method === 'email' &&
        isObfuscatedEmailSignupResult(result.data.user, Boolean(result.data.session));
      if (existingEmailAccount) {
        return { needsConfirmation: false, confirmationType: method, existingAccount: true };
      }

      if (result.data.session) await refresh();
      return { needsConfirmation: !result.data.session, confirmationType: method, existingAccount: false };
    } finally { setLoading(false); }
  }, [refresh]);

  const verifyPhoneSignup = useCallback(async (phoneInput: string, token: string) => {
    setLoading(true);
    try {
      const { error } = await verifyPhoneSignupCode(supabase.auth, phoneInput, token);
      if (error) throw new Error(translateAuthError(error.message));
      await refresh();
    } finally { setLoading(false); }
  }, [refresh]);

  const resendPhoneSignupCode = useCallback(async (phoneInput: string) => {
    setLoading(true);
    try {
      const { error } = await resendPhoneSignupCodeRequest(supabase.auth, phoneInput);
      if (error) throw new Error(translateAuthError(error.message));
    } finally { setLoading(false); }
  }, []);

  const resetPassword = useCallback(async (email: string) => {
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: `${window.location.origin}/reset-password` });
    if (error) throw new Error(translateAuthError(error.message));
  }, []);

  const signOut = useCallback(async () => {
    const { error } = await supabase.auth.signOut({ scope: 'local' });
    if (error) throw new Error(translateAuthError(error.message));
    setUser(null);
  }, []);

  const signOutOtherSessions = useCallback(async () => {
    const { error } = await supabase.auth.signOut({ scope: 'others' });
    if (error) throw new Error(translateAuthError(error.message));
  }, []);

  const signOutEverywhere = useCallback(async () => {
    const { error } = await supabase.auth.signOut({ scope: 'global' });
    if (error) throw new Error(translateAuthError(error.message));
    setUser(null);
  }, []);

  return <AuthContext.Provider value={{ user, sessionRevision, loading, ready, configurationError, signIn, signUp, verifyPhoneSignup, resendPhoneSignupCode, resetPassword, signOut, signOutOtherSessions, signOutEverywhere }}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
