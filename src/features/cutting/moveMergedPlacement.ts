import type { GroupedPieceRequest, MergedGroupPlan } from '../remnants/planGroupedPieces';
import type { MergedPlacement, MergedRollResult } from './optimizeMergedRollLayout';
import { boundedNewRollLength } from './rollLengthLimit';

const GRID_MM = 5;

export type MovedMergedPlacement = {
  plan: MergedGroupPlan;
  fromRollIndex: number;
  toRollIndex: number;
  savedLengthMm: number;
};

function sourceId(entry: GroupedPieceRequest): string { return `${entry.groupId}-${entry.pieceId}`; }
function snap(value: number): number { return Math.ceil(value / GRID_MM) * GRID_MM; }

function collides(candidate: Pick<MergedPlacement, 'x' | 'y' | 'width' | 'height'>, placed: MergedPlacement, gapMm: number): boolean {
  return candidate.x < placed.x + placed.width + gapMm
    && candidate.x + candidate.width + gapMm > placed.x
    && candidate.y < placed.y + placed.height + gapMm
    && candidate.y + candidate.height + gapMm > placed.y;
}

function metrics(placements: readonly MergedPlacement[], rollWidthMm: number, endMarginMm: number): MergedRollResult {
  const usedLengthMm = placements.length === 0 ? 0 : Math.max(...placements.map((item) => item.y + item.height)) + endMarginMm;
  const area = placements.reduce((sum, item) => sum + item.width * item.height, 0);
  const utilizationPercent = usedLengthMm > 0 ? Math.round(area / (rollWidthMm * usedLengthMm) * 1000) / 10 : 0;
  return { placements: placements.map((item) => ({ ...item })), usedLengthMm, producedQuantity: placements.length, utilizationPercent, wastePercent: Math.round((100 - utilizationPercent) * 10) / 10 };
}

function rebuildPlan(plan: MergedGroupPlan, rolls: readonly MergedRollResult[], rollWidthMm: number): MergedGroupPlan {
  let offset = 0;
  const placements = rolls.flatMap((roll) => {
    const shifted = roll.placements.map((item) => ({ ...item, y: item.y + offset }));
    offset += roll.usedLengthMm;
    return shifted;
  });
  const combined = metrics(placements, rollWidthMm, 0);
  return { ...plan, rollResults: rolls.map((roll) => ({ ...roll, placements: roll.placements.map((item) => ({ ...item })) })), result: { ...combined, usedLengthMm: rolls.reduce((sum, roll) => sum + roll.usedLengthMm, 0) }, newRollQuantity: placements.length };
}

/** Moves one selected placement into another physical roll, within that roll's length limit. */
export function movePlacementToBestOtherRoll(
  plan: MergedGroupPlan,
  placementId: number,
  requests: readonly GroupedPieceRequest[],
  requestedTargetRollIndex?: number,
): MovedMergedPlacement | null {
  const rolls = plan.rollResults?.length ? plan.rollResults : [plan.result];
  if (rolls.length < 2) return null;
  const fromRollIndex = rolls.findIndex((roll) => roll.placements.some((item) => item.id === placementId));
  if (fromRollIndex < 0) return null;
  const selected = rolls[fromRollIndex]!.placements.find((item) => item.id === placementId)!;
  const specification = requests.find((entry) => sourceId(entry) === selected.sourceId);
  if (!specification) return null;
  const { rollWidthMm, gapMm, sideMarginMm, startEndMarginMm, allowRotation, pieceWidthMm, pieceLengthMm } = specification.request;
  const orientations = [{ width: pieceWidthMm, height: pieceLengthMm, rotated: false }];
  if (allowRotation && pieceWidthMm !== pieceLengthMm) orientations.push({ width: pieceLengthMm, height: pieceWidthMm, rotated: true });
  const sourceRemaining = rolls[fromRollIndex]!.placements.filter((item) => item.id !== placementId);
  const shortenedSource = metrics(sourceRemaining, rollWidthMm, startEndMarginMm);

  let best: { targetIndex: number; placement: MergedPlacement; target: MergedRollResult } | undefined;
  for (let targetIndex = 0; targetIndex < rolls.length; targetIndex += 1) {
    if (targetIndex === fromRollIndex || (requestedTargetRollIndex !== undefined && targetIndex !== requestedTargetRollIndex)) continue;
    const target = rolls[targetIndex]!;
    const usableEnd = boundedNewRollLength(specification.request.maxLengthMm) - startEndMarginMm;
    const points = [{ x: sideMarginMm, y: startEndMarginMm }, ...target.placements.flatMap((item) => [
      { x: item.x + item.width + gapMm, y: item.y },
      { x: item.x, y: item.y + item.height + gapMm },
    ])];
    for (const orientation of orientations) {
      for (const point of points) {
        const candidate = { ...selected, ...orientation, x: Math.max(sideMarginMm, snap(point.x)), y: Math.max(startEndMarginMm, snap(point.y)) };
        if (candidate.x + candidate.width > rollWidthMm - sideMarginMm || candidate.y + candidate.height > usableEnd) continue;
        if (target.placements.some((item) => collides(candidate, item, gapMm))) continue;
        const targetWithCandidate = metrics([...target.placements, candidate], rollWidthMm, startEndMarginMm);
        const addedLengthMm = targetWithCandidate.usedLengthMm - target.usedLengthMm;
        const bestAddedLengthMm = best && best.target.usedLengthMm - rolls[best.targetIndex]!.usedLengthMm;
        if (!best || addedLengthMm < bestAddedLengthMm!
          || (addedLengthMm === bestAddedLengthMm
            && (candidate.y < best.placement.y || (candidate.y === best.placement.y && candidate.x < best.placement.x)))) {
          best = { targetIndex, placement: candidate, target: targetWithCandidate };
        }
      }
    }
  }
  if (!best) return null;
  const nextRolls = rolls.map((roll, index) => index === fromRollIndex ? shortenedSource : index === best!.targetIndex ? best!.target : roll).filter((roll) => roll.placements.length > 0);
  const toRollIndex = best.targetIndex - (shortenedSource.placements.length === 0 && fromRollIndex < best.targetIndex ? 1 : 0);
  const savedLengthMm = rolls[fromRollIndex]!.usedLengthMm - shortenedSource.usedLengthMm
    - (best.target.usedLengthMm - rolls[best.targetIndex]!.usedLengthMm);
  return { plan: rebuildPlan(plan, nextRolls, rollWidthMm), fromRollIndex, toRollIndex, savedLengthMm };
}
