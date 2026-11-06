import { useState } from "react";
import { runNaturalLanguageAssistantQuery,type NaturalLanguageAssistantResponse } from "@/lib/intelligence/natural-language-assistant-client";
import type { NaturalLanguageInvoiceMatch,NaturalLanguagePurchaseOrder } from "@/lib/intelligence/natural-language-assistant";
import { TaskQualityReviewMetrics } from "./TaskQualityReviewMetrics";
export interface NaturalLanguageAssistantProps {onOpenSupplierInvoice?:(invoiceId:string)=>void;onOpenPurchaseOrder?:(purchaseOrderId:string)=>void;}
const qty=new Intl.NumberFormat("ar-YE",{maximumFractionDigits:0});
const rate=new Intl.NumberFormat("ar-YE",{maximumFractionDigits:1});
function count(value:number|null):string{return value===null?"غير متاح":qty.format(value);}
function percent(value:number|null):string{return value===null?"غير متاح":rate.format(value)+"%";}
const money=new Intl.NumberFormat("ar-YE",{maximumFractionDigits:2});
function collectionsCurrency(amount:number,currency:string):string{return money.format(amount)+" "+currency;}
function taskTitle(intent:"OPEN_TASKS_OVERVIEW"|"REOPENED_TASKS_OVERVIEW"):string {
 return intent==="OPEN_TASKS_OVERVIEW"?"قائمة المهام المفتوحة":"إعادة فتح المهام";
}
function processLabel(key:"ORDERS"|"QUOTES"|"PURCHASE"|"INVOICES"|"TASKS"):string {
 return ({ORDERS:"الطلبات",QUOTES:"عروض الأسعار",PURCHASE:"المشتريات",INVOICES:"الفواتير",TASKS:"المهام"} as const)[key];
}
function waitClassLabel(value:string):string {
 const labels:Record<string,string>={MIXED_OR_UNATTRIBUTED:"انتظار مختلط أو غير منسوب",INTERNAL_RESPONSE:"استجابة داخلية",
  INTERNAL_DRAFT_REVIEW:"مراجعة واعتماد داخلي",MIXED_SUPPLIER_RECEIVING:"استلام مختلط المورد والمستودع",
  EXTERNAL_CUSTOMER_SETTLEMENT:"تسوية من العميل",INTERNAL_QUEUE_AND_WORK:"انتظار وتنفيذ داخلي"};
 return labels[value]??"تصنيف انتظار غير معروف";
}
function duration(value:number):string {
 return value<60?rate.format(value)+" دقيقة":rate.format(value/60)+" ساعة";
}
function inventoryTitle(intent:"DEAD_STOCK_OVERVIEW"|"REPLENISHMENT_OVERVIEW"):string {
 return intent==="REPLENISHMENT_OVERVIEW"?"احتياج إعادة التوريد":"حركة المخزون والركود";
}
function supplierTitle(intent:"SUPPLIER_PERFORMANCE_OVERVIEW"|"SUPPLIER_DELIVERY_ADHERENCE"):string {
 return intent==="SUPPLIER_DELIVERY_ADHERENCE"?"الالتزام بمواعيد التوريد":"ملخص أداء الموردين";
}
function retentionTitle(intent:"CUSTOMER_RETENTION_OVERVIEW"|"CUSTOMER_REPEAT_PURCHASE"|"CUSTOMER_DORMANCY_RISK"):string {
 if(intent==="CUSTOMER_DORMANCY_RISK")return "مخاطر فتور وخمول العملاء";
 if(intent==="CUSTOMER_REPEAT_PURCHASE")return "تكرار الشراء";
 return "ملخص الاحتفاظ بالعملاء";
}
function invoiceStatus(status:NaturalLanguageInvoiceMatch["matchStatus"]):string {
 if(status==="matched")return "مطابقة سعرية ثلاثية";
 if(status==="variance_pending")return "فرق سعر بانتظار المراجعة";
 if(status==="variance_approved")return "فرق سعر معتمد";
 return "فرق سعر مرفوض";
}
function orderStatus(status:NaturalLanguagePurchaseOrder["status"]):string {
 return status==="submitted"?"مرسل بانتظار الاستلام":"مستلم جزئياً";
}
export function NaturalLanguageAssistant({onOpenSupplierInvoice,onOpenPurchaseOrder}:NaturalLanguageAssistantProps) {
 const [question,setQuestion]=useState("");const [response,setResponse]=useState<NaturalLanguageAssistantResponse|null>(null);
 const [loading,setLoading]=useState(false);
 async function submit(){
  if(loading||!question.trim())return;setLoading(true);setResponse(null);
  try{setResponse(await runNaturalLanguageAssistantQuery(question));}
  catch{setResponse({status:"ERROR",message:"تعذر تنفيذ الاستعلام من مصدر التطبيق المصرح به."});}
  finally{setLoading(false);}
 }
 return <section dir="rtl" className="rounded-xl border p-4 space-y-3" aria-label="المساعد الإداري باللغة الطبيعية">
  <header><h2 className="text-lg font-semibold">المساعد الإداري</h2>
   <p className="text-xs text-muted-foreground">يستخدم نوايا معتمدة ومصادر قراءة مصرحاً بها فقط؛ لا ينشئ SQL ولا ينفذ أوامر تعديل.</p></header>
  <form onSubmit={event=>{event.preventDefault();void submit();}} className="flex flex-col gap-2 sm:flex-row">
   <input value={question} onChange={event=>setQuestion(event.target.value)} maxLength={400} aria-label="سؤال إداري"
    placeholder="مثال: ما أوامر الشراء المفتوحة؟" className="min-w-0 flex-1 rounded-lg border bg-background px-3 py-2 text-sm"/>
   <button type="submit" disabled={loading||!question.trim()} className="rounded-lg border px-4 py-2 text-sm font-medium disabled:opacity-50">{loading?"جارٍ الاستعلام…":"اسأل"}</button>
  </form>
  <p className="text-xs text-muted-foreground">أمثلة: أوامر الشراء المفتوحة، الأوامر بانتظار الاستلام، المستلمة جزئياً، فواتير المورد ذات فروق السعر، ومعدل الاحتفاظ وتكرار الشراء ومخاطر الخمول وأداء الموردين والركود واحتياج إعادة التوريد واختناقات العمليات والتحصيلات المستحقة من فواتير العملاء خلال 7 أو 30 أو 90 يوماً، والمهام المفتوحة وإعادة فتح المهام، والتقرير اليومي أو الأسبوعي أو الشهري للمهام، ومخاطر المهام للإدارة، وجودة المهام والتوصيات والإنذارات بعد المراجعة. لا يُستنتج التأخير من عمر الأمر أو من تاريخ إنشائه.</p>
  {response?.status==="CLARIFICATION"||response?.status==="UNSUPPORTED"?<div role="status" className="rounded-lg border p-3 text-sm">
   <p>{response.plan.explanation}</p>{response.plan.clarification?<p className="mt-2 font-medium">{response.plan.clarification}</p>:null}</div>:null}
  {response&&["DENIED","UNAVAILABLE","ERROR"].includes(response.status)?<div role="alert" className="rounded-lg border p-3 text-sm">
   {response.status==="DENIED"?"غير مصرح":response.status==="UNAVAILABLE"?"المصدر غير متاح":"تعذر الاستعلام"}: {response.message}</div>:null}
  {response?.status==="RESULT"&&response.result.kind==="TASK_QUALITY"?<div className="space-y-3">
   <div className="rounded-lg border p-3 text-sm">
    <p className="font-semibold">{response.result.answer}</p>
    <p className="mt-1 text-xs text-muted-foreground">المصدر: {response.result.sourceRpc} · وقت الاستعلام: {new Date(response.result.queriedAt).toLocaleString("ar-YE")}</p>
    <p className="mt-1 text-xs text-muted-foreground">تاريخ الاستعلام لا يمثل تاريخ آخر مراجعة؛ المؤشرات محسوبة من أحدث مراجعة محفوظة لكل نوع.</p>
   </div>
   <TaskQualityReviewMetrics quality={response.result.quality}/>
  </div>:null}
  {response?.status==="RESULT"&&response.result.kind==="PURCHASE_ORDER"?<div className="space-y-3">
   <div className="rounded-lg border p-3 text-sm"><p className="font-semibold">{response.result.answer}</p>
    <p className="mt-1 text-xs text-muted-foreground">المصدر: {response.result.sourceRpc} · أوامر مفحوصة: {qty.format(response.result.inspectedOrderCount)}</p>
    <div className="mt-2 flex flex-wrap gap-3 text-xs"><span>مرسلة: {qty.format(response.result.countsByStatus.submitted)}</span><span>مستلمة جزئياً: {qty.format(response.result.countsByStatus.partially_received)}</span></div></div>
   {response.result.notice?<p className="rounded-lg border p-3 text-xs">{response.result.notice}</p>:null}
   {response.result.orders.map(order=><article key={order.id} className="rounded-lg border p-3 text-sm">
    <div className="flex flex-wrap justify-between gap-2"><strong>أمر {order.number} · {order.supplierName}</strong><span className="text-xs">{orderStatus(order.status)}</span></div>
    <p className="text-xs text-muted-foreground">المخزن: {order.warehouseName} · الإرسال: {order.submittedAt??"لم يسجل"}</p>
    <p className="mt-1 text-xs">سطور الأصناف: {qty.format(order.itemCount)} · سطور الاستلام المتبقية: {qty.format(order.pendingLineCount)}</p>
    {onOpenPurchaseOrder?<button type="button" onClick={()=>onOpenPurchaseOrder(order.id)} className="mt-2 rounded-lg border px-3 py-1.5 text-xs">فتح أمر الشراء</button>:null}
   </article>)}
  </div>:null}
  {response?.status==="RESULT"&&response.result.kind==="SUPPLIER_INVOICE"?<div className="space-y-3">
   <div className="rounded-lg border p-3 text-sm"><p className="font-semibold">{response.result.answer}</p>
    <p className="mt-1 text-xs text-muted-foreground">المصدر: {response.result.sourceRpc} · كما في {response.result.asOfDate} · مفحوص {qty.format(response.result.inspectedInvoiceCount)} من {qty.format(response.result.totalInvoiceCount)}</p>
    <div className="mt-2 flex flex-wrap gap-3 text-xs"><span>مطابقة: {qty.format(response.result.countsByStatus.matched)}</span>
     <span>معلّقة: {qty.format(response.result.countsByStatus.variance_pending)}</span>
     <span>معتمدة بفرق: {qty.format(response.result.countsByStatus.variance_approved)}</span>
     <span>مرفوضة: {qty.format(response.result.countsByStatus.variance_rejected)}</span></div></div>
   {response.result.notice?<p className="rounded-lg border p-3 text-xs">{response.result.notice}</p>:null}
   {response.result.invoices.map(invoice=><article key={invoice.invoiceId} className="rounded-lg border p-3 text-sm">
    <div className="flex flex-wrap items-start justify-between gap-2"><div><p className="font-semibold">{invoice.supplierName} · فاتورة {invoice.invoiceNumber}</p>
     <p className="text-xs text-muted-foreground">أمر الشراء {invoice.purchaseOrderNumber} · {invoice.invoiceDate} · {invoice.currency}</p></div><span className="rounded-full border px-2 py-1 text-xs">{invoiceStatus(invoice.matchStatus)}</span></div>
    <p className="mt-2 text-xs">سطور الفاتورة: {qty.format(invoice.lineCount)} · سطور ذات فرق سعر: {qty.format(invoice.mismatchedLineCount)}</p>
    {invoice.reviewReason?<p className="mt-1 text-xs">سبب المراجعة: {invoice.reviewReason}</p>:null}
    {onOpenSupplierInvoice?<button type="button" onClick={()=>onOpenSupplierInvoice(invoice.invoiceId)} className="mt-2 rounded-lg border px-3 py-1.5 text-xs">فتح الفاتورة</button>:null}
   </article>)}
  </div>:null}
  {response?.status==="RESULT"&&response.result.kind==="PROCESS_TASKS"?<div className="space-y-3">
   <div className="rounded-lg border p-3 text-sm">
    <div className="flex flex-wrap items-center justify-between gap-2"><strong>{taskTitle(response.result.intent)}</strong>
     <span className="rounded-full border px-2 py-1 text-xs">{response.result.state==="READY"?"مصدر مصرح ومكتمل":"مصدر غير متاح"}</span></div>
    <p className="mt-2 font-medium">{response.result.answer}</p>
    <p className="mt-2 text-xs text-muted-foreground">المصدر: {response.result.sourceRpc} · كما في {response.result.asOf} · الفترة المرجعية: {response.result.period.from} — {response.result.period.to}</p>
    {response.result.state==="READY"&&response.result.intent==="OPEN_TASKS_OVERVIEW"&&response.result.oldestAgeMinutes!==null?<p className="mt-2 text-xs">عمر أقدم مهمة مفتوحة: {duration(response.result.oldestAgeMinutes)}</p>:null}
    {response.result.state==="UNAVAILABLE"?<p role="status" className="mt-2 text-xs text-muted-foreground">{response.result.sourceMessage}</p>:null}
   </div>
   <p className="text-xs text-muted-foreground">الأعداد مقيدة بمهام المؤسسة والأدوار التي يسمح بها الخادم. لا يعرض هذا الاستعلام أسماء الموظفين أو تفاصيل المهام، ولا يحكم على التأخير لغياب تاريخ استحقاق موحد.</p>
  </div>:null}
  {response?.status==="RESULT"&&response.result.kind==="EXPECTED_COLLECTIONS"?<div className="space-y-3">
   <div className="rounded-lg border p-3 text-sm">
    <div className="flex flex-wrap items-center justify-between gap-2"><strong>التحصيلات المستحقة المجدولة</strong>
     <span className="rounded-full border px-2 py-1 text-xs">{response.result.state==="READY"?"تغطية موثقة":response.result.state==="PARTIAL"?"الإجماليات محجوبة":"لا توجد استحقاقات"}</span></div>
    <p className="mt-2 font-medium">{response.result.answer}</p>
    <p className="mt-2 text-xs text-muted-foreground">المصدر: {response.result.sourceRpc} · كما في {response.result.asOf} · الفترة: {response.result.period.from} — {response.result.period.to} · فواتير: {count(response.result.invoiceCount)}</p>
   </div>
   {response.result.completeSchedule&&response.result.currencies.length?<div className="grid gap-2 sm:grid-cols-2">
    {response.result.currencies.map(item=><article key={item.currency} className="rounded-lg border p-3 text-sm">
     <p className="text-xs text-muted-foreground">العملة {item.currency}</p>
     <strong className="text-lg">{collectionsCurrency(item.amount,item.currency)}</strong>
     <p className="text-xs text-muted-foreground">{count(item.invoiceCount)} فاتورة مستحقة</p>
    </article>)}
   </div>:null}
   {response.result.warnings.length?<div role="status" className="rounded-lg border p-3 text-xs"><strong>تنبيهات المصدر</strong><ul className="mt-1 list-disc space-y-1 ps-5">{response.result.warnings.slice(0,10).map(warning=><li key={warning}>{warning}</li>)}</ul></div>:null}
   <p className="text-xs text-muted-foreground">الأرقام أرصدة فواتير عملاء مستحقة بعد خصم الدفعات المسجلة، مع إبقاء العملات منفصلة. ليست توقعاً لاحتمال التحصيل أو صافي السيولة، ولا تشمل التزامات الموردين.</p>
  </div>:null}
  {response?.status==="RESULT"&&response.result.kind==="PROCESS_BOTTLENECK"?<div className="space-y-3">
   <div className="rounded-lg border p-3 text-sm">
    <div className="flex flex-wrap items-center justify-between gap-2"><strong>اختناقات العمليات وزمن الدورة</strong>
     <span className="rounded-full border px-2 py-1 text-xs">{response.result.state==="READY"?"مصادر مكتملة":response.result.state==="PARTIAL"?"مصادر جزئية":"غير متاح"}</span></div>
    <p className="mt-2 font-medium">{response.result.answer}</p>
    <p className="mt-2 text-xs text-muted-foreground">كما في {response.result.asOf} · الحالية: {response.result.period.from} — {response.result.period.to} · المقارنة: {response.result.baselinePeriod?response.result.baselinePeriod.from+" — "+response.result.baselinePeriod.to:"غير متاحة"}</p>
   </div>
   {response.result.findings.length?<div className="space-y-2">
    {response.result.findings.slice(0,5).map((finding,index)=><article key={finding.processKey+":"+finding.stageKey+":"+index} className="rounded-lg border p-3 text-sm">
     <div className="flex flex-wrap items-center justify-between gap-2"><strong>{processLabel(finding.processKey)} · {finding.stageKey}</strong><span className="text-xs">عينة مكتملة: {count(finding.sampleCount)}</span></div>
     <p className="mt-1 text-xs text-muted-foreground">{waitClassLabel(finding.waitClass)}</p>
     <div className="mt-2 grid grid-cols-2 gap-2"><div><p className="text-xs text-muted-foreground">وسيط الانتظار</p><strong>{duration(finding.medianMinutes)}</strong></div><div><p className="text-xs text-muted-foreground">المئين 90</p><strong>{duration(finding.p90Minutes)}</strong></div></div>
     <p className="mt-2 text-xs">{finding.recommendation}</p>
    </article>)}
   </div>:null}
   {response.result.comparisons.length?<section className="rounded-lg border p-3 text-sm">
    <strong>التغير بين الفترتين (وصفي)</strong>
    <div className="mt-2 space-y-2">{response.result.comparisons.slice(0,5).map((item,index)=><p key={item.processKey+":"+item.stageKey+":"+index} className="text-xs">
     {processLabel(item.processKey)} · {item.stageKey}: {duration(item.baselineMedianMinutes)} ← {duration(item.currentMedianMinutes)}
     {item.changePercent===null?"":" · "+rate.format(item.changePercent)+"%"} · لا يثبت السببية
    </p>)}</div>
   </section>:null}
   {response.result.withheldReasons.length?<div role="status" className="rounded-lg border p-3 text-xs"><strong>مصادر ومراحل غير مكتملة أو بعينة صغيرة</strong><ul className="mt-1 list-disc space-y-1 ps-5">{response.result.withheldReasons.slice(0,12).map(reason=><li key={reason}>{reason}</li>)}</ul></div>:null}
   <p className="text-xs text-muted-foreground">لا تُنسب فترات الانتظار إلى موظف، ولا تُعتبر المقارنة سبباً للتغير أو حكماً على الإنتاجية الفردية.</p>
  </div>:null}
  {response?.status==="RESULT"&&response.result.kind==="INVENTORY"?<div className="space-y-3">
   <div className="rounded-lg border p-3 text-sm">
    <div className="flex flex-wrap items-center justify-between gap-2"><strong>{inventoryTitle(response.result.intent)}</strong>
     <span className="rounded-full border px-2 py-1 text-xs">{response.result.state==="READY"?"مؤشرات مكتملة حسب المصدر":response.result.state==="PARTIAL"?"بعض المؤشرات محجوبة":"لا توجد منتجات"}</span></div>
    <p className="mt-2 font-medium">{response.result.answer}</p>
    <p className="mt-2 text-xs text-muted-foreground">المصدر: {response.result.sourceRpc} · كما في {response.result.asOf} · نافذة الحركة: {response.result.period.from} — {response.result.period.to} · المنتجات: {count(response.result.totalProducts)}</p>
   </div>
   {response.result.intent==="DEAD_STOCK_OVERVIEW"&&response.result.deadStock.stagnant!==null?<div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
    <article className="rounded-lg border p-3 text-sm"><p className="text-xs text-muted-foreground">منتجات نشطة</p><strong className="text-lg">{count(response.result.deadStock.active)}</strong></article>
    <article className="rounded-lg border p-3 text-sm"><p className="text-xs text-muted-foreground">بطيئة الحركة</p><strong className="text-lg">{count(response.result.deadStock.slowMoving)}</strong></article>
    <article className="rounded-lg border p-3 text-sm"><p className="text-xs text-muted-foreground">راكدة (90 يوماً فأكثر)</p><strong className="text-lg">{count(response.result.deadStock.stagnant)}</strong></article>
    <article className="rounded-lg border p-3 text-sm"><p className="text-xs text-muted-foreground">بلا حركة مسجلة</p><strong className="text-lg">{count(response.result.deadStock.zeroMovement)}</strong></article>
   </div>:null}
   {response.result.intent==="REPLENISHMENT_OVERVIEW"&&response.result.replenishment.recommendedProducts!==null?<div className="grid gap-2 sm:grid-cols-3">
    <article className="rounded-lg border p-3 text-sm"><p className="text-xs text-muted-foreground">منتجات لها توصية توريد</p><strong className="text-lg">{count(response.result.replenishment.recommendedProducts)}</strong></article>
    <article className="rounded-lg border p-3 text-sm"><p className="text-xs text-muted-foreground">لا تحتاج توريداً مثبتاً</p><strong className="text-lg">{count(response.result.replenishment.noActionProducts)}</strong></article>
    <article className="rounded-lg border p-3 text-sm"><p className="text-xs text-muted-foreground">توصيات محجوبة</p><strong className="text-lg">{count(response.result.replenishment.withheldProducts)}</strong></article>
   </div>:null}
   {response.result.warnings.length?<div role="status" className="rounded-lg border p-3 text-xs"><strong>قيود القياس والإثبات</strong><ul className="mt-1 list-disc space-y-1 ps-5">{response.result.warnings.slice(0,12).map(warning=><li key={warning}>{warning}</li>)}</ul></div>:null}
   <p className="text-xs text-muted-foreground">لا تُجمع كميات منتجات مختلفة الوحدات، ولا تُعرض قيمة مالية للمخزون لغياب تكلفة وحدة وعملة مثبتتين. النتيجة لا تنشئ أمراً أو حركة مخزون.</p>
  </div>:null}
  {response?.status==="RESULT"&&response.result.kind==="SUPPLIER_PERFORMANCE"?<div className="space-y-3">
   <div className="rounded-lg border p-3 text-sm">
    <div className="flex flex-wrap items-center justify-between gap-2"><strong>{supplierTitle(response.result.intent)}</strong>
     <span className="rounded-full border px-2 py-1 text-xs">{response.result.state==="READY"?"تغطية كاملة":response.result.state==="PARTIAL"?"تغطية جزئية":"لا توجد سجلات"}</span></div>
    <p className="mt-2 font-medium">{response.result.answer}</p>
    <p className="mt-2 text-xs text-muted-foreground">المصدر: {response.result.sourceRpc} · كما في {response.result.asOf} · نافذة UTC: {response.result.period.from} — {response.result.period.to} · الموردون: {count(response.result.returnedSupplierCount)} من {count(response.result.totalSupplierCount)}</p>
   </div>
   {response.result.completePopulation&&response.result.state!=="EMPTY"?<div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
    <article className="rounded-lg border p-3 text-sm"><p className="text-xs text-muted-foreground">أوامر الشراء</p><strong className="text-lg">{count(response.result.aggregate.purchaseOrderCount)}</strong></article>
    <article className="rounded-lg border p-3 text-sm"><p className="text-xs text-muted-foreground">أوامر مكتملة</p><strong className="text-lg">{count(response.result.aggregate.completedOrderCount)}</strong></article>
    <article className="rounded-lg border p-3 text-sm"><p className="text-xs text-muted-foreground">أوامر مفتوحة</p><strong className="text-lg">{count(response.result.aggregate.openOrderCount)}</strong></article>
    <article className="rounded-lg border p-3 text-sm"><p className="text-xs text-muted-foreground">سطور استلام متبقية</p><strong className="text-lg">{count(response.result.aggregate.backlogLineCount)}</strong></article>
    <article className="rounded-lg border p-3 text-sm"><p className="text-xs text-muted-foreground">عينات زمن التوريد</p><strong className="text-lg">{count(response.result.aggregate.leadTimeSampleCount)}</strong></article>
    <article className="rounded-lg border p-3 text-sm"><p className="text-xs text-muted-foreground">معدل الالتزام بالموعود</p><strong className="text-lg">{percent(response.result.aggregate.onTimePercent)}</strong></article>
   </div>:null}
   {response.result.withheldReasons.length?<div role="status" className="rounded-lg border p-3 text-xs"><strong>قيود القياس</strong><ul className="mt-1 list-disc space-y-1 ps-5">{response.result.withheldReasons.map(reason=><li key={reason}>{reason}</li>)}</ul></div>:null}
   <p className="text-xs text-muted-foreground">المؤشرات تشغيلية فقط؛ لا تعرض أسعار الموردين أو أرصدتهم، ولا تنشئ أوامر شراء. لا يُحسب متوسط زمن التوريد من متوسطات الموردين المنفصلة.</p>
  </div>:null}
  {response?.status==="RESULT"&&response.result.kind==="CUSTOMER_RETENTION"?<div className="space-y-3">
   <div className="rounded-lg border p-3 text-sm">
    <div className="flex flex-wrap items-center justify-between gap-2"><strong>{retentionTitle(response.result.intent)}</strong>
     <span className="rounded-full border px-2 py-1 text-xs">{response.result.state==="READY"?"تغطية موثقة":"تغطية غير مكتملة"}</span></div>
    <p className="mt-2 font-medium">{response.result.answer}</p>
    <p className="mt-2 text-xs text-muted-foreground">المصدر: {response.result.sourceRpc} · كما في {response.result.asOf} · الفترة الحالية: {response.result.period.from} — {response.result.period.to} · السابقة: {response.result.previousPeriod.from} — {response.result.previousPeriod.to}</p>
   </div>
   {response.result.completePopulation?<div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
    <article className="rounded-lg border p-3 text-sm"><p className="text-xs text-muted-foreground">مجتمع العملاء</p><strong className="text-lg">{count(response.result.population.total)}</strong></article>
    <article className="rounded-lg border p-3 text-sm"><p className="text-xs text-muted-foreground">العملاء النشطون</p><strong className="text-lg">{count(response.result.population.activeCurrentPeriod)}</strong></article>
    <article className="rounded-lg border p-3 text-sm"><p className="text-xs text-muted-foreground">معدل الاحتفاظ</p><strong className="text-lg">{percent(response.result.rates.retentionRate)}</strong></article>
    <article className="rounded-lg border p-3 text-sm"><p className="text-xs text-muted-foreground">معدل تكرار الشراء</p><strong className="text-lg">{percent(response.result.rates.repeatPurchaseRate)}</strong></article>
   </div>:null}
   {response.result.completePopulation?<div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
    <article className="rounded-lg border p-3 text-sm"><p className="text-xs text-muted-foreground">مستمرون</p><strong>{count(response.result.population.retainedCustomers)}</strong></article>
    <article className="rounded-lg border p-3 text-sm"><p className="text-xs text-muted-foreground">متكررون</p><strong>{count(response.result.population.repeatPurchaseCustomers)}</strong></article>
    <article className="rounded-lg border p-3 text-sm"><p className="text-xs text-muted-foreground">نشطون خلال 30 يوماً</p><strong>{count(response.result.activity.active30Days)}</strong></article>
    <article className="rounded-lg border p-3 text-sm"><p className="text-xs text-muted-foreground">فتور 31–60 يوماً</p><strong>{count(response.result.activity.cooling31To60Days)}</strong></article>
    <article className="rounded-lg border p-3 text-sm"><p className="text-xs text-muted-foreground">معرضون للخمول 61–90 يوماً</p><strong>{count(response.result.activity.atRisk61To90Days)}</strong></article>
    <article className="rounded-lg border p-3 text-sm"><p className="text-xs text-muted-foreground">خاملون أكثر من 90 يوماً</p><strong>{count(response.result.activity.inactiveOver90Days)}</strong></article>
   </div>:null}
   {response.result.warnings.length?<div role="status" className="rounded-lg border p-3 text-xs"><strong>قيود المصدر</strong><ul className="mt-1 list-disc space-y-1 ps-5">{response.result.warnings.map(warning=><li key={warning}>{warning}</li>)}</ul></div>:null}
   <p className="text-xs text-muted-foreground">المساعد يعرض مؤشرات مجمعة فقط؛ لا يكشف أسماء العملاء أو مراجعهم أو أرصدتهم أو أسعارهم، ولا ينشئ رسائل متابعة أو إجراءات تلقائية.</p>
  </div>:null}

  {response?.status==="RESULT"&&response.result.kind==="TASK_REPORT"?<div className="space-y-3 rounded-lg border p-3 text-sm">
   <div className="flex flex-wrap items-center justify-between gap-2">
    <strong>{response.result.intent==="MANAGER_TASK_RISKS"?"تقرير مخاطر المهام للإدارة":response.result.intent==="DAILY_TASK_REPORT"?"التقرير اليومي للمهام":response.result.intent==="WEEKLY_TASK_REPORT"?"التقرير الأسبوعي للمهام":"التقرير الشهري للمهام"}</strong>
    <span className="rounded-full border px-2 py-1 text-xs">{response.result.state==="EMPTY"?"لا توجد سجلات مهام":"تغطية كاملة ضمن الأدوار المصرح بها"}</span>
   </div>
   <p className="font-medium">{response.result.answer}</p>
   <p className="text-xs text-muted-foreground">المصدر: ai_tasks + audit_logs · كما في {new Date(response.result.report.asOf).toLocaleString("ar",{timeZone:"UTC"})} UTC · الفترة: {response.result.report.period.from} — {response.result.report.period.to} UTC · الأدوار المصرح بها: {response.result.report.scope.visibleRoles.join("، ")}</p>
   {response.result.report.reportKind!=="MANAGER"?<div className="overflow-x-auto">
    <table className="w-full min-w-[720px] text-start text-xs">
     <thead><tr className="border-b"><th className="p-2">الدور</th><th className="p-2">جديدة</th><th className="p-2">مفتوحة</th><th className="p-2">متأخرة</th><th className="p-2">عالية/حرجة</th><th className="p-2">أُكملت أول مرة</th><th className="p-2">إعادات الفتح</th><th className="p-2">معدل إعادة الفتح</th><th className="p-2">زمن الحل بالدقائق</th></tr></thead>
     <tbody>{response.result.report.roleSummaries.map(row=><tr key={row.taskRole} className="border-b last:border-0">
      <th className="p-2 font-medium">{row.taskRole==="sales"?"المبيعات":row.taskRole==="accountant"?"المحاسبة":row.taskRole==="warehouse"?"المخزن":row.taskRole==="purchasing"?"المشتريات":row.taskRole==="management"?"الإدارة":"العمليات"}</th>
      <td className="p-2">{count(row.newCount)}</td><td className="p-2">{count(row.openCount)}</td><td className="p-2">{count(row.overdueOpenCount)}</td>
      <td className="p-2">{count(row.highImpactOpenCount)}</td><td className="p-2">{count(row.completedCount)}</td>
      <td className="p-2">{count(row.reopenedEventCount)}</td><td className="p-2">{percent(row.reopenRatePercent)}</td><td className="p-2">{row.averageResolutionMinutes===null?"غير محسوب":count(Math.round(row.averageResolutionMinutes))}</td>
     </tr>)}</tbody>
    </table>
   </div>:null}
   {response.result.report.reportKind==="WEEKLY"?<div className="space-y-2">
    <strong>التوزيع حسب المصدر والدور والأولوية</strong>
    <div className="overflow-x-auto"><table className="w-full min-w-[620px] text-xs"><thead><tr className="border-b"><th className="p-2">المصدر</th><th className="p-2">الدور</th><th className="p-2">الأولوية</th><th className="p-2">إنشاء</th><th className="p-2">إكمال</th><th className="p-2">مهام أعيد فتحها</th><th className="p-2">أحداث إعادة الفتح</th><th className="p-2">معدل إعادة الفتح</th><th className="p-2">متوسط الحل بالدقائق</th></tr></thead>
     <tbody>{response.result.report.sourceBreakdown.map(row=><tr key={row.sourceKey+row.taskRole+row.priority} className="border-b"><td className="p-2" dir="ltr">{row.sourceKey}</td><td className="p-2">{row.taskRole}</td><td className="p-2">{row.priority}</td><td className="p-2">{count(row.createdCount)}</td><td className="p-2">{count(row.completedCount)}</td><td className="p-2">{count(row.reopenedTaskCount)}</td><td className="p-2">{count(row.reopenedEventCount)}</td><td className="p-2">{percent(row.reopenRatePercent)}</td><td className="p-2">{row.averageResolutionMinutes===null?"غير محسوب":count(Math.round(row.averageResolutionMinutes))}</td></tr>)}</tbody>
    </table></div>
   </div>:null}
   {response.result.report.reportKind==="MONTHLY"?<div className="space-y-2">
    <strong>اتجاه العمل أسبوعياً داخل الشهر</strong>
    <div className="overflow-x-auto"><table className="w-full min-w-[460px] text-xs"><thead><tr className="border-b"><th className="p-2">بداية الأسبوع</th><th className="p-2">جديدة</th><th className="p-2">أُكملت</th><th className="p-2">مهام أعيد فتحها</th><th className="p-2">أحداث إعادة الفتح</th><th className="p-2">متوسط زمن الحل بالدقائق</th></tr></thead>
     <tbody>{response.result.report.weeklyTrend.map(row=><tr key={row.weekStart} className="border-b"><td className="p-2">{row.weekStart}</td><td className="p-2">{count(row.createdCount)}</td><td className="p-2">{count(row.completedCount)}</td><td className="p-2">{count(row.reopenedTaskCount)}</td><td className="p-2">{count(row.reopenedEventCount)}</td><td className="p-2">{row.averageResolutionMinutes===null?"غير محسوب":count(Math.round(row.averageResolutionMinutes))}</td></tr>)}</tbody>
    </table></div>
   </div>:null}
   {response.result.report.reportKind==="MANAGER"?<div className="space-y-2">
    <div className="flex flex-wrap justify-between gap-2"><strong>المخاطر المفتوحة عالية/حرجة الأولوية</strong><span className="text-xs text-muted-foreground">{count(response.result.report.scope.managerRiskTotalCount??0)} إجمالي · {count(response.result.report.managerRisks.length)} معروض</span></div>
    {response.result.report.managerRisks.length===0?<p className="text-muted-foreground">لا توجد مهام مفتوحة عالية/حرجة الأولوية في النطاق المصرح به.</p>:<div className="space-y-2">{response.result.report.managerRisks.map(risk=><article key={risk.id} className="rounded-md border p-3">
     <div className="flex flex-wrap justify-between gap-2"><strong>{risk.title}</strong><span>{risk.priority==="critical"?"حرجة":"عالية"}</span></div>
     <p className="mt-1 text-xs text-muted-foreground">الدور: {risk.taskRole} · الحالة: {risk.status} · عمر المهمة: {count(Math.round(risk.ageMinutes))} دقيقة · الاستحقاق: {risk.dueAt??"غير محدد"}</p>
     <p className="text-xs">مرجع المكلف: {risk.assignedProfileId??"غير مسند"} · سبب التأخير: {risk.delayReason??"غير مسجل في المصدر"} · القرار الإداري المطلوب: {risk.requiredManagementDecision??"غير مسجل في المصدر"}</p>
     {risk.sourceEntityType&&risk.sourceEntityId?<p className="mt-1 text-xs text-muted-foreground">مرجع المصدر: {risk.sourceEntityType} / {risk.sourceEntityId}</p>:null}
    </article>)}</div>}
    {!response.result.report.scope.managerRiskCompletePopulation?<p className="text-xs text-muted-foreground">تعرض القائمة أعلى 25 مهمة فقط؛ العدد الإجمالي مستقل عن عدد الصفوف المعروضة.</p>:null}
   </div>:null}
   <div className="rounded-md border p-3 text-xs">
    <strong>تعريفات القياس وحدوده</strong>
    <p className="mt-1">الجديد = سجل أُنشئ في الفترة ولا يُعاد عده عند إعادة الفتح. الإكمال = أول انتقال موثق إلى completed. زمن الحل = من الإنشاء إلى أول إكمال. إعادة الفتح حدث مستقل؛ النسبة تقيس المهام التي اكتملت أول مرة ثم أعيد فتحها داخل الفترة نفسها.</p>
    <p className="mt-1">الانتظار على طرف آخر، أسباب التأخير، الإنذارات الكاذبة، الأسباب المتكررة ونتائج التحسين غير مسجلة في عقد المصدر؛ لا تعرض كأصفار. الأولوية التشغيلية ليست أثراً مالياً.</p>
    {response.result.report.limitations.length?<ul className="mt-2 list-disc space-y-1 ps-5">{response.result.report.limitations.map((item,index)=><li key={index}>{item}</li>)}</ul>:null}
   </div>
  </div>:null}

 </section>;
}
