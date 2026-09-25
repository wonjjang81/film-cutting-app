export type ConstructionDifficulty = 'low' | 'medium' | 'high';

export const DEFAULT_DIFFICULTY: ConstructionDifficulty = 'medium';

export const DIFFICULTY_PRICING: Record<ConstructionDifficulty, {
  label: string;
  min: number;
  max: number;
  defaultRate: number;
}> = {
  low: { label: '하', min: 15_000, max: 15_000, defaultRate: 15_000 },
  medium: { label: '중', min: 25_000, max: 25_000, defaultRate: 25_000 },
  high: { label: '상', min: 35_000, max: 35_000, defaultRate: 35_000 },
};

export function normalizeDifficulty(value: unknown): ConstructionDifficulty {
  return value === 'low' || value === 'high' || value === 'medium' ? value : DEFAULT_DIFFICULTY;
}

export function constructionRateForDifficulty(value: unknown): number {
  return DIFFICULTY_PRICING[normalizeDifficulty(value)].defaultRate;
}
