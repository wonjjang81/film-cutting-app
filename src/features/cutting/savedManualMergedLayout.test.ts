import { describe, expect, it } from 'vitest';
import type { GroupedPieceRequest, MergedGroupPlan } from '../remnants/planGroupedPieces';
import type { CurrentEstimateSnapshot } from '../estimate/currentGroupEstimate';
import { movePlacementWithinRoll } from './moveMergedPlacement';
import { applyPlacementIdRecords, captureManualMergedLayout, parseCurrentManualLayouts, placementIdRecordsFromMergedJob, placementIdRecordsFromPlan, restoreManualMergedLayout, serializeCurrentManualLayouts } from './savedManualMergedLayout';

function request(groupId: string, pieceId: string, width: number, length: number): GroupedPieceRequest {
  return { groupId, groupName: '그룹 1', pieceId, pieceName: pieceId,
    request: { brand: '영림', productNumber: 'P1', rollWidthMm: 1220, pieceWidthMm: width, pieceLengthMm: length,
      quantity: 1, gapMm: 0, sideMarginMm: 5, startEndMarginMm: 5, allowRotation: false, remnants: [] } };
}

function plan(groupId: string): MergedGroupPlan {
  const roll = { placements: [
    { id: 1, sourceId: `${groupId}-large`, instanceIndex: 0, x: 5, y: 5, width: 1000, height: 10000, rotated: false },
    { id: 2, sourceId: `${groupId}-small`, instanceIndex: 0, x: 1005, y: 5, width: 200, height: 4000, rotated: false },
  ], usedLengthMm: 10010, producedQuantity: 2, utilizationPercent: 88.5, wastePercent: 11.5 };
  return { mergeGroupId: '1', sourceIds: [`${groupId}-large`, `${groupId}-small`], groupNames: ['그룹 1'], pieceCount: 2,
    result: roll, rollResults: [roll], newRollQuantity: 2, producedQuantity: 2, remnantUses: [],
    inventoryDelta: { removeIds: [], add: [], basedOnUpdatedAt: {} }, inventoryAfter: [] };
}

describe('saved manual merged layout', () => {
  it('restores a moved piece after reload without changing its saved placement ID', () => {
    const oldRequests = [request('old', 'large', 1000, 10000), request('old', 'small', 200, 4000)];
    const moved = movePlacementWithinRoll(plan('old'), 2, 1005, 5000, oldRequests).plan!;
    const saved = captureManualMergedLayout(moved, 0, oldRequests);
    const newRequests = [request('new', 'large', 1000, 10000), request('new', 'small', 200, 4000)];
    const newBase = plan('new');
    const renumbered = newBase.rollResults![0]!.placements.map((placement) => ({ ...placement, id: placement.id + 10 }));
    const restored = restoreManualMergedLayout({ ...newBase,
      result: { ...newBase.result, placements: renumbered },
      rollResults: [{ ...newBase.rollResults![0]!, placements: renumbered }],
    }, 0, newRequests, saved);
    expect(restored?.rollResults?.[0]?.placements[1]).toMatchObject({ id: 2, sourceId: 'new-small', x: 1005, y: 5000 });
    expect(restored?.result.usedLengthMm).toBe(10010);
  });

  it('refuses stale, overlapping, and incomplete saved geometry', () => {
    const requests = [request('old', 'large', 1000, 10000), request('old', 'small', 200, 4000)];
    const saved = captureManualMergedLayout(plan('old'), 0, requests);
    expect(restoreManualMergedLayout(plan('old'), 0, [requests[0]!, request('old', 'small', 220, 4000)], saved)).toBeNull();
    expect(restoreManualMergedLayout(plan('old'), 0, requests, { ...saved, rolls: [{ placements: [saved.rolls[0]!.placements[0]!, { ...saved.rolls[0]!.placements[1]!, x: 900 }] }] })).toBeNull();
    expect(restoreManualMergedLayout(plan('old'), 0, requests, { ...saved, rolls: [{ placements: [saved.rolls[0]!.placements[0]!] }] })).toBeNull();
  });

  it('keeps only the current input draft in local storage', () => {
    const snapshot = { pieces: [{ id: 'old', name: '그룹 1', pieces: [{ id: 'large', name: 'large', form: {} as CurrentEstimateSnapshot['pieces'][number]['pieces'][number]['form'] }] }] };
    const saved = captureManualMergedLayout(plan('old'), 0, [request('old', 'large', 1000, 10000), request('old', 'small', 200, 4000)]);
    const raw = serializeCurrentManualLayouts(snapshot, [saved]);
    expect(parseCurrentManualLayouts(raw, snapshot)).toEqual([saved]);
    expect(parseCurrentManualLayouts(raw, { pieces: [{ ...snapshot.pieces[0]!, id: 'different' }] })).toEqual([]);
  });

  it('can keep persisted project IDs while retaining newly optimized coordinates', () => {
    const optimized = plan('new');
    const shifted = { ...optimized,
      result: { ...optimized.result, placements: optimized.result.placements.map((placement) => ({ ...placement, id: placement.id + 10, y: placement.y + 100 })) },
      rollResults: optimized.rollResults?.map((roll) => ({ ...roll, placements: roll.placements.map((placement) => ({ ...placement, id: placement.id + 10, y: placement.y + 100 })) })),
    };
    const savedJob = {
      id: 'merged', name: 'merged', mergeGroupId: '1', groupNames: ['그룹 1'], sourceJobIds: [], sourceIds: ['old-large', 'old-small'],
      createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z', rollWidthMm: 1220,
      usedLengthMm: 10010, producedQuantity: 2, utilizationPercent: 80, wastePercent: 20,
      placements: plan('old').result.placements,
    };
    const kept = applyPlacementIdRecords(shifted, placementIdRecordsFromMergedJob(savedJob));
    const changed = applyPlacementIdRecords(shifted, placementIdRecordsFromPlan(shifted));
    expect(kept?.result.placements.map((placement) => [placement.id, placement.y])).toEqual([[1, 105], [2, 105]]);
    expect(changed?.result.placements.map((placement) => placement.id)).toEqual([11, 12]);
  });
});
