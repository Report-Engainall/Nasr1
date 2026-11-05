import { supabase } from "@/lib/supabase";
import { fetchSupplierInvoiceWorkspace } from "@/lib/supplier-invoices";
import { planNaturalLanguageQuery,resolvePurchaseOrderIntent,resolveSupplierInvoiceIntent,
 type NaturalLanguagePlanResult,type NaturalLanguageResolvedResult,type SupplierInvoiceIntent,type PurchaseOrderIntent } from "./natural-language-assistant";
export type NaturalLanguageAssistantResponse=
 |{status:"RESULT";plan:Extract<NaturalLanguagePlanResult,{status:"READY"}>;result:NaturalLanguageResolvedResult}
 |{status:"CLARIFICATION"|"UNSUPPORTED";plan:Exclude<NaturalLanguagePlanResult,{status:"READY"}>}
 |{status:"DENIED"|"UNAVAILABLE"|"ERROR";message:string};
function mapFailure(error:unknown):NaturalLanguageAssistantResponse {
 const failure=error as {code?:string;message?:string};
 if(failure?.code==="42501"||failure?.code==="28000"||failure?.code==="PGRST301")
  return {status:"DENIED",message:"تحتاج هذه الإجابة إلى صلاحية إدارة المشتريات أو قراءة الفواتير المالية حسب نوع السؤال."};
 if(failure?.code==="PGRST202"||failure?.code==="42883"||/function .* does not exist|could not find the function/i.test(failure?.message??""))
  return {status:"UNAVAILABLE",message:"مصدر البيانات المعتمد لهذا السؤال غير متاح في قاعدة البيانات المتصلة."};
 return {status:"ERROR",message:"تعذر تنفيذ الاستعلام من مصدر التطبيق المصرح به."};
}
export async function runNaturalLanguageAssistantQuery(question:string):Promise<NaturalLanguageAssistantResponse> {
 const plan=planNaturalLanguageQuery(question);
 if(plan.status!=="READY")return {status:plan.status,plan};
 try {
  if(plan.sourceRpc==="fetch_purchase_supplier_invoice_workspace"){
   const workspace=await fetchSupplierInvoiceWorkspace({limit:100,offset:0});
   return {status:"RESULT",plan,result:resolveSupplierInvoiceIntent(
    plan.intent as SupplierInvoiceIntent,workspace.invoices,
    {invoiceCount:workspace.invoiceCount,hasMore:workspace.hasMore,asOfDate:workspace.asOfDate})};
  }
  const {data,error}=await supabase.rpc("fetch_purchase_orders");
  if(error)throw error;
  const result=resolvePurchaseOrderIntent(plan.intent as PurchaseOrderIntent,data);
  if(!result)return {status:"ERROR",message:"استجابة أوامر الشراء لا تطابق عقد المصدر؛ لم تُستخدم بيانات بديلة."};
  return {status:"RESULT",plan,result};
 }catch(error){return mapFailure(error);}
}
