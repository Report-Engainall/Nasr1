import { describe, expect, it } from "vitest";
import { parseStoreProductActivityReport, type StoreProductActivityReport } from "@/lib/product-activity-report";
import { buildProductActivityWorkbookXlsx } from "@/lib/product-activity-xlsx";

function sample(): StoreProductActivityReport {
  return {
    generated_at:"2026-10-29T12:00:00.000Z",recent_days:30,slow_days:90,total_products:3,returned_products:3,truncated:false,
    summary:{active_last_30_days:1,slow_moving_90_days:1,stagnant_over_90_days:0,never_sold:1,stock_unknown_count:2},
    products:[
      {product_id:"aaaaaaaa-aaaa-4aaa-8aaa-000000000001",item_code:"000125",product_name:"سكر أبيض",unit:"كرتون",catalog_status:"active",activity_status:"active_last_30_days",sold_quantity_last_30_days:2,sold_quantity_last_90_days:3,last_sold_at:"2026-10-28T10:00:00.000Z",days_since_last_sale:1,available_quantity:null},
      {product_id:"bbbbbbbb-bbbb-4bbb-8bbb-000000000002",item_code:"000200",product_name:"زيت نباتي",unit:"علبة",catalog_status:"active",activity_status:"slow_moving_90_days",sold_quantity_last_30_days:0,sold_quantity_last_90_days:4,last_sold_at:"2026-09-14T10:00:00.000Z",days_since_last_sale:45,available_quantity:1.25},
      {product_id:"cccccccc-cccc-4ccc-8ccc-000000000003",item_code:"=HYPERLINK(\"https://evil.invalid\",\"open\")",product_name:"+CMD|payload",unit:"قطعة",catalog_status:"active",activity_status:"never_sold",sold_quantity_last_30_days:0,sold_quantity_last_90_days:0,last_sold_at:null,days_since_last_sale:null,available_quantity:null},
    ],
  };
}
function unzipStore(bytes: Uint8Array): Map<string,string> {
  const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
  const decoder=new TextDecoder(); const files=new Map<string,string>(); let offset=0;
  while(offset+30<bytes.length && view.getUint32(offset,true)===0x04034b50) {
    if(view.getUint16(offset+8,true)!==0) throw new Error("Expected uncompressed ZIP entry.");
    const size=view.getUint32(offset+18,true), nameLength=view.getUint16(offset+26,true), extraLength=view.getUint16(offset+28,true);
    const nameStart=offset+30, dataStart=nameStart+nameLength+extraLength;
    files.set(decoder.decode(bytes.slice(nameStart,nameStart+nameLength)),decoder.decode(bytes.slice(dataStart,dataStart+size)));
    offset=dataStart+size;
  }
  return files;
}
describe("product activity report and XLSX output",()=>{
  it("validates movement classifications, leading-zero codes and unknown inventory",()=>{
    const parsed=parseStoreProductActivityReport(sample());
    expect(parsed.products.map(r=>r.activity_status)).toEqual(["active_last_30_days","slow_moving_90_days","never_sold"]);
    expect(parsed.products[0].item_code).toBe("000125");
    expect(parsed.products[0].available_quantity).toBeNull();
  });
  it("rejects inconsistent summary totals and malformed stock values",()=>{
    const wrongClassification = sample();
    wrongClassification.products[0] = {
      ...wrongClassification.products[0],
      activity_status: "stagnant_over_90_days",
    };
    expect(()=>parseStoreProductActivityReport(wrongClassification)).toThrow(/لا يتطابق مع الصفوف التفصيلية/);

    const wrongUnknownStock = sample();
    wrongUnknownStock.products[0] = {
      ...wrongUnknownStock.products[0],
      available_quantity: 0,
    };
    expect(()=>parseStoreProductActivityReport(wrongUnknownStock)).toThrow(/لا يتطابق مع الصفوف التفصيلية/);
    expect(()=>parseStoreProductActivityReport({...sample(),total_products:4,returned_products:2,truncated:true,summary:{...sample().summary,slow_moving_90_days:2}})).toThrow(/عدد صفوف التقرير/);
    expect(()=>parseStoreProductActivityReport({...sample(),summary:{...sample().summary,never_sold:0}})).toThrow(/ملخص تقرير حركة الأصناف/);
    expect(()=>parseStoreProductActivityReport({...sample(),products:sample().products.map((r,i)=>i===0?{...r,available_quantity:"0"}:r)})).toThrow(/رصيد المخزون/);
  });
  it("builds a two-sheet XLSX with exact headers, text IDs, filters and no formulas/cost fields",()=>{
    const bytes=buildProductActivityWorkbookXlsx(sample());
    expect(bytes[0]).toBe(0x50); expect(bytes[1]).toBe(0x4b);
    const files=unzipStore(bytes);
    const workbook=files.get("xl/workbook.xml")??"", details=files.get("xl/worksheets/sheet1.xml")??"", summary=files.get("xl/worksheets/sheet2.xml")??"";
    expect(workbook).toContain("حركة الأصناف"); expect(workbook).toContain("ملخص التقرير");
    expect(details).toContain("000125"); expect(details).toContain("كمية مباعة آخر 30 يومًا");
    expect(details).toContain("<autoFilter"); expect(details).toContain('state="frozen"');
    expect(details).not.toMatch(/<f(?:\s|>)/); expect(details).not.toContain("cost_price"); expect(details).not.toContain("profit_margin");
    expect(details).toContain("&quot;https://evil.invalid&quot;"); expect(summary).toContain("لم يُحوّل المجهول إلى صفر");
  });
  it("will not export a truncated slice as a complete Excel file",()=>{
    const input=sample(); input.total_products=5001; input.truncated=true;
    expect(()=>buildProductActivityWorkbookXlsx(input)).toThrow(/لن يتم إنشاء ملف Excel جزئي/);
  });
});
