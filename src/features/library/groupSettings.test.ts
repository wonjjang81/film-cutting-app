import { describe, expect, it } from 'vitest';

import { applyPatternFixed } from './groupSettings';

describe('applyPatternFixed', () => {
  it('disables rotation for every piece in a fixed-pattern group', () => {
    const pieces = [{ id: 'A_01', form: { allowRotation: true } }, { id: 'A_02', form: { allowRotation: true } }];

    expect(applyPatternFixed(pieces, true).map((piece) => piece.form.allowRotation)).toEqual([false, false]);
  });

  it('restores rotation when the group setting is turned off', () => {
    const pieces = [{ id: 'A_01', form: { allowRotation: false } }];

    expect(applyPatternFixed(pieces, false)[0]?.form.allowRotation).toBe(true);
  });
});
