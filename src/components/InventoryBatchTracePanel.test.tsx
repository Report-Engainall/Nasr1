// @vitest-environment jsdom
import { beforeEach,describe,expect,it,vi } from 'vitest';
import { cleanup,fireEvent,render,screen,waitFor } from '@testing-library/react';
import { afterEach } from 'vitest';
afterEach(cleanup);
const mocks=vi.hoisted(()=>({products:vi.fn(),stock:vi.fn()}));
vi.mock('@/lib/api',()=>({fetchInventoryBatchProducts:mocks.products,fetchInventoryBatchStock:mocks.stock}));
import { InventoryBatchTracePanel } from './InventoryBatchTracePanel';
const warehouse='d0000000-0000-0000-0000-000000000001',product='a1000000-0000-0000-0000-000000000001';
describe('InventoryBatchTracePanel',()=>{
 beforeEach(()=>{mocks.products.mockReset();mocks.stock.mockReset();});
 it('shows lot number, expiry, reserved quantity and unattributed opening stock',async()=>{
  mocks.products.mockResolvedValue([{product_id:product,item_code:'SKU-1',product_name:'منتج اختبار',unit:'كرتون'}]);
  mocks.stock.mockResolvedValue({product_id:product,warehouse_id:warehouse,quantity_on_hand:5,quantity_reserved:1,quantity_available:4,as_of:'2026-11-17T00:00:00Z',
   lots:[
    {id:'a1000000-0000-0000-0000-000000000010',batch_number:'LOT-01',expiry_date:'2026-12-01',received_at:'2026-10-01T00:00:00Z',quantity_on_hand:2,quantity_reserved:1,quantity_available:1,source_type:'purchase_receipt',expired:false},
    {id:'a1000000-0000-0000-0000-000000000011',batch_number:null,expiry_date:null,received_at:'2026-09-01T00:00:00Z',quantity_on_hand:3,quantity_reserved:0,quantity_available:3,source_type:'legacy_unattributed',expired:false},
   ]});
  render(<InventoryBatchTracePanel warehouseId={warehouse} warehouseName="الرئيسي"/>);
  expect(await screen.findByText('LOT-01')).toBeTruthy();
  expect(screen.getByText('غير منسوب')).toBeTruthy();
  expect(screen.getByText('رصيد قديم غير منسوب')).toBeTruthy();
  expect(screen.getByText('2026-12-01')).toBeTruthy();
  expect(mocks.stock).toHaveBeenCalledWith(product,warehouse);
 });
 it('shows authorization failure and exposes retry',async()=>{
  mocks.products.mockRejectedValueOnce(new Error('inventory.read_balance capability required')).mockResolvedValueOnce([]);
  render(<InventoryBatchTracePanel warehouseId={warehouse} warehouseName="الرئيسي"/>);
  expect(await screen.findByText('inventory.read_balance capability required')).toBeTruthy();
  expect(screen.getByRole('button',{name:'إعادة محاولة تحميل الدفعات'})).toBeTruthy();
  fireEvent.click(screen.getByRole('button',{name:'إعادة محاولة تحميل الدفعات'}));
  await waitFor(()=>expect(mocks.products).toHaveBeenCalledTimes(2));
 });
});
