import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Eye, EyeOff, UserPlus, CircleAlert as AlertCircle } from 'lucide-react'
import { supabase } from '../../lib/supabase'


function RegisterErrorNotice({ message }: { message: string }) {
  if (!message) return null;
  return <div role="alert" className="badge badge-error mb-4" style={{ display: "flex", gap: "6px", padding: "10px", alignItems: "flex-start" }}><AlertCircle size={16} style={{ flexShrink: 0, marginTop: "2px" }} /><span>{message}</span></div>;
}

function RegisterPasswordRequirements({ password, checks }: {
  password: string; checks: { length: boolean; hasNumber: boolean; hasLetter: boolean };
}) {
  if (!password) return null;
  return (
    <div style={{ display: "flex", gap: "12px", marginTop: "8px", fontSize: "12px" }}>
      <span style={{ color: checks.length ? "var(--color-success)" : "var(--color-text-muted)" }}>{checks.length ? "✓" : "○"} 6 أحرف</span>
      <span style={{ color: checks.hasLetter ? "var(--color-success)" : "var(--color-text-muted)" }}>{checks.hasLetter ? "✓" : "○"} أحرف</span>
      <span style={{ color: checks.hasNumber ? "var(--color-success)" : "var(--color-text-muted)" }}>{checks.hasNumber ? "✓" : "○"} أرقام</span>
    </div>
  );
}

function RegisterPasswordField({ password, showPassword, checks, onChange, onToggle }: {
  password: string; showPassword: boolean; checks: { length: boolean; hasNumber: boolean; hasLetter: boolean };
  onChange: (value: string) => void; onToggle: () => void;
}) {
  return (
    <div className="mb-6">
      <label className="label" htmlFor="register-password">كلمة المرور</label>
      <div style={{ position: "relative" }}>
        <input id="register-password" className="input" type={showPassword ? "text" : "password"} value={password} onChange={(event) => onChange(event.target.value)} placeholder="••••••••" required style={{ paddingLeft: "40px" }} />
        <button type="button" aria-label={showPassword ? "إخفاء كلمة المرور" : "إظهار كلمة المرور"} aria-pressed={showPassword} onClick={onToggle} style={{ position: "absolute", left: "10px", top: "50%", transform: "translateY(-50%)", color: "var(--color-text-muted)" }}>
          {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
        </button>
      </div>
      <RegisterPasswordRequirements password={password} checks={checks} />
    </div>
  );
}

function RegisterForm({ fullName, companyName, phone, password, showPassword, passwordChecks, loading, onFullNameChange, onCompanyChange, onPhoneChange, onPasswordChange, onTogglePassword, onSubmit }: {
  fullName: string; companyName: string; phone: string; password: string; showPassword: boolean;
  passwordChecks: { length: boolean; hasNumber: boolean; hasLetter: boolean }; loading: boolean;
  onFullNameChange: (value: string) => void; onCompanyChange: (value: string) => void;
  onPhoneChange: (value: string) => void; onPasswordChange: (value: string) => void;
  onTogglePassword: () => void; onSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <form onSubmit={onSubmit}>
      <div className="mb-4"><label className="label" htmlFor="register-full-name">الاسم الكامل</label><input id="register-full-name" className="input" type="text" value={fullName} onChange={(event) => onFullNameChange(event.target.value)} required placeholder="الاسم الكامل" /></div>
      <div className="mb-4"><label className="label" htmlFor="register-company">اسم المحل / الشركة (اختياري)</label><input id="register-company" className="input" type="text" value={companyName} onChange={(event) => onCompanyChange(event.target.value)} placeholder="اسم المحل" /></div>
      <div className="mb-4"><label className="label" htmlFor="register-phone">رقم الهاتف</label><input id="register-phone" className="input" type="tel" value={phone} onChange={(event) => onPhoneChange(event.target.value)} required placeholder="7XXXXXXXX" /></div>
      <RegisterPasswordField password={password} showPassword={showPassword} checks={passwordChecks} onChange={onPasswordChange} onToggle={onTogglePassword} />
      <button type="submit" className="btn btn-primary btn-lg w-full" disabled={loading}>{loading ? "جارٍ الإنشاء..." : <><UserPlus size={18} /> إنشاء الحساب</>}</button>
    </form>
  );
}

function RegisterPageCard({ error, fullName, companyName, phone, password, showPassword, passwordChecks, loading, onFullNameChange, onCompanyChange, onPhoneChange, onPasswordChange, onTogglePassword, onSubmit }: {
  error: string; fullName: string; companyName: string; phone: string; password: string; showPassword: boolean;
  passwordChecks: { length: boolean; hasNumber: boolean; hasLetter: boolean }; loading: boolean;
  onFullNameChange: (value: string) => void; onCompanyChange: (value: string) => void;
  onPhoneChange: (value: string) => void; onPasswordChange: (value: string) => void;
  onTogglePassword: () => void; onSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <div className="card" style={{ width: "100%", maxWidth: "440px", padding: "32px" }}>
      <div style={{ textAlign: "center", marginBottom: "24px" }}>
        <div style={{ width: "56px", height: "56px", borderRadius: "50%", background: "var(--color-accent)", display: "inline-flex", alignItems: "center", justifyContent: "center", fontWeight: 700, color: "var(--color-primary-dark)", fontSize: "24px", marginBottom: "12px" }}>أ</div>
        <h1 style={{ fontSize: "20px" }}>إنشاء حساب جديد</h1><p className="text-muted" style={{ fontSize: "14px" }}>متجر الأغبري</p>
      </div>
      <RegisterErrorNotice message={error} />
      <RegisterForm fullName={fullName} companyName={companyName} phone={phone} password={password} showPassword={showPassword} passwordChecks={passwordChecks} loading={loading}
        onFullNameChange={onFullNameChange} onCompanyChange={onCompanyChange} onPhoneChange={onPhoneChange} onPasswordChange={onPasswordChange} onTogglePassword={onTogglePassword} onSubmit={onSubmit} />
      <p className="text-center mt-6" style={{ fontSize: "14px" }}>لديك حساب؟ <Link to="/login" style={{ color: "var(--color-primary)", fontWeight: 600 }}>تسجيل الدخول</Link></p>
      <div className="card mt-4" style={{ padding: "12px", background: "var(--color-info-bg)", border: "none" }}><p style={{ fontSize: "12px", color: "var(--color-info)" }}>بعد التسجيل سيكون حسابك بانتظار موافقة الإدارة قبل أن تتمكن من الطلب.</p></div>
    </div>
  );
}

export default function RegisterPage() {
  const navigate = useNavigate()
  const [fullName, setFullName] = useState('')
  const [companyName, setCompanyName] = useState('')
  const [phone, setPhone] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const pc = { length: password.length >= 6, hasNumber: /\d/.test(password), hasLetter: /[a-zA-Z\u0600-\u06FF]/.test(password) }
  const passwordValid = pc.length && pc.hasNumber && pc.hasLetter

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault(); setLoading(true); setError('')
    if (!passwordValid) { setError('كلمة المرور يجب أن تكون 6 أحرف على الأقل وتحتوي على أحرف وأرقام'); setLoading(false); return }
    try {
      const email = `${phone}@aghbari.store`
      const { data, error } = await supabase.auth.signUp({ email, password, options: { data: { full_name: fullName, phone, company_name: companyName } } })
      if (error) throw error
      if (data.user) {
        await supabase.from('customers').insert({ user_id: data.user.id, full_name: fullName, company_name: companyName || null, phone, email, status: 'pending', customer_tier: 3 })
        navigate('/pending-approval')
      }
    } catch (err: unknown) { setError(err instanceof Error ? err.message : 'فشل إنشاء الحساب') } finally { setLoading(false) }
  }

  return (
    <main style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "linear-gradient(135deg, var(--color-primary) 0%, var(--color-primary-dark) 100%)", padding: "20px" }}>
      <RegisterPageCard
        error={error}
        fullName={fullName}
        companyName={companyName}
        phone={phone}
        password={password}
        showPassword={showPassword}
        passwordChecks={pc}
        loading={loading}
        onFullNameChange={setFullName}
        onCompanyChange={setCompanyName}
        onPhoneChange={setPhone}
        onPasswordChange={setPassword}
        onTogglePassword={() => setShowPassword((value) => !value)}
        onSubmit={(event) => void handleRegister(event)}
      />
    </main>
  )
}
