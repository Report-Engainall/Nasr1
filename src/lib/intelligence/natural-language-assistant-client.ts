import { supabase } from "@/lib/supabase";
import { fetchSupplierInvoiceWorkspace } from "@/lib/supplier-invoices";
import { fetchCustomerRetentionAggregate } from "./customer-retention-client";
import { fetchSupplierPerformance } from "./supplier-performance-client";
import { createInventoryIntelligencePeriod,fetchInventoryIntelligence } from "./inventory-intelligence-client";
import { fetchProcessBottlenecks } from "./process-bottlenecks-client";
import { fetchTaskIntelligenceReport } from "./task-intelligence-reports-client";
import { createCashflowScheduleRequest,fetchCashflowSchedule } from "./cashflow-schedule-client";
import { fetchOperationalTaskQualityMetrics } from "./task-quality-reviews-client";
import { fetchCustomerServiceIntelligenceSummary } from "./customer-service-intelligence-client";
import { fetchDecisionOutcomes } from "./decision-outcome-client";
import { buildDeadStockReport } from "./dead-stock";
import { buildReplenishmentRecommendations } from "./replenishment";
import { planNaturalLanguageQuery,resolvePurchaseOrderIntent,resolveSupplierInvoiceIntent,
 type NaturalLanguagePlanResult,type NaturalLanguageResolvedResult,type SupplierInvoiceIntent,type PurchaseOrderIntent,type CustomerRetentionIntent,resolveCustomerRetentionIntent,type SupplierPerformanceIntent,resolveSupplierPerformanceIntent,type InventoryIntent,resolveInventoryIntent,type ProcessBottleneckIntent,resolveProcessBottlenecksIntent,type ProcessTaskIntent,resolveProcessTasksIntent,type TaskIntelligenceReportIntent,resolveTaskIntelligenceReport,type ExpectedCollectionsIntent,resolveExpectedCollectionsIntent,type TaskQualityIntent,type CustomerServiceIntent,resolveCustomerServiceIntent,type DecisionOutcomesIntent,resolveDecisionOutcomesIntent } from "./natural-language-assistant";
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
  if(plan.sourceRpc==="fetch_decision_outcomes"){
   const outcomes=await fetchDecisionOutcomes(100,0);
   if(!outcomes.ok)return {status:outcomes.status,message:outcomes.message};
   return {status:"RESULT",plan,result:resolveDecisionOutcomesIntent(
    plan.intent as DecisionOutcomesIntent,outcomes.items,outcomes.total,new Date().toISOString())};
  }
  if(plan.sourceRpc==="get_customer_service_work_queue_summary"){
   const snapshot=await fetchCustomerServiceIntelligenceSummary();
   if(!snapshot.ok)return {status:snapshot.status,message:snapshot.message};
   return {status:"RESULT",plan,result:resolveCustomerServiceIntent(
    plan.intent as CustomerServiceIntent,snapshot.data,new Date().toISOString())};
  }
  if(plan.sourceRpc==="fetch_operational_task_quality_metrics"){
   const quality=await fetchOperationalTaskQualityMetrics();
   const answer=quality.status==="READY"
    ?"هذه مؤشرات مراجعات الجودة المحفوظة. تقيس أحكام المراجعين ولا تثبت وحدها نجاح الإجراء أو أثره."
    :quality.status==="EMPTY"
     ?"لا توجد مراجعات جودة محفوظة في نطاق الصلاحية الحالي؛ لا يعني ذلك أن المهام أو التنبيهات صحيحة تلقائياً."
     :quality.status==="RESTRICTED"
      ?"تفاصيل جودة المهام والتوصيات محجوبة لهذا الحساب؛ يلزم دور مدير أو مسؤول."
      :"مؤشرات الجودة غير متاحة من المصدر المعتمد حالياً؛ لم تُستبدل بأرقام صفرية.";
   return {status:"RESULT",plan,result:{
    kind:"TASK_QUALITY",state:quality.status,intent:plan.intent as TaskQualityIntent,
    answer,sourceRpc:"fetch_operational_task_quality_metrics",
    queriedAt:new Date().toISOString(),quality,
   }};
  }
  if(plan.sourceRpc==="fetch_task_intelligence_report"){
   if(!plan.taskReportKind)return {status:"ERROR",message:"نوع تقرير المهام غير محدد؛ لم يُنفذ طلب غير مكتمل."};
   const report=await fetchTaskIntelligenceReport(plan.taskReportKind);
   if(!report.ok)return {status:report.status,message:report.message};
   return {status:"RESULT",plan,result:resolveTaskIntelligenceReport(
    plan.intent as TaskIntelligenceReportIntent,report.report)};
  }
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
   if(plan.intent==="OPEN_TASKS_OVERVIEW"||plan.intent==="REOPENED_TASKS_OVERVIEW"){
    return {status:"RESULT",plan,result:resolveProcessTasksIntent(
     plan.intent as ProcessTaskIntent,process.result)};
   }
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
