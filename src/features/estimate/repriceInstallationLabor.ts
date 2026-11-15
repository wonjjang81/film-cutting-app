import type { SavedCuttingJob } from '../library/models';
import { netInstallationAreaM2, type Estimate } from './calculateEstimate';
import { estimateInstallationWorkload, referencePreparationCost, type InstallationWorkload } from './installationWorkload';
import type { EstimateRateSummary } from './calculateProjectEstimate';
import { LABOR_COST_PER_UNIT, allocateLaborCost, calculateConfiguredInstallationLabor, installationSubgroupKey, resolveInstallationPart, type InstallationLaborCalculation, type InstallationMode } from './installationLabor';

import type { InstallationPartRate } from './installationPartPricing';

import { referenceAreaLength, referenceParts, shapeFactors } from './referenceEstimate';

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
    const preparationCost = input?.enabled ? referencePreparationCost(input) : undefined;
    const work = input?.enabled && preparationCost !== undefined ? estimateInstallationWorkload(installationAreaM2, input) : undefined;
    const effectivePart = work && input?.referencePart ? referenceParts[input.referencePart] : part;
    const factor = input?.shape ? shapeFactors[input.shape] : 1;
    const baseCalculation = !work && part ? calculateConfiguredInstallationLabor(job, part, lengthM, mode, parts) : undefined;
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
    if (!work && !calculation && factor !== 1) {
      items.forEach(item => {
        item.rates = { ...item.rates, constructionCostPerM2: Math.round(item.rates.constructionCostPerM2 * factor), difficultyFactor: factor };
        item.estimate.constructionCost = Math.round(item.estimate.constructionCost * factor);
        item.estimate.subtotal = item.estimate.materialCost + item.estimate.constructionCost;
        item.estimate.total = item.estimate.subtotal;
      });
    }
    return { id, groupId: job.groupId?.trim() || job.name.split(' · ')[0]?.trim() || '미분류', subgroupName: job.subgroupName?.trim() || '미분류', part: effectivePart, lengthM, installationAreaM2, totalSubgroupWidthM, workloadMinutes: work?.minutes, referenceMaterialM: work && 'referenceMaterialM' in work ? work.referenceMaterialM : input?.enabled && input.pattern ? referenceAreaLength(installationAreaM2, input.pattern) : undefined, preparationCost: work ? preparationCost : undefined,
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
