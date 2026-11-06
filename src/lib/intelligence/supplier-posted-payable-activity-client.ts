import { supabase } from "@/lib/supabase";
export interface SupplierPostedPayableActivityCurrency {
  currency: string;
  status: "VERIFIED" | "NEEDS_REVIEW";
  supplierCount: number;
  sourceEntryCount: number;
  grossPayableCreditAmount: number;
  postedSupplierCreditNoteDebitAmount: number;
  netPayableMovementAmount: number;
  top5GrossPayableCreditAmount: number;
  top5GrossPayableCreditPercent: number | null;
}
export interface SupplierPostedPayableActivitySnapshot {
  status: "VERIFIED" | "NEEDS_REVIEW" | "EMPTY";
  asOf: string;
  period: { from: string; to: string };
  completeSourceAggregation: boolean;
  sourceEntryCount: number;
  currencyCount: number;
  currencies: SupplierPostedPayableActivityCurrency[];
  activityScope: "POSTED_SOURCE_LINKED_RECEIPT_AND_SUPPLIER_CREDIT_NOTE_JOURNALS";
  formulaId: "nasr1.posted-supplier-payable-credit-concentration";
  formulaVersion: "1";
  formulaDescription: string;
}
export type SupplierPostedPayableActivityFetchResult =
  | { ok: true; snapshot: SupplierPostedPayableActivitySnapshot }
  | { ok: false; status: "DENIED" | "UNAVAILABLE" | "ERROR"; message: string };
type Row = Record<string, unknown>;
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const CURRENCY = /^[A-Z]{3}$/;
const FORMULA_ID = "nasr1.posted-supplier-payable-credit-concentration";
const ACTIVITY_SCOPE = "POSTED_SOURCE_LINKED_RECEIPT_AND_SUPPLIER_CREDIT_NOTE_JOURNALS";
function object(value: unknown): Row | null {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Row : null;
}
function validDay(value: unknown): value is string {
  if (typeof value !== "string" || !DAY.test(value)) return false;
  const millis = Date.parse(value + "T00:00:00.000Z");
  return Number.isFinite(millis) && new Date(millis).toISOString().slice(0,10) === value;
}
function validTimestamp(value: unknown): value is string {
  return typeof value === "string" && value.includes("T") && Number.isFinite(Date.parse(value));
}
function integer(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}
function unsignedAmount(value: unknown): number | null {
  const parsed = typeof value === "number" ? value :
    typeof value === "string" && value.trim() ? Number(value) : Number.NaN;
  return Number.isFinite(parsed) && parsed >= 0 && parsed <= Number.MAX_SAFE_INTEGER ? parsed : null;
}
function signedAmount(value: unknown): number | null {
  const parsed = typeof value === "number" ? value :
    typeof value === "string" && value.trim() ? Number(value) : Number.NaN;
  return Number.isFinite(parsed) && Math.abs(parsed) <= Number.MAX_SAFE_INTEGER ? parsed : null;
}
function mapFailure(error: unknown): SupplierPostedPayableActivityFetchResult {
  const failure = error as { code?: string; message?: string };
  if (failure?.code === "42501" || failure?.code === "28000" || failure?.code === "PGRST301")
    return { ok: false, status: "DENIED", message: "لا تملك صلاحية قراءة حركة الالتزامات المنشورة للموردين." };
  if (failure?.code === "PGRST202" || failure?.code === "42883" ||
      /function .* does not exist|could not find the function/i.test(failure?.message ?? ""))
    return { ok: false, status: "UNAVAILABLE", message: "مصدر حركة الموردين غير متاح قبل تطبيق ترحيل ذكاء رأس المال." };
  return { ok: false, status: "ERROR", message: "تعذر التحقق من حركة الموردين في دفتر الأستاذ." };
}
export async function fetchSupplierPostedPayableActivity(input: {
  from: string; to: string; asOf: string;
}): Promise<SupplierPostedPayableActivityFetchResult> {
  if (!validDay(input.from) || !validDay(input.to) || input.from > input.to ||
      Date.parse(input.to+"T00:00:00.000Z") - Date.parse(input.from+"T00:00:00.000Z") > 365*86400000 ||
      !validTimestamp(input.asOf))
    return { ok: false, status: "ERROR", message: "فترة أو وقت لقطة حركة الموردين غير صالح." };
  try {
    const { data,error } = await supabase.rpc("fetch_business_health_supplier_posted_payable_activity", {
      p_from:input.from,p_to:input.to,p_as_of:input.asOf,
    });
    if(error) return mapFailure(error);
    const raw=object(data), rawPeriod=object(raw?.period);
    if(!raw || !validTimestamp(raw.asOf) || Date.parse(raw.asOf)!==Date.parse(input.asOf) ||
       rawPeriod?.from!==input.from || rawPeriod?.to!==input.to ||
       raw.completeSourceAggregation!==true || !integer(raw.sourceEntryCount) ||
       !integer(raw.currencyCount) || !Array.isArray(raw.currencies) || raw.currencies.length>20 ||
       raw.currencyCount!==raw.currencies.length ||
       !["VERIFIED","NEEDS_REVIEW","EMPTY"].includes(String(raw.status)) ||
       raw.activityScope!==ACTIVITY_SCOPE || raw.formulaId!==FORMULA_ID || raw.formulaVersion!=="1" ||
       typeof raw.formulaDescription!=="string" || raw.formulaDescription.length>1200 ||
       raw.settlementIncluded!==false || raw.sideEffects!=="NONE")
      return {ok:false,status:"ERROR",message:"استجابة حركة الموردين لا تطابق عقد المصدر؛ حُجبت النسب."};
    const currencies:SupplierPostedPayableActivityCurrency[]=[];
    const seen=new Set<string>();
    for(const item of raw.currencies){
      const row=object(item);
      if(!row || typeof row.currency!=="string" || !CURRENCY.test(row.currency) || seen.has(row.currency) ||
         !["VERIFIED","NEEDS_REVIEW"].includes(String(row.status)) ||
         !integer(row.supplierCount) || row.supplierCount<1 ||
         !integer(row.sourceEntryCount) || row.sourceEntryCount<row.supplierCount)
        return {ok:false,status:"ERROR",message:"يوجد صف عملة ناقص أو مكرر في حركة الموردين."};
      const gross=unsignedAmount(row.grossPayableCreditAmount);
      const debit=unsignedAmount(row.postedSupplierCreditNoteDebitAmount);
      const net=signedAmount(row.netPayableMovementAmount);
      const top5=unsignedAmount(row.top5GrossPayableCreditAmount);
      const percent=row.top5GrossPayableCreditPercent===null?null:unsignedAmount(row.top5GrossPayableCreditPercent);
      if(gross===null || debit===null || net===null || top5===null ||
         (row.top5GrossPayableCreditPercent!==null && percent===null) ||
         Math.abs(net-(gross-debit))>0.011 ||
         (row.status==="VERIFIED" && (gross<=0 || top5>gross || percent===null || percent<=0 || percent>100 ||
           Math.abs(percent-Math.round((top5/gross)*10000)/100)>0.011)) ||
         (row.status==="NEEDS_REVIEW" && (gross!==0 || top5!==0 || percent!==null)))
        return {ok:false,status:"ERROR",message:"حركة عملة الموردين لا تتطابق حسابياً مع قيودها المنشورة."};
      seen.add(row.currency);
      currencies.push({
        currency:row.currency,status:row.status as SupplierPostedPayableActivityCurrency["status"],
        supplierCount:row.supplierCount,sourceEntryCount:row.sourceEntryCount,
        grossPayableCreditAmount:gross,postedSupplierCreditNoteDebitAmount:debit,
        netPayableMovementAmount:net,top5GrossPayableCreditAmount:top5,
        top5GrossPayableCreditPercent:percent,
      });
    }
    const summedEntries=currencies.reduce((sum,item)=>sum+item.sourceEntryCount,0);
    const expectedStatus=raw.sourceEntryCount===0?"EMPTY":
      currencies.every(item=>item.status==="VERIFIED")?"VERIFIED":"NEEDS_REVIEW";
    if(summedEntries!==raw.sourceEntryCount || raw.status!==expectedStatus ||
       (raw.sourceEntryCount===0 && currencies.length!==0) ||
       (raw.sourceEntryCount>0 && currencies.length===0))
      return {ok:false,status:"ERROR",message:"مجاميع قيود الموردين والعملات غير متصالحة؛ لم تُعرض نسب التركّز."};
    return {ok:true,snapshot:{
      status:raw.status as SupplierPostedPayableActivitySnapshot["status"],asOf:raw.asOf,
      period:{from:input.from,to:input.to},completeSourceAggregation:true,
      sourceEntryCount:raw.sourceEntryCount,currencyCount:raw.currencyCount,currencies,
      activityScope:ACTIVITY_SCOPE,formulaId:FORMULA_ID,formulaVersion:"1",
      formulaDescription:raw.formulaDescription,
    }};
  } catch {
    return {ok:false,status:"UNAVAILABLE",message:"تعذر الاتصال بمصدر حركة الموردين المنشورة."};
  }
}
