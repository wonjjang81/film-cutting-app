import { describe, expect, it } from 'vitest';
import { DEFAULT_DIFFICULTY, DIFFICULTY_PRICING, constructionRateForDifficulty, normalizeDifficulty } from './difficultyPricing';

describe('difficulty pricing', () => {
  it('provides the reference-table labels, ranges, and midpoint rates', () => {
    expect(DEFAULT_DIFFICULTY).toBe('medium');
    expect(DIFFICULTY_PRICING).toMatchObject({
      low: { label: '하', min: 25_000, max: 35_000, defaultRate: 30_000 },
      medium: { label: '중', min: 35_000, max: 60_000, defaultRate: 47_500 },
      high: { label: '상', min: 70_000, max: 130_000, defaultRate: 100_000 },
    });
  });

  it('normalizes missing or invalid persisted values to normal difficulty', () => {
    expect(normalizeDifficulty(undefined)).toBe('medium');
    expect(normalizeDifficulty('hard')).toBe('medium');
    expect(normalizeDifficulty('high')).toBe('high');
  });

  it('returns the default construction rate for each difficulty', () => {
    expect(constructionRateForDifficulty('low')).toBe(30_000);
    expect(constructionRateForDifficulty('medium')).toBe(47_500);
    expect(constructionRateForDifficulty('high')).toBe(100_000);
  });
});
