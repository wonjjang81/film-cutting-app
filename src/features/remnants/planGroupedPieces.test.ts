import { describe, expect, it } from 'vitest';
import { planGroupedPieces, planMergedGroups, type GroupedPieceRequest } from './planGroupedPieces';

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

  it('plans a mixed-size merged group against a matching physical remnant', () => {
    const requests: GroupedPieceRequest[] = [
      { groupId: 'g1', groupName: '그룹 1', pieceId: 'p1', pieceName: '조각 1', mergeGroupId: '1', request: { brand: '영림', productNumber: 'P1', remnants: [], ...base, pieceWidthMm: 100, pieceLengthMm: 100 } },
      { groupId: 'g2', groupName: '그룹 2', pieceId: 'p2', pieceName: '조각 2', mergeGroupId: '1', request: { brand: '영림', productNumber: 'P1', remnants: [], ...base, pieceWidthMm: 120, pieceLengthMm: 80 } },
    ];
    const source = { id: 'r1', brand: '영림', productNumber: 'P1', widthMm: 250, lengthMm: 210, quantity: 1, createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' };
    const [plan] = planMergedGroups(requests, 1220, [source], true);

    expect(plan?.remnantUses).toHaveLength(1);
    expect(plan?.remnantUses[0]?.producedQuantity).toBe(2);
    expect(plan?.newRollQuantity).toBe(0);
    expect(plan?.inventoryDelta.removeIds).toEqual(['r1']);
    expect(plan?.inventoryDelta.add).toEqual(expect.arrayContaining([
      expect.objectContaining({ brand: '영림', productNumber: 'P1' }),
    ]));
  });

  it('combines unassigned groups on one new roll without requiring product numbers', () => {
    const requests: GroupedPieceRequest[] = [
      { groupId: 'g1', groupName: '그룹 1', pieceId: 'p1', pieceName: '조각 1', request: { brand: '영림', productNumber: '', remnants: [], ...base, pieceWidthMm: 100, pieceLengthMm: 100 } },
      { groupId: 'g2', groupName: '그룹 2', pieceId: 'p2', pieceName: '조각 2', request: { brand: '영림', productNumber: '', remnants: [], ...base, pieceWidthMm: 120, pieceLengthMm: 80 } },
    ];

    const [plan] = planMergedGroups(requests, 1220, [], false);

    expect(plan?.sourceIds).toEqual(['g1-p1', 'g2-p2']);
    expect(plan?.result.placements).toHaveLength(2);
    expect(plan?.result.usedLengthMm).toBe(110);
    expect(plan?.newRollQuantity).toBe(2);
  });

  it('does not use a remnant from another brand or product in a merged group', () => {
    const requests: GroupedPieceRequest[] = [
      { groupId: 'g1', groupName: '그룹 1', pieceId: 'p1', pieceName: '조각 1', mergeGroupId: '1', request: { brand: '영림', productNumber: 'P1', remnants: [], ...base } },
      { groupId: 'g2', groupName: '그룹 2', pieceId: 'p2', pieceName: '조각 2', mergeGroupId: '1', request: { brand: '영림', productNumber: 'P1', remnants: [], ...base, pieceWidthMm: 120 } },
    ];
    const [plan] = planMergedGroups(requests, 1220, [{ id: 'wrong', brand: '현대', productNumber: 'P1', widthMm: 1220, lengthMm: 200, quantity: 1, createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' }], true);

    expect(plan?.remnantUses).toEqual([]);
    expect(plan?.inventoryDelta).toEqual({ removeIds: [], add: [], basedOnUpdatedAt: {} });
    expect(plan?.newRollQuantity).toBeGreaterThan(0);
  });

  it('reports which group piece is invalid before partial planning', () => {
    const requests: GroupedPieceRequest[] = [
      { groupId: 'g1', groupName: '그룹 1', pieceId: 'p1', pieceName: '조각 1', request: { brand: '영림', productNumber: '', remnants: [], ...base } },
      { groupId: 'g2', groupName: '그룹 2', pieceId: 'p2', pieceName: '조각 2', request: { brand: '영림', productNumber: '', remnants: [], ...base, pieceWidthMm: 0 } },
    ];

    expect(() => planMergedGroups(requests, 1220, [], false)).toThrow('그룹 2 · 조각 2');
  });
});
