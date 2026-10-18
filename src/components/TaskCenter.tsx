import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import {
  AlertTriangle, CalendarClock, CheckCircle2, ClipboardList, Clock3, Filter,
  ListTodo, Play, Plus, Printer, RefreshCw, Search, UserCheck, X,
} from 'lucide-react';
import { createOperationalTask, fetchOperationalTasks, refreshOperationalTasks, setOperationalTaskStatus } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import type { OperationalTask, OperationalTaskRole, OperationalTaskStatus } from '@/lib/types';

const roleLabels: Record<OperationalTaskRole, string> = {
  sales: 'المبيعات', accountant: 'المحاسبة والتحصيل', warehouse: 'أمين المخزن',
  purchasing: 'مدير المشتريات', management: 'الإدارة', operations: 'العمليات والبيانات',
};
const statusLabels: Record<string, string> = { pending: 'بانتظار التنفيذ', in_progress: 'قيد التنفيذ', completed: 'مكتملة', cancelled: 'ملغاة' };
const priorityLabels: Record<string, string> = { low: 'منخفضة', medium: 'متوسطة', high: 'مرتفعة', critical: 'حرجة' };
const entityLabels: Record<string, string> = {
  orders: 'طلب', customer_invoices: 'فاتورة', inventory_balances: 'رصيد مخزون',
  sales_quotes: 'عرض سعر', import_jobs: 'عملية استيراد',
};

function dateText(value: string | null | undefined): string {
  if (!value) return 'غير محدد في المصدر';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'تاريخ غير صالح' :
    date.toLocaleString('ar-YE', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}
function isLate(task: OperationalTask): boolean {
  return Boolean(task.due_at && new Date(task.due_at).getTime() < Date.now() && !['completed','cancelled'].includes(task.status));
}
function roleOptionsFor(roles: string[]): OperationalTaskRole[] {
  if (roles.includes('admin') || roles.includes('manager')) return ['sales','accountant','warehouse','purchasing','management','operations'];
  if (roles.includes('accountant') && !roles.some((role) => ['staff'].includes(role))) return ['accountant'];
  return ['sales','warehouse','purchasing','operations'];
}

export function TaskCenter({ onNotice }: { onNotice: (message: string) => void }) {
  const { user } = useAuth();
  const roles = user?.roles ?? [];
  const canManage = roles.includes('admin') || roles.includes('manager');
  const allowedRoles = roleOptionsFor(roles);
  const financeOnly = roles.includes('accountant') && !roles.some((role) => ['admin','manager','staff'].includes(role));
  const [tasks, setTasks] = useState<OperationalTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [roleFilter, setRoleFilter] = useState<OperationalTaskRole | 'all'>(financeOnly ? 'accountant' : 'all');
  const [statusFilter, setStatusFilter] = useState<'open' | 'all' | OperationalTaskStatus>('open');
  const [search, setSearch] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [newRole, setNewRole] = useState<OperationalTaskRole>(canManage ? 'sales' : (allowedRoles[0] ?? 'operations'));
  const [priority, setPriority] = useState<'low' | 'medium' | 'high' | 'critical'>('medium');
  const [dueAt, setDueAt] = useState('');

  const loadTasks = useCallback(async () => {
    setLoading(true); setError('');
    try { setTasks(await fetchOperationalTasks()); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'تعذر تحميل مهام التشغيل.'); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void loadTasks(); }, [loadTasks]);

  const filtered = useMemo(() => tasks.filter((task) => {
    if (roleFilter !== 'all' && task.task_role !== roleFilter) return false;
    if (statusFilter === 'open' && ['completed','cancelled'].includes(task.status)) return false;
    if (statusFilter !== 'all' && statusFilter !== 'open' && task.status !== statusFilter) return false;
    const needle = search.trim().toLocaleLowerCase();
    if (needle && ![task.title,task.description ?? '',task.source_entity_id ?? '',task.resolution_note ?? '']
      .some((value) => value.toLocaleLowerCase().includes(needle))) return false;
    return true;
  }), [tasks,roleFilter,statusFilter,search]);

  const openCount = tasks.filter((task) => !['completed','cancelled'].includes(task.status)).length;
  const lateCount = tasks.filter(isLate).length;
  const completedCount = tasks.filter((task) => task.status === 'completed').length;

  async function performStatus(task: OperationalTask, status: OperationalTaskStatus) {
    setBusy(true); setError('');
    try {
      await setOperationalTaskStatus(task.id,status,status==='completed'?'اكتمل التنفيذ من مركز المهام.':undefined);
      onNotice(status==='completed'?'تم إغلاق المهمة وتسجيل أثر التنفيذ.':status==='in_progress'?'تم استلام المهمة وتعيينها للمستخدم الحالي.':'تم تحديث حالة المهمة.');
      await loadTasks();
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : 'تعذر تحديث المهمة.';
      setError(message); onNotice(message);
    } finally { setBusy(false); }
  }

  async function refreshFromSources() {
    setBusy(true); setError('');
    try {
      const result = await refreshOperationalTasks(); await loadTasks();
      onNotice('اكتملت مصالحة المهام مع '+result.source_records_refreshed.toLocaleString('ar-YE')+' سجل مصدر؛ بصمة الحدث تمنع التكرار.');
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : 'تعذر مزامنة المهام.';
      setError(message); onNotice(message);
    } finally { setBusy(false); }
  }

  async function submitTask(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!title.trim()) return;
    setBusy(true); setError('');
    try {
      await createOperationalTask({ title,description,taskRole:newRole,priority,dueAt:dueAt?new Date(dueAt).toISOString():null });
      setTitle(''); setDescription(''); setDueAt(''); setShowCreate(false);
      await loadTasks(); onNotice('حُفظت المهمة الجديدة مع سجل تدقيق.');
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : 'تعذر إنشاء المهمة.';
      setError(message); onNotice(message);
    } finally { setBusy(false); }
  }

  return <section className="task-center" dir="rtl">
    <div className="task-center-hero">
      <div><span className="task-center-eyebrow"><ClipboardList size={15} /> متابعة التنفيذ</span>
        <h1>مركز المهام التشغيلية</h1>
        <p>مهام ناتجة من الطلبات والمخزون والفواتير وعروض الأسعار والاستيراد المحفوظة فعليًا، مع تسجيل الإنجاز والطباعة حسب الدور.</p>
      </div>
      <div className="task-center-toolbar">
        <button className="btn secondary" type="button" onClick={() => void loadTasks()} disabled={busy}><RefreshCw size={16} /> تحديث</button>
        {canManage && <button className="btn secondary" type="button" onClick={() => void refreshFromSources()} disabled={busy}><RefreshCw size={16} /> مصالحة مع حركة النظام</button>}
        {canManage && <button className="btn primary" type="button" onClick={() => setShowCreate((visible) => !visible)}><Plus size={16} /> مهمة يدوية</button>}
        <button className="btn primary" type="button" onClick={() => window.print()} disabled={filtered.length===0}><Printer size={16} /> طباعة المهام المعروضة</button>
      </div>
    </div>
    <div className="task-center-metrics">
      <article><span><ListTodo size={19} /> المهام المفتوحة</span><strong>{openCount.toLocaleString('ar-YE')}</strong></article>
      <article><span><AlertTriangle size={19} /> متأخرة حسب موعد المصدر</span><strong>{lateCount.toLocaleString('ar-YE')}</strong></article>
      <article><span><CheckCircle2 size={19} /> مكتملة</span><strong>{completedCount.toLocaleString('ar-YE')}</strong></article>
      <article><span><ClipboardList size={19} /> النتائج الحالية</span><strong>{filtered.length.toLocaleString('ar-YE')}</strong></article>
    </div>
    {showCreate && canManage && <form className="panel task-create-form" onSubmit={(event) => void submitTask(event)}>
      <div className="panel-head"><div><h2>إسناد مهمة جديدة</h2><p>تُحفظ حسب الدور وتظهر في قائمته مع تدقيق الإنشاء.</p></div><button type="button" className="btn ghost" aria-label="إغلاق نموذج المهمة" onClick={() => setShowCreate(false)}><X size={16} /></button></div>
      <label>عنوان المهمة<input required maxLength={240} value={title} onChange={(event) => setTitle(event.target.value)} placeholder="اكتب الإجراء المطلوب" /></label>
      <label>التفاصيل<textarea maxLength={2000} rows={3} value={description} onChange={(event) => setDescription(event.target.value)} placeholder="الإجراء أو المرجع التشغيلي" /></label>
      <div className="task-create-grid">
        <label>الدور المستهدف<select value={newRole} onChange={(event) => setNewRole(event.target.value as OperationalTaskRole)}>{allowedRoles.map((role) => <option value={role} key={role}>{roleLabels[role]}</option>)}</select></label>
        <label>الأولوية<select value={priority} onChange={(event) => setPriority(event.target.value as typeof priority)}><option value="low">منخفضة</option><option value="medium">متوسطة</option><option value="high">مرتفعة</option><option value="critical">حرجة</option></select></label>
        <label>الموعد (اختياري)<input type="datetime-local" value={dueAt} onChange={(event) => setDueAt(event.target.value)} /></label>
      </div>
      <div className="task-form-actions"><button type="submit" className="btn primary" disabled={busy||!title.trim()}>{busy?'جارٍ الحفظ…':'حفظ المهمة'}</button><button type="button" className="btn secondary" onClick={() => setShowCreate(false)}>إلغاء</button></div>
    </form>}
    <section className="panel task-filters">
      <label className="task-search"><span><Search size={16} /> بحث</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="عنوان المهمة أو التفاصيل أو مرجع المصدر" /></label>
      <label><span><Filter size={16} /> الدور</span><select value={roleFilter} onChange={(event) => setRoleFilter(event.target.value as typeof roleFilter)}><option value="all">كل الأدوار المتاحة للحساب</option>{allowedRoles.map((role) => <option key={role} value={role}>{roleLabels[role]}</option>)}</select></label>
      <label><span><ListTodo size={16} /> الحالة</span><select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as typeof statusFilter)}><option value="open">المفتوحة فقط</option><option value="pending">بانتظار التنفيذ</option><option value="in_progress">قيد التنفيذ</option><option value="completed">مكتملة</option><option value="cancelled">ملغاة</option><option value="all">كل الحالات</option></select></label>
    </section>
    {error && <div className="task-center-error" role="alert"><AlertTriangle size={17} /> {error}</div>}
    {loading ? <div className="panel task-center-empty">جارٍ تحميل المهام المقيّدة بصلاحيات حسابك…</div> : filtered.length===0 ? (
      <div className="panel task-center-empty"><ClipboardList size={30} /><strong>لا توجد مهام مطابقة للفلاتر</strong><span>غيّر الفلاتر أو نفّذ المصالحة مع سجلات التشغيل المحفوظة.</span></div>
    ) : <div className="task-center-list">{filtered.map((task) => {
      const late=isLate(task);
      const source=task.source_entity_type?(entityLabels[task.source_entity_type]??task.source_entity_type):'مهمة يدوية';
      const sourceId=task.source_entity_id?task.source_entity_id.slice(0,8):'—';
      const assigned=task.assigned_to?task.assigned_to.slice(0,8):'حسب الدور — غير مستلمة';
      return <article className="panel task-card" key={task.id}>
        <div className={'task-priority-line '+task.priority} />
        <div className="task-card-main">
          <div className="task-card-top"><span className={'task-role-badge '+task.task_role}>{roleLabels[task.task_role]}</span>
            <span className={'task-status-badge '+task.status}>{statusLabels[task.status]??task.status}</span>
            <span className={'task-priority-badge '+task.priority}>{priorityLabels[task.priority]??task.priority}</span>
            {late&&<span className="task-late-badge"><AlertTriangle size={13}/> متأخرة</span>}</div>
          <h2>{task.title}</h2><p>{task.description??'لا توجد تفاصيل إضافية مسجلة.'}</p>
          <div className="task-card-metadata">
            <span><CalendarClock size={14}/> الموعد: {dateText(task.due_at)}</span>
            <span><UserCheck size={14}/> المسؤول: {assigned}</span>
            <span><ClipboardList size={14}/> المصدر: {source} {sourceId!=='—'?'#'+sourceId:''}</span>
            <span><Clock3 size={14}/> أُنشئت: {dateText(task.created_at)}</span>
            {task.completed_at&&<span><CheckCircle2 size={14}/> أُنجزت: {dateText(task.completed_at)}</span>}
            {task.resolution_note&&<span className="task-resolution">{task.resolution_note}</span>}
          </div>
        </div>
        <div className="task-card-actions">
          {task.status==='pending'&&<button type="button" className="btn secondary" disabled={busy} onClick={() => void performStatus(task,'in_progress')}><Play size={15}/> استلام</button>}
          {task.status==='in_progress'&&<button type="button" className="btn primary" disabled={busy} onClick={() => void performStatus(task,'completed')}><CheckCircle2 size={15}/> إنجاز</button>}
          {task.status==='pending'&&<button type="button" className="btn primary" disabled={busy} onClick={() => void performStatus(task,'completed')}><CheckCircle2 size={15}/> إنجاز مباشر</button>}
          {canManage&&task.status==='completed'&&<button type="button" className="btn secondary" disabled={busy} onClick={() => void performStatus(task,'pending')}><RefreshCw size={15}/> إعادة فتح</button>}
        </div>
      </article>;
    })}</div>}
    <div className="operational-task-print" dir="rtl" aria-hidden="true">
      <header><h1>متجر الأغبري — كشف المهام التشغيلية</h1>
        <p>تاريخ الطباعة: {new Date().toLocaleString('ar-YE')}</p>
        <p>الدور: {roleFilter==='all'?'كل الأدوار المسموح بها للحساب':roleLabels[roleFilter]} — الحالة: {statusFilter==='open'?'المفتوحة':statusLabels[statusFilter]??'كل الحالات'} — العدد: {filtered.length}</p>
        {search.trim()&&<p>بحث: {search.trim()}</p>}</header>
      <table><thead><tr><th>#</th><th>المهمة والإجراء</th><th>الدور</th><th>الأولوية</th><th>الحالة</th><th>الموعد المسجل</th><th>المصدر</th><th>المسؤول</th></tr></thead>
        <tbody>{filtered.map((task,index) => <tr key={task.id}><td>{index+1}</td><td><strong>{task.title}</strong><br/>{task.description??'—'}{task.resolution_note?<><br/>النتيجة: {task.resolution_note}</>:null}</td>
          <td>{roleLabels[task.task_role]}</td><td>{priorityLabels[task.priority]??task.priority}</td><td>{statusLabels[task.status]??task.status}</td><td>{dateText(task.due_at)}</td>
          <td>{task.source_entity_type?entityLabels[task.source_entity_type]??task.source_entity_type:'يدوية'} {task.source_entity_id?'#'+task.source_entity_id:''}</td><td>{task.assigned_to??'غير مستلمة'}</td></tr>)}</tbody>
      </table>
      <footer>تعرض هذه القائمة سجلات التشغيل الحالية؛ لا تُنشأ مواعيد غير مسجلة في المصدر.</footer>
    </div>
  </section>;
}
