import { useState, useEffect, type MouseEvent } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import type { Product, Category } from '../../lib/types'
import { useAuthStore } from '../../lib/authStore'
import { useSettings } from '../../lib/useSettings'
import ProductCard from '../../components/store/ProductCard'

function HomeHero({ welcome }: { welcome: string }) {
  return (
    <section style={{ background: 'linear-gradient(135deg, var(--color-primary) 0%, var(--color-primary-light) 100%)', borderRadius: 'var(--radius-xl)', padding: '40px 32px', color: '#fff', marginBottom: '32px', position: 'relative', overflow: 'hidden' }}>
      <div style={{ maxWidth: '600px' }}>
        <h1 style={{ fontSize: '28px', marginBottom: '12px' }}>{welcome}</h1>
        <p style={{ fontSize: '16px', opacity: 0.9, marginBottom: '20px' }}>تسوّق من تشكيلة واسعة من المنتجات بأسعار تنافسية تناسب فئة عملائك، مع إمكانية الطلب المباشر ومتابعة الحالة.</p>
        <Link to="/products" className="btn btn-accent btn-lg">تصفح المنتجات</Link>
      </div>
      <div aria-hidden="true" style={{ position: 'absolute', left: '-40px', bottom: '-40px', width: '200px', height: '200px', borderRadius: '50%', background: 'rgba(212,175,55,0.1)' }} />
    </section>
  );
}

function HomeCategoryCard({ category }: { category: Category }) {
  const handleHover = (event: MouseEvent<HTMLAnchorElement>, active: boolean) => {
    event.currentTarget.style.borderColor = active ? 'var(--color-primary-light)' : 'var(--color-border)';
    event.currentTarget.style.transform = active ? 'translateY(-2px)' : 'translateY(0)';
    event.currentTarget.style.boxShadow = active ? 'var(--shadow-md)' : 'none';
  };
  return (
    <Link
      to={'/products?category=' + category.id}
      style={{ flexShrink: 0, padding: '12px 24px', background: 'var(--color-bg-card)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', fontWeight: 600, fontSize: '14px', display: 'flex', alignItems: 'center', gap: '8px', transition: 'all var(--transition)' }}
      onMouseEnter={(event) => handleHover(event, true)}
      onMouseLeave={(event) => handleHover(event, false)}
    >
      <span aria-hidden="true" style={{ width: '8px', height: '8px', borderRadius: '50%', background: 'var(--color-accent)' }} />
      {category.name}
    </Link>
  );
}

function HomeCategoryStrip({ categories }: { categories: Category[] }) {
  if (categories.length === 0) return null;
  return (
    <section className="mb-6" aria-label="التصنيفات">
      <h2 style={{ fontSize: '20px', marginBottom: '16px' }}>التصنيفات</h2>
      <div style={{ display: 'flex', gap: '12px', overflowX: 'auto', paddingBottom: '8px' }}>
        {categories.map((category) => <HomeCategoryCard key={category.id} category={category} />)}
      </div>
    </section>
  );
}

function HomeProductGrid({ title, products, tier, showPrices }: {
  title: string;
  products: Product[];
  tier: 1 | 2 | 3;
  showPrices: boolean;
}) {
  return (
    <section className="mb-6" aria-label={title}>
      <h2 style={{ fontSize: '20px', marginBottom: '16px' }}>{title}</h2>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: '16px' }}>
        {products.map((product) => <ProductCard key={product.id} product={product} tier={tier} showPrice={showPrices} />)}
      </div>
    </section>
  );
}


export default function HomePage() {
  const { customer } = useAuthStore()
  const { settings } = useSettings()
  const [products, setProducts] = useState<Product[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [loading, setLoading] = useState(true)
  const tier = (customer?.customer_tier || 3) as 1 | 2 | 3
  const showPrices = settings['show_price_on_cards'] !== 'false'

  useEffect(() => {
    Promise.all([
      supabase.from('products').select('*').eq('is_active', true).order('sort_order').limit(24),
      supabase.from('categories').select('*').eq('is_active', true).order('sort_order'),
    ]).then(([prodRes, catRes]) => {
      if (prodRes.data) setProducts(prodRes.data as Product[])
      if (catRes.data) setCategories(catRes.data as Category[])
      setLoading(false)
    })
  }, [])

  if (loading) return <div className="text-center mt-20 text-muted">جارٍ تحميل المنتجات...</div>
  const featured = products.filter((p) => p.is_featured)
  const welcome = settings['welcome_message'] || 'مرحباً بكم في متجر الأغبري'

  return (
    <div className="animate-fadeIn" style={{ padding: '24px 0' }}>
      <HomeHero welcome={welcome} />
      <HomeCategoryStrip categories={categories} />
      {featured.length > 0 && <HomeProductGrid title="منتجات مميزة" products={featured} tier={tier} showPrices={showPrices} />}
      <HomeProductGrid title="أحدث المنتجات" products={products} tier={tier} showPrices={showPrices} />
    </div>
  )
}
