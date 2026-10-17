import { Link } from 'react-router-dom'
import { ShoppingCart, Minus, Plus, Package } from 'lucide-react'
import type { Product, CustomerTier } from '../../lib/types'
import { getPriceForTier, isOutOfStock, formatPrice } from '../../lib/pricing'
import { useCartStore } from '../../lib/cartStore'
import { useSettings } from '../../lib/useSettings'
import { useState } from 'react'
interface Props { product: Product; tier: CustomerTier; showPrice: boolean }
export default function ProductCard({ product, tier, showPrice }: Props) {
  const { addItem } = useCartStore()
  const { settings } = useSettings()
  const [qty, setQty] = useState(1)
  const [added, setAdded] = useState(false)
  const price = getPriceForTier(product, tier)
  const out = isOutOfStock(product)
  const cur = settings['currency_symbol'] || 'ر.ي'
  const handleAdd = () => { if (out || qty <= 0) return; addItem(product, qty, price); setAdded(true); setTimeout(() => setAdded(false), 1500) }
  return (
    <div className="sf-product-card">
      <Link to={`/product/${product.id}`} className="sf-product-img">
        {product.image_url ? <img src={product.image_url} alt={product.name} /> : <div className="sf-product-img-placeholder"><Package size={48} /></div>}
        {product.is_featured && <span className="badge badge-accent sf-product-badge-featured">مميز</span>}
        {out && <span className="badge badge-error sf-product-badge-out">نفد</span>}
      </Link>
      <div className="sf-product-body">
        <Link to={`/product/${product.id}`}><h3>{product.name}</h3></Link>
        <div className="sf-product-meta"><span className="badge badge-neutral">{product.item_code}</span><span className="sf-product-unit">{product.unit}</span></div>
        {showPrice && !out && <div className="sf-product-price"><strong>{formatPrice(price, cur)}</strong></div>}
        {!out && <div className="sf-product-actions">
          <div className="sf-product-qty">
            <button onClick={() => setQty(q => Math.max(1, q - 1))}><Minus size={14} /></button>
            <input type="number" value={qty} onChange={e => setQty(Math.max(1, parseInt(e.target.value) || 1))} />
            <button onClick={() => setQty(q => q + 1)}><Plus size={14} /></button>
          </div>
          <button onClick={handleAdd} className={`sf-add-btn ${added ? 'sf-add-btn-added' : ''}`}>
            {added ? 'تمت الإضافة ✓' : <><ShoppingCart size={16} /> إضافة</>}
          </button>
        </div>}
      </div>
    </div>
  )
}
