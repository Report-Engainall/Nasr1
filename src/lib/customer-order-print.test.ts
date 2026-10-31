import { describe, expect, it } from 'vitest';
import {
  projectCustomerOrderPrintDocument,
  type CustomerOrderPrintCustomerSource,
  type CustomerOrderPrintHistorySource,
  type CustomerOrderPrintLineSource,
  type CustomerOrderPrintOrderSource,
} from '@/lib/customer-order-print';
const order: CustomerOrderPrintOrderSource = {
  order_number: 'SO-20261031-00017', status: 'confirmed', created_at: '2026-10-31T09:00:00.000Z',
  notes: 'ملاحظة العميل', quantity_review_required: true,
  customer_adjustment_note: 'تم تعديل كمية صنف وفق المتاح.',
  customer_payment_requested_at: '2026-10-31T09:10:00.000Z', payment_request_status: 'requested',
  delivery_address_snapshot: {
    label: 'عنوان الشركة', recipient_name: 'مسؤول الاستلام', phone: '777000111',
    address_line1: 'شارع التجارة', address_line2: 'المبنى 3', city: 'صنعاء',
    region: 'الأمانة', postal_code: null, country: 'اليمن', delivery_instructions: 'الاتصال قبل الوصول',
  },
};
const lines: CustomerOrderPrintLineSource[] = [{
  item_code: '000041', product_name_snapshot: 'سكر', unit_snapshot: 'كرتون',
  quantity: 5, requested_quantity: 5, approved_quantity: 3,
}];
const history: CustomerOrderPrintHistorySource[] = [
  { to_status: 'pending', created_at: '2026-10-31T08:50:00.000Z' },
  { to_status: 'confirmed', created_at: '2026-10-31T09:00:00.000Z' },
];
const customer: CustomerOrderPrintCustomerSource = {
  customer_code: 'C-00017', business_name: 'شركة العميل', contact_name: 'مسؤول الحساب',
};
describe('customer order print projection', () => {
  it('builds an exact customer-facing allowlist with status, address and approved quantities', () => {
    const document = projectCustomerOrderPrintDocument(order, lines, history, customer, 'fallback');
    expect(Object.keys(document).sort()).toEqual([
      'adjustmentNote', 'createdAt', 'customer', 'customerNotes', 'deliveryAddress',
      'history', 'items', 'orderNumber', 'paymentRequested', 'quantityReviewRequired', 'status', 'statusLabel',
    ].sort());
    expect(Object.keys(document.items[0]).sort()).toEqual([
      'adjusted', 'approvedQuantity', 'itemCode', 'productName', 'requestedQuantity', 'unit',
    ].sort());
    expect(document).toMatchObject({
      orderNumber: 'SO-20261031-00017', statusLabel: 'مؤكد', paymentRequested: true,
      customer: { code: 'C-00017', name: 'شركة العميل' },
    });
    expect(document.items[0]).toMatchObject({ itemCode: '000041', requestedQuantity: 5, approvedQuantity: 3, adjusted: true });
    expect(document.deliveryAddress?.phone).toBe('777000111');
  });
  it('never projects internal identifiers, actor data, admin notes, private history or monetary fields', () => {
    const rawOrder = {
      ...order, id: 'PRIVATE-ORDER-ID', customer_id: 'PRIVATE-CUSTOMER-ID',
      organization_id: 'PRIVATE-TENANT-ID', admin_notes: 'PRIVATE-ADMIN-NOTE',
      created_by: 'PRIVATE-ACTOR-ID', unit_price: 7654321, line_total: 38271605,
      cost_price: 12345, margin: 98, internal_payload: { secret: 'PRIVATE-RAW-OBJECT' },
    } as CustomerOrderPrintOrderSource;
    const rawLines = [{
      ...lines[0], id: 'PRIVATE-LINE-ID', product_id: 'PRIVATE-PRODUCT-ID',
      unit_price: 7654321, line_total: 38271605, cost_price: 12345, margin: 98,
    }] as CustomerOrderPrintLineSource[];
    const rawHistory = [{
      ...history[0], id: 'PRIVATE-HISTORY-ID', notes: 'PRIVATE-HISTORY-NOTE', actor_id: 'PRIVATE-HISTORY-ACTOR',
    }] as CustomerOrderPrintHistorySource[];
    const rawCustomer = {
      ...customer, id: 'PRIVATE-CUSTOMER-ROW-ID', profile_id: 'PRIVATE-PROFILE-ID',
      phone: 'PRIVATE-ACCOUNT-PHONE', notes: 'PRIVATE-CUSTOMER-NOTE',
    } as CustomerOrderPrintCustomerSource;
    const serialized = JSON.stringify(projectCustomerOrderPrintDocument(rawOrder, rawLines, rawHistory, rawCustomer, 'fallback'));
    for (const sentinel of [
      'PRIVATE-ORDER-ID', 'PRIVATE-CUSTOMER-ID', 'PRIVATE-TENANT-ID', 'PRIVATE-ADMIN-NOTE',
      'PRIVATE-ACTOR-ID', 'PRIVATE-RAW-OBJECT', 'PRIVATE-LINE-ID', 'PRIVATE-PRODUCT-ID',
      'PRIVATE-HISTORY-ID', 'PRIVATE-HISTORY-NOTE', 'PRIVATE-HISTORY-ACTOR',
      'PRIVATE-CUSTOMER-ROW-ID', 'PRIVATE-PROFILE-ID', 'PRIVATE-ACCOUNT-PHONE', 'PRIVATE-CUSTOMER-NOTE',
      '7654321', '38271605', '12345',
    ]) expect(serialized).not.toContain(sentinel);
  });
  it('keeps unavailable quantities null rather than using zero as a sentinel', () => {
    const document = projectCustomerOrderPrintDocument(order, [{
      item_code: '000042', product_name_snapshot: 'صنف غير مكتمل', unit_snapshot: null,
      quantity: Number.NaN, requested_quantity: Number.NaN, approved_quantity: Number.NaN,
    }], [], null, null);
    expect(document.items[0].requestedQuantity).toBeNull();
    expect(document.items[0].approvedQuantity).toBeNull();
    expect(document.items[0].adjusted).toBe(false);
  });
  it('does not infer payment requests from a timestamp alone or a different request status', () => {
    expect(projectCustomerOrderPrintDocument(
      { ...order, payment_request_status: 'none' }, lines, history, customer, null,
    ).paymentRequested).toBe(false);
    expect(projectCustomerOrderPrintDocument(
      { ...order, customer_payment_requested_at: null }, lines, history, customer, null,
    ).paymentRequested).toBe(false);
  });
});
