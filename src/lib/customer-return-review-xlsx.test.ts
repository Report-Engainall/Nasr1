import {describe,expect,it} from "vitest";
import {buildCustomerReturnReviewWorkbookXlsx,type CustomerReturnReviewXlsxInput,type CustomerReturnReviewXlsxRequest} from "@/lib/customer-return-review-xlsx";
const exportedAt="2026-11-03T09:00:00.000Z";
function request(overrides:Partial<CustomerReturnReviewXlsxRequest>={}):CustomerReturnReviewXlsxRequest{
 return {id:"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",request_number:"RET-20261103-0001",status:"submitted",reason:"damaged",notes:"هذه الملاحظة لا يجب تصديرها",created_at:"2026-11-03T08:00:00.000Z",order_id:"bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",order_number:"00004125",customer_name:'=HYPERLINK("https://evil.invalid","عميل")',customer_code:"000017",items:[{item_code:"000125",product_name:"صنف تالف",unit:"كرتون",requested_quantity:1.25}],...overrides};
}
function input(overrides:Partial<CustomerReturnReviewXlsxInput>={}):CustomerReturnReviewXlsxInput{return {roles:["manager"],exportedAt,rows:[request()],...overrides};}
function unzip(bytes:Uint8Array):Map<string,string>{
 const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength),decoder=new TextDecoder(),files=new Map<string,string>();let offset=0;
 while(offset+30<bytes.length&&view.getUint32(offset,true)===0x04034b50){
  if(view.getUint16(offset+8,true)!==0)throw new Error("Expected stored ZIP entry.");
  const size=view.getUint32(offset+18,true),nameLen=view.getUint16(offset+26,true),extraLen=view.getUint16(offset+28,true);
  const nameStart=offset+30,dataStart=nameStart+nameLen+extraLen;
  files.set(decoder.decode(bytes.slice(nameStart,nameStart+nameLen)),decoder.decode(bytes.slice(dataStart,dataStart+size)));
  offset=dataStart+size;
 }
 return files;
}
describe("customer return review XLSX report",()=>{
 it("exports current open requests and item rows into separate sheets",()=>{
  const files=unzip(buildCustomerReturnReviewWorkbookXlsx(input())),book=files.get("xl/workbook.xml")??"",summary=files.get("xl/worksheets/sheet1.xml")??"",details=files.get("xl/worksheets/sheet2.xml")??"";
  expect(book).toContain("طلبات المراجعة");expect(book).toContain("أصناف المرتجعات");
  expect(summary).toContain("RET-20261103-0001");expect(summary).toContain("00004125");expect(summary).toContain("000017");expect(summary).toContain("حتى 50 طلباً");
  expect(details).toContain("000125");expect(details).toContain("<v>1.25</v>");
 });
 it("escapes formula-looking text and excludes internal identifiers and customer free-text notes",()=>{
  const files=unzip(buildCustomerReturnReviewWorkbookXlsx(input())),all=(files.get("xl/worksheets/sheet1.xml")??"")+(files.get("xl/worksheets/sheet2.xml")??"");
  expect(all).toContain('t="inlineStr"');expect(all).toContain('=HYPERLINK(&quot;https://evil.invalid&quot;,&quot;عميل&quot;)');expect(all).not.toContain("<f");
  for(const value of ["aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa","bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb","هذه الملاحظة لا يجب تصديرها","order_id"])expect(all).not.toContain(value);
 });
 it("preserves zero-padded codes and quantities to three decimal places",()=>{
  const files=unzip(buildCustomerReturnReviewWorkbookXlsx(input({rows:[request({customer_code:"000018",items:[{item_code:"000126",product_name:"صنف آخر",unit:"حبة",requested_quantity:0.001}]})]})));
  expect(files.get("xl/worksheets/sheet1.xml")).toContain("000018");
  const details=files.get("xl/worksheets/sheet2.xml")??"";
  expect(details).toContain("000126");expect(details).toContain("<v>0.001</v>");
 });
 it("allows only admin and manager roles",()=>{
  for(const role of ["staff","accountant","customer"])expect(()=>buildCustomerReturnReviewWorkbookXlsx(input({roles:[role]}))).toThrow("تصدير مراجعة المرتجعات متاح للمدير والمسؤول فقط.");
  for(const role of ["admin","manager"])expect(()=>buildCustomerReturnReviewWorkbookXlsx(input({roles:[role]}))).not.toThrow();
 });
 it("rejects more than 50 requests, duplicate request identities and closed statuses",()=>{
  expect(()=>buildCustomerReturnReviewWorkbookXlsx(input({rows:Array.from({length:51},(_,i)=>request({id:"id-"+i,request_number:"RET-"+i}))}))).toThrow("قائمة المراجعة يجب أن تحتوي");
  expect(()=>buildCustomerReturnReviewWorkbookXlsx(input({rows:[request(),request()]}))).toThrow(/تكرر/);
  expect(()=>buildCustomerReturnReviewWorkbookXlsx(input({rows:[request({status:"approved" as never})]}))).toThrow(/خرج من قائمة المراجعة/);
 });
 it("rejects invalid dates, quantities, and empty or oversized item lists",()=>{
  expect(()=>buildCustomerReturnReviewWorkbookXlsx(input({rows:[request({created_at:"not-a-date"})]}))).toThrow(/تاريخ إنشاء/);
  expect(()=>buildCustomerReturnReviewWorkbookXlsx(input({rows:[request({items:[{item_code:null,product_name:"صنف",unit:null,requested_quantity:0}]})]}))).toThrow(/كمية صنف/);
  expect(()=>buildCustomerReturnReviewWorkbookXlsx(input({rows:[request({items:[]})]}))).toThrow(/من 1 إلى 100/);
 });
});

