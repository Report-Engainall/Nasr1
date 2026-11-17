import { describe,expect,it } from "vitest";
import { canAttachCommitmentEvidence,isCommitmentEvidenceReviewable,parseCommitmentEvidence } from "./cash-expense-commitments";
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
