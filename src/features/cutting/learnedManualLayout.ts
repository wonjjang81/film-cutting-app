import type { SavedManualMergedLayout } from '../library/models';
import type { GroupedPieceRequest, MergedGroupPlan } from '../remnants/planGroupedPieces';
import { restoreManualMergedLayout } from './savedManualMergedLayout';

export type LearnedManualLayoutResult = {
  plan: MergedGroupPlan;
  learned: boolean;
  savedLengthMm: number;
  utilizationGainPercent: number;
};

function isBetter(candidate: MergedGroupPlan, current: MergedGroupPlan): boolean {
  if (candidate.result.usedLengthMm !== current.result.usedLengthMm) {
    return candidate.result.usedLengthMm < current.result.usedLengthMm;
  }
  return candidate.result.utilizationPercent > current.result.utilizationPercent;
}

/**
 * Replays compatible saved layouts against fresh source IDs and returns only a
 * fully validated candidate that beats the automatic result. Poor examples can
 * remain in project history without degrading later calculations.
 */
export function selectBestLearnedManualLayout(
  automatic: MergedGroupPlan,
  planIndex: number,
  requests: readonly GroupedPieceRequest[],
  examples: readonly SavedManualMergedLayout[],
): LearnedManualLayoutResult {
  let best = automatic;
  for (const example of examples) {
    const restored = restoreManualMergedLayout(automatic, planIndex, requests, { ...example, planIndex });
    if (restored && isBetter(restored, best)) best = restored;
  }
  return {
    plan: best,
    learned: best !== automatic,
    savedLengthMm: automatic.result.usedLengthMm - best.result.usedLengthMm,
    utilizationGainPercent: Math.round((best.result.utilizationPercent - automatic.result.utilizationPercent) * 10) / 10,
  };
}
