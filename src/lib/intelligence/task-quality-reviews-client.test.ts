import {beforeEach,describe,expect,it,vi} from "vitest";
import {recordOperationalTaskQualityReview} from "./task-quality-reviews-client";
const {rpc}=vi.hoisted(()=>({rpc:vi.fn()}));
vi.mock("@/lib/supabase",()=>({supabase:{rpc}}));
const taskId="11111111-1111-4111-8111-111111111111";
const updatedAt="2026-11-06T05:00:00.000Z";
describe("task quality review client",()=>{
 beforeEach(()=>rpc.mockReset());
 it("uses server-derived tenant and actor while accepting caller-stable replay keys",async()=>{
  rpc.mockResolvedValue({data:{ok:true,duplicate:false,event:{
   id:"22222222-2222-4222-8222-222222222222",eventId:"event-0001",taskId,decisionOutcomeId:null,
   reviewType:"ACTIONABILITY",actionability:"NOT_ACTIONABLE",disposition:null,alertVerdict:null,
   reasonCode:"ALREADY_RESOLVED",createdAt:updatedAt,
  }},error:null});
  const result=await recordOperationalTaskQualityReview({
   taskId,taskUpdatedAt:updatedAt,reviewType:"ACTIONABILITY",actionability:"NOT_ACTIONABLE",
   reasonCode:"ALREADY_RESOLVED",eventId:"event-0001",idempotencyKey:"idem-0001",
  });
  expect(rpc).toHaveBeenCalledWith("record_operational_task_quality_review",expect.objectContaining({
   p_task_id:taskId,p_expected_task_updated_at:updatedAt,p_review_type:"ACTIONABILITY",
   p_review:{actionability:"NOT_ACTIONABLE",reasonCode:"ALREADY_RESOLVED"},
   p_event_id:"event-0001",p_idempotency_key:"idem-0001",
  }));
  expect(rpc.mock.calls[0][1]).not.toHaveProperty("p_organization_id");
  expect(rpc.mock.calls[0][1]).not.toHaveProperty("p_actor_id");
  expect(result).toMatchObject({ok:true,duplicate:false,event:{taskId,reasonCode:"ALREADY_RESOLVED"}});
 });
 it("maps stale and denied source responses",async()=>{
  rpc.mockResolvedValueOnce({data:null,error:{code:"40001"}});
  expect(await recordOperationalTaskQualityReview({taskId,taskUpdatedAt:updatedAt,reviewType:"ACTIONABILITY",actionability:"ACTIONABLE"})).toMatchObject({ok:false,status:"STALE"});
  rpc.mockResolvedValueOnce({data:null,error:{code:"42501"}});
  expect(await recordOperationalTaskQualityReview({taskId,taskUpdatedAt:updatedAt,reviewType:"ACTIONABILITY",actionability:"ACTIONABLE"})).toMatchObject({ok:false,status:"DENIED"});
 });
 it("rejects a rejected recommendation without reason before calling RPC",async()=>{
  const result=await recordOperationalTaskQualityReview({taskId,taskUpdatedAt:updatedAt,reviewType:"RECOMMENDATION_DISPOSITION",disposition:"REJECTED"});
  expect(result).toMatchObject({ok:false,status:"ERROR"});
  expect(rpc).not.toHaveBeenCalled();
 });
});
