import type {EvidencePassport as PassportData,EvidenceStatus,MetricSnapshot} from "@/lib/intelligence/types";
export type EvidencePassportState="loading"|"empty"|"error"|"unavailable"|"ready";
export interface EvidencePassportProps {passport?:PassportData|null;state?:EvidencePassportState;errorMessage?:string;onRetry?:()=>void}
const labels:Record<EvidenceStatus,string>={VERIFIED:"مثبت",NEEDS_REVIEW:"يحتاج مراجعة",UNVERIFIED:"غير مثبت",UNAVAILABLE:"غير متاح"};
const display=(m:MetricSnapshot)=>m.value===null?"غير متاح":String(m.value)+(m.unit==="CURRENCY"?" "+(m.currency??"عملة غير محددة"):" "+m.unit);
export function EvidencePassport({passport,state="ready",errorMessage="تعذر تحميل سجل الأدلة.",onRetry}:EvidencePassportProps) {
 if(state==="loading")return <section role="status" dir="rtl" className="rounded-xl border p-4 text-sm">جارٍ تحميل سجل الأدلة…</section>;
 if(state==="empty")return <section role="status" dir="rtl" className="rounded-xl border p-4 text-sm">لا توجد مؤشرات أو أدلة للفترة المحددة.</section>;
 if(state==="unavailable")return <section role="note" dir="rtl" className="rounded-xl border p-4 text-sm">مصدر الأدلة غير متاح. لم تُعرض بيانات بديلة.</section>;
 if(state==="error")return <section role="alert" dir="rtl" className="rounded-xl border p-4 text-sm"><p>{errorMessage}</p>{onRetry?<button type="button" className="mt-3 rounded-lg border px-3 py-2" onClick={onRetry}>إعادة المحاولة</button>:null}</section>;
 if(!passport)return <section role="status" dir="rtl" className="rounded-xl border p-4 text-sm">سجل الأدلة غير متوفر.</section>;
 return <section dir="rtl" className="rounded-xl border p-4 text-card-foreground"><header className="flex flex-wrap justify-between gap-2"><h3 className="font-semibold">جواز الأدلة</h3><span className="text-xs">الحالة: {labels[passport.status]}</span></header><p className="mt-1 text-xs text-muted-foreground">As of: {passport.asOf} · الاكتمال: {passport.completeness}</p>
  <div className="mt-3 space-y-3">{passport.metrics.map(m=><article key={m.id} className="rounded-lg border p-3"><div className="flex flex-wrap justify-between gap-2"><strong className="text-sm">{m.key}</strong><span className="text-xs">{labels[m.status]}</span></div><p className="mt-1 text-sm">{display(m)}</p><p className="mt-1 text-xs text-muted-foreground">المصدر: {m.lineage.evidenceIds.join("، ")||"لا يوجد مصدر"} · المعادلة: {m.lineage.formulaId||"غير محددة"} / {m.lineage.formulaVersion||"غير محدد"}</p>{m.warnings.length?<p className="mt-1 text-xs">تحذيرات: {m.warnings.join("، ")}</p>:null}</article>)}</div>
  {passport.evidenceRecords.length?<div className="mt-4 border-t pt-3"><h4 className="text-sm font-semibold">المصادر</h4><ul className="mt-2 space-y-1 text-xs">{passport.evidenceRecords.map(e=><li key={e.id}>{e.source.name} · {labels[e.status]} · {e.sourceTimestamp}</li>)}</ul></div>:null}
 </section>;
}
