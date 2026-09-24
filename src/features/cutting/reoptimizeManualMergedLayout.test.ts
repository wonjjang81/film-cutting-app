import { describe, expect, it } from 'vitest';
import type { GroupedPieceRequest, MergedGroupPlan } from '../remnants/planGroupedPieces';
import { reoptimizeManualMergedLayout } from './reoptimizeManualMergedLayout';

const requests: GroupedPieceRequest[] = [
  { groupId: 'g', groupName: '그룹', pieceId: 'large', pieceName: '큰조각', mergeGroupId: '1', request: { brand: '영림', productNumber: '', remnants: [], rollWidthMm: 1220, pieceWidthMm: 700, pieceLengthMm: 10000, quantity: 1, gapMm: 0, sideMarginMm: 5, startEndMarginMm: 5, allowRotation: false } },
  { groupId: 'g', groupName: '그룹', pieceId: 'small', pieceName: '작은조각', mergeGroupId: '1', request: { brand: '영림', productNumber: '', remnants: [], rollWidthMm: 1220, pieceWidthMm: 400, pieceLengthMm: 5000, quantity: 1, gapMm: 0, sideMarginMm: 5, startEndMarginMm: 5, allowRotation: false } },
];

function plan(twoRolls: boolean): MergedGroupPlan {
  const large = { id: 1, sourceId: 'g-large', instanceIndex: 0, x: 5, y: 5, width: 700, height: 10000, rotated: false };
  const small = { id: 2, sourceId: 'g-small', instanceIndex: 0, x: 5, y: twoRolls ? 5 : 10005, width: 400, height: 5000, rotated: false };
  const first = { placements: twoRolls ? [large] : [large, small], usedLengthMm: twoRolls ? 10010 : 15010, producedQuantity: twoRolls ? 1 : 2, utilizationPercent: 50, wastePercent: 50 };
  const rolls = twoRolls ? [first, { placements: [small], usedLengthMm: 5010, producedQuantity: 1, utilizationPercent: 20, wastePercent: 80 }] : [first];
  return { mergeGroupId: '1', sourceIds: ['g-large', 'g-small'], groupNames: ['그룹'], pieceCount: 2, result: { placements: [], usedLengthMm: rolls.reduce((sum, roll) => sum + roll.usedLengthMm, 0), producedQuantity: 2, utilizationPercent: 0, wastePercent: 100 }, rollResults: rolls, newRollQuantity: 2, producedQuantity: 2, remnantUses: [], inventoryDelta: { removeIds: [], add: [], basedOnUpdatedAt: {} }, inventoryAfter: [] };
}

describe('reoptimizeManualMergedLayout', () => {
  it('fills a same-roll side gap before extending the roll', () => {
    const optimized = reoptimizeManualMergedLayout(plan(false), requests);
    expect(optimized.plan.rollResults?.[0]?.placements.find((item) => item.id === 2)).toMatchObject({ x: 705, y: 5 });
    expect(optimized.plan.result.usedLengthMm).toBe(10010);
    expect(optimized.savedLengthMm).toBe(5000);
  });

  it('moves a later-roll small piece into an earlier roll gap and removes the empty roll', () => {
    const optimized = reoptimizeManualMergedLayout(plan(true), requests);
    expect(optimized.plan.rollResults).toHaveLength(1);
    expect(optimized.plan.rollResults?.[0]?.placements.map((item) => item.id).sort()).toEqual([1, 2]);
    expect(optimized.movedCount).toBe(1);
    expect(optimized.savedLengthMm).toBe(5010);
  });

  it('does not move a piece that the user manually moved to another roll', () => {
    const current = plan(true);
    const optimized = reoptimizeManualMergedLayout(current, requests, { lockedPlacementIds: [2] });
    expect(optimized.plan.rollResults).toHaveLength(2);
    expect(optimized.plan.rollResults?.[1]?.placements).toContainEqual(expect.objectContaining({ id: 2 }));
  });

  it('keeps a manually positioned same-roll piece fixed while filling other gaps', () => {
    const current = plan(false);
    const before = current.rollResults?.[0]?.placements.find((item) => item.id === 2);
    const optimized = reoptimizeManualMergedLayout(current, requests, { lockedPlacementIds: [2] });
    expect(optimized.plan.rollResults?.[0]?.placements.find((item) => item.id === 2)).toEqual(before);
    expect(optimized.movedCount).toBe(0);
  });

  it('reoptimizes only the selected current roll after a manual move', () => {
    const base = plan(true);
    const secondRollSmall = { ...base.rollResults![1]!.placements[0]!, y: 10005 };
    const secondRollLarge = { ...base.rollResults![0]!.placements[0]!, id: 3, sourceId: 'g-large', x: 5, y: 5 };
    const current = {
      ...base,
      rollResults: [base.rollResults![0]!, { ...base.rollResults![1]!, placements: [secondRollSmall, secondRollLarge], usedLengthMm: 15010, producedQuantity: 2 }],
      result: { ...base.result, usedLengthMm: 25020, producedQuantity: 3 }, pieceCount: 3, producedQuantity: 3, newRollQuantity: 3,
    };

    const optimized = reoptimizeManualMergedLayout(current, requests, { lockedPlacementIds: [3], targetRollIndex: 1 });
    expect(optimized.plan.rollResults?.[0]?.placements).toEqual(base.rollResults![0]!.placements);
    expect(optimized.plan.rollResults?.[0]?.usedLengthMm).toBe(base.rollResults![0]!.usedLengthMm);
    expect(optimized.plan.rollResults?.[1]?.placements.find((item) => item.id === 3)).toEqual(secondRollLarge);
    expect(optimized.plan.rollResults?.[1]?.placements.find((item) => item.id === 2)).toMatchObject({ x: 705, y: 5 });
    expect(optimized.savedLengthMm).toBe(5000);
  });

  it('can fill a later-roll gap with a small piece from an earlier roll', () => {
    const base = plan(false);
    const large = base.rollResults![0]!.placements[0]!;
    const small = base.rollResults![0]!.placements[1]!;
    const fixedBlocker = { id: 4, sourceId: 'fixed-blocker', instanceIndex: 0, x: 705, y: 5, width: 500, height: 10000, rotated: false };
    const laterLarge = { ...large, id: 3, sourceId: 'fixed-later', instanceIndex: 0 };
    const first = { ...base.rollResults![0]!, placements: [large, fixedBlocker, small], producedQuantity: 3 };
    const second = { ...base.rollResults![0]!, placements: [laterLarge], usedLengthMm: 10010, producedQuantity: 1 };
    const current = { ...base, rollResults: [first, second], result: { ...base.result, usedLengthMm: 25020, producedQuantity: 4 }, pieceCount: 4, newRollQuantity: 4, producedQuantity: 4 };
    const optimized = reoptimizeManualMergedLayout(current, requests);
    expect(optimized.plan.rollResults?.[1]?.placements.find((item) => item.id === 2)).toMatchObject({ x: 705, y: 5 });
    expect(optimized.plan.result.usedLengthMm).toBe(20020);
    expect(optimized.savedLengthMm).toBe(5000);
  });
});
