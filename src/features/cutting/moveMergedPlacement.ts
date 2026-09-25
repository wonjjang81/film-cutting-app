import type { GroupedPieceRequest, MergedGroupPlan } from '../remnants/planGroupedPieces';
import type { MergedPlacement, MergedRollResult } from './optimizeMergedRollLayout';
import { boundedNewRollLength } from './rollLengthLimit';

const GRID_MM = 5;
const MAGNET_SNAP_TOLERANCE_MM = 50;
const BACKING_GRID_MM = 100;

export type PlacementEdgeDirection = 'left' | 'right' | 'top' | 'bottom';

export type MovedMergedPlacement = {
  plan: MergedGroupPlan;
  fromRollIndex: number;
  toRollIndex: number;
  savedLengthMm: number;
};

export type ManualMergedPlacementResult = { plan?: MergedGroupPlan; error?: string; movedPlacementIds?: number[] };
export type CompactedMergedLayout = { plan: MergedGroupPlan; movedCount: number; savedLengthMm: number };

function sourceId(entry: GroupedPieceRequest): string { return `${entry.groupId}-${entry.pieceId}`; }
function snap(value: number): number { return Math.ceil(value / GRID_MM) * GRID_MM; }

function magneticSnap(value: number, anchors: readonly number[], boundaryAnchors: readonly number[] = []): number {
  const gridAnchor = Math.round(value / BACKING_GRID_MM) * BACKING_GRID_MM;
  const nearby = anchors
    .filter((anchor) => Math.abs(anchor - value) <= MAGNET_SNAP_TOLERANCE_MM)
    .sort((left, right) => Math.abs(left - value) - Math.abs(right - value) || left - right)[0];
  if (nearby !== undefined) return nearby;
  const nearbyBoundary = boundaryAnchors
    .filter((anchor) => Math.abs(anchor - value) <= MAGNET_SNAP_TOLERANCE_MM)
    .sort((left, right) => Math.abs(left - value) - Math.abs(right - value) || left - right)[0];
  if (nearbyBoundary !== undefined) return nearbyBoundary;
  if (Math.abs(gridAnchor - value) <= MAGNET_SNAP_TOLERANCE_MM) return gridAnchor;
  return Math.round(value / GRID_MM) * GRID_MM;
}

function collides(candidate: Pick<MergedPlacement, 'x' | 'y' | 'width' | 'height'>, placed: MergedPlacement, gapMm: number): boolean {
  return candidate.x < placed.x + placed.width + gapMm
    && candidate.x + candidate.width + gapMm > placed.x
    && candidate.y < placed.y + placed.height + gapMm
    && candidate.y + candidate.height + gapMm > placed.y;
}

function verticallyIntersects(left: MergedPlacement, right: MergedPlacement, gapMm: number): boolean {
  return left.y < right.y + right.height + gapMm && left.y + left.height + gapMm > right.y;
}

function horizontallyIntersects(top: MergedPlacement, bottom: MergedPlacement, gapMm: number): boolean {
  return top.x < bottom.x + bottom.width + gapMm && top.x + top.width + gapMm > bottom.x;
}

function attachedInDirection(current: MergedPlacement, next: MergedPlacement, direction: PlacementEdgeDirection, gapMm: number): boolean {
  if (direction === 'right') return verticallyIntersects(current, next, gapMm)
    && Math.abs(next.x - (current.x + current.width + gapMm)) <= GRID_MM;
  if (direction === 'left') return verticallyIntersects(current, next, gapMm)
    && Math.abs(current.x - (next.x + next.width + gapMm)) <= GRID_MM;
  if (direction === 'bottom') return horizontallyIntersects(current, next, gapMm)
    && Math.abs(next.y - (current.y + current.height + gapMm)) <= GRID_MM;
  return horizontallyIntersects(current, next, gapMm)
    && Math.abs(current.y - (next.y + next.height + gapMm)) <= GRID_MM;
}

function attachedPushChain(placements: readonly MergedPlacement[], selectedId: number, direction: PlacementEdgeDirection, gapMm: number): Set<number> {
  const moving = new Set<number>([selectedId]);
  const queue = placements.filter((item) => item.id === selectedId);
  while (queue.length) {
    const current = queue.shift()!;
    for (const candidate of placements) {
      if (moving.has(candidate.id) || !attachedInDirection(current, candidate, direction, gapMm)) continue;
      moving.add(candidate.id);
      queue.push(candidate);
    }
  }
  return moving;
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

/** Rotates a piece 90 degrees around its center when its source allows rotation. */
export function rotatePlacementWithinRoll(
  plan: MergedGroupPlan,
  placementId: number,
  requests: readonly GroupedPieceRequest[],
): ManualMergedPlacementResult {
  const rolls = plan.rollResults?.length ? plan.rollResults : [plan.result];
  const rollIndex = rolls.findIndex((roll) => roll.placements.some((item) => item.id === placementId));
  if (rollIndex < 0) return { error: '회전할 조각을 찾지 못했습니다.' };
  const roll = rolls[rollIndex]!;
  const selected = roll.placements.find((item) => item.id === placementId)!;
  const specification = requests.find((entry) => sourceId(entry) === selected.sourceId);
  if (!specification) return { error: '조각의 재단 조건을 찾지 못했습니다.' };
  if (!specification.request.allowRotation) return { error: '무늬고정 조각은 회전할 수 없습니다.' };
  if (selected.width === selected.height) return { error: '정사각형 조각은 회전해도 배치가 같아집니다.' };

  const { rollWidthMm, gapMm, sideMarginMm, startEndMarginMm } = specification.request;
  const maxX = rollWidthMm - sideMarginMm - selected.height;
  const maxY = roll.usedLengthMm - startEndMarginMm - selected.width;
  if (maxX < sideMarginMm || maxY < startEndMarginMm) return { error: '현재 롤 영역 안에서 회전할 수 없습니다.' };
  const centerX = selected.x + selected.width / 2;
  const centerY = selected.y + selected.height / 2;
  const candidate = {
    ...selected,
    x: Math.max(sideMarginMm, Math.min(maxX, snap(centerX - selected.height / 2))),
    y: Math.max(startEndMarginMm, Math.min(maxY, snap(centerY - selected.width / 2))),
    width: selected.height,
    height: selected.width,
    rotated: !selected.rotated,
  };
  const others = roll.placements.filter((item) => item.id !== placementId);
  if (others.some((item) => collides(candidate, item, gapMm))) return { error: '회전 후 다른 조각과 겹치거나 필요한 간격이 부족합니다.' };
  const updated = metrics(roll.placements.map((item) => item.id === placementId ? candidate : item), rollWidthMm, startEndMarginMm);
  return { plan: rebuildPlan(plan, rolls.map((item, index) => index === rollIndex ? updated : item), rollWidthMm), movedPlacementIds: [placementId] };
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
  const rawDeltaX = xMm - selected.x;
  const rawDeltaY = yMm - selected.y;
  const direction: PlacementEdgeDirection = Math.abs(rawDeltaX) >= Math.abs(rawDeltaY)
    ? (rawDeltaX >= 0 ? 'right' : 'left') : (rawDeltaY >= 0 ? 'bottom' : 'top');
  const movingIds = attachedPushChain(roll.placements, placementId, direction, gapMm);
  const others = roll.placements.filter((item) => !movingIds.has(item.id));
  const xAnchors = others.flatMap((item) => [
    item.x,
    item.x + item.width + gapMm,
    item.x - selected.width - gapMm,
    item.x + item.width - selected.width,
  ]);
  const yAnchors = others.flatMap((item) => [
    item.y,
    item.y + item.height + gapMm,
    item.y - selected.height - gapMm,
    item.y + item.height - selected.height,
  ]);
  const candidate = { ...selected,
    x: magneticSnap(xMm, xAnchors, [sideMarginMm, rollWidthMm - sideMarginMm - selected.width]),
    y: magneticSnap(yMm, yAnchors, [startEndMarginMm, roll.usedLengthMm - startEndMarginMm - selected.height]),
  };
  const deltaX = candidate.x - selected.x;
  const deltaY = candidate.y - selected.y;
  const translated = roll.placements.map((item) => movingIds.has(item.id)
    ? { ...item, x: item.x + deltaX, y: item.y + deltaY } : item);
  const maxLengthMm = Math.min(roll.usedLengthMm, boundedNewRollLength(specification.request.maxLengthMm));
  if (translated.some((item) => movingIds.has(item.id) && (item.x < sideMarginMm || item.y < startEndMarginMm
    || item.x + item.width > rollWidthMm - sideMarginMm
    || item.y + item.height > maxLengthMm - startEndMarginMm))) {
    return { error: '조각이 롤의 여백 또는 현재 도면 길이를 벗어납니다.' };
  }
  if (translated.some((item) => movingIds.has(item.id)
    && translated.some((other) => !movingIds.has(other.id) && collides(item, other, gapMm)))) {
    return { error: '다른 조각과 겹치거나 필요한 간격이 부족합니다.' };
  }
  const updated = metrics(translated, rollWidthMm, startEndMarginMm);
  const nextRolls = rolls.map((item, index) => index === rollIndex ? updated : item);
  return { plan: rebuildPlan(plan, nextRolls, rollWidthMm), movedPlacementIds: [...movingIds] };
}

/** Pushes a placement horizontally until it reaches the closest blocker or usable roll edge. */
export function shiftPlacementHorizontally(
  plan: MergedGroupPlan,
  placementId: number,
  direction: 'left' | 'right',
  requests: readonly GroupedPieceRequest[],
): ManualMergedPlacementResult {
  return shiftPlacementToEdge(plan, placementId, direction, requests);
}

/** Moves a placement and any directly attached pieces to the nearest usable edge or blocker. */
export function shiftPlacementToEdge(
  plan: MergedGroupPlan,
  placementId: number,
  direction: PlacementEdgeDirection,
  requests: readonly GroupedPieceRequest[],
): ManualMergedPlacementResult {
  const rolls = plan.rollResults?.length ? plan.rollResults : [plan.result];
  const rollIndex = rolls.findIndex((roll) => roll.placements.some((item) => item.id === placementId));
  if (rollIndex < 0) return { error: '밀어낼 조각을 찾지 못했습니다.' };
  const roll = rolls[rollIndex]!;
  const selected = roll.placements.find((item) => item.id === placementId)!;
  const specification = requests.find((entry) => sourceId(entry) === selected.sourceId);
  if (!specification) return { error: '조각의 재단 조건을 찾지 못했습니다.' };
  const { rollWidthMm, gapMm, sideMarginMm, startEndMarginMm } = specification.request;
  const movingIds = attachedPushChain(roll.placements, placementId, direction, gapMm);
  const moving = roll.placements.filter((item) => movingIds.has(item.id));
  const stationary = roll.placements.filter((item) => !movingIds.has(item.id));
  let delta = direction === 'left'
    ? sideMarginMm - Math.min(...moving.map((item) => item.x))
    : direction === 'right'
      ? rollWidthMm - sideMarginMm - Math.max(...moving.map((item) => item.x + item.width))
      : direction === 'top'
        ? startEndMarginMm - Math.min(...moving.map((item) => item.y))
        : roll.usedLengthMm - startEndMarginMm - Math.max(...moving.map((item) => item.y + item.height));
  for (const item of moving) {
    for (const blocker of stationary) {
      if (direction === 'right' && verticallyIntersects(item, blocker, gapMm) && blocker.x >= item.x + item.width) delta = Math.min(delta, blocker.x - gapMm - item.x - item.width);
      if (direction === 'left' && verticallyIntersects(item, blocker, gapMm) && blocker.x + blocker.width <= item.x) delta = Math.max(delta, blocker.x + blocker.width + gapMm - item.x);
      if (direction === 'bottom' && horizontallyIntersects(item, blocker, gapMm) && blocker.y >= item.y + item.height) delta = Math.min(delta, blocker.y - gapMm - item.y - item.height);
      if (direction === 'top' && horizontallyIntersects(item, blocker, gapMm) && blocker.y + blocker.height <= item.y) delta = Math.max(delta, blocker.y + blocker.height + gapMm - item.y);
    }
  }
  delta = direction === 'left' || direction === 'top'
    ? Math.ceil(delta / GRID_MM) * GRID_MM : Math.floor(delta / GRID_MM) * GRID_MM;
  if (delta === 0) {
    const label = direction === 'left' ? '왼쪽' : direction === 'right' ? '오른쪽' : direction === 'top' ? '위쪽' : '아래쪽';
    return { error: `더 이상 ${label}으로 밀 수 없습니다.` };
  }
  const translated = roll.placements.map((item) => !movingIds.has(item.id) ? item : ({ ...item,
    x: item.x + (direction === 'left' || direction === 'right' ? delta : 0),
    y: item.y + (direction === 'top' || direction === 'bottom' ? delta : 0),
  }));
  if (translated.some((item) => movingIds.has(item.id)
    && stationary.some((blocker) => collides(item, blocker, gapMm)))) return { error: '해당 방향에 조각이 들어갈 공간이 없습니다.' };
  const updated = metrics(translated, rollWidthMm, startEndMarginMm);
  return { plan: rebuildPlan(plan, rolls.map((item, index) => index === rollIndex ? updated : item), rollWidthMm), movedPlacementIds: [...movingIds] };
}

/** Removes fully empty horizontal bands without changing each occupied band's internal arrangement. */
export function removeEmptyRollSpaces(
  plan: MergedGroupPlan,
  requests: readonly GroupedPieceRequest[],
): CompactedMergedLayout {
  const first = requests[0];
  if (!first) return { plan, movedCount: 0, savedLengthMm: 0 };
  const { rollWidthMm, gapMm, startEndMarginMm } = first.request;
  const rolls = plan.rollResults?.length ? plan.rollResults : [plan.result];
  const startingLength = rolls.reduce((sum, roll) => sum + roll.usedLengthMm, 0);
  const movedIds = new Set<number>();
  const compacted = rolls.map((roll) => {
    const ordered = [...roll.placements].sort((left, right) => left.y - right.y || left.x - right.x || left.id - right.id);
    const bands: { start: number; end: number; placements: MergedPlacement[] }[] = [];
    for (const placement of ordered) {
      const current = bands[bands.length - 1];
      if (!current || placement.y > current.end + gapMm) {
        bands.push({ start: placement.y, end: placement.y + placement.height, placements: [placement] });
      } else {
        current.end = Math.max(current.end, placement.y + placement.height);
        current.placements.push(placement);
      }
    }
    let nextStart = startEndMarginMm;
    const placements = bands.flatMap((band) => {
      const offset = Math.min(0, nextStart - band.start);
      const shifted = band.placements.map((placement) => {
        if (offset !== 0) movedIds.add(placement.id);
        return { ...placement, y: placement.y + offset };
      });
      nextStart = band.end + offset + gapMm;
      return shifted;
    });
    return metrics(placements, rollWidthMm, startEndMarginMm);
  }).filter((roll) => roll.placements.length > 0);
  const next = rebuildPlan(plan, compacted, rollWidthMm);
  return { plan: next, movedCount: movedIds.size, savedLengthMm: startingLength - next.result.usedLengthMm };
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

/** Moves one selected placement onto a newly appended physical roll. */
export function movePlacementToNewRoll(
  plan: MergedGroupPlan,
  placementId: number,
  requests: readonly GroupedPieceRequest[],
): MovedMergedPlacement | null {
  const rolls = plan.rollResults?.length ? plan.rollResults : [plan.result];
  const fromRollIndex = rolls.findIndex((roll) => roll.placements.some((item) => item.id === placementId));
  if (fromRollIndex < 0 || rolls[fromRollIndex]!.placements.length <= 1) return null;
  const selected = rolls[fromRollIndex]!.placements.find((item) => item.id === placementId)!;
  const specification = requests.find((entry) => sourceId(entry) === selected.sourceId);
  if (!specification) return null;
  const { rollWidthMm, sideMarginMm, startEndMarginMm, allowRotation, pieceWidthMm, pieceLengthMm } = specification.request;
  const usableWidth = rollWidthMm - sideMarginMm * 2;
  const usableLength = boundedNewRollLength(specification.request.maxLengthMm) - startEndMarginMm * 2;
  const orientations = [
    { width: pieceWidthMm, height: pieceLengthMm, rotated: false },
    ...(allowRotation && pieceWidthMm !== pieceLengthMm
      ? [{ width: pieceLengthMm, height: pieceWidthMm, rotated: true }]
      : []),
  ].filter((orientation) => orientation.width <= usableWidth && orientation.height <= usableLength)
    .sort((left, right) => left.height - right.height || left.width - right.width);
  const orientation = orientations[0];
  if (!orientation) return null;

  const sourceRoll = rolls[fromRollIndex]!;
  const shortenedSource = metrics(sourceRoll.placements.filter((item) => item.id !== placementId), rollWidthMm, startEndMarginMm);
  const placement = { ...selected, ...orientation, x: sideMarginMm, y: startEndMarginMm };
  const newRoll = metrics([placement], rollWidthMm, startEndMarginMm);
  const nextRolls = rolls.map((roll, index) => index === fromRollIndex ? shortenedSource : roll)
    .filter((roll) => roll.placements.length > 0);
  nextRolls.push(newRoll);
  const savedLengthMm = sourceRoll.usedLengthMm - shortenedSource.usedLengthMm - newRoll.usedLengthMm;
  return {
    plan: rebuildPlan(plan, nextRolls, rollWidthMm),
    fromRollIndex,
    toRollIndex: nextRolls.length - 1,
    savedLengthMm,
  };
}
