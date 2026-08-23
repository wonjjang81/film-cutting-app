import type { SavedCuttingJob, SavedMergedCuttingJob } from '../library/models';
import { calculateEstimate, DEFAULT_CONSTRUCTION_COST_PER_M2, DEFAULT_MATERIAL_COST_PER_M, type Estimate } from './calculateEstimate';

export type ProjectEstimate = Estimate & { jobCount: number; jobs: { job: SavedCuttingJob; estimate: Estimate }[]; mergedJobs: { job: SavedMergedCuttingJob; estimate: Estimate }[] };

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
    return [{ job: mergedJob, estimate: calculateEstimate(source, materialCostPerM, constructionCostPerM2, 0, { materialLengthMm: mergedJob.usedLengthMm, productAreaM2 }) }];
  });
  const allDetails = [...details, ...mergedDetails];
  const materialLengthM = allDetails.reduce((sum, item) => sum + item.estimate.materialLengthM, 0);
  const materialCost = allDetails.reduce((sum, item) => sum + item.estimate.materialCost, 0);
  const productAreaM2 = allDetails.reduce((sum, item) => sum + item.estimate.productAreaM2, 0);
  const constructionCost = allDetails.reduce((sum, item) => sum + item.estimate.constructionCost, 0);
  const subtotal = materialCost + constructionCost;
  const automaticDiscountRate = productAreaM2 >= 10 ? 0.15 : productAreaM2 >= 5 ? 0.1 : productAreaM2 >= 1 ? 0.05 : 0;
  const discountRate = discountRateOverride === undefined ? automaticDiscountRate : Math.min(1, Math.max(0, discountRateOverride));
  const discount = Math.max(0, Math.round(subtotal * discountRate));
  return { materialLengthM, materialCost, productAreaM2, constructionCost, subtotal, discountRate, discount, total: subtotal - discount, jobCount: allDetails.length, jobs: details, mergedJobs: mergedDetails };
}
