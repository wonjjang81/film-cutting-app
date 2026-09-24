import { describe, expect, it } from 'vitest';
import type { GroupedPieceRequest, MergedGroupPlan } from '../remnants/planGroupedPieces';
import { captureManualMergedLayout } from './savedManualMergedLayout';
import { selectBestLearnedManualLayout } from './learnedManualLayout';

function request(groupId: string, pieceId: string, width: number, length: number): GroupedPieceRequest {
  return { groupId, groupName: '그룹', pieceId, pieceName: pieceId, request: { brand: '영림', productNumber: 'P1',
    rollWidthMm: 1220, pieceWidthMm: width, pieceLengthMm: length, quantity: 1, gapMm: 0,
    sideMarginMm: 5, startEndMarginMm: 5, allowRotation: false, remnants: [] } };
}

function layout(groupId: string, compact: boolean): MergedGroupPlan {
  const large = { id: 1, sourceId: `${groupId}-large`, instanceIndex: 0, x: 5, y: 5, width: 1000, height: 10000, rotated: false };
  const small = { id: 2, sourceId: `${groupId}-small`, instanceIndex: 0, x: compact ? 1005 : 5, y: compact ? 5 : 10005, width: 200, height: 4000, rotated: false };
  const usedLengthMm = compact ? 10010 : 14010;
  const utilizationPercent = Math.round(((large.width * large.height + small.width * small.height) / (1220 * usedLengthMm)) * 1000) / 10;
  const roll = { placements: [large, small], usedLengthMm, producedQuantity: 2, utilizationPercent, wastePercent: 100 - utilizationPercent };
  return { mergeGroupId: '1', sourceIds: [`${groupId}-large`, `${groupId}-small`], groupNames: ['그룹'], pieceCount: 2,
    result: roll, rollResults: [roll], newRollQuantity: 2, producedQuantity: 2, remnantUses: [],
    inventoryDelta: { removeIds: [], add: [], basedOnUpdatedAt: {} }, inventoryAfter: [] };
}

describe('learned manual layout', () => {
  it('reuses a better validated layout learned from another project', () => {
    const oldRequests = [request('old', 'large', 1000, 10000), request('old', 'small', 200, 4000)];
    const learned = { ...captureManualMergedLayout(layout('old', true), 0, oldRequests), planIndex: 7 };
    const automatic = layout('new', false);
    const result = selectBestLearnedManualLayout(automatic, 0, [request('new', 'large', 1000, 10000), request('new', 'small', 200, 4000)], [learned]);

    expect(result.learned).toBe(true);
    expect(result.plan.result.usedLengthMm).toBe(10010);
    expect(result.plan.rollResults?.[0]?.placements.find((item) => item.id === 2)).toMatchObject({ sourceId: 'new-small', x: 1005, y: 5 });
    expect(result.savedLengthMm).toBe(4000);
  });

  it('rejects a valid learned layout that is not better than automatic placement', () => {
    const oldRequests = [request('old', 'large', 1000, 10000), request('old', 'small', 200, 4000)];
    const worse = captureManualMergedLayout(layout('old', false), 0, oldRequests);
    const automatic = layout('new', true);
    const result = selectBestLearnedManualLayout(automatic, 0, [request('new', 'large', 1000, 10000), request('new', 'small', 200, 4000)], [worse]);

    expect(result.learned).toBe(false);
    expect(result.plan).toBe(automatic);
  });

  it('rejects a learned layout when current cutting geometry differs', () => {
    const oldRequests = [request('old', 'large', 1000, 10000), request('old', 'small', 200, 4000)];
    const learned = captureManualMergedLayout(layout('old', true), 0, oldRequests);
    const automatic = layout('new', false);
    const changedRequests = [request('new', 'large', 1000, 10000), request('new', 'small', 220, 4000)];

    expect(selectBestLearnedManualLayout(automatic, 0, changedRequests, [learned]).learned).toBe(false);
  });
});
