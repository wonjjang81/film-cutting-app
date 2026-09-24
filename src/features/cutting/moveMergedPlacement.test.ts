import { describe, expect, it } from 'vitest';
import { movePlacementToBestOtherRoll, movePlacementWithinRoll, removeEmptyRollSpaces, shiftPlacementHorizontally, shiftPlacementToEdge } from './moveMergedPlacement';
import type { GroupedPieceRequest, MergedGroupPlan } from '../remnants/planGroupedPieces';

const request = (pieceId: string, width: number, length: number): GroupedPieceRequest => ({
  groupId: 'g1', groupName: '그룹 1', pieceId, pieceName: pieceId,
  request: { brand: '영림', productNumber: 'P1', rollWidthMm: 1220, pieceWidthMm: width, pieceLengthMm: length, quantity: 1, gapMm: 0, sideMarginMm: 5, startEndMarginMm: 5, allowRotation: false, remnants: [] },
});

describe('movePlacementToBestOtherRoll', () => {
  it('moves the selected piece into another roll gap and shortens total length', () => {
    const requests = [request('large-a', 1000, 10000), request('small', 200, 4000), request('large-b', 1000, 10000)];
    const rollResults = [
      { placements: [
        { id: 1, sourceId: 'g1-large-a', instanceIndex: 0, x: 5, y: 5, width: 1000, height: 10000, rotated: false },
        { id: 2, sourceId: 'g1-small', instanceIndex: 0, x: 5, y: 10005, width: 200, height: 4000, rotated: false },
      ], usedLengthMm: 14010, producedQuantity: 2, utilizationPercent: 61.3, wastePercent: 38.7 },
      { placements: [
        { id: 3, sourceId: 'g1-large-b', instanceIndex: 0, x: 5, y: 5, width: 1000, height: 10000, rotated: false },
      ], usedLengthMm: 10010, producedQuantity: 1, utilizationPercent: 81.9, wastePercent: 18.1 },
    ];
    const plan = { mergeGroupId: 'auto', sourceIds: requests.map((entry) => `${entry.groupId}-${entry.pieceId}`), groupNames: ['그룹 1'], pieceCount: 3, result: { placements: [], usedLengthMm: 24020, producedQuantity: 3, utilizationPercent: 0, wastePercent: 100 }, rollResults, newRollQuantity: 3, producedQuantity: 3, remnantUses: [], inventoryDelta: { removeIds: [], add: [], basedOnUpdatedAt: {} }, inventoryAfter: [] } satisfies MergedGroupPlan;
    const moved = movePlacementToBestOtherRoll(plan, 2, requests);
    expect(moved?.fromRollIndex).toBe(0);
    expect(moved?.toRollIndex).toBe(1);
    expect(moved?.savedLengthMm).toBe(4000);
    expect(moved?.plan.rollResults?.map((roll) => roll.usedLengthMm)).toEqual([10010, 10010]);
    expect(moved?.plan.rollResults?.[1]?.placements.find((item) => item.id === 2)).toMatchObject({ x: 1005, y: 5 });
    expect(moved?.plan.result.placements).toHaveLength(3);
  });

  it('does not move a piece when no other roll has an existing empty gap', () => {
    const requests = [request('a', 1210, 10000), request('b', 1210, 23000)];
    const rolls = requests.map((entry, index) => ({ placements: [{ id: index + 1, sourceId: `g1-${entry.pieceId}`, instanceIndex: 0, x: 5, y: 5, width: 1210, height: Number(entry.request.pieceLengthMm), rotated: false }], usedLengthMm: Number(entry.request.pieceLengthMm) + 10, producedQuantity: 1, utilizationPercent: 99, wastePercent: 1 }));
    const plan = { mergeGroupId: 'auto', sourceIds: ['g1-a', 'g1-b'], groupNames: ['그룹 1'], pieceCount: 2, result: { placements: [], usedLengthMm: 20020, producedQuantity: 2, utilizationPercent: 0, wastePercent: 100 }, rollResults: rolls, newRollQuantity: 2, producedQuantity: 2, remnantUses: [], inventoryDelta: { removeIds: [], add: [], basedOnUpdatedAt: {} }, inventoryAfter: [] } satisfies MergedGroupPlan;
    expect(movePlacementToBestOtherRoll(plan, 1, requests)).toBeNull();
  });

  it('can use remaining length on another roll even when total material length increases', () => {
    const requests = [request('large-a', 1000, 10000), request('small', 200, 4000), request('large-b', 1210, 10000)];
    const rolls = [
      { placements: [
        { id: 1, sourceId: 'g1-large-a', instanceIndex: 0, x: 5, y: 5, width: 1000, height: 10000, rotated: false },
        { id: 2, sourceId: 'g1-small', instanceIndex: 0, x: 1005, y: 5, width: 200, height: 4000, rotated: false },
      ], usedLengthMm: 10010, producedQuantity: 2, utilizationPercent: 88.5, wastePercent: 11.5 },
      { placements: [{ id: 3, sourceId: 'g1-large-b', instanceIndex: 0, x: 5, y: 5, width: 1210, height: 10000, rotated: false }], usedLengthMm: 10010, producedQuantity: 1, utilizationPercent: 99, wastePercent: 1 },
    ];
    const plan = { mergeGroupId: 'auto', sourceIds: requests.map((entry) => `${entry.groupId}-${entry.pieceId}`), groupNames: ['그룹 1'], pieceCount: 3, result: { placements: [], usedLengthMm: 20020, producedQuantity: 3, utilizationPercent: 0, wastePercent: 100 }, rollResults: rolls, newRollQuantity: 3, producedQuantity: 3, remnantUses: [], inventoryDelta: { removeIds: [], add: [], basedOnUpdatedAt: {} }, inventoryAfter: [] } satisfies MergedGroupPlan;
    const moved = movePlacementToBestOtherRoll(plan, 2, requests);
    expect(moved?.plan.rollResults?.[1]?.placements.find((item) => item.id === 2)).toMatchObject({ x: 5, y: 10005 });
    expect(moved?.plan.rollResults?.[1]?.usedLengthMm).toBe(14010);
    expect(moved?.savedLengthMm).toBe(-4000);
  });

  it('moves into another roll even when total material length stays unchanged', () => {
    const requests = [request('large-a', 1000, 10000), request('small', 200, 4000), request('large-b', 1000, 10000)];
    const rolls = [
      { placements: [
        { id: 1, sourceId: 'g1-large-a', instanceIndex: 0, x: 5, y: 5, width: 1000, height: 10000, rotated: false },
        { id: 2, sourceId: 'g1-small', instanceIndex: 0, x: 1005, y: 5, width: 200, height: 4000, rotated: false },
      ], usedLengthMm: 10010, producedQuantity: 2, utilizationPercent: 88.5, wastePercent: 11.5 },
      { placements: [{ id: 3, sourceId: 'g1-large-b', instanceIndex: 0, x: 5, y: 5, width: 1000, height: 10000, rotated: false }], usedLengthMm: 10010, producedQuantity: 1, utilizationPercent: 81.9, wastePercent: 18.1 },
    ];
    const plan = { mergeGroupId: 'auto', sourceIds: requests.map((entry) => `${entry.groupId}-${entry.pieceId}`), groupNames: ['그룹 1'], pieceCount: 3, result: { placements: [], usedLengthMm: 20020, producedQuantity: 3, utilizationPercent: 0, wastePercent: 100 }, rollResults: rolls, newRollQuantity: 3, producedQuantity: 3, remnantUses: [], inventoryDelta: { removeIds: [], add: [], basedOnUpdatedAt: {} }, inventoryAfter: [] } satisfies MergedGroupPlan;
    const moved = movePlacementToBestOtherRoll(plan, 2, requests);
    expect(moved?.savedLengthMm).toBe(0);
    expect(moved?.plan.rollResults?.[0]?.placements.map((item) => item.id)).toEqual([1]);
    expect(moved?.plan.rollResults?.[1]?.placements.map((item) => item.id)).toEqual([3, 2]);
    expect(moved?.plan.result.usedLengthMm).toBe(20020);
  });

  it('moves only to the roll selected by the user', () => {
    const requests = [request('large-a', 1000, 10000), request('small', 200, 4000), request('large-b', 1000, 10000), request('large-c', 1000, 5000)];
    const rolls = [
      { placements: [
        { id: 1, sourceId: 'g1-large-a', instanceIndex: 0, x: 5, y: 5, width: 1000, height: 10000, rotated: false },
        { id: 2, sourceId: 'g1-small', instanceIndex: 0, x: 5, y: 10005, width: 200, height: 4000, rotated: false },
      ], usedLengthMm: 14010, producedQuantity: 2, utilizationPercent: 61.3, wastePercent: 38.7 },
      { placements: [{ id: 3, sourceId: 'g1-large-b', instanceIndex: 0, x: 5, y: 5, width: 1000, height: 10000, rotated: false }], usedLengthMm: 10010, producedQuantity: 1, utilizationPercent: 81.9, wastePercent: 18.1 },
      { placements: [{ id: 4, sourceId: 'g1-large-c', instanceIndex: 0, x: 5, y: 5, width: 1000, height: 5000, rotated: false }], usedLengthMm: 5010, producedQuantity: 1, utilizationPercent: 81.9, wastePercent: 18.1 },
    ];
    const plan = { mergeGroupId: 'auto', sourceIds: requests.map((entry) => `${entry.groupId}-${entry.pieceId}`), groupNames: ['그룹 1'], pieceCount: 4, result: { placements: [], usedLengthMm: 29030, producedQuantity: 4, utilizationPercent: 0, wastePercent: 100 }, rollResults: rolls, newRollQuantity: 4, producedQuantity: 4, remnantUses: [], inventoryDelta: { removeIds: [], add: [], basedOnUpdatedAt: {} }, inventoryAfter: [] } satisfies MergedGroupPlan;
    const moved = movePlacementToBestOtherRoll(plan, 2, requests, 2);
    expect(moved?.toRollIndex).toBe(2);
    expect(moved?.plan.rollResults?.[1]?.placements.map((item) => item.id)).toEqual([3]);
    expect(moved?.plan.rollResults?.[2]?.placements.map((item) => item.id)).toEqual([4, 2]);
    expect(movePlacementToBestOtherRoll(plan, 2, requests, 0)).toBeNull();
  });

  it('allows a manual drop into a free spot on the same roll and rejects overlap or outside drops', () => {
    const requests = [request('large', 1000, 10000), request('small', 200, 4000)];
    const roll = { placements: [
      { id: 1, sourceId: 'g1-large', instanceIndex: 0, x: 5, y: 5, width: 1000, height: 10000, rotated: false },
      { id: 2, sourceId: 'g1-small', instanceIndex: 0, x: 1005, y: 5, width: 200, height: 4000, rotated: false },
    ], usedLengthMm: 10010, producedQuantity: 2, utilizationPercent: 88.5, wastePercent: 11.5 };
    const plan = { mergeGroupId: 'auto', sourceIds: requests.map((entry) => `${entry.groupId}-${entry.pieceId}`), groupNames: ['그룹 1'], pieceCount: 2, result: roll, rollResults: [roll], newRollQuantity: 2, producedQuantity: 2, remnantUses: [], inventoryDelta: { removeIds: [], add: [], basedOnUpdatedAt: {} }, inventoryAfter: [] } satisfies MergedGroupPlan;
    expect(movePlacementWithinRoll(plan, 2, 1006, 5001, requests).plan?.rollResults?.[0]?.placements[1]).toMatchObject({ x: 1005, y: 5000 });
    expect(movePlacementWithinRoll(plan, 2, 989, 5017, requests).plan?.rollResults?.[0]?.placements[1]).toMatchObject({ x: 1005, y: 5000 });
    expect(movePlacementWithinRoll(plan, 2, 900, 5000, requests).error).toContain('겹치');
    expect(movePlacementWithinRoll(plan, 2, 1005, 9000, requests).error).toContain('벗어');
    expect(plan.rollResults[0]?.placements[1]?.y).toBe(5);
  });

  it('strongly snaps a dragged piece to a nearby piece edge', () => {
    const requests = [request('large', 1000, 10000), request('small', 200, 4000)];
    const roll = { placements: [
      { id: 1, sourceId: 'g1-large', instanceIndex: 0, x: 5, y: 5, width: 1000, height: 10000, rotated: false },
      { id: 2, sourceId: 'g1-small', instanceIndex: 0, x: 1005, y: 5, width: 200, height: 4000, rotated: false },
    ], usedLengthMm: 10010, producedQuantity: 2, utilizationPercent: 88.5, wastePercent: 11.5 };
    const plan = { mergeGroupId: 'auto', sourceIds: requests.map((entry) => `${entry.groupId}-${entry.pieceId}`), groupNames: ['그룹 1'], pieceCount: 2, result: roll, rollResults: [roll], newRollQuantity: 2, producedQuantity: 2, remnantUses: [], inventoryDelta: { removeIds: [], add: [], basedOnUpdatedAt: {} }, inventoryAfter: [] } satisfies MergedGroupPlan;

    expect(movePlacementWithinRoll(plan, 2, 1044, 5044, requests).plan?.rollResults?.[0]?.placements[1]).toMatchObject({ x: 1005, y: 5000 });
  });

  it('pushes an attached chain together during a manual drag', () => {
    const requests = [request('a', 300, 1000), request('b', 300, 1000), request('c', 300, 1000)];
    const roll = { placements: [
      { id: 1, sourceId: 'g1-a', instanceIndex: 0, x: 5, y: 5, width: 300, height: 1000, rotated: false },
      { id: 2, sourceId: 'g1-b', instanceIndex: 0, x: 305, y: 5, width: 300, height: 1000, rotated: false },
      { id: 3, sourceId: 'g1-c', instanceIndex: 0, x: 605, y: 5, width: 300, height: 1000, rotated: false },
    ], usedLengthMm: 1010, producedQuantity: 3, utilizationPercent: 73.8, wastePercent: 26.2 };
    const plan = { mergeGroupId: 'auto', sourceIds: requests.map((entry) => `${entry.groupId}-${entry.pieceId}`), groupNames: ['그룹 1'], pieceCount: 3, result: roll, rollResults: [roll], newRollQuantity: 3, producedQuantity: 3, remnantUses: [], inventoryDelta: { removeIds: [], add: [], basedOnUpdatedAt: {} }, inventoryAfter: [] } satisfies MergedGroupPlan;

    const moved = movePlacementWithinRoll(plan, 1, 105, 5, requests).plan?.rollResults?.[0]?.placements;
    expect(moved?.map((item) => [item.id, item.x])).toEqual([[1, 100], [2, 400], [3, 700]]);
  });

  it('pushes a piece to the nearest free left or right edge', () => {
    const requests = [request('left', 300, 1000), request('moving', 200, 1000), request('right', 300, 1000)];
    const roll = { placements: [
      { id: 1, sourceId: 'g1-left', instanceIndex: 0, x: 5, y: 5, width: 300, height: 1000, rotated: false },
      { id: 2, sourceId: 'g1-moving', instanceIndex: 0, x: 500, y: 5, width: 200, height: 1000, rotated: false },
      { id: 3, sourceId: 'g1-right', instanceIndex: 0, x: 915, y: 5, width: 300, height: 1000, rotated: false },
    ], usedLengthMm: 1010, producedQuantity: 3, utilizationPercent: 65.6, wastePercent: 34.4 };
    const plan = { mergeGroupId: 'auto', sourceIds: requests.map((entry) => `${entry.groupId}-${entry.pieceId}`), groupNames: ['그룹 1'], pieceCount: 3, result: roll, rollResults: [roll], newRollQuantity: 3, producedQuantity: 3, remnantUses: [], inventoryDelta: { removeIds: [], add: [], basedOnUpdatedAt: {} }, inventoryAfter: [] } satisfies MergedGroupPlan;

    expect(shiftPlacementHorizontally(plan, 2, 'left', requests).plan?.rollResults?.[0]?.placements[1]).toMatchObject({ x: 305 });
    expect(shiftPlacementHorizontally(plan, 2, 'right', requests).plan?.rollResults?.[0]?.placements[1]).toMatchObject({ x: 715 });
  });

  it('moves a selected piece to all four usable roll edges', () => {
    const requests = [request('moving', 200, 1000)];
    const roll = { placements: [
      { id: 1, sourceId: 'g1-moving', instanceIndex: 0, x: 500, y: 2000, width: 200, height: 1000, rotated: false },
    ], usedLengthMm: 5005, producedQuantity: 1, utilizationPercent: 3.3, wastePercent: 96.7 };
    const plan = { mergeGroupId: 'auto', sourceIds: ['g1-moving'], groupNames: ['그룹 1'], pieceCount: 1, result: roll, rollResults: [roll], newRollQuantity: 1, producedQuantity: 1, remnantUses: [], inventoryDelta: { removeIds: [], add: [], basedOnUpdatedAt: {} }, inventoryAfter: [] } satisfies MergedGroupPlan;

    expect(shiftPlacementToEdge(plan, 1, 'left', requests).plan?.rollResults?.[0]?.placements[0]).toMatchObject({ x: 5, y: 2000 });
    expect(shiftPlacementToEdge(plan, 1, 'right', requests).plan?.rollResults?.[0]?.placements[0]).toMatchObject({ x: 1015, y: 2000 });
    expect(shiftPlacementToEdge(plan, 1, 'top', requests).plan?.rollResults?.[0]?.placements[0]).toMatchObject({ x: 500, y: 5 });
    expect(shiftPlacementToEdge(plan, 1, 'bottom', requests).plan?.rollResults?.[0]?.placements[0]).toMatchObject({ x: 500, y: 4000 });
  });

  it('removes completely empty horizontal bands while preserving each band layout', () => {
    const requests = [request('a', 600, 1000), request('b', 600, 1000), request('c', 300, 500)];
    const roll = { placements: [
      { id: 1, sourceId: 'g1-a', instanceIndex: 0, x: 5, y: 5, width: 600, height: 1000, rotated: false },
      { id: 2, sourceId: 'g1-b', instanceIndex: 0, x: 605, y: 5, width: 600, height: 1000, rotated: false },
      { id: 3, sourceId: 'g1-c', instanceIndex: 0, x: 5, y: 3000, width: 300, height: 500, rotated: false },
    ], usedLengthMm: 3505, producedQuantity: 3, utilizationPercent: 40, wastePercent: 60 };
    const plan = { mergeGroupId: 'auto', sourceIds: requests.map((entry) => `${entry.groupId}-${entry.pieceId}`), groupNames: ['그룹 1'], pieceCount: 3, result: roll, rollResults: [roll], newRollQuantity: 3, producedQuantity: 3, remnantUses: [], inventoryDelta: { removeIds: [], add: [], basedOnUpdatedAt: {} }, inventoryAfter: [] } satisfies MergedGroupPlan;
    const compacted = removeEmptyRollSpaces(plan, requests);

    expect(compacted.movedCount).toBe(1);
    expect(compacted.savedLengthMm).toBe(1995);
    expect(compacted.plan.rollResults?.[0]?.placements.find((item) => item.id === 3)?.y).toBe(1005);
    expect(compacted.plan.rollResults?.[0]?.usedLengthMm).toBe(1510);
  });
});
