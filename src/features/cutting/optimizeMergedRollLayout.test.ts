import { describe, expect, it } from 'vitest';
import { optimizeMergedRollLayout } from './optimizeMergedRollLayout';

describe('optimizeMergedRollLayout', () => {
  it('places subgroup neighbors together when material usage ties', () => {
    const input = { rollWidthMm: 200, gapMm: 0, sideMarginMm: 0, startEndMarginMm: 0, pieces:
      ['a1', 'b1', 'a2', 'b2'].map(sourceId => ({ sourceId, subgroupKey: sourceId[0], widthMm: 100, lengthMm: 100, quantity: 1, allowRotation: false })) };
    const result = optimizeMergedRollLayout(input);
    expect(result.usedLengthMm).toBe(200);
    expect(result.producedQuantity).toBe(4);
    for (const group of ['a', 'b']) {
      const pieces = result.placements.filter(p => p.sourceId.startsWith(group));
      expect(pieces[0]!.y).toBe(pieces[1]!.y);
    }
  });

  it('never spends extra material to group subgroups, preserving quantity and rotation constraints', () => {
    const pieces = [
      { sourceId: 'a1', subgroupKey: 'a', widthMm: 180, lengthMm: 300, quantity: 2, allowRotation: false },
      { sourceId: 'b1', subgroupKey: 'b', widthMm: 120, lengthMm: 200, quantity: 3, allowRotation: true },
      { sourceId: 'a2', subgroupKey: 'a', widthMm: 120, lengthMm: 100, quantity: 2, allowRotation: false },
    ];
    for (const maxLengthMm of [undefined, 600]) {
      const input = { rollWidthMm: 300, gapMm: 0, sideMarginMm: 0, startEndMarginMm: 0, maxLengthMm, pieces };
      const baseline = optimizeMergedRollLayout({ ...input, pieces: pieces.map(({subgroupKey, ...p}) => p) });
      const result = optimizeMergedRollLayout(input);
      expect(result.producedQuantity).toBeGreaterThanOrEqual(baseline.producedQuantity);
      if (result.producedQuantity === baseline.producedQuantity) expect(result.usedLengthMm).toBeLessThanOrEqual(baseline.usedLengthMm);
      for (const source of pieces) {
        const placed = result.placements.filter(p => p.sourceId === source.sourceId);
        expect(placed.length).toBeLessThanOrEqual(source.quantity);
        expect(new Set(placed.map(p => p.instanceIndex)).size).toBe(placed.length);
        if (!source.allowRotation) expect(placed.every(p => !p.rotated)).toBe(true);
      }
      result.placements.forEach((p, i) => result.placements.slice(i+1).forEach(q => {
        expect(p.x >= q.x+q.width || q.x >= p.x+p.width || p.y >= q.y+q.height || q.y >= p.y+p.height).toBe(true);
      }));
    }
  });

  it('places different piece sizes on one mixed roll without overlap', () => {
    const result = optimizeMergedRollLayout({ rollWidthMm: 1220, gapMm: 0, sideMarginMm: 5, startEndMarginMm: 5, pieces: [
      { sourceId: 'g1-p1', widthMm: 600, lengthMm: 400, quantity: 1, allowRotation: false },
      { sourceId: 'g2-p1', widthMm: 300, lengthMm: 200, quantity: 2, allowRotation: true },
    ] });
    expect(result.producedQuantity).toBe(3);
    expect(result.usedLengthMm).toBeGreaterThan(0);
    for (let index = 0; index < result.placements.length; index += 1) {
      for (let other = index + 1; other < result.placements.length; other += 1) {
        const left = result.placements[index]!;
        const right = result.placements[other]!;
        expect(left.x >= right.x + right.width || right.x >= left.x + left.width || left.y >= right.y + right.height || right.y >= left.y + left.height).toBe(true);
      }
    }
  });

  it('maximizes produced quantity before length when bounded by a remnant rectangle', () => {
    const result = optimizeMergedRollLayout({ rollWidthMm: 200, maxLengthMm: 100, gapMm: 0, sideMarginMm: 0, startEndMarginMm: 0, pieces: [
      { sourceId: 'short-wide', widthMm: 200, lengthMm: 50, quantity: 1, allowRotation: false },
      { sourceId: 'tall-narrow', widthMm: 100, lengthMm: 100, quantity: 2, allowRotation: false },
    ] });

    expect(result.producedQuantity).toBe(2);
    expect(result.usedLengthMm).toBe(100);
  });

  it('keeps the legacy four-order search deterministic for equal mixed-roll lengths', () => {
    const input = { rollWidthMm: 1_220, gapMm: 0, sideMarginMm: 5, startEndMarginMm: 5, pieces: [
      { sourceId: 'wide-short', widthMm: 600, lengthMm: 300, quantity: 1, allowRotation: false },
      { sourceId: 'narrow-tall', widthMm: 300, lengthMm: 600, quantity: 1, allowRotation: false },
      { sourceId: 'square', widthMm: 300, lengthMm: 300, quantity: 2, allowRotation: false },
    ] } as const;
    const first = optimizeMergedRollLayout(input);
    const second = optimizeMergedRollLayout(input);
    expect(first).toEqual(second);
    expect(first.producedQuantity).toBe(4);
    expect(first.usedLengthMm).toBe(610);
    expect(first.placements.map((placement) => placement.sourceId)).toEqual([
      'wide-short', 'narrow-tall', 'square', 'square',
    ]);
  });

  it('anchors a wide long piece on the left and fills its right-side strip with smaller pieces', () => {
    const result = optimizeMergedRollLayout({ rollWidthMm: 1_220, gapMm: 0, sideMarginMm: 5, startEndMarginMm: 5, pieces: [
      { sourceId: 'wide-long', widthMm: 900, lengthMm: 1_200, quantity: 1, allowRotation: false },
      { sourceId: 'wide-short', widthMm: 900, lengthMm: 800, quantity: 1, allowRotation: false },
      { sourceId: 'small', widthMm: 300, lengthMm: 600, quantity: 2, allowRotation: false },
    ] });

    expect(result.usedLengthMm).toBe(2_010);
    expect(result.placements.find((piece) => piece.sourceId === 'wide-long')).toMatchObject({ x: 5, y: 5 });
    expect(result.placements.filter((piece) => piece.sourceId === 'small').map((piece) => [piece.x, piece.y])).toEqual([[905, 5], [905, 605]]);
  });

  it('prefers the larger fitting piece at the same leftmost gap before smaller pieces', () => {
    const result = optimizeMergedRollLayout({ rollWidthMm: 1_220, gapMm: 0, sideMarginMm: 5, startEndMarginMm: 5, pieces: [
      { sourceId: 'small-first-in-input', widthMm: 250, lengthMm: 300, quantity: 2, allowRotation: false },
      { sourceId: 'large', widthMm: 700, lengthMm: 1_000, quantity: 1, allowRotation: false },
    ] });
    expect(result.placements[0]).toMatchObject({ sourceId: 'large', x: 5, y: 5 });
    expect(result.placements.filter((piece) => piece.sourceId === 'small-first-in-input').every((piece) => piece.x >= 705)).toBe(true);
  });

  it('calculates bounded-roll utilization from pieces actually placed, not requested pieces', () => {
    const result = optimizeMergedRollLayout({ rollWidthMm: 100, maxLengthMm: 100, gapMm: 0, sideMarginMm: 0, startEndMarginMm: 0, pieces: [
      { sourceId: 'small', widthMm: 40, lengthMm: 40, quantity: 10, allowRotation: false },
    ] });
    expect(result.producedQuantity).toBe(4);
    expect(result.utilizationPercent).toBe(80);
  });
});
