import { describe, expect, it } from 'vitest';
import {
  dashboardAverageOrderDisplay,
  dashboardSalesDisplay,
  summarizeDashboardOrders,
} from '@/lib/dashboard-metrics';

const currency = (value: number) => 'CUR ' + value.toFixed(2);

describe('dashboard KPI evidence integrity', () => {
  it('treats a genuinely empty, successfully loaded order list as zero sales but no average', () => {
    const metrics = summarizeDashboardOrders([]);
    expect(metrics).toEqual({
      orderCount: 0,
      processingCount: 0,
      totalSales: 0,
      invalidOrderAmountCount: 0,
      totalSalesIssue: null,
    });
    expect(dashboardSalesDisplay(metrics, currency)).toBe('CUR 0.00');
    expect(dashboardAverageOrderDisplay(metrics, currency)).toBe('غير متاح — لا توجد طلبات');
  });

  it('does not coerce null, undefined, empty, malformed or non-finite amounts to zero', () => {
    const metrics = summarizeDashboardOrders([
      { status: 'pending', total_amount: 100 },
      { status: 'delivered', total_amount: null },
      { status: 'delivered', total_amount: undefined },
      { status: 'processing', total_amount: '' },
      { status: 'cancelled', total_amount: 'not-money' },
      { status: 'delivered', total_amount: Number.POSITIVE_INFINITY },
    ]);
    expect(metrics.orderCount).toBe(6);
    expect(metrics.processingCount).toBe(2);
    expect(metrics.totalSales).toBeNull();
    expect(metrics.invalidOrderAmountCount).toBe(5);
    expect(metrics.totalSalesIssue).toBe('invalid_amount');
    expect(dashboardSalesDisplay(metrics, currency)).toBe('غير مكتمل — 5 مبلغ غير صالح');
    expect(dashboardAverageOrderDisplay(metrics, currency)).toBe('غير مكتمل — 5 مبلغ غير صالح');
  });

  it('keeps a complete numeric total including a valid zero amount', () => {
    const metrics = summarizeDashboardOrders([
      { status: 'delivered', total_amount: 0 },
      { status: 'pending', total_amount: '2.25' },
    ]);
    expect(metrics.totalSales).toBe(2.25);
    expect(metrics.invalidOrderAmountCount).toBe(0);
    expect(dashboardAverageOrderDisplay(metrics, currency)).toBe('CUR 1.13');
  });

  it('rejects a malformed response and reports aggregate overflow as unavailable', () => {
    expect(() => summarizeDashboardOrders(null)).toThrow(/استجابة الطلبات غير صالحة/);
    const metrics = summarizeDashboardOrders([
      { status: 'delivered', total_amount: Number.MAX_SAFE_INTEGER },
      { status: 'delivered', total_amount: 1 },
    ]);
    expect(metrics.totalSales).toBeNull();
    expect(metrics.totalSalesIssue).toBe('overflow');
    expect(dashboardSalesDisplay(metrics, currency)).toBe('غير متاح — تعذر جمع المبالغ بأمان');
  });
});
