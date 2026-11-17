import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";

type CommitmentStatus = "pending_approval" | "approved" | "rejected" | "cancelled" | "payment_recorded" | "settled";
type Commitment = {
  id:string; commitment_number:string; category:string; description:string; amount:string; currency:string;
  payment_method:"cash"|"transfer"|"card"|"other"; due_date:string; status:CommitmentStatus;
  created_by_profile_id:string; rejection_reason:string|null; rejected_by_profile_id:string|null;
  payment_cash_expense_id:string|null; journal_entry_id:string|null;
  journal_status:"draft"|"posted"|"void"|null; evidence_count:number;
};
type Account = {id:string;code:string;name:string;account_type:"asset"|"expense"};
type Form = {category:string;description:string;amount:string;currency:string;payment_method:Commitment["payment_method"];reference:string;due_date:string};
const blank=():Form=>({category:"",description:"",amount:"",currency:"YER",payment_method:"transfer",reference:"",due_date:new Date().toISOString().slice(0,10)});
const styles={
  section:{border:"1px solid var(--border,#d7e0e5)",borderRadius:12,padding:14,display:"grid",gap:12,background:"var(--card,#fff)"} as React.CSSProperties,
  field:{width:"100%",boxSizing:"border-box",padding:9,marginTop:5,border:"1px solid var(--border,#d7e0e5)",borderRadius:8,background:"var(--card,#fff)",color:"var(--foreground,#17242a)",font:"inherit"} as React.CSSProperties,
  button:{padding:"8px 11px",border:"1px solid var(--border,#d7e0e5)",borderRadius:8,background:"var(--card,#fff)",color:"var(--foreground,#17242a)",cursor:"pointer",font:"inherit"} as React.CSSProperties,
  primary:{padding:"8px 11px",border:0,borderRadius:8,background:"var(--primary,#155e4a)",color:"#fff",cursor:"pointer",font:"inherit",fontWeight:700} as React.CSSProperties,
  muted:{margin:0,color:"var(--muted-foreground,#65757b)",lineHeight:1.7} as React.CSSProperties,
};
const bucket="cash-expense-commitment-evidence";
const methods={cash:"نقداً",transfer:"تحويل",card:"بطاقة",other:"أخرى"};
const statuses:Record<CommitmentStatus,string>={pending_approval:"بانتظار اعتماد مستقل",approved:"معتمد — التزام مؤرخ",rejected:"مرفوض",cancelled:"ملغى",payment_recorded:"سداد مسجل — ينتظر القيد",settled:"مسوّى بقيد مرحّل"};
function isObject(x:unknown):x is Record<string,unknown>{return typeof x==="object"&&x!==null&&!Array.isArray(x);}
function uuid(){return crypto.randomUUID();}
function validAmount(x:string){return /^\d{1,14}(?:\.\d{1,2})?$/.test(x)&&Number.isFinite(Number(x))&&Number(x)>0;}
function extension(file:File){return file.type==="application/pdf"?"pdf":file.type==="image/jpeg"?"jpg":file.type==="image/png"?"png":file.type==="image/webp"?"webp":null;}
async function digest(file:File){const bytes=await crypto.subtle.digest("SHA-256",await file.arrayBuffer());return Array.from(new Uint8Array(bytes),x=>x.toString(16).padStart(2,"0")).join("");}
function parseItems(value:unknown):Commitment[]{
 if(!isObject(value)||!Array.isArray(value.items))throw new Error("قائمة الالتزامات من الخادم غير صالحة.");
 const ids=new Set<string>();
 return value.items.map((raw)=>{
  if(!isObject(raw)||typeof raw.id!=="string"||typeof raw.commitment_number!=="string"||
   typeof raw.category!=="string"||typeof raw.description!=="string"||
   typeof raw.amount!=="string"||!/^\d+(?:\.\d{2})$/.test(raw.amount)||
   typeof raw.currency!=="string"||!/^[A-Z]{3}$/.test(raw.currency)||
   !["cash","transfer","card","other"].includes(String(raw.payment_method))||
   typeof raw.due_date!=="string"||
   !["pending_approval","approved","rejected","cancelled","payment_recorded","settled"].includes(String(raw.status))||
   typeof raw.created_by_profile_id!=="string"||
   (raw.rejection_reason!==null&&typeof raw.rejection_reason!=="string")||
   (raw.rejected_by_profile_id!==null&&typeof raw.rejected_by_profile_id!=="string")||
   (raw.payment_cash_expense_id!==null&&typeof raw.payment_cash_expense_id!=="string")||
   (raw.journal_entry_id!==null&&typeof raw.journal_entry_id!=="string")||
   (raw.journal_status!==null&&!["draft","posted","void"].includes(String(raw.journal_status)))||
   typeof raw.evidence_count!=="number"||!Number.isSafeInteger(raw.evidence_count)||raw.evidence_count<0)
   throw new Error("تعذر التحقق من بيانات التزام أو قيده المرتبط.");
  if(ids.has(raw.id))throw new Error("تكرر معرّف التزام في استجابة الخادم.");ids.add(raw.id);
  return {id:raw.id,commitment_number:raw.commitment_number,category:raw.category,description:raw.description,
   amount:raw.amount,currency:raw.currency,payment_method:raw.payment_method as Commitment["payment_method"],
   due_date:raw.due_date,status:raw.status as CommitmentStatus,created_by_profile_id:raw.created_by_profile_id,
   rejection_reason:raw.rejection_reason as string|null,rejected_by_profile_id:raw.rejected_by_profile_id as string|null,
   payment_cash_expense_id:raw.payment_cash_expense_id as string|null,journal_entry_id:raw.journal_entry_id as string|null,
   journal_status:raw.journal_status as Commitment["journal_status"],evidence_count:raw.evidence_count};
 });
}
export function CashExpenseCommitmentWorkspace({onRefresh}:{onRefresh?:()=>Promise<void>}){
 const {user,ready,sessionRevision}=useAuth();
 const canManage=Boolean(user?.roles.some(x=>["admin","manager","accountant"].includes(x)));
 const canReview=Boolean(user?.roles.some(x=>x==="admin"||x==="manager"));
 const [form,setForm]=useState<Form>(blank),[file,setFile]=useState<File|null>(null);
 const [items,setItems]=useState<Commitment[]>([]),[accounts,setAccounts]=useState<Account[]>([]);
 const [expenseAccount,setExpenseAccount]=useState(""),[settlementAccount,setSettlementAccount]=useState("");
 const [loading,setLoading]=useState(false),[saving,setSaving]=useState(false),[busy,setBusy]=useState<string|null>(null);
 const [error,setError]=useState(""),[notice,setNotice]=useState("");
 const generation=useRef(0),createKey=useRef<{fingerprint:string;key:string}|null>(null),keys=useRef(new Map<string,{fingerprint:string;key:string}>());
 const load=useCallback(async()=>{
  const current=++generation.current;
  if(!ready||!canManage){setItems([]);setAccounts([]);setLoading(false);return;}
  setLoading(true);setError("");setAccountLoadError("");setEvidenceLoadError("");
  try{
   const [rows,accountRows]=await Promise.all([
    supabase.rpc("fetch_cash_expense_commitments",{p_limit:100,p_offset:0}),
    supabase.rpc("fetch_general_ledger",{p_from:null,p_to:null,p_account_id:null,p_limit:1,p_offset:0}),
   ]);
   if(rows.error)throw rows.error;
   const parsed=parseItems(rows.data);
   if(!isObject(accountRows.data)||!Array.isArray(accountRows.data.accounts))
    throw new Error("تعذر التحقق من إسقاط الحسابات المعتمد في دفتر الأستاذ.");
   const found:Account[]=[],seen=new Set<string>();
   for(const raw of accountRows.data.accounts)if(raw&&isObject(raw)&&typeof raw.id==="string"&&
    typeof raw.code==="string"&&typeof raw.name==="string"&&raw.is_active===true&&
    (raw.account_type==="asset"||raw.account_type==="expense")){
     if(seen.has(raw.id))throw new Error("أعاد دفتر الأستاذ حساباً مكرراً.");
     seen.add(raw.id);found.push({id:raw.id,code:raw.code,name:raw.name,account_type:raw.account_type});
    }
   if(current!==generation.current)return;
   setItems(parsed);setAccounts(found);
   setExpenseAccount(x=>found.some(a=>a.id===x&&a.account_type==="expense")?x:found.find(a=>a.account_type==="expense")?.id||"");
   setSettlementAccount(x=>found.some(a=>a.id===x&&a.account_type==="asset")?x:found.find(a=>a.id===x&&a.account_type==="asset")?.id||"");
  }catch(e){if(current===generation.current){setItems([]);setError(e instanceof Error?e.message:"تعذر تحميل الالتزامات.");}}
  finally{if(current===generation.current)setLoading(false);}
 },[ready,canManage,user?.id,user?.profileId,sessionRevision]);
 useEffect(()=>{void load();return()=>{generation.current++;};},[load]);
 useEffect(()=>{setSignedUrls({});},[sessionRevision,user?.profileId]);
 function idempotencyKey(name:string,id:string,payload:unknown){
  const fingerprint=JSON.stringify(payload),key=name+":"+id,old=keys.current.get(key);
  if(!old||old.fingerprint!==fingerprint){const next={fingerprint,key:uuid()};keys.current.set(key,next);return next.key;}
  return old.key;
 }
 async function uploadEvidence(id:string,selected:File){
  const ext=extension(selected);if(!ext||selected.size<1||selected.size>10485760)throw new Error("المستند PDF/JPG/PNG/WebP حتى 10MB فقط.");
  const path=id+"/"+uuid()+"."+ext,sha=await digest(selected);
  const uploaded=await supabase.storage.from(bucket).upload(path,selected,{contentType:selected.type,upsert:false});
  if(uploaded.error)throw new Error("فشل رفع مستند المصدر إلى Storage الخاص: "+uploaded.error.message);
  const name=selected.name.replace(/[\\\x00-\x1f]/g,"_").slice(0,180)||"supporting-document";
  const result=await supabase.rpc("record_cash_expense_commitment_evidence",{p_commitment_id:id,p_storage_path:path,p_file_name:name,p_mime_type:selected.type,p_byte_size:selected.size,p_content_sha256:sha});
  if(result.error){
   const cleanup=await supabase.storage.from(bucket).remove([path]);
   throw new Error("لم يُسجل الملف كدليل. "+(cleanup.error?"تعذر حذف الملف اليتيم "+path+". ":"أُزيل الملف اليتيم. ")+result.error.message);
  }
 }
 async function submit(event:FormEvent<HTMLFormElement>){
  event.preventDefault();if(saving||!canManage)return;setError("");setNotice("");
  if(!file){setError("مستند المصدر مطلوب قبل إنشاء الالتزام.");return;}
  if(!validAmount(form.amount)){setError("المبلغ موجب وبحد أقصى منزلتين عشريتين.");return;}
  if(form.category.trim().length<2||form.description.trim().length<2||!/^[A-Z]{3}$/.test(form.currency.trim().toUpperCase())||
   !/^\d{4}-\d{2}-\d{2}$/.test(form.due_date)){setError("أكمل التصنيف والوصف والعملة والتاريخ.");return;}
  const payload={...form,category:form.category.trim(),description:form.description.trim(),amount:form.amount.trim(),
   currency:form.currency.trim().toUpperCase(),reference:form.reference.trim()||null};
  const fingerprint=JSON.stringify(payload);
  if(!createKey.current||createKey.current.fingerprint!==fingerprint)createKey.current={fingerprint,key:uuid()};
  setSaving(true);
  try{
   const result=await supabase.rpc("record_cash_expense_commitment",{p_idempotency_key:createKey.current.key,
    p_category:payload.category,p_description:payload.description,p_amount:payload.amount,p_currency:payload.currency,
    p_payment_method:payload.payment_method,p_reference:payload.reference,p_due_date:payload.due_date});
   if(result.error)throw result.error;
   if(!isObject(result.data)||typeof result.data.id!=="string")throw new Error("لم تُرجع قاعدة البيانات مرجع الالتزام؛ راجع السجل قبل الإعادة.");
   await uploadEvidence(result.data.id,file);
   setNotice("حُفظ الالتزام رقم "+String(result.data.commitment_number??"—")+" مع مستند المصدر. ينتظر اعتماداً مستقلاً.");
   createKey.current=null;setForm(blank());setFile(null);await load();
  }catch(e){setError(e instanceof Error?e.message:"تعذر حفظ الالتزام أو مرفقه.");await load();}
  finally{setSaving(false);}
 }
 async function action(name:string,item:Commitment,payload:unknown,rpc:string,args:Record<string,unknown>){
  const key=idempotencyKey(name,item.id,payload);setBusy(item.id+":"+name);setError("");setNotice("");
  try{
   const result=await supabase.rpc(rpc,{...args,p_idempotency_key:key});if(result.error)throw result.error;
   if(!isObject(result.data)||typeof result.data.status!=="string")throw new Error("استجابة العملية غير مكتملة؛ حدّث السجل قبل التكرار.");
   setNotice("تم تحديث الالتزام رقم "+item.commitment_number+": "+result.data.status);await load();if(onRefresh)await onRefresh();
  }catch(e){setError(e instanceof Error?e.message:"تعذر تنفيذ العملية.");}
  finally{setBusy(null);}
 }
 async function approve(item:Commitment){const reason=window.prompt("سبب اعتماد الالتزام والمصدر:", "");if(reason===null)return;
  if(reason.trim().length<3||reason.trim().length>500){setError("سبب الاعتماد 3–500 حرف.");return;}
  await action("approve",item,{reason:reason.trim()},"approve_cash_expense_commitment",{p_commitment_id:item.id,p_reason:reason.trim()});}
 async function reject(item:Commitment){const reason=window.prompt("سبب رفض الالتزام والمستند:", "");if(reason===null)return;
  if(reason.trim().length<3||reason.trim().length>500){setError("سبب الرفض 3–500 حرف.");return;}
  await action("reject",item,{reason:reason.trim()},"reject_cash_expense_commitment",{p_commitment_id:item.id,p_reason:reason.trim()});}
 async function cancel(item:Commitment){const reason=window.prompt("سبب الإلغاء (5 أحرف على الأقل):","");if(reason===null)return;
  if(reason.trim().length<5||reason.trim().length>500){setError("سبب الإلغاء 5–500 حرف.");return;}
  await action("cancel",item,{reason:reason.trim()},"cancel_cash_expense_commitment",{p_commitment_id:item.id,p_reason:reason.trim()});}
 async function pay(item:Commitment){if(item.currency!=="YER"){setError("السداد بعملة أجنبية متوقف إلى اعتماد جدول FX دقيق.");return;}
  const date=new Date().toISOString().slice(0,10);await action("payment",item,{date},"record_cash_expense_commitment_payment",{p_commitment_id:item.id,p_payment_date:date});}
 async function makeJournal(item:Commitment){
  if(!item.payment_cash_expense_id||!expenseAccount||!settlementAccount||expenseAccount===settlementAccount){setError("اختر حساب مصروف وحساب نقد/بنك مختلفين.");return;}
  setBusy(item.id+":journal");try{
   const result=await supabase.rpc("create_cash_expense_journal_draft",{p_expense_id:item.payment_cash_expense_id,
    p_expense_account_id:expenseAccount,p_settlement_account_id:settlementAccount,p_idempotency_key:idempotencyKey("journal",item.id,{expenseAccount,settlementAccount})});
   if(result.error)throw result.error;if(!isObject(result.data)||typeof result.data.journal_entry_id!=="string")throw new Error("لم تعد خدمة القيود رقم القيد.");
   setNotice("أُنشئت مسودة القيد "+String(result.data.journal_entry_number??"")+"؛ تنتظر مراجعاً مستقلاً.");await load();
  }catch(e){setError(e instanceof Error?e.message:"تعذر إنشاء القيد.");}finally{setBusy(null);}
 }
 async function postJournal(item:Commitment){if(!item.journal_entry_id||item.journal_status!=="draft")return;
  setBusy(item.id+":post");try{const r=await supabase.rpc("post_general_journal_entry",{p_entry_id:item.journal_entry_id});
   if(r.error)throw r.error;setNotice("أُرسل الترحيل؛ لا تُسوّى العملية إلا بعد تأكيد القيد من قاعدة البيانات.");await load();if(onRefresh)await onRefresh();
  }catch(e){setError(e instanceof Error?e.message:"تعذر ترحيل القيد.");}finally{setBusy(null);}}
 if(!canManage)return null;
 const expenseAccounts=accounts.filter(a=>a.account_type==="expense"),assetAccounts=accounts.filter(a=>a.account_type==="asset");
 return <section dir="rtl" style={styles.section} aria-labelledby="cash-expense-commitment-title">
  <div><h3 id="cash-expense-commitment-title" style={{margin:0}}>التزامات المصروفات المستقبلية</h3>
   <p style={styles.muted}>مستند مصدر ← اعتماد مستقل ← سداد ← مسودة قيد ← ترحيل مستقل. لا تُعاد تسمية المصروفات التاريخية كالتزامات مستقبلية.</p></div>
  {error?<p role="alert" style={{...styles.muted,color:"#b42318"}}>{error}</p>:null}
  {notice?<p role="status" style={{...styles.muted,color:"var(--primary,#155e4a)"}}>{notice}</p>:null}
  <form onSubmit={e=>void submit(e)} style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(185px,1fr))",gap:9}}>
   <label>التصنيف<input required maxLength={80} style={styles.field} value={form.category} onChange={e=>setForm(x=>({...x,category:e.target.value}))}/></label>
   <label>الوصف<input required maxLength={600} style={styles.field} value={form.description} onChange={e=>setForm(x=>({...x,description:e.target.value}))}/></label>
   <label>المبلغ<input required inputMode="decimal" style={styles.field} value={form.amount} onChange={e=>setForm(x=>({...x,amount:e.target.value}))}/></label>
   <label>العملة<input required maxLength={3} style={styles.field} value={form.currency} onChange={e=>setForm(x=>({...x,currency:e.target.value.toUpperCase()}))}/></label>
   <label>تاريخ الاستحقاق<input required type="date" min={new Date().toISOString().slice(0,10)} style={styles.field} value={form.due_date} onChange={e=>setForm(x=>({...x,due_date:e.target.value}))}/></label>
   <label>طريقة السداد<select style={styles.field} value={form.payment_method} onChange={e=>setForm(x=>({...x,payment_method:e.target.value as Form["payment_method"]}))}>{Object.entries(methods).map(([k,v])=><option value={k} key={k}>{v}</option>)}</select></label>
   <label>مرجع المصدر<input maxLength={200} style={styles.field} value={form.reference} onChange={e=>setForm(x=>({...x,reference:e.target.value}))}/></label>
   <label style={{gridColumn:"1 / -1"}}>مستند المصدر (PDF/JPG/PNG/WebP حتى 10MB)<input required type="file" accept="application/pdf,image/jpeg,image/png,image/webp" style={styles.field} onChange={e=>setFile(e.target.files?.[0]??null)}/></label>
   <div style={{gridColumn:"1 / -1"}}><button type="submit" style={styles.primary} disabled={saving||loading||!file}>{saving?"جارٍ الحفظ…":"إنشاء التزام وإرفاق مستنده"}</button>
    <p style={styles.muted}>الحفظ بدقة منزلتين؛ لا يوجد تحويل عملات تلقائي.</p></div>
  </form>
  <div style={{borderTop:"1px solid var(--border,#d7e0e5)",paddingTop:10,display:"grid",gap:10}}>
   <div style={{display:"flex",justifyContent:"space-between",gap:8}}><strong>الالتزامات المحفوظة ({items.length})</strong><button style={styles.button} disabled={loading} onClick={()=>void load()}>تحديث</button></div>
   {loading?<p role="status" style={styles.muted}>جارٍ التحديث من قاعدة البيانات…</p>:null}
   {!items.length&&!loading?<p style={styles.muted}>لا توجد التزامات مسجلة.</p>:null}
   {items.map(item=>{const isCreator=user?.profileId===item.created_by_profile_id,working=busy?.startsWith(item.id+":")??false;
    return <article key={item.id} style={{border:"1px solid var(--border,#d7e0e5)",borderRadius:9,padding:11,display:"grid",gap:8}}>
     <div style={{display:"flex",justifyContent:"space-between",gap:8,flexWrap:"wrap"}}><div><strong>#{item.commitment_number} — {item.category}</strong><p style={styles.muted}>{item.description}</p></div>
      <strong>{(() => { const [whole,fraction="00"]=item.amount.split("."); return BigInt(whole).toLocaleString("ar-YE")+"."+fraction.padEnd(2,"0")+" "+item.currency; })()}<small style={{display:"block",fontWeight:400}}>الاستحقاق: {item.due_date}</small></strong></div>
     <p style={styles.muted}>{statuses[item.status]} · مرفقات: {item.evidence_count} · القيد: {item.journal_status??"غير منشأ"}</p>
     {item.status==="rejected"?<p style={styles.muted}>سبب الرفض: {item.rejection_reason??"مسجل في سجل التدقيق."}</p>:null}
     <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
      {canReview&&item.status==="pending_approval"&&!isCreator?<button style={styles.primary} disabled={working||item.evidence_count===0} onClick={()=>void approve(item)}>اعتماد مستقل مع السبب</button>:null}
      {canReview&&item.status==="pending_approval"&&!isCreator?<button style={styles.button} disabled={working||item.evidence_count===0} onClick={()=>void reject(item)}>رفض مع حفظ السبب</button>:null}
      {canReview&&["pending_approval","approved"].includes(item.status)?<button style={styles.button} disabled={working} onClick={()=>void cancel(item)}>إلغاء مع السبب</button>:null}
      {item.status==="approved"&&item.currency==="YER"?<button style={styles.button} disabled={working} onClick={()=>void pay(item)}>تسجيل السداد الفعلي</button>:null}
      {item.status==="approved"&&item.currency!=="YER"?<span style={styles.muted}>السداد الأجنبي متوقف حتى اعتماد FX.</span>:null}
      {item.status==="payment_recorded"&&!item.journal_entry_id?<><select style={styles.field} value={expenseAccount} onChange={e=>setExpenseAccount(e.target.value)}><option value="">حساب المصروف</option>{expenseAccounts.map(a=><option key={a.id} value={a.id}>{a.code} — {a.name}</option>)}</select>
       <select style={styles.field} value={settlementAccount} onChange={e=>setSettlementAccount(e.target.value)}><option value="">حساب النقد/البنك</option>{assetAccounts.map(a=><option key={a.id} value={a.id}>{a.code} — {a.name}</option>)}</select>
       <button style={styles.primary} disabled={working||!expenseAccount||!settlementAccount} onClick={()=>void makeJournal(item)}>إنشاء مسودة القيد</button></>:null}
      {item.status==="payment_recorded"&&item.journal_status==="draft"?<button style={styles.primary} disabled={working} onClick={()=>void postJournal(item)}>ترحيل القيد كمراجع مستقل</button>:null}
      {item.status==="settled"?<span style={styles.muted}>تمت التسوية بقيد محاسبي مرحّل.</span>:null}
     </div>
    </article>;
   })}
  </div>
 </section>;
}
