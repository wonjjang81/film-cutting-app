import { describe, expect, it } from 'vitest';
import { calculateProjectEstimate } from './calculateProjectEstimate';
import type { SavedCuttingJob } from '../library/models';

const job = (id: string, length: number): SavedCuttingJob => ({ id, name: id, brand: '영림', productNumber: '', createdAt: '2026-08-22T00:00:00.000Z', updatedAt: '2026-08-22T00:00:00.000Z', input: { rollWidthMm: 1220, pieceWidthMm: 500, pieceLengthMm: 500, quantity: 20, gapMm: 0, sideMarginMm: 5, startEndMarginMm: 5, allowRotation: true }, remnantIds: [], remnantSummary: [], result: { newRollLengthMm: length, producedQuantity: 20, overproduction: 0, utilizationPercent: 80, wastePercent: 20, optimizationStatus: 'exact' } });

describe('calculateProjectEstimate', () => {
  it('sums jobs and applies one project discount', () => {
    const result = calculateProjectEstimate([job('a', 1000), job('b', 2000)], 10000, 15000);
    expect(result.jobCount).toBe(2);
    expect(result.materialLengthM).toBe(3);
    expect(result.subtotal).toBe(180000);
    expect(result.discountRate).toBe(0.15);
    expect(result.total).toBe(153000);
  });
});
