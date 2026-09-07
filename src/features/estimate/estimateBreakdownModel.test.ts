import { describe, expect, it } from 'vitest';

import type { SavedCuttingJob } from '../library/models';
import { calculateProjectEstimate } from './calculateProjectEstimate';
import { buildEstimateGroupBreakdown } from './estimateBreakdownModel';

const job = (id: string, groupId: string, subgroupName: string, length: number): SavedCuttingJob => ({
  id,
  name: `${groupId} · ${subgroupName}_${id}`,
  groupId,
  subgroupName,
  brand: '영림',
  productNumber: '',
  createdAt: '2026-09-07T00:00:00.000Z',
  updatedAt: '2026-09-07T00:00:00.000Z',
  input: { rollWidthMm: 1220, pieceWidthMm: 500, pieceLengthMm: 500, quantity: 2, gapMm: 0, sideMarginMm: 5, startEndMarginMm: 5, allowRotation: true },
  remnantIds: [],
  remnantSummary: [],
  result: { newRollLengthMm: length, producedQuantity: 2, overproduction: 0, utilizationPercent: 80, wastePercent: 20, optimizationStatus: 'exact' },
});

describe('estimate group breakdown', () => {
  it('aggregates piece estimates into major-group and subgroup totals', () => {
    const estimate = calculateProjectEstimate([
      job('01', 'group-1', 'A', 1000),
      job('02', 'group-1', 'A', 500),
      job('03', 'group-1', 'B', 750),
      job('04', 'group-2', 'A', 1250),
    ], 10_000, 15_000, 0);

    const groups = buildEstimateGroupBreakdown(estimate);

    expect(groups.map((group) => [group.label, group.subgroups.map((subgroup) => subgroup.name)])).toEqual([
      ['대그룹 ID 1', ['A', 'B']],
      ['대그룹 ID 2', ['A']],
    ]);
    expect(groups[0]?.pieceCount).toBe(3);
    expect(groups[0]?.subgroups[0]?.pieceCount).toBe(2);
    expect(groups.reduce((sum, group) => sum + group.amounts.subtotal, 0)).toBe(estimate.subtotal);
  });

  it('allocates merged-roll source amounts to their subgroup without exposing piece rows', () => {
    const sources = [job('01', 'group-1', 'A', 500), job('02', 'group-1', 'B', 500)];
    const merged = {
      id: 'merged-1', name: '병합 1', mergeGroupId: 'auto', groupNames: ['그룹 1'], sourceJobIds: ['01', '02'], sourceIds: ['group-1-01', 'group-1-02'],
      createdAt: '2026-09-07T00:00:00.000Z', updatedAt: '2026-09-07T00:00:00.000Z', rollWidthMm: 1220, usedLengthMm: 700,
      producedQuantity: 4, utilizationPercent: 58, wastePercent: 42,
      placements: [
        { id: 1, sourceId: 'group-1-01', instanceIndex: 0, x: 5, y: 5, width: 500, height: 500, rotated: false },
        { id: 2, sourceId: 'group-1-02', instanceIndex: 0, x: 510, y: 5, width: 500, height: 500, rotated: false },
      ],
    };
    const estimate = calculateProjectEstimate(sources, 10_000, 15_000, 0, [merged]);

    const groups = buildEstimateGroupBreakdown(estimate);

    expect(groups).toHaveLength(1);
    expect(groups[0]?.subgroups.map((subgroup) => subgroup.name)).toEqual(['A', 'B']);
    expect(groups[0]?.subgroups.reduce((sum, subgroup) => sum + subgroup.amounts.subtotal, 0)).toBe(estimate.subtotal);
  });
});
