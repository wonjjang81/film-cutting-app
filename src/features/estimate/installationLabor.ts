import type { SavedCuttingJob } from '../library/models';

export const LABOR_COST_PER_UNIT = 250_000;
export type InstallationMode = 'whole' | 'standalone';
export const INSTALLATION_LABOR_REFERENCES = [
  { name: '책장', lengthM: 5, minUnits: 0.5, maxUnits: 0.6 },
  { name: '화장대', lengthM: 3.13, minUnits: 0.25, maxUnits: 0.3 },
  { name: '샷시 (내부)', lengthM: 10, minUnits: 0.6, maxUnits: 0.7 },
  { name: '화장실문/문틀', lengthM: 11.41, minUnits: 0.65, maxUnits: 0.75 },
  { name: '싱크대 하부장', lengthM: 3.41, minUnits: 0.2, maxUnits: 0.25 },
  { name: '냉장고장', lengthM: 13.31, minUnits: 0.7, maxUnits: 0.8 },
  { name: '신발장', lengthM: 6.27, minUnits: 0.3, maxUnits: 0.35 },
  { name: '방문/문틀', lengthM: 12.17, minUnits: 0.5, maxUnits: 0.6 },
  { name: '싱크대 상부장', lengthM: 2.98, minUnits: 0.15, maxUnits: 0.15 },
  { name: '아일랜드식탁', lengthM: 2.98, minUnits: 0.15, maxUnits: 0.15 },
  // The reference says 'within 0.2', not a range with a stated lower bound.
  { name: '붙박이장', lengthM: 4.49, minUnits: 0.2, maxUnits: 0.2 },
  { name: '드레스룸', lengthM: 1.67, minUnits: 0.1, maxUnits: 0.15 },
] as const;

export function installationSubgroupKey(job: SavedCuttingJob): string {
  return `${job.groupId?.trim() || job.name.split(' · ')[0]?.trim() || '미분류'}::${job.subgroupName?.trim() || '미분류'}`;
}

export function resolveInstallationPart(job: SavedCuttingJob, overrides: Readonly<Record<string, string | undefined>> = {}): string | undefined {
  const override = overrides[installationSubgroupKey(job)];
  if (override !== undefined) return override || undefined;
  if (job.installationPart?.trim()) return job.installationPart.trim();
  return INSTALLATION_LABOR_REFERENCES.find((part) => part.name === job.subgroupName?.trim())?.name;
}

export type InstallationLaborCalculation = {
  part: string;
  lengthM: number;
  reference?: string;
  unitsPerM: number;
  allocatedUnits: number;
  billedUnits: number;
  costPerM: number;
  constructionCost: number;
  minimumApplied: boolean;
  unavailable: boolean;
  formula: string;
};

const format = (number: number) => number.toLocaleString('ko-KR', { maximumFractionDigits: 6 });

/** Average reference units scale by length. The solo minimum is applied separately to the project sum. */
export function calculateInstallationLabor(part: string, lengthM: number, mode: InstallationMode, customRate?: number): InstallationLaborCalculation | undefined {
  const reference = INSTALLATION_LABOR_REFERENCES.find((item) => item.name === part);
  const length = Number.isFinite(lengthM) ? Math.max(0, lengthM) : 0;
  const averageUnits = reference ? (reference.minUnits + reference.maxUnits) / 2 : undefined;
  const unitsPerM = reference ? averageUnits! / reference.lengthM
    : customRate !== undefined && Number.isFinite(customRate) && customRate >= 0 ? customRate / LABOR_COST_PER_UNIT : undefined;
  if (unitsPerM === undefined) return undefined;
  const allocatedUnits = length * unitsPerM;
  const billedUnits = allocatedUnits;
  const minimumApplied = false;
  const unitFormula = reference ? `${format(length)}m × 평균 ${format(averageUnits!)}품 ÷ 기준 ${format(reference.lengthM)}m` : `${format(length)}m × ${format(unitsPerM)}품/m`;
  return {
    part, lengthM: length, unitsPerM, allocatedUnits, billedUnits,
    ...(reference ? { reference: `${reference.lengthM}m당 ${reference.minUnits === reference.maxUnits ? format(reference.maxUnits) : `${reference.minUnits}~${reference.maxUnits}`}품 → 평균 ${format(averageUnits!)}품` } : {}),
    costPerM: unitsPerM * LABOR_COST_PER_UNIT,
    constructionCost: Math.floor(billedUnits * LABOR_COST_PER_UNIT + 1e-7),
    minimumApplied, unavailable: mode === 'standalone' && part === '드레스룸' && length > 0,
    formula: `${unitFormula} = ${format(allocatedUnits)}품; ${minimumApplied ? '최소 0.5품 적용; ' : ''}${format(billedUnits)}품 × 250,000원`,
  };
}

/** Exact integer allocation avoids charging the project minimum once per piece or roll. */
export function allocateLaborCost(total: number, weights: readonly number[]): number[] {
  const sum = weights.reduce((value, weight) => value + Math.max(0, weight), 0);
  const shares = weights.map((weight) => sum > 0 ? total * Math.max(0, weight) / sum : total / Math.max(1, weights.length));
  const amounts = shares.map(Math.floor);
  let remainder = total - amounts.reduce((value, amount) => value + amount, 0);
  const order = shares.map((share, index) => ({ index, fraction: share - amounts[index]! })).sort((a, b) => b.fraction - a.fraction || a.index - b.index);
  for (const item of order) { if (remainder-- <= 0) break; amounts[item.index]! += 1; }
  return amounts;
}
