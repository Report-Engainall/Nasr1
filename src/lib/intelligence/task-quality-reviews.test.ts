import {describe,expect,it} from "vitest";
import {parseTaskQualityMetrics} from "./task-quality-reviews";

const fixture=()=>({
 status:"READY",
 scope:{visibleTaskCount:10,reviewedTaskCount:4},
 actionability:{
  reviewedCount:2,actionableCount:1,notActionableCount:1,deferredCount:0,
  rateDenominator:2,actionableRatePercent:50,
  notActionableReasons:[{reasonCode:"ALREADY_RESOLVED",reviewCount:1,affectedTaskCount:1}],
 },
 disposition:{
  reviewedCount:2,approvedCount:0,rejectedCount:1,deferredCount:1,
  rejectionReasons:[{reasonCode:"DUPLICATE_RECOMMENDATION",reviewCount:1,affectedTaskCount:1}],
  deferralReasons:[{reasonCode:"RESOURCE_UNAVAILABLE",reviewCount:1,affectedTaskCount:1}],
 },
 alerts:{
  reviewedCount:2,truePositiveCount:1,falsePositiveCount:1,needsReviewCount:0,
  falseAlarmDenominator:2,falseAlarmRatePercent:50,
 },
 causeReviewCount:2,
 repeatedCauses:[{reasonCode:"THRESHOLD_NOT_MET",affectedTaskCount:2,reviewCount:2}],
});

describe("parseTaskQualityMetrics",()=>{
 it("accepts balanced manager review counts and explicit denominators",()=>{
  expect(parseTaskQualityMetrics(fixture())).toMatchObject({
   status:"READY",
   actionability:{actionableRatePercent:50,rateDenominator:2},
   disposition:{rejectedCount:1,deferredCount:1},
   alerts:{falseAlarmRatePercent:50,falseAlarmDenominator:2},
   repeatedCauses:[{reasonCode:"THRESHOLD_NOT_MET",affectedTaskCount:2}],
  });
 });
 it("keeps missing service and manager-only details explicit",()=>{
  expect(parseTaskQualityMetrics(undefined)).toEqual({status:"UNAVAILABLE",reasonCode:"QUALITY_REVIEW_MIGRATION_PENDING"});
  expect(parseTaskQualityMetrics({status:"RESTRICTED",reasonCode:"QUALITY_REVIEW_MANAGER_ONLY"})).toEqual({status:"RESTRICTED",reasonCode:"QUALITY_REVIEW_MANAGER_ONLY"});
 });
 it("rejects false-alarm percentage that does not reconcile",()=>{
  const value=fixture();value.alerts.falseAlarmRatePercent=0;
  expect(parseTaskQualityMetrics(value)).toEqual({status:"UNAVAILABLE",reasonCode:"QUALITY_REVIEW_SOURCE_INVALID"});
 });
 it("excludes deferred reviews from actionable and false-alarm denominators",()=>{
  const value=fixture();
  value.actionability={reviewedCount:1,actionableCount:0,notActionableCount:0,deferredCount:1,rateDenominator:0,actionableRatePercent:null,notActionableReasons:[]};
  expect(parseTaskQualityMetrics(value).status).toBe("UNAVAILABLE");
 });
 it("rejects repeated causes affecting only one task",()=>{
  const value=fixture();value.repeatedCauses=[{reasonCode:"THRESHOLD_NOT_MET",affectedTaskCount:1,reviewCount:2}];
  expect(parseTaskQualityMetrics(value).status).toBe("UNAVAILABLE");
 });
});
