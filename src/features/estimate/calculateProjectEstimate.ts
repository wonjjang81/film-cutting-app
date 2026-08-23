import type { SavedCuttingJob, SavedMergedCuttingJob } from '../library/models';
import { calculateEstimate, CONSTRUCTION_PRICE_MAX, CONSTRUCTION_PRICE_MIN, DEFAULT_CONSTRUCTION_COST_PER_M2, DEFAULT_MATERIAL_COST_PER_M, type Estimate } from './calculateEstimate';

export type ProjectEstimate = Estimate & { jobCount: number; jobs: { job: SavedCuttingJob; estimate: Estimate }[]; mergedJobs: { job: SavedMergedCuttingJob; estimate: Estimate }[]; constructionCostRange: { min: number; max: number }; totalRange: { min: number; max: number } };

/** Sums saved jobs into one project invoice and applies the discount once to the total. */
export function calculateProjectEstimate(
  jobs: readonly SavedCuttingJob[],
  materialCostPerM = DEFAULT_MATERIAL_COST_PER_M,
  constructionCostPerM2 = DEFAULT_CONSTRUCTION_COST_PER_M2,
  discountRateOverride?: number,
  mergedJobs: readonly SavedMergedCuttingJob[] = [],
): ProjectEstimate {
  const mergedSourceIds = new Set(mergedJobs.flatMap((mergedJob) => mergedJob.sourceJobIds));
  const details = jobs.filter((job) => !mergedSourceIds.has(job.id)).map((job) => ({ job, estimate: calculateEstimate(job, materialCostPerM, constructionCostPerM2, 0) }));
  const mergedDetails = mergedJobs.flatMap((mergedJob) => {
    const sources = jobs.filter((job) => mergedJob.sourceJobIds.includes(job.id));
    const source = sources[0];
    if (!source) return [];
    const productAreaM2 = sources.reduce((sum, job) => sum + Math.max(0, job.input.pieceWidthMm * job.input.pieceLengthMm * job.input.quantity) / 1_000_000, 0);
    return [{ job: mergedJob, estimate: calculateEstimate(source, materialCostPerM, constructionCostPerM2, 0, { materialLengthMm: mergedJob.usedLengthMm, materialWidthMm: mergedJob.rollWidthMm, productAreaM2 }) }];
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
  return { materialLengthM, materialAreaM2, materialCost, productAreaM2, constructionCost, subtotal, discountRate, discount, total: subtotal - discount, jobCount: allDetails.length, jobs: details, mergedJobs: mergedDetails, constructionCostRange, totalRange };
}
