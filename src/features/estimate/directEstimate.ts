import { buildSavedCuttingJob } from '../library/uiWorkflowHelpers';
import type { SavedCuttingJob } from '../library/models';
import { planWithRemnants, type RemnantPlanRequest } from '../remnants/planWithRemnants';

export const DIRECT_ESTIMATE_ROLL_WIDTH_MM = 1_220;
export const DIRECT_ESTIMATE_GAP_MM = 0;
export const DIRECT_ESTIMATE_SIDE_MARGIN_MM = 5;
export const DIRECT_ESTIMATE_START_END_MARGIN_MM = 5;
export const DIRECT_ESTIMATE_INPUT_STORAGE_KEY = 'film-cutting-direct-estimate-input';

export type DirectEstimateInput = {
  pieceWidthMm: number;
  pieceLengthMm: number;
  quantity: number;
};

export function parseDirectEstimateInput(raw: string | null): DirectEstimateInput | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<DirectEstimateInput>;
    if (!Number.isFinite(parsed.pieceWidthMm) || !Number.isFinite(parsed.pieceLengthMm) || !Number.isFinite(parsed.quantity)) return null;
    if ((parsed.pieceWidthMm ?? 0) <= 0 || (parsed.pieceLengthMm ?? 0) <= 0 || (parsed.quantity ?? 0) <= 0 || !Number.isInteger(parsed.quantity)) return null;
    return { pieceWidthMm: parsed.pieceWidthMm!, pieceLengthMm: parsed.pieceLengthMm!, quantity: parsed.quantity! };
  } catch {
    return null;
  }
}

/** Builds an in-memory estimate job without writing a project to the library. */
export function createDirectEstimateJob(input: DirectEstimateInput): SavedCuttingJob {
  const request: RemnantPlanRequest = {
    brand: '간편 견적',
    productNumber: '',
    rollWidthMm: DIRECT_ESTIMATE_ROLL_WIDTH_MM,
    pieceWidthMm: input.pieceWidthMm,
    pieceLengthMm: input.pieceLengthMm,
    quantity: input.quantity,
    gapMm: DIRECT_ESTIMATE_GAP_MM,
    sideMarginMm: DIRECT_ESTIMATE_SIDE_MARGIN_MM,
    startEndMarginMm: DIRECT_ESTIMATE_START_END_MARGIN_MM,
    allowRotation: true,
    remnants: [],
  };
  const plan = planWithRemnants(request);
  const timestamp = new Date(0).toISOString();
  return buildSavedCuttingJob({
    id: 'direct-estimate',
    name: '간편 자동견적',
    createdAt: timestamp,
    request,
    plan,
    inventory: [],
  });
}
