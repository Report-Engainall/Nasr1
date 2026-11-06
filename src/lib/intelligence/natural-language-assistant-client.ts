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
import { buildDecisionMemoryBook } from "./decision-memory";
import { fetchOperationalShiftWorkspace } from "./shift-operations-client";
import { fetchSupplierQuotes } from "@/lib/supplier-quotes";
import { buildSupplierQuoteComparisonAssistant } from "./supplier-quote-comparison-assistant";
import { fetchTaskPerformanceScorecard } from "./task-performance-scorecard-client";
import { fetchCommercePolicyCatalog } from "./commerce-policy-governance-client";
import { buildDeadStockReport } from "./dead-stock";
import { buildReplenishmentRecommendations } from "./replenishment";
import { fetchBusinessHealthAssistantSummary } from "./business-health-assistant-client";
import { planNaturalLanguageQuery,resolvePurchaseOrderIntent,resolveSupplierInvoiceIntent,
 type NaturalLanguagePlanResult,type NaturalLanguageResolvedResult,type ShiftOperationsIntent,resolveShiftOperationsIntent,type SupplierInvoiceIntent,type PurchaseOrderIntent,type CustomerRetentionIntent,resolveCustomerRetentionIntent,type SupplierPerformanceIntent,resolveSupplierPerformanceIntent,type InventoryIntent,resolveInventoryIntent,type ProcessBottleneckIntent,resolveProcessBottlenecksIntent,type ProcessTaskIntent,resolveProcessTasksIntent,type TaskIntelligenceReportIntent,resolveTaskIntelligenceReport,type ExpectedCollectionsIntent,resolveExpectedCollectionsIntent,type TaskQualityIntent,type CustomerServiceIntent,resolveCustomerServiceIntent,type DecisionOutcomesIntent,resolveDecisionOutcomesIntent,type GrowthRadarIntent,type TaskPerformanceIntent,type CommercePolicyIntent,resolveDecisionMemoryIntent } from "./natural-language-assistant";
export type NaturalLanguageAssistantResponse=
 |{status:"RESULT";plan:Extract<NaturalLanguagePlanResult,{status:"READY"}>;result:NaturalLanguageResolvedResult}
 |{status:"CLARIFICATION"|"UNSUPPORTED";plan:Exclude<NaturalLanguagePlanResult,{status:"READY"}>}
 |{status:"DENIED"|"UNAVAILABLE"|"NOT_FOUND"|"ERROR";message:string};
function mapFailure(error:unknown):NaturalLanguageAssistantResponse {
 const failure=error as {code?:string;message?:string};
 if(failure?.code==="42501"||failure?.code==="28000"||failure?.code==="PGRST301")
  return {status:"DENIED",message:"لا تملك الصلاحية المطلوبة لقراءة مصدر البيانات المعتمد لهذا السؤال."};
 if(failure?.code==="PGRST202"||failure?.code==="42883"||/function .* does not exist|could not find the function/i.test(failure?.message??""))
  return {status:"UNAVAILABLE",message:"خدمة القراءة المعتمدة لهذا السؤال غير متاحة في قاعدة البيانات المتصلة؛ لم تُستخدم بيانات بديلة."};
 return {status:"ERROR",message:"تعذر تنفيذ الاستعلام من مصدر التطبيق المصرح به."};
}
export async function runNaturalLanguageAssistantQuery(question:string):Promise<NaturalLanguageAssistantResponse> {
 const plan=planNaturalLanguageQuery(question);
 if(plan.status!=="READY")return {status:plan.status,plan};
 try {
  if(plan.intent==="BUSINESS_HEALTH_OVERVIEW"){
   const health=await fetchBusinessHealthAssistantSummary();
   if(!health.ok)return {status:health.status,message:health.message};
   return {status:"RESULT",plan,result:{
    kind:"BUSINESS_HEALTH",state:health.data.state,intent:"BUSINESS_HEALTH_OVERVIEW",
    answer:health.data.answer,sourceRpc:"get_inventory_intelligence_aggregate",
    asOf:health.data.map.asOf,map:health.data.map,sources:health.data.sources,
   }};
  }
  if(plan.sourceRpc==="fetch_commerce_policy_catalog"){
   const result=await fetchCommercePolicyCatalog();
   if(!result.ok)return {status:result.status==="NOT_FOUND"?"ERROR":result.status,message:result.message};
   const catalog=result.data;
   if(!Number.isSafeInteger(catalog.totalCount)||catalog.totalCount<0||
      !Number.isSafeInteger(catalog.returnedCount)||catalog.returnedCount<0||
      catalog.returnedCount!==catalog.items.length||catalog.totalCount<catalog.returnedCount||
      typeof catalog.completePopulation!=="boolean"||
      (catalog.completePopulation&&catalog.totalCount!==catalog.returnedCount)||
      !Number.isFinite(Date.parse(catalog.asOf))){
    return {status:"ERROR",message:"استجابة سجل السياسات لا تتوازن مع تغطية المصدر؛ حُجبت المؤشرات."};
   }
   const lifecycleCounts:Record<"SCHEDULED"|"EFFECTIVE"|"EXPIRED"|"SUPERSEDED",number> = {
    SCHEDULED:0,EFFECTIVE:0,EXPIRED:0,SUPERSEDED:0,
   };
   for(const item of catalog.items)lifecycleCounts[item.lifecycle]+=1;
   const sourceChangedCount=catalog.items.filter(item=>item.sourceChanged).length;
   const state=!catalog.completePopulation?"PARTIAL":catalog.totalCount===0?"EMPTY":"READY";
   const answer=state==="PARTIAL"
    ?"أعاد سجل الحوكمة "+catalog.returnedCount+" سياسة من أصل "+catalog.totalCount+"؛ الملخص جزئي، وفي الصفحة الحالية "+sourceChangedCount+" سياسة تغيرت بصمة مصدرها."
    :state==="EMPTY"?"لا توجد سياسات في سجل الحوكمة الحالي."
    :plan.intent==="COMMERCE_POLICY_SOURCE_CHANGES"
     ?"توجد "+sourceChangedCount+" سياسة من أصل "+catalog.totalCount+" تغيرت بصمة مصادرها وتحتاج مراجعة توافق المصدر."
     :"يعرض سجل الحوكمة "+catalog.totalCount+" سياسة: "+lifecycleCounts.EFFECTIVE+" سارية، "+lifecycleCounts.SCHEDULED+" مجدولة، "+lifecycleCounts.EXPIRED+" منتهية، و"+lifecycleCounts.SUPERSEDED+" مستبدلة.";
   return {status:"RESULT",plan,result:{
    kind:"COMMERCE_POLICY",state,intent:plan.intent as CommercePolicyIntent,
    answer,sourceRpc:"fetch_commerce_policy_catalog",asOf:catalog.asOf,
    totalCount:catalog.totalCount,returnedCount:catalog.returnedCount,
    completePopulation:catalog.completePopulation,lifecycleCounts,sourceChangedCount,
   }};
  }
  if(plan.sourceRpc==="fetch_task_performance_scorecard"){
   const result=await fetchTaskPerformanceScorecard();
   if(!result.ok)return {status:result.status,message:result.message};
   const scorecard=result.scorecard;
   const answer=scorecard.status==="EMPTY"
    ?"لا توجد مهام ضمن الأدوار التي تسمح صلاحيتك برؤيتها في لقطة المصدر الحالية."
    :"بطاقة الأداء تعرض "+scorecard.scope.visibleTaskCount+" مهمة مرئية، موزعة على "+scorecard.scope.visibleRoles.length+" أدوار مصرح بها و"+scorecard.groups.length+" مجموعة نوع/دور. تعرض مؤشرات التغطية وزمن الإكمال وجودة المراجعات المتاحة فقط.";
   return {status:"RESULT",plan,result:{
    kind:"TASK_PERFORMANCE",state:scorecard.status,
    intent:plan.intent as TaskPerformanceIntent,answer,
    sourceRpc:"fetch_task_performance_scorecard",
    queriedAt:new Date().toISOString(),scorecard,
   }};
  }
  if(plan.sourceRpc==="fetch_purchase_supplier_quotes"){
   const quotes=await fetchSupplierQuotes();
   const result=buildSupplierQuoteComparisonAssistant(quotes,new Date().toISOString());
   return {status:"RESULT",plan,result};
  }
  if(plan.sourceRpc==="fetch_operational_shift_workspace"){
   if(!plan.businessDate)return {status:"ERROR",message:"تاريخ العمل مطلوب قبل قراءة مركز الوردية."};
   const workspace=await fetchOperationalShiftWorkspace({businessDate:plan.businessDate});
   if(!workspace.ok)return {status:workspace.status,message:workspace.message};
   return {status:"RESULT",plan,result:resolveShiftOperationsIntent(workspace.data.result)};
  }
  if(plan.sourceRpc==="fetch_decision_outcomes"){
   const outcomes=await fetchDecisionOutcomes(100,0);
   if(!outcomes.ok)return {status:outcomes.status,message:outcomes.message};
   const queriedAt=new Date().toISOString();
   if(plan.intent==="DECISION_MEMORY_OVERVIEW"){
    const memory=buildDecisionMemoryBook({
     generatedAt:queriedAt,outcomes:outcomes.items,snapshots:[],totalOutcomes:outcomes.total,
    });
    return {status:"RESULT",plan,result:resolveDecisionMemoryIntent(memory,queriedAt)};
   }
   return {status:"RESULT",plan,result:resolveDecisionOutcomesIntent(
    plan.intent as DecisionOutcomesIntent,outcomes.items,outcomes.total,queriedAt)};
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
   const periodDays=plan.periodDays??90;
   const retention=await fetchCustomerRetentionAggregate(periodDays,new Date().toISOString());
   if(!retention.ok)return {status:retention.status,message:retention.message};
   if(plan.intent==="GROWTH_RADAR_OVERVIEW"){
    const completePopulation=retention.data.status==="VERIFIED"&&retention.data.population.total!==null;
    const radar=retention.growthRadar;
    const answer=completePopulation
     ?"رادار النمو قيّم "+radar.evaluatedSignals+" إشارة من مجتمع العملاء المكتمل، وأظهر "+radar.opportunities.length+" فرصة اجتازت العتبات و"+radar.withheld.length+" إشارة محجوبة."
     :"تغطية مجتمع العملاء غير مكتملة؛ يعرض الرادار فقط الإشارات الفردية المثبتة من السجلات المستلمة ("+radar.opportunities.length+" فرصة و"+radar.withheld.length+" إشارة محجوبة)، ولا يمثل كامل فرص المؤسسة.";
    return {status:"RESULT",plan,result:{
     kind:"GROWTH_RADAR",state:completePopulation?"READY":"PARTIAL",
     intent:plan.intent as GrowthRadarIntent,answer,
     sourceRpc:"get_customer_retention_aggregate",asOf:radar.asOf,
     periodDays,completePopulation,radar,
    }};
   }
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
