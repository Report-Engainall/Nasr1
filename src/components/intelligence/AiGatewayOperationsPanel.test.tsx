// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { afterEach,beforeEach,describe,expect,it,vi } from "vitest";
import { cleanup,fireEvent,render,screen,within } from "@testing-library/react";
const mocks=vi.hoisted(()=>({fetchAiGatewayBudget:vi.fn()}));
vi.mock("@/lib/intelligence/ai-gateway-operations-client",()=>({fetchAiGatewayBudget:mocks.fetchAiGatewayBudget}));
import {AiGatewayOperationsPanel} from "./AiGatewayOperationsPanel";
const readyBudget={ok:true as const,status:"READY" as const,readAt:"2026-11-14T00:00:00.000Z",data:{
 configured:true,enabled:true,fallbackEnabled:true,primaryProvider:"gemini" as const,primaryModel:"gemini-example-model",
 fallbackProvider:"openai_compatible" as const,fallbackModel:"openai-example-model",
 limits:{dailyCost:1,monthlyCost:10,perRequestCost:.25,dailyTokens:10000,monthlyTokens:100000},
 usage:{todayCost:0,monthCost:0,todayTokens:0,monthTokens:0,activeReservedCost:0,activeReservedTodayTokens:0,activeReservedMonthTokens:0},keysStoredInDatabase:false as const}};
afterEach(()=>cleanup());beforeEach(()=>{vi.clearAllMocks();mocks.fetchAiGatewayBudget.mockResolvedValue(readyBudget);});
describe("AiGatewayOperationsPanel",()=>{
 it("separates provider/model setup from free eligibility and unknown quota",async()=>{
  render(<AiGatewayOperationsPanel/>);
  expect(await screen.findByText("حالة أهلية المزودين للاستخدام المجاني")).toBeInTheDocument();
  expect(screen.getAllByText("الأهلية المجانية: غير متحققة — BLOCKED")).toHaveLength(2);
  expect(screen.getAllByText("آخر تحقق: لم يسجل المصدر وقت تحقق مجاني.")).toHaveLength(2);
  fireEvent.click(screen.getByRole("tab",{name:"النماذج"}));
  const modelsPanel=screen.getByRole("tabpanel");
  expect(within(modelsPanel).getByText("gemini-example-model")).toBeInTheDocument();
  expect(within(modelsPanel).getByText("openai-example-model")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("tab",{name:"الحصص"}));
  expect(screen.getAllByText("غير متاح — لم يرده المصدر")).toHaveLength(2);
  expect(screen.getByText("غير متحققة؛ لا يمكن اختيار المزود")).toBeInTheDocument();
 });
 it("does not claim provider connectivity or automatic deterministic fallback",async()=>{
  render(<AiGatewayOperationsPanel/>);
  expect(await screen.findByText("حالة أهلية المزودين للاستخدام المجاني")).toBeInTheDocument();
  expect(screen.getByText(/لا تُجرى محاولة اختبار أو اتصال/)).toBeInTheDocument();
  expect(screen.getByText(/التحويل التلقائي من Edge Gateway إليها لم يثبت/)).toBeInTheDocument();
 });
});
