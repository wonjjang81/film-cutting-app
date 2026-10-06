import type { ConstructionDifficulty } from './difficultyPricing';
import { constructionRateForDifficulty } from './difficultyPricing';
import type { SavedCuttingJob } from '../library/models';
import { allocateLaborCost, calculateInstallationLabor, installationSubgroupKey, resolveInstallationPart, type InstallationMode, type InstallationLaborCalculation } from './installationLabor';

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
  installationLabor?: InstallationLaborCalculation;
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
    constructionCostPerM?: number;
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
  const constructionCost = options.constructionCostPerM !== undefined && Number.isFinite(options.constructionCostPerM) && options.constructionCostPerM >= 0
    ? Math.floor(materialLengthM * options.constructionCostPerM)
    : Math.round(areaM2 * constructionCostPerM2);
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
    installationMode?: InstallationMode;
    installationPartsBySubgroupId?: Record<string, string | undefined>;
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
  const lines: SubgroupRoughEstimateLine[] = [...unique.entries()].map(([id, job]) => {
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
    const rough = calculateSubgroupRoughEstimate(dimensions, { siteCount, materialCostPerM, constructionCostPerM2, constructionCostPerM: !options.globalRateOverride && options.installationPartsBySubgroupId?.[installationSubgroupKey(job)] !== '' && job.installationPart ? job.constructionCostPerM : undefined, difficulty: job.difficulty });
    const part = resolveInstallationPart(job, options.installationPartsBySubgroupId);
    const installationLabor = !options.globalRateOverride && options.installationMode && part ? calculateInstallationLabor(part, rough.materialLengthM, options.installationMode, job.constructionCostPerM) : undefined;
    return {
      id,
      groupId,
      subgroupName,
      dimensions,
      siteCount,
      difficulty: job.difficulty,
      ...rough,
      ...(installationLabor ? { installationLabor, constructionCost: installationLabor.constructionCost, total: rough.materialCost + installationLabor.constructionCost } : {}),
    };
  });
  const totalLabor = lines.reduce((sum, line) => sum + line.constructionCost, 0);
  if (!options.globalRateOverride && options.installationMode === 'standalone' && lines.some((line) => line.materialLengthM > 0) && totalLabor < 125_000) {
    const extras = allocateLaborCost(125_000 - totalLabor, lines.map((line) => totalLabor > 0 ? line.constructionCost : line.materialLengthM));
    lines.forEach((line, index) => {
      line.constructionCost += extras[index]!;
      line.total += extras[index]!;
      if (line.installationLabor) line.installationLabor = { ...line.installationLabor, constructionCost: line.constructionCost, billedUnits: line.constructionCost / 250_000, minimumApplied: true,
        formula: `${line.installationLabor.formula}; 개산견적 합산 최소 0.5품 보정 배분 +${extras[index]!.toLocaleString('ko-KR')}원` };
    });
  }
  return lines;
}
