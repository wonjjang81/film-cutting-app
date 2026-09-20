import { describe, expect, it } from 'vitest';
import { optimizeMergedRollLayout } from './optimizeMergedRollLayout';

describe('optimizeMergedRollLayout', () => {
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

  it('calculates bounded-roll utilization from pieces actually placed, not requested pieces', () => {
    const result = optimizeMergedRollLayout({ rollWidthMm: 100, maxLengthMm: 100, gapMm: 0, sideMarginMm: 0, startEndMarginMm: 0, pieces: [
      { sourceId: 'small', widthMm: 40, lengthMm: 40, quantity: 10, allowRotation: false },
    ] });
    expect(result.producedQuantity).toBe(4);
    expect(result.utilizationPercent).toBe(80);
  });
});
