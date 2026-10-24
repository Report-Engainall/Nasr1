import { describe, expect, it } from 'vitest';
import { isValidPriceAmount, parsePriceGridInput } from '@/lib/price-grid-money';

describe('price grid decimal validation', () => {
  it('accepts valid two-decimal values affected by IEEE-754 multiplication artifacts', () => {
    expect(parsePriceGridInput('0.29')).toBe(0.29);
    expect(parsePriceGridInput('0.58')).toBe(0.58);
    expect(parsePriceGridInput('0.57')).toBe(0.57);
    expect(isValidPriceAmount(0.29)).toBe(true);
    expect(isValidPriceAmount(0.58)).toBe(true);
    expect(isValidPriceAmount(999999999999)).toBe(true);
  });

  it('rejects more than two decimal places, negative values, invalid syntax and out-of-range amounts', () => {
    expect(parsePriceGridInput('0.295')).toBeNull();
    expect(parsePriceGridInput('0.290')).toBeNull();
    expect(parsePriceGridInput('-0.29')).toBeNull();
    expect(parsePriceGridInput('1e2')).toBeNull();
    expect(parsePriceGridInput('1000000000000')).toBeNull();
    expect(parsePriceGridInput('')).toBeNull();
    expect(isValidPriceAmount(0.295)).toBe(false);
    expect(isValidPriceAmount(-0.29)).toBe(false);
    expect(isValidPriceAmount(1000000000000)).toBe(false);
  });
});
