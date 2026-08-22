import { describe, expect, it } from 'vitest';

import { optimizeContinuousRollLayout } from './optimizeContinuousRollLayout';
import { createLayoutSvgMarkup } from './createLayoutSvgMarkup';

const result = optimizeContinuousRollLayout({
  rollWidthMm: 100,
  pieceWidthMm: 60,
  pieceLengthMm: 40,
  quantity: 2,
  gapMm: 0,
  sideMarginMm: 0,
  startEndMarginMm: 0,
  allowRotation: true,
});

describe('createLayoutSvgMarkup', () => {
  it('returns deterministic trusted SVG and escapes every string insertion', () => {
    const hostile = {
      ...result,
      rowSequence: result.rowSequence.map((row, index) => index === 0 ? { ...row, pattern: '<row> & "quoted"' } : row),
    };
    const options = {
      result: hostile,
      rollWidthMm: 100,
      displayLengthMm: hostile.usedLengthMm,
      sideMarginMm: 0,
      startEndMarginMm: 0,
      ariaLabel: 'A" onload="alert(1) <layout>',
    };

    const first = createLayoutSvgMarkup(options);

    expect(first).toBe(createLayoutSvgMarkup(options));
    expect(first).toMatch(/^<svg\b/);
    expect(first).toContain('aria-label="A&quot; onload=&quot;alert(1) &lt;layout&gt;"');
    expect(first).toContain('&lt;row&gt; &amp; &quot;quoted&quot;');
    expect(first).toContain('기본 방향');
    expect(first).not.toContain('<row>');
    expect(first).not.toContain('<script');
  });

  it('returns no markup for non-finite or non-positive renderer dimensions', () => {
    expect(createLayoutSvgMarkup({ result, rollWidthMm: 0, displayLengthMm: 40 })).toBe('');
    expect(createLayoutSvgMarkup({ result, rollWidthMm: 100, displayLengthMm: Number.NaN })).toBe('');
  });
});
