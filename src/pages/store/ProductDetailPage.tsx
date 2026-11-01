import { useState, useEffect } from 'react'
import { useParams, Link } from 'react-router-dom'
import { ShoppingCart, Minus, Plus, ArrowRight, Package, Check } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import type { Product } from '../../lib/types'
import { useAuthStore } from '../../lib/authStore'
import { useSettings } from '../../lib/useSettings'
import { useCartStore } from '../../lib/cartStore'
import { getPriceForTier, getAvailableStock, isOutOfStock, formatPrice } from '../../lib/pricing'
import ProductCard from '../../components/store/ProductCard'


function ProductImageView({ product }: { product: Product }) {
  return (
    <div style={{ aspectRatio: '1', background: 'var(--color-bg-alt)', borderRadius: 'var(--radius-lg)', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      {product.image_url ? <img src={product.image_url} alt={product.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <Package size={80} color="var(--color-text-light)" />}
    </div>
  );
}

function ProductMetadataBadges({ product }: { product: Product }) {
  return (
    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '16px' }}>
      <span className="badge badge-neutral">{product.item_code}</span>
      {product.sku && <span className="badge badge-neutral">SKU: {product.sku}</span>}
      <span className="badge badge-neutral">{product.unit}</span>
    </div>
  );
}

function ProductStockStatus({ product, outOfStock }: { product: Product; outOfStock: boolean }) {
  if (outOfStock) return <span className="badge badge-error">نفد المخزون</span>;
  if (getAvailableStock(product) <= product.min_stock_level) return <span className="badge badge-warning">متوفر — كمية محدودة</span>;
  return <span className="badge badge-success"><Check size={14} /> متوفر</span>;
}

function ProductQuantitySelector({ quantity, onChange }: { quantity: number; onChange: (value: number) => void }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', overflow: 'hidden' }}>
      <button type="button" aria-label="تقليل الكمية" onClick={() => onChange(Math.max(1, quantity - 1))} style={{ padding: '10px 14px', background: 'var(--color-bg-alt)' }}><Minus size={16} /></button>
      <input aria-label="الكمية" type="number" min="1" value={quantity} onChange={(event) => onChange(Math.max(1, Number.parseInt(event.target.value, 10) || 1))} style={{ width: '60px', textAlign: 'center', border: 'none', outline: 'none', padding: '10px 0', fontSize: '16px' }} />
      <button type="button" aria-label="زيادة الكمية" onClick={() => onChange(quantity + 1)} style={{ padding: '10px 14px', background: 'var(--color-bg-alt)' }}><Plus size={16} /></button>
    </div>
  );
}

function ProductAddButton({ added, onAdd }: { added: boolean; onAdd: () => void }) {
  return <button type="button" onClick={onAdd} className={'btn ' + (added ? 'btn-accent' : 'btn-primary') + ' btn-lg'}>{added ? 'تمت الإضافة ✓' : <><ShoppingCart size={18} /> إضافة للسلة</>}</button>;
}

function ProductPurchaseControls({ quantity, onQuantityChange, added, onAdd }: {
  quantity: number; onQuantityChange: (value: number) => void; added: boolean; onAdd: () => void;
}) {
  return (
    <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
      <ProductQuantitySelector quantity={quantity} onChange={onQuantityChange} />
      <ProductAddButton added={added} onAdd={onAdd} />
    </div>
  );
}

function ProductInformation({ product, price, showPrice, currency, outOfStock, quantity, onQuantityChange, added, onAdd }: {
  product: Product; price: number; showPrice: boolean; currency: string; outOfStock: boolean;
  quantity: number; onQuantityChange: (value: number) => void; added: boolean; onAdd: () => void;
}) {
  return (
    <section>
      <h1 style={{ fontSize: '22px', marginBottom: '12px' }}>{product.name}</h1>
      <ProductMetadataBadges product={product} />
      {product.description && <p className="text-muted" style={{ marginBottom: '20px', lineHeight: '1.8' }}>{product.description}</p>}
      {showPrice && !outOfStock && <div style={{ fontSize: '24px', fontWeight: 700, color: 'var(--color-primary)', marginBottom: '20px' }}>{formatPrice(price, currency)}</div>}
      <div style={{ marginBottom: '20px' }}><ProductStockStatus product={product} outOfStock={outOfStock} /></div>
      {!outOfStock && <ProductPurchaseControls quantity={quantity} onQuantityChange={onQuantityChange} added={added} onAdd={onAdd} />}
    </section>
  );
}

function RelatedProductGrid({ products, tier, showPrice }: { products: Product[]; tier: 1 | 2 | 3; showPrice: boolean }) {
  if (products.length === 0) return null;
  return (
    <section className="mt-8" aria-label="منتجات مشابهة">
      <h2 style={{ fontSize: '18px', marginBottom: '16px' }}>منتجات مشابهة</h2>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: '16px' }}>
        {products.map((product) => <ProductCard key={product.id} product={product} tier={tier} showPrice={showPrice} />)}
      </div>
    </section>
  );
}

export default function ProductDetailPage() {
  const { id } = useParams()
  const { customer } = useAuthStore()
  const { settings } = useSettings()
  const { addItem } = useCartStore()
  const [product, setProduct] = useState<Product | null>(null)
  const [related, setRelated] = useState<Product[]>([])
  const [qty, setQty] = useState(1)
  const [added, setAdded] = useState(false)
  const [loading, setLoading] = useState(true)
  const tier = (customer?.customer_tier || 3) as 1 | 2 | 3
  const showPrice = settings['show_price_on_cards'] !== 'false'
  const currency = settings['currency_symbol'] || 'ر.ي'

  useEffect(() => {
    setLoading(true)
    supabase.from('products').select('*').eq('id', id).maybeSingle().then(({ data }) => {
      if (data) {
        const p = data as Product; setProduct(p)
        supabase.from('products').select('*').eq('is_active', true).eq('category_id', p.category_id).neq('id', p.id).limit(4)
          .then(({ data: rel }) => rel && setRelated(rel as Product[]))
      }
      setLoading(false)
    })
  }, [id])

  if (loading) return <div className="text-center mt-20 text-muted">جارٍ التحميل...</div>
  if (!product) return <div className="text-center mt-20">المنتج غير موجود</div>
  const price = getPriceForTier(product, tier)
  const outOfStock = isOutOfStock(product)
  const handleAdd = () => { if (outOfStock || qty <= 0) return; addItem(product, qty, price); setAdded(true); setTimeout(() => setAdded(false), 1500) }

  return (
    <main className="animate-fadeIn" style={{ padding: '24px 0' }}>
      <Link to="/products" className="text-muted" style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', marginBottom: '16px', fontSize: '14px' }}><ArrowRight size={16} /> العودة للمنتجات</Link>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '32px' }}>
        <ProductImageView product={product} />
        <ProductInformation product={product} price={price} showPrice={showPrice} currency={currency} outOfStock={outOfStock} quantity={qty} onQuantityChange={setQty} added={added} onAdd={handleAdd} />
      </div>
      <RelatedProductGrid products={related} tier={tier} showPrice={showPrice} />
    </main>
  )
}
