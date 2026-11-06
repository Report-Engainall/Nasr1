import {describe,expect,it} from "vitest";
import {parseTaskQualityMetrics} from "./task-quality-reviews";
import {buildTaskQualityInsights} from "./task-quality-insights";
const fixture=()=>({
 status:"READY",scope:{visibleTaskCount:10,reviewedTaskCount:4},
 actionability:{reviewedCount:3,actionableCount:1,notActionableCount:1,deferredCount:1,rateDenominator:2,actionableRatePercent:50,notActionableReasons:[{reasonCode:"ALREADY_RESOLVED",reviewCount:1,affectedTaskCount:1}]},
 disposition:{reviewedCount:3,approvedCount:1,rejectedCount:1,deferredCount:1,rejectionReasons:[{reasonCode:"DUPLICATE_RECOMMENDATION",reviewCount:1,affectedTaskCount:1}],deferralReasons:[{reasonCode:"RESOURCE_UNAVAILABLE",reviewCount:2,affectedTaskCount:1}]},
 alerts:{reviewedCount:2,truePositiveCount:1,falsePositiveCount:1,needsReviewCount:0,falseAlarmDenominator:2,falseAlarmRatePercent:50},
 causeReviewCount:5,repeatedCauses:[{reasonCode:"THRESHOLD_NOT_MET",affectedTaskCount:2,reviewCount:2},{reasonCode:"SOURCE_STALE",affectedTaskCount:3,reviewCount:3}]
});
describe("buildTaskQualityInsights",()=>{
 it("derives six source-backed readings without a composite score",()=>{
  const m=parseTaskQualityMetrics(fixture());if(m.status!=="READY")throw new Error("fixture invalid");
  const x=buildTaskQualityInsights(m);
  expect(x.map(i=>i.key)).toEqual(["REVIEW_COVERAGE","ACTIONABILITY_RATE","DISPOSITION_APPROVAL_RATE","FALSE_ALARM_RATE","DEFERRED_DISPOSITION_SHARE","REPEATED_CAUSE_LEADER"]);
  expect(x[0]).toMatchObject({value:"٤٠٪",state:"LOW_SAMPLE"});
  expect(x[1]).toMatchObject({value:"٥٠٪",state:"LOW_SAMPLE"});
  expect(x[2]).toMatchObject({value:"٥٠٪",state:"LOW_SAMPLE"});
  expect(x[3]).toMatchObject({value:"٥٠٪",state:"LOW_SAMPLE"});
  expect(x[4]).toMatchObject({value:"٣٣٫٣٣٪",state:"LOW_SAMPLE"});
  expect(x[5]).toMatchObject({value:"بيانات المصدر قديمة",state:"READY",evidence:"٣ مهام مختلفة · ٣ مراجعات مرتبطة."});
  expect(x.some(i=>/score|درجة كلية/i.test(i.title))).toBe(false);
 });
 it("keeps deferred and needs-review items out of decisive denominators",()=>{
  const m=parseTaskQualityMetrics(fixture());if(m.status!=="READY")throw new Error("fixture invalid");
  const x=buildTaskQualityInsights(m);
  expect(x[1].evidence).toContain("المؤجل ١ مستبعد من المقام");
  expect(x[2].evidence).toContain("المؤجل ١ مستبعد");
  expect(x[3].evidence).toContain("يحتاج مراجعة ومستبعد");
 });
 it("preserves empty, restricted and unavailable source states",()=>{
  const empty=parseTaskQualityMetrics(undefined);
  expect(empty.status).toBe("UNAVAILABLE");
  expect(buildTaskQualityInsights({status:"RESTRICTED",reasonCode:"QUALITY_REVIEW_MANAGER_ONLY"})[0].state).toBe("RESTRICTED");
  expect(buildTaskQualityInsights({status:"UNAVAILABLE",reasonCode:"QUALITY_REVIEW_MIGRATION_PENDING"})[0].state).toBe("UNAVAILABLE");
 });
 it("does not infer a repeated cause without multiple task IDs",()=>{
  const m=parseTaskQualityMetrics(fixture());if(m.status!=="READY")throw new Error("fixture invalid");
  const x=buildTaskQualityInsights({...m,repeatedCauses:[]}).find(i=>i.key==="REPEATED_CAUSE_LEADER");
  expect(x).toMatchObject({state:"EMPTY",value:"لا يوجد سبب متكرر مثبت"});
 });
});
