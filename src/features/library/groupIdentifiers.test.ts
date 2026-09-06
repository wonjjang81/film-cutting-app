import { describe, expect, it } from 'vitest';
import { normalizeGroupDisplayId, validateGroupDisplayId } from './groupIdentifiers';

describe('group display identifiers', () => {
  it('defaults a missing display id to the next numeric id', () => {
    expect(normalizeGroupDisplayId('', 3)).toBe('3');
    expect(normalizeGroupDisplayId(' 12 ', 3)).toBe('12');
  });

  it('accepts numeric ids and rejects duplicates or non-numeric values', () => {
    expect(validateGroupDisplayId('2', ['1', '3'])).toBeNull();
    expect(validateGroupDisplayId('2', ['1', '2', '3'])).toBe('대그룹 ID가 이미 사용 중입니다.');
    expect(validateGroupDisplayId('A', ['1', '2'])).toBe('대그룹 ID는 숫자로 입력해 주세요.');
  });
});
