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
});
