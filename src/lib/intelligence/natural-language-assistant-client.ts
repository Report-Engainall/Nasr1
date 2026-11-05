import { supabase } from "@/lib/supabase";
import { fetchSupplierInvoiceWorkspace } from "@/lib/supplier-invoices";
import { fetchCustomerRetentionAggregate } from "./customer-retention-client";
import { fetchSupplierPerformance } from "./supplier-performance-client";
import { createInventoryIntelligencePeriod,fetchInventoryIntelligence } from "./inventory-intelligence-client";
import { fetchProcessBottlenecks } from "./process-bottlenecks-client";
import { createCashflowScheduleRequest,fetchCashflowSchedule } from "./cashflow-schedule-client";
import { buildDeadStockReport } from "./dead-stock";
import { buildReplenishmentRecommendations } from "./replenishment";
import { planNaturalLanguageQuery,resolvePurchaseOrderIntent,resolveSupplierInvoiceIntent,
 type NaturalLanguagePlanResult,type NaturalLanguageResolvedResult,type SupplierInvoiceIntent,type PurchaseOrderIntent,type CustomerRetentionIntent,resolveCustomerRetentionIntent,type SupplierPerformanceIntent,resolveSupplierPerformanceIntent,type InventoryIntent,resolveInventoryIntent,type ProcessBottleneckIntent,resolveProcessBottlenecksIntent,type ExpectedCollectionsIntent,resolveExpectedCollectionsIntent } from "./natural-language-assistant";
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
  if(plan.sourceRpc==="get_intelligence_aggregate"){
   const request=createCashflowScheduleRequest({horizonDays:plan.horizonDays??30});
   const schedule=await fetchCashflowSchedule(request);
   if(!schedule.ok)return {status:schedule.status,message:schedule.message};
   return {status:"RESULT",plan,result:resolveExpectedCollectionsIntent(schedule.data)};
  }
  if(plan.sourceRpc==="fetch_process_bottleneck_snapshot"){
   const to=new Date().toISOString().slice(0,10);
   const days=plan.periodDays??30;
   const fromDate=new Date(to+"T00:00:00.000Z");
   fromDate.setUTCDate(fromDate.getUTCDate()-(days-1));
   const from=fromDate.toISOString().slice(0,10);
   const baselineToDate=new Date(from+"T00:00:00.000Z");
   baselineToDate.setUTCDate(baselineToDate.getUTCDate()-1);
   const baselineTo=baselineToDate.toISOString().slice(0,10);
   const baselineFromDate=new Date(baselineTo+"T00:00:00.000Z");
   baselineFromDate.setUTCDate(baselineFromDate.getUTCDate()-(days-1));
   const process=await fetchProcessBottlenecks({
    from,to,baselineFrom:baselineFromDate.toISOString().slice(0,10),baselineTo,
   });
   if(!process.ok)return {status:process.status,message:process.message};
   return {status:"RESULT",plan,result:resolveProcessBottlenecksIntent(
    plan.intent as ProcessBottleneckIntent,process.result)};
  }
  if(plan.sourceRpc==="get_inventory_intelligence_aggregate"){
   const request=createInventoryIntelligencePeriod(new Date(),92);
   const inventory=await fetchInventoryIntelligence(request.period,request.asOf);
   if(!inventory.ok){
    return {status:inventory.status==="DENIED"?"DENIED":inventory.status==="ERROR"?"ERROR":"UNAVAILABLE",
     message:inventory.message};
   }
   const deadStock=buildDeadStockReport({
    id:"natural-language-dead-stock:"+inventory.data.asOf,
    asOf:inventory.data.asOf,period:inventory.data.period,
    evidenceRecords:inventory.data.evidenceRecords,products:inventory.data.deadStockProducts,
    rule:{id:"dead-stock-days",version:"1.0.0",activeWithinDays:30,stagnantAfterDays:90,
     lowTurnoverRatio:0.1,turnoverWindowDays:92},
   });
   const replenishment=buildReplenishmentRecommendations({
    id:"natural-language-replenishment:"+inventory.data.asOf,
    asOf:inventory.data.asOf,period:inventory.data.period,
    evidenceRecords:inventory.data.evidenceRecords,products:inventory.data.replenishmentProducts,
   });
   return {status:"RESULT",plan,result:resolveInventoryIntent(
    plan.intent as InventoryIntent,{
     asOf:inventory.data.asOf,period:inventory.data.period,totalProducts:inventory.data.totalProducts,
     completePopulation:inventory.data.totalProducts===inventory.data.returnedProducts,
     deadStock,replenishment:replenishment.recommendations,
    })};
  }
  if(plan.sourceRpc==="fetch_supplier_performance_snapshot"){
   const to=new Date().toISOString().slice(0,10);
   const fromDate=new Date(to+"T00:00:00.000Z");
   fromDate.setUTCDate(fromDate.getUTCDate()-((plan.periodDays??90)-1));
   const supplier=await fetchSupplierPerformance({from:fromDate.toISOString().slice(0,10),to,limit:200});
   if(!supplier.ok)return {status:supplier.status,message:supplier.message};
   return {status:"RESULT",plan,result:resolveSupplierPerformanceIntent(
    plan.intent as SupplierPerformanceIntent,supplier.result)};
  }
  if(plan.sourceRpc==="get_customer_retention_aggregate"){
   const retention=await fetchCustomerRetentionAggregate(plan.periodDays??90,new Date().toISOString());
   if(!retention.ok)return {status:retention.status,message:retention.message};
   return {status:"RESULT",plan,result:resolveCustomerRetentionIntent(
    plan.intent as CustomerRetentionIntent,retention.data)};
  }
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
