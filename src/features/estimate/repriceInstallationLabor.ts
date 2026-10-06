import type { SavedCuttingJob } from '../library/models';
import type { Estimate } from './calculateEstimate';
import type { EstimateRateSummary } from './calculateProjectEstimate';
import { allocateLaborCost, calculateInstallationLabor, installationSubgroupKey, resolveInstallationPart, type InstallationLaborCalculation, type InstallationMode } from './installationLabor';

type Source = { job: SavedCuttingJob; estimate: Estimate; rates: EstimateRateSummary };
export type InstallationLaborLine = {
  id: string; groupId: string; subgroupName: string; part?: string;
  lengthM: number; constructionCost: number; calculation?: InstallationLaborCalculation;
  minimumSupplement?: number;
};

/** Reprices newly-created estimate objects only; never alters saved jobs, placements or quantities. */
export function repriceInstallationLabor(sources: Source[], mode: InstallationMode, overrides: Record<string, string | undefined> = {}): InstallationLaborLine[] {
  const groups = new Map<string, Source[]>();
  for (const source of sources) {
    const key = installationSubgroupKey(source.job);
    groups.set(key, [...(groups.get(key) ?? []), source]);
  }
  const lines = [...groups.entries()].map(([id, items]): InstallationLaborLine => {
    const job = items[0]!.job;
    const part = resolveInstallationPart(job, overrides);
    const lengthM = items.reduce((total, item) => total + item.estimate.materialLengthM, 0);
    const calculation = part ? calculateInstallationLabor(part, lengthM, mode, job.constructionCostPerM) : undefined;
    if (calculation) {
      // Allocate integer KRW with largest remainders so every subgroup/roll total reconciles.
      const costs = allocateLaborCost(calculation.constructionCost, items.map((item) => item.estimate.materialLengthM));
      items.forEach((item, index) => {
        item.rates = { ...item.rates, constructionCostPerM: calculation.costPerM, installationPart: part };
        item.estimate.constructionCost = costs[index]!;
        item.estimate.subtotal = item.estimate.materialCost + costs[index]!;
        item.estimate.total = item.estimate.subtotal;
      });
    }
    return { id, groupId: job.groupId?.trim() || job.name.split(' · ')[0]?.trim() || '미분류', subgroupName: job.subgroupName?.trim() || '미분류', part, lengthM,
      constructionCost: items.reduce((sum, item) => sum + item.estimate.constructionCost, 0), ...(calculation ? { calculation } : {}) };
  });
  const baseTotal = sources.reduce((sum, item) => sum + item.estimate.constructionCost, 0);
  if (mode === 'standalone' && lines.some((line) => line.lengthM > 0) && baseTotal < 125_000) {
    const weights = sources.map((item) => baseTotal > 0 ? item.estimate.constructionCost : item.estimate.materialLengthM);
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
