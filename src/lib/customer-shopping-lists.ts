import { supabase } from "@/lib/supabase";

export type ShoppingListCategory = "ramadan" | "monthly_sales" | "warehouse" | "quick_order" | "custom";
export type ShoppingListRecurrence = "none" | "weekly" | "monthly";
export type ShoppingListAccess = "view" | "edit";
export type CustomerShoppingListItem = {
  product_id: string;
  product_name: string;
  item_code: string;
  base_unit: string;
  quantity: number;
  unit_name: string;
  base_units_per_unit: number;
};
export type CustomerShoppingListShare = {
  member_profile_id: string;
  access_level: ShoppingListAccess;
  updated_at: string;
};
export type CustomerShoppingListRunSummary = {
  id: string;
  due_on: string | null;
  status: "review_required";
  created_at: string;
};
export type CustomerShoppingList = {
  id: string;
  name: string;
  category: ShoppingListCategory;
  is_draft: boolean;
  status: "active";
  recurrence: ShoppingListRecurrence;
  next_run_on: string | null;
  timezone: "Asia/Aden";
  created_at: string;
  updated_at: string;
  created_by_profile_id: string;
  can_edit: boolean;
  items: CustomerShoppingListItem[];
  shares: CustomerShoppingListShare[];
  runs: CustomerShoppingListRunSummary[];
};
export type ShoppingListLineInput = {
  product_id: string;
  quantity: number;
  unit_name: string;
  base_units_per_unit: number;
};
export type ShoppingListSaveInput = {
  id?: string | null;
  name: string;
  category: ShoppingListCategory;
  isDraft: boolean;
  recurrence: ShoppingListRecurrence;
  nextRunOn: string | null;
  items: readonly ShoppingListLineInput[];
};
export type CustomerShoppingListRun = {
  id: string;
  list_id: string;
  list_name: string;
  due_on: string | null;
  status: "review_required" | "cart_loaded" | "cancelled";
  items: CustomerShoppingListItem[];
};
export type AppliedShoppingListRun = {
  status: "cart_loaded";
  cart: { items: Array<{ product_id: string; quantity: number }>; updated_at: string | null };
  pricing: unknown;
  requires_checkout_confirmation: true;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CATEGORIES = new Set<ShoppingListCategory>(["ramadan", "monthly_sales", "warehouse", "quick_order", "custom"]);
const RECURRENCES = new Set<ShoppingListRecurrence>(["none", "weekly", "monthly"]);
const ACCESS = new Set<ShoppingListAccess>(["view", "edit"]);

function record(value: unknown, message: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(message);
  return value as Record<string, unknown>;
}
function text(value: unknown, message: string, max = 500): string {
  if (typeof value !== "string" || !value.trim() || value.length > max) throw new Error(message);
  return value;
}
function dateOrNull(value: unknown, message: string): string | null {
  if (value === null) return null;
  const date = text(value, message, 40);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(date + "T00:00:00Z"))) {
    throw new Error(message);
  }
  return date;
}
function quantity(value: unknown, min: number, max: number, message: string): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < min || value > max) {
    throw new Error(message);
  }
  return value;
}
function parseListItem(value: unknown): CustomerShoppingListItem {
  const row = record(value, "أعاد الخادم بند قائمة مشتريات غير صالح.");
  if (typeof row.product_id !== "string" || !UUID.test(row.product_id)) throw new Error("معرّف صنف قائمة المشتريات غير صالح.");
  return {
    product_id: row.product_id,
    product_name: text(row.product_name, "اسم صنف القائمة غير صالح.", 250),
    item_code: text(row.item_code, "رمز صنف القائمة غير صالح.", 100),
    base_unit: text(row.base_unit, "وحدة الصنف الأساسية غير صالحة.", 40),
    quantity: quantity(row.quantity, 1, 10000, "كمية صنف القائمة غير صالحة."),
    unit_name: text(row.unit_name, "وحدة قائمة المشتريات غير صالحة.", 40),
    base_units_per_unit: quantity(row.base_units_per_unit, 1, 1000000, "معامل تحويل وحدة القائمة غير صالح."),
  };
}
function parseRunSummary(value: unknown): CustomerShoppingListRunSummary {
  const row = record(value, "ملخص دورة القائمة غير صالح.");
  if (typeof row.id !== "string" || !UUID.test(row.id) || row.status !== "review_required") {
    throw new Error("حالة أو معرّف دورة القائمة غير صالح.");
  }
  const createdAt = text(row.created_at, "تاريخ إنشاء دورة القائمة غير صالح.", 50);
  if (Number.isNaN(Date.parse(createdAt))) throw new Error("تاريخ إنشاء دورة القائمة غير صالح.");
  return { id: row.id, due_on: dateOrNull(row.due_on, "تاريخ استحقاق الدورة غير صالح."), status: "review_required", created_at: createdAt };
}
function parseList(value: unknown): CustomerShoppingList {
  const row = record(value, "أعاد الخادم قائمة مشتريات غير صالحة.");
  if (typeof row.id !== "string" || !UUID.test(row.id) ||
      typeof row.category !== "string" || !CATEGORIES.has(row.category as ShoppingListCategory) ||
      typeof row.recurrence !== "string" || !RECURRENCES.has(row.recurrence as ShoppingListRecurrence) ||
      row.status !== "active" || typeof row.is_draft !== "boolean" ||
      typeof row.can_edit !== "boolean" || row.timezone !== "Asia/Aden" ||
      !Array.isArray(row.items) || row.items.length > 100 ||
      !Array.isArray(row.shares) || row.shares.length > 100 ||
      !Array.isArray(row.runs) || row.runs.length > 100) {
    throw new Error("حقول قائمة المشتريات لا تطابق عقد الخادم.");
  }
  const createdAt = text(row.created_at, "تاريخ إنشاء القائمة غير صالح.", 50);
  const updatedAt = text(row.updated_at, "تاريخ تحديث القائمة غير صالح.", 50);
  if (Number.isNaN(Date.parse(createdAt)) || Number.isNaN(Date.parse(updatedAt))) throw new Error("تاريخ القائمة غير صالح.");
  const shares = row.shares.map((value) => {
    const share = record(value, "سجل مشاركة قائمة غير صالح.");
    if (typeof share.member_profile_id !== "string" || !UUID.test(share.member_profile_id) ||
        typeof share.access_level !== "string" || !ACCESS.has(share.access_level as ShoppingListAccess)) {
      throw new Error("صلاحية مشاركة قائمة غير صالحة.");
    }
    const updated = text(share.updated_at, "تاريخ مشاركة القائمة غير صالح.", 50);
    if (Number.isNaN(Date.parse(updated))) throw new Error("تاريخ مشاركة القائمة غير صالح.");
    return { member_profile_id: share.member_profile_id, access_level: share.access_level as ShoppingListAccess, updated_at: updated };
  });
  const creator = text(row.created_by_profile_id, "هوية منشئ القائمة غير صالحة.", 64);
  if (!UUID.test(creator)) throw new Error("هوية منشئ القائمة غير صالحة.");
  const parsedItems = row.items.map(parseListItem);
  const productIds = new Set(parsedItems.map((item) => item.product_id));
  if (productIds.size !== parsedItems.length) throw new Error("أعاد الخادم صنفًا مكررًا داخل القائمة؛ تم إيقاف العرض.");
  return {
    id: row.id,
    name: text(row.name, "اسم قائمة المشتريات غير صالح.", 100),
    category: row.category as ShoppingListCategory,
    is_draft: row.is_draft,
    status: "active",
    recurrence: row.recurrence as ShoppingListRecurrence,
    next_run_on: dateOrNull(row.next_run_on, "موعد التكرار غير صالح."),
    timezone: "Asia/Aden",
    created_at: createdAt,
    updated_at: updatedAt,
    created_by_profile_id: creator,
    can_edit: row.can_edit,
    items: parsedItems,
    shares,
    runs: row.runs.map(parseRunSummary),
  };
}
function normalizeItems(items: readonly ShoppingListLineInput[]): ShoppingListLineInput[] {
  if (!Array.isArray(items) || items.length < 1 || items.length > 100) {
    throw new Error("يجب أن تضم قائمة المشتريات من صنف واحد إلى 100 صنف.");
  }
  const seen = new Set<string>();
  return items.map((line) => {
    if (!line || typeof line !== "object" || !UUID.test(line.product_id) ||
        !Number.isSafeInteger(line.quantity) || line.quantity < 1 || line.quantity > 10000 ||
        !Number.isSafeInteger(line.base_units_per_unit) || line.base_units_per_unit < 1 || line.base_units_per_unit > 1000000 ||
        typeof line.unit_name !== "string" || !line.unit_name.trim() || line.unit_name.trim() !== line.unit_name ||
        line.unit_name.length > 40 || line.quantity * line.base_units_per_unit > 10000) {
      throw new Error("تحقق من رمز الصنف والكمية والوحدة ومعامل التحويل قبل الحفظ.");
    }
    const id = line.product_id.toLowerCase();
    if (seen.has(id)) throw new Error("لا يمكن تكرار الصنف نفسه في قائمة واحدة.");
    seen.add(id);
    return { product_id: id, quantity: line.quantity, unit_name: line.unit_name, base_units_per_unit: line.base_units_per_unit };
  });
}

export async function fetchCustomerShoppingLists(): Promise<CustomerShoppingList[]> {
  const { data, error } = await supabase.rpc("list_customer_shopping_lists");
  if (error) throw new Error("تعذر تحميل قوائم المشتريات من حساب الشركة: " + error.message);
  if (!Array.isArray(data) || data.length > 200) throw new Error("استجابة قوائم المشتريات غير صالحة أو تتجاوز الحد الآمن.");
  return data.map(parseList);
}
export async function saveCustomerShoppingList(input: ShoppingListSaveInput): Promise<string> {
  const name = input.name.trim();
  if (name.length < 2 || name.length > 100) throw new Error("اسم القائمة مطلوب من حرفين إلى 100 حرف.");
  if (!CATEGORIES.has(input.category) || !RECURRENCES.has(input.recurrence)) throw new Error("نوع القائمة أو دوريتها غير صالح.");
  if (input.id && !UUID.test(input.id)) throw new Error("معرّف القائمة المراد تعديلها غير صالح.");
  if (input.recurrence === "none" || input.isDraft) {
    if (input.nextRunOn !== null) throw new Error("لا يمكن ضبط موعد تكرار لقائمة غير دورية أو مسودة.");
  } else if (!input.nextRunOn || !/^\d{4}-\d{2}-\d{2}$/.test(input.nextRunOn) ||
    Number.isNaN(Date.parse(input.nextRunOn + "T00:00:00Z"))) {
    throw new Error("حدد تاريخًا صحيحًا لأول مراجعة دورية.");
  }
  const lines = normalizeItems(input.items);
  const { data, error } = await supabase.rpc("save_customer_shopping_list", {
    p_list_id: input.id ?? null,
    p_name: name,
    p_category: input.category,
    p_is_draft: input.isDraft,
    p_recurrence: input.isDraft ? "none" : input.recurrence,
    p_next_run_on: input.isDraft || input.recurrence === "none" ? null : input.nextRunOn,
    p_items: lines,
  });
  if (error) throw new Error("لم يتم حفظ قائمة المشتريات: " + error.message);
  if (typeof data !== "string" || !UUID.test(data)) throw new Error("لم يؤكد الخادم حفظ قائمة مشتريات صالحة.");
  return data;
}
export async function shareCustomerShoppingList(listId: string, memberProfileId: string, accessLevel: ShoppingListAccess): Promise<void> {
  if (!UUID.test(listId) || !UUID.test(memberProfileId) || !ACCESS.has(accessLevel)) throw new Error("بيانات مشاركة القائمة غير صالحة.");
  const { data, error } = await supabase.rpc("share_customer_shopping_list", {
    p_list_id: listId, p_member_profile_id: memberProfileId, p_access_level: accessLevel,
  });
  if (error) throw new Error("تعذرت مشاركة القائمة؛ تحقق من ملكية الشركة وعضوية الموظف: " + error.message);
  if (data !== true) throw new Error("لم يؤكد الخادم مشاركة القائمة.");
}
export async function removeCustomerShoppingListShare(listId: string, memberProfileId: string): Promise<void> {
  if (!UUID.test(listId) || !UUID.test(memberProfileId)) throw new Error("بيانات إلغاء المشاركة غير صالحة.");
  const { data, error } = await supabase.rpc("remove_customer_shopping_list_share", {
    p_list_id: listId, p_member_profile_id: memberProfileId,
  });
  if (error) throw new Error("تعذر إلغاء مشاركة القائمة: " + error.message);
  if (data !== true) throw new Error("المشاركة غير موجودة أو أُلغيت مسبقًا.");
}
export async function createCustomerShoppingListRun(listId: string): Promise<string> {
  if (!UUID.test(listId)) throw new Error("معرّف قائمة المراجعة غير صالح.");
  const { data, error } = await supabase.rpc("create_customer_shopping_list_run", { p_list_id: listId });
  if (error) throw new Error("تعذر إنشاء مراجعة القائمة: " + error.message);
  if (typeof data !== "string" || !UUID.test(data)) throw new Error("لم يؤكد الخادم إنشاء مراجعة للقائمة.");
  return data;
}
export async function reviewCustomerShoppingListRun(runId: string): Promise<CustomerShoppingListRun> {
  if (!UUID.test(runId)) throw new Error("معرّف مراجعة القائمة غير صالح.");
  const { data, error } = await supabase.rpc("review_customer_shopping_list_run", { p_run_id: runId });
  if (error) throw new Error("تعذر تحميل بنود مراجعة القائمة: " + error.message);
  const row = record(data, "استجابة مراجعة القائمة غير صالحة.");
  if (typeof row.id !== "string" || row.id !== runId ||
      typeof row.list_id !== "string" || !UUID.test(row.list_id) ||
      typeof row.status !== "string" || !["review_required","cart_loaded","cancelled"].includes(row.status) ||
      !Array.isArray(row.items) || row.items.length < 1 || row.items.length > 100) {
    throw new Error("استجابة مراجعة القائمة لا تطابق عقد الخادم.");
  }
  return {
    id: row.id,
    list_id: row.list_id,
    list_name: text(row.list_name, "اسم قائمة المراجعة غير صالح.", 100),
    due_on: dateOrNull(row.due_on, "تاريخ المراجعة غير صالح."),
    status: row.status as CustomerShoppingListRun["status"],
    items: row.items.map(parseListItem),
  };
}
export async function applyCustomerShoppingListRunToCart(runId: string): Promise<AppliedShoppingListRun> {
  if (!UUID.test(runId)) throw new Error("معرّف دورة القائمة غير صالح.");
  const { data, error } = await supabase.rpc("apply_customer_shopping_list_run_to_cart", { p_run_id: runId });
  if (error) throw new Error("لم تُحمّل القائمة إلى السلة؛ أعِد مراجعة المخزون والوحدات والأسعار: " + error.message);
  const row = record(data, "نتيجة تحميل القائمة إلى السلة غير صالحة.");
  if (row.status !== "cart_loaded" || row.requires_checkout_confirmation !== true) {
    throw new Error("لم يؤكد الخادم تحميل السلة مع إبقاء تأكيد الشراء خطوة مستقلة.");
  }
  const cart = record(row.cart, "استجابة سلة المشتريات غير صالحة.");
  if (!Array.isArray(cart.items) || cart.items.length > 100) throw new Error("استجابة أصناف السلة غير صالحة.");
  const cartItems = cart.items.map((candidate) => {
    const line = record(candidate, "بند السلة غير صالح.");
    if (typeof line.product_id !== "string" || !UUID.test(line.product_id)) throw new Error("معرّف صنف السلة غير صالح.");
    return { product_id: line.product_id, quantity: quantity(line.quantity,1,10000,"كمية السلة غير صالحة.") };
  });
  return {
    status: "cart_loaded",
    cart: { items: cartItems, updated_at: typeof cart.updated_at === "string" ? cart.updated_at : null },
    pricing: row.pricing,
    requires_checkout_confirmation: true,
  };
}
