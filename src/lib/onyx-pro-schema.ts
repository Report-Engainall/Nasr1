/**
 * Canonical Onyx Pro exchange contract used by templates, header matching and previews.
 * The Arabic labels are user-facing workbook headers; field keys are stable integration IDs.
 * These are normalized contract names, not a claim about every Onyx Pro installation's native labels.
 */
export type OnyxProField = {
  field: string;
  header: string;
  required?: boolean;
};

export type OnyxProDataset = {
  id: string;
  sheetName: string;
  label: string;
  description: string;
  keyFields: readonly string[];
  fields: readonly OnyxProField[];
};

const f = (field: string, header: string, required = false): OnyxProField =>
  required ? { field, header, required: true } : { field, header };

export const ONYX_PRO_DATASETS: readonly OnyxProDataset[] = [
  {
    id: "orders",
    sheetName: "Orders",
    label: "رؤوس الطلبات",
    description: "رأس كل طلب مرة واحدة؛ اربطه بتفاصيله باستخدام order_number أو order_id.",
    keyFields: ["order_number"],
    fields: [
      f("order_id","معرّف الطلب"),f("external_order_id","المعرّف الخارجي للطلب"),f("order_number","رقم الطلب",true),
      f("external_order_number","رقم الطلب في أونكس"),f("order_type","نوع الطلب"),f("order_status","حالة الطلب"),
      f("order_date","تاريخ الطلب",true),f("requested_delivery_date","تاريخ التسليم المطلوب"),f("delivery_date","تاريخ التسليم"),
      f("customer_code","رقم العميل",true),f("customer_name","اسم العميل"),f("customer_phone","هاتف العميل"),
      f("customer_address","عنوان العميل"),f("branch_code","كود الفرع"),f("warehouse_code","كود المخزن"),
      f("salesperson_code","كود مندوب البيع"),f("salesperson_name","اسم مندوب البيع"),f("territory_code","كود المنطقة"),
      f("price_level_code","مستوى التسعير"),f("currency_code","العملة"),f("exchange_rate","سعر الصرف"),
      f("payment_method","طريقة الدفع"),f("payment_terms","شروط الدفع"),f("payment_status","حالة السداد"),
      f("shipping_method","طريقة التوصيل"),f("shipping_status","حالة التوصيل"),f("shipping_address","عنوان التوصيل"),
      f("shipping_city","مدينة التوصيل"),f("shipping_phone","هاتف التوصيل"),f("subtotal","الإجمالي قبل الخصم والضريبة"),
      f("discount_type","نوع الخصم على الطلب"),f("discount_rate","نسبة خصم الطلب"),f("discount_amount","قيمة خصم الطلب"),
      f("tax_rate","نسبة الضريبة"),f("tax_amount","قيمة الضريبة"),f("shipping_cost","تكلفة التوصيل"),
      f("additional_charges","رسوم إضافية"),f("grand_total","الإجمالي النهائي"),f("paid_amount","المبلغ المدفوع"),
      f("remaining_amount","المبلغ المتبقي"),f("reference_number","الرقم المرجعي"),f("source_channel","قناة إنشاء الطلب"),
      f("external_reference","مرجع النظام المصدر"),f("customer_notes","ملاحظات العميل"),f("internal_notes","ملاحظات داخلية"),
      f("created_by","أنشئ بواسطة"),f("approved_by","اعتمد بواسطة"),f("created_at","وقت الإنشاء"),f("updated_at","وقت التحديث"),
    ],
  },
  {
    id: "order_lines",
    sheetName: "OrderLines",
    label: "تفاصيل الطلبات",
    description: "صف لكل صنف داخل الطلب؛ لا تكرر رأس الطلب، واربط كل التفاصيل برقم الطلب.",
    keyFields: ["order_number","line_number"],
    fields: [
      f("item_code","رقم الصنف",true),f("product_name","اسم الصنف"),f("unit","الوحدة"),f("warehouse_name","المخزن"),
      f("quantity","الكمية",true),f("free_quantity","ك.المجانية"),f("unit_price","السعر"),f("batch_number","رقم الدفعة"),
      f("expiry_date","تاريخ الانتهاء"),f("beneficiary_id","رقم المستفيد"),f("cost_center","مركز التكلفة"),
      f("project","المشروع"),f("activity","النشاط"),f("quotation_number","رقم عرض السعر"),f("numeric_unit","الوحدة العددية"),
      f("discount_1","الخصم1"),f("discount_2","الخصم2"),f("discount_3","الخصم3"),
      f("discount_type","نوع الخصم (1-نسبة، 2-مبلغ)"),f("reserve_quantities","حجز الكميات"),
      f("reservation_until","إلى تاريخ"),f("reserved_quantity","الكمية المحجوزة"),f("order_number","البيان",true),
      f("length","الطول"),f("width","العرض"),f("height","الارتفاع"),f("count","العدد"),
      f("order_id","معرّف الطلب"),f("line_number","رقم السطر"),f("base_unit_code","كود الوحدة الأساسية"),
      f("base_quantity","الكمية بالوحدة الأساسية"),f("line_status","حالة البند"),f("currency_code","عملة البند"),
      f("tax_code","كود الضريبة"),f("tax_rate","نسبة الضريبة"),f("tax_amount","قيمة الضريبة"),
      f("line_subtotal","إجمالي البند قبل الخصم"),f("line_total","صافي البند"),f("source_line_id","معرّف البند في المصدر"),
    ],
  },
  {
    id: "products",
    sheetName: "Products",
    label: "الأصناف والمنتجات",
    description: "الهوية والوصف والتصنيف والوحدات والباركود والخصائص والأسعار المرجعية.",
    keyFields: ["product_code"],
    fields: [
      f("product_id","معرّف الصنف"),f("external_product_id","المعرّف الخارجي للصنف"),f("product_code","رقم الصنف",true),
      f("sku","SKU"),f("barcode","الباركود"),f("barcode_2","باركود إضافي 2"),f("barcode_3","باركود إضافي 3"),
      f("product_name","اسم الصنف",true),f("product_name_en","اسم الصنف بالإنجليزية"),f("short_description","وصف مختصر"),
      f("description","الوصف التفصيلي"),f("main_group_code","كود المجموعة الرئيسية"),f("main_group_name","المجموعة الرئيسية"),
      f("subgroup_code","كود المجموعة الفرعية"),f("subgroup_name","المجموعة الفرعية"),f("category_code","كود التصنيف"),
      f("category_name","اسم التصنيف"),f("brand_code","كود العلامة التجارية"),f("brand_name","العلامة التجارية"),
      f("manufacturer","الشركة المصنعة"),f("model","الموديل"),f("product_type","نوع الصنف"),
      f("base_unit_code","كود الوحدة الأساسية"),f("base_unit_name","اسم الوحدة الأساسية"),
      f("sales_unit_code","كود وحدة البيع"),f("purchase_unit_code","كود وحدة الشراء"),
      f("default_warehouse_code","كود المخزن الافتراضي"),f("tax_code","كود الضريبة"),f("tax_rate","نسبة الضريبة"),
      f("currency_code","العملة"),f("cost_price","سعر التكلفة"),f("average_cost","متوسط التكلفة"),
      f("last_purchase_price","آخر سعر شراء"),f("price_retail","سعر التجزئة"),f("price_wholesale","سعر الجملة"),
      f("price_wholesale_of_wholesale","سعر جملة الجملة"),f("minimum_price","الحد الأدنى لسعر البيع"),
      f("maximum_price","الحد الأعلى لسعر البيع"),f("min_stock","الحد الأدنى للمخزون"),
      f("max_stock","الحد الأعلى للمخزون"),f("reorder_point","نقطة إعادة الطلب"),f("reorder_quantity","كمية إعادة الطلب"),
      f("track_inventory","تتبع المخزون"),f("allow_negative_stock","السماح بالمخزون السالب"),
      f("track_batch","تتبع الدفعات"),f("track_expiry","تتبع الصلاحية"),f("track_serial_number","تتبع الرقم التسلسلي"),
      f("expiry_days","مدة الصلاحية بالأيام"),f("country_of_origin","بلد المنشأ"),f("manufacturer_part_number","رقم قطعة المصنع"),
      f("supplier_code","كود المورد"),f("is_service","خدمة وليست صنفاً مخزونياً"),f("is_active","نشط"),
      f("product_status","حالة الصنف"),f("image_url","رابط صورة الصنف"),f("notes","ملاحظات"),
      f("created_at","وقت الإنشاء"),f("updated_at","وقت التحديث"),
    ],
  },
  {
    id: "product_units",
    sheetName: "ProductUnits",
    label: "وحدات الأصناف والتحويلات",
    description: "صف لكل وحدة بديلة ومعامل تحويلها إلى الوحدة الأساسية.",
    keyFields: ["product_code","unit_code"],
    fields: [
      f("product_code","رقم الصنف",true),f("unit_code","كود الوحدة",true),f("unit_name","اسم الوحدة",true),
      f("unit_name_en","اسم الوحدة بالإنجليزية"),f("is_base_unit","وحدة أساسية"),f("conversion_factor","معامل التحويل",true),
      f("barcode","باركود الوحدة"),f("sales_allowed","مسموح للبيع"),f("purchase_allowed","مسموح للشراء"),
      f("default_sales_unit","وحدة البيع الافتراضية"),f("default_purchase_unit","وحدة الشراء الافتراضية"),
      f("unit_cost_price","تكلفة الوحدة"),f("unit_selling_price","سعر بيع الوحدة"),f("is_active","نشطة"),
    ],
  },
  {
    id: "customers",
    sheetName: "Customers",
    label: "العملاء",
    description: "بيانات تعريف العميل والتواصل والتصنيف التجاري دون افتراض اعتماد الأرصدة أو حدود الائتمان.",
    keyFields: ["customer_code"],
    fields: [
      f("customer_id","معرّف العميل"),f("external_customer_id","المعرّف الخارجي للعميل"),f("customer_code","رقم العميل",true),
      f("customer_name","اسم العميل"),f("customer_name_en","اسم العميل بالإنجليزية"),f("business_name","الاسم التجاري",true),
      f("customer_type","نوع العميل"),f("customer_group","مجموعة العملاء"),f("customer_category","تصنيف العميل"),
      f("tax_number","الرقم الضريبي"),f("commercial_registration","السجل التجاري"),f("phone","الهاتف"),
      f("mobile","الجوال"),f("whatsapp","واتساب"),f("email","البريد الإلكتروني"),f("country","الدولة"),
      f("city","المدينة"),f("region","المنطقة"),f("district","المديرية"),f("address","العنوان"),
      f("postal_code","الرمز البريدي"),f("salesperson_code","كود مندوب المبيعات"),f("salesperson_name","مندوب المبيعات"),
      f("territory_code","كود المنطقة البيعية"),f("account_code","كود الحساب"),f("currency_code","العملة"),
      f("credit_limit","حد الائتمان"),f("opening_balance","الرصيد الافتتاحي"),f("balance_due","الرصيد المستحق"),
      f("payment_terms","شروط السداد"),f("discount_rate","نسبة الخصم"),f("price_level_code","مستوى التسعير"),
      f("tax_inclusive","الأسعار شاملة الضريبة"),f("tax_exempt","معفى من الضريبة"),f("is_active","نشط"),
      f("customer_status","حالة العميل"),f("notes","ملاحظات"),f("created_at","وقت الإنشاء"),f("updated_at","وقت التحديث"),
    ],
  },
  {
    id: "warehouses",
    sheetName: "Warehouses",
    label: "المخازن والفروع",
    description: "تعريف المخزن وموقعه والفرع المسؤول عنه.",
    keyFields: ["warehouse_code"],
    fields: [
      f("warehouse_id","معرّف المخزن"),f("external_warehouse_id","المعرّف الخارجي للمخزن"),
      f("warehouse_code","كود المخزن",true),f("warehouse_name","اسم المخزن",true),
      f("warehouse_name_en","اسم المخزن بالإنجليزية"),f("branch_code","كود الفرع"),f("branch_name","اسم الفرع"),
      f("warehouse_group_code","كود مجموعة المخازن"),f("warehouse_group_name","مجموعة المخازن"),
      f("country","الدولة"),f("city","المدينة"),f("address","العنوان"),f("manager_code","كود أمين المخزن"),
      f("manager_name","أمين المخزن"),f("phone","الهاتف"),f("is_default","المخزن الافتراضي"),
      f("is_active","نشط"),f("notes","ملاحظات"),
    ],
  },
  {
    id: "stock_balances",
    sheetName: "StockBalances",
    label: "أرصدة المخزون",
    description: "لقطة رصيد حسب الصنف والمخزن والوحدة والدفعة والتاريخ؛ ليست سند حركة ولا تسوية تلقائية.",
    keyFields: ["product_code","warehouse_code","unit_code","as_of_date"],
    fields: [
      f("snapshot_id","معرّف اللقطة"),f("product_code","رقم الصنف",true),f("barcode","الباركود"),
      f("warehouse_code","كود المخزن",true),f("branch_code","كود الفرع"),f("location_code","كود الموقع"),
      f("unit_code","كود الوحدة"),f("base_unit_code","كود الوحدة الأساسية"),
      f("quantity_on_hand","الكمية الموجودة"),f("quantity_reserved","الكمية المحجوزة"),
      f("quantity_available","الكمية المتاحة"),f("quantity_incoming","الكمية الواردة"),
      f("quantity_damaged","الكمية التالفة"),f("quantity_in_transit","الكمية بالطريق"),
      f("opening_quantity","الرصيد الافتتاحي"),f("opening_cost","تكلفة الرصيد الافتتاحي"),
      f("average_unit_cost","متوسط تكلفة الوحدة"),f("total_stock_value","قيمة المخزون"),
      f("currency_code","العملة"),f("batch_number","رقم الدفعة"),f("lot_number","رقم التشغيلة"),
      f("serial_number","الرقم التسلسلي"),f("manufacture_date","تاريخ التصنيع"),f("expiry_date","تاريخ الانتهاء"),
      f("last_movement_date","تاريخ آخر حركة"),f("last_count_date","تاريخ آخر جرد"),
      f("stock_status","حالة المخزون"),f("as_of_date","الرصيد في تاريخ",true),
    ],
  },
  {
    id: "stock_movements",
    sheetName: "StockMovements",
    label: "حركات المخزون",
    description: "سجل حركات منفصل عن الأرصدة؛ كل حركة مرتبطة بمستند ومخزن ووحدة.",
    keyFields: ["movement_id"],
    fields: [
      f("movement_id","معرّف الحركة",true),f("external_movement_id","معرّف الحركة الخارجي"),
      f("document_number","رقم المستند"),f("document_type","نوع المستند"),f("movement_type","نوع الحركة"),
      f("movement_status","حالة الحركة"),f("transaction_date","تاريخ العملية",true),f("posting_date","تاريخ الترحيل"),
      f("product_code","رقم الصنف",true),f("barcode","الباركود"),f("warehouse_code","كود المخزن"),
      f("source_warehouse_code","كود المخزن المصدر"),f("destination_warehouse_code","كود المخزن المستلم"),
      f("branch_code","كود الفرع"),f("unit_code","كود الوحدة"),f("base_unit_code","كود الوحدة الأساسية"),
      f("quantity","الكمية",true),f("base_quantity","الكمية الأساسية"),f("unit_cost","تكلفة الوحدة"),
      f("total_cost","إجمالي التكلفة"),f("currency_code","العملة"),f("batch_number","رقم الدفعة"),
      f("lot_number","رقم التشغيلة"),f("serial_number","الرقم التسلسلي"),f("manufacture_date","تاريخ التصنيع"),
      f("expiry_date","تاريخ الانتهاء"),f("reference_number","الرقم المرجعي"),f("reference_type","نوع المرجع"),
      f("source_document_number","رقم مستند المصدر"),f("created_by","أنشأها"),f("approved_by","اعتمدها"),
      f("notes","ملاحظات"),f("created_at","وقت الإنشاء"),f("updated_at","وقت التحديث"),
    ],
  },
  {
    id: "price_lists",
    sheetName: "PriceLists",
    label: "مستويات وقوائم التسعير",
    description: "رؤوس قوائم الأسعار ونطاق سريانها وعملتها وأولويتها.",
    keyFields: ["price_list_code"],
    fields: [
      f("price_list_id","معرّف قائمة الأسعار"),f("external_price_list_id","المعرّف الخارجي لقائمة الأسعار"),
      f("price_list_code","كود قائمة الأسعار",true),f("price_list_name","اسم قائمة الأسعار",true),
      f("price_list_name_en","اسم قائمة الأسعار بالإنجليزية"),f("price_level_code","كود مستوى التسعير"),
      f("price_level_name","اسم مستوى التسعير"),f("customer_group_code","كود مجموعة العملاء"),
      f("customer_code","رقم العميل"),f("currency_code","العملة",true),f("exchange_rate","سعر الصرف"),
      f("tax_inclusive","الأسعار شاملة الضريبة"),f("price_list_type","نوع قائمة الأسعار"),
      f("effective_from","ساري من"),f("effective_to","ساري حتى"),f("priority","الأولوية"),
      f("is_default","القائمة الافتراضية"),f("is_active","نشطة"),f("notes","ملاحظات"),
      f("created_at","وقت الإنشاء"),f("updated_at","وقت التحديث"),
    ],
  },
  {
    id: "price_list_lines",
    sheetName: "PriceListLines",
    label: "أسعار الأصناف",
    description: "سعر كل صنف حسب القائمة والوحدة والعملة وحدود الكمية والعميل.",
    keyFields: ["price_list_code","product_code","unit_code","minimum_quantity"],
    fields: [
      f("price_line_id","معرّف سطر السعر"),f("external_price_line_id","معرّف سطر السعر الخارجي"),
      f("price_list_code","كود قائمة الأسعار",true),f("price_level_code","كود مستوى التسعير"),
      f("product_code","رقم الصنف",true),f("sku","SKU"),f("barcode","الباركود"),
      f("unit_code","كود الوحدة"),f("base_unit_code","كود الوحدة الأساسية"),
      f("minimum_quantity","الحد الأدنى للكمية"),f("maximum_quantity","الحد الأعلى للكمية"),
      f("unit_price","سعر الوحدة",true),f("original_price","السعر الأصلي"),f("discount_rate","نسبة الخصم"),
      f("discount_amount","قيمة الخصم"),f("minimum_selling_price","أدنى سعر بيع"),
      f("tax_code","كود الضريبة"),f("tax_rate","نسبة الضريبة"),f("tax_inclusive","السعر شامل الضريبة"),
      f("currency_code","العملة",true),f("valid_from","ساري من"),f("valid_to","ساري حتى"),
      f("customer_code","رقم العميل"),f("customer_group_code","كود مجموعة العملاء"),
      f("is_active","نشط"),f("notes","ملاحظات"),
    ],
  },
  {
    id: "promotions",
    sheetName: "Promotions",
    label: "الخصومات والعروض",
    description: "قواعد العروض والخصومات المرتبطة بالصنف أو المجموعة أو العميل وفترة الصلاحية.",
    keyFields: ["promotion_code"],
    fields: [
      f("promotion_id","معرّف العرض"),f("promotion_code","كود العرض",true),f("promotion_name","اسم العرض",true),
      f("promotion_type","نوع العرض"),f("product_code","رقم الصنف"),f("product_group_code","كود مجموعة الأصناف"),
      f("customer_code","رقم العميل"),f("customer_group_code","كود مجموعة العملاء"),
      f("price_level_code","مستوى التسعير"),f("minimum_quantity","أقل كمية"),
      f("maximum_quantity","أعلى كمية"),f("discount_rate","نسبة الخصم"),
      f("discount_amount","قيمة الخصم"),f("free_quantity","كمية مجانية"),
      f("free_product_code","كود الصنف المجاني"),f("currency_code","العملة"),
      f("start_date","تاريخ البداية",true),f("end_date","تاريخ النهاية"),
      f("priority","الأولوية"),f("is_active","نشط"),f("notes","ملاحظات"),
      f("created_at","وقت الإنشاء"),f("updated_at","وقت التحديث"),
    ],
  },
  {
    id: "integration_mapping",
    sheetName: "Mapping",
    label: "مطابقة المعرفات",
    description: "حفظ علاقة معرفات أونكس بمعرفات الأغبري لمنع إنشاء سجلات مكررة.",
    keyFields: ["source_system","entity_type","source_record_id"],
    fields: [
      f("mapping_id","معرّف المطابقة"),f("source_system","النظام المصدر",true),f("target_system","النظام الهدف",true),
      f("entity_type","نوع السجل",true),f("source_record_id","معرّف السجل في المصدر",true),
      f("source_record_code","كود السجل في المصدر"),f("target_record_id","معرّف السجل في الأغبري"),
      f("target_record_code","كود السجل في الأغبري"),f("source_company_code","كود منشأة المصدر"),
      f("target_company_code","كود منشأة الأغبري"),f("source_branch_code","كود فرع المصدر"),
      f("target_branch_code","كود فرع الأغبري"),f("sync_direction","اتجاه المزامنة"),
      f("last_sync_at","وقت آخر مزامنة"),f("last_sync_status","حالة آخر مزامنة"),
      f("last_error","آخر خطأ"),f("source_updated_at","وقت تحديث المصدر"),
      f("target_updated_at","وقت تحديث الهدف"),f("created_at","وقت الإنشاء"),f("updated_at","وقت التحديث"),
    ],
  },
] as const;

export const ONYX_PRO_DATASET_BY_ID = Object.fromEntries(
  ONYX_PRO_DATASETS.map((dataset) => [dataset.id, dataset]),
) as Record<string, OnyxProDataset>;

export function getOnyxProHeaderSynonyms(datasetId: string): Record<string, string> {
  const dataset = ONYX_PRO_DATASET_BY_ID[datasetId];
  if (!dataset) throw new Error("نوع بيانات أونكس غير معروف.");
  return Object.fromEntries(dataset.fields.flatMap((field) => [
    [field.header, field.field] as const,
    [field.field, field.field] as const,
  ]));
}

/**
 * Global aliases include only headings with one unambiguous canonical meaning.
 * Dataset-specific mapping remains available above for names such as "رقم الصنف".
 */
const onyxHeaderCandidates = new Map<string, Set<string>>();
for (const dataset of ONYX_PRO_DATASETS) {
  for (const field of dataset.fields) {
    for (const alias of [field.header, field.field]) {\n      if (alias === "البيان") continue;
      const candidates = onyxHeaderCandidates.get(alias) ?? new Set<string>();
      candidates.add(field.field);
      onyxHeaderCandidates.set(alias, candidates);
    }
  }
}
export const ONYX_PRO_HEADER_SYNONYMS: Record<string, string> = Object.fromEntries(
  [...onyxHeaderCandidates.entries()].flatMap(([alias, candidates]) =>
    candidates.size === 1 ? [[alias, [...candidates][0]]] : [],
  ),
);

export function getOnyxProHeaders(datasetId: string): string[] {
  const dataset = ONYX_PRO_DATASET_BY_ID[datasetId];
  if (!dataset) throw new Error("نوع بيانات أونكس غير معروف.");
  return dataset.fields.map((field) => field.header);
}

export function buildOnyxProHeaderCsv(datasetId: string): string {
  const headers = getOnyxProHeaders(datasetId);
  const cells = headers.map((header) => '"' + header.replace(/"/g, '""') + '"');
  return "\uFEFF" + cells.join(",") + "\r\n";
}
