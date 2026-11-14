import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Check, ChevronDown, ChevronLeft, FolderTree, LoaderCircle, Pencil, Plus, RefreshCw, RotateCcw, Search, Tags, X } from 'lucide-react';
import { fetchAdminProductsPage, fetchCategories } from '@/lib/api';
import { formatCurrency, formatNumber } from '@/lib/format';
import { projectAdminCategoryCatalogMetrics } from '@/lib/admin-category-catalog';
import { archiveAdminCatalogCategory, createAdminCatalogCategory, renameAdminCatalogCategory, restoreAdminCatalogCategory } from '@/lib/admin-catalog-commands';
import { fetchAdminCategoryProducts, type AdminCategoryProductRow } from '@/lib/admin-category-products';
import { buildAdminCategoryTree, filterAdminCategoryTree, getAdminCategoryAncestorIds, getAdminCategoryPath, type AdminCategoryTreeNode } from '@/lib/admin-category-tree';
import type { Category, ProductWithInventory } from '@/lib/types';
import { useAuth } from '@/lib/auth';

type DetailTab = 'overview' | 'children' | 'products' | 'catalog';
type CreateParent = string | null | undefined;
function readSelectedCategory(): string | null {
  if (typeof window === 'undefined') return null;
  return new URLSearchParams(window.location.search).get('category');
}
function writeSelectedCategory(id: string | null, replace = false) {
  if (typeof window === 'undefined') return;
  const url = new URL(window.location.href);
  if (id) url.searchParams.set('category', id);
  else url.searchParams.delete('category');
  if (replace) window.history.replaceState(window.history.state, '', url);
  else window.history.pushState(window.history.state, '', url);
}

function CategoryBranch({ nodes, expanded, selectedId, depth, onToggle, onSelect }: {
  nodes: AdminCategoryTreeNode[]; expanded: ReadonlySet<string>; selectedId: string | null; depth: number;
  onToggle: (id: string) => void; onSelect: (id: string) => void;
}) {
  return <ul className="admin-category-tree__list" aria-label={depth ? 'التصنيفات الفرعية' : 'التصنيفات الرئيسية'}>
    {nodes.map((node) => {
      const category = node.category;
      const isExpanded = expanded.has(category.id);
      const hasChildren = node.children.length > 0;
      const isSelected = selectedId === category.id;
      return <li className="admin-category-tree__item" key={category.id}>
        <div className={`admin-category-tree__row ${isSelected ? 'is-selected' : ''}`} style={{ '--category-depth': depth } as React.CSSProperties}>
          <button type="button" className="admin-category-tree__expand" disabled={!hasChildren}
            aria-label={hasChildren ? (isExpanded ? 'طي الفروع' : 'فتح الفروع') : 'لا توجد فروع'}
            aria-expanded={hasChildren ? isExpanded : undefined} onClick={() => onToggle(category.id)}>
            {hasChildren ? (isExpanded ? <ChevronDown size={15} /> : <ChevronLeft size={15} />) : <span className="admin-category-tree__leaf" />}
          </button>
          <button type="button" className="admin-category-tree__select" aria-current={isSelected ? 'true' : undefined}
            onClick={() => onSelect(category.id)}>
            <span className="admin-category-tree__folder"><FolderTree size={16} /></span>
            <span className="admin-category-tree__name">{category.name}</span>
            {category.is_active === false && <span className="admin-category-tree__status is-archived">مؤرشف</span>}
            {node.relationshipWarning && <span className="admin-category-tree__status is-warning">ارتباط يحتاج مراجعة</span>}
          </button>
        </div>
        {hasChildren && isExpanded && <CategoryBranch nodes={node.children} expanded={expanded} selectedId={selectedId}
          depth={depth + 1} onToggle={onToggle} onSelect={onSelect} />}
      </li>;
    })}
  </ul>;
}

export function AdminCategoryTree({ onNotice, onOpenProduct }: {
  onNotice: (message: string) => void;
  onOpenProduct: (product: AdminCategoryProductRow) => void;
}) {
  const { user } = useAuth();
  const canOpen = Boolean(user?.roles.some((role) => ['admin', 'manager', 'staff'].includes(role)));
  const canManage = Boolean(user?.roles.some((role) => role === 'admin' || role === 'manager'));
  const canViewPrices = Boolean(user?.roles.some((role) => role === 'admin' || role === 'manager'));
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(() => readSelectedCategory());
  const [expandedIds, setExpandedIds] = useState<Set<string>>(() => new Set());
  const [tab, setTab] = useState<DetailTab>('overview');
  const [createParent, setCreateParent] = useState<CreateParent>(undefined);
  const [newName, setNewName] = useState('');
  const [newCode, setNewCode] = useState('');
  const [creating, setCreating] = useState(false);
  const [renameDraft, setRenameDraft] = useState('');
  const [renaming, setRenaming] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [products, setProducts] = useState<AdminCategoryProductRow[]>([]);
  const [productsLoading, setProductsLoading] = useState(false);
  const [productsError, setProductsError] = useState('');
  const [productsRetry, setProductsRetry] = useState(0);
  const [catalogPage, setCatalogPage] = useState(1);
  const [catalogItems, setCatalogItems] = useState<ProductWithInventory[]>([]);
  const [catalogHasNextPage, setCatalogHasNextPage] = useState(false);
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [catalogError, setCatalogError] = useState('');
  const [catalogRetry, setCatalogRetry] = useState(0);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const rows = await fetchCategories();
      setCategories(rows);
      return rows;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'تعذر تحميل التصنيفات.');
      throw cause;
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    if (canOpen) void load().catch(() => undefined);
  }, [canOpen, load]);

  const tree = useMemo(() => buildAdminCategoryTree(categories), [categories]);
  const filteredTree = useMemo(() => filterAdminCategoryTree(tree, search), [tree, search]);
  const selected = categories.find((category) => category.id === selectedId) ?? null;
  const path = selected ? getAdminCategoryPath(categories, selected.id) : [];
  const selectedNode = useMemo(() => {
    const find = (nodes: AdminCategoryTreeNode[]): AdminCategoryTreeNode | null => {
      for (const node of nodes) {
        if (node.category.id === selectedId) return node;
        const nested = find(node.children);
        if (nested) return nested;
      }
      return null;
    };
    return selectedId ? find(tree) : null;
  }, [tree, selectedId]);
  const children = selectedNode?.children ?? [];

  const selectCategory = useCallback((id: string | null, replace = false) => {
    setSelectedId(id);
    writeSelectedCategory(id, replace);
    if (id) {
      setExpandedIds((current) => new Set([...current, ...getAdminCategoryAncestorIds(categories, id)]));
      setTab('overview');
      setCatalogPage(1);
    }
  }, [categories]);

  useEffect(() => {
    if (!categories.length) return;
    const requested = readSelectedCategory();
    const target = requested && categories.some((item) => item.id === requested) ? requested
      : selectedId && categories.some((item) => item.id === selectedId) ? selectedId
        : tree[0]?.category.id ?? null;
    if (target && target !== selectedId) setSelectedId(target);
    if (target && target !== requested) writeSelectedCategory(target, true);
    if (target) setExpandedIds((current) => new Set([...current, ...getAdminCategoryAncestorIds(categories, target)]));
  }, [categories, tree, selectedId]);

  useEffect(() => {
    const sync = () => {
      setSelectedId(readSelectedCategory());
      setTab('overview');
      setCatalogPage(1);
    };
    window.addEventListener('popstate', sync);
    return () => window.removeEventListener('popstate', sync);
  }, []);

  useEffect(() => {
    if (tab !== 'products' || !selected) {
      setProducts([]);
      setProductsError('');
      setProductsLoading(false);
      return;
    }
    let active = true;
    setProductsLoading(true);
    setProductsError('');
    fetchAdminCategoryProducts(selected.id)
      .then((rows) => { if (active) setProducts(rows); })
      .catch((cause) => { if (active) setProductsError(cause instanceof Error ? cause.message : 'تعذر تحميل المنتجات المرتبطة.'); })
      .finally(() => { if (active) setProductsLoading(false); });
    return () => { active = false; };
  }, [tab, selected?.id, productsRetry]);

  useEffect(() => {
    if (tab !== 'catalog' || !selected) return;
    let active = true;
    setCatalogLoading(true);
    setCatalogError('');
    setCatalogItems([]);
    setCatalogHasNextPage(false);
    fetchAdminProductsPage({ page: catalogPage, categoryId: selected.id })
      .then((result) => {
        if (!active) return;
        setCatalogItems(result.items);
        setCatalogHasNextPage(result.hasNextPage);
      })
      .catch((cause) => {
        if (active) setCatalogError(cause instanceof Error ? cause.message : 'تعذر تحميل أسعار ومخزون التصنيف.');
      })
      .finally(() => { if (active) setCatalogLoading(false); });
    return () => { active = false; };
  }, [tab, selected?.id, catalogPage, catalogRetry]);

  useEffect(() => { setRenameDraft(selected?.name ?? ''); }, [selected?.id, selected?.name]);

  function toggleExpanded(id: string) {
    setExpandedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function createCategory(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const name = newName.trim();
    const code = newCode.trim();
    if (!canManage || !name || name.length > 100 || code.length > 64 || creating) return;
    if (createParent) {
      const parentPath = getAdminCategoryPath(categories, createParent);
      if (!parentPath.length || parentPath.some((item) => item.is_active === false)) {
        onNotice('لا يمكن إضافة فرع تحت أب مفقود أو ضمن مسار يحتوي تصنيفاً مؤرشفاً.');
        return;
      }
    }
    setCreating(true);
    try {
      const result = await createAdminCatalogCategory(name, createParent ?? null, code || null);
      if (!result || typeof result.id !== 'string' || result.name !== name || typeof result.created !== 'boolean') {
        throw new Error('لم يؤكد الخادم حفظ التصنيف.');
      }
      const latest = await load();
      setCreateParent(undefined);
      setNewName('');
      setNewCode('');
      selectCategory(result.id);
      setExpandedIds((current) => new Set([...current, ...getAdminCategoryAncestorIds(latest, result.id), ...(createParent ? [createParent] : [])]));
      onNotice(result.created ? 'تم إنشاء التصنيف وحفظ علاقته بالأب' : 'التصنيف موجود بالفعل تحت الأب المحدد');
    } catch (cause) {
      onNotice(cause instanceof Error ? cause.message : 'تعذر إنشاء التصنيف');
    } finally {
      setCreating(false);
    }
  }

  async function renameCategory(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canManage || !selected || selected.is_active === false || !renameDraft.trim() || renaming) return;
    const name = renameDraft.trim();
    setRenaming(true);
    try {
      const result = await renameAdminCatalogCategory(selected.id, name);
      if (result.id !== selected.id || result.name !== name || typeof result.renamed !== 'boolean') throw new Error('لم يؤكد الخادم إعادة تسمية التصنيف.');
      await load();
      onNotice(result.renamed ? 'تم تحديث اسم التصنيف' : 'لم يتغير اسم التصنيف');
    } catch (cause) {
      onNotice(cause instanceof Error ? cause.message : 'تعذر تعديل التصنيف');
    } finally {
      setRenaming(false);
    }
  }

  async function archiveCategory(category: Category) {
    if (!canManage || category.is_active === false || busyId) return;
    const hasActiveChild = categories.some((item) => item.parent_id === category.id && item.is_active !== false);
    const hasActiveDeeperDescendant = categories.some((item) => item.is_active !== false
      && item.parent_id !== category.id
      && getAdminCategoryAncestorIds(categories, item.id).includes(category.id));
    if (hasActiveChild || hasActiveDeeperDescendant) {
      onNotice('لا يمكن أرشفة تصنيف أب قبل معالجة جميع فروعه النشطة؛ حتى لا تبقى فروع تشغيلية تحت أب مؤرشف.');
      return;
    }
    if (!window.confirm(`أرشفة «${category.name}»؟ سيبقى السجل والمنتجات دون حذف.`)) return;
    setBusyId(category.id);
    try {
      const result = await archiveAdminCatalogCategory(category.id);
      if (result.id !== category.id || result.is_active !== false || result.archived !== true) throw new Error('لم يؤكد الخادم أرشفة التصنيف.');
      await load();
      onNotice('تمت أرشفة التصنيف دون حذف المنتجات أو سجل التصنيف');
    } catch (cause) {
      onNotice(cause instanceof Error ? cause.message : 'تعذرت أرشفة التصنيف');
    } finally {
      setBusyId(null);
    }
  }

  async function restoreCategory(category: Category) {
    if (!canManage || category.is_active !== false || busyId) return;
    setBusyId(category.id);
    try {
      const result = await restoreAdminCatalogCategory(category.id);
      if (result.id !== category.id || result.is_active !== true || typeof result.restored !== 'boolean') throw new Error('لم يؤكد الخادم استعادة التصنيف.');
      await load();
      onNotice(result.restored ? 'تمت استعادة التصنيف' : 'التصنيف نشط بالفعل');
    } catch (cause) {
      onNotice(cause instanceof Error ? cause.message : 'تعذرت استعادة التصنيف');
    } finally {
      setBusyId(null);
    }
  }

  if (!canOpen) return <section className="panel admin-category-denied" role="alert">
    <AlertTriangle size={22} /><h1>لا تتوفر صلاحية عرض الكتالوج</h1>
    <p>تتطلب هذه الشاشة دوراً تشغيلياً في المؤسسة؛ وتظل صلاحيات الخادم وRLS المرجع النهائي.</p>
  </section>;

  return <div className="admin-category-page" dir="rtl">
    <header className="admin-category-page__header">
      <div><span>الكتالوج والتسعير</span><h1>التصنيفات الرئيسية والفرعية</h1><p>شجرة واحدة مرتبطة بحقل parent_id الحالي وعمليات الخادم المعتمدة.</p></div>
      <div className="admin-category-page__actions">
        <button type="button" className="btn outline" onClick={() => void load().catch(() => undefined)} disabled={loading}><RefreshCw size={16}/> تحديث</button>
        {canManage && <button type="button" className="btn primary" onClick={() => { setCreateParent(null); setNewName(''); setNewCode(''); }}><Plus size={16}/> تصنيف رئيسي</button>}
      </div>
    </header>
    {createParent !== undefined && <form className="admin-category-create" onSubmit={createCategory}>
      <div><strong>{createParent ? 'إضافة تصنيف فرعي' : 'إضافة تصنيف رئيسي'}</strong><p>{createParent ? `سيُحفظ الفرع تحت: ${categories.find((item) => item.id === createParent)?.name ?? 'الأب المحدد'}` : 'سيُحفظ دون أب.'}</p></div>
      <label>اسم التصنيف<input value={newName} onChange={(event) => setNewName(event.target.value)} maxLength={100} required /></label>
      <label>الرمز (اختياري)<input value={newCode} onChange={(event) => setNewCode(event.target.value)} maxLength={64} dir="auto" /></label>
      <div className="admin-category-create__actions">
        <button className="btn primary" type="submit" disabled={creating || !newName.trim()}>{creating ? <LoaderCircle size={16} className="spin"/> : <Check size={16}/>} حفظ</button>
        <button className="btn outline" type="button" onClick={() => setCreateParent(undefined)} disabled={creating}>إلغاء</button>
      </div>
    </form>}
    <div className="admin-category-layout">
      <section className="panel admin-category-tree">
        <div className="admin-category-tree__header"><div><h2>شجرة الكتالوج</h2><p>{categories.length} تصنيفاً محملاً من المؤسسة</p></div><span><Tags size={18}/></span></div>
        <label className="admin-category-search"><Search size={17}/><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="ابحث بالاسم أو الرمز..." aria-label="البحث في التصنيفات"/>{search && <button type="button" onClick={() => setSearch('')} aria-label="مسح البحث"><X size={15}/></button>}</label>
        {loading && <div className="admin-category-state"><LoaderCircle size={18} className="spin"/> جارٍ تحميل التصنيفات</div>}
        {!loading && error && <div className="admin-category-error" role="alert"><AlertTriangle size={17}/><span>{error}</span><button type="button" className="btn outline" onClick={() => void load().catch(() => undefined)} disabled={loading}><RefreshCw size={14}/> إعادة المحاولة</button></div>}
        {!loading && !error && !filteredTree.length && <div className="admin-category-empty"><FolderTree size={25}/><strong>{search ? 'لا توجد نتائج' : 'لا توجد تصنيفات محفوظة'}</strong><span>{search ? 'جرّب كلمة أخرى.' : 'أنشئ تصنيفاً رئيسياً لبناء الشجرة.'}</span></div>}
        {!loading && !error && filteredTree.length > 0 && <CategoryBranch nodes={filteredTree} expanded={new Set([...expandedIds, ...(search ? categories.map((item) => item.id) : [])])} selectedId={selectedId} depth={0} onToggle={toggleExpanded} onSelect={selectCategory}/>}
        {!loading && !error && categories.some((item) => item.is_active === false) && <p className="admin-category-legend">السجلات المؤرشفة ظاهرة للمراجعة ولا تُحذف.</p>}
      </section>
      <section className="panel admin-category-details">
        {!selected ? <div className="admin-category-empty"><FolderTree size={28}/><strong>اختر تصنيفاً لعرض تفاصيله</strong><span>حدد عقدة لعرض الأب والفروع والمنتجات المرتبطة.</span></div> : <>
          <div className="admin-category-details__header"><div><span>تفاصيل التصنيف</span><h2>{selected.name}</h2><p>{path.map((item) => item.name).join(' / ')}</p></div><span className={`admin-category-status ${selected.is_active === false ? 'is-archived' : 'is-active'}`}>{selected.is_active === false ? 'مؤرشف' : 'نشط'}</span></div>
          <div className="admin-category-meta">
            <div><span>الرمز</span><strong dir="auto">{selected.code || 'غير محدد'}</strong></div>
            <div><span>الأب</span><strong>{selected.parent_id ? categories.find((item) => item.id === selected.parent_id)?.name ?? 'غير موجود' : 'تصنيف رئيسي'}</strong></div>
            <div><span>الفروع المباشرة</span><strong>{children.length}</strong></div>
          </div>
          <div className="admin-category-tabs" role="tablist" aria-label="تفاصيل التصنيف">
            <button role="tab" type="button" aria-selected={tab === 'overview'} onClick={() => setTab('overview')}>نظرة عامة</button>
            <button role="tab" type="button" aria-selected={tab === 'children'} onClick={() => setTab('children')}>التصنيفات الفرعية</button>
            <button role="tab" type="button" aria-selected={tab === 'products'} onClick={() => setTab('products')}>المنتجات المرتبطة</button>
            <button role="tab" type="button" aria-label="الأسعار والمخزون" aria-selected={tab === 'catalog'} onClick={() => setTab('catalog')}>الأسعار والمخزون</button>
          </div>
          {tab === 'overview' && <div className="admin-category-overview">
            <p>المعرّف: <code dir="ltr">{selected.id}</code></p>
            {selected.description && <p>{selected.description}</p>}
            {selected.parent_id && <button type="button" className="admin-category-link" onClick={() => selectCategory(selected.parent_id)}>الانتقال إلى الأب</button>}
            {selected.is_active !== false && canManage && <button type="button" className="btn outline" onClick={() => setCreateParent(selected.id)}><Plus size={15}/> إضافة فرع تحت هذا الأب</button>}
            {canManage && selected.is_active !== false && <form className="admin-category-rename" onSubmit={renameCategory}>
              <label>تعديل الاسم<input value={renameDraft} onChange={(event) => setRenameDraft(event.target.value)} maxLength={100} required /></label>
              <button type="submit" className="btn outline" disabled={renaming || !renameDraft.trim()}><Pencil size={15}/>{renaming ? 'جار الحفظ…' : 'حفظ الاسم'}</button>
            </form>}
            {canManage && selected.is_active !== false && <button type="button" className="btn danger" onClick={() => void archiveCategory(selected)} disabled={busyId !== null}><AlertTriangle size={15}/>{busyId === selected.id ? 'جارٍ الأرشفة…' : 'أرشفة التصنيف'}</button>}
            {canManage && selected.is_active === false && <button type="button" className="btn outline" onClick={() => void restoreCategory(selected)} disabled={busyId !== null}><RotateCcw size={15}/>{busyId === selected.id ? 'جارٍ الاستعادة…' : 'استعادة التصنيف'}</button>}
          </div>}
          {tab === 'children' && <div className="admin-category-child-list">{children.length ? children.map((node) => <button type="button" key={node.category.id} onClick={() => selectCategory(node.category.id)}><FolderTree size={15}/><span>{node.category.name}</span><ChevronLeft size={14}/></button>) : <p>لا توجد فروع مباشرة.</p>}</div>}
          {tab === 'products' && <div className="admin-category-products">
            {!productsLoading && !productsError && <p className="admin-category-legend">{products.length === 100
              ? 'أظهرت القراءة 100 منتج على الأقل؛ العدد الإجمالي غير متاح من المصدر الحالي.'
              : `عدد المنتجات المرتبطة مباشرة: ${formatNumber(products.length)}`}</p>}
            {productsLoading ? <div className="admin-category-state"><LoaderCircle size={17} className="spin"/> جارٍ تحميل المنتجات</div>
              : productsError ? <div className="admin-category-error" role="alert"><AlertTriangle size={16}/><span>{productsError}</span><button type="button" className="btn outline" onClick={() => setProductsRetry((value) => value + 1)} disabled={productsLoading}><RefreshCw size={14}/> إعادة المحاولة</button></div>
                : products.length ? <>{products.map((product) => <button type="button" key={product.id} className="admin-category-product-row" aria-label={`فتح المنتج ${product.name}`} onClick={() => onOpenProduct(product)}><div><strong>{product.name}</strong><span>{product.item_code} · {product.unit}</span></div><span>{product.status ?? 'الحالة غير محددة'}</span><ChevronLeft size={15} /></button>)}{products.length === 100 && <p className="admin-category-legend">يعرض المصدر أول 100 منتج فقط، دون ادعاء عدد إجمالي.</p>}</>
                  : <div className="admin-category-empty"><strong>لا توجد منتجات مرتبطة</strong><span>هذه نتيجة المصدر الفعلي للتصنيف المختار.</span></div>}
          </div>}

          {tab === 'catalog' && <div className="admin-category-catalog" aria-label="الأسعار والمخزون">
            <div className="admin-category-catalog__toolbar">
              <div>
                <strong>قراءة فقط من كتالوج المؤسسة</strong>
                <p>{canViewPrices ? 'السعر الأساسي متاح للأدوار الإدارية المصرح لها.' : 'السعر الأساسي غير معروض وفق صلاحية الدور.'} أرصدة المخزون مرتبطة بالمستودع النشط في سياق الحساب.</p>
              </div>
              <span>صفحة {catalogPage}</span>
            </div>
            {catalogLoading ? <div className="admin-category-state"><LoaderCircle size={17} className="spin" /> جارٍ تحميل بيانات الكتالوج والمخزون</div>
              : catalogError ? <div className="admin-category-error" role="alert"><AlertTriangle size={16} /><span>{catalogError}</span><button type="button" className="btn outline" onClick={() => setCatalogRetry((value) => value + 1)}><RefreshCw size={14} /> إعادة المحاولة</button></div>
                : catalogItems.length ? <>
                  <div className="admin-category-catalog__table-wrap">
                    <table aria-label="أسعار ومخزون المنتجات المرتبطة مباشرة بالتصنيف">
                      <thead><tr><th>الصنف</th><th>الحالة</th>{canViewPrices && <th>السعر الأساسي</th>}<th>على اليد</th><th>المتاح</th><th>حد إعادة الطلب</th><th>حالة المخزون</th></tr></thead>
                      <tbody>{catalogItems.map((product) => {
                        const metrics = projectAdminCategoryCatalogMetrics(product, { canViewPrice: canViewPrices, canViewInventory: canOpen });
                        const stockLabel = metrics.stockStatus === 'low' ? 'منخفض' : metrics.stockStatus === 'adequate' ? 'ضمن الحد' : 'غير متاح';
                        const lifecycleLabel = product.status === 'active' ? 'نشط' : product.status === 'inactive' ? 'مؤرشف' : 'غير محدد';
                        return <tr key={product.id}>
                          <td><button type="button" className="admin-category-catalog__product" aria-label={'فتح المنتج ' + product.name} onClick={() => onOpenProduct({ id: product.id, name: product.name, item_code: product.item_code, unit: product.unit, status: product.status ?? null })}><strong>{product.name}</strong><small>{product.item_code} · {product.unit}</small></button></td>
                          <td>{lifecycleLabel}</td>
                          {canViewPrices && <td>{metrics.price === null ? 'غير متاح' : formatCurrency(metrics.price)}</td>}
                          <td>{metrics.quantityOnHand === null ? 'غير متاح' : formatNumber(metrics.quantityOnHand)}</td>
                          <td>{metrics.quantityAvailable === null ? 'غير متاح' : formatNumber(metrics.quantityAvailable)}</td>
                          <td>{metrics.reorderPoint === null ? 'غير متاح' : formatNumber(metrics.reorderPoint)}</td>
                          <td><span className={'admin-category-catalog__status is-' + metrics.stockStatus}>{stockLabel}</span></td>
                        </tr>;
                      })}</tbody>
                    </table>
                  </div>
                  {catalogItems.some((product) => !product.inventory) && <p className="admin-category-legend">بعض الأرصدة غير متاحة في المستودع النشط؛ لم يتم استبدالها بقيم صفرية.</p>}
                  <div className="admin-category-catalog__pagination">
                    <span>صفحة {catalogPage} · يعرض المصدر حتى 40 منتجاً في الصفحة</span>
                    <div>
                      {catalogPage > 1 && <button type="button" className="btn outline" onClick={() => setCatalogPage((page) => Math.max(1, page - 1))}>السابق</button>}
                      {catalogHasNextPage && <button type="button" className="btn outline" onClick={() => setCatalogPage((page) => page + 1)}>التالي</button>}
                    </div>
                  </div>
                </> : <div className="admin-category-empty"><strong>لا توجد منتجات مرتبطة مباشرة بهذا التصنيف</strong><span>هذه نتيجة صفحة الكتالوج المؤسسية؛ لا تشمل منتجات الفروع التابعة ولا تعرض عدداً إجمالياً غير محسوب.</span></div>}
          </div>}
        </>}
      </section>
    </div>
  </div>;
}
