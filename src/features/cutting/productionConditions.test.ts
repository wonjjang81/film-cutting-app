import { describe, expect, it } from 'vitest';
import { optimizeContinuousRollLayout } from './optimizeContinuousRollLayout';
import { applyFixedProductionDefaults, DEFAULT_SIDE_MARGIN_MM, DEFAULT_START_END_MARGIN_MM, FIXED_ROLL_WIDTH_MM, normalizeProductionMargin } from './productionConditions';

describe('production conditions', () => {
  it('starts new work with zero edge margins', () => {
    expect(DEFAULT_SIDE_MARGIN_MM).toBe(0);
    expect(DEFAULT_START_END_MARGIN_MM).toBe(0);
  });

  it('passes configured edge margins into the placement calculation', () => {
    const result = optimizeContinuousRollLayout({
      rollWidthMm: FIXED_ROLL_WIDTH_MM,
      pieceWidthMm: 610,
      pieceLengthMm: 1_000,
      quantity: 2,
      gapMm: 0,
      sideMarginMm: 5,
      startEndMarginMm: 7,
      allowRotation: false,
    });

    expect(result.placements[0]).toMatchObject({ x: 5, y: 7 });
    expect(result.usedLengthMm).toBe(2_014);
  });

  it('normalizes editable margin values without allowing negative dimensions', () => {
    expect(normalizeProductionMargin('12.5')).toBe(12.5);
    expect(normalizeProductionMargin('')).toBe(0);
    expect(normalizeProductionMargin('-1')).toBe(0);
  });

  it('keeps saved editable margins while restoring fixed roll conditions', () => {
    expect(applyFixedProductionDefaults({ rollWidth: '900', gap: '4', sideMargin: '12', startEndMargin: '18' })).toEqual({
      rollWidth: '1220', gap: '0', sideMargin: '12', startEndMargin: '18',
    });
  });
});
