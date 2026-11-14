import { describe, expect, it } from 'vitest';
import { planMergedGroups, type GroupedPieceRequest } from '../remnants/planGroupedPieces';
import { cutGroupEndLines, packCutGroups } from './cutGroupLayout';
import { captureManualMergedLayout, restoreManualMergedLayout } from './savedManualMergedLayout';
import { createLayoutSvgMarkup } from './createLayoutSvgMarkup';

const request = (pieceId: string, width: number, length: number, quantity = 1): GroupedPieceRequest => ({
  groupId: 'g1', groupName: '그룹 1', pieceId, pieceName: pieceId,
  request: { brand: '영림', productNumber: 'P1', rollWidthMm: 1220, pieceWidthMm: width, pieceLengthMm: length, quantity, gapMm: 3, sideMarginMm: 7, startEndMarginMm: 5, allowRotation: false, remnants: [] },
});
describe('cut group layout', () => {
  it('uses input order with savings off, descending length, or explicit subgroup IDs', () => {
    const entries = [
      { ...request('short', 300, 250), cutGroupOrder: 2 },
      { ...request('long', 310, 500), cutGroupOrder: 1 },
      { ...request('middle', 300, 350), cutGroupOrder: 2 },
    ];
    const plan = (priority: 'basic' | 'length' | 'subgroup', saveMaterial = true) =>
      planMergedGroups(entries, 1220, [], false, { priority, saveMaterial })[0]!;
    const order = (priority: 'basic' | 'length', saveMaterial: boolean) =>
      plan(priority, saveMaterial).result.placements.map(piece => piece.sourceId);
    expect(order('basic', false)).toEqual(['g1-short', 'g1-long', 'g1-middle']);
    expect(order('length', true)).toEqual(['g1-long', 'g1-middle', 'g1-short']);
    expect(plan('basic').result.usedLengthMm).toBeLessThan(plan('basic', false).result.usedLengthMm);
    expect(plan('length').result.placements.every(piece => piece.cutGroup === undefined)).toBe(true);
    expect(plan('subgroup').result.placements.map(piece => piece.cutGroup)).toEqual([1, 2, 2]);
  });

  it('applies ranked subgroup requests to all copies and keeps separate products apart', () => {
    const requests = [
      { ...request('a', 300, 500, 2), cutGroupOrder: 2 },
      { ...request('b', 310, 400, 2), cutGroupOrder: 1 },
      request('c', 220, 250),
      { ...request('d', 220, 250), cutGroupOrder: 3, request: { ...request('d', 220, 250).request, productNumber: 'P2' } },
    ];
    const [main, other] = planMergedGroups(requests, 1220, [], false);
    expect(main!.result.placements.map(piece => [piece.sourceId, piece.cutGroup])).toEqual([
      ['g1-b', 1], ['g1-b', 1], ['g1-a', 2], ['g1-a', 2], ['g1-c', undefined],
    ]);
    expect(other!.result.placements.map(piece => piece.sourceId)).toEqual(['g1-d']);
  });
  it('packs selected groups in order with an exact boundary and leaves unselected pieces last', () => {
    const requests = [request('a', 300, 500, 2), request('b', 310, 400), request('c', 220, 250)];
    const [base] = planMergedGroups(requests, 1220, [], false);
    const id = (source: string) => base!.result.placements.find(piece => piece.sourceId === 'g1-' + source)!.id;
    const result = packCutGroups(base!, requests, [[id('b')], [id('a')]]);
    const pieces = result.result.placements;
    const end = cutGroupEndLines(result.rollResults![0]!);
    expect(end.map(line => line.endY)).toEqual([405, 908]);
    expect(pieces.find(piece => piece.cutGroup === 2)!.y).toBe(408);
    expect(pieces.filter(piece => !piece.cutGroup).every(piece => piece.y >= 911)).toBe(true);
    expect(pieces.map(p => p.id).sort()).toEqual(base!.result.placements.map(p => p.id).sort());
    expect(base!.result.placements.every(piece => piece.cutGroup === undefined)).toBe(true);
    const saved = captureManualMergedLayout(result, 0, requests);
    expect(restoreManualMergedLayout(base!, 0, requests, JSON.parse(JSON.stringify(saved)))?.result.placements).toEqual(pieces);
    expect(createLayoutSvgMarkup({ result: result.rollResults![0]!, rollWidthMm: 1220, displayLengthMm: 1500, cutGroupLines: end })).toContain('x1="0" x2="1220" y1="405" y2="405"');
  });

  it('splits long groups at 25m and marks only their final roll', () => {
    const requests = [request('long', 1100, 13000, 2), request('small', 900, 500)];
    const [base] = planMergedGroups(requests, 1220, [], false);
    const ids = base!.result.placements.filter(piece => piece.sourceId === 'g1-long').map(piece => piece.id);
    const result = packCutGroups(base!, requests, [ids]);
    const [first, last] = result.rollResults!;
    expect(result.rollResults).toHaveLength(2);
    expect(result.rollResults!.every(roll => roll.usedLengthMm <= 25000)).toBe(true);
    expect(cutGroupEndLines(first!, [last!])).toEqual([]);
    expect(cutGroupEndLines(last!)[0]?.endY).toBe(13005);
    expect(last!.placements.at(-1)?.y).toBe(13008);
    expect(result.remnantUses).toBe(base!.remnantUses);
  });

  it('rejects duplicate or stale selections rather than dropping pieces', () => {
    const requests = [request('a', 500, 500), request('b', 500, 500)];
    const [base] = planMergedGroups(requests, 1220, [], false);
    const id = base!.result.placements[0]!.id;
    expect(() => packCutGroups(base!, requests, [[id], [id]])).toThrow();
    expect(() => packCutGroups(base!, requests, [[99999]])).toThrow();
  });
});
