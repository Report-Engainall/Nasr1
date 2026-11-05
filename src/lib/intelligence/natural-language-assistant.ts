import type { SupplierInvoiceMatchStatus, SupplierInvoiceRecord } from "@/lib/supplier-invoices";
export type SupplierInvoiceIntent="SUPPLIER_INVOICES_UNMATCHED"|"SUPPLIER_INVOICES_PRICE_REVIEW"|"SUPPLIER_INVOICES_MATCHED";
export type PurchaseOrderIntent="PURCHASE_ORDERS_OPEN"|"PURCHASE_ORDERS_AWAITING_RECEIPT"|"PURCHASE_ORDERS_PARTIAL_RECEIPT";
export type NaturalLanguageIntent=SupplierInvoiceIntent|PurchaseOrderIntent;
export type NaturalLanguageSourceRpc="fetch_purchase_supplier_invoice_workspace"|"fetch_purchase_orders";
export type NaturalLanguagePlanResult=
 |{status:"READY";intent:NaturalLanguageIntent;normalizedQuestion:string;sourceRpc:NaturalLanguageSourceRpc;filterDescription:string}
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
export type NaturalLanguageResolvedResult=NaturalLanguageInvoiceResult|NaturalLanguagePurchaseOrderResult;
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
