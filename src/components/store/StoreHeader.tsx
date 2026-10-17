import { Link, useNavigate } from 'react-router-dom'
import { ShoppingCart, Bell, LogOut, LogIn, User, Package, Chrome as Home, Wifi, WifiOff, Heart, GitCompare, Sparkles, Search } from 'lucide-react'
import { useState, useEffect } from 'react'
import { useCartStore } from '../../lib/cartStore'
import { useAuthStore } from '../../lib/authStore'
import { useSettings } from '../../lib/useSettings'

export default function StoreHeader() {
  const navigate = useNavigate()
  const { items } = useCartStore()
  const { session, signOut } = useAuthStore()
  const { settings } = useSettings()
  const [isOnline, setIsOnline] = useState(navigator.onLine)
  const [search, setSearch] = useState('')
  const [scrolled, setScrolled] = useState(false)
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false)

  useEffect(() => {
    const on = () => setIsOnline(true), off = () => setIsOnline(false)
    const onScroll = () => setScrolled(window.scrollY > 10)
    window.addEventListener('online', on)
    window.addEventListener('offline', off)
    window.addEventListener('scroll', onScroll)
    return () => {
      window.removeEventListener('online', on)
      window.removeEventListener('offline', off)
      window.removeEventListener('scroll', onScroll)
    }
  }, [])

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault()
    if (search.trim()) {
      navigate(`/products?q=${encodeURIComponent(search.trim())}`)
      setMobileSearchOpen(false)
    }
  }
  const storeName = settings['store_name'] || 'متجر الأغبري'

  const iconBtn = (to: string, icon: React.ReactNode, label: string, badge?: number) => (
    <Link to={to} className="sf-nav-btn" title={label} aria-label={label}>
      {icon}
      {badge !== undefined && badge > 0 && <span className="sf-nav-badge">{badge}</span>}
    </Link>
  )

  return (
    <header className="sf-header-premium" style={{ boxShadow: scrolled ? '0 4px 24px rgba(10,53,64,0.12)' : 'none', transition: 'box-shadow 0.3s' }}>
      <div className="sf-header-inner-premium">
        <Link to="/" className="sf-brand-premium">
          <div className="sf-brand-icon-premium">
            <span>أ</span>
          </div>
          <div className="sf-brand-text-premium">
            <strong>{storeName}</strong>
            <span>منصة تجارية متكاملة</span>
          </div>
        </Link>

        <form onSubmit={handleSearch} className="sf-search-premium">
          <Search size={18} className="sf-search-icon" />
          <input type="text" placeholder="ابحث عن منتج، فئة، أو رمز..." value={search} onChange={(e) => setSearch(e.target.value)} />
        </form>

        <nav className="sf-nav-premium">
          {iconBtn('/', <Home size={20} />, 'الرئيسية')}
          {iconBtn('/products', <Package size={20} />, 'المنتجات')}
          {iconBtn('/wishlist', <Heart size={20} />, 'المفضلة')}
          {iconBtn('/compare', <GitCompare size={20} />, 'مقارنة المنتجات')}
          {iconBtn('/assistant', <Sparkles size={20} />, 'المساعد الذكي')}
          <div className="sf-nav-divider" />
          <div className="sf-nav-status" title={isOnline ? 'متصل بالإنترنت' : 'غير متصل'}>
            {isOnline ? <Wifi size={18} /> : <WifiOff size={18} />}
          </div>
          {iconBtn('/cart', <ShoppingCart size={22} />, 'سلة التسوق', items.length)}
          <button className="sf-nav-btn sf-nav-btn-action" title="التنبيهات"><Bell size={20} /></button>
          {session ? (
            <>
              {iconBtn('/orders', <User size={20} />, 'حسابي وطلباتي')}
              <button onClick={() => { signOut(); navigate('/') }} className="sf-nav-btn sf-nav-btn-action" title="تسجيل الخروج">
                <LogOut size={20} />
              </button>
            </>
          ) : (
            <Link to="/login" className="sf-login-btn-premium">
              <LogIn size={18} />
              <span>تسجيل الدخول</span>
            </Link>
          )}
        </nav>
      </div>
    </header>
  )
}
