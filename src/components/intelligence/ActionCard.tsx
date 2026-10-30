import type {DecisionCandidate} from "@/lib/intelligence/types";
export type ActionCardState="loading"|"empty"|"error"|"unavailable"|"ready";
export interface ActionCardProps {
 decision?:DecisionCandidate|null;state?:ActionCardState;errorMessage?:string;ctaLabel?:string;
 onRetry?:()=>void;onContinue?:(decision:DecisionCandidate)=>void;onOpenEvidence?:(decision:DecisionCandidate)=>void;
}
const labels:Record<DecisionCandidate["priority"],string>={P0:"حرج",P1:"مرتفع",P2:"متوسط",P3:"منخفض"};
export function ActionCard({decision,state="ready",errorMessage="تعذر تحميل القرار.",ctaLabel="متابعة الإجراء",onRetry,onContinue,onOpenEvidence}:ActionCardProps) {
 if(state==="loading")return <div role="status" dir="rtl" className="rounded-xl border p-4 text-sm">جارٍ تحميل القرار والأدلة…</div>;
 if(state==="empty")return <div role="status" dir="rtl" className="rounded-xl border p-4 text-sm">لا توجد قرارات مستحقة وفق المؤشرات المثبتة.</div>;
 if(state==="unavailable")return <div role="note" dir="rtl" className="rounded-xl border p-4 text-sm">مصادر القرار غير متاحة. لم يتم إنشاء بيانات بديلة.</div>;
 if(state==="error")return <div role="alert" dir="rtl" className="rounded-xl border p-4 text-sm"><p>{errorMessage}</p>{onRetry?<button type="button" className="mt-3 rounded-lg border px-3 py-2" onClick={onRetry}>إعادة المحاولة</button>:null}</div>;
 if(!decision)return <div role="status" dir="rtl" className="rounded-xl border p-4 text-sm">لا توجد بطاقة قرار لعرضها.</div>;
 const impact=decision.impact?String(decision.impact.value)+" "+decision.impact.unit+(decision.impact.currency?" "+decision.impact.currency:""):decision.impactReason==="NO_APPROVED_IMPACT_FORMULA"?"لم تُهيأ معادلة أثر معتمدة":"الأثر غير متاح؛ لم تثبت معادلته أو مدخلاته";
 return <article dir="rtl" className="rounded-xl border bg-card p-4 text-card-foreground shadow-sm">
  <header className="flex flex-wrap items-center justify-between gap-2"><span className="text-xs font-semibold">{labels[decision.priority]} · {decision.priority}</span><span className="text-xs text-muted-foreground">المالك: {decision.owner}</span></header>
  <section className="mt-3 space-y-2"><h3 className="text-base font-semibold">{decision.what}</h3><p className="text-sm"><strong>WHY:</strong> {decision.why}</p><p className="text-sm"><strong>SO WHAT:</strong> {decision.soWhat}</p><p className="text-sm"><strong>IMPACT:</strong> {impact}</p><p className="text-sm"><strong>WHAT NEXT:</strong> {decision.whatNext}</p><p className="text-sm"><strong>EXPECTED OUTCOME:</strong> {decision.expectedOutcome}</p></section>
  <section aria-label="PROOF" className="mt-3 space-y-1 rounded-lg border p-3 text-xs"><strong>PROOF:</strong><p>Evidence IDs: {decision.proof.evidenceIds.join("، ")||"لا توجد مراجع إثبات"}</p><p>As of: {decision.proof.asOf}</p><p>Formula versions: {decision.proof.formulaVersions.join("، ")||"غير محددة"}</p><p>Metric keys: {decision.proof.metricKeys.join("، ")||"غير محددة"}</p></section>
  <footer className="mt-4 flex flex-wrap items-center gap-2 border-t pt-3 text-xs"><span>الاحتساب: {decision.createdAt}</span><span>الانتهاء: {decision.expiresAt??"غير محدد"}</span><span>الأدلة: {decision.proof.evidenceIds.length}</span>{onOpenEvidence?<button type="button" className="rounded-lg border px-3 py-2" onClick={()=>onOpenEvidence(decision)}>عرض الإثبات</button>:null}{onContinue?<button type="button" className="rounded-lg bg-primary px-3 py-2 text-primary-foreground" onClick={()=>onContinue(decision)}>{ctaLabel}</button>:null}</footer>
 </article>;
}
