import { describe, expect, it } from 'vitest';
import { FilmLayoutValidationError, optimizeFilmLayout } from './optimizeFilmLayout';

describe('optimizeFilmLayout', () => {
  it('selects a mixed layout when it increases capacity', () => {
    const result = optimizeFilmLayout({
      rollWidthMm: 100, rollLengthMm: 100, pieceWidthMm: 60, pieceLengthMm: 40,
      quantity: 3, allowRotation: true,
    });
    expect(result).toMatchObject({ strategy: 'mixed-vertical', piecesPerSheet: 3, sheetsRequired: 1 });
    expect(result.placements.filter((item) => item.rotated)).toHaveLength(1);
  });

  it('applies margins and gaps without placing pieces outside the roll', () => {
    const result = optimizeFilmLayout({
      rollWidthMm: 110, rollLengthMm: 110, pieceWidthMm: 30, pieceLengthMm: 30,
      quantity: 9, gapMm: 5, marginMm: 5,
    });
    expect(result.piecesPerSheet).toBe(9);
    expect(result.placements.every((item) => item.x >= 5 && item.y >= 5 && item.x + item.width <= 105 && item.y + item.height <= 105)).toBe(true);
  });

  it('prefers the non-rotated layout when capacities are equal', () => {
    expect(optimizeFilmLayout({
      rollWidthMm: 100, rollLengthMm: 100, pieceWidthMm: 50, pieceLengthMm: 25,
      quantity: 8, allowRotation: true,
    }).strategy).toBe('normal');
  });

  it('calculates multi-sheet utilization from the requested quantity', () => {
    expect(optimizeFilmLayout({
      rollWidthMm: 100, rollLengthMm: 100, pieceWidthMm: 50, pieceLengthMm: 50, quantity: 5,
    })).toMatchObject({ piecesPerSheet: 4, sheetsRequired: 2, utilizationPercent: 62.5, wastePercent: 37.5 });
  });

  it.each([{ gapMm: -1 }, { marginMm: -1 }])('rejects invalid spacing: %o', (spacing) => {
    expect(() => optimizeFilmLayout({
      rollWidthMm: 100, rollLengthMm: 100, pieceWidthMm: 10, pieceLengthMm: 10, quantity: 1, ...spacing,
    })).toThrow(FilmLayoutValidationError);
  });
});
