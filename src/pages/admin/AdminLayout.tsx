import { Outlet, NavLink, useNavigate } from 'react-router-dom'
import { LayoutDashboard, Package, ShoppingCart, Users, Settings, LogOut, Store, Boxes, Tags, Truck, Bell, BarChart3, FolderTree, ScrollText, Image, Sparkles } from 'lucide-react'
import { useAuthStore } from '../../lib/authStore'

const navSections = [
  {
    title: 'الرئيسية',
    items: [
      { to: '/admin', label: 'لوحة المعلومات', icon: LayoutDashboard, end: true },
    ],
  },
  {
    title: 'إدارة المتجر',
    items: [
      { to: '/admin/products', label: 'المنتجات', icon: Package, end: false },
      { to: '/admin/orders', label: 'الطلبات', icon: ShoppingCart, end: false },
      { to: '/admin/customers', label: 'العملاء', icon: Users, end: false },
      { to: '/admin/inventory', label: 'المخزون', icon: Boxes, end: false },
      { to: '/admin/pricing', label: 'التسعير', icon: Tags, end: false },
      { to: '/admin/suppliers', label: 'الموردون', icon: Truck, end: false },
    ],
  },
  {
    title: 'التحليلات والذكاء',
    items: [
      { to: '/admin/reports', label: 'التقارير التنفيذية', icon: BarChart3, end: false },
      { to: '/admin/ai-workspace', label: 'مساحة الذكاء الاصطناعي', icon: Sparkles, end: false },
    ],
  },
  {
    title: 'الإعدادات والنظام',
    items: [
      { to: '/admin/categories', label: 'التصنيفات', icon: FolderTree, end: false },
      { to: '/admin/banners', label: 'البانرات', icon: Image, end: false },
      { to: '/admin/audit-log', label: 'سجل التدقيق', icon: ScrollText, end: false },
      { to: '/admin/notifications', label: 'التنبيهات', icon: Bell, end: false },
      { to: '/admin/settings', label: 'الإعدادات', icon: Settings, end: false },
    ],
  },
]

export default function AdminLayout() {
  const { signOut } = useAuthStore()
  const navigate = useNavigate()
  const handleSignOut = () => { signOut(); navigate('/') }

  return (
    <div className="admin-layout-premium">
      <aside className="admin-sidebar-premium">
        {/* Brand */}
        <div className="admin-sidebar-brand">
          <div className="admin-brand-icon"><span>أ</span></div>
          <div className="admin-brand-text">
            <strong>متجر الأغبري</strong>
            <span>لوحة الإدارة</span>
          </div>
        </div>

        {/* Navigation */}
        <nav className="admin-sidebar-nav">
          {navSections.map((section, si) => (
            <div key={si} className="admin-nav-section">
              <div className="admin-nav-section-title">{section.title}</div>
              {section.items.map((item) => (
                <NavLink key={item.to} to={item.to} end={item.end} className={({ isActive }) => `admin-nav-item${isActive ? ' active' : ''}`}>
                  <item.icon size={18} className="admin-nav-icon" />
                  <span>{item.label}</span>
                  <div className="admin-nav-indicator" />
                </NavLink>
              ))}
            </div>
          ))}
        </nav>

        {/* Bottom Actions */}
        <div className="admin-sidebar-bottom">
          <NavLink to="/" className="admin-nav-item admin-nav-item-store">
            <Store size={18} />
            <span>عرض المتجر</span>
          </NavLink>
          <button onClick={handleSignOut} className="admin-nav-item admin-nav-item-logout">
            <LogOut size={18} />
            <span>تسجيل الخروج</span>
          </button>
        </div>
      </aside>

      <main className="admin-main-premium">
        <Outlet />
      </main>
    </div>
  )
}
