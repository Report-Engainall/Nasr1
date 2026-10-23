import { supabase } from "@/lib/supabase";

export type CustomerCompanyContact = {
  id: string;
  full_name: string;
  job_title: string | null;
  department: string | null;
  phone: string;
  email: string | null;
  is_primary: boolean;
  created_at: string;
  updated_at: string;
};

export type CustomerCompanyContactInput = {
  id?: string | null;
  full_name: string;
  job_title?: string | null;
  department?: string | null;
  phone: string;
  email?: string | null;
  is_primary: boolean;
};

const COLUMNS = "id,full_name,job_title,department,phone,email,is_primary,created_at,updated_at";
const clean = (value: string | null | undefined) => (value ?? "").trim();
const optional = (value: string | null | undefined) => clean(value) || null;

function validate(input: CustomerCompanyContactInput): CustomerCompanyContactInput {
  const value = {
    id: optional(input.id),
    full_name: clean(input.full_name),
    job_title: optional(input.job_title),
    department: optional(input.department),
    phone: clean(input.phone),
    email: optional(input.email)?.toLowerCase() ?? null,
    is_primary: input.is_primary === true,
  };
  if (value.full_name.length < 2 || value.full_name.length > 120) throw new Error("اسم جهة الاتصال مطلوب (من حرفين إلى 120 حرفًا).");
  if (value.phone.length < 7 || value.phone.length > 32) throw new Error("أدخل رقم هاتف صحيحًا من 7 إلى 32 حرفًا.");
  if ((value.job_title?.length ?? 0) > 80 || (value.department?.length ?? 0) > 80) throw new Error("المسمى الوظيفي والقسم لا يتجاوز كل منهما 80 حرفًا.");
  if ((value.email?.length ?? 0) > 254 || (value.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.email))) {
    throw new Error("أدخل بريدًا إلكترونيًا صحيحًا.");
  }
  return value;
}

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function parseContact(value: unknown): CustomerCompanyContact {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("استجابة جهات اتصال الشركة غير صالحة.");
  }
  const row = value as Record<string, unknown>;
  if (typeof row.id !== "string" || !uuid.test(row.id)) throw new Error("معرّف جهة الاتصال غير صالح.");
  if (typeof row.full_name !== "string" || row.full_name.trim().length < 2 || row.full_name.length > 120) {
    throw new Error("اسم جهة الاتصال في استجابة الخادم غير صالح.");
  }
  if (typeof row.phone !== "string" || row.phone.trim().length < 7 || row.phone.length > 32) {
    throw new Error("رقم هاتف جهة الاتصال في استجابة الخادم غير صالح.");
  }
  const nullableText = (key: string, max: number): string | null => {
    const item = row[key];
    if (item === null) return null;
    if (typeof item !== "string" || item.length > max) throw new Error("سجل جهة الاتصال غير صالح: " + key);
    return item;
  };
  const email = nullableText("email", 254);
  if (email !== null && !/^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/.test(email)) {
    throw new Error("بريد جهة الاتصال في استجابة الخادم غير صالح.");
  }
  if (typeof row.is_primary !== "boolean") throw new Error("حالة جهة الاتصال الرئيسية غير صالحة.");
  const createdAt = row.created_at;
  const updatedAt = row.updated_at;
  if (typeof createdAt !== "string" || !Number.isFinite(Date.parse(createdAt)) ||
      typeof updatedAt !== "string" || !Number.isFinite(Date.parse(updatedAt))) {
    throw new Error("تواريخ جهة الاتصال غير صالحة.");
  }
  return {
    id: row.id,
    full_name: row.full_name,
    job_title: nullableText("job_title", 80),
    department: nullableText("department", 80),
    phone: row.phone,
    email,
    is_primary: row.is_primary,
    created_at: createdAt,
    updated_at: updatedAt,
  };
}

export async function fetchCustomerCompanyContacts(): Promise<CustomerCompanyContact[]> {
  const { data, error } = await supabase.from("customer_company_contacts").select(COLUMNS)
    .order("is_primary", { ascending: false })
    .order("updated_at", { ascending: false })
    .order("created_at", { ascending: false });
  if (error) throw new Error("تعذر تحميل جهات اتصال الشركة: " + error.message);
  if (data === null) return [];
  if (!Array.isArray(data)) throw new Error("استجابة جهات اتصال الشركة غير صالحة.");
  return data.map(parseContact);
}

export async function saveCustomerCompanyContact(input: CustomerCompanyContactInput): Promise<string> {
  const v = validate(input);
  const { data, error } = await supabase.rpc("save_customer_company_contact", {
    p_contact_id: v.id ?? null,
    p_full_name: v.full_name,
    p_job_title: v.job_title ?? null,
    p_department: v.department ?? null,
    p_phone: v.phone,
    p_email: v.email ?? null,
    p_is_primary: v.is_primary,
  });
  if (error) throw new Error("تعذر حفظ جهة الاتصال: " + error.message);
  if (typeof data !== "string" || !data) throw new Error("لم يؤكد الخادم حفظ جهة الاتصال؛ لم يتم عرض نجاح غير مثبت.");
  return data;
}

export async function deleteCustomerCompanyContact(id: string): Promise<void> {
  if (!clean(id)) throw new Error("حدد جهة اتصال صالحة للحذف.");
  const { data, error } = await supabase.rpc("delete_customer_company_contact", { p_contact_id: id });
  if (error) throw new Error("تعذر حذف جهة الاتصال: " + error.message);
  if (data !== true) throw new Error("لم يؤكد الخادم حذف جهة الاتصال.");
}
