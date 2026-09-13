import { describe, expect, it } from 'vitest';

import {
  DEFAULT_CUT_ALLOWANCE_MM,
  cutAllowanceDimensions,
  inheritCutAllowance,
  restoreCutAllowanceDimensions,
  summarizeCutAllowances,
} from './cutAllowance';

describe('cut allowance', () => {
  it('adds one allowance value to both source dimensions', () => {
    expect(cutAllowanceDimensions('100', '200', '50')).toEqual({
      sourcePieceWidthMm: 100,
      sourcePieceLengthMm: 200,
      cutAllowanceMm: 50,
      pieceWidthMm: 150,
      pieceLengthMm: 250,
    });
  });

  it('treats a missing allowance as legacy zero rather than the new default', () => {
    expect(cutAllowanceDimensions('100', '200', undefined)).toMatchObject({
      cutAllowanceMm: 0,
      pieceWidthMm: 100,
      pieceLengthMm: 200,
    });
    expect(DEFAULT_CUT_ALLOWANCE_MM).toBe(50);
  });

  it('restores saved allowance when present and legacy zero when absent', () => {
    expect(restoreCutAllowanceDimensions({
      pieceWidthMm: 150,
      pieceLengthMm: 250,
      sourcePieceWidthMm: 100,
      sourcePieceLengthMm: 200,
      cutAllowanceMm: 50,
    })).toEqual({ sourcePieceWidthMm: 100, sourcePieceLengthMm: 200, cutAllowanceMm: 50 });
    expect(restoreCutAllowanceDimensions({
      pieceWidthMm: 100,
      pieceLengthMm: 200,
      sourcePieceWidthMm: 100,
      sourcePieceLengthMm: 200,
      cutAllowanceMm: 0,
    }).cutAllowanceMm).toBe(0);
    expect(restoreCutAllowanceDimensions({ pieceWidthMm: 100, pieceLengthMm: 200 })).toEqual({
      sourcePieceWidthMm: 100,
      sourcePieceLengthMm: 200,
      cutAllowanceMm: 0,
    });
  });

  it('summarizes equal and mixed piece allowances', () => {
    expect(summarizeCutAllowances(['50', '50'])).toEqual({ kind: 'uniform', valueMm: 50 });
    expect(summarizeCutAllowances(['0', '50'])).toEqual({ kind: 'mixed' });
  });

  it.each([
    ['0', '0'],
    ['50', '50'],
  ])('inherits the current overall allowance %s when a new piece is created', (overallAllowance, expected) => {
    const form = { pieceWidth: '100', cutAllowance: '25' };

    expect(inheritCutAllowance(form, overallAllowance)).toEqual({
      pieceWidth: '100',
      cutAllowance: expected,
    });
    expect(form.cutAllowance).toBe('25');
  });
});
