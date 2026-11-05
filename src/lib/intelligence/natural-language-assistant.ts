import type { SupplierInvoiceMatchStatus, SupplierInvoiceRecord } from "@/lib/supplier-invoices";
export type NaturalLanguageIntent =
  | "SUPPLIER_INVOICES_UNMATCHED"
  | "SUPPLIER_INVOICES_PRICE_REVIEW"
  | "SUPPLIER_INVOICES_MATCHED";
export type NaturalLanguagePlanResult =
  | { status:"READY"; intent:NaturalLanguageIntent; normalizedQuestion:string; sourceRpc:"fetch_purchase_supplier_invoice_workspace"; filterDescription:string }
  | { status:"CLARIFICATION"|"UNSUPPORTED"; normalizedQuestion:string; explanation:string; clarification?:string };
function normalizeArabic(value:string):string {
 return value.normalize("NFKC").replace(/[\u064B-\u065F\u0670\u0640]/g,"")
  .replace(/[أإآ]/g,"ا").replace(/ى/g,"ي").replace(/ة/g,"ه").toLowerCase()
  .replace(/[؟?!.,،؛:()[\]{}]/g," ").replace(/\s+/g," ").trim();
}
export function planNaturalLanguageQuery(question:string):NaturalLanguagePlanResult {
 const normalizedQuestion=normalizeArabic(question);
 if(!normalizedQuestion||normalizedQuestion.length>400) return {
  status:"CLARIFICATION",normalizedQuestion,
  explanation:"اكتب سؤالاً واضحاً لا يتجاوز 400 حرف.",
  clarification:"ما السجلات التي تريد الاستعلام عنها؟"
 };
 if(/اليوم|امس|غدا|هذا الشهر|الشهر الحالي|خلال/.test(normalizedQuestion)) return {
  status:"UNSUPPORTED",normalizedQuestion,
  explanation:"هذا المسار لا يطبق مرشحاً زمنياً حراً بعد. لا أستطيع إرجاع نتائج اليوم أو أمس من قائمة محدودة ثم وصفها بأنها شاملة."
 };
 const hasInvoice=normalizedQuestion.includes("فاتور");
 const hasSupplier=normalizedQuestion.includes("مورد");
 const hasMismatch=/(غير مطابق|غير مطابقه|لم تطابق|لم يطابق|لا تطابق|لا يطابق|عدم المطابق|فرق سعر|فروق السعر|اختلاف السعر|غير متطابق)/.test(normalizedQuestion);
 const hasReview=/(بانتظار|تنتظر|قيد المراجعه|بحاجه الي مراجعه|تحتاج مراجعه)/.test(normalizedQuestion);
 const hasMatched=/(الفواتير المطابقه|فاتوره مطابقه|مطابقه مع الاستلام|مطابقه ثلاثيه)/.test(normalizedQuestion);
 if(hasInvoice&&!hasSupplier) return {
  status:"CLARIFICATION",normalizedQuestion,
  explanation:"مصادر القراءة المتاحة هنا تخص فواتير الموردين، ولا يجوز الخلط بينها وبين فواتير العملاء.",
  clarification:"هل تقصد فواتير الموردين المرتبطة بأوامر الشراء والاستلام؟"
 };
 if(hasInvoice&&hasSupplier&&hasReview&&hasMismatch) return {
  status:"READY",intent:"SUPPLIER_INVOICES_PRICE_REVIEW",normalizedQuestion,
  sourceRpc:"fetch_purchase_supplier_invoice_workspace",
  filterDescription:"match_status = variance_pending؛ فروق سعر لم تُحسم بعد."
 };
 if(hasInvoice&&hasSupplier&&hasMismatch) return {
  status:"READY",intent:"SUPPLIER_INVOICES_UNMATCHED",normalizedQuestion,
  sourceRpc:"fetch_purchase_supplier_invoice_workspace",
  filterDescription:"match_status != matched؛ سجلات فرق سعر الوحدة بين الفاتورة وتكلفة أمر الشراء والاستلام، بما فيها الفروق المعلّقة والمعتمدة والمرفوضة. هذا لا يصنّف فرق الضريبة أو النقص الكمي."
 };
 if(hasInvoice&&hasSupplier&&hasMatched&&!/(غير|لم|لا|عدم)/.test(normalizedQuestion)) return {
  status:"READY",intent:"SUPPLIER_INVOICES_MATCHED",normalizedQuestion,
  sourceRpc:"fetch_purchase_supplier_invoice_workspace",
  filterDescription:"match_status = matched؛ المطابقة الثلاثية المسجلة."
 };
 if(hasInvoice&&hasSupplier) return {
  status:"CLARIFICATION",normalizedQuestion,
  explanation:"حددت فواتير الموردين، لكن شرط المطابقة المطلوب غير واضح.",
  clarification:"هل تريد الفواتير غير المطابقة، أم التي تنتظر مراجعة فرق السعر، أم المطابقة؟"
 };
 return {
  status:"UNSUPPORTED",normalizedQuestion,
  explanation:"لم يتعرف المساعد على نية قراءة معتمدة. لا ينشئ SQL ولا ينفذ أوامر أو تغييرات من اللغة الطبيعية."
 };
}
export interface NaturalLanguageInvoiceMatch {
 invoiceId:string;invoiceNumber:string;supplierName:string;purchaseOrderNumber:string;
 invoiceDate:string;createdAt:string;currency:string;matchStatus:SupplierInvoiceMatchStatus;
 reviewReason:string|null;lineCount:number;mismatchedLineCount:number;
}
export interface NaturalLanguageQueryResult {
 state:"READY"|"PARTIAL"|"EMPTY";
 intent:NaturalLanguageIntent;
 answer:string;
 sourceRpc:"fetch_purchase_supplier_invoice_workspace";
 asOfDate:string;
 totalInvoiceCount:number;
 inspectedInvoiceCount:number;
 matchedQueryCount:number;
 completePopulation:boolean;
 countsByStatus:Record<SupplierInvoiceMatchStatus,number>;
 invoices:NaturalLanguageInvoiceMatch[];
 notice:string|null;
}
export function resolveSupplierInvoiceIntent(
 intent:NaturalLanguageIntent,
 records:SupplierInvoiceRecord[],
 metadata:{invoiceCount:number;hasMore:boolean;asOfDate:string},
):NaturalLanguageQueryResult {
 const counts:Record<SupplierInvoiceMatchStatus,number>={
  matched:0,variance_pending:0,variance_approved:0,variance_rejected:0,
 };
 for(const invoice of records) counts[invoice.matchStatus]+=1;
 const invoices=records.filter(invoice=>{
  if(intent==="SUPPLIER_INVOICES_UNMATCHED") return invoice.matchStatus!=="matched";
  if(intent==="SUPPLIER_INVOICES_PRICE_REVIEW") return invoice.matchStatus==="variance_pending";
  return invoice.matchStatus==="matched";
 }).map(invoice=>({
  invoiceId:invoice.id,invoiceNumber:invoice.invoiceNumber,supplierName:invoice.supplierName,
  purchaseOrderNumber:invoice.purchaseOrderNumber,invoiceDate:invoice.invoiceDate,createdAt:invoice.createdAt,
  currency:invoice.currency,matchStatus:invoice.matchStatus,reviewReason:invoice.reviewReason,
  lineCount:invoice.lines.length,mismatchedLineCount:invoice.lines.filter(line=>!line.priceMatch).length,
 }));
 const completePopulation=!metadata.hasMore&&records.length===metadata.invoiceCount;
 const state=invoices.length===0?(completePopulation?"EMPTY":"PARTIAL"):(completePopulation?"READY":"PARTIAL");
 const labels:Record<NaturalLanguageIntent,string>={
  SUPPLIER_INVOICES_UNMATCHED:"ذات فروق سعر",
  SUPPLIER_INVOICES_PRICE_REVIEW:"التي تنتظر مراجعة فرق السعر",
  SUPPLIER_INVOICES_MATCHED:"المطابقة",
 };
 const answer=state==="EMPTY"
  ?"لم توجد فواتير موردين بهذه الحالة ضمن كامل السجلات التي أعادها المصدر. المقصود هنا حالة فرق سعر الوحدة في المطابقة الثلاثية."
  :state==="PARTIAL"
   ?"عُثر على "+invoices.length+" فاتورة "+labels[intent]+" ضمن أحدث "+records.length+
    " فاتورة مفحوصة؛ إجمالي السجلات "+metadata.invoiceCount+". النتيجة جزئية ولا تثبت عدم وجود نتائج أقدم."
   :"عُثر على "+invoices.length+" فاتورة "+labels[intent]+" من أصل "+metadata.invoiceCount+" فاتورة في المصدر. المقصود فروق سعر الوحدة بين الفاتورة وتكلفة أمر الشراء والاستلام.";
 return {
  state,intent,answer,sourceRpc:"fetch_purchase_supplier_invoice_workspace",asOfDate:metadata.asOfDate,
  totalInvoiceCount:metadata.invoiceCount,inspectedInvoiceCount:records.length,
  matchedQueryCount:invoices.length,completePopulation,countsByStatus:counts,invoices,
  notice:completePopulation?null:"المصدر يعيد أحدث 100 فاتورة فقط في هذا المسار؛ لم تُقرأ الصفحات التالية، لذلك بقيت النتيجة جزئية.",
 };
}
