import { useState } from "react";
import { runNaturalLanguageAssistantQuery,type NaturalLanguageAssistantResponse } from "@/lib/intelligence/natural-language-assistant-client";
import type { NaturalLanguageInvoiceMatch,NaturalLanguagePurchaseOrder } from "@/lib/intelligence/natural-language-assistant";
export interface NaturalLanguageAssistantProps {onOpenSupplierInvoice?:(invoiceId:string)=>void;onOpenPurchaseOrder?:(purchaseOrderId:string)=>void;}
const qty=new Intl.NumberFormat("ar-YE",{maximumFractionDigits:0});
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
  <p className="text-xs text-muted-foreground">أمثلة: أوامر الشراء المفتوحة، الأوامر بانتظار الاستلام، المستلمة جزئياً، فواتير المورد ذات فروق السعر، وفروق السعر قيد المراجعة. لا يُستنتج التأخير من عمر الأمر أو من تاريخ إنشائه.</p>
  {response?.status==="CLARIFICATION"||response?.status==="UNSUPPORTED"?<div role="status" className="rounded-lg border p-3 text-sm">
   <p>{response.plan.explanation}</p>{response.plan.clarification?<p className="mt-2 font-medium">{response.plan.clarification}</p>:null}</div>:null}
  {response&&["DENIED","UNAVAILABLE","ERROR"].includes(response.status)?<div role="alert" className="rounded-lg border p-3 text-sm">
   {response.status==="DENIED"?"غير مصرح":response.status==="UNAVAILABLE"?"المصدر غير متاح":"تعذر الاستعلام"}: {response.message}</div>:null}
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
 </section>;
}
