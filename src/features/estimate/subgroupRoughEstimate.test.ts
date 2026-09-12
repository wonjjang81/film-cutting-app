import { describe, expect, it } from 'vitest';

import { buildSubgroupRoughEstimateLines, calculateSubgroupRoughEstimate, hasSubgroupOverallDimensions, normalizeSubgroupOverallDimensions } from './subgroupRoughEstimate';
import type { SavedCuttingJob } from '../library/models';

describe('subgroup rough estimate', () => {
  it('normalizes empty and invalid editable values safely', () => {
    expect(normalizeSubgroupOverallDimensions(undefined)).toEqual({ widthMm: 0, heightMm: 0, depthMm: 0, doorCount: 0 });
    expect(normalizeSubgroupOverallDimensions({ widthMm: -1, heightMm: Number.NaN, depthMm: 300, doorCount: 2.9 })).toEqual({ widthMm: 0, heightMm: 0, depthMm: 300, doorCount: 2 });
  });

  it('requires width and height before showing a rough estimate', () => {
    expect(hasSubgroupOverallDimensions({ widthMm: 1200, heightMm: 0, depthMm: 300, doorCount: 2 })).toBe(false);
    expect(hasSubgroupOverallDimensions({ widthMm: 1200, heightMm: 2400, depthMm: 300, doorCount: 2 })).toBe(true);
  });

  it('calculates exposed front, sides, top and bottom once per site', () => {
    expect(calculateSubgroupRoughEstimate(
      { widthMm: 1000, heightMm: 2000, depthMm: 500, doorCount: 4 },
      { siteCount: 2, rollWidthMm: 1000, materialCostPerM: 10_000, constructionCostPerM2: 20_000 },
    )).toEqual({ areaM2: 10, materialLengthM: 10, materialCost: 100_000, constructionCost: 200_000, total: 300_000 });
  });

  it('creates one estimate line for repeated jobs in the same subgroup', () => {
    const base = {
      id: 'job-1', name: '그룹 1 · A_01', groupId: 'group-1', brand: '영림', productNumber: '', subgroupName: 'A', siteCount: 2,
      subgroupOverallDimensions: { widthMm: 1000, heightMm: 2000, depthMm: 500, doorCount: 4 },
      createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
      input: { rollWidthMm: 1220, pieceWidthMm: 100, pieceLengthMm: 100, quantity: 1, gapMm: 0, sideMarginMm: 5, startEndMarginMm: 5, allowRotation: true },
      remnantIds: [], remnantSummary: [], result: { newRollLengthMm: 100, producedQuantity: 1, overproduction: 0, utilizationPercent: 50, wastePercent: 50, optimizationStatus: 'exact' as const },
    } satisfies SavedCuttingJob;
    const lines = buildSubgroupRoughEstimateLines([{ ...base }, { ...base, id: 'job-2', name: '그룹 1 · A_02' }], { materialCostPerM: 10_000, constructionCostPerM2: 20_000, globalRateOverride: true });
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({ groupId: 'group-1', subgroupName: 'A', areaM2: 10, total: 281_967 });
  });
});
