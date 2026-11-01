import {describe,expect,it} from "vitest";
import {buildSalesScenario} from "./scenario-lab";
import type {SalesForecastResult} from "../sales-forecast";
import type {EvidenceRecord,MetricSnapshot} from "./types";
const asOf="2026-10-30T07:00:00Z",period={from:"2026-10-01",to:"2026-10-21"};
const forecast={ready:true,expectedTotal:700} as SalesForecastResult;
const metric:MetricSnapshot={id:"baseline",key:"sales.forecast",value:700,unit:"CURRENCY",currency:"YER",status:"VERIFIED",completeness:"COMPLETE",quality:"ACCEPTABLE",period,asOf,
 lineage:{evidenceIds:["e1"],calculatedAt:asOf,formulaId:"sales.ma7",formulaVersion:"1.0",transformations:[]},warnings:[]};
const evidence:EvidenceRecord={id:"e1",source:{kind:"RPC",name:"sales.daily.complete",version:"1"},sourceTimestamp:asOf,asOf,period,currency:"YER",status:"VERIFIED",completeness:"COMPLETE",quality:"ACCEPTABLE",warnings:[]};
const build=(change:number)=>buildSalesScenario({id:"s1",createdAt:asOf,asOf,currency:"YER",forecast,baselineMetric:metric,evidenceRecords:[evidence],
 assumptions:[{id:"a1",label:"user scenario",changePercent:change,owner:"analyst"}],constraints:{minimumChangePercent:-50,maximumChangePercent:100}});
function buildCompoundedScenario() {
  return buildSalesScenario({
    id: "s", createdAt: asOf, asOf, currency: "YER", forecast,
    baselineMetric: metric, evidenceRecords: [evidence],
    assumptions: [
      { id: "a", label: "a", changePercent: 60, owner: "x" },
      { id: "b", label: "b", changePercent: 60, owner: "x" },
    ],
    constraints: { minimumChangePercent: -50, maximumChangePercent: 100 },
  });
}

describe("what-if scenario wrapper",()=>{
 it("uses the existing forecast and calculator while preserving the baseline",()=>expect(build(10)).toMatchObject({status:"SIMULATED",baseline:700,result:770,currency:"YER",accountingFact:false,assumptionBoundary:"USER_SUPPLIED"}));
 it("withholds assumptions outside the configured bounds",()=>expect(build(101)).toMatchObject({status:"WITHHELD",baseline:700,result:null}));
 it("withholds compounded assumptions beyond the total constraint", () => {
  const result = buildCompoundedScenario();
  expect(result.status).toBe("WITHHELD");
  expect(result.result).toBeNull();
 });
 it("withholds a forecast baseline without verified source lineage",()=>expect(buildSalesScenario({id:"s",createdAt:asOf,asOf,currency:"YER",forecast,baselineMetric:{...metric,status:"UNVERIFIED"},evidenceRecords:[evidence],
  assumptions:[{id:"a",label:"test",changePercent:5,owner:"analyst"}],constraints:{minimumChangePercent:-100,maximumChangePercent:500}}).result).toBeNull());

 it.each(["", "   ", "not-a-number"])("does not coerce unknown baseline text %j to zero",value=>{
  const result=buildSalesScenario({id:"invalid-baseline",createdAt:asOf,asOf,currency:"YER",forecast,
   baselineMetric:{...metric,value},evidenceRecords:[evidence],assumptions:[{id:"a",label:"test",changePercent:5,owner:"analyst"}],
   constraints:{minimumChangePercent:-100,maximumChangePercent:500}});
  expect(result).toMatchObject({status:"WITHHELD",baseline:null,result:null,changeAmount:null});
 });
});
