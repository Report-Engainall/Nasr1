import type { DecisionMemoryBookResult, DecisionMemoryRecord, DecisionMemoryMissingField } from "@/lib/intelligence/decision-memory";
import { EvidenceReferences, EvidenceStatusLabel, IntelligenceStatePanel, type IntelligenceViewState } from "./shared";

export interface DecisionMemoryBookProps {
  result?: DecisionMemoryBookResult | null;
  state?: IntelligenceViewState;
  onRetry?: () => void;
}
const missingLabels: Record<DecisionMemoryMissingField,string> = {
  PROBLEM_CONTEXT:"سياق المشكلة قبل القرار",FACTS_REVIEWED:"توثيق مراجعة الوقائع",FACTS_WITH_EVIDENCE:"ربط الوقائع بأدلة المصدر",
  ALTERNATIVES:"البدائل التي تمت دراستها",CHOSEN_OPTION:"الخيار الذي تم اختياره",ASSUMPTIONS_REVIEWED:"الافتراضات ومراجعتها صراحة",
  ACTION_TAKEN:"الإجراء التنفيذي الناتج عن القرار",REVIEW_DISPOSITION:"تحديد حالة المراجعة",REVIEW_DATE:"موعد المراجعة المجدول",
  EXPECTED_METRIC:"خط الأساس/الهدف المتوقع",ACTUAL_METRIC:"النتيجة الفعلية ودليلها",LESSONS_REVIEWED:"مراجعة الدروس المستفادة",
};
const states={PROPOSED:"مقترح",IN_REVIEW:"قيد المراجعة",APPROVED:"معتمد",REJECTED:"مرفوض",ASSIGNED:"مُعيّن",EXECUTING:"قيد التنفيذ",EXECUTED:"بانتظار القياس",MEASURED:"تم القياس"};
const number=(value:number)=>new Intl.NumberFormat("ar-YE",{maximumFractionDigits:2}).format(value);
function metricLine(title:string,metric:NonNullable<DecisionMemoryRecord["metricComparison"]["expected"]>){
  return <div className="rounded-lg border p-3"><p className="text-xs text-muted-foreground">{title}</p>
    <strong>{number(metric.value)} {metric.currency??metric.unitOfMeasure??metric.unit}</strong>
    <p className="text-xs text-muted-foreground">{metric.period.from} — {metric.period.to} · حتى {metric.asOf}</p>
    <p className="text-xs">المعادلة: {metric.formulaId}@{metric.formulaVersion}</p>
    <p className="text-xs">الإثبات: <EvidenceReferences ids={metric.evidenceIds}/></p></div>;
}
function DecisionMemoryCard({record}:{record:DecisionMemoryRecord}){
  return <article className="rounded-xl border p-4 space-y-3">
    <header className="flex flex-wrap items-start justify-between gap-2"><div>
      <h3 className="font-semibold">{record.proposedResult}</h3>
      <p className="text-xs text-muted-foreground" dir="ltr">{record.ruleId}@{record.ruleVersion} · {record.decisionId.slice(0,8)}</p>
      <p className="text-xs">الحالة: {states[record.state]} · الإصدار: {record.version} · المسؤول: {record.owner}</p>
    </div><span className="text-xs"><EvidenceStatusLabel status={record.memoryStatus==="VERIFIED"?"VERIFIED":record.memoryStatus==="PARTIAL"?"NEEDS_REVIEW":"UNVERIFIED"}/></span></header>
    {record.problem?<section><h4 className="text-sm font-semibold">المشكلة المسجلة</h4><p className="text-sm">{record.problem}</p></section>:null}
    {record.decisionReason?<section><h4 className="text-sm font-semibold">مبرر القرار — سياق إداري لا يُعامل كحقيقة مستقلة</h4><p className="text-sm">{record.decisionReason}</p></section>:null}
    <div className="grid gap-2 sm:grid-cols-2">
      {record.facts.length?<section className="rounded-lg border p-3"><h4 className="text-sm font-semibold">وقائع مثبتة ({record.facts.length})</h4>
        {record.facts.map(fact=><div key={fact.id} className="mt-2 text-sm"><p>{fact.text}</p><p className="text-xs text-muted-foreground">الدليل: <EvidenceReferences ids={fact.evidenceIds}/></p></div>)}</section>:null}
      {record.opinions.length?<section className="rounded-lg border p-3"><h4 className="text-sm font-semibold">آراء مسجلة ({record.opinions.length})</h4>{record.opinions.map(item=><p key={item.id} className="mt-2 text-sm">{item.text}</p>)}</section>:null}
      {record.hypotheses.length?<section className="rounded-lg border p-3"><h4 className="text-sm font-semibold">فرضيات قيد التحقق ({record.hypotheses.length})</h4>{record.hypotheses.map(item=><p key={item.id} className="mt-2 text-sm">{item.text}</p>)}</section>:null}
    {record.assumptions.length?<section className="rounded-lg border p-3"><h4 className="text-sm font-semibold">افتراضات معلنة — ليست وقائع مثبتة ({record.assumptions.length})</h4>{record.assumptions.map((item,index)=><p key={index} className="mt-2 text-sm">{item}</p>)}</section>:null}
    </div>
    {record.withheldFacts?<p className="text-xs text-amber-700">حُجبت {record.withheldFacts} واقعة لغياب دليل مكتمل أو صالح.</p>:null}
    {record.alternatives.length?<section className="space-y-1"><h4 className="text-sm font-semibold">البدائل المسجلة</h4><ul className="list-disc space-y-1 ps-5 text-sm">
      {record.alternatives.map(option=><li key={option.id}><span>{option.label}</span>{record.chosenAlternative?.id===option.id?<strong> — المختار</strong>:null}
        {option.rationale?<p className="text-xs text-muted-foreground">{option.rationale}</p>:null}
        {option.evidenceIds.length?<p className="text-xs text-muted-foreground">الإثبات: <EvidenceReferences ids={option.evidenceIds}/></p>:null}</li>)}
    </ul></section>:null}
    {record.actionTaken?<p className="text-sm"><strong>الإجراء:</strong> {record.actionTaken}</p>:null}
    <section className="space-y-2"><h4 className="text-sm font-semibold">الهدف والنتيجة المقاسة</h4>
      {record.metricComparison.status==="VERIFIED"?<>
        <div className="grid gap-2 sm:grid-cols-2">{record.metricComparison.expected?metricLine("المتوقع",record.metricComparison.expected):null}{record.metricComparison.actual?metricLine("الفعلي",record.metricComparison.actual):null}</div>
        <p className="text-sm">الفارق: {record.metricComparison.difference===null?"غير متاح":number(record.metricComparison.difference)} · التغير: {record.metricComparison.differencePercent===null?"النسبة غير معرفة لخط أساس صفري":number(record.metricComparison.differencePercent)+"%"}</p>
      </>:<p className="text-sm text-muted-foreground">المقارنة محجوبة: {record.metricComparison.reason??"لا يوجد قياس مستندي متوافق"}.</p>}
      {record.legacyMeasurement?<p className="text-xs text-muted-foreground">القيمة المختصرة في دورة القرار: {number(record.legacyMeasurement.value)} {record.legacyMeasurement.currency} حتى {record.legacyMeasurement.asOf}. لا تصل معها حالياً أدلة المؤشر ومعادلته؛ لذلك لا تُعامل كقياس مثبت.</p>:null}
    </section>
    {record.reviewDisposition?<p className="text-sm">المراجعة: {record.reviewDisposition==="SCHEDULED"?"مجدولة":record.reviewDisposition==="NOT_REQUIRED"?"غير مطلوبة":"غير مجدولة"} {record.reviewAt?"في "+record.reviewAt:""}</p>:null}
    {record.lessons.length?<section><h4 className="text-sm font-semibold">الدروس المستفادة</h4><ul className="list-disc ps-5 text-sm">{record.lessons.map((lesson,index)=><li key={index}>{lesson}</li>)}</ul></section>:null}
    {record.corrections.length?<section className="space-y-1"><h4 className="text-sm font-semibold">سجل التصحيحات الإلحاقي</h4>
      {record.corrections.map(correction=><article key={correction.id} className="rounded-lg border p-2 text-xs">
        <p>الإصدار {correction.fromVersion} ← {correction.toVersion} · {correction.actorRole} · {correction.recordedAt}</p>
        <p>قبل: {correction.originalText}</p><p>بعد: {correction.correctedText}</p><p>السبب: {correction.reason}</p>
      </article>)}</section>:null}
    {record.missingFields.length?<section className="rounded-lg border p-3"><h4 className="text-sm font-semibold">حقول الذاكرة غير المحفوظة</h4><ul className="mt-1 list-disc ps-5 text-xs">{record.missingFields.map(field=><li key={field}>{missingLabels[field]}</li>)}</ul></section>:null}
    {record.precedents.length?<section><h4 className="text-sm font-semibold">قرارات سابقة من القاعدة نفسها — ضمن الصفحة المحمّلة فقط</h4><ul className="list-disc ps-5 text-xs">{record.precedents.map(item=><li key={item.decisionId}>{item.ruleVersion} · {states[item.state]} · {item.createdAt} · {item.measured?"قياس مسجل":"بلا قياس"}</li>)}</ul></section>:null}
    {record.warnings.map(warning=><p key={warning} className="text-xs text-muted-foreground">{warning}</p>)}
  </article>;
}
export function DecisionMemoryBook({result=null,state="ready",onRetry}:DecisionMemoryBookProps){
  const effective=state==="ready"&&!result?"unavailable":state;
  if(effective!=="ready")return <IntelligenceStatePanel state={effective} onRetry={onRetry} errorMessage="تعذر تحميل دفتر ذاكرة القرارات." />;
  if(!result)return <IntelligenceStatePanel state="unavailable" unavailableMessage="مصدر ذاكرة القرارات غير متاح؛ لم تُنشأ سجلات افتراضية." />;
  return <section dir="rtl" className="space-y-3 rounded-xl border p-4" aria-label="دفتر ذاكرة القرارات والتعلم">
    <header className="flex flex-wrap items-center justify-between gap-2"><div><h2 className="text-lg font-semibold">دفتر ذاكرة القرارات والتعلّم من نتائجها</h2>
      <p className="text-xs text-muted-foreground">سياسة {result.policyVersion} · لقطة {result.generatedAt} · الصفحة {result.loadedCount} من {result.totalCount}</p></div>
      <span className="text-xs"><EvidenceStatusLabel status={result.status==="VERIFIED"?"VERIFIED":result.status==="PARTIAL"?"NEEDS_REVIEW":"UNAVAILABLE"}/></span></header>
    <p className="text-sm text-muted-foreground">يفصل الوقائع المثبتة عن الآراء والفرضيات. لا يغيّر قواعد القرار تلقائياً، ولا يحوّل قيمة القياس المختصرة إلى إثبات دون معادلة ومصدر.</p>
    <div className="grid gap-2 sm:grid-cols-4">
      <article className="rounded-lg border p-3"><p className="text-xs">قرارات محمّلة</p><strong className="text-xl">{result.loadedCount}</strong></article>
      <article className="rounded-lg border p-3"><p className="text-xs">ذاكرة مكتملة</p><strong className="text-xl">{result.completeCount}</strong></article>
      <article className="rounded-lg border p-3"><p className="text-xs">بانتظار الاستكمال</p><strong className="text-xl">{result.partialCount}</strong></article>
      <article className="rounded-lg border p-3"><p className="text-xs">قياسات مثبتة قابلة للمقارنة</p><strong className="text-xl">{result.verifiedMeasurementCount}</strong></article>
    </div>
    {result.records.length?result.records.map(record=><DecisionMemoryCard key={record.decisionId} record={record}/>):<p className="text-sm">لا توجد قرارات محفوظة بعد.</p>}
    {result.warnings.length?<section className="rounded-lg border p-3"><h3 className="text-sm font-semibold">حدود البيانات الحالية</h3>{result.warnings.map(warning=><p key={warning} className="text-xs">{warning}</p>)}</section>:null}
  </section>;
}
