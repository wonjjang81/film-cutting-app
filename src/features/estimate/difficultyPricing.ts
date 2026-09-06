export type ConstructionDifficulty = 'low' | 'medium' | 'high';

export const DEFAULT_DIFFICULTY: ConstructionDifficulty = 'medium';

export const DIFFICULTY_PRICING: Record<ConstructionDifficulty, {
  label: string;
  min: number;
  max: number;
  defaultRate: number;
}> = {
  low: { label: '하', min: 25_000, max: 35_000, defaultRate: 30_000 },
  medium: { label: '중', min: 35_000, max: 60_000, defaultRate: 47_500 },
  high: { label: '상', min: 70_000, max: 130_000, defaultRate: 100_000 },
};

export function normalizeDifficulty(value: unknown): ConstructionDifficulty {
  return value === 'low' || value === 'high' || value === 'medium' ? value : DEFAULT_DIFFICULTY;
}

export function constructionRateForDifficulty(value: unknown): number {
  return DIFFICULTY_PRICING[normalizeDifficulty(value)].defaultRate;
}
