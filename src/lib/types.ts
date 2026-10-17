export interface Category { id: string; name: string; name_en: string | null; code: string | null; parent_id: string | null; sort_order: number; is_active: boolean; icon: string | null }
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
export interface Setting { key: string; value: string; category: string }
export interface Supplier { id: string; name: string; name_en: string | null; phone: string | null; email: string | null; address: string | null; is_active: boolean; organization_id: string }
export interface InventoryBalance { id: string; product_id: string; warehouse_id: string; quantity_on_hand: number; quantity_reserved: number; quantity_available: number }
export interface ProductWithInventory extends Product { display_price: number; inventory?: InventoryBalance; category?: Category }
export interface OrderWithCustomer extends Order { customer?: Customer }
export interface PricingRule {
  id: string; organization_id: string; name: string; scope_type: string; scope_value: string | null;
  base_source: string; adjustment_type: string; calculation_method: string; adjustment_value: number;
  target_tier: number; min_quantity: number; min_price: number | null; max_price: number | null;
  priority: number; is_active: boolean; manually_locked: boolean; requires_approval: boolean;
  approved_at: string | null; effective_from: string | null; effective_until: string | null;
  created_at: string; updated_at: string;
}
export interface CreatePricingRuleInput {
  name: string; scope_type: 'default' | 'all' | 'product' | 'category'; scope_value: string | null;
  base_source: string; calculation_method: 'add_percentage' | 'margin_percentage' | 'fixed_price' | 'add_subtract_amount';
  adjustment_value: number; target_tier: number; min_quantity: number;
  min_price: number | null; max_price: number | null; priority: number;
  effective_from: string | null; effective_until: string | null;
}
export interface Promotion { id: string; organization_id: string; name: string; description: string | null; is_active: boolean; starts_at: string | null; ends_at: string | null; created_at: string }
export interface AiAlert { id: string; organization_id: string; alert_type: string; severity: string; title: string; message: string; is_resolved: boolean; created_at: string }
export interface AiTask { id: string; organization_id: string; task_type: string; title: string; description: string | null; status: string; completed_at: string | null; created_at: string }
export interface Notification { id: string; organization_id: string; user_id: string | null; title: string; message: string; type: string; is_read: boolean; created_at: string }
export interface AdminSetting { id?: string; organization_id: string; key: string; value: unknown; category: string; updated_at?: string }
export interface ImportJob {
  id: string; organization_id: string; profile_id: string | null; file_name: string; file_hash: string;
  file_size: number; job_type: string; status: string; total_rows: number | null; processed_rows: number | null;
  data_quality_score: number | null; period_key: string | null; source_system: string | null;
  created_at: string; updated_at: string; created_by: string | null;
}
export interface ImportJobRow { id: string; import_job_id: string; row_number: number; data: Record<string, unknown>; status: string; errors: string[] | null }
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
