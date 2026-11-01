import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import {
  AlertTriangle, CalendarClock, CheckCircle2, ClipboardList, Clock3, Filter,
  ListTodo, Play, Plus, Printer, RefreshCw, Search, UserCheck, X,
} from 'lucide-react';
import { createOperationalTask, fetchOperationalTaskAssignees, fetchOperationalTasks, refreshOperationalTasks, setOperationalTaskStatus } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import type { OperationalTask, OperationalTaskAssignee, OperationalTaskRole, OperationalTaskStatus } from '@/lib/types';
import { filterTasksForPrint, operationalTaskPrintTitle, projectOperationalTaskPrintRow } from '@/lib/task-print';
import { CustomerReturnReviewQueue } from '@/components/CustomerReturnReviewQueue';
import { CustomerReturnReceiptQueue } from '@/components/CustomerReturnReceiptQueue';
import { CustomerReturnCreditMemoQueue } from '@/components/CustomerReturnCreditMemoQueue';

const roleLabels: Record<OperationalTaskRole, string> = {
  sales: 'المبيعات', accountant: 'المحاسبة والتحصيل', warehouse: 'أمين المخزن',
  purchasing: 'مدير المشتريات', management: 'الإدارة', operations: 'العمليات والبيانات',
};
const statusLabels: Record<string, string> = { pending: 'بانتظار التنفيذ', in_progress: 'قيد التنفيذ', completed: 'مكتملة', cancelled: 'ملغاة' };
const priorityLabels: Record<string, string> = { low: 'منخفضة', medium: 'متوسطة', high: 'مرتفعة', critical: 'حرجة' };
const entityLabels: Record<string, string> = {
  orders: 'طلب',
  customer_invoices: 'فاتورة',
  inventory_balances: 'رصيد مخزون',
  sales_quotes: 'عرض سعر',
  import_jobs: 'عملية استيراد',
  purchase_orders: 'أمر شراء',
  purchase_receipts: 'إيصال استلام شراء',
  stock_count_sessions: 'جلسة جرد',
  customer_return_requests: 'طلب إرجاع',
  customer_return_receipts: 'استلام مرتجع',
  customer_return_credit_memos: 'إشعار دائن لمرتجع',
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

function canAssignToRole(userRoles: string[], taskRole: OperationalTaskRole): boolean {
  if (taskRole === 'accountant') return userRoles.some((role) => ['admin','manager','accountant'].includes(role));
  if (taskRole === 'management') return userRoles.some((role) => ['admin','manager'].includes(role));
  return userRoles.some((role) => ['admin','manager','staff'].includes(role));
}

function matchesTaskSearch(task: OperationalTask, search: string): boolean {
  const needle = search.trim().toLocaleLowerCase();
  if (!needle) return true;
  const searchableValues = [
    task.title,
    task.description ?? '',
    task.source_entity_id ?? '',
    task.resolution_note ?? '',
  ];
  return searchableValues.some((value) => value.toLocaleLowerCase().includes(needle));
}

function matchesTaskCreationRange(
  task: OperationalTask,
  createdFrom: string,
  createdTo: string,
): boolean {
  const createdAt = new Date(task.created_at).getTime();
  if (createdFrom && createdAt < new Date(`${createdFrom}T00:00:00`).getTime()) return false;
  if (createdTo && createdAt >= new Date(`${createdTo}T23:59:59.999`).getTime() + 1) return false;
  return true;
}

type TaskCreateFormProps = {
  title: string;
  description: string;
  newRole: OperationalTaskRole;
  allowedRoles: OperationalTaskRole[];
  eligibleAssignees: OperationalTaskAssignee[];
  assignedTo: string;
  assigneesLoading: boolean;
  assigneesError: string;
  priority: 'low' | 'medium' | 'high' | 'critical';
  dueAt: string;
  busy: boolean;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onClose: () => void;
  onTitleChange: (value: string) => void;
  onDescriptionChange: (value: string) => void;
  onRoleChange: (value: OperationalTaskRole) => void;
  onAssigneeChange: (value: string) => void;
  onPriorityChange: (value: TaskCreateFormProps['priority']) => void;
  onDueAtChange: (value: string) => void;
};



function TaskCreateFields({ allowedRoles, newRole, onRoleChange, eligibleAssignees, assignedTo, assigneesLoading, assigneesError, onAssigneeChange, priority, onPriorityChange, dueAt, onDueAtChange }: Pick<TaskCreateFormProps, 'allowedRoles' | 'newRole' | 'onRoleChange' | 'eligibleAssignees' | 'assignedTo' | 'assigneesLoading' | 'assigneesError' | 'onAssigneeChange' | 'priority' | 'onPriorityChange' | 'dueAt' | 'onDueAtChange'>) {
  return (
    <div className="task-create-grid">
      <label>الدور المستهدف<select value={newRole} onChange={(event) => onRoleChange(event.target.value as OperationalTaskRole)}>
        {allowedRoles.map((role) => <option value={role} key={role}>{roleLabels[role]}</option>)}
      </select></label>
      <label>الموظف المسؤول
        <select value={assignedTo} onChange={(event) => onAssigneeChange(event.target.value)} disabled={assigneesLoading || Boolean(assigneesError)}>
          <option value="">تبقى في قائمة الدور حتى يستلمها موظف</option>
          {eligibleAssignees.map((assignee) => <option key={assignee.profile_id} value={assignee.profile_id}>{assignee.full_name}{assignee.email ? ' — ' + assignee.email : ''}</option>)}
        </select>
        {assigneesLoading && <small>جارٍ تحميل موظفي المؤسسة المصرح لهم…</small>}
        {assigneesError && <small role="status">{assigneesError} يمكنك حفظ المهمة غير مسندة؛ يتحقق الخادم من أي إسناد لاحق.</small>}
        {!assigneesLoading && !assigneesError && eligibleAssignees.length === 0 && <small>لا يوجد موظف نشط بدور متوافق؛ ستبقى المهمة في قائمة الدور.</small>}
      </label>
      <label>الأولوية<select value={priority} onChange={(event) => onPriorityChange(event.target.value as TaskCreateFormProps['priority'])}>
        <option value="low">منخفضة</option><option value="medium">متوسطة</option><option value="high">مرتفعة</option><option value="critical">حرجة</option>
      </select></label>
      <label>الموعد (اختياري)<input type="datetime-local" value={dueAt} onChange={(event) => onDueAtChange(event.target.value)} /></label>
    </div>
  );
}

function TaskCreateActions({ busy, title, onClose }: { busy: boolean; title: string; onClose: () => void }) {
  return (
    <div className="task-form-actions">
      <button type="submit" className="btn primary" disabled={busy || !title.trim()}>{busy ? 'جارٍ الحفظ…' : 'حفظ المهمة'}</button>
      <button type="button" className="btn secondary" onClick={onClose}>إلغاء</button>
    </div>
  );
}


function TaskCreateForm({
  title, description, newRole, allowedRoles, eligibleAssignees, assignedTo,
  assigneesLoading, assigneesError, priority, dueAt, busy, onSubmit, onClose,
  onTitleChange, onDescriptionChange, onRoleChange, onAssigneeChange,
  onPriorityChange, onDueAtChange,
}: TaskCreateFormProps) {
  return (
    <form className="panel task-create-form" onSubmit={onSubmit}>
      <div className="panel-head">
        <div><h2>إسناد مهمة جديدة</h2><p>تُحفظ حسب الدور وتظهر في قائمته مع تدقيق الإنشاء.</p></div>
        <button type="button" className="btn ghost" aria-label="إغلاق نموذج المهمة" onClick={onClose}><X size={16} /></button>
      </div>
      <label>عنوان المهمة<input required maxLength={240} value={title} onChange={(event) => onTitleChange(event.target.value)} placeholder="اكتب الإجراء المطلوب" /></label>
      <label>التفاصيل<textarea maxLength={2000} rows={3} value={description} onChange={(event) => onDescriptionChange(event.target.value)} placeholder="الإجراء أو المرجع التشغيلي" /></label>
      <TaskCreateFields
        allowedRoles={allowedRoles}
        newRole={newRole}
        onRoleChange={onRoleChange}
        eligibleAssignees={eligibleAssignees}
        assignedTo={assignedTo}
        assigneesLoading={assigneesLoading}
        assigneesError={assigneesError}
        onAssigneeChange={onAssigneeChange}
        priority={priority}
        onPriorityChange={onPriorityChange}
        dueAt={dueAt}
        onDueAtChange={onDueAtChange}
      />
      <TaskCreateActions busy={busy} title={title} onClose={onClose} />
    </form>
  );
}

export function TaskCenter({ onNotice }: { onNotice: (message: string) => void }) {
  const { user } = useAuth();
  const roles = user?.roles ?? [];
  const canManage = roles.includes('admin') || roles.includes('manager');
  const allowedRoles = useMemo(() => roleOptionsFor(roles), [roles]);
  const financeOnly = roles.includes('accountant') && !roles.some((role) => ['admin','manager','staff'].includes(role));
  const [tasks, setTasks] = useState<OperationalTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [roleFilter, setRoleFilter] = useState<OperationalTaskRole | 'all'>(financeOnly ? 'accountant' : 'all');
  const [statusFilter, setStatusFilter] = useState<'open' | 'all' | OperationalTaskStatus>('open');
  const [priorityFilter, setPriorityFilter] = useState<'all' | 'low' | 'medium' | 'high' | 'critical'>('all');
  const [assigneeFilter, setAssigneeFilter] = useState<'all' | 'unassigned' | string>('all');
  const [createdFrom, setCreatedFrom] = useState('');
  const [createdTo, setCreatedTo] = useState('');
  const [search, setSearch] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [newRole, setNewRole] = useState<OperationalTaskRole>(canManage ? 'sales' : (allowedRoles[0] ?? 'operations'));
  const [priority, setPriority] = useState<'low' | 'medium' | 'high' | 'critical'>('medium');
  const [dueAt, setDueAt] = useState('');
  const [assignedTo, setAssignedTo] = useState('');
  const [assignees, setAssignees] = useState<OperationalTaskAssignee[]>([]);
  const [assigneesLoading, setAssigneesLoading] = useState(false);
  const [assigneesError, setAssigneesError] = useState('');

  const loadTasks = useCallback(async () => {
    setLoading(true); setError('');
    try { setTasks(await fetchOperationalTasks()); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'تعذر تحميل مهام التشغيل.'); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void loadTasks(); }, [loadTasks]);
  useEffect(() => {
    if (!canManage) return;
    let active = true;
    setAssigneesLoading(true);
    setAssigneesError('');
    void fetchOperationalTaskAssignees()
      .then((rows) => { if (active) setAssignees(rows); })
      .catch((cause: unknown) => {
        if (active) setAssigneesError(cause instanceof Error ? cause.message : 'تعذر تحميل موظفي المؤسسة.');
      })
      .finally(() => { if (active) setAssigneesLoading(false); });
    return () => { active = false; };
  }, [canManage]);

  const eligibleAssignees = useMemo(
    () => assignees.filter((assignee) => canAssignToRole(assignee.roles, newRole)),
    [assignees, newRole],
  );
  const assigneeById = useMemo(
    () => new Map(assignees.map((assignee) => [assignee.profile_id, assignee])),
    [assignees],
  );
  function assignedLabel(task: OperationalTask): string {
    if (!task.assigned_to) return 'حسب الدور — غير مستلمة';
    if (task.assigned_to === user?.profileId) return 'أنت';
    const assignee = assigneeById.get(task.assigned_to);
    if (assignee) return assignee.full_name;
    return 'مسند لموظف آخر';
  }


  const [printScope, setPrintScope] = useState<OperationalTaskRole | 'all' | 'filtered'>('all');

  // One shared predicate applies all non-role filters to both screen and print output.
  const matchesNonRoleFilters = useCallback((task: OperationalTask) => {
    if (statusFilter === 'open' && ['completed','cancelled'].includes(task.status)) return false;
    if (statusFilter !== 'all' && statusFilter !== 'open' && task.status !== statusFilter) return false;
    if (priorityFilter !== 'all' && task.priority !== priorityFilter) return false;
    if (assigneeFilter === 'unassigned' && task.assigned_to) return false;
    if (assigneeFilter !== 'all' && assigneeFilter !== 'unassigned' && task.assigned_to !== assigneeFilter) return false;
    if (!matchesTaskCreationRange(task, createdFrom, createdTo)) return false;
    return matchesTaskSearch(task, search);
  }, [statusFilter,priorityFilter,assigneeFilter,createdFrom,createdTo,search]);

  // Apply the same authorized role scope to cards, print output and every summary metric.
  const roleScopedTasks = useMemo(
    () => tasks.filter((task) => allowedRoles.includes(task.task_role)),
    [tasks,allowedRoles],
  );
  const filteredWithoutRole = useMemo(
    () => roleScopedTasks.filter(matchesNonRoleFilters),
    [roleScopedTasks,matchesNonRoleFilters],
  );
  const filtered = useMemo(
    () => filteredWithoutRole.filter((task) => roleFilter === 'all' || task.task_role === roleFilter),
    [filteredWithoutRole,roleFilter],
  );
  const printable = useMemo(
    () => filterTasksForPrint(filteredWithoutRole,printScope,allowedRoles,filtered)
      .map((task) => projectOperationalTaskPrintRow(task, assignedLabel(task))),
    [filteredWithoutRole,filtered,printScope,allowedRoles,assigneeById,user?.profileId],
  );
  const printScopeLabel = printScope === 'filtered'
    ? 'النتائج المفلترة الحالية'
    : printScope === 'all'
      ? 'كل المهام المسموحة'
      : roleLabels[printScope];

  const openCount = roleScopedTasks.filter((task) => !['completed','cancelled'].includes(task.status)).length;
  const lateCount = roleScopedTasks.filter(isLate).length;
  const completedCount = roleScopedTasks.filter((task) => task.status === 'completed').length;

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
      await createOperationalTask({ title,description,taskRole:newRole,priority,dueAt:dueAt?new Date(dueAt).toISOString():null,assignedTo:assignedTo || null });
      setTitle(''); setDescription(''); setDueAt(''); setAssignedTo(''); setShowCreate(false);
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
        <p>مهام ناتجة من الطلبات والمشتريات وإيصالات الاستلام والجرد وفروقات المخزون والفواتير والإشعارات الدائنة وعروض الأسعار والاستيراد المحفوظة فعليًا، مع تسجيل الإنجاز والطباعة حسب الدور.</p>
      </div>
      <div className="task-center-toolbar">
        <button className="btn secondary" type="button" onClick={() => void loadTasks()} disabled={busy}><RefreshCw size={16} /> تحديث</button>
        {canManage && <button className="btn secondary" type="button" onClick={() => void refreshFromSources()} disabled={busy}><RefreshCw size={16} /> مصالحة مع حركة النظام</button>}
        {canManage && <button className="btn primary" type="button" onClick={() => setShowCreate((visible) => !visible)}><Plus size={16} /> مهمة يدوية</button>}
        <label className="task-print-scope">
          <span>نطاق الطباعة</span>
          <select value={printScope} onChange={(event) => setPrintScope(event.target.value as OperationalTaskRole | 'all' | 'filtered')}>
            <option value="filtered">النتائج المفلترة الحالية</option>
            <option value="all">الكل — الأدوار المسموحة</option>
            {allowedRoles.map((role) => <option key={role} value={role}>{roleLabels[role]}</option>)}
          </select>
        </label>
        <button className="btn primary" type="button" onClick={() => window.print()} disabled={printable.length===0}>
          <Printer size={16} /> طباعة {printScopeLabel}
        </button>
      </div>
    </div>
    <div className="task-center-metrics">
      <article><span><ListTodo size={19} /> المهام المفتوحة</span><strong>{openCount.toLocaleString('ar-YE')}</strong></article>
      <article><span><AlertTriangle size={19} /> متأخرة حسب موعد المصدر</span><strong>{lateCount.toLocaleString('ar-YE')}</strong></article>
      <article><span><CheckCircle2 size={19} /> مكتملة</span><strong>{completedCount.toLocaleString('ar-YE')}</strong></article>
      <article><span><ClipboardList size={19} /> النتائج الحالية</span><strong>{filtered.length.toLocaleString('ar-YE')}</strong></article>
    </div>
    {showCreate && canManage && (
      <TaskCreateForm
        title={title}
        description={description}
        newRole={newRole}
        allowedRoles={allowedRoles}
        eligibleAssignees={eligibleAssignees}
        assignedTo={assignedTo}
        assigneesLoading={assigneesLoading}
        assigneesError={assigneesError}
        priority={priority}
        dueAt={dueAt}
        busy={busy}
        onSubmit={(event) => { void submitTask(event); }}
        onClose={() => setShowCreate(false)}
        onTitleChange={setTitle}
        onDescriptionChange={setDescription}
        onRoleChange={(role) => {
          setNewRole(role);
          if (assignedTo && !assignees.some((assignee) => assignee.profile_id === assignedTo && canAssignToRole(assignee.roles, role))) {
            setAssignedTo('');
          }
        }}
        onAssigneeChange={setAssignedTo}
        onPriorityChange={setPriority}
        onDueAtChange={setDueAt}
      />
    )}
    <section className="panel task-filters">
      <label className="task-search"><span><Search size={16} /> بحث</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="عنوان المهمة أو التفاصيل أو مرجع المصدر" /></label>
      <label><span><Filter size={16} /> الدور</span><select value={roleFilter} onChange={(event) => setRoleFilter(event.target.value as typeof roleFilter)}><option value="all">كل الأدوار المتاحة للحساب</option>{allowedRoles.map((role) => <option key={role} value={role}>{roleLabels[role]}</option>)}</select></label>
      <label><span><ListTodo size={16} /> الحالة</span><select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as typeof statusFilter)}><option value="open">المفتوحة فقط</option><option value="pending">بانتظار التنفيذ</option><option value="in_progress">قيد التنفيذ</option><option value="completed">مكتملة</option><option value="cancelled">ملغاة</option><option value="all">كل الحالات</option></select></label>
      <label><span>الأولوية</span><select value={priorityFilter} onChange={(event) => setPriorityFilter(event.target.value as typeof priorityFilter)}><option value="all">كل الأولويات</option><option value="critical">حرجة</option><option value="high">مرتفعة</option><option value="medium">متوسطة</option><option value="low">منخفضة</option></select></label>
      <label><span><UserCheck size={16} /> المسؤول</span><select value={assigneeFilter} onChange={(event) => setAssigneeFilter(event.target.value)}><option value="all">كل المسؤولين</option><option value="unassigned">غير مسندة</option>{assignees.filter((assignee) => assignee.profile_id && tasks.some((task) => task.assigned_to === assignee.profile_id)).map((assignee) => <option key={assignee.profile_id} value={assignee.profile_id}>{assignee.full_name}</option>)}</select></label>
      <label><span>من تاريخ الإنشاء</span><input type="date" value={createdFrom} max={createdTo || undefined} onChange={(event) => setCreatedFrom(event.target.value)} /></label>
      <label><span>إلى تاريخ الإنشاء</span><input type="date" value={createdTo} min={createdFrom || undefined} onChange={(event) => setCreatedTo(event.target.value)} /></label>
    </section>
    {error && <div className="task-center-error" role="alert"><AlertTriangle size={17} /> {error}</div>}
    {loading ? <div className="panel task-center-empty">جارٍ تحميل المهام المقيّدة بصلاحيات حسابك…</div> : filtered.length===0 ? (
      <div className="panel task-center-empty"><ClipboardList size={30} /><strong>لا توجد مهام مطابقة للفلاتر</strong><span>غيّر الفلاتر أو نفّذ المصالحة مع سجلات التشغيل المحفوظة.</span></div>
    ) : <div className="task-center-list">{filtered.map((task) => {
      const late=isLate(task);
      const source=task.source_entity_type?(entityLabels[task.source_entity_type]??task.source_entity_type):'مهمة يدوية';
      const sourceId=task.source_entity_id?task.source_entity_id.slice(0,8):'—';
      const assigned=assignedLabel(task);
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
      <header><h1>{operationalTaskPrintTitle()}</h1>
        <p>تاريخ الطباعة: {new Date().toLocaleString('ar-YE')}</p>
        <p>نطاق الطباعة: {printScope==='filtered'?'النتائج المفلترة الحالية':printScope==='all'?'كل الأدوار المسموحة للحساب':roleLabels[printScope]} — فلتر الدور على الشاشة: {roleFilter==='all'?'كل الأدوار المسموحة':roleLabels[roleFilter]} — الحالة: {statusFilter==='open'?'المفتوحة':statusLabels[statusFilter]??'كل الحالات'} — الأولوية: {priorityFilter==='all'?'كل الأولويات':priorityLabels[priorityFilter]} — العدد: {printable.length}</p>
        <p>المسؤول: {assigneeFilter==='all'?'كل المسؤولين':assigneeFilter==='unassigned'?'غير مسندة':assigneeById.get(assigneeFilter)?.full_name??'الموظف المحدد'} — فترة الإنشاء: {createdFrom||'بلا بداية'} إلى {createdTo||'بلا نهاية'}</p>
        {search.trim()&&<p>بحث: {search.trim()}</p>}</header>
      <table><thead><tr><th>#</th><th>المهمة والإجراء</th><th>الدور</th><th>الأولوية</th><th>الحالة</th><th>الموعد المسجل</th><th>المصدر</th><th>المسؤول</th></tr></thead>
        <tbody>{printable.map((task,index) => <tr key={task.id}><td>{index+1}</td><td><strong>{task.title}</strong><br/>{task.description??'—'}{task.resolution_note?<><br/>النتيجة: {task.resolution_note}</>:null}</td>
          <td>{roleLabels[task.task_role]}</td><td>{priorityLabels[task.priority]??task.priority}</td><td>{statusLabels[task.status]??task.status}</td><td>{dateText(task.due_at)}</td>
          <td>{task.source_entity_type?entityLabels[task.source_entity_type]??task.source_entity_type:'يدوية'}</td><td>{task.assigned_label}</td></tr>)}</tbody>
      </table>
      <footer>تعرض هذه القائمة سجلات التشغيل الحالية؛ لا تُنشأ مواعيد غير مسجلة في المصدر.</footer>
    </div>
    {canManage && <CustomerReturnReviewQueue onNotice={onNotice} />}
    {(canManage || roles.includes('staff')) && <CustomerReturnReceiptQueue onNotice={onNotice} />}
    {roles.some((role) => ['admin','manager','accountant'].includes(role)) && <CustomerReturnCreditMemoQueue onNotice={onNotice} />}
  </section>;
}