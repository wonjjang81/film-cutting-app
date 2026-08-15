import { describe, expect, it } from 'vitest';
import { ContinuousRollLayoutValidationError, optimizeContinuousRollLayout } from './optimizeContinuousRollLayout';

describe('optimizeContinuousRollLayout', () => {
  it('uses no more than 80mm for three 60x40 pieces on a 100mm roll', () => {
    const result = optimizeContinuousRollLayout({
      rollWidthMm: 100,
      pieceWidthMm: 60,
      pieceLengthMm: 40,
      quantity: 3,
      gapMm: 0,
      sideMarginMm: 0,
      startEndMarginMm: 0,
      allowRotation: true,
    });

    expect(result.usedLengthMm).toBeLessThanOrEqual(80);
    expect(result.producedQuantity).toBeGreaterThanOrEqual(3);
  });

  it('keeps placements inside side and start/end margins with gaps between pieces', () => {
    const result = optimizeContinuousRollLayout({
      rollWidthMm: 110,
      pieceWidthMm: 30,
      pieceLengthMm: 30,
      quantity: 4,
      gapMm: 5,
      sideMarginMm: 5,
      startEndMarginMm: 7,
      allowRotation: false,
    });

    expect(result.usedLengthMm).toBe(79);
    expect(result.placements).toHaveLength(4);
    expect(result.placements.every((placement) => (
      placement.x >= 5
      && placement.y >= 7
      && placement.x + placement.width <= 105
      && placement.y + placement.height <= 72
    ))).toBe(true);
    expect(result.placements.every((placement, index) => result.placements.slice(index + 1).every((other) => (
      placement.x + placement.width + 5 <= other.x
      || other.x + other.width + 5 <= placement.x
      || placement.y + placement.height + 5 <= other.y
      || other.y + other.height + 5 <= placement.y
    )))).toBe(true);
  });

  it('avoids overproduction when a partial final row uses the same length', () => {
    const result = optimizeContinuousRollLayout({
      rollWidthMm: 110,
      pieceWidthMm: 30,
      pieceLengthMm: 30,
      quantity: 4,
      gapMm: 5,
      sideMarginMm: 5,
      startEndMarginMm: 0,
      allowRotation: false,
    });

    expect(result.usedLengthMm).toBe(65);
    expect(result.producedQuantity).toBe(4);
    expect(result.overproduction).toBe(0);
  });

  it('rejects quantities above 100,000', () => {
    expect(() => optimizeContinuousRollLayout({
      rollWidthMm: 100,
      pieceWidthMm: 20,
      pieceLengthMm: 20,
      quantity: 100_001,
      gapMm: 0,
      sideMarginMm: 0,
      startEndMarginMm: 0,
      allowRotation: false,
    })).toThrow(ContinuousRollLayoutValidationError);
  });

  it('does not rotate pieces when rotation is disabled', () => {
    const result = optimizeContinuousRollLayout({
      rollWidthMm: 100, pieceWidthMm: 60, pieceLengthMm: 40, quantity: 3,
      gapMm: 0, sideMarginMm: 0, startEndMarginMm: 0, allowRotation: false,
    });

    expect(result.rotatedCount).toBe(0);
    expect(result.placements.every((placement) => !placement.rotated)).toBe(true);
  });

  it('returns the same layout for identical inputs', () => {
    const input = {
      rollWidthMm: 100, pieceWidthMm: 60, pieceLengthMm: 40, quantity: 3,
      gapMm: 0, sideMarginMm: 0, startEndMarginMm: 0, allowRotation: true,
    };

    expect(optimizeContinuousRollLayout(input)).toEqual(optimizeContinuousRollLayout(input));
  });

  it('returns only the quantity that fits a finite maximum length', () => {
    const result = optimizeContinuousRollLayout({
      rollWidthMm: 100, pieceWidthMm: 60, pieceLengthMm: 40, quantity: 3,
      gapMm: 0, sideMarginMm: 0, startEndMarginMm: 0, allowRotation: true,
      maxLengthMm: 79,
    });

    expect(result.usedLengthMm).toBeLessThanOrEqual(79);
    expect(result.producedQuantity).toBe(2);
    expect(result.placements.every((placement) => placement.y + placement.height <= 79)).toBe(true);
  });

  it('uses a stacked vertical partition when it shortens the roll', () => {
    const result = optimizeContinuousRollLayout({
      rollWidthMm: 100, pieceWidthMm: 60, pieceLengthMm: 40, quantity: 3,
      gapMm: 0, sideMarginMm: 0, startEndMarginMm: 0, allowRotation: true,
    });

    expect(result.usedLengthMm).toBe(80);
    expect(result.placements).toMatchObject([
      { x: 0, y: 0, width: 60, height: 40, rotated: false },
      { x: 0, y: 40, width: 60, height: 40, rotated: false },
      { x: 60, y: 0, width: 40, height: 60, rotated: true },
    ]);
    expect(result.rowPatterns[0]?.pattern).toContain('vertical-');
  });

  it('packs five 60x40 pieces into the complete 120mm vertical partition', () => {
    const result = optimizeContinuousRollLayout({
      rollWidthMm: 100, pieceWidthMm: 60, pieceLengthMm: 40, quantity: 5,
      gapMm: 0, sideMarginMm: 0, startEndMarginMm: 0, allowRotation: true,
    });

    expect(result.usedLengthMm).toBe(120);
    expect(result.producedQuantity).toBe(5);
    expect(result.rowPatterns).toHaveLength(1);
    expect(result.rowPatterns[0]?.pattern).toBe('vertical-1x3-1x2');
  });

  it('accepts the complete five-piece partition within a finite 120mm remnant', () => {
    const result = optimizeContinuousRollLayout({
      rollWidthMm: 100, pieceWidthMm: 60, pieceLengthMm: 40, quantity: 5,
      gapMm: 0, sideMarginMm: 0, startEndMarginMm: 0, allowRotation: true,
      maxLengthMm: 120,
    });

    expect(result).toMatchObject({ usedLengthMm: 120, producedQuantity: 5 });
  });

  it('preserves ordered row identities and gap-aware coordinates for tie-breaking and preview guides', () => {
    const result = optimizeContinuousRollLayout({
      rollWidthMm: 110, pieceWidthMm: 30, pieceLengthMm: 30, quantity: 4,
      gapMm: 5, sideMarginMm: 5, startEndMarginMm: 7, allowRotation: false,
    });

    expect(result.rowSequence).toMatchObject([
      { pattern: 'row-2-0', startY: 7, endY: 37 },
      { pattern: 'row-2-0', startY: 42, endY: 72 },
    ]);
  });
});
