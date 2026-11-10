
function Products({ onNotice, initialSearch }: { onNotice: (m: string) => void; initialSearch?: string }) {
  const { user } = useAuth();
  const canManageProductLifecycle = Boolean(user?.roles.some((role) => role === 'admin' || role === 'manager'));
  const canUploadProductImages = Boolean(user?.roles.some((role) => ['admin', 'manager', 'staff'].includes(role)));
  const canManageReorderPoint = canManageProductLifecycle;
  const [lifecycleBusyId, setLifecycleBusyId] = useState<string | null>(null);
  const { data, loading, error, refetch } = useFetch(fetchProducts);
  const { data: warehouses, loading: warehousesLoading, error: warehousesError } = useFetch(fetchActiveInventoryWarehouses);
  const [query, setQuery] = useState(initialSearch ?? '');
  useEffect(() => { if (initialSearch?.trim()) setQuery(initialSearch); }, [initialSearch]);
  const [modal, setModal] = useState(false);
  const [editing, setEditing] = useState<ProductWithInventory | null>(null);
  const [transferProduct, setTransferProduct] = useState<ProductWithInventory | null>(null);
  const [transferSource, setTransferSource] = useState('');
  const [transferDestination, setTransferDestination] = useState('');
  const [transferQuantity, setTransferQuantity] = useState('1');
  const [transferReason, setTransferReason] = useState('نقل مخزون بين المستودعات');
  const [transferKey, setTransferKey] = useState('');
  const [transferSaving, setTransferSaving] = useState(false);
  const [transferError, setTransferError] = useState('');
  const [thresholdProduct, setThresholdProduct] = useState<ProductWithInventory | null>(null);
  const [thresholdWarehouse, setThresholdWarehouse] = useState('');
  const [thresholdValue, setThresholdValue] = useState('');
  const [thresholdReason, setThresholdReason] = useState('مراجعة حد إعادة الطلب');
  const [thresholdCurrent, setThresholdCurrent] = useState<{ reorder_point: number | null; quantity_available: number } | null>(null);
  const [thresholdLoading, setThresholdLoading] = useState(false);
  const [thresholdSaving, setThresholdSaving] = useState(false);
  const [thresholdError, setThresholdError] = useState('');
  const thresholdRequestSequence = useRef(0);
  const rows = (data ?? []).filter((p) =>
    [p.name, p.item_code, p.sku ?? '', p.barcode ?? ''].join(' ').toLocaleLowerCase('ar').includes(query.trim().toLocaleLowerCase('ar')),
  );
  async function archive(product: ProductWithInventory) {
    if (!canManageProductLifecycle || lifecycleBusyId) return;
    if (!window.confirm('أرشفة ' + product.name + '؟ لن يظهر المنتج في المتجر، ويمكن إعادة تفعيله لاحقًا.')) return;
    setLifecycleBusyId(product.id);
    try {
      const result = await archiveAdminCatalogProduct(product.id);
      if (result.id !== product.id || result.status !== 'inactive' || result.archived !== true) {
        throw new Error('لم يؤكد الخادم أرشفة المنتج؛ لم يتم إعلان النجاح.');
      }
      await refetch();
      onNotice('تمت أرشفة المنتج وإخفاؤه من المتجر.');
    } catch (cause) {
      onNotice(cause instanceof Error ? cause.message : 'تعذر أرشفة المنتج.');
    } finally {
      setLifecycleBusyId(null);
    }
  }
  async function restore(product: ProductWithInventory) {
    if (!canManageProductLifecycle || lifecycleBusyId) return;
    if (!window.confirm('إعادة تفعيل ' + product.name + '؟ سيعود المنتج إلى الكتالوج وفق قواعد المتجر.')) return;
    setLifecycleBusyId(product.id);
    try {
      const saved = await updateProduct(product.id, { status: 'active' });
      if (saved.id !== product.id) {
        throw new Error('لم يؤكد الخادم إعادة تفعيل المنتج؛ حدّث القائمة قبل إعادة المحاولة.');
      }
      await refetch();
      onNotice('تمت إعادة تفعيل المنتج.');
    } catch (cause) {
      onNotice(cause instanceof Error ? cause.message : 'تعذر إعادة تفعيل المنتج.');
    } finally {
      setLifecycleBusyId(null);
    }
  }
  function openTransfer(product: ProductWithInventory) {
    setTransferProduct(product);
    setTransferSource(product.inventory?.warehouse_id ?? warehouses?.[0]?.id ?? '');
    setTransferDestination('');
    setTransferQuantity('1');
    setTransferReason('نقل مخزون بين المستودعات');
    setTransferKey(crypto.randomUUID());
    setTransferError('');
  }
  async function submitTransfer() {
    if (!transferProduct) return;
    setTransferSaving(true);
    setTransferError('');
    try {
      const result = await transferInventory({ productId: transferProduct.id, sourceWarehouseId: transferSource, destinationWarehouseId: transferDestination, quantity: Number(transferQuantity), reason: transferReason, idempotencyKey: transferKey });
      setTransferProduct(null);
      setTransferKey('');
      refetch();
      onNotice(result.idempotent_replay ? 'النقل السابق مؤكد؛ لم تُكرر الحركة.' : 'تم نقل المخزون وحفظ حركتي المستودعين.');
    } catch (e) { setTransferError(e instanceof Error ? e.message : 'تعذر نقل المخزون.'); }
    finally { setTransferSaving(false); }
  }
  async function loadThresholdSnapshot(productId: string, warehouseId: string) {
    const requestId = ++thresholdRequestSequence.current;
    setThresholdLoading(true);
    setThresholdCurrent(null);
    setThresholdValue('');
    setThresholdError('');
    try {
      const current = await fetchInventoryReorderPoint(productId, warehouseId);
      if (requestId !== thresholdRequestSequence.current) return;
      setThresholdCurrent(current);
      if (current) setThresholdValue(current.reorder_point === null ? '' : String(current.reorder_point));
      else setThresholdError('لا يوجد رصيد مخزون مثبت لهذا الصنف في المستودع. لن ننشئ كمية صفرية افتراضية؛ سجّل رصيدًا موثوقًا أولًا.');
    } catch (e) {
      if (requestId === thresholdRequestSequence.current) setThresholdError(e instanceof Error ? e.message : 'تعذر قراءة حد إعادة الطلب الحالي.');
    } finally {
      if (requestId === thresholdRequestSequence.current) setThresholdLoading(false);
    }
  }
  function openThreshold(product: ProductWithInventory) {
    if (!canManageReorderPoint) return;
    setThresholdProduct(product);
    const warehouseId = product.inventory?.warehouse_id ?? warehouses?.[0]?.id ?? '';
    setThresholdWarehouse(warehouseId);
    setThresholdReason('مراجعة حد إعادة الطلب');
    setThresholdCurrent(null);
    setThresholdValue('');
    setThresholdError('');
    if (warehouseId) void loadThresholdSnapshot(product.id, warehouseId);
    else setThresholdError('لا يوجد مستودع نشط محدد لهذه المؤسسة.');
  }
  function closeThreshold() {
    thresholdRequestSequence.current += 1;
    if (!thresholdSaving) setThresholdProduct(null);
  }
  async function submitThreshold() {
    if (!thresholdProduct || !thresholdWarehouse) return;
    const threshold = Number(thresholdValue);
    if (!Number.isSafeInteger(threshold) || threshold < 0 || threshold > 1000000000) { setThresholdError('أدخل حدًا صحيحًا بين صفر ومليار.'); return; }
    if (!thresholdReason.trim() || thresholdReason.trim().length > 1000) { setThresholdError('سبب التعديل مطلوب ولا يتجاوز 1000 حرف.'); return; }
    if (!thresholdCurrent) { setThresholdError('لا يمكن تعديل الحد دون رصيد مخزون مثبت في المستودع المحدد.'); return; }
    setThresholdSaving(true);
    setThresholdError('');
    try {
      const result = await setInventoryReorderPoint({ productId: thresholdProduct.id, warehouseId: thresholdWarehouse, reorderPoint: threshold, reason: thresholdReason });
      setThresholdProduct(null);
      await refetch();
      onNotice(result.unchanged ? 'حد إعادة الطلب مضبوط بالفعل على القيمة نفسها.' : 'تم تحديث حد إعادة الطلب وسجل التعديل؛ أعيد تقييم مهمة الشراء تلقائيًا.');
    } catch (e) { setThresholdError(e instanceof Error ? e.message : 'تعذر حفظ حد إعادة الطلب.'); }
    finally { setThresholdSaving(false); }
  }

  function renderTransferModal() {
    if (!transferProduct) return null;
    return (
      <Modal title={'نقل مخزون — ' + transferProduct.name} onClose={() => { if (!transferSaving) setTransferProduct(null); }}>
      <p style={{ marginTop: 0, color: 'var(--muted-foreground, #64748b)' }}>يُنفَّذ النقل بمعاملة واحدة، ولا تُنقل الكميات المحجوزة للطلبات. إعادة المحاولة بنفس المفتاح لا تكرر الحركة.</p>
      {warehousesLoading ? <Loading /> : warehousesError ? <ErrorBox message={warehousesError} /> : (warehouses ?? []).length < 2 ? <ErrorBox message="يلزم وجود مستودعين نشطين على الأقل داخل المؤسسة لإجراء النقل." /> : <>
        <Field label="مستودع المصدر"><select value={transferSource} onChange={(e) => setTransferSource(e.target.value)}><option value="">اختر المستودع المصدر</option>{(warehouses ?? []).map((w) => <option key={w.id} value={w.id}>{w.name}{w.code ? ' — ' + w.code : ''}</option>)}</select></Field>
        <Field label="المستودع المستلم"><select value={transferDestination} onChange={(e) => setTransferDestination(e.target.value)}><option value="">اختر المستودع المستلم</option>{(warehouses ?? []).filter((w) => w.id !== transferSource).map((w) => <option key={w.id} value={w.id}>{w.name}{w.code ? ' — ' + w.code : ''}</option>)}</select></Field>
        <div className="form-grid"><Field label="الكمية المراد نقلها (يُتحقق الخادم من المتاح بعد الحجوزات)"><input type="number" min="0.001" max="999999999999.999" step="0.001" value={transferQuantity} onChange={(e) => setTransferQuantity(e.target.value)} /></Field><Field label="سبب النقل"><input maxLength={1000} value={transferReason} onChange={(e) => setTransferReason(e.target.value)} /></Field></div>
        {transferError && <div className="form-error" role="alert">{transferError}</div>}
        <div className="modal-actions"><Button variant="outline" onClick={() => setTransferProduct(null)} disabled={transferSaving}>إلغاء</Button><Button onClick={submitTransfer} disabled={transferSaving || !transferSource || !transferDestination || transferSource === transferDestination || !transferQuantity || !transferReason.trim()}>{transferSaving ? 'جارٍ تسجيل حركة النقل...' : 'تنفيذ النقل'}</Button></div>
      </>}
    </Modal>
    );
  }

  function renderThresholdSnapshot() {
    if (thresholdLoading) return <Loading />;
    if (!thresholdCurrent) return null;
    return (
      <p style={{ margin: 0, color: 'var(--muted-foreground, #64748b)' }}>
        المتاح المسجل: {formatNumber(thresholdCurrent.quantity_available)} — الحد الحالي: {thresholdCurrent.reorder_point === null ? 'غير مضبوط' : formatNumber(thresholdCurrent.reorder_point)}
      </p>
    );
  }

  function renderThresholdFormContent() {
    if (warehousesLoading) return <Loading />;
    if (warehousesError) return <ErrorBox message={warehousesError} />;
    if ((warehouses ?? []).length === 0) return <ErrorBox message="لا يوجد مستودع نشط داخل المؤسسة." />;

    return (
      <>
        <Field label="المستودع">
          <select value={thresholdWarehouse} onChange={(e) => {
            const id = e.target.value;
            setThresholdWarehouse(id);
            if (id) void loadThresholdSnapshot(thresholdProduct!.id, id);
          }}>
            {(warehouses ?? []).map((w) => <option key={w.id} value={w.id}>{w.name}{w.code ? ' — ' + w.code : ''}</option>)}
          </select>
        </Field>
        {renderThresholdSnapshot()}
        <Field label="حد إعادة الطلب بوحدات الصنف">
          <input type="number" min="0" max="1000000000" step="1" value={thresholdValue} onChange={(e) => setThresholdValue(e.target.value)} placeholder="أدخل عددًا صحيحًا" />
        </Field>
        <Field label="سبب تغيير الحد">
          <input maxLength={1000} value={thresholdReason} onChange={(e) => setThresholdReason(e.target.value)} />
        </Field>
        {thresholdError && <div className="form-error" role="alert">{thresholdError}</div>}
        <div className="modal-actions">
          <Button variant="outline" onClick={closeThreshold} disabled={thresholdSaving}>إلغاء</Button>
          <Button onClick={submitThreshold} disabled={thresholdSaving || thresholdLoading || !thresholdCurrent || thresholdValue.trim() === '' || !Number.isSafeInteger(Number(thresholdValue)) || Number(thresholdValue) < 0 || Number(thresholdValue) > 1000000000 || !thresholdReason.trim()}>
            {thresholdSaving ? 'جارٍ حفظ الحد...' : 'حفظ حد إعادة الطلب'}
          </Button>
        </div>
      </>
    );
  }

  function renderThresholdModal() {
    if (!thresholdProduct) return null;
    return (
      <Modal title={'حد إعادة الطلب — ' + thresholdProduct.name} onClose={closeThreshold}>
        <p style={{ marginTop: 0, color: 'var(--muted-foreground, #64748b)' }}>
          يُحفظ الحد حسب الصنف والمستودع. تغيير الحد يحدّث مهمة إعادة الطلب تلقائيًا ويسجل السبب والمستخدم؛ لا يُنشأ رصيد مفقود افتراضيًا.
        </p>
        {renderThresholdFormContent()}
      </Modal>
    );
  }

  return <>
    <Heading eyebrow="الأصناف والمخزون" title="إدارة المنتجات" description="تحكم كامل في الكتالوج والأسعار وحدود المخزون" icon={Box} />
    <div className="toolbar"><span className="toolbar-note">{data?.length ?? 0} منتج في الكتالوج</span><div className="toolbar-actions"><Button variant="secondary" onClick={refetch}><RefreshCw size={16} /> تحديث</Button><Button onClick={() => { setEditing(null); setModal(true); }}><Plus size={17} /> إضافة منتج</Button></div></div>
    <BulkProductImageUploader
      products={data ?? []}
      canManage={canUploadProductImages}
      catalogReady={!loading && !error}
      onUploaded={async (message) => { await refetch(); onNotice(message); }}
    />
    <section className="panel table-panel"><div className="table-head"><h2>كتالوج المنتجات</h2><label className="search-field"><Search size={16} /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="ابحث بالاسم أو الرمز أو SKU أو الباركود..." /></label></div>
      {loading ? <Loading /> : error ? <ErrorBox message={error} /> : <TableWrap><table>
        <thead><tr><th>المنتج</th><th>الرمز</th><th>التصنيف</th><th>حالة المنتج</th><th>السعر</th><th>المتاح</th><th>حالة المخزون</th><th>إجراء المخزون</th><th /></tr></thead>
        <tbody>{rows.map((p) => {
          const qty = p.inventory?.quantity_available;