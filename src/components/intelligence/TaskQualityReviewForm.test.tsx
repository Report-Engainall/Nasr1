import {fireEvent,render,screen,waitFor} from "@testing-library/react";
import {beforeEach,describe,expect,it,vi} from "vitest";
import {TaskQualityReviewForm} from "./TaskQualityReviewForm";
import {recordOperationalTaskQualityReview} from "@/lib/intelligence/task-quality-reviews-client";
vi.mock("@/lib/intelligence/task-quality-reviews-client",()=>({recordOperationalTaskQualityReview:vi.fn()}));
const save=vi.mocked(recordOperationalTaskQualityReview);
describe("TaskQualityReviewForm",()=>{
 beforeEach(()=>save.mockReset());
 it("requires a reason and reports only a server-confirmed save",async()=>{
  save.mockResolvedValue({ok:true,duplicate:false,event:{id:"11111111-1111-4111-8111-111111111111",eventId:"event",taskId:"22222222-2222-4222-8222-222222222222",decisionOutcomeId:null,reviewType:"RECOMMENDATION_DISPOSITION",actionability:null,disposition:"REJECTED",alertVerdict:null,reasonCode:"DUPLICATE_RECOMMENDATION",createdAt:"2026-11-06T05:00:00Z"}});
  render(<TaskQualityReviewForm taskId="22222222-2222-4222-8222-222222222222" taskUpdatedAt="2026-11-06T05:00:00Z"/>);
  fireEvent.change(screen.getByLabelText("نوع المراجعة"),{target:{value:"RECOMMENDATION_DISPOSITION"}});
  fireEvent.change(screen.getByLabelText("قرار التوصية"),{target:{value:"REJECTED"}});
  fireEvent.change(screen.getByLabelText("سبب التقييم"),{target:{value:"DUPLICATE_RECOMMENDATION"}});
  fireEvent.click(screen.getByRole("button",{name:"حفظ المراجعة"}));
  await waitFor(()=>expect(save).toHaveBeenCalledWith(expect.objectContaining({reviewType:"RECOMMENDATION_DISPOSITION",disposition:"REJECTED",reasonCode:"DUPLICATE_RECOMMENDATION"})));
  expect(await screen.findByRole("status")).toHaveTextContent("تم تسجيل المراجعة");
 });
 it("keeps an idempotency key across an uncertain network retry",async()=>{
  save.mockResolvedValueOnce({ok:false,status:"UNAVAILABLE",message:"انقطاع مؤقت"});
  save.mockResolvedValueOnce({ok:true,duplicate:true,event:{id:"11111111-1111-4111-8111-111111111111",eventId:"event",taskId:"22222222-2222-4222-8222-222222222222",decisionOutcomeId:null,reviewType:"ACTIONABILITY",actionability:"ACTIONABLE",disposition:null,alertVerdict:null,reasonCode:null,createdAt:"2026-11-06T05:00:00Z"}});
  const {rerender}=render(<TaskQualityReviewForm taskId="22222222-2222-4222-8222-222222222222" taskUpdatedAt="2026-11-06T05:00:00Z"/>);
  fireEvent.click(screen.getByRole("button",{name:"حفظ المراجعة"}));
  await screen.findByRole("alert");
  fireEvent.click(screen.getByRole("button",{name:"حفظ المراجعة"}));
  await screen.findByRole("status");
  const first=save.mock.calls[0][0],second=save.mock.calls[1][0];
  expect(second.eventId).toBe(first.eventId);
  expect(second.idempotencyKey).toBe(first.idempotencyKey);
  rerender(<TaskQualityReviewForm taskId="22222222-2222-4222-8222-222222222222" taskUpdatedAt="2026-11-06T05:00:00Z"/>);
 });
 it("does not show success when the server rejects a stale task",async()=>{
  save.mockResolvedValue({ok:false,status:"STALE",message:"تغيرت المهمة"});
  render(<TaskQualityReviewForm taskId="22222222-2222-4222-8222-222222222222" taskUpdatedAt="2026-11-06T05:00:00Z"/>);
  fireEvent.click(screen.getByRole("button",{name:"حفظ المراجعة"}));
  expect(await screen.findByRole("alert")).toHaveTextContent("تغيرت المهمة");
  expect(screen.queryByRole("status")).not.toBeInTheDocument();
 });
});
