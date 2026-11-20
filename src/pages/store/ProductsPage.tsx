import { useState, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Filter } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import type { Product, Category, Brand } from '../../lib/types'
import { useAuthStore } from '../../lib/authStore'
import { useSettings } from '../../lib/useSettings'
import ProductCard from '../../components/store/ProductCard'


type ProductFilterOption = { id: string; name: string };

function ProductFilterGroup({ title, options, selectedId, onSelect }: {
  title: string; options: ProductFilterOption[]; selectedId: string; onSelect: (value: string) => void;
}) {
  return (
    <section>
      <h3 style={{ fontSize: '15px', marginBottom: '12px' }}>{title}</h3>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
        <button type="button" className="btn btn-ghost btn-sm" style={{ justifyContent: 'flex-start', background: !selectedId ? 'var(--color-bg-alt)' : 'transparent' }} onClick={() => onSelect('')}>الكل</button>
        {options.map((option) => (
          <button type="button" key={option.id} className="btn btn-ghost btn-sm" style={{ justifyContent: 'flex-start', background: selectedId === option.id ? 'var(--color-bg-alt)' : 'transparent' }} onClick={() => onSelect(option.id)}>{option.name}</button>
        ))}
      </div>
    </section>
  );
}

function ProductFilters({ categories, brands, categoryId, brandId, onCategoryChange, onBrandChange }: {
  categories: Category[]; brands: Brand[]; categoryId: string; brandId: string;
  onCategoryChange: (value: string) => void; onBrandChange: (value: string) => void;
}) {
  return (
    <aside className="card" style={{ padding: '16px', height: 'fit-content' }}>
      <ProductFilterGroup title="التصنيفات" options={categories} selectedId={categoryId} onSelect={onCategoryChange} />
      <ProductFilterGroup title="العلامات التجارية" options={brands} selectedId={brandId} onSelect={onBrandChange} />
    </aside>
  );
}

function ProductResults({ loading, products, tier, showPrices }: {
  loading: boolean; products: Product[]; tier: 1 | 2 | 3; showPrices: boolean;
}) {
  if (loading) return <div role="status" className="text-center text-muted mt-8">جارٍ التحميل...</div>;
  if (products.length === 0) return <div role="status" className="text-center text-muted mt-8">لا توجد منتجات مطابقة</div>;
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: '16px' }}>
      {products.map((product) => <ProductCard key={product.id} product={product} tier={tier} showPrice={showPrices} />)}
    </div>
  );
}

export default function ProductsPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const { customer } = useAuthStore()
  const { settings } = useSettings()
  const [products, setProducts] = useState<Product[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [brands, setBrands] = useState<Brand[]>([])
  const [loading, setLoading] = useState(true)
  const [showFilters, setShowFilters] = useState(false)
  const q = searchParams.get('q') || ''
  const categoryId = searchParams.get('category') || ''
  const brandId = searchParams.get('brand') || ''
  const tier = (customer?.customer_tier || 3) as 1 | 2 | 3
  const showPrices = settings['show_price_on_cards'] !== 'false'

  useEffect(() => {
    supabase.from('categories').select('*').eq('is_active', true).order('sort_order').then(({ data }) => data && setCategories(data as Category[]))
    supabase.from('brands').select('*').eq('is_active', true).then(({ data }) => data && setBrands(data as Brand[]))
  }, [])

  useEffect(() => {
    setLoading(true)
    let query = supabase.from('products').select('*').eq('is_active', true)
    if (q) query = query.or(`name.ilike.%${q}%,item_code.ilike.%${q}%,sku.ilike.%${q}%,barcode.ilike.%${q}%`)
    if (categoryId) query = query.eq('category_id', categoryId)
    if (brandId) query = query.eq('brand_id', brandId)
    query.order('sort_order').order('name').then(({ data }) => { if (data) setProducts(data as Product[]); setLoading(false) })
  }, [q, categoryId, brandId])

  const updateFilter = (key: string, value: string) => {
    const params = new URLSearchParams(searchParams)
    if (value) params.set(key, value); else params.delete(key)
    setSearchParams(params)
  }

  return (
    <main className="animate-fadeIn" style={{ padding: '24px 0' }}>
      <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
        <h1 style={{ fontSize: '22px' }}>المنتجات {q && <span className="text-muted">— "{q}"</span>}</h1>
        <button type="button" className="btn btn-secondary btn-sm" onClick={() => setShowFilters((shown) => !shown)}><Filter size={16} /> تصفية</button>
      </header>
      <div style={{ display: 'grid', gridTemplateColumns: showFilters ? '240px 1fr' : '1fr', gap: '20px' }}>
        {showFilters && <ProductFilters categories={categories} brands={brands} categoryId={categoryId} brandId={brandId} onCategoryChange={(value) => updateFilter('category', value)} onBrandChange={(value) => updateFilter('brand', value)} />}
        <ProductResults loading={loading} products={products} tier={tier} showPrices={showPrices} />
      </div>
    </main>
  )
}
