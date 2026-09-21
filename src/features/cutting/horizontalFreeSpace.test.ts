import { describe, expect, it } from 'vitest';
import { horizontalFreeSpaceAtPoint } from './horizontalFreeSpace';

describe('horizontal free-space measurement', () => {
  const placements = [
    { x: 0, y: 0, width: 300, height: 200 },
    { x: 400, y: 0, width: 500, height: 200 },
  ];

  it('measures the gap containing the clicked point', () => {
    expect(horizontalFreeSpaceAtPoint(placements, 1_220, 350, 100)).toEqual({ leftMm: 300, rightMm: 400, widthMm: 100, yMm: 100 });
  });

  it('measures empty space at the right edge of the roll', () => {
    expect(horizontalFreeSpaceAtPoint(placements, 1_220, 1_000, 100)).toEqual({ leftMm: 900, rightMm: 1_220, widthMm: 320, yMm: 100 });
  });

  it('ignores gaps narrower than 30mm and occupied points', () => {
    const narrowGap = [{ x: 0, y: 0, width: 300, height: 200 }, { x: 329, y: 0, width: 200, height: 200 }];
    expect(horizontalFreeSpaceAtPoint(narrowGap, 600, 315, 100)).toBeNull();
    expect(horizontalFreeSpaceAtPoint(placements, 1_220, 200, 100)).toBeNull();
  });

  it('merges touching and overlapping occupied intervals', () => {
    const overlapping = [
      { x: 100, y: 0, width: 200, height: 100 },
      { x: 250, y: 0, width: 200, height: 100 },
      { x: 450, y: 0, width: 100, height: 100 },
    ];
    expect(horizontalFreeSpaceAtPoint(overlapping, 600, 500, 50)).toBeNull();
    expect(horizontalFreeSpaceAtPoint(overlapping, 600, 575, 50)?.widthMm).toBe(50);
  });

  it('only treats pieces crossing the clicked height as occupied', () => {
    expect(horizontalFreeSpaceAtPoint(placements, 1_220, 200, 250)?.widthMm).toBe(1_220);
  });
});
