import type { SavedCuttingJob } from '../library/models';

export const DEFAULT_MATERIAL_COST_PER_M = 10_000;
export const DEFAULT_CONSTRUCTION_COST_PER_M2 = 15_000;
export const CONSTRUCTION_PRICE_MIN = 8_500;
export const CONSTRUCTION_PRICE_MAX = 25_000;

export type Estimate = {
  materialLengthM: number;
  /** Physical film area used for the original roll-area construction basis. */
  materialAreaM2: number;
  materialCost: number;
  productAreaM2: number;
  constructionCost: number;
  subtotal: number;
  discountRate: number;
  discount: number;
  total: number;
};

export type EstimateUsageOverride = {
  /** Total physical new-roll length already calculated by the merged layout. */
  materialLengthMm: number;
  /** Roll width used with the physical length for construction pricing. */
  materialWidthMm?: number;
  /** Product area for every piece represented by the merged layout. */
  productAreaM2: number;
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
  usageOverride?: EstimateUsageOverride,
): Estimate {
  const effectiveMaterialCost = materialCostPerM === DEFAULT_MATERIAL_COST_PER_M && job.materialCostPerM !== undefined ? job.materialCostPerM : materialCostPerM;
  const effectiveConstructionCost = constructionCostPerM2 === DEFAULT_CONSTRUCTION_COST_PER_M2 && job.constructionCostPerM2 !== undefined ? job.constructionCostPerM2 : constructionCostPerM2;
  const materialLengthMm = Math.max(0, usageOverride?.materialLengthMm ?? job.result.newRollLengthMm);
  const materialWidthMm = Math.max(0, usageOverride?.materialWidthMm ?? job.input.rollWidthMm);
  const materialLengthM = materialLengthMm / 1000;
  const materialAreaM2 = materialWidthMm * materialLengthMm / 1_000_000;
  const productAreaM2 = usageOverride === undefined
    ? Math.max(0, job.input.pieceWidthMm * job.input.pieceLengthMm * job.input.quantity) / 1_000_000
    : Math.max(0, usageOverride.productAreaM2);
  const materialCost = roundWon(materialLengthM * Math.max(0, effectiveMaterialCost));
  const constructionCost = roundWon(materialAreaM2 * Math.max(0, effectiveConstructionCost));
  const subtotal = materialCost + constructionCost;
  const automaticDiscountRate = materialAreaM2 >= 10 ? 0.15 : materialAreaM2 >= 5 ? 0.1 : materialAreaM2 >= 1 ? 0.05 : 0;
  const discountRate = discountRateOverride === undefined ? automaticDiscountRate : Math.min(1, Math.max(0, discountRateOverride));
  const discount = roundWon(subtotal * discountRate);
  return { materialLengthM, materialAreaM2, materialCost, productAreaM2, constructionCost, subtotal, discountRate, discount, total: subtotal - discount };
}
