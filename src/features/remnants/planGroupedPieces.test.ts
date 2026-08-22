import { describe, expect, it } from 'vitest';
import { planGroupedPieces, type GroupedPieceRequest } from './planGroupedPieces';

const base = { rollWidthMm: 1220, pieceWidthMm: 100, pieceLengthMm: 100, quantity: 1, gapMm: 0, sideMarginMm: 5, startEndMarginMm: 5, allowRotation: true };

describe('planGroupedPieces', () => {
  it('carries inventory forward between pieces in group order', () => {
    const requests: GroupedPieceRequest[] = [
      { groupId: 'g1', groupName: '그룹 1', pieceId: 'p1', pieceName: '조각 1', request: { brand: '영림', productNumber: '', remnants: [], ...base } },
      { groupId: 'g1', groupName: '그룹 1', pieceId: 'p2', pieceName: '조각 2', request: { brand: '영림', productNumber: '', remnants: [], ...base } },
    ];
    const inventory = [{ id: 'r1', brand: '영림', productNumber: '', widthMm: 1220, lengthMm: 120, quantity: 1, createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' }];
    const plans = planGroupedPieces(requests, inventory);
    expect(plans).toHaveLength(2);
    expect(plans[0]!.plan.remnantUses).toHaveLength(1);
    expect(plans[1]!.inventoryBefore.some((item) => item.id === 'r1')).toBe(false);
    expect(plans[1]!.plan.remnantUses.length + (plans[1]!.plan.newRollResult?.producedQuantity ?? 0)).toBeGreaterThan(0);
  });
});
