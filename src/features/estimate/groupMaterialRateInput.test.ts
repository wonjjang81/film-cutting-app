import { describe, expect, it } from 'vitest';

import { groupMaterialRatePlaceholder } from './groupMaterialRateInput';

describe('groupMaterialRatePlaceholder', () => {
  it('hides the fallback unit price while the group input is focused', () => {
    expect(groupMaterialRatePlaceholder(10_000, true)).toBe('');
  });

  it('shows the fallback unit price again when the input is not focused', () => {
    expect(groupMaterialRatePlaceholder(10_000, false)).toBe('10000');
  });
});
