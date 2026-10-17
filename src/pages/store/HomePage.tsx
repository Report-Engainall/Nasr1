import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft, Sparkles, TrendingUp, Award, Shield, Truck, Package, Headphones } from 'lucide-react'
import { fetchProducts, fetchCategories } from '../../lib/api'
import type { ProductWithInventory, Category } from '../../lib/types'
import { useAuthStore } from '../../lib/authStore'
import { useSettings } from '../../lib/useSettings'
import ProductCard from '../../components/store/ProductCard'

export default function HomePage() {
  const { customer } = useAuthStore()
  const { settings } = useSettings()
  const [products, setProducts] = useState<ProductWithInventory[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const tier = (customer?.customer_tier || 3) as 1 | 2 | 3
  const showPrices = settings['show_price_on_cards'] !== 'false'

  useEffect(() => {
    let mounted = true
    Promise.all([
      fetchProducts().catch(e => { throw e }),
      fetchCategories().catch(e => { throw e }),
    ]).then(([prodData, catData]) => {
      if (!mounted) return
      setProducts(prodData)
      setCategories(catData)
      setLoading(false)
    }).catch(e => {
      if (!mounted) return
      setError(e instanceof Error ? e.message : 'تعذر تحميل المنتجات')
      setLoading(false)
    })
    return () => { mounted = false }
  }, [])

  if (loading) return (
    <div className="sf-page-loading">
      <div className="skeleton" style={{ height: '280px', borderRadius: '24px', marginBottom: '24px' }} />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: '16px' }}>
        {[1,2,3,4,5,6,7,8].map(i => <div key={i} className="skeleton" style={{ height: '280px', borderRadius: '18px' }} />)}
      </div>
    </div>
  )
  if (error) return <div className="sf-page-loading"><div className="alert alert-error" style={{ maxWidth: '500px' }}>{error}</div></div>

  const featured = products.filter((p) => p.is_featured)
  const latest = products.slice(0, 12)
  const welcome = settings['welcome_message'] || 'مرحباً بكم في متجر الأغبري'

  const trustFeatures = [
    { icon: Shield, title: 'دفع آمن', desc: 'معاملات محمية' },
    { icon: Truck, title: 'توصيل سريع', desc: 'لكل المناطق' },
    { icon: Award, title: 'جودة عالية', desc: 'منتجات أصلية' },
    { icon: Headphones, title: 'دعم متواصل', desc: '24/7' },
  ]

  const categoryColors = ['#087f8d', '#0eaa97', '#168bda', '#e99c29', '#1baa78', '#e75d59', '#0a9fb4', '#d4af37']

  return (
    <div className="sf-home-premium animate-fadeIn">
      {/* Hero Section */}
      <section className="sf-home-hero">
        <div className="sf-home-hero-bg" />
        <div className="sf-home-hero-content">
          <div className="sf-home-hero-kicker">
            <Sparkles size={16} />
            <span>منصة تجارية ذكية</span>
          </div>
          <h1>{welcome}</h1>
          <p>تسوّق من تشكيلة واسعة من المنتجات بأسعار تنافسية تناسب فئة عملائك، مع إمكانية الطلب المباشر ومتابعة الحالة في الوقت الفعلي.</p>
          <div className="sf-home-hero-actions">
            <Link to="/products" className="sf-home-hero-cta">
              <span>تصفح المنتجات</span>
              <ArrowLeft size={18} />
            </Link>
            <Link to="/assistant" className="sf-home-hero-secondary">
              <Sparkles size={18} />
              <span>المساعد الذكي</span>
            </Link>
          </div>
        </div>
        <div className="sf-home-hero-stats">
          <div className="sf-home-hero-stat">
            <strong>{products.length}+</strong>
            <span>منتج متاح</span>
          </div>
          <div className="sf-home-hero-stat">
            <strong>{categories.length}</strong>
            <span>فئة متنوعة</span>
          </div>
          <div className="sf-home-hero-stat">
            <strong>{featured.length}</strong>
            <span>منتج مميز</span>
          </div>
        </div>
      </section>

      {/* Trust Features Bar */}
      <section className="sf-home-trust animate-stagger">
        {trustFeatures.map((f, i) => (
          <div key={i} className="sf-home-trust-item">
            <div className="sf-home-trust-icon"><f.icon size={24} /></div>
            <div><strong>{f.title}</strong><span>{f.desc}</span></div>
          </div>
        ))}
      </section>

      {/* Categories Showcase */}
      {categories.length > 0 && (
        <section className="sf-home-section">
          <div className="sf-home-section-head">
            <div>
              <h2>تسوّق حسب الفئة</h2>
              <span>اختر الفئة المناسبة لاحتياجاتك</span>
            </div>
            <Link to="/products" className="sf-home-section-link">عرض الكل <ArrowLeft size={16} /></Link>
          </div>
          <div className="sf-home-cats animate-stagger">
            {categories.map((cat, i) => (
              <Link key={cat.id} to={`/products?category=${cat.id}`} className="sf-home-cat-card"
                style={{ '--cat-color': categoryColors[i % categoryColors.length] } as React.CSSProperties}>
                <div className="sf-home-cat-icon"><Package size={24} /></div>
                <strong>{cat.name}</strong>
                <span>تصفح المنتجات</span>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* Featured Products */}
      {featured.length > 0 && (
        <section className="sf-home-section">
          <div className="sf-home-section-head">
            <div>
              <h2 className="sf-home-featured-title"><TrendingUp size={22} /> منتجات مميزة</h2>
              <span>مختارة بعناية لك</span>
            </div>
            <Link to="/products" className="sf-home-section-link">عرض الكل <ArrowLeft size={16} /></Link>
          </div>
          <div className="sf-home-product-grid animate-stagger">
            {featured.map((p) => <ProductCard key={p.id} product={p} tier={tier} showPrice={showPrices} />)}
          </div>
        </section>
      )}

      {/* Latest Products */}
      <section className="sf-home-section">
        <div className="sf-home-section-head">
          <div>
            <h2>أحدث المنتجات</h2>
            <span>وصل حديثاً إلى المتجر</span>
          </div>
          <Link to="/products" className="sf-home-section-link">عرض الكل <ArrowLeft size={16} /></Link>
        </div>
        {products.length === 0 ? (
          <div className="sf-empty">
            <Package size={48} />
            <p>لا توجد منتجات متاحة حالياً</p>
          </div>
        ) : (
          <div className="sf-home-product-grid animate-stagger">
            {latest.map((p) => <ProductCard key={p.id} product={p} tier={tier} showPrice={showPrices} />)}
          </div>
        )}
      </section>
    </div>
  )
}
