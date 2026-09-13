import { describe, expect, it } from 'vitest';

import { parseCurrentProjectContext, serializeCurrentProjectContext } from './currentProjectContext';

describe('currentProjectContext', () => {
  it('round-trips a trimmed current project identity', () => {
    expect(parseCurrentProjectContext(serializeCurrentProjectContext({ id: ' project-1 ', name: ' 현장 A ' }))).toEqual({ id: 'project-1', name: '현장 A' });
  });

  it('rejects missing and malformed project identities', () => {
    expect(parseCurrentProjectContext(null)).toBeNull();
    expect(parseCurrentProjectContext('{')).toBeNull();
    expect(parseCurrentProjectContext('{"id":"","name":"현장"}')).toBeNull();
  });
});
