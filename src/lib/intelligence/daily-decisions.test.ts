import {describe,expect,it} from "vitest";
import {buildDailyDecisions} from "./daily-decisions";
import type {DecisionRule,EvidenceRecord,MetricSnapshot} from "./index";
const evidence=(id="ev-1"):EvidenceRecord=>({id,source:{kind:"RPC",name:"analytics.orders",version:"v1"},sourceTimestamp:"2026-10-30T07:00:00Z",asOf:"2026-10-30T07:00:00Z",period:{from:"2026-10-01",to:"2026-10-30"},status:"VERIFIED",completeness:"COMPLETE",quality:"ACCEPTABLE",warnings:[]});
const metric=(overrides:Partial<MetricSnapshot>={}):MetricSnapshot=>({id:"m-1",key:"orders.pending",value:7,unit:"COUNT",status:"VERIFIED",completeness:"COMPLETE",quality:"ACCEPTABLE",period:{from:"2026-10-01",to:"2026-10-30"},asOf:"2026-10-30T07:00:00Z",lineage:{evidenceIds:["ev-1"],calculatedAt:"2026-10-30T07:05:00Z",formulaId:"pending.count",formulaVersion:"1.0",transformations:[]},warnings:[],...overrides});
const rule=(overrides:Partial<DecisionRule>={}):DecisionRule=>({id:"pending",version:"1.0",metricKey:"orders.pending",operator:"GTE",threshold:5,priority:"P1",what:"مراجعة الطلبات المتراكمة",why:"تجاوز العدد الحد المحدد.",soWhat:"قد تتأخر المعالجة.",whatNext:"راجع الطلبات المفتوحة وسجلاتها.",owner:"operations_manager",expectedOutcome:"معالجة الطلبات المتأخرة المثبتة.",...overrides});
const input=(overrides:{evidenceRecords?:EvidenceRecord[];metrics?:MetricSnapshot[];rules?:DecisionRule[]}={})=>({generatedAt:"2026-10-30T07:10:00Z",asOf:"2026-10-30T07:00:00Z",evidenceRecords:overrides.evidenceRecords??[evidence()],metrics:overrides.metrics??[metric()],rules:overrides.rules??[rule()]});
const metricWithoutEvidenceLineage = metric({ lineage: { ...metric().lineage, evidenceIds: [] } });
describe("daily decision engine",()=>{
 it("emits a deterministic fully traceable rule-based card",()=>{const r=buildDailyDecisions(input());expect(r.modelMode).toBe("RULE_BASED");expect(r.candidates[0]).toMatchObject({owner:"operations_manager",expectedOutcome:"معالجة الطلبات المتأخرة المثبتة.",impact:null,impactStatus:"NOT_CONFIGURED",proof:{evidenceIds:["ev-1"]}})});
 it("withholds a missing metric or missing lineage", () => {
  const withoutMetric = buildDailyDecisions(input({ metrics: [] }));
  const withoutLineage = buildDailyDecisions(input({ metrics: [metricWithoutEvidenceLineage] }));
  expect(withoutMetric.withheld[0].reason).toBe("NO_SOURCE");
  expect(withoutLineage.withheld[0].reason).toBe("NO_SOURCE");
 });
 it.each(["UNVERIFIED","NEEDS_REVIEW","UNAVAILABLE"] as const)(
  "withholds decision for metric status %s",
  (status) => {
   const result = buildDailyDecisions(input({ metrics: [metric({ status })] }));
   expect(result.candidates).toEqual([]);
   expect(result.withheld[0].evidenceStatus).toBe(status);
  },
 );
 it("does not convert null to zero",()=>{const r=buildDailyDecisions(input({metrics:[metric({value:null})]}));expect(r.withheld[0].reason).toBe("UNKNOWN_VALUE")});
 it("withholds partial data and conflicting duplicate signals",()=>{expect(buildDailyDecisions(input({metrics:[metric({completeness:"PARTIAL"})]})).withheld[0].reason).toBe("NEEDS_REVIEW");const r=buildDailyDecisions(input({metrics:[metric(),metric({id:"m-2",value:9,lineage:{...metric().lineage,evidenceIds:["ev-2"]}})],evidenceRecords:[evidence(),evidence("ev-2")]}));expect(r.withheld[0].reason).toBe("CONFLICTING_SIGNALS")});
 it("sorts by priority then stable rule identifier",()=>{const r=buildDailyDecisions(input({rules:[rule({id:"z",priority:"P3"}),rule({id:"a",priority:"P0"}),rule({id:"b",priority:"P2"})]}));expect(r.candidates.map(c=>c.ruleId)).toEqual(["a","b","z"])});
 it("refuses to add different currencies",()=>{const usd=metric({id:"u",key:"cash.usd",value:100,unit:"CURRENCY",currency:"USD",lineage:{...metric().lineage,evidenceIds:["ev-2"]}}),yer=metric({id:"y",key:"cash.yer",value:5000,unit:"CURRENCY",currency:"YER",lineage:{...metric().lineage,evidenceIds:["ev-3"]}});const r=buildDailyDecisions(input({metrics:[metric(),usd,yer],evidenceRecords:[evidence(),{...evidence("ev-2"),currency:"USD"},{...evidence("ev-3"),currency:"YER"}],rules:[rule({impactFormula:{id:"total",version:"1",operation:"SUM",metricKeys:["cash.usd","cash.yer"],resultUnit:"CURRENCY"}})]}));expect(r.candidates[0].impact).toBeNull();expect(r.candidates[0].impactReason).toBe("CURRENCY_MISMATCH");expect(r.candidates[0].proof.evidenceIds).toEqual(["ev-1","ev-2","ev-3"])});
 it("calculates impact only with an explicit versioned formula",()=>{const r=buildDailyDecisions(input({rules:[rule({impactFormula:{id:"pending-count",version:"2",operation:"IDENTITY",metricKeys:["orders.pending"],resultUnit:"COUNT"}})]}));expect(r.candidates[0].impact).toMatchObject({value:7,formulaVersion:"2"});expect(r.candidates[0].impactStatus).toBe("CALCULATED")});
 it("omits a candidate when threshold is not met and rejects invalid clock input",()=>{expect(buildDailyDecisions(input({metrics:[metric({value:2})]})).candidates).toEqual([]);expect(()=>buildDailyDecisions({...input(),generatedAt:"bad-date"})).toThrow()});
 it("does not sum per-unit monetary impacts across currencies",()=>{
  const usd=metric({id:"u",key:"unit-cost.usd",value:5,unit:"CURRENCY_PER_UNIT",currency:"USD",lineage:{...metric().lineage,evidenceIds:["ev-usd"]}});
  const yer=metric({id:"y",key:"unit-cost.yer",value:1200,unit:"CURRENCY_PER_UNIT",currency:"YER",lineage:{...metric().lineage,evidenceIds:["ev-yer"]}});
  const r=buildDailyDecisions(input({metrics:[metric(),usd,yer],evidenceRecords:[evidence(),{...evidence("ev-usd"),currency:"USD"},{...evidence("ev-yer"),currency:"YER"}],rules:[rule({impactFormula:{id:"unit-cost-total",version:"1",operation:"SUM",metricKeys:["unit-cost.usd","unit-cost.yer"],resultUnit:"CURRENCY_PER_UNIT"}})]}));
  expect(r.candidates[0].impact).toBeNull();expect(r.candidates[0].impactStatus).toBe("WITHHELD");expect(r.candidates[0].impactReason).toBe("CURRENCY_MISMATCH");
 });
 it("withholds impact across different metric periods",()=>{
  const priorPeriod={from:"2026-09-01",to:"2026-09-30"};
  const prior=metric({id:"prior",key:"orders.prior",value:3,period:priorPeriod,lineage:{...metric().lineage,evidenceIds:["ev-prior"]}});
  const r=buildDailyDecisions(input({metrics:[metric(),prior],evidenceRecords:[evidence(),{...evidence("ev-prior"),period:priorPeriod}],rules:[rule({impactFormula:{id:"period-sum",version:"1",operation:"SUM",metricKeys:["orders.pending","orders.prior"],resultUnit:"COUNT"}})]}));
  expect(r.candidates[0].impact).toBeNull();expect(r.candidates[0].impactStatus).toBe("WITHHELD");expect(r.candidates[0].impactReason).toBe("IMPACT_SCOPE_MISMATCH");
 });
});
