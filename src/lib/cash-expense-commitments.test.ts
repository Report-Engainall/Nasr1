import { describe,expect,it } from "vitest";
import { canAttachCommitmentEvidence,isCashExpenseCommitmentStatus,isCommitmentEvidenceReviewable,parseCommitmentEvidence,parseCommitmentRejectionMetadata } from "./cash-expense-commitments";
const id="11111111-1111-4111-8111-111111111111";
const evidence={id:"22222222-2222-4222-8222-222222222222",commitment_id:id,storage_path:id+"/33333333-3333-4333-8333-333333333333.pdf",
 file_name:"lease.pdf",mime_type:"application/pdf",byte_size:1024,content_sha256:"a".repeat(64),created_at:"2026-11-17T00:00:00.000Z"};
describe("cash expense commitment evidence handling",()=>{
 it("validates evidence metadata before generating a private signed URL",()=>{expect(parseCommitmentEvidence([evidence])).toEqual([evidence]);});
 it("rejects unsafe paths, names, MIME types, digests and duplicate IDs",()=>{
  expect(()=>parseCommitmentEvidence([{...evidence,storage_path:"other/file.pdf"}])).toThrow();
  expect(()=>parseCommitmentEvidence([{...evidence,file_name:"../lease.pdf"}])).toThrow();
  expect(()=>parseCommitmentEvidence([{...evidence,mime_type:"text/html"}])).toThrow();
  expect(()=>parseCommitmentEvidence([{...evidence,content_sha256:"invalid"}])).toThrow();
  expect(()=>parseCommitmentEvidence([evidence,evidence])).toThrow();
 });
 it("allows creator-only evidence recovery while pending and below ten files",()=>{
  const base={status:"pending_approval",creatorProfileId:"creator",currentProfileId:"creator",evidenceCount:0};
  expect(canAttachCommitmentEvidence(base)).toBe(true);
  expect(canAttachCommitmentEvidence({...base,currentProfileId:"other"})).toBe(false);
  expect(canAttachCommitmentEvidence({...base,status:"approved"})).toBe(false);
  expect(canAttachCommitmentEvidence({...base,evidenceCount:10})).toBe(false);
 });
 it("blocks approval until every source document is loaded, accessible and reviewed",()=>{
  const complete={expectedCount:2,loadedCount:2,loadFailed:false,accessibleCount:2,reviewedCount:2};
  expect(isCommitmentEvidenceReviewable(complete)).toBe(true);
  expect(isCommitmentEvidenceReviewable({...complete,accessibleCount:1})).toBe(false);
  expect(isCommitmentEvidenceReviewable({...complete,reviewedCount:1})).toBe(false);
  expect(isCommitmentEvidenceReviewable({...complete,loadedCount:1})).toBe(false);
  expect(isCommitmentEvidenceReviewable({...complete,loadFailed:true})).toBe(false);
  expect(isCommitmentEvidenceReviewable({...complete,expectedCount:0,loadedCount:0,accessibleCount:0,reviewedCount:0})).toBe(false);
 });
});

describe("cash expense commitment rejection contract",()=>{
 const rejected={rejected_by_profile_id:"44444444-4444-4444-8444-444444444444",
  rejected_at:"2026-11-17T02:00:00.000Z",rejection_reason:"المستند لا يثبت الالتزام المطلوب"};
 it("accepts the persisted rejected lifecycle status and its complete decision metadata",()=>{
  expect(isCashExpenseCommitmentStatus("rejected")).toBe(true);
  expect(parseCommitmentRejectionMetadata("rejected",rejected)).toEqual(rejected);
 });
 it("keeps every existing lifecycle state valid and rejects unknown states",()=>{
  for(const status of ["pending_approval","approved","rejected","cancelled","payment_recorded","settled"])
   expect(isCashExpenseCommitmentStatus(status)).toBe(true);
  expect(isCashExpenseCommitmentStatus("refunded")).toBe(false);
  expect(isCashExpenseCommitmentStatus(null)).toBe(false);
 });
 it("fails closed on incomplete rejection metadata or metadata attached to another state",()=>{
  expect(()=>parseCommitmentRejectionMetadata("rejected",{...rejected,rejection_reason:null})).toThrow();
  expect(()=>parseCommitmentRejectionMetadata("rejected",{...rejected,rejected_by_profile_id:"not-a-uuid"})).toThrow();
  expect(()=>parseCommitmentRejectionMetadata("rejected",{...rejected,rejected_at:"not-a-date"})).toThrow();
  expect(()=>parseCommitmentRejectionMetadata("rejected",{rejected_by_profile_id:null,rejected_at:null,rejection_reason:null})).toThrow();
  expect(()=>parseCommitmentRejectionMetadata("approved",rejected)).toThrow();
  expect(parseCommitmentRejectionMetadata("approved",{rejected_by_profile_id:null,rejected_at:null,rejection_reason:null})).toBeNull();
 });
});
