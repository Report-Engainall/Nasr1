import { fetchSupplierInvoiceWorkspace } from "@/lib/supplier-invoices";
import { planNaturalLanguageQuery,resolveSupplierInvoiceIntent,type NaturalLanguagePlanResult,type NaturalLanguageQueryResult } from "./natural-language-assistant";
export type NaturalLanguageAssistantResponse =
 | {status:"RESULT";plan:Extract<NaturalLanguagePlanResult,{status:"READY"}>;result:NaturalLanguageQueryResult}
 | {status:"CLARIFICATION"|"UNSUPPORTED";plan:Exclude<NaturalLanguagePlanResult,{status:"READY"}>}
 | {status:"DENIED"|"UNAVAILABLE"|"ERROR";message:string};
function mapFailure(error:unknown):NaturalLanguageAssistantResponse {
 const failure=error as {code?:string;message?:string};
 if(failure?.code==="42501"||failure?.code==="28000"||failure?.code==="PGRST301")
  return {status:"DENIED",message:"تحتاج هذه الإجابة إلى صلاحية قراءة فواتير الموردين المالية."};
 if(failure?.code==="PGRST202"||failure?.code==="42883"||/function .* does not exist|could not find the function/i.test(failure?.message??""))
  return {status:"UNAVAILABLE",message:"مصدر فواتير الموردين غير متاح في قاعدة البيانات المتصلة."};
 return {status:"ERROR",message:"تعذر تنفيذ الاستعلام من مصدر فواتير الموردين."};
}
export async function runNaturalLanguageAssistantQuery(question:string):Promise<NaturalLanguageAssistantResponse> {
 const plan=planNaturalLanguageQuery(question);
 if(plan.status!=="READY") return {status:plan.status,plan};
 try {
  const workspace=await fetchSupplierInvoiceWorkspace({limit:100,offset:0});
  const result=resolveSupplierInvoiceIntent(plan.intent,workspace.invoices,{
   invoiceCount:workspace.invoiceCount,hasMore:workspace.hasMore,asOfDate:workspace.asOfDate,
  });
  return {status:"RESULT",plan,result};
 } catch(error) { return mapFailure(error); }
}
