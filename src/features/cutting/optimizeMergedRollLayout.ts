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

export function optimizeMergedRollLayout(input: MergedRollInput): MergedRollResult {
  if (!Number.isFinite(input.rollWidthMm) || input.rollWidthMm <= 0) throw new Error('롤 폭은 0보다 커야 합니다.');
  if (input.maxLengthMm !== undefined && (!Number.isFinite(input.maxLengthMm) || input.maxLengthMm <= 0)) throw new Error('최대 길이는 0보다 커야 합니다.');
  const valid = input.pieces.filter((piece) => piece.widthMm > 0 && piece.lengthMm > 0 && piece.quantity > 0);
  const strategies = [
    (piece: MergedRollPiece) => piece.widthMm * piece.lengthMm,
    (piece: MergedRollPiece) => Math.max(piece.widthMm, piece.lengthMm),
    (piece: MergedRollPiece) => piece.lengthMm,
  ];
  let best: MergedPlacement[] = [];
  let bestLength = Number.POSITIVE_INFINITY;
  for (const score of strategies) {
    const placements = attempt(input, [...valid].sort((a, b) => score(b) - score(a)));
    const length = placements.length === 0 ? Number.POSITIVE_INFINITY : Math.max(...placements.map((item) => item.y + item.height)) + input.startEndMarginMm;
    if (length < bestLength) { best = placements; bestLength = length; }
  }
  const area = valid.reduce((sum, piece) => sum + piece.widthMm * piece.lengthMm * Math.floor(piece.quantity), 0);
  const usedArea = input.rollWidthMm * (Number.isFinite(bestLength) ? bestLength : 0);
  const utilizationPercent = usedArea > 0 ? Math.min(100, (area / usedArea) * 100) : 0;
  return { placements: best, usedLengthMm: Number.isFinite(bestLength) ? bestLength : 0, producedQuantity: best.length, utilizationPercent: Math.round(utilizationPercent * 10) / 10, wastePercent: Math.round((100 - utilizationPercent) * 10) / 10 };
}
