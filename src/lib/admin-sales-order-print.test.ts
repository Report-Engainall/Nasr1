import { describe, expect, it } from 'vitest';
import { projectAdminSalesOrderPrintDocument } from '@/lib/admin-sales-order-print';

describe('admin sales order print allowlist', () => {
  it('projects saved staff-visible values and ignores unapproved review drafts', () => {
    const document = projectAdminSalesOrderPrintDocument({
      id: 'PRIVATE-ORDER-ID',
      organization_id: 'PRIVATE-TENANT-ID',
      order_number: 'SO-PRINT-100',
      status: 'confirmed',
      created_at: '2026-10-31T10:00:00.000Z',
      total_items: 2,
      total_amount: 175,
      customer_id: 'PRIVATE-CUSTOMER-ID',
      created_by: 'PRIVATE-ACTOR-ID',
      customer: {
        id: 'PRIVATE-CUSTOMER-ROW-ID',
        customer_code: 'C-100',
        business_name: 'شركة المبيعات',
        phone: 'PRIVATE-ACCOUNT-PHONE',
      },
      admin_notes: 'PRIVATE-ADMIN-NOTE',
      delivery_address_snapshot: {
        id: 'PRIVATE-ADDRESS-ID',
        recipient_name: 'مستلم',
        phone: '777000111',
        address_line1: 'شارع التجارة',
        address_line2: null,
        city: 'صنعاء',
        region: 'الأمانة',
        postal_code: null,
        country: 'اليمن',
      },
      internal_payload: 'PRIVATE-RAW-OBJECT',
    }, [{
      id: 'PRIVATE-LINE-ID',
      order_id: 'PRIVATE-ORDER-ID',
      organization_id: 'PRIVATE-TENANT-ID',
      product_id: 'PRIVATE-PRODUCT-ID',
      item_code: '000041',
      product_name_snapshot: 'سكر',
      unit_snapshot: 'كرتون',
      quantity: 5,
      approved_quantity: 3,
      proposed_quantity: 99,
      unit_price_snapshot: 25,
      approved_unit_price: 30,
      proposed_unit_price: 999,
      line_total: 90,
      cost_price: 'PRIVATE-COST-SENTINEL',
      margin: 'PRIVATE-MARGIN-SENTINEL',
    }], true);
    expect(document).not.toBeNull();
    expect(Object.keys(document!).sort()).toEqual([
      'createdAt','customerCode','customerName','deliveryAddress','items','orderNumber',
      'statusLabel','totalAmount','totalItems',
    ].sort());
    expect(Object.keys(document!.items[0]).sort()).toEqual([
      'itemCode','lineTotal','productName','quantity','unit','unitPrice',
    ].sort());
    expect(document).toMatchObject({
      orderNumber: 'SO-PRINT-100', statusLabel: 'مؤكد', totalItems: 2, totalAmount: 175,
      customerName: 'شركة المبيعات', customerCode: 'C-100',
    });
    expect(document!.items[0]).toMatchObject({
      quantity: 3, unitPrice: 30, lineTotal: 90, itemCode: '000041',
    });
    const serialized = JSON.stringify(document);
    for (const privateValue of [
      'PRIVATE-ORDER-ID','PRIVATE-TENANT-ID','PRIVATE-CUSTOMER-ID','PRIVATE-ACTOR-ID',
      'PRIVATE-CUSTOMER-ROW-ID','PRIVATE-ACCOUNT-PHONE','PRIVATE-ADMIN-NOTE','PRIVATE-ADDRESS-ID',
      'PRIVATE-LINE-ID','PRIVATE-PRODUCT-ID','PRIVATE-RAW-OBJECT','PRIVATE-COST-SENTINEL',
      'PRIVATE-MARGIN-SENTINEL','999',
    ]) expect(serialized).not.toContain(privateValue);
  });

  it('preserves missing financial fields as null and denies non-staff printing', () => {
    const order = { order_number: 'SO-PRINT-101', status: 'pending', created_at: '2026-10-31', total_amount: null };
    const document = projectAdminSalesOrderPrintDocument(order, [{
      item_code: '000042',
      product_name_snapshot: 'زيت',
      quantity: 2,
      approved_unit_price: null,
      unit_price_snapshot: null,
      line_total: null,
    }], true);
    expect(document?.totalAmount).toBeNull();
    expect(document?.items[0].unitPrice).toBeNull();
    expect(document?.items[0].lineTotal).toBeNull();
    expect(projectAdminSalesOrderPrintDocument(order, [], false)).toBeNull();
  });
});
