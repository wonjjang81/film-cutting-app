import { describe, expect, it } from 'vitest';

import { parseAutoSaveHistory } from './autoSaveHistory';

describe('parseAutoSaveHistory', () => {
  it('defaults to off when no setting exists', () => {
    expect(parseAutoSaveHistory(null)).toBe(false);
  });

  it('enables only the explicit true setting', () => {
    expect(parseAutoSaveHistory('true')).toBe(true);
    expect(parseAutoSaveHistory('false')).toBe(false);
    expect(parseAutoSaveHistory('1')).toBe(false);
  });
});
