import { describe, expect, it } from 'vitest';
import type { Placement } from './optimizeContinuousRollLayout';
import { adjustManualPlacement, rotateManualPlacement } from './manualPlacement';

const bounds = { rollWidthMm: 1220, usedLengthMm: 500, sideMarginMm: 5, startEndMarginMm: 5 };
const first: Placement = { id: 1, x: 5, y: 5, width: 300, height: 200, rotated: false };

describe('manual placement rules', () => {
  it('snaps coordinates and clamps to the roll edges', () => {
    const result = adjustManualPlacement(first, { x: 3, y: 493 }, [], bounds);
    expect(result.placement).toMatchObject({ x: 5, y: 295 });
  });

  it('rejects collisions and invalid rotations', () => {
    const sibling: Placement = { id: 2, x: 400, y: 5, width: 300, height: 200, rotated: false };
    expect(adjustManualPlacement(first, { x: 400 }, [sibling], bounds).error).toContain('겹칠');
    expect(rotateManualPlacement({ ...first, width: 600, height: 1_300 }, [], bounds).error).toContain('초과');
  });
});
