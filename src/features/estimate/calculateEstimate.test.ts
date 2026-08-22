import { describe, expect, it } from 'vitest';

import { calculateEstimate } from './calculateEstimate';
import type { SavedCuttingJob } from '../library/models';

const job: SavedCuttingJob = {
  id: 'job-1', name: '영림 P1 작업', brand: '영림', productNumber: 'P1',
  createdAt: '2026-08-22T00:00:00.000Z', updatedAt: '2026-08-22T00:00:00.000Z',
  input: { rollWidthMm: 1220, pieceWidthMm: 250, pieceLengthMm: 500, quantity: 20, gapMm: 0, sideMarginMm: 5, startEndMarginMm: 5, allowRotation: true },
  remnantIds: [], remnantSummary: [],
  result: { newRollLengthMm: 2_000, producedQuantity: 20, overproduction: 0, utilizationPercent: 80, wastePercent: 20, optimizationStatus: 'exact' },
};

describe('calculateEstimate', () => {
  it('calculates default material, construction, and tier discount', () => {
    expect(calculateEstimate(job)).toEqual({
      materialLengthM: 2, materialCost: 20_000, productAreaM2: 2.5,
      constructionCost: 37_500, subtotal: 57_500, discountRate: 0.05, discount: 2_875, total: 54_625,
    });
  });

  it('accepts custom unit prices without changing the saved job', () => {
    expect(calculateEstimate(job, 12_000, 20_000)).toMatchObject({ materialCost: 24_000, constructionCost: 50_000, total: 70_300 });
  });

  it('uses group-specific saved prices when the default rates are requested', () => {
    expect(calculateEstimate({ ...job, materialCostPerM: 12_000, constructionCostPerM2: 20_000 })).toMatchObject({ materialCost: 24_000, constructionCost: 50_000 });
  });
});
