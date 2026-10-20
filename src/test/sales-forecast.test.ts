import { describe, expect, it } from 'vitest';
import { buildSalesForecast } from '@/lib/sales-forecast';

function makeSeries(count: number, sales = 100) {
  const start = Date.parse('2026-09-01T00:00:00.000Z');
  return Array.from({ length: count }, (_, index) => ({
    day: new Date(start + index * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
    orders: 1,
    sales,
  }));
}

describe('evidence-gated sales forecast', () => {
  it('builds a 7-day baseline and back-test from 21 consecutive daily points', () => {
    const result = buildSalesForecast(makeSeries(21));

    expect(result.ready).toBe(true);
    if (!result.ready) return;
    expect(result.availableDays).toBe(21);
    expect(result.dailyBaseline).toBe(100);
    expect(result.expectedTotal).toBe(700);
    expect(result.meanAbsoluteError).toBe(0);
    expect(result.lowerScenario).toBe(700);
    expect(result.upperScenario).toBe(700);
    expect(result.lastHistoricalDay).toBe('2026-09-21');
    expect(result.days).toHaveLength(7);
    expect(result.days[0]).toEqual({ day: '2026-09-22', expectedSales: 100 });
    expect(result.days[6]).toEqual({ day: '2026-09-28', expectedSales: 100 });
  });

  it('does not forecast from fewer than 21 history points', () => {
    expect(buildSalesForecast(makeSeries(20))).toEqual({
      ready: false,
      reason: 'insufficient_history',
      availableDays: 20,
    });
  });

  it('rejects missing days instead of interpreting them as zero sales', () => {
    const points = makeSeries(21);
    points.splice(9, 1);
    points.push({ day: '2026-09-22', orders: 1, sales: 100 });

    const result = buildSalesForecast(points);
    expect(result.ready).toBe(false);
    if (result.ready) return;
    expect(result.reason).toBe('missing_days');
  });

  it('sorts the history by day and returns the same result for descending source rows', () => {
    const chronological = buildSalesForecast(makeSeries(24));
    const descending = buildSalesForecast(makeSeries(24).reverse());

    expect(descending).toEqual(chronological);
  });

  it('rejects negative, non-finite and invalid-day source values', () => {
    const negative = makeSeries(21);
    negative[4] = { ...negative[4], sales: -1 };
    expect(buildSalesForecast(negative)).toMatchObject({ ready: false, reason: 'invalid_data' });

    const nonFinite = makeSeries(21);
    nonFinite[4] = { ...nonFinite[4], sales: Number.NaN };
    expect(buildSalesForecast(nonFinite)).toMatchObject({ ready: false, reason: 'invalid_data' });

    const invalidDate = makeSeries(21);
    invalidDate[4] = { ...invalidDate[4], day: '2026-02-30' };
    expect(buildSalesForecast(invalidDate)).toMatchObject({ ready: false, reason: 'invalid_data' });
  });

  it('rejects duplicate dates and monetary values that exceed safe cents', () => {
    const duplicate = makeSeries(21);
    duplicate[20] = { ...duplicate[20], day: duplicate[19].day };
    expect(buildSalesForecast(duplicate)).toMatchObject({ ready: false, reason: 'invalid_data' });

    const unsafeAmount = makeSeries(21);
    unsafeAmount[2] = { ...unsafeAmount[2], sales: Number.MAX_SAFE_INTEGER };
    expect(buildSalesForecast(unsafeAmount)).toMatchObject({ ready: false, reason: 'invalid_data' });
  });
});
