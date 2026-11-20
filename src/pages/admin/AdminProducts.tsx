import { useState, useEffect } from 'react'
import { Plus, CreditCard as Edit2, Trash2, Search, X } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import type { Product, Category } from '../../lib/types'
import { archiveAdminCatalogProduct, createAdminCatalogCategory, saveAdminCatalogProduct } from '../../lib/admin-catalog-commands'
import { getAvailableStock, isLowStock, isOutOfStock } from '../../lib/pricing'


type InventoryBalanceRow = { product_id: string; quantity_on_hand: number | string | null; quantity_reserved: number | string | null; reorder_point: number | string | null };
type ProductStockTotals = { onHand: number; reserved: number; reorder: number };

function aggregateProductStock(rows: InventoryBalanceRow[] | null): Map<string, ProductStockTotals> {
  const totals = new Map<string, ProductStockTotals>();
  for (const row of rows ?? []) {
    const current = totals.get(row.product_id) ?? { onHand: 0, reserved: 0, reorder: 0 };
    current.onHand += Number(row.quantity_on_hand) || 0;
    current.reserved += Number(row.quantity_reserved) || 0;
    current.reorder = Math.max(current.reorder, Number(row.reorder_point) || 0);
    totals.set(row.product_id, current);
  }
  return totals;
}

function projectAdminProduct(product: Product, stock: Map<string, ProductStockTotals>, stockUnavailable: boolean): Product {
  const totals = stock.get(product.id);
  return {
    ...product,
    sku: product.item_code,
    is_active: product.status === "active",
    is_featured: false,
    stock_quantity: stockUnavailable || !totals ? Number.NaN : totals.onHand,
    reserved_quantity: stockUnavailable || !totals ? Number.NaN : totals.reserved,
    min_stock_level: stockUnavailable || !totals ? Number.NaN : totals.reorder,
  };
}

function AdminProductStockBadge({ product }: { product: Product }) {
  if (!Number.isFinite(getAvailableStock(product))) return <span className="badge badge-warning">غير متاح</span>;
  if (isOutOfStock(product)) return <span className="badge badge-error">نفد</span>;
  if (isLowStock(product)) return <span className="badge badge-warning">{getAvailableStock(product)}</span>;
  return <span className="badge badge-success">{getAvailableStock(product)}</span>;
}

function AdminProductRow({ product, onEdit, onArchive }: {
  product: Product; onEdit: (product: Product) => void; onArchive: (productId: string) => void;
}) {
  return (
    <tr style={{ borderBottom: "1px solid var(--color-border)" }}>
      <td style={{ padding: "12px", fontSize: "14px", fontWeight: 600 }}>
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>{product.is_featured && <span className="badge badge-accent" style={{ padding: "2px 6px" }}>مميز</span>}{product.name}</div>
      </td>
      <td style={{ padding: "12px", fontSize: "13px" }} className="text-muted">{product.item_code}</td>
      <td style={{ padding: "12px", fontSize: "13px", textAlign: "center" }}>{product.unit}</td>
      <td style={{ padding: "12px", textAlign: "center" }}><AdminProductStockBadge product={product} /></td>
      <td style={{ padding: "12px", fontSize: "13px", textAlign: "center" }}>{product.base_price}</td>
      <td style={{ padding: "12px", fontSize: "13px", textAlign: "center" }}>{product.price_wholesale_of_wholesale}</td>
      <td style={{ padding: "12px", fontSize: "13px", textAlign: "center" }}>{product.price_wholesale}</td>
      <td style={{ padding: "12px", fontSize: "13px", textAlign: "center" }}>{product.price_retail}</td>
      <td style={{ padding: "12px", textAlign: "center" }}>
        <div style={{ display: "flex", gap: "4px", justifyContent: "center" }}>
          <button type="button" aria-label={"تعديل " + product.name} className="btn btn-ghost btn-sm" onClick={() => onEdit(product)}><Edit2 size={16} /></button>
          <button type="button" aria-label={"أرشفة " + product.name} className="btn btn-ghost btn-sm" style={{ color: "var(--color-error)" }} onClick={() => onArchive(product.id)}><Trash2 size={16} /></button>
        </div>
      </td>
    </tr>
  );
}

function AdminProductsTable({ products, onEdit, onArchive }: {
  products: Product[]; onEdit: (product: Product) => void; onArchive: (productId: string) => void;
}) {
  if (products.length === 0) return <p className="text-muted text-center" style={{ padding: 32 }}>لا توجد منتجات مطابقة للبحث.</p>;
  return (
    <div className="card" style={{ overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead><tr style={{ borderBottom: "2px solid var(--color-border)" }}>
          <th style={{ textAlign: "right", padding: "12px", fontSize: "13px", color: "var(--color-text-muted)" }}>الاسم</th>
          <th style={{ textAlign: "right", padding: "12px", fontSize: "13px", color: "var(--color-text-muted)" }}>الكود</th>
          <th style={{ textAlign: "center", padding: "12px", fontSize: "13px", color: "var(--color-text-muted)" }}>الوحدة</th>
          <th style={{ textAlign: "center", padding: "12px", fontSize: "13px", color: "var(--color-text-muted)" }}>المخزون</th>
          <th style={{ textAlign: "center", padding: "12px", fontSize: "13px", color: "var(--color-text-muted)" }}>الأساس</th>
          <th style={{ textAlign: "center", padding: "12px", fontSize: "13px", color: "var(--color-text-muted)" }}>ج.الجملة</th>
          <th style={{ textAlign: "center", padding: "12px", fontSize: "13px", color: "var(--color-text-muted)" }}>جملة</th>
          <th style={{ textAlign: "center", padding: "12px", fontSize: "13px", color: "var(--color-text-muted)" }}>تجزئة</th>
          <th style={{ textAlign: "center", padding: "12px", fontSize: "13px", color: "var(--color-text-muted)" }}>إجراءات</th>
        </tr></thead>
        <tbody>{products.map((product) => <AdminProductRow key={product.id} product={product} onEdit={onEdit} onArchive={onArchive} />)}</tbody>
      </table>
    </div>
  );
}

export default function AdminProducts() {
  const [products, setProducts] = useState<Product[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState<Product | null>(null)
  const [showForm, setShowForm] = useState(false)

  useEffect(() => { void loadProducts(); void loadCategories() }, [])

  const loadProducts = async () => {
    setLoading(true)
    const [{ data, error }, { data: balances, error: stockError }] = await Promise.all([
      supabase.from('products').select('*').order('name'),
      supabase.from('inventory_balances').select('product_id,quantity_on_hand,quantity_reserved,reorder_point'),
    ])
    if (error) { alert('تعذر تحميل المنتجات: ' + error.message); setLoading(false); return }
    const stock = aggregateProductStock((balances ?? null) as InventoryBalanceRow[] | null)
    setProducts(((data ?? []) as Product[]).map((product) => projectAdminProduct(product, stock, Boolean(stockError))))
    if(stockError) alert('تعذر قراءة المخزون؛ الكمية تظهر غير متاحة ولا تُعامل كصفر.')
    setLoading(false)
  }
  const loadCategories = async () => {
    const {data,error}=await supabase.from('categories').select('*').eq('is_active',true).order('sort_order')
    if(error){alert('تعذر تحميل التصنيفات: '+error.message);return} if(data)setCategories(data as Category[])
  }
  const handleCreateCategory = async ():Promise<string|null> => {
    const name=window.prompt('اسم التصنيف الجديد');if(!name?.trim())return null
    const code=window.prompt('كود التصنيف (اختياري)')||null
    try{const v=await createAdminCatalogCategory(name,null,code);await loadCategories();return v.id}catch(e){alert('تعذر إنشاء التصنيف: '+String(e instanceof Error?e.message:e));return null}
  }

  const filtered = products.filter(p => p.name.includes(search) || p.item_code.includes(search) || (p.sku || '').includes(search))

  const handleDelete = async (id:string) => {
    if(!window.confirm('ستتم أرشفة المنتج مع الحفاظ على مراجع الطلبات التاريخية. متابعة؟'))return
    try{await archiveAdminCatalogProduct(id);await loadProducts()}catch(e){alert('تعذر أرشفة المنتج: '+String(e instanceof Error?e.message:e))}
  }
  const handleSave = async (data:Partial<Product>) => {
    try {
      await saveAdminCatalogProduct(editing?.id||null,{name:data.name||'',item_code:data.item_code||'',barcode:data.barcode||null,unit:data.unit||'',description:data.description||null,category_id:data.category_id||null,base_price:Number(data.base_price),price_wholesale_of_wholesale:Number(data.price_wholesale_of_wholesale),price_wholesale:Number(data.price_wholesale),price_retail:Number(data.price_retail),status:data.is_active===false?'inactive':'active',...(editing?{expected_base_price:Number(editing.base_price),expected_price_wholesale_of_wholesale:Number(editing.price_wholesale_of_wholesale),expected_price_wholesale:Number(editing.price_wholesale),expected_price_retail:Number(editing.price_retail)}:{})})
      setShowForm(false);setEditing(null);await loadProducts()
    }catch(e){alert('تعذر حفظ المنتج؛ لم تُعتبر العملية ناجحة: '+String(e instanceof Error?e.message:e))}
  }

  return (
    <div className="animate-fadeIn">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <h1 style={{ fontSize: '22px' }}>المنتجات</h1>
        <button className="btn btn-primary" onClick={() => { setEditing(null); setShowForm(true) }}><Plus size={18} /> منتج جديد</button>
      </div>
      <div style={{ position: 'relative', marginBottom: '16px' }}>
        <input className="input" placeholder="ابحث بالاسم أو الكود..." value={search} onChange={(e) => setSearch(e.target.value)} style={{ paddingRight: '40px' }} />
        <Search size={18} style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-muted)' }} />
      </div>
      {loading ? <div className="text-muted text-center">جارٍ التحميل...</div> : (
        <AdminProductsTable products={filtered} onEdit={(product) => { setEditing(product); setShowForm(true); }} onArchive={(productId) => void handleDelete(productId)} />
      )}
      {showForm && <ProductForm product={editing} categories={categories} onSave={handleSave} onCreateCategory={handleCreateCategory} onClose={() => { setShowForm(false); setEditing(null) }} />}
    </div>
  )
}

function ProductForm({ product, categories, onSave, onCreateCategory, onClose }: { product: Product | null; categories: Category[]; onSave: (data: Partial<Product>) => void; onCreateCategory: () => Promise<string|null>; onClose: () => void }) {
  const [form, setForm] = useState({
    name: product?.name || '', item_code: product?.item_code || '', barcode: product?.barcode || '',
    unit: product?.unit || 'قطعة', category_id: product?.category_id || '',
    description: product?.description || '', base_price: product?.base_price || 0,
    price_wholesale_of_wholesale: product?.price_wholesale_of_wholesale || 0, price_wholesale: product?.price_wholesale || 0,
    price_retail: product?.price_retail || 0,
    is_featured: product?.is_featured || false, is_active: product?.is_active ?? true,
  })
  const handleSubmit = (e: React.FormEvent) => { e.preventDefault(); onSave({ ...form, category_id: form.category_id || null }) }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '20px' }} onClick={onClose}>
      <div className="card" style={{ width: '100%', maxWidth: '600px', maxHeight: '90vh', overflow: 'auto', padding: '24px' }} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
          <h2 style={{ fontSize: '18px' }}>{product ? 'تعديل منتج' : 'منتج جديد'}</h2>
          <button onClick={onClose} className="btn btn-ghost"><X size={20} /></button>
        </div>
        <form onSubmit={handleSubmit}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <div style={{ gridColumn: 'span 2' }}><label className="label">اسم المنتج</label><input className="input" required value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} /></div>
            <div><label className="label">كود الصنف</label><input className="input" required value={form.item_code} onChange={e => setForm({ ...form, item_code: e.target.value })} /></div>
            <div><label className="label">الوحدة</label><input className="input" value={form.unit} onChange={e => setForm({ ...form, unit: e.target.value })} /></div>
            <div><label className="label">الباركود</label><input className="input" value={form.barcode} onChange={e => setForm({ ...form, barcode: e.target.value })} /></div>
            <div><label className="label">التصنيف</label><div style={{display:'flex',gap:6}}><select className="input" value={form.category_id} onChange={e => setForm({ ...form, category_id: e.target.value })}><option value="">—</option>{categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select><button type="button" className="btn btn-secondary btn-sm" onClick={async()=>{const id=await onCreateCategory();if(id)setForm(current=>({...current,category_id:id}))}}>إضافة تصنيف</button></div></div>
            <div style={{ gridColumn: 'span 2' }}><label className="label">الوصف</label><textarea className="input" rows={2} value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} /></div>
            <div><label className="label">السعر الأساسي</label><input className="input" type="number" value={form.base_price} onChange={e => setForm({ ...form, base_price: parseFloat(e.target.value) || 0 })} /></div>
            <div><label className="label">سعر جملة الجملة</label><input className="input" type="number" value={form.price_wholesale_of_wholesale} onChange={e => setForm({ ...form, price_wholesale_of_wholesale: parseFloat(e.target.value) || 0 })} /></div>
            <div><label className="label">سعر الجملة</label><input className="input" type="number" value={form.price_wholesale} onChange={e => setForm({ ...form, price_wholesale: parseFloat(e.target.value) || 0 })} /></div>
            <div><label className="label">سعر التجزئة</label><input className="input" type="number" value={form.price_retail} onChange={e => setForm({ ...form, price_retail: parseFloat(e.target.value) || 0 })} /></div>
            <div style={{ gridColumn: 'span 2', display: 'flex', gap: '16px' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '14px' }}><input type="checkbox" checked={form.is_active} onChange={e => setForm({ ...form, is_active: e.target.checked })} /> نشط</label>
            </div>
          </div>
          <div style={{ display: 'flex', gap: '12px', marginTop: '20px' }}>
            <button type="submit" className="btn btn-primary">{product ? 'حفظ التعديلات' : 'إضافة المنتج'}</button>
            <button type="button" className="btn btn-secondary" onClick={onClose}>إلغاء</button>
          </div>
        </form>
      </div>
    </div>
  )
}
