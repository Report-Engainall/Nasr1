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
 it("withholds quantity sums when source units of measure differ",()=>{
  const each=metric({id:"qty-each",key:"stock.each",value:3,unit:"QUANTITY",unitOfMeasure:"EA",lineage:{...metric().lineage,evidenceIds:["ev-each"]}});
  const cases=metric({id:"qty-case",key:"stock.case",value:2,unit:"QUANTITY",unitOfMeasure:"CASE",lineage:{...metric().lineage,evidenceIds:["ev-case"]}});
  const result=buildDailyDecisions(input({
   metrics:[metric(),each,cases],
   evidenceRecords:[evidence(),evidence("ev-each"),evidence("ev-case")],
   rules:[rule({impactFormula:{id:"bad-quantity-sum",version:"1",operation:"SUM",metricKeys:["stock.each","stock.case"],resultUnit:"QUANTITY"}})],
  }));
  expect(result.candidates[0].impact).toBeNull();
  expect(result.candidates[0].impactReason).toBe("UNIT_MISMATCH");
 });
 it("withholds quantity impact when the source omits its unit of measure",()=>{
  const quantity=metric({id:"quantity-no-uom",key:"stock.no-uom",value:4,unit:"QUANTITY",unitOfMeasure:undefined,lineage:{...metric().lineage,evidenceIds:["ev-no-uom"]}});
  const result=buildDailyDecisions(input({
   metrics:[metric(),quantity],evidenceRecords:[evidence(),evidence("ev-no-uom")],
   rules:[rule({impactFormula:{id:"quantity-without-uom",version:"1",operation:"IDENTITY",metricKeys:["stock.no-uom"],resultUnit:"QUANTITY:EA"}})],
  }));
  expect(result.candidates[0].impact).toBeNull();
  expect(result.candidates[0].impactReason).toBe("UNIT_MISMATCH");
 });
 it("calculates quantity sums only with one explicit shared unit of measure",()=>{
  const first=metric({id:"qty-one",key:"stock.one",value:"0.1",unit:"QUANTITY",unitOfMeasure:"EA",lineage:{...metric().lineage,evidenceIds:["ev-one"]}});
  const second=metric({id:"qty-two",key:"stock.two",value:"0.2",unit:"QUANTITY",unitOfMeasure:"EA",lineage:{...metric().lineage,evidenceIds:["ev-two"]}});
  const result=buildDailyDecisions(input({
   metrics:[metric(),first,second],
   evidenceRecords:[evidence(),evidence("ev-one"),evidence("ev-two")],
   rules:[rule({impactFormula:{id:"quantity-sum",version:"1",operation:"SUM",metricKeys:["stock.one","stock.two"],resultUnit:"QUANTITY:EA"}})],
  }));
  expect(result.candidates[0].impact).toMatchObject({value:0.3,unit:"QUANTITY:EA"});
  expect(result.candidates[0].impactStatus).toBe("CALCULATED");
 });
 it("calculates money per unit times a matching verified quantity with exact precision",()=>{
  const price=metric({id:"unit-price",key:"price.per-unit",value:"125.50",unit:"CURRENCY_PER_UNIT",currency:"YER",unitOfMeasure:"EA",lineage:{...metric().lineage,evidenceIds:["ev-price"]}});
  const quantity=metric({id:"ordered-quantity",key:"order.quantity",value:"4.125",unit:"QUANTITY",unitOfMeasure:"EA",lineage:{...metric().lineage,evidenceIds:["ev-quantity"]}});
  const result=buildDailyDecisions(input({
   metrics:[metric(),price,quantity],
   evidenceRecords:[evidence(),{...evidence("ev-price"),currency:"YER"},{...evidence("ev-quantity")}],
   rules:[rule({impactFormula:{id:"verified-extended-value",version:"1",operation:"PRODUCT",metricKeys:["price.per-unit","order.quantity"],resultUnit:"CURRENCY"}})],
  }));
  expect(result.candidates[0].impact).toMatchObject({value:517.6875,unit:"CURRENCY",currency:"YER"});
  expect(result.candidates[0].impactStatus).toBe("CALCULATED");
 });
 it("withholds per-unit currency multiplication when units do not match or arithmetic precision is unsupported",()=>{
  const price=metric({id:"unit-price",key:"price.per-unit",value:"125.50",unit:"CURRENCY_PER_UNIT",currency:"YER",unitOfMeasure:"EA",lineage:{...metric().lineage,evidenceIds:["ev-price"]}});
  const wrongQuantity=metric({id:"ordered-quantity",key:"order.quantity",value:"4.125",unit:"QUANTITY",unitOfMeasure:"CASE",lineage:{...metric().lineage,evidenceIds:["ev-quantity"]}});
  const wrongUnit=buildDailyDecisions(input({
   metrics:[metric(),price,wrongQuantity],
   evidenceRecords:[evidence(),{...evidence("ev-price"),currency:"YER"},evidence("ev-quantity")],
   rules:[rule({impactFormula:{id:"wrong-unit-product",version:"1",operation:"PRODUCT",metricKeys:["price.per-unit","order.quantity"],resultUnit:"CURRENCY"}})],
  }));
  expect(wrongUnit.candidates[0].impact).toBeNull();
  expect(wrongUnit.candidates[0].impactReason).toBe("UNIT_MISMATCH");
  const unsupportedPrice=metric({id:"unsupported-price",key:"price.unsupported",value:"125.1234",unit:"CURRENCY_PER_UNIT",currency:"YER",unitOfMeasure:"EA",lineage:{...metric().lineage,evidenceIds:["ev-unsupported-price"]}});
  const precisionResult=buildDailyDecisions(input({
   metrics:[metric(),unsupportedPrice,metric({id:"quantity",key:"quantity",value:"2.000",unit:"QUANTITY",unitOfMeasure:"EA",lineage:{...metric().lineage,evidenceIds:["ev-quantity"]}})],
   evidenceRecords:[evidence(),{...evidence("ev-unsupported-price"),currency:"YER"},evidence("ev-quantity")],
   rules:[rule({impactFormula:{id:"unsupported-precision",version:"1",operation:"PRODUCT",metricKeys:["price.unsupported","quantity"],resultUnit:"CURRENCY"}})],
  }));
  expect(precisionResult.candidates[0].impact).toBeNull();
  expect(precisionResult.candidates[0].impactReason).toBe("IMPACT_PRECISION_UNSUPPORTED");
 });
 it("withholds monetary impact sums when per-unit denominators differ",()=>{
  const each=metric({id:"price-each",key:"price.each",value:"2.5",unit:"CURRENCY_PER_UNIT",currency:"YER",unitOfMeasure:"EA",lineage:{...metric().lineage,evidenceIds:["ev-each"]}});
  const casePrice=metric({id:"price-case",key:"price.case",value:"10",unit:"CURRENCY_PER_UNIT",currency:"YER",unitOfMeasure:"CASE",lineage:{...metric().lineage,evidenceIds:["ev-case"]}});
  const result=buildDailyDecisions(input({
   metrics:[metric(),each,casePrice],
   evidenceRecords:[evidence(),{...evidence("ev-each"),currency:"YER"},{...evidence("ev-case"),currency:"YER"}],
   rules:[rule({impactFormula:{id:"bad-denominator-sum",version:"1",operation:"SUM",metricKeys:["price.each","price.case"],resultUnit:"CURRENCY_PER_UNIT:EA"}})],
  }));
  expect(result.candidates[0].impact).toBeNull();
  expect(result.candidates[0].impactReason).toBe("UNIT_MISMATCH");
 });
 it("omits a candidate when threshold is not met and rejects invalid clock input",()=>{expect(buildDailyDecisions(input({metrics:[metric({value:2})]})).candidates).toEqual([]);expect(()=>buildDailyDecisions({...input(),generatedAt:"bad-date"})).toThrow()});
 it("does not sum per-unit monetary impacts across currencies",()=>{
  const usd=metric({id:"u",key:"unit-cost.usd",value:5,unit:"CURRENCY_PER_UNIT",currency:"USD",lineage:{...metric().lineage,evidenceIds:["ev-usd"]}});
  const yer=metric({id:"y",key:"unit-cost.yer",value:1200,unit:"CURRENCY_PER_UNIT",currency:"YER",lineage:{...metric().lineage,evidenceIds:["ev-yer"]}});
  const r=buildDailyDecisions(input({metrics:[metric(),usd,yer],evidenceRecords:[evidence(),{...evidence("ev-usd"),currency:"USD"},{...evidence("ev-yer"),currency:"YER"}],rules:[rule({impactFormula:{id:"unit-cost-total",version:"1",operation:"SUM",metricKeys:["unit-cost.usd","unit-cost.yer"],resultUnit:"CURRENCY_PER_UNIT"}})]}));
  expect(r.candidates[0].impact).toBeNull();expect(r.candidates[0].impactStatus).toBe("WITHHELD");expect(r.candidates[0].impactReason).toBe("CURRENCY_MISMATCH");
 });
 it("rejects unsupported comparison operators and invalid expiry windows",()=>{
  const invalidOperator=rule({operator:"BETWEEN" as DecisionRule["operator"]});
  const invalidExpiry=rule({id:"invalid-expiry",expiresInDays:0});
  const result=buildDailyDecisions(input({rules:[invalidOperator,invalidExpiry]}));
  expect(result.candidates).toEqual([]);
  expect(result.withheld.map(item=>item.reason)).toEqual(["INVALID_RULE","INVALID_RULE"]);
 });
 it("accepts a valid expiry window and computes an explicit expiration",()=>{
  const result=buildDailyDecisions(input({rules:[rule({expiresInDays:1})]}));
  expect(result.candidates[0].expiresAt).toBe("2026-10-31T07:10:00.000Z");
 });
 it("withholds impact formulas that repeat the same metric instead of double-counting it",()=>{
  const result=buildDailyDecisions(input({rules:[rule({impactFormula:{
   id:"duplicate-source-sum",version:"1",operation:"SUM",metricKeys:["orders.pending","orders.pending"],resultUnit:"COUNT",
  }})]}));
  expect(result.candidates).toHaveLength(1);
  expect(result.candidates[0].impact).toBeNull();
  expect(result.candidates[0].impactStatus).toBe("WITHHELD");
  expect(result.candidates[0].impactReason).toBe("INVALID_IMPACT_FORMULA");
 });
 it("withholds malformed rule and impact formula payloads without throwing",()=>{
  const invalidMetadata={...rule(),id:null,owner:null} as unknown as DecisionRule;
  const invalidFormula=rule({id:"invalid-formula",impactFormula:{id:"bad",version:"1",operation:"SUM",metricKeys:"orders.pending",resultUnit:"COUNT"} as unknown as DecisionRule["impactFormula"]});
  const result=buildDailyDecisions(input({rules:[invalidMetadata,invalidFormula]}));
  expect(result.withheld[0]).toMatchObject({ruleId:"invalid-rule",metricKey:"orders.pending",reason:"INVALID_RULE"});
  expect(result.candidates).toHaveLength(1);
  expect(result.candidates[0].impact).toBeNull();
  expect(result.candidates[0].impactReason).toBe("INVALID_IMPACT_FORMULA");
 });
 it("uses bounded exact decimal precision for currency identity impacts",()=>{
  const exact=metric({id:"cash-exact",key:"cash.exact",value:"125.123456",unit:"CURRENCY",currency:"YER",lineage:{...metric().lineage,evidenceIds:["ev-cash-exact"]}});
  const exactResult=buildDailyDecisions(input({
   metrics:[metric(),exact],
   evidenceRecords:[evidence(),{...evidence("ev-cash-exact"),currency:"YER"}],
   rules:[rule({impactFormula:{id:"cash-identity",version:"1",operation:"IDENTITY",metricKeys:["cash.exact"],resultUnit:"CURRENCY"}})],
  }));
  expect(exactResult.candidates[0].impact).toMatchObject({value:125.123456,unit:"CURRENCY",currency:"YER"});
  const overPrecision=metric({id:"cash-overprecision",key:"cash.overprecision",value:"125.1234567",unit:"CURRENCY",currency:"YER",lineage:{...metric().lineage,evidenceIds:["ev-cash-overprecision"]}});
  const withheldResult=buildDailyDecisions(input({
   metrics:[metric(),overPrecision],
   evidenceRecords:[evidence(),{...evidence("ev-cash-overprecision"),currency:"YER"}],
   rules:[rule({impactFormula:{id:"cash-identity-overprecision",version:"1",operation:"IDENTITY",metricKeys:["cash.overprecision"],resultUnit:"CURRENCY"}})],
  }));
  expect(withheldResult.candidates[0].impact).toBeNull();
  expect(withheldResult.candidates[0].impactReason).toBe("IMPACT_PRECISION_UNSUPPORTED");
 });
 it("withholds impact across different metric periods",()=>{
  const priorPeriod={from:"2026-09-01",to:"2026-09-30"};
  const prior=metric({id:"prior",key:"orders.prior",value:3,period:priorPeriod,lineage:{...metric().lineage,evidenceIds:["ev-prior"]}});
  const r=buildDailyDecisions(input({metrics:[metric(),prior],evidenceRecords:[evidence(),{...evidence("ev-prior"),period:priorPeriod}],rules:[rule({impactFormula:{id:"period-sum",version:"1",operation:"SUM",metricKeys:["orders.pending","orders.prior"],resultUnit:"COUNT"}})]}));
  expect(r.candidates[0].impact).toBeNull();expect(r.candidates[0].impactStatus).toBe("WITHHELD");expect(r.candidates[0].impactReason).toBe("IMPACT_SCOPE_MISMATCH");
 it("compares quantity decision thresholds with exact six-place decimal arithmetic",()=>{
  const quantity=metric({id:"quantity-exact",key:"stock.available",value:"0.300001",unit:"QUANTITY",unitOfMeasure:"EA"});
  const result=buildDailyDecisions(input({
   metrics:[quantity],
   rules:[rule({metricKey:"stock.available",operator:"GTE",threshold:0.300001})],
  }));
  expect(result.candidates).toHaveLength(1);
  expect(result.candidates[0].why).toContain("0.300001");
  expect(result.withheld).toEqual([]);
 });
 it("withholds quantity decisions when the source value has unsupported fractional precision",()=>{
  const quantity=metric({id:"quantity-overprecision",key:"stock.available",value:"0.3000001",unit:"QUANTITY",unitOfMeasure:"EA"});
  const result=buildDailyDecisions(input({
   metrics:[quantity],
   rules:[rule({metricKey:"stock.available",threshold:0.3})],
  }));
  expect(result.candidates).toEqual([]);
  expect(result.withheld[0].reason).toBe("UNKNOWN_VALUE");
 });
 it("rejects decision thresholds beyond the supported decimal precision",()=>{
  const quantity=metric({id:"quantity-exact",key:"stock.available",value:"0.300001",unit:"QUANTITY",unitOfMeasure:"EA"});
  const result=buildDailyDecisions(input({
   metrics:[quantity],
   rules:[rule({metricKey:"stock.available",threshold:0.3000001})],
  }));
  expect(result.candidates).toEqual([]);
  expect(result.withheld[0].reason).toBe("INVALID_THRESHOLD");
 });
 it("requires whole-number values and thresholds for count-based decisions",()=>{
  const fractionalCount=metric({id:"fractional-count",key:"orders.pending",value:"2.5",unit:"COUNT"});
  const valueResult=buildDailyDecisions(input({metrics:[fractionalCount]}));
  expect(valueResult.candidates).toEqual([]);
  expect(valueResult.withheld[0].reason).toBe("UNKNOWN_VALUE");
  const thresholdResult=buildDailyDecisions(input({metrics:[metric({value:3})],rules:[rule({threshold:2.5})]}));
  expect(thresholdResult.candidates).toEqual([]);
  expect(thresholdResult.withheld[0].reason).toBe("INVALID_THRESHOLD");
 });
 it("withholds numeric decisions for text metrics instead of interpreting their payload as a number",()=>{
  const textMetric=metric({id:"text-state",key:"orders.state",value:"7",unit:"TEXT"});
  const result=buildDailyDecisions(input({metrics:[textMetric],rules:[rule({metricKey:"orders.state"})]}));
  expect(result.candidates).toEqual([]);
  expect(result.withheld[0].reason).toBe("UNIT_MISMATCH");
 });

 it("withholds an impact formula when distinct metric keys alias the same source metric identifier",()=>{
  const sharedOne=metric({id:"shared-source",key:"source.one",value:3,lineage:{...metric().lineage,evidenceIds:["ev-1"]}});
  const sharedTwo=metric({id:"shared-source",key:"source.two",value:3,lineage:{...metric().lineage,evidenceIds:["ev-1"]}});
  const result=buildDailyDecisions(input({
   metrics:[metric(),sharedOne,sharedTwo],
   rules:[rule({impactFormula:{
    id:"aliased-source-sum",version:"1",operation:"SUM",metricKeys:["source.one","source.two"],resultUnit:"COUNT",
   }})],
  }));
  expect(result.candidates).toHaveLength(1);
  expect(result.candidates[0].impact).toBeNull();
  expect(result.candidates[0].impactStatus).toBe("WITHHELD");
  expect(result.candidates[0].impactReason).toBe("IMPACT_SOURCE_DUPLICATED");
 });

 });
});
