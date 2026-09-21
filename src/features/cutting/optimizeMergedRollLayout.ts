export type MergedRollPiece = {
  sourceId: string;
  widthMm: number;
  lengthMm: number;
  quantity: number;
  allowRotation: boolean;
};

export type MergedPlacement = {
  id: number;
  sourceId: string;
  instanceIndex: number;
  x: number;
  y: number;
  width: number;
  height: number;
  rotated: boolean;
};

export type MergedRollInput = {
  rollWidthMm: number;
  /** Optional finite rectangle length when planning against a remnant. */
  maxLengthMm?: number;
  gapMm: number;
  sideMarginMm: number;
  startEndMarginMm: number;
  pieces: readonly MergedRollPiece[];
};

export type MergedRollResult = {
  placements: MergedPlacement[];
  usedLengthMm: number;
  producedQuantity: number;
  utilizationPercent: number;
  wastePercent: number;
};

const GRID_MM = 5;

function snap(value: number): number { return Math.ceil(value / GRID_MM) * GRID_MM; }
function overlaps(a: { x: number; y: number; width: number; height: number }, b: { x: number; y: number; width: number; height: number }): boolean {
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
}

type GapCandidate = { sourceIndex: number; x: number; y: number; width: number; height: number; rotated: boolean; touch: number };
type GapPriority = 'large' | 'wide' | 'low';

function betterGapCandidate(next: GapCandidate, current: GapCandidate | undefined, priority: GapPriority): boolean {
  if (!current) return true;
  if (next.y !== current.y) return next.y < current.y;
  if (next.x !== current.x) return next.x < current.x;
  const nextArea = next.width * next.height;
  const currentArea = current.width * current.height;
  if (priority === 'low' && next.height !== current.height) return next.height < current.height;
  if (priority === 'wide' && next.width !== current.width) return next.width > current.width;
  if (nextArea !== currentArea) return nextArea > currentArea;
  if (next.width !== current.width) return next.width > current.width;
  if (next.height !== current.height) return next.height > current.height;
  if (next.rotated !== current.rotated) return !next.rotated;
  return next.touch > current.touch;
}

function attempt(input: MergedRollInput, order: readonly MergedRollPiece[]): MergedPlacement[] {
  const placements: MergedPlacement[] = [];
  const usableWidth = input.rollWidthMm - input.sideMarginMm * 2;
  const usableLength = input.maxLengthMm === undefined ? Number.POSITIVE_INFINITY : input.maxLengthMm - input.startEndMarginMm;
  let nextId = 1;
  for (const source of order) {
    for (let instanceIndex = 0; instanceIndex < Math.max(0, Math.floor(source.quantity)); instanceIndex += 1) {
      const candidates = [{ width: source.widthMm, height: source.lengthMm, rotated: false }];
      if (source.allowRotation && source.widthMm !== source.lengthMm) candidates.push({ width: source.lengthMm, height: source.widthMm, rotated: true });
      let best: { x: number; y: number; width: number; height: number; rotated: boolean; score: number } | null = null;
      const points = [{ x: input.sideMarginMm, y: input.startEndMarginMm }];
      for (const placed of placements) {
        points.push({ x: placed.x + placed.width + input.gapMm, y: placed.y });
        points.push({ x: placed.x, y: placed.y + placed.height + input.gapMm });
      }
      for (const candidate of candidates) {
        if (candidate.width > usableWidth) continue;
        for (const point of points) {
          const x = Math.max(input.sideMarginMm, snap(point.x));
          const y = Math.max(input.startEndMarginMm, snap(point.y));
          const next = { x, y, width: candidate.width, height: candidate.height };
          if (x + candidate.width > input.rollWidthMm - input.sideMarginMm) continue;
          if (y + candidate.height > usableLength) continue;
          if (placements.some((placed) => overlaps(next, placed))) continue;
          const touch = placements.reduce((sum, placed) => {
            const vertical = (x === placed.x + placed.width || x + candidate.width === placed.x) ? Math.max(0, Math.min(y + candidate.height, placed.y + placed.height) - Math.max(y, placed.y)) : 0;
            const horizontal = (y === placed.y + placed.height || y + candidate.height === placed.y) ? Math.max(0, Math.min(x + candidate.width, placed.x + placed.width) - Math.max(x, placed.x)) : 0;
            return sum + vertical + horizontal;
          }, 0);
          const score = y * 10000 + x * 10 - touch;
          if (best === null || score < best.score) best = { ...next, rotated: candidate.rotated, score };
        }
      }
      if (best === null) continue;
      placements.push({ id: nextId, sourceId: source.sourceId, instanceIndex, x: best.x, y: best.y, width: best.width, height: best.height, rotated: best.rotated });
      nextId += 1;
    }
  }
  return placements;
}

/** Bottom-left hole filling: compare all remaining sizes at each exposed edge. */
function attemptGapFill(input: MergedRollInput, pieces: readonly MergedRollPiece[], priority: GapPriority): MergedPlacement[] {
  const placements: MergedPlacement[] = [];
  const remaining = pieces.map((piece) => Math.floor(piece.quantity));
  const instanceCounts = new Map<string, number>();
  const usableWidth = input.rollWidthMm - input.sideMarginMm * 2;
  const usableLength = input.maxLengthMm === undefined ? Number.POSITIVE_INFINITY : input.maxLengthMm - input.startEndMarginMm;
  while (remaining.some((count) => count > 0)) {
    const points = [{ x: input.sideMarginMm, y: input.startEndMarginMm }];
    for (const placed of placements) {
      points.push({ x: placed.x + placed.width + input.gapMm, y: placed.y });
      points.push({ x: placed.x, y: placed.y + placed.height + input.gapMm });
    }
    let best: GapCandidate | undefined;
    for (let sourceIndex = 0; sourceIndex < pieces.length; sourceIndex += 1) {
      if (remaining[sourceIndex]! <= 0) continue;
      const source = pieces[sourceIndex]!;
      const orientations = [{ width: source.widthMm, height: source.lengthMm, rotated: false }];
      if (source.allowRotation && source.widthMm !== source.lengthMm) orientations.push({ width: source.lengthMm, height: source.widthMm, rotated: true });
      for (const candidate of orientations) {
        if (candidate.width > usableWidth) continue;
        for (const point of points) {
          const x = Math.max(input.sideMarginMm, snap(point.x));
          const y = Math.max(input.startEndMarginMm, snap(point.y));
          if (x + candidate.width > input.rollWidthMm - input.sideMarginMm || y + candidate.height > usableLength) continue;
          const next = { x, y, width: candidate.width, height: candidate.height };
          if (placements.some((placed) => overlaps(next, placed))) continue;
          const touch = placements.reduce((sum, placed) => sum
            + (x === placed.x + placed.width ? Math.max(0, Math.min(y + candidate.height, placed.y + placed.height) - Math.max(y, placed.y)) : 0)
            + (y === placed.y + placed.height ? Math.max(0, Math.min(x + candidate.width, placed.x + placed.width) - Math.max(x, placed.x)) : 0), 0);
          const option = { sourceIndex, ...next, rotated: candidate.rotated, touch };
          if (betterGapCandidate(option, best, priority)) best = option;
        }
      }
    }
    if (!best) break;
    const source = pieces[best.sourceIndex]!;
    const instanceIndex = instanceCounts.get(source.sourceId) ?? 0;
    instanceCounts.set(source.sourceId, instanceIndex + 1);
    remaining[best.sourceIndex]!--;
    placements.push({ id: placements.length + 1, sourceId: source.sourceId, instanceIndex, x: best.x, y: best.y, width: best.width, height: best.height, rotated: best.rotated });
  }
  return placements;
}

export function optimizeMergedRollLayout(input: MergedRollInput): MergedRollResult {
  if (!Number.isFinite(input.rollWidthMm) || input.rollWidthMm <= 0) throw new Error('롤 폭은 0보다 커야 합니다.');
  if (input.maxLengthMm !== undefined && (!Number.isFinite(input.maxLengthMm) || input.maxLengthMm <= 0)) throw new Error('최대 길이는 0보다 커야 합니다.');
  const valid = input.pieces.filter((piece) => piece.widthMm > 0 && piece.lengthMm > 0 && piece.quantity > 0);
  // Keep the legacy app's deterministic candidate order. The old planner
  // tried the same placement heuristic four times, ordering pieces by area,
  // height, width, then longest edge. This matters for equal-length layouts:
  // the first candidate becomes the visible cut order and row pattern.
  const strategies = [
    (piece: MergedRollPiece) => piece.widthMm * piece.lengthMm,
    (piece: MergedRollPiece) => piece.lengthMm,
    (piece: MergedRollPiece) => piece.widthMm,
    (piece: MergedRollPiece) => Math.max(piece.widthMm, piece.lengthMm),
  ];
  let best: MergedPlacement[] = [];
  let bestLength = Number.POSITIVE_INFINITY;
  let bestProduced = -1;
  const totalPieces = valid.reduce((sum, piece) => sum + Math.floor(piece.quantity), 0);
  const consider = (placements: MergedPlacement[]) => {
    const length = placements.length === 0 ? Number.POSITIVE_INFINITY : Math.max(...placements.map((item) => item.y + item.height)) + input.startEndMarginMm;
    const anchorArea = placements[0] ? placements[0].width * placements[0].height : 0;
    const bestAnchorArea = best[0] ? best[0].width * best[0].height : 0;
    const betterLeftAnchor = anchorArea > bestAnchorArea || (anchorArea === bestAnchorArea && (placements[0]?.width ?? 0) > (best[0]?.width ?? 0));
    const betterBoundedPlan = input.maxLengthMm !== undefined
      && (placements.length > bestProduced || (placements.length === bestProduced && (length < bestLength || (length === bestLength && betterLeftAnchor))));
    const complete = placements.length === totalPieces;
    const bestComplete = best.length === totalPieces;
    const betterUnboundedPlan = input.maxLengthMm === undefined
      && (complete && (!bestComplete || length < bestLength || (length === bestLength && betterLeftAnchor)));
    if (betterBoundedPlan || betterUnboundedPlan) {
      best = placements;
      bestLength = length;
      bestProduced = placements.length;
    }
  };
  for (const score of strategies) {
    consider(attempt(input, [...valid].sort((a, b) => score(b) - score(a))));
  }
  if (totalPieces <= 120 && valid.length <= 20) {
    // Adaptive gap filling is evaluated with several priorities. Roll length
    // remains the primary objective; large-left preference only breaks ties.
    (['large', 'wide', 'low'] as const).forEach((priority) => consider(attemptGapFill(input, valid, priority)));
  }
  const area = best.reduce((sum, piece) => sum + piece.width * piece.height, 0);
  const usedArea = input.rollWidthMm * (Number.isFinite(bestLength) ? bestLength : 0);
  const utilizationPercent = usedArea > 0 ? Math.min(100, (area / usedArea) * 100) : 0;
  return { placements: best, usedLengthMm: Number.isFinite(bestLength) ? bestLength : 0, producedQuantity: best.length, utilizationPercent: Math.round(utilizationPercent * 10) / 10, wastePercent: Math.round((100 - utilizationPercent) * 10) / 10 };
}
