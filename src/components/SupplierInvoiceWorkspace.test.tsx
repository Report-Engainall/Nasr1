// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { createElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SupplierInvoiceRecord } from "@/lib/supplier-invoices";
const mocks=vi.hoisted(()=>({useAuth:vi.fn(),fetchPurchaseOrders:vi.fn(),fetchWorkspace:vi.fn(),fetchDueDates:vi.fn(),fetchEvidence:vi.fn(),recordInvoice:vi.fn(),reviewVariance:vi.fn(),fetchAccountingStatus:vi.fn(),prepareAccountingDraft:vi.fn(),recordDueDate:vi.fn(),uploadEvidence:vi.fn(),signedEvidenceUrl:vi.fn()}));
vi.mock("@/lib/auth",()=>({useAuth:mocks.useAuth}));
vi.mock("@/lib/api",()=>({fetchPurchaseOrders:mocks.fetchPurchaseOrders}));
vi.mock("@/lib/supplier-invoices",()=>({fetchSupplierInvoiceWorkspace:mocks.fetchWorkspace,recordSupplierInvoice:mocks.recordInvoice,reviewSupplierInvoiceVariance:mocks.reviewVariance,fetchSupplierInvoiceAccountingStatus:mocks.fetchAccountingStatus,prepareSupplierInvoiceAccountingDraft:mocks.prepareAccountingDraft,fetchSupplierInvoiceEvidence:mocks.fetchEvidence,fetchSupplierInvoiceDueDates:mocks.fetchDueDates,recordSupplierInvoiceDueDate:mocks.recordDueDate,uploadSupplierInvoiceEvidence:mocks.uploadEvidence,createSupplierInvoiceEvidenceSignedUrl:mocks.signedEvidenceUrl}));
vi.mock("@/lib/supplier-invoice-accounting-print",()=>({projectSupplierInvoiceAccountingPrintDocument:vi.fn()}));
vi.mock("@/lib/supplier-invoice-accounting-xlsx",()=>({downloadSupplierInvoiceAccountingWorkbookXlsx:vi.fn()}));
vi.mock("@/components/SupplierInvoiceAccountingPrintSheet",()=>({SupplierInvoiceAccountingPrintSheet:()=>null}));
import { SupplierInvoiceWorkspace } from "./SupplierInvoiceWorkspace";
function invoice(overrides:Partial<SupplierInvoiceRecord>={}):SupplierInvoiceRecord{return {id:"11111111-1111-4111-8111-111111111111",purchaseOrderId:"22222222-2222-4222-8222-222222222222",purchaseOrderNumber:"PO-045",supplierId:"33333333-3333-4333-8333-333333333333",supplierName:"مؤسسة الميناء",invoiceNumber:"INV-001",invoiceDate:"2026-11-15",currency:"YER",merchandiseSubtotal:"100.00",taxAmount:"0.00",invoiceTotalAmount:"100.00",expectedMerchandiseSubtotal:"100.00",merchandiseVarianceAmount:"0.00",matchStatus:"matched",taxAccountingStatus:"not_required",createdByProfileId:"44444444-4444-4444-8444-444444444444",createdAt:"2026-11-15T10:00:00.000Z",reviewedByProfileId:null,reviewedAt:null,reviewReason:null,lines:[],history:[],...overrides};}
const invoices=Array.from({length:27},(_,i)=>invoice({id:`${String(i+1).padStart(8,"0")}-1111-4111-8111-${String(i+1).padStart(12,"0")}`,invoiceNumber:`INV-${String(i+1).padStart(3,"0")}`,purchaseOrderNumber:`PO-${String(i+45).padStart(3,"0")}`,supplierName:i===25?"مَتْجَرُ الأَغْبَرِي":"مؤسسة الميناء",matchStatus:i===26?"variance_pending":"matched",merchandiseVarianceAmount:i===26?"5.00":"0.00",createdAt:`2026-11-15T10:${String(i).padStart(2,"0")}:00.000Z`}));
function normalize(value:string){return value.normalize("NFKC").toLowerCase().replace(/[\u064B-\u065F\u0670\u0640]/g,"").replace(/[أإآٱ]/g,"ا").replace(/ى/g,"ي").replace(/[٠-٩]/g,d=>String(d.charCodeAt(0)-0x0660)).replace(/[۰-۹]/g,d=>String(d.charCodeAt(0)-0x06f0)).replace(/\s+/g," ").trim();}
describe("supplier invoice server-side register filters",()=>{
 afterEach(()=>cleanup());
 beforeEach(()=>{
  vi.clearAllMocks();
  mocks.useAuth.mockReturnValue({sessionRevision:1,user:{id:"manager-1",profileId:"manager-profile-1",roles:["manager"]}});
  mocks.fetchWorkspace.mockImplementation(async(input:{search?:string;matchStatus?:string;limit?:number;offset?:number}={})=>{
   const limit=input.limit??25,offset=input.offset??0,terms=normalize(input.search??"").split(" ").filter(Boolean);
   const rows=invoices.filter(row=>{if(input.matchStatus&&input.matchStatus!=="all"&&row.matchStatus!==input.matchStatus)return false;const value=normalize([row.invoiceNumber,row.supplierName,row.purchaseOrderNumber,row.invoiceDate].join(" "));return terms.every(t=>value.includes(t));});
   return {purchaseOrders:[],receivableLines:[],invoices:rows.slice(offset,offset+limit),invoiceCount:rows.length,limit,offset,hasMore:rows.length>offset+limit,asOfDate:"2026-11-16"};
  });
  mocks.fetchDueDates.mockResolvedValue([]);mocks.fetchEvidence.mockResolvedValue([]);
 });
 async function mount(){render(createElement(SupplierInvoiceWorkspace,{mode:"capture",accounts:[],purchaseOrders:[]}));await screen.findByRole("button",{name:/INV-001/});await waitFor(()=>expect(mocks.fetchWorkspace).toHaveBeenCalledTimes(1));}
 it("searches records outside page one and normalizes Arabic diacritics, alef and digits",async()=>{
  await mount();expect(screen.queryByRole("button",{name:/INV-026/})).not.toBeInTheDocument();
  fireEvent.change(screen.getByRole("searchbox",{name:"بحث فواتير المورد"}),{target:{value:"الأَغْبَرِي INV-٠٢٦"}});
  expect(await screen.findByRole("button",{name:/INV-026/})).toBeInTheDocument();
  await waitFor(()=>expect(mocks.fetchWorkspace).toHaveBeenLastCalledWith(expect.objectContaining({search:"الأَغْبَرِي INV-٠٢٦",matchStatus:"all",offset:0,limit:25})));
  expect(screen.getByText(/إجمالي النتائج المطابقة في السجل: 1/)).toBeInTheDocument();
  expect(screen.queryByRole("button",{name:/INV-001/})).not.toBeInTheDocument();
 });
 it("filters status against every record, not only the initial page",async()=>{
  await mount();expect(screen.queryByRole("button",{name:/INV-027/})).not.toBeInTheDocument();
  fireEvent.change(screen.getByRole("combobox",{name:"تصفية حالة مطابقة فواتير المورد"}),{target:{value:"variance_pending"}});
  expect(await screen.findByRole("button",{name:/INV-027/})).toBeInTheDocument();
  await waitFor(()=>expect(mocks.fetchWorkspace).toHaveBeenLastCalledWith(expect.objectContaining({matchStatus:"variance_pending",offset:0,limit:25})));
  expect(screen.getByText(/إجمالي النتائج المطابقة في السجل: 1/)).toBeInTheDocument();
 });
 it("returns global empty state and clears filters by loading the original first page",async()=>{
  await mount();fireEvent.change(screen.getByRole("searchbox",{name:"بحث فواتير المورد"}),{target:{value:"لا يوجد هذا الرقم"}});
  expect(await screen.findByText("لا توجد فواتير مطابقة لعبارة البحث وحالة المطابقة في كامل السجل.")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button",{name:"مسح البحث والتصفية"}));
  expect(await screen.findByRole("button",{name:/INV-001/})).toBeInTheDocument();
  await waitFor(()=>expect(mocks.fetchWorkspace).toHaveBeenLastCalledWith(expect.objectContaining({search:"",matchStatus:"all",offset:0})));
 });
 it("retains search/status filters while paginating the filtered server result",async()=>{
  await mount();fireEvent.change(screen.getByRole("searchbox",{name:"بحث فواتير المورد"}),{target:{value:"INV"}});
  await waitFor(()=>expect(mocks.fetchWorkspace).toHaveBeenLastCalledWith(expect.objectContaining({search:"INV",matchStatus:"all",offset:0})));
  fireEvent.click(screen.getByRole("button",{name:"التالي"}));
  await waitFor(()=>expect(mocks.fetchWorkspace).toHaveBeenLastCalledWith(expect.objectContaining({search:"INV",matchStatus:"all",offset:25})));
  expect(await screen.findByRole("button",{name:/INV-026/})).toBeInTheDocument();
 });
});
