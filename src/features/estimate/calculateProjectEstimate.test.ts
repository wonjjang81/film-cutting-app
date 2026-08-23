import { describe, expect, it } from 'vitest';
import { calculateProjectEstimate } from './calculateProjectEstimate';
import type { SavedCuttingJob } from '../library/models';

const job = (id: string, length: number): SavedCuttingJob => ({ id, name: id, brand: '영림', productNumber: '', createdAt: '2026-08-22T00:00:00.000Z', updatedAt: '2026-08-22T00:00:00.000Z', input: { rollWidthMm: 1220, pieceWidthMm: 500, pieceLengthMm: 500, quantity: 20, gapMm: 0, sideMarginMm: 5, startEndMarginMm: 5, allowRotation: true }, remnantIds: [], remnantSummary: [], result: { newRollLengthMm: length, producedQuantity: 20, overproduction: 0, utilizationPercent: 80, wastePercent: 20, optimizationStatus: 'exact' } });

describe('calculateProjectEstimate', () => {
  it('sums jobs and applies one project discount', () => {
    const result = calculateProjectEstimate([job('a', 1000), job('b', 2000)], 10000, 15000);
    expect(result.jobCount).toBe(2);
    expect(result.materialLengthM).toBe(3);
    expect(result.materialAreaM2).toBeCloseTo(3.66, 5);
    expect(result.subtotal).toBe(84_900);
    expect(result.discountRate).toBe(0.05);
    expect(result.total).toBe(80_655);
    expect(result.totalRange).toEqual({ min: 58_055, max: 115_425 });
  });

  it('uses one physical merged-roll length instead of summing source jobs', () => {
    const sources = [job('source-a', 510), job('source-b', 310)];
    const [merged] = [{
      id: 'merged-1', name: '병합 1', mergeGroupId: 'auto', groupNames: ['그룹 1', '그룹 2'], sourceJobIds: ['source-a', 'source-b'],
      createdAt: '2026-08-22T00:00:00.000Z', updatedAt: '2026-08-22T00:00:00.000Z', rollWidthMm: 1220, usedLengthMm: 710,
      producedQuantity: 2, utilizationPercent: 54.3, wastePercent: 45.7, placements: [],
    }];
    const result = calculateProjectEstimate(sources, 10_000, 15_000, undefined, [merged]);
    expect(result.jobCount).toBe(1);
    expect(result.jobs).toHaveLength(0);
    expect(result.mergedJobs).toHaveLength(1);
    expect(result.materialLengthM).toBe(0.71);
    expect(result.materialCost).toBe(7_100);
    expect(result.productAreaM2).toBe(10);
  });

  it('uses each job rate independently unless global overwrite is enabled', () => {
    const first = { ...job('first', 1000), materialCostPerM: 10_000, constructionCostPerM2: 10_000 };
    const second = { ...job('second', 2000), materialCostPerM: 20_000, constructionCostPerM2: 20_000 };
    const grouped = calculateProjectEstimate([first, second], 10_000, 15_000, 0);
    expect(grouped.jobs.map((line) => line.rates.materialCostPerM)).toEqual([10_000, 20_000]);
    expect(grouped.materialCost).toBe(50_000);
    expect(grouped.constructionCost).toBe(61_000);
    const global = calculateProjectEstimate([first, second], 10_000, 15_000, 0, [], { rateMode: 'global' });
    expect(global.jobs.every((line) => line.rates.materialCostPerM === 10_000)).toBe(true);
    expect(global.materialCost).toBe(30_000);
    expect(global.constructionCost).toBe(54_900);
  });

  it('allocates a mixed merged roll to each source group rate', () => {
    const first = { ...job('source-a', 510), materialCostPerM: 10_000, constructionCostPerM2: 10_000 };
    const second = { ...job('source-b', 310), materialCostPerM: 20_000, constructionCostPerM2: 20_000 };
    const merged = {
      id: 'merged-mixed', name: '병합 혼합', mergeGroupId: 'auto', groupNames: ['그룹 1', '그룹 2'], sourceJobIds: ['source-a', 'source-b'], sourceIds: ['g1-p1', 'g2-p1'],
      createdAt: '2026-08-22T00:00:00.000Z', updatedAt: '2026-08-22T00:00:00.000Z', rollWidthMm: 1220, usedLengthMm: 710,
      producedQuantity: 2, utilizationPercent: 54.3, wastePercent: 45.7,
      placements: [
        { id: 1, sourceId: 'g1-p1', instanceIndex: 0, x: 5, y: 5, width: 500, height: 500, rotated: false },
        { id: 2, sourceId: 'g2-p1', instanceIndex: 0, x: 510, y: 5, width: 300, height: 500, rotated: false },
      ],
    };
    const result = calculateProjectEstimate([first, second], 10_000, 15_000, 0, [merged]);
    const detail = result.mergedJobs[0]!;
    expect(detail.rates.mixed).toBe(true);
    expect(detail.sourceDetails?.map((line) => line.rates.materialCostPerM)).toEqual([10_000, 20_000]);
    expect(detail.estimate.materialLengthM).toBeCloseTo(0.71, 8);
    expect(detail.sourceDetails?.reduce((sum, line) => sum + line.estimate.materialLengthM, 0)).toBeCloseTo(0.71, 8);
  });
});
