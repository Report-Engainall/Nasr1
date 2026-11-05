import type { SupplierInvoiceMatchStatus, SupplierInvoiceRecord } from "@/lib/supplier-invoices";
import type { CustomerRetentionReport } from "./customer-retention";
import type { SupplierPerformanceResult } from "./supplier-performance";
export type SupplierInvoiceIntent="SUPPLIER_INVOICES_UNMATCHED"|"SUPPLIER_INVOICES_PRICE_REVIEW"|"SUPPLIER_INVOICES_MATCHED";
export type PurchaseOrderIntent="PURCHASE_ORDERS_OPEN"|"PURCHASE_ORDERS_AWAITING_RECEIPT"|"PURCHASE_ORDERS_PARTIAL_RECEIPT";
export type CustomerRetentionIntent="CUSTOMER_RETENTION_OVERVIEW"|"CUSTOMER_REPEAT_PURCHASE"|"CUSTOMER_DORMANCY_RISK";
export type SupplierPerformanceIntent="SUPPLIER_PERFORMANCE_OVERVIEW"|"SUPPLIER_DELIVERY_ADHERENCE";
export type NaturalLanguageIntent=SupplierInvoiceIntent|PurchaseOrderIntent|CustomerRetentionIntent|SupplierPerformanceIntent;
export type NaturalLanguageSourceRpc="fetch_purchase_supplier_invoice_workspace"|"fetch_purchase_orders"|"get_customer_retention_aggregate"|"fetch_supplier_performance_snapshot";
export type NaturalLanguagePlanResult=
 |{status:"READY";intent:NaturalLanguageIntent;normalizedQuestion:string;sourceRpc:NaturalLanguageSourceRpc;filterDescription:string;periodDays?:30|60|90|180|365}
 |{status:"CLARIFICATION"|"UNSUPPORTED";normalizedQuestion:string;explanation:string;clarification?:string};
function normalizeArabic(value:string):string {
 return value.normalize("NFKC").replace(/[\u064B-\u065F\u0670\u0640]/g,"")
  .replace(/[أإآ]/g,"ا").replace(/ى/g,"ي").replace(/ة/g,"ه").toLowerCase()
  .replace(/[؟?!.,،؛:()[\]{}]/g," ").replace(/\s+/g," ").trim();
}
export function planNaturalLanguageQuery(question:string):NaturalLanguagePlanResult {
 const normalizedQuestion=normalizeArabic(question);
 if(!normalizedQuestion||normalizedQuestion.length>400)return {
  status:"CLARIFICATION",normalizedQuestion,explanation:"اكتب سؤالاً واضحاً لا يتجاوز 400 حرف.",
  clarification:"ما السجلات التي تريد الاستعلام عنها؟"
 };
 const supplierPerformanceQuestion=/(اداء المورد|مؤشرات المورد|زمن التوريد|مهله التوريد|التزام المورد|الالتزام بمواعيد التوريد)/.test(normalizedQuestion);
 if(supplierPerformanceQuestion){
  const dayMatch=normalizedQuestion.match(/(?:اخر\s*)?(30|60|90|180|365)\s*(?:يوما?|ايام)/);
  const monthPeriod=/اخر شهر/.test(normalizedQuestion)?30:
   /اخر 3 اشهر/.test(normalizedQuestion)?90:/اخر 6 اشهر/.test(normalizedQuestion)?180:
   /اخر سنه/.test(normalizedQuestion)?365:null;
  const periodDays=(dayMatch?Number(dayMatch[1]):monthPeriod??90) as 30|60|90|180|365;
  const hasTimeConstraint=/(اليوم|امس|غدا|هذا الشهر|الشهر الحالي|الشهر الماضي|خلال|اخر|الاسبوع|سنه|عام|شهر|اشهر|من تاريخ|بين تاريخ|الفتره|الربع)/.test(normalizedQuestion)||/20\d{2}-\d{2}-\d{2}/.test(normalizedQuestion);
  const hasSupportedPeriod=Boolean(dayMatch||monthPeriod!==null);
  if(hasTimeConstraint&&!hasSupportedPeriod)return {
   status:"UNSUPPORTED",normalizedQuestion,
   explanation:"تحليل الموردين يدعم نوافذ محددة فقط حتى 365 يوماً في هذا المساعد؛ لا يطبق نطاقات تقويمية أو تواريخ حرة."
  };
  const intent:SupplierPerformanceIntent=/(التزام|الالتزام بمواعيد التوريد|موعد)/.test(normalizedQuestion)
   ?"SUPPLIER_DELIVERY_ADHERENCE":"SUPPLIER_PERFORMANCE_OVERVIEW";
  return {status:"READY",intent,normalizedQuestion,sourceRpc:"fetch_supplier_performance_snapshot",periodDays,
   filterDescription:"مؤشرات المشتريات الفعلية للموردين في نافذة UTC بطول "+periodDays+" يوماً؛ لا تشمل أسعاراً أو أرصدة أو درجات جودة غير مثبتة."};
 }
 const retentionQuestion=/(احتفاظ|استبقاء|تكرار الشراء|شراء متكرر|متكرر|نشاط العملاء|نشطون|الخمول|خاملون|معرضون للخمول|معرضين للخمول|معرض للخمول|فتور)/.test(normalizedQuestion);
 if(retentionQuestion){
  const dayMatch=normalizedQuestion.match(/(?:اخر\s*)?(30|60|90|180|365)\s*(?:يوما?|ايام)/);
  const monthPeriod=/اخر شهر/.test(normalizedQuestion)?30:
   /اخر 3 اشهر/.test(normalizedQuestion)?90:/اخر 6 اشهر/.test(normalizedQuestion)?180:
   /اخر سنه/.test(normalizedQuestion)?365:null;
  const periodDays=(dayMatch?Number(dayMatch[1]):monthPeriod??90) as 30|60|90|180|365;
  const hasTimeConstraint=/(اليوم|امس|غدا|هذا الشهر|الشهر الحالي|الشهر الماضي|خلال|اخر|الاسبوع|سنه|عام|شهر|اشهر|من تاريخ|بين تاريخ|الفتره|الربع)/.test(normalizedQuestion)||/20\d{2}-\d{2}-\d{2}/.test(normalizedQuestion);
  const hasSupportedPeriod=Boolean(dayMatch||monthPeriod!==null);
  if(hasTimeConstraint&&!hasSupportedPeriod)return {
   status:"UNSUPPORTED",normalizedQuestion,
   explanation:"مصدر الاحتفاظ يدعم نوافذ محددة فقط (30 أو 60 أو 90 أو 180 أو 365 يوماً)، ولا يطبق تواريخ حرة أو فترات تقويمية غير مطابقة."
  };
  const intent:CustomerRetentionIntent=/(الخمول|خاملون|معرضون للخمول|معرضين للخمول|معرض للخمول|فتور)/.test(normalizedQuestion)
   ?"CUSTOMER_DORMANCY_RISK":/(تكرار الشراء|شراء متكرر|متكرر)/.test(normalizedQuestion)
   ?"CUSTOMER_REPEAT_PURCHASE":"CUSTOMER_RETENTION_OVERVIEW";
  return {status:"READY",intent,normalizedQuestion,sourceRpc:"get_customer_retention_aggregate",periodDays,
   filterDescription:"مجتمع العملاء الكامل من أوامر المؤسسة النشطة غير الملغاة؛ مقارنة نافذتين متتاليتين متساويتين بطول "+periodDays+" يوماً؛ قراءة مجمعة فقط."};
 }
 const purchaseQuestion=/(امر|اوامر|شراء|مشتريات|توريد)/.test(normalizedQuestion);
 const invoiceQuestion=normalizedQuestion.includes("فاتور");
 const supplierQuestion=normalizedQuestion.includes("مورد");
 if(purchaseQuestion&&/(متاخر|تاخر|متاخره)/.test(normalizedQuestion))return {
  status:"UNSUPPORTED",normalizedQuestion,
  explanation:"مصدر أوامر الشراء الحالي لا يقدم تاريخ استحقاق موحداً معتمداً. لا أستنتج التأخير من عمر الأمر أو تاريخ إنشائه."
 };
 if(/اليوم|امس|غدا|هذا الشهر|الشهر الحالي|خلال/.test(normalizedQuestion))return {
  status:"UNSUPPORTED",normalizedQuestion,
  explanation:"هذا المسار لا يطبق مرشحاً زمنياً حراً بعد. لا أستطيع إرجاع أحدث السجلات ثم وصفها بأنها نتائج الفترة المطلوبة."
 };
 if(invoiceQuestion&&!supplierQuestion)return {
  status:"CLARIFICATION",normalizedQuestion,
  explanation:"مصدر الفواتير المعتمد في هذا المسار خاص بفواتير الموردين، ولا يجوز خلطها بفواتير العملاء.",
  clarification:"هل تقصد فواتير الموردين المرتبطة بأوامر الشراء والاستلام؟"
 };
 if(invoiceQuestion&&supplierQuestion){
  const mismatch=/(غير مطابق|غير مطابقه|لم تطابق|لم يطابق|لا تطابق|لا يطابق|عدم المطابق|فرق سعر|فروق السعر|اختلاف السعر|غير متطابق)/.test(normalizedQuestion);
  const review=/(بانتظار|تنتظر|قيد المراجعه|بحاجه الي مراجعه|تحتاج مراجعه)/.test(normalizedQuestion);
  const matched=/(الفواتير المطابقه|فاتوره مطابقه|مطابقه مع الاستلام|مطابقه ثلاثيه)/.test(normalizedQuestion);
  if(review&&mismatch)return {status:"READY",intent:"SUPPLIER_INVOICES_PRICE_REVIEW",normalizedQuestion,
   sourceRpc:"fetch_purchase_supplier_invoice_workspace",filterDescription:"match_status = variance_pending؛ فروق سعر الوحدة بانتظار مراجعة مستقلة."};
  if(mismatch)return {status:"READY",intent:"SUPPLIER_INVOICES_UNMATCHED",normalizedQuestion,
   sourceRpc:"fetch_purchase_supplier_invoice_workspace",filterDescription:"match_status != matched؛ فروق سعر الوحدة بين الفاتورة وأمر الشراء والاستلام، بما فيها الفروق المعلقة والمعتمدة والمرفوضة."};
  if(matched&&!/(غير|لم|لا|عدم)/.test(normalizedQuestion))return {status:"READY",intent:"SUPPLIER_INVOICES_MATCHED",normalizedQuestion,
   sourceRpc:"fetch_purchase_supplier_invoice_workspace",filterDescription:"match_status = matched؛ المطابقة السعرية الثلاثية المسجلة."};
  return {status:"CLARIFICATION",normalizedQuestion,explanation:"حددت فواتير الموردين، لكن شرط المطابقة غير واضح.",
   clarification:"هل تريد الفواتير ذات فروق السعر، أم التي تنتظر مراجعة فرق السعر، أم المطابقة؟"};
 }
 if(purchaseQuestion){
  const partial=/(جزئي|جزئيا|جزئيه|مستلمه جزئ)/.test(normalizedQuestion);
  const awaiting=/(بانتظار الاستلام|تنتظر الاستلام|لم تستلم|غير مستلمه|قيد الاستلام)/.test(normalizedQuestion);
  const open=/(مفتوح|مفتوحه|معلقه|قائمه|غير مكتمله)/.test(normalizedQuestion);
  if(partial)return {status:"READY",intent:"PURCHASE_ORDERS_PARTIAL_RECEIPT",normalizedQuestion,
   sourceRpc:"fetch_purchase_orders",filterDescription:"status = partially_received؛ أوامر استلمت بعض سطورها وما زال بعضها معلقاً."};
  if(awaiting)return {status:"READY",intent:"PURCHASE_ORDERS_AWAITING_RECEIPT",normalizedQuestion,
   sourceRpc:"fetch_purchase_orders",filterDescription:"status = submitted؛ أوامر مرسلة تنتظر الاستلام."};
  if(open)return {status:"READY",intent:"PURCHASE_ORDERS_OPEN",normalizedQuestion,
   sourceRpc:"fetch_purchase_orders",filterDescription:"status IN (submitted, partially_received)؛ الأوامر غير المكتملة فقط."};
  return {status:"CLARIFICATION",normalizedQuestion,explanation:"حددت أوامر الشراء، لكن حالة الأمر المطلوبة غير واضحة.",
   clarification:"هل تريد الأوامر المفتوحة، أم بانتظار الاستلام، أم المستلمة جزئياً؟"};
 }
 return {status:"UNSUPPORTED",normalizedQuestion,
  explanation:"لم يتعرف المساعد على نية قراءة معتمدة. لا ينشئ SQL ولا ينفذ أوامر أو تغييرات من اللغة الطبيعية."};
}
export interface NaturalLanguageInvoiceMatch {
 invoiceId:string;invoiceNumber:string;supplierName:string;purchaseOrderNumber:string;
 invoiceDate:string;createdAt:string;currency:string;matchStatus:SupplierInvoiceMatchStatus;
 reviewReason:string|null;lineCount:number;mismatchedLineCount:number;
}
export interface NaturalLanguageInvoiceResult {
 kind:"SUPPLIER_INVOICE";state:"READY"|"PARTIAL"|"EMPTY";intent:SupplierInvoiceIntent;
 answer:string;sourceRpc:"fetch_purchase_supplier_invoice_workspace";asOfDate:string;
 totalInvoiceCount:number;inspectedInvoiceCount:number;matchedQueryCount:number;completePopulation:boolean;
 countsByStatus:Record<SupplierInvoiceMatchStatus,number>;invoices:NaturalLanguageInvoiceMatch[];notice:string|null;
}
export interface NaturalLanguagePurchaseOrder {
 id:string;number:string;supplierName:string;warehouseName:string;status:"submitted"|"partially_received";
 submittedAt:string|null;updatedAt:string;itemCount:number;pendingLineCount:number;
}
export interface NaturalLanguagePurchaseOrderResult {
 kind:"PURCHASE_ORDER";state:"READY"|"PARTIAL"|"EMPTY";intent:PurchaseOrderIntent;
 answer:string;sourceRpc:"fetch_purchase_orders";inspectedOrderCount:number;matchedQueryCount:number;
 completePopulation:boolean;countsByStatus:{submitted:number;partially_received:number};
 orders:NaturalLanguagePurchaseOrder[];notice:string|null;
}
export interface NaturalLanguageCustomerRetentionResult {
 kind:"CUSTOMER_RETENTION";state:"READY"|"PARTIAL";intent:CustomerRetentionIntent;
 answer:string;sourceRpc:"get_customer_retention_aggregate";asOf:string;
 period:{from:string;to:string};previousPeriod:{from:string;to:string};completePopulation:boolean;
 population:{total:number|null;activeCurrentPeriod:number|null;retainedCustomers:number|null;repeatPurchaseCustomers:number|null};
 rates:{retentionRate:number|null;repeatPurchaseRate:number|null;averageOrdersPerActiveCustomer:number|null};
 activity:{active30Days:number|null;cooling31To60Days:number|null;atRisk61To90Days:number|null;inactiveOver90Days:number|null;noOrderDate:number|null};
 warnings:string[];
}
export interface NaturalLanguageSupplierPerformanceResult {
 kind:"SUPPLIER_PERFORMANCE";state:"READY"|"PARTIAL"|"EMPTY";intent:SupplierPerformanceIntent;
 answer:string;sourceRpc:"fetch_supplier_performance_snapshot";asOf:string;period:{from:string;to:string};
 totalSupplierCount:number;returnedSupplierCount:number;completePopulation:boolean;
 aggregate:{purchaseOrderCount:number|null;completedOrderCount:number|null;openOrderCount:number|null;
  inconsistentReceivedCount:number|null;backlogLineCount:number|null;leadTimeSampleCount:number|null;
  suppliersWithReliableLeadTime:number|null;promisedDeliverySampleCount:number|null;onTimeCount:number|null;onTimePercent:number|null};
 withheldReasons:string[];
}
export type NaturalLanguageResolvedResult=NaturalLanguageInvoiceResult|NaturalLanguagePurchaseOrderResult|NaturalLanguageCustomerRetentionResult|NaturalLanguageSupplierPerformanceResult;
export function resolveSupplierInvoiceIntent(
 intent:SupplierInvoiceIntent,records:SupplierInvoiceRecord[],metadata:{invoiceCount:number;hasMore:boolean;asOfDate:string},
):NaturalLanguageInvoiceResult {
 const counts:Record<SupplierInvoiceMatchStatus,number>={matched:0,variance_pending:0,variance_approved:0,variance_rejected:0};
 for(const invoice of records)counts[invoice.matchStatus]+=1;
 const invoices=records.filter(invoice=>{
  if(intent==="SUPPLIER_INVOICES_UNMATCHED")return invoice.matchStatus!=="matched";
  if(intent==="SUPPLIER_INVOICES_PRICE_REVIEW")return invoice.matchStatus==="variance_pending";
  return invoice.matchStatus==="matched";
 }).map(invoice=>({invoiceId:invoice.id,invoiceNumber:invoice.invoiceNumber,supplierName:invoice.supplierName,
  purchaseOrderNumber:invoice.purchaseOrderNumber,invoiceDate:invoice.invoiceDate,createdAt:invoice.createdAt,
  currency:invoice.currency,matchStatus:invoice.matchStatus,reviewReason:invoice.reviewReason,
  lineCount:invoice.lines.length,mismatchedLineCount:invoice.lines.filter(line=>!line.priceMatch).length}));
 const completePopulation=!metadata.hasMore&&records.length===metadata.invoiceCount;
 const state=invoices.length===0?(completePopulation?"EMPTY":"PARTIAL"):(completePopulation?"READY":"PARTIAL");
 const labels:Record<SupplierInvoiceIntent,string>={SUPPLIER_INVOICES_UNMATCHED:"ذات فروق سعر",
  SUPPLIER_INVOICES_PRICE_REVIEW:"التي تنتظر مراجعة فرق السعر",SUPPLIER_INVOICES_MATCHED:"المطابقة"};
 const answer=state==="EMPTY"?"لم توجد فواتير موردين بهذه الحالة ضمن كامل السجلات التي أعادها المصدر. المقصود هنا حالة فرق سعر الوحدة في المطابقة الثلاثية."
  :state==="PARTIAL"?"عُثر على "+invoices.length+" فاتورة "+labels[intent]+" ضمن أحدث "+records.length+
   " فاتورة مفحوصة؛ إجمالي السجلات "+metadata.invoiceCount+". النتيجة جزئية ولا تثبت عدم وجود نتائج أقدم."
  :"عُثر على "+invoices.length+" فاتورة "+labels[intent]+" من أصل "+metadata.invoiceCount+
   " فاتورة في المصدر. المقصود فروق سعر الوحدة بين الفاتورة وتكلفة أمر الشراء والاستلام.";
 return {kind:"SUPPLIER_INVOICE",state,intent,answer,sourceRpc:"fetch_purchase_supplier_invoice_workspace",
  asOfDate:metadata.asOfDate,totalInvoiceCount:metadata.invoiceCount,inspectedInvoiceCount:records.length,
  matchedQueryCount:invoices.length,completePopulation,countsByStatus:counts,invoices,
  notice:completePopulation?null:"المصدر يعيد أحدث 100 فاتورة فقط في هذا المسار؛ لم تُقرأ الصفحات التالية، لذلك بقيت النتيجة جزئية."};
}
type Raw=Record<string,unknown>;
function asObject(value:unknown):Raw|null{return value!==null&&typeof value==="object"&&!Array.isArray(value)?value as Raw:null;}
function nonEmpty(value:unknown):value is string{return typeof value==="string"&&value.trim().length>0;}
function validDateOrNull(value:unknown):value is string|null{return value===null||(typeof value==="string"&&Number.isFinite(Date.parse(value)));}
type PurchaseOrderSourceStatus="draft"|"submitted"|"partially_received"|"received"|"cancelled";
interface ParsedPurchaseOrderSource {
 id:string;number:string;supplierName:string;warehouseName:string;status:PurchaseOrderSourceStatus;
 submittedAt:string|null;updatedAt:string;itemCount:number;pendingLineCount:number;
}
function parsePurchaseOrderSource(value:unknown):ParsedPurchaseOrderSource|null {
 const row=asObject(value);if(!row)return null;
 if(!nonEmpty(row.id)||!nonEmpty(row.purchase_order_number)||!nonEmpty(row.supplier_name)||
  !nonEmpty(row.warehouse_name)||!["draft","submitted","partially_received","received","cancelled"].includes(String(row.status))||
  !validDateOrNull(row.submitted_at)||!nonEmpty(row.updated_at)||!Number.isFinite(Date.parse(row.updated_at))||
  !Array.isArray(row.items))return null;
 let pendingLineCount=0;
 for(const rawItem of row.items){
  const item=asObject(rawItem);if(!item)return null;
  const ordered=typeof item.quantity_ordered==="number"?item.quantity_ordered:Number(item.quantity_ordered);
  const received=typeof item.quantity_received==="number"?item.quantity_received:Number(item.quantity_received);
  const remaining=typeof item.remaining_quantity==="number"?item.remaining_quantity:Number(item.remaining_quantity);
  if(!Number.isFinite(ordered)||!Number.isFinite(received)||!Number.isFinite(remaining)||ordered<0||received<0||
   remaining<0||received>ordered||Math.abs(ordered-received-remaining)>0.0005)return null;
  if(remaining>0)pendingLineCount+=1;
 }
 return {id:row.id,number:row.purchase_order_number,supplierName:row.supplier_name,warehouseName:row.warehouse_name,
  status:row.status as PurchaseOrderSourceStatus,submittedAt:row.submitted_at as string|null,
  updatedAt:row.updated_at,itemCount:row.items.length,pendingLineCount};
}
export function resolvePurchaseOrderIntent(intent:PurchaseOrderIntent,rawOrders:unknown):NaturalLanguagePurchaseOrderResult|null {
 if(!Array.isArray(rawOrders)||rawOrders.length>500)return null;
 const parsed=rawOrders.map(parsePurchaseOrderSource);if(parsed.some(x=>x===null))return null;
 const all=parsed as ParsedPurchaseOrderSource[];
 const orders=all.filter(order=>order.status==="submitted"||order.status==="partially_received")
  .map(order=>({...order,status:order.status as "submitted"|"partially_received"}));
 const counts={submitted:orders.filter(x=>x.status==="submitted").length,
  partially_received:orders.filter(x=>x.status==="partially_received").length};
 const matching=orders.filter(order=>{
  if(intent==="PURCHASE_ORDERS_AWAITING_RECEIPT")return order.status==="submitted";
  if(intent==="PURCHASE_ORDERS_PARTIAL_RECEIPT")return order.status==="partially_received";
  return order.status==="submitted"||order.status==="partially_received";
 });
 const completePopulation=rawOrders.length<500;
 const state=matching.length===0?(completePopulation?"EMPTY":"PARTIAL"):(completePopulation?"READY":"PARTIAL");
 const labels:Record<PurchaseOrderIntent,string>={PURCHASE_ORDERS_OPEN:"المفتوحة",
  PURCHASE_ORDERS_AWAITING_RECEIPT:"التي تنتظر الاستلام",PURCHASE_ORDERS_PARTIAL_RECEIPT:"المستلمة جزئياً"};
 const answer=state==="EMPTY"?"لا توجد أوامر شراء بهذه الحالة ضمن السجلات التي أعادها المصدر."
  :state==="PARTIAL"?"عُثر على "+matching.length+" من أوامر الشراء "+labels[intent]+
   " ضمن أحدث "+orders.length+" أمراً. المصدر محدود بـ500 أمر؛ النتيجة جزئية."
  :"عُثر على "+matching.length+" من أوامر الشراء "+labels[intent]+" ضمن كامل السجلات المتاحة.";
 return {kind:"PURCHASE_ORDER",state,intent,answer,sourceRpc:"fetch_purchase_orders",
  inspectedOrderCount:orders.length,matchedQueryCount:matching.length,completePopulation,
  countsByStatus:counts,orders:matching,notice:completePopulation?null:
  "أعاد المصدر سقفه الأقصى (500 أمر)؛ لا يمكن إثبات اكتمال المجموعة أو استبعاد أوامر أقدم."};
}


/** Projects only aggregate customer-retention metrics; customer refs and activity rows never reach the assistant UI. */
export function resolveCustomerRetentionIntent(
 intent:CustomerRetentionIntent,report:CustomerRetentionReport,
):NaturalLanguageCustomerRetentionResult {
 const completePopulation=report.status==="VERIFIED";
 const state=completePopulation?"READY":"PARTIAL";
 const numberLabel=(value:number|null)=>value===null?"غير متاح":new Intl.NumberFormat("ar-YE",{maximumFractionDigits:0}).format(value);
 const rateLabel=(value:number|null)=>value===null?"غير متاح":new Intl.NumberFormat("ar-YE",{maximumFractionDigits:1}).format(value)+"%";
 const periodLabel=report.period.from+" إلى "+report.period.to;
 const previousLabel=report.previousPeriod.from+" إلى "+report.previousPeriod.to;
 let answer:string;
 if(!completePopulation){
  answer="تعذر اعتماد مجتمع العملاء كاملاً لهذه اللقطة؛ لم تُعرض أعداد أو نسب تقديرية. راجع حالة التغطية والتحذيرات قبل اتخاذ قرار.";
 }else if(intent==="CUSTOMER_DORMANCY_RISK"){
  answer="حالة نشاط العملاء في الفترة "+periodLabel+": فتور 31–60 يوماً "+numberLabel(report.activity.cooling31To60Days)+"، معرضون للخمول 61–90 يوماً "+numberLabel(report.activity.atRisk61To90Days)+"، وخاملون لأكثر من 90 يوماً "+numberLabel(report.activity.inactiveOver90Days)+".";
 }else if(intent==="CUSTOMER_REPEAT_PURCHASE"){
  answer="في الفترة "+periodLabel+" بلغ عدد العملاء المتكررين "+numberLabel(report.population.repeatPurchaseCustomers)+"، ومعدل تكرار الشراء "+rateLabel(report.repeatPurchaseRate)+"، ومتوسط الطلبات لكل عميل نشط "+(report.averageOrdersPerActiveCustomer===null?"غير متاح":new Intl.NumberFormat("ar-YE",{maximumFractionDigits:2}).format(report.averageOrdersPerActiveCustomer))+".";
 }else{
  answer="في الفترة "+periodLabel+" بلغ مجتمع العملاء "+numberLabel(report.population.total)+"، والنشطون "+numberLabel(report.population.activeCurrentPeriod)+"، والمستمرون "+numberLabel(report.population.retainedCustomers)+"، والمتكررون "+numberLabel(report.population.repeatPurchaseCustomers)+". معدل الاحتفاظ "+rateLabel(report.retentionRate)+". تمت المقارنة مع الفترة السابقة "+previousLabel+".";
 }
 return {
  kind:"CUSTOMER_RETENTION",state,intent,answer,sourceRpc:"get_customer_retention_aggregate",asOf:report.asOf,
  period:report.period,previousPeriod:report.previousPeriod,completePopulation,
  population:{total:report.population.total,activeCurrentPeriod:report.population.activeCurrentPeriod,
   retainedCustomers:report.population.retainedCustomers,repeatPurchaseCustomers:report.population.repeatPurchaseCustomers},
  rates:{retentionRate:report.retentionRate,repeatPurchaseRate:report.repeatPurchaseRate,
   averageOrdersPerActiveCustomer:report.averageOrdersPerActiveCustomer},
  activity:{active30Days:report.activity.active30Days,cooling31To60Days:report.activity.cooling31To60Days,
   atRisk61To90Days:report.activity.atRisk61To90Days,inactiveOver90Days:report.activity.inactiveOver90Days,
   noOrderDate:report.activity.noOrderDate},
  warnings:[...report.warnings],
 };
}


/** Projects only full-population supplier aggregates; supplier and order identities are not returned. */
export function resolveSupplierPerformanceIntent(
 intent:SupplierPerformanceIntent,result:SupplierPerformanceResult,
):NaturalLanguageSupplierPerformanceResult {
 const complete=result.completePopulation&&result.state!=="PARTIAL";
 const suppliers=result.suppliers;
 const sum=(key:"purchaseOrderCount"|"completedOrderCount"|"openOrderCount"|"inconsistentReceivedCount"|"backlogLineCount"|"leadTimeSampleCount"|"promisedDeliverySampleCount"|"onTimeCount")=>
  suppliers.reduce((total,supplier)=>total+supplier[key],0);
 const promisedSamples=sum("promisedDeliverySampleCount"),onTimeCount=sum("onTimeCount");
 const aggregate=complete?{
  purchaseOrderCount:sum("purchaseOrderCount"),completedOrderCount:sum("completedOrderCount"),
  openOrderCount:sum("openOrderCount"),inconsistentReceivedCount:sum("inconsistentReceivedCount"),
  backlogLineCount:sum("backlogLineCount"),leadTimeSampleCount:sum("leadTimeSampleCount"),
  suppliersWithReliableLeadTime:suppliers.filter(supplier=>supplier.leadTimeSampleCount>=3).length,
  promisedDeliverySampleCount:promisedSamples,onTimeCount,
  onTimePercent:promisedSamples>=3?Math.round(onTimeCount/promisedSamples*1000)/10:null,
 }:{
  purchaseOrderCount:null,completedOrderCount:null,openOrderCount:null,inconsistentReceivedCount:null,
  backlogLineCount:null,leadTimeSampleCount:null,suppliersWithReliableLeadTime:null,
  promisedDeliverySampleCount:null,onTimeCount:null,onTimePercent:null,
 };
 let answer:string;
 if(!complete){
  answer="مجموعة الموردين في هذه النافذة جزئية: أُعيد "+result.returnedSupplierCount+" من أصل "+result.totalSupplierCount+" مورداً. حُجبت المجاميع والنسب حتى لا تُعرض عينة الموردين كأنها كامل مجتمع المشتريات.";
 }else if(result.state==="EMPTY"){
  answer="لا توجد أوامر شراء مؤهلة ضمن نافذة "+result.period.from+" إلى "+result.period.to+".";
 }else if(intent==="SUPPLIER_DELIVERY_ADHERENCE"){
  answer="في نافذة "+result.period.from+" إلى "+result.period.to+" توجد "+promisedSamples+" مشاهدة مكتملة مرتبطة بمدة توريد موعودة؛ معدل الالتزام الكلي "+(aggregate.onTimePercent===null?"غير متاح لعدم بلوغ 3 مشاهدات":aggregate.onTimePercent.toFixed(1)+"%")+".";
 }else{
  answer="في نافذة "+result.period.from+" إلى "+result.period.to+" شمل التحليل "+aggregate.purchaseOrderCount+" أمر شراء عبر "+result.totalSupplierCount+" مورداً؛ المكتمل "+aggregate.completedOrderCount+"، والمفتوح "+aggregate.openOrderCount+"، وسطـور الاستلام المتبقية "+aggregate.backlogLineCount+". الموردون ذوو 3 عينات زمن توريد على الأقل: "+aggregate.suppliersWithReliableLeadTime+".";
 }
 return {
  kind:"SUPPLIER_PERFORMANCE",state:complete?result.state:"PARTIAL",intent,answer,
  sourceRpc:"fetch_supplier_performance_snapshot",asOf:result.asOf,period:{from:result.period.from,to:result.period.to},
  totalSupplierCount:result.totalSupplierCount,returnedSupplierCount:result.returnedSupplierCount,completePopulation:complete,
  aggregate,withheldReasons:[...result.withheldReasons],
 };
}
