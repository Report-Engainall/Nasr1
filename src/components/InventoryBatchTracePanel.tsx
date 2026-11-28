import { useEffect, useState } from 'react';
import { AlertTriangle, Boxes, RefreshCw } from 'lucide-react';
import { fetchInventoryBatchProducts, fetchInventoryBatchStock, type InventoryBatchProductOption, type InventoryBatchStockSnapshot } from '@/lib/api';

const qty=(value:number)=>new Intl.NumberFormat('ar-YE',{maximumFractionDigits:3}).format(value);
const source=(kind:InventoryBatchStockSnapshot['lots'][number]['source_type'])=>({
 purchase_receipt:'استلام شراء', inventory_transfer:'نقل مستودع',
 unattributed_balance_increase:'زيادة غير منسوبة', legacy_unattributed:'رصيد قديم غير منسوب',
}[kind]);
export function InventoryBatchTracePanel({warehouseId,warehouseName}:{warehouseId:string;warehouseName:string}) {
 const [products,setProducts]=useState<InventoryBatchProductOption[]>([]);
 const [productId,setProductId]=useState('');
 const [snapshot,setSnapshot]=useState<InventoryBatchStockSnapshot|null>(null);
 const [loadingProducts,setLoadingProducts]=useState(false);
 const [loadingLots,setLoadingLots]=useState(false);
 const [error,setError]=useState('');
 const [retry,setRetry]=useState(0);
 useEffect(()=>{
  let active=true;setProducts([]);setProductId('');setSnapshot(null);setError('');
  if(!warehouseId)return()=>{active=false;};
  setLoadingProducts(true);
  void fetchInventoryBatchProducts(warehouseId).then(items=>{
   if(active){setProducts(items);setProductId(items[0]?.product_id??'');}
  }).catch((e:unknown)=>{if(active)setError(e instanceof Error?e.message:'تعذر تحميل أصناف الدفعات.');})
    .finally(()=>{if(active)setLoadingProducts(false);});
  return()=>{active=false;};
 },[warehouseId,retry]);
 useEffect(()=>{
  let active=true;setSnapshot(null);
  if(!warehouseId||!productId)return()=>{active=false;};
  setLoadingLots(true);setError('');
  void fetchInventoryBatchStock(productId,warehouseId).then(value=>{if(active)setSnapshot(value);})
   .catch((e:unknown)=>{if(active)setError(e instanceof Error?e.message:'تعذر تحميل دفعات الصنف.');})
   .finally(()=>{if(active)setLoadingLots(false);});
  return()=>{active=false;};
 },[warehouseId,productId,retry]);
 const expired=snapshot?.lots.filter(l=>l.expired).length??0;
 return <section className="panel" aria-label="تتبع دفعات المخزون" style={{display:'grid',gap:12}}>
  <header style={{display:'flex',gap:10,justifyContent:'space-between',flexWrap:'wrap',alignItems:'center'}}>
   <div><h2 style={{margin:0}}><Boxes size={18} style={{verticalAlign:'middle',marginInlineEnd:7}}/> تتبع دفعات المخزون</h2>
    <p className="text-muted" style={{margin:'4px 0 0'}}>المستودع: {warehouseName} · ترتيب حسب الأقدم انتهاءً (FEFO)</p></div>
   <button className="btn outline" type="button" aria-label="إعادة محاولة تحميل الدفعات" onClick={()=>setRetry(v=>v+1)} disabled={loadingProducts||loadingLots}><RefreshCw size={15}/> تحديث</button>
  </header>
  {error&&<p role="alert" style={{margin:0,color:'#b42318'}}><AlertTriangle size={15} style={{verticalAlign:'middle',marginInlineEnd:6}}/>{error}</p>}
  {loadingProducts?<p role="status">جار تحميل أصناف المستودع…</p>:products.length===0?
   <p className="text-muted">لا توجد أرصدة موجبة للتتبع، أو لا تملك العضوية صلاحية قراءة هذا المستودع.</p>:
   <>
    <label style={{display:'grid',gap:5}}>الصنف
     <select value={productId} onChange={e=>setProductId(e.target.value)} disabled={loadingLots}>
      {products.map(p=><option key={p.product_id} value={p.product_id}>{p.product_name} · {p.item_code}</option>)}
     </select>
    </label>
    {loadingLots?<p role="status">جار تحميل أرصدة الدفعات…</p>:snapshot&&<>
     <div className="report-grid">
      <article className="report-metric"><span>إجمالي الرصيد</span><strong>{qty(snapshot.quantity_on_hand)}</strong></article>
      <article className="report-metric"><span>المحجوز</span><strong>{qty(snapshot.quantity_reserved)}</strong></article>
      <article className="report-metric"><span>المتاح</span><strong>{qty(snapshot.quantity_available)}</strong></article>
      <article className="report-metric"><span>دفعات منتهية</span><strong>{qty(expired)}</strong></article>
     </div>
     <div style={{overflowX:'auto'}}>
      <table><thead><tr><th>رقم الدفعة</th><th>الصلاحية</th><th>الاستلام</th><th>الرصيد</th><th>المحجوز</th><th>المتاح</th><th>المصدر</th><th>الحالة</th></tr></thead>
       <tbody>{snapshot.lots.map(l=><tr key={l.id}>
        <td>{l.batch_number??'غير منسوب'}</td>
        <td>{l.expiry_date??'غير مسجل'}</td>
        <td>{new Date(l.received_at).toLocaleDateString('ar-YE')}</td>
        <td>{qty(l.quantity_on_hand)}</td><td>{qty(l.quantity_reserved)}</td><td>{qty(l.quantity_available)}</td>
        <td>{source(l.source_type)}</td>
        <td>{l.expired?'منتهية — ممنوعة من الحجز':l.expiry_date?'صالحة':'صلاحية غير محددة'}</td>
       </tr>)}</tbody>
      </table>
     </div>
     <p className="text-muted" style={{fontSize:12,margin:0}}>{snapshot.lots.length} دفعة · لقطة الخادم {new Date(snapshot.as_of).toLocaleString('ar-YE')}. الأرصدة القديمة غير المنسوبة لا تحصل على رقم دفعة أو صلاحية افتراضية.</p>
    </>}
   </>}
 </section>;
}
