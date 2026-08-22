import type { SavedCuttingJob } from '../library/models';

export const DEFAULT_MATERIAL_COST_PER_M = 10_000;
export const DEFAULT_CONSTRUCTION_COST_PER_M2 = 15_000;

export type Estimate = {
  materialLengthM: number;
  materialCost: number;
  productAreaM2: number;
  constructionCost: number;
  subtotal: number;
  discountRate: number;
  discount: number;
  total: number;
};

function roundWon(value: number): number {
  return Math.max(0, Math.round(value));
}

/** Calculates a transparent default estimate from the saved cutting result. */
export function calculateEstimate(
  job: SavedCuttingJob,
  materialCostPerM = DEFAULT_MATERIAL_COST_PER_M,
  constructionCostPerM2 = DEFAULT_CONSTRUCTION_COST_PER_M2,
  discountRateOverride?: number,
): Estimate {
  const effectiveMaterialCost = materialCostPerM === DEFAULT_MATERIAL_COST_PER_M && job.materialCostPerM !== undefined ? job.materialCostPerM : materialCostPerM;
  const effectiveConstructionCost = constructionCostPerM2 === DEFAULT_CONSTRUCTION_COST_PER_M2 && job.constructionCostPerM2 !== undefined ? job.constructionCostPerM2 : constructionCostPerM2;
  const materialLengthM = Math.max(0, job.result.newRollLengthMm) / 1000;
  const productAreaM2 = Math.max(0, job.input.pieceWidthMm * job.input.pieceLengthMm * job.input.quantity) / 1_000_000;
  const materialCost = roundWon(materialLengthM * Math.max(0, effectiveMaterialCost));
  const constructionCost = roundWon(productAreaM2 * Math.max(0, effectiveConstructionCost));
  const subtotal = materialCost + constructionCost;
  const automaticDiscountRate = productAreaM2 >= 10 ? 0.15 : productAreaM2 >= 5 ? 0.1 : productAreaM2 >= 1 ? 0.05 : 0;
  const discountRate = discountRateOverride === undefined ? automaticDiscountRate : Math.min(1, Math.max(0, discountRateOverride));
  const discount = roundWon(subtotal * discountRate);
  return { materialLengthM, materialCost, productAreaM2, constructionCost, subtotal, discountRate, discount, total: subtotal - discount };
}
