import { describe, expect, it } from 'vitest';
import type { InventoryStockCountLine, InventoryStockCountSession } from '@/lib/api';
import { buildStockCountWorkbookXlsx } from '@/lib/stock-count-xlsx';

const session: InventoryStockCountSession = {
  id: 'PRIVATE-SESSION-ID', organization_id: 'PRIVATE-ORGANIZATION-ID', warehouse_id: 'PRIVATE-WAREHOUSE-ID',
  status: 'open', idempotency_key: 'PRIVATE-IDEMPOTENCY-KEY', notes: 'جرد رف المواد الغذائية',
  started_by: 'PRIVATE-USER-ID', started_at: '2026-10-19T10:00:00.000Z', total_lines: 2, counted_lines: 1,
  completed_by: null, completed_at: null, cancelled_by: null, cancelled_at: null, cancellation_reason: null,
};
const lines: InventoryStockCountLine[] = [
  {
    id:'PRIVATE-STOCK-LINE-ID-1',organization_id:session.organization_id,session_id:session.id,product_id:'PRIVATE-PRODUCT-ID-1',
    product_code:'000125',product_name:'سكر أبيض',unit:'كرتون',expected_quantity:4,expected_reserved_quantity:1,
    expected_last_movement_at:'2026-10-18T08:00:00.000Z',counted_quantity:2,counted_at:'2026-10-19T10:10:00.000Z',
    completed_quantity:null,variance:-2,completed_at:null,
  },
  {
    id:'PRIVATE-STOCK-LINE-ID-2',organization_id:session.organization_id,session_id:session.id,product_id:'PRIVATE-PRODUCT-ID-2',
    product_code:'000200',product_name:'=HYPERLINK("https://evil.invalid","open")',unit:null,expected_quantity:10,
    expected_reserved_quantity:0,expected_last_movement_at:null,counted_quantity:null,counted_at:null,
    completed_quantity:null,variance:null,completed_at:null,
  },
];
function unzipStore(bytes: Uint8Array): Map<string,string> {
  const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
  const decoder=new TextDecoder(); const files=new Map<string,string>(); let offset=0;
  while(offset+30<bytes.length&&view.getUint32(offset,true)===0x04034b50){
    if(view.getUint16(offset+8,true)!==0)throw new Error('Expected stored ZIP entry.');
    const size=view.getUint32(offset+18,true),nameLength=view.getUint16(offset+26,true),extraLength=view.getUint16(offset+28,true);
    const nameStart=offset+30,dataStart=nameStart+nameLength+extraLength;
    files.set(decoder.decode(bytes.slice(nameStart,nameStart+nameLength)),decoder.decode(bytes.slice(dataStart,dataStart+size)));
    offset=dataStart+size;
  }
  return files;
}
describe('stock-count XLSX report',()=>{
  it('exports snapshot balances, saved actual count, signed variance and leading-zero codes',()=>{
    const files=unzipStore(buildStockCountWorkbookXlsx(session,lines,'المستودع الرئيسي','2026-10-19T10:20:00.000Z'));
    const workbook=files.get('xl/workbook.xml')??'',summary=files.get('xl/worksheets/sheet1.xml')??'',details=files.get('xl/worksheets/sheet2.xml')??'';
    expect(workbook).toContain('ملخص الجرد'); expect(workbook).toContain('تفاصيل الجرد');
    expect(summary).toContain('المستودع الرئيسي'); expect(summary).toContain('العدود المحفوظة');
    expect(details).toContain('000125'); expect(details).toContain('رصيد اللقطة'); expect(details).toContain('<v>-2</v>');
    expect(details).toContain('2026-10-19T10:10:00.000Z');
  });
  it('leaves unknown count and variance blank, escapes formula-like text, and excludes private IDs',()=>{
    const files=unzipStore(buildStockCountWorkbookXlsx(session,lines,'المستودع الرئيسي','2026-10-19T10:20:00.000Z'));
    const summary=files.get('xl/worksheets/sheet1.xml')??'',details=files.get('xl/worksheets/sheet2.xml')??'';
    expect(details).not.toContain('<c r="F3"'); expect(details).not.toContain('<c r="G3"');
    expect(details).toContain('&quot;https://evil.invalid&quot;'); expect(details).not.toContain('<f');
    for(const privateValue of ['PRIVATE-ORGANIZATION-ID','PRIVATE-WAREHOUSE-ID','PRIVATE-USER-ID','PRIVATE-STOCK-LINE-ID-1','PRIVATE-PRODUCT-ID-1']) {
      expect(summary+details).not.toContain(privateValue);
    }
  });
  it('rejects incomplete and duplicate snapshot rows instead of exporting a partial list',()=>{
    expect(()=>buildStockCountWorkbookXlsx(session,lines.slice(0,1),'المستودع الرئيسي')).toThrow(/لا يطابق اللقطة/);
    expect(()=>buildStockCountWorkbookXlsx({...session,total_lines:3},[...lines,{...lines[1]}],'المستودع الرئيسي')).toThrow(/تكرر صنف/);
    expect(()=>buildStockCountWorkbookXlsx({...session,status:'unknown' as never},lines,'المستودع الرئيسي')).toThrow(/حالة جلسة الجرد/);
    expect(()=>buildStockCountWorkbookXlsx({...session,counted_lines:0},lines,'المستودع الرئيسي')).toThrow(/عدد العدود المحفوظة لا يطابق تفاصيل اللقطة/);
    expect(()=>buildStockCountWorkbookXlsx(session,lines,'المستودع الرئيسي','not-a-date')).toThrow(/وقت إنشاء ملف الجرد/);
  });
});
