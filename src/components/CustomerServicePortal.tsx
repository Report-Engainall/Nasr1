import { useCallback,useEffect,useRef,useState,type FormEvent } from "react";
import { AlertCircle,CheckCircle2,Clock3,Headphones,MessageCircle,Plus,RefreshCw,Send,ShieldCheck } from "lucide-react";
import { Login } from "@/components/Login";
import { useAuth } from "@/lib/auth";
import { addMyCustomerServiceCaseMessage,createMyCustomerServiceCase,fetchMyCustomerServiceCases,fetchMyCustomerServicePortalContext,newCustomerServicePortalRequestKey,type CustomerServicePortalCase,type CustomerServicePortalMessage } from "@/lib/customer-service-portal";
import type { CustomerServiceCasePriority,CustomerServiceCaseType } from "@/lib/customer-service-cases";

const types:Record<CustomerServiceCaseType,string>={complaint:"شكوى",inquiry:"استفسار",service_request:"طلب خدمة",delivery_issue:"مشكلة تسليم",other:"أخرى"};
const priorities:Record<CustomerServiceCasePriority,string>={low:"منخفضة",medium:"متوسطة",high:"عالية",urgent:"عاجلة"};
const statuses:Record<string,string>={open:"مفتوحة",in_progress:"قيد المعالجة",waiting_customer:"بانتظار ردك",resolved:"تم الحل",closed:"مغلقة"};
const initialDraft={caseType:"inquiry" as CustomerServiceCaseType,priority:"medium" as CustomerServiceCasePriority,subject:"",description:""};
const dateLabel=(value:string|null)=>{if(!value)return"لم تسجل بعد";const date=new Date(value);return Number.isFinite(date.getTime())?new Intl.DateTimeFormat("ar-YE",{dateStyle:"medium",timeStyle:"short"}).format(date):"غير محدد";};
const active=(status:string)=>status!=="resolved"&&status!=="closed";

function PortalMessage({message}:{message:CustomerServicePortalMessage}){
 return <li className={"customer-service-portal-message "+(message.authorSide==="customer"?"from-customer":"from-staff")}>
  <div><strong>{message.authorSide==="staff"?"فريق الأغبري":message.authorName}</strong><time dateTime={message.createdAt}>{dateLabel(message.createdAt)}</time></div><p>{message.message}</p>
 </li>;
}
function PortalCaseCard({item,canReply,onReply}:{item:CustomerServicePortalCase;canReply:boolean;onReply:(id:string,message:string)=>Promise<void>}){
 const[draft,setDraft]=useState(""),[sending,setSending]=useState(false),[error,setError]=useState("");
 const allowed=canReply&&item.canReply&&active(item.status);
 async function submit(event:FormEvent<HTMLFormElement>){event.preventDefault();const body=draft.trim();if(!body||sending||!allowed)return;setSending(true);setError("");try{await onReply(item.id,body);setDraft("");}catch(e){setError(e instanceof Error?e.message:"تعذر إرسال الرد.");}finally{setSending(false);}}
 return <article className="customer-service-portal-case">
  <header className="customer-service-portal-case-head"><div><span className="customer-service-portal-code">{item.caseCode}</span><h2>{item.subject}</h2><p>{types[item.caseType]} · {priorities[item.priority]} · آخر تحديث {dateLabel(item.updatedAt)}</p></div><span className={"customer-service-portal-status status-"+item.status}>{statuses[item.status]||item.status}</span></header>
  <p className="customer-service-portal-description">{item.description}</p>
  <div className="customer-service-portal-dates">
   <div><span><Clock3 size={13}/> موعد الاستجابة</span><strong>{dateLabel(item.responseDueAt)}</strong><small>{item.firstResponseAt?"تم تسجيل أول استجابة":"بانتظار أول استجابة من الفريق"}</small></div>
   <div><span><CheckCircle2 size={13}/> الموعد المستهدف للحل</span><strong>{dateLabel(item.resolutionDueAt)}</strong><small>{item.resolvedAt?"تم الحل في "+dateLabel(item.resolvedAt):active(item.status)?"الحالة قيد المتابعة":"انتهت المعالجة"}</small></div>
  </div>
  <details className="customer-service-portal-thread" open={item.messages.length>0}><summary><MessageCircle size={15}/> المحادثة مع فريق الأغبري ({item.messages.length})</summary>
   {item.messages.length?<ol className="customer-service-portal-messages">{item.messages.map(m=><PortalMessage key={m.id} message={m}/>)}</ol>:<p className="customer-service-portal-muted">سيظهر رد الفريق هنا عند إضافته.</p>}
  </details>
  {allowed?<form className="customer-service-portal-reply" onSubmit={e=>{void submit(e);}}><label htmlFor={"portal-reply-"+item.id}>إضافة رد أو معلومات للحالة</label><textarea id={"portal-reply-"+item.id} value={draft} maxLength={2000} rows={2} disabled={sending} onChange={e=>setDraft(e.target.value)} placeholder="اكتب ردك هنا (حتى 2000 حرف)..."/><button className="btn primary" type="submit" disabled={sending||!draft.trim()}><Send size={14}/>{sending?"جار الإرسال...":"إرسال الرد"}</button>{error&&<p role="alert" className="customer-service-portal-error">{error}</p>}</form>:<p className="customer-service-portal-muted">هذه الحالة للعرض فقط. لطلب متابعة جديدة، افتح حالة خدمة جديدة.</p>}
 </article>;
}

function Workspace(){
 const[company,setCompany]=useState(""),[canCreate,setCanCreate]=useState(false),[canReply,setCanReply]=useState(false),[cases,setCases]=useState<CustomerServicePortalCase[]>([]);
 const[loading,setLoading]=useState(true),[saving,setSaving]=useState(false),[error,setError]=useState(""),[notice,setNotice]=useState("");
 const[draft,setDraft]=useState(initialDraft),[requestKey,setRequestKey]=useState(()=>newCustomerServicePortalRequestKey());
 const requestId=useRef(0);
 const load=useCallback(async()=>{const id=++requestId.current;setLoading(true);setError("");try{const ctx=await fetchMyCustomerServicePortalContext();if(!ctx.canRead)throw new Error("لا تملك صلاحية الاطلاع على حالات خدمة هذه الشركة.");const rows=await fetchMyCustomerServiceCases(50);if(id!==requestId.current)return;setCompany(ctx.companyName);setCanCreate(ctx.canCreate);setCanReply(ctx.canReply);setCases(rows);}catch(cause){if(id===requestId.current){setCases([]);setError(cause instanceof Error?cause.message:"تعذر تحميل بوابة خدمة العملاء.");}}finally{if(id===requestId.current)setLoading(false);}},[]);
 useEffect(()=>{void load();return()=>{requestId.current++;};},[load]);
 function change<K extends keyof typeof initialDraft>(key:K,value:(typeof initialDraft)[K]){setDraft(d=>({...d,[key]:value}));setRequestKey(newCustomerServicePortalRequestKey());}
 async function create(event:FormEvent<HTMLFormElement>){event.preventDefault();if(!canCreate||!draft.subject.trim()||!draft.description.trim())return;setSaving(true);setError("");setNotice("");try{const result=await createMyCustomerServiceCase({idempotencyKey:requestKey,...draft});setDraft(initialDraft);setRequestKey(newCustomerServicePortalRequestKey());setNotice("تم فتح الحالة "+result.caseCode+". سيظهر رد الفريق في محادثتها.");await load();}catch(cause){setError(cause instanceof Error?cause.message:"تعذر فتح الحالة.");}finally{setSaving(false);}}
 async function reply(id:string,message:string){await addMyCustomerServiceCaseMessage(id,message);setNotice("تم إرسال ردك وإضافته إلى محادثة الحالة.");await load();}
 return <main className="customer-service-portal" dir="rtl">
  <header className="customer-service-portal-hero"><div><span><Headphones size={16}/> خدمة العملاء</span><h1>مركز خدمة العملاء</h1><p>{company?"حالات ومراسلات "+company:"تابع حالات الخدمة وتواصل مع فريق الأغبري."}</p></div><button type="button" className="btn secondary" disabled={loading} onClick={()=>{void load();}}><RefreshCw size={15}/> تحديث الحالات</button></header>
  {notice&&<p className="customer-service-portal-notice" role="status"><CheckCircle2 size={15}/>{notice}</p>}{error&&<div className="customer-service-portal-error" role="alert"><AlertCircle size={16}/>{error}</div>}
  {canCreate&&<section className="customer-service-portal-create"><div className="customer-service-portal-section-heading"><div><h2><Plus size={17}/> فتح حالة خدمة جديدة</h2><p>حدد نوع الطلب واكتب التفاصيل التي يحتاجها فريق المعالجة.</p></div><ShieldCheck size={21}/></div>
   <form onSubmit={e=>{void create(e);}}><div className="customer-service-portal-form-grid">
    <label>نوع الحالة<select value={draft.caseType} disabled={saving} onChange={e=>change("caseType",e.target.value as CustomerServiceCaseType)}>{Object.entries(types).map(([v,l])=><option key={v} value={v}>{l}</option>)}</select></label>
    <label>الأولوية<select value={draft.priority} disabled={saving} onChange={e=>change("priority",e.target.value as CustomerServiceCasePriority)}>{Object.entries(priorities).map(([v,l])=><option key={v} value={v}>{l}</option>)}</select></label>
    <label className="wide">موضوع الحالة<input value={draft.subject} maxLength={200} required disabled={saving} onChange={e=>change("subject",e.target.value)} placeholder="مثال: استفسار عن طلب أو مشكلة في التسليم"/></label>
    <label className="wide">التفاصيل<textarea value={draft.description} maxLength={4000} required rows={4} disabled={saving} onChange={e=>change("description",e.target.value)} placeholder="اشرح المشكلة أو الخدمة المطلوبة..."/></label>
   </div><div className="customer-service-portal-form-footer"><small>رقم مستقل للحالة ومسار متابعة واحد لدى فريق الخدمة.</small><button type="submit" className="btn primary" disabled={saving||!draft.subject.trim()||!draft.description.trim()}><Plus size={15}/>{saving?"جار فتح الحالة...":"فتح الحالة"}</button></div></form>
  </section>}
  {!canCreate&&canReply&&<p className="customer-service-portal-readonly">يمكنك متابعة الحالات والرد عليها؛ فتح حالة جديدة متاح لمسؤول المشتريات المخول.</p>}
  {!canReply&&!canCreate&&<p className="customer-service-portal-readonly">حسابك يملك صلاحية الاطلاع فقط؛ يمكن للمشتري المخول فتح الحالات والرد عليها.</p>}
  <section className="customer-service-portal-list-section"><div className="customer-service-portal-section-heading"><div><h2><MessageCircle size={17}/> حالات شركتك</h2><p>المراسلات العامة الخاصة بشركتك فقط.</p></div><span>{cases.length.toLocaleString("ar-YE")} / 50</span></div>
   {loading?<p className="customer-service-portal-empty" role="status">جار تحميل حالات الخدمة...</p>:cases.length===0?<div className="customer-service-portal-empty">لا توجد حالات خدمة مسجلة لهذه الشركة حتى الآن.</div>:<div className="customer-service-portal-cases">{cases.map(item=><PortalCaseCard key={item.id} item={item} canReply={canReply} onReply={reply}/>)}</div>}
   <p className="customer-service-portal-footnote">تعرض أحدث 50 حالة. الملاحظات الداخلية والتصعيد والإسناد ومعلومات الحساب المالية غير متاحة من بوابة العميل.</p>
  </section>
 </main>;
}

export function CustomerServicePortal(){
 const{user,ready}=useAuth();
 if(!ready)return <main className="customer-service-portal" dir="rtl"><p role="status">جار التحقق من الحساب...</p></main>;
 if(!user)return <Login/>;
 if(user.isStaff||!user.roles.includes("customer"))return <main className="customer-service-portal" dir="rtl"><section className="customer-service-portal-empty"><AlertCircle size={22}/><h1>بوابة العملاء</h1><p>هذه الصفحة مخصصة لحسابات العملاء. استخدم مساحة الإدارة لمتابعة الحالات والردود.</p><a href="/admin/service-desk" className="btn primary">فتح مكتب خدمة العملاء</a></section></main>;
 return <Workspace/>;
}
