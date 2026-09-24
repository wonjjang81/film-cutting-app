import type { GroupedPieceRequest, MergedGroupPlan } from '../remnants/planGroupedPieces';
import type { MergedPlacement, MergedRollResult } from './optimizeMergedRollLayout';
import { boundedNewRollLength } from './rollLengthLimit';

const GRID_MM = 5;

export type ReoptimizedManualMergedLayout = {
  plan: MergedGroupPlan;
  movedCount: number;
  savedLengthMm: number;
};

export type ReoptimizeManualMergedLayoutOptions = {
  /** Placements explicitly moved between rolls by the user stay anchored. */
  lockedPlacementIds?: readonly number[];
  /** Restrict gap filling to one physical roll after a manual move. */
  targetRollIndex?: number;
};

function sourceId(entry: GroupedPieceRequest): string { return `${entry.groupId}-${entry.pieceId}`; }
function snap(value: number): number { return Math.ceil(value / GRID_MM) * GRID_MM; }

function collides(candidate: Pick<MergedPlacement, 'x' | 'y' | 'width' | 'height'>, placed: MergedPlacement, gapMm: number): boolean {
  return candidate.x < placed.x + placed.width + gapMm
    && candidate.x + candidate.width + gapMm > placed.x
    && candidate.y < placed.y + placed.height + gapMm
    && candidate.y + candidate.height + gapMm > placed.y;
}

function rollMetrics(placements: readonly MergedPlacement[], rollWidthMm: number, endMarginMm: number): MergedRollResult {
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
  const totalLength = rolls.reduce((sum, roll) => sum + roll.usedLengthMm, 0);
  const area = placements.reduce((sum, item) => sum + item.width * item.height, 0);
  const utilizationPercent = totalLength > 0 ? Math.round(area / (rollWidthMm * totalLength) * 1000) / 10 : 0;
  return {
    ...plan,
    rollResults: rolls.map((roll) => ({ ...roll, placements: roll.placements.map((item) => ({ ...item })) })),
    result: { placements, usedLengthMm: totalLength, producedQuantity: placements.length, utilizationPercent, wastePercent: Math.round((100 - utilizationPercent) * 10) / 10 },
    newRollQuantity: placements.length,
  };
}

type LayoutScore = readonly [totalLength: number, rollCount: number, verticalPosition: number, horizontalPosition: number];

function score(rolls: readonly MergedRollResult[], maxLengthMm: number): LayoutScore {
  return [
    rolls.reduce((sum, roll) => sum + roll.usedLengthMm, 0),
    rolls.length,
    rolls.reduce((sum, roll, rollIndex) => sum + roll.placements.reduce((rollSum, item) => rollSum + rollIndex * maxLengthMm + item.y, 0), 0),
    rolls.reduce((sum, roll) => sum + roll.placements.reduce((rollSum, item) => rollSum + item.x, 0), 0),
  ];
}

function isBetter(next: LayoutScore, current: LayoutScore): boolean {
  for (let index = 0; index < next.length; index += 1) {
    if (next[index] === current[index]) continue;
    return next[index]! < current[index]!;
  }
  return false;
}

function uniquePoints(placements: readonly MergedPlacement[], gapMm: number, sideMarginMm: number, startEndMarginMm: number): { x: number; y: number }[] {
  const seen = new Set<string>();
  return [{ x: sideMarginMm, y: startEndMarginMm }, ...placements.flatMap((item) => [
    { x: item.x + item.width + gapMm, y: item.y },
    { x: item.x, y: item.y + item.height + gapMm },
  ])].filter((point) => {
    const key = `${point.x}:${point.y}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).sort((left, right) => left.y - right.y || left.x - right.x);
}

/**
 * Reuses the current manual layout as the starting point, then moves pieces
 * into exposed gaps. Total material length wins first; equal-length layouts
 * are accepted only when pieces move toward earlier rolls and upper gaps.
 */
export function reoptimizeManualMergedLayout(
  plan: MergedGroupPlan,
  requests: readonly GroupedPieceRequest[],
  options: ReoptimizeManualMergedLayoutOptions = {},
): ReoptimizedManualMergedLayout {
  const specifications = new Map(requests.map((entry) => [sourceId(entry), entry]));
  const first = requests[0];
  if (!first) return { plan, movedCount: 0, savedLengthMm: 0 };
  const { rollWidthMm, gapMm, sideMarginMm, startEndMarginMm } = first.request;
  const maxLengthMm = boundedNewRollLength(first.request.maxLengthMm);
  let rolls = (plan.rollResults?.length ? plan.rollResults : [plan.result]).map((roll) => rollMetrics(roll.placements, rollWidthMm, startEndMarginMm));
  const startingLength = rolls.reduce((sum, roll) => sum + roll.usedLengthMm, 0);
  const movedIds = new Set<number>();
  const lockedPlacementIds = new Set(options.lockedPlacementIds ?? []);
  const targetRollIndex = options.targetRollIndex;
  const lockedRollIndexById = new Map(rolls.flatMap((roll, rollIndex) => roll.placements
    .filter((placement) => lockedPlacementIds.has(placement.id))
    .map((placement) => [placement.id, rollIndex] as const)));
  const totalPieces = rolls.reduce((sum, roll) => sum + roll.placements.length, 0);
  const passes = totalPieces <= 120 ? 4 : 2;

  for (let pass = 0; pass < passes; pass += 1) {
    let changed = false;
    const candidates = rolls.flatMap((roll, rollIndex) => roll.placements.map((placement) => ({ placement, rollIndex })))
      .filter(({ placement }) => !lockedPlacementIds.has(placement.id))
      .filter(({ rollIndex }) => targetRollIndex === undefined || rollIndex === targetRollIndex)
      .sort((left, right) => right.rollIndex - left.rollIndex
        || left.placement.width * left.placement.height - right.placement.width * right.placement.height
        || left.placement.id - right.placement.id)
      .slice(0, totalPieces > 120 ? 80 : undefined);

    for (const { placement } of candidates) {
      const sourceRollIndex = rolls.findIndex((roll) => roll.placements.some((item) => item.id === placement.id));
      if (sourceRollIndex < 0) continue;
      const specification = specifications.get(placement.sourceId);
      if (!specification) continue;
      const currentScore = score(rolls, maxLengthMm);
      const without = rolls.map((roll, index) => index === sourceRollIndex
        ? rollMetrics(roll.placements.filter((item) => item.id !== placement.id), rollWidthMm, startEndMarginMm)
        : rollMetrics(roll.placements, rollWidthMm, startEndMarginMm));
      const orientations = [{ width: specification.request.pieceWidthMm, height: specification.request.pieceLengthMm, rotated: false }];
      if (specification.request.allowRotation && specification.request.pieceWidthMm !== specification.request.pieceLengthMm) {
        orientations.push({ width: specification.request.pieceLengthMm, height: specification.request.pieceWidthMm, rotated: true });
      }
      let bestRolls: MergedRollResult[] | undefined;
      let bestScore = currentScore;

      for (let targetRollIndex = 0; targetRollIndex < without.length; targetRollIndex += 1) {
        if (options.targetRollIndex !== undefined && targetRollIndex !== options.targetRollIndex) continue;
        const target = without[targetRollIndex]!;
        for (const orientation of orientations) {
          for (const point of uniquePoints(target.placements, gapMm, sideMarginMm, startEndMarginMm)) {
            const candidate = { ...placement, ...orientation, x: Math.max(sideMarginMm, snap(point.x)), y: Math.max(startEndMarginMm, snap(point.y)) };
            if (candidate.x + candidate.width > rollWidthMm - sideMarginMm
              || candidate.y + candidate.height > maxLengthMm - startEndMarginMm
              || target.placements.some((item) => collides(candidate, item, gapMm))) continue;
            const next = without.map((roll, index) => index === targetRollIndex
              ? rollMetrics([...roll.placements, candidate], rollWidthMm, startEndMarginMm) : roll)
              .filter((roll) => roll.placements.length > 0);
            const locksStayOnTheirRoll = [...lockedRollIndexById.entries()].every(([id, rollIndex]) => next[rollIndex]?.placements.some((item) => item.id === id));
            if (!locksStayOnTheirRoll) continue;
            const nextScore = score(next, maxLengthMm);
            if (isBetter(nextScore, bestScore)) { bestScore = nextScore; bestRolls = next; }
          }
        }
      }
      if (!bestRolls) continue;
      rolls = bestRolls;
      movedIds.add(placement.id);
      changed = true;
    }
    if (!changed) break;
  }

  const optimized = rebuildPlan(plan, rolls, rollWidthMm);
  return { plan: optimized, movedCount: movedIds.size, savedLengthMm: startingLength - optimized.result.usedLengthMm };
}
