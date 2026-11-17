// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { afterEach,beforeEach,describe,expect,it,vi } from "vitest";
import { cleanup,fireEvent,render,screen,waitFor } from "@testing-library/react";

const mocks=vi.hoisted(()=>({useAuth:vi.fn(),rpc:vi.fn(),from:vi.fn(),createSignedUrl:vi.fn()}));
vi.mock("@/lib/auth",()=>({useAuth:mocks.useAuth}));
vi.mock("@/lib/supabase",()=>({
 supabase:{rpc:mocks.rpc,from:mocks.from,storage:{from:()=>({createSignedUrl:mocks.createSignedUrl})}}
}));

import { CashExpenseCommitmentWorkspace } from "./CashExpenseCommitmentWorkspace";

const commitmentId="11111111-1111-4111-8111-111111111111";
const managerProfileId="22222222-2222-4222-8222-222222222222";
const creatorProfileId="33333333-3333-4333-8333-333333333333";
const evidenceId="44444444-4444-4444-8444-444444444444";
const evidence=[{
 id:evidenceId,commitment_id:commitmentId,
 storage_path:commitmentId+"/55555555-5555-4555-8555-555555555555.pdf",
 file_name:"lease.pdf",mime_type:"application/pdf",byte_size:1024,
 content_sha256:"a".repeat(64),created_at:"2026-11-17T00:00:00.000Z"
}];
const pending={
 id:commitmentId,commitment_number:"OPC-TEST-001",category:"إيجار",description:"إيجار مستودع",
 amount:"250.75",currency:"YER",payment_method:"transfer",due_date:"2026-12-01",
 status:"pending_approval",created_by_profile_id:creatorProfileId,
 payment_cash_expense_id:null,journal_entry_id:null,journal_status:null,evidence_count:1,
 rejected_by_profile_id:null,rejected_at:null,rejection_reason:null
};
let current:Record<string,unknown>;

function installData(){
 mocks.useAuth.mockReturnValue({ready:true,sessionRevision:1,user:{
  id:"manager-user",profileId:managerProfileId,roles:["manager"]
 }});
 mocks.rpc.mockImplementation(async(name:string)=>{
  if(name==="fetch_cash_expense_commitments")return {data:{items:[current]},error:null};
  if(name==="fetch_general_ledger")return {data:{accounts:[]},error:null};
  if(name==="reject_cash_expense_commitment"){
   current={...pending,status:"rejected",rejected_by_profile_id:managerProfileId,
    rejected_at:"2026-11-17T02:00:00.000Z",rejection_reason:"المستند لا يثبت الالتزام المطلوب"};
   return {data:{id:commitmentId,status:"rejected",replayed:false},error:null};
  }
  return {data:null,error:{message:"Unexpected RPC: "+name}};
 });
 mocks.from.mockImplementation(()=>({
  select:()=>({in:()=>({order:async()=>({data:evidence,error:null})})})
 }));
 mocks.createSignedUrl.mockResolvedValue({data:{signedUrl:"https://example.invalid/signed-evidence"},error:null});
}

beforeEach(()=>{
 vi.clearAllMocks();
 current={...pending};
 installData();
 vi.stubGlobal("crypto",{randomUUID:()=>"66666666-6666-4666-8666-666666666666"});
});
afterEach(()=>{cleanup();vi.unstubAllGlobals();});

describe("CashExpenseCommitmentWorkspace rejection lifecycle",()=>{
 it("requires every source document to be opened and reviewed before independent rejection",async()=>{
  const prompt=vi.spyOn(window,"prompt").mockReturnValue("المستند لا يثبت الالتزام المطلوب");
  render(<CashExpenseCommitmentWorkspace/>);
  const rejectButton=await screen.findByRole("button",{name:"رفض الالتزام مع توثيق السبب"});
  expect(rejectButton).toBeDisabled();

  fireEvent.click(screen.getByRole("button",{name:"معاينة مستند خاص"}));
  await screen.findByRole("link",{name:"فتح مستند المصدر"});
  fireEvent.click(screen.getByRole("checkbox",{name:"تمت مراجعة المستند"}));
  await waitFor(()=>expect(rejectButton).toBeEnabled());

  fireEvent.click(rejectButton);
  await waitFor(()=>expect(mocks.rpc).toHaveBeenCalledWith("reject_cash_expense_commitment",{
   p_commitment_id:commitmentId,p_reason:"المستند لا يثبت الالتزام المطلوب",
   p_idempotency_key:"66666666-6666-4666-8666-666666666666"
  }));
  expect(prompt).toHaveBeenCalledTimes(1);
  expect(await screen.findByText(/سبب الرفض: المستند لا يثبت الالتزام المطلوب/)).toBeInTheDocument();
  expect(screen.getByText(/مرفوض — مستبعد من التوقع/)).toBeInTheDocument();
 });

 it("loads a previously rejected row and its decision reason without breaking the list",async()=>{
  current={...pending,status:"rejected",rejected_by_profile_id:managerProfileId,
   rejected_at:"2026-11-17T02:00:00.000Z",rejection_reason:"لم يطابق مستند المصدر شروط الاعتماد"};
  render(<CashExpenseCommitmentWorkspace/>);
  expect(await screen.findByText(/سبب الرفض: لم يطابق مستند المصدر شروط الاعتماد/)).toBeInTheDocument();
  expect(screen.getByText(/مرفوض — مستبعد من التوقع/)).toBeInTheDocument();
  expect(screen.queryByRole("button",{name:"رفض الالتزام مع توثيق السبب"})).not.toBeInTheDocument();
 });

 it("does not expose reviewer rejection controls to accountants",async()=>{
  mocks.useAuth.mockReturnValue({ready:true,sessionRevision:1,user:{
   id:"accountant-user",profileId:managerProfileId,roles:["accountant"]
  }});
  render(<CashExpenseCommitmentWorkspace/>);
  await screen.findByText("الالتزامات المحفوظة (1)");
  expect(screen.queryByRole("button",{name:"رفض الالتزام مع توثيق السبب"})).not.toBeInTheDocument();
  expect(mocks.rpc).toHaveBeenCalledWith("fetch_cash_expense_commitments",{p_limit:100,p_offset:0});
 });
});
