import { describe, expect, it } from 'vitest';
import { calculateFilmCut, FilmCutValidationError } from './calculateFilmCut';

describe('calculateFilmCut', () => {
  it('calculates the number of pieces and required sheets', () => {
    expect(calculateFilmCut({ rollWidthMm: 1000, rollLengthMm: 2000, pieceWidthMm: 250, pieceLengthMm: 500, quantity: 20 }))
      .toMatchObject({ columns: 4, rows: 4, piecesPerSheet: 16, sheetsRequired: 2, usedLengthMm: 4000 });
  });

  it('chooses rotation only when it produces more pieces', () => {
    expect(calculateFilmCut({ rollWidthMm: 1000, rollLengthMm: 600, pieceWidthMm: 600, pieceLengthMm: 400, quantity: 2, allowRotation: true }))
      .toMatchObject({ columns: 2, rows: 1, piecesPerSheet: 2, rotated: true });
  });

  it.each([0, -1, Number.NaN])('rejects invalid dimensions: %s', (rollWidthMm) => {
    expect(() => calculateFilmCut({ rollWidthMm, rollLengthMm: 100, pieceWidthMm: 10, pieceLengthMm: 10, quantity: 1 }))
      .toThrow(FilmCutValidationError);
  });

  it('rejects a piece larger than the sheet', () => {
    expect(() => calculateFilmCut({ rollWidthMm: 100, rollLengthMm: 100, pieceWidthMm: 200, pieceLengthMm: 10, quantity: 1 }))
      .toThrow('재단 규격이 원단보다 큽니다.');
  });
});
