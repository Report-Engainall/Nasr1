export interface Category { id: string; name: string; name_en: string | null; parent_id: string | null; sort_order: number; is_active: boolean; icon: string | null }
export interface Brand { id: string; name: string; name_en: string | null; is_active: boolean }
export interface Product {
  id: string; name: string; name_en: string | null; item_code: string; sku: string | null; barcode: string | null;
  category_id: string | null; brand_id: string | null; unit: string; description: string | null; image_url: string | null;
  is_active: boolean; is_featured: boolean; sort_order: number;
  price_wholesale_of_wholesale: number; price_wholesale: number; price_retail: number; base_price: number;
  stock_quantity: number; reserved_quantity: number; min_stock_level: number;
}
export interface Customer {
  id: string; user_id: string | null; full_name: string; company_name: string | null; phone: string;
  email: string | null; address: string | null; city: string | null; customer_tier: number;
  customer_code: string | null; status: string; credit_limit: number; notes: string | null;
}
export interface Order {
  id: string; order_code: string; customer_id: string; status: string; notes: string | null;
  admin_notes: string | null; total_amount: number; total_items: number; idempotency_key: string | null;
  created_at: string; updated_at: string;
}
export interface OrderItem {
  id: string; order_id: string; product_id: string | null; product_name: string; product_code: string;
  unit: string; quantity: number; unit_price: number; line_total: number;
}
export interface Banner { id: string; title: string; content: string | null; link: string | null; color: string; priority: number; is_active: boolean; start_date: string | null; end_date: string | null; audience: string }
export type StorefrontAnnouncementAudience = 'all' | 'customers' | 'staff'
export interface StorefrontAnnouncement { id: string; title: string; content: string | null; href: string | null; color: string; priority: number; starts_at: string | null; ends_at: string | null; audience: StorefrontAnnouncementAudience; is_active: boolean; created_at?: string; updated_at?: string }
export type StorefrontAnnouncementInput = Omit<StorefrontAnnouncement, 'id' | 'created_at' | 'updated_at'> & { id: string | null }
export interface Setting { key: string; value: string; category: string }
export type CustomerTier = 1 | 2 | 3
export const TIER_LABELS: Record<number, string> = { 1: 'جملة الجملة', 2: 'جملة', 3: 'تجزئة' }
export const ORDER_STATUS_LABELS: Record<string, string> = {
  new: 'جديد', received: 'تم الاستلام', reviewing: 'قيد المراجعة', returned: 'معاد للتعديل',
  approved: 'معتمد', preparing: 'قيد التجهيز', prepared: 'تم التجهيز', dispatched: 'خرج للتسليم',
  delivered: 'تم التسليم', cancelled: 'ملغي', rejected: 'مرفوض', invoiced: 'حوّل إلى فاتورة',
}
export const CUSTOMER_STATUS_LABELS: Record<string, string> = {
  pending: 'بانتظار الموافقة', approved: 'معتمد', frozen: 'مجمّد', blocked: 'محظور', archived: 'مؤرشف',
}

export type OperationalTaskRole = 'sales' | 'accountant' | 'warehouse' | 'purchasing' | 'management' | 'operations';
export type OperationalTaskStatus = 'pending' | 'in_progress' | 'completed' | 'cancelled';

export interface AiTask {
  id: string; organization_id: string; title: string; description: string | null; task_type: string | null;
  priority: 'low' | 'medium' | 'high' | 'critical' | string; status: OperationalTaskStatus | string;
  assigned_to: string | null; created_at: string; completed_at: string | null;
  task_role?: OperationalTaskRole; source_event_key?: string | null; source_entity_type?: string | null;
  source_entity_id?: string | null; due_at?: string | null; created_by?: string | null; completed_by?: string | null;
  resolution_note?: string | null; task_payload?: Record<string, unknown>; updated_at?: string;
}
export type OperationalTask = AiTask & {
  task_role: OperationalTaskRole; source_event_key: string | null; source_entity_type: string | null;
  source_entity_id: string | null; due_at: string | null; task_payload: Record<string, unknown>; updated_at: string;
};
export interface AiAlert {
  id: string; organization_id: string; alert_type: string; severity: string; title: string;
  body: string | null; entity_type?: string | null; entity_id?: string | null; is_resolved: boolean; created_at: string;
}
export interface Notification {
  id: string; organization_id: string | null; profile_id: string | null; title: string;
  body: string | null; type: string; is_read: boolean; created_at: string;
}
export interface OperationalTaskAssignee {
  profile_id: string;
  full_name: string;
  email: string | null;
  roles: string[];
}
