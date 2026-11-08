import { describe, expect, it } from 'vitest';
import { sanitizeReturnTo } from './returnTo';

describe('sanitizeReturnTo', () => {
  it('keeps in-app paths with their query string', () => {
    expect(sanitizeReturnTo('/planning')).toBe('/planning');
    expect(sanitizeReturnTo('/estimate?cmProjectId=p1')).toBe('/estimate?cmProjectId=p1');
    expect(sanitizeReturnTo(['/projects', '/input'])).toBe('/projects');
  });

  it('rejects external, malformed and loop-causing targets', () => {
    for (const value of ['//evil.example', 'https://evil.example', '/\\evil', 'planning', '/', '/login', '/login?returnTo=/x', '/api/auth/login', undefined, null, 3]) {
      expect(sanitizeReturnTo(value)).toBeNull();
    }
    expect(sanitizeReturnTo(`/${'a'.repeat(3000)}`)).toBeNull();
  });
});
