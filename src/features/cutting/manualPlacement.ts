import type { Placement } from './optimizeContinuousRollLayout';

export type ManualPlacementBounds = {
  rollWidthMm: number;
  usedLengthMm: number;
  sideMarginMm: number;
  startEndMarginMm: number;
  snapMm?: number;
};

export type ManualPlacementResult = { placement?: Placement; error?: string };

function snap(value: number, unit: number): number {
  return Math.round(value / unit) * unit;
}

function overlaps(left: Placement, right: Placement): boolean {
  return left.x < right.x + right.width && left.x + left.width > right.x && left.y < right.y + right.height && left.y + left.height > right.y;
}

function snapToEdges(value: number, edges: readonly number[], tolerance: number): number {
  const edge = edges.find((candidate) => Math.abs(candidate - value) <= tolerance);
  return edge ?? value;
}

/** Validates and normalizes a manual placement without mutating the source list. */
export function adjustManualPlacement(
  placement: Placement,
  patch: Partial<Pick<Placement, 'x' | 'y' | 'width' | 'height' | 'rotated'>>,
  siblings: readonly Placement[],
  bounds: ManualPlacementBounds,
): ManualPlacementResult {
  const snapMm = bounds.snapMm ?? 5;
  const candidate: Placement = { ...placement, ...patch };
  if (candidate.width <= 0 || candidate.height <= 0) return { error: '조각 크기는 0보다 커야 합니다.' };
  const maxX = bounds.rollWidthMm - bounds.sideMarginMm - candidate.width;
  const maxY = bounds.usedLengthMm - bounds.startEndMarginMm - candidate.height;
  if (maxX < bounds.sideMarginMm || maxY < bounds.startEndMarginMm) return { error: '회전 후 조각이 롤 크기를 초과합니다.' };
  const rawX = snap(candidate.x, snapMm);
  const rawY = snap(candidate.y, snapMm);
  const x = Math.min(maxX, Math.max(bounds.sideMarginMm, snapToEdges(rawX, [bounds.sideMarginMm, maxX], snapMm)));
  const y = Math.min(maxY, Math.max(bounds.startEndMarginMm, snapToEdges(rawY, [bounds.startEndMarginMm, maxY], snapMm)));
  const normalized = { ...candidate, x, y };
  if (siblings.some((item) => item.id !== placement.id && overlaps(normalized, item))) return { error: '다른 조각과 겹칠 수 없습니다.' };
  return { placement: normalized };
}

export function rotateManualPlacement(placement: Placement, siblings: readonly Placement[], bounds: ManualPlacementBounds): ManualPlacementResult {
  return adjustManualPlacement(placement, { width: placement.height, height: placement.width, rotated: !placement.rotated }, siblings, bounds);
}
