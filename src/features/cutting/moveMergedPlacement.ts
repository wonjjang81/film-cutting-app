import type { GroupedPieceRequest, MergedGroupPlan } from '../remnants/planGroupedPieces';
import type { MergedPlacement, MergedRollResult } from './optimizeMergedRollLayout';
import { boundedNewRollLength } from './rollLengthLimit';

const GRID_MM = 5;
const MAGNET_SNAP_TOLERANCE_MM = 20;
const BACKING_GRID_MM = 100;

export type MovedMergedPlacement = {
  plan: MergedGroupPlan;
  fromRollIndex: number;
  toRollIndex: number;
  savedLengthMm: number;
};

export type ManualMergedPlacementResult = { plan?: MergedGroupPlan; error?: string };

function sourceId(entry: GroupedPieceRequest): string { return `${entry.groupId}-${entry.pieceId}`; }
function snap(value: number): number { return Math.ceil(value / GRID_MM) * GRID_MM; }

function magneticSnap(value: number, anchors: readonly number[]): number {
  const gridAnchor = Math.round(value / BACKING_GRID_MM) * BACKING_GRID_MM;
  const nearby = anchors
    .filter((anchor) => Math.abs(anchor - value) <= MAGNET_SNAP_TOLERANCE_MM)
    .sort((left, right) => Math.abs(left - value) - Math.abs(right - value) || left - right)[0];
  if (nearby !== undefined) return nearby;
  if (Math.abs(gridAnchor - value) <= MAGNET_SNAP_TOLERANCE_MM) return gridAnchor;
  return Math.round(value / GRID_MM) * GRID_MM;
}

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

/** Repositions a piece inside its current roll, without changing orientation or piece count. */
export function movePlacementWithinRoll(
  plan: MergedGroupPlan,
  placementId: number,
  xMm: number,
  yMm: number,
  requests: readonly GroupedPieceRequest[],
): ManualMergedPlacementResult {
  const rolls = plan.rollResults?.length ? plan.rollResults : [plan.result];
  const rollIndex = rolls.findIndex((roll) => roll.placements.some((item) => item.id === placementId));
  if (rollIndex < 0) return { error: '이동할 조각을 찾지 못했습니다.' };
  const roll = rolls[rollIndex]!;
  const selected = roll.placements.find((item) => item.id === placementId)!;
  const specification = requests.find((entry) => sourceId(entry) === selected.sourceId);
  if (!specification) return { error: '조각의 재단 조건을 찾지 못했습니다.' };
  if (!Number.isFinite(xMm) || !Number.isFinite(yMm)) return { error: '이동 위치가 올바르지 않습니다.' };
  const { rollWidthMm, gapMm, sideMarginMm, startEndMarginMm } = specification.request;
  const others = roll.placements.filter((item) => item.id !== placementId);
  const xAnchors = [sideMarginMm, rollWidthMm - sideMarginMm - selected.width, ...others.flatMap((item) => [
    item.x,
    item.x + item.width + gapMm,
    item.x - selected.width - gapMm,
    item.x + item.width - selected.width,
  ])];
  const yAnchors = [startEndMarginMm, roll.usedLengthMm - startEndMarginMm - selected.height, ...others.flatMap((item) => [
    item.y,
    item.y + item.height + gapMm,
    item.y - selected.height - gapMm,
    item.y + item.height - selected.height,
  ])];
  const candidate = { ...selected, x: magneticSnap(xMm, xAnchors), y: magneticSnap(yMm, yAnchors) };
  const maxLengthMm = Math.min(roll.usedLengthMm, boundedNewRollLength(specification.request.maxLengthMm));
  if (candidate.x < sideMarginMm || candidate.y < startEndMarginMm
    || candidate.x + candidate.width > rollWidthMm - sideMarginMm
    || candidate.y + candidate.height > maxLengthMm - startEndMarginMm) {
    return { error: '조각이 롤의 여백 또는 현재 도면 길이를 벗어납니다.' };
  }
  if (roll.placements.some((item) => item.id !== placementId && collides(candidate, item, gapMm))) {
    return { error: '다른 조각과 겹치거나 필요한 간격이 부족합니다.' };
  }
  const updated = metrics(roll.placements.map((item) => item.id === placementId ? candidate : item), rollWidthMm, startEndMarginMm);
  const nextRolls = rolls.map((item, index) => index === rollIndex ? updated : item);
  return { plan: rebuildPlan(plan, nextRolls, rollWidthMm) };
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
