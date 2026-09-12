import type { ConstructionDifficulty } from './difficultyPricing';
import { constructionRateForDifficulty } from './difficultyPricing';
import type { SavedCuttingJob } from '../library/models';

export type SubgroupOverallDimensions = {
  widthMm: number;
  heightMm: number;
  depthMm: number;
  doorCount: number;
};

export type SubgroupRoughEstimate = {
  areaM2: number;
  materialLengthM: number;
  materialCost: number;
  constructionCost: number;
  total: number;
};

export type SubgroupRoughEstimateLine = SubgroupRoughEstimate & {
  id: string;
  groupId: string;
  subgroupName: string;
  dimensions: SubgroupOverallDimensions;
  siteCount: number;
  difficulty?: ConstructionDifficulty;
};

function nonnegative(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
}

/** Normalizes editable subgroup fields into storage-safe dimensions. */
export function normalizeSubgroupOverallDimensions(value: Partial<SubgroupOverallDimensions> | undefined): SubgroupOverallDimensions {
  return {
    widthMm: nonnegative(value?.widthMm),
    heightMm: nonnegative(value?.heightMm),
    depthMm: nonnegative(value?.depthMm),
    doorCount: Math.max(0, Math.floor(nonnegative(value?.doorCount))),
  };
}

export function hasSubgroupOverallDimensions(value: Partial<SubgroupOverallDimensions> | undefined): boolean {
  const dimensions = normalizeSubgroupOverallDimensions(value);
  return dimensions.widthMm > 0 && dimensions.heightMm > 0;
}

/**
 * Produces a non-binding take-off from the exposed front, two sides, top and
 * bottom of one subgroup. Door count is descriptive because the entered width
 * already represents the subgroup's total width. Site count multiplies area.
 */
export function calculateSubgroupRoughEstimate(
  value: Partial<SubgroupOverallDimensions> | undefined,
  options: {
    siteCount?: number;
    rollWidthMm?: number;
    materialCostPerM?: number;
    constructionCostPerM2?: number;
    difficulty?: ConstructionDifficulty;
  } = {},
): SubgroupRoughEstimate {
  const dimensions = normalizeSubgroupOverallDimensions(value);
  const siteCount = Math.max(1, Math.floor(nonnegative(options.siteCount) || 1));
  const rollWidthMm = nonnegative(options.rollWidthMm) || 1_220;
  const materialCostPerM = nonnegative(options.materialCostPerM);
  const constructionCostPerM2 = options.constructionCostPerM2 === undefined
    ? constructionRateForDifficulty(options.difficulty)
    : nonnegative(options.constructionCostPerM2);
  const exposedAreaMm2 = dimensions.widthMm * dimensions.heightMm
    + 2 * dimensions.depthMm * dimensions.heightMm
    + 2 * dimensions.widthMm * dimensions.depthMm;
  const areaM2 = exposedAreaMm2 * siteCount / 1_000_000;
  const materialLengthM = exposedAreaMm2 * siteCount / rollWidthMm / 1_000;
  const materialCost = Math.round(materialLengthM * materialCostPerM);
  const constructionCost = Math.round(areaM2 * constructionCostPerM2);
  return { areaM2, materialLengthM, materialCost, constructionCost, total: materialCost + constructionCost };
}

/** Deduplicates repeated piece jobs into one rough-estimate line per subgroup. */
export function buildSubgroupRoughEstimateLines(
  jobs: readonly SavedCuttingJob[],
  options: {
    materialCostPerM: number;
    constructionCostPerM2: number;
    materialRatesByGroupId?: Record<string, number | undefined>;
    globalRateOverride?: boolean;
  },
): SubgroupRoughEstimateLine[] {
  const unique = new Map<string, SavedCuttingJob>();
  for (const job of jobs) {
    if (!hasSubgroupOverallDimensions(job.subgroupOverallDimensions)) continue;
    const groupId = job.groupId?.trim() || job.name.split(' · ')[0]?.trim() || '미분류';
    const subgroupName = job.subgroupName?.trim() || '미분류';
    const key = `${groupId}::${subgroupName}`;
    if (!unique.has(key)) unique.set(key, job);
  }
  return [...unique.entries()].map(([id, job]) => {
    const groupId = job.groupId?.trim() || job.name.split(' · ')[0]?.trim() || '미분류';
    const subgroupName = job.subgroupName?.trim() || '미분류';
    const dimensions = normalizeSubgroupOverallDimensions(job.subgroupOverallDimensions);
    const siteCount = Math.max(1, Math.floor(job.siteCount ?? 1));
    const materialCostPerM = options.globalRateOverride
      ? options.materialCostPerM
      : options.materialRatesByGroupId?.[groupId] ?? job.materialCostPerM ?? options.materialCostPerM;
    const constructionCostPerM2 = options.globalRateOverride
      ? options.constructionCostPerM2
      : job.constructionCostPerM2;
    return {
      id,
      groupId,
      subgroupName,
      dimensions,
      siteCount,
      difficulty: job.difficulty,
      ...calculateSubgroupRoughEstimate(dimensions, { siteCount, materialCostPerM, constructionCostPerM2, difficulty: job.difficulty }),
    };
  });
}
