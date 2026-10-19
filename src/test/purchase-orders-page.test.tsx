import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { PurchaseOrdersPage } from '@/components/PurchaseOrdersPage';

const mocks=vi.hoisted(()=>({
  fetchPurchaseOrders:vi.fn(),fetchSuppliers:vi.fn(),fetchProducts:vi.fn(),fetchActiveInventoryWarehouses:vi.fn(),
  submitPurchaseOrder:vi.fn(),createPurchaseOrder:vi.fn(),cancelPurchaseOrder:vi.fn(),receivePurchaseOrder:vi.fn(),
  canManage:true,
}));
vi.mock('@/lib/api',()=>({
  fetchPurchaseOrders:mocks.fetchPurchaseOrders,fetchSuppliers:mocks.fetchSuppliers,fetchProducts:mocks.fetchProducts,
  fetchActiveInventoryWarehouses:mocks.fetchActiveInventoryWarehouses,submitPurchaseOrder:mocks.submitPurchaseOrder,
  createPurchaseOrder:mocks.createPurchaseOrder,cancelPurchaseOrder:mocks.cancelPurchaseOrder,receivePurchaseOrder:mocks.receivePurchaseOrder,
}));
vi.mock('@/lib/auth',()=>({useAuth:()=>({user:{roles:mocks.canManage?['manager']:['staff']}})}));

const draft={
  id:'po-1',organization_id:'org-1',purchase_order_number:'PO-20261019-000001',
  supplier_id:'supplier-1',supplier_name:'مورد موثوق',supplier_code:'SUP-01',
  warehouse_id:'warehouse-1',warehouse_name:'المخزن الرئيسي',status:'draft',notes:null,total_cost:25,
  created_by:'manager-1',submitted_by:null,submitted_at:null,cancelled_by:null,cancelled_at:null,cancellation_reason:null,
  created_at:'2026-10-19T09:00:00Z',updated_at:'2026-10-19T09:00:00Z',
  items:[{id:'line-1',product_id:'product-1',item_code:'0000125',product_name:'سكر',unit:'كرتون',quantity_ordered:2,
    quantity_received:0,remaining_quantity:2,unit_cost:12.5,line_total:25}],
};
const submitted={...draft,status:'submitted',submitted_by:'manager-1',submitted_at:'2026-10-19T09:30:00Z'};

describe('purchase orders page',()=>{
  beforeEach(()=>{
    mocks.canManage=true;
    mocks.fetchPurchaseOrders.mockReset().mockResolvedValue([draft]);
    mocks.fetchSuppliers.mockReset().mockResolvedValue([{id:'supplier-1',name:'مورد موثوق',supplier_code:'SUP-01',status:'active'}]);
    mocks.fetchProducts.mockReset().mockResolvedValue([{id:'product-1',name:'سكر',item_code:'0000125',unit:'كرتون',status:'active'}]);
    mocks.fetchActiveInventoryWarehouses.mockReset().mockResolvedValue([{id:'warehouse-1',name:'المخزن الرئيسي',code:'WH-01'}]);
    mocks.submitPurchaseOrder.mockReset().mockResolvedValue({purchase_order:submitted,idempotent_replay:false});
    mocks.createPurchaseOrder.mockReset().mockResolvedValue({purchase_order:draft,idempotent_replay:false});
    mocks.cancelPurchaseOrder.mockReset().mockResolvedValue({purchase_order:{...draft,status:'cancelled'},idempotent_replay:false});
    mocks.receivePurchaseOrder.mockReset().mockResolvedValue({purchase_order:{...draft,status:'received'},receipt:{id:'receipt-1',receipt_number:'PR-01',purchase_order_id:'po-1',received_at:'2026-10-19T10:00:00Z'},idempotent_replay:false});
  });
  afterEach(()=>{cleanup();vi.restoreAllMocks();});

  it('loads real supplier/catalog references and allows managers to select and submit a saved draft',async()=>{
    mocks.fetchPurchaseOrders.mockResolvedValueOnce([draft]).mockResolvedValueOnce([submitted]);
    render(<PurchaseOrdersPage/>);
    expect(await screen.findByText('PO-20261019-000001')).toBeInTheDocument();
    expect(mocks.fetchSuppliers).toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button',{name:/PO-20261019-000001/}));
    expect(await screen.findByText('مورد موثوق')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button',{name:/تسجيل الإرسال للمورد/}));
    expect(await screen.findByText(/تم تسجيل إرسال أمر الشراء/)).toBeInTheDocument();
    expect(mocks.submitPurchaseOrder).toHaveBeenCalledWith('po-1');
  });

  it('does not call purchase APIs for an account without the manager/admin role',()=>{
    mocks.canManage=false;
    render(<PurchaseOrdersPage/>);
    expect(screen.getByText(/صلاحية إدارة المشتريات مطلوبة/)).toBeInTheDocument();
    expect(mocks.fetchPurchaseOrders).not.toHaveBeenCalled();
  });
});
