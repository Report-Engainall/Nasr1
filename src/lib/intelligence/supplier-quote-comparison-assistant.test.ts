import { describe, expect, it } from "vitest";
import type { SupplierQuote } from "@/lib/supplier-quotes";
import { buildSupplierQuoteComparisonAssistant } from "./supplier-quote-comparison-assistant";

const productId="10000000-0000-4000-8000-000000000001";
const suppliers=[
  "20000000-0000-4000-8000-000000000001",
  "20000000-0000-4000-8000-000000000002",
  "20000000-0000-4000-8000-000000000003",
];

function quote(input: {
  id: string; supplierId: string; supplierName: string; number: string;
  unitCost: number; quantity?: number; unit?: string | null; currency?: string;
  status?: SupplierQuote["status"]; updatedAt?: string; createdAt?: string;
}): SupplierQuote {
  const quantity=input.quantity??10;
  return {
    id:input.id,supplier_id:input.supplierId,supplier_name:input.supplierName,
    supplier_code:input.supplierName.toUpperCase(),quote_number:input.number,
    supplier_reference:null,currency:input.currency??"YER",valid_until:null,
    delivery_days:null,payment_terms:null,notes:null,status:input.status??"received",
    purchase_order_id:null,created_at:input.createdAt??"2026-11-01T09:00:00.000Z",
    updated_at:input.updatedAt??"2026-11-01T10:00:00.000Z",
    items:[{
      id:"30000000-0000-4000-8000-000000000001",product_id:productId,
      item_code:"SKU-1",product_name:"صنف تجريبي",unit:input.unit===undefined?"كرتون":input.unit,
      quantity_quoted:quantity,unit_cost:input.unitCost,line_total:Number((quantity*input.unitCost).toFixed(2)),
    }],
  };
}

describe("buildSupplierQuoteComparisonAssistant",()=>{
  it("compares only the exact same product, quantity, UOM and currency across distinct suppliers",()=>{
    const result=buildSupplierQuoteComparisonAssistant([
      quote({id:"q1",supplierId:suppliers[0],supplierName:"مورد أ",number:"A-1",unitCost:12}),
      quote({id:"q2",supplierId:suppliers[1],supplierName:"مورد ب",number:"B-1",unitCost:10}),
    ],"2026-11-06T00:00:00.000Z");
    expect(result).toMatchObject({
      state:"READY",comparisonGroupCount:1,completePopulation:true,
      comparisons:[{quantity:10,unit:"كرتون",currency:"YER",lowestUnitCost:10,secondLowestUnitCost:12,differenceToNextUnitCost:2}],
    });
  });

  it("withholds mismatched quantities, currencies and missing units instead of normalizing them",()=>{
    const result=buildSupplierQuoteComparisonAssistant([
      quote({id:"q1",supplierId:suppliers[0],supplierName:"مورد أ",number:"A-1",unitCost:12,quantity:10}),
      quote({id:"q2",supplierId:suppliers[1],supplierName:"مورد ب",number:"B-1",unitCost:10,quantity:20}),
      quote({id:"q3",supplierId:suppliers[2],supplierName:"مورد ج",number:"C-1",unitCost:9,currency:"USD"}),
    ],"2026-11-06T00:00:00.000Z");
    expect(result.comparisonGroupCount).toBe(0);
    expect(result.withheldGroupCount).toBe(3);
    expect(result.withheld.every(item=>item.reason==="INSUFFICIENT_DISTINCT_SUPPLIERS")).toBe(true);
  });

  it("keeps the latest offer per supplier so one supplier cannot occupy multiple comparison ranks",()=>{
    const result=buildSupplierQuoteComparisonAssistant([
      quote({id:"q-old",supplierId:suppliers[0],supplierName:"مورد أ",number:"A-old",unitCost:7,updatedAt:"2026-11-01T08:00:00.000Z"}),
      quote({id:"q-new",supplierId:suppliers[0],supplierName:"مورد أ",number:"A-new",unitCost:11,updatedAt:"2026-11-02T08:00:00.000Z"}),
      quote({id:"q-b",supplierId:suppliers[1],supplierName:"مورد ب",number:"B-1",unitCost:12}),
    ],"2026-11-06T00:00:00.000Z");
    expect(result.comparisons[0].offers).toHaveLength(2);
    expect(result.comparisons[0].offers.map(item=>item.quoteNumber)).toEqual(["A-new","B-1"]);
  });

  it("excludes awarded and expired offers from current-price comparison",()=>{
    const result=buildSupplierQuoteComparisonAssistant([
      quote({id:"q1",supplierId:suppliers[0],supplierName:"مورد أ",number:"A-1",unitCost:12}),
      quote({id:"q2",supplierId:suppliers[1],supplierName:"مورد ب",number:"B-1",unitCost:10,status:"expired"}),
      quote({id:"q3",supplierId:suppliers[2],supplierName:"مورد ج",number:"C-1",unitCost:9,status:"awarded"}),
    ],"2026-11-06T00:00:00.000Z");
    expect(result.comparisonGroupCount).toBe(0);
    expect(result.quoteCounts).toEqual({received:1,awarded:1,expired:1});
  });

  it("marks the 200-row source ceiling as partial because no total or cursor is returned",()=>{
    const rows=Array.from({length:200},(_,index)=>quote({
      id:"q-"+index,supplierId:suppliers[index%3],supplierName:"مورد "+index,
      number:"Q-"+index,unitCost:index+1,
    }));
    const result=buildSupplierQuoteComparisonAssistant(rows,"2026-11-06T00:00:00.000Z");
    expect(result).toMatchObject({state:"PARTIAL",completePopulation:false,quoteCount:200});
    expect(result.warnings.some(item=>item.startsWith("SOURCE_LIMIT_REACHED"))).toBe(true);
  });
  it("reports recorded delivery lead time and payment terms as separate dimensions",()=>{
    const rows=[
      {...quote({id:"q1",supplierId:suppliers[0],supplierName:"مورد أ",number:"A-1",unitCost:12}),delivery_days:7,payment_terms:"دفع مقدم"},
      {...quote({id:"q2",supplierId:suppliers[1],supplierName:"مورد ب",number:"B-1",unitCost:10}),delivery_days:3,payment_terms:"آجل 30 يوماً",valid_until:"2026-12-01"},
      {...quote({id:"q3",supplierId:suppliers[2],supplierName:"مورد ج",number:"C-1",unitCost:11}),delivery_days:null,payment_terms:null},
    ];
    const result=buildSupplierQuoteComparisonAssistant(rows,"2026-11-06T00:00:00.000Z");
    expect(result.comparisons[0].deliveryProfile).toEqual({
      shortestDays:3,longestDays:7,withDays:2,withoutDays:1,fastestCount:1,
    });
    expect(result.comparisons[0].paymentTermsCoverage).toEqual({recorded:2,missing:1});
    expect(result.comparisons[0].offers.find(item=>item.supplierName==="مورد ب")).toMatchObject({
      deliveryDays:3,paymentTerms:"آجل 30 يوماً",validUntil:"2026-12-01",
    });
    expect(result.comparisons[0].offers.find(item=>item.supplierName==="مورد ج")).toMatchObject({
      deliveryDays:null,paymentTerms:null,validUntil:null,
    });
  });

  it("derives a supplier-specific quote price change from separately dated saved offers",()=>{
    const result=buildSupplierQuoteComparisonAssistant([
      quote({id:"history-old",supplierId:suppliers[0],supplierName:"مورد أ",number:"OLD",unitCost:10,createdAt:"2026-10-01T09:00:00.000Z"}),
      quote({id:"history-new",supplierId:suppliers[0],supplierName:"مورد أ",number:"NEW",unitCost:12,createdAt:"2026-11-01T09:00:00.000Z",status:"expired"}),
    ],"2026-11-06T00:00:00.000Z");
    expect(result.priceHistory).toHaveLength(1);
    expect(result.priceHistory[0]).toMatchObject({
      supplierName:"مورد أ",quoteCount:2,changeAmount:2,changePercent:20,direction:"INCREASED",
      first:{unitCost:10,quoteNumber:"OLD"},
      latest:{unitCost:12,quoteNumber:"NEW",status:"expired"},
    });
  });

  it("withholds a percentage change when the first saved quote price is zero",()=>{
    const result=buildSupplierQuoteComparisonAssistant([
      quote({id:"zero-old",supplierId:suppliers[0],supplierName:"مورد أ",number:"ZERO",unitCost:0,createdAt:"2026-10-01T09:00:00.000Z"}),
      quote({id:"zero-new",supplierId:suppliers[0],supplierName:"مورد أ",number:"POSITIVE",unitCost:5,createdAt:"2026-11-01T09:00:00.000Z"}),
    ],"2026-11-06T00:00:00.000Z");
    expect(result.priceHistory[0]).toMatchObject({
      changeAmount:5,changePercent:null,direction:"INCREASED",
    });
  });

  it("does not derive price chronology from identical or future source timestamps",()=>{
    const sameTime=buildSupplierQuoteComparisonAssistant([
      quote({id:"same-a",supplierId:suppliers[0],supplierName:"مورد أ",number:"A",unitCost:10,createdAt:"2026-11-01T09:00:00.000Z"}),
      quote({id:"same-b",supplierId:suppliers[0],supplierName:"مورد أ",number:"B",unitCost:12,createdAt:"2026-11-01T09:00:00.000Z"}),
    ],"2026-11-06T00:00:00.000Z");
    expect(sameTime.priceHistory).toHaveLength(0);
    const future=buildSupplierQuoteComparisonAssistant([
      quote({id:"past",supplierId:suppliers[0],supplierName:"مورد أ",number:"A",unitCost:10,createdAt:"2026-11-01T09:00:00.000Z"}),
      quote({id:"future",supplierId:suppliers[0],supplierName:"مورد أ",number:"B",unitCost:12,createdAt:"2026-12-01T09:00:00.000Z"}),
    ],"2026-11-06T00:00:00.000Z");
    expect(future.priceHistory).toHaveLength(0);
  });


});
