import { describe, expect, it } from 'vitest';
import { createDirectEstimateJob, parseDirectEstimateInput } from './directEstimate';

describe('createDirectEstimateJob', () => {
  it('calculates a continuous-roll result without a saved project', () => {
    const job = createDirectEstimateJob({ pieceWidthMm: 500, pieceLengthMm: 1_000, quantity: 10 });

    expect(job.input.rollWidthMm).toBe(1_220);
    expect(job.input.gapMm).toBe(0);
    expect(job.input.sideMarginMm).toBe(5);
    expect(job.result.producedQuantity).toBeGreaterThanOrEqual(10);
    expect(job.result.newRollLengthMm).toBeGreaterThan(0);
  });

  it('rejects incomplete dimensions', () => {
    expect(() => createDirectEstimateJob({ pieceWidthMm: 0, pieceLengthMm: 1_000, quantity: 1 })).toThrow();
  });

  it('restores only valid recent cutting inputs', () => {
    expect(parseDirectEstimateInput('{"pieceWidthMm":500,"pieceLengthMm":1000,"quantity":2}')).toEqual({ pieceWidthMm: 500, pieceLengthMm: 1000, quantity: 2 });
    expect(parseDirectEstimateInput('{"pieceWidthMm":0,"pieceLengthMm":1000,"quantity":2}')).toBeNull();
  });
});
