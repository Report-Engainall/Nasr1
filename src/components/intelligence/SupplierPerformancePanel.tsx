import { useState } from "react";
import type {SupplierPerformanceResult, SupplierPerformanceSupplier} from "@/lib/intelligence/supplier-performance";
const qty=new Intl.NumberFormat("ar-YE",{maximumFractionDigits:3});
const days=new Intl.NumberFormat("ar-YE",{maximumFractionDigits:2});
const date=(v:string|null)=>v?new Date(v).toLocaleDateString("ar-YE",{dateStyle:"medium"}):"غير متاح";

export type SupplierPerformanceTriageFilter = "ALL" | "LATE" | "BACKLOG" | "INCONSISTENT" | "LOW_SAMPLE";

export function filterSupplierPerformanceSuppliers(
 suppliers: SupplierPerformanceSupplier[],
 filter: SupplierPerformanceTriageFilter,
 query = "",
): SupplierPerformanceSupplier[] {
 const normalizedQuery = query.trim().toLocaleLowerCase("ar");
 return suppliers.filter(supplier => {
  const searchable = (supplier.supplierName + " " + (supplier.supplierCode ?? "")).toLocaleLowerCase("ar");
  if (normalizedQuery && !searchable.includes(normalizedQuery)) return false;
  const lateCount = supplier.promisedDeliverySampleCount - supplier.onTimeCount;
  switch (filter) {
   case "LATE": return supplier.promisedDeliverySampleCount >= 3 && lateCount > 0;
   case "BACKLOG": return supplier.openOrderCount > 0 && supplier.backlogLineCount > 0;
   case "INCONSISTENT": return supplier.inconsistentReceivedCount > 0;
   case "LOW_SAMPLE": return supplier.leadTimeSampleCount < 3 ||
    (supplier.completedOrderCount > 0 && supplier.promisedDeliverySampleCount < 3) ||
    supplier.completedWithoutPromiseCount > 0;
   default: return true;
  }
 });
}

type SupplierFollowUp = { key: string; title: string; count: number; action: string };

function supplierFollowUps(supplier: SupplierPerformanceSupplier): SupplierFollowUp[] {
 const items: SupplierFollowUp[] = [];
 if (supplier.inconsistentReceivedCount > 0) items.push({
  key: "inconsistent-receipt", title: "استلام غير متسق", count: supplier.inconsistentReceivedCount,
  action: "راجع سطور أمر الشراء وسندات الاستلام؛ حالة الأمر مستلم لكن شروط اكتمال الكميات أو الاستلام لم تتحقق.",
 });
 if (supplier.openOrderCount > 0 && supplier.backlogLineCount > 0) items.push({
  key: "pending-receipt", title: "سطور استلام معلقة", count: supplier.backlogLineCount,
  action: "طابق الكميات المتبقية مع المورد وجدول الاستلام الفعلي؛ لا يعني العدد وحده أن الموعد متأخر.",
 });
 if (supplier.completedWithoutPromiseCount > 0) items.push({
  key: "missing-promise", title: "مدة توريد غير مسجلة", count: supplier.completedWithoutPromiseCount,
  action: "استكمل مدة التسليم في عروض الأسعار القادمة حتى يمكن قياس الالتزام بالموعد على أساس موثق.",
 });
 if (supplier.promisedDeliverySampleCount >= 3) {
  const lateCount = supplier.promisedDeliverySampleCount - supplier.onTimeCount;
  if (lateCount > 0) items.push({
   key: "late-delivery", title: "تسليم بعد الموعد الموعود", count: lateCount,
   action: "راجع أوامر العينة التي تجاوزت مدة العرض الممنوح قبل اعتماد طلب شراء جديد.",
  });
 }
 return items;
}
export interface SupplierPerformancePanelProps {result:SupplierPerformanceResult|null;state?:"loading"|"error"|"unavailable"|"ready";onRetry?:()=>void;onOpenPurchaseOrder?:(purchaseOrderId:string)=>void;}
export function SupplierPerformancePanel({result,state="ready",onRetry,onOpenPurchaseOrder}:SupplierPerformancePanelProps) {
 const [triageFilter,setTriageFilter]=useState<SupplierPerformanceTriageFilter>("ALL");
 const [supplierSearch,setSupplierSearch]=useState("");
 if(state==="loading")return <section dir="rtl" role="status" className="rounded-xl border p-4">جارٍ تحميل أداء الموردين من سجلات التوريد…</section>;
 if(state!=="ready"||!result)return <section dir="rtl" role="status" className="rounded-xl border p-4 space-y-2">
  <h2 className="font-semibold">تحليل أداء الموردين غير متاح</h2><p className="text-sm text-muted-foreground">لم تُعرض أرقام بديلة أو بيانات تجريبية.</p>
  {onRetry?<button type="button" onClick={onRetry} className="rounded-lg border px-3 py-2 text-sm">إعادة المحاولة</button>:null}</section>;
 if(result.state==="EMPTY")return <section dir="rtl" className="rounded-xl border p-4 space-y-2">
  <h2 className="font-semibold">لا توجد أوامر شراء مؤهلة في الفترة</h2>
  <p className="text-sm text-muted-foreground">{result.period.from} — {result.period.to} UTC. غياب السجلات لا يعني أن الموردين بلا أداء.</p></section>;
 const visibleSuppliers=filterSupplierPerformanceSuppliers(result.suppliers,triageFilter,supplierSearch);
 const triageOptions: {value:SupplierPerformanceTriageFilter;label:string;count:number}[] = [
  {value:"ALL",label:"الكل",count:result.returnedSupplierCount},
  {value:"LATE",label:"تأخر مسجل",count:filterSupplierPerformanceSuppliers(result.suppliers,"LATE").length},
  {value:"BACKLOG",label:"استلامات معلقة",count:filterSupplierPerformanceSuppliers(result.suppliers,"BACKLOG").length},
  {value:"INCONSISTENT",label:"استلام غير متسق",count:filterSupplierPerformanceSuppliers(result.suppliers,"INCONSISTENT").length},
  {value:"LOW_SAMPLE",label:"عينة غير كافية",count:filterSupplierPerformanceSuppliers(result.suppliers,"LOW_SAMPLE").length},
 ];
 return <section dir="rtl" className="space-y-4 rounded-xl border p-4" aria-label="ذكاء أداء الموردين">
  <header className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="text-lg font-semibold">ذكاء أداء الموردين</h2>
   <p className="text-xs text-muted-foreground">{result.period.from} — {result.period.to} UTC · كما في {date(result.asOf)}</p></div>
   <span className="rounded-full border px-2 py-1 text-xs">{result.completePopulation?"تغطية كاملة":"تغطية جزئية"}</span></header>
  <div className="grid gap-2 sm:grid-cols-3">
   <article className="rounded-lg border p-3"><p className="text-xs text-muted-foreground">الموردون المشمولون</p>
    <p className="text-2xl font-semibold tabular-nums">{qty.format(result.returnedSupplierCount)}</p>
    <p className="text-xs text-muted-foreground">من أصل {qty.format(result.totalSupplierCount)}</p></article>
   <article className="rounded-lg border p-3"><p className="text-xs text-muted-foreground">أوامر مكتملة الاستلام</p>
    <p className="text-2xl font-semibold tabular-nums">{qty.format(result.suppliers.reduce((n,x)=>n+x.completedOrderCount,0))}</p>
    <p className="text-xs text-muted-foreground">اكتمال كميات جميع السطور شرط للقياس</p></article>
   <article className="rounded-lg border p-3"><p className="text-xs text-muted-foreground">أوامر مفتوحة</p>
    <p className="text-2xl font-semibold tabular-nums">{qty.format(result.suppliers.reduce((n,x)=>n+x.openOrderCount,0))}</p>
    <p className="text-xs text-muted-foreground">مرسلة أو مستلمة جزئياً</p></article>
  </div>
  <section className="space-y-3 rounded-lg border p-3" aria-label="فرز الموردين ومتابعتهم">
   <div className="flex flex-wrap items-center justify-between gap-2">
    <label className="grid min-w-[220px] flex-1 gap-1 text-sm">
     <span>بحث باسم المورد أو رمزه</span>
     <input type="search" value={supplierSearch} onChange={event=>setSupplierSearch(event.target.value)}
      placeholder="اكتب اسم المورد أو الرمز" aria-label="بحث الموردين" className="rounded-lg border bg-background px-3 py-2" />
    </label>
    <p role="status" aria-live="polite" className="text-xs text-muted-foreground">
     {visibleSuppliers.length} من {result.returnedSupplierCount} مورداً معروضاً
     {result.completePopulation?" · تغطية مكتملة":" · من قائمة جزئية"}
    </p>
   </div>
   <div className="flex flex-wrap gap-2" aria-label="مرشحات متابعة الموردين">
    {triageOptions.map(option=>(
     <button key={option.value} type="button" aria-pressed={triageFilter===option.value}
      onClick={()=>setTriageFilter(option.value)}
      className={"rounded-lg border px-3 py-2 text-xs "+(triageFilter===option.value?"bg-muted font-semibold":"")}>
      {option.label} · {qty.format(option.count)}
     </button>
    ))}
   </div>
  </section>
  <div className="overflow-x-auto"><table className="w-full min-w-[900px] text-sm"><thead><tr className="border-b text-right">
   <th className="p-2">المورد</th><th className="p-2">أوامر / مكتمل</th><th className="p-2">مفتوح</th><th className="p-2">متوسط التوريد (يوم)</th>
   <th className="p-2">الوسيط / P90</th><th className="p-2">الالتزام بالموعد الموعود</th><th className="p-2">سطور أصناف معلقة</th>
  </tr></thead><tbody>{visibleSuppliers.map(s=><tr key={s.supplierId} className="border-b align-top">
   <td className="p-2"><p className="font-semibold">{s.supplierName}</p><p className="text-xs text-muted-foreground">{s.supplierCode??"بلا رمز مورد"}</p></td>
   <td className="p-2 tabular-nums">{qty.format(s.purchaseOrderCount)} / {qty.format(s.completedOrderCount)}</td>
   <td className="p-2 tabular-nums">{qty.format(s.openOrderCount)}</td>
   <td className="p-2 tabular-nums">{s.leadTimeSampleCount<3||s.averageLeadDays===null?"عينة غير كافية":days.format(s.averageLeadDays)}<p className="text-xs text-muted-foreground">عينة {qty.format(s.leadTimeSampleCount)}</p></td>
   <td className="p-2 tabular-nums">{s.leadTimeSampleCount<3||s.medianLeadDays===null||s.p90LeadDays===null?"عينة غير كافية":days.format(s.medianLeadDays)+" / "+days.format(s.p90LeadDays)}</td>
   <td className="p-2">{s.promisedDeliverySampleCount<3||s.onTimePercent===null?"عينة غير كافية":days.format(s.onTimePercent)+"٪"}<p className="text-xs text-muted-foreground">{qty.format(s.onTimeCount)} من {qty.format(s.promisedDeliverySampleCount)} عينة</p></td>
   <td className="p-2 tabular-nums">{qty.format(s.backlogLineCount)}</td>
  </tr>)}
  {!visibleSuppliers.length ? <tr><td colSpan={7} className="p-4 text-center text-sm text-muted-foreground">
   لا توجد نتائج لهذا البحث أو المرشح ضمن الموردين المحمّلين.
  </td></tr> : null}
  </tbody></table></div>

  {(() => {
   const entries = visibleSuppliers.flatMap(supplier =>
    supplierFollowUps(supplier).map(item => ({ ...item, supplierId: supplier.supplierId, supplierName: supplier.supplierName }))
   );
   return (
    <section className="space-y-2" aria-label="ملاحظات متابعة الموردين">
     <div>
      <h3 className="font-semibold">ملاحظات متابعة الموردين</h3>
      <p className="text-xs text-muted-foreground">إشارات تشغيلية مشتقة من أوامر الشراء والاستلام وعروض الأسعار الممنوحة؛ لا تمثل درجة تقييم أو حكم جودة.</p>
     </div>
     {entries.length === 0 ? (
      <p role="status" className="rounded-lg border p-3 text-sm">لا توجد ملاحظات متابعة من الحقول المتاحة في هذه اللقطة.</p>
     ) : (
      <div className="grid gap-2 lg:grid-cols-2">
       {entries.map(item => (
        <article key={item.supplierId + ":" + item.key} className="rounded-lg border p-3">
         <div className="flex flex-wrap items-center justify-between gap-2">
          <strong className="text-sm">{item.supplierName}</strong>
          <span className="rounded-full border px-2 py-1 text-xs">{item.title} · {qty.format(item.count)}</span>
         </div>
         <p className="mt-2 text-sm">{item.action}</p>
        </article>
       ))}
      </div>
     )}
     {result.state === "PARTIAL" ? (
      <p className="text-xs text-muted-foreground">هذه الملاحظات تخص الموردين المعروضين فقط؛ لم تكتمل تغطية جميع الموردين في الفترة.</p>
     ) : null}
    </section>
   );
  })()}
  <section className="space-y-2"><h3 className="font-semibold">أحدث أوامر الشراء ومصدر القياس</h3>
   {visibleSuppliers.map(s=><details key={s.supplierId} className="rounded-lg border p-3"><summary className="cursor-pointer text-sm font-medium">{s.supplierName} · {qty.format(s.recentOrders.length)} سجلات</summary>
    <div className="mt-3 space-y-2">{s.recentOrders.map(o=><article key={o.purchaseOrderId} className="rounded-md bg-muted/40 p-2 text-xs">
     <div className="flex flex-wrap justify-between gap-2"><strong>أمر {o.purchaseOrderNumber}</strong><span>{o.status==="received"?"مستلم":o.status==="partially_received"?"مستلم جزئياً":"مرسل"}</span></div>
     <p>الإرسال: {date(o.submittedAt)} · آخر استلام: {date(o.lastReceivedAt)}</p>
     {onOpenPurchaseOrder?<button type="button" onClick={()=>onOpenPurchaseOrder(o.purchaseOrderId)} className="mt-1 rounded-md border px-2 py-1">فتح أمر الشراء</button>:null}
     <p>سطور الأصناف: {qty.format(o.lineCount)} · السطور ذات الاستلام المتبقي: {qty.format(o.pendingLineCount)}</p>
     <p>زمن التوريد: {o.actualLeadDays===null?"غير مكتمل":days.format(o.actualLeadDays)+" يوم"} · الموعود: {o.promisedDeliveryDays===null?"غير مسجل":qty.format(o.promisedDeliveryDays)+" يوم"} · الالتزام: {o.onTime===null?"غير قابل للقياس":o.onTime?"ضمن المدة":"متأخر"}</p>
    </article>)}</div></details>)}
  </section>
  {result.withheldReasons.length>0?<details className="rounded-lg border p-3"><summary className="cursor-pointer text-sm font-semibold">البيانات والمؤشرات المحجوبة</summary>
   <ul className="mt-2 list-disc space-y-1 ps-5 text-sm">{result.withheldReasons.map(x=><li key={x}>{x}</li>)}</ul></details>:null}
  <p className="text-xs text-muted-foreground">زمن التوريد من إرسال أمر الشراء إلى آخر استلام ولا يظهر إلا بعد اكتمال الكميات. الالتزام يقاس فقط بمدة عرض سعر ممنوح. السطور المعلقة تُعد ولا تُجمع كميات أصناف أو وحدات مختلفة؛ المؤشرات والنسب لا تُعرض إلا بعينة لا تقل عن 3 أوامر. لا تعرض الشاشة أسعار شراء أو ديوناً أو مدفوعات، ولا تدّعي قياس الجودة أو العيوب أو تصنيف المورد.</p>
 </section>;
}
