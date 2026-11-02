import {afterEach,beforeEach,describe,expect,it,vi} from "vitest";
import {cleanup,fireEvent,render,screen,waitFor} from "@testing-library/react";
const mocks=vi.hoisted(()=>({useAuth:vi.fn(),rpc:vi.fn(),download:vi.fn()}));
vi.mock("@/lib/auth",()=>({useAuth:mocks.useAuth}));
vi.mock("@/lib/supabase",()=>({supabase:{rpc:mocks.rpc}}));
vi.mock("@/lib/customer-return-review-xlsx",()=>({downloadCustomerReturnReviewWorkbookXlsx:mocks.download}));
import {CustomerReturnReviewQueue} from "@/components/CustomerReturnReviewQueue";
const rows=[{id:"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",request_number:"RET-20261103-0001",status:"submitted",reason:"damaged",notes:"ملاحظة عميل داخلية",created_at:"2026-11-03T08:00:00.000Z",order_id:"bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",order_number:"00004125",customer_name:"عميل الاختبار",customer_code:"000017",items:[{item_code:"000125",product_name:"صنف تالف",unit:"كرتون",requested_quantity:1.25}]}];
describe("customer return review XLSX action",()=>{
 beforeEach(()=>{
  mocks.useAuth.mockReset().mockReturnValue({user:{roles:["manager"]}});
  mocks.rpc.mockReset().mockImplementation(async(name:string)=>name==="list_customer_return_review_queue"?{data:rows,error:null}:{data:null,error:{message:"unexpected RPC "+name}});
  mocks.download.mockReset().mockReturnValue(true);
 });
 afterEach(()=>{cleanup();vi.restoreAllMocks();});
 it("exports only the server-returned open manager queue",async()=>{
  const onNotice=vi.fn();render(<CustomerReturnReviewQueue onNotice={onNotice}/>);
  await screen.findByText("RET-20261103-0001");
  fireEvent.click(screen.getByRole("button",{name:/تصدير قائمة المراجعة الحالية/}));
  await waitFor(()=>expect(mocks.download).toHaveBeenCalledTimes(1));
  expect(mocks.download).toHaveBeenCalledWith(expect.objectContaining({rows,roles:["manager"]}));
  expect(onNotice).toHaveBeenCalledWith(expect.stringContaining("حتى 50 طلباً"));
 });
 it("hides export from staff and customers",async()=>{
  mocks.useAuth.mockReturnValue({user:{roles:["staff"]}});
  render(<CustomerReturnReviewQueue onNotice={vi.fn()}/>);
  await screen.findByText("RET-20261103-0001");
  expect(screen.queryByRole("button",{name:/تصدير قائمة المراجعة/})).not.toBeInTheDocument();
 });
 it("surfaces workbook creation and browser download failures",async()=>{
  mocks.download.mockImplementation(()=>{throw new Error("تعذر إنشاء مستند المراجعة.");});
  render(<CustomerReturnReviewQueue onNotice={vi.fn()}/>);
  await screen.findByText("RET-20261103-0001");
  fireEvent.click(screen.getByRole("button",{name:/تصدير قائمة المراجعة الحالية/}));
  expect(await screen.findByRole("alert")).toHaveTextContent("تعذر إنشاء مستند المراجعة.");
 });
});

