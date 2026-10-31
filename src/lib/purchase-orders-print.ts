import type { PurchaseOrder, PurchaseOrderStatus } from '@/lib/purchase-orders';

const STATUS_LABELS: Record<PurchaseOrderStatus, string> = {
  draft: 'مسودة',
  submitted: 'معتمد للتوريد',
  partially_received: 'استلام جزئي',
  received: 'مستلم بالكامل',
  cancelled: 'ملغى',
};

export type PurchaseOrderPrintItem = {
  itemCode: string;
  productName: string;
  unit: string | null;
  quantityOrdered: number;
  quantityReceived: number;
  remainingQuantity: number;
  unitCost: number | null;
  lineTotal: number | null;
};

/**
 * Strict printable DTO. Never pass PurchaseOrder/PurchaseOrderItem records to print JSX:
 * tenant, row, supplier, warehouse, product, line and actor IDs plus internal notes are omitted.
 * Monetary values are available only to admin/manager and unknown values remain null.
 */
export type PurchaseOrderPrintDocument = {
  purchaseOrderNumber: string;
  supplierName: string;
  supplierCode: string;
  warehouseName: string;
  status: PurchaseOrderStatus;
  statusLabel: string;
  createdAt: string;
  submittedAt: string | null;
  totalCost: number | null;
  items: PurchaseOrderPrintItem[];
};

export function canPrintPurchaseOrders(roles: readonly string[]): boolean {
  return roles.some((role) => role === 'admin' || role === 'manager');
}

export function projectPurchaseOrderPrintDocument(
  order: PurchaseOrder,
  roles: readonly string[],
): PurchaseOrderPrintDocument | null {
  if (!canPrintPurchaseOrders(roles)) return null;

  return {
    purchaseOrderNumber: order.purchase_order_number,
    supplierName: order.supplier_name,
    supplierCode: order.supplier_code,
    warehouseName: order.warehouse_name,
    status: order.status,
    statusLabel: STATUS_LABELS[order.status],
    createdAt: order.created_at,
    submittedAt: order.submitted_at,
    totalCost: order.total_cost,
    items: order.items.map((item) => ({
      itemCode: item.item_code,
      productName: item.product_name,
      unit: item.unit,
      quantityOrdered: item.quantity_ordered,
      quantityReceived: item.quantity_received,
      remainingQuantity: item.remaining_quantity,
      unitCost: item.unit_cost,
      lineTotal: item.line_total,
    })),
  };
}

export function projectPurchaseOrdersForPrint(
  orders: readonly PurchaseOrder[],
  roles: readonly string[],
): PurchaseOrderPrintDocument[] {
  if (!canPrintPurchaseOrders(roles)) return [];
  return orders
    .map((order) => projectPurchaseOrderPrintDocument(order, roles))
    .filter((document): document is PurchaseOrderPrintDocument => document !== null);
}
