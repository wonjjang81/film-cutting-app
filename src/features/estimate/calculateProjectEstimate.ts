import type { SavedCuttingJob, SavedMergedCuttingJob } from '../library/models';
import { calculateEstimateAtRates, CONSTRUCTION_PRICE_MAX, CONSTRUCTION_PRICE_MIN, DEFAULT_CONSTRUCTION_COST_PER_M2, DEFAULT_MATERIAL_COST_PER_M, type Estimate } from './calculateEstimate';
import { constructionRateForDifficulty } from './difficultyPricing';

export type EstimateRateMode = 'group' | 'global';
export type EstimateRateSummary = { materialCostPerM: number; constructionCostPerM2: number; mixed?: boolean };
export type ProjectEstimateLine<TJob> = {
  job: TJob;
  estimate: Estimate;
  rates: EstimateRateSummary;
  sourceDetails?: { job: SavedCuttingJob; estimate: Estimate; rates: EstimateRateSummary }[];
};
export type ProjectEstimate = Estimate & {
  /** Number of pieces entered by the user, including quantities on merged sources. */
  inputPieceCount: number;
  /** Number of invoice lines (ordinary jobs plus merged rolls). */
  jobCount: number;
  jobs: ProjectEstimateLine<SavedCuttingJob>[];
  mergedJobs: ProjectEstimateLine<SavedMergedCuttingJob>[];
  constructionCostRange: { min: number; max: number };
  totalRange: { min: number; max: number };
};

type RateOptions = { rateMode?: EstimateRateMode };

function finiteRate(value: number | undefined, fallback: number): number {
  return Number.isFinite(value) && value !== undefined && value >= 0 ? value : fallback;
}

function ratesForJob(job: SavedCuttingJob, materialCostPerM: number, constructionCostPerM2: number, mode: EstimateRateMode): EstimateRateSummary {
  const hasDifficultyContext = job.difficulty !== undefined || job.subgroupName !== undefined;
  const effectiveConstructionCost = job.constructionCostPerM2 ?? (hasDifficultyContext ? constructionRateForDifficulty(job.difficulty) : constructionCostPerM2);
  return mode === 'global'
    ? { materialCostPerM, constructionCostPerM2 }
    : { materialCostPerM: finiteRate(job.materialCostPerM, materialCostPerM), constructionCostPerM2: finiteRate(effectiveConstructionCost, constructionCostPerM2) };
}

function sumEstimates(items: readonly Estimate[]): Estimate {
  const materialLengthM = items.reduce((sum, item) => sum + item.materialLengthM, 0);
  const materialAreaM2 = items.reduce((sum, item) => sum + item.materialAreaM2, 0);
  const materialCost = items.reduce((sum, item) => sum + item.materialCost, 0);
  const productAreaM2 = items.reduce((sum, item) => sum + item.productAreaM2, 0);
  const constructionCost = items.reduce((sum, item) => sum + item.constructionCost, 0);
  const subtotal = materialCost + constructionCost;
  return { materialLengthM, materialAreaM2, materialCost, productAreaM2, constructionCost, subtotal, discountRate: 0, discount: 0, total: subtotal };
}

function aggregateRates(items: readonly { estimate: Estimate; rates: EstimateRateSummary }[]): EstimateRateSummary {
  const estimate = sumEstimates(items.map((item) => item.estimate));
  const materialCostPerM = estimate.materialLengthM > 0 ? estimate.materialCost / estimate.materialLengthM : 0;
  const constructionCostPerM2 = estimate.materialAreaM2 > 0 ? estimate.constructionCost / estimate.materialAreaM2 : 0;
  const distinct = new Set(items.map((item) => `${item.rates.materialCostPerM}|${item.rates.constructionCostPerM2}`));
  return { materialCostPerM, constructionCostPerM2, ...(distinct.size > 1 ? { mixed: true } : {}) };
}

/** Sums saved jobs into one project invoice and applies the discount once to the total. */
export function calculateProjectEstimate(
  jobs: readonly SavedCuttingJob[],
  materialCostPerM = DEFAULT_MATERIAL_COST_PER_M,
  constructionCostPerM2 = DEFAULT_CONSTRUCTION_COST_PER_M2,
  discountRateOverride?: number,
  mergedJobs: readonly SavedMergedCuttingJob[] = [],
  options: RateOptions = {},
): ProjectEstimate {
  const rateMode = options.rateMode ?? 'group';
  const inputPieceCount = jobs.reduce((sum, job) => {
    const quantity = Number.isFinite(job.input.quantity) ? Math.max(0, Math.floor(job.input.quantity)) : 0;
    return sum + quantity;
  }, 0);
  const mergedSourceIds = new Set(mergedJobs.flatMap((mergedJob) => mergedJob.sourceJobIds));
  const details = jobs.filter((job) => !mergedSourceIds.has(job.id)).map((job) => {
    const rates = ratesForJob(job, materialCostPerM, constructionCostPerM2, rateMode);
    return { job, rates, estimate: calculateEstimateAtRates(job, rates.materialCostPerM, rates.constructionCostPerM2, 0) };
  });
  const mergedDetails = mergedJobs.flatMap((mergedJob) => {
    const sources = mergedJob.sourceJobIds.map((sourceId) => jobs.find((job) => job.id === sourceId)).filter((job): job is SavedCuttingJob => Boolean(job));
    if (sources.length === 0) return [];
    const requestedAreas = sources.map((job) => Math.max(0, job.input.pieceWidthMm * job.input.pieceLengthMm * job.input.quantity) / 1_000_000);
    const sourceIds = mergedJob.sourceIds ?? [];
    const placementAreas = sources.map((_, index) => {
      const sourceId = sourceIds[index];
      if (!sourceId) return 0;
      return mergedJob.placements.filter((placement) => placement.sourceId === sourceId).reduce((sum, placement) => sum + placement.width * placement.height, 0) / 1_000_000;
    });
    const allocationBasis = placementAreas.some((area) => area > 0) ? placementAreas : requestedAreas;
    const totalBasis = allocationBasis.reduce((sum, area) => sum + area, 0);
    const sourceDetails = sources.map((job, index) => {
      const share = totalBasis > 0 ? allocationBasis[index]! / totalBasis : 1 / sources.length;
      const rates = ratesForJob(job, materialCostPerM, constructionCostPerM2, rateMode);
      const estimate = calculateEstimateAtRates(job, rates.materialCostPerM, rates.constructionCostPerM2, 0, {
        materialLengthMm: mergedJob.usedLengthMm * share,
        materialWidthMm: mergedJob.rollWidthMm,
        productAreaM2: requestedAreas[index]!,
      });
      return { job, estimate, rates };
    });
    const estimate = sumEstimates(sourceDetails.map((item) => item.estimate));
    const rates = aggregateRates(sourceDetails);
    return [{ job: mergedJob, estimate, rates, sourceDetails }];
  });
  const allDetails = [...details, ...mergedDetails];
  const materialLengthM = allDetails.reduce((sum, item) => sum + item.estimate.materialLengthM, 0);
  const materialCost = allDetails.reduce((sum, item) => sum + item.estimate.materialCost, 0);
  const productAreaM2 = allDetails.reduce((sum, item) => sum + item.estimate.productAreaM2, 0);
  const materialAreaM2 = allDetails.reduce((sum, item) => sum + item.estimate.materialAreaM2, 0);
  const constructionCost = allDetails.reduce((sum, item) => sum + item.estimate.constructionCost, 0);
  const constructionCostRange = {
    min: Math.max(0, Math.round(materialAreaM2 * CONSTRUCTION_PRICE_MIN)),
    max: Math.max(0, Math.round(materialAreaM2 * CONSTRUCTION_PRICE_MAX)),
  };
  const subtotal = materialCost + constructionCost;
  const automaticDiscountRate = materialAreaM2 >= 10 ? 0.15 : materialAreaM2 >= 5 ? 0.1 : materialAreaM2 >= 1 ? 0.05 : 0;
  const discountRate = discountRateOverride === undefined ? automaticDiscountRate : Math.min(1, Math.max(0, discountRateOverride));
  const discount = Math.max(0, Math.round(subtotal * discountRate));
  const totalRange = {
    min: Math.max(0, Math.round((materialCost + constructionCostRange.min) * (1 - discountRate))),
    max: Math.max(0, Math.round((materialCost + constructionCostRange.max) * (1 - discountRate))),
  };
  return { inputPieceCount, materialLengthM, materialAreaM2, materialCost, productAreaM2, constructionCost, subtotal, discountRate, discount, total: subtotal - discount, jobCount: allDetails.length, jobs: details, mergedJobs: mergedDetails, constructionCostRange, totalRange };
}
