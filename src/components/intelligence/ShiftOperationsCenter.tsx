import type {
  ShiftOperationsCenterResult,
  ShiftOperationalCheck,
  ShiftQueueItem,
  ShiftCashControlResult,
  ShiftItemState,
  ShiftItemSeverity,
} from "@/lib/intelligence/shift-operations";
import {
  EvidenceReferences,
  EvidenceStatusLabel,
  EvidenceWarnings,
  IntelligenceStatePanel,
  type IntelligenceViewState,
} from "./shared";

export interface ShiftOperationsCenterProps {
  result?: ShiftOperationsCenterResult | null;
  state?: IntelligenceViewState;
  onRetry?: () => void;
  onOpenItem?: (sourceKey: ShiftQueueItem["sourceKey"], sourceRef: string) => void;
}

const checkLabels = {
  CLEAR: "مكتمل", ACTION_REQUIRED: "يتطلب إجراء", UNKNOWN: "غير متحقق", NOT_APPLICABLE: "لا ينطبق",
} as const;
const itemLabels: Record<ShiftItemState,string> = {
  OPEN: "مفتوح", IN_PROGRESS: "قيد المعالجة", BLOCKED: "متعثر", RESOLVED: "تمت المعالجة", UNKNOWN: "غير متحقق",
};
const severityLabels: Record<ShiftItemSeverity,string> = {
  CRITICAL: "حرج", WARNING: "تنبيه", INFO: "معلومة",
};
const sourceLabels: Record<ShiftQueueItem["sourceKey"],string> = {
  CONNECTIVITY:"الاتصال والمزامنة",TASKS:"المهام",ORDERS:"الطلبات",INVOICES:"الفواتير",
  RECEIPTS:"الاستلامات",PAYMENTS:"المدفوعات",CASH:"الصندوق",MOVEMENTS:"حركات المخزون",
  DELIVERIES:"التوصيل",INVENTORY:"المخزون",REMINDERS:"التذكيرات",HANDOVER:"التسليم بين الورديات",
};
const cashStates = {
  MATCHED:"مطابق",VARIANCE:"فرق يحتاج مراجعة",NOT_RECORDED:"لم يسجل العد",NOT_APPLICABLE:"لا ينطبق",UNKNOWN:"المصدر غير متحقق",
};
const formatNumber=(value:number|null)=>value===null?"غير متاح":new Intl.NumberFormat("ar-YE",{maximumFractionDigits:2}).format(value);
const amount=(value:number|null,currency:string)=>value===null?"غير متاح":formatNumber(value)+" "+currency;

function StateChip({state}:{state:ShiftOperationalCheck["state"]}){
  return <span className="rounded-full border px-2 py-1 text-xs">{checkLabels[state]}</span>;
}

function CheckCard({item}:{item:ShiftOperationalCheck}){
  return <article className="rounded-lg border p-3 space-y-2">
    <header className="flex flex-wrap items-center justify-between gap-2">
      <h4 className="text-sm font-semibold">{item.title}</h4>
      <StateChip state={item.state}/>
    </header>
    <p className="text-sm text-muted-foreground">{item.message}</p>
    {item.count!==null?<p className="text-xs">عدد السجلات في المصدر الكامل: {formatNumber(item.count)}</p>:null}
    {item.relatedItems.length?(
      <ul className="space-y-2">
        {item.relatedItems.map(row=><li key={row.id} className="rounded-md border p-2 text-sm">
          <p className="font-medium">{row.title}</p>
          {row.summary?<p className="text-xs text-muted-foreground">{row.summary}</p>:null}
          <div className="mt-1 flex flex-wrap gap-2 text-xs">
            <span>{itemLabels[row.state]}</span><span>{severityLabels[row.severity]}</span>
            {row.ownerProfileId?<span>مسؤول معيّن</span>:<span>لم يعيّن مسؤول</span>}
            {row.dueAt?<span>الاستحقاق: {row.dueAt}</span>:null}
          </div>
          {row.amount!==null&&row.currency?<p className="mt-1 font-semibold">{amount(row.amount,row.currency)}</p>:null}
          <p className="mt-1 text-xs">الإثبات: <EvidenceReferences ids={row.evidenceIds}/></p>
        </li>)}
      </ul>
    ):null}
    {item.evidenceIds.length?<p className="text-xs">مرجع المصدر: <EvidenceReferences ids={item.evidenceIds}/></p>:null}
  </article>;
}

function QueueItemCard({item,onOpenItem}:{item:ShiftQueueItem;onOpenItem?:ShiftOperationsCenterProps["onOpenItem"]}){
  return <article className="rounded-lg border p-3">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <p className="text-sm font-semibold">{item.title}</p>
      <span className="text-xs">{itemLabels[item.state]} · {severityLabels[item.severity]}</span>
    </div>
    {item.summary?<p className="mt-1 text-sm text-muted-foreground">{item.summary}</p>:null}
    <div className="mt-2 flex flex-wrap gap-2 text-xs">
      <span>{sourceLabels[item.sourceKey]}</span>
      {item.ownerProfileId?<span>مسؤول معيّن</span>:<span>لا يوجد تعيين موثق</span>}
      {item.dueAt?<span>الاستحقاق: {item.dueAt}</span>:null}
      {item.amount!==null&&item.currency?<strong>{amount(item.amount,item.currency)}</strong>:null}
    </div>
    <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
      <span className="text-xs">الدليل: <EvidenceReferences ids={item.evidenceIds}/></span>
      {onOpenItem&&item.state!=="UNKNOWN"?(
        <button type="button" className="rounded-md border px-3 py-1 text-xs" onClick={()=>onOpenItem(item.sourceKey,item.sourceRef)}>
          فتح السجل
        </button>
      ):null}
    </div>
  </article>;
}

function CashCard({item}:{item:ShiftCashControlResult}){
  const rows=[
    ["العهدة المتوقعة",item.opening.expected],
    ["العد الفعلي",item.opening.counted],
    ["الفرق",item.opening.variance],
  ] as const;
  const closing=[
    ["المتوقع للإقفال",item.closing.expected],
    ["العد عند الإقفال",item.closing.counted],
    ["الفرق",item.closing.variance],
  ] as const;
  return <article className="rounded-lg border p-3">
    <header className="flex flex-wrap items-center justify-between gap-2">
      <h4 className="font-semibold">{item.currency}</h4>
      <span className="text-xs">مصدر النقد حتى {item.sourceAsOf}</span>
    </header>
    <div className="mt-3 grid gap-3 sm:grid-cols-2">
      <section className="rounded-md border p-3">
        <h5 className="text-sm font-semibold">افتتاح الصندوق</h5>
        <p className="text-xs">{cashStates[item.opening.state]}</p>
        <dl className="mt-2 space-y-1 text-sm">
          {rows.map(([label,value])=><div key={label} className="flex justify-between gap-2"><dt>{label}</dt><dd className="font-medium">{amount(value,item.currency)}</dd></div>)}
        </dl>
      </section>
      <section className="rounded-md border p-3">
        <h5 className="text-sm font-semibold">إقفال الصندوق</h5>
        <p className="text-xs">{cashStates[item.closing.state]}</p>
        <dl className="mt-2 space-y-1 text-sm">
          {closing.map(([label,value])=><div key={label} className="flex justify-between gap-2"><dt>{label}</dt><dd className="font-medium">{amount(value,item.currency)}</dd></div>)}
        </dl>
      </section>
    </div>
    <p className="mt-2 text-xs">الإثبات: <EvidenceReferences ids={item.evidenceIds}/></p>
  </article>;
}

export function ShiftOperationsCenter({
  result=null,state="ready",onRetry,onOpenItem,
}:ShiftOperationsCenterProps){
  const effective=state==="ready"&&!result?"unavailable":state;
  if(effective!=="ready") return <IntelligenceStatePanel state={effective} onRetry={onRetry} errorMessage="تعذر تحميل مركز الوردية." />;
  if(!result) return <IntelligenceStatePanel state="unavailable" unavailableMessage="بيانات الوردية غير متاحة؛ لم يتم توليد قوائم أو أرصدة افتراضية." />;
  const openingLabel=result.openingReadiness==="READY"?"جاهز للاستلام":result.openingReadiness==="ATTENTION"?"توجد عناصر تحتاج معالجة":"مصادر الافتتاح غير مكتملة";
  const closeLabel=result.operationalClose==="COMPLETE"?"قائمة الإقفال التشغيلية مكتملة":result.operationalClose==="PARTIAL"?"الإقفال التشغيلي جزئي":"مصادر الإقفال غير مكتملة";
  const financialLabel=result.financialClose.state==="ELIGIBLE"?"مؤهل لمراجعة الإقفال":result.financialClose.state==="BLOCKED"?"الإقفال المالي محجوب":result.financialClose.state==="NOT_RECORDED"?"لم يسجل الإقفال":"المصالحة المالية غير متاحة";
  return <section dir="rtl" className="space-y-4 rounded-xl border p-4" aria-label="مركز إقفال اليوم وبدء الوردية">
    <header className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h2 className="text-lg font-semibold">مركز إقفال اليوم وبدء الوردية</h2>
        <p className="text-xs text-muted-foreground">{result.shiftLabel} · {result.businessDate} · {result.organizationTimeZone}</p>
        <p className="text-xs text-muted-foreground">آخر قراءة للمصادر: {result.asOf} · تم إنشاء العرض: {result.generatedAt}</p>
      </div>
      <button type="button" className="rounded-lg border px-3 py-2 text-sm" onClick={()=>window.print()}>
        طباعة تقرير الوردية
      </button>
    </header>
    <p className="text-sm text-muted-foreground">هذا المركز يجمع أدلة التشغيل ويعرض أهلية الإقفال فقط. لا يرحّل قيوداً، ولا يغلق الصندوق أو الطلبات، ولا يغيّر المخزون أو ينقل مسؤولية المهام تلقائياً.</p>
    <div className="grid gap-3 lg:grid-cols-3">
      <article className="rounded-lg border p-3">
        <p className="text-xs text-muted-foreground">بدء الوردية</p>
        <strong>{openingLabel}</strong>
        <p className="mt-1 text-xs">نتيجة قائمة الاستلام من المصادر المكتملة فقط.</p>
      </article>
      <article className="rounded-lg border p-3">
        <p className="text-xs text-muted-foreground">إقفال التشغيل</p>
        <strong>{closeLabel}</strong>
        <p className="mt-1 text-xs">يمكن إنهاء قائمة التشغيل جزئياً مع إبقاء البنود المفتوحة موثقة.</p>
      </article>
      <article className="rounded-lg border p-3">
        <p className="text-xs text-muted-foreground">الإقفال المالي</p>
        <strong>{financialLabel}</strong>
        <p className="mt-1 text-xs">{result.financialClose.statement}</p>
      </article>
    </div>
    <section className="space-y-2">
      <h3 className="font-semibold">بدء الوردية واستلام العهدة</h3>
      <div className="grid gap-2 xl:grid-cols-2">{result.openingChecks.map(item=><CheckCard key={item.id} item={item}/>)}</div>
    </section>
    <section className="space-y-2">
      <h3 className="font-semibold">قائمة الإقفال التشغيلي</h3>
      <div className="grid gap-2 xl:grid-cols-2">{result.closingChecks.map(item=><CheckCard key={item.id} item={item}/>)}</div>
    </section>
    <section className="space-y-2">
      <h3 className="font-semibold">مصالحة النقد حسب العملة</h3>
      {result.cashControls.length?result.cashControls.map(item=><CashCard key={item.currency} item={item}/>):<p className="text-sm text-muted-foreground">لا توجد سجلات عهدة نقدية متاحة من مصدر موثق.</p>}
      <p className="text-xs text-muted-foreground">لا تُجمع عملات مختلفة. الفرق لا يُصحح تلقائياً ولا يتحول إلى قيد يومية دون إجراء مستقل مصرح به.</p>
    </section>
    <section className="space-y-2">
      <h3 className="font-semibold">محضر تسليم الوردية</h3>
      {result.handover.state==="NOT_REQUIRED"?<p className="text-sm">لا توجد وردية سابقة مطلوبة للتسليم.</p>:
        <article className="rounded-lg border p-3 space-y-2">
          <p className="text-sm font-semibold">{result.handover.state==="ACCEPTED"?"تم قبول التسليم":result.handover.state==="PENDING"?"بانتظار قبول التسليم":"التسليم غير متحقق"}</p>
          {result.handover.reason?<p className="text-sm text-muted-foreground">{result.handover.reason}</p>:null}
          {result.handover.openItemRefs.length?<div><p className="text-xs">العناصر المرحّلة للوردية الحالية: {result.handover.openItemRefs.length}</p><ul className="list-disc ps-5 text-xs">{result.handover.openItemRefs.map(ref=><li key={ref} dir="ltr">{ref}</li>)}</ul></div>:null}
          {result.handover.note?<p className="text-sm">{result.handover.note}</p>:null}
          <p className="text-xs">الإثبات: <EvidenceReferences ids={result.handover.evidenceIds}/></p>
        </article>
      }
    </section>
    <section className="space-y-2">
      <h3 className="font-semibold">السجلات التي لا تزال تحتاج متابعة</h3>
      {result.items.filter(item=>item.state!=="RESOLVED").length?
        <div className="grid gap-2 lg:grid-cols-2">{result.items.filter(item=>item.state!=="RESOLVED").map(item=><QueueItemCard key={item.id} item={item} onOpenItem={onOpenItem}/>)}</div>:
        <p className="text-sm">لا توجد سجلات مفتوحة في المصادر المكتملة المعروضة.</p>}
    </section>
    {result.financialClose.blockers.length?<section className="rounded-lg border p-3">
      <h3 className="font-semibold">موانع الإقفال المالي</h3>
      <ul className="mt-1 list-disc ps-5 text-sm">{result.financialClose.blockers.map(item=><li key={item}>{item}</li>)}</ul>
    </section>:null}
    <details className="rounded-lg border p-3">
      <summary className="cursor-pointer text-sm font-semibold">تغطية المصادر والأدلة ({result.sourceCoverage.length})</summary>
      <div className="mt-2 space-y-2">{result.sourceCoverage.map(source=><article key={source.key} className="flex flex-wrap items-center justify-between gap-2 border-b pb-2 text-xs">
        <span>{sourceLabels[source.key as ShiftQueueItem["sourceKey"]]??source.key}</span>
        <EvidenceStatusLabel status={source.status}/>
        <span>{source.returnedCount===null?"العدد غير متاح":formatEvidenceNumber(source.returnedCount)}</span>
        <span>{source.asOf??"لا يوجد تاريخ مصدر"}</span>
        <span>الإثبات: <EvidenceReferences ids={source.evidenceIds}/></span>
        <p className="w-full text-muted-foreground">{source.message}</p>
      </article>)}</div>
    </details>
    <EvidenceWarnings warnings={result.warnings}/>
    <p className="text-xs text-muted-foreground">المستخدم المسؤول: {result.currentOwnerProfileId ? "ملف مستخدم مصرح به" : "غير محدد"} · حالة الأدلة: <EvidenceStatusLabel status={result.status}/></p>
  </section>;
}
