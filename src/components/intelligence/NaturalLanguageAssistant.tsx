import { useState } from "react";
import { runNaturalLanguageAssistantQuery,type NaturalLanguageAssistantResponse } from "@/lib/intelligence/natural-language-assistant-client";
import type { NaturalLanguageInvoiceMatch } from "@/lib/intelligence/natural-language-assistant";
export interface NaturalLanguageAssistantProps {onOpenSupplierInvoice?:(invoiceId:string)=>void;}
const quantity=new Intl.NumberFormat("ar-YE",{maximumFractionDigits:0});
function statusLabel(status:NaturalLanguageInvoiceMatch["matchStatus"]):string {
 if(status==="matched")return "مطابقة ثلاثية";
 if(status==="variance_pending")return "فرق سعر بانتظار المراجعة";
 if(status==="variance_approved")return "فرق سعر معتمد";
 return "فرق سعر مرفوض";
}
export function NaturalLanguageAssistant({onOpenSupplierInvoice}:NaturalLanguageAssistantProps) {
 const [question,setQuestion]=useState("");
 const [response,setResponse]=useState<NaturalLanguageAssistantResponse|null>(null);
 const [loading,setLoading]=useState(false);
 async function submit() {
  if(loading||!question.trim())return;
  setLoading(true);setResponse(null);
  try {setResponse(await runNaturalLanguageAssistantQuery(question));}
  catch {setResponse({status:"ERROR",message:"تعذر تنفيذ الاستعلام من مصدر فواتير الموردين."});}
  finally {setLoading(false);}
 }
 return <section dir="rtl" className="rounded-xl border p-4 space-y-3" aria-label="المساعد الإداري باللغة الطبيعية">
  <header><h2 className="text-lg font-semibold">المساعد الإداري</h2>
   <p className="text-xs text-muted-foreground">يفهم الأسئلة المعتمدة ويقرأ المصادر المصرح بها فقط؛ لا ينفذ SQL أو أوامر تعديل.</p></header>
  <form onSubmit={event=>{event.preventDefault();void submit();}} className="flex flex-col gap-2 sm:flex-row">
   <input value={question} onChange={event=>setQuestion(event.target.value)} maxLength={400}
    aria-label="سؤال إداري" placeholder="مثال: ما فواتير المورد التي لم تطابق الاستلام؟"
    className="min-w-0 flex-1 rounded-lg border bg-background px-3 py-2 text-sm"/>
   <button type="submit" disabled={loading||!question.trim()} className="rounded-lg border px-4 py-2 text-sm font-medium disabled:opacity-50">
    {loading?"جارٍ الاستعلام…":"اسأل"}
   </button>
  </form>
  <p className="text-xs text-muted-foreground">أمثلة مدعومة: الفواتير غير المطابقة، والفواتير التي تنتظر مراجعة فرق السعر. لا يُستنتج التأخير الزمني من عمر أمر الشراء.</p>
  {response?.status==="CLARIFICATION"||response?.status==="UNSUPPORTED"?<div role="status" className="rounded-lg border p-3 text-sm">
   <p>{response.plan.explanation}</p>{response.plan.clarification?<p className="mt-2 font-medium">{response.plan.clarification}</p>:null}
  </div>:null}
  {response&&["DENIED","UNAVAILABLE","ERROR"].includes(response.status)?<div role="alert" className="rounded-lg border p-3 text-sm">
   {response.status==="DENIED"?"غير مصرح":response.status==="UNAVAILABLE"?"المصدر غير متاح":"تعذر الاستعلام"}: {response.message}
  </div>:null}
  {response?.status==="RESULT"?<div className="space-y-3">
   <div className="rounded-lg border p-3 text-sm">
    <p className="font-semibold">{response.result.answer}</p>
    <p className="mt-1 text-xs text-muted-foreground">المصدر: {response.result.sourceRpc} · كما في {response.result.asOfDate} · مفحوص {quantity.format(response.result.inspectedInvoiceCount)} من {quantity.format(response.result.totalInvoiceCount)}</p>
    <div className="mt-2 flex flex-wrap gap-3 text-xs">
     <span>مطابقة: {quantity.format(response.result.countsByStatus.matched)}</span>
     <span>معلّقة: {quantity.format(response.result.countsByStatus.variance_pending)}</span>
     <span>معتمدة بفرق: {quantity.format(response.result.countsByStatus.variance_approved)}</span>
     <span>مرفوضة: {quantity.format(response.result.countsByStatus.variance_rejected)}</span>
    </div>
   </div>
   {response.result.notice?<p className="rounded-lg border p-3 text-xs">{response.result.notice}</p>:null}
   {response.result.invoices.length?<div className="space-y-2">
    {response.result.invoices.map(invoice=><article key={invoice.invoiceId} className="rounded-lg border p-3 text-sm">
     <div className="flex flex-wrap items-start justify-between gap-2"><div>
      <p className="font-semibold">{invoice.supplierName} · فاتورة {invoice.invoiceNumber}</p>
      <p className="text-xs text-muted-foreground">أمر الشراء {invoice.purchaseOrderNumber} · {invoice.invoiceDate} · {invoice.currency}</p>
     </div><span className="rounded-full border px-2 py-1 text-xs">{statusLabel(invoice.matchStatus)}</span></div>
     <p className="mt-2 text-xs">سطور الفاتورة: {quantity.format(invoice.lineCount)} · سطور ذات فرق سعر: {quantity.format(invoice.mismatchedLineCount)}</p>
     {invoice.reviewReason?<p className="mt-1 text-xs">سبب المراجعة: {invoice.reviewReason}</p>:null}
     {onOpenSupplierInvoice?<button type="button" onClick={()=>onOpenSupplierInvoice(invoice.invoiceId)} className="mt-2 rounded-lg border px-3 py-1.5 text-xs">فتح الفاتورة</button>:null}
    </article>)}
   </div>:null}
  </div>:null}
 </section>;
}
