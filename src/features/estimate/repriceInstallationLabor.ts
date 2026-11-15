import type { SavedCuttingJob } from '../library/models';
import { netInstallationAreaM2, type Estimate } from './calculateEstimate';
import { estimateInstallationWorkload, referencePreparationCost, WORK_MINUTES_PER_UNIT, type InstallationWorkload } from './installationWorkload';
import type { EstimateRateSummary } from './calculateProjectEstimate';
import { LABOR_COST_PER_UNIT, allocateLaborCost, calculateConfiguredInstallationLabor, installationSubgroupKey, resolveInstallationPart, type InstallationLaborCalculation, type InstallationMode } from './installationLabor';

import type { InstallationPartRate } from './installationPartPricing';

import { referenceAreaLength, referenceParts, referenceWork, recessedCeilingRatePerM2, preparationRates, shapeFactors } from './referenceEstimate';

type Source = { job: SavedCuttingJob; estimate: Estimate; rates: EstimateRateSummary };
export type InstallationLaborLine = {
  id: string; groupId: string; subgroupName: string; part?: string;
  lengthM: number; constructionCost: number; calculation?: InstallationLaborCalculation;
  minimumSupplement?: number;
  installationAreaM2: number;
  totalSubgroupWidthM?: number;
  workloadMinutes?: number;
  referenceMaterialM?: number;
  preparationCost?: number;
  preparationRate?: number;
};

/** Reprices newly-created estimate objects only; never alters saved jobs, placements or quantities. */
export function repriceInstallationLabor(sources: Source[], mode: InstallationMode, overrides: Record<string, string | undefined> = {}, parts?: readonly InstallationPartRate[], workloads?: Record<string, InstallationWorkload>, installationLength?: (job: SavedCuttingJob) => number): InstallationLaborLine[] {
  const groups = new Map<string, Source[]>();
  for (const source of sources) {
    const key = installationSubgroupKey(source.job);
    groups.set(key, [...(groups.get(key) ?? []), source]);
  }
  const lines = [...groups.entries()].map(([id, items]): InstallationLaborLine => {
    const job = items[0]!.job;
    const part = resolveInstallationPart(job, overrides, parts);
    const lengths = items.map(item => installationLength?.(item.job) ?? item.estimate.materialLengthM);
    const lengthM = lengths.reduce((total, length) => total + length, 0);
    const areas = items.map((item) => netInstallationAreaM2(item.job));
    const installationAreaM2 = areas.reduce((sum, area) => sum + area, 0);
    const widthMm = job.subgroupOverallDimensions?.widthMm;
    const totalSubgroupWidthM = widthMm && widthMm > 0 ? widthMm / 1000 * (job.siteCount ?? 1) : undefined;
    const input = workloads?.[id];
    const preparationCost = input ? referencePreparationCost(input, installationAreaM2) : 0;
    const preparationRate = input?.enabled && input.prepUnits?.trim() ? undefined : preparationRates[input?.preparationDifficulty ?? '없음'];
    const factor = input?.shape ? shapeFactors[input.shape] : 1;
    const referenceWorkload = input?.enabled && preparationCost !== undefined ? estimateInstallationWorkload(installationAreaM2, input) : undefined;
    const savedRate = job.installationPart?.trim() === part ? job.constructionCostPerM : undefined;
    const standardMiddleDoor = !input?.enabled && installationLength && part === '중문' && savedRate === undefined
      ? referenceWork('middleDoor', job.siteCount ?? 1).units * factor : undefined;
    const work = referenceWorkload ?? (standardMiddleDoor !== undefined ? {
      minutes: standardMiddleDoor * WORK_MINUTES_PER_UNIT, cost: Math.round(standardMiddleDoor * LABOR_COST_PER_UNIT), referenceMaterialM: undefined,
    } : undefined);
    const effectivePart = referenceWorkload && input?.referencePart ? referenceParts[input.referencePart] : standardMiddleDoor !== undefined ? referenceParts.middleDoor : part;
    const recessedRate = installationLength && part === '우물' && savedRate === undefined ? recessedCeilingRatePerM2 : undefined;
    const baseCalculation = !work && part && recessedRate === undefined ? calculateConfiguredInstallationLabor(job, part, lengthM, mode, parts) : undefined;
    const calculation = baseCalculation && factor !== 1 ? {
      ...baseCalculation, costPerM: baseCalculation.costPerM * factor, unitsPerM: baseCalculation.unitsPerM * factor,
      allocatedUnits: baseCalculation.allocatedUnits * factor, billedUnits: baseCalculation.billedUnits * factor,
      constructionCost: Math.floor(baseCalculation.allocatedUnits * factor * LABOR_COST_PER_UNIT + 1e-7),
      formula: baseCalculation.formula + ' × 형태 ' + factor,
    } : baseCalculation;
    if (work || calculation) {
      // Allocate integer KRW with largest remainders so every subgroup/roll total reconciles.
      const costs = allocateLaborCost(work?.cost ?? calculation!.constructionCost, work ? areas : lengths);
      items.forEach((item, index) => {
        item.rates = work
          ? { ...item.rates, constructionCostPerM: undefined, workloadPriced: true, installationPart: effectivePart }
          : { ...item.rates, constructionCostPerM: calculation!.costPerM, installationPart: part };
        item.estimate.constructionCost = costs[index]!;
        item.estimate.subtotal = item.estimate.materialCost + costs[index]!;
        item.estimate.total = item.estimate.subtotal;
      });
    }
    if (!work && !calculation && (factor !== 1 || recessedRate !== undefined)) {
      items.forEach((item, index) => {
        item.rates = { ...item.rates, constructionCostPerM: undefined, constructionCostPerM2: Math.round((recessedRate ?? item.rates.constructionCostPerM2) * factor), difficultyFactor: factor, ...(recessedRate === undefined ? {} : { fixedAreaLabor: true }) };
        item.estimate.constructionCost = recessedRate === undefined
          ? Math.round(item.estimate.constructionCost * factor)
          : Math.round(areas[index]! * recessedRate * factor);
        item.estimate.subtotal = item.estimate.materialCost + item.estimate.constructionCost;
        item.estimate.total = item.estimate.subtotal;
      });
    }
    return { id, groupId: job.groupId?.trim() || job.name.split(' · ')[0]?.trim() || '미분류', subgroupName: job.subgroupName?.trim() || '미분류', part: effectivePart, lengthM, installationAreaM2, totalSubgroupWidthM, workloadMinutes: work?.minutes, referenceMaterialM: work && 'referenceMaterialM' in work ? work.referenceMaterialM : input?.enabled && input.pattern ? referenceAreaLength(installationAreaM2, input.pattern) : undefined, preparationCost, preparationRate,
      constructionCost: items.reduce((sum, item) => sum + item.estimate.constructionCost, 0), ...(calculation ? { calculation } : {}) };
  });
  const baseTotal = sources.reduce((sum, item) => sum + item.estimate.constructionCost, 0);
  if (mode === 'standalone' && lines.some((line) => (line.workloadMinutes ?? line.lengthM) > 0) && baseTotal < 125_000) {
    const weights = sources.map((item) => baseTotal > 0 ? item.estimate.constructionCost : netInstallationAreaM2(item.job));
    const supplements = allocateLaborCost(125_000 - baseTotal, weights);
    sources.forEach((item, index) => {
      const extra = supplements[index]!;
      item.estimate.constructionCost += extra;
      item.estimate.subtotal += extra;
      item.estimate.total = item.estimate.subtotal;
      const line = lines.find((candidate) => candidate.id === installationSubgroupKey(item.job))!;
      line.constructionCost += extra;
      line.minimumSupplement = (line.minimumSupplement ?? 0) + extra;
    });
    lines.forEach((line) => {
      if (line.calculation) line.calculation = { ...line.calculation,
        billedUnits: line.constructionCost / 250_000, minimumApplied: true,
        constructionCost: line.constructionCost,
        formula: `${line.calculation.formula}; 전체 합산 최소 0.5품 보정 배분 +${(line.minimumSupplement ?? 0).toLocaleString('ko-KR')}원`,
      };
    });
  }
  return lines;
}
