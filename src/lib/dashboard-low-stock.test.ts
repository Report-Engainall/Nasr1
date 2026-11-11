import { describe, expect, it } from 'vitest';

import { rankDashboardLowStockCandidates } from './dashboard-low-stock';

const ids = [
  '00000000-0000-4000-8000-000000000001',
  '00000000-0000-4000-8000-000000000002',
  '00000000-0000-4000-8000-000000000003',
  '00000000-0000-4000-8000-000000000004',
  '00000000-0000-4000-8000-000000000005',
  '00000000-0000-4000-8000-000000000006',
];

describe('rankDashboardLowStockCandidates', () => {
  it('filters by sellable available stock before ranking and caps the result at four', () => {
    const rows = [
      { product_id: ids[0], quantity_available: 8, reorder_point: 10 },
      { product_id: ids[1], quantity_available: 2, reorder_point: 10 },
      { product_id: ids[2], quantity_available: 0, reorder_point: 0 },
      { product_id: ids[3], quantity_available: 20, reorder_point: 10 },
      { product_id: ids[4], quantity_available: 1, reorder_point: 10 },
      { product_id: ids[5], quantity_available: 5, reorder_point: 10 },
    ];

    expect(rankDashboardLowStockCandidates(rows)).toEqual([
      { productId: ids[4], quantityAvailable: 1 },
      { productId: ids[1], quantityAvailable: 2 },
      { productId: ids[5], quantityAvailable: 5 },
      { productId: ids[0], quantityAvailable: 8 },
    ]);
  });

  it('uses a stable product-id tie-break when pressure is equal', () => {
    const rows = [
      { product_id: ids[1], quantity_available: 5, reorder_point: 10 },
      { product_id: ids[0], quantity_available: 5, reorder_point: 10 },
    ];

    expect(rankDashboardLowStockCandidates(rows)).toEqual([
      { productId: ids[0], quantityAvailable: 5 },
      { productId: ids[1], quantityAvailable: 5 },
    ]);
  });

  it('includes zero-threshold stock at or below zero', () => {
    expect(rankDashboardLowStockCandidates([
      { product_id: ids[0], quantity_available: 0, reorder_point: 0 },
      { product_id: ids[1], quantity_available: 1, reorder_point: 0 },
    ])).toEqual([{ productId: ids[0], quantityAvailable: 0 }]);
  });

  it('fails closed for malformed, unknown, or duplicate balance rows', () => {
    expect(rankDashboardLowStockCandidates(null)).toBeNull();
    expect(rankDashboardLowStockCandidates([{ product_id: ids[0], quantity_available: null, reorder_point: 1 }])).toBeNull();
    expect(rankDashboardLowStockCandidates([{ product_id: ids[0], quantity_available: 0, reorder_point: -1 }])).toBeNull();
    expect(rankDashboardLowStockCandidates([
      { product_id: ids[0], quantity_available: 0, reorder_point: 1 },
      { product_id: ids[0], quantity_available: 0, reorder_point: 1 },
    ])).toBeNull();
  });
});
