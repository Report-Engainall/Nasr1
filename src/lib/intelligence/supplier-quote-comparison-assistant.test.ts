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
  status?: SupplierQuote["status"]; updatedAt?: string;
}): SupplierQuote {
  const quantity=input.quantity??10;
  return {
    id:input.id,supplier_id:input.supplierId,supplier_name:input.supplierName,
    supplier_code:input.supplierName.toUpperCase(),quote_number:input.number,
    supplier_reference:null,currency:input.currency??"YER",valid_until:null,
    delivery_days:null,payment_terms:null,notes:null,status:input.status??"received",
    purchase_order_id:null,created_at:"2026-11-01T09:00:00.000Z",
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
});
