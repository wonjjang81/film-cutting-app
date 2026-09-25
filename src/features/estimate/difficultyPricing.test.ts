import { describe, expect, it } from 'vitest';
import { DEFAULT_DIFFICULTY, DIFFICULTY_PRICING, constructionRateForDifficulty, normalizeDifficulty } from './difficultyPricing';

describe('difficulty pricing', () => {
  it('provides the configured unit rate for each difficulty', () => {
    expect(DEFAULT_DIFFICULTY).toBe('medium');
    expect(DIFFICULTY_PRICING).toMatchObject({
      low: { label: '하', min: 15_000, max: 15_000, defaultRate: 15_000 },
      medium: { label: '중', min: 25_000, max: 25_000, defaultRate: 25_000 },
      high: { label: '상', min: 35_000, max: 35_000, defaultRate: 35_000 },
    });
  });

  it('normalizes missing or invalid persisted values to normal difficulty', () => {
    expect(normalizeDifficulty(undefined)).toBe('medium');
    expect(normalizeDifficulty('hard')).toBe('medium');
    expect(normalizeDifficulty('high')).toBe('high');
  });

  it('returns the default construction rate for each difficulty', () => {
    expect(constructionRateForDifficulty('low')).toBe(15_000);
    expect(constructionRateForDifficulty('medium')).toBe(25_000);
    expect(constructionRateForDifficulty('high')).toBe(35_000);
  });
});
