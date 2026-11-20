import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import type { Setting } from '../../lib/types'


type AdminSettingSection = {
  title: string;
  keys: string[];
};

function isBooleanSetting(key: string): boolean {
  return key.startsWith("show_");
}

function AdminSettingField({
  settingKey,
  value,
  onChange,
}: {
  settingKey: string;
  value: string;
  onChange: (key: string, value: string) => void;
}) {
  if (isBooleanSetting(settingKey)) {
    return (
      <select className="input" value={value || "false"} onChange={(event) => onChange(settingKey, event.target.value)}>
        <option value="true">نعم</option>
        <option value="false">لا</option>
      </select>
    );
  }
  return <input className="input" value={value || ""} onChange={(event) => onChange(settingKey, event.target.value)} />;
}

function AdminSettingSectionCard({
  section,
  settings,
  onChange,
}: {
  section: AdminSettingSection;
  settings: Record<string, string>;
  onChange: (key: string, value: string) => void;
}) {
  return (
    <div className="card" style={{ padding: "20px" }}>
      <h2 style={{ fontSize: "16px", marginBottom: "16px" }}>{section.title}</h2>
      {section.keys.map((key) => (
        <div key={key} style={{ marginBottom: "14px" }}>
          <label className="label">{key.replace(/_/g, " ")}</label>
          <AdminSettingField settingKey={key} value={settings[key] ?? ""} onChange={onChange} />
        </div>
      ))}
    </div>
  );
}

export default function AdminSettings() {
  const [settings, setSettings] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    supabase.from('settings').select('*').then(({ data }) => {
      if (data) {
        const map: Record<string, string> = {}
        ;(data as Setting[]).forEach(s => { map[s.key] = s.value })
        setSettings(map)
      }
      setLoading(false)
    })
  }, [])

  const handleChange = (key: string, value: string) => {
    setSettings({ ...settings, [key]: value })
  }

  const handleSave = async () => {
    setSaving(true)
    for (const [key, value] of Object.entries(settings)) {
      await supabase.from('settings').update({ value, updated_at: new Date().toISOString() }).eq('key', key)
    }
    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  if (loading) return <div className="text-muted">جارٍ التحميل...</div>

  const sections: AdminSettingSection[] = [
    { title: 'الهوية والمظهر', keys: ['store_name', 'store_name_en', 'primary_color', 'secondary_color', 'accent_color', 'bg_color', 'welcome_message'] },
    { title: 'العملة', keys: ['currency_symbol', 'currency_code', 'currency_decimals'] },
    { title: 'إعدادات الأسعار', keys: ['show_price_on_cards', 'show_price_in_cart', 'show_price_in_orders', 'show_price_in_invoice', 'default_customer_tier'] },
    { title: 'إعدادات الطلبات', keys: ['min_order_qty'] },
  ]

  return (
    <div className="animate-fadeIn">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <h1 style={{ fontSize: '22px' }}>الإعدادات</h1>
        <button className="btn btn-primary" onClick={handleSave} disabled={saving}>{saving ? 'جارٍ الحفظ...' : saved ? 'تم الحفظ ✓' : 'حفظ الإعدادات'}</button>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(400px, 1fr))', gap: '20px' }}>
        {sections.map((section) => (
          <AdminSettingSectionCard
            key={section.title}
            section={section}
            settings={settings}
            onChange={handleChange}
          />
        ))}
      </div>
    </div>
  )
}
